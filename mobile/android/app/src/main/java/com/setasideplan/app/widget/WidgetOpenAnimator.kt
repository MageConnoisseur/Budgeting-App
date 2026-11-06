package com.setasideplan.app.widget

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Rect
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import android.view.animation.DecelerateInterpolator
import com.setasideplan.app.R
import expo.modules.setasideupload.LaunchBus

object WidgetOpenAnimator {
  private const val DURATION = 300L

  fun kindOf(intent: Intent?): String? {
    val uri = intent?.data ?: return null
    if (uri.scheme != "setaside" || uri.host != "log") return null
    val kind = uri.path?.trim('/') ?: return null
    return if (kind == "income" || kind == "expense" || kind == "savings") kind else null
  }

  fun play(
    activity: Activity,
    intent: Intent?,
    notifyJs: Boolean = true,
    target: View? = null,
  ) {
    val kind = kindOf(intent) ?: return
    if (notifyJs) {
      val url = intent?.data?.toString() ?: return
      LaunchBus.publish(url)
    }
    clearTransition(activity, open = true)
    if (target == null) {
      activity.window.setBackgroundDrawable(ColorDrawable(Color.parseColor("#f3f6f2")))
    }
    val view = target ?: activity.window.decorView
    startGrow(view, intent?.sourceBounds, segment(kind))
  }

  fun playClose(view: View, intent: Intent?, onEnd: () -> Unit) {
    view.animate().cancel()
    clearListener(view)
    val kind = kindOf(intent)
    val origin = if (kind == null) null else originOf(view, intent?.sourceBounds, segment(kind))
    if (origin == null) {
      if (view.height <= 0) {
        onEnd()
        return
      }
      view.animate()
        .translationY(view.height.toFloat())
        .setDuration(DURATION)
        .setInterpolator(DecelerateInterpolator())
        .withEndAction(onEnd)
        .start()
      return
    }
    view.pivotX = origin.pivotX
    view.pivotY = origin.pivotY
    view.animate()
      .scaleX(origin.scaleX)
      .scaleY(origin.scaleY)
      .setDuration(DURATION)
      .setInterpolator(DecelerateInterpolator())
      .withEndAction(onEnd)
      .start()
  }

  private fun startGrow(view: View, bounds: Rect?, segment: Int) {
    view.animate().cancel()
    clearListener(view)
    view.alpha = 0f
    val listener = object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        clearListener(view)
        view.alpha = 1f
        grow(view, bounds, segment)
        return true
      }
    }
    view.setTag(R.id.widget_open_listener, listener)
    view.viewTreeObserver.addOnPreDrawListener(listener)
  }

  private fun grow(view: View, bounds: Rect?, segment: Int) {
    view.translationX = 0f
    view.translationY = 0f
    view.scaleX = 1f
    view.scaleY = 1f
    val origin = originOf(view, bounds, segment)
    if (origin == null) {
      if (view.height <= 0) return
      view.translationY = view.height.toFloat()
      view.animate()
        .translationY(0f)
        .setDuration(DURATION)
        .setInterpolator(DecelerateInterpolator())
        .withEndAction { view.translationY = 0f }
        .start()
      return
    }
    view.pivotX = origin.pivotX
    view.pivotY = origin.pivotY
    view.scaleX = origin.scaleX
    view.scaleY = origin.scaleY
    view.animate()
      .scaleX(1f)
      .scaleY(1f)
      .setDuration(DURATION)
      .setInterpolator(DecelerateInterpolator())
      .withEndAction {
        view.scaleX = 1f
        view.scaleY = 1f
        view.pivotX = view.width / 2f
        view.pivotY = view.height / 2f
      }
      .start()
  }

  private data class Origin(
    val pivotX: Float,
    val pivotY: Float,
    val scaleX: Float,
    val scaleY: Float,
  )

  private fun originOf(view: View, bounds: Rect?, segment: Int): Origin? {
    val width = view.width
    val height = view.height
    if (width <= 0 || height <= 0 || bounds == null || bounds.width() <= 0 || bounds.height() <= 0) {
      return null
    }
    val third = bounds.width() / 3f
    val left = bounds.left + segment * third
    val originWidth = third.coerceAtLeast(1f)
    val originHeight = bounds.height().toFloat().coerceAtLeast(1f)
    val location = IntArray(2)
    view.getLocationOnScreen(location)
    return Origin(
      pivotX = left + originWidth / 2f - location[0],
      pivotY = bounds.exactCenterY() - location[1],
      scaleX = (originWidth / width).coerceIn(0.04f, 1f),
      scaleY = (originHeight / height).coerceIn(0.04f, 1f),
    )
  }

  private fun segment(kind: String): Int = when (kind) {
    "income" -> 0
    "expense" -> 1
    else -> 2
  }

  private fun clearListener(view: View) {
    val previous = view.getTag(R.id.widget_open_listener) as? ViewTreeObserver.OnPreDrawListener
    if (previous != null && view.viewTreeObserver.isAlive) {
      view.viewTreeObserver.removeOnPreDrawListener(previous)
    }
    view.setTag(R.id.widget_open_listener, null)
  }

  private fun clearTransition(activity: Activity, open: Boolean) {
    if (Build.VERSION.SDK_INT >= 34) {
      val type = if (open) Activity.OVERRIDE_TRANSITION_OPEN else Activity.OVERRIDE_TRANSITION_CLOSE
      activity.overrideActivityTransition(type, 0, 0)
    } else {
      @Suppress("DEPRECATION")
      activity.overridePendingTransition(0, 0)
    }
  }
}

package com.setasideplan.app.widget

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.view.ViewTreeObserver
import android.view.animation.DecelerateInterpolator
import com.setasideplan.app.R
import expo.modules.setasideupload.LaunchBus

object WidgetOpenAnimator {
  fun play(activity: Activity, intent: Intent?) {
    val uri = intent?.data ?: return
    if (uri.scheme != "setaside" || uri.host != "log") return
    val kind = uri.path?.trim('/') ?: return
    if (kind != "income" && kind != "expense" && kind != "savings") return
    LaunchBus.publish(uri.toString())

    activity.window.setBackgroundDrawable(ColorDrawable(Color.parseColor("#f3f6f2")))
    if (Build.VERSION.SDK_INT >= 34) {
      activity.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_OPEN, 0, 0)
    } else {
      @Suppress("DEPRECATION")
      activity.overridePendingTransition(0, 0)
    }

    val segment = when (kind) {
      "income" -> 0
      "expense" -> 1
      else -> 2
    }
    val decor = activity.window.decorView
    decor.animate().cancel()
    val previous = decor.getTag(R.id.widget_open_listener) as? ViewTreeObserver.OnPreDrawListener
    if (previous != null && decor.viewTreeObserver.isAlive) {
      decor.viewTreeObserver.removeOnPreDrawListener(previous)
    }
    val bounds = intent.sourceBounds
    val listener = object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        if (decor.viewTreeObserver.isAlive) {
          decor.viewTreeObserver.removeOnPreDrawListener(this)
        }
        decor.setTag(R.id.widget_open_listener, null)
        val width = decor.width
        val height = decor.height
        if (width <= 0 || height <= 0) return true
        if (bounds != null && bounds.width() > 0 && bounds.height() > 0) {
          val third = bounds.width() / 3f
          val left = bounds.left + segment * third
          val originWidth = third.coerceAtLeast(1f)
          val originHeight = bounds.height().toFloat().coerceAtLeast(1f)
          val location = IntArray(2)
          decor.getLocationOnScreen(location)
          decor.pivotX = left + originWidth / 2f - location[0]
          decor.pivotY = bounds.exactCenterY() - location[1]
          decor.scaleX = (originWidth / width).coerceIn(0.04f, 1f)
          decor.scaleY = (originHeight / height).coerceIn(0.04f, 1f)
          decor.animate()
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(300)
            .setInterpolator(DecelerateInterpolator())
            .withEndAction {
              decor.scaleX = 1f
              decor.scaleY = 1f
              decor.pivotX = width / 2f
              decor.pivotY = height / 2f
            }
            .start()
        } else {
          decor.translationY = height.toFloat()
          decor.animate()
            .translationY(0f)
            .setDuration(300)
            .setInterpolator(DecelerateInterpolator())
            .withEndAction { decor.translationY = 0f }
            .start()
        }
        return true
      }
    }
    decor.setTag(R.id.widget_open_listener, listener)
    decor.viewTreeObserver.addOnPreDrawListener(listener)
  }
}

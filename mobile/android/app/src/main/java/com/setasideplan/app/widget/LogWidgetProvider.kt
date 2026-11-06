package com.setasideplan.app.widget

import android.app.ActivityOptions
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import com.setasideplan.app.MainActivity
import com.setasideplan.app.R

class LogWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    for (appWidgetId in appWidgetIds) {
      val views = RemoteViews(context.packageName, R.layout.log_widget)
      views.setOnClickPendingIntent(R.id.widget_income, pending(context, "income", 11))
      views.setOnClickPendingIntent(R.id.widget_expense, pending(context, "expense", 12))
      views.setOnClickPendingIntent(R.id.widget_savings, pending(context, "savings", 13))
      appWidgetManager.updateAppWidget(appWidgetId, views)
    }
  }

  private fun pending(context: Context, kind: String, requestCode: Int): PendingIntent {
    val intent = Intent(
      Intent.ACTION_VIEW,
      Uri.parse("setaside://log/$kind"),
      context,
      MainActivity::class.java,
    ).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    // Mutable so the launcher can attach the widget's screen bounds for the expand animation.
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    } else {
      PendingIntent.FLAG_UPDATE_CURRENT
    }
    return try {
      val options = ActivityOptions.makeCustomAnimation(context, 0, 0)
      PendingIntent.getActivity(context, requestCode, intent, flags, options.toBundle())
    } catch (_: RuntimeException) {
      PendingIntent.getActivity(context, requestCode, intent, flags)
    }
  }
}

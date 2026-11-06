package expo.modules.setasideupload

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

object UploadScheduler {
  private const val NAME = "setaside-upload"

  fun schedule(context: Context) {
    val request = OneTimeWorkRequestBuilder<UploadWorker>()
      .setConstraints(
        Constraints.Builder()
          .setRequiredNetworkType(NetworkType.CONNECTED)
          .build(),
      )
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
      NAME,
      ExistingWorkPolicy.APPEND_OR_REPLACE,
      request,
    )
  }
}

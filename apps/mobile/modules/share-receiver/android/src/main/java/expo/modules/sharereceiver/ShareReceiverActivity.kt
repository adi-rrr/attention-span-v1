package expo.modules.sharereceiver

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * The "Attention Span" entry in the share sheet. It has no UI: it queues a
 * background save and finishes in the same frame, so the user stays in the
 * app they were scrolling.
 */
class ShareReceiverActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val text = intent?.getStringExtra(Intent.EXTRA_TEXT)
      ?: intent?.getStringExtra(Intent.EXTRA_SUBJECT)
    queueSave(applicationContext, text)
    finish()
    @Suppress("DEPRECATION")
    overridePendingTransition(0, 0)
  }

  private fun queueSave(context: Context, text: String?) {
    if (SharePayload.parse(text) == null) {
      ShareToast.show(context, ShareToast.NOTHING)
      return
    }
    if (ShareStore(context).key == null) {
      ShareToast.show(context, ShareToast.SIGN_IN)
      return
    }
    if (!isOnline(context)) ShareToast.show(context, ShareToast.OFFLINE)

    val request = OneTimeWorkRequest.Builder(ShareSaveWorker::class.java)
      .setInputData(Data.Builder().putString(ShareSaveWorker.TEXT, text).build())
      .setConstraints(
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
      )
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
      .build()
    WorkManager.getInstance(context).enqueue(request)
  }

  private fun isOnline(context: Context): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  }
}

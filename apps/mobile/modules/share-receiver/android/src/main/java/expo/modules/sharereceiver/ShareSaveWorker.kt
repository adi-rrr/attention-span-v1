package expo.modules.sharereceiver

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Sends one shared link to the API with the device share key. WorkManager
 * only runs it with a connection and retries it with backoff, so a share made
 * offline still lands once the phone is back online.
 */
class ShareSaveWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

  override fun doWork(): Result {
    val payload = SharePayload.parse(inputData.getString(TEXT)) ?: return Result.failure()
    val store = ShareStore(applicationContext)
    val key = store.key
    val apiUrl = store.apiUrl
    if (key == null || apiUrl == null) return fail(ShareToast.SIGN_IN)

    return try {
      val (code, body) = post("$apiUrl/saves", key, payload)
      when {
        code == 201 -> done(savedMessage(body))
        code == 409 -> done(duplicateMessage(body))
        code == 401 || code == 403 -> {
          store.clear()
          fail(ShareToast.SIGN_IN)
        }
        code == 400 -> fail(ShareToast.BAD_LINK)
        code >= 500 && runAttemptCount < 4 -> Result.retry()
        else -> fail(ShareToast.SERVER)
      }
    } catch (e: IOException) {
      if (runAttemptCount < 10) Result.retry() else fail(ShareToast.GAVE_UP)
    }
  }

  private fun done(message: String): Result {
    ShareToast.show(applicationContext, message)
    return Result.success()
  }

  private fun fail(message: String): Result {
    ShareToast.show(applicationContext, message)
    return Result.failure()
  }

  private fun post(url: String, key: String, payload: SharePayload): Pair<Int, JSONObject?> {
    val conn = URL(url).openConnection() as HttpURLConnection
    try {
      conn.requestMethod = "POST"
      conn.connectTimeout = 15_000
      conn.readTimeout = 20_000
      conn.doOutput = true
      conn.setRequestProperty("Content-Type", "application/json")
      conn.setRequestProperty("x-share-key", key)
      val json = JSONObject().put("platform", payload.platform)
      if (payload.sourceUrl != null) json.put("source_url", payload.sourceUrl)
      if (payload.title != null) json.put("title", payload.title)
      conn.outputStream.use { it.write(json.toString().toByteArray()) }

      val code = conn.responseCode
      val stream = if (code >= 400) conn.errorStream else conn.inputStream
      val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
      return code to runCatching { JSONObject(text) }.getOrNull()
    } finally {
      conn.disconnect()
    }
  }

  private fun savedMessage(body: JSONObject?): String {
    val created = parseIso(body?.optString("created_at"))
    val expires = parseIso(body?.optString("expires_at"))
    val days =
      if (created != null && expires != null) {
        Math.round((expires - created) / 86_400_000.0).toInt().coerceAtLeast(1)
      } else {
        7
      }
    return "Saved · fades in $days days unless you act on it"
  }

  private fun duplicateMessage(body: JSONObject?): String {
    val savedAt = parseIso(body?.optString("saved_at"))
    val whenText =
      savedAt?.let { SimpleDateFormat("d MMM", Locale.getDefault()).format(it) } ?: "earlier"
    return when (body?.optString("status")) {
      "planned" -> "Already in your plans (saved $whenText)."
      "distilled" -> "Already in your journal (saved $whenText)."
      "done" -> "You already did this one (saved $whenText)."
      else -> "Already saved on $whenText. It's in your inbox."
    }
  }

  private fun parseIso(value: String?): Long? {
    if (value.isNullOrEmpty()) return null
    return runCatching {
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .parse(value)?.time
    }.getOrNull()
  }

  companion object {
    const val TEXT = "text"
  }
}

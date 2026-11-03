package expo.modules.sharereceiver

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast

/**
 * What the background saver needs, kept in app-private preferences: the
 * device share key (set by the app after sign-in) and the API address.
 */
class ShareStore(context: Context) {
  private val prefs = context.getSharedPreferences("attention_span_share", Context.MODE_PRIVATE)

  val key: String? get() = prefs.getString(KEY, null)
  val apiUrl: String? get() = prefs.getString(API_URL, null)

  fun save(key: String, apiUrl: String) {
    prefs.edit().putString(KEY, key).putString(API_URL, apiUrl.trimEnd('/')).apply()
  }

  fun clear() {
    prefs.edit().remove(KEY).apply()
  }

  companion object {
    private const val KEY = "share_key"
    private const val API_URL = "api_url"
  }
}

/** Shared text → what to save. Mirrors src/share/platform.ts in the app. */
data class SharePayload(val platform: String, val sourceUrl: String?, val title: String?) {
  companion object {
    private val URL_IN_TEXT = Regex("""https?://[^\s<>"{}|\\^`\[\]]+""", RegexOption.IGNORE_CASE)

    fun parse(text: String?): SharePayload? {
      val trimmed = text?.trim().orEmpty()
      if (trimmed.isEmpty()) return null
      val url = URL_IN_TEXT.find(trimmed)?.value?.trimEnd(')', ']', ',', '.', '!', '?')
      if (url != null) return SharePayload(detectPlatform(url), url, null)
      return SharePayload("youtube", null, trimmed.take(120))
    }

    private fun detectPlatform(url: String): String {
      val u = url.lowercase()
      return when {
        "instagram.com" in u -> "instagram"
        "reddit.com" in u || "redd.it" in u -> "reddit"
        "substack.com" in u -> "substack"
        else -> "youtube"
      }
    }
  }
}

/** One plain-English line for the user, shown over whatever app they're in. */
object ShareToast {
  fun show(context: Context, message: String) {
    Handler(Looper.getMainLooper()).post {
      Toast.makeText(context.applicationContext, message, Toast.LENGTH_LONG).show()
    }
  }

  const val SIGN_IN = "Not saved: open Attention Span and sign in, then share again."
  const val NOTHING = "Not saved: there was no link or text to save. Share the post itself."
  const val OFFLINE = "No internet. It'll save on its own once you're back online."
  const val BAD_LINK = "Not saved: we couldn't read that link. Try sharing the post link."
  const val SERVER = "Not saved: Attention Span had a hiccup. Share again in a moment."
  const val GAVE_UP = "Not saved: couldn't reach Attention Span for a while. Share it again."
}

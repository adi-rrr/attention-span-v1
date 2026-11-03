package expo.modules.sharereceiver

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Lets the app hand the background share receiver its key, and take it back. */
class ShareReceiverModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ShareReceiver")

    Function("setShareKey") { key: String, apiUrl: String ->
      store()?.save(key, apiUrl)
    }

    Function("getShareKey") {
      store()?.key
    }

    Function("clearShareKey") {
      store()?.clear()
    }
  }

  private fun store(): ShareStore? = appContext.reactContext?.let { ShareStore(it) }
}

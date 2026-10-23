package expo.modules.returntosource

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * After a zero-tap save, hand the user back to the app they shared from.
 * Pressing Back on our root activity goes to the home screen on Android 12+;
 * moving our task to the back brings the sharing app's task forward instead.
 */
class ReturnToSourceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReturnToSource")

    Function("moveToBack") {
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread { activity.moveTaskToBack(true) }
      true
    }
  }
}

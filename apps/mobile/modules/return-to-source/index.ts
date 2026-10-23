import { requireOptionalNativeModule } from "expo";
import { BackHandler } from "react-native";

const Native = requireOptionalNativeModule<{ moveToBack(): boolean }>(
  "ReturnToSource",
);

/** Send the user back to the app they shared from (Android). */
export function returnToSourceApp() {
  if (Native?.moveToBack()) return;
  // Older builds without the native module: Back at least leaves the app.
  BackHandler.exitApp();
}

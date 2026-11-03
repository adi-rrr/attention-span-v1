import { requireOptionalNativeModule } from "expo";

type ShareReceiverNative = {
  setShareKey(key: string, apiUrl: string): void;
  getShareKey(): string | null;
  clearShareKey(): void;
};

/** Android only; null on web and in builds without the native module. */
const Native = requireOptionalNativeModule<ShareReceiverNative>("ShareReceiver");

export const backgroundSharingAvailable = Native != null;

export function setShareKey(key: string, apiUrl: string) {
  Native?.setShareKey(key, apiUrl);
}

export function getShareKey(): string | null {
  return Native?.getShareKey() ?? null;
}

export function clearShareKey() {
  Native?.clearShareKey();
}

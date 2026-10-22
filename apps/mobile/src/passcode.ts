/**
 * Passcode for the hosted web app. Stored per device (localStorage on web,
 * memory elsewhere — the native dev build talks to a local API without one).
 */
const KEY = "attention-span-passcode";

let memory: string | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function getPasscode(): string | null {
  try {
    return storage()?.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function setPasscode(value: string | null) {
  memory = value;
  try {
    if (value) storage()?.setItem(KEY, value);
    else storage()?.removeItem(KEY);
  } catch {
    /* private mode etc. — memory copy still works for this session */
  }
}

/** Fired when the API rejects a request for a missing or wrong passcode. */
export function onPasscodeRequired(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function notifyPasscodeRequired() {
  listeners.forEach((cb) => cb());
}

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";
import { AppState } from "react-native";

/**
 * Sign-in with a 6-digit email code (Supabase Auth). When the Supabase keys
 * aren't set, the app runs in local dev mode: no sign-in, and the API trusts
 * the dev user id instead.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

export const authEnabled = Boolean(url && anonKey);

export const supabase = authEnabled
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Keep the session fresh only while the app is in the foreground.
if (supabase) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onSessionChange(cb: (session: Session | null) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

/** Plain-English reasons for a failed sign-in step. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("signups not allowed") || m.includes("not found") || m.includes("user not")) {
    return "This email hasn't been invited yet.";
  }
  if (m.includes("expired") || m.includes("invalid")) {
    return "That code didn't work. Check it, or send a new one.";
  }
  if (m.includes("rate") || m.includes("seconds")) {
    return "Too many tries. Wait a minute, then send a new code.";
  }
  if (m.includes("fetch") || m.includes("network")) {
    return "Couldn't reach the sign-in service. Check your internet.";
  }
  return message;
}

/** Emails a 6-digit code. Invite-only: unknown emails get no account. */
export async function sendCode(email: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: false },
  });
  if (error) throw new Error(friendly(error.message));
}

export async function verifyCode(email: string, code: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: "email",
  });
  if (error) throw new Error(friendly(error.message));
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

// The API answering "sign in first" (expired or missing session).
const listeners = new Set<() => void>();

export function onSignInRequired(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function notifySignInRequired() {
  listeners.forEach((cb) => cb());
}

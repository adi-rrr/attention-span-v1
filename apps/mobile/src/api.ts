import { Platform } from "react-native";
import { getPasscode, notifyPasscodeRequired } from "./passcode";

// The hosted web app serves the API from the same site under /api.
const API_URL =
  Platform.OS === "web"
    ? (process.env.EXPO_PUBLIC_WEB_API_URL ?? "/api")
    : (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001");

/** Dev stub: send x-user-id until JWT auth is wired (P0). */
const DEV_USER_ID =
  process.env.EXPO_PUBLIC_DEV_USER_ID ??
  "00000000-0000-4000-8000-000000000001";

export class ApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: unknown,
  ) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${status} ${path}`;
    super(msg);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const hasBody = init.body != null && init.body !== "";
  const passcode = getPasscode();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      "x-user-id": DEV_USER_ID,
      ...(passcode ? { "x-passcode": passcode } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const raw = await res.text();
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      /* keep raw text */
    }
    if (
      res.status === 401 &&
      typeof body === "object" &&
      body !== null &&
      (body as { code?: unknown }).code === "PASSCODE_REQUIRED"
    ) {
      notifyPasscodeRequired();
    }
    throw new ApiError(res.status, path, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

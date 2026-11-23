import { Platform } from "react-native";
import { authEnabled, getAccessToken, notifySignInRequired } from "./session";

// The hosted web app serves the API from the same site under /api.
export const API_URL =
  Platform.OS === "web"
    ? (process.env.EXPO_PUBLIC_WEB_API_URL ?? "/api")
    : (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001");

/** Local dev without sign-in: the API trusts this user id instead. */
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

/** Who's asking: the sign-in token, or the dev user id when sign-in is off. */
async function authHeaders(): Promise<Record<string, string>> {
  if (!authEnabled) return { "x-user-id": DEV_USER_ID };
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const hasBody = init.body != null && init.body !== "";
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(await authHeaders()),
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
    if (res.status === 401 && authEnabled) {
      notifySignInRequired();
    }
    throw new ApiError(res.status, path, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** A binary response (an uploaded screenshot) as a Blob, with the same sign-in. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!res.ok) {
    if (res.status === 401 && authEnabled) notifySignInRequired();
    throw new ApiError(res.status, path, await res.text().catch(() => ""));
  }
  return res.blob();
}

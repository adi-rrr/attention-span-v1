import type { FastifyRequest } from "fastify";
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { query } from "./db.js";

/**
 * Who is calling. With SUPABASE_URL set (the hosted app), every request must
 * carry a Supabase sign-in token, which we verify ourselves. Without it (local
 * development), the app's x-user-id header is trusted as before.
 */
export type AuthMode = "supabase" | "dev";

export function authMode(): AuthMode {
  return process.env.SUPABASE_URL?.trim() ? "supabase" : "dev";
}

type AuthError = Error & { statusCode: number; code: string };

function authError(statusCode: number, code: string, message: string): AuthError {
  const err = new Error(message) as AuthError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export function requireUserId(req: FastifyRequest): string {
  const userId = (req as { userId?: string }).userId;
  if (!userId) throw authError(401, "AUTH_REQUIRED", "Sign in to continue");
  return userId;
}

// ---------------------------------------------------------------------------
// Token verification

let jwks: JWTVerifyGetKey | null = null;

/** Project origin only: a pasted ".../rest/v1/" (the Data API URL) still works. */
function issuer(): string {
  return `${new URL(process.env.SUPABASE_URL!.trim()).origin}/auth/v1`;
}

/**
 * Supabase signs tokens either with the project's asymmetric signing keys
 * (published as JWKS) or, on older projects, with a shared JWT secret. The
 * token's own header says which, so a leftover secret in the environment
 * (the Vercel integration adds one) can't break the newer keys.
 */
async function verifyToken(token: string): Promise<{ sub: string; email: string | null }> {
  const options = { issuer: issuer(), audience: "authenticated" };
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  try {
    const { alg } = decodeProtectedHeader(token);
    const { payload } =
      alg?.startsWith("HS") && secret
        ? await jwtVerify(token, new TextEncoder().encode(secret), {
            ...options,
            algorithms: ["HS256"],
          })
        : await jwtVerify(
            token,
            (jwks ??= createRemoteJWKSet(new URL(`${issuer()}/.well-known/jwks.json`))),
            { ...options, algorithms: ["ES256", "RS256", "EdDSA"] },
          );
    if (!payload.sub) throw new Error("token has no subject");
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    return { sub: payload.sub, email };
  } catch {
    throw authError(401, "AUTH_REQUIRED", "Your sign-in has expired. Sign in again.");
  }
}

function emailList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

// ---------------------------------------------------------------------------
// Accounts

const userIdBySub = new Map<string, string>();

/**
 * The app's user row for a Supabase account, created on first sign-in.
 * The owner's first sign-in takes over the pre-login single-user data.
 */
async function resolveUser(sub: string, email: string | null): Promise<string> {
  const cached = userIdBySub.get(sub);
  if (cached) return cached;

  const { rows: existing } = await query<{ id: string }>(
    `SELECT id FROM users WHERE auth_provider_id = $1 AND deleted_at IS NULL`,
    [sub],
  );
  let userId = existing[0]?.id;

  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!userId && owner && email === owner) {
    const { rows: claimed } = await query<{ id: string }>(
      `UPDATE users
       SET auth_provider_id = $1, email = $2, updated_at = now()
       WHERE auth_provider_id = 'dev_local' AND deleted_at IS NULL
       RETURNING id`,
      [sub, email],
    );
    userId = claimed[0]?.id;
  }

  if (!userId) {
    const { rows: created } = await query<{ id: string }>(
      `INSERT INTO users (auth_provider_id, email, display_name)
       VALUES ($1, $2, split_part(coalesce($2, ''), '@', 1))
       ON CONFLICT (auth_provider_id) DO UPDATE SET email = EXCLUDED.email
       RETURNING id`,
      [sub, email],
    );
    userId = created[0]!.id;
  }

  await query(
    `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  userIdBySub.set(sub, userId);
  return userId;
}

/** The calling user's id, or null in dev mode when no user header was sent. */
export async function authenticate(req: FastifyRequest): Promise<string | null> {
  // Never fall back to the trust-the-header dev mode on the hosted app.
  if (authMode() === "dev" && process.env.VERCEL) {
    throw authError(503, "AUTH_NOT_CONFIGURED", "Sign-in isn't set up on the server yet.");
  }
  if (authMode() === "dev") {
    const stub = req.headers["x-user-id"];
    return typeof stub === "string" && stub.length > 0 ? stub : null;
  }

  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw authError(401, "AUTH_REQUIRED", "Sign in to continue");

  const { sub, email } = await verifyToken(token);

  // Invite-only: when a list is set, only those emails get in.
  const allowed = emailList(process.env.ALLOWED_EMAILS);
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (owner) allowed.add(owner);
  if (allowed.size > 0 && (!email || !allowed.has(email))) {
    throw authError(403, "NOT_INVITED", "This email hasn't been invited yet.");
  }

  return resolveUser(sub, email);
}

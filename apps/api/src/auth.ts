import type { FastifyRequest } from "fastify";

export function requireUserId(req: FastifyRequest): string {
  const userId = (req as { userId?: string }).userId;
  if (!userId) {
    const err = new Error("Unauthorized") as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return userId;
}

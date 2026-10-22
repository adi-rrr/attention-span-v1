export function httpError(status: number, message: string): Error & {
  statusCode: number;
} {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = status;
  return err;
}

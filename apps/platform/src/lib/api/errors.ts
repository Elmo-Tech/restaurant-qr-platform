/** The Backend's error envelope: `{ error: { code, message } }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** The Backend's reasons for a refused form (English, for display next to the form). */
  readonly problems: string[];

  constructor(status: number, body: unknown) {
    const error =
      typeof body === "object" && body !== null && "error" in body
        ? (body as { error?: { code?: unknown; message?: unknown; problems?: unknown } }).error
        : undefined;
    super(typeof error?.message === "string" ? error.message : `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = typeof error?.code === "string" ? error.code : null;
    this.problems = Array.isArray(error?.problems) ? error.problems.filter((p): p is string => typeof p === "string") : [];
  }
}

/** `true` when the request failed before any HTTP response (network down, API stopped). */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

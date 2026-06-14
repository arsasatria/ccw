export interface ClassifierError {
  status?: number;
  code?: string;
  body?: string;
}

const ADVANCE_STATUS = new Set([401, 408, 429, 500, 502, 503, 504]);
const ADVANCE_BODY_PATTERNS: RegExp[] = [
  /function name or parameters is empty/i,
  /quota exceeded/i,
  /rate limit exceeded/i,
  /context block is not a text block/i, // mid-stream 400 from anthropic sdk
];

export function classifyError(err: ClassifierError | null | undefined): "advance" | "stop" {
  if (!err) return "stop";

  if (err.status != null) {
    if (ADVANCE_STATUS.has(err.status)) return "advance";
    if (err.status === 400 && err.body) {
      for (const re of ADVANCE_BODY_PATTERNS) {
        if (re.test(err.body)) return "advance";
      }
      return "stop";
    }
    // 4xx (including 403) — stop. Let the user see the error.
    if (err.status >= 400 && err.status < 500) return "stop";
    return "stop";
  }

  if (err.code) {
    // Network-level errors: advance (might be transient).
    if (
      err.code === "ECONNRESET" ||
      err.code === "ETIMEDOUT" ||
      err.code === "ENOTFOUND" ||
      err.code === "ECONNREFUSED"
    ) {
      return "advance";
    }
  }

  return "stop";
}

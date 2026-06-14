import type { Transformer } from "../types/transformer";

const MAX_RUN = 6;            // collapse runs of identical-prefix lines after this many
const LOG_TOTAL_LINES = 200;  // truncate logs longer than this
const LOG_HEAD = 10;          // keep first N lines
const LOG_TAIL = 10;          // keep last N lines
const MAX_RESULT_CHARS = 50_000; // never return more than this from one tool_result

type Filter = (text: string) => string;

const collapseRuns: Filter = (text) => {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // A "run" is consecutive lines sharing a signature:
    //   - for diff lines (starting with '+' or '-'), signature is the leading char
    //   - for log lines, signature is the first 8 chars (covers most timestamps)
    const sig = line[0] === "+" || line[0] === "-" ? line[0] : line.slice(0, 8);

    // Find the end of the run.
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      const nextSig = next[0] === "+" || next[0] === "-" ? next[0] : next.slice(0, 8);
      if (nextSig !== sig) break;
      j++;
    }

    const runLen = j - i;
    if (runLen > MAX_RUN) {
      // Replace the entire run with a single count summary.
      out.push(`${sig}${runLen} lines`);
    } else {
      for (let k = i; k < j; k++) out.push(lines[k]);
    }
    i = j;
  }
  return out.join("\n");
};

const truncateLog: Filter = (text) => {
  const lines = text.split("\n");
  if (lines.length <= LOG_TOTAL_LINES) return text;
  const head = lines.slice(0, LOG_HEAD).join("\n");
  const tail = lines.slice(-LOG_TAIL).join("\n");
  const omitted = lines.length - LOG_HEAD - LOG_TAIL;
  return `${head}\n\n... ${omitted} lines omitted ...\n\n${tail}`;
};

const cap: Filter = (text) =>
  text.length > MAX_RESULT_CHARS
    ? text.slice(0, MAX_RESULT_CHARS) + `\n... [truncated, original ${text.length} chars] ...`
    : text;

const FILTERS: Filter[] = [collapseRuns, truncateLog, cap];

function applyAll(text: string): string {
  let best = text;
  for (const f of FILTERS) {
    try {
      const next = f(best);
      if (next.length < best.length) best = next;
    } catch {
      // Filter failed; keep current best.
    }
  }
  return best;
}

function isToolResultContent(c: any): boolean {
  return c && c.type === "tool_result";
}

function getText(c: any): string | null {
  if (typeof c.content === "string") return c.content;
  if (Array.isArray(c.content)) {
    for (const part of c.content) {
      if (part && part.type === "text" && typeof part.text === "string") return part.text;
    }
  }
  return null;
}

function setText(c: any, newText: string) {
  if (typeof c.content === "string") c.content = newText;
  else if (Array.isArray(c.content)) {
    for (const part of c.content) {
      if (part && part.type === "text") {
        part.text = newText;
        return;
      }
    }
  }
}

export class TokenSaverTransformer implements Transformer {
  async transformRequestIn(
    request: any,
    _provider?: any,
    _context?: any,
  ): Promise<any> {
    if (!request?.messages) return request;
    for (const message of request.messages) {
      if (!Array.isArray(message.content)) continue;
      for (const c of message.content) {
        if (!isToolResultContent(c)) continue;
        const text = getText(c);
        if (text == null) continue;
        const compressed = applyAll(text);
        if (compressed.length < text.length) {
          setText(c, compressed);
        }
      }
    }
    return request;
  }
}

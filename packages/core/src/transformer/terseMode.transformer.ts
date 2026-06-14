import type { Transformer, TransformerOptions } from "../types/transformer";

const TERSE_INSTRUCTION =
  "\n\nBe terse. Prefer the shortest correct answer. No preamble, no apology, " +
  "no restating the question. Use code only when the question requires it. " +
  "Skip pleasantries and summaries.";

export class TerseModeTransformer implements Transformer {
  static TransformerName = "terse";
  private readonly enabled: boolean;

  constructor(options: TransformerOptions = {}) {
    this.enabled = Boolean((options as any).enabled);
  }

  async transformRequestIn(request: any, _provider?: any, _context?: any): Promise<any> {
    if (!this.enabled) return request;
    const sys = request?.system;
    if (sys == null) {
      return { ...request, system: [{ type: "text", text: TERSE_INSTRUCTION.trim() }] };
    }
    if (typeof sys === "string") {
      return { ...request, system: sys + TERSE_INSTRUCTION };
    }
    if (Array.isArray(sys)) {
      // Find the last text block; append there. If none, append a new block.
      let lastTextIdx = -1;
      for (let i = sys.length - 1; i >= 0; i--) {
        const s = sys[i];
        if (typeof s === "string" || (s && s.type === "text")) {
          lastTextIdx = i;
          break;
        }
      }
      if (lastTextIdx < 0) {
        return { ...request, system: [...sys, { type: "text", text: TERSE_INSTRUCTION.trim() }] };
      }
      const newSys = [...sys];
      const target = newSys[lastTextIdx];
      if (typeof target === "string") {
        newSys[lastTextIdx] = target + TERSE_INSTRUCTION;
      } else {
        newSys[lastTextIdx] = { ...target, text: (target.text ?? "") + TERSE_INSTRUCTION };
      }
      return { ...request, system: newSys };
    }
    return request;
  }
}

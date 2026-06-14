import type { ProviderAccount } from "./configShape";

export interface AccountPoolOptions {
  cooldownMs?: number; // default 60_000 — how long an account stays "unhealthy"
}

interface PoolState {
  account: ProviderAccount;
  unhealthyUntil: number; // epoch ms; 0 = healthy
  cursorOrder: number; // for stable tie-breaking
}

export class AccountPool {
  private state: PoolState[];
  private cursor: number = 0;
  private readonly cooldownMs: number;

  constructor(accounts: ProviderAccount[], options: AccountPoolOptions = {}) {
    this.cooldownMs = options.cooldownMs ?? 60_000;
    // Sort by priority desc, then by declared order asc.
    const indexed = accounts.map((a, i) => ({ a, i }));
    indexed.sort((x, y) => {
      const px = x.a.priority ?? 0;
      const py = y.a.priority ?? 0;
      if (py !== px) return py - px;
      return x.i - y.i;
    });
    this.state = indexed.map(({ a, i }) => ({
      account: a,
      unhealthyUntil: 0,
      cursorOrder: i,
    }));
  }

  /** Pick the next healthy account. Returns undefined if all are unhealthy. */
  pick(): ProviderAccount | undefined {
    if (this.state.length === 0) return undefined;
    const now = Date.now();
    // Try up to N times (covering full rotation).
    for (let i = 0; i < this.state.length; i++) {
      const idx = (this.cursor + i) % this.state.length;
      const s = this.state[idx];
      if (s.unhealthyUntil > now) continue;
      this.cursor = (idx + 1) % this.state.length;
      return s.account;
    }
    return undefined;
  }

  /** Mark an account as unhealthy until cooldown elapses. */
  markUnhealthy(apiKey: string, _reason: string): void {
    const s = this.state.find((s) => s.account.apiKey === apiKey);
    if (s) s.unhealthyUntil = Date.now() + this.cooldownMs;
  }

  /** Reset an account's cooldown (called when the account succeeds again). */
  resetCooldown(apiKey: string): void {
    const s = this.state.find((s) => s.account.apiKey === apiKey);
    if (s) s.unhealthyUntil = 0;
  }

  /** All accounts in declared (original) order, used for error messages. */
  accounts(): ProviderAccount[] {
    return [...this.state]
      .sort((a, b) => a.cursorOrder - b.cursorOrder)
      .map((s) => s.account);
  }
}

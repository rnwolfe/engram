/**
 * budget.ts — Simple token budget tracker for reconcile() and other LLM-calling operations.
 *
 * If maxTokens is undefined, the budget is unlimited and exhausted() always returns false.
 */

export class Budget {
  private readonly maxTokens: number | undefined;
  private consumed: number;

  constructor(maxTokens?: number) {
    this.maxTokens = maxTokens;
    this.consumed = 0;
  }

  /**
   * Record that `tokens` tokens have been consumed.
   */
  consume(tokens: number): void {
    this.consumed += tokens;
  }

  /**
   * Returns true if the budget has been exhausted (consumed >= maxTokens).
   * Always returns false when maxTokens is undefined (unlimited budget).
   */
  exhausted(): boolean {
    if (this.maxTokens === undefined) return false;
    return this.consumed >= this.maxTokens;
  }

  /**
   * Returns the number of remaining tokens, or undefined if unlimited.
   */
  remaining(): number | undefined {
    if (this.maxTokens === undefined) return undefined;
    return Math.max(0, this.maxTokens - this.consumed);
  }

  /**
   * Returns total tokens consumed so far.
   */
  totalConsumed(): number {
    return this.consumed;
  }
}

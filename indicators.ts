/** Streaming indicators for Driftline: exponential moving averages kept
 * incrementally over the close series, so each new bar costs O(1) work and
 * no history list has to be rescanned. Prices are the protocol's raw scaled
 * integers; every indicator here is scale-free (ratios and averages of the
 * raw values behave the same at any scale). */

export class Ema {
  readonly period: number;
  private readonly k: number;
  value: number | null = null;
  count = 0;

  constructor(period: number) {
    this.period = period;
    this.k = 2 / (period + 1);
  }

  update(x: number): number {
    this.count += 1;
    this.value = this.value === null ? x : this.value + this.k * (x - this.value);
    return this.value;
  }

  /** True once at least one full period of values has been seen. */
  get ready(): boolean {
    return this.count >= this.period;
  }
}

/** How far an EMA has moved over the last `lookback` updates, as a ratio. */
export class Slope {
  private readonly lookback: number;
  private past: number[] = [];

  constructor(lookback: number) {
    this.lookback = lookback;
  }

  update(emaValue: number): number | null {
    this.past.push(emaValue);
    if (this.past.length > this.lookback + 1) this.past.shift();
    if (this.past.length <= this.lookback || !this.past[0]) return null;
    return emaValue / this.past[0] - 1;
  }
}

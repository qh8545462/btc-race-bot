/** Driftline's strategy: buy the pullback, sell the recovery, sit out the rest.
 *
 * The design, in one paragraph: minute-bar BTC spends most of its time
 * chopping sideways, and a round trip costs roughly 20-30 bps in fees,
 * slippage and impact, so a strategy only earns when it trades rarely and
 * only into moves clearly larger than that cost. Driftline therefore watches
 * the deviation of the close from its 20-minute EMA. When the price dips
 * well below that anchor while the slow (4-hour) trend is not collapsing, it
 * buys a moderate position; it sells when the price recovers to just above
 * the anchor, when the dip keeps falling through a stop, or when the trade
 * has had long enough. An equity drawdown brake stops new entries after a
 * bad stretch. Few parameters, all round numbers, nothing fitted bar-by-bar:
 * the same rules are meant to behave the same way on a window nobody has
 * seen. */

import { Ema, Slope } from './indicators.ts';

export const SYMBOL = 'CBBTC';

// --- Parameters (ratios are unit-free; sizes in bps of equity) -------------
const FAST_PERIOD = 20; // the anchor EMA the price pulls back from
const SLOW_PERIOD = 240; // the trend EMA (4 hours of minute bars)
const SLOPE_LOOKBACK = 120; // bars over which the slow trend's slope is read
const ENTRY_DIP = -0.0035; // buy when close is 0.35% below the fast anchor
const EXIT_RECOVERY = 0.0012; // sell when close is 0.12% above the fast anchor
const TREND_MIN_SLOPE = -0.004; // no buys if the slow EMA fell > 0.4% in 2h
const TREND_FLOOR = 0.99; // no buys if close is > 1% under the slow EMA
const STOP_LOSS = -0.006; // sell if the trade is 0.6% under its entry close
const MAX_HOLD_BARS = 300; // sell if a trade has run 5 hours without paying
const SIZE_BPS = 6000n; // one position takes 60% of equity
const COOLDOWN_BARS = 45; // bars to wait after an exit before the next entry
const BRAKE_DRAWDOWN = 0.07; // stop new entries once equity is 7% under peak
const MAX_SLIPPAGE_BPS = 200; // orders tolerate a 2% move from the latest close
const MIN_HISTORY = SLOW_PERIOD; // bars of history before the first entry
const MIN_BUY_QUOTE = 1_000_000n; // the protocol's 1 USDC minimum buy

type Order = { side: 'buy' | 'sell'; symbol: string; notional_quote_units?: bigint; qty?: bigint; max_slippage_bps: number };

export class Driftline {
  private fast = new Ema(FAST_PERIOD);
  private slow = new Ema(SLOW_PERIOD);
  private slope = new Slope(SLOPE_LOOKBACK);
  private barsSeen = 0;
  private entryClose: number | null = null; // close when the position appeared
  private barsHeld = 0;
  private cooldown = 0;
  private peakEquity: bigint | null = null;
  private lastSlope: number | null = null;

  /** The orders for this batch (possibly none), per the shim's contract. */
  decide(state: any, batch: any): Order[] {
    const bar = (batch.bars ?? []).find((b: any) => b.symbol === SYMBOL);
    if (!bar) return [];
    const close = Number(bar.c);
    this.noteBar(close);
    this.noteEquity(state.equity);
    if (state.warmingUp) return [];

    const holding = state.positions.get(SYMBOL);
    if (holding && holding.qty > 0n) return this.managePosition(state, close);
    return this.lookForEntry(state, close);
  }

  private noteBar(close: number): void {
    this.fast.update(close);
    const slowValue = this.slow.update(close);
    this.lastSlope = this.slope.update(slowValue);
    this.barsSeen += 1;
    if (this.cooldown > 0) this.cooldown -= 1;
  }

  private noteEquity(equity: bigint): void {
    if (this.peakEquity === null || equity > this.peakEquity) this.peakEquity = equity;
  }

  private brakeOn(equity: bigint): boolean {
    if (this.peakEquity === null) return false;
    // equity < peak * (1 - BRAKE_DRAWDOWN), compared in integers
    return equity * 100n < this.peakEquity * BigInt(Math.round((1 - BRAKE_DRAWDOWN) * 100));
  }

  private managePosition(state: any, close: number): Order[] {
    if (this.entryClose === null) {
      // First batch that shows the position: remember where we got in.
      this.entryClose = close;
      this.barsHeld = 0;
    }
    this.barsHeld += 1;
    const anchor = this.fast.value;
    const deviation = anchor ? close / anchor - 1 : 0;
    const pnl = close / this.entryClose - 1;
    const exitNow = deviation >= EXIT_RECOVERY || pnl <= STOP_LOSS || this.barsHeld >= MAX_HOLD_BARS;
    if (!exitNow) return [];
    const holding = state.positions.get(SYMBOL);
    this.entryClose = null;
    this.barsHeld = 0;
    this.cooldown = COOLDOWN_BARS;
    return [{ side: 'sell', symbol: SYMBOL, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }

  private lookForEntry(state: any, close: number): Order[] {
    if (this.barsSeen < MIN_HISTORY) return [];
    if (this.cooldown > 0 || this.brakeOn(state.equity)) return [];
    const anchor = this.fast.value;
    const slow = this.slow.value;
    if (!anchor || !slow) return [];
    if (close / anchor - 1 > ENTRY_DIP) return [];
    if (this.lastSlope !== null && this.lastSlope < TREND_MIN_SLOPE) return [];
    if (close < slow * TREND_FLOOR) return [];
    let notional = (state.equity * SIZE_BPS) / 10_000n;
    if (notional > state.cash) notional = state.cash;
    if (notional < MIN_BUY_QUOTE) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }
}

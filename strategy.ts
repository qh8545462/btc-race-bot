/** Driftline's strategy: buy deep dips under the anchor, sell the snap back.
 *
 * What the first version taught (it lost money buying shallow dips under a
 * fast 20-minute EMA): minute-bar BTC chops sideways, the anchor itself
 * slides down with the price, and a round trip costs roughly 20-30 bps in
 * fees, slippage and impact, so shallow, frequent trades bleed. This version
 * trades the range instead. The anchor is a slow 2-hour EMA. A buy needs the
 * close a full 0.6% under that anchor — a dip deep enough that a routine
 * snap back to the anchor pays the round trip several times over — and the
 * exit waits for the close 0.5% above the anchor, so each completed trade
 * harvests about a percent of range. Two protections keep the same rules
 * sane on a window that trends instead of chopping: entries stop when the
 * anchor itself has fallen more than 1% over the last 4 hours (a falling
 * market, not a dip), and every trade carries a 1.5% stop and a 15-hour
 * time limit. An equity drawdown brake stops new entries after a bad
 * stretch. Few parameters, all round numbers, chosen from the middle of a
 * broad plateau of workable values rather than the single best fit, so the
 * behaviour should carry to a window nobody has seen.
 */

import { Ema, Slope } from './indicators.ts';

export const SYMBOL = 'CBBTC';

// --- Parameters (ratios are unit-free; sizes in bps of equity) -------------
const ANCHOR_PERIOD = 120; // the 2-hour EMA the range is measured against
const ENTRY_DIP = -0.006; // buy when close is 0.6% below the anchor
const EXIT_RISE = 0.005; // sell when close is 0.5% above the anchor
const GUARD_LOOKBACK = 240; // bars over which the anchor's own drift is read
const GUARD_MAX_FALL = -0.01; // no buys if the anchor fell > 1% in that span
const STOP_LOSS = -0.015; // sell if the trade is 1.5% under its entry close
const MAX_HOLD_BARS = 900; // sell if a trade has run 15 hours without paying
const SIZE_BPS = 8500n; // one position takes 85% of equity
const COOLDOWN_BARS = 30; // bars to wait after an exit before the next entry
const BRAKE_DRAWDOWN = 0.07; // stop new entries once equity is 7% under peak
const MAX_SLIPPAGE_BPS = 200; // orders tolerate a 2% move from the latest close
const MIN_HISTORY = GUARD_LOOKBACK; // bars before the guard can be read
const MIN_BUY_QUOTE = 1_000_000n; // the protocol's 1 USDC minimum buy

type Order = { side: 'buy' | 'sell'; symbol: string; notional_quote_units?: bigint; qty?: bigint; max_slippage_bps: number };

export class Driftline {
  private anchor = new Ema(ANCHOR_PERIOD);
  private anchorDrift = new Slope(GUARD_LOOKBACK);
  private barsSeen = 0;
  private entryClose: number | null = null; // close when the position appeared
  private barsHeld = 0;
  private cooldown = 0;
  private peakEquity: bigint | null = null;
  private lastDrift: number | null = null;

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
    const anchorValue = this.anchor.update(close);
    this.lastDrift = this.anchorDrift.update(anchorValue);
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
    const anchor = this.anchor.value;
    const deviation = anchor ? close / anchor - 1 : 0;
    const pnl = close / this.entryClose - 1;
    const exitNow = deviation >= EXIT_RISE || pnl <= STOP_LOSS || this.barsHeld >= MAX_HOLD_BARS;
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
    const anchor = this.anchor.value;
    if (!anchor) return [];
    if (close / anchor - 1 > ENTRY_DIP) return [];
    if (this.lastDrift !== null && this.lastDrift < GUARD_MAX_FALL) return [];
    let notional = (state.equity * SIZE_BPS) / 10_000n;
    if (notional > state.cash) notional = state.cash;
    if (notional < MIN_BUY_QUOTE) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  }
}

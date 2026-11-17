"""Driftline's strategy: buy the pullback, sell the recovery, sit out the rest.

The design, in one paragraph: minute-bar BTC spends most of its time
chopping sideways, and a round trip costs roughly 20-30 bps in fees,
slippage and impact, so a strategy only earns when it trades rarely and
only into moves clearly larger than that cost. Driftline therefore watches
the deviation of the close from its 20-minute EMA. When the price dips well
below that anchor while the slow (4-hour) trend is not collapsing, it buys a
moderate position; it sells when the price recovers to just above the
anchor, when the dip keeps falling through a stop, or when the trade has
had long enough. An equity drawdown brake stops new entries after a bad
stretch. Few parameters, all round numbers, nothing fitted bar-by-bar: the
same rules are meant to behave the same way on a window nobody has seen.
"""

from indicators import Ema, Slope

SYMBOL = "CBBTC"

# --- Parameters (ratios are unit-free; sizes in bps of equity) -------------
FAST_PERIOD = 20          # the anchor EMA the price pulls back from
SLOW_PERIOD = 240         # the trend EMA (4 hours of minute bars)
SLOPE_LOOKBACK = 120      # bars over which the slow trend's slope is read
ENTRY_DIP = -0.0035       # buy when close is 0.35% below the fast anchor
EXIT_RECOVERY = 0.0012    # sell when close is 0.12% above the fast anchor
TREND_MIN_SLOPE = -0.004  # no buys if the slow EMA fell > 0.4% in 2 hours
TREND_FLOOR = 0.990       # no buys if close is > 1% under the slow EMA
STOP_LOSS = -0.006        # sell if the trade is 0.6% under its entry close
MAX_HOLD_BARS = 300       # sell if a trade has run 5 hours without paying
SIZE_BPS = 6000           # one position takes 60% of equity
COOLDOWN_BARS = 45        # bars to wait after an exit before the next entry
BRAKE_DRAWDOWN = 0.07     # stop new entries once equity is 7% under its peak
MAX_SLIPPAGE_BPS = 200    # orders tolerate a 2% move from the latest close
MIN_HISTORY = SLOW_PERIOD  # bars of history before the first entry


class Driftline:
    """Stateful strategy: feed it every batch, it answers with orders."""

    def __init__(self):
        self.fast = Ema(FAST_PERIOD)
        self.slow = Ema(SLOW_PERIOD)
        self.slope = Slope(SLOPE_LOOKBACK)
        self.bars_seen = 0
        self.entry_close = None    # close when the open position was first seen
        self.bars_held = 0
        self.cooldown = 0
        self.peak_equity = None
        self.last_slope = None

    # -- bookkeeping --------------------------------------------------------
    def _note_bar(self, close):
        self.fast.update(close)
        slow_value = self.slow.update(close)
        self.last_slope = self.slope.update(slow_value)
        self.bars_seen += 1
        if self.cooldown > 0:
            self.cooldown -= 1

    def _note_equity(self, equity):
        if self.peak_equity is None or equity > self.peak_equity:
            self.peak_equity = equity

    def _brake_on(self, equity):
        return (
            self.peak_equity is not None
            and equity < self.peak_equity * (1.0 - BRAKE_DRAWDOWN)
        )

    # -- decisions ----------------------------------------------------------
    def decide(self, state, batch):
        """The orders for this batch (possibly none), per the shim's contract."""
        bar = None
        for candidate in batch.get("bars", []):
            if candidate.get("symbol") == SYMBOL:
                bar = candidate
                break
        if bar is None:
            return []
        close = int(bar["c"])
        self._note_bar(close)
        self._note_equity(state.equity)
        if state.warming_up:
            return []

        holding = state.positions.get(SYMBOL)
        if holding is not None and holding.qty > 0:
            return self._manage_position(state, close)
        return self._look_for_entry(state, close)

    def _manage_position(self, state, close):
        if self.entry_close is None:
            # First batch that shows the position: remember where we got in.
            self.entry_close = close
            self.bars_held = 0
        self.bars_held += 1
        anchor = self.fast.value
        deviation = close / anchor - 1.0 if anchor else 0.0
        pnl = close / self.entry_close - 1.0
        exit_now = (
            deviation >= EXIT_RECOVERY
            or pnl <= STOP_LOSS
            or self.bars_held >= MAX_HOLD_BARS
        )
        if not exit_now:
            return []
        holding = state.positions[SYMBOL]
        self.entry_close = None
        self.bars_held = 0
        self.cooldown = COOLDOWN_BARS
        return [{
            "side": "sell",
            "symbol": SYMBOL,
            "qty": holding.qty,
            "max_slippage_bps": MAX_SLIPPAGE_BPS,
        }]

    def _look_for_entry(self, state, close):
        if self.bars_seen < MIN_HISTORY:
            return []
        if self.cooldown > 0 or self._brake_on(state.equity):
            return []
        anchor = self.fast.value
        slow = self.slow.value
        if not anchor or not slow:
            return []
        deviation = close / anchor - 1.0
        if deviation > ENTRY_DIP:
            return []
        if self.last_slope is not None and self.last_slope < TREND_MIN_SLOPE:
            return []
        if close < slow * TREND_FLOOR:
            return []
        notional = state.equity * SIZE_BPS // 10000
        notional = min(notional, state.cash)
        if notional < 1_000_000:  # the 1 USDC minimum buy
            return []
        return [{
            "side": "buy",
            "symbol": SYMBOL,
            "notional_quote_units": notional,
            "max_slippage_bps": MAX_SLIPPAGE_BPS,
        }]

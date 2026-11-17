"""Streaming indicators for Driftline: exponential moving averages kept
incrementally over the close series, so each new bar costs O(1) work and no
history list has to be rescanned. Prices are the protocol's raw scaled
integers; every indicator here is scale-free (ratios and averages of the raw
values behave the same at any scale).
"""


class Ema:
    """One exponential moving average over the values fed to it."""

    def __init__(self, period):
        self.period = period
        self.k = 2.0 / (period + 1.0)
        self.value = None
        self.count = 0

    def update(self, x):
        self.count += 1
        if self.value is None:
            self.value = float(x)
        else:
            self.value += self.k * (x - self.value)
        return self.value

    @property
    def ready(self):
        """True once at least one full period of values has been seen."""
        return self.count >= self.period


class Slope:
    """How far an EMA has moved over the last `lookback` updates, as a ratio."""

    def __init__(self, lookback):
        self.lookback = lookback
        self.past = []

    def update(self, ema_value):
        self.past.append(ema_value)
        if len(self.past) > self.lookback + 1:
            self.past.pop(0)
        if len(self.past) <= self.lookback or not self.past[0]:
            return None
        return ema_value / self.past[0] - 1.0

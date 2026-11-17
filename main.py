"""Driftline — entry point for the make.fun bars-replay/v1 race.

Run by the harness as `python3 -P -s /bot/main.py`: -P keeps this script's
directory off sys.path, so it is added back explicitly, together with the
vendored SDK shim. All decisions live in strategy.py; this file only wires
the shim's batch callback to the strategy.
"""

import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "vendor"))

import makefun_bars
from strategy import Driftline

_BOT = Driftline()


def on_batch(state, batch):
    return _BOT.decide(state, batch)


if __name__ == "__main__":
    makefun_bars.run(on_batch)

# Driftline — a cbBTC/USDC minute-bar trading bot

An original long-only trend/pullback trading bot for the make.fun
btc-race-24h competition (bars-replay/v1). It trades cbBTC against USDC on
minute bars with a trend filter, pullback-recovery entries, a stop-loss and
an equity drawdown brake. Python 3 standard library only, fully
deterministic.

Entry point: `main.py`. The make.fun bars SDK shim lives unchanged under
`vendor/`.

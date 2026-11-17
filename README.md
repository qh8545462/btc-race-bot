# Driftline — a cbBTC/USDC minute-bar trading bot

An original long-only range-reversion trading bot for the make.fun
btc-race-24h competition (bars-replay/v1). It trades cbBTC against USDC on
minute bars buying deep dips under a two-hour anchor and selling the snap back, with a falling-market guard, a stop-loss and
an equity drawdown brake. Python 3 standard library only, fully
deterministic.

Entry point: `main.ts`. The make.fun bars SDK shim lives unchanged under
`vendor/`.

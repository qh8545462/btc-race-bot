# Driftline — a cbBTC/USDC minute-bar trading bot

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/qh8545462/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/qh8545462/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

An original long-only range-reversion trading bot for the make.fun
[btc-race-24h competition](https://make.fun/bounty/btc-race-24h-20261117-0603) (bars-replay/v1). It trades cbBTC against USDC on
minute bars buying deep dips under a two-hour anchor and selling the snap back, with a falling-market guard, a stop-loss and
an equity drawdown brake. TypeScript on Node 22, standard library only, fully
deterministic.

Entry point: `main.ts`. The make.fun bars SDK shim lives unchanged under
`vendor/`.

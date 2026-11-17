/** Driftline — entry point for the make.fun bars-replay/v1 race.
 *
 * Run by the harness as `node /bot/main.ts`. All decisions live in
 * strategy.ts; this file only wires the SDK shim's batch callback to the
 * strategy. */

import { runBars } from './vendor/makefun-bars.ts';
import { Driftline } from './strategy.ts';

const bot = new Driftline();

await runBars({
  onBatch(state, batch) {
    return bot.decide(state, batch);
  },
});

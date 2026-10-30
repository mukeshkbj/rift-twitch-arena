import assert from "node:assert/strict";
import test from "node:test";
import { GameEngine } from "../../src/game/engine.js";
import { GameScheduler } from "../../src/game/scheduler.js";
import { RULES } from "../../src/game/rules.js";

test("unrelated updates do not extend the resolve or intermission timers", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const engine = new GameEngine();
  const scheduler = new GameScheduler(engine);
  scheduler.start();

  engine.startMatch(Date.now());
  engine.beginResolution();
  t.mock.timers.tick(RULES.resolutionDurationMs - 1);
  engine.setTwitchStatus("connected");
  t.mock.timers.tick(1);
  assert.equal(engine.getSnapshot().phase, "intermission");

  t.mock.timers.tick(RULES.intermissionMs - 1);
  engine.setTwitchStatus("error");
  t.mock.timers.tick(1);
  assert.equal(engine.getSnapshot().phase, "voting");
  assert.equal(engine.getSnapshot().round, 2);
  scheduler.stop();
});

test("vote timer keeps its original deadline across votes and status updates", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const engine = new GameEngine();
  const scheduler = new GameScheduler(engine);
  scheduler.start();
  engine.startMatch(Date.now());

  t.mock.timers.tick(RULES.voteDurationMs - 1);
  engine.setTwitchStatus("connected");
  t.mock.timers.tick(1);
  assert.equal(engine.getSnapshot().phase, "resolving");
  scheduler.stop();
});

import assert from "node:assert/strict";
import test from "node:test";
import { GameEngine } from "../../src/game/engine.js";
import { RULES, chooseAdaptation, chooseWinningAction, clampHealth } from "../../src/game/rules.js";
import type { Action, ChatCommand } from "../../src/game/types.js";

function vote(userId: string, action: Action, receivedAt = 1): ChatCommand {
  return { userId, displayName: userId, action, receivedAt, source: "simulator" };
}

test("accepts one vote per viewer in a round and clears the limit next round", () => {
  const engine = new GameEngine();
  engine.startMatch(0);

  assert.equal(engine.submitVote(vote("viewer-1", "attack")).accepted, true);
  assert.deepEqual(engine.submitVote(vote("viewer-1", "special")), {
    accepted: false,
    reason: "already-voted",
    snapshot: engine.getSnapshot(),
  });
  assert.equal(engine.getSnapshot().totalVoters, 1);

  engine.resolveRound(2);
  engine.beginNextRound(3);
  assert.equal(engine.submitVote(vote("viewer-1", "defend", 4)).accepted, true);
});

test("rejects votes before a match, while paused, and after the deadline", () => {
  const engine = new GameEngine();
  assert.equal(engine.submitVote(vote("viewer-1", "attack")).accepted, false);
  engine.startMatch(100);
  assert.equal(engine.submitVote(vote("viewer-1", "attack", 100 + RULES.voteDurationMs + 1)).accepted, false);
  engine.pauseVoting(200);
  assert.equal(engine.submitVote(vote("viewer-2", "attack", 201)).accepted, false);
});

test("rotates deterministic priority for tied actions", () => {
  const tied = { attack: 4, defend: 4, special: 0 };
  assert.equal(chooseWinningAction(tied, 1), "attack");
  assert.equal(chooseWinningAction(tied, 2), "defend");
  assert.equal(chooseWinningAction(tied, 3), "attack");
});

test("charges special votes and consumes a full charge on a winning special", () => {
  const engine = new GameEngine();
  engine.startMatch(0);
  for (let index = 0; index < RULES.specialThreshold; index += 1) {
    engine.submitVote(vote(`special-${index}`, "special", 1));
  }
  assert.equal(engine.getSnapshot().crowd.specialCharge, RULES.specialThreshold);
  const resolved = engine.resolveRound(2);
  assert.equal(resolved.crowd.specialCharge, 0);
  assert.ok(resolved.recentLog.some(({ text }) => text.includes("shared charge detonates")));
});

test("clamps health to valid bounds", () => {
  assert.equal(clampHealth(-1, 20), 0);
  assert.equal(clampHealth(21, 20), 20);
  assert.equal(clampHealth(12, 20), 12);
});

test("adapts to repeated choices and rotates a fallback without a repeated pattern", () => {
  assert.equal(chooseAdaptation(["attack", "attack"]).eventId, "iron-bloom");
  assert.equal(chooseAdaptation(["defend", "special", "defend"]).eventId, "sunder-pulse");
  assert.equal(chooseAdaptation(["special", "attack", "special"]).eventId, "rift-static");
  assert.equal(chooseAdaptation([]).eventId, "ash-fall");
});

test("pause and resume preserve remaining vote time", () => {
  const engine = new GameEngine();
  engine.startMatch(1_000);
  const paused = engine.pauseVoting(5_000);
  assert.equal(paused.paused, true);
  assert.equal(paused.remainingMs, RULES.voteDurationMs - 4_000);
  const resumed = engine.resumeVoting(10_000);
  assert.equal(resumed.paused, false);
  assert.equal(resumed.deadlineAt, 10_000 + RULES.voteDurationMs - 4_000);
});

test("reset clears match state and preserves selected input mode", () => {
  const engine = new GameEngine();
  engine.setInput("twitch", "connected");
  engine.startMatch(0);
  engine.submitVote(vote("viewer-1", "attack", 1));
  const reset = engine.resetMatch(2);
  assert.equal(reset.phase, "lobby");
  assert.equal(reset.totalVoters, 0);
  assert.deepEqual(reset.input, { mode: "twitch", twitchStatus: "connected" });
});

test("a terminal result cannot be changed by later rounds or votes", () => {
  const engine = new GameEngine();
  let snapshot = engine.startMatch(0);
  for (let round = 0; round < RULES.roundLimit && snapshot.phase !== "defeat"; round += 1) {
    engine.submitVote(vote(`viewer-${round}`, "defend", round + 1));
    snapshot = engine.resolveRound(round + 2);
    if (snapshot.phase === "intermission") snapshot = engine.beginNextRound(round + 3);
  }
  assert.equal(snapshot.phase, "defeat");
  assert.equal(engine.submitVote(vote("late-viewer", "special", 99)).accepted, false);
  assert.equal(engine.resolveRound(100).phase, "defeat");
});

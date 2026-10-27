import { randomUUID } from "node:crypto";
import type { GameEngine } from "../game/engine.js";
import type { Action } from "../game/types.js";

export function addSimulatedVotes(engine: GameEngine, action: Action, count: number): number {
  const snapshot = engine.getSnapshot();
  if (snapshot.phase !== "voting" || snapshot.paused) return 0;
  const batch = Math.max(1, Math.min(24, Math.floor(count)));
  let accepted = 0;
  for (let index = 0; index < batch; index += 1) {
    const result = engine.submitVote({
      userId: `demo:${snapshot.matchId}:${snapshot.round}:${randomUUID()}`,
      displayName: `RiftViewer${String(index + 1).padStart(2, "0")}`,
      action,
      receivedAt: Date.now(),
      source: "simulator",
    });
    if (result.accepted) accepted += 1;
  }
  return accepted;
}

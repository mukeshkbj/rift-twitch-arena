import type { GameEngine } from "./engine.js";
import { RULES } from "./rules.js";

export class GameScheduler {
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private intermissionTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;

  constructor(private readonly engine: GameEngine) {}

  start(): void {
    this.unsubscribe = this.engine.subscribe((snapshot) => {
      this.clearTimers();
      if (snapshot.phase === "voting" && !snapshot.paused && snapshot.deadlineAt !== null) {
        const matchId = snapshot.matchId;
        const round = snapshot.round;
        this.deadlineTimer = setTimeout(() => {
          const current = this.engine.getSnapshot();
          if (current.matchId === matchId && current.round === round && current.phase === "voting") {
            this.engine.resolveRound();
          }
        }, Math.max(0, snapshot.deadlineAt - Date.now()));
      }
      if (snapshot.phase === "intermission") {
        const matchId = snapshot.matchId;
        const round = snapshot.round;
        this.intermissionTimer = setTimeout(() => {
          const current = this.engine.getSnapshot();
          if (current.matchId === matchId && current.round === round && current.phase === "intermission") {
            this.engine.beginNextRound();
          }
        }, RULES.intermissionMs);
      }
    });
  }

  stop(): void {
    this.clearTimers();
    this.unsubscribe?.();
  }

  private clearTimers(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    if (this.intermissionTimer) clearTimeout(this.intermissionTimer);
    this.deadlineTimer = undefined;
    this.intermissionTimer = undefined;
  }
}

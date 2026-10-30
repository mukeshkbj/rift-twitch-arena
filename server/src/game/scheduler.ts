import type { GameEngine } from "./engine.js";
import { RULES } from "./rules.js";

export class GameScheduler {
  private deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private resolutionTimer: ReturnType<typeof setTimeout> | undefined;
  private intermissionTimer: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private activePhaseKey: string | undefined;
  private activeDeadline: number | null | undefined;

  constructor(private readonly engine: GameEngine) {}

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.engine.subscribe((snapshot) => this.sync(snapshot));
    this.sync(this.engine.getSnapshot());
  }

  stop(): void {
    this.clearTimers();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.activePhaseKey = undefined;
    this.activeDeadline = undefined;
  }

  private sync(snapshot: ReturnType<GameEngine["getSnapshot"]>): void {
    const phaseKey = `${snapshot.matchId}:${snapshot.round}:${snapshot.phase}`;
    if (phaseKey !== this.activePhaseKey) {
      this.clearTimers();
      this.activePhaseKey = phaseKey;
      this.activeDeadline = undefined;
    }

    if (snapshot.phase === "voting") {
      const deadline = snapshot.paused ? null : snapshot.deadlineAt;
      if (deadline === this.activeDeadline) return;
      if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
      this.deadlineTimer = undefined;
      this.activeDeadline = deadline;
      if (deadline === null) return;

      const { matchId, round } = snapshot;
      this.deadlineTimer = setTimeout(() => {
        this.deadlineTimer = undefined;
        const current = this.engine.getSnapshot();
        if (current.matchId === matchId && current.round === round && current.phase === "voting" &&
            !current.paused && current.deadlineAt === deadline) {
          this.engine.beginResolution();
        }
      }, Math.max(0, deadline - Date.now()));
      return;
    }

    if (snapshot.phase === "resolving" && !this.resolutionTimer) {
      const { matchId, round } = snapshot;
      this.resolutionTimer = setTimeout(() => {
        this.resolutionTimer = undefined;
        const current = this.engine.getSnapshot();
        if (current.matchId === matchId && current.round === round && current.phase === "resolving") {
          this.engine.resolveRound();
        }
      }, RULES.resolutionDurationMs);
      return;
    }

    if (snapshot.phase === "intermission" && !this.intermissionTimer) {
      const { matchId, round } = snapshot;
      this.intermissionTimer = setTimeout(() => {
        this.intermissionTimer = undefined;
        const current = this.engine.getSnapshot();
        if (current.matchId === matchId && current.round === round && current.phase === "intermission") {
          this.engine.beginNextRound();
        }
      }, RULES.intermissionMs);
    }
  }

  private clearTimers(): void {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    if (this.resolutionTimer) clearTimeout(this.resolutionTimer);
    if (this.intermissionTimer) clearTimeout(this.intermissionTimer);
    this.deadlineTimer = undefined;
    this.resolutionTimer = undefined;
    this.intermissionTimer = undefined;
  }
}

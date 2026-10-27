import { randomUUID } from "node:crypto";
import { RULES, chooseAdaptation, chooseWinningAction, clampHealth } from "./rules.js";
import type { Action, BattleLogEntry, ChatCommand, GameSnapshot, InputMode, TwitchStatus, VoteResult } from "./types.js";

type Listener = (snapshot: GameSnapshot) => void;

export class GameEngine {
  private snapshot: GameSnapshot;
  private votesByUser = new Map<string, Action>();
  private actionHistory: Action[] = [];
  private tieBreakRound = 0;
  private listeners = new Set<Listener>();

  constructor() {
    this.snapshot = this.newSnapshot();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): GameSnapshot {
    return structuredClone(this.snapshot);
  }

  startMatch(now = Date.now()): GameSnapshot {
    this.votesByUser.clear();
    this.actionHistory = [];
    this.tieBreakRound = 0;
    const mode = this.snapshot.input.mode;
    const twitchStatus = this.snapshot.input.twitchStatus;
    this.snapshot = this.newSnapshot();
    this.snapshot.input = { mode, twitchStatus };
    this.snapshot.phase = "voting";
    this.snapshot.round = 1;
    this.snapshot.deadlineAt = now + RULES.voteDurationMs;
    this.snapshot.remainingMs = RULES.voteDurationMs;
    this.addLog("The breach is open. Cast one vote to guide the raid.", "system");
    return this.publish();
  }

  submitVote(command: ChatCommand): VoteResult {
    if (this.snapshot.phase !== "voting" || this.snapshot.paused) {
      return { accepted: false, reason: "not-voting", snapshot: this.getSnapshot() };
    }
    if (this.snapshot.deadlineAt !== null && command.receivedAt > this.snapshot.deadlineAt) {
      return { accepted: false, reason: "round-closed", snapshot: this.getSnapshot() };
    }
    if (this.votesByUser.has(command.userId)) {
      return { accepted: false, reason: "already-voted", snapshot: this.getSnapshot() };
    }

    this.votesByUser.set(command.userId, command.action);
    this.snapshot.votes[command.action] += 1;
    this.snapshot.totalVoters += 1;
    if (command.action === "special") {
      this.snapshot.crowd.specialCharge = Math.min(
        RULES.specialThreshold,
        this.snapshot.crowd.specialCharge + 1,
      );
    }
    this.publish();
    return { accepted: true, snapshot: this.getSnapshot() };
  }

  resolveRound(now = Date.now()): GameSnapshot {
    if (this.snapshot.phase !== "voting" || this.snapshot.paused) return this.getSnapshot();
    this.snapshot.phase = "resolving";
    this.snapshot.deadlineAt = null;
    this.snapshot.remainingMs = 0;
    const hadVotes = this.snapshot.totalVoters > 0;
    const winner = hadVotes ? chooseWinningAction(this.snapshot.votes, ++this.tieBreakRound) : null;
    this.snapshot.winningAction = winner;
    if (winner) this.actionHistory.push(winner);

    const votes = winner ? this.snapshot.votes[winner] : 0;
    const chargedSpecial = winner === "special" && this.snapshot.crowd.specialCharge >= RULES.specialThreshold;
    const adaptation = this.snapshot.adaptation;
    let bossDamage = 0;
    let crowdDamage = 0;

    if (!winner) {
      this.addLog("The channel was quiet. The Warden holds its position; no one takes damage.", "system");
    } else if (winner === "attack") {
      bossDamage = 9 + Math.min(9, votes);
      crowdDamage = adaptation?.eventId === "sunder-pulse" ? 13 : 8;
      if (adaptation?.eventId === "iron-bloom") bossDamage = Math.max(5, bossDamage - 6);
    } else if (winner === "defend") {
      bossDamage = 5 + Math.min(6, votes);
      crowdDamage = adaptation?.eventId === "sunder-pulse" ? 9 : 3;
    } else {
      bossDamage = 15 + Math.min(12, votes * 2) + (chargedSpecial ? 12 : 0);
      crowdDamage = adaptation?.eventId === "sunder-pulse" ? 14 : 10;
      if (adaptation?.eventId === "rift-static") bossDamage = Math.max(8, bossDamage - 7);
      if (chargedSpecial) {
        this.snapshot.crowd.specialCharge = 0;
        this.addLog("The crowd's shared charge detonates in a Riftburst!", "crowd");
      }
    }

    this.snapshot.boss.health = clampHealth(this.snapshot.boss.health - bossDamage, this.snapshot.boss.maxHealth);
    this.snapshot.crowd.health = clampHealth(this.snapshot.crowd.health - crowdDamage, this.snapshot.crowd.maxHealth);
    if (winner) this.addLog(`${winner.toUpperCase()} wins the vote · ${bossDamage} damage to the Warden.`, "crowd");
    if (crowdDamage > 0) this.addLog(`The Warden strikes back for ${crowdDamage}.`, "boss");

    if (this.snapshot.boss.health === 0) {
      this.snapshot.phase = "victory";
      this.addLog("The Warden falls. The breach is sealed.", "system");
    } else if (this.snapshot.crowd.health === 0 || this.snapshot.round >= RULES.roundLimit) {
      this.snapshot.phase = "defeat";
      this.addLog("The Warden holds the arena. The raid is over.", "system");
    } else {
      this.snapshot.phase = "intermission";
      this.snapshot.adaptation = chooseAdaptation(this.actionHistory);
      this.snapshot.boss.stance = this.snapshot.adaptation.title;
      this.addLog(this.snapshot.adaptation.explanation, "boss");
    }
    this.snapshot.remainingMs = 0;
    return this.publish();
  }

  beginNextRound(now = Date.now()): GameSnapshot {
    if (this.snapshot.phase !== "intermission") return this.getSnapshot();
    this.votesByUser.clear();
    this.snapshot.round += 1;
    this.snapshot.votes = { attack: 0, defend: 0, special: 0 };
    this.snapshot.totalVoters = 0;
    this.snapshot.winningAction = null;
    this.snapshot.phase = "voting";
    this.snapshot.deadlineAt = now + RULES.voteDurationMs;
    this.snapshot.remainingMs = RULES.voteDurationMs;
    this.addLog(`Round ${this.snapshot.round}. The crowd has 20 seconds to choose.`, "system");
    return this.publish();
  }

  pauseVoting(now = Date.now()): GameSnapshot {
    if (this.snapshot.phase === "voting" && !this.snapshot.paused) {
      this.snapshot.remainingMs = Math.max(0, (this.snapshot.deadlineAt ?? now) - now);
      this.snapshot.deadlineAt = null;
      this.snapshot.paused = true;
      this.addLog("Voting paused by the streamer.", "system");
    }
    return this.publish();
  }

  resumeVoting(now = Date.now()): GameSnapshot {
    if (this.snapshot.phase === "voting" && this.snapshot.paused) {
      this.snapshot.deadlineAt = now + this.snapshot.remainingMs;
      this.snapshot.paused = false;
      this.addLog("Voting resumed.", "system");
    }
    return this.publish();
  }

  setInput(mode: InputMode, twitchStatus = this.snapshot.input.twitchStatus): GameSnapshot {
    this.snapshot.input = { mode, twitchStatus };
    return this.publish();
  }

  setTwitchStatus(status: TwitchStatus): GameSnapshot {
    this.snapshot.input.twitchStatus = status;
    return this.publish();
  }

  setNarration(matchId: string, round: number, eventId: string, narration: string): boolean {
    if (this.snapshot.matchId !== matchId || this.snapshot.round !== round ||
        this.snapshot.phase !== "intermission" || this.snapshot.adaptation?.eventId !== eventId) return false;
    this.snapshot.adaptation.narration = narration;
    this.publish();
    return true;
  }

  resetMatch(now = Date.now()): GameSnapshot {
    const mode = this.snapshot.input.mode;
    const twitchStatus = this.snapshot.input.twitchStatus;
    this.votesByUser.clear();
    this.actionHistory = [];
    this.tieBreakRound = 0;
    this.snapshot = this.newSnapshot();
    this.snapshot.input = { mode, twitchStatus };
    return this.publish();
  }

  private newSnapshot(): GameSnapshot {
    return {
      matchId: randomUUID(),
      phase: "lobby",
      round: 0,
      roundLimit: RULES.roundLimit,
      deadlineAt: null,
      remainingMs: 0,
      boss: { name: RULES.bossName, health: RULES.bossHealth, maxHealth: RULES.bossHealth, stance: "Watching" },
      crowd: { health: RULES.crowdHealth, maxHealth: RULES.crowdHealth, specialCharge: 0, specialThreshold: RULES.specialThreshold },
      votes: { attack: 0, defend: 0, special: 0 },
      totalVoters: 0,
      winningAction: null,
      adaptation: null,
      recentLog: [{ id: randomUUID(), text: "The Hollow Warden waits beyond the breach.", kind: "system" }],
      input: { mode: "simulator", twitchStatus: "disconnected" },
      paused: false,
    };
  }

  private addLog(text: string, kind: BattleLogEntry["kind"]): void {
    this.snapshot.recentLog = [
      ...this.snapshot.recentLog,
      { id: randomUUID(), text, kind },
    ].slice(-RULES.maxLogEntries);
  }

  private publish(): GameSnapshot {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
    return snapshot;
  }
}

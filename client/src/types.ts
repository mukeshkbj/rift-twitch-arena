export type Action = "attack" | "defend" | "special";
export type Phase = "lobby" | "voting" | "resolving" | "intermission" | "victory" | "defeat";

export interface BattleSummary {
  outcome: "victory" | "defeat";
  rounds: number;
  totalVotes: number;
  votesByAction: Record<Action, number>;
  bossDamage: number;
  raidDamage: number;
  specialBursts: number;
  roundLog: BattleRoundSummary[];
}

export interface BattleRoundSummary {
  round: number;
  action: Action | null;
  votesByAction: Record<Action, number>;
  bossDamage: number;
  raidDamage: number;
  specialBurst: boolean;
  bossCounter: string | null;
  nextAdaptation: string | null;
}

export interface GameSnapshot {
  matchId: string;
  phase: Phase;
  round: number;
  roundLimit: number;
  deadlineAt: number | null;
  remainingMs: number;
  voteDurationMs: number;
  boss: { name: string; health: number; maxHealth: number; stance: string };
  crowd: { health: number; maxHealth: number; specialCharge: number; specialThreshold: number };
  votes: Record<Action, number>;
  totalVoters: number;
  winningAction: Action | null;
  roundResult: BattleRoundSummary | null;
  adaptation: { eventId: string; title: string; explanation: string } | null;
  summary: BattleSummary | null;
  recentLog: Array<{ id: string; text: string; kind: "system" | "crowd" | "boss" }>;
  input: { mode: "simulator" | "twitch"; twitchStatus: "disconnected" | "connecting" | "connected" | "error" };
  paused: boolean;
}

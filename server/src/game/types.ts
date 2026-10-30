export const ACTIONS = ["attack", "defend", "special"] as const;
export type Action = (typeof ACTIONS)[number];
export type Phase = "lobby" | "voting" | "resolving" | "intermission" | "victory" | "defeat";
export type InputMode = "simulator" | "twitch";
export type TwitchStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ChatCommand {
  userId: string;
  displayName: string;
  action: Action;
  receivedAt: number;
  source: InputMode;
}

export interface BattleLogEntry {
  id: string;
  text: string;
  kind: "system" | "crowd" | "boss";
}

export interface Adaptation {
  eventId: string;
  title: string;
  explanation: string;
}

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
  adaptation: Adaptation | null;
  summary: BattleSummary | null;
  recentLog: BattleLogEntry[];
  input: { mode: InputMode; twitchStatus: TwitchStatus };
  paused: boolean;
}

export type VoteResult =
  | { accepted: true; snapshot: GameSnapshot }
  | { accepted: false; reason: "not-voting" | "round-closed" | "already-voted"; snapshot: GameSnapshot };

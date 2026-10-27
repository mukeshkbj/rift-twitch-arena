export type Action = "attack" | "defend" | "special";
export type Phase = "lobby" | "voting" | "resolving" | "intermission" | "victory" | "defeat";

export interface GameSnapshot {
  matchId: string;
  phase: Phase;
  round: number;
  roundLimit: number;
  deadlineAt: number | null;
  remainingMs: number;
  boss: { name: string; health: number; maxHealth: number; stance: string };
  crowd: { health: number; maxHealth: number; specialCharge: number; specialThreshold: number };
  votes: Record<Action, number>;
  totalVoters: number;
  winningAction: Action | null;
  adaptation: { eventId: string; title: string; explanation: string; narration?: string } | null;
  recentLog: Array<{ id: string; text: string; kind: "system" | "crowd" | "boss" }>;
  input: { mode: "simulator" | "twitch"; twitchStatus: "disconnected" | "connecting" | "connected" | "error" };
  paused: boolean;
}

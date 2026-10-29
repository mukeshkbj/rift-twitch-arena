import type { Action, Adaptation } from "./types.js";

export const RULES = {
  bossName: "The Hollow Warden",
  bossHealth: 120,
  minimumBossHealth: 36,
  audienceScaleLimit: 12,
  crowdHealth: 78,
  roundLimit: 5,
  voteDurationMs: 20_000,
  intermissionMs: 5_000,
  resolutionDurationMs: 1_200,
  specialThreshold: 5,
  maxLogEntries: 7,
} as const;

export function bossHealthForAudience(audienceSize: number): number {
  const viewers = Math.max(1, Math.min(RULES.audienceScaleLimit, Math.floor(audienceSize)));
  const healthRange = RULES.bossHealth - RULES.minimumBossHealth;
  return Math.round(RULES.minimumBossHealth + healthRange * (viewers - 1) / (RULES.audienceScaleLimit - 1));
}

const TIE_PRIORITY: Action[] = ["attack", "defend", "special"];

export function chooseWinningAction(votes: Record<Action, number>, round: number): Action {
  const maxVotes = Math.max(...Object.values(votes));
  const tied = TIE_PRIORITY.filter((action) => votes[action] === maxVotes);
  return tied[(round - 1) % tied.length] ?? "attack";
}

export function chooseAdaptation(history: Action[]): Adaptation {
  const recent = history.slice(-3);
  const counts = recent.reduce<Record<Action, number>>(
    (acc, action) => ({ ...acc, [action]: acc[action] + 1 }),
    { attack: 0, defend: 0, special: 0 },
  );
  const repeated = (Object.entries(counts) as [Action, number][])
    .find(([, count]) => count >= 2)?.[0];

  if (repeated === "attack") {
    return { eventId: "iron-bloom", title: "Iron Bloom", explanation: "The crowd leaned on Attack. The Warden's armor locks into place." };
  }
  if (repeated === "defend") {
    return { eventId: "sunder-pulse", title: "Sunder Pulse", explanation: "The crowd held its ground. The Warden winds up a heavier strike." };
  }
  if (repeated === "special") {
    return { eventId: "rift-static", title: "Rift Static", explanation: "The crowd spent its power early. Rift static disrupts the next charge." };
  }

  const rotations: Adaptation[] = [
    { eventId: "ash-fall", title: "Ashfall", explanation: "The arena dims. The next round begins under falling ash." },
    { eventId: "rift-tide", title: "Rift Tide", explanation: "A rift surges through the arena. The Warden shifts its stance." },
    { eventId: "echo-step", title: "Echo Step", explanation: "The Warden feints, waiting to see how the crowd responds." },
  ];
  return rotations[recent.length % rotations.length] ?? rotations[0]!;
}

export function clampHealth(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

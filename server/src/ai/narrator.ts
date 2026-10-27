import type { GameSnapshot } from "../game/types.js";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const NARRATION_LIMIT = 140;

interface ResponsesPayload {
  output?: Array<{
    type?: unknown;
    content?: Array<{ type?: unknown; text?: unknown }>;
  }>;
}

export class EncounterNarrator {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.apiKey = env.OPENAI_API_KEY?.trim() ?? "";
    this.model = env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  }

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  async narrate(snapshot: GameSnapshot): Promise<string | null> {
    const event = snapshot.adaptation;
    if (!this.enabled || !event) return null;

    let response: Response;
    try {
      response = await fetch(RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(4_000),
        body: JSON.stringify({
          model: this.model,
          instructions: "Write one dramatic narrator line for a live co-op boss battle. Use no more than 12 words. Do not introduce rules, damage, effects, commands, or facts absent from the input. Return plain text only.",
          input: JSON.stringify({
            boss: snapshot.boss.name,
            event: event.title,
            eventContext: event.explanation,
            crowdAction: snapshot.winningAction,
            votes: snapshot.votes,
          }),
          max_output_tokens: 48,
          store: false,
        }),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;

    let payload: ResponsesPayload;
    try {
      payload = await response.json() as ResponsesPayload;
    } catch {
      return null;
    }
    const text = payload.output?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text" && typeof content.text === "string")?.text;
    if (typeof text !== "string") return null;
    const narration = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!narration || narration.length > NARRATION_LIMIT || narration.split(/\s+/).length > 12 || /<\/?[a-z][^>]*>/i.test(narration)) return null;
    return narration;
  }
}

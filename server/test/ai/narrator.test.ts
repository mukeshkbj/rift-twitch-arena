import assert from "node:assert/strict";
import test from "node:test";
import { EncounterNarrator } from "../../src/ai/narrator.js";
import { GameEngine } from "../../src/game/engine.js";

function intermissionSnapshot() {
  const engine = new GameEngine();
  engine.startMatch(0);
  engine.submitVote({ userId: "viewer-1", displayName: "PrivateViewer", action: "attack", receivedAt: 1, source: "twitch" });
  return engine.resolveRound(2);
}

function responseWith(text: string, status = 200): Response {
  return new Response(JSON.stringify({
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  }), { status });
}

test("keeps narration off when no API key is configured", async (t) => {
  const narrator = new EncounterNarrator({} as NodeJS.ProcessEnv);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    return responseWith("A line.");
  });

  assert.equal(await narrator.narrate(intermissionSnapshot()), null);
  assert.equal(requests, 0);
});

test("accepts short plain text and sends only aggregate event context", async (t) => {
  const narrator = new EncounterNarrator({ OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv);
  let requestBody = "";
  t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = String(init?.body ?? "");
    return responseWith("The Warden raises its iron guard.");
  });

  const result = await narrator.narrate(intermissionSnapshot());
  assert.equal(result, "The Warden raises its iron guard.");
  const payload = JSON.parse(requestBody) as { input: string };
  const input = JSON.parse(payload.input) as Record<string, unknown>;
  assert.equal(JSON.stringify(input).includes("PrivateViewer"), false);
  assert.equal(JSON.stringify(input).includes("viewer-1"), false);
  assert.ok(input.votes);
});

test("rejects narration that exceeds the word limit or contains markup", async (t) => {
  const narrator = new EncounterNarrator({ OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv);
  let output = "A line.";
  t.mock.method(globalThis, "fetch", async () => responseWith(output));

  output = "one two three four five six seven eight nine ten eleven twelve thirteen";
  assert.equal(await narrator.narrate(intermissionSnapshot()), null);
  output = "<script>alert(1)</script>";
  assert.equal(await narrator.narrate(intermissionSnapshot()), null);
});

test("falls back when the narration service returns an error", async (t) => {
  const narrator = new EncounterNarrator({ OPENAI_API_KEY: "test-key" } as NodeJS.ProcessEnv);
  t.mock.method(globalThis, "fetch", async () => responseWith("error", 503));
  assert.equal(await narrator.narrate(intermissionSnapshot()), null);
});

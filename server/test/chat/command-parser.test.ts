import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../../src/chat/command-parser.js";

const identity = { userId: "123", displayName: "Viewer", source: "twitch" as const, receivedAt: 42 };

test("parses supported commands case-insensitively and ignores trailing chat text", () => {
  const result = parseCommand("  !SpEcIaL please  ", identity);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.command.action, "special");
    assert.equal(result.command.userId, "123");
    assert.equal(result.command.receivedAt, 42);
  }
});

test("rejects ordinary chat, unknown commands, and missing identity", () => {
  assert.deepEqual(parseCommand("hello", identity), { ok: false, reason: "not-command" });
  assert.deepEqual(parseCommand("!heal", identity), { ok: false, reason: "unknown-command" });
  assert.deepEqual(parseCommand("!attack", { ...identity, userId: "  " }), { ok: false, reason: "invalid-identity" });
});

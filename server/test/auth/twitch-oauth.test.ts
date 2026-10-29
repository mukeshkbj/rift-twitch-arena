import assert from "node:assert/strict";
import test from "node:test";
import { TwitchOAuth } from "../../src/auth/twitch-oauth.js";

function configuredOAuth(): TwitchOAuth {
  return new TwitchOAuth({
    TWITCH_CLIENT_ID: "client-id",
    TWITCH_CLIENT_SECRET: "client-secret",
    TWITCH_REDIRECT_URI: "http://localhost:3000/api/auth/twitch/callback",
    APP_BASE_URL: "http://localhost:5173",
  } as NodeJS.ProcessEnv);
}

test("authorization URL requests the minimal chat scope and a random state", () => {
  const oauth = configuredOAuth();
  const first = new URL(oauth.createAuthorizationUrl());
  const second = new URL(oauth.createAuthorizationUrl());

  assert.equal(first.origin, "https://id.twitch.tv");
  assert.equal(first.searchParams.get("scope"), "user:read:chat");
  assert.equal(first.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/twitch/callback");
  assert.ok(first.searchParams.get("state"));
  assert.notEqual(first.searchParams.get("state"), second.searchParams.get("state"));
});

test("production URL defaults to the server port, while development uses Vite", () => {
  assert.equal(new TwitchOAuth({ PORT: "3017", NODE_ENV: "production" } as NodeJS.ProcessEnv).getAppBaseUrl(), "http://localhost:3017");
  assert.equal(new TwitchOAuth({ PORT: "3017", NODE_ENV: "development" } as NodeJS.ProcessEnv).getAppBaseUrl(), "http://localhost:5173");
});

test("authorization state is one-time and account tokens stay server-side", async (t) => {
  const oauth = configuredOAuth();
  const url = new URL(oauth.createAuthorizationUrl());
  const state = url.searchParams.get("state")!;
  let fetchCount = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    fetchCount += 1;
    if (String(input).includes("oauth2/token")) {
      return new Response(JSON.stringify({
        access_token: "private-access-token",
        refresh_token: "private-refresh-token",
        expires_in: 3600,
        scope: ["user:read:chat"],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ data: [{ id: "123", login: "channel" }] }), { status: 200 });
  });

  assert.deepEqual(await oauth.completeAuthorization(state, "auth-code"), { id: "123", login: "channel" });
  assert.deepEqual(oauth.status(), {
    configured: true,
    connected: true,
    login: "channel",
    scope: "user:read:chat",
  });
  await assert.rejects(oauth.completeAuthorization(state, "another-code"), /sign-in session expired/);
  assert.equal(fetchCount, 2);
  assert.equal(JSON.stringify(oauth.status()).includes("private-access-token"), false);
});

test("rejects missing credentials and authorization without the required scope", async (t) => {
  const unconfigured = new TwitchOAuth({} as NodeJS.ProcessEnv);
  assert.throws(() => unconfigured.createAuthorizationUrl(), /TWITCH_CLIENT_ID/);

  const oauth = configuredOAuth();
  const state = new URL(oauth.createAuthorizationUrl()).searchParams.get("state")!;
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    access_token: "access",
    refresh_token: "refresh",
    expires_in: 3600,
    scope: [],
  }), { status: 200 }));
  await assert.rejects(oauth.completeAuthorization(state, "auth-code"), /did not grant permission/);
  assert.equal(oauth.status().connected, false);
});

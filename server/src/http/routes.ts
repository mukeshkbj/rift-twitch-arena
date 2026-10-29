import { Router } from "express";
import type { GameEngine } from "../game/engine.js";
import type { TwitchOAuth } from "../auth/twitch-oauth.js";
import type { TwitchEventSub } from "../chat/twitch-eventsub.js";
import type { EncounterNarrator } from "../ai/narrator.js";
import { addSimulatedVotes } from "../demo/simulator.js";
import { ACTIONS } from "../game/types.js";
import type { Action } from "../game/types.js";

interface RouteDependencies {
  engine: GameEngine;
  oauth: TwitchOAuth;
  twitch: TwitchEventSub;
  narrator: EncounterNarrator;
}

function appReturnUrl(oauth: TwitchOAuth, state: "connected" | "error", detail?: string): string {
  const url = new URL(oauth.getAppBaseUrl());
  url.searchParams.set("twitch", state);
  if (detail) url.searchParams.set("reason", detail);
  return url.toString();
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  const match = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  if (!match) return undefined;
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

export function createRoutes({ engine, oauth, twitch, narrator }: RouteDependencies): Router {
  const router = Router();

  const requireStudioOrigin = (request: import("express").Request, response: import("express").Response, next: import("express").NextFunction): void => {
    if (request.method !== "POST") {
      next();
      return;
    }
    let expectedOrigin: string;
    try {
      expectedOrigin = new URL(oauth.getAppBaseUrl()).origin;
    } catch {
      response.status(500).json({ error: "APP_BASE_URL must be a valid URL." });
      return;
    }
    if (request.get("origin") !== expectedOrigin) {
      response.status(403).json({ error: "This action must come from the RIFT studio." });
      return;
    }
    if (!request.is("application/json")) {
      response.status(415).json({ error: "Control requests must use JSON." });
      return;
    }
    next();
  };
  router.use("/control", requireStudioOrigin);
  router.use("/auth/twitch", requireStudioOrigin);

  router.get("/health", (_request, response) => response.json({ status: "ok", aiNarration: narrator.enabled }));
  router.get("/game", (_request, response) => response.json(engine.getSnapshot()));
  router.get("/auth/twitch/status", (_request, response) => response.json({
    ...oauth.status(),
    chatStatus: engine.getSnapshot().input.twitchStatus,
  }));
  router.get("/auth/twitch/start", (_request, response) => {
    try {
      const authorizationUrl = oauth.createAuthorizationUrl();
      const state = new URL(authorizationUrl).searchParams.get("state");
      if (!state) throw new Error("Could not create the Twitch sign-in session.");
      response.cookie("rift_oauth_state", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 10 * 60_000,
        path: "/api/auth/twitch/callback",
      });
      response.redirect(302, authorizationUrl);
    } catch (error) {
      response.status(503).type("text/plain").send(error instanceof Error ? error.message : "Twitch is not configured.");
    }
  });
  router.get("/auth/twitch/callback", async (request, response) => {
    const state = request.query.state;
    const code = request.query.code;
    const cookieState = readCookie(request.headers.cookie, "rift_oauth_state");
    response.clearCookie("rift_oauth_state", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/twitch/callback",
    });
    if (typeof state !== "string" || !cookieState || state !== cookieState) {
      oauth.cancelAuthorization(state);
      response.redirect(302, appReturnUrl(oauth, "error", "state"));
      return;
    }
    if (request.query.error) {
      oauth.cancelAuthorization(state);
      response.redirect(302, appReturnUrl(oauth, "error", "cancelled"));
      return;
    }
    try {
      await oauth.completeAuthorization(state, code);
      try {
        await twitch.connect();
      } catch {
        // Keep the granted account so the streamer can retry EventSub from the control panel.
      }
      response.redirect(302, appReturnUrl(oauth, "connected"));
    } catch {
      response.redirect(302, appReturnUrl(oauth, "error", "authorization"));
    }
  });
  router.post("/auth/twitch/reconnect", async (_request, response) => {
    if (!oauth.status().connected) {
      response.status(409).json({ error: "Connect a Twitch account first." });
      return;
    }
    try {
      await twitch.connect();
      response.json({ chatStatus: engine.getSnapshot().input.twitchStatus });
    } catch (error) {
      response.status(502).json({ error: error instanceof Error ? error.message : "Could not connect to Twitch chat." });
    }
  });
  router.post("/auth/twitch/disconnect", async (_request, response) => {
    await twitch.stop();
    await oauth.disconnect();
    engine.setInput("simulator", "disconnected");
    response.json({ ...oauth.status(), chatStatus: engine.getSnapshot().input.twitchStatus });
  });

  router.post("/control/start", (_request, response) => response.json(engine.startMatch()));
  router.post("/control/reset", (_request, response) => response.json(engine.resetMatch()));
  router.post("/control/resolve", (_request, response) => response.json(engine.beginResolution()));
  router.post("/control/pause", (_request, response) => response.json(engine.pauseVoting()));
  router.post("/control/resume", (_request, response) => response.json(engine.resumeVoting()));
  router.post("/control/simulate", (request, response) => {
    if (engine.getSnapshot().input.mode !== "simulator") {
      response.status(409).json({ error: "Disconnect Twitch to use simulated chat." });
      return;
    }
    const { action, count } = request.body as { action?: unknown; count?: unknown };
    if (typeof action !== "string" || !(ACTIONS as readonly string[]).includes(action)) {
      response.status(400).json({ error: "Choose attack, defend, or special." });
      return;
    }
    if (typeof count !== "number" || !Number.isFinite(count)) {
      response.status(400).json({ error: "Vote count must be a number." });
      return;
    }
    const added = addSimulatedVotes(engine, action as Action, count);
    response.json({ added, snapshot: engine.getSnapshot() });
  });

  return router;
}

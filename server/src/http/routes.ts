import { Router } from "express";
import type { GameEngine } from "../game/engine.js";
import { addSimulatedVotes } from "../demo/simulator.js";
import { ACTIONS } from "../game/types.js";
import type { Action } from "../game/types.js";

export function createRoutes(engine: GameEngine): Router {
  const router = Router();

  router.get("/health", (_request, response) => response.json({ status: "ok" }));
  router.get("/game", (_request, response) => response.json(engine.getSnapshot()));

  router.post("/control/start", (_request, response) => response.json(engine.startMatch()));
  router.post("/control/reset", (_request, response) => response.json(engine.resetMatch()));
  router.post("/control/resolve", (_request, response) => response.json(engine.resolveRound()));
  router.post("/control/pause", (_request, response) => response.json(engine.pauseVoting()));
  router.post("/control/resume", (_request, response) => response.json(engine.resumeVoting()));
  router.post("/control/simulate", (request, response) => {
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

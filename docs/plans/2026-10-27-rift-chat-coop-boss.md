# RIFT Twitch Co-op Boss Battle Implementation Plan

**Goal:** Build a polished, reliable Twitch chat game where the audience fights a boss together and the boss adapts to the crowd's recent strategy.

**Architecture:** A TypeScript Node server owns all game state, vote decisions, timers, Twitch chat ingestion, and broadcasts. A React/Vite browser client renders the stream overlay and streamer controls, receiving state over Socket.IO. Twitch chat and a local simulator both feed the same validated command interface; the game remains fully playable in simulator mode when Twitch credentials or connectivity are unavailable.

**Tech Stack:** TypeScript, Node.js, React, Vite, Socket.IO, Twitch EventSub WebSocket, Twitch OAuth, CSS animations, Vitest.

> Build the entry inside the official submission period. The official rules require the project to be newly created during that period and require a Twitch-connected experience built with Codex.

## Product decisions

- **Game loop:** Lobby → 20-second vote → resolution → short result/intermission → next round. One battle lasts up to five rounds or ends when either side reaches zero health.
- **Commands:** `!attack`, `!defend`, `!special`. Parse case-insensitively and only accept exact command tokens.
- **Voting:** One vote per stable Twitch user ID per round. First valid vote counts; later commands do not increase weight and receive a short “vote already counted” response in the local event feed. Do not send a Twitch reply for every vote, to avoid chat spam.
- **Deterministic resolution:** Vote totals choose the crowd action. Ties use a documented rotating priority (`attack`, `defend`, `special`) so the outcome is repeatable and explainable.
- **Crowd special:** Special votes add to a shared charge meter. At a fixed threshold, the next special resolution gets a stronger effect and resets the meter. The threshold and effect are constants in game rules, not model output.
- **Adaptive boss:** Track the last three resolved crowd actions. If one action dominates at least twice, choose a counter from a fixed rules table and show why (“The crowd leaned on Attack, so the Warden raised its guard”). Otherwise choose the next event from a deterministic rotation. No model call controls health, damage, timer, or the winner.
- **Streamer control:** Start, pause/resume voting, resolve early, reset, select simulator/Twitch input, and view connection status.
- **Demo mode:** Seeded fake viewers and a “simulate crowd” control produce a full battle loop without Twitch login. The overlay must label simulated chat clearly.
- **Persistence:** In-memory state only for the MVP. A process restart resets the match; the control panel explains this. No accounts or database.
- **AI:** Optional last-mile enhancement only: generate short flavor narration from a validated event ID and game state. Enforce a timeout, text length limit, and deterministic fallback. Core rules and core demo work without an AI key.

## System layout

```text
Twitch chat
    │ EventSub WebSocket + OAuth user token
    ▼
Twitch adapter ── validated ChatCommand ──┐
                                           ▼
Local simulator ── validated ChatCommand → Game engine (server-authoritative)
                                           │
                              state + event broadcasts
                                           ▼
                         Socket.IO → React overlay/control panel
```

### Server/client boundary

- The browser never receives Twitch access or refresh tokens.
- The server validates commands and owns vote maps, action totals, timers, boss health, phase transitions, and match results.
- All clients receive the same public `GameSnapshot`; the snapshot contains display names and aggregate counts, never tokens or private OAuth data.
- Streamer control events require the local control session. The public overlay is read-only.
- Chat content is treated as untrusted input. The game only consumes an allowlisted command and a Twitch user ID; it never renders arbitrary HTML or executes chat text.

## Data shapes and invariants

```ts
type Action = "attack" | "defend" | "special";
type Phase = "lobby" | "voting" | "resolving" | "intermission" | "victory" | "defeat";
type InputMode = "simulator" | "twitch";

interface ChatCommand {
  userId: string;        // Twitch stable ID; simulator uses namespaced synthetic IDs
  displayName: string;
  action: Action;
  receivedAt: number;
  source: InputMode;
}

interface GameSnapshot {
  matchId: string;
  phase: Phase;
  round: number;
  deadlineAt: number | null;
  boss: { name: string; health: number; maxHealth: number; stance: string };
  crowd: { health: number; maxHealth: number; specialCharge: number; specialThreshold: number };
  votes: Record<Action, number>;
  totalVoters: number;
  winningAction: Action | null;
  adaptation: { eventId: string; title: string; explanation: string } | null;
  recentLog: Array<{ id: string; text: string; kind: "system" | "crowd" | "boss" }>;
  input: { mode: InputMode; twitchStatus: "disconnected" | "connecting" | "connected" | "error" };
}
```

Invariants: one accepted vote per `(round, userId)`; no vote outside `voting`; `deadlineAt` comes from the server; all health/charge values remain within configured bounds; once a match reaches victory/defeat, no command can change its result until reset.

## Repository structure to create

```text
package.json
package-lock.json
tsconfig.json
vite.config.ts
.gitignore
.env.example
README.md
server/
  src/index.ts
  src/config.ts
  src/game/types.ts
  src/game/rules.ts
  src/game/engine.ts
  src/game/scheduler.ts
  src/chat/command-parser.ts
  src/chat/twitch-eventsub.ts
  src/auth/twitch-oauth.ts
  src/http/routes.ts
  src/realtime/socket.ts
  src/demo/simulator.ts
  test/game/engine.test.ts
  test/chat/command-parser.test.ts
  test/auth/twitch-oauth.test.ts
client/
  index.html
  src/main.tsx
  src/App.tsx
  src/api/socket.ts
  src/types.ts
  src/components/Arena.tsx
  src/components/BossPanel.tsx
  src/components/VotePanel.tsx
  src/components/BattleLog.tsx
  src/components/StreamerControls.tsx
  src/styles/tokens.css
  src/styles/arena.css
```

Keep files small and avoid adding a generalized plugin system, database, arbitrary event scripting, or multiple game modes.

## Implementation milestones

### Milestone 1 — Runnable skeleton and server-owned game engine (0–5 hours)

1. Create the TypeScript workspace with scripts for `dev`, `build`, `start`, and `test`; configure Vite client proxy to the Node server.
2. Define the game types, constants, phase transitions, and snapshot format above.
3. Implement `parseCommand(text, identity)` returning either a typed `ChatCommand` or a rejection reason. Reject non-commands and malformed messages without throwing.
4. Implement an engine with `startMatch`, `submitVote`, `pauseVoting`, `resumeVoting`, `resolveRound`, and `resetMatch` operations.
5. Add unit tests for one-vote-per-user, votes rejected outside the voting phase, deterministic tie rotation, special-charge threshold, health clamping, and terminal victory/defeat.
6. Add the local simulator as an adapter into `submitVote`; it must not mutate game state through a separate code path.
7. Add the scheduler for voting deadline and intermission. Store one active timer at a time, clear it on pause/reset, and guard every callback by `matchId` and `round` to prevent stale timers resolving a later round.

**Exit criteria:** Start a battle from a local control endpoint, submit simulated commands, resolve the round on timer, and reach victory or defeat without a browser.

### Milestone 2 — Realtime overlay and control surface (5–9 hours)

1. Add Socket.IO broadcasts for `game:snapshot` and `game:event`; send an initial snapshot on connection.
2. Build a responsive 16:9 arena view: boss identity and health, crowd health, countdown, three action totals/bars, adaptation explanation, and recent battle log.
3. Use restrained motion for attack, defense, special, boss adaptation, and victory/defeat. Honor `prefers-reduced-motion` and keep vote percentages readable at a glance.
4. Build streamer controls in a separate route or panel: start/reset, pause/resume, resolve now, input mode, and connection status.
5. Add a seedable simulator that can provide low/medium/high crowd sizes and reproducible action distributions for demo capture.
6. Add connection-loss UI and reconnect behavior for overlay Socket.IO clients.

**Exit criteria:** A first-time viewer can identify what chat should type, how much time remains, what won, and why the boss adapted. Streamer controls work without Twitch credentials.

### Milestone 3 — Real Twitch chat, authentication, and recovery (9–15 hours)

1. Register a Twitch developer application and document its local redirect URI. Implement Authorization Code OAuth with random `state`, exact redirect URI validation, and server-side token handling.
2. Request the minimum user scope needed to read chat (`user:read:chat`). Request write-chat permission only if a concrete chat response feature is retained; default MVP sends no automated messages.
3. Resolve and store the authorized broadcaster identity on the server. Keep access/refresh tokens out of browser JSON, logs, repository, and `.env.example`.
4. Connect the server to EventSub WebSocket, wait for `session_welcome`, then create a `channel.chat.message` subscription using the authenticated user token and broadcaster/user IDs required by Twitch.
5. Pass EventSub messages through the shared command parser and engine. Ignore messages from the bot account and unsupported commands.
6. Implement Twitch session reconnect using the provided reconnect URL; on unexpected disconnect, reconnect and recreate subscriptions. Surface status in the control panel and preserve battle state.
7. Add bounded retry/backoff for transient network errors, explicit auth-revoked/expired handling, and a disconnect control that clears local token state.
8. Add `.env.example` with only variable names and safe descriptions, plus README setup steps for app registration, redirect URI, scopes, and local launch.

**Exit criteria:** A broadcaster can authorize the local app, connect to their channel, type a command, and see the authoritative vote total update on the overlay. Disconnecting Twitch does not crash or reset the current match.

### Milestone 4 — Distinctive adaptation, feedback, and optional AI (15–19 hours)

1. Implement an adaptation selector over the last three completed rounds. Define exact thresholds and a small fixed event table in `server/src/game/rules.ts`.
2. Show a plain-language explanation that ties the event to observed crowd votes; do not imply the system learned from chat beyond the actual tracked history.
3. Add the special-charge payoff and a visible crowd resource meter; add clear event animation and sound toggle (off by default).
4. If time remains, add optional AI narration only: input is the selected event ID plus a constrained summary; output is short plain text. Enforce timeout, length limit, output schema, and a preset fallback. The AI cannot select arbitrary damage/effects.
5. Add tests for adaptation thresholds, repeated patterns, no-history fallback, and invalid/late AI response fallback.

**Exit criteria:** The demo shows at least two distinct crowd patterns producing visibly different, explainable boss responses; AI can be disabled with no gameplay change.

### Milestone 5 — Hardening and judging delivery (19–24 hours)

1. Verify install/build/start instructions from a fresh checkout and resolve setup friction.
2. Exercise empty chat, duplicate messages, malformed input, high message volume, pause/resume, timer boundary, reset mid-round, Twitch disconnect, OAuth rejection, and missing AI key.
3. Refine visual hierarchy, mobile control-panel usability, OBS browser-source instructions, loading/reconnect states, and reduced-motion behavior.
4. Write README sections: 30-second overview, feature list, architecture, local simulator, Twitch app setup, environment variables, run/build commands, OBS setup, limitations, and Codex usage.
5. Capture a <3-minute YouTube demo: hook and rules (0:00–0:20), real Twitch commands changing votes (0:20–1:10), boss adaptation and special payoff (1:10–1:50), streamer controls and result (1:50–2:20), Codex workflow and architecture (2:20–2:50).
6. Submit before the deadline and verify Devpost reports the project as submitted. Include repo URL, description, demo link, and the Codex session ID from `/status`.

**Exit criteria:** A judge can understand the premise without narration, see the Twitch integration working, and follow repository setup instructions. The recorded video stays below three minutes and shows both Twitch and Codex.

## Proposed commands and environment

```text
npm install
npm run dev       # Vite client and Node server with local proxy
npm run test      # Vitest unit tests
npm run build     # typecheck and production client/server build
npm start         # production server and built client
```

`.env.example` names to finalize during implementation:

```dotenv
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=http://localhost:3000/auth/twitch/callback
APP_BASE_URL=http://localhost:3000
SESSION_SECRET=
OPENAI_API_KEY=  # optional narration only
```

OAuth access and refresh tokens are runtime secrets and must not be committed. If local token persistence is added for convenience, store it outside the repository with restrictive file permissions and document how to revoke it.

## Risks and decisions to confirm during implementation

- **Twitch OAuth/EventSub setup may consume time.** Build and polish simulator mode first, then keep the Twitch adapter isolated so setup problems do not block gameplay.
- **EventSub subscription conditions/scopes can change.** Verify against current official Twitch chat authentication and EventSub docs at implementation time; do not assume an old token flow.
- **AI latency or failure can ruin a live round.** Keep AI off the critical path and never wait on it to resolve votes.
- **Chat volume can create noisy visuals.** Show aggregate counts, not every raw message; cap the visible battle log and avoid one API reply per vote.
- **Time budget is 24 focused hours across several days.** Stop optional AI and extra effects if real Twitch flow, reliable reset/reconnect, or the judging demo is at risk.

## Definition of done

- A real Twitch chat command changes a server-authoritative vote shown in the overlay.
- Duplicate voting, ties, timer transitions, special charge, adaptation, victory, defeat, pause, and reset behave deterministically.
- Simulator mode completes the same game loop without credentials.
- Tokens never reach the browser or source repository.
- Setup and OBS instructions are understandable from a clean checkout.
- Demo video shows both a Twitch-connected play sequence and Codex use, and is under three minutes.
- Devpost entry is submitted before **November 2, 2026, 10:00 PM London time**.

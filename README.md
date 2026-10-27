# RIFT — Twitch Co-op Boss Battle

RIFT is a stream overlay game where Twitch chat votes together to fight an adaptive boss. The current build contains the playable local simulator, server-authoritative battle rules, streamer controls, and a separate OBS overlay route. Twitch account connection is the next implementation milestone.

## Run locally

Requirements: Node.js 24 LTS and npm.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173` for streamer controls. Open `http://localhost:5173/overlay` as an OBS browser source. The dev server is local-only. Click **Begin encounter**, then use the Attack, Defend, or Riftburst simulator buttons to add 12 distinct viewers to the current round. Votes resolve after 20 seconds; **Resolve the vote** can end a round early.

```powershell
npm run typecheck
npm run build
npm start
```

The production server serves the built client and API from port 3000. The match is stored in memory and resets when the server process restarts.

## How the game works

- One vote per viewer ID per round. Simulator voters use unique namespaced IDs; Twitch integration will use Twitch user IDs.
- The most popular action resolves the round. Ties follow a rotating, deterministic priority.
- Special votes fill the shared Riftburst meter. A charged special deals extra damage.
- After each round, the boss reacts to repeated crowd choices using a fixed rules table. No AI output controls damage or game state.
- A quiet round causes no damage to either side.
- The fight lasts up to five rounds, ending earlier when the boss or raid health reaches zero.

## Architecture

The Node server owns game state and timers. Simulator and Twitch chat will both submit the same validated `ChatCommand` shape to the engine. Socket.IO broadcasts snapshots to the studio and read-only overlay. The browser never owns authoritative vote counts or game rules.

```text
server/src/game/     game state, deterministic rules, timers
server/src/chat/     chat command parser and Twitch adapter
server/src/demo/     local crowd simulator
server/src/http/     control and snapshot API
client/src/          streamer studio and OBS overlay
docs/plans/          implementation milestones
```

## Twitch setup

Not implemented yet. The planned integration uses Twitch OAuth and EventSub chat messages. No Twitch tokens or app credentials are needed for the local simulator. Do not commit Twitch secrets when integration is added.

## Current limitations

- Twitch OAuth/EventSub and optional AI narration are not connected yet.
- Match state is in memory; refreshing a browser is safe, restarting the server resets the match.
- The controls and overlay are an initial visual pass and still need review at stream and mobile sizes.

## Hackathon delivery

The official submission requires a Twitch-connected project built with Codex, a repository and setup instructions, a project description, the Codex session ID, and a public YouTube demo under three minutes showing the project on Twitch and how Codex was used. The published deadline is **November 2, 2026, 10:00 PM London time**. See the [official rules](https://twitchcon-codex.devpost.com/rules).

# RIFT — Twitch Co-op Boss Battle

RIFT is a stream overlay game where Twitch chat votes together to fight an adaptive boss. The current build contains a playable local simulator, server-authoritative battle rules, streamer controls, a read-only OBS overlay, Twitch OAuth and EventSub chat integration, and optional post-round AI narration.

## Run locally

Requirements: Node.js 24 LTS and npm.

```powershell
npm install
npm run dev
```

Open `http://localhost:5173` for streamer controls. Open `http://localhost:5173/overlay` as an OBS browser source. The dev server is local-only. Click **Begin encounter**, then use the Attack, Defend, or Riftburst simulator buttons to add 12 distinct viewers to the current round. Votes resolve after 20 seconds; **Resolve the vote** can end a round early.

### Add the overlay to OBS

1. In OBS, add a **Browser** source to the scene used for the stream.
2. Set its URL to `http://localhost:5173/overlay`, width to `1920`, and height to `1080`.
3. Keep the RIFT server running while streaming. The overlay reconnects to the local server if its Socket.IO connection drops.
4. Keep the streamer studio on your desktop at `http://localhost:5173`; use it to start, pause, resolve, and reset the encounter.
5. For a live demo, connect Twitch in the studio and confirm **CONNECTED**. Send commands from a second Twitch account in the authorized channel; messages from the broadcaster account are intentionally ignored. For rehearsal, keep Twitch disconnected and use the simulator buttons.

### Quick demo path

1. Begin the encounter and send an Attack wave. Resolve it.
2. Send another Attack wave in the next round. Resolve it to show the Warden adapt to repeated aggression.
3. Send a Riftburst wave. Its shared charge and damage payoff should be visible in the round result.
4. Repeat Riftburst if needed to finish the Warden, then show the battle feed and reset control.

For a live chat demo, connect your authorized channel and have another account send those commands in chat. Keep the simulator disconnected while showing real votes.

```powershell
npm run typecheck
npm run build
npm start
```

The production server serves the built client and API from port 3000. The match is stored in memory and resets when the server process restarts.

### Judge mode (no credentials required)

The local simulator works without Twitch or OpenAI keys. From a clean checkout, run `npm install`, `npm test`, `npm run typecheck`, `npm run build`, then `npm start`. Open `http://localhost:3000` and use the simulator controls; the overlay is at `http://localhost:3000/overlay`. Judges can run and evaluate the game loop without authorizing an account.

`npm start` sets `NODE_ENV=production` and serves both the studio and API from port 3000. The OAuth return URL defaults to that same port. If you change `PORT`, set `TWITCH_REDIRECT_URI` to `http://localhost:<port>/api/auth/twitch/callback`. For a deployed host, set `APP_BASE_URL` and `TWITCH_REDIRECT_URI` to the configured HTTPS domain and register the same callback in Twitch.

## How the game works

- One vote per viewer ID per round. Simulator voters use unique namespaced IDs; Twitch votes use stable Twitch user IDs. Messages from the authorized broadcaster account are ignored.
- The most popular action resolves the round. Ties follow a rotating, deterministic priority.
- Special votes fill the shared Riftburst meter. A charged special deals extra damage.
- After each round, the boss reacts to repeated crowd choices using a fixed rules table. No AI output controls damage or game state.
- At the end of a battle, the studio shows a shareable recap with aggregate votes, damage, Riftbursts, and adaptations. Copy it to share; it contains no viewer identities.
- Warden health scales with distinct viewers who join the raid: 36 health for one viewer, rising to the 120-health baseline at 12 viewers. An adaptive Warden counter can wipe an uncoordinated raid before round five.
- A quiet round causes no damage to either side.
- The fight lasts up to five rounds, ending earlier when the boss or raid health reaches zero.

## Architecture

The Node server owns game state and timers. Simulator and Twitch chat both submit the same validated `ChatCommand` shape to the engine. Socket.IO broadcasts snapshots to the studio and read-only overlay. The browser never owns authoritative vote counts or game rules.

```text
server/src/game/     game state, deterministic rules, timers
server/src/chat/     chat command parser and Twitch adapter
server/src/demo/     local crowd simulator
server/src/http/     control and snapshot API
client/src/          streamer studio and OBS overlay
docs/plans/          implementation milestones
```

## Twitch setup

The OAuth and EventSub connection is implemented. To use live chat:

1. Create a Twitch Developer application and set its OAuth Redirect URL to `http://localhost:3000/api/auth/twitch/callback`.
2. Copy `.env.example` to `.env`; set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Keep `.env` private.
3. Keep `TWITCH_REDIRECT_URI` exactly matched to the Twitch application setting. Leave `APP_BASE_URL` blank for local defaults: `npm run dev` uses port 5173 and `npm start` uses port 3000.
4. Start the app with `npm run dev`, open the studio, and choose **Connect** in the Twitch Chat panel. Authorize `user:read:chat` for the account whose channel will host the battle.
5. In the studio, confirm the chat state reads **CONNECTED**. From a second Twitch account, send `!attack`, `!defend`, or `!special` in that channel while a round is open. The authorized broadcaster's own messages are ignored.

RIFT subscribes to `channel.chat.message` through Twitch EventSub WebSocket and reads the authorized account's own channel. The access token and refresh token stay in server memory; they are not sent to the browser or written to disk. Restarting the server clears the local authorization, so connect again afterward. **Disconnect** revokes the token with Twitch and returns the game to simulator mode.

If the account authorizes successfully but chat does not connect, check the exact redirect URI and the EventSub status in the studio, then choose **Retry**. The simulator remains available without Twitch credentials.

The production HTTP smoke check and local simulator do not replace a real-channel rehearsal. Before recording, authorize the intended Twitch channel and confirm that at least one real chat command increments the matching vote on the overlay.

## Optional AI narration

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` to enable one short narrator line after a round. RIFT sends only the fixed boss/event context, winning action, and aggregate vote counts to the OpenAI Responses API. Chat messages and viewer identities are not sent. The model cannot select or change game effects; on timeout, invalid output, missing key, or API error, the fixed event explanation remains in place. `OPENAI_MODEL` defaults to `gpt-5-mini` and can be changed to another Responses API model available to your account.

## Current limitations

- Live Twitch and optional AI narration still need to be exercised with your own credentials and channel before recording the final demo.
- Match state is in memory; refreshing a browser is safe, restarting the server resets the match.
- The controls and overlay are an initial visual pass and still need review at stream and mobile sizes.

## Hackathon delivery

The official submission requires a Twitch-connected project built with Codex, a repository and setup instructions, a project description, the Codex session ID, and a public YouTube demo under three minutes showing the project on Twitch and how Codex was used. The published deadline is **November 2, 2026, 10:00 PM London time**. See the [official rules](https://twitchcon-codex.devpost.com/rules).

The [submission draft and timed demo outline](docs/submission/draft.md) are ready to use after the live Twitch rehearsal and recording. Run `npm test`, `npm run typecheck`, and `npm run build` before recording. The local simulator is available for judging without credentials. The application is local-only by default; do not expose the OAuth control server publicly without adding production session/authentication protections.

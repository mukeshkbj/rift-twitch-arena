# RIFT Submission Draft

Keep this draft honest to the final build and demo. Replace the bracketed values before submission.

## Project title

RIFT — A Twitch Chat Co-op Boss Battle

## One-line pitch

Turn a Twitch chat into one raid party: the crowd fights a boss together, and repeated tactics make the boss adapt.

## Project description

RIFT makes Twitch chat part of the game. Viewers type `!attack`, `!defend`, or `!special`; the server counts one vote per viewer each round and resolves the winning move in a shared boss battle. A special meter rewards coordinated timing, while repeated crowd choices trigger a visible, rules-based boss counter. Every round shows the vote, the effect, and why the Warden changed its stance.

Streamers control the encounter from a compact studio panel and add the overlay to OBS as a browser source. A local simulator supports setup and rehearsal; live mode reads commands from the broadcaster’s authorized Twitch channel through EventSub. Optional OpenAI narration adds a short line of flavor after a round, while the deterministic game engine retains control of all effects and outcomes.

RIFT was built with OpenAI Codex. Codex helped shape the game loop and data boundaries, scaffold the TypeScript client/server, implement the vote engine and Twitch integration, and prepare the demo and setup guide. Update this paragraph to match the actual Codex work shown in the submitted video.

## Features

- Real Twitch chat commands: `!attack`, `!defend`, `!special`.
- One vote per stable viewer ID per round.
- Deterministic vote resolution, tie rotation, health, timer, and match result.
- Shared special charge and an adaptive boss driven by recent crowd choices.
- Streamer controls, connection state, battle feed, and a read-only OBS overlay.
- Simulator mode for rehearsal when Twitch is disconnected.
- Optional, bounded AI narration; game mechanics continue unchanged if it is disabled or unavailable.

## How to run

See the repository README for Node.js requirements, local launch, Twitch app registration, OAuth redirect URI, OBS setup, and optional AI configuration.

## Codex session ID

`[Get this value with /status in the Codex session used to build RIFT.]`

## Repository and video

- Repository: `[public or judge-accessible repository URL]`
- YouTube demo: `[public or unlisted video URL, under 3 minutes]`

## Demo video outline (target: 2:50)

| Time | Show | Narration |
|---|---|---|
| 0:00–0:15 | Full RIFT overlay, then Twitch chat beside it | “RIFT turns a Twitch chat into a co-op raid. Every viewer chooses one move each round.” |
| 0:15–0:50 | Start a live encounter; type commands from several real viewer accounts or a pre-arranged test group | “Attack, defend, or charge a special. The overlay updates from live chat.” |
| 0:50–1:20 | Resolve a vote and show the damage and round result | “The server resolves the crowd’s move, limits each viewer to one vote, and shows the result immediately.” |
| 1:20–1:50 | Repeat one tactic, then reveal the boss counter and explanation | “The Warden tracks recent group choices and answers repeated strategies with a fixed, explainable counter.” |
| 1:50–2:10 | Show the special charge/payoff and streamer pause/reset controls | “The streamer keeps control, and coordinated special votes build a shared payoff.” |
| 2:10–2:40 | Show Codex working in this project: a real code change, terminal build, or architecture view | “Codex helped build the TypeScript game engine, Twitch connection, and overlay. The rules stay deterministic; optional AI only adds narration.” |
| 2:40–2:50 | Return to the full arena and show the project title | “RIFT: the crowd fights as one.” |

## Recording notes

- Show the project functioning with real Twitch chat; simulator footage alone does not satisfy the demo requirement.
- Show the Codex session used to build the project. Keep any API secrets, OAuth tokens, and private account details off-screen.
- Keep the upload under three minutes and use public or unlisted visibility.
- Use original or properly licensed visual/audio assets. Follow the current [official hackathon rules](https://twitchcon-codex.devpost.com/rules) for trademarks and copyrighted material.

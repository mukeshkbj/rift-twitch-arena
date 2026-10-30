# RIFT Submission Draft

Keep this draft honest to the final build and demo. Replace the bracketed values before submission.

## Project title

RIFT — A Twitch Chat Co-op Boss Battle

## One-line pitch

Fight a boss that learns a Twitch chat's tactics and changes how it fights back.

## Project description

RIFT makes Twitch chat part of the game. Viewers type `!attack`, `!defend`, or `!special`; the server counts one vote per viewer each round and resolves the winning move in a shared boss battle. A special meter rewards coordinated timing, while repeated crowd choices trigger a visible, rules-based boss counter. Every round shows the vote, the effect, and why the Warden changed its stance.

Streamers control the encounter from a compact studio panel and add the overlay to OBS as a browser source. A local simulator supports setup and rehearsal; live mode reads commands from the broadcaster’s authorized Twitch channel through EventSub. The server resolves the votes, health, timers, and outcomes. After the fight, RIFT creates a shareable recap from aggregate match stats without viewer identities.

RIFT was built with OpenAI Codex. Codex helped shape the deterministic game loop, implement the adaptive Warden and Twitch EventSub integration, build the streamer studio and OBS overlay, and add tests for voting, match outcomes, authentication, and recap behavior. The submitted Codex clip will show a concrete scheduler fix and its passing verification.

## Features

- Real Twitch chat commands: `!attack`, `!defend`, `!special`.
- One vote per stable viewer ID per round.
- Deterministic vote resolution, tie rotation, health, timer, and match result.
- Shared special charge and an adaptive boss driven by recent crowd choices.
- Streamer controls, connection state, battle feed, and a read-only OBS overlay.
- Simulator mode for rehearsal when Twitch is disconnected.
- Copyable end-of-battle recap with outcome, votes, damage, Riftbursts, and Warden adaptations.

## How to run

See the repository README for Node.js requirements, local launch, Twitch app registration, OAuth redirect URI, OBS setup, and optional AI configuration.

## Codex session ID

`01a17dd6-4c64-7113-9f49-662ea1494756`

## Repository and video

- Repository: [https://github.com/mukeshkbj/rift-twitch-arena](https://github.com/mukeshkbj/rift-twitch-arena)
- YouTube demo: `[add the public URL after inserting the real Twitch and Codex clips and uploading the final video]`

## Demo video outline (target: 2:55)

| Time | Show | Narration |
|---|---|---|
| 0:00–0:15 | Full RIFT overlay, then Twitch chat beside it | “RIFT turns a Twitch chat into a co-op raid. Every viewer chooses one move each round.” |
| 0:15–0:50 | Start a live encounter; type commands from several real viewer accounts or a pre-arranged test group | “Attack, defend, or charge a special. The overlay updates from live chat.” |
| 0:50–1:20 | Resolve a vote and show the damage and round result | “The server resolves the crowd’s move, limits each viewer to one vote, and shows the result immediately.” |
| 1:20–1:50 | Repeat one tactic, then reveal the boss counter and explanation | “The Warden tracks recent group choices and answers repeated strategies with a fixed, explainable counter.” |
| 1:50–2:10 | Show the special charge/payoff and streamer pause/reset controls | “The streamer keeps control, and coordinated special votes build a shared payoff.” |
| 2:10–2:25 | Show the end-of-fight recap and copy action | “RIFT captures the result and crowd strategy in a recap with aggregate stats, ready to share.” |
| 2:25–2:42 | Show the Codex session, the scheduler change, and passing tests/build | “Codex helped make each round timer stable through live updates, and verified the change with the project checks.” |
| 2:42–2:55 | Return to the full arena and show the project title | “RIFT: the crowd fights as one.” |

## Recording notes

- Show the project functioning with real Twitch chat; simulator footage alone does not satisfy the demo requirement. Use another Twitch account to send commands because broadcaster messages are ignored.
- Show the Codex session used to build the project. Keep any API secrets, OAuth tokens, and private account details off-screen.
- Keep the upload under three minutes and set its YouTube visibility to public.
- Use original or properly licensed visual/audio assets. Follow the current [official hackathon rules](https://twitchcon-codex.devpost.com/rules) for trademarks and copyrighted material.

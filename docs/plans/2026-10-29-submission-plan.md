# RIFT Hackathon Submission Plan

**Goal:** Submit a complete, accurate RIFT entry to the Codex x TwitchCon Hackathon before the November 2, 2026 deadline.

**Deadline:** November 2, 2026 at 2:00 PM Pacific, which is 10:00 PM London time. Target submission by 6:00 PM London to leave a four-hour buffer.

**Current state (October 30):** Commit `184ed43` is pushed to `origin/main`. It removes optional AI narration, keeps match-wide viewer health scaling, and preserves resolve/intermission timers through unrelated updates. `npm test` passes (23 tests), and typecheck and production build pass. `submission-assets/` is ignored. The submission draft has the repository URL and Codex session ID; the public YouTube URL is still pending because the real Twitch-chat and Codex clips are not recorded yet.

## Work plan

### 1. Freeze and verify the candidate build — October 29

- Keep narration out of the product and submission; the Warden's rules-based explanation is the complete flavor path and requires no model key.
- Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` after the final code changes. Resolve failures before recording.
- Commit the candidate changes and push them to `origin/main`. Confirm `git status --short` is empty and `git ls-remote origin refs/heads/main` matches local `HEAD`.

### 2. Rehearse the live Twitch path — October 30

- Restart RIFT so the running process loads the current code. Twitch authorization may need to be renewed after a server restart.
- Confirm the studio reports Twitch chat connected. Open `/overlay` in a second window.
- From a second Twitch account in the authorized channel, test `!attack`, `!defend`, and `!special` during a live round. Confirm each vote appears in the studio and overlay, resolve the round, and show the Warden adapting after repeated attacks.
- Complete one full encounter and show the battle recap. Test pause/resume and reset once.
- Record a short backup simulator run. Use it only for setup or fallback; the final video must show the project functioning with real Twitch chat.

### 3. Record and publish the demonstration — October 31

- Capture a clean run with the stream overlay, real Twitch chat beside it, and the Codex session visible for a real project change or implementation view.
- Keep the video between roughly 2:40 and 2:55 so it remains below the strict three-minute limit after editing.
- Show: the project pitch, real chat votes, a resolved round, an adaptation, a Riftburst, streamer controls, the end recap, and evidence of Codex use.
- Keep API keys, OAuth tokens, private account details, unrelated third-party marks, and copyrighted music out of the recording.
- Upload to YouTube and set visibility to **Public**. Watch the full upload and verify audio, overlays, and duration before copying its URL.

### 4. Finalize the Devpost content — November 1

- Keep `docs/submission/draft.md` consistent with the rules-based build and actual footage.
- Verify the Codex session ID for the thread where RIFT was built with `/status` before entering it in Devpost.
- Add the public YouTube URL. Keep the repository URL as `https://github.com/mukeshkbj/rift-twitch-arena`.
- Confirm the repository contains source, assets, and setup instructions. Keep it accessible to judges through the end of judging; the rules allow public or private GitHub/GitLab/Bitbucket repositories, with private GitHub/GitLab repositories shared with Devpost as specified in the rules.
- Confirm the run instructions work from a clean checkout using the simulator without Twitch credentials.

### 5. Submit with a buffer — November 2

- By 12:00 PM London, check the Devpost form fields, repository and video links, Codex session ID, spelling, and project description against the official requirements.
- Submit by 6:00 PM London rather than waiting for the 10:00 PM London cutoff.
- Reopen the submitted entry and confirm it is recorded. Save a screenshot or confirmation for your records.

## Submission checklist

- [ ] Working Twitch-connected project, shown using real chat in the video.
- [ ] Repository URL with source code, assets, and run instructions.
- [ ] Text description covers project behavior and how Codex was used.
- [ ] Correct Codex session ID for the build thread.
- [ ] Public YouTube demonstration video, less than three minutes, showing Twitch and Codex.
- [ ] Video has no unlicensed copyrighted material and no exposed secrets.
- [ ] Devpost entry submitted before November 2, 2026, 10:00 PM London time.

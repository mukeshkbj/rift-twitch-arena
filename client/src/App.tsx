import { useEffect, useMemo, useState } from "react";
import { control, gameSocket } from "./api/socket.js";
import type { Action, BattleSummary, GameSnapshot } from "./types.js";

interface TwitchAuthStatus {
  configured: boolean;
  connected: boolean;
  login: string | null;
  scope: string | null;
  chatStatus: "disconnected" | "connecting" | "connected" | "error";
}

const actionMeta: Record<Action, { label: string; command: string; icon: string; description: string }> = {
  attack: { label: "Attack", command: "!attack", icon: "↗", description: "Strike hard. Take a full hit back." },
  defend: { label: "Defend", command: "!defend", icon: "⬡", description: "Deal light damage. Reduce the hit back." },
  special: { label: "Riftburst", command: "!special", icon: "✳", description: "Charge together. Unleash a stronger strike." },
};

function tacticalAdvice(game: GameSnapshot): string {
  switch (game.adaptation?.eventId) {
    case "iron-bloom": return "Attack deals 6 less damage this round. Switch tactics to work around the armor.";
    case "sunder-pulse": return "The next hit is heavier. Defend still reduces the damage your raid takes.";
    case "rift-static": return "Riftburst deals 7 less damage this round. Consider a different tactic.";
    default: return "Repeat a winning tactic twice in three rounds and the Warden builds a counter.";
  }
}

function percent(value: number, max: number): number {
  return max === 0 ? 0 : Math.round((value / max) * 100);
}

function phaseLabel(snapshot: GameSnapshot): string {
  if (snapshot.paused) return "Paused";
  return {
    lobby: "Awaiting raid lead",
    voting: "Chat is deciding",
    resolving: "Resolving the vote",
    intermission: "The Warden adapts",
    victory: "Breach sealed",
    defeat: "Raid wiped",
  }[snapshot.phase];
}

function formatBattleSummary(bossName: string, summary: BattleSummary): string {
  const rounds = `${summary.rounds} ${summary.rounds === 1 ? "round" : "rounds"}`;
  const actionVotes = `Attack ${summary.votesByAction.attack} · Defend ${summary.votesByAction.defend} · Riftburst ${summary.votesByAction.special}`;
  const result = summary.outcome === "victory" ? `${bossName} defeated` : `${bossName} held the breach`;
  const roundLines = summary.roundLog.map((round) => {
    const action = round.action ? `${round.action === "special" ? "Riftburst" : round.action[0]!.toUpperCase() + round.action.slice(1)} (${round.votesByAction[round.action]} votes)` : "No votes";
    const counter = round.bossCounter ? ` · Countered by ${round.bossCounter}` : "";
    const next = round.nextAdaptation ? ` · Warden adapts: ${round.nextAdaptation}` : "";
    const burst = round.specialBurst ? " · Charged burst" : "";
    return `R${round.round} ${action} · Warden −${round.bossDamage} · raid −${round.raidDamage}${burst}${counter}${next}`;
  });
  return [
    `RIFT — ${result}`,
    `${rounds} · ${summary.totalVotes} votes · ${summary.bossDamage} Warden damage · ${summary.raidDamage} raid damage`,
    `Votes: ${actionVotes}`,
    `Charged Riftbursts: ${summary.specialBursts}`,
    ...roundLines,
    "The crowd fights as one.",
  ].join("\n");
}

export function App() {
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [twitch, setTwitch] = useState<TwitchAuthStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summaryCopyStatus, setSummaryCopyStatus] = useState("");
  const [resetArmed, setResetArmed] = useState(false);
  const isOverlay = window.location.pathname === "/overlay";

  useEffect(() => {
    let active = true;
    control<GameSnapshot>("game").then((snapshot) => { if (active) setGame(snapshot); }).catch((reason: Error) => setError(reason.message));
    control<TwitchAuthStatus>("auth/twitch/status").then((status) => { if (active) setTwitch(status); }).catch(() => undefined);
    const update = (snapshot: GameSnapshot) => setGame(snapshot);
    gameSocket.on("game:snapshot", update);
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => {
      active = false;
      gameSocket.off("game:snapshot", update);
      window.clearInterval(timer);
    };
  }, []);

  const remainingMs = useMemo(() => {
    if (!game) return 0;
    if (game.paused) return game.remainingMs;
    if (game.deadlineAt === null) return game.remainingMs;
    return Math.max(0, game.deadlineAt - now);
  }, [game, now]);

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    setSummaryCopyStatus("");
    setResetArmed(false);
    try {
      const result = await control<GameSnapshot | { snapshot: GameSnapshot }>(path, body, "POST");
      setGame("snapshot" in result ? result.snapshot : result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function runTwitch(path: string) {
    setBusy(true);
    setError("");
    try {
      await control(path, undefined, "POST");
      setTwitch(await control<TwitchAuthStatus>("auth/twitch/status"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the Twitch connection.");
    } finally {
      setBusy(false);
    }
  }

  async function copyBattleSummary(bossName: string, summary: BattleSummary) {
    const text = formatBattleSummary(bossName, summary);
    try {
      await navigator.clipboard.writeText(text);
      setSummaryCopyStatus("Battle summary copied.");
    } catch {
      setSummaryCopyStatus("Clipboard unavailable. Select the recap text to copy it.");
    }
  }

  if (!game) {
    return <main className="loading-screen"><span className="rift-mark">R</span><p>{error ? "The raid could not load." : "Opening the breach…"}</p>{error && <><p className="error-note">{error}</p><button className="button-secondary" onClick={() => window.location.reload()}>Retry connection</button></>}</main>;
  }

  const timeSeconds = Math.ceil(remainingMs / 1000);
  const timePct = Math.max(0, Math.min(100, (remainingMs / game.voteDurationMs) * 100));
  const isVoting = game.phase === "voting" && !game.paused;
  const nextStep = game.paused ? "Voting is paused. Resume when your chat is ready." : game.phase === "lobby" ? "Begin the encounter to open the first voting round." : game.phase === "resolving" ? "Votes are locked. The raid’s move is resolving." : game.phase === "intermission" ? "Read the Warden’s response. The next round starts automatically." : game.summary ? "Review the raid below, copy the recap, or start another encounter." : game.totalVoters === 0 ? (game.input.mode === "twitch" ? "Waiting for viewer commands in Twitch chat. Each viewer gets one vote per round." : "Try the fight: add a simulated vote wave from the raid controls.") : `${game.totalVoters} ${game.totalVoters === 1 ? "viewer has" : "viewers have"} voted. The leading tactic resolves when the timer ends.`;

  return (
    <main className={`app-shell phase-${game.phase} ${isOverlay ? "overlay-shell" : ""}`}>
      {!isOverlay && <header className="topbar">
        <a className="wordmark" href="/" aria-label="RIFT studio home"><span className="wordmark-icon">R</span><span>RIFT<span className="wordmark-separator">/</span>RAID CONTROL</span></a>
        <div className="topbar-right">
          <span className="mode-label"><span className="live-dot" /> {game.input.mode === "twitch" ? `TWITCH · ${twitch?.login ?? "CONNECTED"}` : "LOCAL SIMULATOR"}</span>
          <a className="overlay-link" href="/overlay" target="_blank" rel="noreferrer">Open stream overlay <span aria-hidden="true">↗</span></a>
          <div className={`socket-status ${gameSocket.connected ? "is-online" : ""}`}><span className="socket-dot" />{gameSocket.connected ? "SYNCED" : "RECONNECTING"}</div>
        </div>
      </header>}

      <div className="studio-layout">
        <section className="arena-column" aria-label="Live game preview">
          <div className="arena-headline">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> CO-OP RAID <span className="eyebrow-index">{String(game.round).padStart(2, "0")} / {String(game.roundLimit).padStart(2, "0")}</span></p>
              <h1>One chat. One <em>raid.</em></h1>
              <p className="arena-intro">Your tactics shape the fight. The Warden learns them.</p>
            </div>
            <div className={`phase-chip phase-${game.phase}`}><span className="phase-pip" />{phaseLabel(game)}</div>
          </div>


          <section className="arena-frame" aria-label="The Hollow Warden encounter">
            <div className="arena-meta"><span>SECTOR 07 <b>·</b> THE ASHEN RIFT</span><span>ENCOUNTER {String(Math.max(1, game.round)).padStart(2, "0")}</span></div>
            <div className={`arena-stage ${game.roundResult?.specialBurst ? "stage-burst" : ""}`}>
              <div className="stage-grid" aria-hidden="true" />
              <div className="rift-orbit orbit-one" aria-hidden="true" /><div className="rift-orbit orbit-two" aria-hidden="true" />
              <div className={`warden-art ${game.phase === "resolving" ? "warden-strike" : ""}`} aria-label="Stylized illustration of the Hollow Warden" role="img">
                <img className="warden-portrait" src="/art/hollow-warden.png" alt="" width="1024" height="1024" onLoad={(event) => event.currentTarget.parentElement?.classList.add("portrait-loaded")} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                <div className="warden-halo" /><div className="warden-core"><span className="warden-eye" /><span className="warden-slit" /></div>
                <span className="warden-shard shard-left" /><span className="warden-shard shard-right" />
              </div>
              <div className="stage-caption"><span className="caption-rule" /><span>THE HOLLOW WARDEN</span><span className="caption-rule" /></div>
              <div className="arena-stamp">HOLLOW<br />WARDEN</div>
              <div className="boss-health-block">
                <div className="health-heading"><span>WARDEN INTEGRITY</span><strong>{game.boss.health}<small> / {game.boss.maxHealth}</small></strong></div>
                <div className="health-track boss-track"><span style={{ width: `${percent(game.boss.health, game.boss.maxHealth)}%` }} /></div>
              </div>
              <div className="crowd-health-block">
                <div className="health-heading"><span>RAID VITALS</span><strong>{game.crowd.health}<small> / {game.crowd.maxHealth}</small></strong></div>
                <div className="health-track crowd-track"><span style={{ width: `${percent(game.crowd.health, game.crowd.maxHealth)}%` }} /></div>
              </div>
              <div className={`timer-ring ${timeSeconds <= 5 && isVoting ? "is-urgent" : ""}`} style={{ "--timer-progress": `${timePct}%` } as React.CSSProperties} aria-label={`${timeSeconds} seconds remaining`}>
                <span className="timer-kicker">VOTE IN</span><strong>{String(timeSeconds).padStart(2, "0")}</strong><span className="timer-unit">SEC</span>
              </div>
              <div className="arena-status"><span className="status-wave">〰</span><span>{isVoting ? "YOUR CHAT HAS THE FLOOR" : phaseLabel(game).toUpperCase()}</span></div>
              {(game.phase === "intermission" || game.summary) && game.roundResult && <div className="combat-result" key={`${game.matchId}-${game.roundResult.round}`} aria-live="polite">
                <span>{game.summary ? (game.summary.outcome === "victory" ? "BREACH SEALED" : "RAID ENDED") : `ROUND ${game.roundResult.round} RESOLVED`}</span>
                <strong>{game.roundResult.specialBurst ? "Riftburst unleashed" : game.roundResult.action ? `${actionMeta[game.roundResult.action].label} lands` : "No votes cast"}</strong>
                <p>Warden −{game.roundResult.bossDamage} <span> / </span> Raid −{game.roundResult.raidDamage}</p>
              </div>}
            </div>
            <div className="arena-foot"><span>{game.input.mode === "twitch" ? "TWITCH CHAT" : "SIMULATOR"}</span><span>ONE VOTE PER VIEWER</span><span>ROUND <b>{game.round} / {game.roundLimit}</b></span></div>
          </section>

          <section className="warden-response" aria-label="Current Warden adaptation" aria-live="polite">
            <div><span>THE WARDEN IS LEARNING</span><strong>{game.adaptation?.title ?? "Watching your next move"}</strong></div>
            <div className="response-explanation"><p className="tactical-advice">{tacticalAdvice(game)}</p></div>
          </section>

          <section className="vote-console" aria-label="Live audience votes">
            <div className="section-heading"><div><h2>Choose your move</h2></div><span className="vote-count">{game.totalVoters} <small>VOTERS</small></span></div>
            <div className="vote-options">
              {(Object.keys(actionMeta) as Action[]).map((action) => {
                const meta = actionMeta[action];
                const votes = game.votes[action];
                const share = game.totalVoters ? Math.round((votes / game.totalVoters) * 100) : 0;
                return <div className={`vote-option vote-${action} ${game.winningAction === action ? "vote-winner" : ""}`} key={action}>
                  <span className="vote-icon" aria-hidden="true">{meta.icon}</span>
                  <div className="vote-info"><div className="vote-name-line"><strong>{meta.label}</strong><code>{meta.command}</code></div><div className="vote-track" role="meter" aria-label={`${meta.label} vote share`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={share}><span style={{ width: `${share}%` }} /></div><p className="tactic-description">{meta.description}</p></div>
                  <div className="vote-numbers"><strong>{votes}</strong><span>{share}%</span></div>
                </div>;
              })}
            </div>
            <div className="charge-row"><div className="charge-copy"><span className="charge-symbol">✳</span><span><strong>{game.crowd.specialCharge >= game.crowd.specialThreshold ? "RIFTBURST READY" : "RIFTBURST CHARGE"}</strong><small>{game.crowd.specialCharge >= game.crowd.specialThreshold ? "Win with !special to unleash it" : `${game.crowd.specialCharge} of ${game.crowd.specialThreshold} special votes to charge`}</small></span></div><div className="charge-pips" aria-label={`${game.crowd.specialCharge} of ${game.crowd.specialThreshold} charge`}>
              {Array.from({ length: game.crowd.specialThreshold }, (_, index) => <span className={index < game.crowd.specialCharge ? "charged" : ""} key={index} />)}
            </div></div>
          </section>
          {!isOverlay && <p className="vote-guidance">{game.input.mode === "twitch" ? <>Type a command in {twitch?.login ? <a href={`https://www.twitch.tv/${encodeURIComponent(twitch.login)}/chat`} target="_blank" rel="noreferrer">@{twitch.login}’s Twitch chat ↗</a> : "Twitch chat"}. Broadcaster commands are ignored.</> : "Simulator mode: use the vote wave buttons to try each tactic. Connect Twitch for real viewer votes."} First vote counts; extra commands in the same round are ignored.</p>}
          <div className="raid-progress" aria-label="Raid round progress">{Array.from({ length: game.roundLimit }, (_, index) => <span key={index} className={index + 1 === game.round ? "round-current" : index + 1 < game.round ? "round-complete" : ""}><b>{String(index + 1).padStart(2, "0")}</b>{index + 1 === game.round ? "Current round" : index + 1 < game.round ? "Resolved" : "Upcoming"}</span>)}</div>
          {!isOverlay && game.summary && <section className={`match-recap recap-${game.summary.outcome}`} aria-labelledby="match-recap-title">
            <div className="recap-heading"><div><span>RAID COMPLETE</span><h2 id="match-recap-title">{game.summary.outcome === "victory" ? "The breach is sealed." : "The Warden held the breach."}</h2></div><button className="summary-copy-button" onClick={() => void copyBattleSummary(game.boss.name, game.summary!)}>Copy battle summary</button></div>
            <dl className="recap-stats"><div><dt>Votes cast</dt><dd>{game.summary.totalVotes}</dd></div><div><dt>Warden damage</dt><dd>{game.summary.bossDamage}</dd></div><div><dt>Raid damage</dt><dd>{game.summary.raidDamage}</dd></div><div><dt>Charged bursts</dt><dd>{game.summary.specialBursts}</dd></div></dl>
            <ol className="recap-rounds">{game.summary.roundLog.map(round => <li key={round.round}><span>R{round.round}</span><strong>{round.action ? actionMeta[round.action].label : "No votes"}{round.specialBurst ? " / charged" : ""}</strong><span>Warden −{round.bossDamage} / Raid −{round.raidDamage}</span><small>{round.nextAdaptation ? `Learned ${round.nextAdaptation}` : round.bossCounter ? `Counter: ${round.bossCounter}` : round.round === game.summary!.rounds ? "Encounter ended" : "No counter active"}</small></li>)}</ol>
            <details className="recap-text"><summary>Full text recap</summary><h3 id="battle-summary-title">Battle summary</h3><p className="battle-summary-text">{formatBattleSummary(game.boss.name, game.summary)}</p></details>
            <p className="summary-copy-status" role="status">{summaryCopyStatus}</p>
          </section>}
          {isOverlay && <div className="overlay-story" aria-live="polite">
            {game.phase === "resolving" && <section className="overlay-result overlay-resolving">
              <span>ROUND {String(game.round).padStart(2, "0")} · VOTE LOCKED</span>
              <strong>{game.winningAction ? `${actionMeta[game.winningAction].label} is striking` : "The channel was quiet"}</strong>
            </section>}
            {game.phase !== "resolving" && !game.summary && game.roundResult && <section className="overlay-result">
              <span>ROUND {String(game.roundResult.round).padStart(2, "0")} · RESULT</span>
              <strong>{game.roundResult.action ? `${actionMeta[game.roundResult.action].label} wins the vote` : "The channel was quiet"}</strong>
              <p>{game.roundResult.action ? `${game.roundResult.votesByAction[game.roundResult.action]} votes` : "No votes"} · Warden −{game.roundResult.bossDamage} · raid −{game.roundResult.raidDamage}{game.roundResult.specialBurst ? " · CHARGED RIFTBURST" : ""}</p>
            </section>}
            {game.adaptation && !game.summary && <section className="overlay-adaptation">
              <span>WARDEN RESPONSE · {game.adaptation.title}</span>
              <p>{game.adaptation.explanation}</p>
            </section>}
            {game.summary && <section className="overlay-summary">
              <span>RAID RECAP · {game.summary.outcome === "victory" ? "VICTORY" : "DEFEAT"}</span>
              <p>{game.summary.rounds} rounds · {game.summary.totalVotes} votes · {game.summary.bossDamage} Warden damage · {game.summary.raidDamage} raid damage · {game.summary.specialBursts} charged Riftbursts</p>
              <ol>{game.summary.roundLog.map((round) => <li key={round.round}>R{round.round} {round.action ? actionMeta[round.action].label : "Quiet"}{round.nextAdaptation ? ` → ${round.nextAdaptation}` : ""}</li>)}</ol>
            </section>}
            {game.recentLog.length > 1 && <section className="overlay-battle-feed" aria-label="Recent battle feed">
              <span>BATTLE FEED</span>
              <ol>{[...game.recentLog].slice(-3).reverse().map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol>
            </section>}
          </div>}
        </section>

        {!isOverlay && <aside className="control-column" aria-label="Streamer controls">
          <div className="control-card encounter-card">
            <div className="card-label"><span>ENCOUNTER FILE</span><span className="file-stamp">R-07</span></div>
            <h2>THE HOLLOW<br /><em>WARDEN</em></h2>
            <p>A breach-born sentinel. It studies the crowd, then answers with force.</p>
            <div className="encounter-details"><span>ADAPTATION</span><strong>{game.boss.stance}</strong></div>
            {game.adaptation && <>
              <p className="adaptation-copy">{game.adaptation.explanation}</p>
            </>}
          </div>

          <div className="control-card live-controls" id="raid-controls" tabIndex={-1}>
            <div className="card-label"><span>RAID CONTROL</span><span className={`control-phase ${game.phase === "voting" ? "active" : ""}`}><i />{game.paused ? "PAUSED" : game.phase.toUpperCase()}</span></div>
            <div className="primary-actions">
              {game.phase === "lobby" || game.phase === "victory" || game.phase === "defeat" ?
                <button className="button-primary" disabled={busy} onClick={() => void run("control/start")}><span>▶</span> {game.phase === "lobby" ? "Begin encounter" : "Run it back"}</button> :
                <button className="button-primary" disabled={busy || game.phase !== "voting"} onClick={() => void run(game.paused ? "control/resume" : "control/resolve")}><span>{game.paused ? "▶" : "↯"}</span> {busy ? "Updating…" : game.phase === "resolving" ? "Resolving…" : game.phase === "intermission" ? "Next round soon" : game.paused ? "Resume voting" : "Resolve the vote"}</button>}
              {game.phase === "voting" && !game.paused && <button className="button-secondary" disabled={busy} onClick={() => void run("control/pause")}>
                <span>Ⅱ</span>Pause voting
              </button>}
            </div>
            <p className="control-guidance">{nextStep}</p>
            <div className="control-divider" />
            <div className="card-label simulator-label"><span>TWITCH CHAT</span><span className={`twitch-state state-${twitch?.chatStatus ?? "disconnected"}`}><i />{(twitch?.chatStatus ?? "disconnected").toUpperCase()}</span></div>
            <div className="twitch-connect-row">
              <span className="twitch-avatar" aria-hidden="true">T</span>
              <div className="twitch-account-copy">
                <strong>{twitch?.connected ? `@${twitch.login}` : "Your channel"}</strong>
                <small>{twitch?.connected ? "Reading chat as your account" : "Authorize chat access"}</small>
              </div>
              {!twitch?.connected ? (twitch?.configured ? <a className="connect-twitch" href="/api/auth/twitch/start">Connect <span aria-hidden="true">↗</span></a> : <span className="setup-needed">SETUP NEEDED</span>) :
                <div className="twitch-actions">
                  {twitch.chatStatus !== "connected" && <button className="connect-twitch" disabled={busy || twitch.chatStatus === "connecting"} onClick={() => void runTwitch("auth/twitch/reconnect")}>{twitch.chatStatus === "connecting" ? "Connecting…" : "Retry"}</button>}
                  <button className="disconnect-twitch" disabled={busy} onClick={() => void runTwitch("auth/twitch/disconnect")}>Disconnect</button>
                </div>}
            </div>
            {!twitch?.configured && <p className="sim-note twitch-setup-note">Add your Twitch app keys to <code>.env</code> to enable live chat.</p>}
            <div className="control-divider twitch-divider" />
            <div className="card-label simulator-label"><span>SIMULATE CHAT</span><span>12 VIEWERS / WAVE</span></div>
            <div className="sim-actions">
              {(Object.keys(actionMeta) as Action[]).map((action) => <button key={action} className={`sim-button sim-${action}`} disabled={busy || !isVoting || game.input.mode !== "simulator"} onClick={() => void run("control/simulate", { action, count: 12 })}>
                <span>{actionMeta[action].icon}</span><strong>{actionMeta[action].label}<small>12 votes</small></strong><b>+</b>
              </button>)}
            </div>
            <p className="sim-note">Simulator votes are labelled and isolated from real Twitch chat.</p>
            {resetArmed ? <div className="reset-confirm"><p>Discard this raid and return to the lobby?</p><button className="button-secondary" disabled={busy} onClick={() => void run("control/reset")}>Reset raid</button><button className="reset-button" onClick={() => setResetArmed(false)}>Keep playing</button></div> : <button className="reset-button" disabled={busy || game.phase === "lobby"} onClick={() => setResetArmed(true)}>↺ <span>Reset encounter</span></button>}
            {error && <p className="error-note" role="alert">{error}</p>}
          </div>

          <div className="control-card battle-log-card">
            <div className="card-label"><span>BATTLE FEED</span><span className="feed-count">{String(game.recentLog.length).padStart(2, "0")}</span></div>
            <ol className="battle-log">{[...game.recentLog].reverse().map((entry) => <li className={`log-${entry.kind}`} key={entry.id}><span className="log-mark" />{entry.text}</li>)}</ol>
          </div>
          <footer className="control-footer"><span>RIFT SYSTEMS</span><span>BUILD 0.1 · LOCAL DEMO</span></footer>
        </aside>}
      </div>
      {isOverlay && <div className="overlay-chat-prompt"><span>YOUR CHAT, YOUR MOVE</span>{(Object.keys(actionMeta) as Action[]).map((action) => <code key={action}>{actionMeta[action].command}</code>)}</div>}
    </main>
  );
}

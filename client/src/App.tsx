import { useEffect, useMemo, useState } from "react";
import { control, gameSocket } from "./api/socket.js";
import type { Action, GameSnapshot } from "./types.js";

const actionMeta: Record<Action, { label: string; command: string; icon: string }> = {
  attack: { label: "Attack", command: "!attack", icon: "↗" },
  defend: { label: "Defend", command: "!defend", icon: "⬡" },
  special: { label: "Riftburst", command: "!special", icon: "✳" },
};

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

export function App() {
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isOverlay = window.location.pathname === "/overlay";

  useEffect(() => {
    let active = true;
    control<GameSnapshot>("game").then((snapshot) => { if (active) setGame(snapshot); }).catch((reason: Error) => setError(reason.message));
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
    try {
      const result = await control<GameSnapshot | { snapshot: GameSnapshot }>(path, body);
      setGame("snapshot" in result ? result.snapshot : result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!game) {
    return <main className="loading-screen"><span className="rift-mark">R</span><p>Opening the breach…</p>{error && <p className="error-note">{error}</p>}</main>;
  }

  const timeSeconds = Math.ceil(remainingMs / 1000);
  const timePct = Math.max(0, Math.min(100, (remainingMs / 20_000) * 100));
  const isVoting = game.phase === "voting" && !game.paused;

  return (
    <main className={`app-shell ${isOverlay ? "overlay-shell" : ""}`}>
      {!isOverlay && <header className="topbar">
        <a className="wordmark" href="/" aria-label="RIFT studio home"><span className="wordmark-icon">R</span><span>RIFT<span className="wordmark-separator">/</span>RAID CONTROL</span></a>
        <div className="topbar-right">
          <span className="mode-label"><span className="live-dot" /> LOCAL SIMULATOR</span>
          <a className="overlay-link" href="/overlay" target="_blank" rel="noreferrer">Open stream overlay <span aria-hidden="true">↗</span></a>
          <div className={`socket-status ${gameSocket.connected ? "is-online" : ""}`}><span className="socket-dot" />{gameSocket.connected ? "SYNCED" : "RECONNECTING"}</div>
        </div>
      </header>}

      <div className="studio-layout">
        <section className="arena-column" aria-label="Live game preview">
          <div className="arena-headline">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> CO-OP RAID <span className="eyebrow-index">{String(game.round).padStart(2, "0")} / {String(game.roundLimit).padStart(2, "0")}</span></p>
              <h1>The breach is <em>open.</em></h1>
            </div>
            <div className={`phase-chip phase-${game.phase}`}><span className="phase-pip" />{phaseLabel(game)}</div>
          </div>

          <section className="arena-frame" aria-label="The Hollow Warden encounter">
            <div className="arena-meta"><span>SECTOR 07 <b>·</b> THE ASHEN RIFT</span><span>ENCOUNTER {String(Math.max(1, game.round)).padStart(2, "0")}</span></div>
            <div className="arena-stage">
              <div className="stage-grid" aria-hidden="true" />
              <div className="rift-orbit orbit-one" aria-hidden="true" /><div className="rift-orbit orbit-two" aria-hidden="true" />
              <div className={`warden-art ${game.phase === "resolving" ? "warden-strike" : ""}`} aria-label="Stylized illustration of the Hollow Warden" role="img">
                <div className="warden-halo" /><div className="warden-core"><span className="warden-eye" /><span className="warden-slit" /></div>
                <span className="warden-shard shard-left" /><span className="warden-shard shard-right" />
              </div>
              <div className="stage-caption"><span className="caption-rule" /><span>THE HOLLOW WARDEN</span><span className="caption-rule" /></div>
              <div className="arena-stamp">R<br />I<br />F<br />T</div>
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
            </div>
            <div className="arena-foot"><span>CHAT COMMANDS</span><span>ONE VOTE PER VIEWER</span><span>STREAM OVERLAY <b>16:9</b></span></div>
          </section>

          <section className="vote-console" aria-label="Live audience votes">
            <div className="section-heading"><div><span className="section-number">01</span><h2>THE CROWD DECIDES</h2></div><span className="vote-count">{game.totalVoters} <small>VOTERS</small></span></div>
            <div className="vote-options">
              {(Object.keys(actionMeta) as Action[]).map((action) => {
                const meta = actionMeta[action];
                const votes = game.votes[action];
                const share = game.totalVoters ? Math.round((votes / game.totalVoters) * 100) : 0;
                return <div className={`vote-option vote-${action} ${game.winningAction === action ? "vote-winner" : ""}`} key={action}>
                  <span className="vote-icon" aria-hidden="true">{meta.icon}</span>
                  <div className="vote-info"><div className="vote-name-line"><strong>{meta.label}</strong><code>{meta.command}</code></div><div className="vote-track"><span style={{ width: `${share}%` }} /></div></div>
                  <div className="vote-numbers"><strong>{votes}</strong><span>{share}%</span></div>
                </div>;
              })}
            </div>
            <div className="charge-row"><div className="charge-copy"><span className="charge-symbol">✳</span><span><strong>RIFTBURST CHARGE</strong><small>{game.crowd.specialCharge} OF {game.crowd.specialThreshold} SPECIAL VOTES</small></span></div><div className="charge-pips" aria-label={`${game.crowd.specialCharge} of ${game.crowd.specialThreshold} charge`}>
              {Array.from({ length: game.crowd.specialThreshold }, (_, index) => <span className={index < game.crowd.specialCharge ? "charged" : ""} key={index} />)}
            </div></div>
          </section>
        </section>

        {!isOverlay && <aside className="control-column" aria-label="Streamer controls">
          <div className="control-card encounter-card">
            <div className="card-label"><span>ENCOUNTER FILE</span><span className="file-stamp">R–07</span></div>
            <h2>THE HOLLOW<br /><em>WARDEN</em></h2>
            <p>A breach-born sentinel. It studies the crowd, then answers with force.</p>
            <div className="encounter-details"><span>ADAPTATION</span><strong>{game.boss.stance}</strong></div>
            {game.adaptation && <p className="adaptation-copy">{game.adaptation.explanation}</p>}
          </div>

          <div className="control-card live-controls">
            <div className="card-label"><span>RAID CONTROL</span><span className={`control-phase ${game.phase === "voting" ? "active" : ""}`}><i />{game.phase.toUpperCase()}</span></div>
            <div className="primary-actions">
              {game.phase === "lobby" || game.phase === "victory" || game.phase === "defeat" ?
                <button className="button-primary" disabled={busy} onClick={() => void run("control/start")}><span>▶</span> {game.phase === "lobby" ? "Begin encounter" : "Run it back"}</button> :
                <button className="button-primary" disabled={busy || game.phase !== "voting"} onClick={() => void run("control/resolve")}><span>↯</span> Resolve the vote</button>}
              {game.phase === "voting" && <button className="button-secondary" disabled={busy} onClick={() => void run(game.paused ? "control/resume" : "control/pause")}>
                <span>{game.paused ? "▶" : "Ⅱ"}</span>{game.paused ? "Resume voting" : "Pause voting"}
              </button>}
            </div>
            <div className="control-divider" />
            <div className="card-label simulator-label"><span>SIMULATE CHAT</span><span>12 VIEWERS / WAVE</span></div>
            <div className="sim-actions">
              {(Object.keys(actionMeta) as Action[]).map((action) => <button key={action} className={`sim-button sim-${action}`} disabled={busy || !isVoting} onClick={() => void run("control/simulate", { action, count: 12 })}>
                <span>{actionMeta[action].icon}</span><strong>{actionMeta[action].label}<small>12 votes</small></strong><b>+</b>
              </button>)}
            </div>
            <p className="sim-note">Simulator votes are labelled and isolated from real Twitch chat.</p>
            <button className="reset-button" disabled={busy || game.phase === "lobby"} onClick={() => void run("control/reset")}>↺ <span>Reset encounter</span></button>
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

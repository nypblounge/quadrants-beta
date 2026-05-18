import React, { useEffect, useMemo, useRef, useState } from "react";
import { createQuadrantsWsClient } from "./quadrantsWsClient";
import { makeQuadrantsLobbyFromWsRoom } from "./quadrantsWsLobbyBridge";
import {
  defaultWsUrl,
  normalizeRoomCode,
  savedPlayerName,
  savePlayerName
} from "./quadrantsWsUiHelpers";

function currentPlayers(lobby) {
  return Object.values(lobby?.players || {});
}

const CLASSIC_TEAM_ORDER = ['red', 'blue', 'green', 'purple'];
const EIGHT_PLAYER_TEAM_ORDER = ['red', 'yellow', 'cyan', 'purple', 'green', 'blue', 'orange', 'pink'];

const TEAM_LABELS = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  cyan: 'Cyan'
};

const PHASE_OPTIONS = [
  { id: "lobby", label: "Lobby" },
  { id: "build", label: "Build" },
  { id: "buy", label: "Buy" },
  { id: "fight", label: "Fight" },
  { id: "results", label: "Results" }
];

function activeTeamsForPlayerCount(value) {
  const playerCount = Math.max(2, Math.min(8, Number(value) || 2));
  const order = playerCount > 4 ? EIGHT_PLAYER_TEAM_ORDER : CLASSIC_TEAM_ORDER;
  return order.slice(0, playerCount);
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

export function QuadrantsWsGamePreview() {
  const clientRef = useRef(null);
  const openWaitersRef = useRef([]);

  const [url, setUrl] = useState(defaultWsUrl);
  const [playerName, setPlayerName] = useState(savedPlayerName);
  const [joinCode, setJoinCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Connect to a WebSocket room to preview bridged game state.");
  const [room, setRoom] = useState(null);
  const [clientState, setClientState] = useState({
    connected: false,
    clientId: null,
    sessionToken: null,
    reconnectTimeoutMs: 45000,
    lastRoom: null
  });

  if (!clientRef.current) {
    clientRef.current = createQuadrantsWsClient({ url });
  }

  const client = clientRef.current;
  const lobby = useMemo(() => makeQuadrantsLobbyFromWsRoom(room), [room]);
  const players = currentPlayers(lobby);
  const activeTeams = activeTeamsForPlayerCount(lobby?.setup?.players);
  const currentPlayer = players.find((player) => String(player.id) === String(clientState.clientId));
  const isHost = Boolean(lobby?.hostId && String(lobby.hostId) === String(clientState.clientId));
  const readyPlayers = players.filter((player) => player.connected);
  const allPlayersReady = readyPlayers.length > 0 && readyPlayers.every((player) => player.wsReady);
  const allPlayersAssignedTeams = readyPlayers.length > 0 && readyPlayers.every((player) => Boolean(player.team));
  const hasEnoughPlayersToStart = readyPlayers.length >= 2;
  const canStartBuild = isHost && lobby?.phase === "lobby" && hasEnoughPlayersToStart && allPlayersReady && allPlayersAssignedTeams;
  const startBuildHelp = !lobby
    ? "Join or host a WebSocket room first."
    : !isHost
      ? "Only the host can start build."
      : lobby.phase !== "lobby"
        ? "Build can only be started from the lobby phase."
        : !hasEnoughPlayersToStart
          ? "At least 2 connected players are needed before build."
          : !allPlayersAssignedTeams
            ? "Every connected player needs a team before build."
            : !allPlayersReady
              ? "Every connected player needs to be ready before build."
              : "Ready to start build.";

  function refreshClientState() {
    const nextState = client.getState();
    setClientState(nextState);
    setConnected(Boolean(nextState.connected));

    if (nextState.lastRoom) {
      setRoom(nextState.lastRoom);
      if (nextState.lastRoom.code) setJoinCode(nextState.lastRoom.code);
    }

    return nextState;
  }

  function resolveOpenWaiters() {
    const waiters = openWaitersRef.current.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }

  function rejectOpenWaiters(error) {
    const waiters = openWaitersRef.current.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  useEffect(() => {
    const offAny = client.on("*", (message) => {
      if (message.type === "open") {
        setStatus("Connected to WebSocket server.");
        resolveOpenWaiters();
      }

      if (message.type === "close") {
        setStatus("Disconnected from WebSocket server.");
      }

      if (message.type === "socket_error") {
        setStatus("WebSocket connection error. Is the local server running?");
        rejectOpenWaiters(new Error("WebSocket connection error."));
      }

      if (message.type === "welcome") {
        setStatus(`Connected as client ${message.clientId}.`);
      }

      if (message.type === "phase_change" && message.phase) {
        setRoom((currentRoom) => currentRoom ? { ...currentRoom, phase: message.phase } : currentRoom);
        setStatus("Phase changed to " + message.phase + ".");
      }

      if (message.type === "room_created" || message.type === "room_update" || message.type === "phase_change" || message.type === "session_resumed") {
        if (message.room) {
          setRoom(message.room);
          if (message.room.code) setJoinCode(message.room.code);
          setStatus(`Previewing WebSocket room ${message.room.code}.`);
        }
      }

      if (message.type === "room_closed") {
        setRoom(null);
        setStatus("The WebSocket room was closed.");
      }

      if (message.type === "kicked") {
        setRoom(null);
        setStatus("You were kicked from the WebSocket room.");
      }

      if (message.type === "error") {
        setStatus(message.message || "WebSocket server returned an error.");
      }

      refreshClientState();
    });

    return () => {
      offAny();
      rejectOpenWaiters(new Error("WebSocket game preview unmounted."));
    };
  }, [client]);

  useEffect(() => {
    return () => {
      client.disconnect();
    };
  }, [client]);

  function waitForConnected(timeoutMs = 3500) {
    const state = client.getState();
    if (state.connected) return Promise.resolve();

    client.connect(url);

    return new Promise((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        openWaitersRef.current = openWaitersRef.current.filter((waiter) => waiter.reject !== reject);
        reject(new Error("Timed out connecting to WebSocket server."));
      }, timeoutMs);

      openWaitersRef.current.push({
        resolve: () => {
          window.clearTimeout(timeoutId);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        }
      });
    });
  }

  async function connect() {
    try {
      setStatus(`Connecting to ${url}...`);
      await waitForConnected();
      refreshClientState();
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not connect to WebSocket server.");
    }
  }

  function disconnect() {
    client.disconnect();
    setConnected(false);
    setRoom(null);
    setStatus("Disconnected.");
    refreshClientState();
  }

  async function hostRoom() {
    const cleanName = playerName.trim().slice(0, 18);

    if (!cleanName) {
      setStatus("Enter a display name first.");
      return;
    }

    try {
      savePlayerName(cleanName);
      setStatus("Creating WebSocket preview room...");
      await waitForConnected();
      client.setName(cleanName);
      client.createRoom();
      refreshClientState();
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not create WebSocket room.");
    }
  }

  async function joinRoom() {
    const cleanName = playerName.trim().slice(0, 18);
    const code = normalizeRoomCode(joinCode);

    if (!cleanName) {
      setStatus("Enter a display name first.");
      return;
    }

    if (!code) {
      setStatus("Enter a WebSocket room code first.");
      return;
    }

    try {
      savePlayerName(cleanName);
      setStatus(`Joining WebSocket room ${code}...`);
      await waitForConnected();
      client.setName(cleanName);
      client.joinRoom(code);
      refreshClientState();
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not join WebSocket room.");
    }
  }

  function toggleReady() {
    if (!room) {
      setStatus('Join or host a WebSocket room first.');
      return;
    }

    const clientId = clientState.clientId;
    const currentRoomPlayer = room.players?.find((player) => String(player.id) === String(clientId));
    const nextReady = !Boolean(currentRoomPlayer?.ready);

    client.setReady(nextReady);
    setStatus(nextReady ? 'Marked ready.' : 'Marked not ready.');
    refreshClientState();
  }

  function chooseTeam(team) {
    if (!room) {
      setStatus('Join or host a WebSocket room first.');
      return;
    }

    client.chooseTeam(team);
    setStatus(team ? 'Choosing ' + (TEAM_LABELS[team] || team) + ' team.' : 'Choosing spectator.');
    refreshClientState();
  }

  function changePhase(phase) {
    if (!room) {
      setStatus("Join or host a WebSocket room first.");
      return;
    }

    if (!isHost) {
      setStatus("Only the room host can change phase.");
      return;
    }

    client.changePhase(phase);
    setRoom((currentRoom) => currentRoom ? { ...currentRoom, phase } : currentRoom);
    const nextPhase = PHASE_OPTIONS.find((option) => option.id === phase);
    setStatus("Changing phase to " + (nextPhase?.label || phase) + ".");
    refreshClientState();
  }

  function startBuild() {
    if (!room) {
      setStatus("Join or host a WebSocket room first.");
      return;
    }

    if (!isHost) {
      setStatus("Only the room host can start build.");
      return;
    }

    if (lobby?.phase !== "lobby") {
      setStatus("Build can only be started from the lobby phase.");
      return;
    }

    if (!hasEnoughPlayersToStart) {
      setStatus("At least 2 connected players are needed before build.");
      return;
    }

    if (!allPlayersAssignedTeams) {
      setStatus("Every connected player needs a team before build.");
      return;
    }

    if (!allPlayersReady) {
      setStatus("Every connected player needs to be ready before build.");
      return;
    }

    client.changePhase("build");
    setRoom((currentRoom) => currentRoom ? { ...currentRoom, phase: "build" } : currentRoom);
    setStatus("Starting build phase.");
    refreshClientState();
  }

  function updateSetup(patch) {
    if (!room) {
      setStatus("Join or host a WebSocket room first.");
      return;
    }

    if (!isHost) {
      setStatus("Only the room host can update setup.");
      return;
    }

    client.updateSetup(patch);
    setStatus("Updating room setup.");
    refreshClientState();
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <h1>Quadrants WebSocket Game Preview</h1>
          <p className="muted">
            Read-only experiment for rendering game UI from WebSocket lobby state.
          </p>
        </div>
        <span className={`status-badge ${connected ? "online" : ""}`}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <main className="panel-stack">
        <section className="card hero-card">
          <div>
            <h2>{lobby ? `Preview room ${lobby.code}` : "WebSocket game preview"}</h2>
            <p>
              This screen joins a WebSocket room and converts it into a Quadrants-shaped lobby object.
              It is separate from the full lobby/game flow.
            </p>
          </div>
          <div className="lobby-code">{lobby?.code || "WS"}</div>
        </section>

        <section className="card">
          <h3>Connection</h3>
          <div className="grid two">
            <label>
              WebSocket server
              <input value={url} onChange={(event) => setUrl(event.target.value)} />
            </label>
            <label>
              Display name
              <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
            </label>
            <label>
              Room code
              <input value={joinCode} onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))} />
            </label>
            <label>
              Client ID
              <input value={clientState.clientId || "Not connected"} readOnly />
            </label>
          </div>

          <div className="action-group">
            <button onClick={connect}>Connect</button>
            <button onClick={disconnect}>Disconnect</button>
            <button onClick={hostRoom}>Host Preview Room</button>
            <button onClick={joinRoom}>Join Preview Room</button>
            <button onClick={toggleReady} disabled={!room}>
              {currentPlayer?.wsReady ? 'Ready: Yes' : 'Ready: No'}
            </button>
          </div>

          {lobby && (
            <div className='team-picker'>
              <p className='muted'>Choose team</p>
              <div className='action-group'>
                {activeTeams.map((team) => (
                  <button key={team} onClick={() => chooseTeam(team)} disabled={currentPlayer?.team === team}>
                    {currentPlayer?.team === team ? 'Team: ' + (TEAM_LABELS[team] || team) : TEAM_LABELS[team] || team}
                  </button>
                ))}
                <button onClick={() => chooseTeam(null)} disabled={!currentPlayer?.team}>
                  Spectator
                </button>
              </div>
            </div>
          )}


          {lobby && (
            <div className="phase-picker">
              <p className="muted">{isHost ? "Change phase" : "Phase controls are host-only"}</p>
              <div className="action-group">
                {PHASE_OPTIONS.map((phase) => (
                  <button key={phase.id} onClick={() => changePhase(phase.id)} disabled={!isHost || lobby.phase === phase.id}>
                    {lobby.phase === phase.id ? "Phase: " + phase.label : phase.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {lobby && (
            <div className="start-build-panel">
              <p className="muted">Start Build readiness: {startBuildHelp}</p>
              <div className="action-group">
                <button onClick={startBuild} disabled={!canStartBuild}>Start Build</button>
              </div>
            </div>
          )}


          <p className="muted">{status}</p>
        </section>

        {lobby && (
          <section className="grid lobby-grid-split">
            <div className="card">
              <h3>Players from bridged lobby</h3>
              <div className="player-list">
                {players.length === 0 ? (
                  <p className="muted">No players in room yet.</p>
                ) : (
                  players.map((player) => (
                    <div className="player-row" key={player.id}>
                      <span className={`connection-dot ${player.connected ? "on" : ""}`} />
                      <span className="player-name">{player.name}</span>
                      <span className="player-team-label">{player.team || "Spectator"}</span>
                      {lobby.hostId === player.id && <span className="pill host">Host</span>}
                      {player.wsReady && <span className="pill good">Ready</span>}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className='card'>
              <h3>Lobby setup</h3>
              <p className='muted'>Phase: {lobby.phase}</p>
              <p className='muted'>Connected players: {players.length}</p>
              <p className='muted'>Player slots: {lobby.setup.players}</p>
              <p className='muted'>Grid: {lobby.setup.gridSize}x{lobby.setup.gridSize}</p>
              <p className='muted'>Starting gold: {lobby.setup.startingGold}</p>
              <p className='muted'>Max units: {lobby.setup.maxUnits}</p>
              <p className='muted'>Base HP: {lobby.setup.baseHp}</p>

              <div className='setup-controls'>
                <p className='muted'>{isHost ? 'Host setup controls' : 'Setup controls are host-only'}</p>
                <div className='action-group'>
                  <button onClick={() => updateSetup({ players: Math.max(2, Number(lobby.setup.players || 2) - 1) })} disabled={!isHost || Number(lobby.setup.players || 2) <= 2}>Players -</button>
                  <button onClick={() => updateSetup({ players: Math.min(8, Number(lobby.setup.players || 2) + 1) })} disabled={!isHost || Number(lobby.setup.players || 2) >= 8}>Players +</button>
                  <button onClick={() => updateSetup({ gridSize: Math.max(11, Number(lobby.setup.gridSize || 17) - 2) })} disabled={!isHost || Number(lobby.setup.gridSize || 17) <= 11}>Grid -</button>
                  <button onClick={() => updateSetup({ gridSize: Math.min(31, Number(lobby.setup.gridSize || 17) + 2) })} disabled={!isHost || Number(lobby.setup.gridSize || 17) >= 31}>Grid +</button>
                  <button onClick={() => updateSetup({ startingGold: Math.max(0, Number(lobby.setup.startingGold || 0) - 50) })} disabled={!isHost}>Gold -</button>
                  <button onClick={() => updateSetup({ startingGold: Number(lobby.setup.startingGold || 0) + 50 })} disabled={!isHost}>Gold +</button>
                  <button onClick={() => updateSetup({ maxUnits: Math.max(1, Number(lobby.setup.maxUnits || 1) - 1) })} disabled={!isHost || Number(lobby.setup.maxUnits || 1) <= 1}>Units -</button>
                  <button onClick={() => updateSetup({ maxUnits: Number(lobby.setup.maxUnits || 1) + 1 })} disabled={!isHost}>Units +</button>
                  <button onClick={() => updateSetup({ baseHp: Math.max(1, Number(lobby.setup.baseHp || 1) - 50) })} disabled={!isHost}>Base HP -</button>
                  <button onClick={() => updateSetup({ baseHp: Number(lobby.setup.baseHp || 1) + 50 })} disabled={!isHost}>Base HP +</button>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="card">
          <h3>Bridged lobby object</h3>
          <p className="muted">
            This is the object shape that future real UI bridge work can read from.
          </p>
          <details open={Boolean(lobby)}>
            <summary>{lobby ? "Show JSON" : "No room joined yet"}</summary>
            <pre>{prettyJson(lobby || { status: "No WebSocket room joined yet." })}</pre>
          </details>
        </section>
      </main>
    </div>
  );
}

export default QuadrantsWsGamePreview;
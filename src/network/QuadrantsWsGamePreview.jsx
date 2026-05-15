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

      if (message.type === "room_created" || message.type === "room_update" || message.type === "session_resumed") {
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
              It does not replace Firebase gameplay.
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
          </div>

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

            <div className="card">
              <h3>Read-only lobby state</h3>
              <p className="muted">Phase: {lobby.phase}</p>
              <p className="muted">Players: {players.length}</p>
              <p className="muted">Grid: {lobby.setup.gridSize}x{lobby.setup.gridSize}</p>
              <p className="muted">Starting gold: {lobby.setup.startingGold}</p>
              <p className="muted">Max units: {lobby.setup.maxUnits}</p>
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
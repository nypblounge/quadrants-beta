import React, { useEffect, useRef, useState } from "react";
import { createQuadrantsWsClient } from "./quadrantsWsClient";
import { makeQuadrantsLobbyFromWsRoom } from "./quadrantsWsLobbyBridge";
function defaultWsUrl() {
  const host = window.location.hostname || "localhost";
  return `ws://${host}:8080`;
}

function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

function formatTime() {
  return new Date().toLocaleTimeString();
}

function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function savedPlayerName() {
  try {
    return window.localStorage?.getItem("quadrants_player_name") || "WebSocket Player";
  } catch {
    return "WebSocket Player";
  }
}

function savePlayerName(name) {
  try {
    window.localStorage?.setItem("quadrants_player_name", name);
  } catch {
    // Ignore storage failures.
  }
}

export function QuadrantsWsLobbyMode() {
  const clientRef = useRef(null);
  const openWaitersRef = useRef([]);

  const [url, setUrl] = useState(defaultWsUrl);
  const [playerName, setPlayerName] = useState(savedPlayerName);
  const [joinCode, setJoinCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("WebSocket lobby mode is enabled with ?ws=1.");
  const [room, setRoom] = useState(null);
  const [ready, setReady] = useState(false);
  const [eventLog, setEventLog] = useState([]);
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

  function appendLog(label, payload) {
    setEventLog((current) => [
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        time: formatTime(),
        label,
        payload
      },
      ...current
    ].slice(0, 50));
  }

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
      appendLog(message.type || "message", message);

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
          setStatus(`Room ${message.room.code} is active.`);
        }
      }

      if (message.type === "room_closed") {
        setRoom(null);
        setReady(false);
        setStatus("The WebSocket room was closed.");
      }

      if (message.type === "kicked") {
        setRoom(null);
        setReady(false);
        setStatus("You were kicked from the WebSocket room.");
      }

      if (message.type === "error") {
        setStatus(message.message || "WebSocket server returned an error.");
      }

      refreshClientState();
    });

    return () => {
      offAny();
      rejectOpenWaiters(new Error("WebSocket lobby mode unmounted."));
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
    setReady(false);
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
      setStatus("Creating WebSocket room...");
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
    const nextReady = !ready;
    setReady(nextReady);
    client.setReady(nextReady);
    setStatus(nextReady ? "Marked ready." : "Marked not ready.");
  }

  function setLobbyPhase(nextPhase) {
    client.changePhase(nextPhase);
    setStatus(`Requested phase change to ${nextPhase}. Host only.`);
  }

  function sendSampleSnapshot() {
    client.sendSnapshot({
      source: "wsLobbyMode",
      phase: room?.phase || "lobby",
      sentAt: Date.now(),
      units: []
    });
    setStatus("Sent sample match snapshot. Host only.");
  }

  function sendSampleDelta() {
    client.sendDelta({
      source: "wsLobbyMode",
      sentAt: Date.now(),
      updates: []
    });
    setStatus("Sent sample match delta. Host only.");
  }

  function sendSampleCommand() {
    client.sendCommand({
      action: "lobby_test",
      sentAt: Date.now()
    });
    setStatus("Sent sample command.");
  }

  const players = Array.isArray(room?.players) ? room.players : [];
  const currentClientId = clientState.clientId;
  const isHost = Boolean(
    currentClientId &&
    room &&
    (room.hostId === currentClientId || players.some((player) => player.id === currentClientId && player.isHost))
  );
const quadrantsLobbyPreview = makeQuadrantsLobbyFromWsRoom(room);
  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Quadrants WebSocket Lobby Mode</h1>
            <p style={styles.subtitle}>
              Running through the local WebSocket server because <code>?ws=1</code> is enabled.
            </p>
          </div>
          <div style={connected ? styles.badgeOnline : styles.badgeOffline}>
            {connected ? "Connected" : "Disconnected"}
          </div>
        </header>

        <section style={styles.card}>
          <div style={styles.grid}>
            <label style={styles.label}>
              WebSocket Server
              <input
                style={styles.input}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={connected}
              />
            </label>

            <label style={styles.label}>
              Display Name
              <input
                style={styles.input}
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                maxLength={18}
              />
            </label>

            <label style={styles.label}>
              Room Code
              <input
                style={styles.input}
                value={joinCode}
                onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
                placeholder="ABC123"
              />
            </label>

            <label style={styles.label}>
              Client ID
              <input
                style={styles.input}
                value={clientState.clientId || ""}
                readOnly
                placeholder="Not connected"
              />
            </label>
          </div>

          <div style={styles.actions}>
            <button style={styles.button} onClick={connect}>Connect</button>
            <button style={styles.button} onClick={disconnect}>Disconnect</button>
            <button style={styles.primaryButton} onClick={hostRoom}>Host WS Lobby</button>
            <button style={styles.primaryButton} onClick={joinRoom}>Join WS Lobby</button>
          </div>

          <div style={styles.status}>{status}</div>
        </section>

        {room && (
          <section style={styles.card}>
            <div style={styles.roomHeader}>
              <div>
                <h2 style={styles.cardTitle}>Room {room.code}</h2>
                <p style={styles.subtitle}>
                  Phase: <strong>{room.phase || "lobby"}</strong> · Host: <strong>{isHost ? "you" : room.hostId || "unknown"}</strong>
                </p>
              </div>
              <button style={styles.button} onClick={disconnect}>Leave</button>
            </div>

            <div style={styles.actions}>
              <button style={styles.button} onClick={toggleReady}>
                {ready ? "Ready: Yes" : "Ready: No"}
              </button>
              <button style={styles.button} onClick={() => setLobbyPhase("lobby")}>Phase: Lobby</button>
              <button style={styles.button} onClick={() => setLobbyPhase("fight")}>Phase: Fight</button>
              <button style={styles.button} onClick={sendSampleCommand}>Send Command</button>
              <button style={styles.button} onClick={sendSampleSnapshot}>Send Snapshot</button>
              <button style={styles.button} onClick={sendSampleDelta}>Send Delta</button>
            </div>

            <h3 style={styles.smallTitle}>Players</h3>

            <div style={styles.table}>
              <div style={styles.tableHead}>ID</div>
              <div style={styles.tableHead}>Name</div>
              <div style={styles.tableHead}>Ready</div>
              <div style={styles.tableHead}>Status</div>

              {players.length === 0 ? (
                <div style={styles.emptyRow}>No players in room yet.</div>
              ) : (
                players.map((player) => (
                  <React.Fragment key={player.id}>
                    <div style={styles.tableCell}>{player.id}{player.isHost ? " ★" : ""}</div>
                    <div style={styles.tableCell}>{player.name || "Player"}</div>
                    <div style={styles.tableCell}>{player.ready ? "yes" : "no"}</div>
                    <div style={styles.tableCell}>{player.connected ? "connected" : "disconnected"}</div>
                  </React.Fragment>
                ))
              )}
            </div>
{quadrantsLobbyPreview && (
  <details style={styles.details} open>
    <summary>Quadrants lobby bridge preview</summary>
    <pre style={styles.pre}>{prettyJson(quadrantsLobbyPreview)}</pre>
  </details>
)}
            <details style={styles.details}>
              <summary>Raw room snapshot</summary>
              <pre style={styles.pre}>{prettyJson(room)}</pre>
            </details>
          </section>
        )}

        <section style={styles.card}>
          <div style={styles.roomHeader}>
            <h2 style={styles.cardTitle}>WebSocket Event Log</h2>
            <button style={styles.button} onClick={() => setEventLog([])}>Clear Log</button>
          </div>

          {eventLog.length === 0 ? (
            <p style={styles.subtitle}>No WebSocket events yet.</p>
          ) : (
            <div style={styles.log}>
              {eventLog.map((entry) => (
                <details key={entry.id} style={styles.logItem}>
                  <summary>[{entry.time}] {entry.label}</summary>
                  <pre style={styles.pre}>{prettyJson(entry.payload)}</pre>
                </details>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    padding: 24,
    background: "linear-gradient(135deg, #020617, #111827)",
    color: "#e5e7eb",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  },
  shell: {
    maxWidth: 980,
    margin: "0 auto"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 18
  },
  title: {
    margin: 0,
    fontSize: 32
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#94a3b8"
  },
  card: {
    padding: 18,
    marginBottom: 16,
    borderRadius: 16,
    border: "1px solid rgba(148, 163, 184, 0.35)",
    background: "rgba(15, 23, 42, 0.82)",
    boxShadow: "0 20px 50px rgba(0, 0, 0, 0.25)"
  },
  cardTitle: {
    margin: 0,
    fontSize: 22
  },
  smallTitle: {
    margin: "16px 0 8px",
    fontSize: 16
  },
  badgeOnline: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "rgba(34, 197, 94, 0.18)",
    color: "#86efac",
    whiteSpace: "nowrap"
  },
  badgeOffline: {
    padding: "7px 10px",
    borderRadius: 999,
    background: "rgba(239, 68, 68, 0.18)",
    color: "#fca5a5",
    whiteSpace: "nowrap"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12,
    marginBottom: 12
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    color: "#cbd5e1"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 10px",
    borderRadius: 10,
    border: "1px solid rgba(148, 163, 184, 0.45)",
    background: "rgba(2, 6, 23, 0.78)",
    color: "#e5e7eb"
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  button: {
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid rgba(148, 163, 184, 0.35)",
    background: "rgba(30, 41, 59, 0.95)",
    color: "#e5e7eb",
    cursor: "pointer"
  },
  primaryButton: {
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid rgba(96, 165, 250, 0.55)",
    background: "rgba(37, 99, 235, 0.78)",
    color: "#eff6ff",
    cursor: "pointer"
  },
  status: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    background: "rgba(2, 6, 23, 0.52)",
    color: "#cbd5e1"
  },
  roomHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start"
  },
  table: {
    display: "grid",
    gridTemplateColumns: "1fr 2fr 1fr 1fr",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: 12,
    overflow: "hidden"
  },
  tableHead: {
    padding: 9,
    background: "rgba(2, 6, 23, 0.8)",
    fontWeight: 700
  },
  tableCell: {
    padding: 9,
    borderTop: "1px solid rgba(148, 163, 184, 0.18)"
  },
  emptyRow: {
    gridColumn: "1 / -1",
    padding: 12,
    color: "#94a3b8"
  },
  details: {
    marginTop: 12
  },
  log: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  logItem: {
    padding: 10,
    borderRadius: 10,
    background: "rgba(2, 6, 23, 0.48)"
  },
  pre: {
    margin: "8px 0 0",
    padding: 10,
    borderRadius: 10,
    overflow: "auto",
    background: "rgba(0, 0, 0, 0.32)",
    color: "#bfdbfe",
    fontSize: 12
  }
};
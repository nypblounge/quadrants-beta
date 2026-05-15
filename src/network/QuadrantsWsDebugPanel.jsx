import React, { useEffect, useRef, useState } from "react";
import { createQuadrantsWsClient } from "./quadrantsWsClient";

function defaultWsUrl() {
  const host = window.location.hostname || "localhost";
  return `ws://${host}:8080`;
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

export function QuadrantsWsDebugPanel() {
  const clientRef = useRef(null);

  const [url, setUrl] = useState(defaultWsUrl);
  const [playerName, setPlayerName] = useState("Browser Debug Player");
  const [joinCode, setJoinCode] = useState("");
  const [phase, setPhase] = useState("fight");
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
    ].slice(0, 40));
  }

  function refreshClientState() {
    setClientState(client.getState());
  }

  useEffect(() => {
    const offAny = client.on("*", (message) => {
      appendLog(message.type || "message", message);
      refreshClientState();

      if (message.type === "room_created" && message.room?.code) {
        setJoinCode(message.room.code);
      }
    });

    return () => {
      offAny();
    };
  }, [client]);

  const roomCode = clientState.lastRoom?.code || "";
  const isHost = Boolean(
    clientState.clientId &&
    clientState.lastRoom?.hostId &&
    clientState.clientId === clientState.lastRoom.hostId
  );

  function connect() {
    appendLog("debug_action", { action: "connect", url });
    client.connect(url);
    refreshClientState();
  }

  function disconnect() {
    appendLog("debug_action", { action: "disconnect" });
    client.disconnect();
    refreshClientState();
  }

  function setName() {
    appendLog("debug_action", { action: "set_name", playerName });
    client.setName(playerName);
  }

  function createRoom() {
    appendLog("debug_action", { action: "create_room" });
    client.createRoom();
  }

  function joinRoom() {
    const code = joinCode.trim().toUpperCase();
    appendLog("debug_action", { action: "join_room", code });
    client.joinRoom(code);
  }

  function toggleReady() {
    const nextReady = !ready;
    setReady(nextReady);
    appendLog("debug_action", { action: "player_ready", ready: nextReady });
    client.setReady(nextReady);
  }

  function sendPhaseChange() {
    appendLog("debug_action", { action: "phase_change", phase });
    client.changePhase(phase);
  }

  function sendSampleSnapshot() {
    const snapshot = {
      tick: 1,
      phase,
      source: "wsDebugPanel",
      units: [
        {
          id: "debug_unit_1",
          team: "red",
          row: 5,
          col: 5,
          hp: 10
        }
      ]
    };

    appendLog("debug_action", { action: "match_snapshot", snapshot });
    client.sendSnapshot(snapshot);
  }

  function sendSampleDelta() {
    const delta = {
      tick: Date.now(),
      source: "wsDebugPanel",
      updates: [
        {
          id: "debug_unit_1",
          row: 6,
          col: 5
        }
      ]
    };

    appendLog("debug_action", { action: "match_delta", delta });
    client.sendDelta(delta);
  }

  function sendSampleCommand() {
    const command = {
      action: "debug_move",
      unitId: "debug_unit_1",
      row: 7,
      col: 5
    };

    appendLog("debug_action", { action: "command", command });
    client.sendCommand(command);
  }

  function clearSession() {
    appendLog("debug_action", { action: "clear_session" });
    client.clearSession();
    refreshClientState();
  }

  function clearLog() {
    setEventLog([]);
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div>
          <strong>Quadrants WebSocket Debug</strong>
          <div style={styles.subtle}>
            Debug-only test panel. Firebase gameplay is unchanged.
          </div>
        </div>
        <div style={clientState.connected ? styles.badgeOnline : styles.badgeOffline}>
          {clientState.connected ? "Connected" : "Disconnected"}
        </div>
      </div>

      <div style={styles.grid}>
        <label style={styles.label}>
          Server URL
          <input
            style={styles.input}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>

        <label style={styles.label}>
          Player Name
          <input
            style={styles.input}
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
          />
        </label>

        <label style={styles.label}>
          Room Code
          <input
            style={styles.input}
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
          />
        </label>

        <label style={styles.label}>
          Phase
          <input
            style={styles.input}
            value={phase}
            onChange={(event) => setPhase(event.target.value)}
          />
        </label>
      </div>

      <div style={styles.actions}>
        <button style={styles.button} onClick={connect}>Connect</button>
        <button style={styles.button} onClick={disconnect}>Disconnect</button>
        <button style={styles.button} onClick={setName}>Set Name</button>
        <button style={styles.button} onClick={createRoom}>Create Room</button>
        <button style={styles.button} onClick={joinRoom}>Join Room</button>
        <button style={styles.button} onClick={toggleReady}>
          {ready ? "Ready: Yes" : "Ready: No"}
        </button>
        <button style={styles.button} onClick={sendSampleCommand}>Send Command</button>
        <button style={styles.button} onClick={sendPhaseChange}>Phase Change</button>
        <button style={styles.button} onClick={sendSampleSnapshot}>Send Snapshot</button>
        <button style={styles.button} onClick={sendSampleDelta}>Send Delta</button>
        <button style={styles.button} onClick={clearSession}>Clear Session</button>
        <button style={styles.button} onClick={clearLog}>Clear Log</button>
      </div>

      <div style={styles.status}>
        <div><strong>Client ID:</strong> {clientState.clientId || "none"}</div>
        <div><strong>Room:</strong> {roomCode || "none"}</div>
        <div><strong>Host:</strong> {isHost ? "yes" : "no"}</div>
        <div><strong>Reconnect Timeout:</strong> {clientState.reconnectTimeoutMs || 45000}ms</div>
      </div>

      {clientState.lastRoom && (
        <details style={styles.details}>
          <summary>Current room snapshot</summary>
          <pre style={styles.pre}>{prettyJson(clientState.lastRoom)}</pre>
        </details>
      )}

      <div style={styles.logHeader}>Event Log</div>

      <div style={styles.log}>
        {eventLog.length === 0 ? (
          <div style={styles.subtle}>No WebSocket events yet.</div>
        ) : (
          eventLog.map((entry) => (
            <details key={entry.id} style={styles.logItem}>
              <summary>
                [{entry.time}] {entry.label}
              </summary>
              <pre style={styles.pre}>{prettyJson(entry.payload)}</pre>
            </details>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    position: "fixed",
    right: 16,
    bottom: 16,
    width: 420,
    maxWidth: "calc(100vw - 32px)",
    maxHeight: "80vh",
    overflow: "auto",
    zIndex: 9999,
    padding: 14,
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.45)",
    background: "rgba(15, 23, 42, 0.96)",
    color: "#e5e7eb",
    boxShadow: "0 20px 50px rgba(0, 0, 0, 0.35)",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    fontSize: 13
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12
  },
  subtle: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 3
  },
  badgeOnline: {
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(34, 197, 94, 0.18)",
    color: "#86efac",
    whiteSpace: "nowrap"
  },
  badgeOffline: {
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(239, 68, 68, 0.18)",
    color: "#fca5a5",
    whiteSpace: "nowrap"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    marginBottom: 10
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    color: "#cbd5e1"
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "7px 8px",
    borderRadius: 8,
    border: "1px solid rgba(148, 163, 184, 0.45)",
    background: "rgba(2, 6, 23, 0.7)",
    color: "#e5e7eb"
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10
  },
  button: {
    padding: "7px 9px",
    borderRadius: 8,
    border: "1px solid rgba(148, 163, 184, 0.35)",
    background: "rgba(30, 41, 59, 0.95)",
    color: "#e5e7eb",
    cursor: "pointer"
  },
  status: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    padding: 8,
    borderRadius: 10,
    background: "rgba(2, 6, 23, 0.45)",
    marginBottom: 10
  },
  details: {
    marginBottom: 10
  },
  logHeader: {
    fontWeight: 700,
    marginBottom: 6
  },
  log: {
    display: "flex",
    flexDirection: "column",
    gap: 6
  },
  logItem: {
    padding: 8,
    borderRadius: 8,
    background: "rgba(2, 6, 23, 0.45)"
  },
  pre: {
    margin: "8px 0 0",
    padding: 8,
    borderRadius: 8,
    overflow: "auto",
    background: "rgba(0, 0, 0, 0.28)",
    color: "#bfdbfe",
    fontSize: 11
  }
};
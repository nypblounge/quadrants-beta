const DEFAULT_RECONNECT_TIMEOUT_MS = 45000;
const STORAGE_KEY = "quadrants_ws_session";

function defaultWsUrl() {
  const envUrl = import.meta?.env?.VITE_QUADRANTS_WS_URL;

  if (envUrl) {
    return envUrl;
  }

  const host = window.location.hostname || "localhost";
  return `ws://${host}:8080`;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function loadStoredSession() {
  const raw = window.localStorage?.getItem(STORAGE_KEY);
  return raw ? safeJsonParse(raw) : null;
}

function saveStoredSession(session) {
  if (!session?.clientId || !session?.sessionToken) {
    return;
  }

  window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
    clientId: session.clientId,
    sessionToken: session.sessionToken,
    savedAt: Date.now()
  }));
}

function clearStoredSession() {
  window.localStorage?.removeItem(STORAGE_KEY);
}

export function createQuadrantsWsClient(options = {}) {
  const listeners = new Map();

  let ws = null;
  let url = options.url || defaultWsUrl();
  let clientId = null;
  let sessionToken = null;
  let reconnectTimeoutMs = DEFAULT_RECONNECT_TIMEOUT_MS;
  let connected = false;
  let manuallyClosed = false;
  let lastRoom = null;

  function emit(type, payload) {
    const callbacks = listeners.get(type);

    if (callbacks) {
      for (const callback of callbacks) {
        callback(payload);
      }
    }

    const anyCallbacks = listeners.get("*");

    if (anyCallbacks) {
      for (const callback of anyCallbacks) {
        callback(payload);
      }
    }
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    ws.send(JSON.stringify(payload));
    return true;
  }

  function handleMessage(event) {
    const message = safeJsonParse(event.data);

    if (!message || typeof message !== "object") {
      emit("error", { type: "error", message: "Invalid server message", raw: event.data });
      return;
    }

    if (message.type === "ping") {
      send({ type: "pong" });
      emit("ping", message);
      return;
    }

    if (message.type === "welcome") {
  const stored = loadStoredSession();

  clientId = message.clientId;
  sessionToken = message.sessionToken;
  reconnectTimeoutMs = message.reconnectTimeoutMs || DEFAULT_RECONNECT_TIMEOUT_MS;

  if (stored?.clientId && stored?.sessionToken && stored.clientId !== clientId) {
    send({
      type: "resume_session",
      clientId: stored.clientId,
      sessionToken: stored.sessionToken
    });
  } else {
    saveStoredSession({ clientId, sessionToken });
  }
}

    if (message.type === "session_resumed") {
      clientId = message.clientId;
      sessionToken = message.sessionToken;
      lastRoom = message.room || null;
      saveStoredSession({ clientId, sessionToken });
    }

    if (message.type === "room_created" || message.type === "room_update") {
      lastRoom = message.room || null;
    }

    if (message.type === "room_closed" || message.type === "kicked") {
      lastRoom = null;
    }

    if (message.type === "error" && message.message === "Invalid resume session") {
  clearStoredSession();

  if (clientId && sessionToken) {
    saveStoredSession({ clientId, sessionToken });
  }
}

    emit(message.type, message);
  }

  function connect(nextUrl = url) {
    url = nextUrl;
    manuallyClosed = false;

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return ws;
    }

    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      connected = true;
      emit("open", { type: "open", url });
    });

    ws.addEventListener("message", handleMessage);

    ws.addEventListener("close", (event) => {
      connected = false;
      emit("close", {
        type: "close",
        code: event.code,
        reason: event.reason,
        manuallyClosed
      });
    });

    ws.addEventListener("error", (event) => {
      emit("socket_error", {
        type: "socket_error",
        event
      });
    });

    return ws;
  }

  function disconnect() {
    manuallyClosed = true;

    if (ws) {
      ws.close();
    }
  }

  function on(type, callback) {
    if (!listeners.has(type)) {
      listeners.set(type, new Set());
    }

    listeners.get(type).add(callback);

    return () => {
      listeners.get(type)?.delete(callback);
    };
  }

  return {
    connect,
    disconnect,
    send,
    on,

    setName(name) {
      return send({ type: "set_name", name });
    },

    createRoom() {
      return send({ type: "create_room" });
    },

    joinRoom(code) {
      return send({ type: "join_room", code });
    },

    setReady(ready) {
      return send({ type: "player_ready", ready });
    },

    chooseTeam(team) {
      return send({ type: "choose_team", team: team || null });
    },

    changePhase(phase) {
      return send({ type: "phase_change", phase });
    },

    updateSetup(setup) {
      return send({ type: "update_setup", setup });
    },

    sendSnapshot(snapshot) {
      return send({ type: "match_snapshot", snapshot });
    },

    sendDelta(delta) {
      return send({ type: "match_delta", delta });
    },

    sendCommand(command) {
      return send({ type: "command", command });
    },

    resumeSession(session = loadStoredSession()) {
      if (!session?.clientId || !session?.sessionToken) {
        return false;
      }

      return send({
        type: "resume_session",
        clientId: session.clientId,
        sessionToken: session.sessionToken
      });
    },

    clearSession() {
      clearStoredSession();
    },

    getState() {
      return {
        url,
        connected,
        clientId,
        sessionToken,
        reconnectTimeoutMs,
        lastRoom
      };
    }
  };
}
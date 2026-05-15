export function defaultWsUrl() {
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get("wsUrl") || params.get("wsURL") || params.get("wsServer");

  if (urlParam) {
    try {
      window.localStorage?.setItem("quadrants_ws_url", urlParam);
    } catch {
      // Ignore storage failures.
    }

    return urlParam;
  }

  try {
    const savedUrl = window.localStorage?.getItem("quadrants_ws_url");
    if (savedUrl) return savedUrl;
  } catch {
    // Ignore storage failures.
  }

  const explicitEnvUrl = import.meta.env?.VITE_QUADRANTS_WS_URL;
  if (explicitEnvUrl) return explicitEnvUrl;

  const host = window.location.hostname || "localhost";

  if (window.location.protocol === "https:") {
    return "wss://ws.notyourparentsbasement.com";
  }

  return "ws://" + host + ":8080";
}

export function normalizeRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

export function savedPlayerName() {
  try {
    return window.localStorage?.getItem("quadrants_player_name") || "WebSocket Player";
  } catch {
    return "WebSocket Player";
  }
}

export function savePlayerName(name) {
  try {
    window.localStorage?.setItem("quadrants_player_name", name);
  } catch {
    // Ignore storage failures.
  }
}

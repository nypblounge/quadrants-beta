export function defaultWsUrl() {
  const host = window.location.hostname || "localhost";
  return `ws://${host}:8080`;
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
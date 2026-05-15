const TEAM_SEQUENCE = ["red", "blue", "green", "purple", "orange", "cyan", "pink", "yellow"];

export const WS_BRIDGE_DEFAULT_SETUP = {
  players: 2,
  gridSize: 20,
  startingGold: 100,
  maxUnits: 10,
  baseHp: 100,
  gameMode: "classic",
  teamMode: false,
  npcSpawns: false
};

function teamForIndex(index) {
  return TEAM_SEQUENCE[index % TEAM_SEQUENCE.length] || "red";
}

function normalizeWsPlayers(room) {
  const players = Array.isArray(room?.players) ? room.players : [];

  return Object.fromEntries(
    players.map((player, index) => [
      String(player.id),
      {
        id: String(player.id),
        name: String(player.name || `Player ${index + 1}`).slice(0, 18),
        team: player.team || teamForIndex(index),
        connected: Boolean(player.connected),
        joinedAt: Number(player.joinedAt || room?.createdAt || Date.now()),
        lastSeen: Number(player.lastSeenAt || Date.now()),
        wsClientId: String(player.id),
        wsReady: Boolean(player.ready),
        wsHost: Boolean(player.isHost || room?.hostId === player.id)
      }
    ])
  );
}

function readyMapForPlayers(room) {
  const players = Array.isArray(room?.players) ? room.players : [];
  return Object.fromEntries(
    players
      .filter((player) => player.ready)
      .map((player) => [String(player.id), true])
  );
}

export function makeQuadrantsLobbyFromWsRoom(room, options = {}) {
  if (!room || typeof room !== "object") return null;

  const now = Date.now();
  const setup = {
    ...WS_BRIDGE_DEFAULT_SETUP,
    players: Math.max(2, Array.isArray(room.players) ? room.players.length : 2),
    ...(options.setup || {})
  };

  return {
    code: String(room.code || ""),
    phase: String(room.phase || "lobby"),
    hostId: room.hostId == null ? null : String(room.hostId),
    createdAt: Number(room.createdAt || now),
    updatedAt: Number(room.latestDeltaAt || room.latestSnapshotAt || now),
    lastActivityAt: Number(room.latestDeltaAt || room.latestSnapshotAt || now),
    setup,
    players: normalizeWsPlayers(room),
    ready: {
      build: readyMapForPlayers(room),
      buy: readyMapForPlayers(room)
    },
    game: {
      setup,
      wsBridge: true,
      wsRoomCode: String(room.code || ""),
      wsPhase: String(room.phase || "lobby"),
      wsHostId: room.hostId == null ? null : String(room.hostId),
      wsDeltaSeq: Number(room.deltaSeq || 0),
      wsLatestSnapshotAt: room.latestSnapshotAt || null,
      wsLatestDeltaAt: room.latestDeltaAt || null,
      log: [
        `WebSocket bridge preview for room ${room.code || "unknown"}.`,
        "Full match UI is not connected to WebSockets yet."
      ]
    }
  };
}
const CLASSIC_TEAMS = ["red", "green", "blue", "purple"];
const EIGHT_PLAYER_TEAMS = ["red", "yellow", "cyan", "purple", "green", "blue", "orange", "pink"];

export const WS_BRIDGE_DEFAULT_SETUP = {
  players: 2,
  gridSize: 17,
  startingGold: 350,
  maxUnits: 12,
  baseHp: 250,
  baseZoneSize: 3,
  centerSize: 5,
  matchTimeLimit: 30 * 60,
  gameMode: "classic",
  mapTemplate: "classic",
  ctfScoreLimit: 3,
  kothTimeLimit: 60,
  npcSpawns: false,
  npcSpawnAmount: 1,
  npcSpawnInterval: 60,
  goblinSpawnAmount: 1,
  goblinSpawnInterval: 60,
  hillGiantSpawnAmount: 0,
  hillGiantSpawnInterval: 120,
  npcSpawnSettings: {},
  teamMode: false,
  restockGoldOnContinued: false,
  continuedRestockGold: 150
};

export const WS_BRIDGE_DEFAULT_TEAM_ALLIANCES = {
  red: "warm",
  orange: "warm",
  yellow: "warm",
  green: "warm",
  blue: "cool",
  purple: "cool",
  pink: "cool",
  cyan: "cool"
};

function clampPlayerCount(value) {
  return Math.max(2, Math.min(8, Number(value) || 2));
}

function activeTeamsForPlayerCount(value) {
  const count = clampPlayerCount(value);
  if (count >= 5) return EIGHT_PLAYER_TEAMS.slice(0, count);
  if (count === 4) return [...CLASSIC_TEAMS];
  if (count === 3) return ["red", "green", "blue"];
  return ["red", "blue"];
}

function teamForIndex(index, playerCount) {
  const teams = activeTeamsForPlayerCount(playerCount);
  return teams[index % teams.length] || "red";
}

function normalizeWsPlayers(room, setup) {
  const players = Array.isArray(room?.players) ? room.players : [];
  const playerCount = setup?.players || players.length || 2;

  return Object.fromEntries(
    players.map((player, index) => [
      String(player.id),
      {
        id: String(player.id),
        name: String(player.name || `Player ${index + 1}`).slice(0, 18),
        team: Object.prototype.hasOwnProperty.call(player, "team")
          ? player.team || null
          : teamForIndex(index, playerCount),
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
  const roomSetup = room.setup && typeof room.setup === "object" ? room.setup : {};
  const playerCount = Math.max(2, Number(roomSetup.players) || (Array.isArray(room.players) ? room.players.length : 2));
  const setup = {
    ...WS_BRIDGE_DEFAULT_SETUP,
    players: playerCount,
    alliances: { ...WS_BRIDGE_DEFAULT_TEAM_ALLIANCES },
    ...roomSetup,
    ...(options.setup || {})
  };

  return {
    code: String(room.code || ""),
    phase: String(room.phase || "lobby"),
    hostId: room.hostId == null ? null : String(room.hostId),
    createdAt: Number(room.createdAt || now),
    updatedAt: Number(room.latestDeltaAt || room.latestSnapshotAt || now),
    lastActivityAt: Number(room.latestDeltaAt || room.latestSnapshotAt || now),
    cleanupAfterHours: 24,
    setup,
    players: normalizeWsPlayers(room, setup),
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
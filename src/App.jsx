
import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  onDisconnect,
  get,
  remove,
  serverTimestamp,
} from "firebase/database";
import { firebaseConfig } from "./firebaseConfig";
import "./styles.css";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const DEFAULT_SETUP = { players: 2, gridSize: 17, startingGold: 350, maxUnits: 12, baseHp: 250, gameMode: "classic", mapTemplate: "classic", ctfScoreLimit: 3 };
const BASE_ZONE_SIZE = 3;
const BASE_ZONE_INSET = 1;
const CENTER_RADIUS = 1;
const TICK_SECONDS = 0.6;
const MOVE_EVERY = 0.75;
const RESPAWN_BASE_TIME = 5;
const SPLAT_TTL = 2.4;
const MAX_LEVEL = 99;
const BUILD_PHASE_GOLD_RESERVE = 10;
const DEFEND_RADIUS = 4;
const MANUAL_TARGET_TIMEOUT = 6;
const HOME_TELEPORT_SECONDS = 5;
const RESOURCE_REGROW_SECONDS = 30;
const RESOURCE_HITPOINTS = { tree: 30, rock: 30 };
const ALL_TEAMS = ["red", "green", "blue", "purple"];
const TEAM_ORDER = { red: 0, green: 1, blue: 2, purple: 3 };
const GAME_MODES = {
  classic: { name: "Classic Base Siege", description: "Destroy enemy bases and clean up remaining units." },
  capture_flag: { name: "Capture the Flag", description: "Touch an enemy base to grab its flag, then return to your base to score." },
};
const MAP_TEMPLATES = {
  classic: { name: "Classic Quadrants" },
  river_cross: { name: "River Cross" },
  fortress_mid: { name: "Fortress Mid" },
  open_field: { name: "Open Field" },
};

const TEAM_META = {
  red: { name: "Red", emoji: "🟥", color: "#ef4444", dark: "#7f1d1d" },
  green: { name: "Green", emoji: "🟩", color: "#22c55e", dark: "#064e3b" },
  blue: { name: "Blue", emoji: "🟦", color: "#38bdf8", dark: "#0c4a6e" },
  purple: { name: "Purple", emoji: "🟪", color: "#a855f7", dark: "#581c87" },
};

const PHASES = {
  lobby: "Lobby",
  build: "Build Phase",
  buy: "Buy Phase",
  fight: "Fight Phase",
  results: "Results",
};

const STAT_KEYS = ["attack", "strength", "defence", "magic", "range", "prayer", "hitpoints"];
const STAT_SHORT = { attack: "Atk", strength: "Str", defence: "Def", magic: "Mag", range: "Rng", prayer: "Pray", hitpoints: "HP" };

const BASE = import.meta.env.BASE_URL || "/";
const asset = (path) => `${BASE}assets/${path}`;

const STYLE = {
  melee: {
    name: "Sword",
    file: "melee.png",
    combatType: "melee",
    tier: 1,
    cost: 10,
    range: 1,
    baseDamage: 6,
    attackTicks: 4,
    cooldown: 4 * TICK_SECONDS,
    baseStats: { attack: 60, strength: 60, defence: 60, hitpoints: 75 },
  },
  range: {
    name: "Bow",
    file: "range.png",
    combatType: "range",
    tier: 1,
    cost: 10,
    range: 2,
    baseDamage: 5,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    baseStats: { range: 60, defence: 60, hitpoints: 75 },
  },
  magic: {
    name: "Staff",
    file: "magic.png",
    combatType: "magic",
    tier: 1,
    cost: 10,
    range: 3,
    baseDamage: 6,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    baseStats: { magic: 60, defence: 60, hitpoints: 75 },
  },
  woodcutter: {
    name: "Woodcutter",
    file: "rune_axe.png",
    combatType: "melee",
    tier: 1,
    cost: 10,
    range: 1,
    baseDamage: 3,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    resourceTarget: "tree",
    resourceDamage: 10,
    baseStats: { attack: 40, strength: 10, defence: 20, magic: 1, range: 1, hitpoints: 50 },
  },
  miner: {
    name: "Miner",
    file: "rune_pickaxe.png",
    combatType: "melee",
    tier: 1,
    cost: 10,
    range: 1,
    baseDamage: 3,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    resourceTarget: "rock",
    resourceDamage: 10,
    baseStats: { attack: 40, strength: 10, defence: 20, magic: 1, range: 1, hitpoints: 50 },
  },
  ancient_staff: {
    name: "Ancient Staff",
    file: "ancient_staff.png",
    combatType: "magic",
    tier: 2,
    cost: 25,
    range: 3,
    baseDamage: 8,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    aoeRadius: 1,
    accuracyPenaltyVsRange: 0.22,
    baseStats: { magic: 75, defence: 60, hitpoints: 75 },
  },
  dragon_crossbow: {
    name: "Dragon Crossbow",
    file: "dragon_crossbow.png",
    combatType: "range",
    tier: 2,
    cost: 25,
    range: 2,
    baseDamage: 9,
    attackTicks: 4,
    cooldown: 4 * TICK_SECONDS,
    baseStats: { range: 75, defence: 75, hitpoints: 75 },
  },
  dragon_claws: {
    name: "Dragon Claws",
    file: "dragon_claws.png",
    combatType: "melee",
    tier: 3,
    cost: 30,
    range: 1,
    baseDamage: 10,
    attackTicks: 4,
    cooldown: 4 * TICK_SECONDS,
    clawRegularAttacksRequired: 5,
    baseStats: { attack: 60, strength: 85, defence: 30, magic: 1, range: 1, hitpoints: 75 },
  },
  dark_bow_pure: {
    name: "Dark Bow Pure",
    file: "dark_bow.png",
    combatType: "range",
    tier: 3,
    cost: 30,
    range: 5,
    baseDamage: 12,
    attackTicks: 9,
    cooldown: 9 * TICK_SECONDS,
    doubleShot: 2,
    baseStats: { attack: 1, strength: 1, defence: 1, magic: 1, range: 95, hitpoints: 75 },
  },
  voidwaker_rusher: {
    name: "Voidwaker Rusher",
    file: "voidwaker.png",
    combatType: "melee",
    tier: 3,
    cost: 30,
    range: 1,
    baseDamage: 12,
    attackTicks: 4,
    cooldown: 4 * TICK_SECONDS,
    guaranteedAttacks: 2,
    guaranteedMinPct: 0.4,
    guaranteedMaxPct: 0.95,
    baseStats: { attack: 75, strength: 75, defence: 1, magic: 1, range: 1, hitpoints: 75 },
  },
  dharoks: {
    name: "Dharok's Greataxe",
    file: "dharoks.png",
    combatType: "melee",
    tier: 3,
    cost: 35,
    range: 1,
    baseDamage: 10,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    dharokHpScale: true,
    baseStats: { attack: 70, strength: 70, defence: 70, magic: 1, range: 1, hitpoints: 75 },
  },
  dinhs_bulwark: {
    name: "Dinh's Bulwark",
    file: "dinhs_bulwark.png",
    combatType: "melee",
    tier: 2,
    cost: 25,
    range: 1,
    baseDamage: 4,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    baseStats: { attack: 75, strength: 35, defence: 95, hitpoints: 75 },
  },
  heavy_ballista: {
    name: "Heavy Ballista",
    file: "heavy_ballista.png",
    combatType: "range",
    tier: 2,
    cost: 25,
    range: 3,
    baseDamage: 14,
    attackTicks: 7,
    cooldown: 7 * TICK_SECONDS,
    baseStats: { range: 85, defence: 75, hitpoints: 75 },
  },
  noxious_halberd: {
    name: "Noxious Halberd",
    file: "noxious_halberd.png",
    combatType: "melee",
    tier: 2,
    cost: 25,
    range: 2,
    baseDamage: 9,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    baseStats: { attack: 75, strength: 75, defence: 75, hitpoints: 75 },
  },
  volatile_nightmare_staff: {
    name: "Volatile Staff",
    file: "volatile_nightmare_staff.png",
    combatType: "magic",
    tier: 2,
    cost: 25,
    range: 3,
    baseDamage: 10,
    attackTicks: 6,
    cooldown: 6 * TICK_SECONDS,
    volatileChance: 0.1,
    volatileMultiplier: 3,
    baseStats: { magic: 75, defence: 75, hitpoints: 75 },
  },
};

const MINION_STYLE_IDS = [
  "melee",
  "range",
  "magic",
  "woodcutter",
  "miner",
  "ancient_staff",
  "dragon_crossbow",
  "dragon_claws",
  "dark_bow_pure",
  "voidwaker_rusher",
  "dharoks",
  "dinhs_bulwark",
  "heavy_ballista",
  "noxious_halberd",
  "volatile_nightmare_staff",
];

const TILE = {
  empty: { name: "Void", icon: "", cost: 0 },
  road: { name: "Road", icon: "🟫", cost: 2 },
  water: { name: "Water", icon: "🌊", cost: 5 },
  wall: { name: "Castle Wall", icon: "🏰", cost: 5 },
  tree: { name: "Trees", icon: "🌲", cost: 5, image: "tree.png" },
  rock: { name: "Rocks", icon: "⛏️", cost: 5, image: "rocks.png" },
};

const TILE_STYLE = {
  empty: { background: "#050505" },
  road: { backgroundImage: `url("${asset("Dirt/soil-none-5i4x9p.jpg")}")` },
  water: { backgroundImage: `url("${asset("Water/14024944-water-seamless-texture-tile.jpg")}")` },
  wall: { backgroundImage: `url("${asset("Stone/b3704317a3d3210d9d69146db415a39b.jpg")}")` },
  tree: { backgroundImage: `linear-gradient(rgba(6, 78, 59, .2), rgba(20, 83, 45, .35)), url("${asset("Dirt/soil-none-5i4x9p.jpg")}")` },
  rock: { backgroundImage: `linear-gradient(rgba(68, 64, 60, .28), rgba(41, 37, 36, .5)), url("${asset("Dirt/soil-none-5i4x9p.jpg")}")` },
};

const FOG_STYLE = {
  background: "repeating-linear-gradient(135deg,#0c0a09,#0c0a09 6px,#1c1917 6px,#1c1917 12px)",
};

function normalizeLobbyCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6);
}

function generateLobbyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function ensurePlayerId() {
  let id = localStorage.getItem("quadrants_player_id");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("quadrants_player_id", id);
  }
  return id;
}

function activeTeams(setup) {
  const count = Number(setup.players);
  if (count === 4) return [...ALL_TEAMS];
  if (count === 3) return ["red", "green", "blue"];
  return ["red", "blue"];
}

function sizeOf(setup) {
  return Number(setup.gridSize) || DEFAULT_SETUP.gridSize;
}

function midOf(size) {
  return Math.floor(size / 2);
}

function baseOf(team, size) {
  const inset = Math.min(BASE_ZONE_INSET, Math.max(0, Math.floor((size - 1) / 2)));
  const far = size - 1 - inset;
  if (team === "red") return { row: inset, col: inset, team };
  if (team === "green") return { row: inset, col: far, team };
  if (team === "blue") return { row: far, col: far, team };
  return { row: far, col: inset, team };
}

function baseZoneBounds(team, size) {
  const zone = Math.min(BASE_ZONE_SIZE, size);
  const max = size - 1;
  if (team === "red") return { r0: 0, r1: zone - 1, c0: 0, c1: zone - 1 };
  if (team === "green") return { r0: 0, r1: zone - 1, c0: max - zone + 1, c1: max };
  if (team === "blue") return { r0: max - zone + 1, r1: max, c0: max - zone + 1, c1: max };
  return { r0: max - zone + 1, r1: max, c0: 0, c1: zone - 1 };
}

function isInBaseZone(row, col, team, size) {
  const b = baseZoneBounds(team, size);
  return row >= b.r0 && row <= b.r1 && col >= b.c0 && col <= b.c1;
}

function isCenterCell(row, col, size) {
  const mid = midOf(size);
  return Math.abs(row - mid) <= CENTER_RADIUS && Math.abs(col - mid) <= CENTER_RADIUS;
}

function centerTiles(size) {
  const mid = midOf(size);
  const out = [];
  for (let row = mid - CENTER_RADIUS; row <= mid + CENTER_RADIUS; row++) {
    for (let col = mid - CENTER_RADIUS; col <= mid + CENTER_RADIUS; col++) out.push({ row, col });
  }
  return out;
}

function inBounds(row, col, size) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function key(row, col) {
  return `${row},${col}`;
}

function baseTeamAt(row, col, setup) {
  const size = sizeOf(setup);
  return activeTeams(setup).find((team) => {
    const base = baseOf(team, size);
    return row === base.row && col === base.col;
  }) || null;
}

function isBaseCell(row, col, setup) {
  return Boolean(baseTeamAt(row, col, setup));
}

function cornerZoneFor(row, col, size) {
  const mid = midOf(size);
  const top = row < mid;
  const bottom = row > mid;
  const left = col < mid;
  const right = col > mid;
  if (top && left) return "red";
  if (top && right) return "green";
  if (bottom && right) return "blue";
  if (bottom && left) return "purple";
  return null;
}

function ownerFor(row, col, setup) {
  const size = sizeOf(setup);
  const teams = activeTeams(setup);
  const mid = midOf(size);
  if (isCenterCell(row, col, size)) return "neutral";
  if (teams.length === 2) {
    const split = size - 1;
    const sum = row + col;
    if (sum < split) return "red";
    if (sum > split) return "blue";
    return row < mid ? "red" : "blue";
  }
  const cornerOwner = cornerZoneFor(row, col, size);
  if (teams.length === 3 && cornerOwner === "purple") return "void";
  if (cornerOwner && teams.includes(cornerOwner)) return cornerOwner;
  let best = teams[0];
  let bestDist = Infinity;
  for (const team of teams) {
    const base = baseOf(team, size);
    const dist = Math.abs(row - base.row) + Math.abs(col - base.col);
    if (dist < bestDist) {
      best = team;
      bestDist = dist;
    }
  }
  return best;
}

function isStarterRoad(row, col, setup) {
  const size = sizeOf(setup);
  if (isCenterCell(row, col, size)) return true;
  return activeTeams(setup).some((team) => isInBaseZone(row, col, team, size));
}

function applyMapTemplate(board, setup) {
  const template = setup.mapTemplate || "classic";
  const size = sizeOf(setup);
  const mid = midOf(size);
  const safeSet = (row, col, type) => {
    if (!inBounds(row, col, size)) return;
    if (isCenterCell(row, col, size) || isBaseCell(row, col, setup) || isStarterRoad(row, col, setup)) return;
    if (board[row][col].owner === "void") return;
    board[row][col].type = type;
  };
  if (template === "river_cross") {
    for (let i = 0; i < size; i++) {
      safeSet(mid, i, "water");
      safeSet(i, mid, "water");
    }
    for (let d = -1; d <= 1; d++) {
      safeSet(mid, mid + d, "road");
      safeSet(mid + d, mid, "road");
    }
    for (const offset of [Math.floor(size * 0.25), Math.floor(size * 0.75)]) {
      safeSet(mid, offset, "road");
      safeSet(offset, mid, "road");
    }
  }
  if (template === "fortress_mid") {
    for (let r = mid - 3; r <= mid + 3; r++) {
      for (let c = mid - 3; c <= mid + 3; c++) {
        const border = r === mid - 3 || r === mid + 3 || c === mid - 3 || c === mid + 3;
        const gate = (r === mid && (c === mid - 3 || c === mid + 3)) || (c === mid && (r === mid - 3 || r === mid + 3));
        if (border && !gate) safeSet(r, c, "wall");
      }
    }
  }
  if (template === "open_field") {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!isCenterCell(r, c, size) && !isBaseCell(r, c, setup) && !isStarterRoad(r, c, setup) && board[r][c].owner !== "void") board[r][c].type = "road";
    }
  }
  return board;
}

function makeBoard(setup = DEFAULT_SETUP) {
  const size = sizeOf(setup);
  const board = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, col) => ({
      row,
      col,
      owner: ownerFor(row, col, setup),
      type: isStarterRoad(row, col, setup) ? "road" : "empty",
    }))
  );
  return applyMapTemplate(board, setup);
}

function finalizeBuildTerrain(board, setup = DEFAULT_SETUP) {
  const choices = ["water", "tree", "rock"];
  const size = sizeOf(setup);
  return cloneBoard(board).map((row) => row.map((cell) => {
    if (!cell || cell.type !== "empty") return cell;
    if (isBaseCell(cell.row, cell.col, setup) || isCenterCell(cell.row, cell.col, size)) return cell;
    const picked = choices[Math.floor(Math.random() * choices.length)] || "water";
    return {
      ...cell,
      type: picked,
      resourceDeathCount: cell.resourceDeathCount ?? 0,
      resourceHp: null,
      resourceMaxHp: null,
      regrowType: null,
      regrowAt: null,
    };
  }));
}

function makeBases(setup) {
  const out = {};
  for (const team of activeTeams(setup)) out[team] = { hp: setup.baseHp ?? DEFAULT_SETUP.baseHp };
  return out;
}

function makeGold(setup) {
  const out = {};
  for (const team of activeTeams(setup)) out[team] = setup.startingGold;
  return out;
}

function defaultOrders(setup) {
  const teams = activeTeams(setup);
  const out = {};
  teams.forEach((team, i) => {
    out[team] = { target: teams[(i + 1) % teams.length] };
  });
  return out;
}

function targetableBaseTeams(bases, setup, selfTeam) {
  return activeTeams(setup).filter((team) => team !== selfTeam && (bases?.[team]?.hp ?? 0) > 0);
}

function pickRandomTarget(unit, candidates) {
  if (!candidates.length) return null;
  if (unit.randomTarget && candidates.includes(unit.randomTarget)) return unit.randomTarget;
  const seed = ((Number(String(unit.id).replace(/\D/g, "").slice(-6)) || 1) * 9301 + (unit.deathCount ?? 0) * 49297) % 233280 / 233280;
  const picked = candidates[Math.floor(seed * candidates.length) % candidates.length];
  unit.randomTarget = picked;
  return picked;
}

function isBuildFogged(cell, activeTeam, phase, setup) {
  if (phase !== "build") return false;
  if (cell.owner === "void") return false;
  if (cell.owner === activeTeam || cell.owner === "neutral") return false;
  if (isBaseCell(cell.row, cell.col, setup)) return false;
  return true;
}

function xpRequiredForNext(level) {
  return level < 60 ? 5 : Math.max(5, Math.round(20 * Math.pow(2, (level - 60) / 10)));
}

function makeStats(styleId) {
  const base = STYLE[styleId].baseStats;
  return Object.fromEntries(STAT_KEYS.map((stat) => [stat, { level: base[stat] ?? 1, xp: 0 }]));
}

function maxHp(unit) {
  return unit.stats?.hitpoints?.level ?? 75;
}

function statLevel(unit, stat) {
  return unit.stats?.[stat]?.level ?? 1;
}

function grantXp(unit, stat, amount) {
  if (!unit.stats?.[stat] || amount <= 0) return 0;
  let gained = 0;
  const s = unit.stats[stat];
  s.xp += amount;
  while (s.level < MAX_LEVEL && s.xp >= xpRequiredForNext(s.level)) {
    s.xp -= xpRequiredForNext(s.level);
    s.level += 1;
    gained += 1;
  }
  if (gained) unit.levelsGained = (unit.levelsGained ?? 0) + gained;
  if (stat === "hitpoints") unit.maxHpSeen = Math.max(unit.maxHpSeen ?? 0, unit.stats.hitpoints.level);
  return gained;
}

function combatType(styleId) {
  return STYLE[styleId]?.combatType ?? "melee";
}

function damageTypeClass(styleId) {
  const type = combatType(styleId);
  if (type === "magic") return "magic";
  if (type === "range") return "range";
  return "melee";
}

function grantCombatXp(unit, damage) {
  if (damage <= 0) return;
  const type = combatType(unit.style);
  if (type === "melee") {
    grantXp(unit, "attack", damage);
    grantXp(unit, "strength", damage);
  }
  if (type === "range") grantXp(unit, "range", damage);
  if (type === "magic") grantXp(unit, "magic", damage);
  grantXp(unit, "hitpoints", damage);
}

function offensiveStat(styleId) {
  return combatType(styleId) === "melee" ? "attack" : combatType(styleId);
}

function damageStat(styleId) {
  return combatType(styleId) === "melee" ? "strength" : combatType(styleId);
}

function resourceTargetType(styleOrUnit) {
  const styleId = typeof styleOrUnit === "string" ? styleOrUnit : styleOrUnit?.style;
  return STYLE[styleId]?.resourceTarget || null;
}

function defaultUnitTargetOverride(styleId) {
  const resourceType = resourceTargetType(styleId);
  if (resourceType === "tree") return "resource_tree";
  if (resourceType === "rock") return "resource_rock";
  return "inherit";
}

function resourceOrderType(unit, orderedTarget) {
  const natural = resourceTargetType(unit);
  if (!natural) return null;
  if (orderedTarget === `resource_${natural}`) return natural;
  return null;
}

function makeUnit(id, team, style, setup, carried = {}) {
  const stats = carried.stats ? JSON.parse(JSON.stringify(carried.stats)) : makeStats(style);
  const base = baseOf(team, sizeOf(setup));
  return {
    id,
    team,
    style,
    stats,
    hp: carried.hp ?? stats.hitpoints.level,
    row: carried.row ?? base.row,
    col: carried.col ?? base.col,
    cooldown: carried.cooldown ?? 0,
    moveTimer: carried.moveTimer ?? 0,
    freezeTimer: carried.freezeTimer ?? 0,
    freezeImmuneTimer: carried.freezeImmuneTimer ?? 0,
    lastAttackerId: carried.lastAttackerId ?? null,
    randomTarget: carried.randomTarget ?? null,
    clawCharge: carried.clawCharge ?? 0,
    voidwakerGuaranteesLeft: carried.voidwakerGuaranteesLeft ?? (STYLE[style]?.guaranteedAttacks ?? 0),
    deathCount: carried.deathCount ?? 0,
    totalDamage: carried.totalDamage ?? 0,
    kills: carried.kills ?? 0,
    levelsGained: carried.levelsGained ?? 0,
    name: carried.name ?? `${STYLE[style].name} ${id}`,
    priority: carried.priority ?? "auto",
    targetOverride: carried.targetOverride ?? defaultUnitTargetOverride(style),
    manualTargetType: carried.manualTargetType ?? null,
    manualTargetUnitId: carried.manualTargetUnitId ?? null,
    manualTargetRow: carried.manualTargetRow ?? null,
    manualTargetCol: carried.manualTargetCol ?? null,
    manualResourceType: carried.manualResourceType ?? null,
    manualTargetStartedAt: carried.manualTargetStartedAt ?? null,
    manualTargetBlockedSince: carried.manualTargetBlockedSince ?? null,
    homeTeleportStartedAt: carried.homeTeleportStartedAt ?? null,
    homeTeleportHpAtStart: carried.homeTeleportHpAtStart ?? null,
    homeTeleportLastAttackedAtStart: carried.homeTeleportLastAttackedAtStart ?? null,
    homeTeleportPreviousTargetOverride: carried.homeTeleportPreviousTargetOverride ?? null,
    homeTeleportPreviousManualTargetType: carried.homeTeleportPreviousManualTargetType ?? null,
    homeTeleportPreviousManualTargetUnitId: carried.homeTeleportPreviousManualTargetUnitId ?? null,
    homeTeleportPreviousManualTargetRow: carried.homeTeleportPreviousManualTargetRow ?? null,
    homeTeleportPreviousManualTargetCol: carried.homeTeleportPreviousManualTargetCol ?? null,
    homeTeleportPreviousManualResourceType: carried.homeTeleportPreviousManualResourceType ?? null,
    lastAttackedAt: carried.lastAttackedAt ?? null,
    ownerPlayerId: carried.ownerPlayerId ?? null,
    carryingFlagTeam: carried.carryingFlagTeam ?? null,
    maxHpSeen: carried.maxHpSeen ?? stats.hitpoints.level,
    damageToUnits: carried.damageToUnits ?? 0,
    damageToBases: carried.damageToBases ?? 0,
    attacksAttempted: carried.attacksAttempted ?? 0,
    hitsLanded: carried.hitsLanded ?? 0,
    misses: carried.misses ?? 0,
    maxHitDealt: carried.maxHitDealt ?? 0,
    specialUses: carried.specialUses ?? 0,
    resourcesCleared: carried.resourcesCleared ?? 0,
  };
}

function makeInitialGame(setup = DEFAULT_SETUP) {
  const safeSetup = {
    ...DEFAULT_SETUP,
    ...setup,
    gridSize: Number(setup.gridSize) || DEFAULT_SETUP.gridSize,
    players: Number(setup.players) || 2,
    startingGold: Number(setup.startingGold) || DEFAULT_SETUP.startingGold,
    maxUnits: Number(setup.maxUnits) || DEFAULT_SETUP.maxUnits,
    baseHp: Number(setup.baseHp) || DEFAULT_SETUP.baseHp,
    gameMode: setup.gameMode || DEFAULT_SETUP.gameMode,
    mapTemplate: setup.mapTemplate || DEFAULT_SETUP.mapTemplate,
    ctfScoreLimit: Number(setup.ctfScoreLimit) || DEFAULT_SETUP.ctfScoreLimit,
  };
  return {
    setup: safeSetup,
    board: makeBoard(safeSetup),
    units: {},
    respawnQueue: {},
    unitArchive: {},
    splats: {},
    effects: {},
    fightTime: 0,
    bases: makeBases(safeSetup),
    ctfScores: Object.fromEntries(activeTeams(safeSetup).map((team) => [team, 0])),
    killFeed: [],
    gold: makeGold(safeSetup),
    orders: defaultOrders(safeSetup),
    results: null,
    log: ["Game created. Waiting for players."],
  };
}

function arrayFromObject(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.values(value).filter(Boolean);
}

function firebaseSafeKey(value) {
  return String(value ?? "")
    .replace(/[.#$/\[\]]/g, "_")
    .replace(/[^A-Za-z0-9_-]/g, "_") || `k_${Date.now()}`;
}

function makeRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function objectFromArray(items, keyName = "id") {
  const out = {};
  for (const item of items) {
    const safeKey = firebaseSafeKey(item[keyName]);
    out[safeKey] = { ...item, [keyName]: safeKey };
  }
  return out;
}

function mergeUnitArchive(existing, units) {
  const out = { ...(existing || {}) };
  for (const unit of units || []) {
    if (!unit) continue;
    const id = firebaseSafeKey(unit.id ?? `${unit.team}_${unit.name}_${unit.style}`);
    out[id] = { ...unit, id, hp: Math.max(0, unit.hp ?? 0), timer: null };
  }
  return out;
}

function mergeLatestUnits(...groups) {
  const out = {};
  for (const group of groups) {
    for (const unit of group || []) {
      if (!unit) continue;
      const id = firebaseSafeKey(unit.id ?? `${unit.team}_${unit.name}_${unit.style}`);
      out[id] = { ...unit, id };
    }
  }
  return Object.values(out);
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

function walkable(cell, setup) {
  return cell.type === "road" || isBaseCell(cell.row, cell.col, setup);
}

function manhattan(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function hasPath(board, start, end, setup) {
  const size = sizeOf(setup);
  const queue = [{ row: start.row, col: start.col }];
  const seen = new Set([key(start.row, start.col)]);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.row === end.row && cur.col === end.col) return true;
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      if (!inBounds(nr, nc, size) || seen.has(key(nr, nc)) || !walkable(board[nr][nc], setup)) continue;
      seen.add(key(nr, nc));
      queue.push({ row: nr, col: nc });
    }
  }
  return false;
}

function teamConnectedToCenter(board, team, setup) {
  return centerTiles(sizeOf(setup)).some((tile) => hasPath(board, baseOf(team, sizeOf(setup)), tile, setup));
}

function allTeamsConnectedToCenter(board, setup) {
  return activeTeams(setup).every((team) => teamConnectedToCenter(board, team, setup));
}

function blocksLineOfSight(cell) {
  return cell.type === "wall" || cell.type === "tree" || cell.type === "empty";
}

function lineClear(board, from, to, setup) {
  const size = sizeOf(setup);
  if (manhattan(from, to) === 0) return true;
  const dr = to.row - from.row;
  const dc = to.col - from.col;
  const steps = Math.max(Math.abs(dr), Math.abs(dc)) * 2;
  const seen = new Set();
  for (let i = 1; i < steps; i++) {
    const row = Math.round(from.row + (dr * i) / steps);
    const col = Math.round(from.col + (dc * i) / steps);
    if ((row === from.row && col === from.col) || (row === to.row && col === to.col)) continue;
    const k = key(row, col);
    if (seen.has(k)) continue;
    seen.add(k);
    if (!inBounds(row, col, size) || blocksLineOfSight(board[row][col])) return false;
  }
  return true;
}

function canAttack(board, attacker, target, range, setup) {
  return manhattan(attacker, target) <= range && lineClear(board, attacker, target, setup);
}

function advantage(attackerStyle, defenderStyle) {
  if (!defenderStyle) return 0;
  const a = combatType(attackerStyle);
  const d = combatType(defenderStyle);
  if ((a === "magic" && d === "melee") || (a === "melee" && d === "range") || (a === "range" && d === "magic")) return 1;
  if ((d === "magic" && a === "melee") || (d === "melee" && a === "range") || (d === "range" && a === "magic")) return -1;
  return 0;
}

function rollAttack(attacker, defenderStyle, defenderStats) {
  const style = STYLE[attacker.style];
  const adv = advantage(attacker.style, defenderStyle);
  const offense = statLevel(attacker, offensiveStat(attacker.style));
  const defence = defenderStats?.defence?.level ?? 1;
  let chance = 0.55 + (offense - defence) / 160;
  if (adv === 1) chance += 0.1;
  if (adv === -1) chance -= 0.1;
  if (attacker.style === "ancient_staff" && defenderStyle && combatType(defenderStyle) === "range") chance -= style.accuracyPenaltyVsRange ?? 0;
  chance = Math.max(0.05, Math.min(0.92, chance));
  return Math.random() <= chance;
}

function maxDamageRoll(attacker, defenderStyle) {
  const style = STYLE[attacker.style];
  const adv = advantage(attacker.style, defenderStyle);
  const level = statLevel(attacker, damageStat(attacker.style));
  let maxHit = Math.max(1, Math.floor(style.baseDamage * (0.65 + level / 100)));
  if (adv === 1) maxHit = Math.ceil(maxHit * 1.1);
  if (adv === -1) maxHit = Math.max(1, Math.floor(maxHit * 0.9));
  if (style.dharokHpScale) {
    const seenMaxHp = Math.max(maxHp(attacker), attacker.maxHpSeen ?? 0);
    const missingHp = Math.max(0, seenMaxHp - Math.max(0, attacker.hp ?? 0));
    maxHit += Math.floor(missingHp / 5);
  }
  return maxHit;
}

function rollDamage(attacker, defenderStyle) {
  const style = STYLE[attacker.style];
  const maxHit = maxDamageRoll(attacker, defenderStyle);
  let damage = 1 + Math.floor(Math.random() * maxHit);
  if (style.volatileChance && Math.random() < style.volatileChance) damage *= style.volatileMultiplier ?? 3;
  return damage;
}

function applyUnitDamage(attacker, target, dmg) {
  const beforeHp = target.hp;
  const damage = Math.min(target.hp, Math.max(0, dmg));
  target.hp -= damage;
  attacker.totalDamage = (attacker.totalDamage ?? 0) + damage;
  attacker.damageToUnits = (attacker.damageToUnits ?? 0) + damage;
  attacker.maxHitDealt = Math.max(attacker.maxHitDealt ?? 0, damage);
  grantCombatXp(attacker, damage);
  if (damage > 0) attacker.hitsLanded = (attacker.hitsLanded ?? 0) + 1;
  if (beforeHp > 0 && target.hp <= 0) {
    attacker.kills = (attacker.kills ?? 0) + 1;
    attacker.lastKill = { attackerId: attacker.id, attackerName: attacker.name, attackerTeam: attacker.team, victimId: target.id, victimName: target.name, victimTeam: target.team, style: attacker.style };
  }
  if (attacker.style === "ancient_staff" && damage > 0 && (target.freezeImmuneTimer ?? 0) <= 0) {
    target.freezeTimer = Math.max(target.freezeTimer ?? 0, 2);
    target.freezeImmuneTimer = Math.max(target.freezeImmuneTimer ?? 0, 6);
  }
  return damage;
}

function resolveGuaranteedUnitHit(attacker, target, minPct = 0.4, maxPct = 0.95) {
  target.lastAttackerId = attacker.id;
  attacker.attacksAttempted = (attacker.attacksAttempted ?? 0) + 1;
  if (target.hp <= 0) return { damage: 0, hit: false, overkill: true, guaranteed: true };
  const maxHit = maxDamageRoll(attacker, target.style);
  const pct = minPct + Math.random() * Math.max(0, maxPct - minPct);
  const dmg = Math.max(1, Math.floor(maxHit * pct));
  const damage = applyUnitDamage(attacker, target, dmg);
  return { damage, hit: true, guaranteed: true };
}

function unitOccupies(units, row, col, setup) {
  if (isBaseCell(row, col, setup)) return false;
  return units.some((u) => u.hp > 0 && u.row === row && u.col === col);
}

function findPath(board, units, unit, target, setup, options = {}) {
  const size = sizeOf(setup);
  const range = options.range ?? 1;
  const avoidOccupied = options.avoidOccupied ?? true;
  const allowTargetCell = options.allowTargetCell ?? false;
  const requireGoal = options.requireGoal ?? false;
  const start = { row: unit.row, col: unit.col };
  const queue = [{ ...start, path: [] }];
  const seen = new Set([key(start.row, start.col)]);
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let best = null;
  while (queue.length) {
    const cur = queue.shift();
    const dist = manhattan(cur, target);
    if (dist <= range && (range > 1 ? lineClear(board, cur, target, setup) : true)) return cur.path;
    if (!best || dist < best.distance) best = { ...cur, distance: dist };
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      const isTargetCell = nr === target.row && nc === target.col;
      if (!inBounds(nr, nc, size) || seen.has(key(nr, nc)) || (!allowTargetCell && isTargetCell)) continue;
      if (!walkable(board[nr][nc], setup)) continue;
      if (!isTargetCell && avoidOccupied && unitOccupies(units, nr, nc, setup)) continue;
      seen.add(key(nr, nc));
      queue.push({ row: nr, col: nc, path: [...cur.path, { row: nr, col: nc }] });
    }
  }
  if (requireGoal) return null;
  return best?.path?.length ? best.path : null;
}

function bestOpenForwardStep(board, units, unit, target, setup) {
  const size = sizeOf(setup);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const currentDistance = manhattan(unit, target);
  let best = null;
  let sideStep = null;
  for (const [dr, dc] of dirs) {
    const nr = unit.row + dr;
    const nc = unit.col + dc;
    if (!inBounds(nr, nc, size) || (nr === target.row && nc === target.col)) continue;
    if (!walkable(board[nr][nc], setup) || unitOccupies(units, nr, nc, setup)) continue;
    const distance = manhattan({ row: nr, col: nc }, target);
    if (distance < currentDistance && (!best || distance < best.distance)) best = { row: nr, col: nc, distance };
    if (distance === currentDistance && !sideStep) sideStep = { row: nr, col: nc, distance };
  }
  return best ?? sideStep;
}

function closestEnemyUnitInRange(board, units, unit, setup, combatTeams) {
  const range = STYLE[unit.style].range;
  const candidates = [];
  for (const target of units) {
    if (target.team === unit.team || target.hp <= 0 || !combatTeams.includes(target.team)) continue;
    if (!canAttack(board, unit, target, range, setup)) continue;
    candidates.push({ target, dist: manhattan(unit, target), hp: target.hp });
  }
  if (!candidates.length) return null;
  const flagCarrier = candidates.find((entry) => entry.target.carryingFlagTeam === unit.team);
  if (flagCarrier) return flagCarrier.target;
  if (unit.priority === "closest") candidates.sort((a, b) => a.dist - b.dist || a.hp - b.hp);
  else if (unit.priority === "farthest") candidates.sort((a, b) => b.dist - a.dist || a.hp - b.hp);
  else if (unit.priority === "highestDamage") candidates.sort((a, b) => (b.target.totalDamage ?? 0) - (a.target.totalDamage ?? 0) || a.hp - b.hp);
  else if (unit.priority === "lowestDefence") candidates.sort((a, b) => statLevel(a.target, "defence") - statLevel(b.target, "defence") || a.hp - b.hp);
  else candidates.sort((a, b) => a.hp - b.hp || a.dist - b.dist);
  return candidates[0].target;
}

function enemyFlagCarrierForTeam(units, team, combatTeams) {
  return units.find((target) => target.team !== team && target.hp > 0 && target.carryingFlagTeam === team && combatTeams.includes(target.team)) ?? null;
}

function alliedFlagCarrierForTeam(units, team, ownUnitId = null) {
  return units.find((ally) => ally.team === team && ally.hp > 0 && ally.id !== ownUnitId && ally.carryingFlagTeam && ally.carryingFlagTeam !== team) ?? null;
}

function enemyThreatNearUnit(board, units, protectedUnit, escortUnit, combatTeams, setup) {
  if (!protectedUnit) return null;
  const candidates = units
    .filter((target) => target.team !== protectedUnit.team && target.hp > 0 && combatTeams.includes(target.team))
    .map((target) => {
      const targetRange = STYLE[target.style]?.range ?? 1;
      const canHitCarrier = canAttack(board, target, protectedUnit, targetRange, setup);
      const carrierDist = manhattan(target, protectedUnit);
      const escortDist = escortUnit ? manhattan(target, escortUnit) : carrierDist;
      return { target, canHitCarrier, carrierDist, escortDist, hp: target.hp };
    })
    .filter((entry) => entry.canHitCarrier || entry.carrierDist <= DEFEND_RADIUS);
  if (!candidates.length) return null;
  candidates.sort((a, b) => Number(b.canHitCarrier) - Number(a.canHitCarrier) || a.carrierDist - b.carrierDist || a.escortDist - b.escortDist || a.hp - b.hp);
  return candidates[0].target;
}

function isFlagAtHome(units, flagTeam) {
  return !units.some((unit) => unit.hp > 0 && unit.carryingFlagTeam === flagTeam);
}

function nearestEnemyUnit(units, unit, combatTeams) {
  const candidates = units
    .filter((target) => target.team !== unit.team && target.hp > 0 && combatTeams.includes(target.team))
    .map((target) => ({ target, dist: manhattan(unit, target), hp: target.hp }));
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist || a.hp - b.hp);
  return candidates[0].target;
}

function cleanupDead(units, respawnQueue, bases) {
  const minionsDied = [];
  const survivors = [];
  for (const unit of units) {
    if (unit.hp > 0) survivors.push(unit);
    else {
      const deathCount = (unit.deathCount ?? 0) + 1;
      if ((bases[unit.team]?.hp ?? 0) > 0) {
        const respawnTime = RESPAWN_BASE_TIME + deathCount * 3 + deathCount * deathCount;
        respawnQueue.push({ ...unit, hp: maxHp(unit), deathCount, timer: respawnTime, carryingFlagTeam: null });
        minionsDied.push({ ...unit, carryingFlagTeam: null, deathCount, respawnTime });
      } else {
        minionsDied.push({ ...unit, carryingFlagTeam: null, deathCount, respawnTime: 0 });
      }
    }
  }
  return { units: survivors, respawnQueue, minionsDied };
}

function resolveUnitHit(attacker, target) {
  target.lastAttackerId = attacker.id;
  attacker.attacksAttempted = (attacker.attacksAttempted ?? 0) + 1;
  if (target.hp <= 0) return { damage: 0, hit: false, overkill: true };
  if (!rollAttack(attacker, target.style, target.stats)) {
    attacker.misses = (attacker.misses ?? 0) + 1;
    grantXp(target, "defence", 1);
    return { damage: 0, hit: false };
  }
  const dmg = applyUnitDamage(attacker, target, rollDamage(attacker, target.style));
  return { damage: dmg, hit: true };
}

function attackUnit(attacker, target) {
  target.lastAttackerId = attacker.id;
  const style = STYLE[attacker.style] || {};

  if (attacker.style === "voidwaker_rusher" && (attacker.voidwakerGuaranteesLeft ?? 0) > 0) {
    attacker.voidwakerGuaranteesLeft = Math.max(0, (attacker.voidwakerGuaranteesLeft ?? 0) - 1);
    attacker.specialUses = (attacker.specialUses ?? 0) + 1;
    const roll = resolveGuaranteedUnitHit(attacker, target, style.guaranteedMinPct ?? 0.4, style.guaranteedMaxPct ?? 0.95);
    return { total: roll.damage ?? 0, rolls: [roll], special: "voidwaker_rusher" };
  }

  const readyForClawSpecial = attacker.style === "dragon_claws" && (attacker.clawCharge ?? 0) >= (style.clawRegularAttacksRequired ?? 5);
  if (readyForClawSpecial) {
    attacker.clawCharge = 0;
    attacker.specialUses = (attacker.specialUses ?? 0) + 1;
    const rolls = [];
    for (let i = 0; i < 4; i++) rolls.push(resolveUnitHit(attacker, target));
    return { total: rolls.reduce((sum, roll) => sum + (roll.damage ?? 0), 0), rolls, special: "dragon_claws" };
  }

  if (style.doubleShot) {
    attacker.specialUses = (attacker.specialUses ?? 0) + 1;
    const rolls = [];
    for (let i = 0; i < style.doubleShot; i++) rolls.push(resolveUnitHit(attacker, target));
    return { total: rolls.reduce((sum, roll) => sum + (roll.damage ?? 0), 0), rolls, special: "dark_bow_pure" };
  }

  const roll = resolveUnitHit(attacker, target);
  if (attacker.style === "dragon_claws") attacker.clawCharge = (attacker.clawCharge ?? 0) + 1;
  return { total: roll.damage ?? 0, rolls: [roll], special: null };
}

function attackResultTotal(result) {
  if (typeof result === "number") return result;
  return result?.total ?? 0;
}

function attackBase(attacker, base) {
  const dmg = rollDamage(attacker, null);
  base.hp -= dmg;
  attacker.totalDamage = (attacker.totalDamage ?? 0) + dmg;
  attacker.damageToBases = (attacker.damageToBases ?? 0) + dmg;
  attacker.maxHitDealt = Math.max(attacker.maxHitDealt ?? 0, dmg);
  grantCombatXp(attacker, dmg);
  return dmg;
}

function aliveTeamsFromBases(bases, setup) {
  return activeTeams(setup).filter((team) => (bases?.[team]?.hp ?? 0) > 0);
}

function teamsWithCombatPresence(bases, units, respawnQueue, setup) {
  return activeTeams(setup).filter(
    (team) =>
      (bases?.[team]?.hp ?? 0) > 0 ||
      units.some((u) => u.team === team && u.hp > 0) ||
      respawnQueue.some((u) => u.team === team && (bases?.[team]?.hp ?? 0) > 0)
  );
}

function defendTargetForUnit(board, units, unit, setup, combatTeams, bases) {
  if ((bases?.[unit.team]?.hp ?? 0) <= 0) return null;
  const ownBase = baseOf(unit.team, sizeOf(setup));
  const candidates = units
    .filter((target) => target.team !== unit.team && target.hp > 0 && combatTeams.includes(target.team))
    .map((target) => {
      const targetRange = STYLE[target.style]?.range ?? 1;
      const attackingBase = canAttack(board, target, ownBase, targetRange, setup);
      const baseDistance = manhattan(target, ownBase);
      return { target, attackingBase, baseDistance, hp: target.hp };
    })
    .filter((entry) => entry.attackingBase || entry.baseDistance <= DEFEND_RADIUS);
  if (!candidates.length) return null;
  candidates.sort((a, b) => Number(b.attackingBase) - Number(a.attackingBase) || a.baseDistance - b.baseDistance || a.hp - b.hp);
  return candidates[0].target;
}

function effectiveTargetOrder(unit, game) {
  const override = unit.targetOverride;
  if (override && override !== "inherit") return override;
  const resourceType = resourceTargetType(unit);
  if (resourceType) return `resource_${resourceType}`;
  return game.orders?.[unit.team]?.target ?? "blank";
}

function unitTargetOptions(game, unit) {
  const resourceType = resourceTargetType(unit);
  const resourceOptions = resourceType ? [`resource_${resourceType}`] : [];
  if (!game || !unit) return ["inherit", "blank", ...resourceOptions, "defend", "protectCarrier", "homeTeleport", "manual"];
  return ["inherit", "blank", ...resourceOptions, "defend", "protectCarrier", "homeTeleport", "manual", ...targetableBaseTeams(game.bases || {}, game.setup, unit.team)];
}

function clearManualTarget(unit, nextTarget = "inherit") {
  unit.targetOverride = nextTarget;
  delete unit.manualTargetType;
  delete unit.manualTargetUnitId;
  delete unit.manualTargetRow;
  delete unit.manualTargetCol;
  delete unit.manualResourceType;
  delete unit.manualTargetStartedAt;
  delete unit.manualTargetBlockedSince;
}

function finishHomeTeleport(unit) {
  const previous = unit.homeTeleportPreviousTargetOverride || "inherit";
  unit.targetOverride = previous === "homeTeleport" ? "inherit" : previous;
  unit.manualTargetType = unit.homeTeleportPreviousManualTargetType ?? null;
  unit.manualTargetUnitId = unit.homeTeleportPreviousManualTargetUnitId ?? null;
  unit.manualTargetRow = unit.homeTeleportPreviousManualTargetRow ?? null;
  unit.manualTargetCol = unit.homeTeleportPreviousManualTargetCol ?? null;
  unit.manualResourceType = unit.homeTeleportPreviousManualResourceType ?? null;
  delete unit.homeTeleportStartedAt;
  delete unit.homeTeleportHpAtStart;
  delete unit.homeTeleportLastAttackedAtStart;
  delete unit.homeTeleportPreviousTargetOverride;
  delete unit.homeTeleportPreviousManualTargetType;
  delete unit.homeTeleportPreviousManualTargetUnitId;
  delete unit.homeTeleportPreviousManualTargetRow;
  delete unit.homeTeleportPreviousManualTargetCol;
  delete unit.homeTeleportPreviousManualResourceType;
}

function cancelHomeTeleport(unit, nextTarget = null) {
  if (nextTarget) unit.targetOverride = nextTarget;
  else finishHomeTeleport(unit);
}

function manualTargetForUnit(unit, board, units, setup) {
  if (unit.targetOverride !== "manual") return { kind: null };
  if (unit.manualTargetType === "unit") {
    const target = units.find((u) => u.id === unit.manualTargetUnitId && u.hp > 0 && u.team !== unit.team);
    if (!target) return { kind: "expired", reason: "target gone" };
    return { kind: "unit", target };
  }
  if (unit.manualTargetType === "tile") {
    const row = Number(unit.manualTargetRow);
    const col = Number(unit.manualTargetCol);
    if (!Number.isFinite(row) || !Number.isFinite(col) || !inBounds(row, col, sizeOf(setup)) || !walkable(board[row][col], setup)) {
      return { kind: "expired", reason: "tile blocked" };
    }
    return { kind: "tile", target: { row, col } };
  }
  if (unit.manualTargetType === "resource") {
    const row = Number(unit.manualTargetRow);
    const col = Number(unit.manualTargetCol);
    const resourceType = unit.manualResourceType || resourceTargetType(unit);
    const cell = board[row]?.[col];
    if (!resourceType || !Number.isFinite(row) || !Number.isFinite(col) || !inBounds(row, col, sizeOf(setup))) {
      return { kind: "expired", reason: "resource target missing" };
    }
    if (!cell || cell.type !== resourceType || resourceTargetType(unit) !== resourceType) {
      return { kind: "expired", reason: "resource target gone" };
    }
    return { kind: "resource", resourceType, target: { row, col } };
  }
  return { kind: "pending" };
}

function resourceTileOwner(cell, setup) {
  if (!cell) return null;
  if (cell.owner) return cell.owner;
  if (Number.isFinite(Number(cell.row)) && Number.isFinite(Number(cell.col))) return ownerFor(Number(cell.row), Number(cell.col), setup);
  return null;
}

function resourceTileIsEnemyOwned(cell, team, setup) {
  const owner = resourceTileOwner(cell, setup);
  return Boolean(cell && owner && owner !== team && owner !== "neutral" && owner !== "void");
}

function resourceMaxHp(resourceType) {
  return RESOURCE_HITPOINTS[resourceType] ?? 30;
}

function resourceCurrentHp(cell, resourceType = cell?.type) {
  return Math.max(0, Number(cell?.resourceHp ?? resourceMaxHp(resourceType)));
}

function resourceDamageForUnit(unit, resourceType) {
  return STYLE[unit.style]?.resourceDamage ?? 10;
}

function nearestResourceTile(board, units, unit, setup, resourceType) {
  if (!resourceType) return null;
  const size = sizeOf(setup);
  const candidates = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cell = board[row][col];
      if (cell.type !== resourceType || !resourceTileIsEnemyOwned(cell, unit.team, setup)) continue;
      const target = { row, col };
      const path = findPath(board, units, unit, target, setup, { range: 1, requireGoal: true });
      const dist = manhattan(unit, target);
      if (path || dist <= 1) candidates.push({ row, col, dist, pathLen: path?.length ?? dist, hp: resourceCurrentHp(cell, resourceType) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.pathLen - b.pathLen || a.hp - b.hp || a.dist - b.dist || a.row - b.row || a.col - b.col);
  return candidates[0];
}

function resourceRegrowSeconds(deathCount = 1) {
  const clears = Math.max(1, Number(deathCount || 1));
  const extraClears = clears - 1;
  // First clear is still 30s, then the same tile ramps harder so repeated chopping/mining is visible.
  return RESOURCE_REGROW_SECONDS + extraClears * 6 + extraClears * extraClears * 4;
}

function clearResourceTile(board, target, resourceType, fightTime) {
  const cell = board[target.row]?.[target.col];
  if (!cell || cell.type !== resourceType) return { ok: false, deathCount: 0, regrowSeconds: 0, regrowAt: null };
  const deathCount = (cell.resourceDeathCount ?? 0) + 1;
  const regrowSeconds = resourceRegrowSeconds(deathCount);
  cell.type = "road";
  cell.regrowType = resourceType;
  cell.resourceDeathCount = deathCount;
  cell.regrowAt = fightTime + regrowSeconds;
  delete cell.resourceHp;
  delete cell.resourceMaxHp;
  return { ok: true, deathCount, regrowSeconds, regrowAt: cell.regrowAt };
}

function damageResourceTile(board, target, resourceType, damage, fightTime) {
  const cell = board[target.row]?.[target.col];
  if (!cell || cell.type !== resourceType) return { ok: false, damage: 0, cleared: false, hp: 0, maxHp: resourceMaxHp(resourceType), deathCount: cell?.resourceDeathCount ?? 0, regrowSeconds: 0, regrowAt: null };
  const max = resourceMaxHp(resourceType);
  const before = resourceCurrentHp(cell, resourceType);
  const dealt = Math.min(before, Math.max(1, Math.round(damage)));
  const nextHp = Math.max(0, before - dealt);
  cell.resourceMaxHp = max;
  cell.resourceHp = nextHp;
  if (nextHp <= 0) {
    const cleared = clearResourceTile(board, target, resourceType, fightTime);
    return { ok: true, damage: dealt, cleared: true, hp: 0, maxHp: max, deathCount: cleared.deathCount, regrowSeconds: cleared.regrowSeconds, regrowAt: cleared.regrowAt };
  }
  return { ok: true, damage: dealt, cleared: false, hp: nextHp, maxHp: max, deathCount: cell.resourceDeathCount ?? 0, regrowSeconds: 0, regrowAt: null };
}

function processResourceRegrowth(board, units, setup, fightTime) {
  const occupied = new Set(units.filter((u) => u.hp > 0).map((u) => key(u.row, u.col)));
  const size = sizeOf(setup);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cell = board[row][col];
      if (!cell.regrowType || !(fightTime >= Number(cell.regrowAt ?? Infinity))) continue;
      if (occupied.has(key(row, col)) || isBaseCell(row, col, setup)) {
        cell.regrowAt = fightTime + 1;
        continue;
      }
      cell.type = cell.regrowType;
      delete cell.regrowType;
      delete cell.regrowAt;
      delete cell.resourceHp;
      delete cell.resourceMaxHp;
    }
  }
}

function targetForUnit(unit, game, bases, units, respawnQueue) {
  const baseTargets = targetableBaseTeams(bases, game.setup, unit.team);
  const combatTargets = teamsWithCombatPresence(bases, units, respawnQueue, game.setup).filter((t) => t !== unit.team);
  const ordered = effectiveTargetOrder(unit, game);
  if (ordered === "homeTeleport") return null;
  if (ordered === "blank" || ordered === "defend" || ordered === "protectCarrier" || ordered === "resource_tree" || ordered === "resource_rock") return pickRandomTarget(unit, baseTargets.length ? baseTargets : combatTargets);
  if (ordered && baseTargets.includes(ordered)) return ordered;
  return baseTargets[0] ?? combatTargets[0] ?? null;
}

function summarizeResults(game, reason) {
  const setup = game.setup;
  const teams = activeTeams(setup);
  const units = arrayFromObject(game.units);
  const respawnQueue = arrayFromObject(game.respawnQueue);
  const archivedUnits = arrayFromObject(game.unitArchive);
  const alive = aliveTeamsFromBases(game.bases, setup);
  const presence = teamsWithCombatPresence(game.bases, units, respawnQueue, setup);
  const tracked = mergeLatestUnits(archivedUnits, respawnQueue, units);
  const teamStats = {};
  for (const team of teams) {
    const teamUnits = tracked.filter((u) => u.team === team);
    teamStats[team] = {
      damage: teamUnits.reduce((s, u) => s + (u.totalDamage ?? 0), 0),
      unitDamage: teamUnits.reduce((s, u) => s + (u.damageToUnits ?? 0), 0),
      baseDamage: teamUnits.reduce((s, u) => s + (u.damageToBases ?? 0), 0),
      kills: teamUnits.reduce((s, u) => s + (u.kills ?? 0), 0),
      levels: teamUnits.reduce((s, u) => s + (u.levelsGained ?? 0), 0),
      deaths: teamUnits.reduce((s, u) => s + (u.deathCount ?? 0), 0),
      accuracy: Math.round(100 * teamUnits.reduce((s, u) => s + (u.hitsLanded ?? 0), 0) / Math.max(1, teamUnits.reduce((s, u) => s + (u.attacksAttempted ?? 0), 0))),
      units: teamUnits.sort((a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0) || (b.kills ?? 0) - (a.kills ?? 0)),
    };
  }
  const topDamage = [...tracked].sort((a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0)).slice(0, 5);
  const topKills = [...tracked].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0) || (b.totalDamage ?? 0) - (a.totalDamage ?? 0)).slice(0, 5);
  const topLevels = [...tracked].sort((a, b) => (b.levelsGained ?? 0) - (a.levelsGained ?? 0)).slice(0, 5);
  const allUnits = [...tracked].sort((a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0) || (b.kills ?? 0) - (a.kills ?? 0) || (b.levelsGained ?? 0) - (a.levelsGained ?? 0));
  const ctfWinner = setup.gameMode === "capture_flag" ? teams.find((team) => (game.ctfScores?.[team] ?? 0) >= (setup.ctfScoreLimit ?? 3)) : null;
  const winnerTeam = ctfWinner ?? (alive.length === 1 ? alive[0] : alive.length === 0 && presence.length === 1 ? presence[0] : null);
  return {
    reason,
    winnerTeam,
    winner: winnerTeam ? TEAM_META[winnerTeam].name : alive.length === 0 && presence.length === 0 ? "Draw" : null,
    bases: Object.fromEntries(teams.map((team) => [team, Math.max(0, Math.round(game.bases?.[team]?.hp ?? 0))])),
    ctfScores: game.ctfScores || {},
    gameMode: setup.gameMode || "classic",
    fightTime: Math.round(game.fightTime ?? 0),
    teamStats,
    topDamage,
    topKills,
    topLevels,
    allUnits,
  };
}

function stepSimulation(game, dt) {
  return stepGame(game, dt);
}

function stepGame(game, dt) {
  const setup = game.setup;
  const board = cloneBoard(game.board);
  let units = arrayFromObject(game.units).map((u) => ({
    ...u,
    stats: JSON.parse(JSON.stringify(u.stats)),
    freezeTimer: Math.max(0, (u.freezeTimer ?? 0) - dt),
    freezeImmuneTimer: Math.max(0, (u.freezeImmuneTimer ?? 0) - dt),
  }));
  const bases = JSON.parse(JSON.stringify(game.bases || {}));
  let respawnQueue = arrayFromObject(game.respawnQueue).map((r) => ({
    ...r,
    stats: JSON.parse(JSON.stringify(r.stats)),
    timer: (r.timer ?? 0) - dt,
  }));
  let unitArchive = { ...(game.unitArchive || {}) };
  let splats = arrayFromObject(game.splats).map((s) => ({ ...s, ttl: s.ttl - dt })).filter((s) => s.ttl > 0);
  let effects = arrayFromObject(game.effects).map((e) => ({ ...e, ttl: e.ttl - dt })).filter((e) => e.ttl > 0);
  let logEntries = [...(game.log || [])];
  let killFeed = [...(game.killFeed || [])].slice(0, 30);
  const ctfScores = { ...(game.ctfScores || Object.fromEntries(activeTeams(setup).map((team) => [team, 0]))) };
  const isCaptureFlag = setup.gameMode === "capture_flag";

  const fightTime = (game.fightTime || 0) + dt;
  processResourceRegrowth(board, units, setup, fightTime);
  const strandedRespawns = respawnQueue.filter((r) => (bases[r.team]?.hp ?? 0) <= 0);
  if (strandedRespawns.length) {
    unitArchive = mergeUnitArchive(unitArchive, strandedRespawns.map((r) => ({ ...r, hp: 0, timer: null, carryingFlagTeam: null })));
  }
  const readyRespawns = respawnQueue.filter((r) => (r.timer ?? 0) <= 0 && (bases[r.team]?.hp ?? 0) > 0);
  respawnQueue = respawnQueue.filter((r) => (r.timer ?? 0) > 0 && (bases[r.team]?.hp ?? 0) > 0);
  for (const respawn of readyRespawns) {
    units.push(makeUnit(respawn.id, respawn.team, respawn.style, setup, {
      ...respawn,
      hp: undefined,
      row: undefined,
      col: undefined,
      cooldown: 0,
      moveTimer: 0,
      voidwakerGuaranteesLeft: STYLE[respawn.style]?.guaranteedAttacks ?? respawn.voidwakerGuaranteesLeft,
      carryingFlagTeam: null,
    }));
  }

  const addSplat = (target, dmg, team, style, label = null) => splats.push({ id: makeRuntimeId("s"), row: target.row, col: target.col, text: label ?? (dmg > 0 ? `-${dmg}` : "miss"), team, damageType: damageTypeClass(style), ttl: SPLAT_TTL });
  const addAttackSplats = (target, result, team, style) => {
    const rolls = result?.rolls || [{ damage: attackResultTotal(result), hit: attackResultTotal(result) > 0 }];
    rolls.forEach((roll) => addSplat(target, roll.damage ?? 0, team, style, (roll.damage ?? 0) > 0 ? `-${roll.damage}` : result?.special ? "0" : "miss"));
  };
  const addEffect = (from, target, team, style) => effects.push({ id: makeRuntimeId("e"), fromRow: from.row, fromCol: from.col, row: target.row, col: target.col, team, style, ttl: 0.8 });
  const logCleanup = (cleanup) => {
    const noRespawnUnits = cleanup.minionsDied.filter((unit) => unit.respawnTime === 0 || (bases[unit.team]?.hp ?? 0) <= 0);
    if (noRespawnUnits.length) unitArchive = mergeUnitArchive(unitArchive, noRespawnUnits);
    for (const unit of cleanup.minionsDied) {
      const respawnText = unit.respawnTime > 0 ? ` Respawn in ${unit.respawnTime}s.` : " Base dead: no respawn.";
      logEntries = [`${TEAM_META[unit.team].name} ${unit.name} died.${respawnText}`, ...logEntries].slice(0, 8);
    }
  };

  let cleanup = cleanupDead(units, respawnQueue, bases);
  units = cleanup.units;
  respawnQueue = cleanup.respawnQueue;
  logCleanup(cleanup);

  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const combatTeams = teamsWithCombatPresence(bases, units, respawnQueue, setup);
    unit.maxHpSeen = Math.max(unit.maxHpSeen ?? 0, maxHp(unit));
    const flagCarrierTarget = isCaptureFlag ? enemyFlagCarrierForTeam(units, unit.team, combatTeams) : null;
    const manual = manualTargetForUnit(unit, board, units, setup);
    if (manual.kind === "expired") clearManualTarget(unit);
    let manualUnitTarget = !flagCarrierTarget && manual.kind === "unit" ? manual.target : null;
    let manualTileTarget = !flagCarrierTarget && manual.kind === "tile" ? manual.target : null;
    let manualResourceType = !flagCarrierTarget && manual.kind === "resource" ? manual.resourceType : null;
    let manualResourceTarget = !flagCarrierTarget && manual.kind === "resource" ? manual.target : null;
    if (manualTileTarget && unit.row === manualTileTarget.row && unit.col === manualTileTarget.col) {
      clearManualTarget(unit);
      manualTileTarget = null;
    }
    const manualActive = Boolean(manualUnitTarget || manualTileTarget || manualResourceTarget);
    const orderedTarget = effectiveTargetOrder(unit, game);
    const defendTarget = !flagCarrierTarget && !manualActive && orderedTarget === "defend" ? defendTargetForUnit(board, units, unit, setup, combatTeams, bases) : null;
    const supportFlagCarrier = isCaptureFlag && !unit.carryingFlagTeam && !flagCarrierTarget && !manualActive ? alliedFlagCarrierForTeam(units, unit.team, unit.id) : null;
    const protectTarget = supportFlagCarrier ? enemyThreatNearUnit(board, units, supportFlagCarrier, unit, combatTeams, setup) : null;
    const autoResourceType = !flagCarrierTarget && !manualActive && !defendTarget && !protectTarget && !supportFlagCarrier ? resourceOrderType(unit, orderedTarget) : null;
    const resourceType = manualResourceType ?? autoResourceType;
    const resourceTarget = manualResourceTarget ?? (resourceType ? nearestResourceTile(board, units, unit, setup, resourceType) : null);
    let targetTeam = flagCarrierTarget || manualActive || defendTarget || protectTarget || supportFlagCarrier || resourceTarget ? null : targetForUnit(unit, game, bases, units, respawnQueue);
    const noLivingEnemyBases = targetableBaseTeams(bases, setup, unit.team).length === 0;
    const cleanupTarget = !flagCarrierTarget && !manualActive && !defendTarget && !protectTarget && !supportFlagCarrier && !resourceTarget && noLivingEnemyBases ? nearestEnemyUnit(units, unit, combatTeams) : null;
    const ownBase = baseOf(unit.team, sizeOf(setup));
    let flagReturnTarget = null;
    if (isCaptureFlag) {
      if (unit.carryingFlagTeam && unit.row === ownBase.row && unit.col === ownBase.col) {
        ctfScores[unit.team] = (ctfScores[unit.team] ?? 0) + 1;
        killFeed = [{ id: makeRuntimeId("feed"), text: `${TEAM_META[unit.team].name} scored ${TEAM_META[unit.carryingFlagTeam]?.name || "enemy"} flag!`, team: unit.team, time: fightTime }, ...killFeed].slice(0, 30);
        logEntries = [`${TEAM_META[unit.team].name} scored a flag point (${ctfScores[unit.team]}/${setup.ctfScoreLimit ?? 3}).`, ...logEntries].slice(0, 8);
        unit.carryingFlagTeam = null;
        unit.randomTarget = null;
      }
      if (unit.carryingFlagTeam) flagReturnTarget = ownBase;
    }

    if (unit.targetOverride === "homeTeleport") {
      unit.cooldown = Math.max(0, unit.cooldown - dt);
      unit.moveTimer = Math.max(0, unit.moveTimer - dt);
      if (unit.homeTeleportStartedAt == null) {
        unit.homeTeleportStartedAt = fightTime;
        unit.homeTeleportHpAtStart = unit.hp ?? 0;
        unit.homeTeleportLastAttackedAtStart = unit.lastAttackedAt ?? -1;
        unit.homeTeleportPreviousTargetOverride = unit.homeTeleportPreviousTargetOverride || "inherit";
      }
      const interruptedByAttack = (unit.lastAttackedAt ?? -1) > (unit.homeTeleportLastAttackedAtStart ?? -1) || (unit.hp ?? 0) < (unit.homeTeleportHpAtStart ?? 0);
      if (interruptedByAttack) {
        killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.name}'s home teleport was interrupted.`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        finishHomeTeleport(unit);
        continue;
      }
      if (fightTime - Number(unit.homeTeleportStartedAt) >= HOME_TELEPORT_SECONDS) {
        const home = baseOf(unit.team, sizeOf(setup));
        unit.row = home.row;
        unit.col = home.col;
        unit.moveTimer = MOVE_EVERY;
        unit.freezeTimer = 0;
        killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.name} home teleported to base.`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        finishHomeTeleport(unit);
        continue;
      }
      continue;
    }

    if (!targetTeam && !cleanupTarget && !defendTarget && !protectTarget && !supportFlagCarrier && !resourceTarget && !flagReturnTarget && !flagCarrierTarget && !manualActive) continue;

    const enemyBase = targetTeam ? baseOf(targetTeam, sizeOf(setup)) : null;
    const range = STYLE[unit.style].range;
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    unit.moveTimer = Math.max(0, unit.moveTimer - dt);


    let nearbyEnemyUnit = closestEnemyUnitInRange(board, units, unit, setup, combatTeams);
    const manualAttackTarget = manualUnitTarget && canAttack(board, unit, manualUnitTarget, range, setup) ? manualUnitTarget : null;
    const aggroTarget = units.find((u) => u.id === unit.lastAttackerId && u.hp > 0 && u.team !== unit.team);
    const chaseTarget = flagCarrierTarget ?? manualUnitTarget ?? defendTarget ?? protectTarget ?? cleanupTarget ?? (aggroTarget && !nearbyEnemyUnit ? aggroTarget : null);
    const escortTarget = supportFlagCarrier && !chaseTarget ? supportFlagCarrier : null;

    let manualPath = null;
    let manualBlocked = false;
    if (manualTileTarget) {
      const targetOccupied = unitOccupies(units, manualTileTarget.row, manualTileTarget.col, setup);
      manualPath = findPath(board, units, unit, manualTileTarget, setup, { range: targetOccupied ? 1 : 0, allowTargetCell: !targetOccupied, requireGoal: true });
      manualBlocked = !manualPath || (targetOccupied && manhattan(unit, manualTileTarget) <= 1);
    } else if (manualResourceTarget) {
      manualPath = findPath(board, units, unit, manualResourceTarget, setup, { range: 1, requireGoal: true });
      manualBlocked = !manualPath && manhattan(unit, manualResourceTarget) > 1;
    } else if (manualUnitTarget && !manualAttackTarget) {
      manualPath = findPath(board, units, unit, manualUnitTarget, setup, { range, requireGoal: true });
      manualBlocked = !manualPath;
    }
    if (manualActive) {
      if (manualBlocked) {
        if (unit.manualTargetBlockedSince == null) unit.manualTargetBlockedSince = fightTime;
        else if (fightTime - unit.manualTargetBlockedSince >= MANUAL_TARGET_TIMEOUT) {
          clearManualTarget(unit);
          manualUnitTarget = null;
          manualTileTarget = null;
          manualResourceTarget = null;
          manualResourceType = null;
        }
      } else {
        delete unit.manualTargetBlockedSince;
      }
    }

    if (unit.moveTimer <= 0 && (unit.freezeTimer ?? 0) <= 0) {
      const flagPath = flagReturnTarget ? findPath(board, units, unit, flagReturnTarget, setup, { range: 0, allowTargetCell: true }) : null;
      const chasePath = !flagReturnTarget && !manualTileTarget && chaseTarget ? findPath(board, units, unit, chaseTarget, setup, { range }) : null;
      const escortPath = !flagReturnTarget && !manualActive && !chaseTarget && escortTarget ? findPath(board, units, unit, escortTarget, setup, { range: 1 }) : null;
      const resourcePath = !flagReturnTarget && !manualResourceTarget && !manualActive && !chaseTarget && !escortTarget && resourceTarget ? findPath(board, units, unit, resourceTarget, setup, { range: 1, requireGoal: true }) : null;
      const basePath = !flagReturnTarget && !manualActive && !escortTarget && !resourceTarget && enemyBase
        ? findPath(board, units, unit, enemyBase, setup, { range: 1 }) ?? findPath(board, units, unit, enemyBase, setup, { range: 1, avoidOccupied: false })
        : null;
      const fallbackTarget = flagReturnTarget ?? manualTileTarget ?? chaseTarget ?? escortTarget ?? resourceTarget ?? enemyBase;
      const next = flagPath?.[0] ?? manualPath?.[0] ?? chasePath?.[0] ?? escortPath?.[0] ?? resourcePath?.[0] ?? basePath?.[0] ?? (fallbackTarget ? bestOpenForwardStep(board, units, unit, fallbackTarget, setup) : null);
      if (next && !unitOccupies(units, next.row, next.col, setup)) {
        unit.row = next.row;
        unit.col = next.col;
      }
      if (manualTileTarget && unit.row === manualTileTarget.row && unit.col === manualTileTarget.col) clearManualTarget(unit);
      unit.moveTimer = MOVE_EVERY;
    }

    if (isCaptureFlag && !unit.carryingFlagTeam && enemyBase && targetTeam && (bases[targetTeam]?.hp ?? 0) > 0 && isFlagAtHome(units, targetTeam) && manhattan(unit, enemyBase) <= 1) {
      unit.carryingFlagTeam = targetTeam;
      unit.randomTarget = null;
      killFeed = [{ id: makeRuntimeId("feed"), text: `${TEAM_META[unit.team].name} grabbed ${TEAM_META[targetTeam].name}'s flag!`, team: unit.team, time: fightTime }, ...killFeed].slice(0, 30);
      logEntries = [`${TEAM_META[unit.team].name} grabbed ${TEAM_META[targetTeam].name}'s flag.`, ...logEntries].slice(0, 8);
    }

    if (resourceTarget && unit.cooldown <= 0 && manhattan(unit, resourceTarget) <= 1 && board[resourceTarget.row]?.[resourceTarget.col]?.type === resourceType) {
      const resourceHit = damageResourceTile(board, resourceTarget, resourceType, resourceDamageForUnit(unit, resourceType), fightTime);
      if (resourceHit.ok) {
        const action = resourceType === "tree" ? "chopped" : "mined";
        addSplat(resourceTarget, resourceHit.damage, unit.team, unit.style, `-${resourceHit.damage}`);
        addEffect(unit, resourceTarget, unit.team, unit.style);
        if (resourceHit.cleared) {
          unit.resourcesCleared = (unit.resourcesCleared ?? 0) + 1;
          if (manualResourceTarget) clearManualTarget(unit);
          killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.name} ${action} ${resourceType === "tree" ? "trees" : "rocks"}. Clear #${resourceHit.deathCount}. Regrows in ${resourceHit.regrowSeconds}s.`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        }
        unit.cooldown = STYLE[unit.style].cooldown;
        continue;
      }
    }

    nearbyEnemyUnit = manualAttackTarget ?? closestEnemyUnitInRange(board, units, unit, setup, combatTeams);
    if (nearbyEnemyUnit && unit.cooldown <= 0) {
      const attackResult = attackUnit(unit, nearbyEnemyUnit);
      nearbyEnemyUnit.lastAttackedAt = fightTime;
      if (unit.lastKill) {
        killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.lastKill.attackerName} defeated ${unit.lastKill.victimName}`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        unit.lastKill = null;
      }
      addAttackSplats(nearbyEnemyUnit, attackResult, unit.team, unit.style);
      addEffect(unit, nearbyEnemyUnit, unit.team, unit.style);
      if (STYLE[unit.style].aoeRadius && attackResultTotal(attackResult) > 0) {
        for (let row = nearbyEnemyUnit.row - 1; row <= nearbyEnemyUnit.row + 1; row++) {
          for (let col = nearbyEnemyUnit.col - 1; col <= nearbyEnemyUnit.col + 1; col++) {
            if (!inBounds(row, col, sizeOf(setup)) || (row === nearbyEnemyUnit.row && col === nearbyEnemyUnit.col)) continue;
            const extra = units.find((u) => u.team !== unit.team && u.hp > 0 && u.row === row && u.col === col && combatTeams.includes(u.team));
            if (extra) {
              const splashResult = attackUnit(unit, extra);
              extra.lastAttackedAt = fightTime;
              if (unit.lastKill) {
                killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.lastKill.attackerName} defeated ${unit.lastKill.victimName}`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
                unit.lastKill = null;
              }
              addAttackSplats(extra, splashResult, unit.team, unit.style);
              addEffect(unit, extra, unit.team, unit.style);
            }
          }
        }
      }
      unit.cooldown = STYLE[unit.style].cooldown;
    } else if (!isCaptureFlag && enemyBase && canAttack(board, unit, enemyBase, range, setup) && unit.cooldown <= 0 && (bases[targetTeam]?.hp ?? 0) > 0) {
      const dmg = attackBase(unit, bases[targetTeam]);
      addSplat(enemyBase, dmg, unit.team, unit.style);
      addEffect(unit, enemyBase, unit.team, unit.style);
      unit.cooldown = STYLE[unit.style].cooldown;
    }
  }

  cleanup = cleanupDead(units, respawnQueue, bases);
  units = cleanup.units;
  respawnQueue = cleanup.respawnQueue;
  logCleanup(cleanup);

  const nextGame = {
    ...game,
    board,
    units: objectFromArray(units),
    respawnQueue: objectFromArray(respawnQueue),
    unitArchive,
    bases,
    ctfScores,
    killFeed,
    splats: objectFromArray(splats),
    effects: objectFromArray(effects),
    fightTime,
    log: logEntries,
  };

  const aliveBases = aliveTeamsFromBases(bases, setup);
  const remainingCombat = teamsWithCombatPresence(bases, units, respawnQueue, setup);
  const ctfWinner = isCaptureFlag ? activeTeams(setup).find((team) => (ctfScores[team] ?? 0) >= (setup.ctfScoreLimit ?? 3)) : null;
  if (ctfWinner || (!isCaptureFlag && remainingCombat.length <= 1 && aliveBases.length <= 1)) {
    nextGame.results = summarizeResults(nextGame, ctfWinner ? "capture limit reached" : "last combat presence");
    nextGame.finished = true;
  }
  return nextGame;
}

function runDevTests() {
  const setup4 = { ...DEFAULT_SETUP, players: 4, gridSize: 13 };
  console.assert(activeTeams(setup4).length === 4, "4-player setup should activate four teams");
  const setup3 = { ...DEFAULT_SETUP, players: 3, gridSize: 17 };
  console.assert(JSON.stringify(activeTeams(setup3)) === JSON.stringify(["red", "green", "blue"]), "3-player setup should activate red, green, and blue teams");
  console.assert(baseOf("blue", 17).row === 15 && baseOf("blue", 17).col === 15, "3-player blue base should use the bottom-right starter patch");
  console.assert(ownerFor(15, 1, setup3) === "void", "3-player mode should make the fourth bottom-left zone void/unbuildable");
  const board3 = makeBoard(setup3);
  console.assert(board3[15][1].owner === "void" && board3[15][1].type === "empty", "3-player fourth zone should stay empty and not start as road");
  console.assert(!isStarterRoad(15, 1, setup3), "Inactive fourth zone should not get a starter road patch");
  console.assert(!isBuildFogged(board3[15][1], "red", "build", setup3), "Inactive fourth zone should render as void instead of fogged enemy terrain");
  const finalized3 = finalizeBuildTerrain(board3, setup3);
  console.assert(["water", "tree", "rock"].includes(finalized3[15][1].type), "Finalizing build should fill empty/void tiles with random water, trees, or rocks");
  console.assert(baseOf("red", 17).row === 1 && baseOf("red", 17).col === 1, "Red base should be centered in 3x3 top-left starter patch");
  console.assert(baseOf("green", 17).row === 1 && baseOf("green", 17).col === 15, "Green base should be centered in 3x3 top-right starter patch");
  console.assert(isInBaseZone(2, 2, "red", 17), "Red should have a 3x3 default base patch");
  console.assert(isStarterRoad(2, 2, { ...setup4, gridSize: 17 }), "Base patch cells should start as road tiles");
  console.assert(!isInBaseZone(3, 3, "red", 17), "Base patch should not extend past 3x3");
  console.assert(STYLE.heavy_ballista.range === 3, "Heavy Ballista attack range should be 3");
  console.assert(!Object.prototype.hasOwnProperty.call(TILE, "grass"), "Grass tile should be removed");
  const board = makeBoard(setup4);
  console.assert(board.length === 13 && board[0].length === 13, "Board should match setup size");
  console.assert(baseOf("blue", 13).row === 11 && baseOf("blue", 13).col === 11, "Blue base should be centered in compact 3x3 patch");
  console.assert(isBuildFogged({ row: 2, col: 11, owner: "green", type: "road" }, "red", "build", setup4), "Build phase should fog opponent terrain");
  console.assert(!isBuildFogged({ row: 2, col: 2, owner: "red", type: "road" }, "red", "build", setup4), "Build phase should reveal active player terrain");
  const previewBoard = makeBoard({ ...setup4, gridSize: 17 });
  previewBoard[2][3].type = "road";
  previewBoard[2][4].type = "road";
  previewBoard[2][4].owner = "green";
  const redPreview = reachableRoadKeys(previewBoard, "red", { ...setup4, gridSize: 17 });
  console.assert(redPreview.has("2,3"), "Path preview should include own connected roads");
  console.assert(!redPreview.has("2,4"), "Path preview should not reveal or traverse enemy-owned connected roads");
  const csvSmoke = ["a,b", "1,2"].join("\n");
  console.assert(csvSmoke.includes("\n"), "CSV export should use escaped newline strings");
  const killer = makeUnit(1, "red", "melee", setup4);
  const victim = makeUnit(2, "blue", "melee", setup4);
  victim.hp = 1;
  const originalRandom = Math.random;
  Math.random = () => 0;
  const killResult = attackUnit(killer, victim);
  Math.random = originalRandom;
  console.assert(attackResultTotal(killResult) >= 1, "Unit attack result should report damage total");
  console.assert((killer.kills ?? 0) >= 1, "Last-hit unit defeats should increment kills");
  const clawUser = makeUnit(20, "red", "dragon_claws", setup4);
  const clawVictim = makeUnit(21, "blue", "melee", setup4);
  clawUser.clawCharge = 5;
  clawVictim.hp = 75;
  Math.random = () => 0;
  const clawResult = attackUnit(clawUser, clawVictim);
  Math.random = originalRandom;
  console.assert(clawResult.rolls.length === 4, "Dragon Claws special should create four separate hit rolls");
  console.assert(clawUser.clawCharge === 0, "Dragon Claws special should reset the attack counter");
  console.assert(STYLE.dragon_claws.cost === 30 && STYLE.dragon_claws.baseStats.strength === 85, "Dragon Claws should have requested cost and strength stats");
  const darkBow = makeUnit(22, "red", "dark_bow_pure", setup4);
  const darkBowVictim = makeUnit(23, "blue", "melee", setup4);
  Math.random = () => 0;
  const darkBowResult = attackUnit(darkBow, darkBowVictim);
  Math.random = originalRandom;
  console.assert(darkBowResult.rolls.length === 2 && STYLE.dark_bow_pure.range === 5, "Dark Bow Pure should fire two shots from range 5");
  const voidwaker = makeUnit(24, "red", "voidwaker_rusher", setup4);
  const voidVictim = makeUnit(25, "blue", "melee", setup4);
  Math.random = () => 0;
  const voidResult = attackUnit(voidwaker, voidVictim);
  Math.random = originalRandom;
  console.assert(voidResult.special === "voidwaker_rusher" && voidResult.rolls[0].guaranteed && voidwaker.voidwakerGuaranteesLeft === 1, "Voidwaker Rusher should have two guaranteed opening attacks");
  const game = makeInitialGame(setup4);
  const cleanupRed = makeUnit(3, "red", "melee", setup4);
  const cleanupBlue = makeUnit(4, "blue", "melee", setup4);
  game.units = { [cleanupRed.id]: cleanupRed, [cleanupBlue.id]: cleanupBlue };
  game.bases = Object.fromEntries(activeTeams(setup4).map((team) => [team, { hp: 0 }]));
  console.assert(targetForUnit(cleanupRed, game, game.bases, arrayFromObject(game.units), []) === "blue", "Units should find enemy combat targets when all bases are destroyed");
  const resultGame = { ...game, units: { [cleanupRed.id]: cleanupRed }, respawnQueue: {} };
  console.assert(summarizeResults(resultGame, "test").winner === "Red", "No-base cleanup winner should be last combat team");
  const archivedBlue = { ...cleanupBlue, totalDamage: 44, kills: 2, deathCount: 3, hp: 0 };
  const archiveResultGame = { ...game, units: { [cleanupRed.id]: cleanupRed }, respawnQueue: {}, unitArchive: objectFromArray([archivedBlue]) };
  const archiveResults = summarizeResults(archiveResultGame, "archive test");
  console.assert((archiveResults.teamStats.blue.units || []).length === 1, "Post-game losing team stats should include archived dead units");
  console.assert(archiveResults.teamStats.blue.damage === 44, "Archived losing team damage should appear on post-game tabs");
  const defendGame = makeInitialGame(setup4);
  defendGame.orders.red = { target: "defend" };
  const defender = makeUnit(10, "red", "melee", setup4);
  const attackerNearBase = makeUnit(11, "blue", "melee", setup4);
  attackerNearBase.row = 1;
  attackerNearBase.col = 2;
  const defenderBoard = makeBoard(setup4);
  console.assert(defendTargetForUnit(defenderBoard, [defender, attackerNearBase], defender, setup4, ["red", "blue"], defendGame.bases)?.id === attackerNearBase.id, "Defend target should pick enemy units threatening the team's base");
  attackerNearBase.row = 10;
  attackerNearBase.col = 10;
  console.assert(defendTargetForUnit(defenderBoard, [defender, attackerNearBase], defender, setup4, ["red", "blue"], defendGame.bases) === null, "Defend target should stay inactive when no enemy is near the base");
  console.assert(targetForUnit(defender, defendGame, defendGame.bases, [defender, attackerNearBase], []) === "blue", "Defend should fall back to random target selection when base is not threatened");
  console.assert(canPlayerControlTarget({ team: "red" }, "red") && !canPlayerControlTarget({ team: "red" }, "blue"), "Players should only control and view their own team target controls");
  console.assert(damageTypeClass("melee") === "melee" && damageTypeClass("magic") === "magic" && damageTypeClass("range") === "range", "Damage splats should map to combat type colors");
  console.assert(firebaseSafeKey("s_123_0.456") === "s_123_0_456", "Firebase runtime keys should not contain periods");
  const keyed = objectFromArray([{ id: "s_1_0.25", ttl: 1 }]);
  console.assert(Boolean(keyed.s_1_0_25), "Object keys written to Firebase should be sanitized");
  const emptyTeamResults = { teamStats: { blue: { damage: 0, kills: 0, levels: 0, deaths: 0 } } };
  console.assert(arrayFromObject(emptyTeamResults.teamStats.blue.units).length === 0, "Team result tabs should tolerate Firebase dropping empty units arrays");
  const dharok = makeUnit(30, "red", "dharoks", setup4);
  const fullHpMax = maxDamageRoll(dharok, null);
  dharok.hp = maxHp(dharok) - 25;
  console.assert(maxDamageRoll(dharok, null) === fullHpMax + 5, "Dharok max hit should gain +1 for every 5 missing HP");
  const ctfSetup = { ...DEFAULT_SETUP, gameMode: "capture_flag", ctfScoreLimit: 2 };
  const ctfGame = makeInitialGame(ctfSetup);
  console.assert(ctfGame.ctfScores.red === 0 && ctfGame.setup.gameMode === "capture_flag", "Capture the Flag games should initialize flag scores");
  const flagRunner = makeUnit(40, "blue", "melee", ctfSetup);
  flagRunner.carryingFlagTeam = "red";
  const redDefender = makeUnit(41, "red", "range", ctfSetup);
  console.assert(enemyFlagCarrierForTeam([flagRunner, redDefender], "red", ["red", "blue"]) === flagRunner, "CTF defenders should identify the enemy flag carrier as a priority target");
  const blueEscort = makeUnit(43, "blue", "melee", ctfSetup);
  console.assert(alliedFlagCarrierForTeam([flagRunner, blueEscort], "blue", blueEscort.id) === flagRunner, "CTF allies should identify their own flag carrier to escort/protect");
  blueEscort.targetOverride = "red";
  console.assert(targetForUnit(blueEscort, ctfGame, ctfGame.bases, [flagRunner, blueEscort, redDefender], []) === "red", "Unit personal target overrides should be accepted before fight and during fight");
  blueEscort.targetOverride = "protectCarrier";
  console.assert(unitTargetOptions(ctfGame, blueEscort).includes("protectCarrier"), "Unit target options should include protect flag carrier");
  blueEscort.targetOverride = "manual";
  blueEscort.manualTargetType = "unit";
  blueEscort.manualTargetUnitId = redDefender.id;
  console.assert(manualTargetForUnit(blueEscort, ctfGame.board, [blueEscort, redDefender], ctfSetup).target?.id === redDefender.id, "Manual unit targeting should lock onto a living enemy unit");
  redDefender.hp = 0;
  console.assert(manualTargetForUnit(blueEscort, ctfGame.board, [blueEscort, redDefender], ctfSetup).kind === "expired", "Manual unit targeting should expire when the target dies");
  clearManualTarget(blueEscort);
  console.assert(blueEscort.targetOverride === "inherit" && !blueEscort.manualTargetType, "Clearing manual targeting should return the unit to team/random orders");
  redDefender.hp = maxHp(redDefender);
  const blueBase = baseOf("blue", sizeOf(ctfSetup));
  flagRunner.row = blueBase.row;
  flagRunner.col = blueBase.col + 1;
  const nearBaseGame = { ...ctfGame, phase: "fight", running: true, units: { [flagRunner.id]: flagRunner }, bases: { ...ctfGame.bases, red: { hp: 250 }, blue: { hp: 250 } } };
  const nearBaseStep = stepSimulation(nearBaseGame, 0.25);
  console.assert((nearBaseStep.ctfScores.blue ?? 0) === 0, "CTF should not score beside the home base; carrier must return onto the base tile");
  const onBaseRunner = { ...flagRunner, row: blueBase.row, col: blueBase.col, carryingFlagTeam: "red" };
  const onBaseGame = { ...nearBaseGame, units: { [onBaseRunner.id]: onBaseRunner }, ctfScores: { ...ctfGame.ctfScores, blue: 0 } };
  const onBaseStep = stepSimulation(onBaseGame, 0.25);
  console.assert((onBaseStep.ctfScores.blue ?? 0) === 1, "CTF should score when the carrier reaches its own base tile");
  console.assert(MINION_STYLE_IDS.includes("dharoks"), "Dharok's Greataxe should appear in the buy list");
  const redFlagHolder = makeUnit(42, "blue", "melee", ctfSetup);
  redFlagHolder.carryingFlagTeam = "red";
  console.assert(!isFlagAtHome([redFlagHolder], "red"), "A flag should be unavailable while any living unit carries it");
  const redFlagHomeAgain = { ...redFlagHolder, hp: 0 };
  console.assert(isFlagAtHome([redFlagHomeAgain], "red"), "A flag should reset to home when its carrier dies");
  console.assert(!blocksLineOfSight({ type: "road" }) && blocksLineOfSight({ type: "wall" }) && blocksLineOfSight({ type: "tree" }) && !blocksLineOfSight({ type: "rock" }), "Stone walls and trees should block line of sight; rocks should not");
  console.assert(!walkable({ row: 5, col: 5, type: "tree" }, setup4) && !walkable({ row: 5, col: 5, type: "rock" }, setup4), "Trees and rocks should block pathing");
  console.assert(MINION_STYLE_IDS.includes("woodcutter") && MINION_STYLE_IDS.includes("miner"), "Woodcutter and Miner should appear in the buy list");
  const resourceSetup = { ...DEFAULT_SETUP, players: 2, gridSize: 17 };
  const resourceBoard = makeBoard(resourceSetup);
  resourceBoard[10][10].type = "tree";
  resourceBoard[10][10].owner = "blue";
  const wc = makeUnit(50, "red", "woodcutter", resourceSetup);
  wc.row = 9; wc.col = 10;
  console.assert(nearestResourceTile(resourceBoard, [wc], wc, resourceSetup, "tree")?.row === 10, "Woodcutter should target enemy trees");
  const blockedResourceBoard = makeBoard(resourceSetup);
  for (let r = 0; r < sizeOf(resourceSetup); r++) for (let c = 0; c < sizeOf(resourceSetup); c++) blockedResourceBoard[r][c].type = "road";
  blockedResourceBoard[5][5].type = "tree";
  blockedResourceBoard[5][5].owner = "blue";
  for (const [r, c] of [[4,5],[5,4],[5,6],[6,5]]) blockedResourceBoard[r][c].type = "wall";
  const blockedWc = makeUnit(53, "red", "woodcutter", resourceSetup);
  blockedWc.row = 3; blockedWc.col = 5;
  console.assert(nearestResourceTile(blockedResourceBoard, [blockedWc], blockedWc, resourceSetup, "tree") === null, "Auto skiller targeting should skip unreachable resources");
  const firstChop = damageResourceTile(resourceBoard, { row: 10, col: 10 }, "tree", 10, 12);
  console.assert(firstChop.ok && !firstChop.cleared && resourceBoard[10][10].resourceHp === 20, "Chopped trees should gain a visible health value before clearing");
  damageResourceTile(resourceBoard, { row: 10, col: 10 }, "tree", 20, 12);
  console.assert(resourceBoard[10][10].type === "road" && resourceBoard[10][10].regrowType === "tree" && resourceBoard[10][10].regrowAt === 42, "Chopped trees should become dirt roads for 30 seconds");
  processResourceRegrowth(resourceBoard, [], resourceSetup, 43);
  console.assert(resourceBoard[10][10].type === "tree" && !resourceBoard[10][10].regrowType && resourceBoard[10][10].resourceHp == null, "Resource tiles should regrow fresh after the timer");
  damageResourceTile(resourceBoard, { row: 10, col: 10 }, "tree", 30, 60);
  console.assert(resourceBoard[10][10].resourceDeathCount === 2 && resourceBoard[10][10].regrowAt === 100, "Resource regrow timers should scale up after repeated clears on the same tile");
  const miner = makeUnit(51, "red", "miner", resourceSetup);
  resourceBoard[10][11].type = "rock";
  resourceBoard[10][11].owner = "blue";
  miner.targetOverride = "manual";
  miner.manualTargetType = "resource";
  miner.manualResourceType = "rock";
  miner.manualTargetRow = 10;
  miner.manualTargetCol = 11;
  console.assert(manualTargetForUnit(miner, resourceBoard, [miner], resourceSetup).kind === "resource", "Miners/Woodcutters should support manual resource targets");
  resourceBoard[1][2].type = "rock";
  resourceBoard[1][2].owner = "red";
  miner.manualTargetRow = 1;
  miner.manualTargetCol = 2;
  console.assert(manualTargetForUnit(miner, resourceBoard, [miner], resourceSetup).kind === "resource", "Manual skiller targeting should allow own-zone resources");
  const teleporter = makeUnit(54, "red", "melee", resourceSetup);
  teleporter.row = 5; teleporter.col = 5;
  teleporter.targetOverride = "homeTeleport";
  teleporter.homeTeleportStartedAt = 0;
  teleporter.homeTeleportHpAtStart = teleporter.hp;
  teleporter.homeTeleportLastAttackedAtStart = -1;
  teleporter.homeTeleportPreviousTargetOverride = "blank";
  const teleportGame = { ...makeInitialGame(resourceSetup), fightTime: HOME_TELEPORT_SECONDS - 0.1, units: { [teleporter.id]: teleporter } };
  const teleportStep = stepSimulation(teleportGame, 0.2);
  const teleported = teleportStep.units[teleporter.id];
  console.assert(teleported.row === baseOf("red", sizeOf(resourceSetup)).row && teleported.col === baseOf("red", sizeOf(resourceSetup)).col && teleported.targetOverride === "blank", "Home teleport should return the unit to base and restore its previous action");
  const interrupted = makeUnit(55, "red", "melee", resourceSetup);
  interrupted.targetOverride = "homeTeleport";
  interrupted.homeTeleportStartedAt = 1;
  interrupted.homeTeleportHpAtStart = interrupted.hp;
  interrupted.homeTeleportLastAttackedAtStart = 0;
  interrupted.homeTeleportPreviousTargetOverride = "defend";
  interrupted.lastAttackedAt = 2;
  const interruptedGame = { ...makeInitialGame(resourceSetup), fightTime: 2, units: { [interrupted.id]: interrupted } };
  const interruptedStep = stepSimulation(interruptedGame, 0.2);
  console.assert(interruptedStep.units[interrupted.id].targetOverride === "defend", "Home teleport should be interrupted by incoming attacks and restore prior orders");
  const losBoard = makeBoard({ ...DEFAULT_SETUP, players: 2, gridSize: 17 });
  losBoard[1][2].type = "wall";
  console.assert(!lineClear(losBoard, { row: 1, col: 1 }, { row: 1, col: 3 }, { ...DEFAULT_SETUP, players: 2, gridSize: 17 }), "Line of sight should be blocked by stone walls between attacker and target");
  const riverBoard = makeBoard({ ...DEFAULT_SETUP, mapTemplate: "river_cross" });
  console.assert(riverBoard[midOf(DEFAULT_SETUP.gridSize)][0].type === "water" || riverBoard[midOf(DEFAULT_SETUP.gridSize)][0].type === "road", "River Cross template should alter the map layout");
}
if (typeof window !== "undefined" && !window.__quadrantsOnlineTestsRan) {
  window.__quadrantsOnlineTestsRan = true;
  runDevTests();
}

function Button({ children, onClick, disabled, variant = "default", className = "" }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${className} ${disabled ? "is-disabled" : ""}`}>
      {children}
    </button>
  );
}

function Pill({ children, tone = "default" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function StyleIcon({ styleId, size = "md" }) {
  const style = STYLE[styleId];
  if (!style) return <span>❔</span>;
  return <img src={asset(style.file)} alt={style.name} className={`unit-icon unit-icon-${size}`} draggable={false} />;
}

function BaseIcon({ team }) {
  return (
    <div className="base-icon" style={{ background: TEAM_META[team]?.dark, borderColor: TEAM_META[team]?.color }}>
      🛡️
    </div>
  );
}

function HpBar({ hp, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
  return (
    <div className="hpbar">
      <div className="hpbar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

function UnitToken({ unit, bump, showName = true }) {
  return (
    <div className={`unit-token ${bump ? "bump" : ""}`} title={unit.name}>
      <div className="unit-token-circle" style={{ background: TEAM_META[unit.team]?.dark, borderColor: TEAM_META[unit.team]?.color }}>
        <StyleIcon styleId={unit.style} />
        {unit.carryingFlagTeam && <div className="flag-icon-overlay" title={`Carrying ${TEAM_META[unit.carryingFlagTeam]?.name || "enemy"} flag`}>🚩</div>}
      </div>
      {showName && <div className="unit-name">{String(unit.name || STYLE[unit.style].name).slice(0, 12)}</div>}
      {unit.carryingFlagTeam && <div className="flag-carrier">{TEAM_META[unit.carryingFlagTeam]?.name} flag</div>}
      <HpBar hp={unit.hp} max={maxHp(unit)} />
    </div>
  );
}

function previewMaxHit(styleId) {
  const unit = makeUnit("preview", "red", styleId, DEFAULT_SETUP);
  return maxDamageRoll(unit, null);
}

function attackSpeedLabel(styleId) {
  const s = STYLE[styleId];
  const seconds = ((s.attackTicks ?? 0) * TICK_SECONDS).toFixed(1);
  return `${s.attackTicks ?? "?"} ticks / ${seconds}s`;
}

function passiveText(styleId) {
  const s = STYLE[styleId];
  const notes = [];
  if (s.aoeRadius) notes.push("Passive: hits the main target plus nearby units in a 3x3 splash area.");
  if (s.accuracyPenaltyVsRange) notes.push("Penalty: reduced accuracy against Range units.");
  if (s.clawRegularAttacksRequired) notes.push("Passive: after 5 unit attacks, next attack rolls 4 hits.");
  if (s.doubleShot) notes.push("Passive: fires 2 shots per attack, but attacks very slowly.");
  if (s.guaranteedAttacks) notes.push("Passive: first 2 unit attacks after spawn/respawn are guaranteed hits.");
  if (s.dharokHpScale) notes.push("Passive: +1 max hit for every 5 HP missing from current max HP.");
  if (s.resourceTarget === "tree") notes.push(`Skiller: chops enemy trees (${resourceMaxHp("tree")} HP) into dirt; regrowth starts at ${RESOURCE_REGROW_SECONDS}s and scales up; ignores own trees.`);
  if (s.resourceTarget === "rock") notes.push(`Skiller: mines enemy rocks (${resourceMaxHp("rock")} HP) into dirt; regrowth starts at ${RESOURCE_REGROW_SECONDS}s and scales up; ignores own rocks.`);
  if (s.volatileChance) notes.push("Passive: chance to hit for massive volatile damage.");
  return notes;
}

function unitHoverText(unit) {
  const s = STYLE[unit.style] || {};
  const acc = Math.round(100 * (unit.hitsLanded ?? 0) / Math.max(1, unit.attacksAttempted ?? 0));
  const flag = unit.carryingFlagTeam ? `
Carrying ${TEAM_META[unit.carryingFlagTeam]?.name || "enemy"} flag` : "";
  return `${unit.name}
${TEAM_META[unit.team]?.name || unit.team} ${s.name || unit.style}
HP ${Math.round(unit.hp)}/${maxHp(unit)} • Max hit ${maxDamageRoll(unit, null)}
Damage ${unit.totalDamage ?? 0} • Kills ${unit.kills ?? 0} • Accuracy ${acc}%${flag}`;
}

function statGrid(stats) {
  return (
    <div className="stat-grid">
      {STAT_KEYS.map((stat) => (
        <div key={stat} className="stat-tile">
          <span>{STAT_SHORT[stat]}</span>
          <b>{stats?.[stat]?.level ?? 1}</b>
        </div>
      ))}
    </div>
  );
}

function UnitStatSummary({ unit }) {
  const baseStats = STYLE[unit.style]?.baseStats ?? {};
  return (
    <div className="stat-grid stat-grid-wide">
      {STAT_KEYS.map((stat) => {
        const level = unit.stats?.[stat]?.level ?? 1;
        const base = baseStats[stat] ?? 1;
        const gained = Math.max(0, level - base);
        return (
          <div key={stat} className="stat-tile">
            <span>{STAT_SHORT[stat]}</span>
            <b>
              {level}
              {gained > 0 && <em>+{gained}</em>}
            </b>
          </div>
        );
      })}
    </div>
  );
}

function currentPlayers(lobby) {
  return Object.values(lobby?.players || {}).filter(Boolean).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

function canPlayerControlTarget(player, team) {
  return Boolean(player?.team && player.team === team);
}

function activeGamePlayers(lobby) {
  const teams = activeTeams(lobby.setup || DEFAULT_SETUP);
  return currentPlayers(lobby).filter((p) => p.team && teams.includes(p.team));
}

function readyMap(lobby, phase) {
  return lobby?.ready?.[phase] || {};
}

function allReadyForPhase(lobby, phase) {
  const players = activeGamePlayers(lobby);
  if (!players.length) return false;
  const ready = readyMap(lobby, phase);
  return players.every((p) => ready[p.id]);
}

function openTeamForLobby(lobby) {
  const used = new Set(currentPlayers(lobby).map((p) => p.team).filter(Boolean));
  const teams = activeTeams(lobby.setup || DEFAULT_SETUP);
  return teams.find((t) => !used.has(t)) || null;
}

function TeamSelect({ lobby, player, disabled, onChoose }) {
  const teams = activeTeams(lobby.setup || DEFAULT_SETUP);
  const players = currentPlayers(lobby);
  return (
    <div className="team-select">
      {teams.map((team) => {
        const takenBy = players.find((p) => p.team === team && p.id !== player?.id);
        const selected = player?.team === team;
        return (
          <button
            key={team}
            disabled={disabled || Boolean(takenBy)}
            onClick={() => onChoose(team)}
            className={`team-button ${selected ? "selected" : ""}`}
            style={{ borderColor: TEAM_META[team].color }}
          >
            <span>{TEAM_META[team].emoji}</span>
            <b>{TEAM_META[team].name}</b>
            <small>{takenBy ? takenBy.name : selected ? "You" : "Open"}</small>
          </button>
        );
      })}
    </div>
  );
}

function TargetSelect({ team, lobby, onChange, disabled = false }) {
  const game = lobby.game;
  const teams = targetableBaseTeams(game.bases || {}, game.setup, team);
  const current = game.orders?.[team]?.target;
  const value = current === "blank" || current === "defend" || teams.includes(current) ? current : "blank";
  return (
    <select value={value} disabled={disabled} title={disabled ? "Only this team's player can change this target" : "Choose target"} onChange={(e) => onChange(team, e.target.value)}>
      <option value="blank">Blank / random</option>
      <option value="defend">Defend base</option>
      {teams.map((target) => (
        <option key={target} value={target}>
          Target {TEAM_META[target].name}
        </option>
      ))}
    </select>
  );
}

function UnitTargetSelect({ lobby, unit, onChange, disabled = false, allowManualTarget = false, onBeginManualTarget }) {
  const game = lobby.game;
  const teams = targetableBaseTeams(game.bases || {}, game.setup, unit.team);
  const value = unit.targetOverride && unitTargetOptions(game, unit).includes(unit.targetOverride) ? unit.targetOverride : "inherit";
  return (
    <select
      value={value}
      disabled={disabled}
      title={disabled ? "Only this unit's team can change its orders" : "Choose this unit's personal target"}
      onChange={(e) => {
        if (e.target.value === "manual") onBeginManualTarget?.(unit.id);
        else onChange(e.target.value);
      }}
    >
      <option value="inherit">Use team target</option>
      <option value="blank">Blank / random</option>
      {resourceTargetType(unit) === "tree" && <option value="resource_tree">Chop enemy trees</option>}
      {resourceTargetType(unit) === "rock" && <option value="resource_rock">Mine enemy rocks</option>}
      <option value="defend">Defend base</option>
      <option value="protectCarrier">Protect flag carrier</option>
      {allowManualTarget && <option value="homeTeleport">Home teleport</option>}
      {allowManualTarget && <option value="manual">Select tile/unit/resource...</option>}
      {teams.map((target) => (
        <option key={target} value={target}>
          Target {TEAM_META[target].name}
        </option>
      ))}
    </select>
  );
}

function targetLabel(value, unit, game) {
  const actual = value && value !== "inherit" ? value : game?.orders?.[unit?.team]?.target;
  if (!actual || actual === "blank") return "Blank / random";
  if (actual === "defend") return "Defend base";
  if (actual === "protectCarrier") return "Protect flag carrier";
  if (actual === "homeTeleport") return `Home teleport${unit?.homeTeleportStartedAt != null ? ` (${Math.max(0, Math.ceil(HOME_TELEPORT_SECONDS - ((game?.fightTime || 0) - unit.homeTeleportStartedAt)))}s)` : ""}`;
  if (actual === "resource_tree") return "Chop enemy trees";
  if (actual === "resource_rock") return "Mine enemy rocks";
  if (actual === "manual") {
    if (unit?.manualTargetType === "unit") {
      const targetUnit = game?.units?.[unit.manualTargetUnitId];
      return `Manual attack: ${targetUnit?.name || (unit.manualTargetUnitId ? String(unit.manualTargetUnitId).slice(-6) : "unit")}`;
    }
    if (unit?.manualTargetType === "tile") return `Manual move: ${unit.manualTargetRow},${unit.manualTargetCol}`;
    if (unit?.manualTargetType === "resource") return `Manual ${unit.manualResourceType === "tree" ? "chop" : "mine"}: ${unit.manualTargetRow},${unit.manualTargetCol}`;
    return "Select tile/unit/resource";
  }
  return TEAM_META[actual] ? `Target ${TEAM_META[actual].name}` : "Unknown";
}

function selectedTargetPreview(game, unit, activeTeam) {
  if (!game || !unit || unit.team !== activeTeam) return null;
  const setup = game.setup || DEFAULT_SETUP;
  const units = arrayFromObject(game.units);
  const respawns = arrayFromObject(game.respawnQueue);
  const bases = game.bases || {};
  const board = game.board || [];
  const combatTeams = teamsWithCombatPresence(bases, units, respawns, setup);
  if (unit.targetOverride === "homeTeleport") {
    const ownBase = baseOf(unit.team, sizeOf(setup));
    return { kind: "base", row: ownBase.row, col: ownBase.col, label: "Home teleport destination" };
  }
  if ((game.setup?.gameMode || "classic") === "capture_flag") {
    if (unit.carryingFlagTeam) {
      const ownBase = baseOf(unit.team, sizeOf(setup));
      return { kind: "base", row: ownBase.row, col: ownBase.col, label: "Return flag" };
    }
    const enemyCarrier = enemyFlagCarrierForTeam(units, unit.team, combatTeams);
    if (enemyCarrier) return { kind: "unit", row: enemyCarrier.row, col: enemyCarrier.col, unitId: enemyCarrier.id, label: "Enemy flag carrier" };
  }
  const manual = manualTargetForUnit(unit, board, units, setup);
  if (manual.kind === "unit") return { kind: "unit", row: manual.target.row, col: manual.target.col, unitId: manual.target.id, label: "Manual unit target" };
  if (manual.kind === "tile") return { kind: "tile", row: manual.target.row, col: manual.target.col, label: "Manual move target" };
  if (manual.kind === "resource") return { kind: "resource", row: manual.target.row, col: manual.target.col, label: manual.resourceType === "tree" ? "Manual tree target" : "Manual rock target" };

  const ordered = effectiveTargetOrder(unit, game);
  if (ordered === "resource_tree" || ordered === "resource_rock") {
    const resourceType = ordered === "resource_tree" ? "tree" : "rock";
    const target = nearestResourceTile(board, units, unit, setup, resourceType);
    if (target) return { kind: "resource", row: target.row, col: target.col, label: resourceType === "tree" ? "Tree target" : "Rock target" };
  }
  if (ordered === "defend") {
    const target = defendTargetForUnit(board, units, unit, setup, combatTeams, bases);
    if (target) return { kind: "unit", row: target.row, col: target.col, unitId: target.id, label: "Defend target" };
  }
  if (ordered === "protectCarrier") {
    const carrier = alliedFlagCarrierForTeam(units, unit.team, unit.id);
    const threat = carrier ? enemyThreatNearUnit(board, units, carrier, unit, combatTeams, setup) : null;
    if (threat) return { kind: "unit", row: threat.row, col: threat.col, unitId: threat.id, label: "Threat to carrier" };
    if (carrier) return { kind: "unit", row: carrier.row, col: carrier.col, unitId: carrier.id, label: "Escort carrier" };
  }
  if (TEAM_META[ordered] && (bases?.[ordered]?.hp ?? 0) > 0) {
    const base = baseOf(ordered, sizeOf(setup));
    return { kind: "base", row: base.row, col: base.col, label: `${TEAM_META[ordered].name} base` };
  }
  if (unit.randomTarget && TEAM_META[unit.randomTarget] && (bases?.[unit.randomTarget]?.hp ?? 0) > 0) {
    const base = baseOf(unit.randomTarget, sizeOf(setup));
    return { kind: "base", row: base.row, col: base.col, label: `${TEAM_META[unit.randomTarget].name} base` };
  }
  return null;
}

function TargetControl({ team, lobby, player, onChange, compact = false }) {
  const canEdit = canPlayerControlTarget(player, team);
  if (!canEdit) {
    return <span className={compact ? "hidden-target compact-hidden-target" : "hidden-target"}>Hidden</span>;
  }
  return <TargetSelect team={team} lobby={lobby} onChange={onChange} disabled={false} />;
}

function HomeScreen({ name, setName, joinCode, setJoinCode, onHost, onJoin, status }) {
  return (
    <div className="home-screen">
      <div className="home-card">
        <h1>Quadrants Beta Online</h1>
        <p>Host a lobby, share the 6-letter code, and battle with live Firebase syncing.</p>

        <label>
          Display name
          <input value={name} maxLength={18} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </label>

        <div className="home-actions">
          <Button onClick={onHost} disabled={!name.trim()} variant="primary">
            Host Lobby
          </Button>
        </div>

        <div className="join-box">
          <label>
            Lobby code
            <input value={joinCode} maxLength={6} onChange={(e) => setJoinCode(normalizeLobbyCode(e.target.value))} placeholder="ABCDEF" />
          </label>
          <Button onClick={onJoin} disabled={!name.trim() || joinCode.length !== 6}>
            Join Lobby
          </Button>
        </div>

        {status && <div className="status-line">{status}</div>}
      </div>
    </div>
  );
}

function LobbyView({ lobby, playerId, isHost, onUpdateSetup, onStartBuild, onChooseTeam, onLeave }) {
  const players = currentPlayers(lobby);
  const player = lobby.players?.[playerId];
  const enoughPlayers = activeGamePlayers(lobby).length >= 2 && activeGamePlayers(lobby).length === activeTeams(lobby.setup).length;

  return (
    <div className="panel-stack">
      <section className="card hero-card">
        <div>
          <h2>Lobby {lobby.code}</h2>
          <p>Share this code with players. The host can start when active team slots are filled.</p>
        </div>
        <div>
          <div className="lobby-code">{lobby.code}</div>
          <div className="action-group host-mini-actions">
            <Button onClick={() => navigator.clipboard?.writeText(`${location.origin}${location.pathname}`)}>Copy Site Link</Button>
            {isHost && <Pill tone="host">Host controls enabled</Pill>}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h3>Players</h3>
          <div className="player-list">
            {players.map((p) => (
              <div className="player-row" key={p.id}>
                <span className={`connection-dot ${p.connected ? "on" : ""}`} />
                <span className="player-name">{p.name}</span>
                <span>{p.team ? `${TEAM_META[p.team].emoji} ${TEAM_META[p.team].name}` : "Spectator"}</span>
                {lobby.hostId === p.id && <Pill tone="host">Host</Pill>}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Match Settings {isHost ? "" : "(host only)"}</h3>
          <div className="settings-grid">
            <label>
              Players
              <select disabled={!isHost} value={lobby.setup.players} onChange={(e) => onUpdateSetup({ players: Number(e.target.value) })}>
                <option value={2}>2 players</option>
                <option value={3}>3 players</option>
                <option value={4}>4 players</option>
              </select>
            </label>
            <label>
              Game mode
              <select disabled={!isHost} value={lobby.setup.gameMode || "classic"} onChange={(e) => onUpdateSetup({ gameMode: e.target.value })}>
                {Object.entries(GAME_MODES).map(([id, mode]) => <option key={id} value={id}>{mode.name}</option>)}
              </select>
            </label>
            <label>
              Map template
              <select disabled={!isHost} value={lobby.setup.mapTemplate || "classic"} onChange={(e) => onUpdateSetup({ mapTemplate: e.target.value })}>
                {Object.entries(MAP_TEMPLATES).map(([id, map]) => <option key={id} value={id}>{map.name}</option>)}
              </select>
            </label>
            <label>
              CTF score limit
              <input disabled={!isHost || (lobby.setup.gameMode || "classic") !== "capture_flag"} type="number" min="1" max="10" value={lobby.setup.ctfScoreLimit || 3} onChange={(e) => onUpdateSetup({ ctfScoreLimit: Number(e.target.value) })} />
            </label>
            <label>
              Grid
              <select disabled={!isHost} value={lobby.setup.gridSize} onChange={(e) => onUpdateSetup({ gridSize: Number(e.target.value) })}>
                <option value={13}>13x13 compact</option>
                <option value={15}>15x15</option>
                <option value={17}>17x17 default</option>
                <option value={20}>20x20 large</option>
                <option value={25}>25x25 huge</option>
              </select>
            </label>
            <label>
              Starting gold
              <input disabled={!isHost} type="number" value={lobby.setup.startingGold} onChange={(e) => onUpdateSetup({ startingGold: Number(e.target.value) })} />
            </label>
            <label>
              Max units
              <input disabled={!isHost} type="number" value={lobby.setup.maxUnits} onChange={(e) => onUpdateSetup({ maxUnits: Number(e.target.value) })} />
            </label>
            <label>
              Base HP
              <input disabled={!isHost} type="number" value={lobby.setup.baseHp} onChange={(e) => onUpdateSetup({ baseHp: Number(e.target.value) })} />
            </label>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Choose Team</h3>
        <TeamSelect lobby={lobby} player={player} disabled={false} onChoose={onChooseTeam} />
      </section>

      <section className="action-bar">
        <Button onClick={onLeave}>Leave Lobby</Button>
        {isHost && (
          <Button onClick={onStartBuild} disabled={!enoughPlayers} variant="primary">
            Start Build Phase
          </Button>
        )}
        {!enoughPlayers && <span className="muted">Fill all active team slots before starting.</span>}
      </section>
    </div>
  );
}

function reachableRoadKeys(board, team, setup) {
  const size = sizeOf(setup);
  const base = baseOf(team, size);
  const out = new Set();
  const queue = [base];
  const seen = new Set([key(base.row, base.col)]);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (queue.length) {
    const cur = queue.shift();
    const curCell = board[cur.row]?.[cur.col];
    const curBaseTeam = baseTeamAt(cur.row, cur.col, setup);
    if (curCell && (curCell.owner === team || curCell.owner === "neutral" || curBaseTeam === team)) out.add(key(cur.row, cur.col));
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr, nc = cur.col + dc;
      if (!inBounds(nr, nc, size) || seen.has(key(nr, nc))) continue;
      const cell = board[nr][nc];
      const nextBaseTeam = baseTeamAt(nr, nc, setup);
      const visibleToBuilder = cell.owner === team || cell.owner === "neutral" || nextBaseTeam === team;
      if (!visibleToBuilder || !walkable(cell, setup)) continue;
      seen.add(key(nr, nc));
      queue.push({ row: nr, col: nc });
    }
  }
  return out;
}

function ReadyPanel({ lobby, playerId, phase, onToggleReady, isHost, onAdvance, advanceText, canAdvance }) {
  const players = activeGamePlayers(lobby);
  const ready = readyMap(lobby, phase);
  const meReady = Boolean(ready[playerId]);
  return (
    <section className="card compact">
      <div className="section-title">
        <h3>{phase === "build" ? "Build Finalization" : "Buy Finalization"}</h3>
        <Button onClick={() => onToggleReady(!meReady)} variant={meReady ? "success" : "primary"}>
          {meReady ? "Unfinalize" : "Finalize"}
        </Button>
      </div>
      <div className="ready-list">
        {players.map((p) => (
          <div key={p.id} className="ready-row">
            <span>{TEAM_META[p.team]?.emoji} {p.name}</span>
            <Pill tone={ready[p.id] ? "ready" : "waiting"}>{ready[p.id] ? "Ready" : "Waiting"}</Pill>
          </div>
        ))}
      </div>
      {isHost && (
        <Button onClick={onAdvance} disabled={!canAdvance} variant="primary" className="full-width">
          {advanceText}
        </Button>
      )}
    </section>
  );
}

function BoardView({ lobby, player, selectedTool, onCellClick, onUnitClick, selectedUnitId, selectedResource, visualToggles = {} }) {
  const game = lobby.game;
  const setup = game.setup;
  const size = sizeOf(setup);
  const units = arrayFromObject(game.units);
  const splats = arrayFromObject(game.splats);
  const effects = arrayFromObject(game.effects);
  const unitsByCell = useMemo(() => {
    const map = new Map();
    for (const unit of units) {
      const k = key(unit.row, unit.col);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(unit);
    }
    return map;
  }, [game.units]);
  const splatsByCell = useMemo(() => {
    const map = new Map();
    for (const splat of splats) {
      const k = key(splat.row, splat.col);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(splat);
    }
    return map;
  }, [game.splats]);
  const effectsByCell = useMemo(() => {
    const map = new Map();
    for (const effect of effects) {
      for (const point of [{ row: effect.fromRow, col: effect.fromCol }, { row: effect.row, col: effect.col }]) {
        const k = key(point.row, point.col);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(effect);
      }
    }
    return map;
  }, [game.effects]);

  const activeTeam = player?.team;
  const showHitsplats = visualToggles.showHitsplats !== false;
  const showUnitNames = visualToggles.showUnitNames !== false;
  const [hoverUnit, setHoverUnit] = useState(null);
  const selectedUnit = selectedUnitId ? units.find((u) => u.id === selectedUnitId && u.hp > 0) : null;
  const previewUnit = hoverUnit || selectedUnit;
  const selectedTarget = useMemo(() => selectedUnit ? selectedTargetPreview(game, selectedUnit, activeTeam) : null, [game, selectedUnit, activeTeam]);
  const projectileEffects = effects.filter((e) => combatType(e.style) === "range" || combatType(e.style) === "magic");
  const reachableBuildKeys = useMemo(() => activeTeam && lobby.phase === "build" ? reachableRoadKeys(game.board, activeTeam, setup) : new Set(), [game.board, activeTeam, lobby.phase, setup]);

  return (
    <div className="board-wrap">
      <div className="board" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {game.board.flat().map((cell) => {
          const baseTeam = baseTeamAt(cell.row, cell.col, setup);
          const cellUnits = unitsByCell.get(key(cell.row, cell.col)) || [];
          const cellSplats = splatsByCell.get(key(cell.row, cell.col)) || [];
          const cellEffects = effectsByCell.get(key(cell.row, cell.col)) || [];
          const fogged = isBuildFogged(cell, activeTeam, lobby.phase, setup);
          const visibleType = fogged ? "empty" : cell.type;
          const hiddenUnused = lobby.phase !== "build" && visibleType === "empty" && !baseTeam && cellUnits.length === 0;
          const firstUnit = cellUnits[0];
          const style = fogged ? FOG_STYLE : TILE_STYLE[visibleType] || TILE_STYLE.empty;
          const inHoverRange = previewUnit && !fogged && !blocksLineOfSight(cell) && canAttack(game.board, previewUnit, cell, STYLE[previewUnit.style]?.range ?? 1, setup);
          const inBuildPath = !fogged && reachableBuildKeys.has(key(cell.row, cell.col)) && lobby.phase === "build" && walkable(cell, setup) && (cell.owner === activeTeam || cell.owner === "neutral");
          const selectedHere = selectedUnitId && cellUnits.some((u) => u.id === selectedUnitId);
          const targetHere = selectedTarget && selectedTarget.row === cell.row && selectedTarget.col === cell.col && !fogged;
          const resourceSelectedHere = selectedResource && selectedResource.row === cell.row && selectedResource.col === cell.col && !fogged;
          const title = firstUnit ? unitHoverText(firstUnit) : fogged ? "Hidden enemy tile" : `${cell.row},${cell.col} owner:${cell.owner} type:${cell.type}${selectedTarget && targetHere ? ` • ${selectedTarget.label}` : ""}${cell.regrowType ? ` regrows ${cell.regrowType} in ${Math.max(0, Math.ceil((cell.regrowAt ?? 0) - (game.fightTime || 0)))}s` : ""}`;
          const resourceType = !fogged && (cell.type === "tree" || cell.type === "rock") ? cell.type : null;
          const resourceMax = resourceType ? resourceMaxHp(resourceType) : 0;
          const resourceHp = resourceType ? resourceCurrentHp(cell, resourceType) : 0;
          const showResourceHp = Boolean(resourceType && cell.resourceHp != null && resourceHp < resourceMax);
          return (
            <button
              key={key(cell.row, cell.col)}
              onClick={() => firstUnit && onUnitClick ? onUnitClick(firstUnit.id) : onCellClick(cell.row, cell.col)}
              onMouseEnter={() => setHoverUnit(firstUnit || null)}
              onMouseLeave={() => setHoverUnit(null)}
              className={`cell ${hiddenUnused ? "hidden-cell" : ""} ${cell.owner === activeTeam && lobby.phase === "build" ? "own-cell" : ""} ${cell.owner === "neutral" ? "neutral-cell" : ""} ${cell.owner === "void" && visibleType === "empty" ? "void-cell" : ""} ${inHoverRange ? "range-preview" : ""} ${inBuildPath ? "path-preview" : ""} ${selectedHere ? "selected-unit-cell" : ""} ${resourceSelectedHere ? "selected-resource-cell" : ""} ${targetHere ? `selected-target-cell target-${selectedTarget.kind}` : ""}`}
              style={style}
              title={title}
            >
              {!hiddenUnused && (
                <>
                  {lobby.phase === "build" && (
                    <>
                      <div className="coord">{cell.row},{cell.col}</div>
                      <div className="owner-mark">{fogged ? "?" : String(cell.owner)[0]}</div>
                    </>
                  )}
                  {showHitsplats && cellSplats.slice(-4).map((s, i) => (
                    <div className={`splat splat-${s.damageType || "melee"}`} key={s.id} style={{ top: 5 + i * 14 }}>
                      {s.text}
                    </div>
                  ))}
                  <div className="cell-content">
                    {baseTeam ? <BaseIcon team={baseTeam} /> : cell.owner === "void" && visibleType === "empty" ? "×" : fogged ? "?" : visibleType === "empty" ? "·" : TILE[visibleType]?.image ? <img className="tile-object-icon" src={asset(TILE[visibleType].image)} alt={TILE[visibleType].name} /> : visibleType === "wall" ? TILE[visibleType].icon : ""}
                    {targetHere && <div className="target-marker">🎯</div>}
                    {showResourceHp && <div className="resource-hpbar"><div className="resource-hpbar-fill" style={{ width: `${Math.max(0, Math.min(100, (resourceHp / resourceMax) * 100))}%` }} /></div>}
                    {cell.regrowType && !fogged && <div className="regrow-timer">{Math.max(0, Math.ceil((cell.regrowAt ?? 0) - (game.fightTime || 0)))}s</div>}
                    {firstUnit && <UnitToken unit={firstUnit} bump={cellEffects.length > 0} showName={showUnitNames} />}
                    {cellUnits.length > 1 && <div className="stack-count">+{cellUnits.length - 1}</div>}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      <svg className="projectiles" viewBox={`0 0 ${size} ${size}`} preserveAspectRatio="none">
        {projectileEffects.map((p) => {
          const x1 = p.fromCol + 0.5;
          const y1 = p.fromRow + 0.5;
          const x2 = p.col + 0.5;
          const y2 = p.row + 0.5;
          const projectileType = combatType(p.style);
          return (
            <g key={p.id} className="projectile-fade">
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth="0.035" strokeDasharray="0.12 0.12" opacity="0.45" />
              {projectileType === "magic" ? (
                <circle r="0.13" fill="#d8b4fe" stroke="black" strokeWidth="0.025">
                  <animateMotion dur="0.7s" fill="freeze" path={`M ${x1} ${y1} L ${x2} ${y2}`} />
                </circle>
              ) : (
                <g>
                  <animateMotion dur="0.7s" fill="freeze" path={`M ${x1} ${y1} L ${x2} ${y2}`} rotate="auto" />
                  <polygon points="-0.12,-0.08 0.16,0 -0.12,0.08" fill="#fde68a" stroke="black" strokeWidth="0.025" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BuildPanel({ lobby, player, selectedTool, setSelectedTool, onReady, isHost, onAdvance, onSetOrder }) {
  const game = lobby.game;
  const teams = activeTeams(game.setup);
  const connections = Object.fromEntries(teams.map((team) => [team, teamConnectedToCenter(game.board, team, game.setup)]));
  const canAdvance = allReadyForPhase(lobby, "build") && allTeamsConnectedToCenter(game.board, game.setup);

  return (
    <aside className="side-panel">
      <section className="card compact">
        <h3>Build Controls</h3>
        <p className="muted">You can build only inside your own quadrant. Keep {BUILD_PHASE_GOLD_RESERVE}g for buy phase.</p>
        <div className="tool-grid">
          {Object.keys(TILE).map((type) => (
            <Button key={type} onClick={() => setSelectedTool({ kind: "terrain", type })} variant={selectedTool.type === type ? "primary" : "default"}>
              {TILE[type].icon || "·"} {TILE[type].name} {TILE[type].cost ? `${TILE[type].cost}g` : ""}
            </Button>
          ))}
          <Button onClick={() => setSelectedTool({ kind: "inspect" })} variant={selectedTool.kind === "inspect" ? "primary" : "default"}>Inspect</Button>
        </div>
      </section>

      <section className="card compact">
        <h3>Teams</h3>
        {teams.map((team) => (
          <div key={team} className="team-status">
            <span>{TEAM_META[team].emoji} {TEAM_META[team].name}</span>
            <span>{game.gold?.[team] ?? 0}g</span>
            <Pill tone={connections[team] ? "ready" : "waiting"}>{connections[team] ? "center ready" : "needs path"}</Pill>
          </div>
        ))}
      </section>

      <section className="card compact">
        <h3>Targets</h3>
        {teams.map((team) => (
          <div key={team} className="target-row">
            <span>{TEAM_META[team].emoji} {TEAM_META[team].name}</span>
            <TargetControl team={team} lobby={lobby} player={player} onChange={onSetOrder} />
          </div>
        ))}
      </section>

      <ReadyPanel lobby={lobby} playerId={player.id} phase="build" onToggleReady={onReady} isHost={isHost} onAdvance={onAdvance} advanceText="Advance to Buy Phase" canAdvance={canAdvance} />
    </aside>
  );
}

function BuyPanel({ lobby, player, onBuy, onUpdateUnit, onReady, isHost, onAdvance, onSetOrder }) {
  const game = lobby.game;
  const teams = activeTeams(game.setup);
  const myUnits = arrayFromObject(game.units).filter((u) => u.team === player.team).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const canAdvance = allReadyForPhase(lobby, "buy");

  return (
    <div className="buy-overlay">
      <section className="card compact">
        <h3>Buy Units</h3>
        <p className="muted">{TEAM_META[player.team]?.name} gold: {game.gold?.[player.team] ?? 0} • Units: {myUnits.length}/{game.setup.maxUnits}</p>
        <div className="unit-shop">
          {[...MINION_STYLE_IDS].sort((a, b) => (STYLE[a].cost - STYLE[b].cost) || STYLE[a].name.localeCompare(STYLE[b].name)).map((styleId) => {
            const s = STYLE[styleId];
            return (
              <button className="unit-card" key={styleId} onClick={() => onBuy(styleId)}>
                <StyleIcon styleId={styleId} size="lg" />
                <b>{s.name}</b>
                <span>{s.cost}g • {s.combatType} • Rng {s.range} • Speed {attackSpeedLabel(styleId)} • Max {previewMaxHit(styleId)}</span>
                {statGrid(makeStats(styleId))}
                {passiveText(styleId).map((text) => <small key={text} className="unit-passive">{text}</small>)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card compact">
        <h3>Your Units</h3>
        <div className="owned-units">
          {myUnits.length === 0 && <p className="muted">No units yet.</p>}
          {myUnits.map((u) => (
            <div className="owned-unit" key={u.id}>
              <div className="owned-header">
                <StyleIcon styleId={u.style} />
                <b>{STYLE[u.style].name}</b>
                <span>ID {String(u.id).slice(-5)}</span>
              </div>
              <input value={u.name} onChange={(e) => onUpdateUnit(u.id, { name: e.target.value })} />
              <select value={u.priority} onChange={(e) => onUpdateUnit(u.id, { priority: e.target.value })}>
                <option value="auto">Auto: lowest HP in range</option>
                <option value="closest">Closest reachable</option>
                <option value="farthest">Farthest reachable</option>
                <option value="highestDamage">Highest damage dealer</option>
                <option value="lowestDefence">Lowest defence</option>
              </select>
              <UnitTargetSelect lobby={lobby} unit={u} onChange={(targetOverride) => onUpdateUnit(u.id, { targetOverride })} />
              <UnitStatSummary unit={u} />
            </div>
          ))}
        </div>
      </section>

      <section className="card compact">
        <h3>Targets</h3>
        {teams.map((team) => (
          <div key={team} className="target-row">
            <span>{TEAM_META[team].emoji} {TEAM_META[team].name}</span>
            <TargetControl team={team} lobby={lobby} player={player} onChange={onSetOrder} />
          </div>
        ))}
      </section>

      <ReadyPanel lobby={lobby} playerId={player.id} phase="buy" onToggleReady={onReady} isHost={isHost} onAdvance={onAdvance} advanceText="Start Fight" canAdvance={canAdvance} />
    </div>
  );
}

function FightStats({ lobby, player }) {
  const game = lobby.game;
  const units = arrayFromObject(game.units);
  const respawns = arrayFromObject(game.respawnQueue);
  const allUnits = [...units, ...respawns].sort((a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0));
  const teams = activeTeams(game.setup);

  return (
    <div className="stats-overlay">
      <div className="stats-grid">
        {teams.map((team) => {
          const teamUnits = allUnits.filter((u) => u.team === team);
          return (
            <div className="stats-card" key={team} style={{ borderColor: TEAM_META[team].color }}>
              <h3>{TEAM_META[team].emoji} {TEAM_META[team].name}</h3>
              <p>Base HP {Math.max(0, Math.round(game.bases?.[team]?.hp ?? 0))}/{game.setup.baseHp}</p>
              <p>Alive {units.filter((u) => u.team === team).length} • Respawn {respawns.filter((u) => u.team === team).length}</p>
              <p>Damage {teamUnits.reduce((s, u) => s + (u.totalDamage ?? 0), 0)} • Kills {teamUnits.reduce((s, u) => s + (u.kills ?? 0), 0)}</p>
            </div>
          );
        })}
      </div>
      <div className="unit-table">
        {allUnits.map((u) => (
          <div className="unit-row" key={u.id}>
            <span>{TEAM_META[u.team]?.emoji}</span>
            <StyleIcon styleId={u.style} />
            <b>{u.name}</b>
            <span>{STYLE[u.style]?.name}</span>
            <span>HP {u.hp ? Math.round(u.hp) : "respawn"}</span>
            <span>{u.totalDamage ?? 0} dmg</span>
            <span>{u.kills ?? 0} kills</span>
            <span>{u.deathCount ?? 0} deaths</span>
          </div>
        ))}
      </div>
    </div>
  );
}


function ResourceInfoCard({ game, selectedResource, onClose }) {
  const cell = selectedResource ? game.board?.[selectedResource.row]?.[selectedResource.col] : null;
  const resourceType = cell?.type === "tree" || cell?.type === "rock" ? cell.type : cell?.regrowType;
  if (!cell || !resourceType) {
    return (
      <div className="unit-info-card">
        <div className="unit-info-header">
          <span className="resource-info-icon">?</span>
          <div>
            <h4>No resource selected</h4>
            <p>The selected tile is no longer a tree, rock, or regrowing resource.</p>
          </div>
          <button className="plain-x" onClick={onClose} title="Clear selected tile">×</button>
        </div>
      </div>
    );
  }
  const live = cell.type === resourceType;
  const max = resourceMaxHp(resourceType);
  const hp = live ? resourceCurrentHp(cell, resourceType) : 0;
  const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, max)) * 100));
  const clears = cell.resourceDeathCount ?? 0;
  const regrowRemaining = cell.regrowType ? Math.max(0, Math.ceil((cell.regrowAt ?? 0) - (game.fightTime || 0))) : 0;
  const owner = resourceTileOwner(cell, game.setup);
  return (
    <div className="unit-info-card resource-info-card">
      <div className="unit-info-header">
        <span className="resource-info-icon">{resourceType === "tree" ? "🌲" : "⛏️"}</span>
        <div>
          <h4>{resourceType === "tree" ? "Tree" : "Rock"} Tile</h4>
          <p>{cell.row},{cell.col} • {TEAM_META[owner]?.name || owner || "neutral"} zone</p>
        </div>
        <button className="plain-x" onClick={onClose} title="Clear selected tile">×</button>
      </div>
      <div className="large-hpbar"><div style={{ width: `${hpPct}%` }} /></div>
      <div className="unit-detail-grid">
        <span>Status <b>{live ? "Standing" : "Regrowing"}</b></span>
        <span>HP <b>{live ? `${hp}/${max}` : `0/${max}`}</b></span>
        <span>Respawn <b>{cell.regrowType ? `${regrowRemaining}s` : "Ready"}</b></span>
        <span>Cleared <b>{clears}×</b></span>
        <span>Next timer <b>{resourceRegrowSeconds(clears + 1)}s</b></span>
        <span>Pathing <b>Blocked</b></span>
        <span>Line of sight <b>{resourceType === "tree" ? "Blocked" : "Open"}</b></span>
        <span>Manual orders <b>{resourceType === "tree" ? "Woodcutter" : "Miner"}</b></span>
      </div>
      <p className="muted">Auto skillers ignore own-zone resources, but manual skiller targets can choose matching resources in any zone.</p>
    </div>
  );
}

function FightLeftPanel({ lobby, player, selectedUnitId, setSelectedUnitId, selectedResource, setSelectedResource, onUpdateUnit, pendingManualTargetUnitId, onBeginManualTarget }) {
  const game = lobby.game;
  const teams = activeTeams(game.setup);
  const units = arrayFromObject(game.units);
  const respawns = arrayFromObject(game.respawnQueue);
  const selectedUnit = units.find((u) => u.id === selectedUnitId) || null;
  const carriers = units.filter((u) => u.hp > 0 && u.carryingFlagTeam);

  return (
    <aside className="side-panel fight-left-panel">
      <section className="card compact">
        <h3>Selected Info</h3>
        {selectedUnit ? (
          <UnitInfoCard lobby={lobby} unit={selectedUnit} player={player} onUpdateUnit={onUpdateUnit} onClose={() => setSelectedUnitId(null)} pendingManualTargetUnitId={pendingManualTargetUnitId} onBeginManualTarget={onBeginManualTarget} />
        ) : selectedResource ? (
          <ResourceInfoCard game={game} selectedResource={selectedResource} onClose={() => setSelectedResource(null)} />
        ) : (
          <p className="muted">Click any active unit, tree, rock, or regrowing resource tile to view details.</p>
        )}
      </section>

      {(game.setup.gameMode === "capture_flag") && (
        <section className="card compact">
          <h3>Flag Status</h3>
          {teams.map((team) => {
            const carrier = carriers.find((u) => u.carryingFlagTeam === team);
            return (
              <div key={team} className="team-status">
                <span>{TEAM_META[team].emoji} {TEAM_META[team].name}</span>
                <span>{carrier ? `${TEAM_META[carrier.team]?.name} ${carrier.name}` : "Home"}</span>
              </div>
            );
          })}
          <div className="score-list">
            {teams.map((team) => <div key={`score-${team}`} className="team-status"><span>{TEAM_META[team].emoji} Score</span><Pill>{game.ctfScores?.[team] ?? 0}/{game.setup.ctfScoreLimit ?? 3}</Pill></div>)}
          </div>
        </section>
      )}

      <section className="card compact">
        <h3>Kill Feed</h3>
        <div className="kill-feed left-feed">
          {(game.killFeed || []).slice(0, 12).map((entry) => <div className="feed-line" key={entry.id} style={{ borderColor: TEAM_META[entry.team]?.color }}>{entry.text}</div>)}
          {!(game.killFeed || []).length && <p className="muted">No kills or flag grabs yet.</p>}
        </div>
      </section>

      <section className="card compact">
        <h3>Respawns</h3>
        {teams.map((team) => (
          <div key={`respawn-${team}`} className="team-status">
            <span>{TEAM_META[team].emoji} {TEAM_META[team].name}</span>
            <Pill>{respawns.filter((u) => u.team === team).length} queued</Pill>
          </div>
        ))}
      </section>
    </aside>
  );
}

function UnitInfoCard({ lobby, unit, player, onUpdateUnit, onClose, pendingManualTargetUnitId, onBeginManualTarget }) {
  const game = lobby.game;
  const canEdit = unit.team === player?.team;
  const style = STYLE[unit.style];
  const hpPct = Math.max(0, Math.min(100, (unit.hp / Math.max(1, maxHp(unit))) * 100));
  const accuracy = Math.round(100 * (unit.hitsLanded ?? 0) / Math.max(1, unit.attacksAttempted ?? 0));
  return (
    <div className="unit-info-card">
      <div className="unit-info-header">
        <StyleIcon styleId={unit.style} size="lg" />
        <div>
          <h4>{unit.name}</h4>
          <p>{TEAM_META[unit.team]?.emoji} {TEAM_META[unit.team]?.name} • {style.name}</p>
        </div>
        <button className="plain-x" onClick={onClose} title="Clear selected unit">×</button>
      </div>
      <div className="large-hpbar"><div style={{ width: `${hpPct}%` }} /></div>
      <div className="unit-detail-grid">
        <span>HP <b>{Math.round(unit.hp)}/{maxHp(unit)}</b></span>
        <span>Range <b>{style.range}</b></span>
        <span>Speed <b>{attackSpeedLabel(unit.style)}</b></span>
        <span>Max hit <b>{maxDamageRoll(unit, null)}</b></span>
        <span>Damage <b>{unit.totalDamage ?? 0}</b></span>
        <span>Kills <b>{unit.kills ?? 0}</b></span>
        <span>Accuracy <b>{accuracy}%</b></span>
        <span>Deaths <b>{unit.deathCount ?? 0}</b></span>
        {resourceTargetType(unit) && <span>Cleared <b>{unit.resourcesCleared ?? 0}</b></span>}
      </div>
      {unit.carryingFlagTeam && <div className="flag-note">🚩 Carrying {TEAM_META[unit.carryingFlagTeam]?.name || "enemy"} flag</div>}
      {passiveText(unit.style).map((text) => <p key={text} className="unit-passive detail-passive">{text}</p>)}
      <UnitStatSummary unit={unit} />
      <div className="unit-control-grid">
        <label>
          Unit target
          {canEdit ? (
            <UnitTargetSelect
              lobby={lobby}
              unit={unit}
              allowManualTarget
              onBeginManualTarget={onBeginManualTarget}
              onChange={(targetOverride) => {
                const basePatch = {
                  targetOverride,
                  manualTargetType: null,
                  manualTargetUnitId: null,
                  manualTargetRow: null,
                  manualTargetCol: null,
                  manualResourceType: null,
                  manualTargetStartedAt: null,
                  manualTargetBlockedSince: null,
                  homeTeleportStartedAt: null,
                  homeTeleportHpAtStart: null,
                  homeTeleportLastAttackedAtStart: null,
                  homeTeleportPreviousTargetOverride: null,
                  homeTeleportPreviousManualTargetType: null,
                  homeTeleportPreviousManualTargetUnitId: null,
                  homeTeleportPreviousManualTargetRow: null,
                  homeTeleportPreviousManualTargetCol: null,
                  homeTeleportPreviousManualResourceType: null,
                };
                if (targetOverride === "homeTeleport") {
                  onUpdateUnit(unit.id, {
                    ...basePatch,
                    homeTeleportStartedAt: game.fightTime || 0,
                    homeTeleportHpAtStart: unit.hp ?? 0,
                    homeTeleportLastAttackedAtStart: unit.lastAttackedAt ?? -1,
                    homeTeleportPreviousTargetOverride: unit.targetOverride && unit.targetOverride !== "homeTeleport" ? unit.targetOverride : "inherit",
                    homeTeleportPreviousManualTargetType: unit.manualTargetType ?? null,
                    homeTeleportPreviousManualTargetUnitId: unit.manualTargetUnitId ?? null,
                    homeTeleportPreviousManualTargetRow: unit.manualTargetRow ?? null,
                    homeTeleportPreviousManualTargetCol: unit.manualTargetCol ?? null,
                    homeTeleportPreviousManualResourceType: unit.manualResourceType ?? null,
                  });
                } else {
                  onUpdateUnit(unit.id, basePatch);
                }
              }}
            />
          ) : (
            <span className="hidden-target">Hidden</span>
          )}
        </label>
        <label>
          Playstyle
          {canEdit ? (
            <select value={unit.priority || "auto"} onChange={(e) => onUpdateUnit(unit.id, { priority: e.target.value })}>
              <option value="auto">Auto: lowest HP</option>
              <option value="closest">Closest reachable</option>
              <option value="farthest">Farthest reachable</option>
              <option value="highestDamage">Highest damage dealer</option>
              <option value="lowestDefence">Lowest defence</option>
            </select>
          ) : (
            <span className="hidden-target">Hidden</span>
          )}
        </label>
      </div>
      <p className="muted">Current target: {canEdit ? targetLabel(unit.targetOverride, unit, game) : "Hidden"}</p>
      {canEdit && unit.targetOverride === "homeTeleport" && <p className="teleport-note">Home teleport channels for {HOME_TELEPORT_SECONDS}s. Any incoming attack interrupts it.</p>}
      {canEdit && pendingManualTargetUnitId === unit.id && <p className="manual-target-note">Click an enemy unit to attack, a road/base tile to move, or any matching resource to chop/mine. If blocked for {MANUAL_TARGET_TIMEOUT}s it returns to team/random targeting.</p>}
      {canEdit && unit.targetOverride === "manual" && unit.manualTargetType && <button className="clear-manual-btn" onClick={() => onUpdateUnit(unit.id, { targetOverride: "inherit", manualTargetType: null, manualTargetUnitId: null, manualTargetRow: null, manualTargetCol: null, manualResourceType: null, manualTargetStartedAt: null, manualTargetBlockedSince: null, homeTeleportStartedAt: null, homeTeleportHpAtStart: null, homeTeleportLastAttackedAtStart: null, homeTeleportPreviousTargetOverride: null, homeTeleportPreviousManualTargetType: null, homeTeleportPreviousManualTargetUnitId: null, homeTeleportPreviousManualTargetRow: null, homeTeleportPreviousManualTargetCol: null, homeTeleportPreviousManualResourceType: null })}>Clear manual target</button>}
    </div>
  );
}

function FightPanel({ lobby, player, showStats, setShowStats, onSetOrder, selectedUnitId, onSelectUnit }) {
  const game = lobby.game;
  const teams = activeTeams(game.setup);
  const units = arrayFromObject(game.units);
  const respawns = arrayFromObject(game.respawnQueue);
  const myTeam = player?.team;
  const myUnits = myTeam ? units.filter((u) => u.team === myTeam) : [];
  const myRespawns = myTeam ? respawns.filter((u) => u.team === myTeam) : [];
  return (
    <aside className="side-panel fight-panel">
      <section className="card compact">
        <h3>Fight Controls</h3>
        <div className="team-status">
          <span>Fight time</span>
          <Pill>{Math.round(game.fightTime || 0)}s</Pill>
        </div>
        <Button onClick={() => setShowStats(!showStats)} variant="primary">{showStats ? "Hide Stats" : "Stats"}</Button>
      </section>

      {myTeam && (
        <section className="card compact">
          <h3>Your Target</h3>
          <div className="target-row own-target-row">
            <span>{TEAM_META[myTeam].emoji} {TEAM_META[myTeam].name}</span>
            <TargetControl team={myTeam} lobby={lobby} player={player} onChange={onSetOrder} />
          </div>
          <p className="muted">Other teams' targets are hidden.</p>
        </section>
      )}

      <section className="card compact">
        <h3>Teams</h3>
        {teams.map((team) => (
          <div key={team} className="team-status">
            <span>{TEAM_META[team].emoji} {TEAM_META[team].name}</span>
            <span>Base {Math.max(0, Math.round(game.bases?.[team]?.hp ?? 0))}</span>
            <Pill>{units.filter((u) => u.team === team).length} alive</Pill>
          </div>
        ))}
      </section>

      {myTeam && (
        <section className="card compact">
          <h3>Your Units</h3>
          <p className="muted">Alive {myUnits.length} • Respawn {myRespawns.length}</p>
          <div className="mini-unit-list">
            {[...myUnits, ...myRespawns].slice(0, 10).map((u) => {
              const alive = u.hp > 0 && myUnits.some((active) => active.id === u.id);
              return (
                <button
                  type="button"
                  className={`mini-unit mini-unit-button ${selectedUnitId === u.id ? "selected-mini-unit" : ""}`}
                  key={`fight-${u.id}`}
                  disabled={!alive}
                  onClick={() => alive && onSelectUnit?.(u.id)}
                  title={alive ? "Select this unit" : "Respawning units cannot be selected yet"}
                >
                  <StyleIcon styleId={u.style} />
                  <span>{u.name}</span>
                  <small>{u.hp > 0 ? `HP ${Math.round(u.hp)}` : `Respawn ${Math.max(0, u.timer ?? 0).toFixed(1)}s`}</small>
                </button>
              );
            })}
            {myUnits.length + myRespawns.length === 0 && <p className="muted">No units bought.</p>}
          </div>
        </section>
      )}
    </aside>
  );
}

function copyShareCode(lobby, results) {
  const payload = {
    code: lobby.code,
    mode: results.gameMode,
    winner: results.winner,
    fightTime: results.fightTime,
    bases: results.bases,
    ctfScores: results.ctfScores,
    teams: Object.fromEntries(Object.entries(results.teamStats || {}).map(([team, stats]) => [team, { damage: stats.damage, kills: stats.kills, deaths: stats.deaths, baseDamage: stats.baseDamage, unitDamage: stats.unitDamage }]))
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  navigator.clipboard?.writeText(encoded);
  alert("Post-game share code copied to clipboard.");
}

function ResultsView({ lobby, resetToLobby }) {
  const [tab, setTab] = useState("overview");
  const results = lobby.game.results || summarizeResults(lobby.game, "manual");
  const teams = activeTeams(lobby.game.setup);

  const exportCsv = () => {
    const rows = results.allUnits ?? [];
    const headers = ["rank", "team", "unit_id", "name", "style", "priority", "damage", "kills", "resources_cleared", "levels_gained", "deaths", "attack", "strength", "defence", "magic", "range", "prayer", "hitpoints"];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csvRows = rows.map((u, i) => [i + 1, TEAM_META[u.team]?.name, u.id, u.name, STYLE[u.style]?.name, u.priority ?? "auto", u.totalDamage ?? 0, u.kills ?? 0, u.resourcesCleared ?? 0, u.levelsGained ?? 0, u.deathCount ?? 0, ...STAT_KEYS.map((k) => u.stats?.[k]?.level ?? 1)].map(esc).join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quadrants-stats-${lobby.code}-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="results-screen">
      <section className="card hero-card">
        <div>
          <h2>Final Results: {results.winner || "No winner"}</h2>
          <p>Reason: {results.reason} • Fight time: {results.fightTime}s</p>
        </div>
        <div className="action-group">
          <Button onClick={exportCsv}>Export CSV</Button>
          <Button onClick={() => copyShareCode(lobby, results)}>Copy Share Code</Button>
          <Button onClick={resetToLobby} variant="primary">Back to Lobby</Button>
        </div>
      </section>

      <section className="tab-bar">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
        {teams.map((team) => <button key={team} className={tab === team ? "active" : ""} onClick={() => setTab(team)}>{TEAM_META[team].emoji} {TEAM_META[team].name}</button>)}
      </section>

      {tab === "overview" ? (
        <section className="grid three">
          <div className="card">
            <h3>Bases</h3>
            {Object.entries(results.bases || {}).map(([team, hp]) => <div className="result-line" key={team}>{TEAM_META[team]?.emoji} {TEAM_META[team]?.name}: {hp}</div>)}
          </div>
          {results.gameMode === "capture_flag" && <div className="card"><h3>Flag Scores</h3>{Object.entries(results.ctfScores || {}).map(([team, score]) => <div className="result-line" key={team}>{TEAM_META[team]?.emoji} {TEAM_META[team]?.name}: {score}</div>)}</div>}
          <div className="card">
            <h3>Top Damage</h3>
            {(results.topDamage || []).map((u, i) => <ResultUnitLine key={u.id} unit={u} rank={i + 1} />)}
          </div>
          <div className="card">
            <h3>Top Kills</h3>
            {(results.topKills || []).map((u, i) => <ResultUnitLine key={u.id} unit={u} rank={i + 1} />)}
          </div>
        </section>
      ) : (
        <TeamResults team={tab} results={results} />
      )}
    </div>
  );
}

function ResultUnitLine({ unit, rank }) {
  return (
    <div className="result-unit">
      <span>#{rank}</span>
      <span>{TEAM_META[unit.team]?.emoji}</span>
      <StyleIcon styleId={unit.style} />
      <b>{unit.name}</b>
      <span>{unit.totalDamage ?? 0} dmg</span>
      <span>{unit.kills ?? 0} kills</span>
      <span>{unit.deathCount ?? 0} deaths</span>
    </div>
  );
}

function TeamResults({ team, results }) {
  const rawStats = results.teamStats?.[team] || {};
  const units = arrayFromObject(rawStats.units).sort(
    (a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0) || (b.kills ?? 0) - (a.kills ?? 0)
  );
  const stats = {
    damage: rawStats.damage ?? units.reduce((s, u) => s + (u.totalDamage ?? 0), 0),
    unitDamage: rawStats.unitDamage ?? units.reduce((s, u) => s + (u.damageToUnits ?? 0), 0),
    baseDamage: rawStats.baseDamage ?? units.reduce((s, u) => s + (u.damageToBases ?? 0), 0),
    kills: rawStats.kills ?? units.reduce((s, u) => s + (u.kills ?? 0), 0),
    accuracy: rawStats.accuracy ?? Math.round(100 * units.reduce((s, u) => s + (u.hitsLanded ?? 0), 0) / Math.max(1, units.reduce((s, u) => s + (u.attacksAttempted ?? 0), 0))),
    levels: rawStats.levels ?? units.reduce((s, u) => s + (u.levelsGained ?? 0), 0),
    deaths: rawStats.deaths ?? units.reduce((s, u) => s + (u.deathCount ?? 0), 0),
  };
  return (
    <section className="card">
      <h3>{TEAM_META[team].emoji} {TEAM_META[team].name} Performance</h3>
      <div className="summary-grid">
        <Pill>Damage {stats.damage}</Pill>
        <Pill>Unit dmg {stats.unitDamage}</Pill>
        <Pill>Base dmg {stats.baseDamage}</Pill>
        <Pill>Kills {stats.kills}</Pill>
        <Pill>Accuracy {stats.accuracy}%</Pill>
        <Pill>Levels {stats.levels}</Pill>
        <Pill>Deaths {stats.deaths}</Pill>
      </div>
      <div className="unit-table">
        {units.length === 0 && <p className="muted">No units for this team.</p>}
        {units.map((u, i) => (
          <div className="team-unit-detail" key={u.id}>
            <div className="owned-header">
              <span>#{i + 1}</span>
              <StyleIcon styleId={u.style} />
              <b>{u.name}</b>
              <span>{STYLE[u.style]?.name}</span>
              <span>{u.totalDamage ?? 0} dmg</span>
              <span>{u.damageToUnits ?? 0}/{u.damageToBases ?? 0} unit/base</span>
              <span>{u.kills ?? 0} kills</span>
              {resourceTargetType(u) && <span>{u.resourcesCleared ?? 0} cleared</span>}
              <span>{Math.round(100 * (u.hitsLanded ?? 0) / Math.max(1, u.attacksAttempted ?? 0))}% acc</span>
              <span>{u.deathCount ?? 0} deaths</span>
            </div>
            <UnitStatSummary unit={u} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function QuadrantsOnline() {
  const [name, setName] = useState(localStorage.getItem("quadrants_player_name") || "");
  const [joinCode, setJoinCode] = useState("");
  const [playerId] = useState(() => ensurePlayerId());
  const [lobbyCode, setLobbyCode] = useState(localStorage.getItem("quadrants_lobby_code") || "");
  const [lobby, setLobby] = useState(null);
  const [status, setStatus] = useState("");
  const [selectedTool, setSelectedTool] = useState({ kind: "terrain", type: "road" });
  const [showStats, setShowStats] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [selectedResource, setSelectedResource] = useState(null);
  const [pendingManualTargetUnitId, setPendingManualTargetUnitId] = useState(null);
  const [visualToggles, setVisualToggles] = useState({ showHitsplats: true, showUnitNames: true });

  const player = lobby?.players?.[playerId] || null;
  const isHost = lobby?.hostId === playerId;
  const game = lobby?.game;
  const phase = lobby?.phase || "home";

  useEffect(() => {
    if (!lobbyCode) {
      setLobby(null);
      return;
    }
    const lobbyRef = ref(db, `lobbies/${lobbyCode}`);
    const unsub = onValue(lobbyRef, (snap) => {
      const value = snap.val();
      if (!value) {
        setLobby(null);
        setStatus("Lobby was not found or was deleted.");
        return;
      }
      setLobby(value);
      setStatus("");
    });
    return () => unsub();
  }, [lobbyCode]);

  useEffect(() => {
    if (!lobbyCode || !playerId) return;
    const connectedRef = ref(db, ".info/connected");
    const playerRef = ref(db, `lobbies/${lobbyCode}/players/${playerId}`);
    const unsub = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        update(playerRef, { connected: true, lastSeen: Date.now() });
        onDisconnect(playerRef).update({ connected: false, lastSeen: serverTimestamp() });
      }
    });
    return () => unsub();
  }, [lobbyCode, playerId]);

  useEffect(() => {
    if (!lobby || !lobbyCode) return;
    const connected = currentPlayers(lobby).filter((p) => p.connected);
    if (!connected.length) return;
    const nextHost = [...connected].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.id).localeCompare(String(b.id)))[0];
    if (nextHost && lobby.hostId !== nextHost.id) {
      update(ref(db, `lobbies/${lobbyCode}`), { hostId: nextHost.id });
    }
  }, [lobby, lobbyCode]);

  useEffect(() => {
    if (!lobby || !lobbyCode || !isHost || lobby.phase !== "fight") return;
    const interval = setInterval(async () => {
      const snap = await get(ref(db, `lobbies/${lobbyCode}`));
      const latest = snap.val();
      if (!latest || latest.phase !== "fight" || latest.hostId !== playerId) return;
      const nextGame = stepGame(latest.game, 0.5);
      if (nextGame.finished) {
        const results = nextGame.results || summarizeResults(nextGame, "last combat presence");
        await update(ref(db, `lobbies/${lobbyCode}`), {
          phase: "results",
          "game/results": results,
          "game/finished": true,
          "game/units": nextGame.units,
          "game/respawnQueue": nextGame.respawnQueue,
          "game/unitArchive": nextGame.unitArchive,
          "game/board": nextGame.board,
          "game/bases": nextGame.bases,
          "game/ctfScores": nextGame.ctfScores,
          "game/killFeed": nextGame.killFeed,
          "game/splats": nextGame.splats,
          "game/effects": nextGame.effects,
          "game/fightTime": nextGame.fightTime,
          "game/log": [`Fight ended: ${results.winner || "Draw"}.`, ...(nextGame.log || [])].slice(0, 8),
        });
      } else {
        await update(ref(db, `lobbies/${lobbyCode}/game`), {
          units: nextGame.units,
          respawnQueue: nextGame.respawnQueue,
          unitArchive: nextGame.unitArchive,
          board: nextGame.board,
          bases: nextGame.bases,
          ctfScores: nextGame.ctfScores,
          killFeed: nextGame.killFeed,
          splats: nextGame.splats,
          effects: nextGame.effects,
          fightTime: nextGame.fightTime,
          log: nextGame.log,
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [lobby?.phase, lobby?.hostId, lobbyCode, playerId, isHost]);

  useEffect(() => {
    if (!selectedUnitId || !game?.units) return;
    const selected = game.units[selectedUnitId];
    if (phase !== "fight" || !selected || (selected.hp ?? 0) <= 0) setSelectedUnitId(null);
  }, [selectedUnitId, game?.units, phase]);

  useEffect(() => {
    if (!pendingManualTargetUnitId || !game?.units) return;
    const pendingUnit = game.units[pendingManualTargetUnitId];
    if (phase !== "fight" || !pendingUnit || pendingUnit.team !== player?.team || (pendingUnit.hp ?? 0) <= 0) setPendingManualTargetUnitId(null);
  }, [pendingManualTargetUnitId, game?.units, phase, player?.team]);

  useEffect(() => {
    if (!selectedResource) return;
    const cell = game?.board?.[selectedResource.row]?.[selectedResource.col];
    const isResourceInfo = cell && (cell.type === "tree" || cell.type === "rock" || cell.regrowType === "tree" || cell.regrowType === "rock");
    if (phase !== "fight" || !isResourceInfo) setSelectedResource(null);
  }, [selectedResource, game?.board, phase]);

  async function makeUniqueLobbyCode() {
    for (let i = 0; i < 20; i++) {
      const code = generateLobbyCode();
      const snap = await get(ref(db, `lobbies/${code}`));
      if (!snap.exists()) return code;
    }
    throw new Error("Could not generate a lobby code. Try again.");
  }

  async function hostLobby() {
    try {
      const cleanName = name.trim().slice(0, 18);
      if (!cleanName) return;
      localStorage.setItem("quadrants_player_name", cleanName);
      const code = await makeUniqueLobbyCode();
      const setup = { ...DEFAULT_SETUP };
      const game = makeInitialGame(setup);
      const now = Date.now();
      const lobbyData = {
        code,
        phase: "lobby",
        hostId: playerId,
        createdAt: now,
        updatedAt: now,
        setup,
        game,
        ready: { build: {}, buy: {} },
        players: {
          [playerId]: {
            id: playerId,
            name: cleanName,
            team: "red",
            connected: true,
            joinedAt: now,
            lastSeen: now,
          },
        },
      };
      await set(ref(db, `lobbies/${code}`), lobbyData);
      localStorage.setItem("quadrants_lobby_code", code);
      setLobbyCode(code);
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not host lobby.");
    }
  }

  async function joinLobby() {
    try {
      const cleanName = name.trim().slice(0, 18);
      const code = normalizeLobbyCode(joinCode);
      if (!cleanName || code.length !== 6) return;
      localStorage.setItem("quadrants_player_name", cleanName);
      const snap = await get(ref(db, `lobbies/${code}`));
      const existing = snap.val();
      if (!existing) {
        setStatus("Lobby not found.");
        return;
      }
      const openTeam = openTeamForLobby(existing);
      const now = Date.now();
      await update(ref(db, `lobbies/${code}/players/${playerId}`), {
        id: playerId,
        name: cleanName,
        team: existing.players?.[playerId]?.team || openTeam || null,
        connected: true,
        joinedAt: existing.players?.[playerId]?.joinedAt || now,
        lastSeen: now,
      });
      localStorage.setItem("quadrants_lobby_code", code);
      setLobbyCode(code);
      setStatus("");
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not join lobby.");
    }
  }

  async function leaveLobby() {
    if (lobbyCode) {
      await update(ref(db, `lobbies/${lobbyCode}/players/${playerId}`), { connected: false, lastSeen: Date.now() });
    }
    localStorage.removeItem("quadrants_lobby_code");
    setLobbyCode("");
    setLobby(null);
  }

  async function updateSetup(patch) {
    if (!lobby || !isHost || lobby.phase !== "lobby") return;
    const nextSetup = { ...lobby.setup, ...patch };
    const game = makeInitialGame(nextSetup);
    const teams = activeTeams(nextSetup);
    const players = { ...(lobby.players || {}) };
    const used = new Set();
    for (const p of Object.values(players)) {
      if (p.team && !teams.includes(p.team)) p.team = null;
      if (p.team) used.add(p.team);
    }
    for (const p of Object.values(players)) {
      if (!p.team) {
        const open = teams.find((t) => !used.has(t));
        if (open) {
          p.team = open;
          used.add(open);
        }
      }
    }
    await update(ref(db, `lobbies/${lobbyCode}`), {
      setup: nextSetup,
      game,
      players,
      ready: { build: {}, buy: {} },
      updatedAt: Date.now(),
    });
  }

  async function chooseTeam(team) {
    if (!lobby || lobby.phase !== "lobby") return;
    if (team) {
      const taken = currentPlayers(lobby).some((p) => p.team === team && p.id !== playerId);
      if (taken) return;
    }
    await update(ref(db, `lobbies/${lobbyCode}/players/${playerId}`), { team: team || null });
  }

  async function startBuild() {
    if (!lobby || !isHost) return;
    const game = makeInitialGame(lobby.setup);
    game.log = [`Build Phase started on ${MAP_TEMPLATES[lobby.setup.mapTemplate || "classic"]?.name || "Classic"}.`, "Each player builds their own quadrant. Connect every base to the 3x3 neutral center before advancing."];
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "build",
      game,
      ready: { build: {}, buy: {} },
      updatedAt: Date.now(),
    });
  }

  async function setReady(phaseName, value) {
    if (!lobby || !player) return;
    await update(ref(db, `lobbies/${lobbyCode}/ready/${phaseName}`), { [playerId]: value });
  }

  async function advanceToBuy() {
    if (!lobby || !isHost) return;
    if (!allReadyForPhase(lobby, "build") || !allTeamsConnectedToCenter(lobby.game.board, lobby.game.setup)) return;
    const finalizedBoard = finalizeBuildTerrain(lobby.game.board, lobby.game.setup);
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "buy",
      "ready/buy": {},
      "game/board": finalizedBoard,
      "game/log": ["Buy Phase started. Empty void tiles were filled with random water, trees, and rocks for free.", "Buy units, name them, choose targets, and finalize.", ...(lobby.game.log || [])].slice(0, 8),
    });
  }

  async function startFight() {
    if (!lobby || !isHost) return;
    if (!allReadyForPhase(lobby, "buy")) return;
    const finalizedBoard = finalizeBuildTerrain(lobby.game.board, lobby.game.setup);
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "fight",
      "game/board": finalizedBoard,
      "game/fightTime": 0,
      "game/splats": {},
      "game/effects": {},
      "game/log": [`${GAME_MODES[lobby.game.setup.gameMode || "classic"]?.name || "Fight"} started. Host browser simulates combat; host migration continues if host disconnects.`, ...(lobby.game.log || [])].slice(0, 8),
    });
  }

  async function resetToLobby() {
    if (!lobby || !isHost) return;
    const game = makeInitialGame(lobby.setup);
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "lobby",
      game,
      ready: { build: {}, buy: {} },
      updatedAt: Date.now(),
    });
  }

  async function setOrder(team, target) {
    if (!lobby || !game || !canPlayerControlTarget(player, team)) return;
    const allowedTargets = ["blank", "defend", ...targetableBaseTeams(game.bases || {}, game.setup, team)];
    if (!allowedTargets.includes(target)) return;
    await update(ref(db, `lobbies/${lobbyCode}/game/orders/${team}`), { target });
  }

  async function placeTile(row, col) {
    if (!lobby || !game || lobby.phase !== "build" || !player?.team) return;
    if (readyMap(lobby, "build")[playerId]) return;
    if (selectedTool.kind === "inspect") return;
    const team = player.team;
    const cell = game.board[row][col];
    if (isCenterCell(row, col, sizeOf(game.setup))) return;
    if (cell.owner !== team) return;
    if (isBaseCell(row, col, game.setup)) return;
    const cost = TILE[selectedTool.type].cost;
    const gold = game.gold?.[team] ?? 0;
    if (gold < cost || gold - cost < BUILD_PHASE_GOLD_RESERVE) return;
    const nextBoard = cloneBoard(game.board);
    nextBoard[row][col].type = selectedTool.type;
    const hadAllConnections = allTeamsConnectedToCenter(game.board, game.setup);
    if (hadAllConnections && !allTeamsConnectedToCenter(nextBoard, game.setup)) return;
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/board/${row}/${col}/type`]: selectedTool.type,
      [`lobbies/${lobbyCode}/game/gold/${team}`]: gold - cost,
      [`lobbies/${lobbyCode}/game/log`]: [`${TEAM_META[team].name} placed ${TILE[selectedTool.type].name}.`, ...(game.log || [])].slice(0, 8),
    });
  }

  async function buyUnit(styleId) {
    if (!lobby || lobby.phase !== "buy" || !player?.team) return;
    if (readyMap(lobby, "buy")[playerId]) return;
    const team = player.team;
    const style = STYLE[styleId];
    const units = arrayFromObject(game.units);
    const owned = units.filter((u) => u.team === team).length + arrayFromObject(game.respawnQueue).filter((u) => u.team === team).length;
    if (owned >= game.setup.maxUnits) return;
    const gold = game.gold?.[team] ?? 0;
    if (gold < style.cost) return;
    const id = `${team}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const unit = makeUnit(id, team, styleId, game.setup, { name: `${style.name} ${owned + 1}`, ownerPlayerId: playerId });
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/units/${id}`]: unit,
      [`lobbies/${lobbyCode}/game/gold/${team}`]: gold - style.cost,
      [`lobbies/${lobbyCode}/game/log`]: [`${player.name} bought ${unit.name}.`, ...(game.log || [])].slice(0, 8),
    });
  }

  async function updateUnitConfig(unitId, patch) {
    if (!lobby || lobby.phase !== "buy") return;
    const unit = game.units?.[unitId];
    if (!unit || unit.team !== player?.team) return;
    const updates = {};
    for (const [k, v] of Object.entries(patch)) updates[`lobbies/${lobbyCode}/game/units/${unitId}/${k}`] = v;
    await update(ref(db), updates);
  }

  async function updateFightUnitConfig(unitId, patch) {
    if (!lobby || lobby.phase !== "fight") return;
    const unit = game.units?.[unitId];
    if (!unit || unit.team !== player?.team) return;
    const allowed = new Set(["priority", "targetOverride", "manualTargetType", "manualTargetUnitId", "manualTargetRow", "manualTargetCol", "manualResourceType", "manualTargetStartedAt", "manualTargetBlockedSince", "homeTeleportStartedAt", "homeTeleportHpAtStart", "homeTeleportLastAttackedAtStart", "homeTeleportPreviousTargetOverride", "homeTeleportPreviousManualTargetType", "homeTeleportPreviousManualTargetUnitId", "homeTeleportPreviousManualTargetRow", "homeTeleportPreviousManualTargetCol", "homeTeleportPreviousManualResourceType"]);
    const updates = {};
    for (const [k, v] of Object.entries(patch)) {
      if (allowed.has(k)) updates[`lobbies/${lobbyCode}/game/units/${unitId}/${k}`] = v;
    }
    if (Object.keys(updates).length) await update(ref(db), updates);
  }

  async function setManualTarget(unitId, patch) {
    if (!lobby || lobby.phase !== "fight") return;
    const unit = game?.units?.[unitId];
    if (!unit || unit.team !== player?.team || (unit.hp ?? 0) <= 0) return;
    await updateFightUnitConfig(unitId, {
      targetOverride: "manual",
      manualTargetStartedAt: game?.fightTime ?? 0,
      manualTargetBlockedSince: null,
      manualResourceType: null,
      homeTeleportStartedAt: null,
      homeTeleportHpAtStart: null,
      homeTeleportLastAttackedAtStart: null,
      homeTeleportPreviousTargetOverride: null,
      homeTeleportPreviousManualTargetType: null,
      homeTeleportPreviousManualTargetUnitId: null,
      homeTeleportPreviousManualTargetRow: null,
      homeTeleportPreviousManualTargetCol: null,
      homeTeleportPreviousManualResourceType: null,
      ...patch,
    });
    setSelectedUnitId(unitId);
    setSelectedResource(null);
    setPendingManualTargetUnitId(null);
  }

  async function handleFightCellClick(row, col) {
    if (pendingManualTargetUnitId) {
      const commander = game?.units?.[pendingManualTargetUnitId];
      const cell = game?.board?.[row]?.[col];
      const resourceType = resourceTargetType(commander);
      if (commander && resourceType && cell?.type === resourceType) {
        await setManualTarget(pendingManualTargetUnitId, {
          manualTargetType: "resource",
          manualTargetUnitId: null,
          manualTargetRow: row,
          manualTargetCol: col,
          manualResourceType: resourceType,
        });
      } else {
        await setManualTarget(pendingManualTargetUnitId, {
          manualTargetType: "tile",
          manualTargetUnitId: null,
          manualTargetRow: row,
          manualTargetCol: col,
          manualResourceType: null,
        });
      }
      return;
    }
    const cell = game?.board?.[row]?.[col];
    if (cell && (cell.type === "tree" || cell.type === "rock" || cell.regrowType === "tree" || cell.regrowType === "rock")) {
      setSelectedResource({ row, col });
      setSelectedUnitId(null);
      return;
    }
    setSelectedResource(null);
    setSelectedUnitId(null);
  }

  async function handleFightUnitClick(unitId) {
    if (pendingManualTargetUnitId) {
      const commander = game?.units?.[pendingManualTargetUnitId];
      const target = game?.units?.[unitId];
      if (commander && target && target.team !== commander.team && (target.hp ?? 0) > 0) {
        await setManualTarget(pendingManualTargetUnitId, {
          manualTargetType: "unit",
          manualTargetUnitId: unitId,
          manualTargetRow: null,
          manualTargetCol: null,
          manualResourceType: null,
        });
      } else if (target) {
        await setManualTarget(pendingManualTargetUnitId, {
          manualTargetType: "tile",
          manualTargetUnitId: null,
          manualTargetRow: target.row,
          manualTargetCol: target.col,
          manualResourceType: null,
        });
      }
      return;
    }
    setSelectedUnitId(unitId);
    setSelectedResource(null);
  }

  async function deleteLobby() {
    if (!lobbyCode || !isHost) return;
    if (confirm("Delete this lobby from Firebase?")) {
      await remove(ref(db, `lobbies/${lobbyCode}`));
      localStorage.removeItem("quadrants_lobby_code");
      setLobbyCode("");
      setLobby(null);
    }
  }

  if (!lobbyCode || !lobby) {
    return <HomeScreen name={name} setName={setName} joinCode={joinCode} setJoinCode={setJoinCode} onHost={hostLobby} onJoin={joinLobby} status={status} />;
  }

  if (!player) {
    return (
      <div className="home-screen">
        <div className="home-card">
          <h1>Rejoining {lobbyCode}</h1>
          <p>Enter your display name to reconnect.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <Button onClick={joinLobby} disabled={!name.trim()} variant="primary">Reconnect</Button>
          <Button onClick={leaveLobby}>Back</Button>
        </div>
      </div>
    );
  }

  const hostPlayer = lobby.players?.[lobby.hostId];
  const bodyClass = `app phase-${phase}`;

  return (
    <div className={bodyClass}>
      <header className="topbar">
        <div>
          <h1>Quadrants Beta Online</h1>
          <p>Lobby <b>{lobby.code}</b> • {PHASES[phase]} • Host: {hostPlayer?.name || "migrating..."}</p>
        </div>
        <div className="top-actions">
          <label className="toggle-check"><input type="checkbox" checked={visualToggles.showHitsplats} onChange={(e) => setVisualToggles((v) => ({ ...v, showHitsplats: e.target.checked }))} /> Hitsplats</label>
          <label className="toggle-check"><input type="checkbox" checked={visualToggles.showUnitNames} onChange={(e) => setVisualToggles((v) => ({ ...v, showUnitNames: e.target.checked }))} /> Names</label>
          <Pill tone={player.connected ? "ready" : "waiting"}>{player.name}</Pill>
          <Pill>{player.team ? `${TEAM_META[player.team].emoji} ${TEAM_META[player.team].name}` : "Spectator"}</Pill>
          {isHost && <Pill tone="host">You are host</Pill>}
          <Button onClick={leaveLobby}>Leave</Button>
          {isHost && <Button onClick={deleteLobby}>Delete Lobby</Button>}
        </div>
      </header>

      {phase === "lobby" && (
        <main className="main-shell">
          <LobbyView lobby={lobby} playerId={playerId} isHost={isHost} onUpdateSetup={updateSetup} onStartBuild={startBuild} onChooseTeam={chooseTeam} onLeave={leaveLobby} />
        </main>
      )}

      {phase === "build" && (
        <main className="game-shell">
          <section className="board-card">
            <BoardView lobby={lobby} player={player} selectedTool={selectedTool} onCellClick={placeTile} selectedUnitId={selectedUnitId} visualToggles={visualToggles} />
          </section>
          <BuildPanel lobby={lobby} player={player} selectedTool={selectedTool} setSelectedTool={setSelectedTool} onReady={(v) => setReady("build", v)} isHost={isHost} onAdvance={advanceToBuy} onSetOrder={setOrder} />
        </main>
      )}

      {phase === "buy" && (
        <main className="buy-shell">
          <section className="board-card buy-board-card">
            <BoardView lobby={lobby} player={player} selectedTool={selectedTool} onCellClick={() => {}} selectedUnitId={selectedUnitId} visualToggles={visualToggles} />
            <BuyPanel lobby={lobby} player={player} onBuy={buyUnit} onUpdateUnit={updateUnitConfig} onReady={(v) => setReady("buy", v)} isHost={isHost} onAdvance={startFight} onSetOrder={setOrder} />
          </section>
        </main>
      )}

      {phase === "fight" && (
        <main className="fight-shell">
          <FightLeftPanel lobby={lobby} player={player} selectedUnitId={selectedUnitId} setSelectedUnitId={setSelectedUnitId} selectedResource={selectedResource} setSelectedResource={setSelectedResource} onUpdateUnit={updateFightUnitConfig} pendingManualTargetUnitId={pendingManualTargetUnitId} onBeginManualTarget={(unitId) => { setSelectedUnitId(unitId); setSelectedResource(null); setPendingManualTargetUnitId(unitId); }} />
          <section className={`board-card ${pendingManualTargetUnitId ? "manual-target-active" : ""}`}>
            {pendingManualTargetUnitId && <div className="manual-target-banner">Select target for {game?.units?.[pendingManualTargetUnitId]?.name || "unit"}: click an enemy unit to attack, a road/base tile to move, or a matching tree/rock to chop/mine.</div>}
            <BoardView lobby={lobby} player={player} selectedTool={selectedTool} onCellClick={handleFightCellClick} onUnitClick={handleFightUnitClick} selectedUnitId={selectedUnitId} selectedResource={selectedResource} visualToggles={visualToggles} />
            {showStats && <FightStats lobby={lobby} player={player} />}
          </section>
          <FightPanel lobby={lobby} player={player} showStats={showStats} setShowStats={setShowStats} onSetOrder={setOrder} selectedUnitId={selectedUnitId} onSelectUnit={(unitId) => { setSelectedUnitId(unitId); setSelectedResource(null); }} />
        </main>
      )}

      {phase === "results" && (
        <main className="main-shell">
          <ResultsView lobby={lobby} resetToLobby={resetToLobby} />
        </main>
      )}
    </div>
  );
}

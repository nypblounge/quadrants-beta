
import React, { useEffect, useMemo, useRef, useState } from "react";
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
  query,
  orderByChild,
  endAt,
  limitToFirst,
} from "firebase/database";
import { firebaseConfig } from "./firebaseConfig";
import "./styles.css";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const DEFAULT_SETUP = { players: 2, gridSize: 17, startingGold: 350, maxUnits: 12, baseHp: 250, baseZoneSize: 3, centerSize: 5, matchTimeLimit: 30 * 60, gameMode: "classic", mapTemplate: "classic", ctfScoreLimit: 3, kothTimeLimit: 60, npcSpawns: false, npcSpawnAmount: 1, npcSpawnInterval: 60, goblinSpawnAmount: 1, goblinSpawnInterval: 60, hillGiantSpawnAmount: 0, hillGiantSpawnInterval: 120, teamMode: false, restockGoldOnContinued: false, continuedRestockGold: 150 };
const BASE_ZONE_SIZE = 3;
const LARGE_BASE_ZONE_SIZE = 5;
const BASE_ZONE_INSET = 1;
const CENTER_SIZE_OPTIONS = [3, 5, 7];
const TICK_SECONDS = 0.6;
const FIGHT_TICK_MS = Math.round(TICK_SECONDS * 1000);
const MOVE_EVERY = 0.75;
const RESPAWN_BASE_TIME = 5;
const SPLAT_TTL = 2.4;
const SPAWN_EFFECT_TTL = 8.0;
const SPAWN_WARNING_SECONDS = 10.0;
const GROUND_ITEM_TTL = 60;
const STALE_LOBBY_CLEANUP_HOURS = 24;
const RESULTS_LOBBY_CLEANUP_HOURS = 6;
const LOBBY_CLEANUP_THROTTLE_MS = 5 * 60 * 1000;
const RECENT_PRESENCE_GRACE_MS = 2 * 60 * 1000;
const LOBBY_CLEANUP_BATCH_LIMIT = 50;
const MAX_LEVEL = 99;
const BUILD_PHASE_GOLD_RESERVE = 10;
const DEFEND_RADIUS = 4;
const MANUAL_TARGET_TIMEOUT = 20;
const HOME_TELEPORT_SECONDS = 5;
const RESOURCE_REGROW_SECONDS = 30;
const FLAG_WEAPON_BONUS = { attack: 0, strength: 0, baseDamage: 5, attackTicks: 5 };
const KILL_GOLD_REWARD = 1;
const EQUIPMENT_SLOTS = ["weapon", "offHand", "helmet", "neck", "chest", "legs", "boots", "gloves", "cape", "ammo", "ring"];
const INVENTORY_SIZE = 28;
const EQUIPMENT_SLOT_META = {
  weapon: { name: "Weapon", image: "weapon_slot.png" },
  offHand: { name: "Off-hand", image: "shield_slot.png" },
  helmet: { name: "Helmet", image: "head_slot.png" },
  neck: { name: "Neck", image: "neck_slot.png" },
  chest: { name: "Chest", image: "body_slot.png" },
  legs: { name: "Legs", image: "legs_slot.png" },
  boots: { name: "Boots", image: "feet_slot.png" },
  gloves: { name: "Gloves", image: "hands_slot.png" },
  cape: { name: "Cape", image: "cape_slot.png" },
  ammo: { name: "Ammo", image: "ammo_slot.png" },
  ring: { name: "Ring", image: "ring_slot.png" },
};
const EMPTY_GEAR_BONUSES = { stab: 0, slash: 0, crush: 0, magic: 0, range: 0, defenceStab: 0, defenceSlash: 0, defenceCrush: 0, defenceMagic: 0, defenceRange: 0, meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 };
const NPC_SPAWN_INTERVAL = 60;
const GOBLIN_LOOT_TABLE = [
  { type: "gold", min: 1, max: 10, weight: 80 },
  { type: "item", itemId: "bronze_med_helm", weight: 20 },
];
const GOBLIN_ALWAYS_DROP_ITEMS = ["bones"];
const HILL_GIANT_DROP_TABLE = [
  { type: "item", itemId: "bronze_platelegs", chance: 1 / 10 },
  { type: "gold", min: 1, max: 25, chance: 1 / 5 },
  { type: "item", itemId: "logs", min: 1, max: 5, chance: 1 / 20 },
  { type: "item", itemId: "ore", min: 1, max: 5, chance: 1 / 20 },
];
const HILL_GIANT_ALWAYS_DROP_ITEMS = [{ itemId: "big_bones", qty: 1 }];
const GEAR_ITEMS = {
  cape_of_skulls: { id: "cape_of_skulls", name: "Cape of Skulls", slot: "cape", cost: 50, icon: "cape_of_skulls.png", bonuses: { defenceStab: 1, defenceSlash: 1, defenceCrush: 1, defenceMagic: 1, defenceRange: 1 } },
  bronze_med_helm: { id: "bronze_med_helm", name: "Bronze Med Helm", slot: "helmet", cost: 5, icon: "bronze_med_helm.png", bonuses: { defenceStab: 1, defenceSlash: 1, defenceCrush: 1, defenceRange: 1 } },
  bones: { id: "bones", name: "Bones", slot: "none", cost: 1, sellValue: 0, icon: "bones.png", stackable: true, consumable: "prayerXp", prayerXp: 3, bonuses: {} },
  big_bones: { id: "big_bones", name: "Big Bones", slot: "none", cost: 15, sellValue: 15, icon: "big_bones.png", stackable: true, consumable: "prayerXp", prayerXp: 4.5, bonuses: {} },
  logs: { id: "logs", name: "Logs", slot: "none", cost: 2, sellValue: 2, icon: "logs.png", stackable: true, bonuses: {} },
  ore: { id: "ore", name: "Iron Ore", slot: "none", cost: 4, sellValue: 4, icon: "ore.png", stackable: true, bonuses: {} },
  bronze_platelegs: { id: "bronze_platelegs", name: "Bronze Platelegs", slot: "legs", cost: 80, icon: "bronze_platelegs.png", bonuses: { defenceStab: 1, defenceSlash: 1, defenceCrush: 1, defenceMagic: 1, defenceRange: 1 } },
  bronze_sword: { id: "bronze_sword", name: "Bronze Sword", slot: "weapon", cost: 8, icon: "weapon_slot.png", bonuses: { slash: 6, meleeStrength: 4 } },
  iron_scimitar: { id: "iron_scimitar", name: "Iron Scimitar", slot: "weapon", cost: 18, icon: "weapon_slot.png", bonuses: { slash: 13, meleeStrength: 11 } },
  oak_shortbow: { id: "oak_shortbow", name: "Oak Shortbow", slot: "weapon", cost: 14, icon: "weapon_slot.png", bonuses: { range: 12, rangedStrength: 8 } },
  air_staff: { id: "air_staff", name: "Air Staff", slot: "weapon", cost: 14, icon: "weapon_slot.png", bonuses: { magic: 12, magicDamage: 4 } },
  rune_2h: { id: "rune_2h", name: "Rune 2H Sword", slot: "weapon", cost: 32, icon: "weapon_slot.png", twoHanded: true, bonuses: { slash: 28, crush: 8, meleeStrength: 30 } },
  wooden_shield: { id: "wooden_shield", name: "Wooden Shield", slot: "offHand", cost: 8, icon: "shield_slot.png", bonuses: { defenceStab: 6, defenceSlash: 6, defenceCrush: 4, defenceRange: 4 } },
  iron_full_helm: { id: "iron_full_helm", name: "Iron Full Helm", slot: "helmet", cost: 10, icon: "head_slot.png", bonuses: { defenceStab: 7, defenceSlash: 8, defenceCrush: 6, defenceRange: 4 } },
  iron_platebody: { id: "iron_platebody", name: "Iron Platebody", slot: "chest", cost: 18, icon: "body_slot.png", bonuses: { defenceStab: 15, defenceSlash: 16, defenceCrush: 14, defenceRange: 10, defenceMagic: -4 } },
  iron_platelegs: { id: "iron_platelegs", name: "Iron Platelegs", slot: "legs", cost: 14, icon: "legs_slot.png", bonuses: { defenceStab: 10, defenceSlash: 11, defenceCrush: 10, defenceRange: 6, defenceMagic: -2 } },
  leather_boots: { id: "leather_boots", name: "Leather Boots", slot: "boots", cost: 5, icon: "feet_slot.png", bonuses: { defenceRange: 2 } },
  leather_gloves: { id: "leather_gloves", name: "Leather Gloves", slot: "gloves", cost: 5, icon: "hands_slot.png", bonuses: { defenceRange: 2 } },
  amulet_power: { id: "amulet_power", name: "Amulet of Power", slot: "neck", cost: 22, icon: "neck_slot.png", bonuses: { stab: 6, slash: 6, crush: 6, magic: 6, range: 6, defenceStab: 6, defenceSlash: 6, defenceCrush: 6, defenceMagic: 6, defenceRange: 6, meleeStrength: 6, rangedStrength: 6, magicDamage: 2, prayer: 1 } },
  team_cape: { id: "team_cape", name: "Team Cape", slot: "cape", cost: 6, icon: "cape_slot.png", bonuses: { defenceStab: 2, defenceSlash: 2, defenceCrush: 2, defenceMagic: 2, defenceRange: 2 } },
  bronze_arrows: { id: "bronze_arrows", name: "Bronze Arrows", slot: "ammo", cost: 8, icon: "ammo_slot.png", bonuses: { range: 2, rangedStrength: 5 } },
  recoil_ring: { id: "recoil_ring", name: "Ring of Recoil", slot: "ring", cost: 18, icon: "ring_slot.png", bonuses: { defenceStab: 3, defenceSlash: 3, defenceCrush: 3, defenceMagic: 3, defenceRange: 3, meleeStrength: 2, rangedStrength: 2, magicDamage: 1 } },
};
const SHOP_GEAR_ITEM_IDS = ["cape_of_skulls"];
const DEFAULT_TWO_HANDED_STYLES = new Set(["dinhs_bulwark", "noxious_halberd", "dragon_claws", "dharoks", "heavy_ballista", "dark_bow_pure"]);
const RESOURCE_HITPOINTS = { tree: 30, rock: 30 };
const CLASSIC_TEAMS = ["red", "green", "blue", "purple"];
const EIGHT_PLAYER_TEAMS = ["red", "yellow", "cyan", "purple", "green", "blue", "orange", "pink"];
const ALL_TEAMS = Array.from(new Set([...CLASSIC_TEAMS, ...EIGHT_PLAYER_TEAMS]));
const TEAM_ORDER = Object.fromEntries(ALL_TEAMS.map((team, index) => [team, index]));
const TEAM_MODE_ALLIANCES = [
  { id: "warm", name: "Team 1", emoji: "🟨", color: "#facc15" },
  { id: "cool", name: "Team 2", emoji: "🟦", color: "#38bdf8" },
];
const DEFAULT_TEAM_ALLIANCES = { red: "warm", orange: "warm", yellow: "warm", green: "warm", blue: "cool", purple: "cool", pink: "cool", cyan: "cool" };
const GAME_MODES = {
  classic: { name: "Classic Base Siege", description: "Destroy enemy bases and clean up remaining units." },
  capture_flag: { name: "Capture the Flag", description: "Touch an enemy base to grab its flag, then return to your base to score." },
  king_hill: { name: "King of the Hill", description: "Control the center hill uncontested until your team reaches the hold timer." },
};
const MAP_TEMPLATES = {
  classic: { name: "Classic Quadrants" },
  river_cross: { name: "River Cross" },
  fortress_mid: { name: "Fortress Mid" },
  open_field: { name: "Open Field" },
};

const TEAM_META = {
  red: { name: "Red", emoji: "🟥", color: "#ef4444", dark: "#7f1d1d" },
  orange: { name: "Orange", emoji: "🟧", color: "#f97316", dark: "#7c2d12" },
  yellow: { name: "Yellow", emoji: "🟨", color: "#facc15", dark: "#713f12" },
  green: { name: "Green", emoji: "🟩", color: "#22c55e", dark: "#064e3b" },
  blue: { name: "Blue", emoji: "🟦", color: "#38bdf8", dark: "#0c4a6e" },
  purple: { name: "Purple", emoji: "🟪", color: "#a855f7", dark: "#581c87" },
  pink: { name: "Pink", emoji: "🌸", color: "#ec4899", dark: "#831843" },
  cyan: { name: "Cyan", emoji: "🔷", color: "#06b6d4", dark: "#164e63" },
  npc: { name: "NPC", emoji: "⬜", color: "#ffffff", dark: "#ffffff" },
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
  goblin: {
    name: "Goblin",
    file: "goblin.png",
    combatType: "melee",
    tier: 0,
    cost: 0,
    range: 1,
    baseDamage: 3,
    attackTicks: 3,
    cooldown: 3 * TICK_SECONDS,
    baseStats: { attack: 10, strength: 10, defence: 10, magic: 10, range: 1, prayer: 1, hitpoints: 30 },
    npc: true,
  },
  hill_giant: {
    name: "Hill Giant",
    file: "hill_giant.png",
    combatType: "melee",
    tier: 0,
    cost: 0,
    range: 1,
    size: 2,
    baseDamage: 9,
    attackTicks: 5,
    cooldown: 5 * TICK_SECONDS,
    baseStats: { attack: 30, strength: 30, defence: 30, magic: 1, range: 1, prayer: 1, hitpoints: 100 },
    npc: true,
  },
  flag_weapon: {
    name: "Flag",
    file: "melee.png",
    combatType: "melee",
    tier: 0,
    cost: 0,
    range: 1,
    baseDamage: FLAG_WEAPON_BONUS.baseDamage,
    attackTicks: FLAG_WEAPON_BONUS.attackTicks,
    cooldown: FLAG_WEAPON_BONUS.attackTicks * TICK_SECONDS,
    baseStats: { attack: 1, strength: 1, defence: 1, hitpoints: 1 },
  },
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

const DEFAULT_UNIT_STYLE_ID = "melee";

function safeStyleId(styleId, fallback = DEFAULT_UNIT_STYLE_ID) {
  return STYLE[styleId] ? styleId : fallback;
}

function styleDefinition(styleId, fallback = DEFAULT_UNIT_STYLE_ID) {
  return STYLE[styleId] || STYLE[fallback] || {};
}

function normalizeRuntimeUnit(unit) {
  if (!unit) return unit;
  const safeStyle = safeStyleId(unit.style);
  return unit.style === safeStyle ? unit : { ...unit, style: safeStyle, name: normalizeUnitName(unit.name, styleDefinition(safeStyle).name || "Unit") };
}

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

function clampPlayerCount(value) {
  return Math.max(2, Math.min(8, Number(value) || 2));
}

function usesArenaLayout(setup = DEFAULT_SETUP) {
  return clampPlayerCount(setup?.players) >= 5;
}

function activeTeams(setup = DEFAULT_SETUP) {
  const count = clampPlayerCount(setup?.players);
  if (count >= 5) return EIGHT_PLAYER_TEAMS.slice(0, count);
  if (count === 4) return [...CLASSIC_TEAMS];
  if (count === 3) return ["red", "green", "blue"];
  return ["red", "blue"];
}

function validAllianceIds() {
  return TEAM_MODE_ALLIANCES.map((alliance) => alliance.id);
}

function normalizeTeamAlliances(setup = DEFAULT_SETUP) {
  const valid = new Set(validAllianceIds());
  const provided = setup?.alliances || {};
  const out = {};
  for (const team of activeTeams(setup || DEFAULT_SETUP)) {
    const picked = provided?.[team];
    out[team] = valid.has(picked) ? picked : (DEFAULT_TEAM_ALLIANCES[team] || TEAM_MODE_ALLIANCES[0].id);
  }
  return out;
}

function allianceMeta(allianceId) {
  return TEAM_MODE_ALLIANCES.find((alliance) => alliance.id === allianceId) || TEAM_MODE_ALLIANCES[0];
}

function teamAllianceLabel(team, setup = DEFAULT_SETUP) {
  const alliance = allianceMeta(normalizeTeamAlliances(setup)[team]);
  return `${alliance.emoji} ${alliance.name}`;
}

function goblinLootChanceRows() {
  const total = GOBLIN_LOOT_TABLE.reduce((sum, row) => sum + Number(row.weight || 0), 0) || 1;
  return GOBLIN_LOOT_TABLE.map((row) => ({
    ...row,
    chance: Number(row.weight || 0) / total,
  }));
}

function chanceLabel(chance) {
  const pct = Math.round((Number(chance) || 0) * 100);
  if (pct === 5) return "1/20 (5%)";
  if (pct === 10) return "1/10 (10%)";
  if (pct === 20) return "1/5 (20%)";
  if (pct === 25) return "1/4 (25%)";
  if (pct === 50) return "1/2 (50%)";
  return `${pct}%`;
}

function hillGiantLootChanceRows() {
  return HILL_GIANT_DROP_TABLE.map((row) => ({ ...row, chance: Number(row.chance || 0) }));
}

function npcSpawnAmountFor(setup, style) {
  if (style === "goblin") return Math.max(0, Math.min(10, Number(setup.goblinSpawnAmount ?? setup.npcSpawnAmount) || 0));
  if (style === "hill_giant") return Math.max(0, Math.min(5, Number(setup.hillGiantSpawnAmount) || 0));
  return 0;
}

function npcSpawnIntervalFor(setup, style) {
  if (style === "goblin") return Math.max(10, Math.min(600, Number(setup.goblinSpawnInterval ?? setup.npcSpawnInterval) || DEFAULT_SETUP.goblinSpawnInterval));
  if (style === "hill_giant") return Math.max(10, Math.min(600, Number(setup.hillGiantSpawnInterval) || DEFAULT_SETUP.hillGiantSpawnInterval));
  return NPC_SPAWN_INTERVAL;
}

function npcSpawnConfigs(setup = DEFAULT_SETUP) {
  return [
    { style: "goblin", amount: npcSpawnAmountFor(setup, "goblin"), interval: npcSpawnIntervalFor(setup, "goblin") },
    { style: "hill_giant", amount: npcSpawnAmountFor(setup, "hill_giant"), interval: npcSpawnIntervalFor(setup, "hill_giant") },
  ].filter((cfg) => cfg.amount > 0 && STYLE[cfg.style]?.npc);
}

function initialNpcSpawnSchedule(setup = DEFAULT_SETUP) {
  return Object.fromEntries(npcSpawnConfigs(setup).map((cfg) => [cfg.style, cfg.interval]));
}

function sizeOf(setup) {
  return Number(setup.gridSize) || DEFAULT_SETUP.gridSize;
}

function midOf(size) {
  return Math.floor(size / 2);
}

function baseZoneSizeFor(setup) {
  const explicit = Number(setup?.baseZoneSize);
  if (explicit === 3 || explicit === 5) return explicit;
  return sizeOf(setup || DEFAULT_SETUP) >= 20 ? LARGE_BASE_ZONE_SIZE : BASE_ZONE_SIZE;
}

function centerSizeFor(sizeOrSetup = DEFAULT_SETUP) {
  const explicit = typeof sizeOrSetup === "number" ? Number(DEFAULT_SETUP.centerSize) : Number(sizeOrSetup?.centerSize);
  return CENTER_SIZE_OPTIONS.includes(explicit) ? explicit : DEFAULT_SETUP.centerSize;
}

function centerRadiusFor(sizeOrSetup = DEFAULT_SETUP) {
  return Math.floor(centerSizeFor(sizeOrSetup) / 2);
}

function eightPlayerBasePositions(size, zone) {
  const inset = Math.min(Math.floor(zone / 2), Math.max(0, Math.floor((size - 1) / 2)));
  const far = size - 1 - inset;
  const mid = midOf(size);
  return {
    red: { row: inset, col: inset },
    orange: { row: inset, col: mid },
    yellow: { row: inset, col: far },
    green: { row: mid, col: inset },
    blue: { row: mid, col: far },
    purple: { row: far, col: inset },
    pink: { row: far, col: mid },
    cyan: { row: far, col: far },
  };
}

function baseOf(team, sizeOrSetup) {
  const setup = typeof sizeOrSetup === "number" ? null : sizeOrSetup;
  const size = typeof sizeOrSetup === "number" ? sizeOrSetup : sizeOf(sizeOrSetup);
  const zone = typeof sizeOrSetup === "number" ? (size >= 20 ? LARGE_BASE_ZONE_SIZE : BASE_ZONE_SIZE) : baseZoneSizeFor(sizeOrSetup);
  const inset = Math.min(Math.floor(zone / 2), Math.max(0, Math.floor((size - 1) / 2)));
  const far = size - 1 - inset;
  if (setup && usesArenaLayout(setup)) {
    const picked = eightPlayerBasePositions(size, zone)[team] || eightPlayerBasePositions(size, zone).red;
    return { ...picked, team };
  }
  if (team === "red") return { row: inset, col: inset, team };
  if (team === "green") return { row: inset, col: far, team };
  if (team === "blue") return { row: far, col: far, team };
  if (team === "purple") return { row: far, col: inset, team };
  const picked = eightPlayerBasePositions(size, zone)[team] || eightPlayerBasePositions(size, zone).red;
  return { ...picked, team };
}

function clampZoneStart(center, zone, size) {
  return Math.max(0, Math.min(size - zone, center - Math.floor(zone / 2)));
}

function baseZoneBounds(team, sizeOrSetup) {
  const setup = typeof sizeOrSetup === "number" ? null : sizeOrSetup;
  const size = typeof sizeOrSetup === "number" ? sizeOrSetup : sizeOf(sizeOrSetup);
  const zone = Math.min(typeof sizeOrSetup === "number" ? (size >= 20 ? LARGE_BASE_ZONE_SIZE : BASE_ZONE_SIZE) : baseZoneSizeFor(sizeOrSetup), size);
  const max = size - 1;
  if (setup && usesArenaLayout(setup)) {
    const base = baseOf(team, setup);
    const r0 = clampZoneStart(base.row, zone, size);
    const c0 = clampZoneStart(base.col, zone, size);
    return { r0, r1: r0 + zone - 1, c0, c1: c0 + zone - 1 };
  }
  if (team === "red") return { r0: 0, r1: zone - 1, c0: 0, c1: zone - 1 };
  if (team === "green") return { r0: 0, r1: zone - 1, c0: max - zone + 1, c1: max };
  if (team === "blue") return { r0: max - zone + 1, r1: max, c0: max - zone + 1, c1: max };
  if (team === "purple") return { r0: max - zone + 1, r1: max, c0: 0, c1: zone - 1 };
  const base = baseOf(team, { ...DEFAULT_SETUP, players: 8, gridSize: size, baseZoneSize: zone });
  const r0 = clampZoneStart(base.row, zone, size);
  const c0 = clampZoneStart(base.col, zone, size);
  return { r0, r1: r0 + zone - 1, c0, c1: c0 + zone - 1 };
}

function isInBaseZone(row, col, team, sizeOrSetup) {
  const b = baseZoneBounds(team, sizeOrSetup);
  return row >= b.r0 && row <= b.r1 && col >= b.c0 && col <= b.c1;
}

function isCenterCell(row, col, sizeOrSetup = DEFAULT_SETUP) {
  const size = typeof sizeOrSetup === "number" ? sizeOrSetup : sizeOf(sizeOrSetup);
  const radius = centerRadiusFor(sizeOrSetup);
  const mid = midOf(size);
  return Math.abs(row - mid) <= radius && Math.abs(col - mid) <= radius;
}

function centerTiles(sizeOrSetup = DEFAULT_SETUP) {
  const size = typeof sizeOrSetup === "number" ? sizeOrSetup : sizeOf(sizeOrSetup);
  const radius = centerRadiusFor(sizeOrSetup);
  const mid = midOf(size);
  const out = [];
  for (let row = mid - radius; row <= mid + radius; row++) {
    for (let col = mid - radius; col <= mid + radius; col++) out.push({ row, col });
  }
  return out;
}

function isHillCell(row, col, setup = DEFAULT_SETUP) {
  return isCenterCell(row, col, setup);
}

function hillCenter(setup = DEFAULT_SETUP) {
  const mid = midOf(sizeOf(setup));
  return { row: mid, col: mid };
}

function kothControllerTeam(units, setup = DEFAULT_SETUP) {
  const teams = activeTeams(setup);
  const occupants = units.filter((unit) => unit.hp > 0 && teams.includes(unit.team) && isHillCell(unit.row, unit.col, setup));
  if (!occupants.length) return null;
  const alliances = new Set(occupants.map((unit) => teamAllianceId(unit.team, setup)));
  if (alliances.size !== 1) return null;
  const ranked = teams
    .map((team) => ({ team, count: occupants.filter((unit) => unit.team === team).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || TEAM_ORDER[a.team] - TEAM_ORDER[b.team]);
  return ranked[0]?.team || null;
}

function hillOccupants(units, setup = DEFAULT_SETUP) {
  const teams = activeTeams(setup);
  return units.filter((unit) => unit.hp > 0 && teams.includes(unit.team) && isHillCell(unit.row, unit.col, setup));
}

function findHillPath(board, units, unit, setup) {
  if (isHillCell(unit.row, unit.col, setup)) return null;
  const size = sizeOf(setup);
  const candidates = centerTiles(setup)
    .filter((tile) => walkable(board[tile.row]?.[tile.col], setup))
    .map((tile) => {
      const occupied = unitOccupies(units, tile.row, tile.col, setup, unit);
      const path = findPath(board, units, unit, tile, setup, { range: occupied ? 1 : 0, allowTargetCell: !occupied, requireGoal: true });
      return { tile, occupied, path };
    })
    .filter((entry) => entry.path && entry.path.length);
  if (!candidates.length) return null;
  candidates.sort((a, b) => Number(a.occupied) - Number(b.occupied) || a.path.length - b.path.length || manhattan(unit, a.tile) - manhattan(unit, b.tile));
  return candidates[0].path;
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
    const base = baseOf(team, setup);
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
  if (isCenterCell(row, col, setup)) return "neutral";
  if (usesArenaLayout(setup)) {
    for (const team of teams) {
      if (isInBaseZone(row, col, team, setup)) return team;
    }
    const relRow = row - mid;
    const relCol = col - mid;
    const cellLen = Math.hypot(relRow, relCol) || 1;
    let best = teams[0];
    let bestScore = -Infinity;
    let bestDist = Infinity;
    for (const team of teams) {
      const base = baseOf(team, setup);
      const baseRow = base.row - mid;
      const baseCol = base.col - mid;
      const baseLen = Math.hypot(baseRow, baseCol) || 1;
      const score = (relRow * baseRow + relCol * baseCol) / (cellLen * baseLen);
      const dist = Math.abs(row - base.row) + Math.abs(col - base.col);
      if (score > bestScore + 0.000001 || (Math.abs(score - bestScore) <= 0.000001 && (dist < bestDist || (dist === bestDist && (TEAM_ORDER[team] ?? 0) < (TEAM_ORDER[best] ?? 0))))) {
        best = team;
        bestScore = score;
        bestDist = dist;
      }
    }
    return best;
  }
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
    const base = baseOf(team, setup);
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
  if (isCenterCell(row, col, setup)) return true;
  return activeTeams(setup).some((team) => isInBaseZone(row, col, team, setup));
}

function applyMapTemplate(board, setup) {
  const template = setup.mapTemplate || "classic";
  const size = sizeOf(setup);
  const mid = midOf(size);
  const safeSet = (row, col, type) => {
    if (!inBounds(row, col, size)) return;
    if (isCenterCell(row, col, setup) || isBaseCell(row, col, setup) || isStarterRoad(row, col, setup)) return;
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
    const radius = centerRadiusFor(setup);
    const ring = Math.min(Math.max(radius + 2, 3), Math.max(3, mid - 1));
    const gateHalf = usesArenaLayout(setup) ? 1 : 0;
    const gateCenters = [{ row: mid, col: mid - ring }, { row: mid, col: mid + ring }, { row: mid - ring, col: mid }, { row: mid + ring, col: mid }];
    if (usesArenaLayout(setup)) {
      for (const team of activeTeams(setup)) {
        const base = baseOf(team, setup);
        const dr = Math.sign(base.row - mid);
        const dc = Math.sign(base.col - mid);
        gateCenters.push({ row: mid + dr * ring, col: mid + dc * ring });
      }
    }
    const isGate = (r, c) => gateCenters.some((gate) => Math.abs(r - gate.row) <= gateHalf && Math.abs(c - gate.col) <= gateHalf);
    for (let r = mid - ring; r <= mid + ring; r++) {
      for (let c = mid - ring; c <= mid + ring; c++) {
        const border = r === mid - ring || r === mid + ring || c === mid - ring || c === mid + ring;
        if (border && !isGate(r, c)) safeSet(r, c, "wall");
      }
    }
  }
  if (template === "open_field") {
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!isCenterCell(r, c, setup) && !isBaseCell(r, c, setup) && !isStarterRoad(r, c, setup) && board[r][c].owner !== "void") board[r][c].type = "road";
    }
  }
  return board;
}

function isOuterTreeWallCell(row, col, cell, setup) {
  const size = sizeOf(setup);
  if (!(row === 0 || col === 0 || row === size - 1 || col === size - 1)) return false;
  if (isBaseCell(row, col, setup) || isCenterCell(row, col, setup)) return false;
  return cell?.outerTreeWall === true || cell?.type === "tree";
}

function applyOuterTreeWall(board, setup) {
  const size = sizeOf(setup);
  for (let i = 0; i < size; i++) {
    for (const [row, col] of [[0, i], [size - 1, i], [i, 0], [i, size - 1]]) {
      if (!inBounds(row, col, size) || isBaseCell(row, col, setup) || isCenterCell(row, col, setup)) continue;
      const cell = board[row][col];
      if (!cell) continue;
      cell.type = "tree";
      cell.outerTreeWall = true;
      cell.resourceDeathCount = cell.resourceDeathCount ?? 0;
      cell.resourceHp = null;
      cell.resourceMaxHp = null;
      cell.regrowType = null;
      cell.regrowAt = null;
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
  return applyOuterTreeWall(applyMapTemplate(board, setup), setup);
}

function finalizeBuildTerrain(board, setup = DEFAULT_SETUP) {
  const choices = ["water", "tree", "rock"];
  const size = sizeOf(setup);
  return cloneBoard(board).map((row) => row.map((cell) => {
    if (!cell || cell.type !== "empty") return cell;
    if (isBaseCell(cell.row, cell.col, setup) || isCenterCell(cell.row, cell.col, setup)) return cell;
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

function makeLoot(setup) {
  const out = {};
  for (const team of activeTeams(setup)) out[team] = { inventory: {}, goldEarned: 0 };
  return out;
}

function defaultOrders(setup) {
  const teams = activeTeams(setup);
  const out = {};
  teams.forEach((team, i) => {
    out[team] = { target: (setup?.gameMode === "king_hill") ? "hill" : teams[(i + 1) % teams.length] };
  });
  return out;
}

function teamAllianceId(team, setup = DEFAULT_SETUP) {
  if (!team || team === "npc") return team;
  if (!setup?.teamMode) return team;
  return normalizeTeamAlliances(setup)[team] || team;
}

function areAlliedTeams(a, b, setup = DEFAULT_SETUP) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === "npc" || b === "npc") return false;
  return setup?.teamMode && teamAllianceId(a, setup) === teamAllianceId(b, setup);
}

function areHostileTeams(a, b, setup = DEFAULT_SETUP) {
  if (!a || !b || a === b) return false;
  if (a === "npc") return activeTeams(setup).includes(b);
  if (b === "npc") return activeTeams(setup).includes(a);
  return !areAlliedTeams(a, b, setup);
}

function hostileTeamsFor(team, setup = DEFAULT_SETUP) {
  return activeTeams(setup).filter((other) => areHostileTeams(team, other, setup));
}

function targetableBaseTeams(bases, setup, selfTeam) {
  if (selfTeam === "npc") return [];
  return activeTeams(setup).filter((team) => areHostileTeams(selfTeam, team, setup) && (bases?.[team]?.hp ?? 0) > 0);
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
  const base = styleDefinition(styleId).baseStats || STYLE[DEFAULT_UNIT_STYLE_ID].baseStats;
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
  return styleDefinition(styleId).combatType ?? "melee";
}

function damageTypeClass(styleId) {
  const type = combatType(styleId);
  if (type === "magic") return "magic";
  if (type === "range") return "range";
  return "melee";
}

function effectiveAttackStyleId(unit) {
  return unit?.carryingFlagTeam ? "flag_weapon" : safeStyleId(unit?.style);
}

function unitAttackRange(unit) {
  return styleDefinition(effectiveAttackStyleId(unit)).range ?? styleDefinition(unit?.style).range ?? 1;
}

function unitAttackCooldown(unit) {
  return styleDefinition(effectiveAttackStyleId(unit)).cooldown ?? styleDefinition(unit?.style).cooldown ?? TICK_SECONDS;
}

function unitAttackTicks(unit) {
  return styleDefinition(effectiveAttackStyleId(unit)).attackTicks ?? styleDefinition(unit?.style).attackTicks ?? 1;
}

function unitSize(unitOrStyle) {
  const styleId = typeof unitOrStyle === "string" ? unitOrStyle : unitOrStyle?.style;
  return Math.max(1, Number(STYLE[styleId]?.size || 1));
}

function unitFootprintAt(unitOrStyle, row, col) {
  const size = unitSize(unitOrStyle);
  const cells = [];
  for (let dr = 0; dr < size; dr++) {
    for (let dc = 0; dc < size; dc++) cells.push({ row: Number(row) + dr, col: Number(col) + dc });
  }
  return cells;
}

function unitFootprint(unit) {
  return unitFootprintAt(unit, unit?.row ?? 0, unit?.col ?? 0);
}

function targetFootprint(target) {
  if (!target) return [];
  if (target.id && target.style && STYLE[target.style]) return unitFootprint(target);
  return [{ row: Number(target.row), col: Number(target.col) }];
}

function pointToTargetDistance(point, target) {
  const cells = targetFootprint(target);
  if (!cells.length) return Infinity;
  return Math.min(...cells.map((cell) => Math.abs(Number(point.row) - cell.row) + Math.abs(Number(point.col) - cell.col)));
}

function nearestTargetCell(point, target) {
  const cells = targetFootprint(target);
  if (!cells.length) return target;
  return cells.slice().sort((a, b) => (Math.abs(Number(point.row) - a.row) + Math.abs(Number(point.col) - a.col)) - (Math.abs(Number(point.row) - b.row) + Math.abs(Number(point.col) - b.col)))[0];
}

function unitDistance(a, b) {
  const aCells = a?.id && a?.style ? unitFootprint(a) : [{ row: Number(a?.row), col: Number(a?.col) }];
  const bCells = targetFootprint(b);
  let best = Infinity;
  for (const ac of aCells) {
    for (const bc of bCells) best = Math.min(best, Math.abs(ac.row - bc.row) + Math.abs(ac.col - bc.col));
  }
  return best;
}

function grantCombatXp(unit, damage) {
  if (damage <= 0) return;
  const type = combatType(effectiveAttackStyleId(unit));
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
  const safeStyle = safeStyleId(style);
  const stats = carried.stats ? JSON.parse(JSON.stringify(carried.stats)) : makeStats(safeStyle);
  const base = baseOf(team, setup);
  return {
    id,
    team,
    style: safeStyle,
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
    voidwakerGuaranteesLeft: carried.voidwakerGuaranteesLeft ?? (styleDefinition(safeStyle).guaranteedAttacks ?? 0),
    deathCount: carried.deathCount ?? 0,
    totalDamage: carried.totalDamage ?? 0,
    kills: carried.kills ?? 0,
    levelsGained: carried.levelsGained ?? 0,
    name: normalizeUnitName(carried.name, styleDefinition(safeStyle).name || "Unit"),
    priority: carried.priority ?? "auto",
    targetOverride: carried.targetOverride ?? defaultUnitTargetOverride(safeStyle),
    manualTargetType: carried.manualTargetType ?? null,
    manualTargetUnitId: carried.manualTargetUnitId ?? null,
    manualTargetRow: carried.manualTargetRow ?? null,
    manualTargetCol: carried.manualTargetCol ?? null,
    manualResourceType: carried.manualResourceType ?? null,
    manualGroundItemId: carried.manualGroundItemId ?? null,
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
    homeTeleportPreviousManualGroundItemId: carried.homeTeleportPreviousManualGroundItemId ?? null,
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
    flagGrabs: carried.flagGrabs ?? 0,
    flagCaptures: carried.flagCaptures ?? 0,
    lootGold: carried.lootGold ?? 0,
    equipment: carried.equipment ? { ...makeDefaultEquipment(), ...carried.equipment } : makeDefaultEquipment(),
  };
}

function staggerUnitsForFightStart(unitsInput) {
  const units = Array.isArray(unitsInput) ? unitsInput : arrayFromObject(unitsInput);
  return objectFromArray(units.map((unit, index) => ({
    ...unit,
    moveTimer: Math.max(Number(unit.moveTimer ?? 0), (index % 8) * (MOVE_EVERY / 8)),
    cooldown: Math.max(0, Number(unit.cooldown ?? 0)),
  })));
}

function makeInitialGame(setup = DEFAULT_SETUP) {
  const playerCount = clampPlayerCount(setup?.players);
  const requestedGridSize = Number(setup.gridSize) || DEFAULT_SETUP.gridSize;
  const safeGridSize = playerCount >= 5 ? Math.max(30, requestedGridSize) : requestedGridSize;
  const safeSetup = {
    ...DEFAULT_SETUP,
    ...setup,
    gridSize: safeGridSize,
    players: playerCount,
    startingGold: Number(setup.startingGold) || DEFAULT_SETUP.startingGold,
    maxUnits: Number(setup.maxUnits) || DEFAULT_SETUP.maxUnits,
    baseHp: Number(setup.baseHp) || DEFAULT_SETUP.baseHp,
    baseZoneSize: Number(setup.baseZoneSize) || (safeGridSize >= 20 ? LARGE_BASE_ZONE_SIZE : BASE_ZONE_SIZE),
    centerSize: CENTER_SIZE_OPTIONS.includes(Number(setup.centerSize)) ? Number(setup.centerSize) : DEFAULT_SETUP.centerSize,
    matchTimeLimit: Number(setup.matchTimeLimit) || DEFAULT_SETUP.matchTimeLimit,
    gameMode: setup.gameMode || DEFAULT_SETUP.gameMode,
    mapTemplate: setup.mapTemplate || DEFAULT_SETUP.mapTemplate,
    ctfScoreLimit: Number(setup.ctfScoreLimit) || DEFAULT_SETUP.ctfScoreLimit,
    kothTimeLimit: Number(setup.kothTimeLimit) || DEFAULT_SETUP.kothTimeLimit,
    restockGoldOnContinued: Boolean(setup.restockGoldOnContinued),
    continuedRestockGold: Math.max(0, Number(setup.continuedRestockGold) || DEFAULT_SETUP.continuedRestockGold),
    npcSpawns: Boolean(setup.npcSpawns),
    goblinSpawnAmount: Math.max(0, Math.min(10, Number(setup.goblinSpawnAmount ?? setup.npcSpawnAmount ?? DEFAULT_SETUP.goblinSpawnAmount))),
    goblinSpawnInterval: Math.max(10, Math.min(600, Number(setup.goblinSpawnInterval ?? setup.npcSpawnInterval) || DEFAULT_SETUP.goblinSpawnInterval)),
    hillGiantSpawnAmount: Math.max(0, Math.min(5, Number(setup.hillGiantSpawnAmount) || DEFAULT_SETUP.hillGiantSpawnAmount)),
    hillGiantSpawnInterval: Math.max(10, Math.min(600, Number(setup.hillGiantSpawnInterval) || DEFAULT_SETUP.hillGiantSpawnInterval)),
    npcSpawnAmount: Math.max(0, Math.min(10, Number(setup.goblinSpawnAmount ?? setup.npcSpawnAmount ?? DEFAULT_SETUP.goblinSpawnAmount))),
    npcSpawnInterval: Math.max(10, Math.min(600, Number(setup.goblinSpawnInterval ?? setup.npcSpawnInterval) || DEFAULT_SETUP.goblinSpawnInterval)),
    teamMode: Boolean(setup.teamMode),
  };
  safeSetup.alliances = normalizeTeamAlliances(safeSetup);
  return {
    setup: safeSetup,
    board: makeBoard(safeSetup),
    units: {},
    respawnQueue: {},
    unitArchive: {},
    splats: {},
    effects: {},
    groundItems: {},
    marketItems: {},
    fightTime: 0,
    bases: makeBases(safeSetup),
    ctfScores: Object.fromEntries(activeTeams(safeSetup).map((team) => [team, 0])),
    kothScores: Object.fromEntries(activeTeams(safeSetup).map((team) => [team, 0])),
    kothController: null,
    killFeed: [],
    gold: makeGold(safeSetup),
    loot: makeLoot(safeSetup),
    orders: defaultOrders(safeSetup),
    results: null,
    nextNpcSpawnAt: safeSetup.goblinSpawnInterval || safeSetup.npcSpawnInterval || NPC_SPAWN_INTERVAL,
    nextNpcSpawnAtByStyle: initialNpcSpawnSchedule(safeSetup),
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


function makeDefaultEquipment() {
  return Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
}

function emptyGearBonuses() {
  return { ...EMPTY_GEAR_BONUSES };
}

function itemById(itemOrId) {
  if (!itemOrId) return null;
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId.itemId || itemOrId.id;
  return GEAR_ITEMS[id] || null;
}

function itemLabel(itemOrId) {
  const item = itemById(itemOrId);
  return item?.name || "Unknown item";
}

function gearBonusSummary(itemOrId) {
  const item = itemById(itemOrId);
  if (!item) return "Unknown item";
  const bits = Object.entries(item.bonuses || {})
    .filter(([, value]) => Number(value || 0) !== 0)
    .map(([key, value]) => `${key.replace("defence", "def ").replace("meleeStrength", "str").replace("rangedStrength", "r str").replace("magicDamage", "magic dmg")} ${Number(value) > 0 ? "+" : ""}${value}`);
  return `${item.name} • ${EQUIPMENT_SLOT_META[item.slot]?.name || item.slot}${item.twoHanded ? " • 2H" : ""} • Value ${item.cost}g${bits.length ? ` • ${bits.join(" • ")}` : ""}`;
}

function sellValueForItem(itemOrId) {
  const item = itemById(itemOrId);
  if (!item) return 0;
  if (item.sellValue != null) return Math.max(0, Number(item.sellValue) || 0);
  return Math.max(0, Math.floor(Number(item.cost || 0) / 2));
}

function itemQuantity(entry) {
  return Math.max(1, Number(entry?.qty || 1));
}

function singleInventoryEntry(entry) {
  const item = itemById(entry);
  if (!item) return null;
  return { instanceId: entry?.instanceId || makeRuntimeId("item"), itemId: item.id };
}

function addInventoryEntryToArray(inventory, entry) {
  const item = itemById(entry);
  if (!item) return false;
  const qty = itemQuantity(entry);
  const existingIndex = inventory.findIndex((slot) => itemById(slot)?.id === item.id);
  if (existingIndex >= 0) {
    inventory[existingIndex] = { ...inventory[existingIndex], itemId: item.id, qty: itemQuantity(inventory[existingIndex]) + qty };
    return true;
  }
  const firstEmpty = inventory.findIndex((slot) => !slot);
  if (firstEmpty < 0) return false;
  inventory[firstEmpty] = { itemId: item.id, qty };
  return true;
}

function removeOneInventoryEntry(inventory, index) {
  const entry = inventory[index];
  const item = itemById(entry);
  if (!item) return null;
  const one = singleInventoryEntry(entry);
  const qty = itemQuantity(entry);
  if (qty > 1) inventory[index] = { ...entry, itemId: item.id, qty: qty - 1 };
  else inventory[index] = null;
  return one;
}

function makeMarketItem(itemOrId, sellerTeam = null) {
  const item = itemById(itemOrId);
  if (!item) return null;
  const source = singleInventoryEntry(itemOrId) || makeInventoryItem(item.id);
  return { ...source, marketId: makeRuntimeId("market"), sellerTeam, listedAt: Date.now(), price: item.cost };
}

function marketItemsArray(game) {
  return Object.entries(game?.marketItems || {}).map(([key, value]) => ({ key, ...value })).filter((entry) => itemById(entry));
}

function groupedMarketItemsArray(game) {
  const groups = new Map();
  for (const entry of marketItemsArray(game)) {
    const item = itemById(entry);
    if (!item) continue;
    const price = Number(entry.price ?? item.cost);
    const groupKey = `${item.id}:${price}`;
    const existing = groups.get(groupKey) || {
      ...entry,
      itemId: item.id,
      price,
      keys: [],
      stock: 0,
      newestListedAt: 0,
    };
    existing.keys.push(entry.key);
    existing.stock += 1;
    existing.newestListedAt = Math.max(existing.newestListedAt || 0, Number(entry.listedAt || 0));
    groups.set(groupKey, existing);
  }
  return [...groups.values()].sort((a, b) => (a.price ?? 0) - (b.price ?? 0) || itemLabel(a).localeCompare(itemLabel(b)) || (b.newestListedAt ?? 0) - (a.newestListedAt ?? 0));
}

function isDefaultWeaponTwoHanded(styleId) {
  return DEFAULT_TWO_HANDED_STYLES.has(styleId);
}

function isCurrentWeaponTwoHanded(unit, equipment = unit?.equipment || {}) {
  const equippedWeapon = itemById(equipment?.weapon);
  if (equippedWeapon) return Boolean(equippedWeapon.twoHanded);
  return isDefaultWeaponTwoHanded(unit?.style);
}

function canEquipItemToSlot(unit, item, slot) {
  if (!unit || !item || item.slot !== slot) return false;
  const equipment = { ...makeDefaultEquipment(), ...(unit.equipment || {}) };
  if (slot === "offHand" && isCurrentWeaponTwoHanded(unit, equipment)) return false;
  return true;
}

function makeInventoryItem(itemId) {
  const item = GEAR_ITEMS[itemId];
  if (!item) return null;
  return { instanceId: makeRuntimeId("item"), itemId };
}

function getTeamInventory(game, team) {
  const raw = game?.loot?.[team]?.inventory || {};
  const arr = Array.from({ length: INVENTORY_SIZE }, (_, i) => raw[i] || raw[String(i)] || null);
  return arr;
}

function inventoryObjectFromArray(arr) {
  const out = {};
  arr.slice(0, INVENTORY_SIZE).forEach((item, i) => { if (item) out[i] = item; });
  return out;
}

function addInventoryEntryToTeam(game, team, entry) {
  if (!team || !game?.loot?.[team]) return false;
  const inventory = getTeamInventory(game, team);
  if (!addInventoryEntryToArray(inventory, typeof entry === "string" ? { itemId: entry } : entry)) return false;
  game.loot[team].inventory = inventoryObjectFromArray(inventory);
  return true;
}

function makeGroundItem(entry, row, col, team, fightTime = 0, droppedByUnitId = null) {
  const item = itemById(entry);
  if (!item) return null;
  const id = firebaseSafeKey(makeRuntimeId("ground"));
  return {
    id,
    itemId: entry?.itemId || item.id,
    instanceId: entry?.instanceId || makeRuntimeId("item"),
    row,
    col,
    team: team || null,
    droppedByUnitId,
    droppedAt: fightTime,
    expiresAt: fightTime + GROUND_ITEM_TTL,
  };
}

function groundItemsArray(gameOrItems) {
  const raw = gameOrItems?.groundItems ?? gameOrItems ?? {};
  return Object.entries(raw || {})
    .map(([key, value]) => ({ id: value?.id || key, ...value }))
    .filter((entry) => itemById(entry));
}

function groundItemRemainingSeconds(item, fightTime = 0) {
  return Math.max(0, Math.ceil(Number(item?.expiresAt ?? 0) - Number(fightTime || 0)));
}

function objectFromGroundItems(items) {
  const out = {};
  for (const item of items) {
    if (!itemById(item)) continue;
    const id = firebaseSafeKey(item.id || makeRuntimeId("ground"));
    out[id] = { ...item, id };
  }
  return out;
}

function randomAmount(min = 1, max = 1) {
  const lo = Math.max(0, Math.floor(Number(min) || 0));
  const hi = Math.max(lo, Math.floor(Number(max) || lo));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function rollGoblinLoot() {
  const total = GOBLIN_LOOT_TABLE.reduce((s, r) => s + r.weight, 0);
  let roll = Math.random() * total;
  for (const row of GOBLIN_LOOT_TABLE) {
    roll -= row.weight;
    if (roll <= 0) {
      if (row.type === "gold") return { type: "gold", amount: randomAmount(row.min, row.max) };
      return { type: "item", itemId: row.itemId, qty: 1 };
    }
  }
  return { type: "gold", amount: 1 };
}

function rollNpcDrops(styleId) {
  if (styleId === "hill_giant") {
    const drops = [...HILL_GIANT_ALWAYS_DROP_ITEMS.map((drop) => ({ type: "item", itemId: drop.itemId, qty: drop.qty || 1 }))];
    for (const row of HILL_GIANT_DROP_TABLE) {
      if (Math.random() > Number(row.chance || 0)) continue;
      if (row.type === "gold") drops.push({ type: "gold", amount: randomAmount(row.min, row.max) });
      else drops.push({ type: "item", itemId: row.itemId, qty: randomAmount(row.min || 1, row.max || row.min || 1) });
    }
    return drops;
  }
  const drops = GOBLIN_ALWAYS_DROP_ITEMS.map((itemId) => ({ type: "item", itemId, qty: 1 }));
  drops.unshift(rollGoblinLoot());
  return drops;
}

function makeNpcUnit(id, style, setup) {
  const mid = midOf(sizeOf(setup));
  const unit = makeUnit(id, "npc", style, setup, { name: STYLE[style]?.name || "NPC" });
  unit.row = mid;
  unit.col = mid;
  unit.ownerPlayerId = null;
  unit.targetOverride = "blank";
  unit.priority = "closest";
  unit.hp = STYLE[style]?.baseStats?.hitpoints || 30;
  return unit;
}

function npcSpawnCells(setup, units, styleId = "goblin", board = null) {
  const size = sizeOf(setup);
  const mid = midOf(size);
  const candidates = [];
  const spawnBoard = board || makeBoard(setup);
  const probe = { team: "npc", style: styleId, row: mid, col: mid, hp: STYLE[styleId]?.baseStats?.hitpoints || 1 };
  for (let radius = 0; radius <= 4; radius++) {
    for (let row = mid - radius; row <= mid + radius; row++) {
      for (let col = mid - radius; col <= mid + radius; col++) {
        if (!inBounds(row, col, size)) continue;
        if (Math.max(Math.abs(row - mid), Math.abs(col - mid)) !== radius) continue;
        if (canUnitStandAt(spawnBoard, units, probe, row, col, setup)) candidates.push({ row, col });
      }
    }
    if (candidates.length) return candidates;
  }
  return [];
}

function plannedNpcSpawnCells(setup, units, styleId, count, board = null) {
  const planned = [];
  const reserved = units.map((u) => ({ ...u }));
  for (let i = 0; i < count; i++) {
    const cell = npcSpawnCells(setup, reserved, styleId, board)[0];
    if (!cell) break;
    planned.push(cell);
    reserved.push({ id: `planned_${styleId}_${i}`, team: "npc", style: styleId, row: cell.row, col: cell.col, hp: 1 });
  }
  return planned;
}

function spawnNpcIfNeeded(game, units, setup, fightTime, killFeed, logEntries, effects = []) {
  if (!setup.npcSpawns) return { units, killFeed, logEntries, effects };
  const nextByStyle = { ...(game.nextNpcSpawnAtByStyle || {}) };
  const spawnedByStyle = {};
  let anyDue = false;
  for (const cfg of npcSpawnConfigs(setup)) {
    const spawnInterval = Math.max(10, Number(cfg.interval) || NPC_SPAWN_INTERVAL);
    let nextAt = Number(nextByStyle[cfg.style] ?? (cfg.style === "goblin" ? game.nextNpcSpawnAt : undefined) ?? spawnInterval);
    if (fightTime + 0.0001 < nextAt) continue;
    anyDue = true;
    const alive = units.filter((u) => u.team === "npc" && u.style === cfg.style && u.hp > 0).length;
    const toSpawn = Math.max(0, cfg.amount - alive);
    for (let i = 0; i < toSpawn; i++) {
      const cell = npcSpawnCells(setup, units, cfg.style, game.board)[0];
      if (!cell) break;
      const npc = makeNpcUnit(makeRuntimeId("npc"), cfg.style, setup);
      npc.row = cell.row;
      npc.col = cell.col;
      units.push(npc);
      effects.push({ id: makeRuntimeId("spawn"), type: "spawn", row: npc.row, col: npc.col, team: "npc", style: cfg.style, ttl: SPAWN_EFFECT_TTL });
      spawnedByStyle[cfg.style] = (spawnedByStyle[cfg.style] || 0) + 1;
    }
    nextAt += spawnInterval;
    while (nextAt <= fightTime + 0.0001) nextAt += spawnInterval;
    nextByStyle[cfg.style] = nextAt;
  }
  if (!anyDue) return { units, killFeed, logEntries, effects };
  game.nextNpcSpawnAtByStyle = nextByStyle;
  game.nextNpcSpawnAt = nextByStyle.goblin ?? game.nextNpcSpawnAt ?? NPC_SPAWN_INTERVAL;
  const totalSpawned = Object.values(spawnedByStyle).reduce((sum, count) => sum + count, 0);
  if (totalSpawned <= 0) return { units, killFeed, logEntries, effects };
  const labels = Object.entries(spawnedByStyle).map(([style, count]) => `${count} ${STYLE[style]?.name || style}${count === 1 ? "" : "s"}`);
  const spawnText = `${labels.join(" and ")} spawned near the center.`;
  killFeed = [{ id: makeRuntimeId("feed"), text: spawnText, team: "npc", style: Object.keys(spawnedByStyle)[0] || "goblin", time: fightTime }, ...killFeed].slice(0, 30);
  logEntries = [spawnText, ...logEntries].slice(0, 8);
  return { units, killFeed, logEntries, effects };
}

function firstOpenInventorySlot(arr) {
  for (let i = 0; i < INVENTORY_SIZE; i++) if (!arr[i]) return i;
  return -1;
}

function gearBonusesFromEquipment(equipment = {}) {
  const out = emptyGearBonuses();
  for (const slot of EQUIPMENT_SLOTS) {
    const item = itemById(equipment?.[slot]);
    if (!item?.bonuses) continue;
    for (const [key, value] of Object.entries(item.bonuses)) out[key] = (out[key] || 0) + Number(value || 0);
  }
  return out;
}

function gearBonuses(unit) {
  return gearBonusesFromEquipment(unit?.equipment || {});
}

function gearAttackBonusFor(unit, styleId = unit?.style) {
  const b = gearBonuses(unit);
  const type = combatType(styleId);
  if (type === "magic") return b.magic || 0;
  if (type === "range") return b.range || 0;
  return Math.max(b.stab || 0, b.slash || 0, b.crush || 0);
}

function gearStrengthBonusFor(unit, styleId = unit?.style) {
  const b = gearBonuses(unit);
  const type = combatType(styleId);
  if (type === "magic") return b.magicDamage || 0;
  if (type === "range") return b.rangedStrength || 0;
  return b.meleeStrength || 0;
}

function gearDefenceBonusFor(unit, attackerStyle) {
  const b = gearBonuses(unit);
  const type = combatType(attackerStyle);
  if (type === "magic") return b.defenceMagic || 0;
  if (type === "range") return b.defenceRange || 0;
  return Math.max(b.defenceStab || 0, b.defenceSlash || 0, b.defenceCrush || 0);
}

function filledInventoryCount(game, team) {
  return getTeamInventory(game, team).filter(Boolean).length;
}

function normalizeUnitName(name, fallback = "Unit") {
  return String(name || fallback)
    .replace(/#/g, "")
    .replace(/\s+\d+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28) || fallback;
}

function unitStatusLabels(unit) {
  const labels = [];
  if (unit?.carryingFlagTeam) labels.push(`🚩 ${TEAM_META[unit.carryingFlagTeam]?.name || "Enemy"} flag`);
  if ((unit?.freezeTimer ?? 0) > 0) labels.push(`Frozen ${Math.ceil(unit.freezeTimer)}s`);
  if (unit?.targetOverride === "homeTeleport") labels.push(`Home tele ${unit.homeTeleportStartedAt != null ? "channeling" : "queued"}`);
  if ((unit?.poisonTimer ?? 0) > 0) labels.push("Poisoned");
  if ((unit?.burnTimer ?? 0) > 0) labels.push("Burning");
  if ((unit?.weakenTimer ?? 0) > 0) labels.push("Weakened");
  if ((unit?.buffTimer ?? 0) > 0) labels.push("Buffed");
  if (unit?.manualTargetType) labels.push("Manual order");
  return labels;
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
  return centerTiles(setup).some((tile) => hasPath(board, baseOf(team, setup), tile, setup));
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
  const targetCell = nearestTargetCell(attacker, target);
  return unitDistance(attacker, target) <= range && lineClear(board, attacker, targetCell, setup);
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
  const safeAttacker = normalizeRuntimeUnit(attacker) || attacker;
  const effectiveStyle = effectiveAttackStyleId(safeAttacker);
  const style = styleDefinition(effectiveStyle);
  const adv = advantage(effectiveStyle, defenderStyle);
  const offense = safeAttacker.carryingFlagTeam
    ? statLevel(safeAttacker, "attack") + (FLAG_WEAPON_BONUS.attack ?? 0) + gearAttackBonusFor(safeAttacker, "melee")
    : statLevel(safeAttacker, offensiveStat(safeAttacker.style)) + gearAttackBonusFor(safeAttacker, safeAttacker.style);
  const defenderUnit = defenderStats?.stats ? defenderStats : { stats: defenderStats };
  const defence = (defenderUnit.stats?.defence?.level ?? 1) + gearDefenceBonusFor(defenderUnit, effectiveStyle);
  let chance = 0.55 + (offense - defence) / 190;
  if (adv === 1) chance += 0.1;
  if (adv === -1) chance -= 0.1;
  if (!safeAttacker.carryingFlagTeam && safeAttacker.style === "ancient_staff" && defenderStyle && combatType(defenderStyle) === "range") chance -= style.accuracyPenaltyVsRange ?? 0;
  chance = Math.max(0.05, Math.min(0.92, chance));
  return Math.random() <= chance;
}

function maxDamageRoll(attacker, defenderStyle) {
  const safeAttacker = normalizeRuntimeUnit(attacker) || attacker;
  const effectiveStyle = effectiveAttackStyleId(safeAttacker);
  const style = styleDefinition(effectiveStyle);
  const adv = advantage(effectiveStyle, defenderStyle);
  const level = safeAttacker.carryingFlagTeam
    ? statLevel(safeAttacker, "strength") + (FLAG_WEAPON_BONUS.strength ?? 0) + gearStrengthBonusFor(safeAttacker, "melee")
    : statLevel(safeAttacker, damageStat(safeAttacker.style)) + gearStrengthBonusFor(safeAttacker, safeAttacker.style);
  let maxHit = Math.max(1, Math.floor(style.baseDamage * (0.65 + level / 100)));
  if (adv === 1) maxHit = Math.ceil(maxHit * 1.1);
  if (adv === -1) maxHit = Math.max(1, Math.floor(maxHit * 0.9));
  if (!safeAttacker.carryingFlagTeam && style.dharokHpScale) {
    const seenMaxHp = Math.max(maxHp(safeAttacker), safeAttacker.maxHpSeen ?? 0);
    const missingHp = Math.max(0, seenMaxHp - Math.max(0, safeAttacker.hp ?? 0));
    maxHit += Math.floor(missingHp / 5);
  }
  return maxHit;
}

function rollDamage(attacker, defenderStyle) {
  const safeAttacker = normalizeRuntimeUnit(attacker) || attacker;
  const style = styleDefinition(safeAttacker?.style);
  const maxHit = maxDamageRoll(safeAttacker, defenderStyle);
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
    attacker.lootGold = (attacker.lootGold ?? 0) + KILL_GOLD_REWARD;
    attacker.pendingGoldReward = (attacker.pendingGoldReward ?? 0) + KILL_GOLD_REWARD;
    attacker.lastKill = { attackerId: attacker.id, attackerName: attacker.name, attackerTeam: attacker.team, victimId: target.id, victimName: target.name, victimTeam: target.team, style: attacker.style, goldReward: KILL_GOLD_REWARD };
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

function unitOccupies(units, row, col, setup, movingUnit = null) {
  if (isBaseCell(row, col, setup)) return false;
  return units.some((u) => {
    if (u.hp <= 0 || u.id === movingUnit?.id) return false;
    if (movingUnit?.carryingFlagTeam && u.team === movingUnit.team) return false;
    return unitFootprint(u).some((cell) => cell.row === row && cell.col === col);
  });
}

function occupiedCellSetFor(units, setup, movingUnit = null) {
  const occupied = new Set();
  for (const u of units) {
    if (u.hp <= 0 || u.id === movingUnit?.id) continue;
    if (movingUnit?.carryingFlagTeam && u.team === movingUnit.team) continue;
    for (const cell of unitFootprint(u)) {
      if (!isBaseCell(cell.row, cell.col, setup)) occupied.add(key(cell.row, cell.col));
    }
  }
  return occupied;
}

function canUnitStandAt(board, units, unit, row, col, setup, options = {}) {
  const ignoreOccupied = Boolean(options.ignoreOccupied);
  const occupiedSet = options.occupiedSet || null;
  const size = sizeOf(setup);
  for (const cell of unitFootprintAt(unit, row, col)) {
    if (!inBounds(cell.row, cell.col, size)) return false;
    if (!walkable(board[cell.row]?.[cell.col], setup)) return false;
    if (!ignoreOccupied) {
      if (occupiedSet ? occupiedSet.has(key(cell.row, cell.col)) : unitOccupies(units, cell.row, cell.col, setup, unit)) return false;
    }
  }
  return true;
}

function findPath(board, units, unit, target, setup, options = {}) {
  const size = sizeOf(setup);
  const range = options.range ?? 1;
  const avoidOccupied = options.avoidOccupied ?? true;
  const allowTargetCell = options.allowTargetCell ?? false;
  const requireGoal = options.requireGoal ?? false;
  const occupiedSet = avoidOccupied ? occupiedCellSetFor(units, setup, unit) : null;
  const start = { row: unit.row, col: unit.col };
  const queue = [{ ...start, path: [] }];
  const seen = new Set([key(start.row, start.col)]);
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let best = null;
  let qi = 0;
  while (qi < queue.length) {
    const cur = queue[qi++];
    const probe = { ...unit, row: cur.row, col: cur.col };
    const dist = unitDistance(probe, target);
    const clearTarget = nearestTargetCell(cur, target);
    if (dist <= range && (range > 1 ? lineClear(board, cur, clearTarget, setup) : true)) return cur.path;
    if (!best || dist < best.distance) best = { ...cur, distance: dist };
    for (const [dr, dc] of dirs) {
      const nr = cur.row + dr;
      const nc = cur.col + dc;
      const isTargetCell = nr === target.row && nc === target.col;
      if (!inBounds(nr, nc, size) || seen.has(key(nr, nc)) || (!allowTargetCell && isTargetCell)) continue;
      const canStand = canUnitStandAt(board, units, unit, nr, nc, setup, { ignoreOccupied: !avoidOccupied || (isTargetCell && allowTargetCell), occupiedSet });
      if (!canStand) continue;
      seen.add(key(nr, nc));
      queue.push({ row: nr, col: nc, path: [...cur.path, { row: nr, col: nc }] });
    }
  }
  if (requireGoal) return null;
  return best?.path?.length ? best.path : null;
}

function bestOpenForwardStep(board, units, unit, target, setup) {
  const size = sizeOf(setup);
  const occupiedSet = occupiedCellSetFor(units, setup, unit);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const currentDistance = unitDistance(unit, target);
  let best = null;
  let sideStep = null;
  for (const [dr, dc] of dirs) {
    const nr = unit.row + dr;
    const nc = unit.col + dc;
    if (!inBounds(nr, nc, size) || (nr === target.row && nc === target.col)) continue;
    if (!canUnitStandAt(board, units, unit, nr, nc, setup, { occupiedSet })) continue;
    const distance = unitDistance({ ...unit, row: nr, col: nc }, target);
    if (distance < currentDistance && (!best || distance < best.distance)) best = { row: nr, col: nc, distance };
    if (distance === currentDistance && !sideStep) sideStep = { row: nr, col: nc, distance };
  }
  return best ?? sideStep;
}

function closestEnemyUnitInRange(board, units, unit, setup, combatTeams) {
  const range = unitAttackRange(unit);
  const candidates = [];
  for (const target of units) {
    if (!areHostileTeams(unit.team, target.team, setup) || target.hp <= 0) continue;
    const npcCombat = unit.team === "npc" ? activeTeams(setup).includes(target.team) : target.team === "npc" || combatTeams.includes(target.team);
    if (!npcCombat) continue;
    if (!canAttack(board, unit, target, range, setup)) continue;
    candidates.push({ target, dist: unitDistance(unit, target), hp: target.hp });
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

function enemyFlagCarrierForTeam(units, team, combatTeams, setup = DEFAULT_SETUP) {
  return units.find((target) => areHostileTeams(team, target.team, setup) && target.hp > 0 && target.carryingFlagTeam && areAlliedTeams(team, target.carryingFlagTeam, setup) && combatTeams.includes(target.team)) ?? null;
}

function alliedFlagCarrierForTeam(units, team, ownUnitId = null, setup = DEFAULT_SETUP) {
  return units.find((ally) => areAlliedTeams(team, ally.team, setup) && ally.hp > 0 && ally.id !== ownUnitId && ally.carryingFlagTeam && areHostileTeams(team, ally.carryingFlagTeam, setup)) ?? null;
}

function enemyThreatNearUnit(board, units, protectedUnit, escortUnit, combatTeams, setup) {
  if (!protectedUnit) return null;
  const candidates = units
    .filter((target) => areHostileTeams(protectedUnit.team, target.team, setup) && target.hp > 0 && combatTeams.includes(target.team))
    .map((target) => {
      const targetRange = unitAttackRange(target);
      const canHitCarrier = canAttack(board, target, protectedUnit, targetRange, setup);
      const carrierDist = unitDistance(target, protectedUnit);
      const escortDist = escortUnit ? unitDistance(target, escortUnit) : carrierDist;
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

function nearestEnemyUnit(units, unit, combatTeams, setup = DEFAULT_SETUP) {
  const candidates = units
    .filter((target) => areHostileTeams(unit.team, target.team, setup) && target.hp > 0 && combatTeams.includes(target.team))
    .map((target) => ({ target, dist: unitDistance(unit, target), hp: target.hp }));
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
      if (unit.team !== "npc" && (bases[unit.team]?.hp ?? 0) > 0) {
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
  if (!rollAttack(attacker, target.style, target)) {
    attacker.misses = (attacker.misses ?? 0) + 1;
    grantXp(target, "defence", 1);
    return { damage: 0, hit: false };
  }
  const dmg = applyUnitDamage(attacker, target, rollDamage(attacker, target.style));
  return { damage: dmg, hit: true };
}

function attackUnit(attacker, target) {
  target.lastAttackerId = attacker.id;
  if (attacker.carryingFlagTeam) {
    const roll = resolveUnitHit(attacker, target);
    return { total: roll.damage ?? 0, rolls: [roll], special: "flag_weapon" };
  }
  const style = styleDefinition(attacker.style);

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
  const ownBase = baseOf(unit.team, setup);
  const candidates = units
    .filter((target) => areHostileTeams(unit.team, target.team, setup) && target.hp > 0 && combatTeams.includes(target.team))
    .map((target) => {
      const targetRange = unitAttackRange(target);
      const attackingBase = canAttack(board, target, ownBase, targetRange, setup);
      const baseDistance = unitDistance(target, ownBase);
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
  const hillOptions = game?.setup?.gameMode === "king_hill" ? ["hill"] : [];
  if (!game || !unit) return ["inherit", "blank", ...hillOptions, "closestNpc", ...resourceOptions, "defend", "protectCarrier", "homeTeleport", "manual"];
  return ["inherit", "blank", ...hillOptions, "closestNpc", ...resourceOptions, "defend", "protectCarrier", "homeTeleport", "manual", ...targetableBaseTeams(game.bases || {}, game.setup, unit.team)];
}

function clearManualTarget(unit, nextTarget = "inherit") {
  unit.targetOverride = nextTarget;
  delete unit.manualTargetType;
  delete unit.manualTargetUnitId;
  delete unit.manualTargetRow;
  delete unit.manualTargetCol;
  delete unit.manualResourceType;
  delete unit.manualGroundItemId;
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
  unit.manualGroundItemId = unit.homeTeleportPreviousManualGroundItemId ?? null;
  delete unit.homeTeleportStartedAt;
  delete unit.homeTeleportHpAtStart;
  delete unit.homeTeleportLastAttackedAtStart;
  delete unit.homeTeleportPreviousTargetOverride;
  delete unit.homeTeleportPreviousManualTargetType;
  delete unit.homeTeleportPreviousManualTargetUnitId;
  delete unit.homeTeleportPreviousManualTargetRow;
  delete unit.homeTeleportPreviousManualTargetCol;
  delete unit.homeTeleportPreviousManualResourceType;
  delete unit.homeTeleportPreviousManualGroundItemId;
}

function cancelHomeTeleport(unit, nextTarget = null) {
  if (nextTarget) unit.targetOverride = nextTarget;
  else finishHomeTeleport(unit);
}

function manualTargetForUnit(unit, board, units, setup, groundItems = {}) {
  if (unit.targetOverride !== "manual") return { kind: null };
  if (unit.manualTargetType === "unit") {
    const target = units.find((u) => u.id === unit.manualTargetUnitId && u.hp > 0 && areHostileTeams(unit.team, u.team, setup));
    if (!target) return { kind: "expired", reason: "target gone" };
    return { kind: "unit", target };
  }
  if (unit.manualTargetType === "follow") {
    const target = units.find((u) => u.id === unit.manualTargetUnitId && u.hp > 0 && u.id !== unit.id && !areHostileTeams(unit.team, u.team, setup));
    if (!target) return { kind: "followPending", targetId: unit.manualTargetUnitId };
    return { kind: "follow", target };
  }
  if (unit.manualTargetType === "tile" || unit.manualTargetType === "hold") {
    const row = Number(unit.manualTargetRow);
    const col = Number(unit.manualTargetCol);
    if (!Number.isFinite(row) || !Number.isFinite(col) || !inBounds(row, col, sizeOf(setup)) || !canUnitStandAt(board, units, unit, row, col, setup, { ignoreOccupied: unit.row === row && unit.col === col })) {
      return { kind: "expired", reason: unit.manualTargetType === "hold" ? "hold tile blocked" : "tile blocked" };
    }
    return { kind: unit.manualTargetType === "hold" ? "hold" : "tile", target: { row, col } };
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
  if (unit.manualTargetType === "groundItem") {
    const item = groundItemsArray(groundItems).find((entry) => entry.id === unit.manualGroundItemId);
    if (!item) return { kind: "expired", reason: "ground item gone" };
    return { kind: "groundItem", item, target: { row: Number(item.row), col: Number(item.col) } };
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

function adjacentManualResourceBlocker(board, unit, finalTarget, resourceType, setup) {
  if (!board || !unit || !finalTarget || !resourceType) return null;
  const size = sizeOf(setup);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const seen = new Set();
  const candidates = [];
  for (const foot of unitFootprint(unit)) {
    for (const [dr, dc] of dirs) {
      const row = foot.row + dr;
      const col = foot.col + dc;
      const k = key(row, col);
      if (seen.has(k) || !inBounds(row, col, size)) continue;
      seen.add(k);
      const cell = board[row]?.[col];
      if (!cell || cell.type !== resourceType) continue;
      const distToFinal = manhattan({ row, col }, finalTarget);
      const distFromUnitToFinal = unitDistance(unit, finalTarget);
      const clearsTowardTarget = distToFinal < distFromUnitToFinal ? 0 : 1;
      candidates.push({ row, col, distToFinal, clearsTowardTarget, hp: resourceCurrentHp(cell, resourceType) });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.clearsTowardTarget - b.clearsTowardTarget || a.distToFinal - b.distToFinal || a.hp - b.hp || a.row - b.row || a.col - b.col);
  return { row: candidates[0].row, col: candidates[0].col };
}

function processResourceRegrowth(board, units, setup, fightTime) {
  let dirty = false;
  const occupied = new Set();
  for (const unit of units.filter((u) => u.hp > 0)) {
    for (const cell of unitFootprint(unit)) occupied.add(key(cell.row, cell.col));
  }
  const size = sizeOf(setup);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cell = board[row][col];
      if (!cell.regrowType || !(fightTime >= Number(cell.regrowAt ?? Infinity))) continue;
      if (occupied.has(key(row, col)) || isBaseCell(row, col, setup)) {
        cell.regrowAt = fightTime + 1;
        dirty = true;
        continue;
      }
      cell.type = cell.regrowType;
      delete cell.regrowType;
      delete cell.regrowAt;
      delete cell.resourceHp;
      delete cell.resourceMaxHp;
      dirty = true;
    }
  }
  return dirty;
}

function targetForUnit(unit, game, bases, units, respawnQueue) {
  const baseTargets = targetableBaseTeams(bases, game.setup, unit.team);
  const combatTargets = teamsWithCombatPresence(bases, units, respawnQueue, game.setup).filter((t) => areHostileTeams(unit.team, t, game.setup));
  const ordered = effectiveTargetOrder(unit, game);
  if (ordered === "homeTeleport" || ordered === "hill") return null;
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
      flagGrabs: teamUnits.reduce((s, u) => s + (u.flagGrabs ?? 0), 0),
      flagCaptures: teamUnits.reduce((s, u) => s + (u.flagCaptures ?? 0), 0),
      lootGold: teamUnits.reduce((s, u) => s + (u.lootGold ?? 0), 0),
      hillUncontestedTime: teamUnits.reduce((s, u) => s + (u.hillUncontestedTime ?? 0), 0),
      hillContestedTime: teamUnits.reduce((s, u) => s + (u.hillContestedTime ?? 0), 0),
      accuracy: Math.round(100 * teamUnits.reduce((s, u) => s + (u.hitsLanded ?? 0), 0) / Math.max(1, teamUnits.reduce((s, u) => s + (u.attacksAttempted ?? 0), 0))),
      units: teamUnits.sort((a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0) || (b.kills ?? 0) - (a.kills ?? 0)),
    };
  }
  const topDamage = [...tracked].sort((a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0)).slice(0, 5);
  const topKills = [...tracked].sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0) || (b.totalDamage ?? 0) - (a.totalDamage ?? 0)).slice(0, 5);
  const topLevels = [...tracked].sort((a, b) => (b.levelsGained ?? 0) - (a.levelsGained ?? 0)).slice(0, 5);
  const topHill = [...tracked].sort((a, b) => ((b.hillUncontestedTime ?? 0) + (b.hillContestedTime ?? 0)) - ((a.hillUncontestedTime ?? 0) + (a.hillContestedTime ?? 0))).slice(0, 5);
  const allUnits = [...tracked].sort((a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0) || (b.kills ?? 0) - (a.kills ?? 0) || (b.levelsGained ?? 0) - (a.levelsGained ?? 0));
  const ctfWinner = setup.gameMode === "capture_flag" ? teams.find((team) => (game.ctfScores?.[team] ?? 0) >= (setup.ctfScoreLimit ?? 3)) : null;
  const kothWinner = setup.gameMode === "king_hill" ? teams.find((team) => (game.kothScores?.[team] ?? 0) >= (setup.kothTimeLimit ?? 60)) : null;
  let timeLimitWinner = null;
  if (reason === "time limit" || reason === "vote to end") {
    const ranked = teams.map((team) => ({
      team,
      score: setup.gameMode === "king_hill" ? (game.kothScores?.[team] ?? 0) : (game.ctfScores?.[team] ?? 0),
      baseHp: game.bases?.[team]?.hp ?? 0,
      damage: teamStats[team]?.damage ?? 0,
      kills: teamStats[team]?.kills ?? 0,
    })).sort((a, b) => b.score - a.score || b.baseHp - a.baseHp || b.damage - a.damage || b.kills - a.kills);
    if (ranked.length && (ranked.length === 1 || ranked[0].score !== ranked[1].score || ranked[0].baseHp !== ranked[1].baseHp || ranked[0].damage !== ranked[1].damage || ranked[0].kills !== ranked[1].kills)) timeLimitWinner = ranked[0].team;
  }
  const winnerTeam = ctfWinner ?? kothWinner ?? timeLimitWinner ?? (alive.length === 1 ? alive[0] : alive.length === 0 && presence.length === 1 ? presence[0] : null);
  return {
    reason,
    winnerTeam,
    winner: winnerTeam ? TEAM_META[winnerTeam].name : alive.length === 0 && presence.length === 0 ? "Draw" : null,
    bases: Object.fromEntries(teams.map((team) => [team, Math.max(0, Math.round(game.bases?.[team]?.hp ?? 0))])),
    ctfScores: game.ctfScores || {},
    kothScores: game.kothScores || {},
    gold: game.gold || {},
    gameMode: setup.gameMode || "classic",
    fightTime: Math.round(game.fightTime ?? 0),
    teamStats,
    topDamage,
    topKills,
    topLevels,
    topHill,
    allUnits,
  };
}

function stepSimulation(game, dt) {
  return stepGame(game, dt);
}

function stepGame(game, dt) {
  const setup = game.setup;
  const board = cloneBoard(game.board);
  let units = arrayFromObject(game.units).map((u) => normalizeRuntimeUnit({
    ...u,
    stats: JSON.parse(JSON.stringify(u.stats)),
    freezeTimer: Math.max(0, (u.freezeTimer ?? 0) - dt),
    freezeImmuneTimer: Math.max(0, (u.freezeImmuneTimer ?? 0) - dt),
  }));
  const bases = JSON.parse(JSON.stringify(game.bases || {}));
  let respawnQueue = arrayFromObject(game.respawnQueue).map((r) => normalizeRuntimeUnit({
    ...r,
    stats: JSON.parse(JSON.stringify(r.stats)),
    timer: (r.timer ?? 0) - dt,
  }));
  let unitArchive = { ...(game.unitArchive || {}) };
  let splats = arrayFromObject(game.splats).map((s) => ({ ...s, ttl: s.ttl - dt })).filter((s) => s.ttl > 0);
  let effects = arrayFromObject(game.effects).map((e) => ({ ...e, ttl: e.ttl - dt })).filter((e) => e.ttl > 0);
  let groundItems = groundItemsArray(game);
  let logEntries = [...(game.log || [])];
  let killFeed = [...(game.killFeed || [])].slice(0, 30);
  const ctfScores = { ...(game.ctfScores || Object.fromEntries(activeTeams(setup).map((team) => [team, 0]))) };
  const kothScores = { ...(game.kothScores || Object.fromEntries(activeTeams(setup).map((team) => [team, 0]))) };
  const gold = { ...(game.gold || makeGold(setup)) };
  const isCaptureFlag = setup.gameMode === "capture_flag";
  const isKingHill = setup.gameMode === "king_hill";
  let boardDirty = false;
  const combatTeamsAtTickStart = teamsWithCombatPresence(bases, units, respawnQueue, setup);

  const fightTime = (game.fightTime || 0) + dt;
  groundItems = groundItems.filter((item) => Number(item.expiresAt ?? 0) > fightTime);
  const spawnedNpcState = spawnNpcIfNeeded(game, units, setup, fightTime, killFeed, logEntries, effects);
  units = spawnedNpcState.units;
  killFeed = spawnedNpcState.killFeed;
  logEntries = spawnedNpcState.logEntries;
  effects = spawnedNpcState.effects;
  boardDirty = processResourceRegrowth(board, units, setup, fightTime) || boardDirty;
  const strandedRespawns = respawnQueue.filter((r) => (bases[r.team]?.hp ?? 0) <= 0);
  if (strandedRespawns.length) {
    unitArchive = mergeUnitArchive(unitArchive, strandedRespawns.map((r) => ({ ...r, hp: 0, timer: null, carryingFlagTeam: null })));
  }
  const readyRespawns = respawnQueue.filter((r) => (r.timer ?? 0) <= 0 && (bases[r.team]?.hp ?? 0) > 0);
  respawnQueue = respawnQueue.filter((r) => (r.timer ?? 0) > 0 && (bases[r.team]?.hp ?? 0) > 0);
  for (const respawn of readyRespawns) {
    const spawnedUnit = makeUnit(respawn.id, respawn.team, respawn.style, setup, {
      ...respawn,
      hp: undefined,
      row: undefined,
      col: undefined,
      cooldown: 0,
      moveTimer: 0,
      voidwakerGuaranteesLeft: styleDefinition(respawn.style).guaranteedAttacks ?? respawn.voidwakerGuaranteesLeft,
      carryingFlagTeam: null,
    });
    units.push(spawnedUnit);
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
      if (unit.team === "npc") {
        const killer = units.find((u) => u.id === unit.lastAttackerId) || arrayFromObject(game.units).find((u) => u.id === unit.lastAttackerId);
        const npcName = STYLE[unit.style]?.name || unit.name || "NPC";
        if (killer && activeTeams(setup).includes(killer.team)) {
          for (const loot of rollNpcDrops(unit.style)) {
            if (loot.type === "gold") {
              gold[killer.team] = (gold[killer.team] ?? 0) + loot.amount;
              killer.lootGold = (killer.lootGold ?? 0) + loot.amount;
              killFeed = [{ id: makeRuntimeId("feed"), text: `${killer.name} looted ${loot.amount}g from a ${npcName}.`, team: killer.team, style: killer.style, time: fightTime }, ...killFeed].slice(0, 30);
            } else {
              const item = itemById(loot.itemId);
              const qty = Math.max(1, Number(loot.qty || 1));
              if (addInventoryEntryToTeam(game, killer.team, { itemId: loot.itemId, qty })) {
                killFeed = [{ id: makeRuntimeId("feed"), text: `${killer.name} looted ${item?.name || loot.itemId}${qty > 1 ? ` x${qty}` : ""} from a ${npcName}.`, team: killer.team, style: killer.style, time: fightTime }, ...killFeed].slice(0, 30);
              } else {
                killFeed = [{ id: makeRuntimeId("feed"), text: `${killer.name}'s inventory was full; ${item?.name || loot.itemId}${qty > 1 ? ` x${qty}` : ""} was lost.`, team: killer.team, style: killer.style, time: fightTime }, ...killFeed].slice(0, 30);
              }
            }
          }
        }
        logEntries = [`${unit.name} was defeated.`, ...logEntries].slice(0, 8);
        continue;
      }
      const respawnText = unit.respawnTime > 0 ? ` Respawn in ${unit.respawnTime}s.` : " Base dead: no respawn.";
      logEntries = [`${TEAM_META[unit.team]?.name || "NPC"} ${unit.name} died.${respawnText}`, ...logEntries].slice(0, 8);
    }
  };

  let cleanup = cleanupDead(units, respawnQueue, bases);
  units = cleanup.units;
  respawnQueue = cleanup.respawnQueue;
  logCleanup(cleanup);

  for (const unit of units) {
    if (unit.hp <= 0) continue;
    const combatTeams = combatTeamsAtTickStart;
    unit.maxHpSeen = Math.max(unit.maxHpSeen ?? 0, maxHp(unit));
    const flagCarrierTarget = unit.team === "npc" ? null : (isCaptureFlag ? enemyFlagCarrierForTeam(units, unit.team, combatTeams, setup) : null);
    const manual = manualTargetForUnit(unit, board, units, setup, groundItems);
    if (manual.kind === "expired") clearManualTarget(unit);
    let manualUnitTarget = !flagCarrierTarget && manual.kind === "unit" ? manual.target : null;
    let manualTileTarget = !flagCarrierTarget && manual.kind === "tile" ? manual.target : null;
    let manualResourceType = !flagCarrierTarget && manual.kind === "resource" ? manual.resourceType : null;
    let manualResourceTarget = !flagCarrierTarget && manual.kind === "resource" ? manual.target : null;
    let manualFollowTarget = !flagCarrierTarget && manual.kind === "follow" ? manual.target : null;
    let manualFollowPending = !flagCarrierTarget && manual.kind === "followPending";
    let manualHoldTarget = !flagCarrierTarget && manual.kind === "hold" ? manual.target : null;
    let manualGroundItem = !flagCarrierTarget && manual.kind === "groundItem" ? manual.item : null;
    let manualGroundItemTarget = manualGroundItem ? manual.target : null;
    if (manualTileTarget && unit.row === manualTileTarget.row && unit.col === manualTileTarget.col) {
      clearManualTarget(unit);
      manualTileTarget = null;
    }
    const manualActive = Boolean(manualUnitTarget || manualTileTarget || manualResourceTarget || manualFollowTarget || manualFollowPending || manualHoldTarget || manualGroundItemTarget);
    const orderedTarget = unit.team === "npc" ? "blank" : effectiveTargetOrder(unit, game);
    const closestNpcTarget = !flagCarrierTarget && !manualActive && orderedTarget === "closestNpc" ? nearestEnemyUnit(units, unit, ["npc"], setup) : null;
    const defendTarget = !flagCarrierTarget && !manualActive && orderedTarget === "defend" ? defendTargetForUnit(board, units, unit, setup, combatTeams, bases) : null;
    const supportFlagCarrier = isCaptureFlag && !unit.carryingFlagTeam && !flagCarrierTarget && !manualActive ? alliedFlagCarrierForTeam(units, unit.team, unit.id, setup) : null;
    const protectTarget = supportFlagCarrier ? enemyThreatNearUnit(board, units, supportFlagCarrier, unit, combatTeams, setup) : null;
    const autoResourceType = !flagCarrierTarget && !manualActive && !defendTarget && !protectTarget && !supportFlagCarrier ? resourceOrderType(unit, orderedTarget) : null;
    const resourceType = manualResourceType ?? autoResourceType;
    const resourceTarget = manualResourceTarget ?? (resourceType ? nearestResourceTile(board, units, unit, setup, resourceType) : null);
    const hillTarget = isKingHill && !flagCarrierTarget && !manualActive && !closestNpcTarget && !defendTarget && !protectTarget && !supportFlagCarrier && !resourceTarget && orderedTarget === "hill" ? hillCenter(setup) : null;
    let targetTeam = unit.team === "npc" ? null : (flagCarrierTarget || manualActive || closestNpcTarget || defendTarget || protectTarget || supportFlagCarrier || resourceTarget || hillTarget ? null : targetForUnit(unit, game, bases, units, respawnQueue));
    const noLivingEnemyBases = targetableBaseTeams(bases, setup, unit.team).length === 0;
    const cleanupTarget = unit.team === "npc" ? nearestEnemyUnit(units, unit, activeTeams(setup), setup) : (!flagCarrierTarget && !manualActive && !closestNpcTarget && !defendTarget && !protectTarget && !supportFlagCarrier && !resourceTarget && noLivingEnemyBases ? nearestEnemyUnit(units, unit, combatTeams, setup) : null);
    const ownBase = baseOf(unit.team, setup);
    let flagReturnTarget = null;
    if (isCaptureFlag) {
      if (unit.carryingFlagTeam && unit.row === ownBase.row && unit.col === ownBase.col) {
        ctfScores[unit.team] = (ctfScores[unit.team] ?? 0) + 1;
        unit.flagCaptures = (unit.flagCaptures ?? 0) + 1;
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
        const home = baseOf(unit.team, setup);
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

    if (manualGroundItem && unit.row === manualGroundItem.row && unit.col === manualGroundItem.col) {
      if (addInventoryEntryToTeam(game, unit.team, { instanceId: manualGroundItem.instanceId || makeRuntimeId("item"), itemId: manualGroundItem.itemId })) {
        const pickedItem = itemById(manualGroundItem);
        groundItems = groundItems.filter((entry) => entry.id !== manualGroundItem.id);
        killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.name} picked up ${pickedItem?.name || "an item"}.`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        clearManualTarget(unit);
        manualGroundItem = null;
        manualGroundItemTarget = null;
      } else {
        killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.name} could not pick up ${itemLabel(manualGroundItem)}; inventory full.`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        clearManualTarget(unit);
        manualGroundItem = null;
        manualGroundItemTarget = null;
      }
      continue;
    }

    if (!targetTeam && !cleanupTarget && !closestNpcTarget && !defendTarget && !protectTarget && !supportFlagCarrier && !resourceTarget && !hillTarget && !flagReturnTarget && !flagCarrierTarget && !manualActive && !manualGroundItemTarget) continue;

    const enemyBase = targetTeam ? baseOf(targetTeam, setup) : null;
    const range = unitAttackRange(unit);
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    unit.moveTimer = Math.max(0, unit.moveTimer - dt);
    let nearbyEnemyUnit = closestEnemyUnitInRange(board, units, unit, setup, combatTeams);
    const manualAttackTarget = manualUnitTarget && canAttack(board, unit, manualUnitTarget, range, setup) ? manualUnitTarget : null;
    const aggroTarget = units.find((u) => u.id === unit.lastAttackerId && u.hp > 0 && areHostileTeams(unit.team, u.team, setup));
    const chaseTarget = flagCarrierTarget ?? manualUnitTarget ?? closestNpcTarget ?? defendTarget ?? protectTarget ?? cleanupTarget ?? (!manualHoldTarget && aggroTarget && !nearbyEnemyUnit ? aggroTarget : null);
    const escortTarget = supportFlagCarrier && !chaseTarget ? supportFlagCarrier : null;

    let manualPath = null;
    let manualBlocked = false;
    let manualResourceBlockedByResource = null;
    if (manualTileTarget) {
      const targetOccupied = unitOccupies(units, manualTileTarget.row, manualTileTarget.col, setup, unit);
      manualPath = findPath(board, units, unit, manualTileTarget, setup, { range: targetOccupied ? 1 : 0, allowTargetCell: !targetOccupied, requireGoal: true });
      if (!manualPath) manualPath = findPath(board, units, unit, manualTileTarget, setup, { range: targetOccupied ? 1 : 0, allowTargetCell: !targetOccupied });
      manualBlocked = !manualPath || (targetOccupied && manhattan(unit, manualTileTarget) <= 1);
    } else if (manualResourceTarget) {
      const directResourcePath = findPath(board, units, unit, manualResourceTarget, setup, { range: 1, requireGoal: true });
      manualPath = directResourcePath ?? findPath(board, units, unit, manualResourceTarget, setup, { range: 1 });
      manualResourceBlockedByResource = !directResourcePath ? adjacentManualResourceBlocker(board, unit, manualResourceTarget, resourceType, setup) : null;
      manualBlocked = !manualPath && !manualResourceBlockedByResource && manhattan(unit, manualResourceTarget) > 1;
    } else if (manualGroundItemTarget) {
      manualPath = findPath(board, units, unit, manualGroundItemTarget, setup, { range: 0, allowTargetCell: true, requireGoal: true });
      if (!manualPath) manualPath = findPath(board, units, unit, manualGroundItemTarget, setup, { range: 0, allowTargetCell: true });
      manualBlocked = !manualPath && !(unit.row === manualGroundItemTarget.row && unit.col === manualGroundItemTarget.col);
    } else if (manualFollowTarget) {
      manualPath = findPath(board, units, unit, manualFollowTarget, setup, { range: 1, requireGoal: true });
      if (!manualPath) manualPath = findPath(board, units, unit, manualFollowTarget, setup, { range: 1 });
      manualBlocked = !manualPath && manhattan(unit, manualFollowTarget) > 1;
    } else if (manualHoldTarget) {
      const atHoldTile = unit.row === manualHoldTarget.row && unit.col === manualHoldTarget.col;
      if (!atHoldTile) {
        manualPath = findPath(board, units, unit, manualHoldTarget, setup, { range: 0, allowTargetCell: true, requireGoal: true });
        if (!manualPath) manualPath = findPath(board, units, unit, manualHoldTarget, setup, { range: 0, allowTargetCell: true });
        manualBlocked = !manualPath;
      }
    } else if (manualUnitTarget && !manualAttackTarget) {
      manualPath = findPath(board, units, unit, manualUnitTarget, setup, { range, requireGoal: true });
      if (!manualPath) manualPath = findPath(board, units, unit, manualUnitTarget, setup, { range });
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
          manualFollowTarget = null;
          manualFollowPending = false;
          manualHoldTarget = null;
          manualGroundItem = null;
          manualGroundItemTarget = null;
        }
      } else {
        delete unit.manualTargetBlockedSince;
      }
    }

    let resourceWorkTarget = resourceTarget;
    if (manualResourceTarget && manualResourceBlockedByResource && !(manhattan(unit, manualResourceTarget) <= 1 && board[manualResourceTarget.row]?.[manualResourceTarget.col]?.type === resourceType)) {
      resourceWorkTarget = manualResourceBlockedByResource;
    }
    const isInteractingResource = Boolean(resourceWorkTarget && resourceType && manhattan(unit, resourceWorkTarget) <= 1 && board[resourceWorkTarget.row]?.[resourceWorkTarget.col]?.type === resourceType);

    if (!isInteractingResource && unit.moveTimer <= 0 && (unit.freezeTimer ?? 0) <= 0) {
      const flagPath = flagReturnTarget ? findPath(board, units, unit, flagReturnTarget, setup, { range: 0, allowTargetCell: true }) : null;
      const chasePath = !flagReturnTarget && !manualTileTarget && chaseTarget ? findPath(board, units, unit, chaseTarget, setup, { range }) : null;
      const escortPath = !flagReturnTarget && !manualActive && !chaseTarget && escortTarget ? findPath(board, units, unit, escortTarget, setup, { range: 1 }) : null;
      const resourcePath = !flagReturnTarget && !manualResourceTarget && !manualGroundItemTarget && !manualActive && !chaseTarget && !escortTarget && resourceTarget ? findPath(board, units, unit, resourceTarget, setup, { range: 1, requireGoal: true }) : null;
      const hillPath = !flagReturnTarget && !manualActive && !chaseTarget && !escortTarget && !resourceTarget && hillTarget ? findHillPath(board, units, unit, setup) : null;
      const baseApproachRange = isCaptureFlag ? 1 : range;
      const basePath = !flagReturnTarget && !manualActive && !escortTarget && !resourceTarget && enemyBase
        ? findPath(board, units, unit, enemyBase, setup, { range: baseApproachRange }) ?? findPath(board, units, unit, enemyBase, setup, { range: baseApproachRange, avoidOccupied: false })
        : null;
      const fallbackTarget = flagReturnTarget ?? manualTileTarget ?? manualHoldTarget ?? manualGroundItemTarget ?? manualFollowTarget ?? chaseTarget ?? escortTarget ?? resourceTarget ?? hillTarget ?? enemyBase;
      const next = flagPath?.[0] ?? manualPath?.[0] ?? chasePath?.[0] ?? escortPath?.[0] ?? resourcePath?.[0] ?? hillPath?.[0] ?? basePath?.[0] ?? (fallbackTarget ? bestOpenForwardStep(board, units, unit, fallbackTarget, setup) : null);
      if (next && !unitOccupies(units, next.row, next.col, setup, unit)) {
        unit.row = next.row;
        unit.col = next.col;
      }
      if (manualTileTarget && unit.row === manualTileTarget.row && unit.col === manualTileTarget.col) clearManualTarget(unit);
      unit.moveTimer = MOVE_EVERY;
    }

    if (isCaptureFlag && !unit.carryingFlagTeam && enemyBase && targetTeam && (bases[targetTeam]?.hp ?? 0) > 0 && isFlagAtHome(units, targetTeam) && manhattan(unit, enemyBase) <= 1) {
      unit.carryingFlagTeam = targetTeam;
      unit.flagGrabs = (unit.flagGrabs ?? 0) + 1;
      unit.randomTarget = null;
      killFeed = [{ id: makeRuntimeId("feed"), text: `${TEAM_META[unit.team].name} grabbed ${TEAM_META[targetTeam].name}'s flag!`, team: unit.team, time: fightTime }, ...killFeed].slice(0, 30);
      logEntries = [`${TEAM_META[unit.team].name} grabbed ${TEAM_META[targetTeam].name}'s flag.`, ...logEntries].slice(0, 8);
    }

    if (resourceWorkTarget && unit.cooldown <= 0 && manhattan(unit, resourceWorkTarget) <= 1 && board[resourceWorkTarget.row]?.[resourceWorkTarget.col]?.type === resourceType) {
      const resourceHit = damageResourceTile(board, resourceWorkTarget, resourceType, resourceDamageForUnit(unit, resourceType), fightTime);
      if (resourceHit.ok) {
        boardDirty = true;
        const action = resourceType === "tree" ? "chopped" : "mined";
        addSplat(resourceWorkTarget, resourceHit.damage, unit.team, unit.style, `-${resourceHit.damage}`);
        addEffect(unit, resourceWorkTarget, unit.team, unit.style);
        if (resourceHit.cleared) {
          unit.resourcesCleared = (unit.resourcesCleared ?? 0) + 1;
          const resourceItemId = resourceType === "tree" ? "logs" : "ore";
          const resourceItem = itemById(resourceItemId);
          const lootedResource = addInventoryEntryToTeam(game, unit.team, { itemId: resourceItemId });
          const clearedManualFinalResource = Boolean(manualResourceTarget && resourceWorkTarget.row === manualResourceTarget.row && resourceWorkTarget.col === manualResourceTarget.col);
          if (clearedManualFinalResource) clearManualTarget(unit);
          killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.name} ${action} ${resourceType === "tree" ? "trees" : "rocks"} and ${lootedResource ? `collected ${resourceItem?.name || resourceItemId}` : `lost ${resourceItem?.name || resourceItemId}; inventory full`}. Clear #${resourceHit.deathCount}. Regrows in ${resourceHit.regrowSeconds}s.`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        }
        unit.cooldown = unitAttackCooldown(unit);
        continue;
      }
    }

    nearbyEnemyUnit = manualAttackTarget ?? closestEnemyUnitInRange(board, units, unit, setup, combatTeams);
    if (nearbyEnemyUnit && unit.cooldown <= 0) {
      const attackResult = attackUnit(unit, nearbyEnemyUnit);
      nearbyEnemyUnit.lastAttackedAt = fightTime;
      if (unit.lastKill) {
        const reward = unit.pendingGoldReward ?? unit.lastKill.goldReward ?? 0;
        if (reward > 0) gold[unit.team] = (gold[unit.team] ?? 0) + reward;
        killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.lastKill.attackerName} defeated ${unit.lastKill.victimName}${reward > 0 ? ` (+${reward}g)` : ""}`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
        unit.pendingGoldReward = 0;
        unit.lastKill = null;
      }
      addAttackSplats(nearbyEnemyUnit, attackResult, unit.team, effectiveAttackStyleId(unit));
      addEffect(unit, nearbyEnemyUnit, unit.team, effectiveAttackStyleId(unit));
      if (styleDefinition(unit.style).aoeRadius && attackResultTotal(attackResult) > 0) {
        for (let row = nearbyEnemyUnit.row - 1; row <= nearbyEnemyUnit.row + 1; row++) {
          for (let col = nearbyEnemyUnit.col - 1; col <= nearbyEnemyUnit.col + 1; col++) {
            if (!inBounds(row, col, sizeOf(setup)) || (row === nearbyEnemyUnit.row && col === nearbyEnemyUnit.col)) continue;
            const extra = units.find((u) => areHostileTeams(unit.team, u.team, setup) && u.hp > 0 && u.row === row && u.col === col && combatTeams.includes(u.team));
            if (extra) {
              const splashResult = attackUnit(unit, extra);
              extra.lastAttackedAt = fightTime;
              if (unit.lastKill) {
                const reward = unit.pendingGoldReward ?? unit.lastKill.goldReward ?? 0;
                if (reward > 0) gold[unit.team] = (gold[unit.team] ?? 0) + reward;
                killFeed = [{ id: makeRuntimeId("feed"), text: `${unit.lastKill.attackerName} defeated ${unit.lastKill.victimName}${reward > 0 ? ` (+${reward}g)` : ""}`, team: unit.team, style: unit.style, time: fightTime }, ...killFeed].slice(0, 30);
                unit.pendingGoldReward = 0;
                unit.lastKill = null;
              }
              addAttackSplats(extra, splashResult, unit.team, effectiveAttackStyleId(unit));
              addEffect(unit, extra, unit.team, effectiveAttackStyleId(unit));
            }
          }
        }
      }
      unit.cooldown = unitAttackCooldown(unit);
    } else if (!isCaptureFlag && enemyBase && canAttack(board, unit, enemyBase, range, setup) && unit.cooldown <= 0 && (bases[targetTeam]?.hp ?? 0) > 0) {
      const dmg = attackBase(unit, bases[targetTeam]);
      addSplat(enemyBase, dmg, unit.team, effectiveAttackStyleId(unit));
      addEffect(unit, enemyBase, unit.team, effectiveAttackStyleId(unit));
      unit.cooldown = unitAttackCooldown(unit);
    }
  }

  cleanup = cleanupDead(units, respawnQueue, bases);
  units = cleanup.units;
  respawnQueue = cleanup.respawnQueue;
  logCleanup(cleanup);

  const kothController = isKingHill ? kothControllerTeam(units, setup) : null;
  if (isKingHill) {
    const occupants = hillOccupants(units, setup);
    const contested = occupants.length > 0 && !kothController;
    for (const unit of occupants) {
      if (contested) unit.hillContestedTime = (unit.hillContestedTime ?? 0) + dt;
      else if (kothController && areAlliedTeams(unit.team, kothController, setup)) unit.hillUncontestedTime = (unit.hillUncontestedTime ?? 0) + dt;
    }
  }
  if (isKingHill && kothController) kothScores[kothController] = (kothScores[kothController] ?? 0) + dt;

  const nextGame = {
    ...game,
    board,
    units: objectFromArray(units),
    respawnQueue: objectFromArray(respawnQueue),
    unitArchive,
    bases,
    ctfScores,
    kothScores,
    kothController,
    gold,
    loot: game.loot || makeLoot(setup),
    killFeed,
    splats: objectFromArray(splats),
    effects: objectFromArray(effects),
    groundItems: objectFromGroundItems(groundItems),
    fightTime,
    nextNpcSpawnAt: game.nextNpcSpawnAt,
    nextNpcSpawnAtByStyle: game.nextNpcSpawnAtByStyle || {},
    log: logEntries,
    _boardDirty: boardDirty,
  };

  const aliveBases = aliveTeamsFromBases(bases, setup);
  const remainingCombat = teamsWithCombatPresence(bases, units, respawnQueue, setup);
  const ctfWinner = isCaptureFlag ? activeTeams(setup).find((team) => (ctfScores[team] ?? 0) >= (setup.ctfScoreLimit ?? 3)) : null;
  const kothWinner = isKingHill ? activeTeams(setup).find((team) => (kothScores[team] ?? 0) >= (setup.kothTimeLimit ?? 60)) : null;
  const hitTimeLimit = Number(setup.matchTimeLimit || 0) > 0 && fightTime >= Number(setup.matchTimeLimit || 0);
  if (ctfWinner || kothWinner || hitTimeLimit || (!isCaptureFlag && remainingCombat.length <= 1 && aliveBases.length <= 1)) {
    nextGame.results = summarizeResults(nextGame, ctfWinner ? "capture limit reached" : kothWinner ? "hill timer reached" : hitTimeLimit ? "time limit" : "last combat presence");
    nextGame.finished = true;
  }
  return nextGame;
}

function runDevTests() {
  const setup4 = { ...DEFAULT_SETUP, players: 4, gridSize: 13 };
  console.assert(activeTeams(setup4).length === 4, "4-player setup should activate four teams");
  const setup3 = { ...DEFAULT_SETUP, players: 3, gridSize: 17 };
  console.assert(JSON.stringify(activeTeams(setup3)) === JSON.stringify(["red", "green", "blue"]), "3-player setup should activate red, green, and blue teams");
  const setup8 = { ...DEFAULT_SETUP, players: 8, gridSize: 30, baseZoneSize: 5 };
  console.assert(JSON.stringify(activeTeams({ ...setup8, players: 5 })) === JSON.stringify(["red", "yellow", "cyan", "purple", "green"]), "5-player arena should fill the four corners first, then middle-left");
  console.assert(JSON.stringify(activeTeams(setup8)) === JSON.stringify(["red", "yellow", "cyan", "purple", "green", "blue", "orange", "pink"]), "8-player arena should fill corners, side middles, then top/bottom middles");
  console.assert(baseOf("orange", setup8).row === 2 && baseOf("orange", setup8).col === 15, "Orange should use the top-center base in 8-player arena layout");
  console.assert(baseOf("pink", setup8).row === 27 && baseOf("pink", setup8).col === 15, "Pink should use the bottom-center base in 8-player arena layout");
  console.assert(ownerFor(15, 2, setup8) === "green", "8-player arena should assign middle-left zone to Green");
  console.assert(centerTiles(30).length === 25, "Default middle should be 5x5");
  console.assert(centerTiles({ ...setup8, centerSize: 3 }).length === 9, "Middle size setting should support 3x3");
  console.assert(centerTiles({ ...setup8, centerSize: 7 }).length === 49, "Middle size setting should support 7x7");
  const setup5 = { ...DEFAULT_SETUP, players: 5, gridSize: 30, baseZoneSize: 5 };
  const touchesCenter = (team, setup = setup5) => centerTiles(setup).some((tile) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => inBounds(tile.row + dr, tile.col + dc, sizeOf(setup)) && ownerFor(tile.row + dr, tile.col + dc, setup) === team));
  console.assert(activeTeams(setup5).every((team) => touchesCenter(team, setup5)), "Every 5-player arena build zone should border the center so teams can build a path in");
  const setup5LargeMiddle = { ...setup5, centerSize: 7 };
  console.assert(activeTeams(setup5LargeMiddle).every((team) => touchesCenter(team, setup5LargeMiddle)), "Every 5-player arena build zone should border a 7x7 center too");
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
  console.assert(riverBoard[0][Math.floor(DEFAULT_SETUP.gridSize / 2)].type === "tree", "Every map should have a clearable outer tree wall");
  console.assert(riverBoard[midOf(DEFAULT_SETUP.gridSize)][1].type === "water" || riverBoard[midOf(DEFAULT_SETUP.gridSize)][1].type === "road", "River Cross template should alter the map layout inside the outer wall");
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

function GameContextMenu({ menu, onClose }) {
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => onClose?.();
    const onKey = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, onClose]);
  if (!menu) return null;
  const items = menu.items || [];
  return (
    <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {menu.title && <div className="context-menu-title">{menu.title}</div>}
      {items.map((item, index) => item.type === "divider" ? (
        <div key={`divider-${index}`} className="context-menu-divider" />
      ) : (
        <button
          key={`${item.label}-${index}`}
          type="button"
          disabled={item.disabled}
          title={item.title || ""}
          onClick={() => {
            if (item.disabled) return;
            onClose?.();
            item.action?.();
          }}
        >
          {item.icon && <span className="context-menu-icon">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
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

function UnitTokenView({ unit, bump, showName = true }) {
  const hpPct = Math.max(0, Math.min(100, ((unit.hp ?? 0) / Math.max(1, maxHp(unit))) * 100));
  const teleporting = unit.targetOverride === "homeTeleport" && unit.homeTeleportStartedAt != null;
  const teleportPct = teleporting ? Math.max(0, Math.min(100, 100 * (1 - Math.max(0, HOME_TELEPORT_SECONDS - ((unit.currentFightTime ?? 0) - unit.homeTeleportStartedAt)) / HOME_TELEPORT_SECONDS))) : 0;
  const coreColor = unit.team === "npc" ? "#ffffff" : (TEAM_META[unit.team]?.dark || "#1c1917");
  const ringStyle = {
    borderColor: "transparent",
    background: `radial-gradient(circle at center, ${coreColor} 66%, transparent 68%), conic-gradient(#22c55e 0 ${hpPct}%, rgba(127,29,29,.95) ${hpPct}% 100%)`,
  };
  return (
    <div className={`unit-token unit-size-${unitSize(unit)} ${bump ? "bump" : ""} ${unit.team === "npc" ? "npc-unit" : ""}`} title={unit.name}>
      <div className={`unit-token-circle ${teleporting ? "teleporting" : ""} ${unit.team === "npc" ? "npc-token" : ""}`} style={ringStyle}>
        <StyleIcon styleId={unit.style} />
        {teleporting && <div className="teleport-ring" style={{ background: `conic-gradient(#c084fc 0 ${teleportPct}%, transparent ${teleportPct}% 100%)` }} />}
        {unit.carryingFlagTeam && <div className="flag-icon-overlay" title={`Carrying ${TEAM_META[unit.carryingFlagTeam]?.name || "enemy"} flag`}>🚩</div>}
      </div>
      {showName && <div className="unit-name">{String(unit.name || styleDefinition(unit.style).name || "Unit").slice(0, 12)}</div>}
      {unit.carryingFlagTeam && <div className="flag-carrier">{TEAM_META[unit.carryingFlagTeam]?.name} flag</div>}
      <HpBar hp={unit.hp} max={maxHp(unit)} />
    </div>
  );
}

const UnitToken = React.memo(UnitTokenView, (prev, next) => {
  const a = prev.unit;
  const b = next.unit;
  const aTeleporting = a.targetOverride === "homeTeleport" && a.homeTeleportStartedAt != null;
  const bTeleporting = b.targetOverride === "homeTeleport" && b.homeTeleportStartedAt != null;
  return prev.bump === next.bump
    && prev.showName === next.showName
    && a.id === b.id
    && a.row === b.row
    && a.col === b.col
    && a.hp === b.hp
    && a.style === b.style
    && a.name === b.name
    && a.team === b.team
    && a.carryingFlagTeam === b.carryingFlagTeam
    && a.targetOverride === b.targetOverride
    && a.homeTeleportStartedAt === b.homeTeleportStartedAt
    && (!aTeleporting && !bTeleporting || Math.floor(Number(a.currentFightTime || 0) * 4) === Math.floor(Number(b.currentFightTime || 0) * 4));
});

function previewMaxHit(styleId) {
  const unit = makeUnit("preview", "red", styleId, DEFAULT_SETUP);
  return maxDamageRoll(unit, null);
}

function attackSpeedLabel(styleId) {
  const s = styleDefinition(styleId);
  const seconds = ((s.attackTicks ?? 0) * TICK_SECONDS).toFixed(1);
  return `${s.attackTicks ?? "?"} ticks / ${seconds}s`;
}

function formatDuration(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function currentAttackLabel(unit) {
  return unit?.carryingFlagTeam ? `Flag bash • ${attackSpeedLabel("flag_weapon")}` : attackSpeedLabel(unit?.style);
}

function passiveText(styleId) {
  const s = styleDefinition(styleId);
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
  const baseStats = styleDefinition(unit.style).baseStats ?? {};
  return (
    <div className="stat-grid stat-grid-wide unit-stat-summary">
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

function GearIcon({ item, slot, size = "md" }) {
  const gear = itemById(item);
  const src = gear?.icon || EQUIPMENT_SLOT_META[slot]?.image || "weapon_slot.png";
  const label = gear?.name || EQUIPMENT_SLOT_META[slot]?.name || "Empty";
  return <img src={asset(src)} alt={label} className={`gear-icon gear-icon-${size} ${gear ? "filled" : "empty"}`} draggable={false} />;
}

function setInventoryDragPreview(event, entry) {
  const item = itemById(entry);
  if (!item || !event?.dataTransfer || typeof document === "undefined") return;
  const preview = document.createElement("div");
  preview.className = "inventory-drag-preview";
  const img = document.createElement("img");
  img.src = asset(item.icon || EQUIPMENT_SLOT_META[item.slot]?.image || "weapon_slot.png");
  img.alt = item.name;
  const name = document.createElement("span");
  name.textContent = item.name;
  preview.appendChild(img);
  preview.appendChild(name);
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 34, 34);
  window.setTimeout(() => preview.remove(), 0);
}

function GearBonusList({ bonuses }) {
  const rows = [
    ["Atk", ["stab", "slash", "crush", "magic", "range"]],
    ["Def", ["defenceStab", "defenceSlash", "defenceCrush", "defenceMagic", "defenceRange"]],
    ["Other", ["meleeStrength", "rangedStrength", "magicDamage", "prayer"]],
  ];
  return (
    <div className="gear-bonus-list">
      {rows.map(([group, keys]) => (
        <div key={group}>
          <b>{group}</b>
          {keys.map((key) => bonuses?.[key] ? <span key={key}>{key.replace("defence", "def ").replace("meleeStrength", "str").replace("rangedStrength", "r str").replace("magicDamage", "magic dmg")} {bonuses[key] > 0 ? "+" : ""}{bonuses[key]}</span> : null)}
        </div>
      ))}
    </div>
  );
}

function UnitEquipmentGrid({ unit, onEquipItem, onUnequipItem, readOnly = false }) {
  const equipment = { ...makeDefaultEquipment(), ...(unit.equipment || {}) };
  const weaponIsTwoHanded = isCurrentWeaponTwoHanded(unit, equipment);
  return (
    <div className="equipment-grid">
      {EQUIPMENT_SLOTS.map((slot) => {
        const equipped = equipment[slot];
        const gear = itemById(equipped);
        const defaultWeapon = slot === "weapon" && !gear;
        const blockedOffhand = slot === "offHand" && weaponIsTwoHanded;
        return (
          <button
            type="button"
            key={slot}
            className={`equipment-slot equipment-${slot} ${gear ? "has-item" : ""} ${defaultWeapon ? "default-weapon" : ""} ${blockedOffhand ? "blocked-slot" : ""}`}
            title={gear ? `${gearBonusSummary(equipped)} • click to unequip` : defaultWeapon ? `${styleDefinition(unit.style).name || "Default"} default weapon • locked${weaponIsTwoHanded ? " • 2H" : ""}` : blockedOffhand ? "Blocked by a 2-handed weapon" : `Drop ${EQUIPMENT_SLOT_META[slot]?.name || slot} item here`}
            onClick={() => !readOnly && gear && onUnequipItem?.(unit.id, slot)}
            onDragOver={(e) => { if (!readOnly && !blockedOffhand) e.preventDefault(); }}
            onDrop={(e) => {
              if (readOnly || blockedOffhand) return;
              e.preventDefault();
              const fromIndex = Number(e.dataTransfer.getData("text/qb-inventory-index"));
              if (Number.isFinite(fromIndex)) onEquipItem?.(fromIndex, unit.id, slot);
            }}
          >
            {defaultWeapon ? <StyleIcon styleId={unit.style} /> : <GearIcon item={equipped} slot={slot} size="sm" />}
            <span>{defaultWeapon ? "Default" : blockedOffhand ? "2H locked" : EQUIPMENT_SLOT_META[slot]?.name || slot}</span>
          </button>
        );
      })}
    </div>
  );
}

function GearStatsPanel({ unit }) {
  const bonuses = gearBonuses(unit);
  return (
    <div className="gear-stats-panel">
      <div><b>Gear stats</b><span>Atk +{gearAttackBonusFor(unit, unit.style)} • Str +{gearStrengthBonusFor(unit, unit.style)} • Def +{gearDefenceBonusFor(unit, unit.style)}</span></div>
      <GearBonusList bonuses={bonuses} />
    </div>
  );
}

function currentPlayers(lobby) {
  return Object.values(lobby?.players || {}).filter(Boolean).sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

function playerForTeam(lobby, team) {
  return currentPlayers(lobby).find((p) => p.team === team) || null;
}

function teamDisplayName(lobby, team) {
  const player = playerForTeam(lobby, team);
  return player?.name || TEAM_META[team]?.name || team;
}

function teamDisplayLabel(lobby, team) {
  return `${TEAM_META[team]?.emoji || ""} ${teamDisplayName(lobby, team)}`.trim();
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

function voteEndMap(lobby) {
  return lobby?.voteEnd || {};
}

function allVoteEndYes(lobby) {
  const players = activeGamePlayers(lobby);
  if (!players.length || lobby?.phase !== "fight") return false;
  const votes = voteEndMap(lobby);
  return players.every((p) => votes[p.id] === true);
}

function openTeamForLobby(lobby) {
  const used = new Set(currentPlayers(lobby).map((p) => p.team).filter(Boolean));
  const teams = activeTeams(lobby.setup || DEFAULT_SETUP);
  return teams.find((t) => !used.has(t)) || null;
}

const NAME_PREFIXES = ["Lumbridge", "Varrock", "Falador", "Wilderness", "Barrows", "Abyssal", "Rune", "Dragon", "Gilded", "Fremmy", "Karamja", "Ardougne"];
const NAME_SUFFIXES = ["Rusher", "Tank", "Pure", "Skuller", "Pker", "Chopper", "Spec", "Runner", "Guardian", "Striker", "Scaper", "Smiter"];
function randomUnitName(styleId) {
  const style = styleDefinition(styleId).name || "Unit";
  const a = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
  const b = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
  return normalizeUnitName(`${a} ${b}`, style);
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
            {Boolean(lobby.setup?.teamMode) && <small className="team-alliance-chip">{teamAllianceLabel(team, lobby.setup)}</small>}
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
  const value = current === "blank" || current === "defend" || current === "hill" || teams.includes(current) ? current : "blank";
  return (
    <select value={value} disabled={disabled} title={disabled ? "Only this team's player can change this target" : "Choose target"} onChange={(e) => onChange(team, e.target.value)}>
      <option value="blank">Blank / random</option>
      {(game.setup?.gameMode || "classic") === "king_hill" && <option value="hill">King of the Hill</option>}
      <option value="defend">Defend base</option>
      {teams.map((target) => (
        <option key={target} value={target}>
          Target {teamDisplayName(lobby, target)}
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
      {(game.setup?.gameMode || "classic") === "king_hill" && <option value="hill">King of the Hill</option>}
      <option value="closestNpc">Closest NPC</option>
      {resourceTargetType(unit) === "tree" && <option value="resource_tree">Chop enemy trees</option>}
      {resourceTargetType(unit) === "rock" && <option value="resource_rock">Mine enemy rocks</option>}
      <option value="defend">Defend base</option>
      <option value="protectCarrier">Protect flag carrier</option>
      {allowManualTarget && <option value="homeTeleport">Home teleport</option>}
      {allowManualTarget && <option value="manual">Select tile/unit/resource...</option>}
      {teams.map((target) => (
        <option key={target} value={target}>
          Target {teamDisplayName(lobby, target)}
        </option>
      ))}
    </select>
  );
}

function targetLabel(value, unit, game) {
  const actual = value && value !== "inherit" ? value : game?.orders?.[unit?.team]?.target;
  if (!actual || actual === "blank") return "Blank / random";
  if (actual === "hill") return "King of the Hill";
  if (actual === "closestNpc") return "Closest NPC";
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
    if (unit?.manualTargetType === "follow") {
      const targetUnit = game?.units?.[unit.manualTargetUnitId] || game?.respawnQueue?.[unit.manualTargetUnitId];
      return `Follow: ${targetUnit?.name || (unit.manualTargetUnitId ? String(unit.manualTargetUnitId).slice(-6) : "unit")}`;
    }
    if (unit?.manualTargetType === "hold") return `Hold position: ${unit.manualTargetRow},${unit.manualTargetCol}`;
    if (unit?.manualTargetType === "tile") return `Manual move: ${unit.manualTargetRow},${unit.manualTargetCol}`;
    if (unit?.manualTargetType === "resource") return `Manual ${unit.manualResourceType === "tree" ? "chop" : "mine"}: ${unit.manualTargetRow},${unit.manualTargetCol}`;
    if (unit?.manualTargetType === "groundItem") {
      const item = groundItemsArray(game?.groundItems).find((entry) => entry.id === unit.manualGroundItemId);
      return `Pick up: ${itemLabel(item)}`;
    }
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
  const groundItems = game.groundItems || {};
  const combatTeams = teamsWithCombatPresence(bases, units, respawns, setup);
  if (unit.targetOverride === "homeTeleport") {
    const ownBase = baseOf(unit.team, setup);
    return { kind: "base", row: ownBase.row, col: ownBase.col, label: "Home teleport destination" };
  }
  if ((game.setup?.gameMode || "classic") === "capture_flag") {
    if (unit.carryingFlagTeam) {
      const ownBase = baseOf(unit.team, setup);
      return { kind: "base", row: ownBase.row, col: ownBase.col, label: "Return flag" };
    }
    const enemyCarrier = enemyFlagCarrierForTeam(units, unit.team, combatTeams, setup);
    if (enemyCarrier) return { kind: "unit", row: enemyCarrier.row, col: enemyCarrier.col, unitId: enemyCarrier.id, label: "Enemy flag carrier" };
  }
  const manual = manualTargetForUnit(unit, board, units, setup, groundItems);
  if (manual.kind === "unit") return { kind: "unit", row: manual.target.row, col: manual.target.col, unitId: manual.target.id, label: "Manual unit target" };
  if (manual.kind === "follow") return { kind: "unit", row: manual.target.row, col: manual.target.col, unitId: manual.target.id, label: "Follow target" };
  if (manual.kind === "tile") return { kind: "tile", row: manual.target.row, col: manual.target.col, label: "Manual move target" };
  if (manual.kind === "resource") return { kind: "resource", row: manual.target.row, col: manual.target.col, label: manual.resourceType === "tree" ? "Manual tree target" : "Manual rock target" };
  if (manual.kind === "groundItem") return { kind: "tile", row: manual.target.row, col: manual.target.col, label: `Pick up ${itemLabel(manual.item)}` };

  const ordered = effectiveTargetOrder(unit, game);
  if (ordered === "hill" && (game.setup?.gameMode || "classic") === "king_hill") {
    const hill = hillCenter(setup);
    return { kind: "hill", row: hill.row, col: hill.col, label: "King of the Hill" };
  }
  if (ordered === "resource_tree" || ordered === "resource_rock") {
    const resourceType = ordered === "resource_tree" ? "tree" : "rock";
    const target = nearestResourceTile(board, units, unit, setup, resourceType);
    if (target) return { kind: "resource", row: target.row, col: target.col, label: resourceType === "tree" ? "Tree target" : "Rock target" };
  }
  if (ordered === "closestNpc") {
    const target = nearestEnemyUnit(units, unit, ["npc"], setup);
    if (target) return { kind: "unit", row: target.row, col: target.col, unitId: target.id, label: "Closest NPC" };
  }
  if (ordered === "defend") {
    const target = defendTargetForUnit(board, units, unit, setup, combatTeams, bases);
    if (target) return { kind: "unit", row: target.row, col: target.col, unitId: target.id, label: "Defend target" };
  }
  if (ordered === "protectCarrier") {
    const carrier = alliedFlagCarrierForTeam(units, unit.team, unit.id, setup);
    const threat = carrier ? enemyThreatNearUnit(board, units, carrier, unit, combatTeams, setup) : null;
    if (threat) return { kind: "unit", row: threat.row, col: threat.col, unitId: threat.id, label: "Threat to carrier" };
    if (carrier) return { kind: "unit", row: carrier.row, col: carrier.col, unitId: carrier.id, label: "Escort carrier" };
  }
  if (TEAM_META[ordered] && (bases?.[ordered]?.hp ?? 0) > 0) {
    const base = baseOf(ordered, setup);
    return { kind: "base", row: base.row, col: base.col, label: `${TEAM_META[ordered].name} base` };
  }
  if (unit.randomTarget && TEAM_META[unit.randomTarget] && (bases?.[unit.randomTarget]?.hp ?? 0) > 0) {
    const base = baseOf(unit.randomTarget, setup);
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

function numberTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function lobbyLastActivityAt(lobby) {
  if (!lobby) return 0;
  const times = [numberTimestamp(lobby.createdAt), numberTimestamp(lobby.updatedAt), numberTimestamp(lobby.lastActivityAt)];
  for (const player of Object.values(lobby.players || {})) {
    times.push(numberTimestamp(player?.lastSeen), numberTimestamp(player?.joinedAt));
  }
  return Math.max(0, ...times);
}

function lobbyCleanupWindowMs(lobby) {
  const configuredHours = Number(lobby?.cleanupAfterHours || lobby?.setup?.cleanupAfterHours);
  const fallbackHours = lobby?.phase === "results" ? RESULTS_LOBBY_CLEANUP_HOURS : STALE_LOBBY_CLEANUP_HOURS;
  const hours = Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : fallbackHours;
  return Math.max(1, hours) * 60 * 60 * 1000;
}

function lobbyHasRecentPresence(lobby, now = Date.now()) {
  return Object.values(lobby?.players || {}).some((player) => {
    const lastSeen = numberTimestamp(player?.lastSeen);
    return player?.connected && lastSeen && now - lastSeen < RECENT_PRESENCE_GRACE_MS;
  });
}

function isStaleLobby(lobby, now = Date.now()) {
  if (!lobby) return false;
  if (lobbyHasRecentPresence(lobby, now)) return false;
  const lastActivity = lobbyLastActivityAt(lobby);
  if (!lastActivity) return false;
  return now - lastActivity > lobbyCleanupWindowMs(lobby);
}

async function cleanupStaleLobbies({ protectCode = "", force = false } = {}) {
  const now = Date.now();
  if (!force) {
    const last = Number(localStorage.getItem("quadrants_lobby_cleanup_last") || 0);
    if (last && now - last < LOBBY_CLEANUP_THROTTLE_MS) return { checked: 0, removed: 0, skipped: true };
  }
  localStorage.setItem("quadrants_lobby_cleanup_last", String(now));
  const earliestCleanupWindowMs = Math.min(
    RESULTS_LOBBY_CLEANUP_HOURS * 60 * 60 * 1000,
    STALE_LOBBY_CLEANUP_HOURS * 60 * 60 * 1000,
  );
  const cleanupQuery = query(
    ref(db, "lobbies"),
    orderByChild("lastActivityAt"),
    endAt(now - earliestCleanupWindowMs),
    limitToFirst(LOBBY_CLEANUP_BATCH_LIMIT),
  );
  const snap = await get(cleanupQuery);
  const lobbies = snap.val() || {};
  const updates = {};
  let checked = 0;
  let removed = 0;
  for (const [code, lobby] of Object.entries(lobbies)) {
    checked += 1;
    if (protectCode && code === protectCode) continue;
    if (isStaleLobby(lobby, now)) {
      updates[`lobbies/${code}`] = null;
      removed += 1;
    }
  }
  if (removed) await update(ref(db), updates);
  return { checked, removed, skipped: false };
}

function HomeScreen({ name, setName, joinCode, setJoinCode, onHost, onJoin, onCleanupLobbies, status, cleanupStatus }) {
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
          <Button onClick={onCleanupLobbies}>
            Clean Old Lobbies
          </Button>
          <p className="cleanup-hint">Inactive lobbies auto-clear after 24 hours. Finished results lobbies clear after 6 hours. Cleanup runs when someone opens the app, and this button runs it immediately.</p>
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
        {cleanupStatus && <div className="cleanup-status-line">{cleanupStatus}</div>}
      </div>
    </div>
  );
}

function LobbyView({ lobby, playerId, isHost, onUpdateSetup, onStartBuild, onChooseTeam, onChooseAlliance, onLeave, onHostSetPlayerTeam, onHostKickPlayer, onHostSetHost }) {
  const players = currentPlayers(lobby);
  const player = lobby.players?.[playerId];
  const enoughPlayers = activeGamePlayers(lobby).length >= 2 && activeGamePlayers(lobby).length === activeTeams(lobby.setup).length;
  const [settingsTab, setSettingsTab] = useState("match");

  return (
    <div className="panel-stack">
      <section className="card hero-card">
        <div>
          <h2>Lobby {lobby.code}</h2>
          <p>Share this code with players. The host can start when active team slots are filled. 5–8 player games use the larger arena layout.</p>
        </div>
        <div>
          <div className="lobby-code">{lobby.code}</div>
          <div className="action-group host-mini-actions">
            <Button onClick={() => navigator.clipboard?.writeText(`${location.origin}${location.pathname}`)}>Copy Site Link</Button>
            {isHost && <Pill tone="host">Host controls enabled</Pill>}
          </div>
        </div>
      </section>

      <section className="grid lobby-grid-split">
        <div className="card">
          <h3>Players</h3>
          <div className="player-list">
            {players.map((p) => {
              const active = activeTeams(lobby.setup || DEFAULT_SETUP);
              const occupied = new Set(players.filter((other) => other.id !== p.id).map((other) => other.team).filter(Boolean));
              return (
                <div className="player-row player-row-hostable" key={p.id}>
                  <span className={`connection-dot ${p.connected ? "on" : ""}`} />
                  <span className="player-name">{p.name}</span>
                  <span className="player-team-label">{p.team ? `${TEAM_META[p.team].emoji} ${TEAM_META[p.team].name}` : "Spectator"}</span>
                  {Boolean(lobby.setup?.teamMode && p.team) && (
                    <label className="player-alliance-picker">
                      <span>Side</span>
                      <select
                        value={normalizeTeamAlliances(lobby.setup)[p.team] || DEFAULT_TEAM_ALLIANCES[p.team]}
                        disabled={!(isHost || p.id === playerId)}
                        onChange={(e) => onChooseAlliance?.(p.team, e.target.value)}
                        title="Team-mode alliance"
                      >
                        {TEAM_MODE_ALLIANCES.map((alliance) => <option key={alliance.id} value={alliance.id}>{alliance.emoji} {alliance.name}</option>)}
                      </select>
                    </label>
                  )}
                  {lobby.hostId === p.id && <Pill tone="host">Host</Pill>}
                  {isHost && (
                    <div className="host-player-controls">
                      <select
                        value={p.team || ""}
                        title="Host color/team assignment"
                        onChange={(e) => onHostSetPlayerTeam?.(p.id, e.target.value || null)}
                      >
                        <option value="">Spectator</option>
                        {active.map((team) => (
                          <option key={team} value={team} disabled={occupied.has(team)}>
                            {TEAM_META[team].emoji} {TEAM_META[team].name}{occupied.has(team) ? " (taken)" : ""}
                          </option>
                        ))}
                      </select>
                      <Button onClick={() => onHostSetHost?.(p.id)} disabled={lobby.hostId === p.id || !p.connected}>Make Host</Button>
                      <Button onClick={() => onHostKickPlayer?.(p.id)} disabled={p.id === playerId}>Remove</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card lobby-settings-card">
          <div className="settings-card-header">
            <h3>{settingsTab === "match" ? "Match Settings" : settingsTab === "npc" ? "NPC List" : "Custom Effects"} {isHost ? "" : "(host only)"}</h3>
            <div className="shop-tabs compact-tabs">
              <button className={settingsTab === "match" ? "active" : ""} onClick={() => setSettingsTab("match")}>Match Settings</button>
              <button className={settingsTab === "npc" ? "active" : ""} onClick={() => setSettingsTab("npc")}>NPC List</button>
              <button className={settingsTab === "effects" ? "active" : ""} onClick={() => setSettingsTab("effects")}>Custom effects</button>
            </div>
          </div>

          {settingsTab === "match" && (
            <div className="settings-grid">
              <label>
                Players
                <select disabled={!isHost} value={lobby.setup.players} onChange={(e) => onUpdateSetup({ players: Number(e.target.value) })}>
                  {[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count} players{count >= 5 ? " • arena layout" : ""}</option>)}
                </select>
              </label>
              <label>
                Game mode
                <select disabled={!isHost} value={lobby.setup.gameMode || "classic"} onChange={(e) => onUpdateSetup({ gameMode: e.target.value })}>
                  {Object.entries(GAME_MODES).map(([id, mode]) => <option key={id} value={id}>{mode.name}</option>)}
                </select>
              </label>
              <label className="toggle-check lobby-toggle-row">
                <input disabled={!isHost} type="checkbox" checked={Boolean(lobby.setup.teamMode)} onChange={(e) => onUpdateSetup({ teamMode: e.target.checked })} /> Team mode
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
                KOTH hold time
                <input disabled={!isHost || (lobby.setup.gameMode || "classic") !== "king_hill"} type="number" min="10" max="600" value={lobby.setup.kothTimeLimit || DEFAULT_SETUP.kothTimeLimit} onChange={(e) => onUpdateSetup({ kothTimeLimit: Number(e.target.value) })} />
              </label>
              <label>
                Time limit
                <select disabled={!isHost} value={lobby.setup.matchTimeLimit || DEFAULT_SETUP.matchTimeLimit} onChange={(e) => onUpdateSetup({ matchTimeLimit: Number(e.target.value) })}>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                  <option value={900}>15 minutes</option>
                  <option value={1800}>30 minutes</option>
                  <option value={3600}>60 minutes</option>
                </select>
              </label>
              <label>
                Grid
                <select disabled={!isHost} value={lobby.setup.gridSize} onChange={(e) => onUpdateSetup({ gridSize: Number(e.target.value) })}>
                  <option value={13}>13x13 compact</option>
                  <option value={15}>15x15</option>
                  <option value={17}>17x17 default</option>
                  <option value={20}>20x20 large</option>
                  <option value={25}>25x25 huge</option>
                  <option value={30}>30x30 arena</option>
                </select>
              </label>
              <label className="middle-section-control">
                Middle section
                <select disabled={!isHost} value={centerSizeFor(lobby.setup)} onChange={(e) => onUpdateSetup({ centerSize: Number(e.target.value) })}>
                  <option value={3}>3x3 middle</option>
                  <option value={5}>5x5 middle</option>
                  <option value={7}>7x7 middle</option>
                </select>
              </label>
              <label>
                Base zone
                <select disabled={!isHost} value={baseZoneSizeFor(lobby.setup)} onChange={(e) => onUpdateSetup({ baseZoneSize: Number(e.target.value) })}>
                  <option value={3}>3x3 base zone</option>
                  <option value={5}>5x5 base zone</option>
                </select>
              </label>
              <label>
                Starting gold
                <input disabled={!isHost} type="number" value={lobby.setup.startingGold} onChange={(e) => onUpdateSetup({ startingGold: Number(e.target.value) })} />
              </label>
              <label className="toggle-check lobby-toggle-row restock-toggle-row">
                <input disabled={!isHost} type="checkbox" checked={Boolean(lobby.setup.restockGoldOnContinued)} onChange={(e) => onUpdateSetup({ restockGoldOnContinued: e.target.checked })} /> Restock gold on continued
              </label>
              <label>
                Restock gold
                <input disabled={!isHost || !lobby.setup.restockGoldOnContinued} type="number" min="0" value={lobby.setup.continuedRestockGold ?? DEFAULT_SETUP.continuedRestockGold} onChange={(e) => onUpdateSetup({ continuedRestockGold: Number(e.target.value) })} />
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
          )}

          {settingsTab === "npc" && (
            <div className="settings-grid npc-settings-grid">
              <label className="toggle-check lobby-toggle-row">
                <input disabled={!isHost} type="checkbox" checked={Boolean(lobby.setup.npcSpawns)} onChange={(e) => onUpdateSetup({ npcSpawns: e.target.checked })} /> NPC spawns
              </label>
              <div className="npc-list-box wide-npc-box npc-config-card">
                <b>Goblin</b>
                <div className="npc-inline-controls">
                  <label>
                    Spawned goblins
                    <input disabled={!isHost || !lobby.setup.npcSpawns} type="number" min="0" max="10" value={lobby.setup.goblinSpawnAmount ?? lobby.setup.npcSpawnAmount ?? DEFAULT_SETUP.goblinSpawnAmount} onChange={(e) => onUpdateSetup({ goblinSpawnAmount: Number(e.target.value), npcSpawnAmount: Number(e.target.value) })} />
                  </label>
                  <label>
                    Goblin spawn rate
                    <select disabled={!isHost || !lobby.setup.npcSpawns} value={lobby.setup.goblinSpawnInterval ?? lobby.setup.npcSpawnInterval ?? DEFAULT_SETUP.goblinSpawnInterval} onChange={(e) => onUpdateSetup({ goblinSpawnInterval: Number(e.target.value), npcSpawnInterval: Number(e.target.value) })}>
                      <option value={30}>Every 30 seconds</option>
                      <option value={60}>Every 1 minute</option>
                      <option value={120}>Every 2 minutes</option>
                      <option value={300}>Every 5 minutes</option>
                    </select>
                  </label>
                </div>
                <span>{lobby.setup.npcSpawns ? `Center-area spawn every ${formatDuration(lobby.setup.goblinSpawnInterval ?? lobby.setup.npcSpawnInterval ?? DEFAULT_SETUP.goblinSpawnInterval)} • ${lobby.setup.goblinSpawnAmount ?? lobby.setup.npcSpawnAmount ?? DEFAULT_SETUP.goblinSpawnAmount} max alive` : "Disabled"}</span>
                <span>30 HP • 10 Atk / 10 Str / 10 Def / 10 Mag • Speed 3</span>
                <span>Always drops Bones ({GEAR_ITEMS.bones.prayerXp} Prayer XP).</span>
                <span>Roll table: {goblinLootChanceRows().map((row) => row.type === "gold" ? `Gold ${chanceLabel(row.chance)}` : `${itemById(row.itemId)?.name || row.itemId} ${chanceLabel(row.chance)}`).join(" • ")}</span>
              </div>
              <div className="npc-list-box wide-npc-box npc-config-card">
                <b>Hill Giant</b>
                <div className="npc-inline-controls">
                  <label>
                    Spawned hill giants
                    <input disabled={!isHost || !lobby.setup.npcSpawns} type="number" min="0" max="5" value={lobby.setup.hillGiantSpawnAmount ?? DEFAULT_SETUP.hillGiantSpawnAmount} onChange={(e) => onUpdateSetup({ hillGiantSpawnAmount: Number(e.target.value) })} />
                  </label>
                  <label>
                    Hill giant spawn rate
                    <select disabled={!isHost || !lobby.setup.npcSpawns} value={lobby.setup.hillGiantSpawnInterval ?? DEFAULT_SETUP.hillGiantSpawnInterval} onChange={(e) => onUpdateSetup({ hillGiantSpawnInterval: Number(e.target.value) })}>
                      <option value={30}>Every 30 seconds</option>
                      <option value={60}>Every 1 minute</option>
                      <option value={120}>Every 2 minutes</option>
                      <option value={300}>Every 5 minutes</option>
                    </select>
                  </label>
                </div>
                <span>{lobby.setup.npcSpawns ? `2x2 center-area spawn every ${formatDuration(lobby.setup.hillGiantSpawnInterval ?? DEFAULT_SETUP.hillGiantSpawnInterval)} • ${lobby.setup.hillGiantSpawnAmount ?? DEFAULT_SETUP.hillGiantSpawnAmount} max alive` : "Disabled"}</span>
                <span>100 HP • 30 Atk / 30 Str / 30 Def / 1 Mag / 1 Rng / 1 Prayer • Speed 5</span>
                <span>Always drops Big Bones ({GEAR_ITEMS.big_bones.prayerXp} Prayer XP, {GEAR_ITEMS.big_bones.sellValue}gp).</span>
                <span>Roll table: {hillGiantLootChanceRows().map((row) => row.type === "gold" ? `Gold ${chanceLabel(row.chance)} (${row.min}-${row.max}g)` : `${itemById(row.itemId)?.name || row.itemId} ${chanceLabel(row.chance)}${row.max ? ` (${row.min || 1}-${row.max})` : ""}`).join(" • ")}</span>
              </div>
            </div>
          )}

          {settingsTab === "effects" && (
            <div className="npc-list-box wide-npc-box">
              <b>Custom effects</b>
              <span>No custom effects are active yet. This tab is reserved for future modifiers such as poison maps, prayer altars, wilderness skulls, and KOTH zones.</span>
            </div>
          )}
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
  const base = baseOf(team, setup);
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

function ReadyPanel({ lobby, playerId, phase, onToggleReady, isHost, onAdvance, advanceText, canAdvance, blockReadyReason = "", connectionStatus = null }) {
  const players = activeGamePlayers(lobby);
  const ready = readyMap(lobby, phase);
  const meReady = Boolean(ready[playerId]);
  return (
    <section className="card compact">
      <div className="section-title">
        <h3>{phase === "build" ? "Build Finalization" : "Buy Finalization"}</h3>
        <Button onClick={() => { if (!meReady && blockReadyReason) { alert(blockReadyReason); return; } onToggleReady(!meReady); }} variant={meReady ? "success" : "primary"} className="ready-big-btn">
          {meReady ? "Unready" : "Ready"}
        </Button>
      </div>
      <div className="ready-list">
        {players.map((p) => {
          const needsConnection = phase === "build" && p.team && connectionStatus && connectionStatus[p.team] === false;
          const statusText = ready[p.id] ? "Ready" : needsConnection ? "Needs connection" : "Waiting";
          return (
            <div key={p.id} className="ready-row">
              <span>{TEAM_META[p.team]?.emoji} {p.name}</span>
              <Pill tone={ready[p.id] ? "ready" : "waiting"}>{statusText}</Pill>
            </div>
          );
        })}
      </div>
      {isHost && (
        <Button onClick={onAdvance} disabled={!canAdvance} variant="primary" className="full-width">
          {advanceText}
        </Button>
      )}
    </section>
  );
}

function PhaseReadyTopBar({ lobby, player, phase, onToggleReady, isHost, onAdvance, advanceText, canAdvance, blockReadyReason = "" }) {
  const ready = readyMap(lobby, phase);
  const meReady = Boolean(ready[player?.id]);
  const players = activeGamePlayers(lobby);
  const title = phase === "build" ? "Build" : "Buy";
  const handleToggle = () => {
    if (!meReady && blockReadyReason) {
      alert(blockReadyReason);
      return;
    }
    onToggleReady(!meReady);
  };
  return (
    <div className="phase-ready-topbar">
      <label className="toggle-check ready-toggle">
        <input type="checkbox" checked={meReady} onChange={handleToggle} /> {title} finalized
      </label>
      <span className="ready-mini">{players.map((p) => `${p.name}:${ready[p.id] ? "yes" : "no"}`).join(" • ")}</span>
      {isHost && <Button onClick={onAdvance} disabled={!canAdvance} variant="primary">{advanceText}</Button>}
    </div>
  );
}


function BoardView({ lobby, player, selectedTool, onCellClick, onUnitClick, selectedUnitId, selectedResource, visualToggles = {}, onGroundItemsContextMenu, onBoardContextMenu }) {
  const game = lobby.game;
  const setup = game.setup;
  const size = sizeOf(setup);
  const units = arrayFromObject(game.units);
  const splats = arrayFromObject(game.splats);
  const effects = arrayFromObject(game.effects);
  const groundItems = groundItemsArray(game);
  const respawns = arrayFromObject(game.respawnQueue);
  const unitsByCell = useMemo(() => {
    const map = new Map();
    for (const unit of units) {
      for (const cell of unitFootprint(unit)) {
        const k = key(cell.row, cell.col);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(unit);
      }
    }
    return map;
  }, [game.units]);
  const unitAnchorsByCell = useMemo(() => {
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
        if (!Number.isFinite(Number(point.row)) || !Number.isFinite(Number(point.col))) continue;
        const k = key(point.row, point.col);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(effect);
      }
    }
    return map;
  }, [game.effects]);

  const groundItemsByCell = useMemo(() => {
    const map = new Map();
    for (const item of groundItems) {
      const k = key(item.row, item.col);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
    return map;
  }, [game.groundItems]);

  const spawnIndicatorsByCell = useMemo(() => {
    const map = new Map();
    const add = (row, col, indicator) => {
      const k = key(row, col);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(indicator);
    };
    for (const effect of effects.filter((e) => e.type === "spawn" && e.team === "npc")) add(effect.row, effect.col, { ...effect, kind: "effect" });
    if (setup.npcSpawns) {
      const fightTime = Number(game.fightTime || 0);
      const nextByStyle = game.nextNpcSpawnAtByStyle || {};
      const previewUnits = units.map((unit) => ({ ...unit }));
      for (const cfg of npcSpawnConfigs(setup)) {
        const nextNpcSpawnAt = Number(nextByStyle[cfg.style] ?? (cfg.style === "goblin" ? game.nextNpcSpawnAt : undefined) ?? cfg.interval ?? NPC_SPAWN_INTERVAL);
        const secondsUntilNpcSpawn = nextNpcSpawnAt - fightTime;
        if (!(secondsUntilNpcSpawn > 0 && secondsUntilNpcSpawn <= SPAWN_WARNING_SECONDS)) continue;
        const alive = previewUnits.filter((u) => u.team === "npc" && u.style === cfg.style && u.hp > 0).length;
        const toPreview = Math.max(0, cfg.amount - alive);
        const planned = plannedNpcSpawnCells(setup, previewUnits, cfg.style, toPreview, game.board);
        planned.forEach((cell, i) => {
          add(cell.row, cell.col, { id: `npc-pending-${cfg.style}-${Math.round(nextNpcSpawnAt)}-${i}`, kind: "pending", team: "npc", style: cfg.style, timer: secondsUntilNpcSpawn });
          previewUnits.push({ id: `pending_${cfg.style}_${i}`, team: "npc", style: cfg.style, row: cell.row, col: cell.col, hp: 1 });
        });
      }
    }
    return map;
  }, [game.effects, game.nextNpcSpawnAt, game.nextNpcSpawnAtByStyle, game.fightTime, game.units, game.board, setup]);

  const activeTeam = player?.team;
  const showHitsplats = visualToggles.showHitsplats !== false;
  const showUnitNames = visualToggles.showUnitNames !== false;
  const [hoverUnit, setHoverUnit] = useState(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const panRef = useRef(null);
  const wrapRef = useRef(null);
  const boardRef = useRef(null);
  const largeBoard = size >= 24;
  const selectedUnit = selectedUnitId ? units.find((u) => u.id === selectedUnitId && u.hp > 0) : null;
  const previewUnit = hoverUnit || selectedUnit;
  const selectedTarget = useMemo(() => selectedUnit ? selectedTargetPreview(game, selectedUnit, activeTeam) : null, [game, selectedUnit, activeTeam]);
  const projectileEffects = effects.filter((e) => e.type !== "spawn" && (combatType(e.style) === "range" || combatType(e.style) === "magic"));
  const reachableBuildKeys = useMemo(() => activeTeam && lobby.phase === "build" ? reachableRoadKeys(game.board, activeTeam, setup) : new Set(), [game.board, activeTeam, lobby.phase, setup]);
  const constrainView = (next) => {
    const wrap = wrapRef.current;
    const board = boardRef.current;
    if (!wrap || !board || !largeBoard) return { zoom: Math.max(1, Math.min(2.5, next.zoom || 1)), x: 0, y: 0 };
    const zoom = Math.max(1, Math.min(2.5, next.zoom || 1));
    const vw = wrap.clientWidth || 1;
    const vh = wrap.clientHeight || 1;
    const bw = board.offsetWidth || 1;
    const bh = board.offsetHeight || 1;
    const scaledW = bw * zoom;
    const scaledH = bh * zoom;
    const clampAxis = (value, viewport, scaled) => {
      if (scaled <= viewport) return Math.round((viewport - scaled) / 2);
      return Math.max(viewport - scaled, Math.min(0, value));
    };
    return {
      zoom,
      x: clampAxis(next.x || 0, vw, scaledW),
      y: clampAxis(next.y || 0, vh, scaledH),
    };
  };
  const resetView = () => setView((cur) => constrainView({ zoom: 1, x: 0, y: 0 }));
  useEffect(() => {
    const raf = requestAnimationFrame(resetView);
    return () => cancelAnimationFrame(raf);
  }, [size, largeBoard]);
  useEffect(() => {
    const onResize = () => setView((cur) => constrainView(cur));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [largeBoard]);
  const setZoom = (nextZoom, anchor = null) => {
    setView((cur) => {
      const zoom = Math.max(1, Math.min(2.5, nextZoom));
      if (!anchor) return constrainView({ ...cur, zoom });
      const ratio = zoom / (cur.zoom || 1);
      return constrainView({ zoom, x: anchor.x - (anchor.x - cur.x) * ratio, y: anchor.y - (anchor.y - cur.y) * ratio });
    });
  };
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const onWheel = (e) => {
      if (!largeBoard) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = wrap.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setZoom(view.zoom * (e.deltaY > 0 ? 0.9 : 1.1), anchor);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [largeBoard, view.zoom]);
  useEffect(() => {
    const onMove = (e) => {
      if (!panRef.current) return;
      const start = panRef.current;
      setView(() => constrainView({ zoom: start.zoom, x: start.x + (e.clientX - start.clientX), y: start.y + (e.clientY - start.clientY) }));
    };
    const onUp = () => { panRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [largeBoard]);

  return (
    <div
      ref={wrapRef}
      className={`board-wrap ${largeBoard ? "large-board" : ""} ${panRef.current ? "is-panning" : ""}`}
      onMouseDown={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        panRef.current = { clientX: e.clientX, clientY: e.clientY, x: view.x, y: view.y, zoom: view.zoom };
      }}
      onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
    >
      <div className="board-view-controls">
        <span>{size}x{size}</span>
        <span>{Math.round(view.zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(view.zoom * 1.12)}>+</button>
        <button type="button" onClick={() => setZoom(view.zoom * 0.88)}>-</button>
        <button type="button" onClick={resetView}>Reset</button>
        <small>Scroll zoom in/out • middle-drag pan</small>
      </div>
      <div className="board-pan-scene" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <div ref={boardRef} className="board" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
        {game.board.flat().map((cell) => {
          const baseTeam = baseTeamAt(cell.row, cell.col, setup);
          const rawCellUnits = unitsByCell.get(key(cell.row, cell.col)) || [];
          const cellUnits = [...rawCellUnits].sort((a, b) => Number(b.id === selectedUnitId) - Number(a.id === selectedUnitId) || Number(Boolean(b.carryingFlagTeam)) - Number(Boolean(a.carryingFlagTeam)) || a.team.localeCompare(b.team));
          const rawAnchorUnits = unitAnchorsByCell.get(key(cell.row, cell.col)) || [];
          const anchorUnits = [...rawAnchorUnits].sort((a, b) => Number(b.id === selectedUnitId) - Number(a.id === selectedUnitId) || Number(Boolean(b.carryingFlagTeam)) - Number(Boolean(a.carryingFlagTeam)) || a.team.localeCompare(b.team));
          const cellSplats = splatsByCell.get(key(cell.row, cell.col)) || [];
          const cellEffects = effectsByCell.get(key(cell.row, cell.col)) || [];
          const cellGroundItems = groundItemsByCell.get(key(cell.row, cell.col)) || [];
          const spawnIndicators = spawnIndicatorsByCell.get(key(cell.row, cell.col)) || [];
          const buildLimited = lobby.phase === "build";
          const buildVisible = !buildLimited || !activeTeam || cell.owner === activeTeam || isCenterCell(cell.row, cell.col, setup);
          const buildHidden = buildLimited && !buildVisible;
          const fogged = !buildHidden && isBuildFogged(cell, activeTeam, lobby.phase, setup);
          const visibleType = buildHidden || fogged ? "empty" : cell.type;
          const hiddenUnused = buildHidden || (lobby.phase !== "build" && visibleType === "empty" && !baseTeam && cellUnits.length === 0);
          const firstUnit = buildHidden ? null : anchorUnits[0];
          const largeUnitAnchor = Boolean(firstUnit && unitSize(firstUnit) > 1);
          const targetUnit = buildHidden ? null : cellUnits[0];
          const style = buildHidden ? {} : (fogged ? FOG_STYLE : TILE_STYLE[visibleType] || TILE_STYLE.empty);
          const inHoverRange = previewUnit && !fogged && !blocksLineOfSight(cell) && canAttack(game.board, previewUnit, cell, unitAttackRange(previewUnit), setup);
          const inBuildPath = !fogged && reachableBuildKeys.has(key(cell.row, cell.col)) && lobby.phase === "build" && walkable(cell, setup) && (cell.owner === activeTeam || cell.owner === "neutral");
          const selectedHere = selectedUnitId && cellUnits.some((u) => u.id === selectedUnitId);
          const targetHere = selectedTarget && selectedTarget.row === cell.row && selectedTarget.col === cell.col && !fogged;
          const resourceSelectedHere = selectedResource && selectedResource.row === cell.row && selectedResource.col === cell.col && !fogged;
          const groundItemTitle = cellGroundItems.length ? ` • Ground: ${cellGroundItems.map((entry) => `${itemLabel(entry)} (${groundItemRemainingSeconds(entry, game.fightTime || 0)}s)`).join(", ")}` : "";
          const title = targetUnit ? `${unitHoverText(targetUnit)}${groundItemTitle}` : fogged ? "Hidden enemy tile" : `${cell.row},${cell.col} owner:${cell.owner} type:${cell.type}${selectedTarget && targetHere ? ` • ${selectedTarget.label}` : ""}${cell.regrowType ? ` regrows ${cell.regrowType} in ${Math.max(0, Math.ceil((cell.regrowAt ?? 0) - (game.fightTime || 0)))}s` : ""}${groundItemTitle}`;
          const resourceType = !fogged && (cell.type === "tree" || cell.type === "rock") ? cell.type : null;
          const resourceMax = resourceType ? resourceMaxHp(resourceType) : 0;
          const resourceHp = resourceType ? resourceCurrentHp(cell, resourceType) : 0;
          const showResourceHp = Boolean(resourceType && cell.resourceHp != null && resourceHp < resourceMax);
          return (
            <button
              key={key(cell.row, cell.col)}
              onClick={() => { if (buildHidden) return; targetUnit && onUnitClick ? onUnitClick(targetUnit.id) : onCellClick(cell.row, cell.col); }}
              onMouseEnter={() => setHoverUnit(targetUnit || null)}
              onMouseLeave={() => setHoverUnit(null)}
              onContextMenu={(e) => {
                if (buildHidden) return;
                if (onBoardContextMenu) {
                  e.preventDefault();
                  e.stopPropagation();
                  onBoardContextMenu(e, cell, cellUnits, cellGroundItems);
                  return;
                }
                if (cellGroundItems.length && onGroundItemsContextMenu) {
                  e.preventDefault();
                  e.stopPropagation();
                  onGroundItemsContextMenu(e, cellGroundItems, cell);
                }
              }}
              className={`cell ${largeUnitAnchor ? "large-unit-anchor-cell" : ""} ${hiddenUnused ? "hidden-cell" : ""} ${buildHidden ? "build-hidden-cell" : ""} ${isHillCell(cell.row, cell.col, setup) && (setup.gameMode || "classic") === "king_hill" ? "hill-cell" : ""} ${cell.owner === activeTeam && lobby.phase === "build" ? "own-cell" : ""} ${cell.owner === "neutral" && lobby.phase === "build" ? "neutral-cell" : ""} ${cell.owner === "void" && visibleType === "empty" ? "void-cell" : ""} ${cellGroundItems.length ? "has-ground-items" : ""} ${inHoverRange ? "range-preview" : ""} ${inBuildPath ? "path-preview" : ""} ${selectedHere ? "selected-unit-cell" : ""} ${resourceSelectedHere ? "selected-resource-cell" : ""} ${targetHere ? `selected-target-cell target-${selectedTarget.kind}` : ""}`}
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
                    {spawnIndicators.slice(-2).map((indicator) => <img key={indicator.id} className={`spawn-pentagram spawn-${indicator.kind}`} src={asset("pentagram.png")} alt="Spawn marker" draggable={false} />)}
                    {baseTeam ? <BaseIcon team={baseTeam} /> : cell.owner === "void" && visibleType === "empty" ? "×" : fogged ? "?" : visibleType === "empty" ? "·" : TILE[visibleType]?.image ? <img className="tile-object-icon" src={asset(TILE[visibleType].image)} alt={TILE[visibleType].name} /> : visibleType === "wall" ? TILE[visibleType].icon : ""}
                    {!fogged && cellGroundItems.length > 0 && (
                      <div className="ground-item-stack" title={cellGroundItems.map((entry) => `${itemLabel(entry)} • ${groundItemRemainingSeconds(entry, game.fightTime || 0)}s`).join("\n")}>
                        {cellGroundItems.slice(0, 3).map((entry) => <GearIcon key={entry.id} item={entry} slot={itemById(entry)?.slot} size="xs" />)}
                        {cellGroundItems.length > 3 && <span>+{cellGroundItems.length - 3}</span>}
                      </div>
                    )}
                    {targetHere && <div className="target-marker">🎯</div>}
                    {showResourceHp && <div className="resource-hpbar"><div className="resource-hpbar-fill" style={{ width: `${Math.max(0, Math.min(100, (resourceHp / resourceMax) * 100))}%` }} /></div>}
                    {cell.regrowType && !fogged && <div className="regrow-timer">{Math.max(0, Math.ceil((cell.regrowAt ?? 0) - (game.fightTime || 0)))}s</div>}
                    {firstUnit && <UnitToken unit={{ ...firstUnit, currentFightTime: game.fightTime || 0 }} bump={cellEffects.length > 0} showName={showUnitNames} />}
                    {anchorUnits.length > 1 && <div className="stack-count">+{anchorUnits.length - 1}</div>}
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
      <ReadyPanel lobby={lobby} playerId={player.id} phase="build" onToggleReady={onReady} isHost={isHost} onAdvance={onAdvance} advanceText="To Buy" canAdvance={canAdvance} connectionStatus={connections} blockReadyReason={player?.team && !connections[player.team] ? "Needs connection to the center before finalizing Build Phase." : ""} />
      <section className="card compact">
        <h3>Build Controls</h3>
        <p className="muted">You can build only inside your own zone. Keep {BUILD_PHASE_GOLD_RESERVE}g for buy phase.</p>
        {player?.team && (
          <div className={`connection-banner ${connections[player.team] ? "connected" : "missing"}`}>
            <span>{connections[player.team] ? "✓ Connected to center" : "Needs path to center"}</span>
          </div>
        )}
        <div className="tool-grid">
          {Object.keys(TILE).map((type) => (
            <Button key={type} onClick={() => setSelectedTool({ kind: "terrain", type })} variant={selectedTool.type === type ? "primary" : "default"}>
              {TILE[type].icon || "·"} {TILE[type].name} {TILE[type].cost ? `${TILE[type].cost}g` : ""}
            </Button>
          ))}
          <Button onClick={() => setSelectedTool({ kind: "sell" })} variant={selectedTool.kind === "sell" ? "primary" : "default"}>Sell tile</Button>
          <Button onClick={() => setSelectedTool({ kind: "inspect" })} variant={selectedTool.kind === "inspect" ? "primary" : "default"}>Inspect</Button>
        </div>
      </section>

      <section className="card compact">
        <h3>Teams</h3>
        {teams.map((team) => (
          <div key={team} className="team-status">
            <span>{teamDisplayLabel(lobby, team)}</span>
            <span>{game.gold?.[team] ?? 0}g</span>
            <Pill tone={connections[team] ? "ready" : "waiting"}>{connections[team] ? "center ready" : "needs path"}</Pill>
          </div>
        ))}
      </section>

      <section className="card compact">
        <h3>Targets</h3>
        {teams.map((team) => (
          <div key={team} className="target-row">
            <span>{teamDisplayLabel(lobby, team)}</span>
            <TargetControl team={team} lobby={lobby} player={player} onChange={onSetOrder} />
          </div>
        ))}
      </section>
    </aside>
  );
}

function BuyPanel({ lobby, player, onBuy, onBuyMarketItem, onSellInventoryItem, onEquipItem, onUnequipItem, onUpdateUnit, onRemoveUnit, onReady, isHost, onAdvance }) {
  const game = lobby.game;
  const teams = activeTeams(game.setup);
  const allUnits = arrayFromObject(game.units);
  const myUnits = allUnits.filter((u) => u.team === player.team).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const overLimitTeams = teams.filter((team) => allUnits.filter((u) => u.team === team).length > Number(game.setup.maxUnits || DEFAULT_SETUP.maxUnits));
  const overLimit = overLimitTeams.includes(player.team);
  const canAdvance = allReadyForPhase(lobby, "buy") && overLimitTeams.length === 0;
  const [shopTab, setShopTab] = useState("units");
  const [unitFilter, setUnitFilter] = useState("cost");
  const inventory = getTeamInventory(game, player.team);
  const currentGold = game.gold?.[player.team] ?? 0;
  const inventoryUsed = inventory.filter(Boolean).length;
  const sortUnits = (ids) => {
    const list = [...ids];
    const typeOrder = { melee: 0, range: 1, magic: 2, support: 3 };
    const styleCategory = (id) => STYLE[id]?.resourceTarget ? "support" : STYLE[id]?.combatType || "melee";
    if (["melee", "range", "magic", "support"].includes(unitFilter)) return list.filter((id) => styleCategory(id) === unitFilter).sort((a, b) => (STYLE[a].cost - STYLE[b].cost) || STYLE[a].name.localeCompare(STYLE[b].name));
    if (unitFilter === "type") return list.sort((a, b) => (typeOrder[styleCategory(a)] - typeOrder[styleCategory(b)]) || (STYLE[a].cost - STYLE[b].cost) || STYLE[a].name.localeCompare(STYLE[b].name));
    if (unitFilter === "name") return list.sort((a, b) => STYLE[a].name.localeCompare(STYLE[b].name));
    return list.sort((a, b) => (STYLE[a].cost - STYLE[b].cost) || STYLE[a].name.localeCompare(STYLE[b].name));
  };

  return (
    <div className="buy-overlay buy-overlay-v34">
      <section className="card compact buy-shop-card">
        <div className="buy-header-row">
          <div>
            <h3>Buy Phase</h3>
            <p className="muted">Buy units, gear, and manage loot. Targets are set during the fight.</p>
          </div>
          <div className="buy-big-meters">
            <div><span>Gold</span><b>{currentGold}g</b></div>
            <div><span>Units</span><b>{myUnits.length}/{game.setup.maxUnits}</b></div>
            <div><span>Loot</span><b>{inventoryUsed}/{INVENTORY_SIZE}</b></div>
          </div>
        </div>
        {overLimitTeams.length > 0 && <p className="warning-text">Over unit cap: {overLimitTeams.map((team) => TEAM_META[team]?.name).join(", ")}. Sell units until every team is at the max before the fight can start.</p>}
        <div className="shop-tabs">
          <button className={shopTab === "units" ? "active" : ""} onClick={() => setShopTab("units")}>Units</button>
          <button className={shopTab === "gear" ? "active" : ""} onClick={() => setShopTab("gear")}>Gear</button>
        </div>
        {shopTab === "units" ? (
          <>
            <div className="shop-toolbar">
              <label>Sort / filter
                <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
                  <option value="cost">Cost</option>
                  <option value="type">Type groups</option>
                  <option value="melee">Melee</option>
                  <option value="range">Range</option>
                  <option value="magic">Magic</option>
                  <option value="support">Support</option>
                  <option value="name">Name</option>
                </select>
              </label>
            </div>
            <div className="unit-shop">
              {sortUnits(MINION_STYLE_IDS).map((styleId) => {
                const s = STYLE[styleId];
                const category = s.resourceTarget ? "support" : s.combatType;
                return (
                  <button className="unit-card" key={styleId} onClick={() => onBuy(styleId)}>
                    <StyleIcon styleId={styleId} size="lg" />
                    <b>{s.name}</b>
                    <span>{s.cost}g • {category} • Rng {s.range} • Speed {attackSpeedLabel(styleId)} • Max {previewMaxHit(styleId)}</span>
                    {statGrid(makeStats(styleId))}
                    {passiveText(styleId).map((text) => <small key={text} className="unit-passive">{text}</small>)}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div
            className="gear-shop gear-market-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const fromIndex = Number(e.dataTransfer.getData("text/qb-inventory-index"));
              if (Number.isFinite(fromIndex)) onSellInventoryItem?.(fromIndex);
            }}
          >
            <div className="market-drop-hint">Drop loot here to sell it for 50% value. Sold items appear here for any player to buy.</div>
            {groupedMarketItemsArray(game).length === 0 && SHOP_GEAR_ITEM_IDS.length === 0 && <p className="muted empty-shop-note">No gear is stocked yet. Future loot sold by players will appear here.</p>}
            {SHOP_GEAR_ITEM_IDS.map((itemId) => {
              const item = itemById(itemId);
              return (
                <button className="gear-card" key={`shop-${itemId}`} onClick={() => onBuyMarketItem?.({ itemId, price: item.cost, shop: true })}>
                  <GearIcon item={{ itemId }} slot={item.slot} size="lg" />
                  <div>
                    <b>{item.name}</b>
                    <span>{item.cost}g • {EQUIPMENT_SLOT_META[item.slot]?.name || item.slot} • unlimited stock</span>
                    <GearBonusList bonuses={{ ...emptyGearBonuses(), ...(item.bonuses || {}) }} />
                  </div>
                </button>
              );
            })}
            {groupedMarketItemsArray(game).map((entry) => {
              const item = itemById(entry);
              const firstKey = entry.keys?.[0] || entry.key;
              return (
                <button className="gear-card stacked-gear-card" key={`${item.id}-${entry.price}`} onClick={() => onBuyMarketItem?.(firstKey)}>
                  <div className="gear-stack-icon-wrap">
                    <GearIcon item={entry} slot={item.slot} size="lg" />
                    <span className="gear-stock-badge">x{entry.stock}</span>
                  </div>
                  <div>
                    <b>{item.name}</b>
                    <span>{entry.price ?? item.cost}g • {EQUIPMENT_SLOT_META[item.slot]?.name || item.slot}{item.twoHanded ? " • 2H" : ""} • stock {entry.stock}</span>
                    <GearBonusList bonuses={{ ...emptyGearBonuses(), ...(item.bonuses || {}) }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <ReadyPanel lobby={lobby} playerId={player.id} phase="buy" onToggleReady={onReady} isHost={isHost} onAdvance={onAdvance} advanceText="Start Fight" canAdvance={canAdvance} blockReadyReason={overLimit ? "You are over the unit cap. Sell units until your roster is within the limit before readying." : ""} />

      <section className="card compact loot-card">
        <h3>Current Loot</h3>
        <p className="muted">Drag loot onto a unit to equip it automatically. Drop loot on the Gear tab to sell it for 50% value. Click equipped non-default gear to unequip it.</p>
        <div className="inventory-grid">
          {inventory.map((entry, index) => {
            const item = itemById(entry);
            return (
              <div
                key={index}
                className={`inventory-slot ${item ? "has-item" : ""}`}
                draggable={Boolean(item)}
                onDragStart={(e) => {
                  if (!item) return;
                  e.dataTransfer.setData("text/qb-inventory-index", String(index));
                  e.dataTransfer.effectAllowed = "move";
                  setInventoryDragPreview(e, entry);
                }}
                title={item ? gearBonusSummary(entry) : "Empty loot slot"}
              >
                {item ? <><GearIcon item={entry} slot={item.slot} /><small>{item.name}</small>{itemQuantity(entry) > 1 && <span className="inventory-qty-badge">x{itemQuantity(entry)}</span>}<div className="inventory-tooltip"><b>{item.name}{itemQuantity(entry) > 1 ? ` x${itemQuantity(entry)}` : ""}</b><span>{gearBonusSummary(entry)}</span></div></> : <span className="empty-slot-label">{index + 1}</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card compact owned-card">
        <h3>Your Units</h3>
        <div className="owned-units">
          {myUnits.length === 0 && <p className="muted">No units yet.</p>}
          {myUnits.map((u) => (
            <details className="owned-unit buy-owned-unit collapsible-unit-card" key={u.id} open={myUnits.length <= 3} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const fromIndex = Number(e.dataTransfer.getData("text/qb-inventory-index")); if (Number.isFinite(fromIndex)) onEquipItem?.(fromIndex, u.id); }}>
              <summary className="owned-header collapsible-unit-summary">
                <StyleIcon styleId={u.style} />
                <b>{styleDefinition(u.style).name}</b>
                <span>{u.name}</span>
                <Pill>Max {maxDamageRoll(u, null)}</Pill>
                <button type="button" className="sell-unit-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveUnit?.(u.id); }}>Sell +{STYLE[u.style]?.cost ?? 0}g</button>
              </summary>
              <input value={u.name} onChange={(e) => onUpdateUnit(u.id, { name: e.target.value })} />
              <div className="unit-buy-gear-layout">
                <UnitEquipmentGrid unit={u} onEquipItem={onEquipItem} onUnequipItem={onUnequipItem} />
                <div>
                  <UnitStatSummary unit={u} />
                  <GearStatsPanel unit={u} />
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function FightStats({ lobby, player }) {
  const game = lobby.game;
  const units = arrayFromObject(game.units);
  const respawns = arrayFromObject(game.respawnQueue);
  const [sortBy, setSortBy] = useState("damage");
  const [teamFilter, setTeamFilter] = useState("all");
  const teams = activeTeams(game.setup);
  const sorters = {
    damage: (a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0),
    kills: (a, b) => (b.kills ?? 0) - (a.kills ?? 0),
    hp: (a, b) => (b.hp ?? 0) - (a.hp ?? 0),
    deaths: (a, b) => (b.deathCount ?? 0) - (a.deathCount ?? 0),
    flags: (a, b) => ((b.flagCaptures ?? 0) * 3 + (b.flagGrabs ?? 0)) - ((a.flagCaptures ?? 0) * 3 + (a.flagGrabs ?? 0)),
    loot: (a, b) => (b.lootGold ?? 0) - (a.lootGold ?? 0),
    hill: (a, b) => ((b.hillUncontestedTime ?? 0) + (b.hillContestedTime ?? 0)) - ((a.hillUncontestedTime ?? 0) + (a.hillContestedTime ?? 0)),
    resources: (a, b) => (b.resourcesCleared ?? 0) - (a.resourcesCleared ?? 0),
  };
  const allUnits = [...units, ...respawns]
    .filter((u) => teamFilter === "all" || u.team === teamFilter)
    .sort((a, b) => (sorters[sortBy] || sorters.damage)(a, b) || (b.totalDamage ?? 0) - (a.totalDamage ?? 0));

  return (
    <div className="stats-overlay">
      <div className="stats-toolbar">
        <label>Sort
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="damage">Damage</option>
            <option value="kills">Kills</option>
            <option value="flags">Flag work</option>
            <option value="loot">Loot gold</option>
            <option value="hill">Hill time</option>
            <option value="resources">Resources</option>
            <option value="hp">Current HP</option>
            <option value="deaths">Deaths</option>
          </select>
        </label>
        <label>Team
          <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
            <option value="all">All teams</option>
            {teams.map((team) => <option key={team} value={team}>{teamDisplayName(lobby, team)}</option>)}
          </select>
        </label>
      </div>
      <div className="stats-grid">
        {teams.map((team) => {
          const teamUnits = [...units, ...respawns].filter((u) => u.team === team);
          return (
            <div className="stats-card" key={team} style={{ borderColor: TEAM_META[team].color }}>
              <h3>{teamDisplayLabel(lobby, team)}</h3>
              <p>Base HP {Math.max(0, Math.round(game.bases?.[team]?.hp ?? 0))}/{game.setup.baseHp}</p>
              <p>Alive {units.filter((u) => u.team === team).length} • Respawn {respawns.filter((u) => u.team === team).length}</p>
              <p>Damage {teamUnits.reduce((s, u) => s + (u.totalDamage ?? 0), 0)} • Kills {teamUnits.reduce((s, u) => s + (u.kills ?? 0), 0)} • Loot {teamUnits.reduce((s, u) => s + (u.lootGold ?? 0), 0)}g</p>
              {(game.setup.gameMode === "king_hill") && <p>Hill {Math.floor(teamUnits.reduce((s, u) => s + (u.hillUncontestedTime ?? 0), 0))}s uncontested • {Math.floor(teamUnits.reduce((s, u) => s + (u.hillContestedTime ?? 0), 0))}s contested</p>}
            </div>
          );
        })}
      </div>
      <div className="unit-table">
        {allUnits.map((u) => (
          <div className="unit-row" key={u.id}>
            <span>{TEAM_META[u.team]?.emoji}</span>
            <StyleIcon styleId={u.style} />
            <b>{u.carryingFlagTeam ? "🚩 " : ""}{u.name}</b>
            <span>{styleDefinition(u.style).name}</span>
            <span>HP {u.hp ? Math.round(u.hp) : "respawn"}</span>
            <span>{u.totalDamage ?? 0} dmg</span>
            <span>{u.kills ?? 0} kills</span>
            <span>{u.flagGrabs ?? 0}/{u.flagCaptures ?? 0} flags</span>
            {(game.setup.gameMode === "king_hill") && <span>{Math.floor(u.hillUncontestedTime ?? 0)}s hill / {Math.floor(u.hillContestedTime ?? 0)}s cont.</span>}
            <span>{u.lootGold ?? 0}g</span>
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
      <div className="unit-info-card resource-info-card">
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

function FightLeftPanel({ lobby, player, selectedUnitId, setSelectedUnitId, selectedResource, setSelectedResource, onUpdateUnit, pendingManualTargetUnitId, onBeginManualTarget, onEquipItem }) {
  const game = lobby.game;
  const teams = activeTeams(game.setup);
  const units = arrayFromObject(game.units);
  const respawns = arrayFromObject(game.respawnQueue);
  const selectedUnit = units.find((u) => u.id === selectedUnitId) || respawns.find((u) => u.id === selectedUnitId) || null;
  const carriers = units.filter((u) => u.hp > 0 && u.carryingFlagTeam);

  return (
    <aside className="side-panel fight-left-panel">
      <section className="card compact">
        <h3>Selected Info</h3>
        {selectedUnit ? (
          <UnitInfoCard lobby={lobby} unit={selectedUnit} player={player} onUpdateUnit={onUpdateUnit} onClose={() => setSelectedUnitId(null)} pendingManualTargetUnitId={pendingManualTargetUnitId} onBeginManualTarget={onBeginManualTarget} onEquipItem={onEquipItem} />
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
                <span>{teamDisplayLabel(lobby, team)}</span>
                <span>{carrier ? `${TEAM_META[carrier.team]?.name} ${carrier.name}` : "Home"}</span>
              </div>
            );
          })}
          <div className="score-list">
            {teams.map((team) => <div key={`score-${team}`} className="team-status"><span>{TEAM_META[team].emoji} Score</span><Pill>{game.ctfScores?.[team] ?? 0}/{game.setup.ctfScoreLimit ?? 3}</Pill></div>)}
          </div>
        </section>
      )}

      {(game.setup.gameMode === "king_hill") && (
        <section className="card compact">
          <h3>King of the Hill</h3>
          <p className="muted">Purple center tiles score only when uncontested.</p>
          {teams.map((team) => (
            <div key={`hill-${team}`} className="team-status">
              <span>{teamDisplayLabel(lobby, team)}</span>
              <Pill tone={game.kothController === team ? "ready" : "default"}>{Math.floor(game.kothScores?.[team] ?? 0)}/{game.setup.kothTimeLimit ?? 60}s</Pill>
            </div>
          ))}
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
            <span>{teamDisplayLabel(lobby, team)}</span>
            <Pill>{respawns.filter((u) => u.team === team).length} queued</Pill>
          </div>
        ))}
      </section>
    </aside>
  );
}

function UnitInfoCard({ lobby, unit, player, onUpdateUnit, onClose, pendingManualTargetUnitId, onBeginManualTarget, onEquipItem }) {
  const game = lobby.game;
  const canEdit = unit.team === player?.team;
  const style = styleDefinition(unit.style);
  const hpPct = Math.max(0, Math.min(100, (unit.hp / Math.max(1, maxHp(unit))) * 100));
  const accuracy = Math.round(100 * (unit.hitsLanded ?? 0) / Math.max(1, unit.attacksAttempted ?? 0));
  return (
    <div
      className={`unit-info-card ${canEdit ? "unit-info-dropzone" : ""}`}
      onDragOver={(e) => { if (canEdit && (unit.hp ?? 0) > 0 && unit.timer == null) e.preventDefault(); }}
      onDrop={(e) => {
        if (!canEdit || (unit.hp ?? 0) <= 0 || unit.timer != null) return;
        e.preventDefault();
        const fromIndex = Number(e.dataTransfer.getData("text/qb-inventory-index"));
        if (Number.isFinite(fromIndex)) onEquipItem?.(fromIndex, unit.id);
      }}
    >
      <div className="unit-info-header">
        <StyleIcon styleId={unit.style} size="lg" />
        <div>
          <h4>{unit.name}</h4>
          <p>{TEAM_META[unit.team]?.emoji} {TEAM_META[unit.team]?.name} • {style.name}</p>
        </div>
        <button className="plain-x" onClick={onClose} title="Clear selected unit">×</button>
      </div>
      <div className="large-hpbar"><div style={{ width: `${hpPct}%` }} /></div>
      {unit.timer != null && <p className="respawn-note">Respawning in {Math.max(0, Number(unit.timer || 0)).toFixed(1)}s. Orders changed here apply when it respawns.</p>}
      <div className="unit-detail-grid">
        <span>HP <b>{Math.round(unit.hp)}/{maxHp(unit)}</b></span>
        <span>Range <b>{style.range}</b></span>
        <span>Speed <b>{currentAttackLabel(unit)}</b></span>
        <span>Max hit <b>{maxDamageRoll(unit, null)}</b></span>
        <span>Damage <b>{unit.totalDamage ?? 0}</b></span>
        <span>Kills <b>{unit.kills ?? 0}</b></span>
        <span>Grabs <b>{unit.flagGrabs ?? 0}</b></span>
        <span>Caps <b>{unit.flagCaptures ?? 0}</b></span>
        <span>Accuracy <b>{accuracy}%</b></span>
        <span>Deaths <b>{unit.deathCount ?? 0}</b></span>
        {resourceTargetType(unit) && <span>Cleared <b>{unit.resourcesCleared ?? 0}</b></span>}
      </div>
      {unit.carryingFlagTeam && <div className="flag-note">🚩 Carrying {TEAM_META[unit.carryingFlagTeam]?.name || "enemy"} flag</div>}
      {unitStatusLabels(unit).length > 0 && <div className="status-chip-row">{unitStatusLabels(unit).map((label) => <Pill key={label}>{label}</Pill>)}</div>}
      {passiveText(unit.style).map((text) => <p key={text} className="unit-passive detail-passive">{text}</p>)}
      <UnitStatSummary unit={unit} />
      <div className="selected-gear-block">
        <h4>Gear</h4>
        <UnitEquipmentGrid unit={unit} readOnly={true} />
        <GearStatsPanel unit={unit} />
      </div>
      <div className="unit-control-grid">
        <label>
          Unit target
          {canEdit ? (
            <UnitTargetSelect
              lobby={lobby}
              unit={unit}
              allowManualTarget={(unit.hp ?? 0) > 0 && unit.timer == null}
              onBeginManualTarget={onBeginManualTarget}
              onChange={(targetOverride) => {
                const basePatch = {
                  targetOverride,
                  manualTargetType: null,
                  manualTargetUnitId: null,
                  manualTargetRow: null,
                  manualTargetCol: null,
                  manualResourceType: null,
                  manualGroundItemId: null,
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
                  homeTeleportPreviousManualGroundItemId: null,
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
                    homeTeleportPreviousManualGroundItemId: unit.manualGroundItemId ?? null,
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
      {canEdit && pendingManualTargetUnitId === unit.id && <p className="manual-target-note">Click an enemy unit to attack, a road/base tile to move, or any matching resource to chop/mine. Skillers now keep working toward blocked resource orders and clear matching blockers when possible.</p>}
      {canEdit && unit.targetOverride === "manual" && unit.manualTargetType && <button className="clear-manual-btn" onClick={() => onUpdateUnit(unit.id, { targetOverride: "inherit", manualTargetType: null, manualTargetUnitId: null, manualTargetRow: null, manualTargetCol: null, manualResourceType: null, manualGroundItemId: null, manualTargetStartedAt: null, manualTargetBlockedSince: null, homeTeleportStartedAt: null, homeTeleportHpAtStart: null, homeTeleportLastAttackedAtStart: null, homeTeleportPreviousTargetOverride: null, homeTeleportPreviousManualTargetType: null, homeTeleportPreviousManualTargetUnitId: null, homeTeleportPreviousManualTargetRow: null, homeTeleportPreviousManualTargetCol: null, homeTeleportPreviousManualResourceType: null, homeTeleportPreviousManualGroundItemId: null })}>Clear manual target</button>}
    </div>
  );
}

function FightPanel({ lobby, player, showStats, setShowStats, onSetOrder, selectedUnitId, onSelectUnit, onEquipItem, onInventoryContextMenu }) {
  const game = lobby.game;
  const teams = activeTeams(game.setup);
  const units = arrayFromObject(game.units);
  const respawns = arrayFromObject(game.respawnQueue);
  const myTeam = player?.team;
  const myUnits = myTeam ? units.filter((u) => u.team === myTeam) : [];
  const myRespawns = myTeam ? respawns.filter((u) => u.team === myTeam) : [];
  const [rightTab, setRightTab] = useState("units");
  const inventory = myTeam ? getTeamInventory(game, myTeam) : [];
  return (
    <aside className="side-panel fight-panel">
      <section className="card compact">
        <h3>Fight Controls</h3>
        <div className="team-status">
          <span>Fight time</span>
          <Pill>{formatDuration(game.fightTime || 0)} / {formatDuration(game.setup?.matchTimeLimit || DEFAULT_SETUP.matchTimeLimit)}</Pill>
        </div>
        <Button onClick={() => setShowStats(!showStats)} variant="primary">{showStats ? "Hide Stats" : "Stats"}</Button>
      </section>

      {myTeam && (
        <section className="card compact">
          <h3>Team Target</h3>
          <div className="target-row own-target-row">
            <span>{teamDisplayLabel(lobby, myTeam)}</span>
            <TargetControl team={myTeam} lobby={lobby} player={player} onChange={onSetOrder} />
          </div>
        </section>
      )}

      <section className="card compact">
        <h3>Teams</h3>
        {teams.map((team) => (
          <div key={team} className="team-status">
            <span>{teamDisplayLabel(lobby, team)}</span>
            <span>Base {Math.max(0, Math.round(game.bases?.[team]?.hp ?? 0))}</span>
            {(game.setup.gameMode === "king_hill") && <Pill tone={game.kothController === team ? "ready" : "default"}>Hill {Math.floor(game.kothScores?.[team] ?? 0)}/{game.setup.kothTimeLimit ?? 60}s</Pill>}
            <Pill>{units.filter((u) => u.team === team).length} alive</Pill>
          </div>
        ))}
      </section>

      {myTeam && (
        <section className="card compact">
          <div className="section-title">
            <h3>Your Units</h3>
            <div className="mini-tabs">
              <button className={rightTab === "units" ? "active" : ""} onClick={() => setRightTab("units")}>Units</button>
              <button className={rightTab === "loot" ? "active" : ""} onClick={() => setRightTab("loot")}>Loot</button>
            </div>
          </div>
          <div className="team-status fight-gold-row"><span>Current gold</span><Pill>{game.gold?.[myTeam] ?? 0}g</Pill></div>
          {rightTab === "units" ? (
            <>
              <p className="muted">Alive {myUnits.length} • Respawn {myRespawns.length}</p>
              <div className="mini-unit-list">
                {[...myUnits, ...myRespawns].slice(0, 14).map((u) => {
                  const alive = u.hp > 0 && myUnits.some((active) => active.id === u.id);
                  const pct = alive ? Math.max(0, Math.min(100, ((u.hp ?? 0) / Math.max(1, maxHp(u))) * 100)) : Math.max(0, Math.min(100, 100 * (1 - Math.max(0, Number(u.timer ?? 0)) / Math.max(1, RESPAWN_BASE_TIME + (u.deathCount ?? 1) * 3 + (u.deathCount ?? 1) * (u.deathCount ?? 1)))));
                  return (
                    <button
                      type="button"
                      className={`mini-unit mini-unit-button ${!alive ? "mini-respawning" : ""} ${selectedUnitId === u.id ? "selected-mini-unit" : ""}`}
                      key={`fight-${u.id}`}
                      onClick={() => onSelectUnit?.(u.id)}
                      onDragOver={(e) => { if (alive) e.preventDefault(); }}
                      onDrop={(e) => { if (!alive) return; e.preventDefault(); const fromIndex = Number(e.dataTransfer.getData("text/qb-inventory-index")); if (Number.isFinite(fromIndex)) onEquipItem?.(fromIndex, u.id); }}
                      title={alive ? "Select this unit. Drop loot here to quick equip." : "Select this respawning unit to queue orders"}
                    >
                      <StyleIcon styleId={u.style} />
                      <span>{u.carryingFlagTeam ? "🚩 " : ""}{u.name}</span>
                      <small>{alive ? `HP ${Math.round(u.hp)}/${maxHp(u)}` : `Respawn ${Math.max(0, u.timer ?? 0).toFixed(1)}s`}</small>
                      {unitStatusLabels(u).length > 0 && <small className="mini-status-line">{unitStatusLabels(u).join(" • ")}</small>}
                      <div className={alive ? "mini-healthbar" : "mini-deathbar"}><div style={{ width: `${pct}%` }} /></div>
                    </button>
                  );
                })}
                {myUnits.length + myRespawns.length === 0 && <p className="muted">No units bought.</p>}
              </div>
            </>
          ) : (
            <div className="fight-loot-panel">
              <p className="muted">Drag loot onto selected unit info or a unit card to equip/use it. Right-click loot to drop it under your selected unit.</p>
              <div className="inventory-grid small-inventory-grid">
                {inventory.map((entry, index) => {
                  const item = itemById(entry);
                  return (
                    <div
                      key={`fight-loot-${index}`}
                      className={`inventory-slot ${item ? "has-item" : ""}`}
                      draggable={Boolean(item)}
                      onDragStart={(e) => { if (!item) return; e.dataTransfer.setData("text/qb-inventory-index", String(index)); e.dataTransfer.effectAllowed = "move"; setInventoryDragPreview(e, entry); }}
                      onContextMenu={(e) => { if (!item) return; onInventoryContextMenu?.(e, index, entry); }}
                      title={item ? `${gearBonusSummary(entry)} • Right-click to drop under selected unit.` : "Empty loot slot"}
                    >
                      {item ? <><GearIcon item={entry} slot={item.slot} /><small>{item.name}</small>{itemQuantity(entry) > 1 && <span className="inventory-qty-badge">x{itemQuantity(entry)}</span>}<div className="inventory-tooltip"><b>{item.name}{itemQuantity(entry) > 1 ? ` x${itemQuantity(entry)}` : ""}</b><span>{gearBonusSummary(entry)}</span></div></> : <span className="empty-slot-label">{index + 1}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
    gold: results.gold,
    teams: Object.fromEntries(Object.entries(results.teamStats || {}).map(([team, stats]) => [team, { damage: stats.damage, kills: stats.kills, deaths: stats.deaths, baseDamage: stats.baseDamage, unitDamage: stats.unitDamage, flagGrabs: stats.flagGrabs, flagCaptures: stats.flagCaptures, lootGold: stats.lootGold, hillUncontestedTime: stats.hillUncontestedTime, hillContestedTime: stats.hillContestedTime }]))
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  navigator.clipboard?.writeText(encoded);
  alert("Post-game share code copied to clipboard.");
}

function ResultsView({ lobby, resetToLobby, continueRosterToLobby, isHost, onUpdateSetup }) {
  const [tab, setTab] = useState("overview");
  const [showMetrics, setShowMetrics] = useState({ damage: true, kills: true, flags: true, loot: true, hill: true, deaths: false });
  const results = lobby.game.results || summarizeResults(lobby.game, "manual");
  const teams = activeTeams(lobby.game.setup);

  const exportCsv = () => {
    const rows = results.allUnits ?? [];
    const headers = ["rank", "team", "unit_id", "name", "style", "priority", "damage", "kills", "flag_grabs", "flag_captures", "hill_uncontested_seconds", "hill_contested_seconds", "resources_cleared", "levels_gained", "deaths", "attack", "strength", "defence", "magic", "range", "prayer", "hitpoints"];
    const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const csvRows = rows.map((u, i) => [i + 1, TEAM_META[u.team]?.name, u.id, u.name, styleDefinition(u.style).name, u.priority ?? "auto", u.totalDamage ?? 0, u.kills ?? 0, u.flagGrabs ?? 0, u.flagCaptures ?? 0, Math.floor(u.hillUncontestedTime ?? 0), Math.floor(u.hillContestedTime ?? 0), u.resourcesCleared ?? 0, u.levelsGained ?? 0, u.deathCount ?? 0, ...STAT_KEYS.map((k) => u.stats?.[k]?.level ?? 1)].map(esc).join(","));
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
          <p>Reason: {results.reason} • Fight time: {formatDuration(results.fightTime)}</p>
        </div>
        <div className="action-group results-actions">
          <Button onClick={exportCsv}>Export CSV</Button>
          <Button onClick={() => copyShareCode(lobby, results)}>Copy Share Code</Button>
          {isHost && (
            <div className="continue-roster-options">
              <label className="toggle-check"><input type="checkbox" checked={Boolean(lobby.setup?.restockGoldOnContinued)} onChange={(e) => onUpdateSetup?.({ restockGoldOnContinued: e.target.checked })} /> Restock gold on continued</label>
              <label>Restock gold <input type="number" min="0" value={lobby.setup?.continuedRestockGold ?? DEFAULT_SETUP.continuedRestockGold} disabled={!lobby.setup?.restockGoldOnContinued} onChange={(e) => onUpdateSetup?.({ continuedRestockGold: Number(e.target.value) })} /></label>
            </div>
          )}
          {isHost && <Button onClick={continueRosterToLobby} variant="success">Continue Roster</Button>}
          <Button onClick={resetToLobby} variant="primary">Back to Lobby</Button>
        </div>
      </section>

      <section className="tab-bar">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
        {teams.map((team) => <button key={team} className={tab === team ? "active" : ""} onClick={() => setTab(team)}>{teamDisplayLabel(lobby, team)}</button>)}
      </section>

      {tab === "overview" ? (
        <>
          <section className="card">
            <h3>Result Graphs</h3>
            <div className="metric-toggle-row">
              {Object.keys(showMetrics).map((metric) => (
                <label key={metric} className="toggle-check"><input type="checkbox" checked={showMetrics[metric]} onChange={(e) => setShowMetrics((m) => ({ ...m, [metric]: e.target.checked }))} /> {metric}</label>
              ))}
            </div>
            <ResultsGraphs results={results} showMetrics={showMetrics} />
          </section>
          <section className="grid three">
            <div className="card">
              <h3>Bases</h3>
              {Object.entries(results.bases || {}).map(([team, hp]) => <div className="result-line" key={team}>{TEAM_META[team]?.emoji} {TEAM_META[team]?.name}: {hp}</div>)}
            </div>
            {results.gameMode === "capture_flag" && <div className="card"><h3>Flag Scores</h3>{Object.entries(results.ctfScores || {}).map(([team, score]) => <div className="result-line" key={team}>{TEAM_META[team]?.emoji} {TEAM_META[team]?.name}: {score}</div>)}</div>}
            {results.gameMode === "king_hill" && <div className="card"><h3>Hill Time</h3>{Object.entries(results.kothScores || {}).map(([team, score]) => <div className="result-line" key={team}>{TEAM_META[team]?.emoji} {TEAM_META[team]?.name}: {Math.floor(score)}s</div>)}</div>}
            <div className="card">
              <h3>Top Damage</h3>
              {(results.topDamage || []).map((u, i) => <ResultUnitLine key={u.id} unit={u} rank={i + 1} />)}
            </div>
            <div className="card">
              <h3>Top Kills</h3>
              {(results.topKills || []).map((u, i) => <ResultUnitLine key={u.id} unit={u} rank={i + 1} />)}
            </div>
          </section>
        </>
      ) : (
        <TeamResults team={tab} results={results} lobby={lobby} />
      )}
    </div>
  );
}

function ResultsGraphs({ results, showMetrics }) {
  const metrics = [
    ["damage", "Damage", (stats) => stats.damage ?? 0],
    ["kills", "Kills", (stats) => stats.kills ?? 0],
    ["flags", "Flags", (stats) => (stats.flagCaptures ?? 0) * 3 + (stats.flagGrabs ?? 0)],
    ["loot", "Loot gp", (stats) => stats.lootGold ?? 0],
    ["hill", "Hill seconds", (stats) => Math.floor((stats.hillUncontestedTime ?? 0) + (stats.hillContestedTime ?? 0))],
    ["deaths", "Deaths", (stats) => stats.deaths ?? 0],
  ].filter(([key]) => showMetrics?.[key]);
  const teamEntries = Object.entries(results.teamStats || {});
  if (!metrics.length || !teamEntries.length) return <p className="muted">Select at least one metric to display graphs.</p>;
  return (
    <div className="result-graphs">
      {metrics.map(([keyName, label, getter]) => {
        const max = Math.max(1, ...teamEntries.map(([, stats]) => getter(stats)));
        return (
          <div className="result-graph" key={keyName}>
            <h4>{label}</h4>
            {teamEntries.map(([team, stats]) => {
              const value = getter(stats);
              return (
                <div className="graph-row" key={`${keyName}-${team}`}>
                  <span>{TEAM_META[team]?.emoji} {TEAM_META[team]?.name}</span>
                  <div className="graph-bar"><div style={{ width: `${Math.max(3, Math.round((value / max) * 100))}%`, background: TEAM_META[team]?.color }} /></div>
                  <b>{value}</b>
                </div>
              );
            })}
          </div>
        );
      })}
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
      <span>{unit.flagGrabs ?? 0} grabs</span>
      <span>{unit.flagCaptures ?? 0} caps</span>
      <span>{Math.floor(unit.hillUncontestedTime ?? 0)}s hill</span>
      <span>{Math.floor(unit.hillContestedTime ?? 0)}s contested</span>
      <span>{unit.lootGold ?? 0}g loot</span>
      <span>{unit.deathCount ?? 0} deaths</span>
    </div>
  );
}

function TeamResults({ team, results, lobby }) {
  const [sortBy, setSortBy] = useState("damage");
  const rawStats = results.teamStats?.[team] || {};
  const sorters = {
    damage: (a, b) => (b.totalDamage ?? 0) - (a.totalDamage ?? 0),
    kills: (a, b) => (b.kills ?? 0) - (a.kills ?? 0),
    deaths: (a, b) => (b.deathCount ?? 0) - (a.deathCount ?? 0),
    accuracy: (a, b) => ((b.hitsLanded ?? 0) / Math.max(1, b.attacksAttempted ?? 0)) - ((a.hitsLanded ?? 0) / Math.max(1, a.attacksAttempted ?? 0)),
    levels: (a, b) => (b.levelsGained ?? 0) - (a.levelsGained ?? 0),
    flags: (a, b) => ((b.flagCaptures ?? 0) * 3 + (b.flagGrabs ?? 0)) - ((a.flagCaptures ?? 0) * 3 + (a.flagGrabs ?? 0)),
    loot: (a, b) => (b.lootGold ?? 0) - (a.lootGold ?? 0),
    hill: (a, b) => ((b.hillUncontestedTime ?? 0) + (b.hillContestedTime ?? 0)) - ((a.hillUncontestedTime ?? 0) + (a.hillContestedTime ?? 0)),
    resources: (a, b) => (b.resourcesCleared ?? 0) - (a.resourcesCleared ?? 0),
  };
  const units = arrayFromObject(rawStats.units).sort((a, b) => (sorters[sortBy] || sorters.damage)(a, b) || (b.totalDamage ?? 0) - (a.totalDamage ?? 0) || (b.kills ?? 0) - (a.kills ?? 0));
  const stats = {
    damage: rawStats.damage ?? units.reduce((s, u) => s + (u.totalDamage ?? 0), 0),
    unitDamage: rawStats.unitDamage ?? units.reduce((s, u) => s + (u.damageToUnits ?? 0), 0),
    baseDamage: rawStats.baseDamage ?? units.reduce((s, u) => s + (u.damageToBases ?? 0), 0),
    kills: rawStats.kills ?? units.reduce((s, u) => s + (u.kills ?? 0), 0),
    accuracy: rawStats.accuracy ?? Math.round(100 * units.reduce((s, u) => s + (u.hitsLanded ?? 0), 0) / Math.max(1, units.reduce((s, u) => s + (u.attacksAttempted ?? 0), 0))),
    levels: rawStats.levels ?? units.reduce((s, u) => s + (u.levelsGained ?? 0), 0),
    deaths: rawStats.deaths ?? units.reduce((s, u) => s + (u.deathCount ?? 0), 0),
    flagGrabs: rawStats.flagGrabs ?? units.reduce((s, u) => s + (u.flagGrabs ?? 0), 0),
    flagCaptures: rawStats.flagCaptures ?? units.reduce((s, u) => s + (u.flagCaptures ?? 0), 0),
    lootGold: rawStats.lootGold ?? units.reduce((s, u) => s + (u.lootGold ?? 0), 0),
    hillUncontestedTime: rawStats.hillUncontestedTime ?? units.reduce((s, u) => s + (u.hillUncontestedTime ?? 0), 0),
    hillContestedTime: rawStats.hillContestedTime ?? units.reduce((s, u) => s + (u.hillContestedTime ?? 0), 0),
  };
  return (
    <section className="card">
      <h3>{teamDisplayLabel(lobby, team)} Performance</h3>
      <div className="summary-grid">
        <Pill>Damage {stats.damage}</Pill>
        <Pill>Unit dmg {stats.unitDamage}</Pill>
        <Pill>Base dmg {stats.baseDamage}</Pill>
        <Pill>Kills {stats.kills}</Pill>
        <Pill>Accuracy {stats.accuracy}%</Pill>
        <Pill>Levels {stats.levels}</Pill>
        <Pill>Deaths {stats.deaths}</Pill>
        <Pill>Grabs {stats.flagGrabs}</Pill>
        <Pill>Captures {stats.flagCaptures}</Pill>
        <Pill>Hill uncontested {Math.floor(stats.hillUncontestedTime)}s</Pill>
        <Pill>Hill contested {Math.floor(stats.hillContestedTime)}s</Pill>
        <Pill>Loot {stats.lootGold}g</Pill>
      </div>
      <label className="sort-label">Sort units
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="damage">Damage</option>
          <option value="kills">Kills</option>
          <option value="flags">Flag grabs/captures</option>
          <option value="loot">Loot gold</option>
          <option value="hill">Hill time</option>
          <option value="accuracy">Accuracy</option>
          <option value="levels">Levels gained</option>
          <option value="resources">Resources cleared</option>
          <option value="deaths">Deaths</option>
        </select>
      </label>
      <div className="unit-table">
        {units.length === 0 && <p className="muted">No units for this team.</p>}
        {units.map((u, i) => (
          <div className="team-unit-detail" key={u.id}>
            <div className="owned-header">
              <span>#{i + 1}</span>
              <StyleIcon styleId={u.style} />
              <b>{u.name}</b>
              <span>{styleDefinition(u.style).name}</span>
              <span>{u.totalDamage ?? 0} dmg</span>
              <span>{u.damageToUnits ?? 0}/{u.damageToBases ?? 0} unit/base</span>
              <span>{u.kills ?? 0} kills</span>
              <span>{u.flagGrabs ?? 0} grabs / {u.flagCaptures ?? 0} caps</span>
              <span>{Math.floor(u.hillUncontestedTime ?? 0)}s hill / {Math.floor(u.hillContestedTime ?? 0)}s contested</span>
              <span>{u.lootGold ?? 0}g loot</span>
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
  const [cleanupStatus, setCleanupStatus] = useState("");
  const [selectedTool, setSelectedTool] = useState({ kind: "terrain", type: "road" });
  const [showStats, setShowStats] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [selectedResource, setSelectedResource] = useState(null);
  const [pendingManualTargetUnitId, setPendingManualTargetUnitId] = useState(null);
  const [visualToggles, setVisualToggles] = useState({ showHitsplats: true, showUnitNames: true });
  const [contextMenu, setContextMenu] = useState(null);

  const player = lobby?.players?.[playerId] || null;
  const isHost = lobby?.hostId === playerId;
  const game = lobby?.game;
  const phase = lobby?.phase || "home";

  useEffect(() => {
    cleanupStaleLobbies({ protectCode: lobbyCode }).then((result) => {
      if (result?.removed) setCleanupStatus(`Cleaned ${result.removed} old lobby${result.removed === 1 ? "" : "ies"} from Firebase.`);
    }).catch((err) => {
      console.warn("Lobby cleanup failed", err);
    });
  }, []);

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

  const playerExistsInLobby = Boolean(lobby?.players?.[playerId]);

  useEffect(() => {
    if (!lobbyCode || !playerId || !playerExistsInLobby) return;
    const connectedRef = ref(db, ".info/connected");
    const playerRef = ref(db, `lobbies/${lobbyCode}/players/${playerId}`);
    let heartbeatId = null;
    let disconnectReady = false;
    const writePresence = () => {
      const now = Date.now();
      return update(ref(db), {
        [`lobbies/${lobbyCode}/players/${playerId}/connected`]: true,
        [`lobbies/${lobbyCode}/players/${playerId}/lastSeen`]: now,
        [`lobbies/${lobbyCode}/lastActivityAt`]: now,
      }).catch(() => {});
    };
    const unsub = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        writePresence();
        if (!disconnectReady) {
          disconnectReady = true;
          onDisconnect(playerRef).update({ connected: false, lastSeen: serverTimestamp() });
        }
        if (!heartbeatId) heartbeatId = window.setInterval(writePresence, 12000);
      } else if (heartbeatId) {
        window.clearInterval(heartbeatId);
        heartbeatId = null;
      }
    });
    return () => {
      unsub();
      if (heartbeatId) window.clearInterval(heartbeatId);
    };
  }, [lobbyCode, playerId, playerExistsInLobby]);

  useEffect(() => {
    if (!lobby || !lobbyCode) return;
    const host = lobby.players?.[lobby.hostId];
    if (host?.connected) return;
    const lastSeen = typeof host?.lastSeen === "number" ? host.lastSeen : 0;
    const hostIsStale = !host || !lastSeen || Date.now() - lastSeen > 15000;
    if (!hostIsStale) return;
    const connected = currentPlayers(lobby).filter((p) => p.connected && p.id !== lobby.hostId);
    if (!connected.length) return;
    const nextHost = [...connected].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.id).localeCompare(String(b.id)))[0];
    if (nextHost && lobby.hostId !== nextHost.id) {
      update(ref(db, `lobbies/${lobbyCode}`), { hostId: nextHost.id, updatedAt: Date.now(), lastActivityAt: Date.now() });
    }
  }, [lobby?.hostId, lobby?.players, lobbyCode]);

  useEffect(() => {
    if (!lobby || !lobbyCode || !isHost || lobby.phase !== "fight") return;
    const interval = setInterval(async () => {
      const snap = await get(ref(db, `lobbies/${lobbyCode}`));
      const latest = snap.val();
      if (!latest || latest.phase !== "fight" || latest.hostId !== playerId) return;
      if (allVoteEndYes(latest)) {
        const results = summarizeResults(latest.game, "vote to end");
        await update(ref(db, `lobbies/${lobbyCode}`), {
          phase: "results",
          voteEnd: {},
          "game/results": results,
          "game/finished": true,
          "game/log": [`Fight ended by unanimous vote: ${results.winner || "Draw"}.`, ...(latest.game.log || [])].slice(0, 8),
        });
        return;
      }
      const nextGame = stepGame(latest.game, TICK_SECONDS);
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
          "game/kothScores": nextGame.kothScores,
          "game/kothController": nextGame.kothController,
          "game/gold": nextGame.gold,
          "game/loot": nextGame.loot,
          "game/nextNpcSpawnAt": nextGame.nextNpcSpawnAt,
          "game/nextNpcSpawnAtByStyle": nextGame.nextNpcSpawnAtByStyle,
          "game/killFeed": nextGame.killFeed,
          "game/splats": nextGame.splats,
          "game/effects": nextGame.effects,
          "game/groundItems": nextGame.groundItems,
          "game/fightTime": nextGame.fightTime,
          "game/log": [`Fight ended: ${results.winner || "Draw"}.`, ...(nextGame.log || [])].slice(0, 8),
        });
      } else {
        const gamePatch = {
          units: nextGame.units,
          respawnQueue: nextGame.respawnQueue,
          unitArchive: nextGame.unitArchive,
          bases: nextGame.bases,
          ctfScores: nextGame.ctfScores,
          kothScores: nextGame.kothScores,
          kothController: nextGame.kothController,
          gold: nextGame.gold,
          loot: nextGame.loot,
          nextNpcSpawnAt: nextGame.nextNpcSpawnAt,
          nextNpcSpawnAtByStyle: nextGame.nextNpcSpawnAtByStyle,
          killFeed: nextGame.killFeed,
          splats: nextGame.splats,
          effects: nextGame.effects,
          groundItems: nextGame.groundItems,
          fightTime: nextGame.fightTime,
          log: nextGame.log,
        };
        if (nextGame._boardDirty) gamePatch.board = nextGame.board;
        await update(ref(db, `lobbies/${lobbyCode}/game`), gamePatch);
      }
    }, FIGHT_TICK_MS);
    return () => clearInterval(interval);
  }, [lobby?.phase, lobby?.hostId, lobbyCode, playerId, isHost]);

  useEffect(() => {
    if (!selectedUnitId || !game) return;
    const selected = game.units?.[selectedUnitId] || game.respawnQueue?.[selectedUnitId];
    if (phase !== "fight" || !selected) setSelectedUnitId(null);
  }, [selectedUnitId, game?.units, game?.respawnQueue, phase]);

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

  async function runLobbyCleanup() {
    setCleanupStatus("Checking Firebase for old lobbies...");
    try {
      const result = await cleanupStaleLobbies({ protectCode: lobbyCode, force: true });
      if (result.removed) setCleanupStatus(`Cleaned ${result.removed} old lobby${result.removed === 1 ? "" : "ies"} from Firebase.`);
      else setCleanupStatus(`No old lobbies needed cleanup. Checked ${result.checked || 0}.`);
    } catch (err) {
      console.error(err);
      setCleanupStatus("Could not clean old lobbies. Check Firebase rules/network and try again.");
    }
  }

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
      cleanupStaleLobbies({ force: true }).catch((err) => console.warn("Lobby cleanup before hosting failed", err));
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
        lastActivityAt: now,
        cleanupAfterHours: STALE_LOBBY_CLEANUP_HOURS,
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
      await update(ref(db), {
        [`lobbies/${code}/players/${playerId}`]: {
          id: playerId,
          name: cleanName,
          team: existing.players?.[playerId]?.team || openTeam || null,
          connected: true,
          joinedAt: existing.players?.[playerId]?.joinedAt || now,
          lastSeen: now,
        },
        [`lobbies/${code}/kicked/${playerId}`]: null,
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
    if (lobbyCode && lobby?.players?.[playerId]) {
      await update(ref(db, `lobbies/${lobbyCode}/players/${playerId}`), { connected: false, lastSeen: Date.now() });
    }
    localStorage.removeItem("quadrants_lobby_code");
    setLobbyCode("");
    setLobby(null);
  }

  async function updateSetup(patch) {
    if (!lobby || !isHost) return;
    const restockOnly = Object.keys(patch || {}).every((key) => ["restockGoldOnContinued", "continuedRestockGold"].includes(key));
    if (lobby.phase === "results" && restockOnly) {
      const nextSetup = { ...lobby.setup, ...patch };
      await update(ref(db, `lobbies/${lobbyCode}`), {
        setup: nextSetup,
        "game/setup/restockGoldOnContinued": Boolean(nextSetup.restockGoldOnContinued),
        "game/setup/continuedRestockGold": Math.max(0, Number(nextSetup.continuedRestockGold) || 0),
        updatedAt: Date.now(),
      });
      return;
    }
    if (lobby.phase !== "lobby") return;
    const nextSetup = { ...lobby.setup, ...patch };
    nextSetup.players = clampPlayerCount(nextSetup.players);
    if (nextSetup.players >= 5) {
      nextSetup.gridSize = Math.max(30, Number(nextSetup.gridSize) || 30);
      if (!Object.prototype.hasOwnProperty.call(patch, "baseZoneSize")) nextSetup.baseZoneSize = LARGE_BASE_ZONE_SIZE;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "gridSize") && !Object.prototype.hasOwnProperty.call(patch, "baseZoneSize")) nextSetup.baseZoneSize = Number(nextSetup.gridSize) >= 20 ? LARGE_BASE_ZONE_SIZE : BASE_ZONE_SIZE;
    nextSetup.centerSize = CENTER_SIZE_OPTIONS.includes(Number(nextSetup.centerSize)) ? Number(nextSetup.centerSize) : DEFAULT_SETUP.centerSize;
    nextSetup.alliances = normalizeTeamAlliances(nextSetup);
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
      voteEnd: {},
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

  async function chooseAlliance(team, allianceId) {
    if (!lobby || lobby.phase !== "lobby" || !lobby.setup?.teamMode) return;
    const active = activeTeams(lobby.setup || DEFAULT_SETUP);
    const valid = new Set(validAllianceIds());
    if (!team || !active.includes(team) || !valid.has(allianceId)) return;
    if (!isHost && player?.team !== team) return;
    const alliances = normalizeTeamAlliances(lobby.setup);
    alliances[team] = allianceId;
    await update(ref(db), {
      [`lobbies/${lobbyCode}/setup/alliances`]: alliances,
      [`lobbies/${lobbyCode}/game/setup/alliances`]: alliances,
      [`lobbies/${lobbyCode}/ready/build`]: {},
      [`lobbies/${lobbyCode}/ready/buy`]: {},
      [`lobbies/${lobbyCode}/updatedAt`]: Date.now(),
    });
  }

  async function hostSetPlayerTeam(targetPlayerId, team) {
    if (!lobby || !isHost || lobby.phase !== "lobby") return;
    const target = lobby.players?.[targetPlayerId];
    if (!target) return;
    const active = activeTeams(lobby.setup || DEFAULT_SETUP);
    if (team && !active.includes(team)) return;
    const taken = team ? currentPlayers(lobby).some((p) => p.id !== targetPlayerId && p.team === team) : false;
    if (taken) return;
    await update(ref(db), {
      [`lobbies/${lobbyCode}/players/${targetPlayerId}/team`]: team || null,
      [`lobbies/${lobbyCode}/ready/build`]: {},
      [`lobbies/${lobbyCode}/ready/buy`]: {},
      [`lobbies/${lobbyCode}/updatedAt`]: Date.now(),
    });
  }

  async function hostKickPlayer(targetPlayerId) {
    if (!lobby || !isHost || lobby.phase !== "lobby") return;
    if (targetPlayerId === playerId) return;
    const target = lobby.players?.[targetPlayerId];
    if (!target) return;
    if (!confirm(`Remove ${target.name || "this player"} from the lobby? They can rejoin as a fresh player.`)) return;
    await update(ref(db), {
      [`lobbies/${lobbyCode}/players/${targetPlayerId}`]: null,
      [`lobbies/${lobbyCode}/ready/build/${targetPlayerId}`]: null,
      [`lobbies/${lobbyCode}/ready/buy/${targetPlayerId}`]: null,
      [`lobbies/${lobbyCode}/voteEnd/${targetPlayerId}`]: null,
      [`lobbies/${lobbyCode}/kicked/${targetPlayerId}`]: null,
      [`lobbies/${lobbyCode}/game/log`]: [`${target.name || "A player"} was removed from the lobby. They can rejoin as a fresh player.`, ...(game?.log || [])].slice(0, 8),
      [`lobbies/${lobbyCode}/updatedAt`]: Date.now(),
    });
  }

  async function hostSetHost(targetPlayerId) {
    if (!lobby || !isHost || lobby.phase !== "lobby") return;
    const target = lobby.players?.[targetPlayerId];
    if (!target) return;
    await update(ref(db, `lobbies/${lobbyCode}`), {
      hostId: targetPlayerId,
      updatedAt: Date.now(),
      "game/log": [`${target.name || "A player"} is now host.`, ...(game?.log || [])].slice(0, 8),
    });
  }

  async function startBuild() {
    if (!lobby || !isHost) return;
    const game = makeInitialGame(lobby.setup);
    const carried = arrayFromObject(lobby.continuedRoster);
    if (carried.length) {
      const active = activeTeams(lobby.setup);
      const nextUnits = carried
        .filter((u) => active.includes(u.team))
        .map((u, index) => makeUnit(u.id || `${u.team}_carry_${index}`, u.team, u.style, lobby.setup, {
          ...u,
          hp: undefined,
          row: undefined,
          col: undefined,
          cooldown: 0,
          moveTimer: 0,
          carryingFlagTeam: null,
          targetOverride: u.targetOverride === "manual" && u.manualTargetType === "follow" ? "manual" : (u.targetOverride && !["homeTeleport", "manual"].includes(u.targetOverride) ? u.targetOverride : defaultUnitTargetOverride(u.style)),
        }));
      game.units = objectFromArray(nextUnits);
      game.gold = { ...makeGold(lobby.setup), ...(lobby.carryoverGold || {}) };
      game.loot = { ...makeLoot(lobby.setup), ...(lobby.carryoverLoot || {}) };
      game.log = [`Build Phase started with continued roster on ${MAP_TEMPLATES[lobby.setup.mapTemplate || "classic"]?.name || "Classic"}.`, "Edit rules/map here; if a team is over the unit cap, sell units in Buy Phase before fighting."];
    } else {
      game.log = [`Build Phase started on ${MAP_TEMPLATES[lobby.setup.mapTemplate || "classic"]?.name || "Classic"}.`, "Each player builds their own zone. Connect every base to the neutral center before advancing."];
    }
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "build",
      game,
      ready: { build: {}, buy: {} },
      voteEnd: {},
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
  }

  async function setReady(phaseName, value) {
    if (!lobby || !player) return;
    const now = Date.now();
    await update(ref(db), {
      [`lobbies/${lobbyCode}/ready/${phaseName}/${playerId}`]: value,
      [`lobbies/${lobbyCode}/updatedAt`]: now,
      [`lobbies/${lobbyCode}/lastActivityAt`]: now,
    });
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
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
  }

  async function startFight() {
    if (!lobby || !isHost) return;
    if (!allReadyForPhase(lobby, "buy")) return;
    const teams = activeTeams(lobby.game.setup);
    const units = arrayFromObject(lobby.game.units).map(normalizeRuntimeUnit).filter((u) => u && STYLE[u.style]);
    const overLimitTeam = teams.find((team) => units.filter((u) => u.team === team).length > Number(lobby.game.setup.maxUnits || DEFAULT_SETUP.maxUnits));
    if (overLimitTeam) {
      alert(`${TEAM_META[overLimitTeam]?.name || overLimitTeam} is over the unit cap. Sell units before starting.`);
      return;
    }
    const finalizedBoard = finalizeBuildTerrain(lobby.game.board, lobby.game.setup);
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "fight",
      "game/board": finalizedBoard,
      "game/fightTime": 0,
      "game/splats": {},
      "game/effects": {},
      "game/kothScores": Object.fromEntries(activeTeams(lobby.game.setup).map((team) => [team, 0])),
      "game/kothController": null,
      "game/units": staggerUnitsForFightStart(units),
      voteEnd: {},
      "game/log": [`${GAME_MODES[lobby.game.setup.gameMode || "classic"]?.name || "Fight"} started. Host browser simulates combat; host migration continues if host disconnects.`, ...(lobby.game.log || [])].slice(0, 8),
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
  }

  async function resetToLobby() {
    if (!lobby || !isHost) return;
    const game = makeInitialGame(lobby.setup);
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "lobby",
      game,
      ready: { build: {}, buy: {} },
      continuedRoster: null,
      carryoverGold: null,
      carryoverLoot: null,
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
  }

  async function setOrder(team, target) {
    if (!lobby || !game || !canPlayerControlTarget(player, team)) return;
    const allowedTargets = ["blank", "defend", ...((game.setup?.gameMode || "classic") === "king_hill" ? ["hill"] : []), ...targetableBaseTeams(game.bases || {}, game.setup, team)];
    if (!allowedTargets.includes(target)) return;
    await update(ref(db, `lobbies/${lobbyCode}/game/orders/${team}`), { target });
  }

  async function placeTile(row, col) {
    if (!lobby || !game || lobby.phase !== "build" || !player?.team) return;
    if (readyMap(lobby, "build")[playerId]) return;
    if (selectedTool.kind === "inspect") return;
    const team = player.team;
    const cell = game.board[row][col];
    if (isCenterCell(row, col, game.setup)) return;
    if (cell.owner !== team) return;
    if (isBaseCell(row, col, game.setup)) return;
    if (isOuterTreeWallCell(row, col, cell, game.setup)) return;
    const gold = game.gold?.[team] ?? 0;
    const nextBoard = cloneBoard(game.board);
    const hadAllConnections = allTeamsConnectedToCenter(game.board, game.setup);

    if (selectedTool.kind === "sell") {
      if (!cell || cell.type === "empty" || isStarterRoad(row, col, game.setup)) return;
      const refund = TILE[cell.type]?.cost ?? 0;
      nextBoard[row][col].type = "empty";
      nextBoard[row][col].resourceHp = null;
      nextBoard[row][col].resourceMaxHp = null;
      nextBoard[row][col].regrowType = null;
      nextBoard[row][col].regrowAt = null;
      if (hadAllConnections && !allTeamsConnectedToCenter(nextBoard, game.setup)) return;
      await update(ref(db), {
        [`lobbies/${lobbyCode}/game/board/${row}/${col}/type`]: "empty",
        [`lobbies/${lobbyCode}/game/board/${row}/${col}/resourceHp`]: null,
        [`lobbies/${lobbyCode}/game/board/${row}/${col}/resourceMaxHp`]: null,
        [`lobbies/${lobbyCode}/game/board/${row}/${col}/regrowType`]: null,
        [`lobbies/${lobbyCode}/game/board/${row}/${col}/regrowAt`]: null,
        [`lobbies/${lobbyCode}/game/gold/${team}`]: gold + refund,
        [`lobbies/${lobbyCode}/game/log`]: [`${TEAM_META[team].name} sold ${TILE[cell.type]?.name || "tile"} for ${refund}g.`, ...(game.log || [])].slice(0, 8),
      });
      return;
    }

    const cost = TILE[selectedTool.type]?.cost ?? 0;
    if (gold < cost || gold - cost < BUILD_PHASE_GOLD_RESERVE) return;
    nextBoard[row][col].type = selectedTool.type;
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
    if (!style) return;
    const units = arrayFromObject(game.units);
    const owned = units.filter((u) => u.team === team).length + arrayFromObject(game.respawnQueue).filter((u) => u.team === team).length;
    if (owned >= game.setup.maxUnits) return;
    const gold = game.gold?.[team] ?? 0;
    if (gold < style.cost) return;
    const id = `${team}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const unit = makeUnit(id, team, styleId, game.setup, { name: randomUnitName(styleId), ownerPlayerId: playerId });
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/units/${id}`]: unit,
      [`lobbies/${lobbyCode}/game/gold/${team}`]: gold - style.cost,
      [`lobbies/${lobbyCode}/game/log`]: [`${player.name} bought ${unit.name}.`, ...(game.log || [])].slice(0, 8),
    });
  }

  async function removeBuyUnit(unitId) {
    if (!lobby || lobby.phase !== "buy" || !player?.team) return;
    if (readyMap(lobby, "buy")[playerId]) return;
    const unit = game.units?.[unitId];
    if (!unit || unit.team !== player.team) return;
    const refund = STYLE[unit.style]?.cost ?? 0;
    const inventory = getTeamInventory(game, player.team);
    const equipment = { ...makeDefaultEquipment(), ...(unit.equipment || {}) };
    const marketUpdates = {};
    let autoSellGold = 0;
    for (const slot of EQUIPMENT_SLOTS) {
      const equipped = equipment[slot];
      if (!equipped) continue;
      if (addInventoryEntryToArray(inventory, equipped)) {
        // returned gear was added to loot, stacking when possible
      } else {
        const market = makeMarketItem(equipped, player.team);
        if (market) marketUpdates[`lobbies/${lobbyCode}/game/marketItems/${firebaseSafeKey(market.marketId)}`] = market;
        autoSellGold += sellValueForItem(equipped);
      }
    }
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/units/${unitId}`]: null,
      [`lobbies/${lobbyCode}/game/loot/${player.team}/inventory`]: inventoryObjectFromArray(inventory),
      [`lobbies/${lobbyCode}/game/gold/${player.team}`]: (game.gold?.[player.team] ?? 0) + refund + autoSellGold,
      ...marketUpdates,
      [`lobbies/${lobbyCode}/game/log`]: [`${player.name} sold ${unit.name} for ${refund}g${autoSellGold ? ` and auto-sold overflow gear for ${autoSellGold}g` : ""}.`, ...(game.log || [])].slice(0, 8),
    });
  }


  async function buyGear(itemId) {
    if (!lobby || lobby.phase !== "buy" || !player?.team) return;
    if (readyMap(lobby, "buy")[playerId]) return;
    const item = GEAR_ITEMS[itemId];
    if (!item) return;
    const team = player.team;
    const gold = game.gold?.[team] ?? 0;
    const inventory = getTeamInventory(game, team);
    if (gold < item.cost) return;
    if (!addInventoryEntryToArray(inventory, makeInventoryItem(itemId))) return;
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/loot/${team}/inventory`]: inventoryObjectFromArray(inventory),
      [`lobbies/${lobbyCode}/game/gold/${team}`]: gold - item.cost,
      [`lobbies/${lobbyCode}/game/log`]: [`${player.name} bought ${item.name}.`, ...(game.log || [])].slice(0, 8),
    });
  }


  async function sellInventoryItem(inventoryIndex) {
    if (!lobby || lobby.phase !== "buy" || !player?.team) return;
    if (readyMap(lobby, "buy")[playerId]) return;
    const inventory = getTeamInventory(game, player.team);
    const picked = inventory[inventoryIndex];
    const item = itemById(picked);
    if (!item) return;
    const market = makeMarketItem(picked, player.team);
    if (!market) return;
    const marketKey = firebaseSafeKey(market.marketId);
    const refund = sellValueForItem(picked);
    removeOneInventoryEntry(inventory, inventoryIndex);
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/loot/${player.team}/inventory`]: inventoryObjectFromArray(inventory),
      [`lobbies/${lobbyCode}/game/marketItems/${marketKey}`]: market,
      [`lobbies/${lobbyCode}/game/gold/${player.team}`]: (game.gold?.[player.team] ?? 0) + refund,
      [`lobbies/${lobbyCode}/game/log`]: [`${player.name} sold ${item.name} to the gear shop for ${refund}g.`, ...(game.log || [])].slice(0, 8),
    });
  }

  async function buyMarketItem(marketKey) {
    if (!lobby || lobby.phase !== "buy" || !player?.team) return;
    if (readyMap(lobby, "buy")[playerId]) return;
    const shopBuy = typeof marketKey === "object" && marketKey?.shop;
    const listing = shopBuy ? { itemId: marketKey.itemId, price: marketKey.price } : game.marketItems?.[marketKey];
    const item = itemById(listing);
    if (!listing || !item) return;
    const price = Number(listing.price ?? item.cost ?? 0);
    const gold = game.gold?.[player.team] ?? 0;
    const inventory = getTeamInventory(game, player.team);
    if (gold < price) return;
    const { key: _key, marketId: _marketId, sellerTeam: _sellerTeam, listedAt: _listedAt, price: _price, ...inventoryItem } = listing;
    if (!addInventoryEntryToArray(inventory, { instanceId: inventoryItem.instanceId || makeRuntimeId("item"), itemId: inventoryItem.itemId || item.id })) return;
    const updates = {
      [`lobbies/${lobbyCode}/game/loot/${player.team}/inventory`]: inventoryObjectFromArray(inventory),
      [`lobbies/${lobbyCode}/game/gold/${player.team}`]: gold - price,
      [`lobbies/${lobbyCode}/game/log`]: [`${player.name} bought ${item.name} from the gear shop for ${price}g.`, ...(game.log || [])].slice(0, 8),
    };
    if (!shopBuy) updates[`lobbies/${lobbyCode}/game/marketItems/${marketKey}`] = null;
    await update(ref(db), updates);
  }

  async function equipInventoryItem(inventoryIndex, unitId, equipSlot = null) {
    if (!lobby || !["buy", "fight"].includes(lobby.phase) || !player?.team) return;
    if (lobby.phase === "buy" && readyMap(lobby, "buy")[playerId]) return;
    const unit = game.units?.[unitId];
    if (!unit || unit.team !== player.team) return;
    const inventory = getTeamInventory(game, player.team);
    const picked = inventory[inventoryIndex];
    const item = itemById(picked);
    if (item?.consumable === "prayerXp") {
      const patchedUnit = { ...unit, stats: JSON.parse(JSON.stringify(unit.stats || makeStats(unit.style))) };
      grantXp(patchedUnit, "prayer", item.prayerXp ?? 1);
      removeOneInventoryEntry(inventory, inventoryIndex);
      await update(ref(db), {
        [`lobbies/${lobbyCode}/game/loot/${player.team}/inventory`]: inventoryObjectFromArray(inventory),
        [`lobbies/${lobbyCode}/game/units/${unit.id}/stats`]: patchedUnit.stats,
        [`lobbies/${lobbyCode}/game/units/${unit.id}/levelsGained`]: patchedUnit.levelsGained ?? unit.levelsGained ?? 0,
        [`lobbies/${lobbyCode}/game/log`]: [`${player.name} used ${item.name} on ${unit.name} for Prayer XP.`, ...(game.log || [])].slice(0, 8),
      });
      return;
    }
    const resolvedSlot = equipSlot || item?.slot;
    if (!item || !EQUIPMENT_SLOTS.includes(resolvedSlot) || item.slot !== resolvedSlot) return;
    const equipment = { ...makeDefaultEquipment(), ...(unit.equipment || {}) };
    if (!canEquipItemToSlot(unit, item, resolvedSlot)) return;
    const nextInventory = [...inventory];
    const pickedOne = removeOneInventoryEntry(nextInventory, inventoryIndex);
    if (!pickedOne) return;
    const displaced = equipment[resolvedSlot] || null;
    equipment[resolvedSlot] = pickedOne;
    if (displaced && !addInventoryEntryToArray(nextInventory, displaced)) return;
    if (resolvedSlot === "weapon" && item.twoHanded && equipment.offHand) {
      if (!addInventoryEntryToArray(nextInventory, equipment.offHand)) return;
      equipment.offHand = null;
    }
    inventory.splice(0, inventory.length, ...nextInventory);
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/loot/${player.team}/inventory`]: inventoryObjectFromArray(inventory),
      [`lobbies/${lobbyCode}/game/units/${unitId}/equipment`]: equipment,
      [`lobbies/${lobbyCode}/game/log`]: [`${unit.name} equipped ${item.name}.`, ...(game.log || [])].slice(0, 8),
    });
  }

  async function unequipUnitItem(unitId, equipSlot) {
    if (!lobby || !["buy", "fight"].includes(lobby.phase) || !player?.team) return;
    if (lobby.phase === "buy" && readyMap(lobby, "buy")[playerId]) return;
    const unit = game.units?.[unitId];
    if (!unit || unit.team !== player.team) return;
    const equipment = { ...makeDefaultEquipment(), ...(unit.equipment || {}) };
    const equipped = equipment[equipSlot];
    if (!equipped) return;
    const inventory = getTeamInventory(game, player.team);
    if (!addInventoryEntryToArray(inventory, equipped)) return;
    equipment[equipSlot] = null;
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/loot/${player.team}/inventory`]: inventoryObjectFromArray(inventory),
      [`lobbies/${lobbyCode}/game/units/${unitId}/equipment`]: equipment,
      [`lobbies/${lobbyCode}/game/log`]: [`${unit.name} unequipped ${itemById(equipped)?.name || "gear"}.`, ...(game.log || [])].slice(0, 8),
    });
  }

  function selectedActiveOwnUnit() {
    if (!selectedUnitId || !player?.team) return null;
    const unit = game?.units?.[selectedUnitId];
    if (!unit || unit.team !== player.team || (unit.hp ?? 0) <= 0) return null;
    return unit;
  }

  function openInventoryContextMenu(event, inventoryIndex) {
    event.preventDefault();
    event.stopPropagation();
    if (!lobby || lobby.phase !== "fight" || !player?.team) return;
    const inventory = getTeamInventory(game, player.team);
    const picked = inventory[inventoryIndex];
    const item = itemById(picked);
    if (!item) return;
    const unit = selectedActiveOwnUnit();
    const canDrop = Boolean(unit);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      title: item.name,
      items: [{
        icon: "⬇️",
        label: canDrop ? `Drop under ${unit.name}` : "Select one of your living units to drop",
        disabled: !canDrop,
        action: () => dropInventoryItem(inventoryIndex),
      }],
    });
  }

  async function dropInventoryItem(inventoryIndex) {
    if (!lobby || lobby.phase !== "fight" || !player?.team) return;
    const unit = selectedActiveOwnUnit();
    if (!unit) return;
    const inventory = getTeamInventory(game, player.team);
    const picked = inventory[inventoryIndex];
    const item = itemById(picked);
    if (!item) return;
    const ground = makeGroundItem(picked, unit.row, unit.col, player.team, game?.fightTime || 0, unit.id);
    if (!ground) return;
    removeOneInventoryEntry(inventory, inventoryIndex);
    await update(ref(db), {
      [`lobbies/${lobbyCode}/game/loot/${player.team}/inventory`]: inventoryObjectFromArray(inventory),
      [`lobbies/${lobbyCode}/game/groundItems/${firebaseSafeKey(ground.id)}`]: ground,
      [`lobbies/${lobbyCode}/game/log`]: [`${unit.name} dropped ${item.name}.`, ...(game.log || [])].slice(0, 8),
    });
  }

  function openGroundItemsContextMenu(event, items, cell) {
    event.preventDefault();
    event.stopPropagation();
    if (!lobby || lobby.phase !== "fight") return;
    const unit = selectedActiveOwnUnit();
    const fightTime = game?.fightTime || 0;
    const available = (items || []).filter((entry) => itemById(entry) && groundItemRemainingSeconds(entry, fightTime) > 0);
    if (!available.length) return;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      title: `Ground items (${cell.row},${cell.col})`,
      items: available.map((entry) => ({
        icon: "🎒",
        label: `${itemLabel(entry)} • ${groundItemRemainingSeconds(entry, fightTime)}s`,
        title: unit ? `${unit.name} will path to pick this up.` : "Select one of your living units first.",
        disabled: !unit,
        action: () => orderPickupGroundItem(entry.id),
      })),
    });
  }

  async function orderPickupGroundItem(groundItemId) {
    if (!lobby || lobby.phase !== "fight") return;
    const unit = selectedActiveOwnUnit();
    if (!unit) return;
    const item = groundItemsArray(game?.groundItems).find((entry) => entry.id === groundItemId);
    if (!item || groundItemRemainingSeconds(item, game?.fightTime || 0) <= 0) return;
    await updateFightUnitConfig(unit.id, {
      targetOverride: "manual",
      manualTargetType: "groundItem",
      manualTargetUnitId: null,
      manualTargetRow: item.row,
      manualTargetCol: item.col,
      manualResourceType: null,
      manualGroundItemId: item.id,
      manualTargetStartedAt: game?.fightTime ?? 0,
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
      homeTeleportPreviousManualGroundItemId: null,
    });
    setSelectedUnitId(unit.id);
    setSelectedResource(null);
    setPendingManualTargetUnitId(null);
  }

  function openBoardContextMenu(event, cell, cellUnits = [], cellGroundItems = []) {
    event.preventDefault();
    event.stopPropagation();
    if (!lobby || lobby.phase !== "fight") return;
    const unit = selectedActiveOwnUnit();
    const setup = game?.setup || DEFAULT_SETUP;
    const fightTime = game?.fightTime || 0;
    const liveUnits = (cellUnits || []).filter((u) => (u.hp ?? 0) > 0);
    const hostileUnits = unit ? liveUnits.filter((target) => target.id !== unit.id && areHostileTeams(unit.team, target.team, setup)) : [];
    const followUnits = unit ? liveUnits.filter((target) => target.id !== unit.id && !areHostileTeams(unit.team, target.team, setup)) : [];
    const availableGround = (cellGroundItems || []).filter((entry) => itemById(entry) && groundItemRemainingSeconds(entry, fightTime) > 0);
    const unitResource = unit ? resourceTargetType(unit) : null;
    const canClear = Boolean(unit && unitResource && cell?.type === unitResource);
    const canMove = Boolean(unit && cell && canUnitStandAt(game.board, arrayFromObject(game.units), unit, cell.row, cell.col, setup, { ignoreOccupied: unit.row === cell.row && unit.col === cell.col }));
    const menuItems = [];

    menuItems.push({
      icon: "🚶",
      label: unit ? `Go to tile ${cell.row},${cell.col}` : "Select one of your living units first",
      disabled: !unit || !canMove,
      title: canMove ? "Orders the selected unit to path to this tile." : "The clicked tile is not walkable.",
      action: () => setManualTarget(unit.id, {
        manualTargetType: "tile",
        manualTargetUnitId: null,
        manualTargetRow: cell.row,
        manualTargetCol: cell.col,
        manualResourceType: null,
        manualGroundItemId: null,
      }),
    });

    menuItems.push({
      icon: "🛡️",
      label: unit ? `Hold position ${cell.row},${cell.col}` : "Select one of your living units first",
      disabled: !unit || !canMove,
      title: canMove ? "Move to this tile, attack enemies only when they enter range, then return to this tile." : "The clicked tile is not walkable.",
      action: () => setManualTarget(unit.id, {
        manualTargetType: "hold",
        manualTargetUnitId: null,
        manualTargetRow: cell.row,
        manualTargetCol: cell.col,
        manualResourceType: null,
        manualGroundItemId: null,
      }),
    });

    for (const target of hostileUnits) {
      menuItems.push({
        icon: "⚔️",
        label: `Attack ${target.name}`,
        action: () => setManualTarget(unit.id, {
          manualTargetType: "unit",
          manualTargetUnitId: target.id,
          manualTargetRow: null,
          manualTargetCol: null,
          manualResourceType: null,
          manualGroundItemId: null,
        }),
      });
    }

    for (const target of followUnits) {
      menuItems.push({
        icon: "👣",
        label: `Follow ${target.name}`,
        action: () => setManualTarget(unit.id, {
          manualTargetType: "follow",
          manualTargetUnitId: target.id,
          manualTargetRow: null,
          manualTargetCol: null,
          manualResourceType: null,
          manualGroundItemId: null,
        }),
      });
    }

    menuItems.push({
      icon: cell?.type === "rock" ? "⛏️" : "🌲",
      label: cell?.type === "rock" ? "Clear rock" : cell?.type === "tree" ? "Clear tree" : "Clear tile",
      disabled: !canClear,
      title: unit ? (canClear ? "Orders your skiller to clear this resource." : "Selected unit cannot clear this tile type.") : "Select one of your living units first.",
      action: () => setManualTarget(unit.id, {
        manualTargetType: "resource",
        manualTargetUnitId: null,
        manualTargetRow: cell.row,
        manualTargetCol: cell.col,
        manualResourceType: unitResource,
        manualGroundItemId: null,
      }),
    });

    if (availableGround.length) menuItems.push({ type: "divider" });
    for (const entry of availableGround) {
      menuItems.push({
        icon: "🎒",
        label: `Pick up ${itemLabel(entry)} • ${groundItemRemainingSeconds(entry, fightTime)}s`,
        disabled: !unit,
        title: unit ? `${unit.name} will path to this item.` : "Select one of your living units first.",
        action: () => orderPickupGroundItem(entry.id),
      });
    }

    if (!menuItems.length) return;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      title: unit ? `${unit.name} orders` : `Tile ${cell.row},${cell.col}`,
      items: menuItems,
    });
  }

  async function updateUnitConfig(unitId, patch) {
    if (!lobby || lobby.phase !== "buy") return;
    const unit = game.units?.[unitId];
    if (!unit || unit.team !== player?.team) return;
    const updates = {};
    for (const [k, v] of Object.entries(patch)) updates[`lobbies/${lobbyCode}/game/units/${unitId}/${k}`] = k === "name" ? normalizeUnitName(v, unit.name) : v;
    await update(ref(db), updates);
  }

  async function updateFightUnitConfig(unitId, patch) {
    if (!lobby || lobby.phase !== "fight") return;
    const activeUnit = game.units?.[unitId];
    const queuedUnit = game.respawnQueue?.[unitId];
    const unit = activeUnit || queuedUnit;
    if (!unit || unit.team !== player?.team) return;
    const basePath = activeUnit ? `lobbies/${lobbyCode}/game/units/${unitId}` : `lobbies/${lobbyCode}/game/respawnQueue/${unitId}`;
    const allowed = new Set(["name", "priority", "targetOverride", "manualTargetType", "manualTargetUnitId", "manualTargetRow", "manualTargetCol", "manualResourceType", "manualGroundItemId", "manualTargetStartedAt", "manualTargetBlockedSince", "homeTeleportStartedAt", "homeTeleportHpAtStart", "homeTeleportLastAttackedAtStart", "homeTeleportPreviousTargetOverride", "homeTeleportPreviousManualTargetType", "homeTeleportPreviousManualTargetUnitId", "homeTeleportPreviousManualTargetRow", "homeTeleportPreviousManualTargetCol", "homeTeleportPreviousManualResourceType", "homeTeleportPreviousManualGroundItemId"]);
    const updates = {};
    for (const [k, v] of Object.entries(patch)) {
      if (allowed.has(k)) updates[`${basePath}/${k}`] = v;
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
      manualGroundItemId: null,
      homeTeleportStartedAt: null,
      homeTeleportHpAtStart: null,
      homeTeleportLastAttackedAtStart: null,
      homeTeleportPreviousTargetOverride: null,
      homeTeleportPreviousManualTargetType: null,
      homeTeleportPreviousManualTargetUnitId: null,
      homeTeleportPreviousManualTargetRow: null,
      homeTeleportPreviousManualTargetCol: null,
      homeTeleportPreviousManualResourceType: null,
      homeTeleportPreviousManualGroundItemId: null,
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
          manualGroundItemId: null,
        });
      } else {
        await setManualTarget(pendingManualTargetUnitId, {
          manualTargetType: "tile",
          manualTargetUnitId: null,
          manualTargetRow: row,
          manualTargetCol: col,
          manualResourceType: null,
          manualGroundItemId: null,
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
      if (commander && target && areHostileTeams(commander.team, target.team, game.setup) && (target.hp ?? 0) > 0) {
        await setManualTarget(pendingManualTargetUnitId, {
          manualTargetType: "unit",
          manualTargetUnitId: unitId,
          manualTargetRow: null,
          manualTargetCol: null,
          manualResourceType: null,
          manualGroundItemId: null,
        });
      } else if (target) {
        await setManualTarget(pendingManualTargetUnitId, {
          manualTargetType: "tile",
          manualTargetUnitId: null,
          manualTargetRow: target.row,
          manualTargetCol: target.col,
          manualResourceType: null,
          manualGroundItemId: null,
        });
      }
      return;
    }
    setSelectedUnitId(unitId);
    setSelectedResource(null);
  }

  async function toggleVoteEnd(value) {
    if (!lobby || lobby.phase !== "fight") return;
    await update(ref(db, `lobbies/${lobbyCode}/voteEnd`), { [playerId]: Boolean(value) });
  }

  async function continueRosterToLobby() {
    if (!lobby || !isHost || lobby.phase !== "results") return;
    const previous = lobby.game;
    const tracked = mergeLatestUnits(arrayFromObject(previous.unitArchive), arrayFromObject(previous.respawnQueue), arrayFromObject(previous.units));
    const active = activeTeams(lobby.setup);
    const nextUnits = tracked
      .filter((u) => active.includes(u.team))
      .map((u, index) => {
        const safeStyle = safeStyleId(u.style);
        return makeUnit(u.id || `${u.team}_carry_${index}`, u.team, safeStyle, lobby.setup, {
        ...u,
        name: normalizeUnitName(u.name, styleDefinition(safeStyle).name || "Unit"),
        stats: u.stats,
        priority: u.priority,
        targetOverride: u.targetOverride === "manual" && u.manualTargetType === "follow" ? "manual" : (u.targetOverride && !["homeTeleport", "manual"].includes(u.targetOverride) ? u.targetOverride : defaultUnitTargetOverride(safeStyle)),
        ownerPlayerId: u.ownerPlayerId,
        carryingFlagTeam: null,
        maxHpSeen: Math.max(u.maxHpSeen ?? 0, u.stats?.hitpoints?.level ?? 1),
      });
      });
    const nextGame = makeInitialGame(lobby.setup);
    const carryoverGold = { ...(previous.gold || makeGold(lobby.setup)) };
    if (lobby.setup?.restockGoldOnContinued) {
      const floor = Math.max(0, Number(lobby.setup.continuedRestockGold ?? DEFAULT_SETUP.continuedRestockGold) || 0);
      for (const team of active) carryoverGold[team] = Math.max(Number(carryoverGold[team] ?? 0), floor);
    }
    nextGame.log = ["Continued roster loaded. Edit map/rules in the lobby, then start a new build. Sell units in Buy Phase if a team is over the max unit rule."];
    await update(ref(db, `lobbies/${lobbyCode}`), {
      phase: "lobby",
      game: nextGame,
      continuedRoster: objectFromArray(nextUnits),
      carryoverGold,
      carryoverLoot: previous.loot || makeLoot(lobby.setup),
      ready: { build: {}, buy: {} },
      voteEnd: {},
      updatedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
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
    return <HomeScreen name={name} setName={setName} joinCode={joinCode} setJoinCode={setJoinCode} onHost={hostLobby} onJoin={joinLobby} onCleanupLobbies={runLobbyCleanup} status={status} cleanupStatus={cleanupStatus} />;
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
  const myVoteEnd = Boolean(lobby.voteEnd?.[playerId]);
  const fightClock = game && phase === "fight" ? `${formatDuration(game.fightTime || 0)} / ${formatDuration(game.setup?.matchTimeLimit || DEFAULT_SETUP.matchTimeLimit)}` : null;
  const phaseTeams = game ? activeTeams(game.setup) : [];
  const buildCanAdvance = game ? allReadyForPhase(lobby, "build") && phaseTeams.every((team) => teamConnectedToCenter(game.board, team, game.setup)) : false;
  const buyOverLimitTeams = game ? phaseTeams.filter((team) => arrayFromObject(game.units).filter((u) => u.team === team).length > Number(game.setup.maxUnits || DEFAULT_SETUP.maxUnits)) : [];
  const buyCanAdvance = game ? allReadyForPhase(lobby, "buy") && buyOverLimitTeams.length === 0 : false;
  const myBuyOverLimit = player?.team && buyOverLimitTeams.includes(player.team);

  return (
    <div className={bodyClass}>
      <header className="topbar">
        <div>
          <h1>Quadrants Beta Online</h1>
          <p>Lobby <b>{lobby.code}</b> • {PHASES[phase]}{fightClock ? ` • ${fightClock}` : ""} • Host: {hostPlayer?.name || "migrating..."}</p>
        </div>
        <div className="top-actions">
          {phase === "fight" && (
            <div className="vote-end-box">
              <label className="toggle-check vote-toggle"><input type="checkbox" checked={myVoteEnd} onChange={(e) => toggleVoteEnd(e.target.checked)} /> Vote end</label>
              <span className="vote-mini">{activeGamePlayers(lobby).map((p) => `${p.name}:${lobby.voteEnd?.[p.id] ? "yes" : "no"}`).join(" • ")}</span>
            </div>
          )}
          <label className="toggle-check"><input type="checkbox" checked={visualToggles.showHitsplats} onChange={(e) => setVisualToggles((v) => ({ ...v, showHitsplats: e.target.checked }))} /> Hitsplats</label>
          <label className="toggle-check"><input type="checkbox" checked={visualToggles.showUnitNames} onChange={(e) => setVisualToggles((v) => ({ ...v, showUnitNames: e.target.checked }))} /> Names</label>
          <Pill tone={player.connected ? "ready" : "waiting"}>{player.name}</Pill>
          <Pill>{player.team ? teamDisplayLabel(lobby, player.team) : "Spectator"}</Pill>
          {isHost && <Pill tone="host">You are host</Pill>}
          <Button onClick={leaveLobby}>Leave</Button>
          {isHost && <Button onClick={deleteLobby}>Delete Lobby</Button>}
        </div>
      </header>

      {phase === "lobby" && (
        <main className="main-shell">
          <LobbyView lobby={lobby} playerId={playerId} isHost={isHost} onUpdateSetup={updateSetup} onStartBuild={startBuild} onChooseTeam={chooseTeam} onChooseAlliance={chooseAlliance} onLeave={leaveLobby} onHostSetPlayerTeam={hostSetPlayerTeam} onHostKickPlayer={hostKickPlayer} onHostSetHost={hostSetHost} />
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
            <BuyPanel lobby={lobby} player={player} onBuy={buyUnit} onBuyMarketItem={buyMarketItem} onSellInventoryItem={sellInventoryItem} onEquipItem={equipInventoryItem} onUnequipItem={unequipUnitItem} onUpdateUnit={updateUnitConfig} onRemoveUnit={removeBuyUnit} onReady={(v) => setReady("buy", v)} isHost={isHost} onAdvance={startFight} />
          </section>
        </main>
      )}

      {phase === "fight" && (
        <main className="fight-shell">
          <FightLeftPanel lobby={lobby} player={player} selectedUnitId={selectedUnitId} setSelectedUnitId={setSelectedUnitId} selectedResource={selectedResource} setSelectedResource={setSelectedResource} onUpdateUnit={updateFightUnitConfig} pendingManualTargetUnitId={pendingManualTargetUnitId} onBeginManualTarget={(unitId) => { setSelectedUnitId(unitId); setSelectedResource(null); setPendingManualTargetUnitId(unitId); }} onEquipItem={equipInventoryItem} />
          <section className={`board-card ${pendingManualTargetUnitId ? "manual-target-active" : ""}`}>
            {pendingManualTargetUnitId && <div className="manual-target-banner">Select target for {game?.units?.[pendingManualTargetUnitId]?.name || "unit"}: click an enemy unit to attack, a road/base tile to move, or a matching tree/rock to chop/mine.</div>}
            <BoardView lobby={lobby} player={player} selectedTool={selectedTool} onCellClick={handleFightCellClick} onUnitClick={handleFightUnitClick} selectedUnitId={selectedUnitId} selectedResource={selectedResource} visualToggles={visualToggles} onGroundItemsContextMenu={openGroundItemsContextMenu} onBoardContextMenu={openBoardContextMenu} />
            {showStats && <FightStats lobby={lobby} player={player} />}
          </section>
          <FightPanel lobby={lobby} player={player} showStats={showStats} setShowStats={setShowStats} onSetOrder={setOrder} selectedUnitId={selectedUnitId} onSelectUnit={(unitId) => { setSelectedUnitId(unitId); setSelectedResource(null); }} onEquipItem={equipInventoryItem} onInventoryContextMenu={openInventoryContextMenu} />
        </main>
      )}

      {phase === "results" && (
        <main className="main-shell">
          <ResultsView lobby={lobby} resetToLobby={resetToLobby} continueRosterToLobby={continueRosterToLobby} isHost={isHost} onUpdateSetup={updateSetup} />
        </main>
      )}
      <GameContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BONUS_KEYS,
  CONSUMABLE_EFFECTS,
  EQUIPMENT_SLOTS,
  ITEM_TYPES,
  RESOURCE_TARGETS,
  STAT_KEYS,
  UNIT_COMBAT_TYPES,
  makeDefaultContent,
} from "./content/defaultContent.js";
import "./styles.css";

const STORAGE_KEY = "quadrants_content_manager_draft_v2";
const CONTENT_MANAGER_PASSWORD = "1234qwer";
const CONTENT_MANAGER_AUTH_KEY = "quadrants_content_manager_authed";
const BASE = import.meta.env.BASE_URL || "/";
const asset = (path) => `${BASE}assets/${path}`;

function cleanId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function numberValue(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compactObject(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== "" && value != null && Number(value) !== 0));
}

function defaultStackableFor(item) {
  if (item.type === "gear") return false;
  if (item.type === "ammo" || item.type === "resource" || item.type === "consumable") return true;
  return Boolean(item.stackable);
}

function normalizeItem(item) {
  const id = cleanId(item.id || item.name || "new_item");
  const cost = Math.max(0, Math.round(numberValue(item.cost, 0)));
  const explicitSell = item.sellValue === "" || item.sellValue == null ? Math.floor(cost / 2) : Math.max(0, Math.round(numberValue(item.sellValue, Math.floor(cost / 2))));
  const type = item.type || "gear";
  return {
    id,
    name: String(item.name || id || "New Item").trim(),
    type,
    slot: item.slot || "none",
    icon: String(item.icon || `${id}.png`).trim(),
    cost,
    sellValue: explicitSell,
    stackable: type === "gear" ? false : (item.stackable == null ? defaultStackableFor({ ...item, type }) : Boolean(item.stackable)),
    twoHanded: Boolean(item.twoHanded),
    shopForSale: Boolean(item.shopForSale || item.forSaleInShop),
    shopStock: Math.max(0, Math.round(numberValue(item.shopStock ?? item.quantityStocked, 0))),
    consumable: item.consumable || "",
    prayerXp: numberValue(item.prayerXp, 0),
    effectKey: String(item.effectKey || "").trim(),
    notes: String(item.notes || "").trim(),
    bonuses: compactObject(BONUS_KEYS.reduce((acc, key) => ({ ...acc, [key]: numberValue(item.bonuses?.[key], 0) }), {})),
  };
}

function normalizeDrop(drop, index = 0) {
  const type = drop.type === "gold" ? "gold" : "item";
  const minQty = Math.max(1, Math.round(numberValue(drop.minQty, 1)));
  const maxQty = Math.max(minQty, Math.round(numberValue(drop.maxQty, drop.minQty || 1)));
  return {
    id: cleanId(drop.id || `drop_${index + 1}`) || `drop_${index + 1}`,
    type,
    itemId: type === "item" ? cleanId(drop.itemId || "") : "",
    chance: Math.max(0, Math.min(1, numberValue(drop.chance, 1))),
    minQty,
    maxQty,
  };
}

function normalizeStatBlock(stats = {}, hpFallback = 75) {
  const hp = Math.max(1, Math.round(numberValue(stats.hitpoints, hpFallback)));
  const out = STAT_KEYS.reduce((acc, key) => {
    const fallback = key === "hitpoints" ? hp : 1;
    acc[key] = Math.max(1, Math.round(numberValue(stats[key], fallback)));
    return acc;
  }, {});
  out.hitpoints = hp;
  return out;
}

function editorList(value) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value.flatMap(editorList);
  return String(value).replace(/[|\s]+/g, ',').split(',').map(cleanId).filter(Boolean);
}

function normalizeWeakness(weakness = {}, index = 0) {
  const req = weakness.requirements || {};
  const id = cleanId(weakness.id || weakness.name || ('weakness_' + (index + 1))) || ('weakness_' + (index + 1));
  return {
    id,
    name: String(weakness.name || id || ('Weakness ' + (index + 1))).trim(),
    requirements: {
      attackStyles: editorList(req.attackStyles || req.attackStyle || weakness.attackStyles || weakness.attackStyle),
      attackTags: editorList(req.attackTags || req.attackTag || weakness.attackTags || weakness.attackTag),
      equippedItemIds: editorList(req.equippedItemIds || req.equippedItemId || weakness.equippedItemIds || weakness.equippedItemId),
      equippedItemTags: editorList(req.equippedItemTags || req.equippedItemTag || weakness.equippedItemTags || weakness.equippedItemTag),
      spellIds: editorList(req.spellIds || req.spellId || weakness.spellIds || weakness.spellId),
      spellTags: editorList(req.spellTags || req.spellTag || weakness.spellTags || weakness.spellTag),
      prayers: editorList(req.prayers || req.prayer || weakness.prayers || weakness.prayer),
    },
    accuracyMultiplier: Math.max(1, numberValue(weakness.accuracyMultiplier ?? weakness.accuracyBonus, 1)),
    damageMultiplier: Math.max(1, numberValue(weakness.damageMultiplier ?? weakness.damageBonus, 1)),
  };
}

function normalizeWeaknesses(weaknesses = []) {
  return (Array.isArray(weaknesses) ? weaknesses : []).map((weakness, index) => normalizeWeakness(weakness, index));
}

function normalizeNpcAttack(attack = {}, index = 0, fallback = {}) {
  const fallbackId = "attack_" + (index + 1);
  const combatType = UNIT_COMBAT_TYPES.includes(attack.combatType) ? attack.combatType : (fallback.combatType || "melee");
  const id = cleanId(attack.id || attack.name || fallbackId) || fallbackId;
  return {
    id,
    name: String(attack.name || fallback.name || id || ("Attack " + (index + 1))).trim(),
    combatType,
    baseDamage: Math.max(0, Math.round(numberValue(attack.baseDamage, fallback.baseDamage ?? 1))),
    attackSpeed: Math.max(1, Math.round(numberValue(attack.attackSpeed ?? attack.attackTicks, fallback.attackSpeed ?? 4))),
    attackRange: Math.max(1, Math.round(numberValue(attack.attackRange ?? attack.range, fallback.attackRange ?? 1))),
    special: String(attack.special || "").trim(),
    maxMultiplier: attack.maxMultiplier === "" || attack.maxMultiplier == null ? "" : Math.max(1, numberValue(attack.maxMultiplier, 1)),
    protectedMaxMultiplier: attack.protectedMaxMultiplier === "" || attack.protectedMaxMultiplier == null ? "" : Math.max(0, numberValue(attack.protectedMaxMultiplier, 0)),
  };
}

function normalizeNpcAttacks(attacks = [], fallback = {}) {
  const list = Array.isArray(attacks) && attacks.length ? attacks : [fallback];
  return list.map((attack, index) => normalizeNpcAttack(attack, index, fallback));
}

function estimatedNpcAttackMaxHit(npc = {}, attack = {}) {
  const type = UNIT_COMBAT_TYPES.includes(attack.combatType) ? attack.combatType : (npc.combatType || "melee");
  const statKey = type === "melee" ? "strength" : type;
  const statLevel = Math.max(1, numberValue(npc.stats?.[statKey], 1));
  const baseDamage = Math.max(0, numberValue(attack.baseDamage ?? npc.baseDamage, 1));
  return Math.max(1, Math.floor(baseDamage * (0.65 + statLevel / 100)));
}

function dragonfireMaxSummary(npc = {}, attack = {}) {
  const normalMax = estimatedNpcAttackMaxHit(npc, attack);
  const unprotected = Math.floor(normalMax * numberValue(attack.maxMultiplier || 3, 3));
  const protectedMagic = Math.floor(normalMax * numberValue(attack.protectedMaxMultiplier || 1, 1));
  return " unprotected dragonfire " + unprotected + " / Protect Magic " + protectedMagic + " / anti-dragon 0";
}

function normalizeNpc(npc) {
  const id = cleanId(npc.id || npc.name || "new_npc");
  const hp = Math.max(1, Math.round(numberValue(npc.hp, npc.stats?.hitpoints || 30)));
  const stats = normalizeStatBlock(npc.stats || {}, hp);
  stats.hitpoints = hp;
  const fallbackAttack = { id: "primary", name: npc.combatType || "melee", combatType: npc.combatType || "melee", baseDamage: Math.max(0, Math.round(numberValue(npc.baseDamage, 1))), attackSpeed: Math.max(1, Math.round(numberValue(npc.attackSpeed, 4))), attackRange: Math.max(1, Math.round(numberValue(npc.attackRange, 1))) };
  const attacks = normalizeNpcAttacks(npc.attacks, fallbackAttack);
  return {
    id,
    name: String(npc.name || id || "New NPC").trim(),
    icon: String(npc.icon || `${id}.png`).trim(),
    size: Math.max(1, Math.min(3, Math.round(numberValue(npc.size, 1)))),
    combatType: npc.combatType || "melee",
    hp,
    baseDamage: Math.max(0, Math.round(numberValue(npc.baseDamage, 1))),
    attackSpeed: Math.max(1, Math.round(numberValue(npc.attackSpeed, 4))),
    attackRange: Math.max(1, Math.round(numberValue(npc.attackRange, 1))),
    spawnAmount: Math.max(0, Math.round(numberValue(npc.spawnAmount, 0))),
    spawnInterval: Math.max(10, Math.round(numberValue(npc.spawnInterval, 60))),
    maxAlive: Math.max(0, Math.round(numberValue(npc.maxAlive ?? npc.maxOnMap ?? npc.allowedOnMap, npc.spawnAmount ?? 0))),
    maxSpawns: Math.max(0, Math.round(numberValue(npc.maxSpawns ?? npc.maxPerMatch ?? npc.spawnMax, 0))),
    effectKey: String(npc.effectKey || "").trim(),
    notes: String(npc.notes || "").trim(),
    stats,
    attacks,
    weaknesses: normalizeWeaknesses(npc.weaknesses),
    drops: (npc.drops || []).map(normalizeDrop),
  };
}

function normalizeUnit(unit) {
  const id = cleanId(unit.id || unit.name || "new_unit");
  const stats = normalizeStatBlock(unit.stats || {}, unit.hp || 75);
  return {
    id,
    name: String(unit.name || id || "New Unit").trim(),
    icon: String(unit.icon || unit.file || `${id}.png`).trim(),
    combatType: UNIT_COMBAT_TYPES.includes(unit.combatType) ? unit.combatType : "melee",
    tier: Math.max(1, Math.round(numberValue(unit.tier, 1))),
    cost: Math.max(0, Math.round(numberValue(unit.cost, 10))),
    range: Math.max(1, Math.round(numberValue(unit.range, 1))),
    baseDamage: Math.max(0, Math.round(numberValue(unit.baseDamage, 1))),
    attackSpeed: Math.max(1, Math.round(numberValue(unit.attackSpeed ?? unit.attackTicks, 4))),
    resourceTarget: RESOURCE_TARGETS.includes(unit.resourceTarget) ? unit.resourceTarget : "",
    resourceDamage: Math.max(0, Math.round(numberValue(unit.resourceDamage, 0))),
    buyable: unit.buyable !== false,
    effectKey: String(unit.effectKey || "").trim(),
    notes: String(unit.notes || "").trim(),
    weaknesses: normalizeWeaknesses(unit.weaknesses),
    stats,
  };
}

function normalizeContent(content) {
  const seed = makeDefaultContent();
  return {
    schemaVersion: 1,
    exportedAt: content.exportedAt || new Date().toISOString(),
    items: (content.items || seed.items || []).map(normalizeItem),
    npcs: (content.npcs || seed.npcs || []).map(normalizeNpc),
    units: (content.units || seed.units || []).map(normalizeUnit),
  };
}

function objectById(rows) {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

function makeJsModule(content) {
  const normalized = normalizeContent({ ...content, exportedAt: new Date().toISOString() });
  const itemDefs = objectById(normalized.items);
  const npcDefs = objectById(normalized.npcs.map((npc) => ({
    ...npc,
    file: npc.icon,
    npc: true,
    range: npc.attackRange,
    attackTicks: npc.attackSpeed,
    cooldownSeconds: npc.attackSpeed * 0.5,
    baseStats: npc.stats,
  })));
  const unitDefs = objectById(normalized.units.map((unit) => ({
    ...unit,
    file: unit.icon,
    attackTicks: unit.attackSpeed,
    cooldownSeconds: unit.attackSpeed * 0.5,
    baseStats: unit.stats,
  })));
  const lootTables = Object.fromEntries(normalized.npcs.map((npc) => [npc.id, npc.drops]));
  const buyableUnitIds = normalized.units.filter((unit) => unit.buyable !== false).map((unit) => unit.id);
  return `// Generated by Quadrants Content Manager.\n// Special effects remain hard-coded in the game and should reference effectKey/unit ID when needed.\n\nexport const CONTENT_SCHEMA_VERSION = 1;\nexport const CONTENT_EXPORTED_AT = ${JSON.stringify(normalized.exportedAt)};\n\nexport const ITEM_DEFS = ${JSON.stringify(itemDefs, null, 2)};\n\nexport const NPC_DEFS = ${JSON.stringify(npcDefs, null, 2)};\n\nexport const UNIT_DEFS = ${JSON.stringify(unitDefs, null, 2)};\n\nexport const BUYABLE_UNIT_IDS = ${JSON.stringify(buyableUnitIds, null, 2)};\n\nexport const NPC_LOOT_TABLES = ${JSON.stringify(lootTables, null, 2)};\n\nexport function getItemDef(itemId) {\n  return ITEM_DEFS[itemId] || null;\n}\n\nexport function getNpcDef(npcId) {\n  return NPC_DEFS[npcId] || null;\n}\n\nexport function getUnitDef(unitId) {\n  return UNIT_DEFS[unitId] || null;\n}\n`;
}

function makeJson(content) {
  return JSON.stringify(normalizeContent({ ...content, exportedAt: new Date().toISOString() }), null, 2);
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function readDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeDefaultContent();
    return normalizeContent(JSON.parse(raw));
  } catch {
    return makeDefaultContent();
  }
}

function WeaknessEditor({ title, weaknesses = [], onChange }) {
  const rows = normalizeWeaknesses(weaknesses);
  const updateWeakness = (index, patch) => {
    onChange(rows.map((weakness, rowIndex) => rowIndex === index ? normalizeWeakness({ ...weakness, ...patch }, rowIndex) : weakness));
  };
  const updateRequirement = (index, key, value) => {
    const weakness = rows[index] || {};
    updateWeakness(index, { requirements: { ...(weakness.requirements || {}), [key]: editorList(value) } });
  };
  const addWeakness = () => onChange([...rows, normalizeWeakness({ id: 'weakness_' + (rows.length + 1), name: 'New weakness', accuracyMultiplier: 1.25, damageMultiplier: 1 }, rows.length)]);
  const deleteWeakness = (index) => onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  return (
    <div className='weakness-editor'>
      <div className='content-editor-header spaced'>
        <h3>{title}</h3>
        <button type='button' className='btn' onClick={addWeakness}>Add weakness</button>
      </div>
      {!rows.length ? <p className='muted'>No weaknesses configured.</p> : (
        <div className='loot-drop-table'>
          {rows.map((weakness, index) => (
            <div key={weakness.id + '-' + index} className='loot-drop-row'>
              <Field label='Name'><input value={weakness.name} onChange={(e) => updateWeakness(index, { name: e.target.value })} /></Field>
              <Field label='Attack styles'><input value={(weakness.requirements?.attackStyles || []).join(', ')} onChange={(e) => updateRequirement(index, 'attackStyles', e.target.value)} placeholder='magic, range' /></Field>
              <Field label='Attack tags'><input value={(weakness.requirements?.attackTags || []).join(', ')} onChange={(e) => updateRequirement(index, 'attackTags', e.target.value)} placeholder='water, dragonbane' /></Field>
              <Field label='Equipped items'><input value={(weakness.requirements?.equippedItemIds || []).join(', ')} onChange={(e) => updateRequirement(index, 'equippedItemIds', e.target.value)} placeholder='antidragonshield' /></Field>
              <Field label='Item tags'><input value={(weakness.requirements?.equippedItemTags || []).join(', ')} onChange={(e) => updateRequirement(index, 'equippedItemTags', e.target.value)} placeholder='dragonbane' /></Field>
              <Field label='Spell IDs'><input value={(weakness.requirements?.spellIds || []).join(', ')} onChange={(e) => updateRequirement(index, 'spellIds', e.target.value)} placeholder='water_bolt' /></Field>
              <Field label='Spell tags'><input value={(weakness.requirements?.spellTags || []).join(', ')} onChange={(e) => updateRequirement(index, 'spellTags', e.target.value)} placeholder='water' /></Field>
              <Field label='Prayers'><input value={(weakness.requirements?.prayers || []).join(', ')} onChange={(e) => updateRequirement(index, 'prayers', e.target.value)} placeholder='piety' /></Field>
              <Field label='Accuracy x'><NumberInput value={weakness.accuracyMultiplier || 1} min={1} step={0.05} onChange={(value) => updateWeakness(index, { accuracyMultiplier: value })} /></Field>
              <Field label='Damage x'><NumberInput value={weakness.damageMultiplier || 1} min={1} step={0.05} onChange={(value) => updateWeakness(index, { damageMultiplier: value })} /></Field>
              <button type='button' className='btn' onClick={() => deleteWeakness(index)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImageDrop({ value, preview, onPathChange, onPreviewChange, label = "Image" }) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [localPreview, setLocalPreview] = useState("");
  const objectUrlRef = useRef("");

  useEffect(() => {
    setLoadFailed(false);
    if (!preview) setLocalPreview("");
  }, [value, preview]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function handleFiles(files) {
    const file = files?.[0];
    if (!file) return;
    const safeName = file.name.replace(/\s+/g, "_");
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;
    setLoadFailed(false);
    setLocalPreview(previewUrl);
    onPreviewChange(previewUrl);
    onPathChange(safeName);
  }

  const imageSrc = localPreview || preview || (!loadFailed && value ? asset(value) : "");
  return (
    <div
      className="content-image-drop"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="content-image-preview">
        {imageSrc ? (
          <img key={imageSrc} src={imageSrc} alt="preview" onLoad={() => setLoadFailed(false)} onError={() => setLoadFailed(true)} />
        ) : (
          <span>Drop or choose image</span>
        )}
      </div>
      <label>
        {label} path
        <input
          value={value || ""}
          onChange={(e) => {
            setLoadFailed(false);
            onPathChange(e.target.value);
          }}
          placeholder="example.png or content/items/example.png"
        />
      </label>
      <input type="file" accept="image/*" onChange={(e) => handleFiles(e.target.files)} />
      {preview ? <p className="success tiny-note">Preview loaded. Copy this image into <code>public/assets</code> before using the exported file in the game.</p> : null}
      <p className="muted tiny-note">Images are exported as file paths, not Firebase data. Put image files in <code>public/assets</code>.</p>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="content-field"><span>{label}</span>{children}</label>;
}

function NumberInput({ value, onChange, min, max, step = 1 }) {
  return <input type="number" min={min} max={max} step={step} value={value ?? 0} onChange={(e) => onChange(e.target.value)} />;
}

function ContentManager({ onBack }) {
  const [content, setContent] = useState(() => readDraft());
  const [tab, setTab] = useState("items");
  const [selectedItemId, setSelectedItemId] = useState(content.items[0]?.id || "");
  const [selectedNpcId, setSelectedNpcId] = useState(content.npcs[0]?.id || "");
  const [selectedUnitId, setSelectedUnitId] = useState(content.units?.[0]?.id || "");
  const [imagePreviews, setImagePreviews] = useState({});
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [authenticated, setAuthenticated] = useState(() => sessionStorage.getItem(CONTENT_MANAGER_AUTH_KEY) === "true");

  const item = content.items.find((entry) => entry.id === selectedItemId) || content.items[0] || null;
  const npc = content.npcs.find((entry) => entry.id === selectedNpcId) || content.npcs[0] || null;
  const unit = (content.units || []).find((entry) => entry.id === selectedUnitId) || content.units?.[0] || null;

  const validation = useMemo(() => {
    const warnings = [];
    const itemIds = new Set();
    const npcIds = new Set();
    const unitIds = new Set();
    for (const entry of content.items) {
      if (!entry.id) warnings.push("An item is missing an ID.");
      if (itemIds.has(entry.id)) warnings.push(`Duplicate item ID: ${entry.id}`);
      itemIds.add(entry.id);
      if (!entry.icon) warnings.push(`${entry.name || entry.id} is missing an image path.`);
      if (entry.type === "gear" && entry.stackable) warnings.push(`${entry.name} is gear and should normally be non-stackable.`);
      if (entry.slot !== "none" && entry.type !== "gear" && entry.type !== "ammo") warnings.push(`${entry.name} has an equip slot but is not gear/ammo.`);
    }
    for (const entry of content.npcs) {
      if (!entry.id) warnings.push("An NPC is missing an ID.");
      if (npcIds.has(entry.id)) warnings.push(`Duplicate NPC ID: ${entry.id}`);
      npcIds.add(entry.id);
      if (!entry.icon) warnings.push(`${entry.name || entry.id} is missing an image path.`);
      for (const drop of entry.drops || []) {
        if (drop.type === "item" && !itemIds.has(drop.itemId)) warnings.push(`${entry.name} drops missing item ID: ${drop.itemId || "blank"}`);
        if (Number(drop.chance) <= 0 || Number(drop.chance) > 1) warnings.push(`${entry.name} has a drop chance outside 0-1.`);
      }
    }
    for (const entry of content.units || []) {
      if (!entry.id) warnings.push("A unit is missing an ID.");
      if (unitIds.has(entry.id)) warnings.push(`Duplicate unit ID: ${entry.id}`);
      unitIds.add(entry.id);
      if (!entry.icon) warnings.push(`${entry.name || entry.id} is missing an image path.`);
      if (!entry.baseDamage && !entry.resourceTarget) warnings.push(`${entry.name} has 0 base damage and no resource role.`);
    }
    return warnings;
  }, [content]);

  function updateContent(patch) {
    setContent((prev) => ({ ...prev, ...patch }));
  }

  function updateItem(id, patch) {
    const nextId = patch.id ? cleanId(patch.id) : selectedItemId;
    setContent((prev) => ({ ...prev, items: prev.items.map((entry) => entry.id === id ? normalizeItem({ ...entry, ...patch }) : entry) }));
    if (patch.id && nextId !== selectedItemId) setSelectedItemId(nextId);
  }

  function updateNpc(id, patch) {
    const nextId = patch.id ? cleanId(patch.id) : selectedNpcId;
    setContent((prev) => ({ ...prev, npcs: prev.npcs.map((entry) => entry.id === id ? normalizeNpc({ ...entry, ...patch }) : entry) }));
    if (patch.id && nextId !== selectedNpcId) setSelectedNpcId(nextId);
  }

  function updateUnit(id, patch) {
    const nextId = patch.id ? cleanId(patch.id) : selectedUnitId;
    setContent((prev) => ({ ...prev, units: (prev.units || []).map((entry) => entry.id === id ? normalizeUnit({ ...entry, ...patch }) : entry) }));
    if (patch.id && nextId !== selectedUnitId) setSelectedUnitId(nextId);
  }

  function saveDraft() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeContent(content)));
    setMessage("Saved local draft. Live/production games ignore drafts; export and commit content to src/content/defaultContent.js to make it available to every player. Local preview only works in npm dev with ?contentPreview=1.");
  }

  function resetToCurrentGameContent() {
    const fresh = makeDefaultContent();
    setContent(fresh);
    setSelectedItemId(fresh.items[0]?.id || "");
    setSelectedNpcId(fresh.npcs[0]?.id || "");
    setSelectedUnitId(fresh.units?.[0]?.id || "");
    setMessage("Reset editor to the current game content seed.");
  }

  function addItem() {
    const id = `new_item_${content.items.length + 1}`;
    const next = normalizeItem({ id, name: "New Item", type: "gear", slot: "weapon", icon: `${id}.png`, cost: 1, bonuses: {} });
    updateContent({ items: [...content.items, next] });
    setSelectedItemId(next.id);
  }

  function duplicateItem() {
    if (!item) return;
    const id = cleanId(`${item.id}_copy`);
    const next = normalizeItem({ ...item, id, name: `${item.name} Copy` });
    updateContent({ items: [...content.items, next] });
    setSelectedItemId(next.id);
  }

  function deleteItem() {
    if (!item || !confirm(`Delete item ${item.name}?`)) return;
    const nextItems = content.items.filter((entry) => entry.id !== item.id);
    updateContent({ items: nextItems });
    setSelectedItemId(nextItems[0]?.id || "");
  }

  function addNpc() {
    const id = `new_npc_${content.npcs.length + 1}`;
    const next = normalizeNpc({ id, name: "New NPC", icon: `${id}.png`, size: 1, hp: 30, spawnAmount: 0, spawnInterval: 60, maxAlive: 0, maxSpawns: 0, stats: { hitpoints: 30 }, drops: [] });
    updateContent({ npcs: [...content.npcs, next] });
    setSelectedNpcId(next.id);
  }

  function duplicateNpc() {
    if (!npc) return;
    const id = cleanId(`${npc.id}_copy`);
    const next = normalizeNpc({ ...npc, id, name: `${npc.name} Copy`, drops: (npc.drops || []).map((drop, index) => ({ ...drop, id: `${drop.id || "drop"}_${index}_copy` })) });
    updateContent({ npcs: [...content.npcs, next] });
    setSelectedNpcId(next.id);
  }

  function deleteNpc() {
    if (!npc || !confirm(`Delete NPC ${npc.name}?`)) return;
    const nextNpcs = content.npcs.filter((entry) => entry.id !== npc.id);
    updateContent({ npcs: nextNpcs });
    setSelectedNpcId(nextNpcs[0]?.id || "");
  }

  function addUnit() {
    const id = `new_unit_${(content.units || []).length + 1}`;
    const next = normalizeUnit({ id, name: "New Unit", icon: `${id}.png`, combatType: "melee", cost: 10, range: 1, baseDamage: 4, attackSpeed: 4, stats: { attack: 40, strength: 40, defence: 40, hitpoints: 75 }, buyable: true });
    updateContent({ units: [...(content.units || []), next] });
    setSelectedUnitId(next.id);
  }

  function duplicateUnit() {
    if (!unit) return;
    const id = cleanId(`${unit.id}_copy`);
    const next = normalizeUnit({ ...unit, id, name: `${unit.name} Copy` });
    updateContent({ units: [...(content.units || []), next] });
    setSelectedUnitId(next.id);
  }

  function deleteUnit() {
    if (!unit || !confirm(`Delete unit ${unit.name}?`)) return;
    const nextUnits = (content.units || []).filter((entry) => entry.id !== unit.id);
    updateContent({ units: nextUnits });
    setSelectedUnitId(nextUnits[0]?.id || "");
  }

  function updateNpcDrop(dropIndex, patch) {
    if (!npc) return;
    const drops = (npc.drops || []).map((drop, index) => index === dropIndex ? normalizeDrop({ ...drop, ...patch }, index) : drop);
    updateNpc(npc.id, { drops });
  }

  function addNpcDrop() {
    if (!npc) return;
    const firstItemId = content.items[0]?.id || "";
    const drops = [...(npc.drops || []), normalizeDrop({ id: `drop_${(npc.drops || []).length + 1}`, type: "item", itemId: firstItemId, chance: 1, minQty: 1, maxQty: 1 }, (npc.drops || []).length)];
    updateNpc(npc.id, { drops });
  }

  function deleteNpcDrop(dropIndex) {
    if (!npc) return;
    updateNpc(npc.id, { drops: (npc.drops || []).filter((_, index) => index !== dropIndex) });
  }

  function npcAttackFallback(source = npc) {
    return { id: 'primary', name: source?.combatType || 'melee', combatType: source?.combatType || 'melee', baseDamage: source?.baseDamage ?? 1, attackSpeed: source?.attackSpeed ?? 4, attackRange: source?.attackRange ?? 1 };
  }

  function npcAttacksForEditor() {
    return normalizeNpcAttacks(npc?.attacks, npcAttackFallback());
  }

  function updateNpcAttack(attackIndex, patch) {
    if (!npc) return;
    const attacks = npcAttacksForEditor().map((attack, index) => index === attackIndex ? normalizeNpcAttack({ ...attack, ...patch }, index, attack) : attack);
    const primary = attacks[0] || npcAttackFallback();
    updateNpc(npc.id, { attacks, combatType: primary.combatType, baseDamage: primary.baseDamage, attackSpeed: primary.attackSpeed, attackRange: primary.attackRange });
  }

  function addNpcAttack() {
    if (!npc) return;
    const attacks = npcAttacksForEditor();
    const next = normalizeNpcAttack({ id: 'attack_' + (attacks.length + 1), name: 'New attack', combatType: npc.combatType || 'melee', baseDamage: npc.baseDamage || 1, attackSpeed: npc.attackSpeed || 4, attackRange: npc.attackRange || 1 }, attacks.length, npcAttackFallback());
    updateNpc(npc.id, { attacks: [...attacks, next] });
  }

  function deleteNpcAttack(attackIndex) {
    if (!npc) return;
    const attacks = npcAttacksForEditor().filter((_, index) => index !== attackIndex);
    if (!attacks.length) return;
    const primary = attacks[0];
    updateNpc(npc.id, { attacks, combatType: primary.combatType, baseDamage: primary.baseDamage, attackSpeed: primary.attackSpeed, attackRange: primary.attackRange });
  }

  function importJson() {
    try {
      const parsed = JSON.parse(importText);
      const next = normalizeContent(parsed);
      setContent(next);
      setSelectedItemId(next.items[0]?.id || "");
      setSelectedNpcId(next.npcs[0]?.id || "");
      setSelectedUnitId(next.units?.[0]?.id || "");
      setMessage("Imported content JSON into the editor.");
    } catch (err) {
      setMessage(`Import failed: ${err.message}`);
    }
  }

  function copyExport(text) {
    navigator.clipboard?.writeText(text).then(() => setMessage("Copied export to clipboard."), () => setMessage("Clipboard copy failed. Use Download instead."));
  }

  const jsExport = useMemo(() => makeJsModule(content), [content]);
  const jsonExport = useMemo(() => makeJson(content), [content]);

  const listImage = (kind, entry) => imagePreviews[`${kind}:${entry.id}`] || asset(entry.icon);

  function submitPassword(event) {
    event.preventDefault();
    if (passwordInput === CONTENT_MANAGER_PASSWORD) {
      sessionStorage.setItem(CONTENT_MANAGER_AUTH_KEY, "true");
      setAuthenticated(true);
      setPasswordError("");
      setPasswordInput("");
    } else {
      setPasswordError("Incorrect password.");
    }
  }

  if (!authenticated) {
    return (
      <div className="content-manager-screen content-manager-lock-screen">
        <form className="content-manager-lock-card" onSubmit={submitPassword}>
          <h1>Content Manager Locked</h1>
          <p>Enter the content manager password to edit items, units, NPCs, and loot tables.</p>
          <label>
            Password
            <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} autoFocus />
          </label>
          {passwordError && <div className="content-manager-message danger">{passwordError}</div>}
          <div className="content-manager-actions">
            <button className="btn" type="button" onClick={onBack}>Back to game</button>
            <button className="btn btn-primary" type="submit">Unlock</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="content-manager-screen">
      <header className="content-manager-topbar">
        <div>
          <h1>Quadrants Content Manager</h1>
          <p>Create items, units, NPCs, and loot tables locally. Drafts are editor-only; live matches use the bundled content committed to GitHub so every player has the same shop/prices/stats.</p>
        </div>
        <div className="content-manager-actions">
          <button className="btn" onClick={saveDraft}>Save draft</button>
          <button className="btn" onClick={resetToCurrentGameContent}>Reset seed</button>
          <button className="btn btn-primary" onClick={onBack}>Back to game</button>
        </div>
      </header>

      <div className="content-manager-tabs">
        <button className={tab === "items" ? "active" : ""} onClick={() => setTab("items")}>Items</button>
        <button className={tab === "units" ? "active" : ""} onClick={() => setTab("units")}>Units</button>
        <button className={tab === "npcs" ? "active" : ""} onClick={() => setTab("npcs")}>NPCs</button>
        <button className={tab === "export" ? "active" : ""} onClick={() => setTab("export")}>Export / Import</button>
      </div>

      {message && <div className="content-manager-message">{message}</div>}
      <div className="content-manager-message warning">
        Content Manager drafts do not affect live gameplay. Export your changes and commit them to the project to make shop items, prices, units, NPCs, and loot tables identical for all players.
      </div>

      <main className="content-manager-layout">
        {tab === "items" && (
          <>
            <aside className="content-list-card">
              <div className="content-list-header"><h2>Items</h2><button className="btn" onClick={addItem}>Add</button></div>
              {content.items.map((entry) => (
                <button key={entry.id} className={`content-list-row ${entry.id === selectedItemId ? "active" : ""}`} onClick={() => setSelectedItemId(entry.id)}>
                  <img src={listImage("item", entry)} alt="" onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  <span>{entry.name}</span>
                  <small>{entry.shopForSale ? `shop ${entry.shopStock ? `x${entry.shopStock}` : "∞"}` : (entry.slot || entry.type)}</small>
                </button>
              ))}
            </aside>
            <section className="content-editor-card">
              {!item ? <p>No item selected.</p> : (
                <>
                  <div className="content-editor-header">
                    <h2>Edit Item</h2>
                    <div className="action-group"><button className="btn" onClick={duplicateItem}>Duplicate</button><button className="btn" onClick={deleteItem}>Delete</button></div>
                  </div>
                  <div className="content-editor-grid">
                    <div className="content-form-grid">
                      <Field label="ID"><input value={item.id} onChange={(e) => updateItem(item.id, { id: e.target.value })} /></Field>
                      <Field label="Name"><input value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} /></Field>
                      <Field label="Type"><select value={item.type} onChange={(e) => updateItem(item.id, { type: e.target.value, stackable: e.target.value === "gear" ? false : item.stackable })}>{ITEM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                      <Field label="Equip slot"><select value={item.slot} onChange={(e) => updateItem(item.id, { slot: e.target.value })}>{EQUIPMENT_SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></Field>
                      <Field label="Value / cost"><NumberInput value={item.cost} min={0} onChange={(value) => updateItem(item.id, { cost: value })} /></Field>
                      <Field label="Sell value"><NumberInput value={item.sellValue} min={0} onChange={(value) => updateItem(item.id, { sellValue: value })} /></Field>
                      <Field label="Consumable"><select value={item.consumable || ""} onChange={(e) => updateItem(item.id, { consumable: e.target.value })}>{CONSUMABLE_EFFECTS.map((effect) => <option key={effect || "none"} value={effect}>{effect || "none"}</option>)}</select></Field>
                      <Field label="Prayer XP"><NumberInput value={item.prayerXp || 0} min={0} step={0.1} onChange={(value) => updateItem(item.id, { prayerXp: value })} /></Field>
                      <label className="toggle-check"><input type="checkbox" disabled={item.type === "gear"} checked={Boolean(item.stackable)} onChange={(e) => updateItem(item.id, { stackable: e.target.checked })} /> Stackable{item.type === "gear" ? " (gear is forced off)" : ""}</label>
                      <label className="toggle-check"><input type="checkbox" checked={Boolean(item.twoHanded)} onChange={(e) => updateItem(item.id, { twoHanded: e.target.checked })} /> Two-handed</label>
                      <label className="toggle-check"><input type="checkbox" checked={Boolean(item.shopForSale)} onChange={(e) => updateItem(item.id, { shopForSale: e.target.checked })} /> For sale in shop?</label>
                      <Field label="Quantity stocked"><NumberInput value={item.shopStock || 0} min={0} onChange={(value) => updateItem(item.id, { shopStock: value })} /></Field>
                      <p className="muted tiny-note content-shop-note">Shop stock: 0 means infinite stock. Finite stock is per match.</p>
                      <Field label="Effect key"><input value={item.effectKey || ""} onChange={(e) => updateItem(item.id, { effectKey: e.target.value })} placeholder="hard-coded special effect key" /></Field>
                      <Field label="Notes"><textarea value={item.notes || ""} onChange={(e) => updateItem(item.id, { notes: e.target.value })} /></Field>
                    </div>
                    <ImageDrop value={item.icon} preview={imagePreviews[`item:${item.id}`]} onPathChange={(value) => updateItem(item.id, { icon: value })} onPreviewChange={(value) => setImagePreviews((prev) => ({ ...prev, [`item:${item.id}`]: value }))} />
                  </div>
                  <h3>Equipment bonuses</h3>
                  <div className="bonus-grid">
                    {BONUS_KEYS.map((key) => (
                      <Field key={key} label={key}><NumberInput value={item.bonuses?.[key] || 0} onChange={(value) => updateItem(item.id, { bonuses: { ...(item.bonuses || {}), [key]: value } })} /></Field>
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {tab === "units" && (
          <>
            <aside className="content-list-card">
              <div className="content-list-header"><h2>Units</h2><button className="btn" onClick={addUnit}>Add</button></div>
              {(content.units || []).map((entry) => (
                <button key={entry.id} className={`content-list-row ${entry.id === selectedUnitId ? "active" : ""}`} onClick={() => setSelectedUnitId(entry.id)}>
                  <img src={listImage("unit", entry)} alt="" onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  <span>{entry.name}</span>
                  <small>{entry.cost}g • {entry.combatType}</small>
                </button>
              ))}
            </aside>
            <section className="content-editor-card">
              {!unit ? <p>No unit selected.</p> : (
                <>
                  <div className="content-editor-header">
                    <h2>Edit Unit</h2>
                    <div className="action-group"><button className="btn" onClick={duplicateUnit}>Duplicate</button><button className="btn" onClick={deleteUnit}>Delete</button></div>
                  </div>
                  <div className="content-editor-grid">
                    <div className="content-form-grid">
                      <Field label="ID"><input value={unit.id} onChange={(e) => updateUnit(unit.id, { id: e.target.value })} /></Field>
                      <Field label="Name"><input value={unit.name} onChange={(e) => updateUnit(unit.id, { name: e.target.value })} /></Field>
                      <Field label="Combat type"><select value={unit.combatType} onChange={(e) => updateUnit(unit.id, { combatType: e.target.value })}>{UNIT_COMBAT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                      <Field label="Tier"><NumberInput value={unit.tier} min={1} onChange={(value) => updateUnit(unit.id, { tier: value })} /></Field>
                      <Field label="Cost"><NumberInput value={unit.cost} min={0} onChange={(value) => updateUnit(unit.id, { cost: value })} /></Field>
                      <Field label="Attack range"><NumberInput value={unit.range} min={1} onChange={(value) => updateUnit(unit.id, { range: value })} /></Field>
                      <Field label="Base damage"><NumberInput value={unit.baseDamage} min={0} onChange={(value) => updateUnit(unit.id, { baseDamage: value })} /></Field>
                      <Field label="Attack speed"><NumberInput value={unit.attackSpeed} min={1} onChange={(value) => updateUnit(unit.id, { attackSpeed: value })} /></Field>
                      <Field label="Resource role"><select value={unit.resourceTarget || ""} onChange={(e) => updateUnit(unit.id, { resourceTarget: e.target.value })}>{RESOURCE_TARGETS.map((target) => <option key={target || "none"} value={target}>{target || "none"}</option>)}</select></Field>
                      <Field label="Resource damage"><NumberInput value={unit.resourceDamage || 0} min={0} onChange={(value) => updateUnit(unit.id, { resourceDamage: value })} /></Field>
                      <label className="toggle-check"><input type="checkbox" checked={unit.buyable !== false} onChange={(e) => updateUnit(unit.id, { buyable: e.target.checked })} /> Buyable in unit shop</label>
                      <Field label="Effect key"><input value={unit.effectKey || ""} onChange={(e) => updateUnit(unit.id, { effectKey: e.target.value })} placeholder="hard-coded special effect key" /></Field>
                      <Field label="Notes"><textarea value={unit.notes || ""} onChange={(e) => updateUnit(unit.id, { notes: e.target.value })} /></Field>
                    </div>
                    <ImageDrop value={unit.icon} preview={imagePreviews[`unit:${unit.id}`]} onPathChange={(value) => updateUnit(unit.id, { icon: value })} onPreviewChange={(value) => setImagePreviews((prev) => ({ ...prev, [`unit:${unit.id}`]: value }))} />
                  </div>
                  <h3>Unit stats</h3>
                  <div className="bonus-grid stat-grid">
                    {STAT_KEYS.map((key) => (
                      <Field key={key} label={key}><NumberInput value={unit.stats?.[key] || 1} min={1} onChange={(value) => updateUnit(unit.id, { stats: { ...(unit.stats || {}), [key]: value } })} /></Field>
                    ))}
                  </div>
                  <WeaknessEditor title="Unit weaknesses" weaknesses={unit.weaknesses || []} onChange={(weaknesses) => updateUnit(unit.id, { weaknesses })} />
                </>
              )}
            </section>
          </>
        )}

        {tab === "npcs" && (
          <>
            <aside className="content-list-card">
              <div className="content-list-header"><h2>NPCs</h2><button className="btn" onClick={addNpc}>Add</button></div>
              {content.npcs.map((entry) => (
                <button key={entry.id} className={`content-list-row ${entry.id === selectedNpcId ? "active" : ""}`} onClick={() => setSelectedNpcId(entry.id)}>
                  <img src={listImage("npc", entry)} alt="" onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                  <span>{entry.name}</span>
                  <small>{entry.size}x{entry.size}</small>
                </button>
              ))}
            </aside>
            <section className="content-editor-card">
              {!npc ? <p>No NPC selected.</p> : (
                <>
                  <div className="content-editor-header">
                    <h2>Edit NPC</h2>
                    <div className="action-group"><button className="btn" onClick={duplicateNpc}>Duplicate</button><button className="btn" onClick={deleteNpc}>Delete</button></div>
                  </div>
                  <div className="content-editor-grid">
                    <div className="content-form-grid">
                      <Field label="ID"><input value={npc.id} onChange={(e) => updateNpc(npc.id, { id: e.target.value })} /></Field>
                      <Field label="Name"><input value={npc.name} onChange={(e) => updateNpc(npc.id, { name: e.target.value })} /></Field>
                      <Field label="Size"><select value={npc.size} onChange={(e) => updateNpc(npc.id, { size: e.target.value })}><option value={1}>1x1</option><option value={2}>2x2</option><option value={3}>3x3</option></select></Field>
                      <Field label="Combat type"><select value={npc.combatType} onChange={(e) => updateNpc(npc.id, { combatType: e.target.value })}>{UNIT_COMBAT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                      <Field label="HP"><NumberInput value={npc.hp} min={1} onChange={(value) => updateNpc(npc.id, { hp: value, stats: { ...(npc.stats || {}), hitpoints: value } })} /></Field>
                      <Field label="Base damage"><NumberInput value={npc.baseDamage} min={0} onChange={(value) => updateNpc(npc.id, { baseDamage: value })} /></Field>
                      <Field label="Attack speed"><NumberInput value={npc.attackSpeed} min={1} onChange={(value) => updateNpc(npc.id, { attackSpeed: value })} /></Field>
                      <Field label="Attack range"><NumberInput value={npc.attackRange} min={1} onChange={(value) => updateNpc(npc.id, { attackRange: value })} /></Field>
                      <Field label="Amount per spawn"><NumberInput value={npc.spawnAmount} min={0} onChange={(value) => updateNpc(npc.id, { spawnAmount: value })} /></Field>
                      <Field label="Allowed on map at a time"><NumberInput value={npc.maxAlive || 0} min={0} onChange={(value) => updateNpc(npc.id, { maxAlive: value })} /></Field>
                      <Field label="Seconds until respawn"><NumberInput value={npc.spawnInterval} min={10} onChange={(value) => updateNpc(npc.id, { spawnInterval: value })} /></Field>
                      <Field label="Number of respawns per match"><NumberInput value={npc.maxSpawns || 0} min={0} onChange={(value) => updateNpc(npc.id, { maxSpawns: value })} /></Field>
                      <Field label="Effect key"><input value={npc.effectKey || ""} onChange={(e) => updateNpc(npc.id, { effectKey: e.target.value })} placeholder="hard-coded behavior key" /></Field>
                      <Field label="Notes"><textarea value={npc.notes || ""} onChange={(e) => updateNpc(npc.id, { notes: e.target.value })} /></Field>
                    </div>
                    <ImageDrop value={npc.icon} preview={imagePreviews[`npc:${npc.id}`]} onPathChange={(value) => updateNpc(npc.id, { icon: value })} onPreviewChange={(value) => setImagePreviews((prev) => ({ ...prev, [`npc:${npc.id}`]: value }))} />
                  </div>
                  <h3>NPC stats</h3>
                  <div className="bonus-grid stat-grid">
                    {STAT_KEYS.map((key) => (
                      <Field key={key} label={key}><NumberInput value={npc.stats?.[key] || 1} min={1} onChange={(value) => updateNpc(npc.id, { stats: { ...(npc.stats || {}), [key]: value }, ...(key === "hitpoints" ? { hp: value } : {}) })} /></Field>
                    ))}
                  </div>
                  <div className='content-editor-header spaced'>
                    <h3>NPC attacks</h3>
                    <button className='btn' onClick={addNpcAttack}>Add attack</button>
                  </div>
                  <div className='loot-drop-table'>
                    {npcAttacksForEditor().map((attack, index) => (
                      <div key={attack.id + '-' + index} className='loot-drop-row'>
                        <Field label='Name'><input value={attack.name} onChange={(e) => updateNpcAttack(index, { name: e.target.value })} /></Field>
                        <Field label='Type'><select value={attack.combatType} onChange={(e) => updateNpcAttack(index, { combatType: e.target.value })}>{UNIT_COMBAT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                        <Field label='Base damage'><NumberInput value={attack.baseDamage} min={0} onChange={(value) => updateNpcAttack(index, { baseDamage: value })} /></Field>
                        <Field label='Attack speed'><NumberInput value={attack.attackSpeed} min={1} onChange={(value) => updateNpcAttack(index, { attackSpeed: value })} /></Field>
                        <Field label='Range'><NumberInput value={attack.attackRange} min={1} onChange={(value) => updateNpcAttack(index, { attackRange: value })} /></Field>
                        <Field label='Special'><input value={attack.special || ''} onChange={(e) => updateNpcAttack(index, { special: e.target.value })} placeholder='dragonfire' /></Field>
                        <Field label='Max multiplier'><NumberInput value={attack.maxMultiplier || 1} min={1} onChange={(value) => updateNpcAttack(index, { maxMultiplier: value })} /></Field>
                        <Field label='Protected max'><NumberInput value={attack.protectedMaxMultiplier || 0} min={0} onChange={(value) => updateNpcAttack(index, { protectedMaxMultiplier: value })} /></Field>
                        <small>Estimated max hit: <b>{estimatedNpcAttackMaxHit(npc, attack)}</b>{attack.special === 'dragonfire' ? dragonfireMaxSummary(npc, attack) : ''}</small>
                        <button className='btn' disabled={npcAttacksForEditor().length <= 1} onClick={() => deleteNpcAttack(index)}>Remove</button>
                      </div>
                    ))}
                  </div>
                  <WeaknessEditor title="NPC weaknesses" weaknesses={npc.weaknesses || []} onChange={(weaknesses) => updateNpc(npc.id, { weaknesses })} />
                  <div className='content-editor-header spaced'>
                    <h3>Loot table</h3>
                    <button className='btn' onClick={addNpcDrop}>Add drop</button>
                  </div>
                  <div className="loot-drop-table">
                    {(npc.drops || []).map((drop, index) => (
                      <div key={`${drop.id}-${index}`} className="loot-drop-row">
                        <Field label="Type"><select value={drop.type} onChange={(e) => updateNpcDrop(index, { type: e.target.value })}><option value="item">item</option><option value="gold">gold</option></select></Field>
                        {drop.type === "item" ? <Field label="Item"><select value={drop.itemId} onChange={(e) => updateNpcDrop(index, { itemId: e.target.value })}>{content.items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field> : <Field label="Item"><input disabled value="Gold" /></Field>}
                        <Field label="Chance"><NumberInput value={drop.chance} min={0} max={1} step={0.01} onChange={(value) => updateNpcDrop(index, { chance: value })} /></Field>
                        <Field label="Min qty"><NumberInput value={drop.minQty} min={1} onChange={(value) => updateNpcDrop(index, { minQty: value })} /></Field>
                        <Field label="Max qty"><NumberInput value={drop.maxQty} min={1} onChange={(value) => updateNpcDrop(index, { maxQty: value })} /></Field>
                        <button className="btn" onClick={() => deleteNpcDrop(index)}>Remove</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          </>
        )}

        {tab === "export" && (
          <section className="content-editor-card export-card full-span">
            <h2>Export / Import</h2>
            <div className="content-info-grid">
              <div className="content-info-box"><b>{content.items.length}</b><span>items</span></div>
              <div className="content-info-box"><b>{content.units?.length || 0}</b><span>units</span></div>
              <div className="content-info-box"><b>{content.npcs.length}</b><span>NPCs</span></div>
              <div className="content-info-box"><b>{validation.length}</b><span>warnings</span></div>
            </div>
            <div className="content-warning-box">
              <h3>Content pack note</h3>
              <p>Definitions and images stay as static repo files. Exported JSON/JS now supports NPC attack arrays for bosses and special attacks.</p>
            </div>
            <div className="content-warning-box">
              <h3>Testing local changes</h3>
              <p>Use <b>Save draft</b>, then refresh the game tab. This browser will use your local saved content pack for item definitions and basic unit/NPC stat overrides. Hard-coded specials still require code support.</p>
            </div>
            {validation.length > 0 && (
              <div className="content-warning-box danger">
                <h3>Validation warnings</h3>
                <ul>{validation.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
              </div>
            )}
            <div className="export-actions">
              <button className="btn btn-primary" onClick={() => downloadText("quadrants-content.generated.js", jsExport, "text/javascript")}>Download JS module</button>
              <button className="btn" onClick={() => copyExport(jsExport)}>Copy JS module</button>
              <button className="btn" onClick={() => downloadText("quadrants-content.json", jsonExport, "application/json")}>Download JSON</button>
              <button className="btn" onClick={() => copyExport(jsonExport)}>Copy JSON</button>
            </div>
            <div className="export-grid">
              <label>
                Generated JS preview
                <textarea readOnly value={jsExport} />
              </label>
              <label>
                Import JSON
                <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste quadrants-content.json here" />
                <button className="btn" onClick={importJson}>Import pasted JSON</button>
              </label>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default ContentManager;

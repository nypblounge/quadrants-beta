# Quadrants Beta Online v2.0 Experimental

GitHub Pages + Firebase Realtime Database multiplayer build.

## Run locally

```bash
npm install
npm run dev
```

## New in v2.0

- Added Dharok's Greataxe unit with missing-HP max-hit scaling.
- Added Capture the Flag game mode.
- Added map templates: Classic Quadrants, River Cross, Fortress Mid, Open Field.
- Added CTF score tracking and flag-carrier display.
- Added fight sidebar flag scores and kill feed.
- Added spectator team option.
- Added post-game share code copy button.
- Added build path preview from each player's base.
- Added attack range preview on unit hover.
- Added richer unit hover browser tooltips.
- Added real max-hit preview in the shop.
- Added more aggro rules: highest damage dealer and lowest defence.
- Expanded post-game stats with unit/base damage and accuracy.

## Deploy

Push to `main`. The included GitHub Actions workflow builds and deploys to GitHub Pages.


## v2.1 quick fixes

- Fixed Buy Phase crash caused by an accidental Spectator button inside unit stat summaries.
- Build path preview now only highlights the active player's own/neutral visible roads and will not reveal connected enemy paths.
- Replaced Dharok's asset with the smaller uploaded PNG.
- Added a favicon to avoid the browser 404 noise.

## v2.2 patch notes

- Added a clearer flag icon overlay on units that are carrying an enemy flag.
- In Capture the Flag, units now prioritize killing the enemy unit carrying their own team's flag.
- Buy Phase now opens as a larger overlay over the map instead of being squeezed into the right sidebar.
- Attack range preview now respects line of sight and does not highlight walls/void/empty blocking tiles.
- Build path preview is stricter about not traversing or highlighting enemy base/path information.


## v2.3 changes

- Buy phase shop cards are sorted by cost, then name.
- Buy phase cards show attack speed in ticks and seconds.
- Ancient Staff shop card now explicitly shows the 3x3 splash passive and range accuracy penalty.
- Capture the Flag scoring now requires the carrier to return onto their own base tile. Touching beside the home base no longer scores.
- Flag carriers path directly onto their own base tile while carrying a flag.


## v2.4 patch notes

- Added Dharok's Greataxe to the Buy Phase unit roster.
- Fixed Capture the Flag so each team's flag can only be carried by one living unit at a time.
- Flags reset to home when the carrier dies or loses respawn eligibility.


## v2.7 Resource Patch

- Added buildable Trees and Rocks tiles. Trees block pathing and line of sight; Rocks block pathing but not line of sight.
- Added Woodcutter and Miner units. They target enemy Trees/Rocks, clear them into dirt roads for 30 seconds, then the resource regrows.
- Added 20x20 and 25x25 map sizes.

## v2.8 resource targeting fixes

- Woodcutter and Miner default resource targeting is stronger.
- Enemy resource ownership is recalculated from map quadrant data when needed.
- Trees and rocks now have 30 HP once chopping/mining starts.
- Resource health bars display on damaged trees/rocks.
- Fight simulation syncs board resource HP/clearing/regrowth back to Firebase during combat.

## v2.9 patch notes

- Empty/void tiles are filled for free with random Water, Trees, or Rocks when Build Phase is finalized.
- Woodcutters and Miners can manually target a specific enemy Tree/Rock with the Select tile/unit/resource command.
- The selected unit's current target is highlighted on the board.
- Tree/Rock regrow timers now scale upward each time the same tile is cleared.

## v3.1 patch notes

- Auto Woodcutter/Miner resource targeting now only selects reachable enemy-zone Trees/Rocks.
- Manual skiller targeting can now select matching Trees/Rocks in any zone, including your own team zone.
- Added Home teleport for selected units: channels for 5 seconds, returns the unit to its base, restores the unit's previous orders, and is interrupted by incoming attacks.
- Selected unit target preview now highlights Home teleport destinations and still highlights manual/auto resource targets.


## v3.7.1

- Ready buttons moved into phase side panels with larger player-ready cards.
- Added Cape of Skulls to the gear shop.
- Added optional NPC spawns setting and Goblin NPC center spawns.
- Goblins drop 1-10 gold, Bronze Med Helm, or Bones. Bones can be dragged onto units for Prayer XP.
- Board gap reduced, tiles are square, and unit health rings are thinner.
- Team Target label cleaned up.


## v3.7.1

- Goblin loot now always gives Bones, plus a separate roll for either gold or Bronze Med Helm.

## v3.8.1 notes

- Lobby settings now use tabs: Match Settings, NPC List, and Custom Effects.
- Added Team Mode toggle. First pass teams are Red+Green vs Blue+Purple for 4P, Red+Green vs Blue for 3P, and normal Red vs Blue for 2P.
- NPC list now has a Goblin spawn amount setting. Goblins spawn near center on the 1-minute wave up to the configured amount.
- Added per-unit target option: Closest NPC.
- Buy Phase unit cards are collapsible and show equipment-aware max hit.
- Fight phase Your Units section shows current gold.
- Loot awarded during fights is explicitly preserved into the team Loot tab.


## v3.8.1

- Fixed Firebase presence loop that could cause React maximum update depth errors after joining lobbies.
- Presence writes are now throttled with a heartbeat instead of retriggering on every lobby snapshot.


## v3.9
- Thinner unit health rings.
- Team/color labels now show player names when slots are filled.
- NPC loot inventory sync fixes for the fight Loot tab.
- Configurable NPC spawn rate in the NPC List tab.
- Build Phase shows your center connection status.
- Cape of Skulls is unlimited shop stock while player-sold items remain limited market stock.

## v3.16 arena test build

- Experimental support for 5–8 active player slots.
- 8-player layout uses 3 bases on the top row, 2 in the middle row, and 3 on the bottom row.
- 5+ player games automatically use at least a 30x30 arena and 5x5 base zones.
- Added new player colors: Orange, Yellow, Pink, and Cyan.
- Added board pan/zoom controls: scroll wheel zooms, middle mouse drag pans, and Reset restores the default view.
- Source zip intentionally omits package-lock.json so local installs use your normal npm registry.

## Content Manager

This build includes a local content manager for preparing item and NPC definitions without storing bulky data in Firebase.

Open it from the home screen with **Content Manager**, or go directly to:

```text
/#content-manager
```

The manager can edit:

- item IDs, names, values, stackability, slots, bonuses, consumable keys, and image paths
- NPC IDs, names, image paths, size, stats, base damage, attack speed, attack range, spawn amount/rate, and loot tables
- loot table chances and quantity ranges

Exports are static JS/JSON files. Keep images in `public/assets` and use short IDs like `itemId` and `npcId` in Firebase match data.

## v3.32 default content pack

- Updated the default Content Manager seed from `quadrants-content (2).json`.
- Added bundled assets for new gear and NPCs.
- Added dynamic NPC spawn controls for every NPC in the content pack.
- Added large NPC rendering support beyond 2x2, including 3x3 NPCs.

## v3.44 local tweaks

- NPC pending spawn markers now respect the per-match spawn cap, so the pentagram warning does not appear when a capped NPC can no longer spawn.
- Content Manager now requires the password `1234qwer` before opening in the browser session.
- Buy Phase unit stat grids are compacted into 2-3 columns depending on viewport width.
- Buy Phase **Gear** tab is renamed to **Shop**.
- Shop items are collapsible. The compact row shows name, type, price, slot, and stock; expanding shows stats/notes and the buy button.
- Fight sync now skips unchanged game subtrees in regular tick updates instead of rewriting every child every tick.

## v3.46 NPC tracker and cap hardening

- Fight Phase now shows an **NPC Tracker** in the left panel when NPC spawns are enabled.
- The tracker shows alive count, total NPC bodies spawned during the match, and successful respawn triggers used versus the configured max.
- Starting a fight now explicitly resets `npcSpawnedTotals`, `npcRespawnTotals`, and the per-style spawn schedule so stale counters from earlier fights/lobbies cannot leak into the next fight.
- The host simulation loop now prevents overlapping async ticks from running at the same time, which reduces the chance of duplicate spawn processing when Firebase reads/writes are slow.
- Respawn caps are also inferred defensively from total spawned NPC bodies if an older lobby is missing `npcRespawnTotals`.

## v3.45 NPC respawn semantics

- NPC lobby/content wording now uses **Amount per spawn**, **Allowed on map at a time**, **Seconds until respawn**, and **Number of respawns per match**.
- `Amount per spawn` controls how many NPC bodies a successful timer trigger can create.
- `Allowed on map at a time` caps living NPCs of that type; `0` means unlimited.
- `Number of respawns per match` caps successful spawn timer triggers; `0` means unlimited. A value of `1` now allows only one successful spawn trigger for that NPC type.
- Spawn warning icons use the same respawn-trigger and on-map-cap rules, so warnings should not appear when the next trigger cannot spawn anything.

## Firebase bandwidth notes

Firebase Realtime Database bandwidth pressure mainly comes from fight-phase state sync. The current architecture uses a host-authoritative browser simulation and connected clients subscribe to the live lobby/game state. The largest payloads are `game.units`, `game.board`, cosmetic `game.splats` / `game.effects`, and inventories/loot when they change.

Optimizations already in this build:

- Board state is only written during the fight when resource/NPC terrain changes mark it dirty.
- Regular fight ticks now patch only fields whose serialized value changed.
- Static content remains bundled in source/assets instead of being stored in Firebase per match; Firebase stores short item/unit/NPC IDs.
- Presence is heartbeat-throttled rather than written on every lobby snapshot.

Future optimizations to consider before larger public playtests:

- Move fight listeners away from the full lobby root and subscribe separately to small lobby metadata plus the exact game subtrees each screen needs.
- Split cosmetic effects from authoritative combat state, or make hitsplats/projectiles client-derived where possible.
- Delta-sync units by unit ID instead of writing the full `game.units` object every tick.
- Consider a lower-frequency remote sync with client-side interpolation for movement/projectiles.
- Keep logs, kill feed, market history, and result snapshots capped aggressively.
- Add a lightweight bandwidth/debug panel that estimates serialized bytes written per tick during local tests.

require('dotenv').config();
const express = require('express');
const activeLogins = new Set(); // Tracks currently logged-in usernames
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));

const onlinePlayers = {}; 
const parties = {};        
const playerParty = {};    

// ==========================================
// LOOT, GOLD & STAT GENERATION ENGINE
// ==========================================
const STAT_TYPES = ['attack', 'magic', 'defense', 'speed', 'int', 'str', 'hp'];
const RARITY_COLORS = { "Starter": "#aaaaaa", "Basic": "#8B4513", "Rare": "#2196F3", "Unique": "#9c27b0", "Legendary": "#f44336", "Godly": "#e0ffff" };
const ITEM_TEMPLATES = { 
    sword: { slot: 'weapon', statKey: 'attack', baseName: 'Sword', spriteName: 'sword' }, 
    staff: { slot: 'weapon', statKey: 'magic', baseName: 'Staff', spriteName: 'staff' }, 
    pendant: { slot: 'weapon', statKey: 'magic', baseName: 'Pendant', spriteName: 'pendant' }, 
    armor: { slot: 'armor', statKey: 'defense', baseName: 'Armor', spriteName: 'armor' }, 
    leggings: { slot: 'leggings', statKey: 'hp', baseName: 'Leggings', spriteName: 'leggings' } 
};
const VALID_RARITIES = ['Starter', 'Basic', 'Rare', 'Unique', 'Legendary', 'Godly'];
const MAX_ENHANCE_BY_RARITY = {
    Starter: 0,
    Basic: 20,
    Rare: 20,
    Unique: 20,
    Legendary: 15,
    Godly: 10
};

function clamp(value, min, max) {
    value = Number(value) || 0;
    return Math.max(min, Math.min(max, value));
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function sanitizeStatObject(stats) {
    const safe = {};
    if (!stats || typeof stats !== 'object') return safe;

    for (const key of Object.keys(stats)) {
        safe[key] = clamp(stats[key], 0, 999999);
    }
    return safe;
}

function sanitizeItem(item) {
    if (!item || typeof item !== 'object') return null;

    const safe = deepCopy(item);

    safe.id = safe.id || (Date.now() + Math.random());
    safe.name = String(safe.name || 'Unknown Item');
    safe.type = String(safe.type || '');
    safe.sprite = String(safe.sprite || '');
    safe.level = clamp(safe.level, 1, 50);
    safe.rarity = safe.rarity || 'Basic';
    safe.color = typeof safe.color === 'string' ? safe.color : '#ffffff';
    safe.enhanceLevel = Number(safe.enhanceLevel) || 0;
    safe.quantity = clamp(safe.quantity || 1, 1, 999);

    // 🛡️ REMOVED: The aggressive MAX_ENHANCE block that was deleting items is completely gone.

    safe.fixedStat = sanitizeStatObject(safe.fixedStat);
    safe.randomStat = sanitizeStatObject(safe.randomStat);

    if (safe.aura && safe.aura !== 'lightning') {
        delete safe.aura;
    }
    if (safe.auraId && safe.auraId !== 'lightning') {
        delete safe.auraId;
    }

    return safe;
}

function sanitizeInventory(inventory) {
    const safeInventory = Array.isArray(inventory) ? inventory.slice(0, 20) : [];
    while (safeInventory.length < 20) safeInventory.push(null);

    return safeInventory.map(item => {
        if (!item) return null;
        return sanitizeItem(item);
    });
}

function sanitizeEquips(equips) {
    const safe = { weapon: null, armor: null, leggings: null };
    if (!equips || typeof equips !== 'object') return safe;

    if (equips.weapon) safe.weapon = sanitizeItem(equips.weapon);
    if (equips.armor) safe.armor = sanitizeItem(equips.armor);
    if (equips.leggings) safe.leggings = sanitizeItem(equips.leggings);

    return safe;
}

function sanitizeBaseStats(baseStats) {
    const fallback = {
        hp: 100,
        attack: 5,
        magic: 5,
        defense: 2,
        speed: 1,
        str: 10,
        int: 10,
        playerClass: null
    };

    const safe = Object.assign({}, fallback, (baseStats && typeof baseStats === 'object') ? baseStats : {});
    safe.hp = clamp(safe.hp, 1, 999999);
    safe.attack = clamp(safe.attack, 0, 999999);
    safe.magic = clamp(safe.magic, 0, 999999);
    safe.defense = clamp(safe.defense, 0, 999999);
    safe.speed = clamp(safe.speed, 0, 999999);
    safe.str = clamp(safe.str, 0, 999999);
    safe.int = clamp(safe.int, 0, 999999);
    safe.playerClass = safe.playerClass || null;
    return safe;
}

function sanitizePlayerRecordFromDb(row) {
    const safe = Object.assign({}, row);
    safe.inventory = sanitizeInventory(row.inventory);
    safe.equips = sanitizeEquips(row.equips);
    safe.base_stats = sanitizeBaseStats(row.base_stats);
    return safe;
}

function getBaseStat(lvl) { 
    if (lvl >= 50) return 100; if (lvl >= 45) return 45; if (lvl >= 40) return 40; 
    if (lvl >= 35) return 30; if (lvl >= 30) return 27; if (lvl >= 25) return 22; 
    if (lvl >= 20) return 20; if (lvl >= 15) return 15; if (lvl >= 10) return 12; 
    if (lvl >= 5) return 8; return 5; 
}

function generateLoot(monster) {
    // 🌟 GOLDEN SLIME CUSTOM LOOT TABLE
    if (monster.monsterKey === "common_mobs_golden") {
        let mLevel = monster.level || 1;
        let roll = Math.random();

        // 5% Chance: Class Reset Book
        if (roll < 0.05) {
            return { 
                id: Date.now() + Math.random(), 
                name: "Class Reset Book", 
                type: "consumable", 
                rarity: "Godly", 
                color: RARITY_COLORS["Godly"], 
                description: "Resets your chosen class so you can pick a new one.", 
                quantity: 1 
            };
        } 
        
        // 95% Chance: 45% Legendary or 50% Unique
        let rarity = (roll < 0.50) ? "Legendary" : "Unique"; 
        
        const keys = Object.keys(ITEM_TEMPLATES);
        const typeKey = keys[Math.floor(Math.random() * keys.length)];
        const template = ITEM_TEMPLATES[typeKey];
        
        let item = { 
            id: Date.now() + Math.random(), 
            name: `${rarity} ${template.baseName}`, 
            type: template.slot, 
            sprite: rarity.toLowerCase() + template.spriteName, 
            level: mLevel, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: 0 
        };
        
        let statVal = getBaseStat(mLevel) + ({ "Unique": 5, "Legendary": 8 }[rarity] || 0);
        if (typeKey === 'pendant') statVal = Math.floor(statVal / 2); 
        item.fixedStat[template.statKey] = statVal;
        
        item.randomStat = {};
        let numStats = rarity === "Legendary" ? 2 : 1;
        let availableStats = [...STAT_TYPES]; 
        for (let i = 0; i < numStats; i++) {
            let rIdx = Math.floor(Math.random() * availableStats.length);
            let sKey = availableStats.splice(rIdx, 1)[0]; 
            item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(mLevel)) + 1;
        }
        return item;
    }
    
    // ==========================================
    // 1. CALCULATE ITEM DROP LEVEL (90% Same, 10% Lower)
    // ==========================================
    let baseLevel = monster.level || 5;
    let mLevel = baseLevel;
    
    // 10% chance to drop a lower level tier (subtracts up to 5 levels, minimum 1)
    if (Math.random() > 0.90) {
        mLevel = Math.max(1, baseLevel - 5);
    }

      // ==========================================
    // 2. COMMON MOB SPECIAL DROP: REVIVAL JUICE (1%)
    // ==========================================
    if (monster.category === "common_mobs" && Math.random() < 0.0009) {
        return {
            id: Date.now() + Math.random(),
            name: "Revival Juice",
            type: "consumable",
            rarity: "Unique",
            color: RARITY_COLORS["Unique"],
            description: "Revives you instantly on the spot when used while dead.",
            quantity: 1
        };
    }

    // ==========================================
    // 3. REFINEMENT STONE DROP (45% Chance)
    // ==========================================
    if (Math.random() < 0.15) {
        let stoneRarity = "Basic";
        let r = Math.random();
        
   if (monster.category === "mini_boss") {
            stoneRarity = r < 0.35 ? "Unique" : "Rare";
        } 
   else if (monster.category === "floor_boss") {
            stoneRarity = r < 0.10 ? "Godly" : "Legendary";
        }else {
            stoneRarity = r < 0.10 ? "Rare" : "Basic";
        }

        return {
            id: Date.now() + Math.random(),
            name: `Refinement Stone Lv.${mLevel}`,
            type: "material", level: mLevel, rarity: stoneRarity, color: RARITY_COLORS[stoneRarity],
            description: "Enhances equipment.", quantity: 1
        };
    }

    // ==========================================
    // 3. GEAR DROP (50% Chance)
    // ==========================================
    const keys = Object.keys(ITEM_TEMPLATES);
    const typeKey = keys[Math.floor(Math.random() * keys.length)];
    
    let rarityRoll = Math.random();
    let rarity = "Basic";
    
    if (monster.category === "floor_boss") {
        // 👑 FLOOR BOSS DROP RATES FOR GEAR
        if (rarityRoll <= 0.35) rarity = "Godly";          // 5% chance
        else rarity = "Legendary";                             // 15% chance
    } else if (monster.category === "mini_boss") {
        rarity = rarityRoll < 0.35 ? "Unique" : "Rare";
    } else {
        rarity = rarityRoll < 0.15 ? "Rare" : "Basic";
    }

    const template = ITEM_TEMPLATES[typeKey];
    const rarityPrefix = rarity === "Starter" ? "basic" : rarity.toLowerCase();
    
    let itemName = `${rarity === "Rare" ? "Slime" : "Basic"} ${template.baseName}`;
    if (rarity !== "Rare" && rarity !== "Basic") itemName = `${rarity} ${template.baseName}`;

    let item = { id: Date.now() + Math.random(), name: itemName, type: template.slot, sprite: rarityPrefix + template.spriteName, level: mLevel, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: 0 };
    
    // ✅ STRICT PENDANT 50% PENALTY ENFORCED
    let statVal = getBaseStat(mLevel) + ({ "Starter": 0, "Basic": 0, "Rare": 2, "Unique": 5, "Legendary": 8, "Godly": 12 }[rarity] || 0);
    if (typeKey === 'pendant') statVal = Math.floor(statVal / 2); 
    item.fixedStat[template.statKey] = statVal;
    
    // ✅ MULTIPLE BONUS STATS FOR HIGH RARITY
    item.randomStat = {};
    let numStats = 1;
    if (rarity === "Legendary") numStats = 2;
    if (rarity === "Godly") numStats = 3;

    // Clone the stat types so we can pick unique ones without repeating
    let availableStats = [...STAT_TYPES]; 
    for (let i = 0; i < numStats; i++) {
        let rIdx = Math.floor(Math.random() * availableStats.length);
        let sKey = availableStats.splice(rIdx, 1)[0]; // Pulls the stat out of the list
        item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(mLevel)) + 1;
    }
    
    return item;
}

// ==========================================
// SCALED MONSTER DATABASE
// ==========================================
const MonsterDatabase = {
    "common_mobs1": { name: "Slime", category: "common_mobs", level: 5, maxHp: 100, atk: 15, def: 0, speed: 2.5, expYield: 25, goldYield: 15, aggroRadius: 250, chaseRadius: 400, attackRange: 55, width: 40, height: 40, respawnDelay: 10000, cssColor: '#ff69b4', cssBorder: '#c71585' },
    // 🌟 THE GOLDEN SLIME
    "common_mobs_golden": { name: "Golden Slime", category: "common_mobs", level: 5, maxHp: 100, atk: 15, def: 0, speed: 4.0, expYield: 500, goldYield: 1500, aggroRadius: 250, chaseRadius: 500, attackRange: 55, width: 40, height: 40, respawnDelay: 10000, cssColor: '#ffd700', cssBorder: '#b8860b' },
    "mini_boss1": { name: "Orc Slime", category: "mini_boss", level: 15, maxHp: 15500, atk: 250, def: 35, speed: 2.8, expYield: 500, goldYield: 150, aggroRadius: 350, chaseRadius: 500, attackRange: 90, width: 60, height: 60, respawnDelay: 120000, cssColor: '#2196F3', cssBorder: '#0b7dda' },
    "floor_boss1": { name: "Dragon Slime", category: "floor_boss", level: 25, maxHp: 35000, atk: 550, def: 100, speed: 3.5, expYield: 3000, goldYield: 1000, aggroRadius: 500, chaseRadius: 700, attackRange: 130, width: 100, height: 100, respawnDelay: -1, cssColor: '#f44336', cssBorder: '#b71c1c' },
    // ==================
    // TYPE 2: BATS (Fast, Squishy, Melee)
    // ==================
    "common_mobs2": { name: "Shadow Bat", category: "common_mobs", level: 5, maxHp: 160, atk: 35, def: 0, speed: 4.5, expYield: 30, goldYield: 15, aggroRadius: 300, chaseRadius: 500, attackRange: 55, width: 40, height: 40, respawnDelay: 10000, cssColor: '#1a1a1a', cssBorder: 'none' },
    "mini_boss2": { name: "Vampire Bat", category: "mini_boss", level: 15, maxHp: 13700, atk: 280, def: 5, speed: 5.0, expYield: 600, goldYield: 180, aggroRadius: 400, chaseRadius: 600, attackRange: 90, width: 60, height: 60, respawnDelay: 120000, cssColor: '#8a2be2', cssBorder: 'none' },
    "floor_boss2": { name: "Bloodwing Terror", category: "floor_boss", level: 25, maxHp: 27500, atk: 630, def: 35, speed: 6.0, expYield: 3500, goldYield: 1200, aggroRadius: 600, chaseRadius: 800, attackRange: 130, width: 100, height: 100, respawnDelay: -1, cssColor: '#d32f2f', cssBorder: 'none' },

    // ==================
    // TYPE 3: FIRE ELEMENTALS (Glass Cannons, Ranged)
    // ==================
    "common_mobs3": { name: "Fire Sprite", category: "common_mobs", level: 5, maxHp: 180, atk: 50, def: 0, speed: 2.5, expYield: 35, goldYield: 20, aggroRadius: 350, chaseRadius: 500, attackRange: 200, width: 40, height: 40, respawnDelay: 10000, cssColor: '#f44336', cssBorder: 'none' },
    "mini_boss3": { name: "Inferno Core", category: "mini_boss", level: 15, maxHp: 14200, atk: 320, def: 25, speed: 2.8, expYield: 700, goldYield: 200, aggroRadius: 450, chaseRadius: 650, attackRange: 250, width: 60, height: 60, respawnDelay: 120000, cssColor: '#ff9800', cssBorder: 'none' },
    "floor_boss3": { name: "Astral Blaze", category: "floor_boss", level: 25, maxHp: 29500, atk: 700, def: 45, speed: 3.5, expYield: 4000, goldYield: 1500, aggroRadius: 800, chaseRadius: 900, attackRange: 300, width: 100, height: 100, respawnDelay: -1, cssColor: 'linear-gradient(45deg, #2196F3, #ff9800)', cssBorder: 'none' }
};

function findSocketIdByPlayerId(playerId) { for (const sid of Object.keys(onlinePlayers)) { if (onlinePlayers[sid]?.id === playerId) return sid; } return null; }
function getPlayerById(playerId) { for (const sid of Object.keys(onlinePlayers)) { if (onlinePlayers[sid]?.id === playerId) return onlinePlayers[sid]; } return null; }
function playersInInstance(instId) { 
    return Object.values(onlinePlayers).filter(p => p.instanceId === instId); 
}

function playerAcceptsLoot(player, item) {
    if (!player || !item) return false;
    const rarity = item.rarity || 'Basic';
    const filter = player.lootFilter || {
        Starter: true,
        Basic: true,
        Rare: true,
        Unique: true,
        Legendary: true,
        Godly: true
    };

    if (typeof filter[rarity] === 'undefined') return true;
    return !!filter[rarity];
}

function emitPartyUpdate(partyId) {
    const party = parties[partyId]; if (!party) return; const members = [];
    for (const pid of party.members) {
        const p = getPlayerById(pid);
        if (p) members.push({ id: p.id, name: p.name, level: p.level || 1, currentHp: p.currentHp ?? null, maxHp: p.maxHp ?? null, isGhost: !!p.isGhost });
        else members.push({ id: pid, name: pid, level: 1, currentHp: null, maxHp: null, isGhost: false });
    }
    const payload = { partyId: party.id, leaderId: party.leaderId, name: `${party.leaderId}'s Party`, members };
    for (const pid of party.members) { const sid = findSocketIdByPlayerId(pid); if (sid) io.to(sid).emit('partyUpdate', payload); }
}

function removeFromParty(playerId) {
    const pid = playerParty[playerId]; if (!pid) return; const party = parties[pid]; if (!party) { delete playerParty[playerId]; return; }
    party.members.delete(playerId); delete playerParty[playerId];
    if (party.leaderId === playerId) { const next = party.members.values().next().value; party.leaderId = next || null; }
    if (!party.leaderId || party.members.size <= 1) { for (const rem of party.members) { delete playerParty[rem]; const sid = findSocketIdByPlayerId(rem); if (sid) io.to(sid).emit('partyKickedOrLeft'); } delete parties[pid]; return; }
    emitPartyUpdate(pid);
}

function getInstanceId(playerId, mapId) {
    if (mapId === 'town') return 'town'; 
    const partyId = playerParty[playerId];
    return partyId ? `${mapId}_${partyId}` : `${mapId}_solo_${playerId}`; 
}

const worlds = {}; 
function ensureWorldFromMapData(instanceId, mapData) {
    if (!mapData) return null;

    if (!worlds[instanceId]) {
        worlds[instanceId] = {
            collisions: mapData.collisions || [],
            teleports: mapData.teleports || [],
            monsters: {},
            pets: {}
        };

        const processSpawns = (spawnList, fallbackKey) => {
            (spawnList || []).forEach((sp, i) => {
                const mId = `${instanceId}_mob_${Date.now()}_${i}_${Math.random()}`;
                const mKey = sp.monsterKey || fallbackKey;

                worlds[instanceId].monsters[mId] = spawnMonster(instanceId, mId, mKey, {
                    spawnArea: {
                        minX: sp.x,
                        maxX: sp.x,
                        minY: sp.y,
                        maxY: sp.y
                    },
                    level: sp.level
                });
            });
        };

        processSpawns(mapData.normalSpawns, 'common_mobs1');
        processSpawns(mapData.miniBossSpawns, 'mini_boss1');
        processSpawns(mapData.floorBossSpawns, 'floor_boss1');
    }

    return worlds[instanceId];
}
// 🛡️ ANTI-CHEAT: SERVER-SIDE STAT CALCULATOR
function getServerTotalStat(p, statName) {
    if (!p) return 0;

    const baseStats = sanitizeBaseStats(p.baseStats || p.base_stats);
    const equips = sanitizeEquips(p.equips);

    let base = Number(baseStats[statName]) || 0;

    ['weapon', 'armor', 'leggings'].forEach(slot => {
        const eq = equips[slot];
        if (!eq) return;

        if (eq.fixedStat && typeof eq.fixedStat[statName] === 'number') {
            base += eq.fixedStat[statName];
        }
        if (eq.randomStat && typeof eq.randomStat[statName] === 'number') {
            base += eq.randomStat[statName];
        }
    });

    if (baseStats.playerClass === 'Berserker' && (statName === 'hp' || statName === 'defense')) {
        base += Math.floor((Number(baseStats[statName]) || 0) * 0.25);
    }

    if (baseStats.playerClass === 'Blademaster' && statName === 'attack') {
        base += Math.floor((Number(baseStats.attack) || 0) * 0.25);
    }

    return base;
}
function getServerAttackPower(p) {
    return getServerTotalStat(p, 'attack') + Math.floor(getServerTotalStat(p, 'str') / 2);
}

function getServerMagicAttack(p) {
    return getServerTotalStat(p, 'magic') + Math.floor(getServerTotalStat(p, 'int') / 2);
}

function getServerDefense(p) {
    let def = getServerTotalStat(p, 'defense');

    // Berserker Taunt / Callout buff is enforced here on the server
    if (p && p.tauntBuffUntil && Date.now() < p.tauntBuffUntil) {
        def *= 5;
    }

    return def;
}

function spawnMonster(instId, entityId, originalKey, cfg) {
    let monsterKey = originalKey; // 🌟 Store the original key to prevent mutations!
    let stats = MonsterDatabase[monsterKey] || MonsterDatabase["common_mobs1"];
    
    // 🌟 1% CHANCE TO OVERRIDE ANY COMMON MOB WITH THE GOLDEN SLIME
    if (stats.category === "common_mobs" && monsterKey !== "common_mobs_golden") {
        if (Math.random() < 0.0001) { 
            monsterKey = "common_mobs_golden";
            stats = MonsterDatabase["common_mobs_golden"];
        }
    }
    
    const baseLevel = stats.level || 5;
    const targetLevel = cfg.level || baseLevel;
    const scale = targetLevel / baseLevel; 

    return { 
        id: entityId, instanceId: instId, monsterKey, 
        originalKey: originalKey, // ✅ SAVES THE BASE MONSTER IDENTITY
        name: stats.name, category: stats.category, 
        level: targetLevel,
        x: cfg.spawnArea.minX, y: cfg.spawnArea.minY, homeX: cfg.spawnArea.minX, homeY: cfg.spawnArea.minY, 
        width: stats.width, height: stats.height, 
        maxHp: Math.max(1, Math.floor(stats.maxHp * scale)), 
        currentHp: Math.max(1, Math.floor(stats.maxHp * scale)), 
        atk: Math.max(1, Math.floor(stats.atk * scale)),     
        def: Math.max(0, Math.floor(stats.def * scale)),     
        speed: stats.speed, 
        expYield: Math.max(1, Math.floor(stats.expYield * scale)),   
        goldYield: Math.max(0, Math.floor(stats.goldYield * scale)), 
        aggroRadius: stats.aggroRadius, chaseRadius: stats.chaseRadius, attackRange: stats.attackRange, 
        cssColor: stats.cssColor, cssBorder: stats.cssBorder,
        lastAttack: 0, lastEarthquake: 0, alive: true, threatTable: {}, forcedTargetId: null, forcedUntil: 0, targetId: null, respawnDelayMs: stats.respawnDelay, frozenUntil: 0 
    };
}
function serializeMonster(m) { 
    return { 
        id: m.id, monsterKey: m.monsterKey, name: m.name, x: m.x, y: m.y, 
        width: m.width, height: m.height, maxHp: m.maxHp, currentHp: m.currentHp, 
        atk: m.atk, def: m.def, alive: m.alive, targetId: m.targetId || null, 
        cssColor: m.cssColor, cssBorder: m.cssBorder, level: m.level 
    }; 
}

function checkAndResetInstance(instId) {
    if (!worlds[instId] || instId === 'town') return;

    // Check if there are any REAL players left (ignoring invisible admins)
    const activePlayers = playersInInstance(instId).filter(p => !p.isHiddenAdmin);

    if (activePlayers.length === 0) {
        // 🛡️ THE FIX: Delete the room from memory entirely!
        // This forces the server to read your floor1.js spawns fresh the next time a player enters.
        delete worlds[instId];
    }
}

function isMonsterColliding(instId, mx, my, mWidth, mHeight) {
    const cols = worlds[instId]?.collisions || [];
    for (let box of cols) { if (mx < box.x + box.w && mx + mWidth > box.x && my < box.y + box.h && my + mHeight > box.y) return true; }
    return false;
}
function hasLineOfSight(instId, x1, y1, x2, y2) {
    const cols = worlds[instId]?.collisions || [];
    const steps = Math.max(8, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 16));

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;

        for (const box of cols) {
            if (
                px >= box.x &&
                px <= box.x + box.w &&
                py >= box.y &&
                py <= box.y + box.h
            ) {
                return false;
            }
        }
    }

    return true;
}
function pickTarget(m, instId, now) {
    for (const pid of Object.keys(m.threatTable)) { 
        const p = getPlayerById(pid); 
        // 🌟 ADDED !p.isHiddenAdmin
        if (!p || p.instanceId !== instId || p.isGhost || p.isHiddenAdmin || p.untargetableUntil > now || p.mapId === 'town') delete m.threatTable[pid]; 
    }
    
    if (m.forcedUntil > now && m.forcedTargetId) {
        const p = getPlayerById(m.forcedTargetId);
        // 🌟 ADDED !p.isHiddenAdmin
        if (p && p.instanceId === instId && !p.isGhost && !p.isHiddenAdmin && p.untargetableUntil <= now && p.mapId !== 'town' && (p.currentHp ?? 1) > 0) {
            return { id: p.id, isPet: false, x: p.x + 24, y: p.y + 48 };
        } else { m.forcedTargetId = null; }
    }

    const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2);

    const world = worlds[instId];
    if (world && world.pets) {
        let closestPet = null; let petDist = Infinity;
        for (const petId in world.pets) {
            const pet = world.pets[petId];
            const dist = Math.hypot(pet.x - mcx, pet.y - mcy);
            if (dist <= m.chaseRadius && dist < petDist) { closestPet = pet; petDist = dist; }
        }
        if (closestPet) return { id: closestPet.id, isPet: true, x: closestPet.x, y: closestPet.y };
    }

    let best = null; let bestThreat = -1; let bestDist = Infinity;
    for (const pid of Object.keys(m.threatTable)) {
        const threat = m.threatTable[pid] || 0; const p = getPlayerById(pid); 
        // 🌟 ADDED !p.isHiddenAdmin
        if (!p || p.isGhost || p.isHiddenAdmin || p.untargetableUntil > now || p.mapId === 'town') continue;
        const dist = Math.hypot((p.x + 24) - mcx, (p.y + 48) - mcy);
        if (dist > m.chaseRadius) continue;
        if (threat > bestThreat || (threat === bestThreat && dist < bestDist)) { best = p; bestThreat = threat; bestDist = dist; }
    }
    if (best) return { id: best.id, isPet: false, x: best.x + 24, y: best.y + 48 };
    
    let nearest = null; let nearestDist = Infinity;
    for (const p of playersInInstance(instId)) {
        // 🌟 ADDED !p.isHiddenAdmin
        if (p.isGhost || p.isHiddenAdmin || p.untargetableUntil > now || p.mapId === 'town' || (p.currentHp ?? 1) <= 0) continue; 
        const dist = Math.hypot((p.x + 24) - mcx, (p.y + 48) - mcy);
        if (dist <= m.aggroRadius && dist < nearestDist) { nearest = p; nearestDist = dist; }
    }
    if (nearest) { m.threatTable[nearest.id] = Math.max(1, m.threatTable[nearest.id] || 0); return { id: nearest.id, isPet: false, x: nearest.x + 24, y: nearest.y + 48 }; }
    
    return null;
}

function updateMonsterAI(instId, m, now) {
    if (!m.alive) return;
    if (now < m.frozenUntil) return;

    const target = pickTarget(m, instId, now); 
    m.targetId = target ? target.id : null;
    const mcx = m.x + (m.width / 2); 
    const mcy = m.y + (m.height / 2);
    
    if (!target) { 
        const dist = Math.hypot(m.homeX - m.x, m.homeY - m.y); 
        if (dist > 2) { 
            const ang = Math.atan2(m.homeY - m.y, m.homeX - m.x); 
            let nx = m.x + Math.cos(ang) * m.speed; 
            let ny = m.y + Math.sin(ang) * m.speed; 
            if (!isMonsterColliding(instId, nx, m.y, m.width, m.height)) m.x = nx;
            if (!isMonsterColliding(instId, m.x, ny, m.width, m.height)) m.y = ny;
        } 
        return; 
    }
    
    if ((m.category === "mini_boss" || m.category === "floor_boss") && m.alive) {
        if (now - (m.lastEarthquake || 0) > 6000) {
            if (Math.random() < 0.15) {
                m.lastEarthquake = now;
                const aoeRadius = m.category === "floor_boss" ? 400 : 200;

                io.to(instId).emit('monsterSkill', { monsterId: m.id, skillName: 'Earthquake', x: mcx, y: mcy, radius: aoeRadius });

               const players = playersInInstance(instId);
                players.forEach(p => {
                    // 🌟 ADDED p.isHiddenAdmin bypass so Earthquake ignores you
                    if (p.isGhost || p.isHiddenAdmin || p.mapId === 'town') return;
                    const pDist = Math.hypot((p.x + 24) - mcx, (p.y + 48) - mcy);
                  if (pDist <= aoeRadius) {
    const damage = Math.max(1, m.atk - getServerDefense(p));
    p.currentHp = Math.max(0, p.currentHp - damage);

    io.to(instId).emit('monsterAttack', {
        monsterId: m.id,
        targetId: p.id,
        targetX: p.x + 24,
        targetY: p.y + 48,
        atk: m.atk,
        isAoE: true,
        damage: damage,
        newHp: p.currentHp
    });

    const victimSid = findSocketIdByPlayerId(p.id);
    if (victimSid) {
        io.to(victimSid).emit('playerVitals', {
            currentHp: p.currentHp,
            maxHp: p.maxHp,
            level: p.level
        });
    }

    if (p.currentHp <= 0 && !p.isGhost) {
        p.isGhost = true;
        p.currentHp = 0;
        p.currentPortal = null;

        io.to(instId).emit('remotePlayerGhosted', p.id);

        const pid = playerParty[p.id];
        if (!pid || !parties[pid]) {
            if (victimSid) io.to(victimSid).emit('showDeathScreen');
        } else {
            const party = parties[pid];
            let allDead = true;

            for (const memberId of party.members) {
                const member = getPlayerById(memberId);
                if (member && !member.isGhost) {
                    allDead = false;
                    break;
                }
            }

            if (allDead) {
                for (const memberId of party.members) {
                    const memberSid = findSocketIdByPlayerId(memberId);
                    if (memberSid) io.to(memberSid).emit('showDeathScreen');
                }
                io.to(instId).emit('partyWiped');
            }

            emitPartyUpdate(pid);
        }
    }
}
                });
            }
        }
    }

   const dist = Math.hypot(target.x - mcx, target.y - mcy);
if (dist > m.chaseRadius) {
    if (!target.isPet && m.threatTable[target.id]) m.threatTable[target.id] *= 0.9;
    if (!target.isPet && m.threatTable[target.id] < 1) delete m.threatTable[target.id];
    return;
}

const isRangedMonster = m.attackRange >= 180;
const canSeeTarget = !isRangedMonster || hasLineOfSight(instId, mcx, mcy, target.x, target.y);

if (dist > m.attackRange || (isRangedMonster && !canSeeTarget)) {
    const ang = Math.atan2(target.y - mcy, target.x - mcx);
    let nx = m.x + Math.cos(ang) * m.speed;
    let ny = m.y + Math.sin(ang) * m.speed;

    if (!isMonsterColliding(instId, nx, m.y, m.width, m.height)) m.x = nx;
    if (!isMonsterColliding(instId, m.x, ny, m.width, m.height)) m.y = ny;
} else {
    if (now - m.lastAttack > 1500) {
        m.lastAttack = now;

        if (target.isPet) {
            io.to(instId).emit('monsterAttack', {
                monsterId: m.id,
                targetId: target.id,
                targetX: target.x,
                targetY: target.y,
                atk: m.atk
            });
            return;
        }

        const victim = getPlayerById(target.id);
        if (!victim || victim.isGhost || victim.isHiddenAdmin || victim.mapId === 'town') return;
        if (victim.untargetableUntil > now) return;

        const damage = Math.max(1, m.atk - getServerDefense(victim));
        victim.currentHp = Math.max(0, victim.currentHp - damage);

        io.to(instId).emit('monsterAttack', {
            monsterId: m.id,
            targetId: victim.id,
            targetX: target.x,
            targetY: target.y,
            atk: m.atk,
            damage: damage,
            newHp: victim.currentHp
        });

        const victimSid = findSocketIdByPlayerId(victim.id);
        if (victimSid) {
            io.to(victimSid).emit('playerVitals', {
                currentHp: victim.currentHp,
                maxHp: victim.maxHp,
                level: victim.level
            });
        }

        const pid = playerParty[victim.id];
        if (pid) emitPartyUpdate(pid);

        if (victim.currentHp <= 0 && !victim.isGhost) {
            victim.isGhost = true;
            victim.currentHp = 0;
            victim.currentPortal = null;

            io.to(instId).emit('remotePlayerGhosted', victim.id);

            if (!pid || !parties[pid]) {
                if (victimSid) io.to(victimSid).emit('showDeathScreen');
            } else {
                const party = parties[pid];
                let allDead = true;

                for (const memberId of party.members) {
                    const member = getPlayerById(memberId);
                    if (member && !member.isGhost) {
                        allDead = false;
                        break;
                    }
                }

                if (allDead) {
                    for (const memberId of party.members) {
                        const memberSid = findSocketIdByPlayerId(memberId);
                        if (memberSid) io.to(memberSid).emit('showDeathScreen');
                    }
                    io.to(instId).emit('partyWiped');
                }

                emitPartyUpdate(pid);
            }
        }
    }
}
}
setInterval(() => {
    const now = Date.now();
    for (const instId of Object.keys(worlds)) {
        const world = worlds[instId];
        for (const mid of Object.keys(world.monsters)) updateMonsterAI(instId, world.monsters[mid], now);
        io.to(instId).emit('monsterState', Object.values(world.monsters).map(serializeMonster));
    }
}, 100);

io.on('connection', (socket) => {
    let currentUser = null; 
// ✅ BACKEND FRIENDS & DM LOGIC
    // Note: For now, friendships are stored in-memory. 
    // If the server restarts, players will need to re-add friends.
    if (!global.playerFriends) global.playerFriends = {};

  // ✅ MADE ASYNC TO FETCH OFFLINE LEVELS FROM SUPABASE
 // ✅ ENHANCED FRIENDS LIST (MAP, CLASS, & SPECTATE DATA)
    async function sendFriendsUpdateTo(username) {
        const sid = findSocketIdByPlayerId(username);
        if (!sid) return;

        // 👑 ADMIN OVERRIDE: Kei sees all online players with full data
        if (username === 'Kei') {
            const allOnline = Object.values(onlinePlayers)
                .filter(p => p.id !== 'Kei') 
                .map(p => ({ 
                    id: p.id, online: true, level: p.level || 1, 
                    mapId: p.mapId || 'Unknown', pClass: p.baseStats?.playerClass || 'Novice' 
                }));
            io.to(sid).emit('friendsListUpdate', allOnline);
            return;
        }

        const myFriends = global.playerFriends[username] ? Array.from(global.playerFriends[username]) : [];
        if (myFriends.length === 0) { io.to(sid).emit('friendsListUpdate', []); return; }

        // ✅ BATCH FETCH FULL DATA FROM DB
        const { data: dbFriends } = await supabase
            .from('Exonians')
            .select('character_name, level, map_id, base_stats')
            .in('character_name', myFriends);

        const friendData = myFriends.map(f => {
            let isOnline = activeLogins.has(f);
            let currentLevel = 1, currentMap = 'Unknown', currentClass = 'Novice';
            
            if (isOnline) {
                for (let activeId in onlinePlayers) {
                    if (onlinePlayers[activeId].id === f) {
                        currentLevel = onlinePlayers[activeId].level || 1;
                        currentMap = onlinePlayers[activeId].mapId || 'Unknown';
                        currentClass = onlinePlayers[activeId].baseStats?.playerClass || 'Novice';
                        break;
                    }
                }
            } else if (dbFriends) {
                const dbF = dbFriends.find(row => row.character_name === f);
                if (dbF) {
                    currentLevel = dbF.level || 1;
                    currentMap = dbF.map_id || 'Unknown';
                    currentClass = dbF.base_stats?.playerClass || 'Novice';
                }
            }
            return { id: f, online: isOnline, level: currentLevel, mapId: currentMap, pClass: currentClass };
        });
        io.to(sid).emit('friendsListUpdate', friendData);
    }
   // 🛡️ SYSTEM MAILBOX: Fetch messages for the specific player
  socket.on('getMail', async () => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    try {
                    const { data: mails, error } = await supabase
    .from('System_Mail')
    .select('*')
    .ilike('recipient_name', p.id)
    .or('is_claimed.is.null,is_claimed.eq.false');

        if (error) throw error;

        let formattedMails = (mails || []).map(m => {
            let rawData = m.attached_item || m.attached_file || null;

            if (typeof rawData === 'string') {
                try {
                    m.attached_item = JSON.parse(rawData.trim());
                } catch (e) {
                    m.attached_item = null;
                }
            } else {
                m.attached_item = rawData;
            }

            return m;
        });

        socket.emit('mailList', formattedMails);
    } catch (e) {
        console.error(`[MAIL ERROR]:`, e.message);
        socket.emit('mailList', []);
    }
});

   socket.on('claimMail', async (mailId) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    try {
                    const { data: mail, error } = await supabase
    .from('System_Mail')
    .select('*')
    .eq('id', mailId)
    .ilike('recipient_name', p.id)
    .or('is_claimed.is.null,is_claimed.eq.false')
    .single();

        if (error || !mail) {
            return socket.emit('systemMessage', "Mail not found or already claimed.");
        }

        let rawData = mail.attached_item || mail.attached_file || null;
        let finalItem = null;

        if (rawData) {
            if (typeof rawData === 'string') {
                try {
                    finalItem = JSON.parse(rawData.trim());
                } catch (err) {
                    return socket.emit('systemMessage', "Attachment data is corrupted JSON.");
                }
            } else {
                finalItem = rawData;
            }

            if (!finalItem || !finalItem.name) {
                return socket.emit('systemMessage', "Invalid item format.");
            }

            if (!finalItem.id) finalItem.id = Date.now() + Math.random();
            if (!finalItem.quantity) finalItem.quantity = 1;

            // NORMALIZE INVENTORY FIRST
            const inv = Array.isArray(p.inventory) ? [...p.inventory] : [];
            while (inv.length < 20) inv.push(null);

            let stacked = false;

            // STACKABLE TYPES
            if (['potion', 'material', 'consumable'].includes(finalItem.type)) {
                const existingIndex = inv.findIndex(i => i && i.name === finalItem.name);
                if (existingIndex !== -1) {
                    inv[existingIndex].quantity = (inv[existingIndex].quantity || 1) + finalItem.quantity;
                    stacked = true;
                }
            }

            // EMPTY SLOT CHECK MUST ACCEPT null OR undefined
            if (!stacked) {
                const emptySlot = inv.findIndex(slot => slot == null);
                if (emptySlot === -1) {
                    return socket.emit('systemMessage', "Inventory full! Clear space to claim.");
                }
                inv[emptySlot] = finalItem;
            }

            p.inventory = inv;
        }

        await supabase
            .from('System_Mail')
            .update({ is_claimed: true })
            .eq('id', mailId);

        await supabase
            .from('Exonians')
            .update({ inventory: p.inventory })
            .eq('character_name', p.id);

        socket.emit('mailClaimSuccess', mailId);
        socket.emit('syncInventory', p.inventory);

        let qtyText = finalItem && finalItem.quantity > 1 ? `${finalItem.quantity}x ` : '';
        socket.emit(
            'systemMessage',
            finalItem ? `Claimed ${qtyText}${finalItem.name}!` : "Mail successfully claimed!"
        );
    } catch (e) {
        console.error(`[CLAIM ERROR]:`, e.message);
        socket.emit('systemMessage', "Server error during claim.");
    }
});

    socket.on('addFriend', (data) => {
        const me = onlinePlayers[socket.id];
        if (!me || !data.targetId) return;

        if (!global.playerFriends[me.id]) global.playerFriends[me.id] = new Set();
        if (!global.playerFriends[data.targetId]) global.playerFriends[data.targetId] = new Set();

        // Add mutually to active memory
        global.playerFriends[me.id].add(data.targetId);
        global.playerFriends[data.targetId].add(me.id);

        // Convert the Sets back to Arrays so Supabase can read them
        const myFriendsArray = Array.from(global.playerFriends[me.id]);
        const targetFriendsArray = Array.from(global.playerFriends[data.targetId]);

        // ✅ SAVE TO SUPABASE DATABASE FOR BOTH PLAYERS
        supabase.from('Exonians').update({ friends: myFriendsArray }).eq('character_name', me.id).then(()=>{});
        supabase.from('Exonians').update({ friends: targetFriendsArray }).eq('character_name', data.targetId).then(()=>{});

        socket.emit('systemMessage', `Added ${data.targetId} to friends list.`);
        sendFriendsUpdateTo(me.id);

        const targetSid = findSocketIdByPlayerId(data.targetId);
        if (targetSid) {
            io.to(targetSid).emit('systemMessage', `${me.id} added you as a friend.`);
            sendFriendsUpdateTo(data.targetId);
        }
    });

    socket.on('sendDM', (data) => {
        const me = onlinePlayers[socket.id];
        if (!me || !data.targetId || !data.message) return;

        const targetSid = findSocketIdByPlayerId(data.targetId);
        if (targetSid) {
            // Send to target
            io.to(targetSid).emit('receiveDM', { from: me.id, message: data.message });
            // Echo back to sender
            socket.emit('receiveDM', { from: `To ${data.targetId}`, message: data.message }); 
        } else {
            socket.emit('systemMessage', `${data.targetId} is currently offline.`);
        }
    });

    socket.on('getFriendsList', () => {
        const me = onlinePlayers[socket.id];
        if (me) sendFriendsUpdateTo(me.id);
    });

    socket.on('updateLootFilter', (filter) => {
        const p = onlinePlayers[socket.id];
        if (!p || !filter || typeof filter !== 'object') return;

        p.lootFilter = {
            Starter: !!filter.Starter,
            Basic: !!filter.Basic,
            Rare: !!filter.Rare,
            Unique: !!filter.Unique,
            Legendary: !!filter.Legendary,
            Godly: !!filter.Godly
        };
    });
    socket.on('saveMapFile', (data) => {
        const p = onlinePlayers[socket.id];
        // 🛡️ ANTI-CHEAT: ONLY THE REAL SERVER ADMIN CAN SAVE MAPS
        if (!p || p.id !== "Kei") {
            console.log(`[CRITICAL WARNING] ${socket.id} attempted to overwrite map ${data.mapId}!`);
            return; 
        }
        if (!data.mapId || !data.content) return;
        const fileName = data.mapId === 'town' ? 'townmap.js' : `${data.mapId}.js`;
        const filePath = path.join(__dirname, 'public', fileName);
        try { fs.writeFileSync(filePath, data.content); } catch(err) {}
    });

  socket.on('partyHeal', () => { 
        const p = onlinePlayers[socket.id];
        // 👇 BLOCK NON-HEALERS 👇
        if (!p || p.isGhost || p.mapId === 'town' || p.baseStats?.playerClass !== 'Healer') return;

        const now = Date.now();
        if (p.skillCooldowns['partyHeal'] && now < p.skillCooldowns['partyHeal']) return;
        p.skillCooldowns['partyHeal'] = now + 18000; 

       // 🛡️ THE FIX: Check for 'Boost' passive (Lv. 25+)
        let trueHealAmt = 250;
        if (p.level >= 25) trueHealAmt = 500; // Boosted Heal

        // 🛡️ FIX: Use true calculated max HP so it doesn't cap at 100!
        let myMaxHp = getServerTotalStat(p, 'hp') || 100;
        p.currentHp = Math.min(myMaxHp, p.currentHp + trueHealAmt);
        io.to(p.instanceId).emit('playerHealed', { id: p.id, amount: trueHealAmt, currentHp: p.currentHp });

        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                if (memberId === p.id) continue;
                const mp = getPlayerById(memberId);
                if (mp && !mp.isGhost && mp.instanceId === p.instanceId) {
                    const dist = Math.hypot(p.x - mp.x, p.y - mp.y);
                    if (dist <= safeRadius) {
                        let memberMaxHp = getServerTotalStat(mp, 'hp') || 100;
                        mp.currentHp = Math.min(memberMaxHp, mp.currentHp + trueHealAmt);
                        io.to(p.instanceId).emit('playerHealed', { id: mp.id, amount: trueHealAmt, currentHp: mp.currentHp });
                    }
                }
            }
            emitPartyUpdate(pid);
        }
    });

    socket.on('partyRevive', () => {
        const p = onlinePlayers[socket.id];
        if (!p || p.mapId === 'town') return;

        // 🛡️ 100s COOLDOWN (95s leniency)
        const now = Date.now();
        if (p.skillCooldowns['partyRevive'] && now < p.skillCooldowns['partyRevive']) return;
        p.skillCooldowns['partyRevive'] = now + 95000;

        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                const mp = getPlayerById(memberId);
                if (mp && mp.isGhost && mp.mapId !== 'town') {
                    mp.isGhost = false;
                    // 🛡️ FIX: Use true calculated max HP on revive!
                    let memberMaxHp = getServerTotalStat(mp, 'hp') || 100;
                    mp.currentHp = memberMaxHp; 
                    io.to(p.instanceId).emit('playerRevived', { id: mp.id, currentHp: mp.currentHp });
                }
            }
            emitPartyUpdate(pid); 
        }
    });
socket.on('broadcastSkill', (data) => {
    const p = onlinePlayers[socket.id];
    if (!p || p.isGhost || p.mapId === 'town') return;

    const now = Date.now();
    const pClass = p.baseStats?.playerClass || null;
    const level = p.level || 1;
    const skillId = String(data?.skillId || '');

    const SKILL_RULES = {
        heal1: { className: 'Healer', unlock: 1, cd: 20000, auraColor: 'green' },
        heal3: { className: 'Healer', unlock: 50, cd: 100000, auraColor: 'green' },

        sum1:  { className: 'Summoner', unlock: 1, cd: 25000, auraColor: 'blue' },
        sum3:  { className: 'Summoner', unlock: 50, cd: 100000, auraColor: 'blue' },

        ice1:  { className: 'Ice Master', unlock: 1, cd: 25000, auraColor: 'blue' },
        ice3:  { className: 'Ice Master', unlock: 50, cd: 100000, auraColor: 'blue' },

        ber1:  { className: 'Berserker', unlock: 1, cd: 14000, auraColor: 'red' },
        ber3:  { className: 'Berserker', unlock: 50, cd: 100000, auraColor: 'red' },

        bld2:  { className: 'Blademaster', unlock: 25, cd: 15000, auraColor: 'red' },
        bld3:  { className: 'Blademaster', unlock: 50, cd: 50000, auraColor: 'red' }
    };

    const rule = SKILL_RULES[skillId];
    if (!rule) return;

    if (pClass !== rule.className) return;
    if (level < rule.unlock) return;

    if (!p.skillCooldowns) p.skillCooldowns = {};

    const cdKey = `visual_${skillId}`;
    if (p.skillCooldowns[cdKey] && now < p.skillCooldowns[cdKey]) return;
    p.skillCooldowns[cdKey] = now + rule.cd;

    socket.to(p.instanceId).emit('remoteSkillEffect', {
        playerId: p.id,
        skillId: skillId,
        x: p.x,
        y: p.y,
        auraColor: rule.auraColor
    });
});

     socket.on('syncMapData', (mapData) => {
        const world = ensureWorldFromMapData(mapData.instanceId, mapData);
        if (!world) return;

        io.to(mapData.instanceId).emit(
            'monsterState',
            Object.values(world.monsters).map(serializeMonster)
        );
    });

   socket.on('adminSpawnMonster', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.id !== "Kei") return; // 🛡️ SECURITY: Only the real Kei can do this!

        if (!worlds[data.instanceId]) return;
        const newMobId = 'admin_' + Date.now();
        const newMob = spawnMonster(data.instanceId, newMobId, data.monsterKey, { 
            spawnArea: { minX: data.x, minY: data.y },
            level: data.level 
        });
        worlds[data.instanceId].monsters[newMobId] = newMob;
        
        io.to(data.instanceId).emit('monsterSpawned', serializeMonster(newMob));
    });

    socket.on('portalStep', (data) => {
        const p = onlinePlayers[socket.id]; if (!p || p.isGhost) return;
        p.currentPortal = data.portalId;
        const pid = playerParty[p.id];
        
        if (!pid) {
            socket.emit('teleportApproved', data);
        } else {
            const party = parties[pid];
            let allReady = true;
            for (const memberId of party.members) {
                const mp = getPlayerById(memberId);
                if (mp && mp.instanceId === p.instanceId && mp.currentPortal !== data.portalId && !mp.isGhost) {
                    allReady = false; break;
                }
            }
            if (allReady) {
                for (const memberId of party.members) {
                    const msid = findSocketIdByPlayerId(memberId);
                    if (msid) io.to(msid).emit('teleportApproved', data);
                }
            } else {
                socket.emit('partyError', 'Waiting for all alive party members to gather on the portal...');
            }
        }
    });

    socket.on('portalLeave', () => { const p = onlinePlayers[socket.id]; if(p) p.currentPortal = null; });

   socket.on('register', async (data) => {
    console.log(`[REGISTER ATTEMPT] User: ${data.username}`);
    try {
        const { username, password } = data;
        if (!username || !password) return socket.emit('authError', 'Invalid data.');
        
        const { data: existingUser } = await supabase.from('Exonians').select('character_name').eq('character_name', username).single();
        if (existingUser) return socket.emit('authError', 'Username is already taken!');
        
        const { error } = await supabase.from('Exonians').insert([{ character_name: username, password: password }]);
        if (error) {
            console.error(`[REGISTER ERROR] DB failed for ${username}:`, error.message);
            return socket.emit('authError', `Database Error: ${error.message}`);
        }
        socket.emit('registerSuccess', username);
    } catch(e) {
        console.error(`[REGISTER CRASH]`, e);
        socket.emit('authError', 'Server Error');
    }
});
socket.on('login', async (data) => {
    console.log(`[LOGIN ATTEMPT] User: ${data.username}`);
    try {
        const { username, password } = data;
        if (!username || !password) {
            return socket.emit('authError', 'Invalid username or password.');
        }

        const { data: user, error } = await supabase
            .from('Exonians')
            .select('*')
            .eq('character_name', username)
            .eq('password', password)
            .single();

        if (error || !user) {
            console.error(
                `[LOGIN FAILED] Invalid credentials for ${username}. Error:`,
                error?.message || 'No user found'
            );
            return socket.emit('authError', 'Invalid username or password.');
        }

        // ✅ FORCE-REMOVE OLD SESSION IF THIS ACCOUNT IS ALREADY STUCK ONLINE
                // ✅ FORCE-REMOVE ONLY A REAL EXISTING OLD IN-GAME SESSION
        let oldSocketId = null;
        for (const sid of Object.keys(onlinePlayers)) {
            if (sid !== socket.id && onlinePlayers[sid]?.id === username) {
                oldSocketId = sid;
                break;
            }
        }

        if (oldSocketId) {
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            const oldPlayer = onlinePlayers[oldSocketId];

            console.log(`[LOGIN OVERRIDE] Kicking old active session for ${username} (${oldSocketId})`);

            try {
                if (oldPlayer) {
                    const oldInstId = oldPlayer.instanceId;

                    if (oldPlayer.instanceId) {
                        socket.to(oldPlayer.instanceId).emit('remotePlayerLeft', oldPlayer.id);
                    }

                    if (worlds[oldPlayer.instanceId] && worlds[oldPlayer.instanceId].pets) {
                        for (const petId in worlds[oldPlayer.instanceId].pets) {
                            if (worlds[oldPlayer.instanceId].pets[petId].ownerId === oldPlayer.id) {
                                delete worlds[oldPlayer.instanceId].pets[petId];
                            }
                        }
                    }

                    removeFromParty(oldPlayer.id);

                    let saveMap = oldPlayer.mapId || 'town';
                    let saveX = typeof oldPlayer.x === 'number' ? oldPlayer.x : 960;
                    let saveY = typeof oldPlayer.y === 'number' ? oldPlayer.y : 1000;

                    if (oldPlayer.isGhost) {
                        saveMap = 'town';
                        saveX = 960;
                        saveY = 1000;
                    }

                    supabase
                        .from('Exonians')
                        .update({ map_id: saveMap, pos_x: saveX, pos_y: saveY })
                        .eq('character_name', oldPlayer.id)
                        .then(() => {});

                    delete onlinePlayers[oldSocketId];
                    checkAndResetInstance(oldInstId);
                }

                activeLogins.delete(username);

                if (oldSocket && oldSocket.connected) {
                    oldSocket.emit('forcedLogout', 'Your account was logged in from another session.');
                    oldSocket.disconnect(true);
                }
            } catch (cleanupErr) {
                console.error(`[LOGIN OVERRIDE CLEANUP ERROR] ${username}:`, cleanupErr);
            }
        }
        for (const sid of Object.keys(onlinePlayers)) {
            if (onlinePlayers[sid]?.id === username) {
                oldSocketId = sid;
                break;
            }
        }

        // Also check raw socket username in case old session never fully entered world
        if (!oldSocketId) {
            for (const sid of io.sockets.sockets.keys()) {
                const s = io.sockets.sockets.get(sid);
                if (s && s.username === username && sid !== socket.id) {
                    oldSocketId = sid;
                    break;
                }
            }
        }

        if (oldSocketId && oldSocketId !== socket.id) {
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            const oldPlayer = onlinePlayers[oldSocketId];

            console.log(`[LOGIN OVERRIDE] Kicking stale session for ${username} (socket ${oldSocketId})`);

            if (oldPlayer) {
                const oldInstId = oldPlayer.instanceId;

                try {
                    if (oldPlayer.instanceId) {
                        oldSocket?.to(oldPlayer.instanceId).emit('remotePlayerLeft', oldPlayer.id);
                    }

                    if (worlds[oldPlayer.instanceId] && worlds[oldPlayer.instanceId].pets) {
                        for (let petId in worlds[oldPlayer.instanceId].pets) {
                            if (worlds[oldPlayer.instanceId].pets[petId].ownerId === oldPlayer.id) {
                                delete worlds[oldPlayer.instanceId].pets[petId];
                            }
                        }
                    }

                    removeFromParty(oldPlayer.id);

                    let saveMap = oldPlayer.mapId;
                    let saveX = oldPlayer.x;
                    let saveY = oldPlayer.y;
                    if (oldPlayer.isGhost) {
                        saveMap = 'town';
                        saveX = 960;
                        saveY = 1000;
                    }

                    supabase
                        .from('Exonians')
                        .update({ map_id: saveMap, pos_x: saveX, pos_y: saveY })
                        .eq('character_name', oldPlayer.id)
                        .then(() => {});

                    delete onlinePlayers[oldSocketId];
                    checkAndResetInstance(oldInstId);
                } catch (cleanupErr) {
                    console.error(`[LOGIN OVERRIDE CLEANUP ERROR] ${username}:`, cleanupErr);
                }
            }

            activeLogins.delete(username);

            if (oldSocket) {
                oldSocket.emit('forcedLogout', 'Your account was logged in from another session.');
                oldSocket.disconnect(true);
            }
        }

        console.log(`[LOGIN SUCCESS] ${username} authenticated successfully.`);

        activeLogins.add(username);
        socket.username = username;
        currentUser = username;

        if (!global.playerFriends) global.playerFriends = {};
        global.playerFriends[username] = new Set(user.friends || []);

        if (!user.skin_color) socket.emit('needsCharacterCreation', username);
        else socket.emit('characterSelect', user);

    } catch (e) {
        console.error(`[LOGIN CRASH] Exception thrown for ${data.username}:`, e);
        socket.emit('authError', 'Server Error');
    }
});
    socket.on('createCharacter', async (data) => {
        try {
            const { username, charData } = data;
            
            // ✅ Leave 'weapon' null so their hands are empty, but keep basic clothes on
            const starterEquips = {
                weapon: null, 
                armor: { id: Date.now() + Math.random(), name: "Starter Armor", type: "armor", sprite: "starterarmor", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { defense: 2 } },
                leggings: { id: Date.now() + Math.random(), name: "Starter Leggings", type: "leggings", sprite: "starterleggings", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { hp: 5 } }
            };

            const starterInventory = [];
            for (let i = 0; i < 20; i++) {
                starterInventory.push(null);
            }
            
            // ✅ Pack ALL THREE weapons into the first three inventory slots
            starterInventory[0] = { id: Date.now() + Math.random(), name: "Starter Sword", type: "weapon", sprite: "startersword", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { attack: 3 } };
            starterInventory[1] = { id: Date.now() + Math.random(), name: "Starter Staff", type: "weapon", sprite: "starterstaff", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 3 } };
            starterInventory[2] = { id: Date.now() + Math.random(), name: "Starter Pendant", type: "weapon", sprite: "starterpendant", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 2 } };

            const { data: user, error } = await supabase.from('Exonians')
                .update({ 
                    skin_color: charData.skinColor, 
                    hair_color: charData.hairColor, 
                    hair_style: charData.hairStyle,
                    equips: starterEquips,
                    inventory: starterInventory 
                })
                .eq('character_name', username)
                .select().single();
            
            if (error) {
                console.error("[CREATE CHAR ERROR] Supabase rejected the items:", error);
                return socket.emit('authError', 'Failed to save starter items. Check server console.');
            }
            
            if (user) socket.emit('characterSelect', user);
            
        } catch(e) { 
            console.error("[CREATE CHAR CRASH]", e);
            socket.emit('authError', 'Server Error during character creation.'); 
        }
    });

 socket.on('enterWorld', async (userData) => {
    const mapId = 'town';
    const instId = getInstanceId(userData.character_name, mapId);

    const { data: freshUser, error } = await supabase
        .from('Exonians')
        .select('*')
        .eq('character_name', userData.character_name)
        .single();

    if (error || !freshUser) {
        socket.emit('authError', 'Failed to load character data.');
        return;
    }

    const safeUser = sanitizePlayerRecordFromDb(freshUser);
    const trueMaxHp = getServerTotalStat({
        baseStats: safeUser.base_stats,
        equips: safeUser.equips,
        level: safeUser.level || 1
    }, 'hp') || 100;

    currentUser = safeUser.character_name;

    onlinePlayers[socket.id] = {
        socketId: socket.id,
        id: safeUser.character_name,
        name: safeUser.character_name,
        mapId: mapId,
        instanceId: instId,
        isGhost: false,
        currentPortal: null,
        x: 960,
        y: 1000,
        level: safeUser.level || 1,
        currentHp: clamp(safeUser.current_hp || trueMaxHp, 0, trueMaxHp),
        maxHp: trueMaxHp,
        tradeTarget: null,
        inventory: safeUser.inventory,
        equips: safeUser.equips,
        baseStats: safeUser.base_stats,
        gold: safeUser.gold || 0,
        spriteData: {
            skin: safeUser.skin_color,
            hair: safeUser.hair_color,
            style: safeUser.hair_style,
            weapon: safeUser.equips.weapon?.sprite || null,
            aura: safeUser.equips.armor?.aura || null
        },
        lootFilter: {
            Starter: true,
            Basic: true,
            Rare: true,
            Unique: true,
            Legendary: true,
            Godly: true
        },
        untargetableUntil: 0,
        tauntBuffUntil: 0,
        attackTokens: 3,
        lastTokenRefill: Date.now(),
        skillCooldowns: {}
    };

    await supabase
        .from('Exonians')
        .update({
            inventory: safeUser.inventory,
            equips: safeUser.equips,
            base_stats: safeUser.base_stats,
            map_id: 'town',
            pos_x: 960,
            pos_y: 1000,
            current_hp: onlinePlayers[socket.id].currentHp
        })
        .eq('character_name', currentUser);

    socket.join(instId);
    socket.emit('authSuccess', {
        ...safeUser,
        inventory: safeUser.inventory,
        equips: safeUser.equips,
        base_stats: safeUser.base_stats,
        current_hp: onlinePlayers[socket.id].currentHp,
        max_hp: trueMaxHp
    });

    socket.to(instId).emit('remotePlayerJoined', {
        id: onlinePlayers[socket.id].id,
        name: onlinePlayers[socket.id].name,
        mapId,
        instanceId: instId,
        x: onlinePlayers[socket.id].x,
        y: onlinePlayers[socket.id].y,
        spriteData: onlinePlayers[socket.id].spriteData,
        isGhost: false
    });

    const playersInInst = Object.values(onlinePlayers).filter(
        p => p.instanceId === instId && p.id !== safeUser.character_name
    );

    socket.emit('mapPlayersList', playersInInst.map(p => ({
        id: p.id,
        name: p.name,
        mapId: p.mapId,
        x: p.x,
        y: p.y,
        spriteData: p.spriteData,
        isGhost: p.isGhost
    })));
});

socket.on('saveData', async (playerData) => {
    if (!currentUser) return;
    const p = onlinePlayers[socket.id];
    if (!p) return;

    const now = Date.now();
    if (p.lastSaveTime && now - p.lastSaveTime < 500) return;
    p.lastSaveTime = now;

    // 🛡️ 1. ONLY ACCEPT MOVEMENT DATA FROM THE FRONTEND
    const safeMapId = typeof playerData.mapId === 'string' ? playerData.mapId : p.mapId;
    const safeX = typeof playerData.x === 'number' ? playerData.x : p.x;
    const safeY = typeof playerData.y === 'number' ? playerData.y : p.y;

    // 🛡️ 2. CLAMP GOLD & STATS (Protects against EXP/Gold hacking)
    let safeGold = typeof playerData.gold === 'number' ? playerData.gold : (p.gold || 0);
    if (safeGold > (p.gold || 0) + 50000 && p.id !== "Kei") {
        console.log(`[HACK BLOCKED] ${p.id} tried to inject ${safeGold - (p.gold || 0)} gold.`);
        safeGold = p.gold || 0;
    }

    let safeLevel = clamp(typeof playerData.level === 'number' ? playerData.level : (p.level || 1), 1, 50);
    let safeBaseStats = sanitizeBaseStats(playerData.baseStats || p.baseStats || {});

    if (p.id !== "Kei") {
        safeBaseStats.str = clamp(safeBaseStats.str, 0, 150);
        safeBaseStats.int = clamp(safeBaseStats.int, 0, 150);
        safeBaseStats.hp = clamp(safeBaseStats.hp, 1, 999999);
    }

    // 🛡️ 3. UPDATE SERVER MEMORY WITH SAFE DATA
    p.level = safeLevel;
    p.exp = clamp(playerData.exp ?? p.exp ?? 0, 0, 999999999);
    p.maxExp = clamp(playerData.maxExp ?? p.maxExp ?? 100, 100, 999999999);
    p.gold = safeGold;
    p.baseStats = safeBaseStats;
    p.x = safeX;
    p.y = safeY;
    p.mapId = safeMapId;

    const trueMaxHp = getServerTotalStat(p, 'hp') || 100;
    p.maxHp = trueMaxHp;
    p.currentHp = clamp(typeof playerData.currentHp === 'number' ? playerData.currentHp : p.currentHp, 0, trueMaxHp);

    p.spriteData.weapon = p.equips?.weapon?.sprite || null;
    p.spriteData.aura = p.equips?.armor?.aura || null;
    await supabase.from('Exonians').update({
        level: p.level,
        exp: p.exp,
        max_exp: p.maxExp,
        current_hp: p.currentHp,
        gold: p.gold,
        pos_x: p.x,
        pos_y: p.y,
        map_id: p.mapId,
        base_stats: p.baseStats,
        inventory: p.inventory,
        equips: p.equips       
    }).eq('character_name', currentUser);

    const pid = playerParty[p.id];
    if (pid) emitPartyUpdate(pid);
});
    
   socket.on('playerMoved', (data) => {
        if (!onlinePlayers[socket.id]) return; 
        const p = onlinePlayers[socket.id]; 

        // 🛡️ SERVER-SIDE ANTI-WALLHACK
        const world = worlds[p.instanceId];
        if (world && world.collisions && !p.isGhost) {
            const hitX = data.x + 12; // Player Hitbox X offset
            const hitY = data.y + 76; // Player Hitbox Y offset
            let isHacking = false;
            
            for (let box of world.collisions) {
                // If the player's requested position is inside a wall...
                if (hitX < box.x + box.w && hitX + 24 > box.x && hitY < box.y + box.h && hitY + 20 > box.y) {
                    isHacking = true; break;
                }
            }
            
            // If they hit a wall, REJECT the movement and snap them back to their last known legal position!
            if (isHacking) {
                // Only admins named Kei are allowed to noclip
                if (p.id !== "Kei") {
                    socket.emit('forceTeleport', { mapId: p.mapId, x: p.x, y: p.y });
                    return; 
                }
            }
        }

        // If movement is legal, update server and broadcast to others
        p.x = data.x; p.y = data.y; p.spriteData.weapon = data.weaponSprite;
        
       // 🌟 ADMIN SPECTATOR FIX & AURA SYNC: Include spriteData in the broadcast!
        if (!p.isHiddenAdmin) {
            socket.to(p.instanceId).emit('remotePlayerMoved', { 
                id: p.id, x: data.x, y: data.y, state: data.state, 
                facingRight: data.facingRight, weaponSprite: data.weaponSprite,
                spriteData: p.spriteData // <--- THIS WAS MISSING! It syncs the Aura!
            });
        }
    });

  socket.on('tauntMonsters', () => { // 🛡️ Ignored client data
    const p = onlinePlayers[socket.id];
    if (!p || p.isGhost) return;
    if (p.mapId === 'town' || p.baseStats?.playerClass !== 'Berserker') return;

    const now = Date.now();
    if (p.skillCooldowns['tauntMonsters'] && now < p.skillCooldowns['tauntMonsters']) return;
    p.skillCooldowns['tauntMonsters'] = now + 13000;

    // ✅ SERVER now also stores the defensive taunt buff duration
    p.tauntBuffUntil = now + 10000;

    const world = worlds[p.instanceId];
    if (!world) return;

    for (let mId in world.monsters) {
        let m = world.monsters[mId];
        if (!m.alive) continue;

        let dist = Math.hypot(
            p.x + 24 - (m.x + m.width / 2),
            p.y + 48 - (m.y + m.height / 2)
        );

        if (dist <= 300) {
            m.forcedTargetId = p.id;
            m.forcedUntil = now + 10000;
        }
    }
});

  socket.on('syncPet', (data) => {
        const p = onlinePlayers[socket.id]; if(!p) return;
        if (p.mapId === 'town') return; 
        const world = worlds[p.instanceId]; if(!world) return;
        if (!world.pets) world.pets = {};
        
        // 🛡️ 25s COOLDOWN (23s leniency) ON NEW SUMMONS
        if (data.alive) { 
            const now = Date.now();
            if (p.skillCooldowns['summonPet'] && now < p.skillCooldowns['summonPet']) return;
            p.skillCooldowns['summonPet'] = now + 23000;

            let myPetCount = Object.values(world.pets).filter(pet => pet.ownerId === p.id).length;
            if (myPetCount >= 2 && !world.pets[data.id]) return; 
            world.pets[data.id] = { id: data.id, ownerId: p.id, x: data.x, y: data.y }; 
        } 
        else { delete world.pets[data.id]; }
        
        socket.to(p.instanceId).emit('remotePetSync', { ownerId: p.id, petData: data });
    });

    socket.on('setUntargetable', () => { // 🛡️ Ignored client data
        const p = onlinePlayers[socket.id];
        if (p && p.mapId !== 'town' && p.baseStats?.playerClass === 'Blademaster') { 
            const now = Date.now();
            if (p.skillCooldowns['setUntargetable'] && now < p.skillCooldowns['setUntargetable']) return;
            p.skillCooldowns['setUntargetable'] = now + 14000;

            p.untargetableUntil = Date.now() + 10000; // 🛡️ Server enforces 10s
        }
    });

  socket.on('attackMonster', (payload) => {
        const p = onlinePlayers[socket.id]; if (!p || p.isGhost) return; 
        if (p.mapId === 'town') return; 
        const now = Date.now();

        // 👇 WRAP THE ANTI-CHEAT SO PETS DON'T EAT YOUR SWINGS 👇
        if (payload.skillId !== 'pet') {
            // 🛡️ ANTI-CHEAT: MACRO BLOCKER
            if (p.lastAttackTime && now - p.lastAttackTime < 300) return;
            p.lastAttackTime = now;

            // 🛡️ ANTI-CHEAT: TOKEN BUCKET
            p.lastTokenRefill = p.lastTokenRefill || now;
            const timePassed = now - p.lastTokenRefill;
            const tokensToAdd = Math.floor(timePassed / 700); 
            if (tokensToAdd > 0) {
                p.attackTokens = Math.min(3, (p.attackTokens || 0) + tokensToAdd); 
                p.lastTokenRefill = now - (timePassed % 700);
            }
            if (p.attackTokens <= 0) return;
            p.attackTokens--; 
        }
        // 👆 END OF WRAPPER 👆

        const world = worlds[p.instanceId]; if (!world) return;
        const m = world.monsters[payload.monsterId]; 
        if (!m || !m.alive) return;
        
        const pcx = p.x + 24; const pcy = p.y + 48; const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2); const dist = Math.hypot(pcx - mcx, pcy - mcy); 
        if (dist > 350) return;
        
        // 🛡️ 100% SERVER-SIDE MATH: The client's opinions are ignored entirely.
        let isMagicClass = ['Healer', 'Summoner', 'Ice Master'].includes(p.baseStats?.playerClass);
        let serverAtkPwr = isMagicClass ? getServerMagicAttack(p) : getServerAttackPower(p);
        let isPendant = p.equips?.weapon?.sprite?.includes('pendant') || false;
        
        // Base Swing (90% to 110%)
        let trueDmg = Math.floor(serverAtkPwr * (0.9 + Math.random() * 0.2));
        let pClass = p.baseStats?.playerClass;

        // Skill Multipliers applied on the server with Identity Checking
        if (payload.skillId === 'bld3') {
            if (pClass !== 'Blademaster') return; // Hacker check!
            if (p.skillCooldowns['heavyAttack'] && now < p.skillCooldowns['heavyAttack'] && p.id !== "Kei") {
                trueDmg = Math.floor(serverAtkPwr);
            } else {
                trueDmg = Math.floor(serverAtkPwr * 5);
                p.skillCooldowns['heavyAttack'] = now + 49000; // 50s CD
            }
        } else if (payload.skillId === 'ice1') {
            if (pClass !== 'Ice Master') return; // Hacker check!
            if (p.skillCooldowns['ice1'] && now < p.skillCooldowns['ice1'] && p.id !== "Kei") {
                trueDmg = Math.floor(serverAtkPwr); // Hacker spamming? Revert to basic damage.
            } else {
                trueDmg = Math.floor(serverAtkPwr * 2);
                p.skillCooldowns['ice1'] = now + 23000; // 25s CD
            }
        } else if (payload.skillId === 'ice3') {
            if (pClass !== 'Ice Master') return; // Hacker check!
            if (p.skillCooldowns['ice3'] && now < p.skillCooldowns['ice3'] && p.id !== "Kei") {
                trueDmg = Math.floor(serverAtkPwr); 
            } else {
                trueDmg = Math.floor(serverAtkPwr * 6); // 3 icicles * 2x damage = 6x total
                p.skillCooldowns['ice3'] = now + 98000; // 100s CD
            }
        } else if (payload.skillId === 'pet') {
            trueDmg = Math.floor(serverAtkPwr * 0.25);
        }

        const dmg = Math.max(1, trueDmg - (m.def || 0)); 
        m.currentHp -= dmg; if (m.currentHp < 0) m.currentHp = 0; m.threatTable[p.id] = (m.threatTable[p.id] || 0) + dmg;
        
        // Server controls Freeze logic exclusively
        let didFreeze = false;
        if (p.baseStats?.playerClass === 'Ice Master' && p.level >= 25 && (payload.skillId === 'basic' || payload.skillId === 'ice1' || payload.skillId === 'ice3')) {
            if (Math.random() < 0.25) {
                m.frozenUntil = Date.now() + 3000;
                didFreeze = true; // 🛡️ Flag it!
            }
        }

        io.to(p.instanceId).emit('monsterHit', { monsterId: m.id, attackerId: p.id, damage: dmg, newHp: m.currentHp, maxHp: m.maxHp, isPendant: isPendant, didFreeze: didFreeze });
        
    if (m.currentHp <= 0) {
        m.alive = false;
        m.targetId = null;
        m.threatTable = {};
        m.forcedTargetId = null;
        m.forcedUntil = 0;
        m.frozenUntil = 0;

        io.to(p.instanceId).emit('monsterDied', {
            monsterId: m.id,
            killerId: p.id
        });

        const expAmount = m.expYield || 25;
        const goldAmount = m.goldYield || 15;
        const pid = playerParty[p.id];

        // 🛡️ SERVER-AUTHORITATIVE REWARDS ENGINE
        const processRewards = async (targetPlayer, targetSid) => {
            if (!targetPlayer) return;

            targetPlayer.exp += expAmount;
            targetPlayer.gold += goldAmount;

            let drop = generateLoot(m);
            let dropAccepted = drop && playerAcceptsLoot(targetPlayer, drop);

            if (dropAccepted) {
                // 🛡️ Server puts the item directly into the server inventory securely
                const inv = Array.isArray(targetPlayer.inventory) ? targetPlayer.inventory : new Array(20).fill(null);
                let stacked = false;

                if (['potion', 'material', 'consumable'].includes(drop.type)) {
                    let idx = inv.findIndex(i => i && i.name === drop.name);
                    if (idx !== -1) {
                        inv[idx].quantity = (inv[idx].quantity || 1) + (drop.quantity || 1);
                        stacked = true;
                    }
                }

                if (!stacked) {
                    let emptySlot = inv.findIndex(i => i === null);
                    if (emptySlot !== -1) inv[emptySlot] = drop;
                }
                targetPlayer.inventory = inv;
            }

            // 🛡️ INSTANT SUPABASE SAVE: Locks the item in permanently before the client even sees it!
            supabase.from('Exonians').update({
                gold: targetPlayer.gold,
                exp: targetPlayer.exp,
                inventory: targetPlayer.inventory
            }).eq('character_name', targetPlayer.id).then(() => {});

            if (targetSid) {
                io.to(targetSid).emit('receiveExp', { amount: expAmount, gold: goldAmount, source: m.name });
                
                // 🛡️ Force the client to visually update with the true server inventory
                io.to(targetSid).emit('syncInventory', targetPlayer.inventory);

                if (dropAccepted) {
                    // Still emits to trigger your frontend Combat Log text!
                    io.to(targetSid).emit('lootDropped', drop); 

                    if (drop.rarity === 'Legendary' || drop.rarity === 'Godly') {
                        io.emit('rareLootBroadcast', {
                            playerName: targetPlayer.name || targetPlayer.id,
                            itemName: drop.name,
                            rarity: drop.rarity,
                            level: drop.level,
                            color: drop.color
                        });
                    }
                } else if (drop) {
                    io.to(targetSid).emit('systemMessage', `Filtered loot ignored: ${drop.name} [${drop.rarity}]`);
                }
            }
        };

        // Distribute rewards to Party or Solo
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                processRewards(getPlayerById(memberId), findSocketIdByPlayerId(memberId));
            }
        } else {
            processRewards(p, socket.id);
        }

        // Respawn Logic
        if (m.respawnDelayMs !== -1) {
            setTimeout(() => {
                const cfg = {
                    spawnArea: { minX: m.homeX, maxX: m.homeX, minY: m.homeY, maxY: m.homeY },
                    level: m.level
                };
                const nm = spawnMonster(p.instanceId, m.id, m.originalKey || m.monsterKey, cfg);
                world.monsters[m.id] = nm;
                io.to(p.instanceId).emit('monsterSpawned', serializeMonster(nm));
            }, m.respawnDelayMs || 10000);
        }
    }
    });

    socket.on('inspectRequest', (data) => {
        const targetId = data.targetId;
        const target = getPlayerById(targetId);
        if (target) {
            socket.emit('inspectData', { id: target.id, name: target.name, level: target.level || 1, currentHp: target.currentHp || 0, maxHp: target.maxHp || 100, equips: target.equips || { weapon: null, armor: null, leggings: null } });
        }
    });

    socket.on('tradeRequest', (data) => {
        const me = onlinePlayers[socket.id]; if (!me || !data.targetId) return;
        const targetSid = findSocketIdByPlayerId(data.targetId);
        if (!targetSid) return socket.emit('partyError', 'Target is not online.');
        io.to(targetSid).emit('tradeInviteReceived', { fromId: me.id });
    });

 socket.on('tradeInviteResponse', (data) => {
    const me = onlinePlayers[socket.id];
    if (!me || !data.fromId) return;

    const fromSid = findSocketIdByPlayerId(data.fromId);
    const targetPlayer = getPlayerById(data.fromId);
    if (!fromSid || !targetPlayer) return;

    if (data.accept) {
        me.tradeTarget = targetPlayer.id;
        targetPlayer.tradeTarget = me.id;

        // Reset trade session state
        me.currentTradeOffer = { gold: 0, items: [] };
        targetPlayer.currentTradeOffer = { gold: 0, items: [] };
        me.tradeConfirmed = false;
        targetPlayer.tradeConfirmed = false;

        socket.emit('tradeStarted', { targetId: data.fromId });
        io.to(fromSid).emit('tradeStarted', { targetId: me.id });

        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(fromSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
    } else {
        io.to(fromSid).emit('partyError', `${me.id} declined your trade request.`);
    }
});

  socket.on('tradeSync', (data) => {
    const me = onlinePlayers[socket.id];
    if (!me || !me.tradeTarget) return;

    const them = getPlayerById(me.tradeTarget);
    const targetSid = findSocketIdByPlayerId(me.tradeTarget);
    if (!them || !targetSid) return;

    // Save THIS player's latest offer on the server
    me.currentTradeOffer = {
        gold: Math.max(0, parseInt(data.gold) || 0),
        items: Array.isArray(data.items) ? data.items.filter(Boolean) : []
    };

    // Any change to offer resets both confirmations
    me.tradeConfirmed = false;
    them.tradeConfirmed = false;

    io.to(targetSid).emit('tradeSyncReceived', {
        gold: me.currentTradeOffer.gold,
        items: me.currentTradeOffer.items
    });

    socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
    io.to(targetSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
});

socket.on('tradeCancel', () => {
    const me = onlinePlayers[socket.id];
    if (!me || !me.tradeTarget) return;

    const targetSid = findSocketIdByPlayerId(me.tradeTarget);
    const targetPlayer = getPlayerById(me.tradeTarget);

    me.tradeTarget = null;
    me.currentTradeOffer = null;
    me.tradeConfirmed = false;

    if (targetPlayer) {
        targetPlayer.tradeTarget = null;
        targetPlayer.currentTradeOffer = null;
        targetPlayer.tradeConfirmed = false;
    }

    if (targetSid) io.to(targetSid).emit('tradeCancelled');
});
socket.on('requestConfirmTrade', () => {
    const me = onlinePlayers[socket.id];
    if (!me || !me.tradeTarget) return;

    const them = getPlayerById(me.tradeTarget);
    const themSid = findSocketIdByPlayerId(me.tradeTarget);
    if (!them || !themSid) return;

    if (!me.currentTradeOffer) me.currentTradeOffer = { gold: 0, items: [] };
    if (!them.currentTradeOffer) them.currentTradeOffer = { gold: 0, items: [] };

    // Mark ONLY this player as confirmed first
    me.tradeConfirmed = true;

    // Tell both clients current confirm state
    socket.emit('tradeConfirmStatus', { meConfirmed: true, otherConfirmed: !!them.tradeConfirmed });
    io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: !!them.tradeConfirmed, otherConfirmed: true });

    // Stop here until BOTH players confirm
    if (!them.tradeConfirmed) {
        socket.emit('systemMessage', 'Trade confirmed. Waiting for the other player...');
        io.to(themSid).emit('systemMessage', `${me.id} confirmed the trade.`);
        return;
    }

    const myOffer = me.currentTradeOffer || { gold: 0, items: [] };
    const theirOffer = them.currentTradeOffer || { gold: 0, items: [] };

    const myGoldOffer = Math.max(0, parseInt(myOffer.gold) || 0);
    const theirGoldOffer = Math.max(0, parseInt(theirOffer.gold) || 0);

    // Safety: both players must actually still have the gold they offered
    if ((me.gold || 0) < myGoldOffer) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: you no longer have enough gold.');
        io.to(themSid).emit('systemMessage', 'Trade failed: other player no longer has enough gold.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

    if ((them.gold || 0) < theirGoldOffer) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: other player no longer has enough gold.');
        io.to(themSid).emit('systemMessage', 'Trade failed: you no longer have enough gold.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

    // Verify exact offered item IDs still exist
    let myValidItems = [];
    let theirValidItems = [];

    if (Array.isArray(myOffer.items)) {
        for (const offeredItem of myOffer.items) {
            if (!offeredItem || !offeredItem.id) continue;
            const realIdx = me.inventory.findIndex(invItem => invItem && invItem.id === offeredItem.id);
            if (realIdx === -1) {
                me.tradeConfirmed = false;
                them.tradeConfirmed = false;
                socket.emit('systemMessage', 'Trade failed: one of your offered items is missing.');
                io.to(themSid).emit('systemMessage', 'Trade failed: other player changed or lost an offered item.');
                socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                return;
            }
            myValidItems.push({ index: realIdx, item: me.inventory[realIdx] });
        }
    }

    if (Array.isArray(theirOffer.items)) {
        for (const offeredItem of theirOffer.items) {
            if (!offeredItem || !offeredItem.id) continue;
            const realIdx = them.inventory.findIndex(invItem => invItem && invItem.id === offeredItem.id);
            if (realIdx === -1) {
                me.tradeConfirmed = false;
                them.tradeConfirmed = false;
                socket.emit('systemMessage', 'Trade failed: other player changed or lost an offered item.');
                io.to(themSid).emit('systemMessage', 'Trade failed: one of your offered items is missing.');
                socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                return;
            }
            theirValidItems.push({ index: realIdx, item: them.inventory[realIdx] });
        }
    }

    // Inventory capacity check before doing anything
    const myFreeSlots = me.inventory.filter(i => i === null).length;
    const theirFreeSlots = them.inventory.filter(i => i === null).length;

    const myItemsGiven = myValidItems.length;
    const theirItemsGiven = theirValidItems.length;

    const myNetIncoming = theirItemsGiven - myItemsGiven;
    const theirNetIncoming = myItemsGiven - theirItemsGiven;

    if (myFreeSlots < Math.max(0, myNetIncoming)) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: not enough inventory space on your side.');
        io.to(themSid).emit('systemMessage', 'Trade failed: other player does not have enough inventory space.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

    if (theirFreeSlots < Math.max(0, theirNetIncoming)) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: other player does not have enough inventory space.');
        io.to(themSid).emit('systemMessage', 'Trade failed: not enough inventory space on your side.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

    // Remove offered gold
    me.gold -= myGoldOffer;
    them.gold -= theirGoldOffer;

    // Add received gold
    me.gold += theirGoldOffer;
    them.gold += myGoldOffer;

    // Remove offered items by exact ID/index
    const removedFromMe = [];
    const removedFromThem = [];

    myValidItems.forEach(entry => {
        removedFromMe.push(entry.item);
        me.inventory[entry.index] = null;
    });

    theirValidItems.forEach(entry => {
        removedFromThem.push(entry.item);
        them.inventory[entry.index] = null;
    });

    // Give received items
    removedFromThem.forEach(item => {
        const emptyIdx = me.inventory.findIndex(i => i === null);
        if (emptyIdx !== -1) me.inventory[emptyIdx] = item;
    });

    removedFromMe.forEach(item => {
        const emptyIdx = them.inventory.findIndex(i => i === null);
        if (emptyIdx !== -1) them.inventory[emptyIdx] = item;
    });

    // Clear trade state
    me.currentTradeOffer = null;
    them.currentTradeOffer = null;
    me.tradeConfirmed = false;
    them.tradeConfirmed = false;
    me.tradeTarget = null;
    them.tradeTarget = null;

    // Save to Supabase
    supabase.from('Exonians').update({ gold: me.gold, inventory: me.inventory }).eq('character_name', me.id).then(()=>{});
    supabase.from('Exonians').update({ gold: them.gold, inventory: them.inventory }).eq('character_name', them.id).then(()=>{});

    socket.emit('tradeDone', { newGold: me.gold, newInventory: me.inventory });
    io.to(themSid).emit('tradeDone', { newGold: them.gold, newInventory: them.inventory });

    socket.emit('systemMessage', 'Trade completed successfully.');
    io.to(themSid).emit('systemMessage', 'Trade completed successfully.');
});

    socket.on('playerVitals', (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    // Do NOT trust client HP / maxHp.
    // Only allow level sync if needed for UI.
    p.level = clamp(data.level ?? p.level, 1, 50);

    const pid = playerParty[p.id];
    if (pid && parties[pid]) {
        for (const memberId of parties[pid].members) {
            if (memberId !== p.id) {
                const sid = findSocketIdByPlayerId(memberId);
                if (sid) {
                    io.to(sid).emit('partyMemberVitals', {
                        id: p.id,
                        currentHp: p.currentHp,
                        maxHp: p.maxHp,
                        level: p.level
                    });
                }
            }
        }
    }
});
socket.on('useInventoryItem', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    p.inventory = sanitizeInventory(p.inventory);
    p.equips = sanitizeEquips(p.equips);
    p.baseStats = sanitizeBaseStats(p.baseStats);

    const inv = p.inventory;
    const index = typeof data?.index === 'number' ? data.index : -1;

    if (index < 0 || index >= inv.length || !inv[index]) {
        return socket.emit('systemMessage', 'Item not found.');
    }

    const item = sanitizeItem(inv[index]);
    if (!item) {
        inv[index] = null;
        p.inventory = inv;
        await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
        socket.emit('syncInventory', p.inventory);
        return;
    }

    // POTION
    if (item.type === 'potion') {
        const healAmount = clamp(item.fixedStat?.hpHeal || 0, 0, 999999);
        const trueMaxHp = getServerTotalStat(p, 'hp') || p.maxHp || 100;

        p.maxHp = trueMaxHp;
        p.currentHp = Math.min(trueMaxHp, (p.currentHp || 0) + healAmount);

        item.quantity = (item.quantity || 1) - 1;
        inv[index] = item.quantity > 0 ? item : null;
        p.inventory = inv;

        await supabase
            .from('Exonians')
            .update({
                inventory: p.inventory,
                current_hp: p.currentHp,
                equips: sanitizeEquips(p.equips),
                base_stats: sanitizeBaseStats(p.baseStats)
            })
            .eq('character_name', p.id);

        socket.emit('inventoryItemUsed', {
            inventory: p.inventory,
            currentHp: p.currentHp,
            itemName: item.name,
            healAmount
        });

        const pid = playerParty[p.id];
        if (pid) emitPartyUpdate(pid);
        return;
    }

    // CLASS RESET BOOK
    if (item.type === 'consumable' && item.name === 'Class Reset Book') {
        if (!p.baseStats.playerClass) {
            return socket.emit('systemMessage', "You don't have a class to reset yet!");
        }

        p.baseStats.playerClass = null;

        item.quantity = (item.quantity || 1) - 1;
        inv[index] = item.quantity > 0 ? item : null;
        p.inventory = inv;

        await supabase
            .from('Exonians')
            .update({
                inventory: p.inventory,
                base_stats: sanitizeBaseStats(p.baseStats)
            })
            .eq('character_name', p.id);

        socket.emit('inventoryItemUsed', {
            inventory: p.inventory,
            currentHp: p.currentHp,
            itemName: item.name,
            classReset: true
        });

        return;
    }

    // EQUIP
    if (item.type === 'weapon' || item.type === 'armor' || item.type === 'leggings') {
        const slot = item.type;
        const oldEquip = p.equips[slot] ? sanitizeItem(p.equips[slot]) : null;

        p.equips[slot] = item;
        inv[index] = oldEquip;
        p.inventory = sanitizeInventory(inv);
        p.equips = sanitizeEquips(p.equips);

        const trueMaxHp = getServerTotalStat(p, 'hp') || 100;
        p.maxHp = trueMaxHp;
        p.currentHp = Math.min(p.currentHp || trueMaxHp, trueMaxHp);

        p.spriteData.weapon = p.equips?.weapon?.sprite || null;
        p.spriteData.aura = p.equips?.armor?.aura || null;

        await supabase
            .from('Exonians')
            .update({
                inventory: p.inventory,
                equips: p.equips,
                current_hp: p.currentHp
            })
            .eq('character_name', p.id);

        socket.emit('syncInventory', p.inventory);
        socket.emit('inventoryItemUsed', {
            inventory: p.inventory,
            equips: p.equips,        // 🛡️ THE FIX: Send the equips back to the client!
            currentHp: p.currentHp,
            itemName: item.name
        });

        socket.emit('remotePlayerMoved', {
            id: p.id,
            x: p.x,
            y: p.y,
            state: 'idle',
            facingRight: false,
            weaponSprite: p.spriteData.weapon,
            spriteData: p.spriteData
        });

        socket.to(p.instanceId).emit('remotePlayerMoved', {
            id: p.id,
            x: p.x,
            y: p.y,
            state: 'idle',
            facingRight: false,
            weaponSprite: p.spriteData.weapon,
            spriteData: p.spriteData
        });

        return;
    }

    socket.emit('systemMessage', 'That item cannot be used this way.');
});
    socket.on('chatMessage', (data) => { 
        const p = onlinePlayers[socket.id]; 
        if (!p || !data.text) return; 
        
        // 🛡️ ANTI-CHEAT: CHAT SPAM & BOMB PROTECTION
        const now = Date.now();
        if (p.lastChatTime && now - p.lastChatTime < 500) return; // Max 1 message per 0.5s
        p.lastChatTime = now;

        // Force string type and slice it to a max of 120 characters
        let safeText = String(data.text).slice(0, 120); 
        
        io.to(p.instanceId).emit('chatMessage', { id: p.id, text: safeText }); 
    });
    socket.on('partyInvite', ({ targetId }) => { const me = onlinePlayers[socket.id]; if (!me || !targetId) return; const targetSid = findSocketIdByPlayerId(targetId); if (!targetSid) return socket.emit('partyError', 'Target is not online.'); io.to(targetSid).emit('partyInviteReceived', { fromId: me.id }); });
    
    socket.on('partyInviteResponse', ({ fromId, accept }) => {
        const me = onlinePlayers[socket.id]; if (!me || !fromId) return; const fromSid = findSocketIdByPlayerId(fromId); const inviter = getPlayerById(fromId); if (!inviter || !fromSid) return;
        if (!accept) { io.to(fromSid).emit('partyError', `${me.id} declined your party invite.`); return; }
        let pid = playerParty[fromId]; if (!pid) { pid = `party_${Date.now()}_${Math.floor(Math.random() * 9999)}`; parties[pid] = { id: pid, leaderId: fromId, members: new Set([fromId]) }; playerParty[fromId] = pid; }
        if (playerParty[me.id] && playerParty[me.id] !== pid) { removeFromParty(me.id); }
        parties[pid].members.add(me.id); playerParty[me.id] = pid; emitPartyUpdate(pid);
    });
// ✅ GLOBAL ADMIN BROADCAST
   // ✅ GLOBAL ADMIN BROADCAST
    socket.on('adminBroadcast', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.id !== "Kei") return; // 🛡️ SECURITY: Only the real Kei can do this!

        // Broadcasts an unmissable yellow system message to EVERY single player online
        io.emit('systemMessage', `[SERVER ANNOUNCEMENT] ${data.text}`);
    });
    socket.on('leaveParty', () => {
        const p = onlinePlayers[socket.id];
        if (p && playerParty[p.id]) {
            removeFromParty(p.id);
            if (p.mapId !== 'town') { socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 }); }
        }
    });

   socket.on('forceTeleport', (tp) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        
        const oldInstId = p.instanceId; // 🌟 SAVE OLD INSTANCE
        socket.leave(p.instanceId); socket.to(p.instanceId).emit('remotePlayerLeft', p.id); 
        
        if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
            for (let petId in worlds[p.instanceId].pets) { if (worlds[p.instanceId].pets[petId].ownerId === p.id) delete worlds[p.instanceId].pets[petId]; }
        }

        p.mapId = tp.mapId; p.x = tp.x; p.y = tp.y; p.currentPortal = null;
        p.instanceId = getInstanceId(p.id, tp.mapId); 
        socket.join(p.instanceId);
        
        checkAndResetInstance(oldInstId); // 🌟 RUN THE RESET CHECK
        
        socket.emit('forceTeleport', tp); 
        socket.to(p.instanceId).emit('remotePlayerJoined', { id: p.id, name: p.name, mapId: p.mapId, instanceId: p.instanceId, x: p.x, y: p.y, spriteData: p.spriteData, isGhost: p.isGhost });
        
        // 🌟 FIX: Ensures the newly teleported player loads the room's population!
        const playersInInst = Object.values(onlinePlayers).filter(remote => remote.instanceId === p.instanceId && remote.id !== p.id);
        socket.emit('mapPlayersList', playersInInst.map(pp => ({ id: pp.id, name: pp.name, mapId: pp.mapId, x: pp.x, y: pp.y, spriteData: pp.spriteData, isGhost: pp.isGhost })));
        
        supabase.from('Exonians').update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y }).eq('character_name', p.id).then(()=>{});
    });

      socket.on('playerTeleported', async (data) => {
        if (!onlinePlayers[socket.id]) return;
        const p = onlinePlayers[socket.id];

        const oldInstId = p.instanceId;
        socket.leave(p.instanceId);
        socket.to(p.instanceId).emit('remotePlayerLeft', p.id);

        if (p.mapId === 'town') p.currentHp = p.maxHp;

        if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
            for (let petId in worlds[p.instanceId].pets) {
                if (worlds[p.instanceId].pets[petId].ownerId === p.id) {
                    delete worlds[p.instanceId].pets[petId];
                }
            }
        }

        p.mapId = data.mapId;
        p.x = data.x;
        p.y = data.y;
        p.currentPortal = null;
        p.instanceId = getInstanceId(p.id, data.mapId);

        socket.join(p.instanceId);

        checkAndResetInstance(oldInstId);

        // Build the world immediately from the map data coming from the client
        if (data.mapData) {
            ensureWorldFromMapData(p.instanceId, data.mapData);
        }

        // Keep your existing sync flow too
        socket.emit('requestMapSync', { mapId: data.mapId, instanceId: p.instanceId });

        socket.to(p.instanceId).emit('remotePlayerJoined', {
            id: p.id,
            name: p.name,
            mapId: p.mapId,
            instanceId: p.instanceId,
            x: p.x,
            y: p.y,
            spriteData: p.spriteData,
            isGhost: p.isGhost
        });

        const playersInInst = Object.values(onlinePlayers).filter(
            remote => remote.instanceId === p.instanceId && remote.id !== p.id
        );

        socket.emit('mapPlayersList', playersInInst.map(pp => ({
            id: pp.id,
            name: pp.name,
            mapId: pp.mapId,
            x: pp.x,
            y: pp.y,
            spriteData: pp.spriteData,
            isGhost: pp.isGhost
        })));

        // Send monster list immediately so the client renders them right away
        if (worlds[p.instanceId]) {
            socket.emit(
                'monsterState',
                Object.values(worlds[p.instanceId].monsters).map(serializeMonster)
            );
        }

        supabase
            .from('Exonians')
            .update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y })
            .eq('character_name', currentUser)
            .then(() => {});
    });

   socket.on('respawnPlayer', () => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    const trueMaxHp = getServerTotalStat(p, 'hp') || p.maxHp || 100;

    // If already in town, just revive in place
    if (p.mapId === 'town') {
        p.isGhost = false;
        p.currentHp = trueMaxHp;
        p.maxHp = trueMaxHp;
        p.currentPortal = null;
        p.untargetableUntil = 0;
        p.tauntBuffUntil = 0;

        io.to(p.instanceId).emit('playerRevived', {
            id: p.id,
            currentHp: p.currentHp
        });

        const pid = playerParty[p.id];
        if (pid) emitPartyUpdate(pid);

        supabase
            .from('Exonians')
            .update({
                map_id: 'town',
                pos_x: p.x,
                pos_y: p.y,
                current_hp: p.currentHp
            })
            .eq('character_name', p.id)
            .then(() => {});

        return;
    }

    // Real respawn flow: leave old map, go to town, then revive
    const oldInstId = p.instanceId;

    socket.leave(p.instanceId);
    socket.to(p.instanceId).emit('remotePlayerLeft', p.id);

    if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
        for (let petId in worlds[p.instanceId].pets) {
            if (worlds[p.instanceId].pets[petId].ownerId === p.id) {
                delete worlds[p.instanceId].pets[petId];
            }
        }
    }

    p.mapId = 'town';
    p.x = 960;
    p.y = 1000;
    p.instanceId = getInstanceId(p.id, 'town');
    p.currentPortal = null;
    p.isGhost = false;
    p.maxHp = trueMaxHp;
    p.currentHp = trueMaxHp;
    p.untargetableUntil = 0;
    p.tauntBuffUntil = 0;

    socket.join(p.instanceId);

    checkAndResetInstance(oldInstId);

    socket.emit('forceTeleport', {
        mapId: 'town',
        x: 960,
        y: 1000
    });

    socket.to(p.instanceId).emit('remotePlayerJoined', {
        id: p.id,
        name: p.name,
        mapId: p.mapId,
        instanceId: p.instanceId,
        x: p.x,
        y: p.y,
        spriteData: p.spriteData,
        isGhost: false
    });

    const playersInInst = Object.values(onlinePlayers).filter(
        remote => remote.instanceId === p.instanceId && remote.id !== p.id
    );

    socket.emit('mapPlayersList', playersInInst.map(pp => ({
        id: pp.id,
        name: pp.name,
        mapId: pp.mapId,
        x: pp.x,
        y: pp.y,
        spriteData: pp.spriteData,
        isGhost: pp.isGhost
    })));

    socket.emit('playerRevived', {
        id: p.id,
        currentHp: p.currentHp
    });

    const pid = playerParty[p.id];
    if (pid) emitPartyUpdate(pid);

    supabase
        .from('Exonians')
        .update({
            map_id: 'town',
            pos_x: 960,
            pos_y: 1000,
            current_hp: p.currentHp
        })
        .eq('character_name', p.id)
        .then(() => {});
});
    // 🌟 NEW: IN-PLACE REVIVAL FOR JUICE
    socket.on('localRevive', () => {
        const p = onlinePlayers[socket.id];
        if (p && p.isGhost) {
            p.isGhost = false;
            p.currentHp = p.maxHp || 100;
            io.to(p.instanceId).emit('playerRevived', { id: p.id, currentHp: p.currentHp });
        }
    });
socket.on('playerDied', () => {
    const p = onlinePlayers[socket.id];
    if (!p || p.isGhost) return;

    p.isGhost = true;
    p.currentHp = 0;
    p.currentPortal = null;

    io.to(p.instanceId).emit('remotePlayerGhosted', p.id);

    const pid = playerParty[p.id];

    // Solo player = show death screen immediately
    if (!pid || !parties[pid]) {
        socket.emit('showDeathScreen');
        return;
    }

    // Party player = only show death screen if whole party is dead
    const party = parties[pid];
    let allDead = true;

    for (const memberId of party.members) {
        const member = getPlayerById(memberId);
        if (member && !member.isGhost) {
            allDead = false;
            break;
        }
    }

    if (allDead) {
        for (const memberId of party.members) {
            const memberSid = findSocketIdByPlayerId(memberId);
            if (memberSid) {
                io.to(memberSid).emit('showDeathScreen');
            }
        }
        io.to(p.instanceId).emit('partyWiped');
    }

    emitPartyUpdate(pid);
});
// ✅ FETCH ALL NEWS AND SEND AS A QUEUE
    socket.on('requestNews', async () => {
        try {
            // Fetches all rows, ordered by ID (1, 2, 3...)
            const { data: newsList } = await supabase.from('Game_News').select('*').order('id', { ascending: true });
            socket.emit('latestNews', newsList || []);
        } catch(e) {
            socket.emit('latestNews', []);
        }
    });
    // 🌟 ADMIN SPECTATE ENGINE
  socket.on('requestSpectate', (targetId) => {
    const p = onlinePlayers[socket.id];
    if (!p || p.id !== "Kei") return;

    const target = getPlayerById(targetId);
    if (!target) return;

    if (!p.savedSpectatePos) {
        p.savedSpectatePos = {
            mapId: p.mapId,
            x: p.x,
            y: p.y,
            instanceId: p.instanceId,
            wasGhost: !!p.isGhost
        };
    }

    // Admin becomes hidden + ghost while spectating
    p.isHiddenAdmin = true;
    p.isGhost = true;
    p.currentPortal = null;
    p.untargetableUntil = Date.now() + 999999999;

    socket.leave(p.instanceId);
    socket.to(p.instanceId).emit('remotePlayerLeft', p.id);

    p.mapId = target.mapId;
    p.x = target.x;
    p.y = target.y;
    p.instanceId = target.instanceId;

    socket.join(p.instanceId);

    socket.emit('forceTeleport', {
        mapId: p.mapId,
        x: p.x,
        y: p.y,
        spectateTarget: targetId
    });

    const playersInInst = Object.values(onlinePlayers).filter(remote =>
        remote.instanceId === p.instanceId &&
        remote.id !== p.id &&
        !remote.isHiddenAdmin
    );

    socket.emit('mapPlayersList', playersInInst.map(pp => ({
        id: pp.id,
        name: pp.name,
        mapId: pp.mapId,
        x: pp.x,
        y: pp.y,
        spriteData: pp.spriteData,
        isGhost: pp.isGhost
    })));
});

   socket.on('stopSpectate', () => {
    const p = onlinePlayers[socket.id];
    if (!p || p.id !== "Kei" || !p.savedSpectatePos) return;

    const tp = p.savedSpectatePos;
    p.savedSpectatePos = null;

    socket.leave(p.instanceId);

    p.isHiddenAdmin = false;
    p.isGhost = !!tp.wasGhost;
    p.untargetableUntil = 0;
    p.currentPortal = null;

    p.mapId = tp.mapId;
    p.x = tp.x;
    p.y = tp.y;
    p.instanceId = tp.instanceId;

    socket.join(p.instanceId);

    socket.emit('forceTeleport', {
        mapId: p.mapId,
        x: p.x,
        y: p.y
    });

    socket.to(p.instanceId).emit('remotePlayerJoined', {
        id: p.id,
        name: p.name,
        mapId: p.mapId,
        instanceId: p.instanceId,
        x: p.x,
        y: p.y,
        spriteData: p.spriteData,
        isGhost: p.isGhost
    });

    const playersInInst = Object.values(onlinePlayers).filter(remote =>
        remote.instanceId === p.instanceId &&
        remote.id !== p.id &&
        !remote.isHiddenAdmin
    );

    socket.emit('mapPlayersList', playersInInst.map(pp => ({
        id: pp.id,
        name: pp.name,
        mapId: pp.mapId,
        x: pp.x,
        y: pp.y,
        spriteData: pp.spriteData,
        isGhost: pp.isGhost
    })));
});
   socket.on('requestEnhance', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    p.inventory = sanitizeInventory(p.inventory);

    let stone = p.inventory[data.stoneIndex];
    let targetItem = p.inventory[data.targetIndex];

    if (!stone || !targetItem || stone.type !== 'material') return;
    if (!VALID_RARITIES.includes(targetItem.rarity)) return;

    const maxAllowed = MAX_ENHANCE_BY_RARITY[targetItem.rarity] || 0;
    const currentEnhance = clamp(targetItem.enhanceLevel || 0, 0, 20);

    if (currentEnhance >= maxAllowed) {
        socket.emit('systemMessage', `${targetItem.rarity} items cannot go above +${maxAllowed}.`);
        socket.emit('syncInventory', p.inventory);
        return;
    }

    stone.quantity = (stone.quantity || 1) - 1;
    if (stone.quantity <= 0) p.inventory[data.stoneIndex] = null;

    let successChance = 1.0;
    let destroyChance = 0.0;

    if (currentEnhance >= 6) {
        successChance = Math.max(0.15, 1.0 - ((currentEnhance - 5) * 0.15));
        destroyChance = Math.min(0.40, ((currentEnhance - 5) * 0.05));
    }

    const roll = Math.random();

    if (roll < destroyChance) {
        p.inventory[data.targetIndex] = null;
        socket.emit('systemMessage', `CRITICAL FAILURE! ${targetItem.name} +${currentEnhance} shattered!`);
    } else if (roll < destroyChance + successChance) {
        targetItem.enhanceLevel = currentEnhance + 1;

        const bonus = {
            Starter: 1,
            Basic: 1,
            Rare: 3,
            Unique: 5,
            Legendary: 8,
            Godly: 15
        }[targetItem.rarity] || 1;

        if (targetItem.fixedStat) {
            for (const k in targetItem.fixedStat) {
                if (typeof targetItem.fixedStat[k] === 'number') {
                    targetItem.fixedStat[k] += bonus;
                }
            }
        }

        if (targetItem.randomStat) {
            for (const k in targetItem.randomStat) {
                if (typeof targetItem.randomStat[k] === 'number') {
                    targetItem.randomStat[k] += bonus;
                }
            }
        }

        p.inventory[data.targetIndex] = sanitizeItem(targetItem);

        socket.emit('systemMessage', `SUCCESS! Item is now +${targetItem.enhanceLevel}!`);
    } else {
        socket.emit('systemMessage', `FAILED! ${targetItem.name} +${currentEnhance} enhancement failed.`);
    }

    p.inventory = sanitizeInventory(p.inventory);

    await supabase
        .from('Exonians')
        .update({ inventory: p.inventory })
        .eq('character_name', p.id);

    socket.emit('syncInventory', p.inventory);
});
    // 🛡️ SERVER-SIDE ECONOMY: Buying
    socket.on('requestPurchase', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    const cost = Number(data.totalCost) || 0;
    const item = data.item;

    if (!item || cost < 0) return;

    if (p.gold < cost) {
        socket.emit('systemMessage', "Insufficient Gold (Server Verified).");
        return;
    }

    const inv = Array.isArray(p.inventory) ? p.inventory : new Array(20).fill(null);
    let added = false;

    if (['potion', 'material', 'consumable'].includes(item.type)) {
        const existingIndex = inv.findIndex(i => i && i.name === item.name);
        if (existingIndex !== -1) {
            inv[existingIndex].quantity = (inv[existingIndex].quantity || 1) + (item.quantity || 1);
            added = true;
        }
    }

    if (!added) {
        const emptySlot = inv.findIndex(i => i === null);
        if (emptySlot === -1) {
            socket.emit('systemMessage', "Inventory full!");
            return;
        }
        inv[emptySlot] = item;
    }

    p.gold -= cost;
    p.inventory = inv;

    await supabase
        .from('Exonians')
        .update({ gold: p.gold, inventory: p.inventory })
        .eq('character_name', p.id);

    socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
});
socket.on('useRevivalJuice', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;
    if (!p.isGhost) return;

    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    const requestedIndex = typeof data?.invIndex === 'number' ? data.invIndex : -1;

    let juiceIndex = -1;

    if (
        requestedIndex >= 0 &&
        inv[requestedIndex] &&
        inv[requestedIndex].name === "Revival Juice"
    ) {
        juiceIndex = requestedIndex;
    } else {
        juiceIndex = inv.findIndex(i => i && i.name === "Revival Juice");
    }

    if (juiceIndex === -1) {
        return socket.emit('systemMessage', 'No Revival Juice found.');
    }

    const item = inv[juiceIndex];
    item.quantity = (item.quantity || 1) - 1;

    if (item.quantity <= 0) {
        inv[juiceIndex] = null;
    }

    p.inventory = inv;
    p.isGhost = false;

    const trueMaxHp = getServerTotalStat(p, 'hp') || p.maxHp || 100;
    p.maxHp = trueMaxHp;
    p.currentHp = trueMaxHp;
    p.currentPortal = null;

    try {
        await supabase
            .from('Exonians')
            .update({
                inventory: p.inventory,
                current_hp: p.currentHp,
                map_id: p.mapId,
                pos_x: p.x,
                pos_y: p.y
            })
            .eq('character_name', p.id);
    } catch (e) {
        console.error('[REVIVAL JUICE SAVE ERROR]', e.message);
    }

    io.to(p.instanceId).emit('playerRevived', {
        id: p.id,
        currentHp: p.currentHp
    });

    socket.emit('revivalJuiceUsed', {
        inventory: p.inventory,
        currentHp: p.currentHp
    });

    const pid = playerParty[p.id];
    if (pid) emitPartyUpdate(pid);
});
    socket.on('requestThrowItem', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || typeof data?.index !== 'number') return;
        
        const inv = p.inventory || [];
        if (inv[data.index]) {
            inv[data.index] = null;
            p.inventory = inv;
            await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
            socket.emit('syncInventory', p.inventory);
        }
    });
socket.on('adminSpawnItem', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.id !== "Kei") return; // 🛡️ Security Check

        const { rarity, type, level, enhanceLevel } = data;
        let item;

        if (type.startsWith('aura_')) {
            const auraType = type.split('_')[1];
            item = { id: Date.now() + Math.random(), name: `Lightning Aura Stone`, type: 'aura', auraId: auraType, sprite: 'aurastone', level: 1, rarity: 'Legendary', color: '#00ffff', description: "Click to apply to an Armor. Purely cosmetic.", quantity: 1 };
        } else {
            const tmpl = ITEM_TEMPLATES[type];
            if (!tmpl) return;
            const rPfx = rarity === "Starter" ? "basic" : rarity.toLowerCase();
            item = { id: Date.now() + Math.random(), name: `${rarity} Admin ${tmpl.baseName}`, type: tmpl.slot, sprite: rPfx + tmpl.spriteName, level: level, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: enhanceLevel, quantity: 1 };
            
            let statVal = getBaseStat(level) + ({ "Starter": 0, "Basic": 0, "Rare": 2, "Unique": 5, "Legendary": 8, "Godly": 12 }[rarity] || 0);
            if (type === 'pendant') statVal = Math.floor(statVal / 2);
            item.fixedStat[tmpl.statKey] = statVal;
            item.randomStat = {};
            
            if (rarity !== "Starter") {
                let numStats = rarity === "Godly" ? 3 : (rarity === "Legendary" ? 2 : 1);
                let availableStats = [...STAT_TYPES];
                for (let i = 0; i < numStats; i++) {
                    let rIdx = Math.floor(Math.random() * availableStats.length);
                    let sKey = availableStats.splice(rIdx, 1)[0];
                    item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(level)) + 1;
                }
            }

            if (enhanceLevel > 0) {
                const bonusPerLevel = { "Starter": 1, "Basic": 1, "Rare": 3, "Unique": 5, "Legendary": 8, "Godly": 15 }[rarity] || 1;
                const totalBonus = bonusPerLevel * enhanceLevel;
                for (const k in item.fixedStat) { if (typeof item.fixedStat[k] === 'number') item.fixedStat[k] += totalBonus; }
                for (const k in item.randomStat) { if (typeof item.randomStat[k] === 'number') item.randomStat[k] += totalBonus; }
            }
        }

        const inv = p.inventory || [];
        const emptySlot = inv.findIndex(i => i === null);
        if (emptySlot !== -1) {
            inv[emptySlot] = item;
            p.inventory = inv;
            // 🛡️ Force it into the database immediately
            await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
            socket.emit('syncInventory', p.inventory);
            socket.emit('systemMessage', `[Admin] Spawned ${item.name}!`);
        } else {
            socket.emit('systemMessage', "Inventory full!");
        }
    });
    // 🛡️ PERMANENT ADMIN LEVEL SETTER
    socket.on('adminSetLevel', async (level) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.id !== "Kei") return; // 🛡️ Ironclad Security Check

        let newLevel = clamp(level, 1, 50);
        p.level = newLevel;
        p.maxExp = 100 + (newLevel * 100);
        
        // Scale stats
        p.baseStats.hp = getBaseStat(newLevel) * 10;
        p.baseStats.str = getBaseStat(newLevel);
        p.baseStats.int = getBaseStat(newLevel);
        
        // Recalculate true HP
        const trueMaxHp = getServerTotalStat(p, 'hp') || 100;
        p.maxHp = trueMaxHp;
        p.currentHp = trueMaxHp;

        // Force save to database
        await supabase.from('Exonians').update({
            level: p.level,
            max_exp: p.maxExp,
            base_stats: p.baseStats,
            current_hp: p.currentHp
        }).eq('character_name', p.id);

        socket.emit('systemMessage', `[Admin] Force-leveled to ${p.level}! Refresh page to sync UI.`);
    });
socket.on('requestSell', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    const requestedItemId = data?.itemId;
    const requestedIndex = typeof data?.index === 'number' ? data.index : -1;

    if (!requestedItemId) {
        return socket.emit('systemMessage', 'Invalid sell request.');
    }

    let sellIndex = -1;

    if (
        requestedIndex >= 0 &&
        requestedIndex < inv.length &&
        inv[requestedIndex] &&
        inv[requestedIndex].id === requestedItemId
    ) {
        sellIndex = requestedIndex;
    } else {
        sellIndex = inv.findIndex(item => item && item.id === requestedItemId);
    }

    if (sellIndex === -1) {
        return socket.emit('systemMessage', 'Sell blocked: item not found.');
    }

    const serverItem = inv[sellIndex];
    if (!serverItem) {
        return socket.emit('systemMessage', 'Item no longer exists.');
    }

    let baseVal = (serverItem.level || 1) * 2;
    let multiplier = {
        "Starter": 1,
        "Basic": 2,
        "Rare": 5,
        "Unique": 10,
        "Legendary": 25,
        "Godly": 100
    }[serverItem.rarity] || 1;

    let sellPrice = baseVal * multiplier;
    // 🛡️ THE FIX: Multiply the final price by the stack quantity!
    if (serverItem.quantity && serverItem.quantity > 1) {
        sellPrice *= serverItem.quantity;
    }

    p.gold += sellPrice;
    inv[sellIndex] = null;
    p.inventory = inv;

    try {
        await supabase
            .from('Exonians')
            .update({
                gold: p.gold,
                inventory: p.inventory
            })
            .eq('character_name', p.id);
    } catch (e) {
        console.error('[SELL ERROR]', e.message);
        return socket.emit('systemMessage', 'Server error during sell.');
    }

    socket.emit('sellSuccess', {
        newGold: p.gold,
        inventory: p.inventory,
        price: sellPrice
    });
});
   socket.on('disconnect', async () => {
        if (socket.username) { activeLogins.delete(socket.username); }

        const p = onlinePlayers[socket.id];
        if (p) {
            const oldInstId = p.instanceId; 
            socket.to(p.instanceId).emit('remotePlayerLeft', p.id);
            if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
                for (let petId in worlds[p.instanceId].pets) { if (worlds[p.instanceId].pets[petId].ownerId === p.id) delete worlds[p.instanceId].pets[petId]; }
            }
            removeFromParty(p.id);
            
            // 🛡️ ANTI-CHEAT: If they disconnect while dead, FORCE Town coordinates into the DB
            let saveMap = p.mapId; let saveX = p.x; let saveY = p.y;
            if (p.isGhost) {
                saveMap = 'town'; saveX = 960; saveY = 1000;
            }
            
           // 🛡️ THE FIX: Save the entire server cache to the DB so nothing is lost on refresh!
            supabase.from('Exonians').update({ 
                map_id: saveMap, 
                pos_x: saveX, 
                pos_y: saveY,
                inventory: p.inventory,
                equips: p.equips,
                base_stats: p.baseStats,
                gold: p.gold,
                current_hp: p.currentHp
            }).eq('character_name', p.id).then(()=>{});
            delete onlinePlayers[socket.id];
            
            checkAndResetInstance(oldInstId); 
        }
    });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Exonie server running on port ${PORT}`));








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

function getBaseStat(lvl) { 
    if (lvl >= 50) return 100; if (lvl >= 45) return 45; if (lvl >= 40) return 40; 
    if (lvl >= 35) return 30; if (lvl >= 30) return 27; if (lvl >= 25) return 22; 
    if (lvl >= 20) return 20; if (lvl >= 15) return 15; if (lvl >= 10) return 12; 
    if (lvl >= 5) return 8; return 5; 
}

function generateLoot(monster) {
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
    // 2. REFINEMENT STONE DROP (50% Chance)
    // ==========================================
    if (Math.random() < 0.50) {
        let stoneRarity = "Basic";
        let r = Math.random();
        
        if (monster.category === "floor_boss") {
            // 👑 FLOOR BOSS DROP RATES FOR STONES
            if (r <= 0.05) stoneRarity = "Godly";          // 5% chance
            else if (r <= 0.30) stoneRarity = "Legendary"; // 25% chance
            else if (r <= 0.60) stoneRarity = "Unique";    // 30% chance
            else if (r <= 0.85) stoneRarity = "Rare";      // 25% chance
            else stoneRarity = "Basic";                    // 15% chance
        } else if (monster.category === "mini_boss") {
            stoneRarity = r < 0.35 ? "Unique" : "Rare";
        } else {
            stoneRarity = r < 0.15 ? "Rare" : "Basic";
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
        if (rarityRoll <= 0.05) rarity = "Godly";          // 5% chance
        else if (rarityRoll <= 0.30) rarity = "Legendary"; // 25% chance
        else if (rarityRoll <= 0.60) rarity = "Unique";    // 30% chance
        else if (rarityRoll <= 0.85) rarity = "Rare";      // 25% chance
        else rarity = "Basic";                             // 15% chance
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

function spawnMonster(instId, entityId, monsterKey, cfg) {
    const stats = MonsterDatabase[monsterKey] || MonsterDatabase["common_mobs1"];
    const baseLevel = stats.level || 5;
    const targetLevel = cfg.level || baseLevel;
    const scale = targetLevel / baseLevel; 

    return { 
        id: entityId, instanceId: instId, monsterKey, name: stats.name, category: stats.category, 
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

function playersInInstance(instId) { return Object.values(onlinePlayers).filter(p => p.instanceId === instId); }

function isMonsterColliding(instId, mx, my, mWidth, mHeight) {
    const cols = worlds[instId]?.collisions || [];
    for (let box of cols) { if (mx < box.x + box.w && mx + mWidth > box.x && my < box.y + box.h && my + mHeight > box.y) return true; }
    return false;
}

function pickTarget(m, instId, now) {
    for (const pid of Object.keys(m.threatTable)) { 
        const p = getPlayerById(pid); 
        if (!p || p.instanceId !== instId || p.isGhost || p.untargetableUntil > now || p.mapId === 'town') delete m.threatTable[pid]; 
    }
    
    if (m.forcedUntil > now && m.forcedTargetId) {
        const p = getPlayerById(m.forcedTargetId);
        if (p && p.instanceId === instId && !p.isGhost && p.untargetableUntil <= now && p.mapId !== 'town' && (p.currentHp ?? 1) > 0) {
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
        if (!p || p.isGhost || p.untargetableUntil > now || p.mapId === 'town') continue;
        const dist = Math.hypot((p.x + 24) - mcx, (p.y + 48) - mcy);
        if (dist > m.chaseRadius) continue;
        if (threat > bestThreat || (threat === bestThreat && dist < bestDist)) { best = p; bestThreat = threat; bestDist = dist; }
    }
    if (best) return { id: best.id, isPet: false, x: best.x + 24, y: best.y + 48 };
    
    let nearest = null; let nearestDist = Infinity;
    for (const p of playersInInstance(instId)) {
        if (p.isGhost || p.untargetableUntil > now || p.mapId === 'town' || (p.currentHp ?? 1) <= 0) continue; 
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
                    if (p.isGhost || p.mapId === 'town') return;
                    const pDist = Math.hypot((p.x + 24) - mcx, (p.y + 48) - mcy);
                    if (pDist <= aoeRadius) {
                        const damage = Math.max(1, m.atk - (p.stats?.defense || 0));
                        p.currentHp -= damage;
                        io.to(instId).emit('monsterAttack', { monsterId: m.id, targetId: p.id, targetX: p.x + 24, targetY: p.y + 48, atk: m.atk, isAoE: true });
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
    
    if (dist > m.attackRange) { 
        const ang = Math.atan2(target.y - mcy, target.x - mcx); 
        let nx = m.x + Math.cos(ang) * m.speed; 
        let ny = m.y + Math.sin(ang) * m.speed; 
        if (!isMonsterColliding(instId, nx, m.y, m.width, m.height)) m.x = nx;
        if (!isMonsterColliding(instId, m.x, ny, m.width, m.height)) m.y = ny;
    } else { 
        if (now - m.lastAttack > 1500) { 
            m.lastAttack = now; 
            io.to(instId).emit('monsterAttack', { monsterId: m.id, targetId: target.id, targetX: target.x, targetY: target.y, atk: m.atk }); 
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

   function sendFriendsUpdateTo(username) {
        const sid = findSocketIdByPlayerId(username);
        if (!sid) return;

        // 👑 ADMIN OVERRIDE: Kei sees all online players in the server (Now with Levels!)
        if (username === 'Kei') {
            const allOnline = Object.values(onlinePlayers)
                .filter(p => p.id !== 'Kei') // Don't show Kei to themselves
                .map(p => ({ id: p.id, online: true, level: p.level || 1 }));
            io.to(sid).emit('friendsListUpdate', allOnline);
            return;
        }

        // Standard Player Logic (Now with Levels!)
        const myFriends = global.playerFriends[username] ? Array.from(global.playerFriends[username]) : [];
        const friendData = myFriends.map(f => {
            let isOnline = activeLogins.has(f);
            let currentLevel = 1;
            
            // Loop through active online players to grab their live level if they are online
            if (isOnline) {
                for (let activeId in onlinePlayers) {
                    if (onlinePlayers[activeId].id === f) {
                        currentLevel = onlinePlayers[activeId].level || 1;
                        break;
                    }
                }
            }

            return { 
                id: f, 
                online: isOnline, 
                level: currentLevel 
            };
        });
        
        io.to(sid).emit('friendsListUpdate', friendData);
    }

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
    socket.on('saveMapFile', (data) => {
        if (!data.mapId || !data.content) return;
        const fileName = data.mapId === 'town' ? 'townmap.js' : `${data.mapId}.js`;
        const filePath = path.join(__dirname, 'public', fileName);
        try { fs.writeFileSync(filePath, data.content); } catch(err) {}
    });

    socket.on('partyHeal', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.isGhost || p.mapId === 'town') return;

        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                const mp = getPlayerById(memberId);
                if (mp && !mp.isGhost && mp.instanceId === p.instanceId) {
                    const dist = Math.hypot(p.x - mp.x, p.y - mp.y);
                    if (dist <= (data.radius || 400)) {
                        mp.currentHp = Math.min(mp.maxHp, mp.currentHp + data.amount);
                        io.to(p.instanceId).emit('playerHealed', { id: mp.id, amount: data.amount, currentHp: mp.currentHp });
                    }
                }
            }
            emitPartyUpdate(pid);
        }
    });

    socket.on('partyRevive', () => {
        const p = onlinePlayers[socket.id];
        if (!p || p.mapId === 'town') return;

        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                const mp = getPlayerById(memberId);
                if (mp && mp.isGhost && mp.mapId !== 'town') {
                    mp.isGhost = false;
                    mp.currentHp = mp.maxHp; 
                    io.to(p.instanceId).emit('playerRevived', { id: mp.id, currentHp: mp.currentHp });
                }
            }
            emitPartyUpdate(pid); 
        }
    });

    socket.on('broadcastSkill', (data) => {
        const p = onlinePlayers[socket.id];
        if (p) {
            socket.to(p.instanceId).emit('remoteSkillEffect', { playerId: p.id, skillId: data.skillId, x: p.x, y: p.y, auraColor: data.auraColor });
        }
    });

   socket.on('syncMapData', (mapData) => {
        if (!worlds[mapData.instanceId]) {
            worlds[mapData.instanceId] = { collisions: mapData.collisions || [], teleports: mapData.teleports || [], monsters: {}, pets: {} };
            
            // ✅ ADDED FALLBACK KEYS: This ensures old maps don't crash the renderer!
            const processSpawns = (spawnList, fallbackKey) => {
                (spawnList || []).forEach((sp, i) => {
                    let mId = `${mapData.instanceId}_mob_${Date.now()}_${i}_${Math.random()}`;
                    let mKey = sp.monsterKey || fallbackKey; // <--- Uses fallback if old map is missing the key
                    worlds[mapData.instanceId].monsters[mId] = spawnMonster(mapData.instanceId, mId, mKey, { 
                        spawnArea: { minX: sp.x, minY: sp.y }, 
                        level: sp.level 
                    });
                });
            };
            
            // Passes the exact fallbacks needed for older map data
            processSpawns(mapData.normalSpawns, 'common_mobs1');
            processSpawns(mapData.miniBossSpawns, 'mini_boss1');
            processSpawns(mapData.floorBossSpawns, 'floor_boss1');
        }
    });

    socket.on('adminSpawnMonster', (data) => {
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

            // Block if they are already logged in
            if (activeLogins.has(username)) {
                console.log(`[LOGIN BLOCKED] ${username} is already online.`);
                return socket.emit('authError', 'This account is currently online elsewhere!');
            }

            const { data: user, error } = await supabase.from('Exonians').select('*').eq('character_name', username).eq('password', password).single();
            if (error || !user) {
                console.error(`[LOGIN FAILED] Invalid credentials for ${username}. Error:`, error?.message || 'No user found');
                return socket.emit('authError', 'Invalid username or password.');
            }
            
            console.log(`[LOGIN SUCCESS] ${username} authenticated successfully.`);
            
            // Mark the user as actively online
            activeLogins.add(username);
            socket.username = username; 
            
            // ✅ LOAD FRIENDS FROM SUPABASE DATABASE
            if (!global.playerFriends) global.playerFriends = {};
            global.playerFriends[username] = new Set(user.friends || []);

            currentUser = username;
            if (!user.skin_color) socket.emit('needsCharacterCreation', username);
            else socket.emit('characterSelect', user);
        } catch(e) {
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

    socket.on('enterWorld', (userData) => {
        const mapId = userData.map_id || 'town';
        const instId = getInstanceId(userData.character_name, mapId);

        let startHp = userData.current_hp || 100;
        if (mapId === 'town') startHp = 100;
        
        currentUser = userData.character_name; // ✅ Re-enforces session state
        
        onlinePlayers[socket.id] = {
            socketId: socket.id, id: userData.character_name, name: userData.character_name, mapId: mapId, instanceId: instId, isGhost: false, currentPortal: null,
            x: userData.pos_x || 960, y: userData.pos_y || 1000, level: userData.level || 1, currentHp: startHp, maxHp: 100, tradeTarget: null,
            equips: userData.equips || { weapon: null, armor: null, leggings: null }, 
            spriteData: { skin: userData.skin_color, hair: userData.hair_color, style: userData.hair_style, weapon: userData.equips?.weapon?.sprite || null },
            untargetableUntil: 0 
        };
        socket.join(instId); socket.emit('authSuccess', userData);
        
        socket.to(instId).emit('remotePlayerJoined', { id: onlinePlayers[socket.id].id, name: onlinePlayers[socket.id].name, mapId, instanceId: instId, x: onlinePlayers[socket.id].x, y: onlinePlayers[socket.id].y, spriteData: onlinePlayers[socket.id].spriteData, isGhost: false });
        const playersInInst = Object.values(onlinePlayers).filter(p => p.instanceId === instId && p.id !== userData.character_name);
        socket.emit('mapPlayersList', playersInInst.map(p => ({ id: p.id, name: p.name, mapId: p.mapId, x: p.x, y: p.y, spriteData: p.spriteData, isGhost: p.isGhost })));
    });

    socket.on('saveData', async (playerData) => {
        if (!currentUser) return;
        supabase.from('Exonians').update({ level: playerData.level, exp: playerData.exp, max_exp: playerData.maxExp, current_hp: playerData.currentHp, gold: playerData.gold, pos_x: playerData.x, pos_y: playerData.y, map_id: playerData.mapId, base_stats: playerData.baseStats, inventory: playerData.inventory, equips: playerData.equips }).eq('character_name', currentUser).then(()=>{});
        
        const p = onlinePlayers[socket.id];
        if (p) { 
            p.level = playerData.level; p.currentHp = playerData.currentHp; p.maxHp = playerData.maxHp || 100; p.equips = playerData.equips; 
            if (playerData.equips?.weapon?.sprite) p.spriteData.weapon = playerData.equips.weapon.sprite; 
        }
        if (p) { const pid = playerParty[p.id]; if (pid) emitPartyUpdate(pid); }
    });

    socket.on('playerMoved', (data) => {
        if (!onlinePlayers[socket.id]) return; const p = onlinePlayers[socket.id]; p.x = data.x; p.y = data.y; p.spriteData.weapon = data.weaponSprite;
        socket.to(p.instanceId).emit('remotePlayerMoved', { id: p.id, x: data.x, y: data.y, state: data.state, facingRight: data.facingRight, weaponSprite: data.weaponSprite });
    });

    socket.on('tauntMonsters', (data) => {
        const p = onlinePlayers[socket.id]; if(!p || p.isGhost) return;
        if (p.mapId === 'town') return; 
        const world = worlds[p.instanceId]; if(!world) return;

        for (let mId in world.monsters) {
            let m = world.monsters[mId];
            if (!m.alive) continue;
            let dist = Math.hypot(p.x + 24 - (m.x + m.width/2), p.y + 48 - (m.y + m.height/2));
            if (dist <= (data.radius || 300)) { m.forcedTargetId = p.id; m.forcedUntil = Date.now() + 10000; }
        }
    });

    socket.on('syncPet', (data) => {
        const p = onlinePlayers[socket.id]; if(!p) return;
        if (p.mapId === 'town') return; 
        const world = worlds[p.instanceId]; if(!world) return;
        if (!world.pets) world.pets = {};
        if (data.alive) { world.pets[data.id] = { id: data.id, ownerId: p.id, x: data.x, y: data.y }; } 
        else { delete world.pets[data.id]; }
        socket.to(p.instanceId).emit('remotePetSync', { ownerId: p.id, petData: data });
    });

    socket.on('setUntargetable', (data) => {
        const p = onlinePlayers[socket.id];
        if (p && p.mapId !== 'town') { p.untargetableUntil = Date.now() + (data.duration || 10000); }
    });

    socket.on('attackMonster', (payload) => {
        const p = onlinePlayers[socket.id]; if (!p || p.isGhost) return; 
        if (p.mapId === 'town') return; 

        const world = worlds[p.instanceId]; if (!world) return; 
        const m = world.monsters[payload.monsterId]; 
        
        if (!m || !m.alive) return;
        
        const pcx = p.x + 24; const pcy = p.y + 48; const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2); const dist = Math.hypot(pcx - mcx, pcy - mcy); if (dist > 350) return;
        const dmg = Math.max(1, Math.floor(Number(payload.damage) || 1)); m.currentHp -= dmg; if (m.currentHp < 0) m.currentHp = 0; m.threatTable[p.id] = (m.threatTable[p.id] || 0) + dmg;
        
        if (payload.freeze) { m.frozenUntil = Date.now() + 3000; }

        io.to(p.instanceId).emit('monsterHit', { monsterId: m.id, attackerId: p.id, damage: dmg, newHp: m.currentHp, maxHp: m.maxHp, isPendant: !!payload.isPendant });
        
        if (m.currentHp <= 0) {
            m.alive = false; m.targetId = null; m.threatTable = {}; m.forcedTargetId = null; m.forcedUntil = 0; m.frozenUntil = 0;
            io.to(p.instanceId).emit('monsterDied', { monsterId: m.id, killerId: p.id });
            
            const expAmount = m.expYield || 25;
            const goldAmount = m.goldYield || 15; 
            const pid = playerParty[p.id];

            if (pid && parties[pid]) {
                for (const memberId of parties[pid].members) { 
                    const sid = findSocketIdByPlayerId(memberId); 
                    if (sid) {
                        io.to(sid).emit('receiveExp', { amount: expAmount, gold: goldAmount, source: m.name }); 
                        io.to(sid).emit('lootDropped', generateLoot(m));
                    }
                }
            } else { 
                io.to(socket.id).emit('receiveExp', { amount: expAmount, gold: goldAmount, source: m.name }); 
                io.to(socket.id).emit('lootDropped', generateLoot(m));
            }
            
            if (m.respawnDelayMs !== -1) {
                setTimeout(() => { const cfg = { spawnArea: { minX: m.homeX, maxX: m.homeX, minY: m.homeY, maxY: m.homeY } }; const nm = spawnMonster(p.instanceId, m.id, m.monsterKey, cfg); world.monsters[m.id] = nm; io.to(p.instanceId).emit('monsterSpawned', serializeMonster(nm)); }, m.respawnDelayMs || 10000);
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
        const me = onlinePlayers[socket.id]; if (!me || !data.fromId) return;
        const fromSid = findSocketIdByPlayerId(data.fromId);
        const targetPlayer = getPlayerById(data.fromId);
        if (!fromSid || !targetPlayer) return;
        
        if (data.accept) {
            me.tradeTarget = targetPlayer.id; targetPlayer.tradeTarget = me.id;
            socket.emit('tradeStarted', { targetId: data.fromId });
            io.to(fromSid).emit('tradeStarted', { targetId: me.id });
        } else { io.to(fromSid).emit('partyError', `${me.id} declined your trade request.`); }
    });

    socket.on('tradeSync', (data) => { const me = onlinePlayers[socket.id]; if(!me || !me.tradeTarget) return; const targetSid = findSocketIdByPlayerId(me.tradeTarget); if (targetSid) io.to(targetSid).emit('tradeSyncReceived', data); });
    socket.on('tradeCancel', () => { const me = onlinePlayers[socket.id]; if(!me || !me.tradeTarget) return; const targetSid = findSocketIdByPlayerId(me.tradeTarget); let tId = me.tradeTarget; me.tradeTarget = null; let targetPlayer = getPlayerById(tId); if(targetPlayer) targetPlayer.tradeTarget = null; if (targetSid) io.to(targetSid).emit('tradeCancelled'); });
    
    socket.on('playerVitals', (data) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        p.currentHp = data.currentHp; p.maxHp = data.maxHp; p.level = data.level;
        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                if (memberId !== p.id) { const sid = findSocketIdByPlayerId(memberId); if (sid) io.to(sid).emit('partyMemberVitals', { id: p.id, currentHp: p.currentHp, maxHp: p.maxHp, level: p.level }); }
            }
        }
    });

    socket.on('chatMessage', (data) => { const p = onlinePlayers[socket.id]; if (!p || !data.text) return; io.to(p.instanceId).emit('chatMessage', { id: p.id, text: data.text }); });
    socket.on('partyInvite', ({ targetId }) => { const me = onlinePlayers[socket.id]; if (!me || !targetId) return; const targetSid = findSocketIdByPlayerId(targetId); if (!targetSid) return socket.emit('partyError', 'Target is not online.'); io.to(targetSid).emit('partyInviteReceived', { fromId: me.id }); });
    
    socket.on('partyInviteResponse', ({ fromId, accept }) => {
        const me = onlinePlayers[socket.id]; if (!me || !fromId) return; const fromSid = findSocketIdByPlayerId(fromId); const inviter = getPlayerById(fromId); if (!inviter || !fromSid) return;
        if (!accept) { io.to(fromSid).emit('partyError', `${me.id} declined your party invite.`); return; }
        let pid = playerParty[fromId]; if (!pid) { pid = `party_${Date.now()}_${Math.floor(Math.random() * 9999)}`; parties[pid] = { id: pid, leaderId: fromId, members: new Set([fromId]) }; playerParty[fromId] = pid; }
        if (playerParty[me.id] && playerParty[me.id] !== pid) { removeFromParty(me.id); }
        parties[pid].members.add(me.id); playerParty[me.id] = pid; emitPartyUpdate(pid);
    });
// ✅ GLOBAL ADMIN BROADCAST
    socket.on('adminBroadcast', (data) => {
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
        
        socket.leave(p.instanceId); socket.to(p.instanceId).emit('remotePlayerLeft', p.id); 
        
        if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
            for (let petId in worlds[p.instanceId].pets) { if (worlds[p.instanceId].pets[petId].ownerId === p.id) delete worlds[p.instanceId].pets[petId]; }
        }

        p.mapId = tp.mapId; p.x = tp.x; p.y = tp.y; p.currentPortal = null;
        p.instanceId = getInstanceId(p.id, tp.mapId); 
        socket.join(p.instanceId);
        
        socket.emit('forceTeleport', tp); 
        socket.to(p.instanceId).emit('remotePlayerJoined', { id: p.id, name: p.name, mapId: p.mapId, instanceId: p.instanceId, x: p.x, y: p.y, spriteData: p.spriteData, isGhost: p.isGhost });
        supabase.from('Exonians').update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y }).eq('character_name', p.id).then(()=>{});
    });

    socket.on('playerTeleported', async (data) => {
        if (!onlinePlayers[socket.id]) return; const p = onlinePlayers[socket.id];
        socket.leave(p.instanceId); socket.to(p.instanceId).emit('remotePlayerLeft', p.id); 
        
        if (p.mapId === 'town') p.currentHp = p.maxHp;
        
        if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
            for (let petId in worlds[p.instanceId].pets) { if (worlds[p.instanceId].pets[petId].ownerId === p.id) delete worlds[p.instanceId].pets[petId]; }
        }

        p.mapId = data.mapId; p.x = data.x; p.y = data.y; p.currentPortal = null;
        p.instanceId = getInstanceId(p.id, data.mapId); 
        socket.join(p.instanceId);
        
        socket.emit('requestMapSync', { mapId: data.mapId, instanceId: p.instanceId }); 
        socket.to(p.instanceId).emit('remotePlayerJoined', { id: p.id, name: p.name, mapId: p.mapId, instanceId: p.instanceId, x: p.x, y: p.y, spriteData: p.spriteData, isGhost: p.isGhost });
        
        const playersInInst = Object.values(onlinePlayers).filter(remote => remote.instanceId === p.instanceId && remote.id !== p.id);
        socket.emit('mapPlayersList', playersInInst.map(pp => ({ id: pp.id, name: pp.name, mapId: pp.mapId, x: pp.x, y: pp.y, spriteData: pp.spriteData, isGhost: pp.isGhost })));
        supabase.from('Exonians').update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y }).eq('character_name', currentUser).then(()=>{});
    });

    socket.on('respawnPlayer', () => {
        const p = onlinePlayers[socket.id];
        if (p) {
            p.isGhost = false; p.currentHp = p.maxHp || 100;
            if (p.mapId !== 'town') socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 });
            else io.to(p.instanceId).emit('playerRevived', { id: p.id, currentHp: p.currentHp });
        }
    });

    socket.on('playerDied', () => {
        const p = onlinePlayers[socket.id]; if (!p || p.isGhost) return;
        p.isGhost = true; p.currentHp = 0;
        io.to(p.instanceId).emit('remotePlayerGhosted', p.id);
        
        let instPlayers = playersInInstance(p.instanceId);
        let allDead = instPlayers.every(pl => pl.isGhost);
        if (allDead) { io.to(p.instanceId).emit('partyWiped'); }
    });

    socket.on('disconnect', async () => {
    // ✅ NEW: Free up the account so they can log back in
    if (socket.username) {
        activeLogins.delete(socket.username);
    }

    const p = onlinePlayers[socket.id];
    if (p) {
        socket.to(p.instanceId).emit('remotePlayerLeft', p.id);
        if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
            for (let petId in worlds[p.instanceId].pets) { if (worlds[p.instanceId].pets[petId].ownerId === p.id) delete worlds[p.instanceId].pets[petId]; }
        }
        removeFromParty(p.id);
        supabase.from('Exonians').update({ pos_x: p.x, pos_y: p.y }).eq('character_name', p.id).then(()=>{});
        delete onlinePlayers[socket.id];
    }
});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Exonie server running on port ${PORT}`));



















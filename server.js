require('dotenv').config();
const express = require('express');
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
// LOOT & STAT GENERATION ENGINE
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
    const mLevel = monster.level || 5;

    if (Math.random() < 0.50) {
        return { 
            id: Date.now() + Math.random(), 
            name: `Refinement Stone Lv.${mLevel}`, 
            type: "material", level: mLevel, rarity: "Basic", color: "#e0e0e0", 
            description: "Enhances equipment.", quantity: 1 
        };
    }

    const keys = Object.keys(ITEM_TEMPLATES);
    const typeKey = keys[Math.floor(Math.random() * keys.length)];
    
    let rarityRoll = Math.random();
    let rarity = "Basic";
    
    if (monster.category === "floor_boss") {
        rarity = rarityRoll < 0.05 ? "Godly" : (rarityRoll < 0.20 ? "Legendary" : (rarityRoll < 0.50 ? "Unique" : "Rare"));
    } else if (monster.category === "mini_boss") {
        rarity = rarityRoll < 0.05 ? "Legendary" : (rarityRoll < 0.20 ? "Unique" : (rarityRoll < 0.50 ? "Rare" : "Basic"));
    } else {
        rarity = rarityRoll < 0.05 ? "Rare" : "Basic";
    }

    const template = ITEM_TEMPLATES[typeKey];
    const rarityPrefix = rarity === "Starter" ? "basic" : rarity.toLowerCase();
    const spriteName = rarityPrefix + template.spriteName;
    
    let itemName = `${rarity === "Rare" ? "Slime" : "Basic"} ${template.baseName}`;
    if (rarity !== "Rare" && rarity !== "Basic") { itemName = `${rarity} ${template.baseName}`; }

    let item = { 
        id: Date.now() + Math.random(), name: itemName, type: template.slot, sprite: spriteName, 
        level: mLevel, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: 0 
    };
    
    let statVal = getBaseStat(mLevel) + ({ "Starter": 0, "Basic": 0, "Rare": 2, "Unique": 5, "Legendary": 8, "Godly": 12 }[rarity] || 0);
    if (typeKey === 'pendant') statVal = Math.floor(statVal / 2);
    item.fixedStat[template.statKey] = statVal;
    
    item.randomStat = {};
    item.randomStat[STAT_TYPES[Math.floor(Math.random() * STAT_TYPES.length)]] = Math.floor(Math.random() * getBaseStat(mLevel)) + 1;
    
    return item;
}

// ==========================================
// SCALED MONSTER DATABASE (Buffed Bosses & Fast Respawns)
// ==========================================
const MonsterDatabase = {
    "common_mobs1": { name: "Slime", category: "common_mobs", level: 5, maxHp: 100, atk: 25, def: 0, speed: 2.5, expYield: 25, aggroRadius: 250, chaseRadius: 400, attackRange: 55, width: 40, height: 40, respawnDelay: 5000, cssColor: '#ff69b4', cssBorder: '#c71585' },
    "mini_boss1": { name: "Orc Slime", category: "mini_boss", level: 15, maxHp: 1500, atk: 120, def: 15, speed: 2.8, expYield: 500, aggroRadius: 350, chaseRadius: 500, attackRange: 90, width: 60, height: 60, respawnDelay: 20000, cssColor: '#2196F3', cssBorder: '#0b7dda' },
    "floor_boss1": { name: "Dragon Slime", category: "floor_boss", level: 25, maxHp: 5000, atk: 400, def: 40, speed: 3.2, expYield: 3000, aggroRadius: 500, chaseRadius: 800, attackRange: 130, width: 100, height: 100, respawnDelay: -1, cssColor: '#f44336', cssBorder: '#b71c1c' }
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
    return { 
        id: entityId, instanceId: instId, monsterKey, name: stats.name, category: stats.category, level: stats.level, x: cfg.spawnArea.minX, y: cfg.spawnArea.minY, homeX: cfg.spawnArea.minX, homeY: cfg.spawnArea.minY, 
        width: stats.width, height: stats.height, maxHp: stats.maxHp, currentHp: stats.maxHp, atk: stats.atk, def: stats.def, speed: stats.speed, expYield: stats.expYield,
        aggroRadius: stats.aggroRadius, chaseRadius: stats.chaseRadius, attackRange: stats.attackRange, cssColor: stats.cssColor, cssBorder: stats.cssBorder,
        lastAttack: 0, alive: true, threatTable: {}, forcedTargetId: null, forcedUntil: 0, targetId: null, respawnDelayMs: stats.respawnDelay,
        frozenUntil: 0 
    };
}

function serializeMonster(m) { return { id: m.id, monsterKey: m.monsterKey, name: m.name, x: m.x, y: m.y, width: m.width, height: m.height, maxHp: m.maxHp, currentHp: m.currentHp, alive: m.alive, targetId: m.targetId || null, cssColor: m.cssColor, cssBorder: m.cssBorder }; }
function playersInInstance(instId) { return Object.values(onlinePlayers).filter(p => p.instanceId === instId); }

function isMonsterColliding(instId, mx, my, mWidth, mHeight) {
    const cols = worlds[instId]?.collisions || [];
    for (let box of cols) { if (mx < box.x + box.w && mx + mWidth > box.x && my < box.y + box.h && my + mHeight > box.y) return true; }
    return false;
}

function pickTarget(m, instId, now) {
    for (const pid of Object.keys(m.threatTable)) { 
        const p = getPlayerById(pid); 
        if (!p || p.instanceId !== instId || p.isGhost || p.untargetableUntil > now) delete m.threatTable[pid]; 
    }
    
    if (m.forcedUntil > now && m.forcedTargetId) {
        const p = getPlayerById(m.forcedTargetId);
        if (p && p.instanceId === instId && !p.isGhost && p.untargetableUntil <= now && (p.currentHp ?? 1) > 0) {
            return p;
        } else {
            m.forcedTargetId = null;
        }
    }

    let best = null; let bestThreat = -1; let bestDist = Infinity;
    for (const pid of Object.keys(m.threatTable)) {
        const threat = m.threatTable[pid] || 0; const p = getPlayerById(pid); 
        if (!p || p.isGhost || p.untargetableUntil > now) continue;
        const dist = Math.hypot((p.x + 24) - (m.x + (m.width / 2)), (p.y + 48) - (m.y + (m.height / 2)));
        if (dist > m.chaseRadius) continue;
        if (threat > bestThreat || (threat === bestThreat && dist < bestDist)) { best = p; bestThreat = threat; bestDist = dist; }
    }
    if (best) return best;
    
    let nearest = null; let nearestDist = Infinity;
    for (const p of playersInInstance(instId)) {
        if (p.isGhost || p.untargetableUntil > now || (p.currentHp ?? 1) <= 0) continue; 
        const dist = Math.hypot((p.x + 24) - (m.x + (m.width / 2)), (p.y + 48) - (m.y + (m.height / 2)));
        if (dist <= m.aggroRadius && dist < nearestDist) { nearest = p; nearestDist = dist; }
    }
    if (nearest) { m.threatTable[nearest.id] = Math.max(1, m.threatTable[nearest.id] || 0); return nearest; }
    return null;
}

function updateMonsterAI(instId, m, now) {
    if (!m.alive) return;
    
    if (now < m.frozenUntil) return;

    const target = pickTarget(m, instId, now); m.targetId = target ? target.id : null;
    const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2);
    if (!target) { 
        const dist = Math.hypot(m.homeX - m.x, m.homeY - m.y); 
        if (dist > 2) { 
            const ang = Math.atan2(m.homeY - m.y, m.homeX - m.x); 
            let nx = m.x + Math.cos(ang) * m.speed; let ny = m.y + Math.sin(ang) * m.speed; 
            if (!isMonsterColliding(instId, nx, m.y, m.width, m.height)) m.x = nx;
            if (!isMonsterColliding(instId, m.x, ny, m.width, m.height)) m.y = ny;
        } return; 
    }
    const dist = Math.hypot((target.x + 24) - mcx, (target.y + 48) - mcy);
    if (dist > m.chaseRadius) { if (m.threatTable[target.id]) m.threatTable[target.id] *= 0.9; if (m.threatTable[target.id] < 1) delete m.threatTable[target.id]; return; }
    if (dist > m.attackRange) { 
        const ang = Math.atan2((target.y + 48) - mcy, (target.x + 24) - mcx); 
        let nx = m.x + Math.cos(ang) * m.speed; let ny = m.y + Math.sin(ang) * m.speed; 
        if (!isMonsterColliding(instId, nx, m.y, m.width, m.height)) m.x = nx;
        if (!isMonsterColliding(instId, m.x, ny, m.width, m.height)) m.y = ny;
    } else { 
        if (now - m.lastAttack > 1500) { m.lastAttack = now; io.to(instId).emit('monsterAttack', { monsterId: m.id, targetId: target.id }); } 
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

    socket.on('saveMapFile', (data) => {
        if (!data.mapId || !data.content) return;
        const fileName = data.mapId === 'town' ? 'townmap.js' : `${data.mapId}.js`;
        const filePath = path.join(__dirname, 'public', fileName);
        try { fs.writeFileSync(filePath, data.content); } catch(err) {}
    });

    socket.on('syncMapData', (data) => {
        const instId = data.instanceId; if (!instId) return;
        if (!worlds[instId]) { worlds[instId] = { instanceId: instId, mapId: data.mapId, collisions: [], monsters: {}, monstersSpawned: false }; }
        worlds[instId].collisions = data.collisions || [];

        if (!worlds[instId].monstersSpawned) {
            worlds[instId].monstersSpawned = true;
            let mIndex = 0;
            const spawnGroups = [ { arr: data.normalSpawns || [], fallback: 'common_mobs1' }, { arr: data.miniBossSpawns || [], fallback: 'mini_boss1' }, { arr: data.floorBossSpawns || [], fallback: 'floor_boss1' } ];
            spawnGroups.forEach(group => {
                group.arr.forEach(sp => {
                    let mKey = sp.monsterKey || group.fallback; let mId = `${instId}_m_${mIndex++}`;
                    if (!worlds[instId].monsters[mId]) {
                        let cfg = { spawnArea: { minX: sp.x, maxX: sp.x, minY: sp.y, maxY: sp.y } };
                        worlds[instId].monsters[mId] = spawnMonster(instId, mId, mKey, cfg);
                    }
                });
            });
        }
    });

    socket.on('adminSpawnMonster', (data) => {
        const instId = data.instanceId; if (!instId || !worlds[instId]) return;
        let mId = `${instId}_m_admin_${Date.now()}`;
        let cfg = { spawnArea: { minX: data.x, maxX: data.x, minY: data.y, maxY: data.y } };
        worlds[instId].monsters[mId] = spawnMonster(instId, mId, data.monsterKey, cfg);
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
        try {
            const { username, password } = data;
            if (!username || !password) return socket.emit('authError', 'Invalid data.');
            const { data: existingUser } = await supabase.from('Exonians').select('character_name').eq('character_name', username).single();
            if (existingUser) return socket.emit('authError', 'Username is already taken!');
            const { error } = await supabase.from('Exonians').insert([{ character_name: username, password: password }]);
            if (error) return socket.emit('authError', `Database Error: ${error.message}`);
            socket.emit('registerSuccess', username);
        } catch(e) { socket.emit('authError', 'Server Error'); }
    });

    socket.on('login', async (data) => {
        try {
            const { username, password } = data;
            const { data: user, error } = await supabase.from('Exonians').select('*').eq('character_name', username).eq('password', password).single();
            if (error || !user) return socket.emit('authError', 'Invalid username or password.');
            currentUser = username;
            if (!user.skin_color) socket.emit('needsCharacterCreation', username);
            else socket.emit('characterSelect', user);
        } catch(e) { socket.emit('authError', 'Server Error'); }
    });

    socket.on('enterWorld', (userData) => {
        const mapId = userData.map_id || 'town';
        const instId = getInstanceId(userData.character_name, mapId);
        
        onlinePlayers[socket.id] = {
            socketId: socket.id, id: userData.character_name, name: userData.character_name, mapId: mapId, instanceId: instId, isGhost: false, currentPortal: null,
            x: userData.pos_x || 960, y: userData.pos_y || 1000, level: userData.level || 1, currentHp: userData.current_hp || 100, maxHp: 100, tradeTarget: null,
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

    socket.on('inspectRequest', (data) => {
        const targetId = data.targetId;
        const target = getPlayerById(targetId);
        if (target) {
            socket.emit('inspectData', {
                id: target.id, name: target.name, level: target.level || 1, currentHp: target.currentHp || 0, maxHp: target.maxHp || 100, equips: target.equips || { weapon: null, armor: null, leggings: null }
            });
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
            me.tradeTarget = targetPlayer.id;
            targetPlayer.tradeTarget = me.id;
            socket.emit('tradeStarted', { targetId: data.fromId });
            io.to(fromSid).emit('tradeStarted', { targetId: me.id });
        } else {
            io.to(fromSid).emit('partyError', `${me.id} declined your trade request.`);
        }
    });

    socket.on('tradeSync', (data) => {
        const me = onlinePlayers[socket.id]; if(!me || !me.tradeTarget) return;
        const targetSid = findSocketIdByPlayerId(me.tradeTarget);
        if (targetSid) io.to(targetSid).emit('tradeSyncReceived', data);
    });

    socket.on('tradeCancel', () => {
        const me = onlinePlayers[socket.id]; if(!me || !me.tradeTarget) return;
        const targetSid = findSocketIdByPlayerId(me.tradeTarget);
        let tId = me.tradeTarget; me.tradeTarget = null;
        let targetPlayer = getPlayerById(tId); if(targetPlayer) targetPlayer.tradeTarget = null;
        if (targetSid) io.to(targetSid).emit('tradeCancelled');
    });

    socket.on('playerVitals', (data) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        p.currentHp = data.currentHp; p.maxHp = data.maxHp; p.level = data.level;
        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                if (memberId !== p.id) {
                    const sid = findSocketIdByPlayerId(memberId);
                    if (sid) io.to(sid).emit('partyMemberVitals', { id: p.id, currentHp: p.currentHp, maxHp: p.maxHp, level: p.level });
                }
            }
        }
    });

    socket.on('chatMessage', (data) => {
        const p = onlinePlayers[socket.id]; if (!p || !data.text) return;
        io.to(p.instanceId).emit('chatMessage', { id: p.id, text: data.text });
    });

    socket.on('partyInvite', ({ targetId }) => { const me = onlinePlayers[socket.id]; if (!me || !targetId) return; const targetSid = findSocketIdByPlayerId(targetId); if (!targetSid) return socket.emit('partyError', 'Target is not online.'); io.to(targetSid).emit('partyInviteReceived', { fromId: me.id }); });
    socket.on('partyInviteResponse', ({ fromId, accept }) => {
        const me = onlinePlayers[socket.id]; if (!me || !fromId) return; const fromSid = findSocketIdByPlayerId(fromId); const inviter = getPlayerById(fromId); if (!inviter || !fromSid) return;
        if (!accept) { io.to(fromSid).emit('partyError', `${me.id} declined your party invite.`); return; }
        let pid = playerParty[fromId]; if (!pid) { pid = `party_${Date.now()}_${Math.floor(Math.random() * 9999)}`; parties[pid] = { id: pid, leaderId: fromId, members: new Set([fromId]) }; playerParty[fromId] = pid; }
        if (playerParty[me.id] && playerParty[me.id] !== pid) { removeFromParty(me.id); }
        parties[pid].members.add(me.id); playerParty[me.id] = pid; emitPartyUpdate(pid);
    });

    socket.on('leaveParty', () => {
        const p = onlinePlayers[socket.id];
        if (p && playerParty[p.id]) {
            removeFromParty(p.id);
            if (p.mapId !== 'town') {
                socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 });
            }
        }
    });

    socket.on('playerTeleported', async (data) => {
        if (!onlinePlayers[socket.id]) return; const p = onlinePlayers[socket.id];
        socket.leave(p.instanceId); socket.to(p.instanceId).emit('remotePlayerLeft', p.id); 
        p.mapId = data.mapId; p.x = data.x; p.y = data.y; p.currentPortal = null;
        p.instanceId = getInstanceId(p.id, data.mapId); 
        socket.join(p.instanceId);
        
        socket.emit('requestMapSync', { mapId: data.mapId, instanceId: p.instanceId }); 
        
        socket.to(p.instanceId).emit('remotePlayerJoined', { id: p.id, name: p.name, mapId: p.mapId, instanceId: p.instanceId, x: p.x, y: p.y, spriteData: p.spriteData, isGhost: p.isGhost });
        const playersInInst = Object.values(onlinePlayers).filter(remote => remote.instanceId === p.instanceId && remote.id !== p.id);
        socket.emit('mapPlayersList', playersInInst.map(pp => ({ id: pp.id, name: pp.name, mapId: pp.mapId, x: pp.x, y: pp.y, spriteData: pp.spriteData, isGhost: pp.isGhost })));
        supabase.from('Exonians').update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y }).eq('character_name', currentUser).then(()=>{});
    });

    socket.on('partyRevive', () => {
        const p = onlinePlayers[socket.id]; if(!p) return;
        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                const mp = getPlayerById(memberId);
                if (mp && mp.isGhost) {
                    mp.isGhost = false;
                    mp.currentHp = Math.floor(mp.maxHp / 2) || 50; 
                    io.to(mp.instanceId).emit('playerRevived', { id: mp.id, currentHp: mp.currentHp });
                }
            }
            emitPartyUpdate(pid); 
        }
    });

    socket.on('tauntMonsters', (data) => {
        const p = onlinePlayers[socket.id]; if(!p || p.isGhost) return;
        const world = worlds[p.instanceId]; if(!world) return;
        for (let mId in world.monsters) {
            let m = world.monsters[mId];
            if (!m.alive) continue;
            let dist = Math.hypot(p.x + 24 - (m.x + m.width/2), p.y + 48 - (m.y + m.height/2));
            if (dist <= (data.radius || 300)) {
                m.forcedTargetId = p.id;
                m.forcedUntil = Date.now() + 10000; 
            }
        }
    });

    socket.on('syncPet', (data) => {
        const p = onlinePlayers[socket.id]; if(!p) return;
        socket.to(p.instanceId).emit('remotePetSync', { ownerId: p.id, petData: data });
    });

    socket.on('setUntargetable', (data) => {
        const p = onlinePlayers[socket.id];
        if (p) { p.untargetableUntil = Date.now() + (data.duration || 10000); }
    });

    socket.on('attackMonster', (payload) => {
        const p = onlinePlayers[socket.id]; if (!p || p.isGhost) return; 
        const world = worlds[p.instanceId]; if (!world) return; 
        const m = world.monsters[payload.monsterId]; if (!m || !m.alive) return;
        
        const pcx = p.x + 24; const pcy = p.y + 48; const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2); const dist = Math.hypot(pcx - mcx, pcy - mcy); if (dist > 350) return;
        const dmg = Math.max(1, Math.floor(Number(payload.damage) || 1)); m.currentHp -= dmg; if (m.currentHp < 0) m.currentHp = 0; m.threatTable[p.id] = (m.threatTable[p.id] || 0) + dmg;
        
        if (payload.freeze) {
            m.frozenUntil = Date.now() + 3000; 
        }

        io.to(p.instanceId).emit('monsterHit', { monsterId: m.id, attackerId: p.id, damage: dmg, newHp: m.currentHp, maxHp: m.maxHp, isPendant: !!payload.isPendant });
        
        if (m.currentHp <= 0) {
            m.alive = false; m.targetId = null; m.threatTable = {}; m.forcedTargetId = null; m.forcedUntil = 0; m.frozenUntil = 0;
            io.to(p.instanceId).emit('monsterDied', { monsterId: m.id, killerId: p.id });
            
            const expAmount = m.expYield || 25;
            const pid = playerParty[p.id];

            if (pid && parties[pid]) {
                for (const memberId of parties[pid].members) { 
                    const sid = findSocketIdByPlayerId(memberId); 
                    if (sid) {
                        io.to(sid).emit('receiveExp', { amount: expAmount, source: m.name }); 
                        io.to(sid).emit('lootDropped', generateLoot(m));
                    }
                }
            } else { 
                io.to(socket.id).emit('receiveExp', { amount: expAmount, source: m.name }); 
                io.to(socket.id).emit('lootDropped', generateLoot(m));
            }
            
            if (m.respawnDelayMs !== -1) {
                setTimeout(() => { const cfg = { spawnArea: { minX: m.homeX, maxX: m.homeX, minY: m.homeY, maxY: m.homeY } }; const nm = spawnMonster(p.instanceId, m.id, m.monsterKey, cfg); world.monsters[m.id] = nm; io.to(p.instanceId).emit('monsterSpawned', serializeMonster(nm)); }, m.respawnDelayMs || 3000);
            }
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
        const p = onlinePlayers[socket.id];
        if (p) {
            socket.to(p.instanceId).emit('remotePlayerLeft', p.id);
            removeFromParty(p.id);
            supabase.from('Exonians').update({ pos_x: p.x, pos_y: p.y }).eq('character_name', p.id).then(()=>{});
            delete onlinePlayers[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Exonie server running on port ${PORT}`));

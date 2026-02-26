require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); // CRITICAL FOR AUTO-SAVING MAPS
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
// THE MONSTER DATABASE
// ==========================================
const MonsterDatabase = {
    "common_mobs1": { name: "Slime", category: "common_mobs", maxHp: 100, atk: 25, def: 0, speed: 2.5, expYield: 25, aggroRadius: 250, chaseRadius: 400, attackRange: 55, width: 40, height: 40, respawnDelay: 10000 },
    "mini_boss1": { name: "Orc Chieftain", category: "mini_boss", maxHp: 1500, atk: 80, def: 20, speed: 3.5, expYield: 500, aggroRadius: 350, chaseRadius: 500, attackRange: 60, width: 64, height: 64, respawnDelay: 300000 },
    "floor_boss1": { name: "Dragon of Exonie", category: "floor_boss", maxHp: 10000, atk: 250, def: 50, speed: 4.5, expYield: 5000, aggroRadius: 500, chaseRadius: 800, attackRange: 100, width: 128, height: 128, respawnDelay: 99999999 }
};

function findSocketIdByPlayerId(playerId) { for (const sid of Object.keys(onlinePlayers)) { if (onlinePlayers[sid]?.id === playerId) return sid; } return null; }
function getPlayerById(playerId) { for (const sid of Object.keys(onlinePlayers)) { if (onlinePlayers[sid]?.id === playerId) return onlinePlayers[sid]; } return null; }

function emitPartyUpdate(partyId) {
    const party = parties[partyId]; if (!party) return; const members = [];
    for (const pid of party.members) {
        const p = getPlayerById(pid);
        if (p) members.push({ id: p.id, name: p.name, level: p.level || 1, currentHp: p.currentHp ?? null, maxHp: p.maxHp ?? null });
        else members.push({ id: pid, name: pid, level: 1, currentHp: null, maxHp: null });
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

const worlds = {}; 

function spawnMonster(mapId, entityId, monsterKey, cfg) {
    const stats = MonsterDatabase[monsterKey] || MonsterDatabase["common_mobs1"];
    return { 
        id: entityId, mapId, monsterKey, name: stats.name, 
        x: cfg.spawnArea.minX, y: cfg.spawnArea.minY, 
        homeX: cfg.spawnArea.minX, homeY: cfg.spawnArea.minY, 
        width: stats.width, height: stats.height, 
        maxHp: stats.maxHp, currentHp: stats.maxHp, atk: stats.atk, def: stats.def, speed: stats.speed, expYield: stats.expYield,
        aggroRadius: stats.aggroRadius, chaseRadius: stats.chaseRadius, attackRange: stats.attackRange, 
        lastAttack: 0, alive: true, threatTable: {}, forcedTargetId: null, forcedUntil: 0, targetId: null, respawnDelayMs: stats.respawnDelay 
    };
}

function serializeMonster(m) { return { id: m.id, monsterKey: m.monsterKey, name: m.name, x: m.x, y: m.y, width: m.width, height: m.height, maxHp: m.maxHp, currentHp: m.currentHp, alive: m.alive, targetId: m.targetId || null }; }
function playersInMap(mapId) { return Object.values(onlinePlayers).filter(p => p.mapId === mapId); }

function isMonsterColliding(mapId, mx, my, mWidth, mHeight) {
    const cols = worlds[mapId]?.collisions || [];
    for (let box of cols) {
        if (mx < box.x + box.w && mx + mWidth > box.x && my < box.y + box.h && my + mHeight > box.y) return true;
    }
    return false;
}

function pickTarget(m, mapId, now) {
    if (m.forcedTargetId && now < m.forcedUntil) { const forced = getPlayerById(m.forcedTargetId); if (forced && forced.mapId === mapId && (forced.currentHp ?? 1) > 0) return forced; } 
    else { m.forcedTargetId = null; m.forcedUntil = 0; }
    for (const pid of Object.keys(m.threatTable)) { const p = getPlayerById(pid); if (!p || p.mapId !== mapId || (p.currentHp ?? 1) <= 0) delete m.threatTable[pid]; }
    let best = null; let bestThreat = -1; let bestDist = Infinity;
    for (const pid of Object.keys(m.threatTable)) {
        const threat = m.threatTable[pid] || 0; const p = getPlayerById(pid); if (!p) continue;
        const dist = Math.hypot((p.x + 24) - (m.x + (m.width / 2)), (p.y + 48) - (m.y + (m.height / 2)));
        if (dist > m.chaseRadius) continue;
        if (threat > bestThreat || (threat === bestThreat && dist < bestDist)) { best = p; bestThreat = threat; bestDist = dist; }
    }
    if (best) return best;
    let nearest = null; let nearestDist = Infinity;
    for (const p of playersInMap(mapId)) {
        if ((p.currentHp ?? 1) <= 0) continue;
        const dist = Math.hypot((p.x + 24) - (m.x + (m.width / 2)), (p.y + 48) - (m.y + (m.height / 2)));
        if (dist <= m.aggroRadius && dist < nearestDist) { nearest = p; nearestDist = dist; }
    }
    if (nearest) { m.threatTable[nearest.id] = Math.max(1, m.threatTable[nearest.id] || 0); return nearest; }
    return null;
}

function updateMonsterAI(mapId, m, now) {
    if (!m.alive) return;
    const target = pickTarget(m, mapId, now); m.targetId = target ? target.id : null;
    const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2);
    
    if (!target) { 
        const dist = Math.hypot(m.homeX - m.x, m.homeY - m.y); 
        if (dist > 2) { 
            const ang = Math.atan2(m.homeY - m.y, m.homeX - m.x); 
            let nx = m.x + Math.cos(ang) * m.speed; let ny = m.y + Math.sin(ang) * m.speed; 
            if (!isMonsterColliding(mapId, nx, m.y, m.width, m.height)) m.x = nx;
            if (!isMonsterColliding(mapId, m.x, ny, m.width, m.height)) m.y = ny;
        } 
        return; 
    }

    const dist = Math.hypot((target.x + 24) - mcx, (target.y + 48) - mcy);
    if (dist > m.chaseRadius) { if (m.threatTable[target.id]) m.threatTable[target.id] *= 0.9; if (m.threatTable[target.id] < 1) delete m.threatTable[target.id]; if (!m.forcedTargetId) m.targetId = null; return; }
    
    if (dist > m.attackRange) { 
        const ang = Math.atan2((target.y + 48) - mcy, (target.x + 24) - mcx); 
        let nx = m.x + Math.cos(ang) * m.speed; let ny = m.y + Math.sin(ang) * m.speed; 
        if (!isMonsterColliding(mapId, nx, m.y, m.width, m.height)) m.x = nx;
        if (!isMonsterColliding(mapId, m.x, ny, m.width, m.height)) m.y = ny;
    } else { 
        if (now - m.lastAttack > 1500) { m.lastAttack = now; io.to(mapId).emit('monsterAttack', { monsterId: m.id, targetId: target.id }); } 
    }
}

setInterval(() => {
    const now = Date.now();
    for (const mapId of Object.keys(worlds)) {
        const world = worlds[mapId];
        for (const mid of Object.keys(world.monsters)) updateMonsterAI(mapId, world.monsters[mid], now);
        io.to(mapId).emit('monsterState', Object.values(world.monsters).map(serializeMonster));
    }
}, 100);

io.on('connection', (socket) => {
    let currentUser = null; 

    // --- ADMIN MAP FILE SAVER API ---
    socket.on('saveMapFile', (data) => {
        if (!data.mapId || !data.content) return;
        const fileName = data.mapId === 'town' ? 'townmap.js' : `${data.mapId}.js`;
        const filePath = path.join(__dirname, 'public', fileName);
        try {
            fs.writeFileSync(filePath, data.content);
            socket.emit('partyError', `SUCCESS: Map permanently saved to ${fileName} on server!`);
        } catch(err) {
            console.error(err);
            socket.emit('partyError', `ERROR saving map to ${fileName}`);
        }
    });

    socket.on('syncMapData', (data) => {
        if (!data.mapId) return;
        if (!worlds[data.mapId]) { worlds[data.mapId] = { mapId: data.mapId, collisions: [], monsters: {}, monstersSpawned: false }; }
        worlds[data.mapId].collisions = data.collisions || [];

        // STRICT SPAWN SYSTEM: Only spawns monsters exactly where admin placed them!
        if (!worlds[data.mapId].monstersSpawned) {
            worlds[data.mapId].monstersSpawned = true;
            let mIndex = 0;
            const spawnGroups = [
                { arr: data.normalSpawns || [], fallback: 'common_mobs1' },
                { arr: data.miniBossSpawns || [], fallback: 'mini_boss1' },
                { arr: data.floorBossSpawns || [], fallback: 'floor_boss1' }
            ];

            spawnGroups.forEach(group => {
                group.arr.forEach(sp => {
                    let mKey = sp.monsterKey || group.fallback;
                    let mId = `${data.mapId}_m_${mIndex++}`;
                    let cfg = { spawnArea: { minX: sp.x, maxX: sp.x, minY: sp.y, maxY: sp.y } };
                    worlds[data.mapId].monsters[mId] = spawnMonster(data.mapId, mId, mKey, cfg);
                });
            });
        }
    });

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

    socket.on('createCharacter', async (data) => {
        try {
            const { username, charData } = data;
            const starterGear = { id: Date.now()+1, name: "Starter Sword", type: "weapon", sprite: "basicsword", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { attack: 5 }, enhanceLevel: 0 };
            const starterInv = new Array(20).fill(null);
            starterInv[0] = { id: Date.now()+2, name: "Starter Staff", type: "weapon", sprite: "basicstaff", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 5 }, enhanceLevel: 0 };
            starterInv[1] = { id: Date.now()+3, name: "Starter Pendant", type: "weapon", sprite: "basicpendant", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 2 }, enhanceLevel: 0 };
            starterInv[2] = { id: Date.now()+4, name: "Starter Health Potion", type: "potion", fixedStat: { hpHeal: 50 }, color: "#f44336", quantity: 5 };
            
            const { data: updatedUser, error } = await supabase.from('Exonians').update({
                skin_color: charData.skinColor, hair_color: charData.hairColor, hair_style: charData.hairStyle,
                level: 1, exp: 0, max_exp: 200, current_hp: 100, gold: 0, map_id: 'town', pos_x: 960, pos_y: 1000,
                base_stats: { hp: 100, attack: 5, magic: 5, defense: 2, speed: 1, str: 10, int: 10 },
                inventory: starterInv, equips: { weapon: starterGear, armor: null, leggings: null }
            }).eq('character_name', username).select().single();
            if (error) return socket.emit('authError', `Failed to create character: ${error.message}`);
            socket.emit('characterSelect', updatedUser);
        } catch(e) { socket.emit('authError', 'Server Error'); }
    });

    socket.on('enterWorld', (userData) => {
        const mapId = userData.map_id || 'town';
        onlinePlayers[socket.id] = {
            socketId: socket.id, id: userData.character_name, name: userData.character_name, mapId: mapId,
            x: userData.pos_x || 960, y: userData.pos_y || 1000, level: userData.level || 1, currentHp: userData.current_hp || 100, maxHp: null, tradeTarget: null,
            equips: userData.equips || { weapon: null, armor: null, leggings: null }, spriteData: { skin: userData.skin_color, hair: userData.hair_color, style: userData.hair_style, weapon: userData.equips?.weapon?.sprite || null }
        };
        socket.join(mapId); socket.emit('authSuccess', userData);
        socket.to(mapId).emit('remotePlayerJoined', { id: onlinePlayers[socket.id].id, name: onlinePlayers[socket.id].name, mapId, x: onlinePlayers[socket.id].x, y: onlinePlayers[socket.id].y, spriteData: onlinePlayers[socket.id].spriteData });
        const playersInMap = Object.values(onlinePlayers).filter(p => p.mapId === mapId && p.id !== userData.character_name);
        socket.emit('mapPlayersList', playersInMap.map(p => ({ id: p.id, name: p.name, mapId: p.mapId, x: p.x, y: p.y, spriteData: p.spriteData })));
    });

    socket.on('saveData', async (playerData) => {
        if (!currentUser) return;
        supabase.from('Exonians').update({ level: playerData.level, exp: playerData.exp, max_exp: playerData.maxExp, current_hp: playerData.currentHp, gold: playerData.gold, pos_x: playerData.x, pos_y: playerData.y, map_id: playerData.mapId, base_stats: playerData.baseStats, inventory: playerData.inventory, equips: playerData.equips }).eq('character_name', currentUser).then(()=>{});
        if (onlinePlayers[socket.id]) { onlinePlayers[socket.id].level = playerData.level; onlinePlayers[socket.id].currentHp = playerData.currentHp; onlinePlayers[socket.id].equips = playerData.equips; if (playerData.equips?.weapon?.sprite) onlinePlayers[socket.id].spriteData.weapon = playerData.equips.weapon.sprite; }
        if (onlinePlayers[socket.id]) { const pid = playerParty[onlinePlayers[socket.id].id]; if (pid) emitPartyUpdate(pid); }
    });

    socket.on('playerMoved', (data) => {
        if (!onlinePlayers[socket.id]) return; const p = onlinePlayers[socket.id]; p.x = data.x; p.y = data.y; p.spriteData.weapon = data.weaponSprite;
        socket.to(p.mapId).emit('remotePlayerMoved', { id: p.id, x: data.x, y: data.y, state: data.state, facingRight: data.facingRight, weaponSprite: data.weaponSprite });
    });

    socket.on('chatMessage', (data) => {
        const p = onlinePlayers[socket.id]; if (!p || !data.text) return;
        io.to(p.mapId).emit('chatMessage', { id: p.id, text: data.text });
    });

    socket.on('tradeRequest', ({ targetId }) => { const me = onlinePlayers[socket.id]; if (!me || !targetId) return; const targetSid = findSocketIdByPlayerId(targetId); if (!targetSid) return socket.emit('partyError', 'Target is not online.'); io.to(targetSid).emit('tradeInviteReceived', { fromId: me.id }); });
    socket.on('tradeInviteResponse', ({ fromId, accept }) => { const me = onlinePlayers[socket.id]; if (!me || !fromId) return; const fromSid = findSocketIdByPlayerId(fromId); const inviter = getPlayerById(fromId); if (!inviter || !fromSid) return; if (!accept) { io.to(fromSid).emit('partyError', `${me.id} declined your trade request.`); } else { me.tradeTarget = inviter.id; inviter.tradeTarget = me.id; io.to(fromSid).emit('tradeStarted', { targetId: me.id }); socket.emit('tradeStarted', { targetId: inviter.id }); } });
    socket.on('tradeSync', (data) => { const me = onlinePlayers[socket.id]; if (!me || !me.tradeTarget) return; const targetSid = findSocketIdByPlayerId(me.tradeTarget); if (targetSid) io.to(targetSid).emit('tradeSyncReceived', data); });
    socket.on('tradeCancel', () => { const me = onlinePlayers[socket.id]; if (!me) return; const targetSid = findSocketIdByPlayerId(me.tradeTarget); if (targetSid) { io.to(targetSid).emit('tradeCancelled'); const target = getPlayerById(me.tradeTarget); if (target) target.tradeTarget = null; } me.tradeTarget = null; });

    socket.on('playerVitals', (data) => { if (!onlinePlayers[socket.id]) return; onlinePlayers[socket.id].currentHp = data.currentHp; onlinePlayers[socket.id].maxHp = data.maxHp; onlinePlayers[socket.id].level = data.level; const pid = playerParty[onlinePlayers[socket.id].id]; if (pid) emitPartyUpdate(pid); });
    socket.on('playerTeleported', async (data) => {
        if (!onlinePlayers[socket.id]) return; const p = onlinePlayers[socket.id];
        socket.leave(p.mapId); socket.to(p.mapId).emit('remotePlayerLeft', p.id); p.mapId = data.mapId; p.x = data.x; p.y = data.y; socket.join(p.mapId);
        socket.to(p.mapId).emit('remotePlayerJoined', { id: p.id, name: p.name, mapId: p.mapId, x: p.x, y: p.y, spriteData: p.spriteData });
        const playersInMap = Object.values(onlinePlayers).filter(remote => remote.mapId === p.mapId && remote.id !== p.id);
        socket.emit('mapPlayersList', playersInMap.map(pp => ({ id: pp.id, name: pp.name, mapId: pp.mapId, x: pp.x, y: pp.y, spriteData: pp.spriteData })));
        supabase.from('Exonians').update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y }).eq('character_name', currentUser).then(()=>{});
    });

    socket.on('inspectRequest', async ({ targetId }) => {
        if (!targetId) return; const target = getPlayerById(targetId);
        if (target) { return socket.emit('inspectData', { id: target.id, name: target.name, level: target.level || 1, currentHp: target.currentHp ?? null, maxHp: target.maxHp ?? null, equips: target.equips || {} }); }
        const { data: user, error } = await supabase.from('Exonians').select('character_name, level, current_hp, max_exp, base_stats, equips').eq('character_name', targetId).single();
        if (error || !user) return; socket.emit('inspectData', { id: user.character_name, name: user.character_name, level: user.level || 1, currentHp: user.current_hp ?? null, maxHp: null, equips: user.equips || {} });
    });

    socket.on('partyInvite', ({ targetId }) => { const me = onlinePlayers[socket.id]; if (!me || !targetId) return; const targetSid = findSocketIdByPlayerId(targetId); if (!targetSid) return socket.emit('partyError', 'Target is not online.'); io.to(targetSid).emit('partyInviteReceived', { fromId: me.id }); });
    socket.on('partyInviteResponse', ({ fromId, accept }) => {
        const me = onlinePlayers[socket.id]; if (!me || !fromId) return; const fromSid = findSocketIdByPlayerId(fromId); const inviter = getPlayerById(fromId); if (!inviter || !fromSid) return;
        if (!accept) { io.to(fromSid).emit('partyError', `${me.id} declined your party invite.`); return; }
        let pid = playerParty[fromId]; if (!pid) { pid = `party_${Date.now()}_${Math.floor(Math.random() * 9999)}`; parties[pid] = { id: pid, leaderId: fromId, members: new Set([fromId]) }; playerParty[fromId] = pid; }
        if (playerParty[me.id] && playerParty[me.id] !== pid) { removeFromParty(me.id); }
        parties[pid].members.add(me.id); playerParty[me.id] = pid; emitPartyUpdate(pid);
    });

    socket.on('attackMonster', (payload) => {
        const p = onlinePlayers[socket.id]; if (!p) return; const world = worlds[p.mapId]; if (!world) return; const m = world.monsters[payload.monsterId]; if (!m || !m.alive) return;
        const pcx = p.x + 24; const pcy = p.y + 48; const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2); const dist = Math.hypot(pcx - mcx, pcy - mcy); if (dist > 350) return;
        const dmg = Math.max(1, Math.floor(Number(payload.damage) || 1)); m.currentHp -= dmg; if (m.currentHp < 0) m.currentHp = 0; m.threatTable[p.id] = (m.threatTable[p.id] || 0) + dmg;
        io.to(p.mapId).emit('monsterHit', { monsterId: m.id, attackerId: p.id, damage: dmg, newHp: m.currentHp, maxHp: m.maxHp, isPendant: !!payload.isPendant });
        
        if (m.currentHp <= 0) {
            m.alive = false; m.targetId = null; m.threatTable = {}; m.forcedTargetId = null; m.forcedUntil = 0; 
            io.to(p.mapId).emit('monsterDied', { monsterId: m.id, killerId: p.id });
            
            const expAmount = m.expYield || 25;
            const pid = playerParty[p.id];
            if (pid && parties[pid]) {
                for (const memberId of parties[pid].members) {
                    const sid = findSocketIdByPlayerId(memberId);
                    if (sid) io.to(sid).emit('receiveExp', { amount: expAmount, source: m.name });
                }
            } else {
                io.to(socket.id).emit('receiveExp', { amount: expAmount, source: m.name });
            }
            
            io.to(socket.id).emit('lootDropped', { id: Date.now() + Math.random(), name: "Basic Refinement Stone Lv.5", type: "material", level: 5, rarity: "Basic", color: "#e0e0e0", description: "Enhances equipment.", quantity: 1 });
            setTimeout(() => { const cfg = { spawnArea: { minX: m.homeX, maxX: m.homeX, minY: m.homeY, maxY: m.homeY } }; const nm = spawnMonster(p.mapId, m.id, m.monsterKey, cfg); world.monsters[m.id] = nm; io.to(p.mapId).emit('monsterSpawned', serializeMonster(nm)); }, m.respawnDelayMs || 3000);
        }
    });

    socket.on('disconnect', async () => {
        const p = onlinePlayers[socket.id];
        if (p) {
            socket.to(p.mapId).emit('remotePlayerLeft', p.id);
            removeFromParty(p.id);
            if (p.tradeTarget) { const tsid = findSocketIdByPlayerId(p.tradeTarget); if (tsid) io.to(tsid).emit('tradeCancelled'); }
            supabase.from('Exonians').update({ pos_x: p.x, pos_y: p.y }).eq('character_name', p.id).then(()=>{});
            delete onlinePlayers[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Exonie server running on port ${PORT}`));

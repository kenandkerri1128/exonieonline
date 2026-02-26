require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; // service_role recommended
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));

// --- REALTIME MEMORY ---
const onlinePlayers = {}; // socket.id -> player state (for movement/inspect/party)

// --- PARTY MEMORY ---
const parties = {};        // partyId -> { id, leaderId, members: Set(playerId) }
const playerParty = {};    // playerId -> partyId

function findSocketIdByPlayerId(playerId) {
    for (const sid of Object.keys(onlinePlayers)) {
        if (onlinePlayers[sid]?.id === playerId) return sid;
    }
    return null;
}

function getPlayerById(playerId) {
    for (const sid of Object.keys(onlinePlayers)) {
        if (onlinePlayers[sid]?.id === playerId) return onlinePlayers[sid];
    }
    return null;
}

function emitPartyUpdate(partyId) {
    const party = parties[partyId];
    if (!party) return;

    const members = [];
    for (const pid of party.members) {
        const p = getPlayerById(pid);
        if (p) {
            members.push({
                id: p.id,
                name: p.name,
                level: p.level || 1,
                currentHp: p.currentHp ?? null,
                maxHp: p.maxHp ?? null
            });
        } else {
            // offline members (should not happen in this simple system)
            members.push({ id: pid, name: pid, level: 1, currentHp: null, maxHp: null });
        }
    }

    const payload = {
        partyId: party.id,
        leaderId: party.leaderId,
        name: `${party.leaderId}'s Party`,
        members
    };

    for (const pid of party.members) {
        const sid = findSocketIdByPlayerId(pid);
        if (sid) io.to(sid).emit('partyUpdate', payload);
    }
}

function removeFromParty(playerId) {
    const pid = playerParty[playerId];
    if (!pid) return;

    const party = parties[pid];
    if (!party) { delete playerParty[playerId]; return; }

    party.members.delete(playerId);
    delete playerParty[playerId];

    // if leader left, reassign
    if (party.leaderId === playerId) {
        const next = party.members.values().next().value;
        party.leaderId = next || null;
    }

    // disband if too small
    if (!party.leaderId || party.members.size <= 1) {
        // notify remaining members to clear
        for (const rem of party.members) {
            delete playerParty[rem];
            const sid = findSocketIdByPlayerId(rem);
            if (sid) io.to(sid).emit('partyKickedOrLeft');
        }
        delete parties[pid];
        return;
    }

    emitPartyUpdate(pid);
}

// --- MONSTER WORLD (SERVER-AUTHORITATIVE) ---
const worlds = {}; // mapId -> { mapId, monsters: { id->monster } }

function getMapConfig(mapId) {
    // minimal configs (extend later)
    if ((mapId || '').includes('floor')) {
        return { spawnArea: { minX: 300, maxX: 1700, minY: 250, maxY: 1050 }, isFloor: true };
    }
    return { spawnArea: { minX: 200, maxX: 1600, minY: 300, maxY: 900 }, isFloor: false };
}

function ensureWorld(mapId) {
    if (!worlds[mapId]) {
        const cfg = getMapConfig(mapId);
        worlds[mapId] = {
            mapId,
            monsters: {
                slime1: spawnMonster(mapId, 'slime1', cfg)
            }
        };
    }
    return worlds[mapId];
}

function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

function spawnMonster(mapId, monsterId, cfg) {
    const x = randInt(cfg.spawnArea.minX, cfg.spawnArea.maxX);
    const y = randInt(cfg.spawnArea.minY, cfg.spawnArea.maxY);
    return {
        id: monsterId,
        mapId,
        x, y,
        homeX: x, homeY: y,
        width: 40, height: 40,
        maxHp: 100,
        currentHp: 100,
        atk: 25,
        def: 0,
        speed: 2.5,
        aggroRadius: 250,
        chaseRadius: 400,
        attackRange: 55,
        lastAttack: 0,
        alive: true,
        threatTable: {},

        forcedTargetId: null,
        forcedUntil: 0,

        targetId: null,
        isFloorBoss: false,          // keep false for slime
        respawnDelayMs: 3000         // unlimited respawn
    };
}

function serializeMonster(m) {
    return {
        id: m.id,
        x: m.x,
        y: m.y,
        maxHp: m.maxHp,
        currentHp: m.currentHp,
        alive: m.alive,
        targetId: m.targetId || null,
        isFloorBoss: m.isFloorBoss || false
    };
}

function playersInMap(mapId) {
    return Object.values(onlinePlayers).filter(p => p.mapId === mapId);
}

function pickTarget(m, mapId, now) {
    // forced target (provoke)
    if (m.forcedTargetId && now < m.forcedUntil) {
        const forced = getPlayerById(m.forcedTargetId);
        if (forced && forced.mapId === mapId && (forced.currentHp ?? 1) > 0) return forced;
    } else {
        m.forcedTargetId = null;
        m.forcedUntil = 0;
    }

    // clean threat of missing players
    for (const pid of Object.keys(m.threatTable)) {
        const p = getPlayerById(pid);
        if (!p || p.mapId !== mapId || (p.currentHp ?? 1) <= 0) delete m.threatTable[pid];
    }

    // highest threat inside chase radius
    let best = null;
    let bestThreat = -1;
    let bestDist = Infinity;

    for (const pid of Object.keys(m.threatTable)) {
        const threat = m.threatTable[pid] || 0;
        const p = getPlayerById(pid);
        if (!p) continue;
        const pcx = p.x + 24;
        const pcy = p.y + 48;
        const mcx = m.x + (m.width / 2);
        const mcy = m.y + (m.height / 2);
        const dist = Math.hypot(pcx - mcx, pcy - mcy);
        if (dist > m.chaseRadius) continue;

        if (threat > bestThreat || (threat === bestThreat && dist < bestDist)) {
            best = p;
            bestThreat = threat;
            bestDist = dist;
        }
    }
    if (best) return best;

    // nearest inside aggro radius
    let nearest = null;
    let nearestDist = Infinity;
    for (const p of playersInMap(mapId)) {
        if ((p.currentHp ?? 1) <= 0) continue;
        const pcx = p.x + 24;
        const pcy = p.y + 48;
        const mcx = m.x + (m.width / 2);
        const mcy = m.y + (m.height / 2);
        const dist = Math.hypot(pcx - mcx, pcy - mcy);
        if (dist <= m.aggroRadius && dist < nearestDist) {
            nearest = p;
            nearestDist = dist;
        }
    }
    if (nearest) {
        // seed threat
        m.threatTable[nearest.id] = Math.max(1, m.threatTable[nearest.id] || 0);
        return nearest;
    }

    return null;
}

function updateMonsterAI(mapId, m, now) {
    if (!m.alive) return;

    const target = pickTarget(m, mapId, now);
    m.targetId = target ? target.id : null;

    const mcx = m.x + (m.width / 2);
    const mcy = m.y + (m.height / 2);

    if (!target) {
        // return home
        const dx = m.homeX - m.x;
        const dy = m.homeY - m.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 2) {
            const ang = Math.atan2(dy, dx);
            m.x += Math.cos(ang) * m.speed;
            m.y += Math.sin(ang) * m.speed;
        }
        return;
    }

    const pcx = target.x + 24;
    const pcy = target.y + 48;
    const dist = Math.hypot(pcx - mcx, pcy - mcy);

    // leave chase radius -> drop threat slowly
    if (dist > m.chaseRadius) {
        if (m.threatTable[target.id]) m.threatTable[target.id] *= 0.9;
        if (m.threatTable[target.id] < 1) delete m.threatTable[target.id];
        if (!m.forcedTargetId) m.targetId = null;
        return;
    }

    if (dist > m.attackRange) {
        const ang = Math.atan2(pcy - mcy, pcx - mcx);
        m.x += Math.cos(ang) * m.speed;
        m.y += Math.sin(ang) * m.speed;
    } else {
        if (now - m.lastAttack > 1500) {
            m.lastAttack = now;
            io.to(mapId).emit('monsterAttack', { monsterId: m.id, targetId: target.id });
        }
    }
}

// AI tick + broadcast state to all players in each map
setInterval(() => {
    const now = Date.now();
    for (const mapId of Object.keys(worlds)) {
        const world = worlds[mapId];
        for (const mid of Object.keys(world.monsters)) {
            updateMonsterAI(mapId, world.monsters[mid], now);
        }
        // broadcast whole list (supports future multiple mobs)
        io.to(mapId).emit('monsterState', Object.values(world.monsters).map(serializeMonster));
    }
}, 100);

// --- CONNECTION ---
io.on('connection', (socket) => {
    let currentUser = null; // character_name

    // --- REGISTRATION ---
    socket.on('register', async (data) => {
        const { username, password } = data;

        const { data: existingUser } = await supabase
            .from('Exonians')
            .select('character_name')
            .eq('character_name', username)
            .single();

        if (existingUser) return socket.emit('authError', 'Username is already taken!');

        const { error } = await supabase
            .from('Exonians')
            .insert([{ character_name: username, password: password }]);

        if (error) {
            console.error("Supabase Registration Error:", error);
            return socket.emit('authError', `Database Error: ${error.message}`);
        }

        socket.emit('registerSuccess', username);
    });

    // --- LOGIN ---
    socket.on('login', async (data) => {
        const { username, password } = data;

        const { data: user, error } = await supabase
            .from('Exonians')
            .select('*')
            .eq('character_name', username)
            .eq('password', password)
            .single();

        if (error || !user) {
            console.error("Supabase Login Error:", error);
            return socket.emit('authError', 'Invalid username or password.');
        }

        currentUser = username;

        if (!user.skin_color) socket.emit('needsCharacterCreation', username);
        else socket.emit('characterSelect', user);
    });

    // --- CHARACTER CREATION ---
    socket.on('createCharacter', async (data) => {
        const { username, charData } = data;

        const starterGear = { name: "Starter Sword", type: "weapon", sprite: "startersword", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { attack: 5 }, enhanceLevel: 0 };
        const starterInv = new Array(20).fill(null);
        starterInv[0] = { name: "Starter Staff", type: "weapon", sprite: "starterstaff", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 5 }, enhanceLevel: 0 };
        starterInv[1] = { name: "Starter Pendant", type: "weapon", sprite: "starterpendant", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 2 }, enhanceLevel: 0 };
        starterInv[2] = { name: "Starter Health Potion", type: "potion", fixedStat: { hpHeal: 50 }, color: "#f44336", quantity: 5 };

        const { data: updatedUser, error } = await supabase
            .from('Exonians')
            .update({
                skin_color: charData.skinColor,
                hair_color: charData.hairColor,
                hair_style: charData.hairStyle,
                level: 1, exp: 0, max_exp: 200, current_hp: 100,
                map_id: 'town', pos_x: 960, pos_y: 1000,
                base_stats: { hp: 100, attack: 5, magic: 5, defense: 2, speed: 1, str: 10, int: 10 },
                inventory: starterInv,
                equips: { weapon: starterGear, armor: null, leggings: null }
            })
            .eq('character_name', username)
            .select()
            .single();

        if (error) {
            console.error("Supabase Creation Error:", error);
            return socket.emit('authError', `Failed to create character: ${error.message}`);
        }

        socket.emit('characterSelect', updatedUser);
    });

    // --- ENTER WORLD ---
    socket.on('enterWorld', (userData) => {
        const mapId = userData.map_id || 'town';
        ensureWorld(mapId);

        onlinePlayers[socket.id] = {
            socketId: socket.id,
            id: userData.character_name,
            name: userData.character_name,
            mapId: mapId,
            x: userData.pos_x,
            y: userData.pos_y,
            level: userData.level || 1,
            currentHp: userData.current_hp || 100,
            maxHp: null, // client will send vitals
            equips: userData.equips || { weapon: null, armor: null, leggings: null },
            spriteData: {
                skin: userData.skin_color,
                hair: userData.hair_color,
                style: userData.hair_style,
                weapon: userData.equips?.weapon?.sprite || null
            }
        };

        socket.join(mapId);

        socket.emit('authSuccess', userData);

        // broadcast join to others
        socket.to(mapId).emit('remotePlayerJoined', {
            id: onlinePlayers[socket.id].id,
            name: onlinePlayers[socket.id].name,
            mapId,
            x: onlinePlayers[socket.id].x,
            y: onlinePlayers[socket.id].y,
            spriteData: onlinePlayers[socket.id].spriteData
        });

        // send player list in map
        const playersInMap = Object.values(onlinePlayers).filter(p => p.mapId === mapId && p.id !== userData.character_name);
        socket.emit('mapPlayersList', playersInMap.map(p => ({
            id: p.id, name: p.name, mapId: p.mapId, x: p.x, y: p.y, spriteData: p.spriteData
        })));

        // send monsters list in map
        const world = ensureWorld(mapId);
        socket.emit('mapMonstersList', Object.values(world.monsters).map(serializeMonster));
    });

    // --- SAVE DATA TO SUPABASE ---
    socket.on('saveData', async (playerData) => {
        if (!currentUser) return;

        await supabase
            .from('Exonians')
            .update({
                level: playerData.level,
                exp: playerData.exp,
                max_exp: playerData.maxExp,
                current_hp: playerData.currentHp,
                pos_x: playerData.x,
                pos_y: playerData.y,
                map_id: playerData.mapId,
                base_stats: playerData.baseStats,
                inventory: playerData.inventory,
                equips: playerData.equips
            })
            .eq('character_name', currentUser);

        // keep memory updated for inspect/party
        if (onlinePlayers[socket.id]) {
            onlinePlayers[socket.id].level = playerData.level;
            onlinePlayers[socket.id].currentHp = playerData.currentHp;
            onlinePlayers[socket.id].equips = playerData.equips;
            if (playerData.equips?.weapon?.sprite) onlinePlayers[socket.id].spriteData.weapon = playerData.equips.weapon.sprite;
        }

        // update party HUD
        if (onlinePlayers[socket.id]) {
            const pid = playerParty[onlinePlayers[socket.id].id];
            if (pid) emitPartyUpdate(pid);
        }
    });

    // keeps equips fresh without writing supabase every time
    socket.on('playerEquipUpdate', (data) => {
        if (!onlinePlayers[socket.id]) return;
        if (data?.equips) onlinePlayers[socket.id].equips = data.equips;
        if (data?.equips?.weapon?.sprite) onlinePlayers[socket.id].spriteData.weapon = data.equips.weapon.sprite;

        const pid = playerParty[onlinePlayers[socket.id].id];
        if (pid) emitPartyUpdate(pid);
    });

    // --- VITALS FOR PARTY UI ---
    socket.on('playerVitals', (data) => {
        if (!onlinePlayers[socket.id]) return;
        onlinePlayers[socket.id].currentHp = data.currentHp;
        onlinePlayers[socket.id].maxHp = data.maxHp;
        onlinePlayers[socket.id].level = data.level;

        const pid = playerParty[onlinePlayers[socket.id].id];
        if (pid) emitPartyUpdate(pid);
    });

    // --- REALTIME MOVEMENT ---
    socket.on('playerMoved', (data) => {
        if (!onlinePlayers[socket.id]) return;

        const p = onlinePlayers[socket.id];
        p.x = data.x;
        p.y = data.y;
        p.spriteData.weapon = data.weaponSprite;

        socket.to(p.mapId).emit('remotePlayerMoved', {
            id: p.id,
            x: data.x,
            y: data.y,
            state: data.state,
            facingRight: data.facingRight,
            weaponSprite: data.weaponSprite
        });
    });

    // --- TELEPORTATION ENGINE ---
    socket.on('playerTeleported', async (data) => {
        if (!onlinePlayers[socket.id]) return;
        const p = onlinePlayers[socket.id];

        // leave old map + notify old map
        socket.leave(p.mapId);
        socket.to(p.mapId).emit('remotePlayerLeft', p.id);

        // join new map
        p.mapId = data.mapId;
        p.x = data.x;
        p.y = data.y;

        ensureWorld(p.mapId);

        socket.join(p.mapId);
        socket.to(p.mapId).emit('remotePlayerJoined', {
            id: p.id, name: p.name, mapId: p.mapId, x: p.x, y: p.y, spriteData: p.spriteData
        });

        const playersInMap = Object.values(onlinePlayers).filter(remote => remote.mapId === p.mapId && remote.id !== p.id);
        socket.emit('mapPlayersList', playersInMap.map(pp => ({
            id: pp.id, name: pp.name, mapId: pp.mapId, x: pp.x, y: pp.y, spriteData: pp.spriteData
        })));

        // send monsters in new map
        const world = ensureWorld(p.mapId);
        socket.emit('mapMonstersList', Object.values(world.monsters).map(serializeMonster));

        await supabase
            .from('Exonians')
            .update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y })
            .eq('character_name', currentUser);
    });

    // --- INSPECT ---
    socket.on('inspectRequest', async ({ targetId }) => {
        if (!targetId) return;

        // try online first
        const target = getPlayerById(targetId);
        if (target) {
            return socket.emit('inspectData', {
                id: target.id,
                name: target.name,
                level: target.level || 1,
                currentHp: target.currentHp ?? null,
                maxHp: target.maxHp ?? null,
                equips: target.equips || {}
            });
        }

        // fallback: query DB
        const { data: user, error } = await supabase
            .from('Exonians')
            .select('character_name, level, current_hp, max_exp, base_stats, equips')
            .eq('character_name', targetId)
            .single();

        if (error || !user) return;

        socket.emit('inspectData', {
            id: user.character_name,
            name: user.character_name,
            level: user.level || 1,
            currentHp: user.current_hp ?? null,
            maxHp: null,
            equips: user.equips || {}
        });
    });

    // --- PARTY INVITE ---
    socket.on('partyInvite', ({ targetId }) => {
        const me = onlinePlayers[socket.id];
        if (!me) return;
        if (!targetId) return;

        const targetSid = findSocketIdByPlayerId(targetId);
        if (!targetSid) return socket.emit('partyError', 'Target is not online.');

        io.to(targetSid).emit('partyInviteReceived', { fromId: me.id });
    });

    socket.on('partyInviteResponse', ({ fromId, accept }) => {
        const me = onlinePlayers[socket.id];
        if (!me) return;
        if (!fromId) return;

        const fromSid = findSocketIdByPlayerId(fromId);
        const inviter = getPlayerById(fromId);
        if (!inviter || !fromSid) return;

        if (!accept) {
            io.to(fromSid).emit('partyError', `${me.id} declined your party invite.`);
            return;
        }

        // ensure inviter has or creates party
        let pid = playerParty[fromId];
        if (!pid) {
            pid = `party_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
            parties[pid] = { id: pid, leaderId: fromId, members: new Set([fromId]) };
            playerParty[fromId] = pid;
        }

        // if me already in a party, leave it first
        if (playerParty[me.id] && playerParty[me.id] !== pid) {
            removeFromParty(me.id);
        }

        // join party
        parties[pid].members.add(me.id);
        playerParty[me.id] = pid;

        emitPartyUpdate(pid);
    });

    // --- MONSTER DAMAGE (CLIENT REPORTS DMG, SERVER OWNS HP/AGGRO/RESPAWN) ---
    socket.on('attackMonster', (payload) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const world = ensureWorld(p.mapId);
        const m = world.monsters[payload.monsterId];
        if (!m || !m.alive) return;

        // basic anti-cheat range validation
        const pcx = p.x + 24;
        const pcy = p.y + 48;
        const mcx = m.x + (m.width / 2);
        const mcy = m.y + (m.height / 2);
        const dist = Math.hypot(pcx - mcx, pcy - mcy);
        if (dist > 350) return;

        const dmg = Math.max(1, Math.floor(Number(payload.damage) || 1));
        m.currentHp -= dmg;
        if (m.currentHp < 0) m.currentHp = 0;

        // threat / aggro (highest damager gets aggro; provoke can override)
        m.threatTable[p.id] = (m.threatTable[p.id] || 0) + dmg;

        io.to(p.mapId).emit('monsterHit', {
            monsterId: m.id,
            attackerId: p.id,
            damage: dmg,
            newHp: m.currentHp,
            maxHp: m.maxHp,
            isPendant: !!payload.isPendant
        });

        if (m.currentHp <= 0) {
            m.alive = false;
            m.targetId = null;
            m.threatTable = {};
            m.forcedTargetId = null;
            m.forcedUntil = 0;

            io.to(p.mapId).emit('monsterDied', { monsterId: m.id, killerId: p.id });

            // simple drop: server sends one item to killer (prevents dupes)
            // (you can expand drop tables later)
            const drop = {
                id: Date.now() + Math.random(),
                name: "Basic Refinement Stone Lv.5",
                type: "material",
                level: 5,
                rarity: "Basic",
                color: "#e0e0e0",
                description: "Enhances equipment.",
                quantity: 1
            };
            io.to(socket.id).emit('lootDropped', drop);

            // respawn (unlimited)
            setTimeout(() => {
                const cfg = getMapConfig(p.mapId);
                const nm = spawnMonster(p.mapId, m.id, cfg);
                world.monsters[m.id] = nm;
                io.to(p.mapId).emit('monsterSpawned', serializeMonster(nm));
            }, m.respawnDelayMs || 3000);
        }
    });

    // optional provoke support (future skill)
    socket.on('provokeMonster', ({ monsterId, durationMs }) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        const world = ensureWorld(p.mapId);
        const m = world.monsters[monsterId];
        if (!m || !m.alive) return;

        m.forcedTargetId = p.id;
        m.forcedUntil = Date.now() + Math.max(1000, Math.min(10000, Number(durationMs) || 5000));
        m.threatTable[p.id] = (m.threatTable[p.id] || 0) + 9999; // ensure top threat during provoke
    });

    // --- DISCONNECT ---
    socket.on('disconnect', async () => {
        const p = onlinePlayers[socket.id];
        if (p) {
            socket.to(p.mapId).emit('remotePlayerLeft', p.id);

            // party cleanup
            removeFromParty(p.id);

            await supabase
                .from('Exonians')
                .update({ pos_x: p.x, pos_y: p.y })
                .eq('character_name', p.id);

            delete onlinePlayers[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Exonie Online server running on port ${PORT}`));

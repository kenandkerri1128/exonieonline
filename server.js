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
const supabaseKey = process.env.SUPABASE_KEY;
// When using the service_role key, Supabase bypasses RLS automatically for the server!
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));

// Server memory for real-time multiplayer sync
const onlinePlayers = {};

io.on('connection', (socket) => {
    let currentUser = null;

    // --- 1. REGISTRATION ---
    socket.on('register', async (data) => {
        const { username, password } = data;
        
        // Check for duplicates using character_name
        const { data: existingUser } = await supabase.from('Exonians').select('character_name').eq('character_name', username).single();
        if (existingUser) {
            return socket.emit('authError', 'Username is already taken!');
        }

        // Create base account (Targeting character_name)
        const { error } = await supabase.from('Exonians').insert([{ character_name: username, password: password }]);
        
        if (error) {
            console.error("Supabase Registration Error:", error);
            return socket.emit('authError', `Database Error: ${error.message}`);
        }

        socket.emit('registerSuccess', username);
    });

    // --- 2. LOGIN ---
    socket.on('login', async (data) => {
        const { username, password } = data;
        
        // Login check using character_name
        const { data: user, error } = await supabase.from('Exonians').select('*').eq('character_name', username).eq('password', password).single();
        
        if (error || !user) {
            console.error("Supabase Login Error:", error);
            return socket.emit('authError', 'Invalid username or password.');
        }

        currentUser = username;

        // If skin_color is null, they haven't created a character yet
        if (!user.skin_color) {
            socket.emit('needsCharacterCreation', username);
        } else {
            // They have a character, send them to Character Select
            socket.emit('characterSelect', user);
        }
    });

    // --- 3. CHARACTER CREATION ---
    socket.on('createCharacter', async (data) => {
        const { username, charData } = data;

        const starterGear = { name: "Starter Sword", type: "weapon", sprite: "startersword", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { attack: 5 }, enhanceLevel: 0 };
        const starterInv = new Array(20).fill(null);
        starterInv[0] = { name: "Starter Staff", type: "weapon", sprite: "starterstaff", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 5 }, enhanceLevel: 0 };
        starterInv[1] = { name: "Starter Pendant", type: "weapon", sprite: "starterpendant", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 2 }, enhanceLevel: 0 };
        starterInv[2] = { name: "Starter Health Potion", type: "potion", fixedStat: { hpHeal: 50 }, color: "#f44336", quantity: 5 };

        // Update using character_name
        const { data: updatedUser, error } = await supabase.from('Exonians').update({
            skin_color: charData.skinColor,
            hair_color: charData.hairColor,
            hair_style: charData.hairStyle,
            level: 1, exp: 0, max_exp: 200, current_hp: 100,
            map_id: 'town', pos_x: 960, pos_y: 1000,
            base_stats: { hp: 100, attack: 5, magic: 5, defense: 2, speed: 1, str: 10, int: 10 },
            inventory: starterInv,
            equips: { weapon: starterGear, armor: null, leggings: null }
        }).eq('character_name', username).select().single();

        if (error) {
            console.error("Supabase Creation Error:", error);
            return socket.emit('authError', `Failed to create character: ${error.message}`);
        }
        
        socket.emit('characterSelect', updatedUser);
    });

    // --- 4. ENTER WORLD ---
    socket.on('enterWorld', (userData) => {
        onlinePlayers[socket.id] = {
            id: userData.character_name, name: userData.character_name, mapId: userData.map_id || 'town', x: userData.pos_x, y: userData.pos_y,
            spriteData: { skin: userData.skin_color, hair: userData.hair_color, style: userData.hair_style, weapon: userData.equips?.weapon?.sprite }
        };

        socket.join(onlinePlayers[socket.id].mapId);
        socket.emit('authSuccess', userData);
        socket.to(onlinePlayers[socket.id].mapId).emit('remotePlayerJoined', onlinePlayers[socket.id]);
        
        const playersInMap = Object.values(onlinePlayers).filter(p => p.mapId === onlinePlayers[socket.id].mapId && p.id !== userData.character_name);
        socket.emit('mapPlayersList', playersInMap);
    });

    // Save Data to Supabase
    socket.on('saveData', async (playerData) => {
        if (!currentUser) return;
        await supabase.from('Exonians').update({
            level: playerData.level, exp: playerData.exp, max_exp: playerData.maxExp, current_hp: playerData.currentHp,
            pos_x: playerData.x, pos_y: playerData.y, map_id: playerData.mapId,
            base_stats: playerData.baseStats, inventory: playerData.inventory, equips: playerData.equips
        }).eq('character_name', currentUser);
    });

    // Multiplayer Real-time Movement
    socket.on('playerMoved', (data) => {
        if (!onlinePlayers[socket.id]) return;
        onlinePlayers[socket.id].x = data.x;
        onlinePlayers[socket.id].y = data.y;
        onlinePlayers[socket.id].spriteData.weapon = data.weaponSprite;
        
        socket.to(onlinePlayers[socket.id].mapId).emit('remotePlayerMoved', {
            id: currentUser, x: data.x, y: data.y, state: data.state, facingRight: data.facingRight, weaponSprite: data.weaponSprite
        });
    });

    // Map Teleportation Engine
    socket.on('playerTeleported', async (data) => {
        if (!onlinePlayers[socket.id]) return;
        const p = onlinePlayers[socket.id];
        
        socket.leave(p.mapId);
        socket.to(p.mapId).emit('remotePlayerLeft', p.id);
        
        p.mapId = data.mapId; p.x = data.x; p.y = data.y;
        socket.join(p.mapId);
        socket.to(p.mapId).emit('remotePlayerJoined', p);
        
        const playersInMap = Object.values(onlinePlayers).filter(remote => remote.mapId === p.mapId && remote.id !== p.id);
        socket.emit('mapPlayersList', playersInMap);
        
        await supabase.from('Exonians').update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y }).eq('character_name', currentUser);
    });

    socket.on('disconnect', async () => {
        if (onlinePlayers[socket.id]) {
            const p = onlinePlayers[socket.id];
            socket.to(p.mapId).emit('remotePlayerLeft', p.id);
            await supabase.from('Exonians').update({ pos_x: p.x, pos_y: p.y }).eq('character_name', p.id);
            delete onlinePlayers[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Exonie Online server running on port ${PORT}`));

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// --- Supabase Connection ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Server Memory for Real-Time Syncing
const onlinePlayers = {}; // { socketId: { id, name, mapId, x, y, hp, maxHp, speed, spriteData } }

// --- REST API Fallbacks (Optional for saving/loading) ---
app.post('/api/save-character', async (req, res) => {
    const charData = req.body;
    
    // Upsert to Supabase
    const { error } = await supabase.from('Exonians').upsert({
        id: charData.id || charData.name, 
        character_name: charData.name,
        skin_color: charData.skinColor,
        hair_color: charData.hairColor,
        hair_style: charData.hairStyle,
        level: charData.level || 1,
        exp: charData.exp || 0,
        max_exp: charData.maxExp || 200,
        current_hp: charData.currentHp || 100,
        pos_x: charData.x || 960,
        pos_y: charData.y || 1000,
        map_id: charData.mapId || 'town',
        base_stats: charData.baseStats || {},
        inventory: charData.inventory || [],
        equips: charData.equips || {}
    });

    if (error) {
        console.error("Supabase Save Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
    console.log("Character saved to Supabase:", charData.name);
    res.json({ success: true, message: 'Character saved successfully to Exonie Online.' });
});

app.get('/api/load-character', async (req, res) => {
    const username = req.query.name;
    const { data, error } = await supabase.from('Exonians').select('*').eq('character_name', username).single();
    
    if (data) {
        res.json({ success: true, data: data });
    } else {
        res.json({ success: false, message: 'No character found.' });
    }
});

// --- REAL-TIME MULTIPLAYER SYSTEM (Socket.IO) ---
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Authentication / Login via Socket
    socket.on('login', async (credentials) => {
        const { data: user, error } = await supabase
            .from('Exonians')
            .select('*')
            .eq('character_name', credentials.name) // Using name as identifier for prototype
            .single();

        if (error || !user) {
            socket.emit('authError', "Player not found. Please register or create avatar.");
            return;
        }

        // Load player into server memory
        onlinePlayers[socket.id] = {
            id: user.id,
            name: user.character_name,
            mapId: user.map_id || 'town',
            x: user.pos_x || 960,
            y: user.pos_y || 1000,
            hp: user.current_hp || 100,
            maxHp: user.base_stats?.hp || 100,
            speed: 4, 
            spriteData: {
                skin: user.skin_color || 'flesh',
                hair: user.hair_color || 'black',
                style: user.hair_style || '1',
                weapon: user.equips?.weapon?.sprite || null
            }
        };

        // Group players by map ID
        socket.join(onlinePlayers[socket.id].mapId);

        // Confirm login to the connecting client
        socket.emit('authSuccess', user);

        // Broadcast to everyone else on the map that someone spawned
        socket.to(onlinePlayers[socket.id].mapId).emit('remotePlayerJoined', onlinePlayers[socket.id]);

        // Send the connecting player a list of everyone currently on the map
        const playersInMap = Object.values(onlinePlayers).filter(p => p.mapId === onlinePlayers[socket.id].mapId && p.id !== user.id);
        socket.emit('mapPlayersList', playersInMap);
    });

    // Movement Broadcast (Client sends this during their game loop)
    socket.on('playerMoved', (positionData) => {
        if (!onlinePlayers[socket.id]) return;
        
        // Update server authority
        onlinePlayers[socket.id].x = positionData.x;
        onlinePlayers[socket.id].y = positionData.y;
        
        // Relay to other players in the same map instance
        socket.to(onlinePlayers[socket.id].mapId).emit('remotePlayerMoved', {
            id: onlinePlayers[socket.id].id,
            x: positionData.x,
            y: positionData.y,
            isMoving: positionData.isMoving,
            facingRight: positionData.facingRight
        });
    });

    // Teleport Engine Synchronization
    socket.on('playerTeleported', async (teleportData) => {
        if (!onlinePlayers[socket.id]) return;

        const player = onlinePlayers[socket.id];
        const oldMap = player.mapId;
        
        // Leave the old map's socket channel
        socket.leave(oldMap);
        
        // Update player data
        player.mapId = teleportData.newMapId;
        player.x = teleportData.x;
        player.y = teleportData.y;
        
        // Join the new map's socket channel
        socket.join(player.mapId);

        // Remove them from old map screens
        socket.to(oldMap).emit('remotePlayerLeft', player.id);

        // Spawn them on new map screens
        socket.to(player.mapId).emit('remotePlayerJoined', player);

        // Fetch existing players on the new map for the teleporter
        const playersInMap = Object.values(onlinePlayers).filter(p => p.mapId === player.mapId && p.id !== player.id);
        socket.emit('mapPlayersList', playersInMap);

        // Save backend transition securely
        await supabase.from('Exonians').update({ 
            map_id: player.mapId, pos_x: player.x, pos_y: player.y 
        }).eq('character_name', player.name);
    });

    // Handle Disconnections
    socket.on('disconnect', async () => {
        console.log(`Player disconnected: ${socket.id}`);
        if (onlinePlayers[socket.id]) {
            const player = onlinePlayers[socket.id];
            
            // Secure final save to Supabase before garbage collection
            try {
                await supabase.from('Exonians').update({ 
                    pos_x: player.x, pos_y: player.y, map_id: player.mapId 
                }).eq('character_name', player.name);
            } catch(e) {
                console.error("Failed to save on disconnect", e);
            }

            // Remove player sprite for everyone else
            socket.to(player.mapId).emit('remotePlayerLeft', player.id);
            delete onlinePlayers[socket.id];
        }
    });
});

server.listen(port, () => {
    console.log(`Exonie Online server is running! Open http://localhost:${port} in your browser.`);
});
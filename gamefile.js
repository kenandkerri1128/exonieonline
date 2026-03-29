// ==========================================
// 🛡️ ANTI-MULTI-BOXING: TAB LOCK
// ==========================================
const exonieChannel = new BroadcastChannel('exonie_game_instance');
exonieChannel.postMessage('game_opened');
exonieChannel.onmessage = (event) => {
    if (event.data === 'game_opened') {
        exonieChannel.postMessage('already_running');
    } else if (event.data === 'already_running') {
        document.body.innerHTML = `<div style="background:#111; color:#fff; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; font-family:sans-serif;"><h1 style="color:#f44336;">Game Already Open</h1><p>You can only play one instance of Exonie.</p><p>Please close this tab and return to your active game.</p></div>`;
        if (typeof socket !== 'undefined') socket.disconnect();
    }
};

// ==========================================
// 1. CORE VARIABLES & SETUP
// ==========================================
// 🌐 AUTO-DETECTS TEST OR LIVE SERVER + MOBILE RECONNECTS
const serverUrl = window.location.origin; 
const socket = io(serverUrl, {
    reconnection: true,            // 🔄 Try to reconnect automatically if data drops
    reconnectionAttempts: 10,      // Try 10 times before giving up completely
    reconnectionDelay: 2000,       // Wait 2 seconds between attempts
    reconnectionDelayMax: 5000,    // Never wait more than 5 seconds
    timeout: 20000,                // Give the connection 20 seconds to establish
});

// 🔔 OPTIONAL: Log to console if the internet flickers
socket.on('reconnect_attempt', () => {
    console.log("Internet connection unstable. Attempting to reconnect...");
});
let currentShopItem = null; // 🛡️ GLOBAL TRACKER FOR THE SHOP
window.isProcessingShop = false; // Anti-Spam Lock
let isMailboxOpen = false, isChatting = false, isInventoryOpen = false, isSkillOpen = false, isShopping = false, localBossTimer = null, isEnhancing = false, isApplyingAura = false;
window.isStorageOpen = false; // <-- ADD THIS
let activeInvIndex = -1, attackCooldownActive = false, isAttacking = false, attackHeld = false, autoAttackMode = false;
let lastNetTs = 0, lastSentState = 'idle', pendingPartyInvite = null, pendingTradeInvite = null, inTradeMode = false, tradeTarget = null;
let tradeMyItems = [null,null,null], tradeTheirItems = [null,null,null], lastVitalsSent = {hp:null,maxHp:null,level:null}, lastVitalsTs = 0;
let isDrawing = false, startX = 0, startY = 0, currentBox = null, drawType = 'collision';
let currentBGM = null, currentTrackName = "", activeTargetPlayerId = null;

// 🛡️ THE FIX: Game Loop & FPS Cap Variables
let currentAnimationId = null;
let lastFrameTime = 0;
const fpsInterval = 1000 / 60; // Caps the game at 60 FPS so 144Hz monitors aren't twice as fast!

// 👑 GLOBAL ADMIN LIST (Keep this matched with server.js!)
window.ADMINS = ['Kei', 'Jubs4DaWin', 'TesterName'];
window.isAdmin = function(name) { return window.ADMINS.includes(name); };

window.facingRight = false; window.isLoading = false; window.isDungeonUIOpen = false;
window.isSpectating = false; window.spectateTargetId = null; window.potionCooldownReadyAt = 0;

const dom = { 
    game: document.getElementById('game-screen'), playerContainer: document.getElementById('player-container'), playerAvatarContainer: document.getElementById('player-avatar-container'), 
    playerBody: document.getElementById('player-body'), playerHead: document.getElementById('player-head'), playerHair: document.getElementById('player-hair'), 
    playerWeapon: document.getElementById('player-weapon'), playerArmor: document.getElementById('player-armor'), playerLeggings: document.getElementById('player-leggings'), 
    world: document.getElementById('world'), log: document.getElementById('combat-log'), statScreen: document.getElementById('stat-screen'), 
    invScreen: document.getElementById('inventory-screen'), inspect: document.getElementById('inspect-screen'), inspectContent: document.getElementById('inspect-content'), 
    inspectTitle: document.getElementById('inspect-title'), partyPanel: document.getElementById('party-panel'), partyMembers: document.getElementById('party-members'), 
    adminOutput: document.getElementById('admin-output'), skillScreen: document.getElementById('skill-screen'), hotbar: document.getElementById('hotbar')
};

window.game = { 
    isRunning: false, isGhost: false, keys: { w: false, a: false, s: false, d: false, z: false, x: false, c: false },
    player: { 
        id: 'local_player',
        name: "Adventurer",
        level: 1,
        currentHp: 100,
        x: 960,
        y: 1000,
        width: 48,
        height: 96,
        w: 24,
        h: 20,
        teleportCooldown: 0,
        currentPortal: null,
        equips: { weapon: null },
        currentBodySrc: '',
        playerClass: null,
        immortalUntil: 0,
        untargetableUntil: 0,
        activePets: [],
        lootFilter: {
            Starter: true,
            Basic: true,
            Rare: true,
            Unique: true,
            Legendary: true,
            Godly: true
        }
    }, 
    monsters: {}, remotePlayers: {}, party: null 
};

const DatabaseManager = { 
    saveTimer: null,
    savePlayerData: function(playerObj) { 
        playerObj.mapId = safeMapData.id || 'town'; 
        playerObj.maxHp = window.getMaxHp(); 
        
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            if(socket) socket.emit('saveData', playerObj); 
            if(socket) socket.emit('playerEquipUpdate', { equips: playerObj.equips }); 
        }, 600);
    } 
};
const skinFilters = { 'flesh': 'sepia(1) hue-rotate(-25deg) saturate(2.5) brightness(1.1)', 'yellow': 'sepia(1) hue-rotate(15deg) saturate(3) brightness(1.2)', 'green': 'sepia(1) hue-rotate(75deg) saturate(2) brightness(1)', 'blue': 'sepia(1) hue-rotate(180deg) saturate(2) brightness(1)', 'white': 'grayscale(1) brightness(1.8) contrast(0.9)' };
const hairFilters = { 'black': 'brightness(0.2)', 'blonde': 'sepia(1) hue-rotate(15deg) saturate(3) brightness(1.5)', 'brown': 'sepia(1) hue-rotate(330deg) saturate(2) brightness(0.6)', 'blue': 'sepia(1) hue-rotate(180deg) saturate(2) brightness(1)', 'white': 'grayscale(1) brightness(1.8) contrast(0.9)' };
window.charData = { skinColor: 'flesh', hairColor: 'black', hairStyle: '1' }; 
window.adminMode = false; let CAMERA_ZOOM = window.innerWidth <= 950 ? 1.2 : 1.8; 
const STAT_TYPES = ['attack', 'magic', 'defense', 'speed', 'int', 'str', 'hp'];

// TAVERN LEADERBOARD SHINES
window.topTavernPlayers = [];
const rankStyle = document.createElement('style');
rankStyle.innerHTML = `
    .rank-1-name { 
        color: #fff !important; 
        font-weight: bold !important;
        text-shadow: 0 0 5px #fff, 0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FF8C00 !important;
        filter: drop-shadow(0 0 5px #FFD700);
        animation: auraGold 2.5s infinite alternate ease-in-out;
    }
    .rank-2-name { 
        color: #fff !important; 
        font-weight: bold !important;
        text-shadow: 0 0 5px #fff, 0 0 10px #E0E0E0, 0 0 20px #E0E0E0, 0 0 30px #9E9E9E !important;
        filter: drop-shadow(0 0 5px #E0E0E0);
        animation: auraSilver 2.5s infinite alternate ease-in-out;
    }
    .rank-3-name { 
        color: #fff !important; 
        font-weight: bold !important;
        text-shadow: 0 0 5px #fff, 0 0 10px #CD7F32, 0 0 20px #CD7F32, 0 0 30px #8B4513 !important;
        filter: drop-shadow(0 0 5px #CD7F32);
        animation: auraBronze 2.5s infinite alternate ease-in-out;
    }
    @keyframes auraGold {
        from { filter: drop-shadow(0 0 2px #FFD700); text-shadow: 0 0 5px #fff, 0 0 10px #FFD700, 0 0 20px #FFD700; }
        to { filter: drop-shadow(0 0 10px #FFD700); text-shadow: 0 0 8px #fff, 0 0 15px #FFD700, 0 0 35px #FF8C00; }
    }
    @keyframes auraSilver {
        from { filter: drop-shadow(0 0 2px #E0E0E0); text-shadow: 0 0 5px #fff, 0 0 10px #E0E0E0, 0 0 20px #E0E0E0; }
        to { filter: drop-shadow(0 0 10px #E0E0E0); text-shadow: 0 0 8px #fff, 0 0 15px #E0E0E0, 0 0 35px #9E9E9E; }
    }
    @keyframes auraBronze {
        from { filter: drop-shadow(0 0 2px #CD7F32); text-shadow: 0 0 5px #fff, 0 0 10px #CD7F32, 0 0 20px #CD7F32; }
        to { filter: drop-shadow(0 0 10px #CD7F32); text-shadow: 0 0 8px #fff, 0 0 15px #CD7F32, 0 0 35px #8B4513; }
   }
    
   .weapon-aura-divine {
        /* 👑 INSANE BLINDING GLOW */
        filter: drop-shadow(0 0 10px #ffffff) drop-shadow(0 0 20px #ffea00) drop-shadow(0 0 40px #ff9800) brightness(2) contrast(1.2) !important;
        animation: divinePulseExtreme 0.8s infinite alternate ease-in-out;
    }
    @keyframes divinePulseExtreme {
        0% { filter: drop-shadow(0 0 10px #ffffff) drop-shadow(0 0 20px #ffea00) drop-shadow(0 0 30px #ff9800) brightness(1.5) contrast(1.1); }
        100% { filter: drop-shadow(0 0 15px #ffffff) drop-shadow(0 0 30px #ffea00) drop-shadow(0 0 60px #ff5722) brightness(2.5) contrast(1.3); }
    }
    
    /* 👑 SPARKLING GOLDEN TEXT FOR INVENTORY & TOOLTIPS */
    .rarity-divine-text {
        color: #ffea00 !important;
        text-shadow: 0 0 5px #fff, 0 0 10px #ffea00, 0 0 20px #ff9800 !important;
        animation: textSparkle 1.5s infinite alternate;
    }
    @keyframes textSparkle {
        0% { filter: brightness(1); text-shadow: 0 0 5px #fff, 0 0 10px #ffea00; }
        100% { filter: brightness(1.5); text-shadow: 0 0 8px #fff, 0 0 15px #ffea00, 0 0 25px #ff9800; }
    }

    /* 👼 NEW: AURA OF THE DIVINE (ROYAL TIER) - REFINED */
    .cosmetic-aura.aura-divine {
        display: block !important; /* 👑 FORCES VISIBILITY */
        position: absolute !important;
        inset: 0 !important;
        background: none !important; /* Removes the ugly wide circle */
        box-shadow: none !important;
        z-index: -1 !important; 
    }

    /* 1. Tight White Border & Gold Outer Glow */
    .avatar-rig:has(.aura-divine) {
        animation: divine-outline-pulse 1.5s infinite alternate ease-in-out !important;
    }

    @keyframes divine-outline-pulse {
        0% {
            filter: 
                drop-shadow(0 0 1px #fff) drop-shadow(0 0 2px #fff) /* Tight white border */
                drop-shadow(0 0 6px #ffea00) drop-shadow(0 0 12px #ff9800); /* Outer gold glow */
        }
        100% {
            filter: 
                drop-shadow(0 0 2px #fff) drop-shadow(0 0 3px #fff) 
                drop-shadow(0 0 12px #ffea00) drop-shadow(0 0 25px #ff9800);
        }
    }

    /* 2. Wings attached to the body */
    .cosmetic-aura.aura-divine::before {
        content: '';
        position: absolute;
        top: 20px; 
        left: -15px; /* Pulled inward to attach to the back */
        width: 35px; height: 60px;
        background: radial-gradient(ellipse at right, rgba(255,255,255,1) 10%, rgba(255,234,0,0.8) 60%, transparent 80%);
        border-radius: 100% 0% 60% 0%;
        box-shadow: -2px 0 10px #ffea00;
        transform-origin: right center;
        animation: wingFlapLeft 2s infinite alternate ease-in-out;
    }

    .cosmetic-aura.aura-divine::after {
        content: '';
        position: absolute;
        top: 20px; 
        right: -15px; /* Pulled inward to attach to the back */
        width: 35px; height: 60px;
        background: radial-gradient(ellipse at left, rgba(255,255,255,1) 10%, rgba(255,234,0,0.8) 60%, transparent 80%);
        border-radius: 0% 100% 0% 60%;
        box-shadow: 2px 0 10px #ffea00;
        transform-origin: left center;
        animation: wingFlapRight 2s infinite alternate ease-in-out;
    }

    @keyframes wingFlapLeft {
        0% { transform: rotate(10deg) scaleY(1); }
        100% { transform: rotate(-15deg) scaleY(0.9); }
    }
    @keyframes wingFlapRight {
        0% { transform: rotate(-10deg) scaleY(1); }
        100% { transform: rotate(15deg) scaleY(0.9); }
    }
`;
document.head.appendChild(rankStyle);
// ==========================================
// 🐉 MONSTER CSS (FINALIZED MINOTAUR & SCALED DRAGON)
// ==========================================
const monsterStyle = document.createElement('style');
monsterStyle.innerHTML = `
    /* --- 🐂 MINOTAUR (Exact Golem structure with separate head) --- */
    .minotaur-base { position:relative; width:100%; height:100%; display:flex; justify-content:center; }
    
    /* Head is distinct and on top of body */
    .m-head {
        width: 40%; height: 30%; background: #795548; border-radius:15px 15px 10px 10px; border:3px solid #000;
        position:absolute; top:5%; left:50%; transform:translateX(-50%); z-index: 3; display:flex; justify-content:center;
        box-shadow: 0 4px 8px rgba(0,0,0,0.5);
    }
    .m-eye-l, .m-eye-r { width:20%; height:20%; background:#ff1744; border-radius:50%; position:absolute; top:30%; box-shadow:0 0 5px #ff1744; }
    .m-eye-l { left: 15%; } .m-eye-r { right: 15%; }
    .m-snout { width:60%; height:40%; background:rgba(0,0,0,0.3); position:absolute; bottom:10%; border-radius:15px; display:flex; justify-content:center; }
    .m-ring { width:12px; height:12px; border:3px solid #FFD700; border-radius:50%; position:absolute; bottom:-8px;}
    .m-horn-l, .m-horn-r { width:35%; height:45%; background:#e0e0e0; border:2px solid #000; position:absolute; top:-30%; z-index:-1;}
    .m-horn-l { left:-10%; border-radius:100% 0 0 0; transform:rotate(-35deg); }
    .m-horn-r { right:-10%; border-radius:0 100% 0 0; transform:rotate(35deg); }
    
    /* Golem Style Torso */
    .m-body { width: 60%; height: 50%; background:#795548; border-radius:15px; border:3px solid #3E2723; position:absolute; bottom:20%; z-index:2; box-shadow:inset 0 -10px rgba(0,0,0,0.3); }
    
    /* Golem style floating limbs */
    .minotaur-base [class^="m-arm"], .minotaur-base [class^="m-leg"] { background:#795548; border:3px solid #3E2723; border-radius:8px; z-index:1; position:absolute; }
    .m-arm-l, .m-arm-r { width:15%; height:35%; top:30%; }
    .m-arm-l { left: -5%; } .m-arm-r { right: -5%; }
    .m-leg-l, .m-leg-r { width:20%; height:15%; bottom:5%; }
    .m-leg-l { left: 18%; } .m-leg-r { right: 18%; }
    
    /* The Battleaxe */
    .m-axe { position:absolute; top:50%; left:-45px; width:90px; height:8px; background:#3E2723; transform:rotate(-20deg); z-index:0; }
    .m-axe::before { content:''; position:absolute; top:-15px; left:-10px; width:35px; height:40px; background:#90a4ae; border-radius:30% 0 0 50%; border:2px solid #000; }

    /* Minotaur Tiers (RE-SKINNED BASED ON TYPE) */
    .minotaur-base.common_mobs .m-body, .minotaur-base.common_mobs .m-head, .minotaur-base.common_mobs [class*="m-arm"], .minotaur-base.common_mobs [class*="m-leg"] { background: #795548; border-color: #3E2723; }
    
    .minotaur-base.mini_boss .m-body, .minotaur-base.mini_boss .m-head, .minotaur-base.mini_boss [class*="m-arm"], .minotaur-base.mini_boss [class*="m-leg"] { background: #b71c1c; border-color: #4a0404; }
    .minotaur-base.mini_boss .m-axe::before { background: #e0e0e0; }
    
    .minotaur-base.floor_boss .m-body, .minotaur-base.floor_boss .m-head, .minotaur-base.floor_boss [class*="m-arm"], .minotaur-base.floor_boss [class*="m-leg"] { background: #212121; border-color: #ff9800; box-shadow: 0 0 15px #ff9800;}
    .minotaur-base.floor_boss .m-eye-l, .minotaur-base.floor_boss .m-eye-r { background:#ff9800; box-shadow:0 0 10px #ff9800; }
    .minotaur-base.floor_boss .m-axe::before { background: #111; border-color: #ff9800; }

   /* --- 🐉 NATIVE DRAGON CSS (COLOR-FORCED GEOMETRY) --- */
    .dragon-base { 
        position:relative; width:100%; height:100%; display:flex; justify-content:center; align-items:center; 
        /* 🛡️ FALLBACK COLORS: Guarantees it can never be transparent! */
        --d-col: #F97100; --d-bor: #530800; --d-wing: #E23401; --d-chest: #DBD5C5; --d-eye: #FBC614; --d-horn: #530800;
    }

    /* 🎨 Tier Colors (Overrides the fallbacks based on category) */
    .dragon-base.common_mobs { --d-col: #4caf50; --d-bor: #1b5e20; --d-wing: #2e7d32; --d-chest: #c8e6c9; --d-eye: #ffeb3b; --d-horn: #1b5e20; }
    .dragon-base.mini_boss { --d-col: #F97100; --d-bor: #530800; --d-wing: #E23401; --d-chest: #DBD5C5; --d-eye: #FBC614; --d-horn: #530800; }
    .dragon-base.floor_boss { --d-col: #aa00ff; --d-bor: #000000; --d-wing: #6200ea; --d-chest: #00e5ff; --d-eye: #00e5ff; --d-horn: #311b92; filter: drop-shadow(0 0 15px #aa00ff); }

    /* 🪨 Body */
    .dragon-base .d-body { position: absolute; bottom: 20%; width: 50%; height: 45%; background-color: var(--d-col) !important; border: 3px solid #000; z-index: 2; border-radius: 10px 10px 20px 20px; box-shadow: inset 0 -10px rgba(0,0,0,0.3); }

    /* 💎 The Signature Diamond Chest */
    .dragon-base .d-chest { position: absolute; top: 35%; width: 35%; height: 35%; background-color: var(--d-chest) !important; transform: rotate(45deg); border: 3px solid #000; z-index: 4; box-shadow: inset 0 -5px rgba(0,0,0,0.2); }

    /* 🐉 Head & Snout */
    .dragon-base .d-head { position: absolute; top: 10%; width: 45%; height: 35%; background-color: var(--d-col) !important; border: 3px solid #000; z-index: 5; border-radius: 10px 10px 30px 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.5); display:flex; justify-content:center; }
    .dragon-base .d-snout { position: absolute; bottom: -5px; width: 40%; height: 30%; background-color: var(--d-horn) !important; border: 2px solid #000; border-radius: 50%; }

    /* 😠 Angry Eyes */
    .dragon-base .d-eye-l, .dragon-base .d-eye-r { position: absolute; top: 30%; width: 25%; height: 15%; background-color: var(--d-eye) !important; border-radius: 50%; box-shadow: 0 0 5px var(--d-eye); border:1px solid #000; }
    .dragon-base .d-eye-l { left: 10%; transform: rotate(20deg); }
    .dragon-base .d-eye-r { right: 10%; transform: rotate(-20deg); }
    
    /* 🗡️ Pointy Horns */
    .dragon-base .d-horn-l, .dragon-base .d-horn-r { position: absolute; top: -30%; width: 20%; height: 50%; background-color: var(--d-horn) !important; z-index: -1; border: 2px solid #000; }
    .dragon-base .d-horn-l { left: -5%; border-radius: 100% 0 0 0; transform: rotate(-30deg); }
    .dragon-base .d-horn-r { right: -5%; border-radius: 0 100% 0 0; transform: rotate(30deg); }

    /* 🦇 Segmented Wings */
    .dragon-base .d-wing-l, .dragon-base .d-wing-r { position: absolute; top: 5%; width: 70%; height: 60%; background-color: var(--d-wing) !important; border: 3px solid #000; z-index: 1; box-shadow: inset 0 -10px rgba(0,0,0,0.3); }
    .dragon-base .d-wing-l { left: -40%; border-radius: 100% 0 50% 0; transform: rotate(-15deg); }
    .dragon-base .d-wing-r { right: -40%; border-radius: 0 100% 0 50%; transform: rotate(15deg); }

    /* 🐾 Claws/Feet */
    .dragon-base .d-foot-l, .dragon-base .d-foot-r { position: absolute; bottom: 10%; width: 20%; height: 15%; background-color: var(--d-horn) !important; border: 3px solid #000; z-index: 1; border-radius: 50% 50% 10px 10px; }
    .dragon-base .d-foot-l { left: 15%; transform: rotate(10deg); }
    .dragon-base .d-foot-r { right: 15%; transform: rotate(-10deg); }
`;
document.head.appendChild(monsterStyle);
// ==========================================
// 🚀 LOW-END MODE CSS OPTIMIZATIONS
// ==========================================
const perfStyle = document.createElement('style');
perfStyle.innerHTML = `
    /* 🛑 Disable Weapon Glows & Animations */
    body.low-perf .weapon-aura-legendary,
    body.low-perf .weapon-aura-godly,
    body.low-perf .weapon-aura-divine {
        filter: none !important;
        animation: none !important;
    }
    
    /* 🛑 Completely Hide Normal Cosmetic Armor Auras, BUT KEEP DIVINE WINGS */
    body.low-perf .cosmetic-aura:not(.aura-divine),
    body.low-perf .aura:not(.aura-divine) {
        display: none !important;
    }

    /* 👑 Optimize Divine Aura for Low-End (Keep Wings & Basic Gold Aura) */
    body.low-perf .avatar-rig:has(.aura-divine) {
        animation: none !important;
        filter: drop-shadow(0 0 5px #ffea00) !important; /* 🌟 THE FIX: A single, lightweight static gold outline */
    }
    body.low-perf .cosmetic-aura.aura-divine::before {
        box-shadow: -2px 0 4px #ffea00 !important; /* Tiny, cheap glow for left wing */
    }
    body.low-perf .cosmetic-aura.aura-divine::after {
        box-shadow: 2px 0 4px #ffea00 !important; /* Tiny, cheap glow for right wing */
    }

    /* 🛑 Strip Expensive Shadows from Projectiles & Effects */
    body.low-perf .magic-orb,
    body.low-perf .monster-fireball,
    body.low-perf .fox-fireball,
    body.low-perf .spark,
    body.low-perf .white-splash,
    body.low-perf .earthquake-ring {
        box-shadow: none !important;
        filter: none !important;
    }

    /* 🛑 Strip Glows from Pets & Clones */
    body.low-perf .pet-wisp,
    body.low-perf .pet-owl,
    body.low-perf .pet-fox,
    body.low-perf .pet-clone {
        box-shadow: none !important;
        filter: none !important;
    }

    /* 🛑 Flatten Leaderboard Nameplates */
    body.low-perf .rank-1-name,
    body.low-perf .rank-2-name,
    body.low-perf .rank-3-name {
        animation: none !important;
        filter: none !important;
        text-shadow: 1px 1px 0 #000 !important; 
    }

    /* 🛑 Hide Fog of War Canvas Completely (Massive CPU Saver) */
    body.low-perf #fow-canvas {
        display: none !important;
    }
`;
document.head.appendChild(perfStyle);

window.updateNameplateRanks = function() {
    const ranks = window.topTavernPlayers || [];
    const applyRank = (el, name) => {
        if (!el) return;
        el.classList.remove('rank-1-name', 'rank-2-name', 'rank-3-name');
        let rIdx = ranks.indexOf(name);
        if (rIdx === 0) el.classList.add('rank-1-name');
        else if (rIdx === 1) el.classList.add('rank-2-name');
        else if (rIdx === 2) el.classList.add('rank-3-name');
    };
    
    // Apply to local player
    applyRank(document.getElementById('player-name-tag'), game.player.name);
    
    // Apply to all remotes on the map
    for (const id in game.remotePlayers) {
        const rp = game.remotePlayers[id];
        if (rp && rp.dom) {
            const tags = rp.dom.getElementsByClassName('name-tag');
            if (tags.length > 0) applyRank(tags[0], rp.name);
        }
    }
};
window.RARITY_COLORS = { "Starter": "#aaaaaa", "Basic": "#8B4513", "Rare": "#2196F3", "Unique": "#9c27b0", "Legendary": "#f44336", "Godly": "#e0ffff" };
window.ITEM_TEMPLATES = { sword: { slot: 'weapon', statKey: 'attack', baseName: 'Sword', spriteName: 'sword' }, staff: { slot: 'weapon', statKey: 'magic', baseName: 'Staff', spriteName: 'staff' }, pendant: { slot: 'weapon', statKey: 'magic', baseName: 'Pendant', spriteName: 'pendant' }, gun: { slot: 'weapon', statKey: 'attack', baseName: 'Gun', spriteName: 'gun' }, dagger: { slot: 'weapon', statKey: 'attack', baseName: 'Dagger', spriteName: 'dagger' }, armor: { slot: 'armor', statKey: 'defense', baseName: 'Armor', spriteName: 'armor' }, leggings: { slot: 'leggings', statKey: 'hp', baseName: 'Leggings', spriteName: 'leggings' } };
window.MapDatabase = window.MapDatabase || {}; 
let safeMapData = { id: "town", name: "Town of Exonie", image: "town_map.png", spawnX: 960, spawnY: 1000, collisions: [], teleports: [], normalSpawns: [], miniBossSpawns: [], floorBossSpawns: [] };

// ==========================================
// 2. CLASSES & SKILLS ENGINE
// ==========================================
const CLASSES = {
    "Healer": { weapon: "pendant", aura: "green", skills: [
        { id: 'heal1', name: "Heal", unlock: 1, cd: 20000, type: 'active', desc: "Heals all party members in range x2 of your INT." },
        { id: 'heal2', name: "Boost", unlock: 25, type: 'passive', desc: "Makes your heal x3 of your INT." },
        { id: 'heal3', name: "Purification", unlock: 50, cd: 100000, type: 'active', desc: "Revives dead party members globally and heals everyone." },
        { id: 'heal4', name: "Healing Touch", unlock: 75, type: 'passive', desc: "Normal attacks heal all party members for 5% of your INT." }
    ]},
  "Summoner": { weapon: "staff", aura: "blue", skills: [
        { id: 'sum1', name: "Summon Slime", unlock: 1, cd: 25000, type: 'active', desc: "Summons a permanent slime with 25% stats to fight alongside you." },
        { id: 'sum2', name: "Duplicate", unlock: 25, type: 'passive', desc: "Summon Slime now spawns 2 slimes." },
        { id: 'sum3', name: "Enhance!", unlock: 50, cd: 100000, type: 'active', desc: "10s: Slimes gain 100% stats. Big Boss deals 4x Damage (1800 AoE)." },
        { id: 'sum4', name: "Big Boss", unlock: 75, type: 'passive', desc: "Summon Slime also summons a Giant White Boss Slime (5x HP) with Earthquake." }
    ]},
    "Ice Master": { weapon: "staff", aura: "blue", skills: [
        { id: 'ice1', name: "Icicle Spear", unlock: 1, cd: 25000, type: 'active', desc: "Drops an icicle dealing 2x Magic Attack." },
        { id: 'ice2', name: "Chill!", unlock: 25, type: 'passive', desc: "Your attacks have a 25% chance to freeze enemies." },
        { id: 'ice3', name: "Icicle Storm", unlock: 50, cd: 100000, type: 'active', desc: "Drops 3 icicles on the enemy." },
        { id: 'ice4', name: "Ice Splash", unlock: 75, type: 'passive', desc: "Your skills become AoE and hit all nearby enemies." }
    ]},
   "Berserker": { weapon: "sword", aura: "red", skills: [
        { id: 'ber1', name: "Callout!", unlock: 1, cd: 14000, type: 'active', desc: "Taunts enemies and multiplies Defense by 3x for 10s." },
        { id: 'ber2', name: "Bulk Up!", unlock: 25, type: 'passive', desc: "Increases base Defense and HP by 25%." },
        { id: 'ber3', name: "Immortal", unlock: 50, cd: 100000, type: 'active', desc: "Your HP cannot drop below 1 for 10 seconds." },
        { id: 'ber4', name: "I love PAIN", unlock: 75, type: 'passive', desc: "15% chance to heal a third of all incoming damage." }
    ]},
    "Blademaster": { weapon: "sword", aura: "red", skills: [
        { id: 'bld1', name: "Sharpen Up!", unlock: 1, type: 'passive', desc: "Increases base Attack by 25%." },
        { id: 'bld2', name: "Parry", unlock: 25, cd: 13000, type: 'active', desc: "70% chance to parry any attacks for 10 seconds." },
        { id: 'bld3', name: "Mega Slash", unlock: 50, cd: 50000, type: 'active', desc: "Slashes the enemy for 5x Attack Power." },
        { id: 'bld4', name: "Sharp Edge", unlock: 75, type: 'passive', desc: "25% chance to Bleed enemies for 15% ATK over 3 seconds." }
    ]},
"Sniper": { weapon: "gun", aura: "white", skills: [
        { id: 'snp1', name: "Eagle Eye", unlock: 1, type: 'passive', desc: "Increases basic attack range by 15%." },
        { id: 'snp2', name: "Silver Bullet", unlock: 25, cd: 5000, type: 'active', desc: "Fires a fast silver bullet dealing 2x Attack Power." },
        { id: 'snp3', name: "Killshot", unlock: 50, cd: 50000, type: 'active', desc: "Fires a devastating bullet dealing 4x Attack Power." },
        { id: 'snp4', name: "Dual Bullet", unlock: 75, type: 'passive', desc: "50% chance to release a double bullet on any attack." }
    ]},
    "Explosives Expert": { weapon: "gun", aura: "orange", skills: [
        { id: 'exp1', name: "Molotov", unlock: 1, cd: 12000, type: 'active', desc: "Throws a firebomb dealing 100% ATK per second on the ground." },
        { id: 'exp2', name: "Improved Oil", unlock: 25, type: 'passive', desc: "Increases Molotov ground fire duration from 3s to 10s." },
        { id: 'exp3', name: "Go Boom!", unlock: 50, cd: 30000, type: 'active', desc: "Throws a massive bomb dealing 5x Attack Power." },
        { id: 'exp4', name: "Big Explosion", unlock: 75, type: 'passive', desc: "Go Boom! becomes a massive AoE explosion." }
    ]},
"Phantom Striker": { weapon: "dagger", aura: "white", skills: [
        { id: 'phs1', name: "Shadow Step", unlock: 1, cd: 5000, type: 'active', desc: "Blinks in the direction you are facing." },
        { id: 'phs2', name: "Sleight of Hand", unlock: 25, type: 'passive', desc: "50% chance to hit twice in one interval." },
        { id: 'phs3', name: "Blink Stab", unlock: 50, cd: 30000, type: 'active', desc: "Blink to the enemy and stab for 2x Attack." },
        { id: 'phs4', name: "Craftiness", unlock: 75, type: 'passive', desc: "25% chance on normal attack to reset all skill cooldowns." }
    ]},
    "Ninja Assassin": { weapon: "dagger", aura: "lightning", skills: [
        { id: 'nin1', name: "Smoke Bomb", unlock: 1, cd: 10000, type: 'active', desc: "Throws a smoke bomb. Enemies miss 75% of attacks for 10s." },
        { id: 'nin2', name: "Agility", unlock: 25, type: 'passive', desc: "25% chance to dodge any incoming attack." },
        { id: 'nin3', name: "Shadow Copy", unlock: 50, cd: 50000, type: 'active', desc: "Summons a 100% stat clone for 10 seconds." },
        { id: 'nin4', name: "More Agility", unlock: 75, type: 'passive', desc: "Increases your dodge chance to 35%." }
    ]}
};

window.toggleSkillScreen = function() {
    isSkillOpen = !isSkillOpen;
    dom.skillScreen.style.display = isSkillOpen ? 'block' : 'none';
    if (isSkillOpen) {
        window.renderSkillScreen();
        if (window.isMobileUI()) {
            window.enableMobileWindowControls(dom.skillScreen);
            window.bringWindowToFront(dom.skillScreen);
            window.clampWindowToViewport(dom.skillScreen);
        }
    }
}

window.renderSkillScreen = function() {
    let pClass = game.player.baseStats?.playerClass || null; 
    let wpnType = null;
   if (game.player.equips?.weapon?.sprite) {
        let spriteStr = String(game.player.equips.weapon.sprite).toLowerCase();
        if (spriteStr.includes('sword')) wpnType = 'sword';
        else if (spriteStr.includes('staff')) wpnType = 'staff';
        else if (spriteStr.includes('pendant')) wpnType = 'pendant';
        else if (spriteStr.includes('gun')) wpnType = 'gun'; // 🔫 ADDED GUN
       else if (spriteStr.includes('dagger')) wpnType = 'dagger';
    }

    if (!pClass || !CLASSES[pClass]) {
        document.getElementById('active-class-area').style.display = 'none'; let selArea = document.getElementById('class-selection-area'); let classList = document.getElementById('available-classes');
        selArea.style.display = 'block'; classList.innerHTML = '';
        if (!wpnType) { classList.innerHTML = '<p style="color:#f44336; text-align:center;">Equip a weapon to view available classes.</p>'; return; }
        for (let c in CLASSES) {
            if (CLASSES[c].weapon === wpnType) {
                let btn = document.createElement('div'); btn.className = 'skill-class-card';
                btn.innerHTML = `<h3 style="margin:0; color:#ff9800;">${c}</h3><p style="color:#aaa; font-size:13px; margin:5px 0 0 0;">Weapon: ${wpnType.charAt(0).toUpperCase() + wpnType.slice(1)}</p>`;
                btn.onclick = () => window.chooseClass(c); classList.appendChild(btn);
            }
        }
    } else {
        document.getElementById('class-selection-area').style.display = 'none'; document.getElementById('active-class-area').style.display = 'block'; document.getElementById('active-class-name').innerText = pClass;
        let list = document.getElementById('class-skills-list'); list.innerHTML = '';
        CLASSES[pClass].skills.forEach(s => {
            let unlocked = game.player.level >= s.unlock; let color = unlocked ? '#4CAF50' : '#f44336';
            list.innerHTML += `<div class="skill-row"><div><div style="font-weight:bold; color:${color};">${s.name} ${s.type === 'passive' ? '(Passive)' : ''}</div><div class="skill-desc">${s.desc}</div></div><div style="text-align:right; font-size:12px; color:#aaa;">Lv.${s.unlock}<br>${s.cd ? (s.cd/1000)+'s CD' : ''}</div></div>`;
        });
    }
}

window.chooseClass = function(cName) {
    if (!confirm(`Are you sure you want to become a ${cName}? This is permanent!`)) return;
    if(!game.player.baseStats) game.player.baseStats = {};
    game.player.baseStats.playerClass = cName; DatabaseManager.savePlayerData(game.player);
    window.renderSkillScreen(); window.updateSkillMenu(); window.updateUI(); dom.log.innerText = `You are now a ${cName}!`; window.spawnSpark(game.player.x + 24, game.player.y + 48);
}

window.updateHotbarCooldowns = function() {
    let running = false;
    const now = Date.now();

    // 1. Check Skills (Slots 1 & 2)
    if (game.player.activeSkills) {
        for (let i = 0; i < 2; i++) {
            let skill = game.player.activeSkills[i];
            if (skill) {
                let overlay = document.getElementById(`cd-${i+1}`);
                let txt = document.getElementById(`cdt-${i+1}`);
                if (now < skill.cooldownReadyAt) {
                    let remaining = skill.cooldownReadyAt - now;
                    let pct = (remaining / skill.cd) * 100;
                    if(overlay) overlay.style.height = pct + '%';
                    if(txt) { txt.style.display = 'block'; txt.innerText = Math.ceil(remaining / 1000); }
                    running = true;
                } else {
                    if(overlay) overlay.style.height = '0%';
                    if(txt) txt.style.display = 'none';
                }
            }
        }
    }

    // 2. Check Potion (Slot 3)
    let potOverlay = document.getElementById('cd-3');
    if (window.potionCooldownReadyAt && now < window.potionCooldownReadyAt) {
        let remaining = window.potionCooldownReadyAt - now;
        let pct = (remaining / 5000) * 100; // 5000ms = 5 seconds
        if (potOverlay) potOverlay.style.height = pct + '%';
        running = true;
    } else {
        if (potOverlay) potOverlay.style.height = '0%';
    }

    if (running) { requestAnimationFrame(window.updateHotbarCooldowns); }
}

window.updateSkillMenu = function() {
    let pClass = game.player.baseStats?.playerClass || null; let wpnType = null;
    if (game.player.equips?.weapon?.sprite) {
        let spriteStr = String(game.player.equips.weapon.sprite).toLowerCase();
        if (spriteStr.includes('sword')) wpnType = 'sword';
        else if (spriteStr.includes('staff')) wpnType = 'staff';
        else if (spriteStr.includes('pendant')) wpnType = 'pendant';
        else if (spriteStr.includes('gun')) wpnType = 'gun'; // 🔫 ADDED GUN
        else if (spriteStr.includes('dagger')) wpnType = 'dagger'; // 🗡️ ADDED DAGGER
    }

    if (!pClass || !CLASSES[pClass] || CLASSES[pClass].weapon !== wpnType) { 
    if (dom.hotbar) dom.hotbar.style.display = 'flex';
    game.player.activeSkills = [];

    const hb1 = document.getElementById('hotbar-1');
    const hb2 = document.getElementById('hotbar-2');
    const hb3 = document.getElementById('hotbar-3');

    if (hb1) hb1.style.display = 'none';
    if (hb2) hb2.style.display = 'none';
    if (hb3) hb3.style.display = 'flex';

    window.updatePotionHotbar();
    return; 
}
    
    let oldCDs = {};
    if (game.player.activeSkills && game.player.activeSkills.length > 0) {
        game.player.activeSkills.forEach(s => { oldCDs[s.id] = s.cooldownReadyAt; });
    }

    dom.hotbar.style.display = 'flex'; game.player.activeSkills = []; let activeIndex = 0;
    
    CLASSES[pClass].skills.forEach(s => {
        if (s.type === 'active' && game.player.level >= s.unlock && activeIndex < 2) {
            let savedCD = oldCDs[s.id] || 0; 
            game.player.activeSkills.push({ id: s.id, name: s.name, cd: s.cd, cooldownReadyAt: savedCD, execute: () => window.executeSkill(s.id, pClass) });
            document.getElementById(`hotbar-${activeIndex+1}`).style.display = 'flex'; document.getElementById(`hotbar-name-${activeIndex+1}`).innerText = s.name;
            activeIndex++;
        }
    });

    for (let i = activeIndex; i < 2; i++) { document.getElementById(`hotbar-${i+1}`).style.display = 'none'; }

const potionSlot = document.getElementById('hotbar-3');
if (potionSlot) potionSlot.style.display = 'flex';

window.updateHotbarCooldowns();
window.updatePotionHotbar();
}

window.executeSkill = function(skillId, className) {
    // 🛡️ STUN FIX: Block Skill Usage
    if (game.player.frozenUntil && Date.now() < game.player.frozenUntil) { if(dom.log) dom.log.innerText = "You are stunned!"; return; }
    if (safeMapData.id === 'town') { if(dom.log) dom.log.innerText = "You cannot use skills in Town!"; return; }
    
    let skillObj = game.player.activeSkills.find(s => s.id === skillId);
    if (!skillObj) return; 
    
    if (Date.now() < skillObj.cooldownReadyAt) {
        if(dom.log) dom.log.innerText = `${skillObj.name} is on cooldown!`;
        return;
    }

    attackCooldownActive = true;
    setTimeout(() => { attackCooldownActive = false; }, 800); 

    const mySpeed = window.getSpeed() || 0;
    const cdrReductionMs = Math.floor(mySpeed / 200) * 1000;
    const finalCooldown = Math.max(500, skillObj.cd - cdrReductionMs);
    
    skillObj.cooldownReadyAt = Date.now() + finalCooldown; 
    if(typeof window.updateHotbarCooldowns === 'function') window.updateHotbarCooldowns();

    if (socket) socket.emit('broadcastSkill', { skillId: skillId });

    const aura = document.getElementById('player-aura');
    if (aura) {
        aura.className = `aura aura-${CLASSES[className].aura}`; 
        aura.style.animation = 'none'; 
        void aura.offsetWidth; 
        aura.style.animation = 'aura-burst 0.6s ease-out forwards';
    }

    const wpnSprite = game.player.equips?.weapon?.sprite || '';
    if (typeof window.playSFX === 'function') window.playSFX(wpnSprite);
    if (typeof window.spawnSkillText === 'function') window.spawnSkillText(game.player.x + 24, game.player.y - 20, skillObj.name, '#00E5FF');

    // 🛡️ NON-TARGETED SKILLS 
    if (skillId === 'phs1') {
        let step = window.facingRight ? 10 : -10;
        let maxSteps = 18; 
        let nx = game.player.x;
        for (let i = 0; i < maxSteps; i++) {
            if (window.isColliding(nx + step, game.player.y)) break; 
            nx += step;
        }
        game.player.x = nx;
        window.spawnWhiteSplash(game.player.x + 24, game.player.y + 48);
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "IMMUNE", '#00E5FF');
        if(socket) socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: 'walk', facingRight: window.facingRight, weaponSprite: wpnSprite });
        return; 
    }

    if (skillId === 'nin3') {
        if (!game.player.activePets) game.player.activePets = [];
        let petId = Date.now();
        let pEl = document.createElement('div'); pEl.className = 'pet-clone';
        pEl.style.position = 'absolute'; pEl.style.left = game.player.x + 'px'; pEl.style.top = game.player.y + 'px';
        pEl.style.width = '48px'; pEl.style.height = '96px';
        pEl.style.zIndex = '50';
        let cloneRig = dom.playerAvatarContainer.cloneNode(true);
        cloneRig.style.filter = 'brightness(0) opacity(0.6) drop-shadow(0 0 5px #000)'; 
        pEl.innerHTML = `<div class="pet-hp-bar" style="position:absolute; top:-10px; width:100%;"><div class="pet-hp-fill" id="pet-hp" style="width:100%; background:#4CAF50; height:100%;"></div></div>`;
        pEl.appendChild(cloneRig);
        dom.world.appendChild(pEl);
        let maxPetHp = window.getMaxHp(); 
        let pet = { id: petId, dom: pEl, x: game.player.x, y: game.player.y, hp: maxPetHp, maxHp: maxPetHp, isClone: true, skillRef: skillObj };
        game.player.activePets.push(pet);
        if(socket) socket.emit('syncPet', { id: petId, x: pet.x, y: pet.y, alive: true, isClone: true });
        setTimeout(() => {
            let idx = game.player.activePets.findIndex(p => p.id === petId);
            if (idx !== -1) {
                game.player.activePets[idx].dom.remove();
                game.player.activePets.splice(idx, 1);
                if(socket) socket.emit('syncPet', { id: petId, alive: false });
            }
        }, 10000);
        return;
    }
if (skillId === 'sum1') {
        if (game.player.activePets && game.player.activePets.length > 0) return;
        window.showAura(CLASSES[className].aura); 
        if (!game.player.activePets) game.player.activePets = [];
        let count = game.player.level >= 25 ? 2 : 1;
        
        // 🟢 NORMAL SLIMES: 25% of Player HP
        for (let i=0; i<count; i++) {
            let petId = Date.now() + i;
            let pEl = document.createElement('div'); pEl.className = 'pet-slime';
            pEl.innerHTML = '<div class="pet-hp-bar"><div class="pet-hp-fill" id="pet-hp"></div></div>';
            pEl.style.left = game.player.x + 'px'; pEl.style.top = game.player.y + 'px';
            dom.world.appendChild(pEl);
            let maxPetHp = Math.floor(window.getMaxHp() * 0.25);
            let pet = { id: petId, dom: pEl, x: game.player.x, y: game.player.y, hp: maxPetHp, maxHp: maxPetHp, skillRef: game.player.activeSkills.find(s=>s.id==='sum1') };
            game.player.activePets.push(pet);
            if(socket) socket.emit('syncPet', { id: petId, x: pet.x, y: pet.y, alive: true });
        }
        
        // ⚪ BIG BOSS SLIME: x5 Player HP!
        if (game.player.level >= 75) {
            let bossId = Date.now() + 99;
            let bEl = document.createElement('div'); bEl.className = 'pet-slime';
            bEl.innerHTML = '<div class="pet-hp-bar" style="top:-15px;"><div class="pet-hp-fill" id="pet-hp"></div></div>';
            bEl.style.left = game.player.x + 'px'; bEl.style.top = game.player.y + 'px';
            
            // 🌟 BIG BOSS STYLING: White, 100x100
            bEl.style.width = '100px';
            bEl.style.height = '100px';
            bEl.style.backgroundColor = '#ffffff';
            bEl.style.border = '3px solid #ccc';
            bEl.style.borderRadius = '50% 50% 40% 40%';
            bEl.style.boxShadow = '0 0 20px #ffffff';
            
            dom.world.appendChild(bEl);
            
            // 🛡️ SCALES WITH PLAYER: x5 HP
            let bossHp = window.getMaxHp() * 5; 
            let bossPet = { id: bossId, dom: bEl, x: game.player.x, y: game.player.y, homeX: game.player.x, homeY: game.player.y, hp: bossHp, maxHp: bossHp, skillRef: game.player.activeSkills.find(s=>s.id==='sum1'), isBigBoss: true };
            game.player.activePets.push(bossPet);
            if(socket) socket.emit('syncPet', { id: bossId, x: bossPet.x, y: bossPet.y, alive: true, isBigBoss: true });
        }
        return; 
    }

    window.showAura(CLASSES[className].aura);
    isAttacking = true; 
    setTimeout(() => { isAttacking = false; }, 500); 

    if (skillId === 'heal1') { if (socket) socket.emit('partyHeal'); return; }
    if (skillId === 'heal3') {
        game.player.currentHp = window.getMaxHp();
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "FULL HEAL", '#4CAF50'); 
        window.updateUI(); 
        if (socket && game.party) socket.emit('partyRevive'); 
        return;
    }
    if (skillId === 'sum3') { 
        if(game.player.activePets) game.player.activePets.forEach(p => { 
            p.enhancedUntil = Date.now() + 10000; 
            if (p.dom) {
                p.dom.style.filter = 'drop-shadow(0 0 10px gold) brightness(1.2)';
                p.dom.style.transition = 'filter 0.3s ease';
                setTimeout(() => { if (p.dom) p.dom.style.filter = 'none'; }, 10000);
            }
            window.spawnSpark(p.x+15, p.y+15); 
        }); 
        return;
    }
    if (skillId === 'ber1') {
        if(socket) socket.emit('tauntMonsters', { radius: 300 });
        game.player.tauntBuffUntil = Date.now() + 10000; 
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "DEF x3!", '#ffeb3b'); window.spawnSpark(game.player.x + 24, game.player.y + 48);
        return;
    }
    if (skillId === 'ber3') { game.player.immortalUntil = Date.now() + 10000; window.spawnDamageText(game.player.x + 24, game.player.y - 10, "IMMORTAL", '#ffeb3b'); return; }
    if (skillId === 'bld2') {
        game.player.parryUntil = Date.now() + 10000;
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "PARRY STANCE", '#ffeb3b');
        if(socket) socket.emit('setParryStance');
        return;
    }
    
    // 🛡️ TARGETED SKILLS (REQUIRES A TARGET!)
    if (skillId === 'ice1' || skillId === 'ice3' || skillId === 'bld3' || skillId.startsWith('snp') || skillId.startsWith('exp') || skillId === 'phs3' || skillId === 'nin1') {
        let closestMob = null; let closestPlayer = null; let minD = Infinity; 
        const pCenterX = game.player.x + 24; const pCenterY = game.player.y + 48; 
        
        let attackRadius = (className === 'Ice Master' || className === 'Explosives Expert' || className === 'Sniper') ? 300 : 80;
        if (className === 'Sniper') attackRadius = 345; 

        // Scan Monsters
        for(let mId in game.monsters) { 
            let m = game.monsters[mId]; if(!m.alive) continue; 
            let dist = Math.hypot(pCenterX - (m.x+m.width/2), pCenterY - (m.y+m.height/2)); 
            if(dist <= attackRadius && dist < minD) { minD = dist; closestMob = m; closestPlayer = null; } 
        }

        // Scan Players (Neutral Zone)
        if (safeMapData.id === 'neutralzone') {
            for (let rId in game.remotePlayers) {
                let rp = game.remotePlayers[rId];
                if (rp.isGhost || rp.isHiddenAdmin) continue; 
                if (game.party && game.party.members && game.party.members.some(pm => pm.id === rp.id)) continue;

                let dist = Math.hypot(pCenterX - (rp.x + 24), pCenterY - (rp.y + 48));
                if (dist <= attackRadius && dist < minD) { minD = dist; closestPlayer = rp; closestMob = null; }
            }
        }
        
        const finalTarget = closestMob || closestPlayer;

        if (finalTarget) {
            let mCx = closestMob ? finalTarget.x + (finalTarget.width/2) : finalTarget.x + 24; 
            let mCy = closestMob ? finalTarget.y + (finalTarget.height/2) : finalTarget.y + 48;
            
            const emitAttack = () => {
                if(socket) {
                    if (closestMob) socket.emit('attackMonster', { monsterId: finalTarget.id, skillId: skillId });
                    else if (closestPlayer) socket.emit('attackPlayer', { targetId: finalTarget.id, skillId: skillId });
                }
            };
            
            if (className === 'Ice Master') {
                let count = skillId === 'ice3' ? 3 : 1; 
                for (let i=0; i<count; i++) {
                    setTimeout(() => {
                        let ice = document.createElement('div'); ice.className = 'icicle'; ice.style.left = mCx + 'px'; ice.style.top = (mCy - 100) + 'px'; dom.world.appendChild(ice);
                        let anim = ice.animate([{ top: (mCy - 100) + 'px' }, { top: mCy + 'px' }], { duration: 300, easing: 'ease-in' });
                        anim.onfinish = () => { ice.remove(); if (i === count - 1) emitAttack(); };
                    }, i * 200);
                }
            }
            if (skillId === 'bld3') {
                window.spawnWhiteSplash(mCx, mCy); emitAttack();
            }

            if (skillId === 'phs3') {
                let targetX = finalTarget.x + (mCx > pCenterX ? -40 : 40);
                let targetY = finalTarget.y;
                
                if (window.isColliding(targetX, targetY)) {
                    targetX = finalTarget.x + (mCx > pCenterX ? 40 : -40);
                    if (window.isColliding(targetX, targetY)) {
                        targetX = game.player.x;
                        targetY = game.player.y;
                    }
                }
                
                game.player.x = targetX;
                game.player.y = targetY;
                window.spawnWhiteSplash(game.player.x + 24, game.player.y + 48);
                if(socket) socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: 'attack', facingRight: window.facingRight, weaponSprite: wpnSprite });
                emitAttack();
            }
            
            if (skillId === 'nin1') {
                window.shootOrb(pCenterX, pCenterY - 15, mCx, mCy, '#757575');
                setTimeout(() => {
                    emitAttack();
                    const smoke = document.createElement('div');
                    smoke.style.cssText = `position:absolute; left:${mCx-40}px; top:${mCy-40}px; width:80px; height:80px; background:radial-gradient(circle, rgba(100,100,100,0.9) 0%, rgba(150,150,150,0.5) 50%, transparent 70%); border-radius:50%; z-index:40; pointer-events:none; animation: pulseText 1.5s infinite alternate;`;
                    dom.world.appendChild(smoke);
                    setTimeout(()=>smoke.remove(), 10000);
                }, 400); 
            }

            if (skillId === 'snp2') {
                window.shootOrb(pCenterX, pCenterY - 15, mCx, mCy, '#ffffff');
                setTimeout(() => { emitAttack(); }, 200);
            }
            if (skillId === 'snp3') {
                window.shootOrb(pCenterX, pCenterY - 15, mCx, mCy, '#ff0000');
                const gameContainer = document.getElementById('game-container'); 
                gameContainer.classList.add('screen-shake'); 
                setTimeout(() => gameContainer.classList.remove('screen-shake'), 500); 
                setTimeout(() => { emitAttack(); window.spawnWhiteSplash(mCx, mCy); }, 200);
            }

            if (skillId === 'exp1') {
                window.shootOrb(pCenterX, pCenterY - 15, mCx, mCy, '#ff9800');
                setTimeout(() => { 
                    emitAttack();
                    window.spawnFireAoE(mCx, mCy, game.player.level >= 25 ? 10000 : 3000);
                }, 400);
            }
            if (skillId === 'exp3') {
                window.shootOrb(pCenterX, pCenterY - 15, mCx, mCy, '#424242');
                setTimeout(() => { 
                    emitAttack();
                    window.spawnWhiteSplash(mCx, mCy);
                    const gameContainer = document.getElementById('game-container'); 
                    gameContainer.classList.add('screen-shake'); 
                    setTimeout(() => gameContainer.classList.remove('screen-shake'), 500); 
                }, 500);
            }
        }
    }
};

window.attemptAttack = function(silent) {
    // 🛡️ STUN FIX: Block Basic Attacks
    if (game.player.frozenUntil && Date.now() < game.player.frozenUntil) return;
    if (safeMapData.id === 'town') { if (!silent && dom.log) dom.log.innerText = "You cannot attack in Town!"; return; }
    if (game.player.currentHp <= 0 || isInventoryOpen || window.adminMode || game.isGhost || window.isLoading) return;
    if (attackCooldownActive) return; 
    
    let closestMob = null; let closestPlayer = null; let minD = Infinity; 
    const pCenterX = game.player.x + 24; const pCenterY = game.player.y + 48; 
    let weaponSprite = game.player.equips && game.player.equips.weapon ? game.player.equips.weapon.sprite : ''; 
    const isRanged = weaponSprite.includes('staff') || weaponSprite.includes('pendant') || weaponSprite.includes('gun'); 
    
    let attackRadius = isRanged ? 250 : 80;
    if (game.player.baseStats?.playerClass === 'Sniper') {
        attackRadius = 287.5; 
    }
    
    // Check Monsters
    for(let mId in game.monsters) { 
        let m = game.monsters[mId]; if(!m.alive) continue; 
        let mCenterX = m.x + (m.width/2); let mCenterY = m.y + (m.height/2); 
        let dist = Math.hypot(pCenterX - mCenterX, pCenterY - mCenterY); 
        if(dist <= attackRadius && dist < minD) { minD = dist; closestMob = m; closestPlayer = null; } 
    }

    // Check Players (ONLY in Neutral Zone)
    if (safeMapData.id === 'neutralzone') {
        if (window.activeTargetPlayerId && game.remotePlayers[window.activeTargetPlayerId]) {
            let rp = game.remotePlayers[window.activeTargetPlayerId];
            if (!rp.isGhost && !rp.isHiddenAdmin && !(game.party && game.party.members && game.party.members.some(pm => pm.id === rp.id))) {
                let dist = Math.hypot(pCenterX - (rp.x + 24), pCenterY - (rp.y + 48));
                if (dist <= attackRadius) {
                    minD = dist; closestPlayer = rp; closestMob = null;
                }
            }
            window.activeTargetPlayerId = null; 
        } else {
            for (let rId in game.remotePlayers) {
                let rp = game.remotePlayers[rId];
                if (rp.isGhost || rp.isHiddenAdmin) continue; 
                if (game.party && game.party.members && game.party.members.some(pm => pm.id === rp.id)) continue;

                let rpCenterX = rp.x + 24; let rpCenterY = rp.y + 48;
                let dist = Math.hypot(pCenterX - rpCenterX, pCenterY - rpCenterY);
                if (dist <= attackRadius && dist < minD) { minD = dist; closestPlayer = rp; closestMob = null; }
            }
        }
    }
    
    if (!closestMob && !closestPlayer) { if(!silent && dom.log) dom.log.innerText = "No target in range."; return; }
    
    isAttacking = true; attackCooldownActive = true; 
    if(socket) socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: 'attack', facingRight: window.facingRight, weaponSprite: weaponSprite });
    if(typeof window.playSFX === 'function') window.playSFX(weaponSprite);

    const targetCenterX = closestMob ? closestMob.x + (closestMob.width/2) : closestPlayer.x + 24;
    const targetCenterY = closestMob ? closestMob.y + (closestMob.height/2) : closestPlayer.y + 48;
    const targetId = closestMob ? closestMob.id : closestPlayer.id;
    const attackEvent = closestMob ? 'attackMonster' : 'attackPlayer';
    const payload = closestMob ? { monsterId: targetId, skillId: 'basic' } : { targetId: targetId, skillId: 'basic' };

    if (weaponSprite.includes('gun')) {
        if(typeof window.shootBullet === 'function') window.shootBullet(pCenterX, pCenterY - 15, targetCenterX, targetCenterY);
        setTimeout(() => { if(socket) socket.emit(attackEvent, payload); }, 150); 
    } else if (isRanged) { 
        if(typeof window.shootOrb === 'function') window.shootOrb(pCenterX, pCenterY - 15, targetCenterX, targetCenterY); 
        setTimeout(() => { if(socket) socket.emit(attackEvent, payload); }, 500); 
    } else { 
        setTimeout(() => { if(socket) socket.emit(attackEvent, payload); }, 300); 
    }
    setTimeout(() => { isAttacking = false; }, 500); setTimeout(() => { attackCooldownActive = false; }, 800);
};
function gameLoop(ts) {
    // 🛡️ THE FIX: Keep track of animation ID to prevent Ghost Loops
    currentAnimationId = requestAnimationFrame(gameLoop);

    if (!game.isRunning) return;

    // 🛡️ THE FIX: Delta Time 60 FPS Cap
    if (!ts) ts = performance.now();
    const elapsed = ts - lastFrameTime;
    if (elapsed < fpsInterval) return; 
    lastFrameTime = ts - (elapsed % fpsInterval);

    if (game.player.currentHp <= 0 && !game.isGhost) { 
        game.isGhost = true; dom.playerContainer.style.opacity = '0.5'; 
        if(socket) socket.emit('playerDied'); 
    }

    if (game.isGhost && game.party && game.party.members && game.party.members.length === 1) {
        if(dom.log) dom.log.innerText = "You are the last one left. Returning to Town.";
        if(typeof window.leaveParty === 'function') window.leaveParty();
    }

   let nextX = game.player.x; let nextY = game.player.y; let isMoving = false; const moveSpeed = 5; 
    let isFrozen = (game.player.frozenUntil && Date.now() < game.player.frozenUntil);
    let canInputMove = (!isChatting && !window.isLoading && !window.isDungeonUIOpen && !isFrozen);
    
    if (game.isGhost) {
        if (!game.party || !Array.isArray(game.party.members)) { canInputMove = false; } 
        else { let anyAlive = game.party.members.some(m => !m.isGhost && m.id !== game.player.id); if (!anyAlive) canInputMove = false; }
    }

    if (canInputMove) {
        if (game.keys.w) { nextY -= moveSpeed; isMoving = true; }
        if (game.keys.s) { nextY += moveSpeed; isMoving = true; }
        if (game.keys.a) { nextX -= moveSpeed; isMoving = true; window.facingRight = false; }
        if (game.keys.d) { nextX += moveSpeed; isMoving = true; window.facingRight = true; }
    }

    if (isMoving) {
        let canMoveX = true; let canMoveY = true;
        if(typeof window.isColliding === 'function') {
            canMoveX = !window.isColliding(nextX, game.player.y) || window.adminMode; 
            canMoveY = !window.isColliding(game.player.x, nextY) || window.adminMode;
            if (window.isColliding(game.player.x, game.player.y)) { canMoveX = true; canMoveY = true; } 
        }
        if (canMoveX) game.player.x = nextX; 
        if (canMoveY) game.player.y = nextY;
    }

    // Active Pets logic
    if (game.player.activePets && game.player.activePets.length > 0) {
        game.player.activePets.forEach((p, idx) => {
            let targetMob = Object.values(game.monsters).find(m => m.alive && Math.hypot(m.x-p.x, m.y-p.y) < 300);
            let targetPlayer = null;
            
            // ⚔️ PET PVP: Look for non-party players if in Neutral Zone!
            if (!targetMob && safeMapData.id === 'neutralzone') {
                targetPlayer = Object.values(game.remotePlayers).find(rp => {
                    if (rp.isGhost) return false;
                    if (game.party && game.party.members && game.party.members.some(pm => pm.id === rp.id)) return false;
                    return Math.hypot(rp.x - p.x, rp.y - p.y) < 300;
                });
            }
            
           let finalTarget = targetMob || targetPlayer;
            if (finalTarget) {
    let dist = Math.hypot(finalTarget.x - p.x, finalTarget.y - p.y);
    let stopDist = p.isBigBoss ? 100 : 40;

    if (dist > stopDist) {
        if (p.isBigBoss) {
            p.x += (finalTarget.x - p.x) * 0.05;
            p.y += (finalTarget.y - p.y) * 0.05;
        } else {
            p.x += (finalTarget.x - p.x) * 0.15;
            p.y += (finalTarget.y - p.y) * 0.15;
        }
    } else {
        let atkCooldown = p.isBigBoss ? 1500 : 1000;
        if (!p.lastAttack || Date.now() - p.lastAttack > atkCooldown) {
            p.lastAttack = Date.now();

            let baseScale = p.isBigBoss ? 2.5 : 1;
            let atkScale = p.isBigBoss ? 3.0 : 1.5;

            p.dom.style.transform = `scale(${atkScale}) translateY(-20px)`;
            setTimeout(() => {
                if (p.dom) p.dom.style.transform = `scale(${baseScale})`;
                if (socket) {
                    if (targetMob) socket.emit('attackMonster', { monsterId: targetMob.id, skillId: 'pet', petId: p.id, isBigBoss: p.isBigBoss });
                    else socket.emit('attackPlayer', { targetId: targetPlayer.id, skillId: 'pet', petId: p.id, isBigBoss: p.isBigBoss });
                }
            }, 200);
        }
    }
} else {
    let targetX, targetY;

    if (p.isBigBoss) {
        targetX = p.homeX || p.x;
        targetY = p.homeY || p.y;
        p.x += (targetX - p.x) * 0.05;
        p.y += (targetY - p.y) * 0.05;
    } else {
        targetX = game.player.x + (idx === 0 ? -40 : 40);
        targetY = game.player.y - 20;
        p.x += (targetX - p.x) * 0.15;
        p.y += (targetY - p.y) * 0.15;
    }
}
            p.dom.style.left = p.x + 'px'; p.dom.style.top = p.y + 'px';
            let hpBar = p.dom.querySelector('#pet-hp');
            if (hpBar) hpBar.style.width = (p.hp / p.maxHp) * 100 + '%';
            
            if (p.hp <= 0) {
                if(p.skillRef) p.skillRef.cooldownReadyAt = Date.now() + p.skillRef.cd; 
                if(typeof window.updateHotbarCooldowns === 'function') window.updateHotbarCooldowns();
                p.dom.remove(); game.player.activePets.splice(idx, 1);
                if(socket) socket.emit('syncPet', { id: p.id, alive: false });
            } else {
                if (Math.random() < 0.05 && socket) socket.emit('syncPet', { id: p.id, x: p.x, y: p.y, alive: true });
            }
        });
    }

    // --- 🐾 UNIVERSAL PET LOGIC ---
    let petOwners = [];
    const VALID_PETS = ['fox', 'owl', 'wisp', 'egg', 'void'];
    
    let myPet = game.player.equips?.leggings?.aura;
    if (VALID_PETS.includes(myPet)) {
        petOwners.push({ id: game.player.id, targetX: game.player.x, targetY: game.player.y, facingRight: window.facingRight, type: myPet });
        
       // Auto Attack Logic
        if (Date.now() - window.lastFoxAttack > 1500) {
            let closestMob = null; let closestPlayer = null; let minD = Infinity;
            let pCenterX = game.player.x + 24; let pCenterY = game.player.y + 48;
            for(let mId in game.monsters) { 
                let m = game.monsters[mId]; if(!m.alive) continue; 
                let dist = Math.hypot(pCenterX - (m.x+m.width/2), pCenterY - (m.y+m.height/2)); 
                if(dist <= 150 && dist < minD) { minD = dist; closestMob = m; closestPlayer = null; } 
            }
            
            // ⚔️ FOX PVP: Look for non-party players if in Neutral Zone!
            if (safeMapData.id === 'neutralzone') {
                for (let rId in game.remotePlayers) {
                    let rp = game.remotePlayers[rId];
                    if (rp.isGhost || (game.party && game.party.members && game.party.members.some(pm => pm.id === rp.id))) continue;
                    let dist = Math.hypot(pCenterX - (rp.x + 24), pCenterY - (rp.y + 48));
                    if (dist <= 150 && dist < minD) { minD = dist; closestPlayer = rp; closestMob = null; }
                }
            }
            
            let finalTarget = closestMob || closestPlayer;
            if (finalTarget && window.activeFoxes[game.player.id]) {
                window.lastFoxAttack = Date.now();
                let mCx = closestMob ? finalTarget.x + finalTarget.width/2 : finalTarget.x + 24; 
                let mCy = closestMob ? finalTarget.y + finalTarget.height/2 : finalTarget.y + 48;
                if(socket) {
                    if (closestMob) socket.emit('attackMonster', { monsterId: finalTarget.id, skillId: 'fox_bite' });
                    else socket.emit('attackPlayer', { targetId: finalTarget.id, skillId: 'fox_bite' });
                }
                window.shootFoxFire(window.activeFoxes[game.player.id].x, window.activeFoxes[game.player.id].y, mCx, mCy, myPet);
            }
        }
    }

    for (let rId in game.remotePlayers) {
        let rp = game.remotePlayers[rId];
        let rpPet = rp.spriteData?.pet;
        if (VALID_PETS.includes(rpPet)) {
            let rpFacingRight = rp.rig.style.transform.includes('scaleX(-1)');
            petOwners.push({ id: rp.id, targetX: rp.x, targetY: rp.y, facingRight: rpFacingRight, type: rpPet });
        }
    }

    let currentPetIds = new Set();
    petOwners.forEach(owner => {
        currentPetIds.add(owner.id);
        let petId = 'cosmetic_pet_' + owner.id;
        let petEl = document.getElementById(petId);
        
        // If pet exists but type changed, recreate it
        if (petEl && petEl.dataset.petType !== owner.type) {
            petEl.remove();
            petEl = null;
        }

        if (!petEl) {
            petEl = document.createElement('div');
            petEl.id = petId;
            petEl.dataset.petType = owner.type;
            
            if (owner.type === 'fox') {
                petEl.className = 'pet-fox';
                petEl.innerHTML = `<div class="tail"></div><div class="leg leg1"></div><div class="leg leg2"></div><div class="leg leg3"></div><div class="leg leg4"></div><div class="head"><div class="ear"></div></div>`;
            } else if (owner.type === 'owl') {
                petEl.className = 'pet-owl';
                petEl.innerHTML = `<div class="wing wing-l"></div><div class="wing wing-r"></div><div class="eyes"><div class="eye"></div><div class="eye"></div></div><div class="beak"></div>`;
           } else if (owner.type === 'wisp') {
                petEl.className = 'pet-wisp';
            } else if (owner.type === 'egg') {
                petEl.className = 'pet-egg';
                petEl.innerHTML = ''; /* Pure CSS, no image needed! */
            } else if (owner.type === 'void') {
                petEl.className = 'pet-void';
                petEl.innerHTML = `
                    <div class="mini-wraith">
                        <div class="w-eye left"></div><div class="w-eye right"></div>
                        <div class="w-particles"><div class="w-p"></div><div class="w-p"></div><div class="w-p"></div><div class="w-p"></div></div>
                    </div>`;
            }
            
            dom.world.appendChild(petEl);
            window.activeFoxes[owner.id] = { x: owner.targetX, y: owner.targetY };
        }
        
        let pData = window.activeFoxes[owner.id];
        // 🛡️ THE FIX: Increased offset so the pet floats significantly farther away
        let offsetX = owner.facingRight ? -45 : 45; 
        let targetX = owner.targetX + 24 + offsetX; 
        
        // Fox stays on ground. Flying pets at shoulder height!
        let targetY = owner.targetY + (owner.type === 'fox' ? 80 : 30); 
        
        let dx = targetX - pData.x;
        let dy = targetY - pData.y;
        let dist = Math.hypot(dx, dy);
        
        // Physics Rubber-Banding
        if (dist > 2) {
            pData.x += dx * 0.15;
            pData.y += dy * 0.15;
            if (owner.type === 'fox') petEl.classList.add('walking'); 
        } else {
            if (owner.type === 'fox') petEl.classList.remove('walking'); 
        }
        
        petEl.style.left = pData.x + 'px';
        petEl.style.top = pData.y + 'px';
        // 🛡️ THE FIX: Translate MUST come before ScaleX in CSS, otherwise the -50% shifts it into your head!
        petEl.style.transform = owner.facingRight ? 'translate(-50%, -50%) scaleX(-1)' : 'translate(-50%, -50%) scaleX(1)';
    });

    // Cleanup unequipped pets
    document.querySelectorAll('.pet-fox, .pet-owl, .pet-wisp, .pet-egg, .pet-void').forEach(pet => {
        let ownerId = pet.id.replace('cosmetic_pet_', '');
        if (!currentPetIds.has(ownerId)) {
            pet.remove();
            delete window.activeFoxes[ownerId];
        }
    });

    // Teleport cooldown
    if (game.player.teleportCooldown > 0) game.player.teleportCooldown -= 16;
    if (game.player.teleportCooldown <= 0 && !game.isGhost) {
        const hitX = game.player.x + 12; const hitY = game.player.y + 76; 
        const tps = safeMapData.teleports || []; 
        let onPortal = null;
        for (let box of tps) { if (hitX < box.x + box.w && hitX + 24 > box.x && hitY < box.y + box.h && hitY + 20 > box.y) onPortal = box; }
        const uiTimer = document.getElementById('portal-timer-ui'); const uiSec = document.getElementById('portal-timer-sec');

       if (onPortal) { 
// 🏪 MERCHANT INTERCEPT: Portal E
            if (onPortal.portalId === 'E') {
                game.player.currentPortal = null;
                game.player.y += 15; // Bounce back safely
                game.player.teleportCooldown = 2000;
                
                document.getElementById('merchant-modal').style.display = 'block';
                return;
            }
           // 🗺️ MAZE GUIDE INTERCEPT: Portal F
            if (onPortal.portalId === 'F') {
                game.player.currentPortal = null;
                game.player.y += 15; // Bounce back safely
                game.player.teleportCooldown = 2000;
                window.openMazeGuide();
                return;
            }
           // 🏡 HOME FOR SALE INTERCEPT: Portal G
            if (onPortal.portalId === 'G' && (!game.player.baseStats || !game.player.baseStats.hasHome)) {
                game.player.currentPortal = null;
                game.player.y += 15; // Bounce them back so they don't get stuck in the portal
                game.player.teleportCooldown = 2000;
                window.openHomeSaleUI();
                return; // Stop the teleport
            }
           // 🧰 HOME STORAGE INTERCEPT: Portal I
            if (onPortal.portalId === 'I') {
                game.player.currentPortal = null;
                game.player.y += 15; // Bounce back safely
                game.player.teleportCooldown = 2000;
                window.openStorageUI();
                return;
            }
           // 👻 HAUNTED HOUSE INTERCEPT: Portal J
            if (onPortal.portalId === 'J') {
                game.player.currentPortal = null;
                game.player.y += 15; // Bounce back safely
                game.player.teleportCooldown = 2000;
                window.openHauntedHouseUI();
                return;
            }
          // 🏰 GUILD BASE INTERCEPT: Portal K
            if (onPortal.portalId === 'K') {
                game.player.currentPortal = null;
                game.player.y += 15; 
                game.player.teleportCooldown = 2000;
                window.openGuildUI();
                return;
            }
           // 📜 DAILY MISSIONS INTERCEPT: Portal M
            if (onPortal.portalId === 'M') {
                game.player.currentPortal = null;
                game.player.y += 15; // Bounce back safely
                game.player.teleportCooldown = 2000;
                window.openDailyMissionsUI();
                return;
            }
          // ⚔️ TAVERN INTERCEPT: Portal A
            if (onPortal.portalId === 'A') {
                game.player.currentPortal = null;
                game.player.y += 15; // 🛡️ Push player backward so the modal doesn't infinitely loop
                game.player.teleportCooldown = 2000;
                
               // 📅 Sync UI Reset Check dynamically before showing entries
                const now = new Date();
                let dayOfWeek = now.getUTCDay(); // Strict UTC Day
                let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
                
                let lastMonday = new Date(now.getTime());
                lastMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
                lastMonday.setUTCHours(0, 0, 0, 0); // Strict UTC Midnight
                const lastMondayTs = lastMonday.getTime();

                if (!game.player.baseStats) game.player.baseStats = {};
                if (!game.player.baseStats.tavernReset || game.player.baseStats.tavernReset < lastMondayTs) {
                    game.player.baseStats.tavernEntries = 5;
                    game.player.baseStats.tavernReset = Date.now();
                }

                document.getElementById('tavern-entries-text').innerText = `Entries: ${game.player.baseStats.tavernEntries}/5`;
                document.getElementById('tavern-modal').style.display = 'block';
                return;
            }

            // 🛡️ THE FIX: Ignore the portal entirely if they just teleported onto it!
            if (game.player.currentPortal !== onPortal.portalId && game.player.currentPortal !== 'JUST_SPAWNED') { 
                game.player.currentPortal = onPortal.portalId; 
                game.player.portalEntryTime = Date.now(); 
                if(uiTimer) uiTimer.style.display = 'block'; 
            } 
            if (game.player.portalEntryTime) {
                let elapsed = Date.now() - game.player.portalEntryTime; let remaining = Math.max(0, 2000 - elapsed);
                if (uiSec) uiSec.innerText = (remaining / 1000).toFixed(1);
                if (remaining <= 0 && !game.player.isTeleporting) {
                    game.player.isTeleporting = true; 
                    if(uiTimer) uiTimer.style.display = 'none';
                    if(socket) socket.emit('portalStep', { portalId: onPortal.portalId, targetMapId: onPortal.targetMapId }); 
                }
            }
        } else {
           if (game.player.currentPortal !== null) { game.player.currentPortal = null; game.player.portalEntryTime = null; game.player.isTeleporting = false; if(uiTimer) uiTimer.style.display = 'none'; if(socket) socket.emit('portalLeave'); document.getElementById('tavern-modal').style.display = 'none'; }
        }
    }
    
    dom.playerContainer.style.left = game.player.x + 'px'; 
    dom.playerContainer.style.top = game.player.y + 'px'; 

    // 🌫️ OPTIMIZED FOG OF WAR (Runs every 3 frames to save CPU)
    window.fowFrameCount = (window.fowFrameCount || 0) + 1;
    const fow = document.getElementById('fow-canvas');
    if (fow && window.fowFrameCount % 3 === 0) {
        const ctx = fow.getContext('2d', { alpha: true });
        if (safeMapData.id !== 'town' && !String(safeMapData.id).includes('home') && !String(safeMapData.id).includes('guildbase') && !game.isGhost && !document.body.classList.contains('low-perf')) {
            fow.classList.add('active');
            ctx.clearRect(0, 0, 2000, 1333);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'; 
            ctx.fillRect(0, 0, 2000, 1333);
            
            let px = game.player.x + 24; 
            let py = game.player.y + 30; // Chest level
            const vRad = 3000; // ENDLESS VISION!

            // 1. Gather walls (Collisions) - OPTIMIZED to ignore far walls
            let segments = [];
            let points = [];
            const bounds = [ {x:0, y:0}, {x:2000, y:0}, {x:2000, y:1333}, {x:0, y:1333} ];
            points.push(...bounds);
            for(let i=0; i<4; i++) segments.push({ a: bounds[i], b: bounds[(i+1)%4] });

            if (safeMapData.collisions) {
                safeMapData.collisions.forEach(box => {
                    // 🛡️ OPTIMIZATION: Skip walls more than 1000px away
                    if (Math.abs(box.x - px) > 1000 || Math.abs(box.y - py) > 1000) return;
                    
                    // If overlapping a wall, nudge the light out so it doesn't get trapped
                    if (px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h) {
                        let dBottom = Math.abs((box.y + box.h) - py);
                        let dTop = Math.abs(py - box.y);
                        let dLeft = Math.abs(px - box.x);
                        let dRight = Math.abs((box.x + box.w) - px);
                        let minD = Math.min(dBottom, dTop, dLeft, dRight);
                        if (minD === dBottom) py = box.y + box.h + 1;
                        else if (minD === dTop) py = box.y - 1;
                        else if (minD === dLeft) px = box.x - 1;
                        else if (minD === dRight) px = box.x + box.w + 1;
                    }

                    let pts = [ {x: box.x, y: box.y}, {x: box.x + box.w, y: box.y}, {x: box.x + box.w, y: box.y + box.h}, {x: box.x, y: box.y + box.h} ];
                    points.push(...pts);
                    for(let i=0; i<4; i++) segments.push({ a: pts[i], b: pts[(i+1)%4] });
                });
            }

            // 2. Cast rays to all corners
            let angles = [];
            points.forEach(p => {
                let angle = Math.atan2(p.y - py, p.x - px);
                angles.push(angle - 0.0001, angle, angle + 0.0001); 
            });
            angles.sort((a,b) => a - b);

            let intersects = [];
            angles.forEach(angle => {
                let dx = Math.cos(angle) * vRad, dy = Math.sin(angle) * vRad;
                let closest = null, minDist = 1;
                segments.forEach(seg => {
                    let sdx = seg.b.x - seg.a.x, sdy = seg.b.y - seg.a.y;
                    let T2 = dx * sdy - dy * sdx;
                    if (T2 === 0) return;
                    let t1 = ((seg.a.x - px) * sdy - (seg.a.y - py) * sdx) / T2;
                    let u = ((seg.a.x - px) * dy - (seg.a.y - py) * dx) / T2;
                    if (t1 > 0 && t1 <= 1 && u >= 0 && u <= 1) {
                        if (t1 < minDist) { minDist = t1; closest = { x: px + dx * t1, y: py + dy * t1 }; }
                    }
                });
                intersects.push(closest ? closest : { x: px + dx, y: py + dy });
            });

            // 3. Cut out the endless solid polygon of light
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(255, 255, 255, 1)';
            
            let visionPath = new Path2D();
            if (intersects.length > 0) {
                visionPath.moveTo(intersects[0].x, intersects[0].y);
                for(let i=1; i<intersects.length; i++) {
                    visionPath.lineTo(intersects[i].x, intersects[i].y);
                }
            }
            visionPath.closePath();
            ctx.fill(visionPath);

            // 4. Check if Monsters are standing inside the light (OPTIMIZED DOM UPDATES)
            for (let mId in game.monsters) {
                const m = game.monsters[mId];
                if (!m.alive) continue;
                const mEl = document.getElementById('mob_' + mId);
                if (!mEl) continue;
                
                const isVisible = ctx.isPointInPath(visionPath, m.x + (m.width/2), m.y + (m.height/2));
                const targetVis = isVisible ? 'visible' : 'hidden';
                if (mEl.style.visibility !== targetVis) {
                    mEl.style.visibility = targetVis;
                }
            }
        } else {
            fow.classList.remove('active'); 
            ctx.clearRect(0, 0, 2000, 1333); 
            // Reveal all monsters if fog is off
            for (let mId in game.monsters) {
                const mEl = document.getElementById('mob_' + mId);
                if (mEl && mEl.style.visibility !== 'visible') mEl.style.visibility = 'visible';
            }
        }
    }

    let camTargetX = game.player.x; let camTargetY = game.player.y;
    let CAMERA_ZOOM = window.innerWidth <= 950 ? 1.2 : 1.8; 

    if (window.isSpectating && window.spectateTargetId && game.remotePlayers[window.spectateTargetId]) {
        camTargetX = game.remotePlayers[window.spectateTargetId].x; camTargetY = game.remotePlayers[window.spectateTargetId].y;
    }

    const cameraX = Math.floor((window.innerWidth / 2) - (camTargetX * CAMERA_ZOOM) - (48 * CAMERA_ZOOM / 2)); 
    const cameraY = Math.floor((window.innerHeight / 2) - (camTargetY * CAMERA_ZOOM) - (96 * CAMERA_ZOOM / 2)); 
    dom.world.style.transform = `translate3d(${cameraX}px, ${cameraY}px, 0) scale(${CAMERA_ZOOM})`;

    if (window.isSpectating) { isMoving = false; canInputMove = false; }

    if (!game.isGhost) {
        if (autoAttackMode && !window.adminMode && !isInventoryOpen && !window.isLoading && typeof window.attemptAttack === 'function') window.attemptAttack(true);
        if (typeof window.updateAnimationFrames === 'function') {
            if (isAttacking) window.updateAnimationFrames('attack');
            else if (isMoving) window.updateAnimationFrames('walk');
            else window.updateAnimationFrames('idle');
        }
    }

    if (attackHeld && !isInventoryOpen && !window.adminMode && !isChatting && !autoAttackMode && !game.isGhost && !window.isLoading && typeof window.attemptAttack === 'function') { window.attemptAttack(false); }
    
    const desiredState = isAttacking ? 'attack' : (isMoving ? 'walk' : 'idle'); 
    const netNow = Date.now();
    let lastNetTs = window.lastNetTs || 0; let lastSentState = window.lastSentState || 'idle';
    if (netNow - lastNetTs >= 60 || desiredState !== lastSentState) { 
        window.lastNetTs = netNow; window.lastSentState = desiredState; 
        if(socket) socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: desiredState, facingRight: window.facingRight, weaponSprite: game.player.equips?.weapon?.sprite || null });
    }
}
// ==========================================
// 4. MAP & SYSTEM UTILS
// ==========================================
window.loadMapScript = function(mapId, callback) {
    let scriptName = (mapId === 'town' ? 'townmap.js' : mapId + '.js') + '?v=' + Date.now();
    let script = document.createElement('script'); script.src = scriptName;
    const fallbackMap = { id: mapId, name: mapId, image: mapId === 'town' ? 'town_map.png' : mapId + '.png', spawnX: 960, spawnY: 1000, collisions: [], teleports: [], normalSpawns: [], miniBossSpawns: [], floorBossSpawns: [] };
    script.onload = () => { 
        let varName = mapId === 'town' ? 'townMapData' : mapId + 'MapData'; 
        if (typeof window[varName] !== 'undefined') window.MapDatabase[mapId] = JSON.parse(JSON.stringify(window[varName])); 
        else window.MapDatabase[mapId] = fallbackMap; 
        callback(); 
    };
    script.onerror = () => { window.MapDatabase[mapId] = fallbackMap; callback(); };
    document.head.appendChild(script);
}

window.preloadMapAssets = function(mapData, callback) {
    window.isLoading = true; const loaderFill = document.getElementById('loader-fill'); if(loaderFill) loaderFill.style.width = '0%';
    try {
        let safeImage = mapData?.image ? String(mapData.image) : 'town_map.png';
        let assets = [ safeImage, 'animation/avatar_idlefront.png', 'animation/avatar_walk.png', 'animation/avatar_attack.png', 'animation/avatar_head.png', 'music/slash.mp3', 'music/lightning.mp3', 'music/splash.mp3', 'music/bump.mp3', 'music/bossfight.mp3' ];
        let mKeys = new Set();
        if (mapData?.normalSpawns && Array.isArray(mapData.normalSpawns)) mapData.normalSpawns.forEach(s => mKeys.add(String(s.monsterKey || 'common_mobs1')));
        if (mapData?.miniBossSpawns && Array.isArray(mapData.miniBossSpawns)) mapData.miniBossSpawns.forEach(s => mKeys.add(String(s.monsterKey || 'mini_boss1')));
        if (mapData?.floorBossSpawns && Array.isArray(mapData.floorBossSpawns)) mapData.floorBossSpawns.forEach(s => mKeys.add(String(s.monsterKey || 'floor_boss1')));
        mKeys.forEach(k => { let sk = String(k); if(!sk.includes('common_mobs') && !sk.includes('mini_boss') && !sk.includes('floor_boss')) assets.push(`monsters/${sk}.png`); });
        if(game.player.equips?.weapon?.sprite) { let wpn = String(game.player.equips.weapon.sprite).replace('starter', 'basic'); assets.push(`weapon/${wpn}.png`); if(!wpn.includes('pendant')) assets.push(`weapon/${wpn}_attack.png`); }
        if (game.player.baseStats?.playerClass) { let hairPrefix = window.charData?.hairStyle === 'none' ? 'none' : `hair${window.charData?.hairStyle || '1'}`; let formattedClass = String(game.player.baseStats.playerClass).replace(/\s+/g, '').toLowerCase(); assets.push(`skills/${hairPrefix}_${formattedClass}.mp3`); }
        assets = assets.filter(src => typeof src === 'string' && src.trim() !== '');
        let loaded = 0; let toLoad = assets.length;
        let failSafe = setTimeout(() => { window.isLoading = false; callback(); }, 3000); 
        if(toLoad === 0) { clearTimeout(failSafe); window.isLoading = false; return callback(); }
        const checkDone = () => { if(loaderFill) loaderFill.style.width = (loaded / toLoad) * 100 + '%'; if(loaded === toLoad) { clearTimeout(failSafe); window.isLoading = false; callback(); } };
        assets.forEach(src => { if (src.endsWith('.mp3')) { let a = new Audio(); a.oncanplaythrough = () => { loaded++; checkDone(); }; a.onerror = () => { loaded++; checkDone(); }; a.src = src; } else { let img = new Image(); img.onload = img.onerror = () => { loaded++; checkDone(); }; img.src = src; } });
    } catch(e) { console.error("Preloader Error:", e); window.isLoading = false; callback(); }
};

window.cleanupMap = function() { 
    Object.keys(game.remotePlayers).forEach(id => window.removeRemotePlayer(id)); 
    document.querySelectorAll('.monster-container, .pet-slime').forEach(el => el.remove()); 
    game.monsters = {}; 
    if (game.player.activePets) { 
        game.player.activePets.forEach(pet => { if(pet.dom) pet.dom.remove(); }); 
        game.player.activePets = []; 
    } 
    if (localBossTimer) clearInterval(localBossTimer);
    let t = document.getElementById('world-boss-timer'); 
    if (t) t.remove();
}
window.forceUnstuck = function() { 
    if (safeMapData.id === 'trainingtavern') { if (dom.log) dom.log.innerText = "You cannot escape the Tavern!"; return; }
    game.player.x = 960; game.player.y = 1000; 
    if (safeMapData.id !== 'town') { 
        if(socket) socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 }); dom.log.innerText = "Evacuating to Town..."; 
    } else { 
        if(socket) socket.emit('playerMoved', { x: 960, y: 1000, state: 'idle', facingRight: window.facingRight, weaponSprite: game.player.equips.weapon?.sprite || null }); dom.log.innerText = "Unstuck! Returned to Town center."; 
    } 
};
window.showMapAnnouncement = function(mapId) { 
    if (!mapId) return;
    let cleanName = String(mapId).replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase()); 
    const permName = document.getElementById('permanent-map-name'); 
    if (permName) { permName.innerText = cleanName; permName.style.display = 'block'; } 
    const annContainer = document.getElementById('map-announcement'); 
    const annText = document.getElementById('map-announcement-text'); 
    if (annContainer && annText) { annText.innerText = cleanName; annContainer.style.opacity = '1'; setTimeout(() => { annContainer.style.opacity = '0'; }, 3000); } 
};
window.isColliding = function(targetX, targetY) { const hitX = targetX + (game.player.width - game.player.w) / 2; const hitY = targetY + game.player.height - game.player.h; const cols = safeMapData.collisions || []; for (let box of cols) { if (hitX < box.x + box.w && hitX + game.player.w > box.x && hitY < box.y + box.h && hitY + game.player.h > box.y) return true; } return false; }

window.spawnDamageText = function(x, y, amount, color) { const txt = document.createElement('div'); txt.className = 'damage-text'; txt.innerText = amount; let jitterX = (Math.random() * 40) - 20; let jitterY = (Math.random() * 20) - 10; txt.style.left = (x - 10 + jitterX) + 'px'; txt.style.top = (y + jitterY) + 'px'; txt.style.color = color; dom.world.appendChild(txt); setTimeout(() => txt.remove(), 1000); }

// 🌟 YOUR NEW FUNCTION GOES HERE 🌟
window.spawnSkillText = function(x, y, text, color) {
    const txt = document.createElement('div');
    txt.className = 'damage-text'; 
    txt.innerText = text;
    txt.style.left = (x - 30) + 'px'; 
    txt.style.top = y + 'px';
    txt.style.color = color || '#00E5FF';
    txt.style.fontWeight = 'bold';
    txt.style.textShadow = '0 0 5px #fff, 0 0 10px ' + color;
    txt.style.zIndex = '1000';
    dom.world.appendChild(txt);
    
    const anim = txt.animate([
        { transform: 'translateY(0px) scale(1)', opacity: 1 },
        { transform: 'translateY(-40px) scale(1.2)', opacity: 1, offset: 0.5 },
        { transform: 'translateY(-60px) scale(1)', opacity: 0 }
    ], { duration: 1500, easing: 'ease-out' });
    
    anim.onfinish = () => txt.remove();
};
window.spawnSpark = function(x, y) { const spark = document.createElement('div'); spark.className = 'spark'; spark.style.left = (x + (Math.random() * 20 - 10)) + 'px'; spark.style.top = (y + (Math.random() * 20 - 10)) + 'px'; dom.world.appendChild(spark); setTimeout(() => spark.remove(), 300); }
window.spawnWhiteSplash = function(x, y) { const splash = document.createElement('div'); splash.className = 'white-splash'; splash.style.left = x + 'px'; splash.style.top = y + 'px'; dom.world.appendChild(splash); setTimeout(() => splash.remove(), 300); }
window.shootMonsterFireball = function(startX, startY, endX, endY) {
    const ball = document.createElement('div');
    ball.className = 'monster-fireball';
    ball.style.left = startX + 'px';
    ball.style.top = startY + 'px';
    dom.world.appendChild(ball);

    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    ball.animate([
        { left: startX + 'px', top: startY + 'px', transform: `translate(-50%, -50%) scale(0.8) rotate(${angle}deg)` },
        { left: endX + 'px', top: endY + 'px', transform: `translate(-50%, -50%) scale(1.15) rotate(${angle}deg)` }
    ], {
        duration: 400,
        easing: 'linear'
    }).onfinish = () => {
        ball.remove();
        window.spawnWhiteSplash(endX, endY);
    };
};
window.shootOrb = function(startX, startY, endX, endY, color) { 
    const orb = document.createElement('div'); 
    orb.className = 'magic-orb'; 
    orb.style.left = startX + 'px'; 
    orb.style.top = startY + 'px'; 
    if (color) { orb.style.background = color; orb.style.boxShadow = `0 0 10px ${color}`; }
    dom.world.appendChild(orb); 
    const animation = orb.animate([{ left: startX + 'px', top: startY + 'px' }, { left: endX + 'px', top: endY + 'px' }], { duration: 500, easing: 'ease-in' }); 
    animation.onfinish = () => orb.remove(); 
}

window.spawnFireAoE = function(x, y, duration) {
    const fire = document.createElement('div');
    fire.style.position = 'absolute';
    fire.style.left = (x - 40) + 'px';
    fire.style.top = (y - 40) + 'px';
    fire.style.width = '80px';
    fire.style.height = '80px';
    fire.style.background = 'radial-gradient(circle, rgba(255,87,34,0.8) 0%, rgba(255,152,0,0.4) 50%, transparent 70%)';
    fire.style.borderRadius = '50%';
    fire.style.zIndex = '40';
    fire.style.animation = 'pulseText 0.5s infinite alternate';
    fire.style.pointerEvents = 'none';
    dom.world.appendChild(fire);
    setTimeout(() => fire.remove(), duration);
};
window.showBubble = function(playerObj, text) { if (!playerObj || !playerObj.dom) return; const bubble = document.createElement('div'); bubble.className = 'chat-bubble'; bubble.innerText = text; playerObj.dom.appendChild(bubble); setTimeout(() => bubble.remove(), 4000); }

window.activeFoxes = {};
window.lastFoxAttack = 0;
window.shootFoxFire = function(startX, startY, endX, endY, petType) { 
    const orb = document.createElement('div'); orb.className = 'fox-fireball'; 
    if (petType === 'wisp') { orb.style.background = '#87CEEB'; orb.style.boxShadow = '0 0 8px #00BFFF, 0 0 15px #ffffff'; }
    else if (petType === 'owl') { orb.style.background = '#ffffff'; orb.style.boxShadow = '0 0 8px #ffeb3b, 0 0 15px #ffffff'; }
    
    orb.style.left = startX + 'px'; orb.style.top = startY + 'px'; 
    dom.world.appendChild(orb); 
    const animation = orb.animate([{ left: startX + 'px', top: startY + 'px' }, { left: endX + 'px', top: endY + 'px' }], { duration: 300, easing: 'linear' }); 
    animation.onfinish = () => { orb.remove(); window.spawnSpark(endX, endY); }; 
}

window.updateAnimationFrames = function(state) {
    let currentAura = game.player.equips?.armor?.aura || null;
    let cAuraEl = document.getElementById('player-cosmetic-aura');
    
    if (cAuraEl) { 
        // Reset classes
        cAuraEl.className = 'cosmetic-aura'; 
        // 👇 THE FIX: Specifically apply the divine class if equipped
        if (currentAura) {
            cAuraEl.classList.add(`aura-${currentAura}`);
        }
    }
    
    if (dom.playerAvatarContainer) dom.playerAvatarContainer.style.transform = window.facingRight ? 'scaleX(-1)' : 'scaleX(1)';
    
    let rawWpn = game.player.equips?.weapon ? game.player.equips.weapon.sprite : null;
    let wpn = rawWpn ? rawWpn.replace('starter', 'basic') : null; 
    let pulseActive = (Math.floor(Date.now() / 250) % 2 === 0);
    let bodySrc = 'animation/avatar_idlefront.png'; let isAtk = false;
    
    if (state === 'attack') { bodySrc = 'animation/avatar_attack.png'; isAtk = true; } else if (state === 'walk') { bodySrc = pulseActive ? 'animation/avatar_walk.png' : 'animation/avatar_idlefront.png'; }
    
    if (game.player.currentBodySrc !== bodySrc && dom.playerBody) { dom.playerBody.src = bodySrc; game.player.currentBodySrc = bodySrc; }
    
   if (wpn && dom.playerWeapon) { 
        dom.playerWeapon.style.display = 'block'; 
        let wpnSrc = `weapon/${wpn}${(state === 'attack' && isAtk && !wpn.includes('pendant')) ? '_attack' : ''}.png`; 
        if (game.player.currentWeaponSrc !== wpnSrc) { dom.playerWeapon.src = wpnSrc; game.player.currentWeaponSrc = wpnSrc; } 
        
        // 🛡️ THE FIX: Apply Weapon Auras based on rarity
        dom.playerWeapon.classList.remove('weapon-aura-legendary', 'weapon-aura-godly', 'weapon-aura-divine');
        if (game.player.equips?.weapon?.rarity === 'Legendary') {
            dom.playerWeapon.classList.add('weapon-aura-legendary');
        } else if (game.player.equips?.weapon?.rarity === 'Godly') {
            dom.playerWeapon.classList.add('weapon-aura-godly');
        } else if (game.player.equips?.weapon?.rarity === 'Divine') {
            dom.playerWeapon.classList.add('weapon-aura-divine');
        }

    } else if (dom.playerWeapon) { 
        dom.playerWeapon.style.display = 'none'; 
        game.player.currentWeaponSrc = ''; 
        dom.playerWeapon.classList.remove('weapon-aura-legendary', 'weapon-aura-godly'); // Clean up if unequipped
    }
}
window.showAura = function(color) { const aura = document.getElementById('player-aura'); aura.className = `aura aura-${color}`; aura.style.animation = 'none'; void aura.offsetWidth; aura.style.animation = 'aura-burst 0.6s ease-out forwards'; }
window.lastVoiceTime = 0;
window.playVoice = function(className) { 
    // 🛡️ STRICT AUDIO FIX: Prevent skill voice overlap
    let now = Date.now();
    if (now - window.lastVoiceTime < 500) return; 
    window.lastVoiceTime = now;

    let hairPrefix = window.charData.hairStyle === 'none' ? 'none' : `hair${window.charData.hairStyle}`; 
    let formattedClass = className.replace(/\s+/g, '').toLowerCase(); 
    let audio = new Audio(`skills/${hairPrefix}_${formattedClass}.mp3`); 
    audio.volume = 0.8; 
    audio.play().catch(e => {}); 
}
// 🎵 THE FIX: BOSS MUSIC ENGINE
window.bossBgmTimeout = null;
window.revertBGM = function() {
    let isBossMap = safeMapData.id === 'trainingtavern' || safeMapData.id === 'hauntedhouse' || String(safeMapData.id).includes('dungeon');
    if (currentTrackName === 'bossfight' && !isBossMap) {
        window.playBGM(window.routeMapMusic(safeMapData.id));
    }
};

window.triggerBossBGM = function(monster) {
    if (!monster || (monster.category !== 'floor_boss' && monster.category !== 'mini_boss')) return;
    if (currentTrackName !== 'bossfight') {
        window.playBGM('bossfight');
        if (dom.log) dom.log.innerText = `⚔️ EPIC ENCOUNTER: ${monster.name} ⚔️`;
    }
    // Keep music alive! If 10 seconds pass with no hits, revert to normal music.
    clearTimeout(window.bossBgmTimeout);
    window.bossBgmTimeout = setTimeout(window.revertBGM, 10000); 
};
// ==========================================
// 🎨 UNIVERSAL CUSTOM PROMPT ENGINE
// ==========================================
window.customPrompt = function(message, callback) {
    const modal = document.getElementById('custom-prompt-modal');
    const msgEl = document.getElementById('custom-prompt-msg');
    const inputEl = document.getElementById('custom-prompt-input');
    const btnOk = document.getElementById('custom-prompt-ok');
    const btnCancel = document.getElementById('custom-prompt-cancel');

    if (!modal) return; // Failsafe if HTML is missing

    // Set up the UI
    msgEl.innerText = message;
    inputEl.value = '';
    modal.style.display = 'flex';
    inputEl.focus();

    // Clean up function to prevent double-firing
    const cleanup = () => {
        modal.style.display = 'none';
        btnOk.onclick = null;
        btnCancel.onclick = null;
        inputEl.onkeydown = null;
    };

    // OK Button Logic
    btnOk.onclick = () => {
        const val = inputEl.value.trim();
        cleanup();
        if (val) callback(val);
    };

    // Cancel Button Logic
    btnCancel.onclick = () => {
        cleanup();
    };

    // Pressing 'Enter' triggers OK
    inputEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnOk.click();
        }
        // Pressing 'Escape' triggers Cancel
        if (e.key === 'Escape') {
            e.preventDefault();
            btnCancel.click();
        }
    };
};
// ==========================================
// 🎵 GLOBAL AUDIO & VOLUME ENGINE
// ==========================================
// 1. Load saved volume, safeguard against old "50" values instead of "0.5"
window.gameVolume = localStorage.getItem('exonie_bgm_vol') !== null ? parseFloat(localStorage.getItem('exonie_bgm_vol')) : 0.5;
if (window.gameVolume > 1) window.gameVolume = window.gameVolume / 100;

// 2. Listen for the slider being dragged
document.addEventListener('DOMContentLoaded', () => {
    const volSlider = document.getElementById('bgm-volume-slider');
    const volDisplay = document.getElementById('vol-display');
    
    if (volSlider) {
        volSlider.value = window.gameVolume;
        if (volDisplay) volDisplay.innerText = Math.round(window.gameVolume * 100) + '%';
        
        volSlider.addEventListener('input', (e) => {
            let rawVal = parseFloat(e.target.value);
            let newVol = rawVal > 1 ? rawVal / 100 : rawVal; // Safeguard
            
            window.gameVolume = newVol;
            localStorage.setItem('exonie_bgm_vol', newVol); 
            
            if (volDisplay) volDisplay.innerText = Math.round(newVol * 100) + '%';
            
            if (window.currentBGM) {
                window.currentBGM.volume = newVol;
            }
        });
    }
});

// 🧭 MASTER MUSIC ROUTER: Decides which song to play based on Map ID
window.routeMapMusic = function(mapId) {
    if (!mapId) return 'town';
    let mId = String(mapId).toLowerCase();

    // 1. Hardcoded Exceptions
    if (mId === 'trainingtavern' || mId === 'hauntedhouse' || mId.includes('dungeon')) return 'bossfight';
    if (mId.includes('floor')) return 'floors';
    if (mId.includes('home')) return 'home'; 
    if (mId.includes('guildbase')) return 'guildbase';

    // 2. Dynamic Fallback! 
    // It returns the raw Map ID (like 'test1'). The playBGM function will try to play 'test1.mp3', 
    // and if it doesn't exist, it will safely revert to 'town.mp3'!
    return mId;
};

// 3. The Bulletproof Play Function with Auto-Fallback
window.playBGM = function(trackName) {
    if (!trackName) {
        if (window.currentBGM) window.currentBGM.pause();
        currentTrackName = "";
        return;
    }

    if (window.currentBGM && currentTrackName === trackName && !window.currentBGM.paused) {
        window.currentBGM.volume = window.gameVolume; 
        return;
    }

    if (window.currentBGM) {
        window.currentBGM.pause();
        window.currentBGM.currentTime = 0;
    }

    let finalUrl = `music/${trackName}.mp3`;
    console.log(`[AUDIO] Attempting to play: ${finalUrl} (Vol: ${window.gameVolume})`);

    let newAudio = new Audio(finalUrl);
    newAudio.loop = true;
    newAudio.volume = window.gameVolume; 
    
    // 🚨 THE DYNAMIC FALLBACK: If the map's custom .mp3 is missing, default to Town!
    newAudio.onerror = function() {
        if (trackName !== 'town') {
            console.warn(`[AUDIO] Missing file ${finalUrl}. Falling back to town.mp3!`);
            window.playBGM('town'); 
        }
    };

    window.currentBGM = newAudio;
    currentTrackName = trackName;
    
    newAudio.play().catch(e => {
        console.warn("BGM Auto-play blocked by browser. Interaction required.");
    });
};
window.lastSFXTime = 0;
window.playSFX = function(weaponSprite) { 
    // 🛡️ STRICT AUDIO FIX: Prevent sound overlap without touching combat logic
    let now = Date.now();
    if (now - window.lastSFXTime < 400) return; 
    window.lastSFXTime = now;

    let sfx = 'bump'; 
    if (weaponSprite && weaponSprite.includes('staff')) sfx = 'lightning'; 
    if (weaponSprite && weaponSprite.includes('sword')) sfx = 'slash';
    if (weaponSprite && weaponSprite.includes('dagger')) sfx = 'slash';
    if (weaponSprite && weaponSprite.includes('pendant')) sfx = 'splash';
    if (weaponSprite && weaponSprite.includes('gun')) sfx = 'gunshot'; 
    let audio = new Audio(`music/${sfx}.mp3`); 
    audio.volume = 0.5; 
    audio.play().catch(e => {}); 
};

// ==========================================
// 5. INVENTORY & STATS
// ==========================================
window.MAX_ENHANCE_BY_RARITY = {
    Starter: 0,
    Basic: 10,
    Rare: 12,
    Unique: 14,
    Legendary: 15,
    Godly: 20,
    Divine: 25
};

window.sanitizeEquippedItem = function(item, expectedSlot) {
    if (!item || typeof item !== 'object') return null;
    if (item.type !== expectedSlot) return null;

    const clean = JSON.parse(JSON.stringify(item));

    // 🛡️ REMOVED: The frontend MAX_ENHANCE clamp is gone. It just reads whatever the item has.
    clean.enhanceLevel = Number(clean.enhanceLevel || 0);

    if (!clean.fixedStat || typeof clean.fixedStat !== 'object') clean.fixedStat = {};
    if (!clean.randomStat || typeof clean.randomStat !== 'object') clean.randomStat = {};

    // 🛡️ THE MIGRATION FIX: Client-side stat conversion
    if (clean.stats) {
        const statMap = { atk: 'attack', matk: 'magic', def: 'defense', spd: 'speed', hp: 'hp', int: 'int', str: 'str' };
        for (let oldKey in statMap) {
            if (clean.stats[oldKey] && clean.stats[oldKey] > 0) {
                let newKey = statMap[oldKey];
                clean.randomStat[newKey] = (clean.randomStat[newKey] || 0) + clean.stats[oldKey];
                clean.stats[oldKey] = 0;
            }
        }
    }

    Object.keys(clean.fixedStat).forEach(k => {
        if (typeof clean.fixedStat[k] !== 'number' || !Number.isFinite(clean.fixedStat[k])) clean.fixedStat[k] = 0;
    });

    Object.keys(clean.randomStat).forEach(k => {
        if (typeof clean.randomStat[k] !== 'number' || !Number.isFinite(clean.randomStat[k])) clean.randomStat[k] = 0;
    });

    return clean;
};

window.getTotalStat = function(statName) {
    if (!game.player || !game.player.baseStats) return 0;

    let base = Number(game.player.baseStats[statName] || 0);

    ['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings'].forEach(slot => {
        const eq = window.sanitizeEquippedItem(game.player.equips?.[slot], slot);
        if (!eq) return;

        if (typeof eq.fixedStat[statName] === 'number') base += eq.fixedStat[statName];
        if (typeof eq.randomStat[statName] === 'number') base += eq.randomStat[statName];
    });

    // 🛡️ TERMINOLOGY SYNC: Apply Class Passives to Frontend UI
    const pClass = game.player.baseStats.playerClass;

    // Berserker: Bulk Up! (Lv.25+) -> +25% Base HP and Defense
    if (pClass === 'Berserker' && game.player.level >= 25 && (statName === 'hp' || statName === 'defense')) {
        base += Math.floor((Number(game.player.baseStats[statName]) || 0) * 0.25);
    }

    // Blademaster: Sharpen Up! (Lv.1+) -> +25% Base Attack
    if (pClass === 'Blademaster' && statName === 'attack') {
        base += Math.floor((Number(game.player.baseStats.attack) || 0) * 0.25);
    }

    return Math.max(0, base);
};
window.getAttackPower = function() { return window.getTotalStat('attack') + Math.floor(window.getTotalStat('str') / 2); }; 
window.getMagicAttack = function() { return window.getTotalStat('magic') + Math.floor(window.getTotalStat('int') / 2); }; 
window.getMaxHp = function() { return window.getTotalStat('hp'); }; 
// 🛡️ RESTORED & SECURED: Visual Sync Poke for Party UI
window.emitVitalsIfNeeded = function(force = false) {
    if (!game.player || !socket) return;
    
    const now = Date.now();
    const level = game.player.level;

    // Only "poke" the server if the level changed, or if forced (Juice/Teleport), or every 5s
    if (force || level !== lastVitalsSent.level || now - lastVitalsTs > 5000) {
        
        lastVitalsSent = { level: level };
        lastVitalsTs = now;
        
        // We don't even send HP anymore. The server already knows it!
        socket.emit('playerVitals', { level: level });
    }
};
window.getDefense = function() { let def = window.getTotalStat('defense'); if (game.player.tauntBuffUntil && Date.now() < game.player.tauntBuffUntil) { def *= 3; } return def; };
window.getSpeed = function() { return window.getTotalStat('speed'); }; 
window.getBaseStat = function(lvl) { if (lvl >= 50) { let extraTicks = Math.floor((lvl - 50) / 5); return 100 + (extraTicks * 3); } if (lvl >= 45) return 45; if (lvl >= 40) return 40; if (lvl >= 35) return 30; if (lvl >= 30) return 27; if (lvl >= 25) return 22; if (lvl >= 20) return 20; if (lvl >= 15) return 15; if (lvl >= 10) return 12; if (lvl >= 5) return 8; return 5; }
window.addLoot = function(item) {
    if (!item) return;

    // 🛡️ YOUR LOOT FILTER STAYS HERE: Checks the UI boxes first!
    if (!window.acceptsLootRarity(item)) {
        if (dom.log) dom.log.innerText = `Ignored ${item.rarity || 'Basic'} drop: ${item.name}`;
        return;
    }

    item.quantity = item.quantity || 1;

    if (item.type === 'potion' || item.type === 'material' || item.type === 'consumable') {
        const inv = game.player.inventory || [];
        let existingIndex = inv.findIndex(i => i && i.name === item.name);
        if (existingIndex !== -1) {
            game.player.inventory[existingIndex].quantity += item.quantity;
            dom.log.innerText = `Looted: ${item.name} (x${game.player.inventory[existingIndex].quantity})!`;
            if (isInventoryOpen) window.renderInventory();
            
            // 🛡️ THE FIX: Removed the hardcoded rarity block. If the filter allowed it, SAVE IT.
            DatabaseManager.savePlayerData(game.player);
            return;
        }
    }

    const inv = game.player.inventory || [];
    const emptySlot = inv.findIndex(i => i === null);
    if (emptySlot !== -1) {
        game.player.inventory[emptySlot] = item;
        dom.log.innerText = `Looted: ${item.name}!`;
        if (isInventoryOpen) window.renderInventory();
        
        // 🛡️ THE FIX: Removed the hardcoded rarity block. If the filter allowed it, SAVE IT.
        DatabaseManager.savePlayerData(game.player);
    } else {
        dom.log.innerText = `Inventory full! Lost ${item.name}.`;
    }
}

window.getItemTooltip = function(item) { 
    if(!item) return ""; 
    let nameClass = item.rarity === "Godly" ? "rarity-godly" : (item.rarity === "Divine" ? "rarity-divine-text" : "");
    let html = `<strong class="${nameClass}" style="color:${item.color}; font-size: 13px;">${item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name}</strong><br><span style="color:#888;">Lv. ${item.level || 1} ${item.rarity || 'Normal'}</span><br>`; 
    
    // 🛡️ THE FIX: Display Untradeable tag for enhanced Godly/Divine gear
    if ((item.rarity === 'Godly' || item.rarity === 'Divine') && item.enhanceLevel > 0) {
        html += `<span style="color:#f44336; font-size:11px; font-weight:bold; letter-spacing:1px;">[UNTRADEABLE]</span><br>`;
    }
    html += `<br>`;
    if(item.type === 'material') return html + `<span style="color:#aaa;"><em>${item.description}</em></span>`; 
if(item.type === 'gem') return html + `<span style="color:#00ffff;"><em>${item.description}</em></span><br>`;
    if(item.type === 'potion') return html + `Heals 100 HP`; 
    if(item.type === 'consumable') return html + `<span style="color:#ffeb3b;"><em>${item.description}</em></span>`;

    // 💎 THE FIX: Visual indicator for Power Gem Sockets
    if (['necklace', 'ring', 'earrings'].includes(item.type)) {
        let maxGems = { "Basic": 1, "Rare": 1, "Unique": 2, "Legendary": 3, "Godly": 4, "Divine": 5 }[item.rarity] || 0;
        if (maxGems > 0) {
            let count = item.gemCount || 0;
            let sockets = "";
            for(let i = 0; i < maxGems; i++) {
                sockets += (i < count) ? "♦" : "♢";
            }
            html += `<span style="color:#00ffff; font-size:13px; letter-spacing:2px;">Sockets: ${sockets}</span><br>`;
        }
    }

    if(item.fixedStat) { for(let key in item.fixedStat) html += `+${item.fixedStat[key]} ${key.toUpperCase()}<br>`; }
    if(item.randomStat) { for(let key in item.randomStat) html += `<span style="color:#4CAF50;">+${item.randomStat[key]} ${key.toUpperCase()} (Bonus)</span><br>`; } 
    return html; 
}

window.loadLootFilter = function() {
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem('exonie_loot_filter') || 'null');
    } catch(e) {}

    const defaults = {
        Starter: true,
        Basic: true,
        Rare: true,
        Unique: true,
        Legendary: true,
        Godly: true
    };

    game.player.lootFilter = Object.assign({}, defaults, saved || {});

    Object.keys(defaults).forEach(rarity => {
        const el = document.getElementById(`loot-filter-${rarity}`);
        if (el) el.checked = !!game.player.lootFilter[rarity];
    });
};

window.updateLootFilter = function() {
    const rarities = ['Starter', 'Basic', 'Rare', 'Unique', 'Legendary', 'Godly'];
    if (!game.player.lootFilter) game.player.lootFilter = {};

    rarities.forEach(rarity => {
        const el = document.getElementById(`loot-filter-${rarity}`);
        game.player.lootFilter[rarity] = !!(el && el.checked);
    });

    localStorage.setItem('exonie_loot_filter', JSON.stringify(game.player.lootFilter));

    if (socket) {
        socket.emit('updateLootFilter', game.player.lootFilter);
    }

    if (dom.log) dom.log.innerText = "Loot filter updated.";
};

window.acceptsLootRarity = function(item) {
    if (!item) return false;
    const rarity = item.rarity || 'Basic';
    if (!game.player.lootFilter) return true;
    if (typeof game.player.lootFilter[rarity] === 'undefined') return true;
    return !!game.player.lootFilter[rarity];
};

window.toggleInventory = function() {
    isInventoryOpen = !isInventoryOpen;
    if (isInventoryOpen) {
        window.renderInventory();
        dom.invScreen.style.display = 'block';
        if (window.isMobileUI()) {
            window.enableMobileWindowControls(dom.invScreen);
            window.bringWindowToFront(dom.invScreen);
            window.clampWindowToViewport(dom.invScreen);
        }
    } else {
        dom.invScreen.style.display = 'none';
        document.getElementById('inv-context-menu').style.display = 'none';
    }
}
window.renderInventory = function() {
    const grid = document.getElementById('inventory-grid'); if (!grid) return; grid.innerHTML = '';
    const inv = game.player.inventory || new Array(20).fill(null);
    for (let i = 0; i < inv.length; i++) {
        const slot = document.createElement('div'); slot.className = 'inv-slot'; const item = inv[i];
        
        // 🎒 MAKE SLOT DRAGGABLE AND DROPPABLE
        slot.draggable = true;
        slot.ondragstart = (e) => { e.dataTransfer.setData('text/plain', i); };
        slot.ondragover = (e) => { e.preventDefault(); };
        slot.ondrop = (e) => { e.preventDefault(); window.swapSlots(parseInt(e.dataTransfer.getData('text/plain')), i); };

        if (item) {
            if (inTradeMode) { slot.style.border = "1px solid #2196F3"; slot.onclick = () => window.addTradeItem(i); } 
            else if (isEnhancing) { slot.style.border = "1px dashed #ffeb3b"; slot.onclick = (e) => window.attemptEnhance(i, e); } 
           // --- LINES BEFORE ---
            else if (window.isStorageOpen) { 
                slot.style.border = "1px dashed #E040FB"; 
                slot.onclick = () => { if(socket) socket.emit('transferToStorage', i); }; 
            } // 🧰 ADDED THIS BLOCK FOR STORAGE
            else if (window.isApplyingAura) {
                slot.style.border = "1px dashed #00ffff"; 
                slot.onclick = (e) => {
                    if (game.player.inventory[activeInvIndex]?.type === 'gem') window.attemptApplyGem(i, e);
                    else window.attemptApplyAura(i, e);
                }; 
            }
            else if (window.isApplyingForger) {
                slot.style.border = "1px dashed #E040FB";
                slot.onclick = (e) => window.openForgerStatSelect(i, e);
            }
            else { 
                slot.style.borderBottom = `3px solid ${item.color || '#fff'}`; 
                slot.onclick = (e) => {
                // --- LINES AFTER ---
                    // 🔗 SHIFT+CLICK TO LINK ITEM
                    if (e.shiftKey) {
                        window.linkItemToChat(i);
                    } else {
                        window.openItemAction(i, e);
                    }
                }; 
           }
            let nameSpan = document.createElement('span');
            nameSpan.innerText = item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name;
            if (item.rarity === 'Divine') nameSpan.className = 'rarity-divine-text';
            slot.appendChild(nameSpan);
            let tip = document.createElement('div'); tip.className = 'tooltip'; tip.innerHTML = window.getItemTooltip(item); slot.appendChild(tip);
            if (item.quantity && item.quantity > 1) { let q = document.createElement('span'); q.className = 'inv-qty'; q.innerText = 'x' + item.quantity; slot.appendChild(q); }
        }
        grid.appendChild(slot);
    }
    window.updateEquipmentDisplay();
    window.updatePotionHotbar();
}

window.swapSlots = function(fromIndex, toIndex) {
    if (fromIndex === toIndex || isNaN(fromIndex) || isNaN(toIndex) || fromIndex < 0 || toIndex < 0) return;
    if (socket) socket.emit('swapInventory', { from: fromIndex, to: toIndex });
    
    // Optimistic UI Swap for instant feel
    let temp = game.player.inventory[fromIndex];
    game.player.inventory[fromIndex] = game.player.inventory[toIndex];
    game.player.inventory[toIndex] = temp;
    window.renderInventory();
}

window.openItemAction = function(index, e) {
    e.stopPropagation(); activeInvIndex = index; const menu = document.getElementById('inv-context-menu'); const item = game.player.inventory[index]; if (!item) return;
    const isPet = item.type === 'aura' && ['fox', 'owl', 'wisp', 'egg', 'void'].includes(item.auraId);
    if (item.type === 'gem') {
        document.getElementById('ctx-btn-equip').innerText = "Socket Gem";
        window.isApplyingAura = true; // Reusing the aura selection border logic
        dom.log.innerText = `Select an Accessory (Necklace, Ring, Earrings) to socket the gem!`;
    } else {
        document.getElementById('ctx-btn-equip').innerText = (item.type === 'potion' || item.type === 'consumable') ? "Use" : (item.type === 'material' ? "Enhance" : (item.type === 'aura' ? (isPet ? "Equip Pet" : "Apply Aura") : (item.type === 'forger' ? "Use Forger" : "Equip")));
    }
    document.getElementById('ctx-btn-sell').style.display = isShopping ? 'block' : 'none';
    document.getElementById('ctx-btn-extract-aura').style.display = ((item.type === 'armor' || item.type === 'leggings') && item.aura) ? 'block' : 'none';
    
    // Show Split button only if there is a stack
    document.getElementById('ctx-btn-split').style.display = (item.quantity && item.quantity > 1) ? 'block' : 'none';

    menu.style.display = 'flex'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
}

window.actionSplit = function(e) {
    if (e) e.stopPropagation();
    let item = game.player.inventory[activeInvIndex];
    if (!item || !item.quantity || item.quantity <= 1) return;
    
    window.customPrompt(`How many to split off? (Max: ${item.quantity - 1})`, function(val) {
        let amt = parseInt(val);
        if (!isNaN(amt) && amt > 0 && amt < item.quantity) {
            if (socket) socket.emit('splitInventoryItem', { index: activeInvIndex, amount: amt });
        }
    });
    
    document.getElementById('inv-context-menu').style.display = 'none';
    activeInvIndex = -1;
}

window.linkItemToChat = function(index) {
    let item = game.player.inventory[index];
    if (!item) return;
    if (socket) socket.emit('linkItem', { item: item });
    document.getElementById('inv-context-menu').style.display = 'none';
}

window.showLinkedItem = function(jsonStr) {
    try {
        let item = JSON.parse(decodeURIComponent(jsonStr));
        dom.inspect.style.display = 'block'; 
        dom.inspectTitle.innerText = `Linked Item Inspect`;
        
        let html = `<div class="inspect-equip" style="border: 2px solid ${item.color || '#fff'}; box-shadow: 0 0 15px ${item.color || '#fff'};">${window.getItemTooltip(item)}</div>`;
        dom.inspectContent.innerHTML = html;
        
        if (window.isMobileUI()) {
            window.enableMobileWindowControls(dom.inspect);
            window.bringWindowToFront(dom.inspect);
            window.clampWindowToViewport(dom.inspect);
        }
    } catch(e) { console.error("Could not parse linked item."); }
}

window.actionEquip = function(e) { 
    if (e) e.stopPropagation(); if (activeInvIndex === -1 || !game.player.inventory[activeInvIndex]) return; 
    let item = game.player.inventory[activeInvIndex]; 
    
    if (item.type === 'material') { 
        isEnhancing = true; dom.log.innerText = `Select equipment to enhance!`; window.renderInventory(); 
    } else if (item.type === 'aura') { 
        window.isApplyingAura = true; 
        const isPet = ['fox', 'owl', 'wisp', 'egg', 'void'].includes(item.auraId);
        dom.log.innerText = isPet ? `Select Leggings to equip your Pet!` : `Select an Armor to apply the Aura!`; 
        window.renderInventory(); 
    } else if (item.type === 'gem') {
        window.isApplyingAura = true; 
        dom.log.innerText = `Select an Accessory (Necklace, Ring, Earrings) to socket the gem!`;
        window.renderInventory();
    
    // 🌟 THE FIX: Intercept the Forger and turn on the selection mode!
    } else if (item.type === 'forger') {
        window.isApplyingForger = true;
        dom.log.innerText = `Select an equipment piece to reroll its stats!`;
        window.renderInventory();
        
    } else { 
        window.useItem(activeInvIndex); 
    } 
    document.getElementById('inv-context-menu').style.display = 'none'; 
}
window.attemptApplyAura = function(targetIndex, e) { 
    e.stopPropagation(); 
    if (socket) socket.emit('requestApplyAura', { stoneIndex: activeInvIndex, targetIndex: targetIndex }); 
    window.isApplyingAura = false; 
    window.renderInventory(); 
}

window.extractAura = function(e) { 
    if (e) e.stopPropagation(); 
    if (activeInvIndex === -1 || !game.player.inventory[activeInvIndex]) return; 
    if (socket) socket.emit('requestExtractAura', { targetIndex: activeInvIndex }); 
    document.getElementById('inv-context-menu').style.display = 'none'; 
    activeInvIndex = -1;
}

window.actionSell = function(e) { 
    if (e) e.stopPropagation(); 
    if (activeInvIndex === -1 || !game.player.inventory[activeInvIndex]) return; 

    let item = game.player.inventory[activeInvIndex];
    if (!item || !item.id) {
        dom.log.innerText = "That item cannot be sold right now.";
        document.getElementById('inv-context-menu').style.display = 'none';
        activeInvIndex = -1;
        return;
    }

    if (item.type === 'aura') {
        dom.log.innerText = "Cosmetics and pets cannot be sold!";
        document.getElementById('inv-context-menu').style.display = 'none';
        activeInvIndex = -1;
        return;
    }

    if (socket) {
        socket.emit('requestSell', { 
            itemId: item.id,
            index: activeInvIndex
        });
    }

    document.getElementById('inv-context-menu').style.display = 'none'; 
    activeInvIndex = -1;
}
window.actionThrow = function(e) { 
    if (e) e.stopPropagation(); 
    if (activeInvIndex === -1 || !game.player.inventory[activeInvIndex]) return; 
    if (socket) socket.emit('requestThrowItem', { index: activeInvIndex }); 
    dom.log.innerText = `Threw away item.`;
    document.getElementById('inv-context-menu').style.display = 'none'; 
    activeInvIndex = -1;
}

// 🛡️ THE CRISP INVENTORY FIX: Move logic to server
window.unequipItem = function(slot) {
    if (!game.player.equips || !game.player.equips[slot]) return;

    // Optimistic UI: Makes the button feel instantly responsive
    const eqBox = document.getElementById(`eq-${slot}-slot`);
    if (eqBox) eqBox.innerText = "...";

    // Send it to the server so the backend memory stays perfectly synced!
    if (socket) socket.emit('requestUnequip', { slot: slot });
};

window.useRevivalJuice = function(invIndex = -1) {
    if (!game.isGhost) {
        dom.log.innerText = "You can only use this when you are dead!";
        return;
    }

    let juiceIndex = invIndex;
    if (juiceIndex === -1) {
        juiceIndex = game.player.inventory.findIndex(i => i && i.name === "Revival Juice");
    }

    if (juiceIndex === -1) {
        dom.log.innerText = "No Revival Juice found.";
        return;
    }

    if (socket) {
        socket.emit('useRevivalJuice', { invIndex: juiceIndex });
    }
};
window.useItem = function(index) {
    const item = game.player.inventory[index];
    if (!item) return;

    // 🛡️ THE FIX: Block ghosts from using items (except Revival Juice!)
    if (game.isGhost && item.name !== "Revival Juice") {
        if (dom.log) dom.log.innerText = "You cannot use items while dead!";
        return;
    }
    
    // ⚔️ TAVERN ANTI-CHEAT: Block Potions and Consumables
    if (safeMapData.id === 'trainingtavern' && (item.type === 'potion' || item.type === 'consumable')) {
        if (dom.log) dom.log.innerText = "Items are forbidden in the Training Tavern!";
        return;
    }

    if (item.level && item.level > game.player.level) {
        if (dom.log) dom.log.innerText = `Level ${item.level} required!`;
        return;
    }

    if (item.type === 'potion') {
    if (Date.now() < window.potionCooldownReadyAt) {
        if (dom.log) dom.log.innerText = "Potion is on cooldown!";
        return;
    }

    window.potionCooldownReadyAt = Date.now() + 5000;
    if (typeof window.updateHotbarCooldowns === 'function') window.updateHotbarCooldowns();

    // 🌟 OPTIMISTIC UI: heal locally too, so maze HP bar moves instantly
    // 🛡️ CORRUPTION FIX: Hardcode 100 here as well!
    const healAmount = 100;
    const trueMaxHp = window.getMaxHp() || 100;
    game.player.currentHp = Math.min(trueMaxHp, (game.player.currentHp || 0) + healAmount);

    item.quantity = (item.quantity || 1) - 1;
    if (item.quantity <= 0) game.player.inventory[index] = null;

    if (typeof window.updateUI === 'function') window.updateUI();
    if (typeof window.updatePotionHotbar === 'function') window.updatePotionHotbar();
    if (typeof isInventoryOpen !== 'undefined' && isInventoryOpen && typeof window.renderInventory === 'function') window.renderInventory();
}

    // 🛡️ THE FIX: Let the server handle ALL usable items instantly!
   // 🛡️ THE FIX: Let the server handle ALL usable items instantly!
    if (['potion', 'consumable', 'weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings'].includes(item.type)) {
        if (item.name === "Revival Juice") {
            window.useRevivalJuice(index);
       } else if (item.name === 'Name Change Ticket') {
            window.customPrompt("Enter your new character name (Max 16 chars):", function(newName) {
                if (newName && newName.trim().length >= 3 && newName.trim().length <= 16) {
                    if (socket) socket.emit('requestNameChange', { index: index, newName: newName.trim() });
                } else if (newName) {
                    if (dom.log) dom.log.innerText = "Name must be between 3 and 16 characters.";
                }
            });
        } else if (item.name === 'Appearance Reroll Ticket') {
            document.getElementById('char-name-input').style.display = 'none'; // Hide name input
            document.getElementById('creation-screen').classList.add('active'); // Show character editor
            
            // Temporarily swap the submit button's behavior
            const createBtn = document.getElementById('creation-screen').querySelector('.btn');
            const originalClick = createBtn.onclick;
            
            createBtn.onclick = function() {
                if (socket) socket.emit('requestAppearanceChange', { index: index, charData: window.charData });
                document.getElementById('creation-screen').classList.remove('active');
                document.getElementById('char-name-input').style.display = 'block'; // Reset for future use
                createBtn.onclick = originalClick; // Restore original function
            };
        } else {
            if (socket) socket.emit('useInventoryItem', { index });
        }
        return;
    }

    if (dom.log) dom.log.innerText = "That item cannot be equipped.";
};

window.usePotionHotkey = function() {
    if (window.isLoading || game.isGhost) {
        if (dom.log) dom.log.innerText = "You cannot use potions right now.";
        return;
    }

    const inv = game.player.inventory || [];
    const potionIndex = inv.findIndex(item =>
        item &&
        item.type === 'potion' &&
        item.name === 'Health Potion' &&
        (item.quantity || 1) > 0
    );

    if (potionIndex === -1) {
        if (dom.log) dom.log.innerText = "No Health Potions in inventory.";
        return;
    }

    window.useItem(potionIndex);
};
window.attemptEnhance = function(targetIndex, e) { 
    e.stopPropagation(); 
    let stone = game.player.inventory[activeInvIndex]; 
    let targetItem = game.player.inventory[targetIndex]; 
    
    if (!stone || !targetItem || stone.type !== 'material' || targetItem.type === 'material' || targetItem.type === 'potion' || targetItem.rarity === "Starter") { 
        isEnhancing = false; window.renderInventory(); return; 
    } 
    
    // 🛡️ THE FIX: Divine Enhancement Stones ignore the level check!
    let isDivineMatch = (stone.rarity === 'Divine' && targetItem.rarity === 'Divine' && stone.name === 'Divine Enhancement Stone');
    let isNormalMatch = (stone.rarity === targetItem.rarity && stone.level === targetItem.level && stone.name !== 'Divine Enhancement Stone');
    
    let maxEnhance = window.MAX_ENHANCE_BY_RARITY[targetItem.rarity] || 20;

    if ((!isDivineMatch && !isNormalMatch) || (targetItem.enhanceLevel || 0) >= maxEnhance) { 
        isEnhancing = false; window.renderInventory(); return; 
    } 
    
    if(socket) socket.emit('requestEnhance', { stoneIndex: activeInvIndex, targetIndex: targetIndex }); 
    isEnhancing = false; window.renderInventory(); 
}
window.updateEquipmentDisplay = function() { 
    try { 
        const buildDisplayStr = (item) => item ? (item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name) : 'None'; 
        let w = game.player.equips.weapon; let a = game.player.equips.armor; let l = game.player.equips.leggings;
        let nk = game.player.equips.necklace; let rg = game.player.equips.ring; let er = game.player.equips.earrings;
        
        const setEq = (id, item) => { let el = document.getElementById(id); if(!el) return; el.innerText = buildDisplayStr(item); if(item) el.style.color = item.color; else el.style.color = ''; };
        setEq('eq-weapon-slot', w); setEq('eq-armor-slot', a); setEq('eq-leggings-slot', l);
        setEq('eq-necklace-slot', nk); setEq('eq-ring-slot', rg); setEq('eq-earrings-slot', er);

        dom.playerArmor.style.display = 'none'; dom.playerLeggings.style.display = 'none'; 
        const createTip = (item, boxId) => { let box = document.getElementById(boxId); if(!box) return; let tip = box.querySelector('.tooltip'); if(!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; box.appendChild(tip); } if(item) tip.innerHTML = window.getItemTooltip(item); else tip.remove(); }; 
        createTip(w, 'eq-box-weapon'); createTip(a, 'eq-box-armor'); createTip(l, 'eq-box-leggings');
        createTip(nk, 'eq-box-necklace'); createTip(rg, 'eq-box-ring'); createTip(er, 'eq-box-earrings');
        
        let newMax = window.getMaxHp(); if(game.player.currentHp > newMax) game.player.currentHp = newMax; window.updateUI(); 
    } catch(err) {} 
}

window.updateUI = function() { 
    document.getElementById('ui-hp-text').innerText = `${game.player.currentHp} / ${window.getMaxHp()}`; 
    document.getElementById('ui-hp-bar').style.width = (game.player.currentHp / Math.max(1, window.getMaxHp())) * 100 + '%'; 
    document.getElementById('ui-hp-bar').style.backgroundColor = (game.player.currentHp < (window.getMaxHp()*0.3)) ? '#f44336' : '#4CAF50'; 
    document.getElementById('ui-level-text').innerText = game.player.level; 
    document.getElementById('ui-exp-text').innerText = `${game.player.exp} / ${game.player.maxExp}`; 
    document.getElementById('ui-exp-bar').style.width = (game.player.exp / Math.max(1, game.player.maxExp)) * 100 + '%'; 
    document.getElementById('ui-gold-text').innerText = game.player.gold || 0; 
    
    if (game.party && game.party.members) { 
        let me = game.party.members.find(x => x.id === game.player.id); 
        if (me) { 
            me.currentHp = game.player.currentHp; 
            me.maxHp = window.getMaxHp(); 
            me.level = game.player.level; 
            window.renderPartyUI(); 
        }
    } 
    // 🏆 THE FIX: Keep the rank aura active every time the UI refreshes
    if (typeof window.updateNameplateRanks === 'function') window.updateNameplateRanks();
}
window.updatePotionHotbar = function() {
    const countEl = document.getElementById('hotbar-potion-count');
    const slotEl = document.getElementById('hotbar-3');
    if (!countEl || !slotEl) return;

    const inv = game.player.inventory || [];
    let totalPotions = 0;

    inv.forEach(item => {
        if (item && item.type === 'potion' && item.name === 'Health Potion') {
            totalPotions += (item.quantity || 1);
        }
    });

    countEl.innerText = totalPotions;

    if (totalPotions > 0) {
        slotEl.style.opacity = '1';
        slotEl.style.borderColor = '#4CAF50';
    } else {
        slotEl.style.opacity = '0.6';
        slotEl.style.borderColor = '#555';
    }
};
window.toggleStats = function() { if (dom.statScreen.style.display === 'block') { dom.statScreen.style.display = 'none'; } else { document.getElementById('stat-lvl').innerText = game.player.level; document.getElementById('stat-maxhp').innerText = window.getMaxHp(); document.getElementById('stat-atk').innerText = window.getAttackPower(); document.getElementById('stat-matk').innerText = window.getMagicAttack(); document.getElementById('stat-def').innerText = window.getDefense(); document.getElementById('stat-spd').innerText = window.getSpeed(); document.getElementById('stat-str').innerText = window.getTotalStat('str'); document.getElementById('stat-int').innerText = window.getTotalStat('int'); dom.statScreen.style.display = 'block'; if (window.isMobileUI()) {
    window.enableMobileWindowControls(dom.statScreen);
    window.bringWindowToFront(dom.statScreen);
    window.clampWindowToViewport(dom.statScreen);
} } }
window.checkLevelUp = function() { if(game.player.level >= 80) return; while(game.player.exp >= game.player.maxExp && game.player.level < 80) { game.player.exp -= game.player.maxExp; game.player.level++; game.player.maxExp += (game.player.level >= 71 ? 10000 : game.player.level >= 61 ? 7500 : game.player.level >= 51 ? 5000 : game.player.level >= 41 ? 1500 : game.player.level >= 31 ? 1000 : game.player.level >= 21 ? 750 : game.player.level >= 11 ? 500 : 100); game.player.baseStats.hp += 10; game.player.baseStats.str += 2; game.player.baseStats.int += 2; game.player.currentHp = window.getMaxHp(); const txt = document.createElement('div'); txt.className = 'level-up-text'; txt.innerText = "LEVEL UP!"; txt.style.left = (game.player.x - 20) + 'px'; txt.style.top = (game.player.y - 40) + 'px'; dom.world.appendChild(txt); setTimeout(() => txt.remove(), 2000); } window.updateUI(); window.updateSkillMenu(); DatabaseManager.savePlayerData(game.player); }

// ==========================================
// 6. ADMIN & MAP TOOLS
// ==========================================
window.buildCollisionLayers = function() { const layer = document.getElementById('collision-layers'); if (!layer) return; layer.innerHTML = ''; const cols = safeMapData.collisions || []; cols.forEach(box => { const div = document.createElement('div'); div.className = 'collision-box'; div.style.left = box.x + 'px'; div.style.top = box.y + 'px'; div.style.width = box.w + 'px'; div.style.height = box.h + 'px'; layer.appendChild(div); }); const tps = safeMapData.teleports || []; tps.forEach(box => { const div = document.createElement('div'); div.className = 'collision-box'; div.style.left = box.x + 'px'; div.style.top = box.y + 'px'; div.style.width = box.w + 'px'; div.style.height = box.h + 'px'; if (window.adminMode) { 
    const isSub = isNaN(parseInt(box.portalId));
    div.style.background = isSub ? 'rgba(156, 39, 176, 0.4)' : 'rgba(0, 0, 255, 0.4)'; 
    div.style.border = isSub ? '2px dashed #9c27b0' : '2px dashed #00f'; 
    div.innerText = box.portalId || '?'; 
    div.style.color = 'white'; div.style.display = 'flex'; div.style.justifyContent = 'center'; div.style.alignItems = 'center'; div.style.fontSize = '24px'; div.style.fontWeight = 'bold'; 
}layer.appendChild(div); }); if (window.adminMode) { if (safeMapData.spawnX !== undefined) { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = safeMapData.spawnX + 'px'; sm.style.top = safeMapData.spawnY + 'px'; sm.innerText = 'S'; layer.appendChild(sm); } (safeMapData.normalSpawns || []).forEach(sp => { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = sp.x + 'px'; sm.style.top = sp.y + 'px'; sm.style.borderColor = '#0f0'; sm.innerText = 'M'; layer.appendChild(sm); }); (safeMapData.miniBossSpawns || []).forEach(sp => { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = sp.x + 'px'; sm.style.top = sp.y + 'px'; sm.style.borderColor = '#ff9800'; sm.innerText = 'MB'; layer.appendChild(sm); }); (safeMapData.floorBossSpawns || []).forEach(sp => { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = sp.x + 'px'; sm.style.top = sp.y + 'px'; sm.style.borderColor = '#9c27b0'; sm.innerText = 'FB'; layer.appendChild(sm); }); } }
window.saveMapToServer = function() { let mapId = safeMapData.id || 'town'; let varName = mapId === 'town' ? 'townMapData' : mapId + 'MapData'; let str = `var ${varName} = ` + JSON.stringify(safeMapData, null, 4) + `;\nif(typeof window !== 'undefined') window['${varName}'] = ${varName};`; dom.adminOutput.value = str; if(socket) socket.emit('saveMapFile', { mapId: mapId, content: str }); dom.log.innerText = "Map saved to server!"; }
dom.world.addEventListener('contextmenu', (e) => { if (window.adminMode) { e.preventDefault(); } });
let isAdminDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragBoxElement = null;
let isDrawingPortal = false;

dom.world.addEventListener('mousedown', (e) => { 
    if (!window.adminMode) return;
    
    const rect = dom.world.getBoundingClientRect(); 
    const hitX = Math.round((e.clientX - rect.left) / CAMERA_ZOOM); 
    const hitY = Math.round((e.clientY - rect.top) / CAMERA_ZOOM); 

    // RIGHT CLICK: Delete Object
    if (e.button === 2) { 
        let closestDist = 40; let targetArray = null; let targetIndex = -1; 
        const checkNearest = (arr) => { if (!arr) return; arr.forEach((item, index) => { let dist = Math.hypot(hitX - item.x, hitY - item.y); if (dist < closestDist) { closestDist = dist; targetArray = arr; targetIndex = index; } }); }; 
        const checkInsideBox = (arr) => { if (!arr) return; arr.forEach((item, index) => { if (item.w && item.h) { if (hitX >= item.x && hitX <= item.x + item.w && hitY >= item.y && hitY <= item.y + item.h) { targetArray = arr; targetIndex = index; } } }); }; 
        
        checkInsideBox(safeMapData.collisions); 
        if (targetIndex === -1) checkInsideBox(safeMapData.teleports); 
        if (targetIndex === -1) { checkNearest(safeMapData.normalSpawns); checkNearest(safeMapData.miniBossSpawns); checkNearest(safeMapData.floorBossSpawns); } 
        
        if (targetIndex !== -1) { 
            targetArray.splice(targetIndex, 1); 
            window.buildCollisionLayers(); 
            window.copyAdminData(); 
            dom.log.innerText = `Deleted map object at ${hitX}, ${hitY}`; 
        } else { 
            dom.log.innerText = "No object here to delete."; 
        } 
        return; 
    } 

    // 🌟 Z / X / C MONSTER SPAWNERS 🌟
    if (e.button === 0 && (game.keys.z || game.keys.x || game.keys.c)) {
        const mKey = document.getElementById('admin-monster-key').value;
        const mLvl = parseInt(document.getElementById('admin-monster-level').value) || 5;
        const spawnData = { x: hitX, y: hitY, monsterKey: mKey, level: mLvl };
        
        if (game.keys.z) {
            if (!safeMapData.normalSpawns) safeMapData.normalSpawns = [];
            safeMapData.normalSpawns.push(spawnData);
            dom.log.innerText = `Normal Mob (${mKey}) placed.`;
        } else if (game.keys.x) {
            if (!safeMapData.miniBossSpawns) safeMapData.miniBossSpawns = [];
            safeMapData.miniBossSpawns.push(spawnData);
            dom.log.innerText = `Mini Boss (${mKey}) placed.`;
        } else if (game.keys.c) {
            if (!safeMapData.floorBossSpawns) safeMapData.floorBossSpawns = [];
            safeMapData.floorBossSpawns.push(spawnData);
            dom.log.innerText = `Floor Boss (${mKey}) placed.`;
        }
        
        window.buildCollisionLayers(); 
        window.copyAdminData();
        return; // Break out so it doesn't draw a box
    }
    
    // LEFT CLICK + ALT: Start Drawing Box
    if (e.button === 0 && e.altKey) { 
        isAdminDragging = true;
        isDrawingPortal = e.shiftKey;
        dragStartX = hitX;
        dragStartY = hitY;
        
        // Create a visual box to see while dragging
        dragBoxElement = document.createElement('div');
        dragBoxElement.style.position = 'absolute';
        dragBoxElement.style.left = dragStartX + 'px';
        dragBoxElement.style.top = dragStartY + 'px';
        dragBoxElement.style.width = '0px';
        dragBoxElement.style.height = '0px';
        dragBoxElement.style.background = isDrawingPortal ? 'rgba(0, 0, 255, 0.4)' : 'rgba(255, 0, 0, 0.4)';
        dragBoxElement.style.border = isDrawingPortal ? '2px dashed #00f' : '1px solid red';
        dragBoxElement.style.zIndex = '1000';
        dragBoxElement.style.pointerEvents = 'none';
        dom.world.appendChild(dragBoxElement);
    } 
});

window.addEventListener('mousemove', (e) => {
    if (!isAdminDragging || !dragBoxElement) return;
    
    const rect = dom.world.getBoundingClientRect(); 
    const currentX = Math.round((e.clientX - rect.left) / CAMERA_ZOOM); 
    const currentY = Math.round((e.clientY - rect.top) / CAMERA_ZOOM); 
    
    // Math ensures you can drag backwards/upwards safely
    let finalX = Math.min(dragStartX, currentX);
    let finalY = Math.min(dragStartY, currentY);
    let finalW = Math.abs(currentX - dragStartX);
    let finalH = Math.abs(currentY - dragStartY);
    
    dragBoxElement.style.left = finalX + 'px';
    dragBoxElement.style.top = finalY + 'px';
    dragBoxElement.style.width = finalW + 'px';
    dragBoxElement.style.height = finalH + 'px';
});

window.addEventListener('mouseup', (e) => {
    if (isAdminDragging) {
        isAdminDragging = false;
        
        if (dragBoxElement) {
            dragBoxElement.remove();
            dragBoxElement = null;
        }
        
        const rect = dom.world.getBoundingClientRect(); 
        const endX = Math.round((e.clientX - rect.left) / CAMERA_ZOOM); 
        const endY = Math.round((e.clientY - rect.top) / CAMERA_ZOOM); 
        
        let finalX = Math.min(dragStartX, endX);
        let finalY = Math.min(dragStartY, endY);
        let finalW = Math.abs(endX - dragStartX);
        let finalH = Math.abs(endY - dragStartY);

        // Prevent accidental clicks from creating tiny invisible boxes
        if (finalW > 15 && finalH > 15) {
            let boxData = { x: finalX, y: finalY, w: finalW, h: finalH };
            
            if (isDrawingPortal) { 
              window.customPrompt("Enter Portal ID (Number for Floors, Letter for Rooms):", (rawId) => {
                    if (!rawId) return;
                    window.customPrompt("Enter Target Map ID (e.g., floor1 or house1):", (tMap) => {
                        if (!tMap) return;
                        window.customPrompt("Enter spawn X coordinate (Default 960):", (spawnX) => {
                            let fX = spawnX || "960";
                            window.customPrompt("Enter spawn Y coordinate (Default 1000):", (spawnY) => {
                                let fY = spawnY || "1000";
                                
                                let pId = isNaN(parseInt(rawId)) ? String(rawId).toUpperCase().charAt(0) : parseInt(rawId);
                                boxData.portalId = pId; 
                                boxData.targetMapId = tMap; 
                                boxData.targetX = Number(fX);
                                boxData.targetY = Number(fY);
                                
                                if (!safeMapData.teleports) safeMapData.teleports = []; 
                                safeMapData.teleports.push(boxData); 
                                dom.log.innerText = `Teleport ${pId} added to ${tMap}`; 
                                window.buildCollisionLayers(); 
                                window.copyAdminData(); 
                            });
                        });
                    });
                });
                return; // Stop the synchronous execution since customPrompt is asynchronous
            } else { 
                if (!safeMapData.collisions) safeMapData.collisions = []; 
                safeMapData.collisions.push(boxData); 
                dom.log.innerText = "Collision added."; 
            } 
            window.buildCollisionLayers(); 
            window.copyAdminData(); 
        }
    }
});
window.undoLastBox = function() { if (!window.adminMode) return; if (safeMapData.teleports?.length > 0) { safeMapData.teleports.pop(); dom.log.innerText = "Undid last teleport."; } else if (safeMapData.collisions?.length > 0) { safeMapData.collisions.pop(); dom.log.innerText = "Undid last collision."; } window.buildCollisionLayers(); window.copyAdminData(); }
window.clearAllBoxes = function() { if (!window.adminMode || !confirm("Clear ALL boxes?")) return; safeMapData.collisions = []; safeMapData.teleports = []; safeMapData.normalSpawns = []; safeMapData.miniBossSpawns = []; safeMapData.floorBossSpawns = []; window.buildCollisionLayers(); window.copyAdminData(); dom.log.innerText = "All boxes cleared."; }
window.copyAdminData = function() { let mapId = safeMapData.id || 'town'; let varName = mapId === 'town' ? 'townMapData' : mapId + 'MapData'; let str = `var ${varName} = ` + JSON.stringify(safeMapData, null, 4) + `;\nif(typeof window !== 'undefined') window['${varName}'] = ${varName};`; dom.adminOutput.value = str; }
window.adminSetPlayerLevel = function() { 
    let newLvl = parseInt(document.getElementById('admin-player-level').value) || 1; 
    
    // 🛡️ THE FIX: Send the request to the server. The server verifies if you are Kei!
    if (socket) socket.emit('adminSetLevel', newLvl);
}
window.adminGiveCustomItem = function() { 
    let r = document.getElementById('admin-item-rarity').value; 
    let t = document.getElementById('admin-item-type').value; 
    let l = parseInt(document.getElementById('admin-item-level').value) || 1; 
    let e = parseInt(document.getElementById('admin-item-enhance').value) || 0; 
    
    // 🛡️ THE FIX: Request the item from the server so it gets validated and saved!
    if (socket) socket.emit('adminSpawnItem', { rarity: r, type: t, level: l, enhanceLevel: e }); 
}

// ==========================================
// 7. INPUTS, CHAT & SOCIAL LOGIC
// ==========================================
window.getPlayerById = function(id) { if (!id) return null; if (id === game.player.id) return game.player; return game.remotePlayers[id] || null; }
window.goFullscreen = function() { if (!document.fullscreenElement && document.documentElement.requestFullscreen) { document.documentElement.requestFullscreen().catch(e => console.warn("Fullscreen blocked by browser until interaction.")); } };
window.switchAuth = function(target) { document.getElementById('login-form').style.display = target === 'login' ? 'block' : 'none'; document.getElementById('register-form').style.display = target === 'register' ? 'block' : 'none'; window.playBGM('loginmenu'); };
window.attemptLogin = function() { 
    const u = document.getElementById('login-user').value.trim(); 
    const p = document.getElementById('login-pass').value; 
    if (!u || !p) return; 

    // 🛡️ GENERATE OR FETCH DEVICE ID
    let deviceId = localStorage.getItem('exonie_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('exonie_device_id', deviceId);
    }

    localStorage.setItem('exonie_user', u); 
    localStorage.setItem('exonie_pass', p); 
    document.getElementById('auth-screen').classList.remove('active'); 
    document.getElementById('loading-screen').style.display = 'flex'; 
    
    if(socket) socket.emit('login', { username: u, password: p, deviceId: deviceId }); 
    window.playBGM('loginmenu'); window.goFullscreen(); 
};
window.attemptRegister = function() { 
    const u = document.getElementById('reg-user').value.trim(); 
    const p = document.getElementById('reg-pass').value; 
    if (!u || !p) return; 

    // 🛡️ GENERATE OR FETCH DEVICE ID
    let deviceId = localStorage.getItem('exonie_device_id');
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('exonie_device_id', deviceId);
    }

    localStorage.setItem('exonie_user', u); 
    localStorage.setItem('exonie_pass', p); 
    document.getElementById('auth-screen').classList.remove('active'); 
    document.getElementById('loading-screen').style.display = 'flex'; 
    
    // 🛡️ THE FIX: Send the deviceId to the server!
    if(socket) socket.emit('register', { username: u, password: p, deviceId: deviceId }); 
    
    window.playBGM('loginmenu'); 
    window.goFullscreen(); 
};
window.submitCharacterCreation = function() { const username = document.getElementById('char-name-input').value; document.getElementById('creation-screen').classList.remove('active'); document.getElementById('loading-text').innerText = "Forging Avatar..."; document.getElementById('loading-screen').style.display = 'flex'; window.playBGM('loginmenu'); if(socket) socket.emit('createCharacter', { username, charData: window.charData }); window.goFullscreen(); };
window.enterGameWorld = function() { 
    if (!game.cachedUserData) return; 
    document.getElementById('select-screen').classList.remove('active'); 
    document.getElementById('loading-text').innerText = "Entering Exonie..."; 
    document.getElementById('loading-screen').style.display = 'flex'; 
    
    // 🛡️ UNLOCKS AUDIO: Bypasses the browser's autoplay block by linking to your click
    let unlockAudio = new Audio(); 
    unlockAudio.play().catch(()=>{}); 

    if(socket) socket.emit('enterWorld', game.cachedUserData); 
    window.goFullscreen(); 
};
window.setSkinColor = function(color, element) { window.charData.skinColor = color; document.getElementById('preview-body').style.filter = skinFilters[color]; document.getElementById('preview-head').style.filter = skinFilters[color]; document.querySelectorAll('#skin-color-group .color-swatch').forEach(s => s.classList.remove('selected')); element.classList.add('selected'); };
window.setHairColor = function(color, element) { window.charData.hairColor = color; document.getElementById('preview-hair').style.filter = hairFilters[color]; document.querySelectorAll('#hair-color-group .color-swatch').forEach(s => s.classList.remove('selected')); element.classList.add('selected'); };
window.setHairStyle = function(style) { window.charData.hairStyle = style; const hairLayer = document.getElementById('preview-hair'); if (style === 'none') { hairLayer.style.display = 'none'; } else { hairLayer.style.display = 'block'; hairLayer.src = `animation/avatar_hair${style}.png`; } document.querySelectorAll('#hair-button-container .btn').forEach(btn => btn.classList.remove('selected')); const activeBtn = document.getElementById(`btn-hair-${style}`); if(activeBtn) activeBtn.classList.add('selected'); };
setTimeout(() => { let firstSkin = document.querySelector('#skin-color-group .color-swatch.selected'); let firstHair = document.querySelector('#hair-color-group .color-swatch.selected'); if (firstSkin) window.setSkinColor('flesh', firstSkin); if (firstHair) window.setHairColor('black', firstHair); }, 100);
window.respawn = function() {
    const deathScreen = document.getElementById('death-screen');
    if (deathScreen) deathScreen.style.display = 'none';

    // Do not revive locally here.
    // Server must teleport to town first, then revive.
    if (socket) socket.emit('respawnPlayer');
};

let joystickActive = false; const joyStick = document.getElementById('mobile-controls'); const joyKnob = document.getElementById('joystick-knob');
joyStick.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); joystickActive = true; moveJoystick(e); }, { passive: false });
joyStick.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); if (joystickActive) moveJoystick(e); }, { passive: false });
joyStick.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); joystickActive = false; joyKnob.style.transform = `translate3d(-50%, -50%, 0)`; game.keys.w = false; game.keys.a = false; game.keys.s = false; game.keys.d = false; });
function moveJoystick(e) { if (!joystickActive) return; const rect = joyStick.getBoundingClientRect(); const centerX = rect.left + rect.width / 2; const centerY = rect.top + rect.height / 2; const touch = e.touches[0]; let dx = touch.clientX - centerX; let dy = touch.clientY - centerY; const dist = Math.min(25, Math.hypot(dx, dy)); const angle = Math.atan2(dy, dx); let moveX = Math.cos(angle) * dist; let moveY = Math.sin(angle) * dist; joyKnob.style.transform = `translate3d(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px), 0)`; const normX = dx / 25; const normY = dy / 25; game.keys.w = normY < -0.3; game.keys.s = normY > 0.3; game.keys.a = normX < -0.3; game.keys.d = normX > 0.3; if (game.keys.a) window.facingRight = false; if (game.keys.d) window.facingRight = true; }

let isFriendsOpen = false;
window.toggleFriends = function() {
    isFriendsOpen = !isFriendsOpen;
    const el = document.getElementById('friends-screen');
    el.style.display = isFriendsOpen ? 'block' : 'none';
    if (isFriendsOpen) {
        if (socket) socket.emit('getFriendsList');
        if (window.isMobileUI()) {
            window.enableMobileWindowControls(el);
            window.bringWindowToFront(el);
            window.clampWindowToViewport(el);
        }
    }
};
window.requestAddFriend = function() { if (!activeTargetPlayerId) return; document.getElementById('player-context-menu').style.display = 'none'; if(socket) socket.emit('addFriend', { targetId: activeTargetPlayerId }); };
window.promptDM = function(targetName) { 
    window.customPrompt(`Send Direct Message to ${targetName}:`, function(msg) {
        if (msg && msg.trim() !== '') { if(socket) socket.emit('sendDM', { targetId: targetName, message: msg.trim() }); } 
    });
};
window.playDMSound = function() { try { const AudioContext = window.AudioContext || window.webkitAudioContext; const audioCtx = new AudioContext(); if (audioCtx.state === 'suspended') { audioCtx.resume(); } const oscillator = audioCtx.createOscillator(); const gainNode = audioCtx.createGain(); oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.1); gainNode.gain.setValueAtTime(0.7, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5); oscillator.connect(gainNode); gainNode.connect(audioCtx.destination); oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.5); const chatLog = document.getElementById('chat-log'); if (chatLog) { chatLog.style.backgroundColor = 'rgba(156, 39, 176, 0.4)'; chatLog.style.transition = 'background-color 0s'; setTimeout(() => { chatLog.style.transition = 'background-color 0.5s ease'; chatLog.style.backgroundColor = 'transparent'; }, 150); } } catch (e) {} };
window.startSpectate = function(targetId) {
    if (!targetId || !socket) return;
    socket.emit('requestSpectate', targetId);
};

window.stopSpectating = function() {
    if (!socket) return;
    socket.emit('stopSpectate');
};
window.openPlayerContextMenu = function(targetId, e) { if (safeMapData.id === 'neutralzone') return; activeTargetPlayerId = targetId; const menu = document.getElementById('player-context-menu'); menu.style.display = 'flex'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; };
window.inspectTargetPlayer = function() { if (!activeTargetPlayerId) return; document.getElementById('player-context-menu').style.display = 'none'; const p = game.remotePlayers[activeTargetPlayerId]; if (!p) return; dom.inspect.style.display = 'block'; if (window.isMobileUI()) {
    window.enableMobileWindowControls(dom.inspect);
    window.bringWindowToFront(dom.inspect);
    window.clampWindowToViewport(dom.inspect);
} dom.inspectTitle.innerText = `Inspect: ${p.name || p.id}`; let lvl = "???"; let hp = "??? / ???"; if (game.party && game.party.members) { let pm = game.party.members.find(m => m.id === p.id); if (pm) { lvl = pm.level; hp = `${pm.currentHp} / ${pm.maxHp}`; } } let wpn = p.spriteData && p.spriteData.weapon ? p.spriteData.weapon.replace('starter', 'basic') : 'None'; let html = `<div style="font-size:14px; color:#ccc; margin-bottom:10px; text-align:center;">Level ${lvl} &nbsp; | &nbsp; HP ${hp}</div>`; html += `<div class="inspect-equip"><div style="font-weight:bold; color:#ffeb3b; margin-bottom:6px;">Weapon (Visual Cache)</div><div class="inspect-item-name" style="color:#fff;">${wpn}</div></div>`; dom.inspectContent.innerHTML = html; if(socket) socket.emit('inspectRequest', { targetId: activeTargetPlayerId }); }; 
window.inviteTargetToParty = function() { if (!activeTargetPlayerId) return; document.getElementById('player-context-menu').style.display = 'none'; if(socket) socket.emit('partyInvite', { targetId: activeTargetPlayerId }); dom.log.innerText = `Party invite sent to ${activeTargetPlayerId}.`; }; 
window.requestTrade = function() { if (!activeTargetPlayerId) return; document.getElementById('player-context-menu').style.display = 'none'; if(socket) socket.emit('tradeRequest', { targetId: activeTargetPlayerId }); dom.log.innerText = `Trade request sent to ${activeTargetPlayerId}.`; }; 
window.closeInspect = function() { dom.inspect.style.display = 'none'; };
window.leaveParty = function() { if(socket) socket.emit('leaveParty'); dom.partyPanel.style.display = 'none'; dom.partyMembers.innerHTML = ''; game.party = null; dom.log.innerText = "You left the party."; if (safeMapData.id !== 'town') { const transScreen = document.getElementById('map-transition'); document.getElementById('transition-text').innerText = `Entering town...`; transScreen.style.display = 'flex'; setTimeout(() => { transScreen.style.opacity = '1'; }, 10); game.player.teleportCooldown = 4000; setTimeout(() => { window.loadMapScript('town', () => { safeMapData = window.MapDatabase['town']; game.player.x = safeMapData.spawnX || 960; game.player.y = safeMapData.spawnY || 1000; window.preloadMapAssets(safeMapData, () => { dom.world.style.backgroundImage = `url('${safeMapData.image}')`; window.buildCollisionLayers(); window.cleanupMap(); if(socket) socket.emit('playerTeleported', { mapId: 'town', x: game.player.x, y: game.player.y, mapData: safeMapData }); window.playBGM('town'); transScreen.style.opacity = '0'; setTimeout(() => { transScreen.style.display = 'none'; }, 1000); }); }); }, 500); } };
window.respondInvite = function(accept) { document.getElementById('invite-dialog').style.display = 'none'; if (pendingPartyInvite) { if(socket) socket.emit('partyInviteResponse', { fromId: pendingPartyInvite, accept }); pendingPartyInvite = null; } }; 
window.respondTrade = function(accept) { document.getElementById('trade-dialog').style.display = 'none'; if (pendingTradeInvite) { if(socket) socket.emit('tradeInviteResponse', { fromId: pendingTradeInvite, accept }); if (accept) { tradeTarget = pendingTradeInvite; inTradeMode = true; document.getElementById('trade-target-name').innerText = tradeTarget; document.getElementById('trade-screen').style.display = 'block'; window.renderTradeSlots(); window.renderInventory(); dom.invScreen.style.display = 'block'; } else { dom.log.innerText = "Trade declined."; } pendingTradeInvite = null; } }; 
window.closeTrade = function() { inTradeMode = false; document.getElementById('trade-screen').style.display = 'none'; dom.log.innerText = "Trade cancelled."; tradeMyItems.forEach(item => { if (item) window.addLoot(item); }); tradeMyItems = [null, null, null]; document.getElementById('trade-my-gold').value = 0; tradeTheirItems = [null, null, null]; document.getElementById('trade-their-gold').innerText = "0"; window.renderInventory(); if(socket) socket.emit('tradeCancel'); }; 
window.confirmTrade = function() { if(socket) socket.emit('requestConfirmTrade'); };
window.addTradeItem = function(invIndex) { 
    if (!inTradeMode) return; 
    const item = game.player.inventory[invIndex]; 
    if (!item) return; 
    
    // 🐰 THE FIX: Allow Seasonal cosmetics/pets to bypass the trade lock!
    if (item.type === 'aura' && !item.isSeasonal && !String(item.name).includes('Easter')) { 
        dom.log.innerText = "Normal cosmetics and pets cannot be traded!"; 
        return; 
    }
    
    // 🛡️ THE FIX: Prevent adding bound gear to trade window
    if ((item.rarity === 'Godly' || item.rarity === 'Divine') && item.enhanceLevel > 0) {
        dom.log.innerText = "Enhanced Godly and Divine gear cannot be traded!"; return;
    }
    
    const emptyTradeSlot = tradeMyItems.findIndex(i => i === null); if (emptyTradeSlot === -1) { dom.log.innerText = "Trade offer full!"; return; } tradeMyItems[emptyTradeSlot] = item; game.player.inventory[invIndex] = null; window.renderInventory(); window.renderTradeSlots(); window.syncTrade(); };
window.removeFromTrade = function(tradeIndex) { if (!inTradeMode) return; const item = tradeMyItems[tradeIndex]; if (!item) return; window.addLoot(item); tradeMyItems[tradeIndex] = null; window.renderInventory(); window.renderTradeSlots(); window.syncTrade(); }; 
document.getElementById('trade-my-gold').addEventListener('input', (e) => { let val = parseInt(e.target.value) || 0; if (val > game.player.gold) { val = game.player.gold; e.target.value = val; } window.syncTrade(); }); 
window.renderTradeSlots = function() { const myGrid = document.getElementById('trade-my-items'); myGrid.innerHTML = ''; const theirGrid = document.getElementById('trade-their-items'); theirGrid.innerHTML = ''; for (let i = 0; i < 3; i++) { const mySlot = document.createElement('div'); mySlot.className = 'inv-slot'; if (tradeMyItems[i]) { mySlot.style.border = `2px solid ${tradeMyItems[i].color || '#fff'}`; mySlot.innerText = tradeMyItems[i].enhanceLevel ? `${tradeMyItems[i].name} +${tradeMyItems[i].enhanceLevel}` : tradeMyItems[i].name; mySlot.onclick = () => window.removeFromTrade(i); } else { mySlot.innerText = "Empty"; mySlot.style.color = "#555"; } myGrid.appendChild(mySlot); const theirSlot = document.createElement('div'); theirSlot.className = 'inv-slot'; if (tradeTheirItems[i]) { theirSlot.style.border = `2px solid ${tradeTheirItems[i].color || '#fff'}`; theirSlot.innerText = tradeTheirItems[i].enhanceLevel ? `${tradeTheirItems[i].name} +${tradeTheirItems[i].enhanceLevel}` : tradeTheirItems[i].name; } else { theirSlot.innerText = "Empty"; theirSlot.style.color = "#555"; } theirGrid.appendChild(theirSlot); } }; 
window.syncTrade = function() { if(socket && tradeTarget) { socket.emit('tradeSync', { gold: parseInt(document.getElementById('trade-my-gold').value) || 0, items: tradeMyItems }); } }
window.renderPartyUI = function() { if (!game.party || !Array.isArray(game.party.members) || game.party.members.length <= 1) { dom.partyPanel.style.display = 'none'; dom.partyMembers.innerHTML = ''; return; } dom.partyPanel.style.display = 'block'; let html = ''; for (const m of game.party.members) { const hpPct = (typeof m.currentHp === 'number' && typeof m.maxHp === 'number') ? Math.max(0, Math.min(100, (m.currentHp/m.maxHp)*100)) : 100; const ghostStr = m.isGhost ? ' (GHOST)' : ''; const color = m.isGhost ? '#888' : '#fff'; const barColor = m.isGhost ? '#555' : (hpPct < 30 ? '#f44336' : '#4CAF50'); html += `<div class="party-row"><div class="party-name-row"><span style="color:${color}">${m.name} (Lv.${m.level || 1})${ghostStr}</span></div><div class="party-hp-bar-bg"><div class="party-hp-bar-fill" style="width: ${hpPct}%; background: ${barColor};"></div></div></div>`; } dom.partyMembers.innerHTML = html; }

// --- PERSISTENT CHAT HELPER ---
window.addPersistentChat = function(htmlString) {
    let box = document.getElementById('persistent-chat-content');
    if (!box) return;
    let line = document.createElement('div');
    line.className = 'chat-line';
    line.innerHTML = htmlString;
    box.appendChild(line);
    if (box.childNodes.length > 50) box.removeChild(box.firstChild);
    box.parentElement.scrollTop = box.parentElement.scrollHeight;
};

const chatInputDom = document.getElementById('chat-input'); const chatContainerDom = document.getElementById('chat-input-container');
chatInputDom.addEventListener('blur', () => { isChatting = false; chatContainerDom.style.display = 'none'; });

window.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') { 
        if (dom.game.classList.contains('active')) { 
            if (isChatting) { 
                let msg = chatInputDom.value.trim(); 
                if (msg !== '' && socket) { 
                    if (window.adminMode && msg.startsWith('/a ')) { 
                        socket.emit('adminBroadcast', { text: msg.substring(3) }); 
                    } else { 
                        // 🛡️ Standard Chat (Server will automatically route this to party chat box if you are in a party!)
                        socket.emit('chatMessage', { text: msg }); 
                        window.showBubble(game.player, msg); 
                    }
                } 
                chatInputDom.value = ''; chatContainerDom.style.display = 'none'; chatInputDom.blur(); isChatting = false; 
            } else { chatContainerDom.style.display = 'block'; chatInputDom.focus(); isChatting = true; game.keys.w = false; game.keys.a = false; game.keys.s = false; game.keys.d = false; } 
        } 
    } 
    if (!isChatting && e.key.toLowerCase() === 'f') window.toggleFriends();
    if (!isChatting && e.key.toLowerCase() === 'm') window.toggleMailbox();
});

function setKeyState(e, isDown) { 
    if (typeof isChatting !== 'undefined' && isChatting) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return; 
    if (e.key === 'Tab' || e.code === 'Tab') { if (isDown) e.preventDefault(); game.keys['tab'] = isDown; return; } 
    
    const key = (e.code === 'KeyW' ? 'w' : e.code === 'KeyA' ? 'a' : e.code === 'KeyS' ? 's' : e.code === 'KeyD' ? 'd' : e.code === 'KeyZ' ? 'z' : e.code === 'KeyX' ? 'x' : e.code === 'KeyC' ? 'c' : (e.key || "").toLowerCase()); 
    
    if (isDown && key === 'b') { autoAttackMode = !autoAttackMode; if(dom.log) dom.log.innerText = `Auto-Attack: ${autoAttackMode ? 'ON' : 'OFF'}`; return; } 
    if (game.keys.hasOwnProperty(key)) game.keys[key] = isDown; 
    
    if (isDown) { 
        if (key === 'p' && typeof window.toggleStats === 'function') window.toggleStats(); 
        if (key === 'l') window.toggleLeaderboard();
        // 🛡️ INVENTORY KEY
        if (key === 'i' && typeof window.toggleInventory === 'function') window.toggleInventory(); 
        if (key === 'k' && typeof window.toggleSkillScreen === 'function') window.toggleSkillScreen(); 
        if (key === 'j' && typeof window.openShop === 'function') window.openShop(); 
        if (key === 'm' && typeof window.toggleMailbox === 'function') window.toggleMailbox(); 
        if (key === 'g' && typeof window.openGuildUI === 'function') window.openGuildUI();
        if (key === 'c' && typeof window.openRealMoneyShop === 'function') window.openRealMoneyShop();
        if (key === 'o') {
            if (window.isAdmin(game.player.name)) { 
                window.adminMode = !window.adminMode; 
                let pnl = document.getElementById('admin-panel'); if(pnl) pnl.style.display = window.adminMode ? 'block' : 'none'; 
                dom.world.classList.toggle('admin-active', window.adminMode); 
                if(dom.log) dom.log.innerText = window.adminMode ? "Admin Mode ON" : "Admin Mode OFF"; 
                if(typeof window.buildCollisionLayers === 'function') window.buildCollisionLayers(); 
            } else { 
                if(dom.log) dom.log.innerText = "null"; 
            } 
        } 
        if (key === '3') {
            if (!window.isLoading && !window.adminMode && typeof window.usePotionHotkey === 'function') window.usePotionHotkey();
        }
        if (key === '1' || key === '2') {
            if (!game.isGhost && !window.isLoading && typeof isInventoryOpen !== 'undefined' && !isInventoryOpen && typeof isSkillOpen !== 'undefined' && !isSkillOpen && !window.adminMode) {
                let slotIndex = key === '1' ? 0 : 1; let skill = game.player.activeSkills ? game.player.activeSkills[slotIndex] : null;
                if (skill && typeof skill.execute === 'function') skill.execute(); 
            }
        }
    } 
}
window.addEventListener('keydown', (e) => setKeyState(e, true), { capture: true }); window.addEventListener('keyup', (e) => setKeyState(e, false), { capture: true }); window.addEventListener('blur', () => { for (const k in game.keys) game.keys[k] = false; attackHeld = false; isChatting = false; });
window.addEventListener('blur', () => { for (const k in game.keys) game.keys[k] = false; attackHeld = false; isChatting = false; });
window.addEventListener('mousedown', (e) => { 
    if (e.target.classList.contains('ctx-btn')) return; 
    if (!e.target.closest('#inv-context-menu')) document.getElementById('inv-context-menu').style.display = 'none'; 
    if (!e.target.closest('#player-context-menu') && !e.target.closest('.entity')) document.getElementById('player-context-menu').style.display = 'none'; 
    if (isEnhancing && !e.target.closest('#inventory-screen') && !e.target.closest('#inv-context-menu')) { isEnhancing = false; dom.log.innerText = "Enhancement mode cancelled."; window.renderInventory(); } 
    if (window.isApplyingForger && !e.target.closest('#inventory-screen') && !e.target.closest('#inv-context-menu') && !e.target.closest('#forger-modal') && !e.target.closest('#consumables-craft-modal')) { window.isApplyingForger = false; dom.log.innerText = "Forger cancelled."; window.renderInventory(); }
});
document.addEventListener('wheel', function(e) { if (e.ctrlKey && !window.adminMode) { e.preventDefault(); } }, { passive: false });
window.addEventListener('pointerup', () => { attackHeld = false; });
dom.world.addEventListener('pointerdown', (e) => { if(!window.adminMode && e.target.id === 'world' && !window.isLoading) { attackHeld = true; window.attemptAttack(false); } });
// ==========================================
// RESTORED SHOP & MAILBOX FUNCTIONS
// ==========================================
window.openShop = function() {
    if (isShopping) { window.closeShop(); return; }
    isShopping = true;
    document.getElementById('shop-my-gold').innerText = game.player.gold || 0;
    document.getElementById('shop-screen').style.display = 'block';
    const shopEl = document.getElementById('shop-screen');
if (window.isMobileUI()) {
    window.enableMobileWindowControls(shopEl);
    window.bringWindowToFront(shopEl);
    window.clampWindowToViewport(shopEl);
}
    if (!isInventoryOpen && typeof window.toggleInventory === 'function') window.toggleInventory();
    window.updatePotionPrice(); window.updateStonePrice();
}
window.closeShop = function() { isShopping = false; document.getElementById('shop-screen').style.display = 'none'; if (isInventoryOpen && typeof window.renderInventory === 'function') window.renderInventory(); }
window.updatePotionPrice = function() { let qty = parseInt(document.getElementById('shop-potion-qty').value) || 1; if (qty < 1) { qty = 1; document.getElementById('shop-potion-qty').value = 1; } document.getElementById('shop-potion-buy-btn').innerText = (qty * 25) + " Gold"; }
window.updateStonePrice = function() { let lvl = parseInt(document.getElementById('shop-stone-level').value) || 10; let rarity = document.getElementById('shop-stone-rarity').value || 'Basic'; let qty = parseInt(document.getElementById('shop-stone-qty').value) || 1; if (qty < 1) { qty = 1; document.getElementById('shop-stone-qty').value = 1; } let basePrice = lvl * 15; let rMult = { "Basic": 1, "Rare": 3, "Unique": 8, "Legendary": 20, "Godly": 50 }[rarity] || 1; let totalCost = basePrice * rMult * qty; document.getElementById('shop-stone-buy-btn').innerText = totalCost + " Gold"; }
window.buyItem = function(type) {
    let qty = 1;
    let payload = { type: type };

    if (type === 'potion') {
        qty = parseInt(document.getElementById('shop-potion-qty').value) || 1;
        payload.qty = qty;
    } else if (type === 'stone') {
        qty = parseInt(document.getElementById('shop-stone-qty').value) || 1;
        payload.qty = qty;
        payload.level = parseInt(document.getElementById('shop-stone-level').value) || 10;
        payload.rarity = document.getElementById('shop-stone-rarity').value || 'Basic';
    }

    if (socket) socket.emit('requestPurchase', payload);
}
window.toggleMailbox = function() {
    isMailboxOpen = !isMailboxOpen;
    const el = document.getElementById('mailbox-screen');
    el.style.display = isMailboxOpen ? 'block' : 'none';
    if (isMailboxOpen) {
        if (socket) socket.emit('getMail');
        if (window.isMobileUI()) {
            window.enableMobileWindowControls(el);
            window.bringWindowToFront(el);
            window.clampWindowToViewport(el);
        }
    }
};
window.claimMail = function(mailId) { if (socket) socket.emit('claimMail', mailId); };
window.addRemotePlayer = function(pData) {
    if (!pData || !pData.id || pData.id === game.player.id || game.remotePlayers[pData.id]) return;
    const container = document.createElement('div'); container.className = 'entity'; container.id = 'remote_' + pData.id;
    container.style.left = (pData.x || 0) + 'px'; container.style.top = (pData.y || 0) + 'px'; container.style.zIndex = '104'; container.style.cursor = 'pointer';
    container.addEventListener('pointerdown', (e) => { 
        e.stopPropagation(); e.preventDefault(); 
        // ⚔️ NEUTRAL ZONE: Clicking a player attacks them!
        if (safeMapData.id === 'neutralzone') {
            if (!window.isLoading) {
                // 🛡️ THE FIX: Tell the game EXACTLY who we are trying to shoot before firing!
                window.activeTargetPlayerId = pData.id; 
                window.attemptAttack(false);
            }
        } else {
            // Town/Other maps: Open the menu
            window.openPlayerContextMenu(pData.id, e); 
        }
    });
    const nameTag = document.createElement('div'); nameTag.className = 'name-tag'; 
    if (window.isAdmin(pData.name || pData.id)) {
        nameTag.innerHTML = `<span style="color:#ff4444; font-weight:bold;">[GM]</span> ${pData.name || pData.id}`;
    } else {
        nameTag.innerText = pData.name || pData.id;
    }
    container.appendChild(nameTag);
   const titleTag = document.createElement('div'); titleTag.className = 'title-tag'; 
    let tHtml = (pData.spriteData && pData.spriteData.title) ? `&lt;${pData.spriteData.title}&gt;` : '';
    if (pData.spriteData && pData.spriteData.guildName) {
        tHtml += (tHtml ? '<br>' : '') + `<span style="color:#4CAF50; font-size:13px; font-weight:900; letter-spacing:1px; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 2px 4px rgba(0,0,0,0.6);">[${pData.spriteData.guildName}]</span>`;
    }
    titleTag.innerHTML = tHtml;
    container.appendChild(titleTag);
    const rig = document.createElement('div'); rig.className = 'player-avatar-container avatar-rig';
    const hair = new Image(); hair.className = 'avatar-layer layer-hair';
    const head = new Image(); head.className = 'avatar-layer layer-head'; head.src = 'animation/avatar_head.png';
    const body = new Image(); body.className = 'avatar-layer layer-body'; body.src = 'animation/avatar_idlefront.png';
    const weapon = new Image(); weapon.className = 'avatar-layer layer-weapon';
    const skin = (pData.spriteData && pData.spriteData.skin) ? pData.spriteData.skin : 'flesh';
    const hairColor = (pData.spriteData && pData.spriteData.hair) ? pData.spriteData.hair : 'black';
    const hairStyle = (pData.spriteData && pData.spriteData.style) ? pData.spriteData.style : '1';
    if (hairStyle === 'none') hair.style.display = 'none'; else { hair.style.display = 'block'; hair.src = `animation/avatar_hair${hairStyle}.png`; }
    head.style.filter = skinFilters[skin] || skinFilters['flesh']; body.style.filter = skinFilters[skin] || skinFilters['flesh']; hair.style.filter = hairFilters[hairColor] || hairFilters['black'];
    weapon.style.display = 'none';
    const cAura = document.createElement('div'); cAura.className = 'cosmetic-aura';
    if (pData.spriteData && pData.spriteData.aura) cAura.classList.add(`aura-${pData.spriteData.aura}`);
    rig.appendChild(cAura);
    hair.style.opacity = '1'; head.style.opacity = '1'; body.style.opacity = '1'; weapon.style.opacity = '1';
    rig.appendChild(hair); rig.appendChild(head); rig.appendChild(body); rig.appendChild(weapon); container.appendChild(rig); dom.world.appendChild(container);
    game.remotePlayers[pData.id] = { id: pData.id, name: pData.name || pData.id, x: pData.x || 0, y: pData.y || 0, dom: container, rig: rig, body: body, weapon: weapon, currentBodySrc: '', currentWeaponSrc: '', isGhost: !!pData.isGhost, spriteData: pData.spriteData };
    if (pData.isGhost) container.style.opacity = '0.5';
   const wpnSprite = (pData.spriteData && pData.spriteData.weapon) ? pData.spriteData.weapon : (pData.weaponSprite || null);
    if (wpnSprite) { 
        const fixedWpn = wpnSprite.replace('starter', 'basic'); 
        weapon.style.display = 'block'; 
        weapon.src = `weapon/${fixedWpn}.png`; 
        game.remotePlayers[pData.id].currentWeaponSrc = weapon.src; 
        
       // 🛡️ THE FIX: Add Aura for remote players when they first load in
        if (fixedWpn.includes('legendary')) weapon.classList.add('weapon-aura-legendary');
        if (fixedWpn.includes('godly')) weapon.classList.add('weapon-aura-godly');
        if (fixedWpn.includes('divine')) weapon.classList.add('weapon-aura-divine');
    }
    
    // 🌟 Refresh shines when someone new walks into the room!
    window.updateNameplateRanks();
};
window.removeRemotePlayer = function(id) { const p = game.remotePlayers[id]; if (p && p.dom) p.dom.remove(); delete game.remotePlayers[id]; };

// ==========================================
// 8. SOCKET LISTENERS & UPDATES
// ==========================================
if(socket) {
    socket.on('topTavernPlayers', (top3) => {
        window.topTavernPlayers = top3 || [];
        window.updateNameplateRanks();
    });

    // 🛡️ THE FIX: Global Formatter for Titles & Guilds (with White Border!)
    window.formatTitleAndGuild = function(title, guildName) {
        let tHtml = title ? `&lt;${title}&gt;` : '';
        if (guildName) {
            tHtml += (tHtml ? '<br>' : '') + `<span style="color:#4CAF50; font-size:13px; font-weight:900; letter-spacing:1px; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 2px 4px rgba(0,0,0,0.6);">[${guildName}]</span>`;
        }
        return tHtml;
    };

    socket.on('titleUnlocked', (title) => {
        if(document.getElementById('player-title-tag')) {
            let gName = game.player.spriteData ? game.player.spriteData.guildName : null;
            document.getElementById('player-title-tag').innerHTML = window.formatTitleAndGuild(title, gName);
        }
    });

    // 🛡️ THE FIX: Instantly redraws your own nameplate when joining/leaving a guild!
    socket.on('updateLocalGuildTag', (gName) => {
        if (!game.player.spriteData) game.player.spriteData = {};
        game.player.spriteData.guildName = gName;
        if(document.getElementById('player-title-tag')) {
            document.getElementById('player-title-tag').innerHTML = window.formatTitleAndGuild(game.player.spriteData.title, gName);
        }
    });
    socket.off('authSuccess'); // Kill old listeners
    socket.on('authSuccess', (userData) => {
        try {
            game.player.id = userData.character_name || "Unknown"; 
            game.player.name = userData.character_name || "Unknown"; 
            
            let myNameHtml = window.isAdmin(game.player.name) ? `<span style="color:#ff4444; font-weight:bold;">[GM]</span> ${game.player.name}` : game.player.name;
            
            if(document.getElementById('player-name-tag')) document.getElementById('player-name-tag').innerHTML = myNameHtml; 
            if(document.getElementById('ui-name-display')) document.getElementById('ui-name-display').innerHTML = myNameHtml;
            
          // 🛡️ THE FIX: Tell the client to remember the title AND Guild sent from the database!
            game.player.title = userData.title || null;
            if (!game.player.spriteData) game.player.spriteData = {};
            game.player.spriteData.title = userData.title || null;
            game.player.spriteData.guildName = userData.guild_details ? userData.guild_details.name : null;

            // 🛡️ APPLY TITLE & GUILD ON LOGIN
            if(document.getElementById('player-title-tag')) {
                document.getElementById('player-title-tag').innerHTML = window.formatTitleAndGuild(game.player.spriteData.title, game.player.spriteData.guildName);
            }

            game.player.level = userData.level || 1; 
            game.player.exp = userData.exp || 0; 
            game.player.maxExp = userData.max_exp || 200;
            game.player.gold = userData.gold || 0; 
            game.player.baseStats = (typeof userData.base_stats === 'object' && userData.base_stats !== null) ? userData.base_stats : { hp: 100, attack: 5, magic: 5, defense: 2, speed: 1, str: 10, int: 10, playerClass: null }; 
            if (game.player.baseStats.playerClass && (!CLASSES || !CLASSES[game.player.baseStats.playerClass])) { game.player.baseStats.playerClass = null; }
            game.player.inventory = Array.isArray(userData.inventory) ? userData.inventory : new Array(20).fill(null); 
            // 🛡️ THE FIX: Guarantee the client initializes all 6 equip slots on login
            const defaultEquips = { weapon: null, armor: null, leggings: null, necklace: null, ring: null, earrings: null };
            game.player.equips = Object.assign({}, defaultEquips, userData.equips || {});
            window.charData.skinColor = userData.skin_color || 'flesh'; 
            window.charData.hairColor = userData.hair_color || 'black'; 
            window.charData.hairStyle = userData.hair_style || '1'; 
            game.player.currentHp = window.getMaxHp(); 
           window.updateSkillMenu(); 
window.loadLootFilter();
if (socket) socket.emit('updateLootFilter', game.player.lootFilter);
let targetMapId = 'town'; 
            window.loadMapScript(targetMapId, () => {
                safeMapData = window.MapDatabase[targetMapId] || { id: "town", name: "Town", image: "town_map.png", spawnX: 960, spawnY: 1000, collisions: [], teleports: [], normalSpawns: [], miniBossSpawns: [], floorBossSpawns: [] };
                game.player.x = 960; game.player.y = 1000;
              window.preloadMapAssets(safeMapData, () => {
                    try {
                        dom.world.style.backgroundImage = `url('${safeMapData.image}')`;
                        game.player.dom = dom.playerContainer; 
                        
                        if (dom.playerBody) dom.playerBody.style.filter = skinFilters[window.charData.skinColor] || ''; 
                        if (dom.playerHead) dom.playerHead.style.filter = skinFilters[window.charData.skinColor] || ''; 
                        if (dom.playerHair) dom.playerHair.style.filter = hairFilters[window.charData.hairColor] || '';
                        
                        if (dom.playerContainer) dom.playerContainer.style.opacity = '1';
                        if (dom.playerBody) dom.playerBody.style.opacity = '1';
                        if (dom.playerHead) dom.playerHead.style.opacity = '1';
                        if (dom.playerHair) dom.playerHair.style.opacity = '1';

                        if (dom.playerHair) {
                            if (window.charData.hairStyle === 'none') dom.playerHair.style.display = 'none'; 
                            else { dom.playerHair.style.display = 'block'; dom.playerHair.src = `animation/avatar_hair${window.charData.hairStyle}.png`; }
                        }

                                               window.buildCollisionLayers();
                        window.updateEquipmentDisplay();
                        window.updateUI();
                        window.renderInventory();
                        window.emitVitalsIfNeeded(true);

                        if (safeMapData.id === 'town') {
                            document.querySelectorAll('.monster-container').forEach(el => el.remove());
                            game.monsters = {};
                        }
                        
                        socket.off('requestMapSync');
                        socket.on('requestMapSync', (req) => {
                            window.loadMapScript(req.mapId, () => {
                                let mapPayload = Object.assign({}, window.MapDatabase[req.mapId], { instanceId: req.instanceId });
                                socket.emit('syncMapData', mapPayload);
                            });
                        });
                    } catch (renderErr) { console.error("Render crash caught, bypassing:", renderErr); }
                    
                   // 🛡️ GUARANTEE THESE RUN EVEN IF THE UI CRASHES
                    if (document.getElementById('loading-screen')) {
                        document.getElementById('loading-screen').style.display = 'none';
                    }

                    dom.game.classList.add('active');
                    game.isRunning = true;
                    
                    // 🛡️ THE FIX: Show the chat box ONLY when the game is fully loaded!
                    const pChatBox = document.getElementById('persistent-chat-box');
                    if (pChatBox) pChatBox.style.display = 'flex';

                    // 🛡️ THE FIX: Kills any "Ghost Loops" from impatient double-clicking before starting!
                    if (currentAnimationId) cancelAnimationFrame(currentAnimationId);
                    if (typeof gameLoop !== 'undefined') currentAnimationId = requestAnimationFrame(gameLoop);

                    // 🎥 TUTORIAL CHECK: Play video OR play normal BGM
                    if (game.player.baseStats && !game.player.baseStats.watchedTutorial) {
                        window.playTutorialVideo();
                    } else {
                        // Make sure the game screen is already visible before showing Town UI + BGM
                        setTimeout(() => {
                            // 🎵 Fix: Use the router so login music is correct for Home/Guild
                    window.playBGM(window.routeMapMusic(safeMapData.id));
                            try { window.showMapAnnouncement(safeMapData.id || 'town'); } catch(e) {}
                        }, 120);
                    }

                    // 📧 🛡️ Check for mail contents immediately on login
                    socket.emit('getMail'); 
                    socket.emit('requestNews');  
                });
            });
        } catch (authErr) { console.error("Auth crash:", authErr); if(document.getElementById('loading-screen')) document.getElementById('loading-screen').style.display = 'none'; dom.game.classList.add('active'); }
    });
socket.on('mailList', (mails) => {
        const container = document.getElementById('mail-list-container'); container.innerHTML = '';
        
        const unreadCount = (mails || []).length;
        
        // 🔔 DYNAMIC NOTIFICATION BADGE
        let notifBadge = document.getElementById('global-mail-notif');
        if (!notifBadge) {
            notifBadge = document.createElement('div');
            notifBadge.id = 'global-mail-notif';
            notifBadge.style.position = 'absolute';
            notifBadge.style.top = '15px';
            notifBadge.style.right = '15px';
            notifBadge.style.background = '#f44336';
            notifBadge.style.color = 'white';
            notifBadge.style.padding = '8px 15px';
            notifBadge.style.borderRadius = '8px';
            notifBadge.style.fontWeight = 'bold';
            notifBadge.style.cursor = 'pointer';
            notifBadge.style.boxShadow = '0 0 15px #f44336';
            notifBadge.style.zIndex = '9000';
            notifBadge.onclick = window.toggleMailbox;
            document.getElementById('game-screen').appendChild(notifBadge);
        }
        
        if (unreadCount > 0) {
            notifBadge.innerText = `📧 ${unreadCount} Unread Mail!`;
            notifBadge.style.display = 'block';
        } else {
            notifBadge.style.display = 'none';
        }

        if (unreadCount === 0) { container.innerHTML = '<p style="text-align:center; color:#aaa;">Your inbox is empty.</p>'; return; }

        mails.forEach(mail => {
            const row = document.createElement('div'); row.className = 'mail-row';
            
            let itemHtml = '';
            if (mail.attached_item) {
                let itemName = typeof mail.attached_item === 'object' ? mail.attached_item.name : mail.attached_item;
                let itemQty = mail.attached_item.quantity && mail.attached_item.quantity > 1 ? `x${mail.attached_item.quantity} ` : '';
                itemHtml = `
                <div class="mail-item-preview" style="background:#222; border: 1px dashed #ffd700; padding: 10px; margin-bottom:10px; border-radius: 4px;">
                    <span style="color:#aaa; font-size:12px;">Attached Loot:</span><br>
                    <strong style="color:#ffd700; font-size:16px;">${itemQty}${itemName}</strong>
                </div>`;
            }
            
            let messageText = mail.message_text || mail.content || "System Notification";
            
            row.innerHTML = `
                <div class="mail-sender" style="color:#4CAF50; border-bottom:1px solid #444; padding-bottom:5px; margin-bottom:8px;">FROM: SYSTEM</div>
                <div class="mail-msg" style="font-size:15px; margin-bottom:15px; line-height:1.5;">${messageText}</div>
                ${itemHtml}
                <button class="claim-btn" id="claim-${mail.id}" onclick="window.claimMail(${mail.id})">
                    ${mail.attached_item ? 'CLAIM ATTACHMENT' : 'MARK AS READ'}
                </button>
            `;
            container.appendChild(row);
        });
    });
    
    socket.on('mailClaimSuccess', (mailId) => { 
        const btn = document.getElementById(`claim-${mailId}`); 
        if (btn) { btn.innerText = "CLAIMED!"; btn.disabled = true; btn.style.background = "#555"; } 
        if(dom.log) dom.log.innerText = "Mail claimed successfully!"; 
        if(typeof window.renderInventory === 'function') window.renderInventory(); 
        
        // Refresh the unread badge
        setTimeout(() => { if(socket) socket.emit('getMail'); }, 500);
    });
    socket.on('purchaseSuccess', (data) => { game.player.gold = data.newGold; game.player.inventory = data.inventory; window.updateUI(); window.renderInventory(); dom.log.innerText = "Purchase successful!"; });
    socket.on('homeBought', (newGold) => {
        game.player.gold = newGold;
        if (!game.player.baseStats) game.player.baseStats = {};
        game.player.baseStats.hasHome = true;
        
        let modal = document.getElementById('home-sale-modal');
        if (modal) modal.style.display = 'none';
        
        if (dom.log) dom.log.innerText = "🎉 Congratulations! You are now a homeowner!";
        window.updateUI();
        window.spawnDamageText(game.player.x + 24, game.player.y - 20, "HOME PURCHASED!", "#4CAF50");
        
        // Save locally to ensure immediate sync
        DatabaseManager.savePlayerData(game.player);
    });
    socket.on('sellSuccess', (data) => { game.player.gold = data.newGold; game.player.inventory = data.inventory; dom.log.innerText = `Item sold for ${data.price} Gold.`; window.updateUI(); window.renderInventory(); });
    socket.on('syncInventory', (serverInventory) => { game.player.inventory = serverInventory; window.updateEquipmentDisplay(); window.renderInventory(); });
 // 🌟 THE FIX: The Brand New Listener so your Potions actually move the red bar!
    socket.on('playerVitals', (data) => {
        if (!data) return;
        if (typeof data.currentHp === 'number') game.player.currentHp = data.currentHp;
        if (typeof data.maxHp === 'number') game.player.maxHp = data.maxHp;
        if (typeof data.level === 'number') game.player.level = data.level;
        if (typeof window.updateUI === 'function') window.updateUI();
    });

    socket.on('inventoryItemUsed', (data) => {
        if (!data) return;

        if (Array.isArray(data.inventory)) game.player.inventory = data.inventory;
        if (typeof data.currentHp === 'number') game.player.currentHp = data.currentHp;
        
        if (data.equips) {
            game.player.equips = data.equips;
            if (typeof window.updateEquipmentDisplay === 'function') window.updateEquipmentDisplay();
            if (typeof window.updateSkillMenu === 'function') window.updateSkillMenu();
        }

        if (data.classReset) {
            if (!game.player.baseStats) game.player.baseStats = {};
            game.player.baseStats.playerClass = null;
            game.player.activeSkills = [];
            if (typeof window.updateSkillMenu === 'function') window.updateSkillMenu();
            if (typeof isSkillOpen !== 'undefined' && isSkillOpen && typeof window.renderSkillScreen === 'function') window.renderSkillScreen();
            window.spawnDamageText(game.player.x + 24, game.player.y - 20, "CLASS RESET", '#ffeb3b');
            if (dom.log) dom.log.innerText = `You reset your class! Open Skills (K) to pick a new one.`;
        } else if (data.healAmount) {
            window.spawnDamageText(game.player.x + 24, game.player.y - 20, `+${data.healAmount} HP`, '#4CAF50');
            if (dom.log) dom.log.innerText = `Using ${data.itemName}...`;
        } else {
            if (dom.log) dom.log.innerText = `${data.itemName} used.`;
        }

        if (typeof window.updateUI === 'function') window.updateUI();
        if (typeof window.renderInventory === 'function') window.renderInventory();
        if (typeof window.updatePotionHotbar === 'function') window.updatePotionHotbar();
    });
    socket.on('needsCharacterCreation', (username) => { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('char-name-input').value = username; document.getElementById('creation-screen').classList.add('active'); });
    socket.on('rareLootBroadcast', (data) => { let container = document.getElementById('loot-broadcast'); if (!container) { container = document.createElement('div'); container.id = 'loot-broadcast'; container.style.position = 'fixed'; container.style.top = '25%'; container.style.left = '50%'; container.style.transform = 'translateX(-50%)'; container.style.zIndex = '2147483647'; container.style.display = 'flex'; container.style.flexDirection = 'column'; container.style.alignItems = 'center'; container.style.pointerEvents = 'none'; container.style.width = '100%'; document.body.appendChild(container); } const ann = document.createElement('div'); ann.className = 'loot-announcement'; ann.style.borderColor = data.color || '#fff'; ann.style.boxShadow = `0 0 20px ${data.color}`; // 🛡️ THE FIX: Apply Divine Sparkle to the text AND the announcement box!
    let glowClass = data.rarity === 'Divine' ? 'rarity-divine-text' : (data.rarity === 'Godly' ? 'rarity-godly' : '');
    
    if (data.rarity === 'Divine') {
        ann.style.borderColor = '#ffea00';
        ann.style.boxShadow = '0 0 30px #ffea00, inset 0 0 20px rgba(255, 152, 0, 0.8)';
    }

    // Also perfectly hides the "Lv." text if it's a material like Divine Essence
    let lvlText = data.level ? `Lv. ${data.level}` : '';
    
    ann.innerHTML = `<div style="color: #e0e0e0; font-size: 16px; margin-bottom: 5px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 4px #000;">${data.playerName} just got</div><div style="color: ${data.color}; font-size: 28px; font-weight: bold; -webkit-text-stroke: 1px black; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 15px ${data.color};" class="${glowClass}">${data.itemName} ${lvlText}</div>`; 
    container.appendChild(ann);
});
   // ==========================================
    // 📧 EMAIL UI HANDLING
    // ==========================================
    let pendingVerifyUsername = "";

    socket.on('requireEmailVerification', (username) => {
        pendingVerifyUsername = username;
        document.getElementById('loading-screen').style.display = 'none';
        
        let verifyScreen = document.getElementById('email-verify-screen');
        if (!verifyScreen) {
            verifyScreen = document.createElement('div');
            verifyScreen.id = 'email-verify-screen';
            verifyScreen.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:99999; display:flex; justify-content:center; align-items:center;';
            
            verifyScreen.innerHTML = `
                <div style="background:#111; border:2px solid #2196F3; padding:30px; border-radius:8px; box-shadow:0 0 30px #2196F3; color:white; text-align:center; width: 350px; font-family:sans-serif;">
                    <h2 style="color:#2196F3; margin-top:0;">Secure Your Account</h2>
                    <p style="font-size:13px; color:#aaa; margin-bottom:20px;">Exonie Online now requires email verification. Max 4 characters per email.</p>
                    
                    <div id="email-step-1">
                        <input type="email" id="verify-email-input" placeholder="Enter an active Email address" style="width:100%; padding:10px; margin-bottom:15px; border-radius:4px; border:1px solid #444; background:#222; color:white; box-sizing:border-box;">
                        <button class="btn" style="width:100%; background:#2196F3; padding:12px; font-weight:bold; font-size:16px;" onclick="window.sendVerificationCode()">Send Code</button>
                    </div>

                    <div id="email-step-2" style="display:none;">
                        <p style="font-size:12px; color:#4CAF50;">Code sent! Please check your inbox/spam.</p>
                        <input type="text" id="verify-code-input" placeholder="Enter 6-digit code" maxlength="6" style="width:100%; padding:10px; margin-bottom:15px; border-radius:4px; border:1px solid #444; background:#222; color:white; text-align:center; font-size:20px; letter-spacing:5px; box-sizing:border-box;">
                        <button class="btn" style="width:100%; background:#4CAF50; padding:12px; font-weight:bold; font-size:16px;" onclick="window.submitVerificationCode()">Verify & Play</button>
                    </div>
                    
                    <button class="btn" style="width:100%; background:#f44336; margin-top:10px;" onclick="location.reload()">Cancel / Back to Login</button>
                </div>
            `;
            document.body.appendChild(verifyScreen);
        }
        
        document.getElementById('email-step-1').style.display = 'block';
        document.getElementById('email-step-2').style.display = 'none';
        verifyScreen.style.display = 'flex';
    });

    window.sendVerificationCode = function() {
        const email = document.getElementById('verify-email-input').value.trim();
        if (!email || !email.includes('@')) return alert("Please enter a valid email.");
        
        socket.emit('requestEmailLink', { username: pendingVerifyUsername, email: email });
        document.getElementById('verify-email-input').disabled = true;
    };

    window.submitVerificationCode = function() {
        const code = document.getElementById('verify-code-input').value.trim();
        if (code.length !== 6) return alert("Code must be 6 digits.");
        
        socket.emit('verifyEmailCode', { username: pendingVerifyUsername, code: code });
    };

    socket.on('emailCodeSent', () => {
        document.getElementById('email-step-1').style.display = 'none';
        document.getElementById('email-step-2').style.display = 'block';
    });

    socket.on('emailError', (msg) => {
        alert(msg);
        document.getElementById('verify-email-input').disabled = false;
    });

    socket.on('emailVerifiedSuccess', (user) => {
        document.getElementById('email-verify-screen').style.display = 'none';
        alert("Email successfully linked! Welcome to Exonie. PLEASE REFRESH YOUR GAME");
        
        // Push them forward in the login pipeline
        if (!global.playerFriends) global.playerFriends = {};
        global.playerFriends[user.character_name] = new Set(user.friends || []);

        if (!user.skin_color) socket.emit('needsCharacterCreation', user.character_name);
        else socket.emit('characterSelect', user);
    });
    socket.on('authError', (msg) => {
    alert(msg);
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').classList.add('active');
});

socket.on('forcedLogout', (msg) => {
    alert(msg || 'You were logged out because this account was opened elsewhere.');
    localStorage.removeItem('exonie_user');
    localStorage.removeItem('exonie_pass');
    location.reload();
});
    socket.on('registerSuccess', (username) => { alert("Registration successful! Please log in."); window.switchAuth('login'); document.getElementById('loading-screen').style.display = 'none'; document.getElementById('auth-screen').classList.add('active'); });
    socket.on('characterSelect', (userData) => { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('select-name-display').innerText = userData.character_name; document.getElementById('select-level-display').innerText = `Level ${userData.level || 1}`; const selBody = document.getElementById('select-body'), selHead = document.getElementById('select-head'), selHair = document.getElementById('select-hair'), selWeapon = document.getElementById('select-weapon'); selBody.style.filter = skinFilters[userData.skin_color || 'flesh']; selHead.style.filter = skinFilters[userData.skin_color || 'flesh']; if (userData.hair_style === 'none' || !userData.hair_style) selHair.style.display = 'none'; else { selHair.style.display = 'block'; selHair.src = `animation/avatar_hair${userData.hair_style}.png`; selHair.style.filter = hairFilters[userData.hair_color || 'black']; } if (userData.equips?.weapon?.sprite) { selWeapon.style.display = 'block'; selWeapon.src = `weapon/${userData.equips.weapon.sprite.replace('starter', 'basic')}.png`; } else { selWeapon.style.display = 'none'; } selBody.style.opacity = '1'; selHead.style.opacity = '1'; selHair.style.opacity = '1'; selWeapon.style.opacity = '1'; document.getElementById('select-screen').classList.add('active'); game.cachedUserData = userData; });
    socket.on('mapPlayersList', (players) => { for (const id in game.remotePlayers) window.removeRemotePlayer(id); (players || []).forEach(p => window.addRemotePlayer(p)); });
    socket.on('remotePlayerJoined', (p) => window.addRemotePlayer(p));
    socket.on('remotePlayerLeft', (id) => window.removeRemotePlayer(id));
    socket.on('remotePlayerGhosted', (pid) => { 
        // 🛡️ THE FIX: If the server tells everyone we died, force the death locally just in case we lagged out!
        if (pid === game.player.id) {
            game.isGhost = true;
            game.player.currentHp = 0;
            dom.playerContainer.style.opacity = '0.5';
            
            const deathScreen = document.getElementById('death-screen');
            if (deathScreen) {
                const juiceBtn = document.getElementById('revive-juice-btn');
                if (juiceBtn) {
                    let hasJuice = game.player.inventory.some(i => i && i.name === "Revival Juice");
                    juiceBtn.style.display = hasJuice ? 'block' : 'none';
                }
                deathScreen.style.display = 'flex';
            }
            window.updateUI();
        } else {
            const rp = document.getElementById('remote_' + pid); 
            if(rp) rp.style.opacity = '0.5'; 
            if(game.remotePlayers[pid]) game.remotePlayers[pid].isGhost = true; 
        }
        window.renderPartyUI(); 
    });
    socket.on('partyError', (msg) => { dom.log.innerText = msg; });
    socket.on('partyKickedOrLeft', () => { dom.partyPanel.style.display = 'none'; dom.partyMembers.innerHTML = ''; game.party = null; dom.log.innerText = "You are no longer in a party."; });
    socket.on('chatMessage', (data) => { if (data.id === game.player.id) return; const p = game.remotePlayers[data.id]; if (p) window.showBubble(p, data.text); });
    socket.on('friendsListUpdate', (friendsList) => { const container = document.getElementById('friends-list-container'); container.innerHTML = ''; if (!friendsList || friendsList.length === 0) { container.innerHTML = '<p style="text-align:center; color:#aaa;">Your friends list is empty.</p>'; return; } friendsList.forEach(f => { const row = document.createElement('div'); row.className = 'friend-row'; let lvlColor = f.online ? '#ffd700' : '#888'; let levelHtml = `<span style="color:${lvlColor}; font-size:12px; margin-left: 5px;">(Lv.${f.level})</span>`; let classFmt = f.pClass ? `<span style="color:#aaa; font-size:11px;">${f.pClass}</span>` : `<span style="color:#555; font-size:11px;">Novice</span>`; let mapFmt = f.online ? `<span style="color:#2196F3; font-size:11px;">[${f.mapId || 'Town'}]</span>` : ''; let spectateBtn = (window.isAdmin(game.player.name) && f.online) ? `<button class="dm-btn" style="background:#f44336; margin-bottom:5px;" onclick="window.startSpectate('${f.id}')">👁️ Spectate</button>` : ''; row.innerHTML = `<div class="friend-info" style="flex-direction:column; align-items:flex-start; gap:2px;"><div style="display:flex; align-items:center; gap:5px;"><div class="status-dot ${f.online ? 'online' : 'offline'}"></div>${f.id} ${levelHtml}</div><div style="margin-left: 17px; display:flex; gap: 8px;">${classFmt} ${mapFmt}</div></div><div style="display:flex; flex-direction:column;">${spectateBtn}<button class="dm-btn" onclick="window.promptDM('${f.id}')">DM</button></div>`; container.appendChild(row); }); });
    socket.on('receiveDM', (data) => { 
        let formatted = `<span style="color:#E040FB;">[DM] ${data.from}: ${data.message}</span>`;
        window.addPersistentChat(formatted); dom.log.innerHTML = formatted; 
        if (!data.from.startsWith('To ')) window.playDMSound(); 
    });
    
    socket.on('systemMessage', (msg) => { 
        let formatted = `<span style="color:#ffeb3b;">[System] ${msg}</span>`;
        window.addPersistentChat(formatted); dom.log.innerHTML = formatted; 
    });

    socket.on('partyChatMessage', (data) => {
        window.addPersistentChat(`<span style="color:#00E5FF; font-weight:bold;">[Party] ${data.from}: ${data.text}</span>`);
    });
socket.on('partyItemLink', (data) => {
        let color = window.RARITY_COLORS[data.item.rarity] || '#fff';
        let enhanceStr = data.item.enhanceLevel ? ` +${data.item.enhanceLevel}` : '';
        let name = data.item.name + enhanceStr;
        
        // Safely encode the JSON so it can be passed into the onclick function via HTML
        let safeItemJson = encodeURIComponent(JSON.stringify(data.item));
        
        let html = `<span style="color:#00E5FF; font-weight:bold;">[Party] ${data.from} linked: </span><span style="color:${color}; font-weight:bold; cursor:pointer; text-decoration:underline; text-shadow: 0 0 5px ${color};" onclick="window.showLinkedItem('${safeItemJson}')">[${name}]</span>`;
        
        window.addPersistentChat(html);
        if (dom.log) dom.log.innerHTML = html;
    });
socket.on('forceTeleport', (tp) => {
    game.player.teleportCooldown = 2000; 
    game.player.isTeleporting = false;
    // 🛡️ THE FIX: This string locks the portal under their feet until they walk away!
    game.player.currentPortal = 'JUST_SPAWNED'; 
    window.isDungeonUIOpen = false;
    if (document.getElementById('dungeon-timer-ui')) document.getElementById('dungeon-timer-ui').style.display = 'none';

    window.loadMapScript(tp.mapId, () => {
        safeMapData = window.MapDatabase[tp.mapId];
        safeMapData.id = tp.mapId;

        // 🛡️ THE FIX: We MUST preload the new map assets so the images download and the loading screen hides!
        window.preloadMapAssets(safeMapData, () => {
            if (tp.mapId === 'town' && safeMapData.teleports && !tp.spectateTarget) {
                const p1 = safeMapData.teleports.find(p => p.portalId === 1);
                if (p1) {
                    game.player.x = p1.x + (p1.w / 2) - (game.player.width / 2);
                    game.player.y = p1.y + p1.h - game.player.height + 5;
                } else {
                    game.player.x = tp.x;
                    game.player.y = tp.y;
                }
            } else {
                game.player.x = tp.x;
                game.player.y = tp.y;
            }

            window.cleanupMap();
            dom.world.style.backgroundImage = `url('${safeMapData.image}')`;
            window.buildCollisionLayers();
// 🎵 DYNAMIC MUSIC SELECTOR: Routes music based on map type
let nextTrack = 'town'; // Default
let mId = String(tp.mapId || tp.targetMapId || 'town').toLowerCase();

if (mId === 'trainingtavern' || mId === 'hauntedhouse' || mId.includes('dungeon')) {
    nextTrack = 'bossfight';
} else if (mId.includes('floor')) {
    nextTrack = 'floors';
} else if (mId.includes('home')) {
    nextTrack = 'home'; // 🏠 Plays music/home.mp3
} else if (mId === 'guildbase') {
    nextTrack = 'guild'; // 🏰 Plays music/guild.mp3
}

// 🎵 Update Music using the new Router
            window.playBGM(window.routeMapMusic(tp.mapId));
            window.showMapAnnouncement(tp.mapId);

            if (tp.spectateTarget) {
                // ✅ Enter spectate mode
                window.isSpectating = true;
                window.spectateTargetId = tp.spectateTarget;
                game.isGhost = true; 
                dom.playerContainer.style.display = 'none';
                document.getElementById('spectate-ui').style.display = 'block';
                if(dom.log) dom.log.innerText = `[ADMIN] Now Spectating: ${tp.spectateTarget}`;
            } else {
                // ✅ Standard Teleport
                window.isSpectating = false;
                window.spectateTargetId = null;
                game.isGhost = false;
                dom.playerContainer.style.display = 'block';
                document.getElementById('spectate-ui').style.display = 'none';
                dom.playerContainer.style.opacity = '1';

                socket.emit('playerMoved', {
                    x: game.player.x,
                    y: game.player.y,
                    state: 'idle',
                    facingRight: window.facingRight,
                    weaponSprite: game.player.equips.weapon?.sprite || null
                });

                socket.emit('playerTeleported', {
                    mapId: tp.mapId,
                    x: game.player.x,
                    y: game.player.y,
                    mapData: safeMapData
                });
            }

            // 🛡️ CRITICAL FIX: Ensure the loading screen explicitly disappears once the map is ready!
            const ls = document.getElementById('loading-screen');
            if (ls) ls.style.display = 'none';
            window.isLoading = false;
        });
    });
});
    socket.on('teleportApproved', (tp) => { 
        let nextMapId = tp.targetMapId || 'town'; 
        
        // 🏰 NEW: Dungeon 1 Group Entry Logic
        if (nextMapId === 'dungeon1') {
            game.player.currentPortal = null;
            window.isDungeonUIOpen = true;
            game.keys.w = false; game.keys.a = false; game.keys.s = false; game.keys.d = false;

            // 📅 Sync Dungeon UI Reset Check dynamically before showing entries
            const now = new Date();
            let dayOfWeek = now.getUTCDay();
            let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
            
            let lastMonday = new Date(now.getTime());
            lastMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
            lastMonday.setUTCHours(0, 0, 0, 0);
            const lastMondayTs = lastMonday.getTime();

            if (!game.player.baseStats) game.player.baseStats = {};
            if (!game.player.baseStats.dungeonReset || game.player.baseStats.dungeonReset < lastMondayTs) {
                game.player.baseStats.dungeonEntries = 7;
                game.player.baseStats.dungeonReset = Date.now();
            }

            if (game.party && game.party.members && game.party.members.length > 1) {
                if (game.party.leaderId === game.player.id) {
                    document.getElementById('dungeon-entries-text').innerText = `Weekly Entries: ${game.player.baseStats.dungeonEntries}/7`;
                    document.getElementById('dungeon-screen').style.display = 'flex';
                } else {
                    document.getElementById('loading-text').innerText = "Waiting for Party Leader to select difficulty...";
                    document.getElementById('loading-screen').style.display = 'flex';
                }
            } else {
                document.getElementById('dungeon-entries-text').innerText = `Weekly Entries: ${game.player.baseStats.dungeonEntries}/7`;
                document.getElementById('dungeon-screen').style.display = 'flex';
            }
            return; // Stop standard teleport
        }

        const transScreen = document.getElementById('map-transition'); 
        document.getElementById('transition-text').innerText = `Entering ${nextMapId}...`; 
        transScreen.style.display = 'flex'; 
        setTimeout(() => { transScreen.style.opacity = '1'; }, 10); 
        game.player.teleportCooldown = 4000; 
        
        setTimeout(() => { 
            window.loadMapScript(nextMapId, () => { 
                safeMapData = window.MapDatabase[nextMapId]; 
                safeMapData.id = nextMapId; // 🛡️ CRITICAL FIX: FORCES MAP ID TO UPDATE SO MONSTERS RENDER!
                
                let targetId;
                // 🛡️ THE FIX: Skip pairing math if this is a fast-travel Maze Guide jump!
                if (tp.exactTarget) {
                    targetId = tp.portalId;
                } else if (typeof tp.portalId === 'number') {
                    targetId = tp.portalId % 2 === 1 ? tp.portalId + 1 : tp.portalId - 1; 
                } else {
                    let code = String(tp.portalId).charCodeAt(0);
                    let targetCode = code % 2 === 1 ? code + 1 : code - 1;
                    targetId = String.fromCharCode(targetCode);
                }
                let targetPortal = safeMapData.teleports.find(p => p.portalId === targetId);
                
                window.preloadMapAssets(safeMapData, () => { 
                    game.player.x = targetPortal ? (targetPortal.x + (targetPortal.w / 2) - (game.player.width / 2)) : safeMapData.spawnX; 
                    game.player.y = targetPortal ? (targetPortal.y + targetPortal.h - game.player.height + 5) : safeMapData.spawnY; 
                    dom.world.style.backgroundImage = `url('${safeMapData.image}')`; 
                    window.buildCollisionLayers(); 
                    window.cleanupMap(); 
                    
                    if(socket) socket.emit('playerTeleported', { mapId: nextMapId, x: game.player.x, y: game.player.y, mapData: safeMapData }); 
                    window.playBGM(window.routeMapMusic(nextMapId));
                    window.showMapAnnouncement(nextMapId);
                    
                    transScreen.style.opacity = '0'; 
                    setTimeout(() => { transScreen.style.display = 'none'; }, 1000); 
                }); 
            }); 
        }, 500); 
    });
    socket.on('remotePlayerMoved', (data) => { if (!game.remotePlayers[data.id]) window.addRemotePlayer({ id: data.id, name: data.id, x: data.x, y: data.y, spriteData: {} }); const p = game.remotePlayers[data.id]; if (!p) return; p.x = data.x; p.y = data.y; p.dom.style.left = p.x + 'px'; p.dom.style.top = p.y + 'px'; p.rig.style.transform = data.facingRight ? 'scaleX(-1)' : 'scaleX(1)'; let pulseActive = (Math.floor(Date.now() / 250) % 2 === 0); let bodySrc = 'animation/avatar_idlefront.png'; let isAtk = false; if (data.state === 'attack') { bodySrc = 'animation/avatar_attack.png'; isAtk = true; } else if (data.state === 'walk') { bodySrc = pulseActive ? 'animation/avatar_walk.png' : 'animation/avatar_idlefront.png'; } if (p.currentBodySrc !== bodySrc) { p.body.src = bodySrc; p.currentBodySrc = bodySrc; } if (data.weaponSprite) { 
            p.weapon.style.display = 'block'; 
            let fixedWpn = data.weaponSprite.replace('starter', 'basic'); 
            let wpnSrc = `weapon/${fixedWpn}${(data.state === 'attack' && isAtk && !fixedWpn.includes('pendant')) ? '_attack' : ''}.png`; 
            if (p.currentWeaponSrc !== wpnSrc) { p.weapon.src = wpnSrc; p.currentWeaponSrc = wpnSrc; } 
            if (!p.spriteData) p.spriteData = {}; p.spriteData.weapon = fixedWpn; 
// 🛡️ THE FIX: Update Aura dynamically when remote players swap weapons
            p.weapon.classList.remove('weapon-aura-legendary', 'weapon-aura-godly', 'weapon-aura-divine');
            if (fixedWpn.includes('legendary')) p.weapon.classList.add('weapon-aura-legendary');
            if (fixedWpn.includes('godly')) p.weapon.classList.add('weapon-aura-godly');
            if (fixedWpn.includes('divine')) p.weapon.classList.add('weapon-aura-divine');

        } else { 
            p.weapon.style.display = 'none'; p.currentWeaponSrc = ''; 
            if (p.spriteData) p.spriteData.weapon = null; 
            p.weapon.classList.remove('weapon-aura-legendary', 'weapon-aura-godly');
       } const cAuraEl = p.rig.querySelector('.cosmetic-aura'); if (cAuraEl) cAuraEl.className = data.spriteData?.aura ? `cosmetic-aura aura-${data.spriteData.aura}` : 'cosmetic-aura'; const titleEl = p.dom.querySelector('.title-tag');
        if (titleEl) {
            let tHtml = data.spriteData?.title ? `&lt;${data.spriteData.title}&gt;` : '';
            if (data.spriteData?.guildName) {
                tHtml += (tHtml ? '<br>' : '') + `<span style="color:#4CAF50; font-size:13px; font-weight:900; letter-spacing:1px; text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff, 0 2px 4px rgba(0,0,0,0.6);">[${data.spriteData.guildName}]</span>`;
            }
            titleEl.innerHTML = tHtml;
        }
        });
    socket.on('inspectData', (data) => { 
        if (!data) return; 
        dom.inspect.style.display = 'block'; 
        dom.inspectTitle.innerText = `Inspect: ${data.name || data.id || "Unknown"}`; 
        const equips = data.equips || {}; 
        
        // 🛡️ THE FIX: Added Necklace, Ring, and Earrings to the Inspect Window!
        const slots = [ 
            { key: 'weapon', label: 'Weapon' }, 
            { key: 'armor', label: 'Armor' }, 
            { key: 'leggings', label: 'Leggings' },
            { key: 'necklace', label: 'Necklace' },
            { key: 'ring', label: 'Ring' },
            { key: 'earrings', label: 'Earrings' }
        ]; 
        
        function fmtStatBlock(item) { 
            if (!item) return `<div class="inspect-empty">None</div>`; 
            const rarityColor = item.color || (window.RARITY_COLORS[item.rarity] || "#fff"); 
            const nameClass = item.rarity === "Godly" ? "rarity-godly" : (item.rarity === "Divine" ? "rarity-divine-text" : "");
            const displayName = item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name; 
            let html = `<div class="inspect-title"><div class="inspect-item-name ${nameClass}" style="color:${rarityColor};">${displayName}</div><div class="inspect-sub">Lv.${item.level || 1} ${item.rarity || "Unknown"}</div></div><div class="inspect-stat">`; 

            // 💎 THE FIX: Visual indicator for Inspect Menu
            if (['necklace', 'ring', 'earrings'].includes(item.type)) {
                let maxGems = { "Basic": 1, "Rare": 1, "Unique": 2, "Legendary": 3, "Godly": 4, "Divine": 5 }[item.rarity] || 0;
                if (maxGems > 0) {
                    let count = item.gemCount || 0;
                    let sockets = "";
                    for(let i = 0; i < maxGems; i++) {
                        sockets += (i < count) ? "♦" : "♢";
                    }
                    html += `<div style="color:#00ffff; font-size:13px; margin-bottom:4px; letter-spacing:2px;">Sockets: ${sockets}</div>`;
                }
            }

            if (item.fixedStat) { for (const k in item.fixedStat) html += `<div><b>Fixed:</b> +${item.fixedStat[k]} ${k.toUpperCase()}</div>`; }
            if (item.randomStat) { for (const k in item.randomStat) html += `<div><b>Random:</b> +${item.randomStat[k]} ${k.toUpperCase()}</div>`; } 
            if (item.sprite) { html += `<div style="color:#888; margin-top:6px;">Sprite: ${item.sprite}.png</div>`; } 
            html += `</div>`; return html; 
        } 
        
        let out = `<div style="font-size:14px; color:#ccc; margin-bottom:10px; text-align:center;">Level ${data.level || 1} &nbsp; | &nbsp; HP ${data.currentHp ?? "?"} / ${data.maxHp ?? "?"}</div>`; 
        
        slots.forEach(s => { 
            out += `<div class="inspect-equip"><div style="font-weight:bold; color:#ffeb3b; margin-bottom:6px;">${s.label}</div>${fmtStatBlock(equips[s.key])}</div>`; 
        }); 
        
        dom.inspectContent.innerHTML = out; 
    });
    socket.on('partyInviteReceived', (payload) => { pendingPartyInvite = payload?.fromId || "Unknown"; document.getElementById('invite-text').innerText = `${pendingPartyInvite} invited you to a party.`; document.getElementById('invite-dialog').style.display = 'block'; });
    socket.on('tradeInviteReceived', (payload) => { pendingTradeInvite = payload?.fromId || "Unknown"; document.getElementById('trade-text').innerText = `${pendingTradeInvite} wants to trade.`; document.getElementById('trade-dialog').style.display = 'block'; });
      socket.on('tradeStarted', (data) => {
    tradeTarget = data.targetId;
    inTradeMode = true;
    tradeMyItems = [null, null, null];
    tradeTheirItems = [null, null, null];

    document.getElementById('trade-target-name').innerText = tradeTarget;
    document.getElementById('trade-screen').style.display = 'block';
    const tradeEl = document.getElementById('trade-screen');
if (window.isMobileUI()) {
    window.enableMobileWindowControls(tradeEl);
    window.bringWindowToFront(tradeEl);
    window.clampWindowToViewport(tradeEl);
}
    document.getElementById('trade-my-gold').value = 0;
    document.getElementById('trade-their-gold').innerText = '0';

    const btn = document.getElementById('trade-confirm-btn');
    if (btn) {
        btn.innerText = 'Confirm Trade';
        btn.disabled = false;
        btn.style.background = '#2196F3';
        btn.style.borderColor = '#2196F3';
    }

    window.renderTradeSlots();
    window.renderInventory();
    dom.invScreen.style.display = 'block';
});
        socket.on('tradeSyncReceived', (data) => {
        document.getElementById('trade-their-gold').innerText = data.gold || 0;
        tradeTheirItems = Array.isArray(data.items) ? data.items : [null, null, null];
        window.renderTradeSlots();
    });
socket.on('tradeConfirmStatus', (data) => {
    const btn = document.getElementById('trade-confirm-btn');
    if (!btn) return;

    if (data.meConfirmed && data.otherConfirmed) {
        btn.innerText = 'Trading...';
        btn.disabled = true;
        btn.style.background = '#555';
        btn.style.borderColor = '#555';
        return;
    }

    if (data.meConfirmed) {
        btn.innerText = 'Confirmed - Waiting...';
        btn.disabled = true;
        btn.style.background = '#4CAF50';
        btn.style.borderColor = '#4CAF50';
    } else {
        btn.innerText = 'Confirm Trade';
        btn.disabled = false;
        btn.style.background = '#2196F3';
        btn.style.borderColor = '#2196F3';
    }
});

socket.on('tradeDone', (data) => {
    inTradeMode = false;
    tradeTarget = null;
    tradeMyItems = [null, null, null];
    tradeTheirItems = [null, null, null];

    game.player.gold = data.newGold || 0;
    game.player.inventory = Array.isArray(data.newInventory) ? data.newInventory : game.player.inventory;

    document.getElementById('trade-my-gold').value = 0;
    document.getElementById('trade-their-gold').innerText = '0';
    document.getElementById('trade-screen').style.display = 'none';

    const btn = document.getElementById('trade-confirm-btn');
    if (btn) {
        btn.innerText = 'Confirm Trade';
        btn.disabled = false;
        btn.style.background = '#2196F3';
        btn.style.borderColor = '#2196F3';
    }

    window.renderTradeSlots();
    window.renderInventory();
    window.updateUI();
    dom.log.innerText = 'Trade completed.';
});
   socket.on('tradeCancelled', () => {
    inTradeMode = false;
    tradeTarget = null;
    document.getElementById('trade-screen').style.display = 'none';
    dom.log.innerText = "The other player cancelled the trade.";

    tradeMyItems.forEach(item => { if (item) window.addLoot(item); });
    tradeMyItems = [null, null, null];
    tradeTheirItems = [null, null, null];

    document.getElementById('trade-my-gold').value = 0;
    document.getElementById('trade-their-gold').innerText = "0";

    const btn = document.getElementById('trade-confirm-btn');
    if (btn) {
        btn.innerText = 'Confirm Trade';
        btn.disabled = false;
        btn.style.background = '#2196F3';
        btn.style.borderColor = '#2196F3';
    }

    window.renderInventory();
    window.renderTradeSlots();
});
    socket.on('partyUpdate', (partyData) => { game.party = partyData || null; window.renderPartyUI(); });
   window.justLeveledUp = false;

    socket.on('receiveExp', (data) => { 
        // 🛡️ THE UI DESYNC FIX: If the server just forced a level up, the exact leftover EXP is already calculated perfectly.
        // We skip adding data.amount so the UI bar doesn't "double dip" and overfill visually!
        if (window.justLeveledUp) {
            window.justLeveledUp = false; // Consume the flag
        } else {
            game.player.exp += data.amount; 
        }
        
        if(data.gold) game.player.gold += data.gold; 
        dom.log.innerText = `Gained ${data.amount} EXP${data.gold ? ` & ${data.gold} Gold` : ''} from ${data.source}!`; 
        window.updateUI(); 
    });

    socket.on('serverLevelUp', (data) => {
        window.justLeveledUp = true; // 🛡️ Tell receiveExp to ignore its addition
        
        game.player.level = data.level;
        game.player.exp = data.exp;
        game.player.maxExp = data.maxExp;
        game.player.baseStats = data.baseStats;
        game.player.currentHp = data.currentHp;
        
        const txt = document.createElement('div'); 
        txt.className = 'level-up-text'; 
        txt.innerText = "LEVEL UP!"; 
        txt.style.left = (game.player.x - 20) + 'px'; 
        txt.style.top = (game.player.y - 40) + 'px'; 
        dom.world.appendChild(txt); 
        setTimeout(() => txt.remove(), 2000);
        
        window.updateUI(); 
        window.updateSkillMenu();
    });
    socket.on('partyMemberVitals', (data) => { if (game.party && game.party.members) { let m = game.party.members.find(x => x.id === data.id); if (m) { m.currentHp = data.currentHp; m.maxHp = data.maxHp; m.level = data.level; window.renderPartyUI(); } } });
    socket.on('remotePetSync', (data) => { 
        let petId = `pet_${data.ownerId}_${data.petData.id}`; 
        let petEl = document.getElementById(petId); 
        if (data.petData.alive) { 
            if (!petEl) { 
                petEl = document.createElement('div'); 
                petEl.id = petId; 
                petEl.className = 'pet-slime'; 
                petEl.innerHTML = '<div class="pet-hp-bar"><div class="pet-hp-fill" style="width:100%"></div></div>'; 
                
                // 🌟 BIG BOSS REMOTE SYNC STYLING
                if (data.petData.isBigBoss) {
                    petEl.style.width = '100px';
                    petEl.style.height = '100px';
                    petEl.style.backgroundColor = '#ffffff';
                    petEl.style.border = '3px solid #ccc';
                    petEl.style.borderRadius = '50% 50% 40% 40%';
                    petEl.style.boxShadow = '0 0 20px #ffffff';
                }
                
                dom.world.appendChild(petEl); 
            } 
            petEl.style.left = data.petData.x + 'px'; 
            petEl.style.top = data.petData.y + 'px'; 
        } else if (petEl) { 
            petEl.remove(); 
        } 
    });
socket.on('playerRevived', (data) => {
    if (!data) return;

    if (data.id === game.player.id) {
        game.isGhost = false;
        game.player.currentHp = data.currentHp || window.getMaxHp();
        game.player.currentPortal = null;
        game.player.portalEntryTime = null;
        game.player.isTeleporting = false;

        if (dom.playerContainer) dom.playerContainer.style.opacity = '1';

        const deathScreen = document.getElementById('death-screen');
        if (deathScreen) deathScreen.style.display = 'none';

        const portalUI = document.getElementById('portal-timer-ui');
        if (portalUI) portalUI.style.display = 'none';

        window.spawnDamageText(game.player.x + 24, game.player.y, "REVIVED", "#4CAF50");
    } else if (game.remotePlayers[data.id]) {
        game.remotePlayers[data.id].isGhost = false;
        game.remotePlayers[data.id].dom.style.opacity = '1';
        window.spawnDamageText(
            game.remotePlayers[data.id].x + 24,
            game.remotePlayers[data.id].y,
            "REVIVED",
            "#4CAF50"
        );
    }

    window.updateUI();
    window.renderPartyUI();
});

socket.on('revivalJuiceUsed', (data) => {
    if (!data) return;

    if (Array.isArray(data.inventory)) {
        game.player.inventory = data.inventory;
    }

    game.isGhost = false;
    game.player.currentHp = data.currentHp || window.getMaxHp();
    game.player.currentPortal = null;
    game.player.portalEntryTime = null;
    game.player.isTeleporting = false;

    if (dom.playerContainer) dom.playerContainer.style.opacity = '1';

    const deathScreen = document.getElementById('death-screen');
    if (deathScreen) deathScreen.style.display = 'none';

    const portalUI = document.getElementById('portal-timer-ui');
    if (portalUI) portalUI.style.display = 'none';

 window.spawnDamageText(game.player.x + 24, game.player.y, "REVIVED", "#ffeb3b");
        dom.log.innerText = "You drank the Revival Juice and came back to life!";

        window.updateUI();
        window.renderInventory();
        window.emitVitalsIfNeeded(true);

        if (socket) {
        socket.emit('playerMoved', {
            x: game.player.x,
            y: game.player.y,
            state: 'idle',
            facingRight: window.facingRight,
            weaponSprite: game.player.equips?.weapon?.sprite || null
        });
    }
});
    socket.on('playerHealed', (data) => { const target = (data.id === game.player.id) ? game.player : game.remotePlayers[data.id]; if (target) { if (data.id === game.player.id) game.player.currentHp = data.currentHp; window.spawnDamageText(target.x + 24, target.y - 10, `+${data.amount}`, '#4CAF50'); } window.updateUI(); window.renderPartyUI(); });
    socket.on('remoteSkillEffect', (data) => { 
        const p = game.remotePlayers[data.playerId]; 
        if (p) { 
            const aura = p.dom.querySelector('.aura') || document.createElement('div'); 
            aura.className = `aura aura-${data.auraColor}`; 
            if (!p.dom.querySelector('.aura')) p.dom.querySelector('.player-avatar-container').prepend(aura); 
            aura.style.animation = 'none'; 
            void aura.offsetWidth; 
            aura.style.animation = 'aura-burst 0.6s ease-out forwards'; 

            // 🌟 THE FIX: Play remote player's weapon SFX and show floating text
            if (typeof window.playSFX === 'function') window.playSFX(data.weaponSprite);
            if (data.skillName && typeof window.spawnSkillText === 'function') {
                window.spawnSkillText(p.x + 24, p.y - 20, data.skillName, '#00E5FF');
            }
        } 
    });
    
    socket.on('monsterState', (monsters) => {
        if (!Array.isArray(monsters) || safeMapData.id === 'town') return; 
        const currentIds = new Set();
        monsters.forEach(m => {
            currentIds.add(m.id); let mEl = document.getElementById('mob_' + m.id);
            if (!mEl) {
                mEl = document.createElement('div'); mEl.id = 'mob_' + m.id; mEl.className = 'entity monster-container'; mEl.style.position = 'absolute'; mEl.style.cursor = 'crosshair'; mEl.style.zIndex = '50'; mEl.style.display = 'flex'; mEl.style.justifyContent = 'center'; mEl.style.alignItems = 'flex-end';
                
             // 🎨 BUILD THE HTML FOR OUR CUSTOM CSS MONSTERS
                let spriteHtml = '';
                if (m.monsterKey.includes('golem')) {
                    spriteHtml = `<div class="monster-sprite-layer golem-base"><div class="g-head"><div class="g-eye"></div><div class="g-eye"></div></div><div class="g-arm-l"></div><div class="g-arm-r"></div><div class="g-leg-l"></div><div class="g-leg-r"></div></div>`;
                } else if (m.monsterKey.includes('wraith')) {
                    spriteHtml = `<div class="monster-sprite-layer wraith-base"><div class="w-eye left"></div><div class="w-eye right"></div><div class="w-particles"><div class="w-p"></div><div class="w-p"></div><div class="w-p"></div><div class="w-p"></div></div></div>`;
                } else if (m.monsterKey.includes('minotaur')) {
                    // 🐂 MINOTAUR: Exact Golem body, but with horns and an axe
                    spriteHtml = `<div class="monster-sprite-layer minotaur-base">
                        <div class="m-head">
                            <div class="m-horn-l"></div><div class="m-horn-r"></div>
                            <div class="m-eye-l"></div><div class="m-eye-r"></div>
                            <div class="m-snout"><div class="m-ring"></div></div>
                        </div>
                        <div class="m-body"></div>
                        <div class="m-arm-l"><div class="m-axe"></div></div>
                        <div class="m-arm-r"></div>
                        <div class="m-leg-l"></div><div class="m-leg-r"></div>
                    </div>`;
              } else if (m.monsterKey.includes('dragon')) {
                    // 🐉 DRAGON: Bulletproof Geometric Skeleton (Native CSS)
                    spriteHtml = `<div class="monster-sprite-layer dragon-base">
                        <div class="d-wing-l"></div><div class="d-wing-r"></div>
                        <div class="d-body"></div>
                        <div class="d-chest"></div>
                        <div class="d-head">
                            <div class="d-horn-l"></div><div class="d-horn-r"></div>
                            <div class="d-eye-l"></div><div class="d-eye-r"></div>
                            <div class="d-snout"></div>
                        </div>
                        <div class="d-foot-l"></div><div class="d-foot-r"></div>
                    </div>`;
                } else {
                    spriteHtml = `<div class="monster-sprite-layer" style="width:100%; height:100%; background-size:contain; background-repeat:no-repeat; background-position:bottom;"></div>`;
                }
                
                mEl.innerHTML = `<div class="name-tag mob-name">${m.name} Lv.${m.level || 5}</div>${spriteHtml}<div class="monster-ui-layer" style="position:absolute; top:-20px; left:0; width:100%; pointer-events:none;"><div class="bar-container" style="height:5px; border-radius:0; margin-bottom:0;"><div class="hp-fill monster-hp-fill" style="background-color:#f44336; height:100%; width:100%;"></div></div></div>`;
                mEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); if(!window.isLoading){ window.attemptAttackTarget = m.id; window.attemptAttack(false); } });
                dom.world.appendChild(mEl);
            }
            game.monsters[m.id] = m;
            if (!m.alive) { mEl.style.display = 'none'; } else {
                mEl.style.display = 'flex'; mEl.style.left = m.x + 'px'; mEl.style.top = m.y + 'px'; mEl.style.width = (m.width || 40) + 'px'; mEl.style.height = (m.height || 40) + 'px';
                const hpBarFill = mEl.querySelector('.monster-hp-fill'); if(hpBarFill) hpBarFill.style.width = (m.currentHp / Math.max(1, m.maxHp)) * 100 + '%';
                const spriteLayer = mEl.querySelector('.monster-sprite-layer'); 
                mEl.style.setProperty('--mob-color', m.cssColor || '#9c27b0'); 
                mEl.style.setProperty('--mob-border', m.cssBorder || '#4E342E');
                
                // 🛡️ THE DEFINER: This injects the exact category (e.g. 'mini_boss') into the CSS class!
                let safeCategory = m.category || 'common_mobs';
                
                if (m.monsterKey.includes('golem')) {
                    spriteLayer.className = safeCategory === 'floor_boss' ? `monster-sprite-layer golem-base boss ${safeCategory}` : `monster-sprite-layer golem-base ${safeCategory}`;
                } else if (m.monsterKey.includes('wraith')) {
                    spriteLayer.className = `monster-sprite-layer wraith-base ${safeCategory}`;
                } else if (m.monsterKey.includes('minotaur')) {
                    // Passes the category (e.g., mini_boss) directly into the class for color changing
                    spriteLayer.className = `monster-sprite-layer minotaur-base ${m.category}`;
                } else if (m.monsterKey.includes('dragon')) {
                    // Passes the category directly into the class for color changing
                    spriteLayer.className = `monster-sprite-layer dragon-base ${m.category}`;
                } else if (m.monsterKey.includes('2')) {
                    spriteLayer.className = 'monster-sprite-layer bat-sprite'; spriteLayer.style.background = m.cssColor; spriteLayer.style.border = 'none'; spriteLayer.style.animation = 'none'; 
                } else if (m.monsterKey.includes('3')) { 
                    spriteLayer.className = 'monster-sprite-layer fire-sprite'; spriteLayer.style.background = m.cssColor; spriteLayer.style.border = 'none'; spriteLayer.style.animation = 'none'; 
                } else if (m.monsterKey.includes('1') || m.monsterKey.includes('common_mobs') || m.monsterKey.includes('mini_boss') || m.monsterKey.includes('floor_boss')) { 
                    spriteLayer.className = 'monster-sprite-layer'; spriteLayer.style.backgroundImage = 'none'; spriteLayer.style.backgroundColor = m.cssColor || '#ff69b4'; spriteLayer.style.border = `2px solid ${m.cssBorder || '#c71585'}`; spriteLayer.style.borderRadius = '50% 50% 40% 40%'; spriteLayer.style.animation = 'slime-bounce 0.5s infinite alternate'; 
                } else { 
                    spriteLayer.className = 'monster-sprite-layer'; spriteLayer.style.backgroundColor = 'transparent'; spriteLayer.style.border = 'none'; spriteLayer.style.borderRadius = '0'; spriteLayer.style.backgroundImage = `url('monsters/${m.monsterKey}.png')`; spriteLayer.style.animation = 'none'; 
                }
            } 
        });
        Object.keys(game.monsters).forEach(id => { if (!currentIds.has(id)) { let staleEl = document.getElementById('mob_' + id); if (staleEl) staleEl.remove(); delete game.monsters[id]; } });
    });

// 🛡️ STUN FIX: Receive the stun from the server
    socket.on('playerStunned', (data) => {
        if (data.targetId === game.player.id) {
            game.player.frozenUntil = Date.now() + data.duration;
            window.spawnDamageText(game.player.x + 24, game.player.y - 20, "STUNNED!", "#ffeb3b");
        }
    });

    socket.on('monsterAttack', (data) => {
    if (!data) return;
    const targetId = data.targetId;

    let hitPet = null;
    if (game.player.activePets) {
        hitPet = game.player.activePets.find(p => p.id === targetId);
    }

if (hitPet) {
        const serverAtk = Number(data.atk || 25);
        // 🛡️ THE FIX: Big Boss gets 100% Player Defense, Normal Slimes get 25%
        const petDef = hitPet.isBigBoss ? window.getDefense() : Math.floor(window.getDefense() * 0.25);
        const actualDmg = Math.max(1, serverAtk - petDef);
        hitPet.hp -= actualDmg;
        window.spawnDamageText(hitPet.x + 15, hitPet.y - 10, actualDmg, '#ff0000');
    } else if (targetId === game.player.id) {
        game.player.currentHp = Math.max(0, data.newHp);
        if (data.damage > 0) {
            window.spawnDamageText(game.player.x + 24, game.player.y - 10, data.damage, '#f44336');
            window.spawnSpark(game.player.x + 24, game.player.y + 48);
        }
        if (game.player.currentHp <= 0 && Date.now() < game.player.immortalUntil) {
            game.player.currentHp = 1;
            window.spawnDamageText(game.player.x + 24, game.player.y - 10, "IMMORTAL", '#ffeb3b');
        }
        window.updateUI();
    } else if (game.remotePlayers[targetId]) {
        const rp = game.remotePlayers[targetId];
        if (data.damage > 0) {
            window.spawnDamageText(rp.x + 24, rp.y - 10, data.damage, '#f44336');
            window.spawnSpark(rp.x + 24, rp.y + 48);
        }
    }

    if (!game.monsters[data.monsterId]) return;
    const m = game.monsters[data.monsterId];
    window.triggerBossBGM(m);
    const mEl = document.getElementById('mob_' + m.id);
    if (!mEl) return;

    let tx = game.player.x + 24;
    let ty = game.player.y + 48;
    if (targetId !== game.player.id && game.remotePlayers[targetId]) {
        tx = game.remotePlayers[targetId].x + 24;
        ty = game.remotePlayers[targetId].y + 48;
    }
    if (hitPet) {
        tx = hitPet.x + 15;
        ty = hitPet.y + 15;
    }

    // 🐉 The Fix: Both Fire Elementals and Dragons use the Fireball animation
    const isElemental = m.monsterKey && (String(m.monsterKey).includes('3') || String(m.monsterKey).includes('dragon'));
    const mcx = m.x + (m.width / 2);
    const mcy = m.y + (m.height / 2);

    if (isElemental) window.shootMonsterFireball(mcx, mcy, tx, ty);

    let dx = tx - mcx;
    let dy = ty - mcy;
    let dist = Math.hypot(dx, dy) || 1;
    let moveX = (dx / dist) * 20;
    let moveY = (dy / dist) * 20;

    const spriteLayer = mEl.querySelector('.monster-sprite-layer');
    if (spriteLayer) {
        if (m.monsterKey.includes('golem')) {
            spriteLayer.classList.add('attacking');
            setTimeout(() => spriteLayer.classList.remove('attacking'), 200);
        }
        spriteLayer.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.1)`;
        setTimeout(() => {
            spriteLayer.style.transform = `translate(0px, 0px) scale(1)`;
        }, 150);
    }

    let sfxFile = 'bump';
    if (m.monsterKey.includes('2')) sfxFile = 'lightning';
    else if (m.monsterKey.includes('3') || m.monsterKey.includes('dragon')) sfxFile = 'splash';

    let hitSound = new Audio(`music/${sfxFile}.mp3`);
    hitSound.volume = 0.4;
    hitSound.play().catch(e => {});
});

    socket.on('monsterSkill', (data) => { 
        // 🐂 MINOTAUR CHARGE ANIMATION
        if (data.skillName === 'Charge') {
            let hitSound = new Audio('music/charge.mp3');
            hitSound.volume = 0.6;
            hitSound.play().catch(e => {});

            const mEl = document.getElementById('mob_' + data.monsterId);
            if (mEl) {
                // Smooth CSS translation for the duration of the dash
                mEl.style.transition = `left ${data.duration}ms linear, top ${data.duration}ms linear`;
                mEl.style.left = data.endX + 'px';
                mEl.style.top = data.endY + 'px';
                
                // Remove the transition immediately after so standard server movement isn't laggy
                setTimeout(() => {
                    if (mEl) mEl.style.transition = 'none';
                }, data.duration);
            }
        } 
        else if (data.skillName === 'Earthquake') {
            const gameContainer = document.getElementById('game-container'); 
            gameContainer.classList.add('screen-shake'); 
            setTimeout(() => gameContainer.classList.remove('screen-shake'), 500); 
            
            // 🗿 Trigger Golem Slam visual when Earthquake fires
            const mEl = document.getElementById('mob_' + data.monsterId);
            if (mEl) {
                const spriteLayer = mEl.querySelector('.golem-base');
                if (spriteLayer) {
                    spriteLayer.classList.add('attacking');
                    setTimeout(() => spriteLayer.classList.remove('attacking'), 300);
                }
            }

           const ring = document.createElement('div'); 
            ring.className = 'earthquake-ring'; 
            ring.style.left = (data.x - data.radius) + 'px'; 
            ring.style.top = (data.y - data.radius) + 'px'; 
            ring.style.width = (data.radius * 2) + 'px'; 
            ring.style.height = (data.radius * 2) + 'px'; 
            
            // 🛡️ THE FIX: Color the enemy boss earthquake BLUE so it stands out!
            if (data.color === 'blue') {
                ring.style.border = '4px solid #2196F3';
                ring.style.boxShadow = '0 0 30px #2196F3, inset 0 0 30px #2196F3';
            }
            
            document.getElementById('world').appendChild(ring); 
            setTimeout(() => ring.remove(), 800);
        } else if (data.skillName === 'Vanish') {
            const poof = document.createElement('div');
            poof.style.cssText = `position:absolute; left:${data.x}px; top:${data.y}px; width:50px; height:50px; border-radius:50%; background:rgba(156,39,176,0.8); box-shadow:0 0 30px #9c27b0; z-index:300; pointer-events:none; transition:all 0.4s ease-out; transform:translate(-50%, -50%) scale(0.5); opacity:1;`;
            document.getElementById('world').appendChild(poof);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    poof.style.transform = 'translate(-50%, -50%) scale(2.5)';
                    poof.style.opacity = '0';
                });
            });
            setTimeout(() => poof.remove(), 400);
        }
    });
socket.on('playerHit', (data) => {
        if (data.targetId === game.player.id) {
            game.player.currentHp = data.newHp;
            window.spawnDamageText(game.player.x + 24, game.player.y - 10, data.damage, '#f44336');
            window.spawnSpark(game.player.x + 24, game.player.y + 48);
            window.updateUI();
        } else if (game.remotePlayers[data.targetId]) {
            const rp = game.remotePlayers[data.targetId];
            window.spawnDamageText(rp.x + 24, rp.y - 10, data.damage, '#f44336');
            window.spawnSpark(rp.x + 24, rp.y + 48);
        }
    });
   socket.on('monsterHit', (data) => { 
        if (!data || !game.monsters[data.monsterId]) return; 
        const m = game.monsters[data.monsterId]; 
        window.triggerBossBGM(m); // 🎵 TRIGGER BOSS MUSIC
        m.currentHp = data.newHp; m.maxHp = data.maxHp || m.maxHp; 
        const mCenterX = m.x + (m.width / 2); const mCenterY = m.y + (m.height / 2); 
        window.spawnDamageText(mCenterX, m.y - 10, data.damage, '#fff'); 
        if (data.isPendant) window.spawnWhiteSplash(mCenterX, mCenterY); else window.spawnSpark(mCenterX, mCenterY); 
        
        const mEl = document.getElementById('mob_' + m.id); 
        if(mEl) { 
            mEl.classList.add('hit-flash'); 
            setTimeout(() => mEl.classList.remove('hit-flash'), 100); 

            // ❄️ ICE MASTER PASSIVE VISUAL
            if (data.didFreeze) {
                let ice = mEl.querySelector('.ice-cube-overlay');
                if (!ice) {
                    ice = document.createElement('div');
                    ice.className = 'ice-cube-overlay';
                    mEl.appendChild(ice);
                }
                // Clear old timer if we chain-freeze them
                if (mEl.freezeTimer) clearTimeout(mEl.freezeTimer);
                mEl.freezeTimer = setTimeout(() => {
                    if (ice) ice.remove();
                }, 3000);
            }
        } 
        window.updateUI(); 
    });
    socket.on('monsterDied', (data) => { if (!data || !game.monsters[data.monsterId]) return; game.monsters[data.monsterId].alive = false; const mEl = document.getElementById('mob_' + data.monsterId); if(mEl) mEl.style.display = 'none'; 

// 🎵 STOP BOSS MUSIC IF IT WAS A BOSS
        if (m.category === 'floor_boss' || m.category === 'mini_boss') {
            window.revertBGM();
        }

window.updateUI(); });

let localBossTimer = null;

    socket.on('bossCooldownActive', (data) => {
        // Clear any old timers if we switch rooms
        if (localBossTimer) clearInterval(localBossTimer);
        
        let remaining = data.remaining;
        
        // Find where the boss is supposed to spawn on this map
        let spawnX = 960, spawnY = 1000;
        if (safeMapData.floorBossSpawns && safeMapData.floorBossSpawns.length > 0) {
            spawnX = safeMapData.floorBossSpawns[0].x;
            spawnY = safeMapData.floorBossSpawns[0].y;
        }

        // Create the glowing text element
        let timerEl = document.getElementById('world-boss-timer');
        if (!timerEl) {
            timerEl = document.createElement('div');
            timerEl.id = 'world-boss-timer';
            timerEl.style.position = 'absolute';
            timerEl.style.color = '#ff9800';
            timerEl.style.fontWeight = 'bold';
            timerEl.style.fontSize = '24px';
            timerEl.style.textAlign = 'center';
            timerEl.style.textShadow = '0 0 10px red, 2px 2px 2px black';
            timerEl.style.transform = 'translate(-50%, -100%)';
            timerEl.style.pointerEvents = 'none';
            timerEl.style.zIndex = '100';
            dom.world.appendChild(timerEl);
        }
        
        timerEl.style.left = spawnX + 'px';
        timerEl.style.top = spawnY + 'px';

        // Make it tick every second!
        localBossTimer = setInterval(() => {
            remaining -= 1000;
            if (remaining <= 0) {
                clearInterval(localBossTimer);
                timerEl.remove();
            } else {
                let h = Math.floor(remaining / (1000 * 60 * 60));
                let m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
                let s = Math.floor((remaining % (1000 * 60)) / 1000);
                timerEl.innerHTML = `⚠️ BOSS RESPAWNS IN<br>${h}h ${m}m ${s}s`;
            }
        }, 1000);
    });
    socket.on('monsterSpawned', (m) => { if (!m || safeMapData.id === 'town') return; game.monsters[m.id] = m; const mEl = document.getElementById('mob_' + m.id); if(mEl) mEl.style.display = 'flex'; });
    socket.on('lootDropped', (item) => { 
        if (!item) return;
        // 🛡️ THE FIX: Only update the text! The item is already safely handled by syncInventory.
        let qtyStr = item.quantity > 1 ? ` (x${item.quantity})` : '';
        if (dom && dom.log) dom.log.innerText = `Looted: ${item.name}${qtyStr}!`; 
    });                  
}
// ==========================================
// 9. PERFORMANCE, FPS & PWA
// ==========================================
var lastLoopTime = performance.now(); var frameCount = 0; var fpsDisplay = document.getElementById('fps-counter');
var lowEndMode = localStorage.getItem('exonie_low_end') === 'true'; var lowFpsTimer = 0;

function updateFPS() {
    let now = performance.now(); frameCount++;
    if (now - lastLoopTime >= 1000) {
        let currentFps = frameCount;
        if(fpsDisplay) { fpsDisplay.innerText = `FPS: ${currentFps}`; fpsDisplay.style.color = currentFps > 45 ? '#4CAF50' : (currentFps > 25 ? '#ffeb3b' : '#f44336'); }
        if (!lowEndMode && currentFps < 20) { lowFpsTimer++; if (lowFpsTimer >= 5) { window.toggleLowEndMode(true); if(dom.log) dom.log.innerText = "Performance alert: Auto-Optimization enabled."; } } else { lowFpsTimer = 0; }
        frameCount = 0; lastLoopTime = now;
    }
    requestAnimationFrame(updateFPS);
}
updateFPS();

window.toggleLowEndMode = function(isAuto = false) {
    lowEndMode = isAuto ? true : !lowEndMode; localStorage.setItem('exonie_low_end', lowEndMode); 
    const btn = document.getElementById('low-perf-btn');
    if (lowEndMode) { document.body.classList.add('low-perf'); if (btn) { btn.innerText = isAuto ? "Auto-Optimized: ON" : "Low-End Mode: ON"; btn.style.background = "#4CAF50"; } lowFpsTimer = 0; } 
    else { document.body.classList.remove('low-perf'); if (btn) { btn.innerText = "Low-End Mode: OFF"; btn.style.background = "#555"; } }
};

if (lowEndMode) { document.body.classList.add('low-perf'); setTimeout(() => { const btn = document.getElementById('low-perf-btn'); if (btn) { btn.innerText = "Low-End Mode: ON"; btn.style.background = "#4CAF50"; } }, 1000); }

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; document.querySelectorAll('#install-btn').forEach(btn => btn.style.display = 'block'); });
window.addEventListener('click', (e) => { if (e.target.id === 'install-btn') { deferredPrompt.prompt(); deferredPrompt.userChoice.then((choiceResult) => { deferredPrompt = null; }); } });

window.newsQueue = [];
socket.on('latestNews', (newsArray) => { if (!Array.isArray(newsArray) || newsArray.length === 0) return; window.newsQueue = newsArray; window.showNextNews(); });
window.showNextNews = function() {
    const modal = document.getElementById('welcome-modal');
    if (window.newsQueue.length === 0) { if (modal) modal.style.display = 'none'; return; }
    const currentNews = window.newsQueue.shift(); 
    const title = document.getElementById('news-title'); const content = document.getElementById('news-content'); const btn = modal.querySelector('button');
    if (modal && title && content) {
        title.innerText = currentNews.title || "Announcement";
        content.innerHTML = currentNews.content || currentNews.Content || currentNews.context || ""; 
        if (btn) { btn.innerText = window.newsQueue.length > 0 ? "NEXT MESSAGE ➔" : "CLOSE"; }
        modal.style.display = 'flex';
    }
};
window.closeWelcomeMessage = function() { window.showNextNews(); };
// ==========================================
// 🏰 DUNGEON 1 & POWER GEM SYSTEM
// ==========================================
window.closeDungeonUI = function() {
    const ui = document.getElementById('dungeon-screen');
    if (ui) ui.style.display = 'none';
    window.isDungeonUIOpen = false; // Unlock movement
};

window.startDungeon = function(difficulty) {
    // 🛡️ EXTREME MODE LEVEL CHECK (Client-Side)
    if (difficulty === 'Extreme' && game.player.level < 50 && !window.isAdmin(game.player.name)) {
        if (dom.log) dom.log.innerText = "❌ You must be Level 50 to enter Extreme difficulty.";
        return;
    }

    let currentEntries = game.player.baseStats?.dungeonEntries !== undefined ? game.player.baseStats.dungeonEntries : 7;
    
    if (currentEntries <= 0 && !window.isAdmin(game.player.name)) {
        if (dom.log) dom.log.innerText = "❌ You have no Dungeon entries left this week. Resets Monday.";
        return; 
    }

    // 🛡️ THE FIX: Optimistic UI Update. Instantly deduct visually so it says 6/7 next time!
    if (!window.isAdmin(game.player.name)) {
        game.player.baseStats.dungeonEntries = currentEntries - 1;
        let entryText = document.getElementById('dungeon-entries-text');
        if (entryText) entryText.innerText = `Weekly Entries: ${game.player.baseStats.dungeonEntries}/7`;
    }

    // Close the UI and unlock movement to teleport
    window.closeDungeonUI();
    
    const returnData = { mapId: safeMapData.id, x: game.player.x, y: game.player.y + 20 };
    if (socket) socket.emit('startDungeon', { difficulty: difficulty, returnData: returnData });
    
    document.getElementById('loading-text').innerText = "Entering The Cave...";
    document.getElementById('loading-screen').style.display = 'flex';
};

window.attemptApplyGem = function(targetIndex, e) { 
    e.stopPropagation(); 
    if (socket) socket.emit('requestApplyGem', { gemIndex: activeInvIndex, targetIndex: targetIndex }); 
    window.isApplyingAura = false; 
    window.renderInventory(); 
}

if (socket) {
    // 🛡️ THE FIX: This forces the party members to un-freeze and accept the teleport!
    socket.on('closeDungeonUI', () => {
        window.closeDungeonUI();
        const ls = document.getElementById('loading-screen');
        if (ls) ls.style.display = 'none';
        window.isDungeonUIOpen = false;
    });
let dungeonTimerInt = null;
    socket.on('dungeonTimerStart', (data) => {
        const ui = document.getElementById('dungeon-timer-ui');
        if (ui) ui.style.display = 'block';
        let endTime = data.startTime + data.durationMs;
        
        clearInterval(dungeonTimerInt);
        dungeonTimerInt = setInterval(() => {
            let remaining = endTime - Date.now();
            if (remaining <= 0) {
                remaining = 0;
                clearInterval(dungeonTimerInt);
            }
            let m = Math.floor(remaining / 60000);
            let s = Math.floor((remaining % 60000) / 1000);
            if (ui) ui.innerText = `⏳ ${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
        }, 1000);
    });

    socket.on('dungeonTimerStop', () => {
        clearInterval(dungeonTimerInt);
        const ui = document.getElementById('dungeon-timer-ui');
        if (ui) ui.style.display = 'none';
    });

    socket.on('dungeonVictory', () => {
        // Create a massive floating victory text
        const vText = document.createElement('div');
        vText.innerHTML = `
            <h1 style="font-size:80px; margin:0; text-shadow:0 0 30px #4CAF50, 4px 4px 0 #000; letter-spacing: 5px; animation: pulseText 1s infinite alternate;">DUNGEON CLEAR!</h1>
        `;
        vText.style.position = 'fixed';
        vText.style.top = '40%';
        vText.style.left = '50%';
        vText.style.transform = 'translate(-50%, -50%)';
        vText.style.textAlign = 'center';
        vText.style.color = '#4CAF50';
        vText.style.zIndex = '9999';
        document.body.appendChild(vText);
        
        // Clean it up after 4 seconds when they teleport out
        setTimeout(() => { vText.remove(); }, 4000);
    });
}
    // 🛡️ SYSTEM UTILITIES
window.logout = function() {
    localStorage.removeItem('exonie_user');
    localStorage.removeItem('exonie_pass');
    location.reload();
};
window.mobileWindowState = {};
window.__topWindowZ = 6000;

window.isMobileUI = function() {
    return window.matchMedia('(pointer: coarse), (max-width: 950px)').matches;
};

window.bringWindowToFront = function(el) {
    if (!el) return;
    window.__topWindowZ += 1;
    el.style.zIndex = window.__topWindowZ;
};

window.clampWindowToViewport = function(el) {
    if (!el) return;
    if (el.style.display === 'none') return;

    const rect = el.getBoundingClientRect();

    let left = parseFloat(el.dataset.left || '0');
    let top = parseFloat(el.dataset.top || '0');

    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);

    left = Math.max(0, Math.min(left, maxLeft));
    top = Math.max(0, Math.min(top, maxTop));

    el.dataset.left = left;
    el.dataset.top = top;

    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.transform = 'none';
};

window.enableMobileWindowControls = function(el) {
    if (!el || el.dataset.mobileWindowReady === '1') return;
    el.dataset.mobileWindowReady = '1';

    const handle = el.querySelector('.window-drag-handle');

    function captureInitialPosition() {
        if (el.dataset.positionCaptured === '1') return;

        const rect = el.getBoundingClientRect();
        el.dataset.left = rect.left;
        el.dataset.top = rect.top;
        el.dataset.positionCaptured = '1';

        el.style.position = 'fixed';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.left = rect.left + 'px';
        el.style.top = rect.top + 'px';
        el.style.transform = 'none';
    }

    if (!handle) {
        setTimeout(() => {
            captureInitialPosition();
            window.clampWindowToViewport(el);
        }, 50);
        return;
    }

    let dragging = false;
    let activePointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function startDrag(clientX, clientY, pointerId) {
        captureInitialPosition();

        dragging = true;
        activePointerId = pointerId || null;
        startX = clientX;
        startY = clientY;
        startLeft = parseFloat(el.dataset.left || '0');
        startTop = parseFloat(el.dataset.top || '0');

        window.bringWindowToFront(el);
        el.classList.add('window-dragging');

        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
    }

    function moveDrag(clientX, clientY) {
        if (!dragging) return;

        const dx = clientX - startX;
        const dy = clientY - startY;

        const nextLeft = startLeft + dx;
        const nextTop = startTop + dy;

        el.dataset.left = nextLeft;
        el.dataset.top = nextTop;
        el.style.left = nextLeft + 'px';
        el.style.top = nextTop + 'px';
        el.style.transform = 'none';
    }

    function stopDrag() {
        if (!dragging) return;

        dragging = false;
        activePointerId = null;
        el.classList.remove('window-dragging');

        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        window.clampWindowToViewport(el);
    }

    handle.addEventListener('pointerdown', function(e) {
        if (el.style.display === 'none') return;
        if (e.button !== undefined && e.button !== 0) return;

        startDrag(e.clientX, e.clientY, e.pointerId);

        if (handle.setPointerCapture) {
            handle.setPointerCapture(e.pointerId);
        }

        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener('pointermove', function(e) {
        if (!dragging) return;
        if (activePointerId !== null && e.pointerId !== activePointerId) return;

        moveDrag(e.clientX, e.clientY);
        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener('pointerup', function(e) {
        stopDrag();
        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener('pointercancel', function(e) {
        stopDrag();
        e.preventDefault();
        e.stopPropagation();
    });

    handle.addEventListener('touchstart', function(e) {
        if (el.style.display === 'none') return;
        const t = e.touches[0];
        if (!t) return;

        startDrag(t.clientX, t.clientY, 'touch');
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    handle.addEventListener('touchmove', function(e) {
        if (!dragging) return;
        const t = e.touches[0];
        if (!t) return;

        moveDrag(t.clientX, t.clientY);
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    handle.addEventListener('touchend', function(e) {
        stopDrag();
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    handle.addEventListener('touchcancel', function(e) {
        stopDrag();
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    el.addEventListener('pointerdown', function() {
        window.bringWindowToFront(el);
    });

    setTimeout(() => {
        captureInitialPosition();
        window.clampWindowToViewport(el);
    }, 50);
};

window.initAllMobileWindows = function() {
    document.querySelectorAll('.movable-window').forEach(el => {
        window.enableMobileWindowControls(el);
    });
};

window.resetMobileWindow = function(id, x = 12, y = 70) {
    const el = document.getElementById(id);
    if (!el) return;
    el.dataset.left = x;
    el.dataset.top = y;
    el.style.position = 'fixed';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.transform = 'none';
    window.clampWindowToViewport(el);
};

window.addEventListener('resize', function() {
    document.querySelectorAll('.movable-window').forEach(el => {
        window.clampWindowToViewport(el);
    });
});

// ==========================================
// 🛡️ SYSTEM UTILITIES & MAILBOX ENGINE
// ==========================================
// ==========================================
// 🏰 GUILD SYSTEM UI ENGINE
// ==========================================
window.openGuildUI = function() {
    let modal = document.getElementById('guild-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'guild-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #4CAF50; padding:20px; z-index:9000; width:380px; border-radius:8px; box-shadow:0 0 30px #4CAF50; color:white; font-family:sans-serif; text-align:center;';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = '<h2 style="color:#4CAF50;">Loading Guild Data...</h2>';
    modal.style.display = 'block';
    
    if (window.isMobileUI()) {
        window.enableMobileWindowControls(modal);
        window.bringWindowToFront(modal);
        window.clampWindowToViewport(modal);
    }
    
    if (socket) socket.emit('requestGuildData');
};

if (socket) {
    socket.on('requestGuildUI_Refresh', () => {
        if (document.getElementById('guild-modal')?.style.display === 'block') {
            socket.emit('requestGuildData');
        }
    });

    socket.on('guildDataResponse', (data) => {
        const modal = document.getElementById('guild-modal');
        if (!modal) return;

        if (data.hasGuild) {
            let d = data.details;
            let myRole = data.myRole || 'Member';
            const roleLevel = { 'Master': 4, 'Vice Master': 3, 'Captain': 2, 'Member': 1 };
            
            let html = `
                <div class="window-drag-handle" style="cursor:grab; padding:10px; background:#222; margin:-20px -20px 15px -20px; border-radius:8px 8px 0 0; border-bottom:1px solid #4CAF50;">
                    <h2 style="margin:0; color:#4CAF50; pointer-events:none;">🏰 ${d.name} (${data.members.length}/20)</h2>
                </div>
                <div style="display:flex; justify-content:space-between; margin:10px 0; font-size:13px; color:#aaa;">
                    <span>Your Role: <strong style="color:#fff;">${myRole}</strong></span>
                    <span>Funds: <strong style="color:#FFD700;">${(data.guildGold || 0).toLocaleString()} G</strong></span>
                </div>
            `;

            // 📋 MEMBER LIST + KICK BUTTONS + ROLES
            html += `<div style="background:#111; padding:10px; border:1px solid #333; height:120px; overflow-y:auto; margin-bottom:10px; text-align:left;">`;
            data.members.forEach(m => {
                let actionHtml = `<span>${m.role}</span>`;
                
                // Master can change roles
                if (myRole === 'Master' && m.name !== game.player.name) {
                    actionHtml = `<select onchange="socket.emit('guildUpdateRole', {targetName:'${m.name}', newRole:this.value})" style="background:#222; color:#fff; font-size:10px; padding:2px; border:1px solid #444; outline:none; cursor:pointer;">
                        <option value="Member" ${m.role==='Member'?'selected':''}>Member</option>
                        <option value="Captain" ${m.role==='Captain'?'selected':''}>Captain</option>
                        <option value="Vice Master" ${m.role==='Vice Master'?'selected':''}>Vice Master</option>
                    </select>`;
                }

                // Kick logic: Master kicks anyone except self. Vice Master kicks Captain/Member.
                let targetLvl = roleLevel[m.role] || 1;
                let canKick = (myRole === 'Master' && m.name !== game.player.name) || 
                              (myRole === 'Vice Master' && targetLvl <= 2);

                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #222;">
                            <span style="font-size:12px; color: ${m.online ? '#fff' : '#777'};">${m.online ? '🟢' : '⚪'} ${m.name}</span>
                            <div style="display:flex; gap:5px; align-items:center;">
                                ${actionHtml}
                                ${canKick ? `<button onclick="if(confirm('Kick ${m.name}?')) socket.emit('guildKick', '${m.name}')" style="background:#f44336; color:white; border:none; padding:2px 5px; font-size:9px; cursor:pointer; border-radius:3px;">KICK</button>` : ''}
                            </div>
                         </div>`;
            });
            html += `</div>`;

            // 📩 APPLICANTS (Master/Vice Master only)
            if (roleLevel[myRole] >= 3) {
                html += `<h4 style="margin:5px 0; font-size:12px; color:#aaa; text-align:left;">Pending Applicants</h4>
                         <div style="background:#111; padding:5px; border:1px solid #333; height:60px; overflow-y:auto; margin-bottom:10px;">`;
                if (data.applicants && data.applicants.length > 0) {
                    data.applicants.forEach(name => {
                        html += `<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:3px;">
                                    <span>${name}</span>
                                    <div>
                                        <button onclick="socket.emit('guildHandleApplicant', {applicantName:'${name}', accept:true})" style="background:#4CAF50; color:white; border:none; padding:2px 6px; cursor:pointer;">✔</button>
                                        <button onclick="socket.emit('guildHandleApplicant', {applicantName:'${name}', accept:false})" style="background:#f44336; color:white; border:none; padding:2px 6px; cursor:pointer;">✖</button>
                                    </div>
                                 </div>`;
                    });
                } else {
                    html += `<div style="color:#444; font-size:11px; margin-top:15px; text-align:center;">No applications</div>`;
                }
                html += `</div>`;
            }

            // 🔘 ACTIONS
            html += `<div style="display:flex; gap:5px; margin-bottom:5px;">
                        <button class="btn" style="background:#2196F3; flex:1; font-size:13px; padding:8px;" onclick="window.donateGuild()">Donate Gold</button>
                        <button class="btn" style="background:#f44336; flex:1; font-size:13px; padding:8px;" onclick="if(confirm('Are you sure you want to leave this guild?')) socket.emit('guildLeave')">Leave Guild</button>
                     </div>`;
            
            if (roleLevel[myRole] >= 2) {
                html += `<button class="btn" style="background:#311B92; width:100%; margin-bottom:5px; padding:8px;" onclick="window.customPrompt('Enter character name to invite:', function(n) { if(n && n.trim() !== '') socket.emit('guildInvitePlayer', n.trim()); })">Invite Player</button>`;
            }

            if (data.hasBase) {
                html += `<button class="btn" style="background:#4CAF50; width:100%; margin-bottom:5px; padding:8px;" onclick="window.enterGuildBase()">Enter Guild Base</button>`;
            } else if (myRole === 'Master') {
                html += `<button class="btn" style="background:#FF9800; width:100%; margin-bottom:5px; padding:8px;" onclick="window.buyGuildBase()">Buy Guild Base (1,000,000 G)</button>`;
            }

            html += `<button class="btn" style="background:#555; width:100%; margin-top:5px; padding:8px;" onclick="document.getElementById('guild-modal').style.display='none'">Close</button>`;
            modal.innerHTML = html;
        } else {
            let html = `
                <div class="window-drag-handle" style="cursor:grab; padding:10px; background:#222; margin:-20px -20px 15px -20px; border-radius:8px 8px 0 0; border-bottom:1px solid #4CAF50;">
                    <h2 style="margin:0; color:#4CAF50; pointer-events:none;">🏰 Guild Registry</h2>
                </div>
                <button class="btn" style="background:#FF9800; width:100%; margin-bottom:15px; font-weight:bold; padding:12px;" onclick="window.createGuild()">Establish Guild (10M Gold)</button>
                <h3 style="color:#aaa; font-size:14px; border-bottom:1px solid #333; padding-bottom:5px;">Open Guilds</h3>
                <div style="background:#111; padding:10px; border:1px solid #333; border-radius:5px; height:120px; overflow-y:auto; margin-bottom:15px; text-align:left;">`;
            
            if (data.openGuilds && data.openGuilds.length > 0) {
                data.openGuilds.forEach(g => {
                    html += `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #222;">
                                <span>${g.name} <span style="color:#aaa; font-size:11px;">(${g.members} members)</span></span>
                                <button class="btn" style="background:#4CAF50; padding:2px 8px; font-size:11px;" onclick="window.applyToGuild('${g.name}')">Apply</button>
                             </div>`;
                });
            } else {
                html += `<div style="color:#555; text-align:center; margin-top:30px;">No open guilds found.</div>`;
            }
            
            html += `</div>
                <button class="btn" style="background:#f44336; width:100%; padding:8px;" onclick="document.getElementById('guild-modal').style.display='none'">Close</button>`;
            
            modal.innerHTML = html;
        }
    });
}

// 🌟 GUILD INVITE UI INJECTION
if (!document.getElementById('guild-invite-dialog')) {
    let gModal = document.createElement('div');
    gModal.id = 'guild-invite-dialog';
    gModal.className = 'movable-window';
    gModal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #311B92; padding:20px; z-index:9500; width:300px; border-radius:8px; box-shadow:0 0 20px #311B92; color:white; text-align:center;';
    gModal.innerHTML = `
        <h3 style="color:#E040FB; margin-top:0;">Guild Invitation</h3>
        <p id="guild-invite-text" style="font-size:14px; margin-bottom:20px;"></p>
        <div style="display:flex; gap:10px;">
            <button class="btn" style="background:#4CAF50; flex:1;" onclick="window.respondGuildInvite(true)">Accept</button>
            <button class="btn" style="background:#f44336; flex:1;" onclick="window.respondGuildInvite(false)">Decline</button>
        </div>
    `;
    document.body.appendChild(gModal);
}

let pendingGuildInvite = null;

if (socket) {
    socket.on('guildInviteReceived', (data) => {
        pendingGuildInvite = data.guildName;
        document.getElementById('guild-invite-text').innerText = `${data.from} invited you to join [${data.guildName}].`;
        document.getElementById('guild-invite-dialog').style.display = 'block';
    });
}

window.respondGuildInvite = function(accept) {
    document.getElementById('guild-invite-dialog').style.display = 'none';
    if (accept && pendingGuildInvite) {
        socket.emit('joinGuild', pendingGuildInvite);
    }
    pendingGuildInvite = null;
};

window.createGuild = function() {
    window.customPrompt("Enter a name for your new Guild:", function(name) {
        if (name && name.trim().length > 2 && name.trim().length <= 15) {
            socket.emit('createGuild', name.trim());
        } else if (name) {
            alert("Guild name must be between 3 and 15 characters.");
        }
    });
};

window.joinGuild = function(name) {
    if (confirm(`Join ${name}?`)) {
        socket.emit('joinGuild', name);
    }
};

window.applyToGuild = function(gName) {
    socket.emit('guildApply', gName);
    if (dom.log) dom.log.innerText = `Application sent to ${gName}...`;
};

window.donateGuild = function() {
    window.customPrompt("How much Gold would you like to donate to the Guild Funds?", function(amt) {
        let parsed = parseInt(amt);
        if (!isNaN(parsed) && parsed > 0) {
            socket.emit('donateGuildGold', parsed);
        }
    });
};

window.buyGuildBase = function() {
    if (confirm("Spend 1,000,000 Guild Funds to purchase a Guild Base? Only the Guild Leader can do this.")) {
        if (socket) socket.emit('requestBuyGuildBase');
        document.getElementById('guild-modal').innerHTML = '<h2 style="color:#FF9800; margin-top: 20px;">Purchasing Base...</h2>';
    }
};
window.enterGuildBase = function() {
    document.getElementById('guild-modal').style.display = 'none';
    // Send a secure map ID that the server knows how to instance privately!
    socket.emit('forceTeleport', { mapId: 'guildbase', x: 960, y: 1000 });
};
// 🗺️ MAZE GUIDE & FAST TRAVEL ENGINE
window.openMazeGuide = function() {
    if (game.party && game.party.members && game.party.members.length > 1) {
        if (game.party.leaderId !== game.player.id) {
            dom.log.innerText = "❌ Only the Party Leader can use the Maze Guide.";
            return;
        }
    }

    let modal = document.getElementById('maze-guide-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'maze-guide-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#222; border:2px solid #2196F3; padding:20px; z-index:9000; width:300px; border-radius:8px; box-shadow:0 0 20px #2196F3; color:white; text-align:center;';
        document.body.appendChild(modal);
    }

    let html = '<h2 style="margin-top:0; color:#2196F3;">🗺️ Maze Guide</h2>';
    html += '<p style="font-size:12px; color:#aaa; margin-bottom:20px;">Choose your destination.</p>';
    
    html += '<button class="btn" style="width:100%; margin-bottom:10px; padding:12px; font-weight:bold; font-size:16px; background:#4CAF50;" onclick="window.openFastTravelUI()"> Fast Travel</button>';
    html += '<button class="btn" style="width:100%; margin-bottom:15px; padding:12px; font-weight:bold; font-size:16px; background:#9c27b0; box-shadow: 0 0 10px #9c27b0;" onclick="window.openMazeTrialsUI()">Maze Trials</button>';
    
    html += `<button class="btn" style="background:#f44336; width:100%;" onclick="document.getElementById('maze-guide-modal').style.display='none'">Close</button>`;
    
    modal.innerHTML = html;
    modal.style.display = 'block';
};

window.openFastTravelUI = function() {
   let maxFloor = 0;
    let title1 = game.player.title || "";
    let title2 = game.player.spriteData?.title || "";
    let title3 = game.cachedUserData?.title || "";
    let domTitle = document.getElementById('player-title-tag') ? document.getElementById('player-title-tag').innerText : "";
    let combinedTitle = `${title1} ${title2} ${title3} ${domTitle}`.toUpperCase();
    const match = combinedTitle.match(/FLOOR CONQUEROR (\d+)/);
    if (match) {
        maxFloor = parseInt(match[1]);
    }

    if (maxFloor === 0) {
        dom.log.innerText = "❌ You haven't conquered any floors yet!";
        return;
    }

    let modal = document.getElementById('maze-guide-modal');
    let html = '<h2 style="margin-top:0; color:#4CAF50;">🚀 Fast Travel</h2>';
    html += '<p style="font-size:12px; color:#aaa;">Select a conquered floor to fast-travel.</p>';
    html += '<div style="max-height:300px; overflow-y:auto; margin-bottom:15px; padding-right:5px;">';
    
    for (let i = 1; i <= maxFloor; i++) {
        html += `<button class="btn" style="width:100%; margin-bottom:5px; background:#4CAF50;" onclick="window.requestMazeTeleport(${i})">Teleport to Floor ${i}</button>`;
    }
    
    html += '</div>';
    html += `<button class="btn" style="background:#f44336; width:100%;" onclick="window.openMazeGuide()">Back</button>`;
    
    modal.innerHTML = html;
};

window.openMazeTrialsUI = function() {
    let modal = document.getElementById('maze-guide-modal');
    let html = '<h2 style="margin-top:0; color:#E040FB;">⚔️ Maze Trials</h2>';
    html += '<p style="font-size:12px; color:#aaa;">Challenge a Floor Boss in a private instance. 1 Entry per day.</p>';
    html += '<div style="max-height:300px; overflow-y:auto; margin-bottom:15px; padding-right:5px;">';
    
    // Shows floors 1 to 7
    for (let i = 1; i <= 7; i++) { 
        html += `<button class="btn" style="width:100%; margin-bottom:5px; background:#9c27b0;" onclick="window.requestMazeTrial(${i})">Trial: Floor ${i}</button>`;
    }
    
    html += '</div>';
    html += `<button class="btn" style="background:#f44336; width:100%;" onclick="window.openMazeGuide()">Back</button>`;
    
    modal.innerHTML = html;
};

window.requestMazeTrial = function(floorNum) {
    document.getElementById('maze-guide-modal').style.display = 'none';
    if (socket) socket.emit('requestMazeTrial', { targetFloor: floorNum });
};

// 🛡️ THE FIX: Added the missing Fast Travel client-side function!
window.requestMazeTeleport = function(floorNum) {
    document.getElementById('maze-guide-modal').style.display = 'none';
    if (socket) socket.emit('requestMazeTeleport', { targetFloor: floorNum });
};
// ==========================================
// ⚔️ TAVERN & LEADERBOARD LOGIC
// ==========================================
window.startTavern = function() {
// 🛡️ LEVEL 50 LOCK
    if (game.player.level < 50 && !window.isAdmin(game.player.name)) {
        if (dom.log) dom.log.innerText = "❌ You must be at least Level 50 to enter the Training Tavern.";
        document.getElementById('tavern-modal').style.display = 'none';
        return;
    }

// 🛡️ PARTY CHECK: Strictly Solo
    if (game.party && game.party.members && game.party.members.length > 1) {
        if (dom.log) dom.log.innerText = "❌ Solo Challenge! You must leave your party to enter the Tavern.";
        document.getElementById('tavern-modal').style.display = 'none';
        return;
    }
    let type = document.getElementById('tavern-mob-type').value;
    let lvl = parseInt(document.getElementById('tavern-level').value) || 10;
    
    // 🛡️ THE FIX: Prevent entering if out of entries to stop infinite loading screen!
    let currentEntries = game.player.baseStats?.tavernEntries !== undefined ? game.player.baseStats.tavernEntries : 5;
    if (currentEntries <= 0 && !window.isAdmin(game.player.name)) {
        if (dom.log) dom.log.innerText = "❌ You have no Tavern entries left this week. Resets Monday.";
        document.getElementById('tavern-modal').style.display = 'none';
        return; 
    }

    // Optimistically deduct entry so it updates instantly next time you open the UI
    if (!window.isAdmin(game.player.name)) {
        game.player.baseStats.tavernEntries = currentEntries - 1;
    }

    if (socket) socket.emit('startTavern', { mobType: type, level: lvl });
    
    // 🛡️ UI FIX: Force close ALL windows instantly
    document.getElementById('tavern-modal').style.display = 'none';
    isInventoryOpen = false; dom.invScreen.style.display = 'none';
    isSkillOpen = false; dom.skillScreen.style.display = 'none';
    isShopping = false; document.getElementById('shop-screen').style.display = 'none';
    isMailboxOpen = false; document.getElementById('mailbox-screen').style.display = 'none';
    dom.statScreen.style.display = 'none';
    document.getElementById('friends-screen').style.display = 'none';
    document.getElementById('trade-screen').style.display = 'none';
    document.getElementById('inv-context-menu').style.display = 'none';
    document.getElementById('player-context-menu').style.display = 'none';

    // 🛡️ UI FIX: Smooth fake loading bar that finishes right as the boss spawns
    document.getElementById('loading-text').innerText = "Entering Tavern...";
    const loaderFill = document.getElementById('loader-fill');
    if (loaderFill) { 
        loaderFill.style.width = '0%'; 
        loaderFill.style.transition = 'width 0.1s linear'; 
    }
    document.getElementById('loading-screen').style.display = 'flex';
    
    let fillAmt = 0;
    let fakeLoad = setInterval(() => {
        fillAmt += 8; 
        if (loaderFill) loaderFill.style.width = Math.min(100, fillAmt) + '%';
        if (fillAmt >= 100) clearInterval(fakeLoad);
    }, 100);
}

let tavernTimerInt = null;
let tavernStartTs = 0;
if (socket) {
    socket.on('tavernTimerStart', () => {
        // 🛡️ THE FIX: Lift the curtain and unlock the player exactly as the boss spawns!
        document.getElementById('loading-screen').style.display = 'none';
        window.isLoading = false;

        document.getElementById('tavern-timer-ui').style.display = 'block';
        tavernStartTs = Date.now();
        clearInterval(tavernTimerInt);
        tavernTimerInt = setInterval(() => {
            let ms = Date.now() - tavernStartTs;
            let s = Math.floor(ms / 1000);
            let msFrac = Math.floor((ms % 1000) / 10);
            document.getElementById('tavern-timer-ui').innerText = `${s < 10 ? '0'+s : s}:${msFrac < 10 ? '0'+msFrac : msFrac}`;
        }, 50);
    });

    socket.on('tavernTimerStop', () => {
        clearInterval(tavernTimerInt); // Instantly kill the timer
        setTimeout(() => { document.getElementById('tavern-timer-ui').style.display = 'none'; }, 5000);
    });

    // 🏆 EPIC VICTORY SCREEN GENERATOR
    socket.on('tavernVictory', (data) => {
        clearInterval(tavernTimerInt); // Double tap the timer just in case
        
        // Freeze the top timer UI to the EXACT millisecond of the kill
        let s = Math.floor(data.time / 1000);
        let msFrac = Math.floor((data.time % 1000) / 10);
        document.getElementById('tavern-timer-ui').innerText = `${s < 10 ? '0'+s : s}:${msFrac < 10 ? '0'+msFrac : msFrac}`;

        // Create a massive floating victory text dynamically
        const vText = document.createElement('div');
        vText.innerHTML = `
            <h1 style="font-size:80px; margin:0; text-shadow:0 0 30px #FFD700, 4px 4px 0 #000; letter-spacing: 5px;">VICTORY</h1>
            <h2 style="font-size:40px; margin:0; color:#fff; text-shadow:2px 2px 0 #000;">Time: ${(data.time/1000).toFixed(2)}s</h2>
            ${data.isNewBest ? '<h3 style="color:#4CAF50; font-size:32px; margin-top:15px; text-shadow:0 0 15px #4CAF50, 2px 2px 0 #000; animation: pulseText 1s infinite alternate;">🏆 NEW PERSONAL BEST! 🏆</h3>' : ''}
        `;
        vText.style.position = 'fixed';
        vText.style.top = '40%';
        vText.style.left = '50%';
        vText.style.transform = 'translate(-50%, -50%)';
        vText.style.textAlign = 'center';
        vText.style.color = '#FFD700';
        vText.style.zIndex = '9999';
        document.body.appendChild(vText);
        
        // Clean it up after 5 seconds when they teleport out
        setTimeout(() => { vText.remove(); }, 5000);
    });

    socket.on('updateLeaderboardUI', (data) => {
        let html = `<div class="leaderboard-row header" style="display:flex;">
            <div style="width:15%">Rank</div>
            <div style="width:35%">Player</div>
            <div style="width:30%">Target</div>
            <div style="width:20%; text-align:right;">Time</div>
        </div>`;
        
        data.forEach((row, i) => {
            let pClass = row.player_class || 'Novice';
            let pLvl = row.player_level || 1;
            
            html += `<div class="leaderboard-row" style="display:flex; align-items:center;">
                <div style="width:15%; color:#FF9800; font-weight:bold;">#${i+1}</div>
                <div style="width:35%; line-height:1.2;">
                    <div style="color:#fff;">${row.character_name}</div>
                    <div style="color:#aaa; font-size:11px;">Lv.${pLvl} ${pClass}</div>
                </div>
                <div style="width:30%; font-size:12px; color:#e0e0e0;">${row.mob_type.replace('_', ' ').toUpperCase()}<br>Lv. ${row.mob_level}</div>
                <div style="width:20%; text-align:right; color:#4CAF50; font-weight:bold;">${(row.time_taken/1000).toFixed(2)}s</div>
            </div>`;
        });
        document.getElementById('leaderboard-content').innerHTML = html;
    });
}
window.toggleLeaderboard = function() {
    const modal = document.getElementById('leaderboard-modal');
    const isOpening = modal.style.display !== 'block';
    
    if (isOpening) {
        if (socket) socket.emit('getTavernLeaderboard');
        modal.style.display = 'block';
        if (window.isMobileUI()) {
            window.enableMobileWindowControls(modal);
            window.bringWindowToFront(modal);
            window.clampWindowToViewport(modal);
        }
    } else {
        modal.style.display = 'none';
    }
};

socket.on('cdReset', () => {
        if (game.player.activeSkills) {
            game.player.activeSkills.forEach(s => s.cooldownReadyAt = 0);
            if (typeof window.updateHotbarCooldowns === 'function') window.updateHotbarCooldowns();
        }
    });

    socket.on('attackEvaded', (data) => {
        let msg = data.type === 'dodge' ? "DODGE!" : (data.type === 'parry' ? "PARRY!" : "MISS");
        let color = data.type === 'dodge' ? "#00E5FF" : (data.type === 'parry' ? "#ffeb3b" : "#aaaaaa");
        
        let target = null;
        if (data.targetId === game.player.id) target = game.player;
        else if (game.remotePlayers[data.targetId]) target = game.remotePlayers[data.targetId];
        else if (game.monsters[data.monsterId]) target = game.monsters[data.monsterId];

        if (target) {
            let tx = target.x + (target.width ? target.width/2 : 24);
            let ty = target.y + (target.height ? target.height/2 : 48);
            window.spawnDamageText(tx, ty - 10, msg, color);
        }
    });

// ==========================================
// 💤 AFK SCREEN LOCKER
// ==========================================
if (!document.getElementById('afk-lock-screen')) {
    let afkOverlay = document.createElement('div');
    afkOverlay.id = 'afk-lock-screen';
    afkOverlay.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:9999999; flex-direction:column; justify-content:center; align-items:center; font-family:sans-serif; cursor:pointer; user-select:none; backdrop-filter: blur(5px);';
    afkOverlay.innerHTML = `
        <h1 style="color:#FF9800; font-size:50px; margin:0 0 10px 0; text-shadow: 0 0 30px #FF9800; letter-spacing:3px;">GAME PAUSED</h1>
        <h2 style="color:#fff; margin:0; animation: pulseText 1.5s infinite alternate;">Click the screen to resume playing</h2>
    `;
    document.body.appendChild(afkOverlay);

    let afkTimer = null;
    const AFK_TIME_LIMIT = 5 * 60 * 1000; // 5 minutes in milliseconds

    window.resetAfkTimer = function(e) {
        // If the screen is locked, wake it up and prevent the click from registering in the game
        if (afkOverlay.style.display === 'flex') {
            afkOverlay.style.display = 'none';
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
        
        clearTimeout(afkTimer);
        
        afkTimer = setTimeout(() => {
            // Only trigger the AFK screen if they are actually logged in and playing
            if (game.isRunning && !window.isLoading && document.getElementById('loading-screen')?.style.display === 'none') {
                afkOverlay.style.display = 'flex';
                // Reset movement keys so they don't auto-run into a wall while AFK
                for (const k in game.keys) game.keys[k] = false;
            }
        }, AFK_TIME_LIMIT);
    };

    // Listen for literally ANY interaction to keep the game awake
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'pointerdown', 'wheel'].forEach(evt => {
        window.addEventListener(evt, window.resetAfkTimer, { capture: true, passive: false });
    });

    window.resetAfkTimer();
}

window.onload = () => {
    window.loadLootFilter();
    window.initAllMobileWindows();

    // Force Auto-Login
    let savedU = localStorage.getItem('exonie_user');
    let savedP = localStorage.getItem('exonie_pass');
    if (savedU && savedP) {
        let uInput = document.getElementById('login-user');
        let pInput = document.getElementById('login-pass');
        if(uInput && pInput) {
            uInput.value = savedU;
            pInput.value = savedP;
            if (typeof window.attemptLogin === 'function') window.attemptLogin();
        }
    }
    
   // Reveal Unstuck Button (Hidden on Mobile to save space)
    setTimeout(() => {
        let unstuckBtn = document.getElementById('unstuck-btn');
        if (unstuckBtn) {
            if (window.isMobileUI()) {
                unstuckBtn.style.display = 'none';
            } else {
                unstuckBtn.style.display = 'block';
            }
        }
    }, 1000);
};

// Force Logout
window.logout = function() {
    localStorage.removeItem('exonie_user');
    localStorage.removeItem('exonie_pass');
    location.reload();
};

// Dedicated 'M' Key Listener for Mailbox
window.addEventListener('keydown', (e) => {
    if (typeof isChatting !== 'undefined' && isChatting) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    
    if (e.key.toLowerCase() === 'm') {
        if (typeof window.toggleMailbox === 'function') window.toggleMailbox();
    }
});
// 🎥 DYNAMIC TUTORIAL VIDEO PLAYER (CRASH-FREE VERSION)
window.playTutorialVideo = function() {
    // 🔇 1. Stop background music immediately
    if (typeof currentBGM !== 'undefined' && currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
    }
    if (typeof currentTrackName !== 'undefined') {
        currentTrackName = ""; 
    }

    let overlay = document.getElementById('tutorial-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'tutorial-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:black; z-index:99999; display:flex; flex-direction:column; justify-content:center; align-items:center;';
        
        // ⏳ 2. Show a loading message while downloading
        const loadingText = document.createElement('h2');
        loadingText.innerText = '📡 Downloading Tutorial...';
        loadingText.style.cssText = 'color: white; font-family: sans-serif; text-shadow: 0 0 10px #2196F3;';
        overlay.appendChild(loadingText);
        document.body.appendChild(overlay);

        // 📥 3. Fetch the ENTIRE video into local memory
        fetch('animation/tutorial.mp4')
            .then(response => {
                if (!response.ok) throw new Error("Video file not found!");
                return response.blob();
            })
            .then(blob => {
                const videoUrl = URL.createObjectURL(blob); 
                loadingText.style.display = 'none'; 

                const vid = document.createElement('video');
                vid.id = 'tutorial-video';
                vid.src = videoUrl; 
                vid.controls = true;
                vid.autoplay = true;
                vid.style.cssText = 'max-width:100%; max-height:85%; background:black; outline:none; box-shadow: 0 0 20px #2196F3; border-radius: 8px;';
                
                const skipBtn = document.createElement('button');
                skipBtn.innerText = 'SKIP / CLOSE TUTORIAL';
                skipBtn.style.cssText = 'margin-top:20px; padding:12px 24px; background:#f44336; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size:16px; box-shadow:0 0 10px red; text-transform: uppercase;';
                
                const closeTutorial = () => {
                    vid.pause();
                    vid.removeAttribute('src'); 
                    vid.load();
                    overlay.remove(); 
                    
                    // 🛡️ FIX 1: Delay the RAM wipe slightly so the browser doesn't panic and crash!
                    setTimeout(() => { URL.revokeObjectURL(videoUrl); }, 1000);

                    // 🛡️ FIX 2: Fire the Instant Save to Supabase!
                    if (game.player.baseStats) {
                        game.player.baseStats.watchedTutorial = true;
                    }
                    if (socket) {
                        socket.emit('markTutorialWatched'); // 👈 THIS IS THE INSTANT SAVE!
                    }
                    
                    setTimeout(() => {
                        // 🛡️ FIX 3: Bulletproof string checking for the Map ID
                        let mapIdStr = (typeof safeMapData !== 'undefined' && safeMapData.id) ? String(safeMapData.id) : 'town';
                        let nextTrack = window.routeMapMusic(mapIdStr);
                        
                        window.playBGM(nextTrack);
                        try { window.showMapAnnouncement(mapIdStr); } catch(e) {}
                    }, 100);
                };

                vid.onended = closeTutorial; 
                skipBtn.onclick = closeTutorial; 

                overlay.appendChild(vid);
                overlay.appendChild(skipBtn);
                vid.play().catch(e => console.warn("Browser blocked autoplay. User must click play."));
            })
            .catch(err => {
                console.error("Tutorial fetch failed:", err);
                if (overlay) overlay.remove();
                // 🛡️ THE SUPABASE FIX: Fire an instant, priority socket command bypassing the 600ms delay
                    if (game.player.baseStats) {
                        game.player.baseStats.watchedTutorial = true;
                    }
                    if (socket) {
                        socket.emit('markTutorialWatched'); 
                    }
                    if (typeof DatabaseManager !== 'undefined') {
                        DatabaseManager.savePlayerData(game.player); // Keep as a secondary backup
                    }
                
                let mapIdStr = (typeof safeMapData !== 'undefined' && safeMapData.id) ? String(safeMapData.id) : 'town';
                let nextTrack = mapIdStr.includes('floor') ? 'floors' : 'town';
                window.playBGM(nextTrack);
                try { window.showMapAnnouncement(mapIdStr); } catch(e) {}
            });
    }
};
// ==========================================
// 💳 REAL MONEY CASH SHOP & 2FA UI
// ==========================================

window.openRealMoneyShop = function() {
    let modal = document.getElementById('rm-shop-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'rm-shop-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#111; border:2px solid #E040FB; padding:20px; z-index:9000; width:350px; border-radius:8px; box-shadow:0 0 30px #E040FB; color:white; text-align:center; font-family:sans-serif;';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = '<h2 style="color:#E040FB;">Connecting to Server...</h2>';
    modal.style.display = 'block';
    
    if (socket) socket.emit('requestShopAccess');
};

if (socket) {
  socket.on('shopAuthState', (data) => {
        let modal = document.getElementById('rm-shop-modal');
        if (!modal) return;

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #444; padding-bottom:10px;">
                <h2 style="margin:0; color:#E040FB; text-shadow: 0 0 10px #E040FB;">💎 Exo Emporium</h2>
                <div style="background:#222; padding:5px 10px; border-radius:4px; border:1px solid #E040FB;">
                    <span style="color:#aaa; font-size:12px;">Balance:</span>
                    <strong id="ui-gem-balance" style="color:#E040FB; font-size:16px; margin-left:5px;">${data.exoGems || 0}</strong>
                </div>
            </div>
        `;

        if (data.state === 'shop_open') {
            const items = [
                { id: 'aura_easter', name: 'Easter Aura Stone', priceGems: 15, desc: 'Seasonal Cosmetic: A beautiful pastel aura that shifts colors.', isSeasonal: true },
                { id: 'pet_egg', name: 'Easter Egg Pet', priceGems: 15, desc: 'Seasonal Cosmetic: A cute floating Easter Egg that follows you.', isSeasonal: true },
                { id: 'name_change', name: 'Name Change Ticket', priceGems: 15, desc: 'Permanently changes your character name. (Cannot be undone)' },
                { id: 'edit_char', name: 'Appearance Reroll Ticket', priceGems: 15, desc: 'Re-open the character creator to change your hair, skin color, and style.' },
                { id: 'pet_fox', name: 'Spirit Fox Pet', priceGems: 10, desc: 'A loyal fire-fox companion that follows you and attacks enemies.' },
                { id: 'pet_owl', name: 'Night Owl Pet', priceGems: 10, desc: 'A mysterious owl that flies by your side.' },
                { id: 'aura_blaze', name: 'Blaze Aura Stone', priceGems: 10, desc: 'Cosmetic: Infuses your armor with a burning red flame effect.' },
                { id: 'aura_liquid', name: 'Liquid Aura Stone', priceGems: 10, desc: 'Cosmetic: Infuses your armor with a flowing water effect.' },
                { id: 'aura_nature', name: 'Nature Aura Stone', priceGems: 10, desc: 'Cosmetic: Infuses your armor with a leaf and vine effect.' },
                { id: 'divine_pack', name: 'Divine Stone Bundle (x5)', priceGems: 10, desc: 'Contains 5 Divine Enhancement Stones. Works on any level.' },
                { id: 'revival_pack', name: 'Revival Juice Bundle (x10)', priceGems: 5, desc: 'Contains 10 Revival Juices. Revive instantly on the spot.' }
            ];

            html += `<div style="max-height:250px; overflow-y:auto; padding-right:5px;">`;
            items.forEach(i => {
                let nameColor = i.isSeasonal ? '#FFD700' : '#E040FB';
                let shadow = i.isSeasonal ? 'text-shadow: 0 0 10px #FFD700;' : '';
                let border = i.isSeasonal ? 'border: 2px solid #FFD700; box-shadow: inset 0 0 10px rgba(255, 215, 0, 0.15);' : 'border: 1px solid #444;';
                let tag = i.isSeasonal ? ' <span style="font-size:11px; color:#fff;">🐰 (Seasonal)</span>' : '';

                html += `<div style="background:#222; ${border} padding:10px; border-radius:6px; margin-bottom:10px; text-align:left;">
                            <div style="color:${nameColor}; font-weight:bold; font-size:15px; ${shadow}">${i.name}${tag}</div>
                            <div style="color:#aaa; font-size:12px; margin-bottom:8px;">${i.desc}</div>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:5px;">
                                <button class="btn" style="background:#333; padding:8px 10px; font-size:14px; color:#E040FB; border-color:#9c27b0; flex:1; font-weight:bold; cursor:pointer; box-shadow: 0 0 5px #9c27b0;" onclick="window.buyWithGems('${i.id}', '${i.name}', ${i.priceGems})">💎 Buy for ${i.priceGems} Exo Gems</button>
                            </div>
                         </div>`;
            });
            html += `</div>`;
        }

        // 💳 NATIVE PLATFORM STORE BUTTONS
        html += `
            <div style="margin-top:15px; display:flex; flex-direction:column; gap:8px;">
                <h3 style="color:#aaa; font-size:14px; margin: 0 0 5px 0; border-bottom:1px solid #333; padding-bottom:5px;">Get More Exo Gems</h3>
                <div style="display:flex; gap:5px;">
                    <button class="btn" style="background:#2196F3; flex:1; font-weight:bold; padding:10px;" onclick="window.purchaseExoGems('gem_pack_50', 50)">💎 50 Gems</button>
                    <button class="btn" style="background:#9c27b0; flex:1; font-weight:bold; padding:10px;" onclick="window.purchaseExoGems('gem_pack_120', 120)">💎 120 Gems</button>
                </div>
                <button class="btn" style="background:#555; width:100%; margin-top:5px; padding:10px;" onclick="document.getElementById('rm-shop-modal').style.display='none'">Close</button>
            </div>
        `;
        modal.innerHTML = html;
    });

    socket.on('gemPurchaseSuccess', (data) => {
        let balEl = document.getElementById('ui-gem-balance');
        if (balEl) balEl.innerText = data.newGems;
    });

    socket.on('receiptVerified', (data) => {
        let balEl = document.getElementById('ui-gem-balance');
        if (balEl) balEl.innerText = data.newGems;
        
        document.getElementById('rm-shop-modal').innerHTML = `
            <h2 style="color:#4CAF50; margin-top: 20px;">Purchase Successful!</h2>
            <p style="color:#fff;">Added ${data.gemsAdded} Exo Gems to your account.</p>
            <button class="btn" style="background:#555; width:100%; margin-top:15px;" onclick="window.openRealMoneyShop()">Back to Shop</button>
        `;
        if (dom.log) dom.log.innerText = `Purchase Verified! Added ${data.gemsAdded} Exo Gems.`;
    });

    socket.on('receiptFailed', (errorMsg) => {
        alert("Purchase verification failed: " + errorMsg);
        window.openRealMoneyShop();
    });
}

// ==========================================
// 💳 PLATFORM IAP ROUTER (STEAM / GOOGLE PLAY)
// ==========================================
window.currentPlatform = 'web';
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
    window.currentPlatform = 'steam'; 
} else if (window.Capacitor || (window.cordova && window.cordova.plugins)) {
    window.currentPlatform = 'android'; 
}

window.purchaseExoGems = function(packageId, gemAmount) {
    document.getElementById('rm-shop-modal').innerHTML = '<h2 style="color:#E040FB; margin-top: 20px;">Connecting to Store...</h2>';

    if (window.currentPlatform === 'steam') {
        if (window.electronAPI) window.electronAPI.initiateSteamPurchase(packageId);
    } 
    else if (window.currentPlatform === 'android') {
        if (window.CdvPurchase) window.CdvPurchase.store.order(packageId);
    } 
    else {
        // ⚠️ FALLBACK: If a player clicks this in a regular web browser
        alert("In-App Purchases are only available via the Steam or Android versions of Exonie!");
        window.openRealMoneyShop(); 
    }
};

// 📥 LISTENS FOR THE RECEIPT FROM THE WRAPPERS
window.addEventListener('StorePurchaseSuccess', (event) => {
    const receiptData = event.detail;
    document.getElementById('rm-shop-modal').innerHTML = '<h2 style="color:#4CAF50; margin-top: 20px;">Verifying Purchase...</h2>';
    
    // Sends the receipt securely to server.js
    if (socket) {
        socket.emit('verifyStoreReceipt', {
            platform: window.currentPlatform,
            receipt: receiptData.receiptToken,
            packageId: receiptData.packageId
        });
    }
});

window.buyWithGems = function(itemId, name, price) {
    if (!confirm(`Spend ${price} Exo Gems to purchase ${name}?`)) return;
    socket.emit('requestGemPurchase', { itemId: itemId });
};
// ==========================================
// 💎 ULTIMATE MOBILE SHOP BUTTON INJECTION
// ==========================================
let shopRetryCount = 0;
let shopInjectInterval = setInterval(() => {
    const parent = document.getElementById('game-container');
    
    if (parent) {
        // Only show on Mobile/Small Screens
        if (window.isMobileUI()) {
            if (!document.getElementById('mobile-shop-btn')) {
                let shopBtn = document.createElement('button');
                shopBtn.id = 'mobile-shop-btn';
                shopBtn.innerHTML = '💎';
                // Positioned specifically to not overlap the Trophy button
                shopBtn.style.cssText = `
                    position: fixed; 
                    top: 125px; 
                    right: 15px; 
                    width: 45px; 
                    height: 45px; 
                    background: #111; 
                    color: white; 
                    border: 2px solid #E040FB; 
                    border-radius: 8px; 
                    font-size: 20px; 
                    display: flex; 
                    justify-content: center; 
                    align-items: center; 
                    z-index: 9999; 
                    cursor: pointer; 
                    box-shadow: 0 0 15px #E040FB;
                `;

                const handleShop = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.openRealMoneyShop();
                };

                shopBtn.onclick = handleShop;
                shopBtn.ontouchstart = handleShop;
                parent.appendChild(shopBtn);
            }
        }
        clearInterval(shopInjectInterval);
    }

    shopRetryCount++;
    if (shopRetryCount > 30) clearInterval(shopInjectInterval); // Stop after 30s
}, 1000);
// ==========================================
// 📜 DAILY MISSIONS ENGINE
// ==========================================
window.openDailyMissionsUI = function() {
    let modal = document.getElementById('daily-missions-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'daily-missions-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #FF9800; padding:20px; z-index:9000; width:350px; border-radius:8px; box-shadow:0 0 30px #FF9800; color:white; text-align:center; font-family:sans-serif;';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = '<h2 style="color:#FF9800; margin-top:0;">Loading Missions...</h2>';
    modal.style.display = 'block';
    
    if (window.isMobileUI()) {
        window.enableMobileWindowControls(modal);
        window.bringWindowToFront(modal);
        window.clampWindowToViewport(modal);
    }
    
    if (socket) socket.emit('requestDailyMission');
};

if (socket) {
    socket.on('dailyMissionData', (data) => {
        const modal = document.getElementById('daily-missions-modal');
        if (!modal) return;

        let html = `
            <div class="window-drag-handle" style="cursor:grab; padding:10px; background:#222; margin:-20px -20px 15px -20px; border-radius:8px 8px 0 0; border-bottom:1px solid #FF9800;">
                <h2 style="margin:0; color:#FF9800; pointer-events:none;">📜 Daily Mission</h2>
            </div>
        `;

        if (data.active) {
            let progressPct = Math.min(100, (data.currentKills / data.requiredKills) * 100);
            let barColor = data.completed ? '#4CAF50' : '#2196F3';
            
            html += `<p style="color:#ccc; font-size:14px; margin-bottom:10px;">Difficulty: <strong style="color:#E040FB;">${data.difficulty}</strong></p>`;
            
            if (data.completed) {
                html += `<div style="background:#111; padding:15px; border:1px solid #4CAF50; border-radius:8px; margin-bottom:15px;">
                            <h3 style="color:#4CAF50; margin:0 0 10px 0;">🎉 Mission Completed!</h3>
                            <p style="color:#FFD700; margin:0; font-weight:bold;">Reward: ${data.reward.toLocaleString()} G</p>
                         </div>`;
                html += `<p style="color:#888; font-size:12px;">Come back tomorrow for a new mission.</p>`;
            } else {
                let floorDisplay = data.difficulty === 'Beginner' ? '1-2' : (data.difficulty === 'Novice' ? '3-4' : '5-6');
                
                html += `<div style="background:#111; padding:15px; border:1px dashed #FF9800; border-radius:8px; margin-bottom:15px; text-align:left;">
                            <div style="font-weight:bold; color:#fff; margin-bottom:8px;">Defeat ${data.requiredKills} ${data.targetName}s in Floor ${floorDisplay}</div>
                            <div style="display:flex; justify-content:space-between; font-size:12px; color:#aaa; margin-bottom:5px;">
                                <span>Progress</span>
                                <span>${data.currentKills} / ${data.requiredKills}</span>
                            </div>
                            <div style="background:#222; border-radius:4px; height:10px; width:100%; overflow:hidden;">
                                <div style="background:${barColor}; width:${progressPct}%; height:100%; transition:width 0.3s;"></div>
                            </div>
                            <div style="margin-top:10px; color:#FFD700; font-size:13px; font-weight:bold; text-align:right;">Reward: ${data.reward.toLocaleString()} G</div>
                         </div>`;
            }
        } else {
            html += `<p style="color:#ccc; font-size:13px; margin-bottom:15px;">Accept a daily mission to earn large amounts of Gold! You can only complete one mission per day.</p>`;
            html += `<div style="display:flex; flex-direction:column; gap:10px; margin-bottom:15px;">
                        <button class="btn" style="background:#4CAF50; padding:10px; font-weight:bold;" onclick="window.acceptDailyMission('Beginner')">Beginner (Floor 1-2) - 25,000 G</button>
                        <button class="btn" style="background:#2196F3; padding:10px; font-weight:bold;" onclick="window.acceptDailyMission('Novice')">Novice (Floor 3-4) - 100,000 G</button>
                        <button class="btn" style="background:#f44336; padding:10px; font-weight:bold;" onclick="window.acceptDailyMission('Expert')">Expert (Floor 5-6) - 250,000 G</button>
                     </div>`;
        }

        html += `<button class="btn" style="background:#555; width:100%;" onclick="document.getElementById('daily-missions-modal').style.display='none'">Close</button>`;
        modal.innerHTML = html;
    });

    socket.on('dailyMissionUpdate', (missionData) => {
        if (game.player.baseStats) game.player.baseStats.dailyMission = missionData;
        if (document.getElementById('daily-missions-modal')?.style.display === 'block') {
            socket.emit('requestDailyMission'); // Refresh UI live
        }
    });
}

window.acceptDailyMission = function(difficulty) {
    if (confirm(`Accept the ${difficulty} Daily Mission? You cannot change this later today.`)) {
        if (socket) socket.emit('acceptDailyMission', difficulty);
        document.getElementById('daily-missions-modal').innerHTML = '<h2 style="color:#FF9800; margin-top: 20px;">Processing...</h2>';
    }
};
// ==========================================
// ⚖️ AUCTION HOUSE UI LOGIC
// ==========================================
let ahSelectedInvIndex = -1;
// ==========================================
// ✨ DIVINE FORGE UI ENGINE
// ==========================================
window.openDivineForge = function() {
    document.getElementById('merchant-modal').style.display = 'none';
    
    let modal = document.getElementById('divine-forge-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'divine-forge-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #ffea00; padding:20px; z-index:9000; width:450px; border-radius:8px; box-shadow:0 0 30px #ffea00; color:white; text-align:center;';
        document.body.appendChild(modal);
    }
    
    window.renderDivineForge();
    modal.style.display = 'block';
};
let forgeSelectedIndex = -1;
window.renderDivineForge = function() {
    let modal = document.getElementById('divine-forge-modal');
    
    let html = '<h2 style="margin-top:0; color:#ffea00; text-shadow: 0 0 10px #ffea00;">✨ Divine Forge</h2>';
    html += '<p style="font-size:12px; color:#aaa;">Select a Godly equipment to ascend it to Divine.</p>';
    html += '<div id="forge-grid" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; max-height:160px; overflow-y:auto; margin-bottom:15px; padding:10px 5px; border:1px solid #333; background:#111; align-items:flex-start;">';
    
    const inv = game.player.inventory || [];
    let hasGodly = false;
    
    for (let i = 0; i < inv.length; i++) {
        if (inv[i] && inv[i].rarity === 'Godly' && ['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings'].includes(inv[i].type)) {
            hasGodly = true;
            let isSelected = (forgeSelectedIndex === i);
            let borderCol = isSelected ? '#ffea00' : '#444';
            let bgCol = isSelected ? 'rgba(255, 234, 0, 0.2)' : '#222';
            
            // 🛡️ THE FIX: Removed the restrictive 'inv-slot' class and replaced it with a flexible, wide button!
            html += `<div style="border:2px solid ${borderCol}; background:${bgCol}; cursor:pointer; padding:8px 12px; border-radius:6px; font-size:13px; font-weight:bold; color:${inv[i].color}; display:inline-block; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.5); transition:all 0.2s ease;" onclick="window.selectForgeItem(${i})">
                        ${inv[i].enhanceLevel ? `${inv[i].name} +${inv[i].enhanceLevel}` : inv[i].name}
                     </div>`;
        }
    }
    
    if (!hasGodly) html += '<p style="color:#555; width:100%; margin:10px 0;">No Godly equipment found in inventory.</p>';
    html += '</div>';
    
    html += '<div id="forge-reqs" style="background:#222; padding:10px; border-radius:5px; margin-bottom:15px; min-height:80px; font-size:13px; text-align:left;">';
    if (forgeSelectedIndex !== -1 && inv[forgeSelectedIndex]) {
        let item = inv[forgeSelectedIndex];
        let type = item.type;
        let reqE = 0, reqR = 0, reqG = 0, reqB = 0, reqGold = 0;
        
        if (type === 'weapon') { reqE=3; reqR=1; reqG=1; reqB=1; reqGold=3000000; }
        else if (type === 'armor' || type === 'leggings') { reqE=1; reqR=1; reqG=1; reqB=1; reqGold=1000000; }
        else { reqE=5; reqR=2; reqG=2; reqB=2; reqGold=5000000; }
        
       // 🛡️ UI FIX: We actually need to count the Divine Essence, and use fuzzy matching!
        let cE=0, cR=0, cG=0, cB=0;
        inv.forEach(x => {
            if (!x || !x.name) return;
            const n = String(x.name).trim();
            if (n.includes('Divine Essence')) cE += x.quantity || 1;
            if (n.includes('Red Exo Metal')) cR += x.quantity || 1;
            if (n.includes('Green Exo Metal')) cG += x.quantity || 1;
            if (n.includes('Blue Exo Metal')) cB += x.quantity || 1;
        });
        
        const col = (have, need) => have >= need ? '#4CAF50' : '#f44336';
        const gCol = (game.player.gold >= reqGold) ? '#4CAF50' : '#f44336';
        
        html += `<div style="text-align:center; font-weight:bold; margin-bottom:5px; color:#fff;">Requirements to ascend ${item.name}</div>`;
        html += `<div><span style="color:${col(cE,reqE)}">${cE}/${reqE} Divine Essence</span></div>`;
        html += `<div><span style="color:${col(cR,reqR)}">${cR}/${reqR} Red Exo Metal</span></div>`;
        html += `<div><span style="color:${col(cG,reqG)}">${cG}/${reqG} Green Exo Metal</span></div>`;
        html += `<div><span style="color:${col(cB,reqB)}">${cB}/${reqB} Blue Exo Metal</span></div>`;
        html += `<div style="margin-top:5px; font-weight:bold; color:${gCol}">${game.player.gold.toLocaleString()} / ${reqGold.toLocaleString()} Gold</div>`;
        
        let canCraft = (cE>=reqE && cR>=reqR && cG>=reqG && cB>=reqB && game.player.gold >= reqGold);
        html += `</div><button class="btn" style="background:${canCraft ? '#2196F3' : '#555'}; width:100%; margin-bottom:5px;" ${canCraft ? '' : 'disabled'} onclick="window.requestDivineCraft()">Ascend to Divine</button>`;
    } else {
        html += '<p style="color:#aaa; text-align:center; margin-top:25px;">Select a Godly item to view requirements.</p></div>';
    }
    
    html += `<button class="btn" style="background:#f44336; width:100%;" onclick="document.getElementById('divine-forge-modal').style.display='none'; document.getElementById('merchant-modal').style.display='block'; forgeSelectedIndex = -1;">Back</button>`;
    
    modal.innerHTML = html;
};
window.selectForgeItem = function(index) {
    forgeSelectedIndex = index;
    window.renderDivineForge();
};

window.requestDivineCraft = function() {
    if (forgeSelectedIndex === -1) return;
    socket.emit('requestCraftDivine', { baseIndex: forgeSelectedIndex });
    document.getElementById('divine-forge-modal').innerHTML = '<h2 style="color:#ffea00; margin-top: 50px;">Forging in the Heavens...</h2>';
};
// Listen for Success to return to the UI
if (socket) {
    socket.on('craftSuccess', () => {
        forgeSelectedIndex = -1;
        setTimeout(() => { if (document.getElementById('divine-forge-modal').style.display === 'block') window.renderDivineForge(); }, 1500);
    });
}

// ==========================================
// 🪄 FORGER CRAFTING & REROLL UI
// ==========================================
window.isApplyingForger = false;

window.openForgerStatSelect = function(targetIndex, e) {
    e.stopPropagation();
    let item = game.player.inventory[targetIndex];
    let forgerItem = game.player.inventory[activeInvIndex]; 

    if (!item || ['necklace', 'ring', 'earrings'].includes(item.type)) {
        dom.log.innerText = "❌ Cannot reroll accessories!";
        window.isApplyingForger = false; window.renderInventory(); return;
    }
    if (item.rarity !== forgerItem.rarity) {
        dom.log.innerText = `❌ You need a ${item.rarity} Forger to reroll this item!`;
        window.isApplyingForger = false; window.renderInventory(); return;
    }
    if (!item.randomStat || Object.keys(item.randomStat).length === 0) {
        dom.log.innerText = "❌ This item has no sub-stats to reroll.";
        window.isApplyingForger = false; window.renderInventory(); return;
    }

    let modal = document.getElementById('forger-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'forger-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #E040FB; padding:20px; z-index:9000; width:320px; border-radius:8px; box-shadow:0 0 30px #E040FB; color:white; text-align:center;';
        document.body.appendChild(modal);
    }
    
    let html = '<h2 style="margin-top:0; color:#E040FB;">✨ Select Sub-Stat</h2>';
    html += `<p style="color:#aaa; font-size:12px; margin-bottom:15px;">Target: ${item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name}</p>`;
    
    for (let k in item.randomStat) {
        html += `<button class="btn" style="width:100%; margin-bottom:8px; background:#333; border:1px solid #E040FB; color:#E040FB;" onclick="window.confirmForgerReroll(${targetIndex}, '${k}')">Reroll +${item.randomStat[k]} ${k.toUpperCase()}</button>`;
    }
    
    html += `<button class="btn" style="background:#f44336; width:100%; margin-top:10px;" onclick="document.getElementById('forger-modal').style.display='none'; window.isApplyingForger=false; window.renderInventory();">Cancel</button>`;
    
    modal.innerHTML = html;
    modal.style.display = 'block';
};

window.confirmForgerReroll = function(targetIndex, statKey) {
    if (socket) socket.emit('requestRerollStat', { forgerIndex: activeInvIndex, targetIndex: targetIndex, statKey: statKey });
    document.getElementById('forger-modal').innerHTML = '<h2 style="color:#E040FB; margin-top: 20px;">Rerolling...</h2>';
};

window.openConsumablesCrafting = function() {
    document.getElementById('merchant-modal').style.display = 'none';
    let modal = document.getElementById('consumables-craft-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'consumables-craft-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #E040FB; padding:20px; z-index:9000; width:350px; border-radius:8px; box-shadow:0 0 30px #E040FB; color:white; text-align:center; max-height: 80vh; overflow-y: auto;';
        document.body.appendChild(modal);
    }
    window.renderConsumablesCrafting();
    modal.style.display = 'block';
};

window.forgerSelectedRarity = window.forgerSelectedRarity || 'Godly';

window.updateForgerRarity = function(val) {
    window.forgerSelectedRarity = val;
    window.renderConsumablesCrafting();
};

window.renderConsumablesCrafting = function() {
    let modal = document.getElementById('consumables-craft-modal');
    let selRarity = window.forgerSelectedRarity;
    
    let reqExo=3, reqGold=300000, reqStones=3;
    const inv = game.player.inventory || [];
    let cR=0, cG=0, cB=0, cStones=0;
    inv.forEach(x => {
        if (!x || !x.name) return;
        const n = String(x.name).trim();
        if (n.includes('Red Exo Metal')) cR += x.quantity || 1;
        if (n.includes('Green Exo Metal')) cG += x.quantity || 1;
        if (n.includes('Blue Exo Metal')) cB += x.quantity || 1;
        if (n.includes('Refinement Stone') && (selRarity === 'Divine' || x.level >= 100) && x.rarity === selRarity) cStones += x.quantity || 1;
    });
    
    const col = (have, need) => have >= need ? '#4CAF50' : '#f44336';
    const gCol = (game.player.gold >= reqGold) ? '#4CAF50' : '#f44336';
    let canCraftForger = (cR>=reqExo && cG>=reqExo && cB>=reqExo && cStones>=reqStones && game.player.gold >= reqGold);

    let html = '<h2 style="margin-top:0; color:#E040FB; text-shadow: 0 0 10px #E040FB;">🧪 Consumables</h2>';
    html += '<p style="font-size:12px; color:#aaa;">Craft powerful consumable items.</p>';
    
    // --- ITEM 1: STAT FORGER ---
    html += '<div style="background:#222; padding:10px; border-radius:5px; margin-bottom:15px; font-size:13px; text-align:left; border: 1px solid #444;">';
    html += `<div style="color:#E040FB; font-weight:bold; font-size:16px; margin-bottom:5px; text-align:center;">✨ Stat Forger</div>`;
    html += '<p style="font-size:11px; color:#aaa; margin-top:0; text-align:center;">Rerolls a random sub-stat. Select rarity:</p>';
    html += `<select onchange="window.updateForgerRarity(this.value)" style="width:100%; padding:8px; margin-bottom:10px; background:#333; color:white; border:1px solid #E040FB; border-radius:4px; outline:none;">
        <option value="Basic" ${selRarity === 'Basic' ? 'selected' : ''}>Basic</option>
        <option value="Rare" ${selRarity === 'Rare' ? 'selected' : ''}>Rare</option>
        <option value="Unique" ${selRarity === 'Unique' ? 'selected' : ''}>Unique</option>
        <option value="Legendary" ${selRarity === 'Legendary' ? 'selected' : ''}>Legendary</option>
        <option value="Godly" ${selRarity === 'Godly' ? 'selected' : ''}>Godly</option>
        <option value="Divine" ${selRarity === 'Divine' ? 'selected' : ''}>Divine</option>
    </select>`;
    html += `<div><span style="color:${col(cR,reqExo)}">${cR}/${reqExo} Red Exo Metal</span></div>`;
    html += `<div><span style="color:${col(cG,reqExo)}">${cG}/${reqExo} Green Exo Metal</span></div>`;
    html += `<div><span style="color:${col(cB,reqExo)}">${cB}/${reqExo} Blue Exo Metal</span></div>`;
    html += `<div><span style="color:${col(cStones,reqStones)}">${cStones}/${reqStones} ${selRarity} Ref. Stone Lv.100</span></div>`;
    html += `<div style="margin-top:5px; font-weight:bold; color:${gCol}">${(game.player.gold || 0).toLocaleString()} / ${reqGold.toLocaleString()} Gold</div>`;
    html += `<button class="btn" style="background:${canCraftForger ? '#E040FB' : '#555'}; color:white; width:100%; margin-top:10px; font-weight:bold;" ${canCraftForger ? '' : 'disabled'} onclick="if(socket) socket.emit('requestCraftForger', { rarity: '${selRarity}' })">Craft ${selRarity} Forger</button>`;
    html += '</div>';

    html += `<button class="btn" style="background:#f44336; width:100%;" onclick="document.getElementById('consumables-craft-modal').style.display='none'; document.getElementById('merchant-modal').style.display='block';">Back</button>`;
    modal.innerHTML = html;
};

if (socket) {
    socket.on('craftForgerSuccess', () => {
        setTimeout(() => { if (document.getElementById('consumables-craft-modal') && document.getElementById('consumables-craft-modal').style.display === 'block') window.renderConsumablesCrafting(); }, 100);
    });
    socket.on('rerollSuccess', () => {
        let modal = document.getElementById('forger-modal');
        if (modal) modal.style.display = 'none';
        window.isApplyingForger = false;
        activeInvIndex = -1;
        window.renderInventory();
    });
}

// 🪄 HOOK INTO THE EXISTING BLACKSMITH BUTTON
setTimeout(() => {
    let merchantModal = document.getElementById('merchant-modal');
    if (merchantModal) {
        let buttons = merchantModal.getElementsByTagName('button');
        for (let btn of buttons) {
            if (btn.innerText.toLowerCase().includes('blacksmith')) {
               btn.innerText = 'Blacksmith (Divine Forge)';
                btn.onclick = window.openDivineForge;
                // 🛡️ UI FIX: Expanded width, block display, and added pointer cursor!
                btn.style.cssText = 'background: linear-gradient(45deg, #ff9800, #ffea00); color: black; font-weight: bold; width: 100%; margin-bottom: 10px; box-shadow: 0 0 10px #ff9800; border: none; padding: 10px; cursor: pointer; border-radius: 4px; box-sizing: border-box; display: block;';
                
              // 👇 INJECT CONSUMABLES BUTTON RIGHT AFTER IT
                if (!document.getElementById('btn-consumables-craft')) {
                    let consBtn = document.createElement('button');
                    consBtn.id = 'btn-consumables-craft';
                    consBtn.className = 'btn';
                    consBtn.innerText = 'Consumables Crafting';
                    consBtn.style.cssText = 'background: linear-gradient(45deg, #9c27b0, #E040FB); color: white; font-weight: bold; width: 100%; margin-bottom: 10px; box-shadow: 0 0 10px #E040FB; border: none; padding: 10px; cursor: pointer; border-radius: 4px; display: block; box-sizing: border-box;';
                    consBtn.onclick = window.openConsumablesCrafting;
                    btn.parentNode.insertBefore(consBtn, btn.nextSibling);
                    
                    // 👇 INJECT COSMETICS BUTTON RIGHT AFTER CONSUMABLES
                    if (!document.getElementById('btn-cosmetics-craft')) {
                        let cosBtn = document.createElement('button');
                        cosBtn.id = 'btn-cosmetics-craft';
                        cosBtn.className = 'btn';
                        cosBtn.innerText = 'Cosmetics Crafting (Pets)';
                        cosBtn.style.cssText = 'background: linear-gradient(45deg, #311B92, #E040FB); color: white; font-weight: bold; width: 100%; margin-bottom: 10px; box-shadow: 0 0 10px #E040FB; border: none; padding: 10px; cursor: pointer; border-radius: 4px; display: block; box-sizing: border-box;';
                        cosBtn.onclick = window.openCosmeticsCrafting;
                        consBtn.parentNode.insertBefore(cosBtn, consBtn.nextSibling); // 🛡️ THE FIX: Attach it to consBtn instead of the deleted forgerBtn!
                    }
                }
                break;
            }
        }
    }
}, 2000);

window.openAuctionHouse = function() {
    document.getElementById('merchant-modal').style.display = 'none';
    document.getElementById('ah-modal').style.display = 'block';
    window.switchAhTab('browse');
};

window.switchAhTab = function(tab) {
    document.getElementById('ah-tab-browse').classList.remove('selected');
    document.getElementById('ah-tab-sell').classList.remove('selected');
    document.getElementById('ah-tab-my').classList.remove('selected');
    
    document.getElementById('ah-view-browse').style.display = 'none';
    document.getElementById('ah-view-sell').style.display = 'none';
    document.getElementById('ah-view-my').style.display = 'none';

    document.getElementById(`ah-tab-${tab}`).classList.add('selected');
    document.getElementById(`ah-view-${tab}`).style.display = 'block';

    if (tab === 'browse') {
        document.getElementById('ah-search-input').value = '';
        document.getElementById('ah-browse-results').innerHTML = '<p style="color:#aaa; text-align:center;">Loading...</p>';
        socket.emit('ah_search', ''); 
    }
    if (tab === 'sell') window.renderAhSellGrid();
    if (tab === 'my') {
        document.getElementById('ah-my-results').innerHTML = '<p style="color:#aaa; text-align:center;">Loading...</p>';
        socket.emit('ah_getMyAuctions');
    }
};

window.ahSearch = function() {
    const query = document.getElementById('ah-search-input').value.trim();
    document.getElementById('ah-browse-results').innerHTML = '<p style="color:#aaa; text-align:center;">Searching...</p>';
    socket.emit('ah_search', query);
};

window.renderAhSellGrid = function() {
    const grid = document.getElementById('ah-sell-grid');
    grid.innerHTML = '';
    ahSelectedInvIndex = -1;
    document.getElementById('ah-selected-item-name').innerText = "No item selected";
    document.getElementById('ah-selected-item-tooltip').innerHTML = ""; // Clear tooltip on refresh

    const inv = game.player.inventory || [];
    for (let i = 0; i < inv.length; i++) {
        const slot = document.createElement('div');
        slot.className = 'inv-slot';
        if (inv[i]) {
            slot.style.borderBottom = `3px solid ${inv[i].color || '#fff'}`;
            let displayName = inv[i].enhanceLevel ? `${inv[i].name} +${inv[i].enhanceLevel}` : inv[i].name;
            slot.innerText = displayName;
            
            if (inv[i].quantity && inv[i].quantity > 1) { 
                let q = document.createElement('span'); 
                q.className = 'inv-qty'; q.innerText = 'x' + inv[i].quantity; 
                slot.appendChild(q); 
            }

            slot.onclick = () => {
                document.querySelectorAll('#ah-sell-grid .inv-slot').forEach(s => s.style.borderColor = '#444');
                slot.style.borderColor = '#ff9800';
                ahSelectedInvIndex = i;
                document.getElementById('ah-selected-item-name').style.color = inv[i].color || '#fff';
                document.getElementById('ah-selected-item-name').innerText = `Selling 1x: ${displayName}`;
                // 🛡️ THE FIX: Render the exact item stats to the seller!
                document.getElementById('ah-selected-item-tooltip').innerHTML = window.getItemTooltip(inv[i]);
            };
        }
        grid.appendChild(slot);
    }
};

window.ahList = function() {
    if (ahSelectedInvIndex === -1) return dom.log.innerText = "Select an item to sell first.";
    const item = game.player.inventory[ahSelectedInvIndex];
    
    // 🐰 THE FIX: Allow Seasonal cosmetics/pets to bypass the auction lock!
    if (item && item.type === 'aura' && !item.isSeasonal && !String(item.name).includes('Easter')) {
        return dom.log.innerText = "Normal cosmetics and pets cannot be auctioned!";
    }
    
    // 🛡️ THE FIX: Prevent listing bound gear
    if (item && (item.rarity === 'Godly' || item.rarity === 'Divine') && item.enhanceLevel > 0) {
        return dom.log.innerText = "Enhanced Godly and Divine gear cannot be auctioned!";
    }

    const price = parseInt(document.getElementById('ah-sell-price').value);
    if (isNaN(price) || price < 1) return dom.log.innerText = "Invalid price.";
    
    socket.emit('ah_list', { invIndex: ahSelectedInvIndex, price: price });
    document.getElementById('ah-selected-item-name').innerText = "Processing...";
};

window.ahBuy = function(auctionId, price, name) {
    if (!confirm(`Buy ${name} for ${price} Gold?`)) return;
    socket.emit('ah_buy', { auctionId });
};

window.ahCancel = function(auctionId) {
    if (!confirm(`Cancel this auction? The item will be returned to your inventory.`)) return;
    socket.emit('ah_cancel', { auctionId });
};

// 📡 SOCKET LISTENERS FOR AUCTION HOUSE
if (socket) {
    socket.on('ah_searchResults', (results) => {
        const box = document.getElementById('ah-browse-results');
        if (!results || results.length === 0) {
            box.innerHTML = '<p style="color:#aaa; text-align:center;">No items found.</p>';
            return;
        }
        let html = '';
       results.forEach(r => {
            let item = r.item_data;
            let dName = item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name;
            let safeItemJson = encodeURIComponent(JSON.stringify(item)); // 🛡️ Safely package the data
            
            html += `<div class="ah-row">
                <div class="ah-item-info">
                    <div style="color:${item.color || '#fff'}; font-weight:bold; font-size:16px; cursor:pointer; text-decoration:underline; text-shadow: 0 0 5px ${item.color || '#fff'};" onclick="window.showLinkedItem('${safeItemJson}')" title="Click to inspect">${dName}</div>
                    <div style="font-size:12px; color:#888;">Seller: ${r.seller_name}</div>
                </div>
                <div class="ah-price">${r.price} G</div>
                <button class="btn" style="background:#4CAF50;" onclick="window.ahBuy('${r.id}', ${r.price}, '${dName.replace(/'/g, "\\'")}')">Buy</button>
            </div>`;
        });
        box.innerHTML = html;
    });

    socket.on('ah_myAuctions', (data) => {
        document.getElementById('ah-my-count').innerText = data.count;
        const box = document.getElementById('ah-my-results');
        if (data.count === 0) {
            box.innerHTML = '<p style="color:#aaa; text-align:center;">You have no active auctions.</p>';
            return;
        }
        let html = '';
        data.auctions.forEach(r => {
            let item = r.item_data;
            let dName = item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name;
            let safeItemJson = encodeURIComponent(JSON.stringify(item));
            
            html += `<div class="ah-row">
                <div class="ah-item-info">
                    <div style="color:${item.color || '#fff'}; font-weight:bold; font-size:16px; cursor:pointer; text-decoration:underline; text-shadow: 0 0 5px ${item.color || '#fff'};" onclick="window.showLinkedItem('${safeItemJson}')" title="Click to inspect">${dName}</div>
                </div>
                <div class="ah-price">${r.price} G</div>
                <button class="btn" style="background:#f44336;" onclick="window.ahCancel('${r.id}')">Cancel</button>
            </div>`;
        });
        box.innerHTML = html;
    });

    socket.on('ah_listSuccess', () => {
        dom.log.innerText = "Item listed on the Auction House!";
        window.switchAhTab('my'); // Auto-switch to see it
    });
}
// ==========================================
// ⚖️ AUCTION HOUSE: LIVE SEARCH FILTER
// ==========================================
setTimeout(() => {
    let searchInput = document.getElementById('ah-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            document.getElementById('ah-browse-results').innerHTML = '<p style="color:#aaa; text-align:center;">Searching...</p>';
            socket.emit('ah_search', this.value.trim());
        });
    }
}, 2000);
// ==========================================
// 🏡 PLAYER HOUSING SYSTEM
// ==========================================
window.openHomeSaleUI = function() {
    let modal = document.getElementById('home-sale-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'home-sale-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #4CAF50; padding:20px; z-index:9000; width:350px; border-radius:8px; box-shadow:0 0 30px #4CAF50; color:white; text-align:center; font-family:sans-serif;';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <h2 style="color:#4CAF50; margin-top:0; text-shadow: 0 0 10px #4CAF50;">🏡 Home For Sale!</h2>
        <p style="color:#ccc; font-size:14px;">Purchase your own private sanctuary. Relax, store your trophies, and invite your party over!</p>
        <div style="margin: 20px 0; padding: 15px; background: #111; border: 1px dashed #FFD700; border-radius: 8px;">
            <span style="color:#FFD700; font-size:26px; font-weight:bold; letter-spacing:1px;">1,000,000 G</span>
        </div>
        <button class="btn" style="background:#4CAF50; width:100%; margin-bottom:10px; font-size:16px; font-weight:bold; padding:12px;" onclick="window.buyHome()">Purchase Deed</button>
        <button class="btn" style="background:#f44336; width:100%;" onclick="document.getElementById('home-sale-modal').style.display='none'">Maybe Later</button>
    `;
    modal.style.display = 'block';
    
    if (window.isMobileUI()) {
        window.enableMobileWindowControls(modal);
        window.bringWindowToFront(modal);
        window.clampWindowToViewport(modal);
    }
};

window.buyHome = function() {
    if (game.player.gold < 1000000) {
        if (dom.log) dom.log.innerText = "❌ Not enough gold to buy a home!";
        return;
    }
    if (socket) socket.emit('requestBuyHome');
    document.getElementById('home-sale-modal').innerHTML = '<h2 style="color:#4CAF50; margin-top: 20px;">Processing Deeds...</h2>';
};
// ==========================================
// 🧰 HOME STORAGE SYSTEM
// ==========================================
window.openStorageUI = function() {
    window.isStorageOpen = true;
    if (!isInventoryOpen) window.toggleInventory();
    if (socket) socket.emit('requestOpenStorage');
};

window.closeStorageUI = function() {
    window.isStorageOpen = false;
    let modal = document.getElementById('storage-modal');
    if (modal) modal.style.display = 'none';
    window.renderInventory(); // Reset borders
};

window.renderStorageGrid = function(storage) {
    let modal = document.getElementById('storage-modal');
    if (!modal) return;

    // 🛡️ THE FIX: Wrapped the title in a drag handle so the window can be grabbed and moved!
    let html = '<div class="window-drag-handle" style="cursor:grab; padding:10px; background:#222; margin:-15px -15px 15px -15px; border-radius:8px 8px 0 0; border-bottom:1px solid #E040FB;"><h2 style="color:#E040FB; margin:0; pointer-events:none;">🧰 Home Storage</h2></div>';
    html += '<p style="font-size:12px; color:#aaa;">Click items in your Inventory to store them. Click items here to retrieve them.</p>';
    html += '<div style="display:flex; flex-wrap:wrap; gap:5px; justify-content:center; margin-bottom:15px; background:#111; padding:10px; border-radius:5px;">';
    
    for (let i = 0; i < 10; i++) {
        let item = storage[i];
        html += `<div class="inv-slot" style="border: 2px solid ${item ? item.color || '#fff' : '#444'}; cursor: pointer; width: 60px; height: 60px;" onclick="if(socket) socket.emit('transferFromStorage', ${i})">`;
        if (item) {
            html += `<span style="font-size:10px;">${item.enhanceLevel ? `+${item.enhanceLevel}` : ''} ${item.name.substring(0,8)}</span>`;
            if (item.quantity && item.quantity > 1) html += `<span class="inv-qty">x${item.quantity}</span>`;
            html += `<div class="tooltip">${window.getItemTooltip(item)}</div>`;
        } else {
            html += `<span style="color:#555; font-size:10px;">Empty</span>`;
        }
        html += `</div>`;
    }
    
    html += '</div>';
    html += `<button class="btn" style="background:#f44336; width:100%;" onclick="window.closeStorageUI()">Close Storage</button>`;
    
    modal.innerHTML = html;
};

if (socket) {
    socket.on('openStorageUI', (storage) => {
        let modal = document.getElementById('storage-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'storage-modal';
            modal.className = 'movable-window';
            modal.style.cssText = 'display:none; position:fixed; top:40%; left:30%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #E040FB; padding:15px; z-index:9000; width:340px; border-radius:8px; box-shadow:0 0 20px #E040FB; color:white; text-align:center;';
            document.body.appendChild(modal);
        }
        modal.style.display = 'block';
        window.renderStorageGrid(storage);
        
        // 🛡️ THE FIX: Removed the mobile-only check so it is draggable for EVERYONE!
        window.enableMobileWindowControls(modal);
        window.bringWindowToFront(modal);
    });

    socket.on('syncStorage', (storage) => {
        if (window.isStorageOpen) window.renderStorageGrid(storage);
    });
}
// ==========================================
// 👻 HAUNTED HOUSE ENGINE
// ==========================================
window.openHauntedHouseUI = function() {
    if (game.party && game.party.members && game.party.members.length > 1) {
        if (dom.log) dom.log.innerText = "❌ The Haunted House is a solo challenge. Please leave your party.";
        return;
    }

    let modal = document.getElementById('haunted-house-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'haunted-house-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #9c27b0; padding:20px; z-index:9000; width:350px; border-radius:8px; box-shadow:0 0 30px #9c27b0; color:white; text-align:center; font-family:sans-serif;';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <h2 style="color:#E040FB; margin-top:0; text-shadow: 0 0 10px #9c27b0;">Haunted House</h2>
        <p style="color:#ccc; font-size:13px; margin-bottom:20px;">Unlimited entries. No timers. Face the Wraith King.<br>The monster's level will be randomly rolled based on the difficulty.</p>
        
        <button class="btn" style="background:#4CAF50; width:100%; margin-bottom:10px; font-size:15px; font-weight:bold; padding:10px;" onclick="window.startHauntedHouse('Easy')">Easy (Lv 1-15) - 1,000 G</button>
        <button class="btn" style="background:#FF9800; width:100%; margin-bottom:10px; font-size:15px; font-weight:bold; padding:10px;" onclick="window.startHauntedHouse('Normal')">Normal (Lv 16-30) - 10,000 G</button>
        <button class="btn" style="background:#f44336; width:100%; margin-bottom:15px; font-size:15px; font-weight:bold; padding:10px;" onclick="window.startHauntedHouse('Hard')">Hard (Lv 31-80) - 500,000 G</button>
        
        <button class="btn" style="background:#555; width:100%;" onclick="document.getElementById('haunted-house-modal').style.display='none'">Close</button>
    `;
    modal.style.display = 'block';
    
    if (window.isMobileUI()) {
        window.enableMobileWindowControls(modal);
        window.bringWindowToFront(modal);
        window.clampWindowToViewport(modal);
    }
};

window.startHauntedHouse = function(diff) {
    if (socket) socket.emit('startHauntedHouse', { difficulty: diff });
    document.getElementById('haunted-house-modal').innerHTML = '<h2 style="color:#E040FB; margin-top: 20px;">Paying the Toll...</h2>';
};

if (socket) {
    socket.on('closeHauntedUI', () => {
        let modal = document.getElementById('haunted-house-modal');
        if (modal) modal.style.display = 'none';
    });

    socket.on('hauntedVictory', () => {
        const vText = document.createElement('div');
        vText.innerHTML = `
            <h1 style="font-size:70px; margin:0; text-shadow:0 0 30px #E040FB, 4px 4px 0 #000; letter-spacing: 5px; animation: pulseText 1s infinite alternate;">HOUSE CLEAR!</h1>
        `;
        vText.style.position = 'fixed';
        vText.style.top = '40%';
        vText.style.left = '50%';
        vText.style.transform = 'translate(-50%, -50%)';
        vText.style.textAlign = 'center';
        vText.style.color = '#E040FB';
        vText.style.zIndex = '9999';
        document.body.appendChild(vText);
        
        setTimeout(() => { vText.remove(); }, 4000);
    });
}

// ==========================================
// 🥚 EASTER EGG PET CSS & ANIMATIONS
// ==========================================
const eggStyle = document.createElement('style');
eggStyle.innerHTML = `
   .pet-egg {
        position: absolute;
        /* 🌟 THE FIX: Shrunk the egg to a cuter, less intrusive size */
        width: 22px;
        height: 30px;
        /* Perfect egg shape */
        border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
        
        /* 🌟 THE FIX: Tightened the stripes so they still show up nicely on a smaller egg */
        background: repeating-linear-gradient(
            45deg,
            #FFB7B2 0px, #FFB7B2 6px,   /* Pastel Pink */
            #B5EAD7 6px, #B5EAD7 12px,  /* Pastel Mint */
            #FFFFB5 12px, #FFFFB5 18px, /* Pastel Yellow */
            #C7CEEA 18px, #C7CEEA 24px  /* Pastel Periwinkle */
        );
        
        /* 🌟 THE FIX: Scaled down the glow slightly so it doesn't overwhelm the small body */
        box-shadow: 0 0 10px 3px rgba(255, 128, 171, 0.8), 
                    0 0 18px 6px rgba(255, 193, 227, 0.6), 
                    inset 0 0 6px rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255, 255, 255, 0.6);
        
        z-index: 105; /* Kept at 105 so it stays in front of the avatar */
        pointer-events: none;
        transform-origin: bottom center;
        
        /* The requested 12s float and shake loop */
        animation: eggFloatShake 12s linear infinite; 
    }

    @keyframes eggFloatShake {
        /* Phase 1: 0% - 60% (7.2s) - Pure Smooth Floating */
        0%, 20%, 40%, 60% { transform: translateY(0); }
        10%, 30%, 50% { transform: translateY(-12px); } /* Hovering up 12px smoothly */

        /* Phase 2: 60% - 70% (1.2s) - Gentle 'About to Hatch' Shake */
        62% { transform: translateY(-6px) translateX(1px) rotate(1deg); }
        64% { transform: translateY(-6px) translateX(-1px) rotate(-1deg); }
        66% { transform: translateY(-6px) translateX(1px) rotate(1deg); }
        68% { transform: translateY(-6px) translateX(-1px) rotate(-1deg); }
        70% { transform: translateY(-6px) rotate(0); } /* Stop shaking, hovering gently */

        /* Phase 3: 70% - 90% (2.4s) - Short Floating Recovery */
        80% { transform: translateY(-12px); }
        90% { transform: translateY(0); }

        /* Phase 4: 90% - 100% (1.2s) - Violent 'Ready to Pop!' Shake */
        91% { transform: translateX(2px) rotate(3deg); }
        93% { transform: translateX(-2px) rotate(-3deg); }
        95% { transform: translateX(3px) rotate(4deg); }
        97% { transform: translateX(-3px) rotate(-4deg); }
        99% { transform: translateX(1px) rotate(1deg); }
        100% { transform: translate(0) rotate(0); } /* Loop back to Phase 1 */
    }
   /* 🐰 EASTER AURA: Supercharged Color-Shifting Glow */
    .avatar-rig:has(.aura-easter) {
        animation: easterColorShift 4s infinite alternate ease-in-out !important;
    }

    /* 🔥 Boosted the shadows with a 3rd layer and added brightness for intensity */
    @keyframes easterColorShift {
        0% { filter: drop-shadow(0 0 10px #FFB7B2) drop-shadow(0 0 20px #FFB7B2) drop-shadow(0 0 40px #FF919D) brightness(1.4); }   
        33% { filter: drop-shadow(0 0 10px #FFFFB5) drop-shadow(0 0 20px #FFFFB5) drop-shadow(0 0 40px #FFEA00) brightness(1.4); }  
        66% { filter: drop-shadow(0 0 10px #B5EAD7) drop-shadow(0 0 20px #B5EAD7) drop-shadow(0 0 40px #69F0AE) brightness(1.4); }  
        100% { filter: drop-shadow(0 0 10px #C7CEEA) drop-shadow(0 0 20px #C7CEEA) drop-shadow(0 0 40px #8C9EFF) brightness(1.4); } 
    }

    .cosmetic-aura.aura-easter {
        display: block !important;
        position: absolute !important;
        inset: 0 !important;
        background: none !important;
        box-shadow: none !important;
        z-index: 100 !important;
    }

   /* 🐰 EASTER AURA: Bubbling Bunny Heads */
    .cosmetic-aura.aura-easter::before,
    .cosmetic-aura.aura-easter::after {
        content: '';
        position: absolute;
        bottom: -15px; /* Start slightly higher due to smaller size */
        background: 
            radial-gradient(circle at 50% 65%, #FFB7B2 35%, transparent 36%), 
            radial-gradient(circle at 25% 25%, #FFB7B2 22%, transparent 23%), 
            radial-gradient(circle at 75% 25%, #FFB7B2 22%, transparent 23%); 
        filter: drop-shadow(0 0 5px #FFB7B2) brightness(1.3); /* Slightly less shadow for smaller objects */
        opacity: 0;
        pointer-events: none;
    }

    /* First Bunny: Was 24px -> Now 18px (Scaled down 25%) */
    .cosmetic-aura.aura-easter::before {
        left: -8px; /* Adjusted position for smaller head */
        width: 18px;  /* <--- SHRUNKEN */
        height: 18px; /* <--- SHRUNKEN */
        animation: bunnyBubble 3s ease-in infinite;
    }

    /* Second Bunny: Was 18px -> Now 13px (Scaled down ~28%) */
    .cosmetic-aura.aura-easter::after {
        left: 22px; /* Adjusted position for smaller head */
        width: 13px;  /* <--- SHRUNKEN */
        height: 13px; /* <--- SHRUNKEN */
        animation: bunnyBubble 3.5s ease-in infinite 1.5s;
    }

    /* Keep the bunnyBubble keyframes the same (scale(1.1) is now 1.1x the new, smaller size) */
    @keyframes bunnyBubble {
        0% { transform: translateY(0) scale(0.5); opacity: 0; }
        20% { opacity: 0.9; transform: translateY(-20px) scale(1) translateX(-5px); }
        50% { transform: translateY(-50px) scale(1.1) translateX(5px); }
        80% { opacity: 0.9; transform: translateY(-80px) scale(0.9) translateX(-3px); }
        100% { transform: translateY(-110px) scale(0.5); opacity: 0; }
    }
`;
document.head.appendChild(eggStyle);

// ==========================================
// 👻 COSMETICS CRAFTING UI
// ==========================================
window.openCosmeticsCrafting = function() {
    document.getElementById('merchant-modal').style.display = 'none';
    let modal = document.getElementById('cosmetics-craft-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cosmetics-craft-modal';
        modal.className = 'movable-window';
        modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#1a1a1a; border:2px solid #E040FB; padding:20px; z-index:9000; width:350px; border-radius:8px; box-shadow:0 0 30px #E040FB; color:white; text-align:center;';
        document.body.appendChild(modal);
    }
    window.renderCosmeticsCrafting();
    modal.style.display = 'block';
};

window.renderCosmeticsCrafting = function() {
    let modal = document.getElementById('cosmetics-craft-modal');
    const inv = game.player.inventory || [];
    
    let cSouls = 0;
    inv.forEach(x => {
        if (x && x.name === 'Soul Piece') cSouls += x.quantity || 1;
    });

    const reqSouls = 10;
    let canCraft = cSouls >= reqSouls;
    let col = canCraft ? '#4CAF50' : '#f44336';

    let html = '<h2 style="margin-top:0; color:#E040FB; text-shadow: 0 0 10px #E040FB;">👻 Cosmetics Crafting</h2>';
    html += '<p style="font-size:12px; color:#aaa;">Exchange boss materials for rare pets and cosmetics.</p>';

    html += '<div style="background:#222; padding:15px; border-radius:5px; margin-bottom:15px; font-size:14px; text-align:left; border: 1px solid #444;">';
    html += `<div style="color:#E040FB; font-weight:bold; font-size:16px; margin-bottom:10px;">Void Pet <span style="color:#aaa; font-size:12px;">(Godly)</span></div>`;
    html += `<div><span style="color:${col}">${cSouls}/${reqSouls} Soul Pieces</span></div>`;
    html += '</div>';

    html += `<button class="btn" style="background:${canCraft ? '#E040FB' : '#555'}; color:white; width:100%; margin-bottom:5px; font-weight:bold;" ${canCraft ? '' : 'disabled'} onclick="if(socket) socket.emit('requestCraftVoidPet')">Craft Void Pet</button>`;
    html += `<button class="btn" style="background:#f44336; width:100%;" onclick="document.getElementById('cosmetics-craft-modal').style.display='none'; document.getElementById('merchant-modal').style.display='block';">Back</button>`;
    modal.innerHTML = html;
};

if (socket) {
    socket.on('craftVoidSuccess', () => {
        setTimeout(() => { if (document.getElementById('cosmetics-craft-modal') && document.getElementById('cosmetics-craft-modal').style.display === 'block') window.renderCosmeticsCrafting(); }, 100);
    });
}
// ==========================================
// 👻 VOID PET CSS
// ==========================================
const voidStyle = document.createElement('style');
voidStyle.innerHTML = `
    .pet-void {
        position: absolute;
        width: 35px; height: 35px;
        z-index: 105; pointer-events: none;
        transform-origin: center center;
    }
    .pet-void .mini-wraith {
        width: 100%; height: 100%;
        background: linear-gradient(45deg, #4A148C, #000000);
        border: 2px solid #311B92;
        border-radius: 50% 50% 40% 40%;
        position: relative;
        box-shadow: 0 0 15px #311B92;
        /* 👻 THE FIX: Replaced float with the new vanish/fade animation */
        animation: voidFadeFloat 6s ease-in-out infinite;
    }
    .pet-void .w-eye {
        position: absolute; width: 6px; height: 6px;
        background: #ffffff;
        border-radius: 50%; top: 12px;
        box-shadow: 0 0 8px #ffffff;
    }
    .pet-void .w-eye.left { left: 8px; }
    .pet-void .w-eye.right { right: 8px; }
    .pet-void .w-particles { 
        position: absolute; bottom: -8px; width: 100%; 
        display: flex; justify-content: space-around; 
    }
    .pet-void .w-p { 
        width: 6px; height: 12px; background: #311B92; 
        border-radius: 50%; opacity: 0.6; 
        animation: wraithTail 1s infinite alternate; 
    }
    .pet-void .w-p:nth-child(2) { animation-delay: 0.2s; }
    .pet-void .w-p:nth-child(3) { animation-delay: 0.4s; }
    .pet-void .w-p:nth-child(4) { animation-delay: 0.6s; }
    
    @keyframes wraithTail { 0% { transform: translateY(0); opacity: 0.8; } 100% { transform: translateY(8px); opacity: 0.1; } }

    /* 👻 THE VANISHING ANIMATION */
    @keyframes voidFadeFloat {
        0%   { transform: translateY(0); opacity: 1; }
        20%  { transform: translateY(-10px); opacity: 1; }
        40%  { transform: translateY(0); opacity: 1; }
        45%  { transform: translateY(-5px); opacity: 0; } /* Poof out */
        65%  { transform: translateY(-15px); opacity: 0; } /* Move while invisible */
        70%  { transform: translateY(-10px); opacity: 1; } /* Poof in */
        85%  { transform: translateY(0); opacity: 1; }
        100% { transform: translateY(0); opacity: 1; }
    }
`;
document.head.appendChild(voidStyle);

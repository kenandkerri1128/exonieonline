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
const socket = io();
let isMailboxOpen = false, isChatting = false, isInventoryOpen = false, isSkillOpen = false, isShopping = false, localBossTimer = null, isEnhancing = false, isApplyingAura = false;
let activeInvIndex = -1, attackCooldownActive = false, isAttacking = false, attackHeld = false, autoAttackMode = false;
let lastNetTs = 0, lastSentState = 'idle', pendingPartyInvite = null, pendingTradeInvite = null, inTradeMode = false, tradeTarget = null;
let tradeMyItems = [null,null,null], tradeTheirItems = [null,null,null], lastVitalsSent = {hp:null,maxHp:null,level:null}, lastVitalsTs = 0;
let isDrawing = false, startX = 0, startY = 0, currentBox = null, drawType = 'collision';
let currentBGM = null, currentTrackName = "", activeTargetPlayerId = null;

// 🛡️ THE FIX: Game Loop & FPS Cap Variables
let currentAnimationId = null;
let lastFrameTime = 0;
const fpsInterval = 1000 / 60; // Caps the game at 60 FPS

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
        lootFilter: { Starter: true, Basic: true, Rare: true, Unique: true, Legendary: true, Godly: true }
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

// 🏆 TAVERN LEADERBOARD SHINES
window.topTavernPlayers = [];
const rankStyle = document.createElement('style');
rankStyle.innerHTML = `
    .rank-1-name { color: #fff !important; font-weight: bold !important; text-shadow: 0 0 5px #fff, 0 0 10px #FFD700, 0 0 20px #FFD700, 0 0 30px #FF8C00 !important; filter: drop-shadow(0 0 5px #FFD700); animation: auraGold 2.5s infinite alternate ease-in-out; }
    .rank-2-name { color: #fff !important; font-weight: bold !important; text-shadow: 0 0 5px #fff, 0 0 10px #E0E0E0, 0 0 20px #E0E0E0, 0 0 30px #9E9E9E !important; filter: drop-shadow(0 0 5px #E0E0E0); animation: auraSilver 2.5s infinite alternate ease-in-out; }
    .rank-3-name { color: #fff !important; font-weight: bold !important; text-shadow: 0 0 5px #fff, 0 0 10px #CD7F32, 0 0 20px #CD7F32, 0 0 30px #8B4513 !important; filter: drop-shadow(0 0 5px #CD7F32); animation: auraBronze 2.5s infinite alternate ease-in-out; }
    @keyframes auraGold { from { filter: drop-shadow(0 0 2px #FFD700); text-shadow: 0 0 5px #fff, 0 0 10px #FFD700, 0 0 20px #FFD700; } to { filter: drop-shadow(0 0 10px #FFD700); text-shadow: 0 0 8px #fff, 0 0 15px #FFD700, 0 0 35px #FF8C00; } }
    @keyframes auraSilver { from { filter: drop-shadow(0 0 2px #E0E0E0); text-shadow: 0 0 5px #fff, 0 0 10px #E0E0E0, 0 0 20px #E0E0E0; } to { filter: drop-shadow(0 0 10px #E0E0E0); text-shadow: 0 0 8px #fff, 0 0 15px #E0E0E0, 0 0 35px #9E9E9E; } }
    @keyframes auraBronze { from { filter: drop-shadow(0 0 2px #CD7F32); text-shadow: 0 0 5px #fff, 0 0 10px #CD7F32, 0 0 20px #CD7F32; } to { filter: drop-shadow(0 0 10px #CD7F32); text-shadow: 0 0 8px #fff, 0 0 15px #CD7F32, 0 0 35px #8B4513; } }
`;
document.head.appendChild(rankStyle);

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
    applyRank(document.getElementById('player-name-tag'), game.player.name);
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
        { id: 'heal3', name: "Purification", unlock: 50, cd: 100000, type: 'active', desc: "Revives dead party members globally and heals everyone." }
    ]},
    "Summoner": { weapon: "staff", aura: "blue", skills: [
        { id: 'sum1', name: "Summon Slime", unlock: 1, cd: 25000, type: 'active', desc: "Summons a slime with 25% stats to fight alongside you." },
        { id: 'sum2', name: "Duplicate", unlock: 25, type: 'passive', desc: "Summon Slime now spawns 2 slimes." },
        { id: 'sum3', name: "Enhance!", unlock: 50, cd: 100000, type: 'active', desc: "Your slimes gain 100% of your stats for 10 seconds." }
    ]},
    "Ice Master": { weapon: "staff", aura: "blue", skills: [
        { id: 'ice1', name: "Icicle Spear", unlock: 1, cd: 25000, type: 'active', desc: "Drops an icicle dealing 2x Magic Attack." },
        { id: 'ice2', name: "Chill!", unlock: 25, type: 'passive', desc: "Your attacks have a 25% chance to freeze enemies." },
        { id: 'ice3', name: "Icicle Storm", unlock: 50, cd: 100000, type: 'active', desc: "Drops 3 icicles on the enemy." }
    ]},
   "Berserker": { weapon: "sword", aura: "red", skills: [
        { id: 'ber1', name: "Callout!", unlock: 1, cd: 14000, type: 'active', desc: "Taunts enemies and multiplies Defense by 3x for 10s." },
        { id: 'ber2', name: "Bulk Up!", unlock: 25, type: 'passive', desc: "Increases base Defense and HP by 25%." },
        { id: 'ber3', name: "Immortal", unlock: 50, cd: 100000, type: 'active', desc: "Your HP cannot drop below 1 for 10 seconds." }
    ]},
    "Blademaster": { weapon: "sword", aura: "red", skills: [
        { id: 'bld1', name: "Sharpen Up!", unlock: 1, type: 'passive', desc: "Increases base Attack by 25%." },
        { id: 'bld2', name: "Blur!", unlock: 25, cd: 15000, type: 'active', desc: "Become an untargetable ghost for 10 seconds." },
        { id: 'bld3', name: "Mega Slash", unlock: 50, cd: 50000, type: 'active', desc: "Slashes the enemy for 5x Attack Power." }
    ]},
"Sniper": { weapon: "gun", aura: "white", skills: [
        { id: 'snp1', name: "Eagle Eye", unlock: 1, type: 'passive', desc: "Increases basic attack range by 15%." },
        { id: 'snp2', name: "Silver Bullet", unlock: 25, cd: 5000, type: 'active', desc: "Fires a fast silver bullet dealing 2x Attack Power." },
        { id: 'snp3', name: "Killshot", unlock: 50, cd: 50000, type: 'active', desc: "Fires a devastating bullet dealing 4x Attack Power." }
    ]},
    "Explosives Expert": { weapon: "gun", aura: "orange", skills: [
        { id: 'exp1', name: "Molotov", unlock: 1, cd: 12000, type: 'active', desc: "Throws a firebomb dealing 100% ATK per second on the ground." },
        { id: 'exp2', name: "Improved Oil", unlock: 25, type: 'passive', desc: "Increases Molotov ground fire duration from 3s to 10s." },
        { id: 'exp3', name: "Go Boom!", unlock: 50, cd: 30000, type: 'active', desc: "Throws a massive bomb dealing 5x Attack Power." }
    ]},
"Phantom Striker": { weapon: "dagger", aura: "white", skills: [
        { id: 'phs1', name: "Shadow Step", unlock: 1, cd: 5000, type: 'active', desc: "Blinks in the direction you are facing." },
        { id: 'phs2', name: "Sleight of Hand", unlock: 25, type: 'passive', desc: "50% chance to hit twice in one interval." },
        { id: 'phs3', name: "Blink Stab", unlock: 50, cd: 30000, type: 'active', desc: "Blink to the enemy and stab for 2x Attack." },
        { id: 'phs4', name: "Craftiness", unlock: 75, type: 'passive', desc: "25% chance on normal attack to reset all skill cooldowns." }
    ]},
    "Ninja Assassin": { weapon: "dagger", aura: "lightning", skills: [
        { id: 'nin1', name: "Smoke Bomb", unlock: 1, cd: 10000, type: 'active', desc: "Throws a smoke bomb. Enemies miss 25% of attacks for 10s." },
        { id: 'nin2', name: "Agility", unlock: 25, type: 'passive', desc: "25% chance to dodge any incoming attack." },
        { id: 'nin3', name: "Shadow Copy", unlock: 50, cd: 50000, type: 'active', desc: "Summons a 100% stat clone for 10 seconds." },
        { id: 'nin4', name: "More Agility", unlock: 75, type: 'passive', desc: "Increases your dodge chance to 35%." }
    ]},
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
        else if (spriteStr.includes('gun')) wpnType = 'gun'; 
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

    let potOverlay = document.getElementById('cd-3');
    if (window.potionCooldownReadyAt && now < window.potionCooldownReadyAt) {
        let remaining = window.potionCooldownReadyAt - now;
        let pct = (remaining / 5000) * 100; 
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
        else if (spriteStr.includes('gun')) wpnType = 'gun';
        else if (spriteStr.includes('dagger')) wpnType = 'dagger';
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

    // 🗡️ SHADOW STEP
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
        if(socket) socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: 'walk', facingRight: window.facingRight, weaponSprite: wpnSprite });
        return; 
    }

    // 🥷 SHADOW COPY
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

    // 🟢 SUMMON SLIME
    if (skillId === 'sum1') {
        if (game.player.activePets && game.player.activePets.length > 0) return;
        window.showAura(CLASSES[className].aura); 
        if (!game.player.activePets) game.player.activePets = [];
        let count = game.player.level >= 25 ? 2 : 1;
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
        return; 
    }

    window.showAura(CLASSES[className].aura);
    isAttacking = true; 
    setTimeout(() => { isAttacking = false; }, 500); 

    if (skillId === 'heal1') { if (socket) socket.emit('partyHeal'); }
    if (skillId === 'heal3') {
        game.player.currentHp = window.getMaxHp();
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "FULL HEAL", '#4CAF50'); 
        window.updateUI(); 
        if (socket && game.party) socket.emit('partyRevive'); 
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
    }
    if (skillId === 'ber1') {
        if(socket) socket.emit('tauntMonsters', { radius: 300 });
        game.player.tauntBuffUntil = Date.now() + 10000; 
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "DEF x3!", '#ffeb3b'); window.spawnSpark(game.player.x + 24, game.player.y + 48);
    }
    if (skillId === 'ber3') { game.player.immortalUntil = Date.now() + 10000; window.spawnDamageText(game.player.x + 24, game.player.y - 10, "IMMORTAL", '#ffeb3b'); }
    if (skillId === 'bld2') {
        game.player.untargetableUntil = Date.now() + 10000;
        dom.playerContainer.style.opacity = '0.5'; setTimeout(() => { if (!game.isGhost) dom.playerContainer.style.opacity = '1'; }, 10000);
        if(socket) socket.emit('setUntargetable', { duration: 10000 });
    }
    
    if (skillId === 'ice1' || skillId === 'ice3' || skillId === 'bld3' || skillId.startsWith('snp') || skillId.startsWith('exp') || skillId === 'phs3' || skillId === 'nin1') {
        let closestMob = null; let minD = Infinity; 
        
        let attackRadius = (className === 'Ice Master' || className === 'Explosives Expert' || className === 'Sniper') ? 300 : 80;
        if (className === 'Sniper') attackRadius = 345; 

        for(let mId in game.monsters) { let m = game.monsters[mId]; if(!m.alive) continue; let dist = Math.hypot((game.player.x+24) - (m.x+m.width/2), (game.player.y+48) - (m.y+m.height/2)); if(dist <= attackRadius && dist < minD) { minD = dist; closestMob = m; } }
        
        if (closestMob) {
            let mCx = closestMob.x + (closestMob.width/2); let mCy = closestMob.y + (closestMob.height/2);
            
            if (className === 'Ice Master') {
                let count = skillId === 'ice3' ? 3 : 1; 
                for (let i=0; i<count; i++) {
                    setTimeout(() => {
                        let ice = document.createElement('div'); ice.className = 'icicle'; ice.style.left = mCx + 'px'; ice.style.top = (mCy - 100) + 'px'; dom.world.appendChild(ice);
                        let anim = ice.animate([{ top: (mCy - 100) + 'px' }, { top: mCy + 'px' }], { duration: 300, easing: 'ease-in' });
                        anim.onfinish = () => { ice.remove(); if (i === count - 1 && socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId }); };
                    }, i * 200);
                }
            }
            if (skillId === 'bld3') {
                window.spawnWhiteSplash(mCx, mCy); if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId });
            }
            
            // 🗡️ BLINK STAB
            if (skillId === 'phs3') {
                let targetX = closestMob.x + (closestMob.width/2 > game.player.x ? -40 : 40);
                let targetY = closestMob.y;
                
                if (window.isColliding(targetX, targetY)) {
                    targetX = closestMob.x + (closestMob.width/2 > game.player.x ? 40 : -40);
                    if (window.isColliding(targetX, targetY)) {
                        targetX = game.player.x;
                        targetY = game.player.y;
                    }
                }
                
                game.player.x = targetX;
                game.player.y = targetY;
                window.spawnWhiteSplash(game.player.x + 24, game.player.y + 48);
                if(socket) {
                    socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: 'attack', facingRight: window.facingRight, weaponSprite: wpnSprite });
                    socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId });
                }
            }
            
            // 🌫️ SMOKE BOMB
            if (skillId === 'nin1') {
                if(typeof window.shootOrb === 'function') window.shootOrb(game.player.x + 24, game.player.y - 15, mCx, mCy, '#757575');
                
                setTimeout(() => {
                    if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId });
                    const smoke = document.createElement('div');
                    smoke.style.cssText = `position:absolute; left:${mCx-40}px; top:${mCy-40}px; width:80px; height:80px; background:radial-gradient(circle, rgba(100,100,100,0.9) 0%, rgba(150,150,150,0.5) 50%, transparent 70%); border-radius:50%; z-index:40; pointer-events:none; animation: pulseText 1.5s infinite alternate;`;
                    dom.world.appendChild(smoke);
                    setTimeout(()=>smoke.remove(), 10000);
                }, 400); 
            }

            // 🔫 SNIPER VISUALS
            if (skillId === 'snp2') {
                window.shootOrb(game.player.x + 24, game.player.y - 15, mCx, mCy, '#ffffff');
                setTimeout(() => { if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId }); }, 200);
            }
            if (skillId === 'snp3') {
                window.shootOrb(game.player.x + 24, game.player.y - 15, mCx, mCy, '#ff0000');
                const gameContainer = document.getElementById('game-container'); 
                if(gameContainer) { gameContainer.classList.add('screen-shake'); setTimeout(() => gameContainer.classList.remove('screen-shake'), 500); }
                setTimeout(() => { if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId }); window.spawnWhiteSplash(mCx, mCy); }, 200);
            }

            // 💣 EXPLOSIVES EXPERT VISUALS
            if (skillId === 'exp1') {
                window.shootOrb(game.player.x + 24, game.player.y - 15, mCx, mCy, '#ff9800');
                setTimeout(() => { 
                    if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId });
                    window.spawnFireAoE(mCx, mCy, game.player.level >= 25 ? 10000 : 3000);
                }, 400);
            }
            if (skillId === 'exp3') {
                window.shootOrb(game.player.x + 24, game.player.y - 15, mCx, mCy, '#424242');
                setTimeout(() => { 
                    if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId });
                    window.spawnWhiteSplash(mCx, mCy);
                    const gameContainer = document.getElementById('game-container'); 
                    if(gameContainer) { gameContainer.classList.add('screen-shake'); setTimeout(() => gameContainer.classList.remove('screen-shake'), 500); }
                }, 500);
            }
        }
    }
};

window.shootBullet = function(startX, startY, endX, endY) { 
    const bullet = document.createElement('div'); 
    bullet.style.position = 'absolute';
    bullet.style.width = '6px';
    bullet.style.height = '6px';
    bullet.style.background = '#ffffff';
    bullet.style.borderRadius = '50%';
    bullet.style.boxShadow = '0 0 4px #ffffff, 0 0 8px #ffeb3b'; 
    bullet.style.zIndex = '50';
    bullet.style.pointerEvents = 'none';
    
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    dom.world.appendChild(bullet); 
    
    const animation = bullet.animate([
        { left: startX + 'px', top: startY + 'px', transform: `translate(-50%, -50%) rotate(${angle}deg) scaleX(2)` }, 
        { left: endX + 'px', top: endY + 'px', transform: `translate(-50%, -50%) rotate(${angle}deg) scaleX(2)` }
    ], { duration: 150, easing: 'linear' }); 
    
    animation.onfinish = () => { 
        bullet.remove(); 
        window.spawnSpark(endX, endY); 
    }; 
};
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
    window.promptDM = function(targetName) { let msg = prompt(`Send Direct Message to ${targetName}:`); if (msg && msg.trim() !== '') { if(socket) socket.emit('sendDM', { targetId: targetName, message: msg.trim() }); } };
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
    window.addTradeItem = function(invIndex) { if (!inTradeMode) return; const item = game.player.inventory[invIndex]; if (!item) return; const emptyTradeSlot = tradeMyItems.findIndex(i => i === null); if (emptyTradeSlot === -1) { dom.log.innerText = "Trade offer full!"; return; } tradeMyItems[emptyTradeSlot] = item; game.player.inventory[invIndex] = null; window.renderInventory(); window.renderTradeSlots(); window.syncTrade(); }; 
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
    window.addEventListener('mousedown', (e) => { if (e.target.classList.contains('ctx-btn')) return; if (!e.target.closest('#inv-context-menu')) document.getElementById('inv-context-menu').style.display = 'none'; if (!e.target.closest('#player-context-menu') && !e.target.closest('.entity')) document.getElementById('player-context-menu').style.display = 'none'; if (isEnhancing && !e.target.closest('#inventory-screen') && !e.target.closest('#inv-context-menu')) { isEnhancing = false; dom.log.innerText = "Enhancement mode cancelled."; window.renderInventory(); } });
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
        let cost = 0; let item = null;
        if (type === 'potion') { let qty = parseInt(document.getElementById('shop-potion-qty').value) || 1; cost = qty * 25; item = { id: Date.now(), name: "Health Potion", type: "potion", rarity: "Basic", color: "#fff", fixedStat: { hpHeal: 100 }, quantity: qty }; }
        else if (type === 'stone') { let lvl = parseInt(document.getElementById('shop-stone-level').value) || 10; let rarity = document.getElementById('shop-stone-rarity').value || 'Basic'; let qty = parseInt(document.getElementById('shop-stone-qty').value) || 1; let basePrice = lvl * 15; let rMult = { "Basic": 1, "Rare": 3, "Unique": 8, "Legendary": 20, "Godly": 50 }[rarity] || 1; cost = basePrice * rMult * qty; item = { id: Date.now() + Math.random(), name: (rarity === "Basic" ? "" : rarity + " ") + "Refinement Stone Lv." + lvl, type: "material", rarity: rarity, level: lvl, color: window.RARITY_COLORS[rarity], quantity: qty }; }
        if (game.player.gold < cost) { if(dom.log) dom.log.innerText = "Not enough gold!"; return; }
        if (socket) socket.emit('requestPurchase', { totalCost: cost, item: item });
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
                if (!window.isLoading) window.attemptAttack(false);
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
        if (pData.spriteData && pData.spriteData.title) titleTag.innerText = `<${pData.spriteData.title}>`;
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
            
            if (fixedWpn.includes('legendary')) weapon.classList.add('weapon-aura-legendary');
            if (fixedWpn.includes('godly')) weapon.classList.add('weapon-aura-godly');
        }
        
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

        socket.on('titleUnlocked', (title) => {
            if(document.getElementById('player-title-tag')) {
                document.getElementById('player-title-tag').innerText = `<${title}>`;
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
                
                if(document.getElementById('player-title-tag')) {
                    document.getElementById('player-title-tag').innerText = userData.title ? `<${userData.title}>` : '';
                }
             
                game.player.level = userData.level || 1; 
                game.player.exp = userData.exp || 0; 
                game.player.maxExp = userData.max_exp || 200; 
                game.player.gold = userData.gold || 0; 
                game.player.baseStats = (typeof userData.base_stats === 'object' && userData.base_stats !== null) ? userData.base_stats : { hp: 100, attack: 5, magic: 5, defense: 2, speed: 1, str: 10, int: 10, playerClass: null }; 
                if (game.player.baseStats.playerClass && (!CLASSES || !CLASSES[game.player.baseStats.playerClass])) { game.player.baseStats.playerClass = null; }
                game.player.inventory = Array.isArray(userData.inventory) ? userData.inventory : new Array(20).fill(null); 
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
                        
                       if (document.getElementById('loading-screen')) {
                            document.getElementById('loading-screen').style.display = 'none';
                        }

                        dom.game.classList.add('active');
                        game.isRunning = true;
                        
                        const pChatBox = document.getElementById('persistent-chat-box');
                        if (pChatBox) pChatBox.style.display = 'flex';

                        if (currentAnimationId) cancelAnimationFrame(currentAnimationId);
                        if (typeof gameLoop !== 'undefined') currentAnimationId = requestAnimationFrame(gameLoop);

                        if (game.player.baseStats && !game.player.baseStats.watchedTutorial) {
                            window.playTutorialVideo();
                        } else {
                            setTimeout(() => {
                                window.playBGM(safeMapData.id === 'town' ? 'town' : (safeMapData.id.includes('floor') ? 'floors' : 'town'));
                                try { window.showMapAnnouncement(safeMapData.id || 'town'); } catch(e) {}
                            }, 120);
                        }

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
        socket.on('sellSuccess', (data) => { game.player.gold = data.newGold; game.player.inventory = data.inventory; dom.log.innerText = `Item sold for ${data.price} Gold.`; window.updateUI(); window.renderInventory(); });
        socket.on('syncInventory', (serverInventory) => { game.player.inventory = serverInventory; window.updateEquipmentDisplay(); window.renderInventory(); });
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
        
        if (typeof window.emitVitalsIfNeeded === 'function') window.emitVitalsIfNeeded(true);
    });
        socket.on('needsCharacterCreation', (username) => { document.getElementById('loading-screen').style.display = 'none'; document.getElementById('char-name-input').value = username; document.getElementById('creation-screen').classList.add('active'); });
        socket.on('rareLootBroadcast', (data) => { let container = document.getElementById('loot-broadcast'); if (!container) { container = document.createElement('div'); container.id = 'loot-broadcast'; container.style.position = 'fixed'; container.style.top = '25%'; container.style.left = '50%'; container.style.transform = 'translateX(-50%)'; container.style.zIndex = '2147483647'; container.style.display = 'flex'; container.style.flexDirection = 'column'; container.style.alignItems = 'center'; container.style.pointerEvents = 'none'; container.style.width = '100%'; document.body.appendChild(container); } const ann = document.createElement('div'); ann.className = 'loot-announcement'; ann.style.borderColor = data.color || '#fff'; ann.style.boxShadow = `0 0 20px ${data.color}`; let glowClass = data.rarity === 'Godly' ? 'rarity-godly' : ''; ann.innerHTML = `<div style="color: #e0e0e0; font-size: 16px; margin-bottom: 5px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 4px #000;">${data.playerName} just got</div><div style="color: ${data.color}; font-size: 28px; font-weight: bold; -webkit-text-stroke: 1px black; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 0 15px ${data.color};" class="${glowClass}">${data.itemName} Lv. ${data.level}</div>`; container.appendChild(ann); if (dom && dom.log) { dom.log.innerText = `[SERVER] ${data.playerName} obtained ${data.itemName}!`; } setTimeout(() => { if (ann && ann.parentNode) { ann.parentNode.removeChild(ann); } }, 3000); });
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
        socket.on('partyWiped', () => {
        dom.log.innerText = "Your party has been wiped out.";
    });
        socket.on('showDeathScreen', () => {
        const juiceBtn = document.getElementById('revive-juice-btn');
        if (juiceBtn) {
            let hasJuice = game.player.inventory.some(i => i && i.name === "Revival Juice");
            juiceBtn.style.display = hasJuice ? 'block' : 'none';
        }

        const deathScreen = document.getElementById('death-screen');
        if (deathScreen) deathScreen.style.display = 'flex';
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
                // 🎵 THE FIX: Both Tavern and Dungeons will now trigger the Boss BGM!
                window.playBGM((tp.mapId === 'trainingtavern' || String(tp.mapId).includes('dungeon')) ? 'bossfight' : (String(tp.mapId).includes('floor') ? 'floors' : 'town'));
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
                    if (typeof tp.portalId === 'number') {
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
                        window.playBGM((nextMapId === 'trainingtavern' || String(nextMapId).includes('dungeon')) ? 'bossfight' : (String(nextMapId).includes('floor') ? 'floors' : 'town'));
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
                p.weapon.classList.remove('weapon-aura-legendary', 'weapon-aura-godly');
                if (fixedWpn.includes('legendary')) p.weapon.classList.add('weapon-aura-legendary');
                if (fixedWpn.includes('godly')) p.weapon.classList.add('weapon-aura-godly');

            } else { 
                p.weapon.style.display = 'none'; p.currentWeaponSrc = ''; 
                if (p.spriteData) p.spriteData.weapon = null; 
                p.weapon.classList.remove('weapon-aura-legendary', 'weapon-aura-godly');
            } const cAuraEl = p.rig.querySelector('.cosmetic-aura'); if (cAuraEl) cAuraEl.className = data.spriteData?.aura ? `cosmetic-aura aura-${data.spriteData.aura}` : 'cosmetic-aura'; const titleEl = p.dom.querySelector('.title-tag');
            if (titleEl) {
                titleEl.innerText = data.spriteData?.title ? `<${data.spriteData.title}>` : '';
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
                const nameClass = item.rarity === "Godly" ? "rarity-godly" : ""; 
                const displayName = item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name; 
                let html = `<div class="inspect-title"><div class="inspect-item-name ${nameClass}" style="color:${rarityColor};">${displayName}</div><div class="inspect-sub">Lv.${item.level || 1} ${item.rarity || "Unknown"}</div></div><div class="inspect-stat">`; 
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
       socket.on('receiveExp', (data) => { 
            game.player.exp += data.amount; 
            if(data.gold) game.player.gold += data.gold; 
            dom.log.innerText = `Gained ${data.amount} EXP${data.gold ? ` & ${data.gold} Gold` : ''} from ${data.source}!`; 
            window.updateUI(); 
        });
        socket.on('serverLevelUp', (data) => {
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
        socket.on('remotePetSync', (data) => { let petId = `pet_${data.ownerId}_${data.petData.id}`; let petEl = document.getElementById(petId); if (data.petData.alive) { if (!petEl) { petEl = document.createElement('div'); petEl.id = petId; petEl.className = 'pet-slime'; petEl.innerHTML = '<div class="pet-hp-bar"><div class="pet-hp-fill" style="width:100%"></div></div>'; dom.world.appendChild(petEl); } petEl.style.left = data.petData.x + 'px'; petEl.style.top = data.petData.y + 'px'; } else if (petEl) { petEl.remove(); } });
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
                    
                    if (m.monsterKey.includes('golem')) {
                        spriteLayer.className = m.category === 'floor_boss' ? 'monster-sprite-layer golem-base boss' : 'monster-sprite-layer golem-base';
                    } else if (m.monsterKey.includes('wraith')) {
                        spriteLayer.className = 'monster-sprite-layer wraith-base';
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

       socket.on('monsterAttack', (data) => {
        if (!data) return;
        const targetId = data.targetId;

        let hitPet = null;
        if (game.player.activePets) {
            hitPet = game.player.activePets.find(p => p.id === targetId);
        }

        if (hitPet) {
            const serverAtk = Number(data.atk || 25);
            const petDef = Math.floor(window.getDefense() * 0.25);
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

        let tx = game.player.x + 24; let ty = game.player.y + 48;
        if (targetId !== game.player.id && game.remotePlayers[targetId]) {
            tx = game.remotePlayers[targetId].x + 24; ty = game.remotePlayers[targetId].y + 48;
        }
        if (hitPet) { tx = hitPet.x + 15; ty = hitPet.y + 15; }

        const isElemental = m.monsterKey && String(m.monsterKey).includes('3');
        const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2);

        if (isElemental) window.shootMonsterFireball(mcx, mcy, tx, ty);

        let dx = tx - mcx; let dy = ty - mcy;
        let dist = Math.hypot(dx, dy) || 1;
        let moveX = (dx / dist) * 20; let moveY = (dy / dist) * 20;

        const spriteLayer = mEl.querySelector('.monster-sprite-layer');
        if (spriteLayer) {
            if (m.monsterKey.includes('golem')) {
                spriteLayer.classList.add('attacking');
                setTimeout(() => spriteLayer.classList.remove('attacking'), 200);
            }
            spriteLayer.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.1)`;
            setTimeout(() => { spriteLayer.style.transform = `translate(0px, 0px) scale(1)`; }, 150);
        }

        let sfxFile = 'bump';
        if (m.monsterKey.includes('2')) sfxFile = 'lightning';
        else if (m.monsterKey.includes('3')) sfxFile = 'splash';

        let hitSound = new Audio(`music/${sfxFile}.mp3`);
        hitSound.volume = 0.4; hitSound.play().catch(e => {});
    });

        socket.on('monsterSkill', (data) => { 
            if (data.skillName === 'Earthquake') { 
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
            if (game.monsters[data.monsterId].category === 'floor_boss' || game.monsters[data.monsterId].category === 'mini_boss') {
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
    let lastLoopTime = performance.now(); let frameCount = 0; let fpsDisplay = document.getElementById('fps-counter');
    let lowEndMode = localStorage.getItem('exonie_low_end') === 'true'; let lowFpsTimer = 0;

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
    // ⚔️ TAVERN & LEADERBOARD LOGIC
    // ==========================================
    window.startTavern = function() {
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
            let msg = data.type === 'dodge' ? "DODGE!" : "MISS";
            let color = data.type === 'dodge' ? "#00E5FF" : "#aaaaaa";
            
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
                            let nextTrack = (mapIdStr === 'trainingtavern' || mapIdStr.includes('dungeon')) ? 'bossfight' : (mapIdStr.includes('floor') ? 'floors' : 'town');
                            
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
    // ⚖️ AUCTION HOUSE UI LOGIC
    // ==========================================
    let ahSelectedInvIndex = -1;

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

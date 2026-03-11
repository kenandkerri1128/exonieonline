
// ==========================================
// 1. CORE VARIABLES & SETUP
// ==========================================
const socket = io(); 
let isMailboxOpen = false, isChatting = false, isInventoryOpen = false, isSkillOpen = false, isEnhancing = false, isShopping = false;
let activeInvIndex = -1, attackCooldownActive = false, isAttacking = false, attackHeld = false, autoAttackMode = false;
let lastNetTs = 0, lastSentState = 'idle', pendingPartyInvite = null, pendingTradeInvite = null, inTradeMode = false, tradeTarget = null;
let tradeMyItems = [null,null,null], tradeTheirItems = [null,null,null], lastVitalsSent = {hp:null,maxHp:null,level:null}, lastVitalsTs = 0;
let isDrawing = false, startX = 0, startY = 0, currentBox = null, drawType = 'collision';
let currentBGM = null, currentTrackName = "", activeTargetPlayerId = null;
window.facingRight = false; window.isLoading = false; 
window.isSpectating = false; window.spectateTargetId = null;

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
window.RARITY_COLORS = { "Starter": "#aaaaaa", "Basic": "#8B4513", "Rare": "#2196F3", "Unique": "#9c27b0", "Legendary": "#f44336", "Godly": "#e0ffff" };
window.ITEM_TEMPLATES = { sword: { slot: 'weapon', statKey: 'attack', baseName: 'Sword', spriteName: 'sword' }, staff: { slot: 'weapon', statKey: 'magic', baseName: 'Staff', spriteName: 'staff' }, pendant: { slot: 'weapon', statKey: 'magic', baseName: 'Pendant', spriteName: 'pendant' }, armor: { slot: 'armor', statKey: 'defense', baseName: 'Armor', spriteName: 'armor' }, leggings: { slot: 'leggings', statKey: 'hp', baseName: 'Leggings', spriteName: 'leggings' } };
window.MapDatabase = window.MapDatabase || {}; 
let safeMapData = { id: "town", name: "Town of Exonie", image: "town_map.png", spawnX: 960, spawnY: 1000, collisions: [], teleports: [], normalSpawns: [], miniBossSpawns: [], floorBossSpawns: [] };

// ==========================================
// 2. CLASSES & SKILLS ENGINE
// ==========================================
const CLASSES = {
    "Healer": { weapon: "pendant", aura: "green", skills: [
        { id: 'heal1', name: "Heal", unlock: 1, cd: 20000, type: 'active', desc: "Heals all party members in range." },
        { id: 'heal2', name: "Boost", unlock: 25, type: 'passive', desc: "Doubles the healing power of Heal." },
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
        { id: 'ber1', name: "Callout!", unlock: 1, cd: 14000, type: 'active', desc: "Taunts enemies and multiplies Defense by 5x for 10s." },
        { id: 'ber2', name: "Bulk Up!", unlock: 25, type: 'passive', desc: "Increases base Defense and HP by 25%." },
        { id: 'ber3', name: "Immortal", unlock: 50, cd: 100000, type: 'active', desc: "Your HP cannot drop below 1 for 10 seconds." }
    ]},
    "Blademaster": { weapon: "sword", aura: "red", skills: [
        { id: 'bld1', name: "Sharpen Up!", unlock: 1, type: 'passive', desc: "Increases base Attack by 25%." },
        { id: 'bld2', name: "Blur!", unlock: 25, cd: 15000, type: 'active', desc: "Become an untargetable ghost for 10 seconds." },
        { id: 'bld3', name: "Mega Slash", unlock: 50, cd: 50000, type: 'active', desc: "Slashes the enemy for 5x Attack Power." }
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
    if (!game.player.activeSkills) return;
    const now = Date.now();
    let running = false;
    for (let i = 0; i < 2; i++) {
        let skill = game.player.activeSkills[i];
        if (skill) {
            let overlay = document.getElementById(`cd-${i+1}`);
            let txt = document.getElementById(`cdt-${i+1}`);
            if (now < skill.cooldownReadyAt) {
                let remaining = skill.cooldownReadyAt - now;
                let pct = (remaining / skill.cd) * 100;
                overlay.style.height = pct + '%';
                txt.style.display = 'block';
                txt.innerText = Math.ceil(remaining / 1000);
                running = true;
            } else {
                overlay.style.height = '0%';
                txt.style.display = 'none';
            }
        }
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
    
    // 🛡️ BLOCK SPAMMING: Stops execution if cooldown is active
    if (Date.now() < skillObj.cooldownReadyAt) {
        if(dom.log) dom.log.innerText = `${skillObj.name} is on cooldown!`;
        return;
    }
    
    skillObj.cooldownReadyAt = Date.now() + skillObj.cd; 
    if(typeof window.updateHotbarCooldowns === 'function') window.updateHotbarCooldowns();

    if (socket) socket.emit('broadcastSkill', { skillId: skillId });

    // 🛡️ RESTORE AURA EFFECT
    const aura = document.getElementById('player-aura');
    if (aura) {
        aura.className = `aura aura-${CLASSES[className].aura}`; 
        aura.style.animation = 'none'; 
        void aura.offsetWidth; // Trigger reflow
        aura.style.animation = 'aura-burst 0.6s ease-out forwards';
    }

    if (skillId === 'sum1') {
        if (game.player.activePets && game.player.activePets.length > 0) return;
        window.showAura(CLASSES[className].aura); window.playVoice(className);
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
    if (!skillObj) return; 
    skillObj.cooldownReadyAt = Date.now() + skillObj.cd; window.updateHotbarCooldowns();

    window.showAura(CLASSES[className].aura);
    isAttacking = true; attackCooldownActive = true;
    setTimeout(() => { isAttacking = false; }, 500); setTimeout(() => { attackCooldownActive = false; }, 1000);
    if(socket) socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: 'attack', facingRight: window.facingRight, weaponSprite: game.player.equips.weapon?.sprite || null });

    if (skillId === 'heal1') { window.playVoice(className); if (socket) socket.emit('partyHeal'); }
    if (skillId === 'heal3') {
        window.playVoice(className); game.player.currentHp = window.getMaxHp();
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "FULL HEAL", '#4CAF50'); 
        window.updateUI(); window.emitVitalsIfNeeded(true); if(socket && game.party) socket.emit('partyRevive'); 
    }
    if (skillId === 'sum3') { window.playVoice(className); if(game.player.activePets) game.player.activePets.forEach(p => { p.enhancedUntil = Date.now() + 10000; window.spawnSpark(p.x+15, p.y+15); }); }
    if (skillId === 'ber1') {
        window.playVoice(className); if(socket) socket.emit('tauntMonsters', { radius: 300 });
        game.player.tauntBuffUntil = Date.now() + 10000; 
        window.spawnDamageText(game.player.x + 24, game.player.y - 10, "DEF x5!", '#ffeb3b'); window.spawnSpark(game.player.x + 24, game.player.y + 48);
    }
    if (skillId === 'ber3') { window.playVoice(className); game.player.immortalUntil = Date.now() + 10000; window.spawnDamageText(game.player.x + 24, game.player.y - 10, "IMMORTAL", '#ffeb3b'); }
    if (skillId === 'bld2') {
        window.playVoice(className); game.player.untargetableUntil = Date.now() + 10000;
        dom.playerContainer.style.opacity = '0.5'; setTimeout(() => { if (!game.isGhost) dom.playerContainer.style.opacity = '1'; }, 10000);
        if(socket) socket.emit('setUntargetable', { duration: 10000 });
    }
    
    if (skillId === 'ice1' || skillId === 'ice3' || skillId === 'bld3') {
        let closestMob = null; let minD = Infinity; const attackRadius = className === 'Ice Master' ? 300 : 80;
        for(let mId in game.monsters) { let m = game.monsters[mId]; if(!m.alive) continue; let dist = Math.hypot((game.player.x+24) - (m.x+m.width/2), (game.player.y+48) - (m.y+m.height/2)); if(dist <= attackRadius && dist < minD) { minD = dist; closestMob = m; } }
        if (closestMob) {
            let mCx = closestMob.x + (closestMob.width/2); let mCy = closestMob.y + (closestMob.height/2);
            if (className === 'Ice Master') {
                window.playVoice(className); let count = skillId === 'ice3' ? 3 : 1; 
                for (let i=0; i<count; i++) {
                    setTimeout(() => {
                        let ice = document.createElement('div'); ice.className = 'icicle'; ice.style.left = mCx + 'px'; ice.style.top = (mCy - 100) + 'px'; dom.world.appendChild(ice);
                        let anim = ice.animate([{ top: (mCy - 100) + 'px' }, { top: mCy + 'px' }], { duration: 300, easing: 'ease-in' });
                        anim.onfinish = () => { ice.remove(); if (i === count - 1 && socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId }); };
                    }, i * 200);
                }
            }
            if (skillId === 'bld3') {
                window.playVoice(className); window.spawnWhiteSplash(mCx, mCy); if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: skillId });
            }
        }
    }
}

// ==========================================
// 3. COMBAT & MAIN GAME LOOP
// ==========================================
window.attemptAttack = function(silent) {
    if (safeMapData.id === 'town') { if (!silent && dom.log) dom.log.innerText = "You cannot attack in Town!"; return; }
    if (game.player.currentHp <= 0 || isInventoryOpen || window.adminMode || game.isGhost || window.isLoading) return;
    if (attackCooldownActive) return; 
    
    let closestMob = null; let minD = Infinity; const pCenterX = game.player.x + 24; const pCenterY = game.player.y + 48; 
    let weaponSprite = game.player.equips && game.player.equips.weapon ? game.player.equips.weapon.sprite : ''; 
    const isRanged = weaponSprite.includes('staff') || weaponSprite.includes('pendant'); const attackRadius = isRanged ? 250 : 80;
    
    for(let mId in game.monsters) { 
        let m = game.monsters[mId]; if(!m.alive) continue; 
        let mCenterX = m.x + (m.width/2); let mCenterY = m.y + (m.height/2); 
        let dist = Math.hypot(pCenterX - mCenterX, pCenterY - mCenterY); 
        if(dist <= attackRadius && dist < minD) { minD = dist; closestMob = m; } 
    }
    
    if (!closestMob) { if(!silent && dom.log) dom.log.innerText = "No target in range."; return; }
    
    isAttacking = true; attackCooldownActive = true; 
    if(socket) socket.emit('playerMoved', { x: game.player.x, y: game.player.y, state: 'attack', facingRight: window.facingRight, weaponSprite: weaponSprite });
    if(typeof window.playSFX === 'function') window.playSFX(weaponSprite);

    const mCenterX = closestMob.x + (closestMob.width/2); const mCenterY = closestMob.y + (closestMob.height/2);

    if (isRanged) { 
        if(typeof window.shootOrb === 'function') window.shootOrb(pCenterX, pCenterY - 15, mCenterX, mCenterY); 
        setTimeout(() => { if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: 'basic' }); }, 500); 
    } else { 
        setTimeout(() => { if(socket) socket.emit('attackMonster', { monsterId: closestMob.id, skillId: 'basic' }); }, 300); 
    }
    setTimeout(() => { isAttacking = false; }, 500); setTimeout(() => { attackCooldownActive = false; }, 1000);
}
function gameLoop(ts) {
    if (!game.isRunning) return;

    if (game.player.currentHp <= 0 && !game.isGhost) { 
        game.isGhost = true; dom.playerContainer.style.opacity = '0.5'; 
        if(socket) socket.emit('playerDied'); 
    }

    if (game.isGhost && game.party && game.party.members && game.party.members.length === 1) {
        if(dom.log) dom.log.innerText = "You are the last one left. Returning to Town.";
        if(typeof window.leaveParty === 'function') window.leaveParty();
    }

    let nextX = game.player.x; let nextY = game.player.y; let isMoving = false; const moveSpeed = 5; 
    let canInputMove = (!isChatting && !window.isLoading);
    
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
            if (targetMob) {
                let dist = Math.hypot(targetMob.x - p.x, targetMob.y - p.y);
                if (dist > 40) { p.x += (targetMob.x - p.x) * 0.15; p.y += (targetMob.y - p.y) * 0.15; }
                else if (Date.now() % 1000 < 50) { 
                    p.dom.style.transform = 'scale(1.5) translateY(-20px)'; 
                    setTimeout(() => { p.dom.style.transform = 'scale(1)'; if(socket) socket.emit('attackMonster', { monsterId: targetMob.id, skillId: 'pet' }); }, 200); 
                }
            } else {
                let targetX = game.player.x + (idx === 0 ? -40 : 40); let targetY = game.player.y - 20;
                p.x += (targetX - p.x) * 0.15; p.y += (targetY - p.y) * 0.15;
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

    // Teleport cooldown
    if (game.player.teleportCooldown > 0) game.player.teleportCooldown -= 16;
    if (game.player.teleportCooldown <= 0 && !game.isGhost) {
        const hitX = game.player.x + 12; const hitY = game.player.y + 76; 
        const tps = safeMapData.teleports || []; 
        let onPortal = null;
        for (let box of tps) { if (hitX < box.x + box.w && hitX + 24 > box.x && hitY < box.y + box.h && hitY + 20 > box.y) onPortal = box; }
        const uiTimer = document.getElementById('portal-timer-ui'); const uiSec = document.getElementById('portal-timer-sec');

        if (onPortal) { 
            if (game.player.currentPortal !== onPortal.portalId) { game.player.currentPortal = onPortal.portalId; game.player.portalEntryTime = Date.now(); if(uiTimer) uiTimer.style.display = 'block'; } 
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
            if (game.player.currentPortal !== null) { game.player.currentPortal = null; game.player.portalEntryTime = null; game.player.isTeleporting = false; if(uiTimer) uiTimer.style.display = 'none'; if(socket) socket.emit('portalLeave'); } 
        }
    }
    
    dom.playerContainer.style.left = game.player.x + 'px'; 
    dom.playerContainer.style.top = game.player.y + 'px'; 

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
    
    requestAnimationFrame(gameLoop);
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
        let assets = [ safeImage, 'animation/avatar_idlefront.png', 'animation/avatar_walk.png', 'animation/avatar_attack.png', 'animation/avatar_head.png', 'music/slash.mp3', 'music/lightning.mp3', 'music/splash.mp3', 'music/bump.mp3' ];
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

window.cleanupMap = function() { Object.keys(game.remotePlayers).forEach(id => window.removeRemotePlayer(id)); document.querySelectorAll('.monster-container, .pet-slime').forEach(el => el.remove()); game.monsters = {}; if (game.player.activePets) { game.player.activePets.forEach(pet => { if(pet.dom) pet.dom.remove(); }); game.player.activePets = []; } }
window.forceUnstuck = function() { game.player.x = 960; game.player.y = 1000; if (safeMapData.id !== 'town') { if(socket) socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 }); dom.log.innerText = "Evacuating to Town..."; } else { if(socket) socket.emit('playerMoved', { x: 960, y: 1000, state: 'idle', facingRight: window.facingRight, weaponSprite: game.player.equips.weapon?.sprite || null }); dom.log.innerText = "Unstuck! Returned to Town center."; } };
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
window.shootOrb = function(startX, startY, endX, endY) { const orb = document.createElement('div'); orb.className = 'magic-orb'; orb.style.left = startX + 'px'; orb.style.top = startY + 'px'; dom.world.appendChild(orb); const animation = orb.animate([{ left: startX + 'px', top: startY + 'px' }, { left: endX + 'px', top: endY + 'px' }], { duration: 500, easing: 'ease-in' }); animation.onfinish = () => orb.remove(); }
window.showBubble = function(playerObj, text) { if (!playerObj || !playerObj.dom) return; const bubble = document.createElement('div'); bubble.className = 'chat-bubble'; bubble.innerText = text; playerObj.dom.appendChild(bubble); setTimeout(() => bubble.remove(), 4000); }

window.updateAnimationFrames = function(state) {
    let currentAura = game.player.equips?.armor?.aura || null;
    let cAuraEl = document.getElementById('player-cosmetic-aura');
    if (cAuraEl) { cAuraEl.className = currentAura ? `cosmetic-aura aura-${currentAura}` : 'cosmetic-aura'; }
    
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
    } else if (dom.playerWeapon) { 
        dom.playerWeapon.style.display = 'none'; game.player.currentWeaponSrc = ''; 
    }
}
window.showAura = function(color) { const aura = document.getElementById('player-aura'); aura.className = `aura aura-${color}`; aura.style.animation = 'none'; void aura.offsetWidth; aura.style.animation = 'aura-burst 0.6s ease-out forwards'; }
window.playVoice = function(className) { let hairPrefix = window.charData.hairStyle === 'none' ? 'none' : `hair${window.charData.hairStyle}`; let formattedClass = className.replace(/\s+/g, '').toLowerCase(); let audio = new Audio(`skills/${hairPrefix}_${formattedClass}.mp3`); audio.volume = 0.8; audio.play().catch(e => {}); }
window.playBGM = function(trackName) { if (currentTrackName === trackName) return; if (currentBGM) { currentBGM.pause(); currentBGM.currentTime = 0; } currentTrackName = trackName; currentBGM = new Audio(`music/${trackName}.mp3`); currentBGM.loop = true; currentBGM.volume = 0.4; currentBGM.play().catch(e => {}); }
window.playSFX = function(weaponSprite) { 
    let sfx = 'bump'; 
    if (weaponSprite && weaponSprite.includes('staff')) sfx = 'lightning'; 
    if (weaponSprite && weaponSprite.includes('sword')) sfx = 'slash';
    if (weaponSprite && weaponSprite.includes('pendant')) sfx = 'splash'; 
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
    Godly: 20
};

window.sanitizeEquippedItem = function(item, expectedSlot) {
    if (!item || typeof item !== 'object') return null;
    if (item.type !== expectedSlot) return null;

    const clean = JSON.parse(JSON.stringify(item));

    // 🛡️ REMOVED: The frontend MAX_ENHANCE clamp is gone. It just reads whatever the item has.
    clean.enhanceLevel = Number(clean.enhanceLevel || 0);

    if (!clean.fixedStat || typeof clean.fixedStat !== 'object') clean.fixedStat = {};
    if (!clean.randomStat || typeof clean.randomStat !== 'object') clean.randomStat = {};

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

    ['weapon', 'armor', 'leggings'].forEach(slot => {
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
window.getDefense = function() { let def = window.getTotalStat('defense'); if (game.player.tauntBuffUntil && Date.now() < game.player.tauntBuffUntil) { def *= 5; } return def; };
window.getSpeed = function() { return window.getTotalStat('speed'); }; 
window.getBaseStat = function(lvl) { if (lvl >= 50) return 100; if (lvl >= 45) return 45; if (lvl >= 40) return 40; if (lvl >= 35) return 30; if (lvl >= 30) return 27; if (lvl >= 25) return 22; if (lvl >= 20) return 20; if (lvl >= 15) return 15; if (lvl >= 10) return 12; if (lvl >= 5) return 8; return 5; }
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
    let html = `<strong class="${item.rarity === "Godly" ? "rarity-godly" : ""}" style="color:${item.color}; font-size: 13px;">${item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name}</strong><br><span style="color:#888;">Lv. ${item.level || 1} ${item.rarity || 'Normal'}</span><br><br>`; 
    if(item.type === 'material') return html + `<span style="color:#aaa;"><em>${item.description}</em></span>`; 
    if(item.type === 'potion') return html + `Heals ${item.fixedStat.hpHeal} HP`; 
    if(item.type === 'consumable') return html + `<span style="color:#ffeb3b;"><em>${item.description}</em></span>`;
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
        if (item) {
            if (inTradeMode) { slot.style.border = "1px solid #2196F3"; slot.onclick = () => window.addTradeItem(i); } 
            else if (isEnhancing) { slot.style.border = "1px dashed #ffeb3b"; slot.onclick = (e) => window.attemptEnhance(i, e); } 
            else if (window.isApplyingAura) { slot.style.border = "1px dashed #00ffff"; slot.onclick = (e) => window.attemptApplyAura(i, e); }
            else { slot.style.borderBottom = `3px solid ${item.color || '#fff'}`; slot.onclick = (e) => window.openItemAction(i, e); }
            slot.appendChild(document.createTextNode(item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name));
            let tip = document.createElement('div'); tip.className = 'tooltip'; tip.innerHTML = window.getItemTooltip(item); slot.appendChild(tip);
            if (item.quantity && item.quantity > 1) { let q = document.createElement('span'); q.className = 'inv-qty'; q.innerText = 'x' + item.quantity; slot.appendChild(q); }
        }
        grid.appendChild(slot);
    }
    window.updateEquipmentDisplay();
    window.updatePotionHotbar();
}

window.openItemAction = function(index, e) {
    e.stopPropagation(); activeInvIndex = index; const menu = document.getElementById('inv-context-menu'); const item = game.player.inventory[index]; if (!item) return;
    document.getElementById('ctx-btn-equip').innerText = (item.type === 'potion' || item.type === 'consumable') ? "Use" : (item.type === 'material' ? "Enhance" : (item.type === 'aura' ? "Apply Aura" : "Equip"));
    document.getElementById('ctx-btn-sell').style.display = isShopping ? 'block' : 'none';
    document.getElementById('ctx-btn-extract-aura').style.display = (item.type === 'armor' && item.aura) ? 'block' : 'none';
    menu.style.display = 'flex'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
}

window.actionEquip = function(e) { if (e) e.stopPropagation(); if (activeInvIndex === -1 || !game.player.inventory[activeInvIndex]) return; let item = game.player.inventory[activeInvIndex]; if (item.type === 'material') { isEnhancing = true; dom.log.innerText = `Select equipment to enhance!`; window.renderInventory(); } else if (item.type === 'aura') { window.isApplyingAura = true; dom.log.innerText = `Select an Armor to apply the Aura!`; window.renderInventory(); } else { window.useItem(activeInvIndex); } document.getElementById('inv-context-menu').style.display = 'none'; }
window.attemptApplyAura = function(targetIndex, e) { 
    e.stopPropagation(); 
    // 🛡️ THE FIX: Send the request to the server!
    if (socket) socket.emit('requestApplyAura', { stoneIndex: activeInvIndex, targetIndex: targetIndex }); 
    window.isApplyingAura = false; 
    window.renderInventory(); 
}

window.extractAura = function(e) { 
    if (e) e.stopPropagation(); 
    if (activeInvIndex === -1 || !game.player.inventory[activeInvIndex]) return; 
    
    // 🛡️ THE FIX: Send the request to the server!
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
    
    // 🛡️ THE FIX: Tell the server to delete and save instantly
    if (socket) socket.emit('requestThrowItem', { index: activeInvIndex });
    
    dom.log.innerText = `Threw away item.`;
    document.getElementById('inv-context-menu').style.display = 'none'; 
    activeInvIndex = -1;
}
window.unequipItem = function(slot) {
    const eq = window.sanitizeEquippedItem(game.player.equips[slot], slot);
    if (!eq) return;

    const inv = game.player.inventory || [];
    const emptySlot = inv.findIndex(i => i === null);

    if (emptySlot === -1) {
        dom.log.innerText = "Inventory full!";
        return;
    }

    game.player.inventory[emptySlot] = eq;
    game.player.equips[slot] = null;

    dom.log.innerText = `Unequipped ${eq.name}.`;
    window.updateEquipmentDisplay();
    window.renderInventory();
    window.updateSkillMenu();
    DatabaseManager.savePlayerData(game.player);
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

    if (item.level && item.level > game.player.level) {
        dom.log.innerText = `Level ${item.level} required!`;
        return;
    }

    // 🛡️ THE FIX: Let the server handle ALL usable items instantly!
    if (['potion', 'consumable', 'weapon', 'armor', 'leggings'].includes(item.type)) {
        if (item.name === "Revival Juice") {
            window.useRevivalJuice(index);
        } else {
            if (socket) socket.emit('useInventoryItem', { index });
        }
        return;
    }

    dom.log.innerText = "That item cannot be equipped.";
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
window.attemptEnhance = function(targetIndex, e) { e.stopPropagation(); let stone = game.player.inventory[activeInvIndex]; let targetItem = game.player.inventory[targetIndex]; if (!stone || !targetItem || stone.type !== 'material' || targetItem.type === 'material' || targetItem.type === 'potion' || targetItem.rarity === "Starter" || (stone.rarity||'') !== (targetItem.rarity||'') || (stone.level||0) !== (targetItem.level||0) || (targetItem.enhanceLevel||0) >= 20) { isEnhancing = false; window.renderInventory(); return; } if(socket) socket.emit('requestEnhance', { stoneIndex: activeInvIndex, targetIndex: targetIndex }); isEnhancing = false; window.renderInventory(); }
window.updateEquipmentDisplay = function() { try { const buildDisplayStr = (item) => item ? (item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name) : 'None'; let w = game.player.equips.weapon; let a = game.player.equips.armor; let l = game.player.equips.leggings; document.getElementById('eq-weapon-slot').innerText = buildDisplayStr(w); if(w) document.getElementById('eq-weapon-slot').style.color = w.color; document.getElementById('eq-armor-slot').innerText = buildDisplayStr(a); if(a) document.getElementById('eq-armor-slot').style.color = a.color; document.getElementById('eq-leggings-slot').innerText = buildDisplayStr(l); if(l) document.getElementById('eq-leggings-slot').style.color = l.color; dom.playerArmor.style.display = 'none'; dom.playerLeggings.style.display = 'none'; const createTip = (item, boxId) => { let box = document.getElementById(boxId); let tip = box.querySelector('.tooltip'); if(!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; box.appendChild(tip); } if(item) tip.innerHTML = window.getItemTooltip(item); else tip.remove(); }; createTip(w, 'eq-box-weapon'); createTip(a, 'eq-box-armor'); createTip(l, 'eq-box-leggings'); let newMax = window.getMaxHp(); if(game.player.currentHp > newMax) game.player.currentHp = newMax; window.updateUI(); } catch(err) {} }
window.updateUI = function() { document.getElementById('ui-hp-text').innerText = `${game.player.currentHp} / ${window.getMaxHp()}`; document.getElementById('ui-hp-bar').style.width = (game.player.currentHp / Math.max(1, window.getMaxHp())) * 100 + '%'; document.getElementById('ui-hp-bar').style.backgroundColor = (game.player.currentHp < (window.getMaxHp()*0.3)) ? '#f44336' : '#4CAF50'; document.getElementById('ui-level-text').innerText = game.player.level; document.getElementById('ui-exp-text').innerText = `${game.player.exp} / ${game.player.maxExp}`; document.getElementById('ui-exp-bar').style.width = (game.player.exp / Math.max(1, game.player.maxExp)) * 100 + '%'; document.getElementById('ui-gold-text').innerText = game.player.gold || 0; if (game.party && game.party.members) { let me = game.party.members.find(x => x.id === game.player.id); if (me) { me.currentHp = game.player.currentHp; me.maxHp = window.getMaxHp(); me.level = game.player.level; window.renderPartyUI(); } } }
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
window.checkLevelUp = function() { if(game.player.level >= 50) return; while(game.player.exp >= game.player.maxExp && game.player.level < 50) { game.player.exp -= game.player.maxExp; game.player.level++; game.player.maxExp += (game.player.level >= 41 ? 1500 : game.player.level >= 31 ? 1000 : game.player.level >= 21 ? 750 : game.player.level >= 11 ? 500 : 100); game.player.baseStats.hp += 10; game.player.baseStats.str += 2; game.player.baseStats.int += 2; game.player.currentHp = window.getMaxHp(); const txt = document.createElement('div'); txt.className = 'level-up-text'; txt.innerText = "LEVEL UP!"; txt.style.left = (game.player.x - 20) + 'px'; txt.style.top = (game.player.y - 40) + 'px'; dom.world.appendChild(txt); setTimeout(() => txt.remove(), 2000); } window.updateUI(); window.updateSkillMenu(); DatabaseManager.savePlayerData(game.player); }

// ==========================================
// 6. ADMIN & MAP TOOLS
// ==========================================
window.buildCollisionLayers = function() { const layer = document.getElementById('collision-layers'); if (!layer) return; layer.innerHTML = ''; const cols = safeMapData.collisions || []; cols.forEach(box => { const div = document.createElement('div'); div.className = 'collision-box'; div.style.left = box.x + 'px'; div.style.top = box.y + 'px'; div.style.width = box.w + 'px'; div.style.height = box.h + 'px'; layer.appendChild(div); }); const tps = safeMapData.teleports || []; tps.forEach(box => { const div = document.createElement('div'); div.className = 'collision-box'; div.style.left = box.x + 'px'; div.style.top = box.y + 'px'; div.style.width = box.w + 'px'; div.style.height = box.h + 'px'; if (window.adminMode) { div.style.background = 'rgba(0, 0, 255, 0.4)'; div.style.border = '2px dashed #00f'; div.innerText = box.portalId || '?'; div.style.color = 'white'; div.style.display = 'flex'; div.style.justifyContent = 'center'; div.style.alignItems = 'center'; div.style.fontSize = '24px'; div.style.fontWeight = 'bold'; } layer.appendChild(div); }); if (window.adminMode) { if (safeMapData.spawnX !== undefined) { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = safeMapData.spawnX + 'px'; sm.style.top = safeMapData.spawnY + 'px'; sm.innerText = 'S'; layer.appendChild(sm); } (safeMapData.normalSpawns || []).forEach(sp => { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = sp.x + 'px'; sm.style.top = sp.y + 'px'; sm.style.borderColor = '#0f0'; sm.innerText = 'M'; layer.appendChild(sm); }); (safeMapData.miniBossSpawns || []).forEach(sp => { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = sp.x + 'px'; sm.style.top = sp.y + 'px'; sm.style.borderColor = '#ff9800'; sm.innerText = 'MB'; layer.appendChild(sm); }); (safeMapData.floorBossSpawns || []).forEach(sp => { const sm = document.createElement('div'); sm.className = 'admin-spawn-marker'; sm.style.left = sp.x + 'px'; sm.style.top = sp.y + 'px'; sm.style.borderColor = '#9c27b0'; sm.innerText = 'FB'; layer.appendChild(sm); }); } }
window.saveMapToServer = function() { let mapId = safeMapData.id || 'town'; let varName = mapId === 'town' ? 'townMapData' : mapId + 'MapData'; let str = `var ${varName} = ` + JSON.stringify(safeMapData, null, 4) + `;\nif(typeof window !== 'undefined') window['${varName}'] = ${varName};`; dom.adminOutput.value = str; if(socket) socket.emit('saveMapFile', { mapId: mapId, content: str }); dom.log.innerText = "Map saved to server!"; }
dom.world.addEventListener('contextmenu', (e) => { if (window.adminMode) { e.preventDefault(); } });
dom.world.addEventListener('mousedown', (e) => { if (window.adminMode && e.button === 2) { const rect = dom.world.getBoundingClientRect(); const hitX = Math.round((e.clientX - rect.left) / CAMERA_ZOOM); const hitY = Math.round((e.clientY - rect.top) / CAMERA_ZOOM); let closestDist = 40; let targetArray = null; let targetIndex = -1; const checkNearest = (arr) => { if (!arr) return; arr.forEach((item, index) => { let dist = Math.hypot(hitX - item.x, hitY - item.y); if (dist < closestDist) { closestDist = dist; targetArray = arr; targetIndex = index; } }); }; const checkInsideBox = (arr) => { if (!arr) return; arr.forEach((item, index) => { if (item.w && item.h) { if (hitX >= item.x && hitX <= item.x + item.w && hitY >= item.y && hitY <= item.y + item.h) { targetArray = arr; targetIndex = index; } } }); }; checkInsideBox(safeMapData.collisions); if (targetIndex === -1) checkInsideBox(safeMapData.teleports); if (targetIndex === -1) { checkNearest(safeMapData.normalSpawns); checkNearest(safeMapData.miniBossSpawns); checkNearest(safeMapData.floorBossSpawns); } if (targetIndex !== -1) { targetArray.splice(targetIndex, 1); window.buildCollisionLayers(); window.copyAdminData(); dom.log.innerText = `Deleted map object at ${hitX}, ${hitY}`; } else { dom.log.innerText = "No object here to delete."; } return; } if (window.adminMode && e.button !== 2) { if (e.altKey) { isDrawing = true; startX = e.offsetX; startY = e.offsetY; drawType = e.shiftKey ? 'teleport' : 'collision'; currentBox = document.createElement('div'); currentBox.className = 'collision-box'; currentBox.style.left = startX + 'px'; currentBox.style.top = startY + 'px'; if (drawType === 'teleport') { currentBox.style.background = 'rgba(0, 0, 255, 0.4)'; currentBox.style.border = '2px dashed #00f'; } else { currentBox.style.background = 'rgba(255, 0, 0, 0.4)'; currentBox.style.border = '1px solid red'; } document.getElementById('collision-layers').appendChild(currentBox); } else if (game.keys.z || game.keys.x || game.keys.c) { const rect = dom.world.getBoundingClientRect(); const hitX = Math.round((e.clientX - rect.left) / CAMERA_ZOOM); const hitY = Math.round((e.clientY - rect.top) / CAMERA_ZOOM); let mk = document.getElementById('admin-monster-key').value; let mlvl = parseInt(document.getElementById('admin-monster-level').value) || 5; let group = game.keys.z ? 'normalSpawns' : (game.keys.x ? 'miniBossSpawns' : 'floorBossSpawns'); if (!safeMapData[group]) safeMapData[group] = []; safeMapData[group].push({ x: hitX, y: hitY, monsterKey: mk, level: mlvl }); window.buildCollisionLayers(); window.copyAdminData(); dom.log.innerText = `Lv.${mlvl} Spawn added to ${group} at ${hitX}, ${hitY}`; if(socket) socket.emit('adminSpawnMonster', { x: hitX, y: hitY, monsterKey: mk, level: mlvl, instanceId: game.player.instanceId }); } } });
dom.world.addEventListener('mousemove', (e) => { if (!isDrawing || !currentBox) return; const currentX = e.offsetX; const currentY = e.offsetY; const width = currentX - startX; const height = currentY - startY; currentBox.style.width = Math.abs(width) + 'px'; currentBox.style.height = Math.abs(height) + 'px'; currentBox.style.left = (width < 0 ? currentX : startX) + 'px'; currentBox.style.top = (height < 0 ? currentY : startY) + 'px'; });
dom.world.addEventListener('mouseup', (e) => { if (isDrawing && currentBox) { isDrawing = false; const rect = currentBox.getBoundingClientRect(); const worldRect = dom.world.getBoundingClientRect(); const boxData = { x: Math.round((rect.left - worldRect.left) / CAMERA_ZOOM), y: Math.round((rect.top - worldRect.top) / CAMERA_ZOOM), w: Math.round(rect.width / CAMERA_ZOOM), h: Math.round(rect.height / CAMERA_ZOOM) }; if (boxData.w > 5 && boxData.h > 5) { if (drawType === 'teleport') { const pId = parseInt(prompt("Enter Portal ID (e.g., 1 connects to 2, 3 connects to 4):", "1")); const tMap = prompt("Enter Target Map ID (e.g., floor1):", "floor1"); if (!isNaN(pId)) { boxData.portalId = pId; boxData.targetMapId = tMap; if (!safeMapData.teleports) safeMapData.teleports = []; safeMapData.teleports.push(boxData); dom.log.innerText = `Teleport ${pId} added to ${tMap}`; } } else { if (!safeMapData.collisions) safeMapData.collisions = []; safeMapData.collisions.push(boxData); dom.log.innerText = "Collision added."; } } window.buildCollisionLayers(); window.copyAdminData(); } });
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
window.attemptLogin = function() { const u = document.getElementById('login-user').value.trim(); const p = document.getElementById('login-pass').value; if (!u || !p) return; localStorage.setItem('exonie_user', u); localStorage.setItem('exonie_pass', p); document.getElementById('auth-screen').classList.remove('active'); document.getElementById('loading-screen').style.display = 'flex'; if(socket) socket.emit('login', { username: u, password: p }); window.playBGM('loginmenu'); window.goFullscreen(); };
window.attemptRegister = function() { const u = document.getElementById('reg-user').value.trim(); const p = document.getElementById('reg-pass').value; if (!u || !p) return; localStorage.setItem('exonie_user', u); localStorage.setItem('exonie_pass', p); document.getElementById('auth-screen').classList.remove('active'); document.getElementById('loading-screen').style.display = 'flex'; if(socket) socket.emit('register', { username: u, password: p }); window.playBGM('loginmenu'); window.goFullscreen(); };
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
window.openPlayerContextMenu = function(targetId, e) { activeTargetPlayerId = targetId; const menu = document.getElementById('player-context-menu'); menu.style.display = 'flex'; menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px'; }; 
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

const chatInputDom = document.getElementById('chat-input'); const chatContainerDom = document.getElementById('chat-input-container');
chatInputDom.addEventListener('blur', () => { isChatting = false; chatContainerDom.style.display = 'none'; });
window.addEventListener('keydown', (e) => { 
    if (e.key === 'Enter') { 
        if (dom.game.classList.contains('active')) { 
            if (isChatting) { 
                let msg = chatInputDom.value.trim(); 
                if (msg !== '' && socket) { 
                    if (window.adminMode) { socket.emit('adminBroadcast', { text: msg }); window.addLogMessage(`<span style="color:#ffeb3b; font-weight:bold;">[Admin Broadcast] ${msg}</span>`); } 
                    else { socket.emit('chatMessage', { text: msg }); window.showBubble(game.player, msg); }
                } 
                chatInputDom.value = ''; chatContainerDom.style.display = 'none'; chatInputDom.blur(); isChatting = false; 
            } else { chatContainerDom.style.display = 'block'; chatInputDom.focus(); isChatting = true; game.keys.w = false; game.keys.a = false; game.keys.s = false; game.keys.d = false; } 
        } 
    } 
    if (!isChatting && e.key.toLowerCase() === 'f') window.toggleFriends();
    if (!isChatting && e.key.toLowerCase() === 'm') window.toggleMailbox();
});

function setKeyState(e, isDown) { 
    if (isChatting || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) return; 
    if (e.key === 'Tab' || e.code === 'Tab') { if (isDown) e.preventDefault(); game.keys['tab'] = isDown; return; } 
    const key = (e.code === 'KeyW' ? 'w' : e.code === 'KeyA' ? 'a' : e.code === 'KeyS' ? 's' : e.code === 'KeyD' ? 'd' : e.code === 'KeyZ' ? 'z' : e.code === 'KeyX' ? 'x' : e.code === 'KeyC' ? 'c' : (e.key || "").toLowerCase()); 
    if (isDown && key === 'b') { autoAttackMode = !autoAttackMode; if(dom.log) dom.log.innerText = `Auto-Attack: ${autoAttackMode ? 'ON' : 'OFF'}`; return; } 
    if (game.keys.hasOwnProperty(key)) game.keys[key] = isDown; 
    
    if (isDown) { 
        if (key === 'p' && typeof window.toggleStats === 'function') window.toggleStats(); 
        if (key === 'i' && typeof window.toggleInventory === 'function') window.toggleInventory(); 
        if (key === 'k' && typeof window.toggleSkillScreen === 'function') window.toggleSkillScreen(); 
        if (key === 'j' && typeof window.openShop === 'function') window.openShop(); 
        if (key === 'm' && typeof window.toggleMailbox === 'function') window.toggleMailbox(); // 🛡️ "M" KEY BOUND TO MAILBOX
        if (key === 'o') { 
            if (game.player.name === "Kei") { 
                window.adminMode = !window.adminMode; 
                let pnl = document.getElementById('admin-panel'); if(pnl) pnl.style.display = window.adminMode ? 'block' : 'none'; 
                dom.world.classList.toggle('admin-active', window.adminMode); 
                if(dom.log) dom.log.innerText = window.adminMode ? "Admin Mode ON" : "Admin Mode OFF"; 
                if(typeof window.buildCollisionLayers === 'function') window.buildCollisionLayers(); 
            } 
            else { if(dom.log) dom.log.innerText = "null"; } 
        } 
        if (key === '3') {
    if (!window.isLoading && !isChatting && !window.adminMode) {
        window.usePotionHotkey();
    }
}
        if (key === '1' || key === '2') {
            if (!game.isGhost && !window.isLoading && !isInventoryOpen && !isSkillOpen && !window.adminMode) {
                let slotIndex = key === '1' ? 0 : 1; let skill = game.player.activeSkills ? game.player.activeSkills[slotIndex] : null;
                if (skill) { 
                    // We removed the cooldown check here because it is now safely inside executeSkill!
                    skill.execute(); 
                }
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
    container.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); window.openPlayerContextMenu(pData.id, e); });
    const nameTag = document.createElement('div'); nameTag.className = 'name-tag'; nameTag.innerText = pData.name || pData.id; container.appendChild(nameTag);
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
    if (wpnSprite) { const fixedWpn = wpnSprite.replace('starter', 'basic'); weapon.style.display = 'block'; weapon.src = `weapon/${fixedWpn}.png`; game.remotePlayers[pData.id].currentWeaponSrc = weapon.src; }
};
window.removeRemotePlayer = function(id) { const p = game.remotePlayers[id]; if (p && p.dom) p.dom.remove(); delete game.remotePlayers[id]; };

// ==========================================
// 8. SOCKET LISTENERS & UPDATES
// ==========================================
if(socket) {
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
            if(document.getElementById('player-name-tag')) document.getElementById('player-name-tag').innerText = game.player.name; 
            if(document.getElementById('ui-name-display')) document.getElementById('ui-name-display').innerText = game.player.name;
            
            // 🛡️ APPLY TITLE ON LOGIN (Now reads from the new Supabase column)
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
            game.player.equips = (typeof userData.equips === 'object' && userData.equips !== null) ? userData.equips : { weapon: null, armor: null, leggings: null };
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

                    if (typeof gameLoop !== 'undefined') requestAnimationFrame(gameLoop);

                    // Make sure the game screen is already visible before showing Town UI + BGM
                    setTimeout(() => {
                        window.playBGM(safeMapData.id === 'town' ? 'town' : (safeMapData.id.includes('floor') ? 'floors' : 'town'));
                        try { window.showMapAnnouncement(safeMapData.id || 'town'); } catch(e) {}
                    }, 120);

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
    socket.on('sellSuccess', (data) => { game.player.gold = data.newGold; game.player.inventory = data.inventory; dom.log.innerText = `Item sold for ${data.price} Gold.`; window.updateUI(); window.renderInventory(); });
    socket.on('syncInventory', (serverInventory) => { game.player.inventory = serverInventory; window.updateEquipmentDisplay(); window.renderInventory(); });
   socket.on('inventoryItemUsed', (data) => {
    if (!data) return;

    if (Array.isArray(data.inventory)) {
        game.player.inventory = data.inventory;
    }

    if (typeof data.currentHp === 'number') {
        game.player.currentHp = data.currentHp;
    }

    // 🛡️ THE FIX: If the server hands us new equips, apply them to the screen instantly!
    if (data.equips) {
        game.player.equips = data.equips;
        window.updateEquipmentDisplay();
        window.updateSkillMenu();
    }

    if (data.classReset) {
        if (!game.player.baseStats) game.player.baseStats = {};
        game.player.baseStats.playerClass = null;
        game.player.activeSkills = [];
        window.updateSkillMenu();
        if (typeof isSkillOpen !== 'undefined' && isSkillOpen) {
            window.renderSkillScreen();
        }
        window.spawnDamageText(game.player.x + 24, game.player.y - 20, "CLASS RESET", '#ffeb3b');
        dom.log.innerText = `You reset your class! Open Skills (K) to pick a new one.`;
    } else if (data.healAmount) {
        window.spawnDamageText(game.player.x + 24, game.player.y - 20, `+${data.healAmount} HP`, '#4CAF50');
        dom.log.innerText = `Using ${data.itemName}...`;
    } else {
        dom.log.innerText = `${data.itemName} used.`;
    }

    window.updateUI();
    window.renderInventory();
    window.emitVitalsIfNeeded(true);
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
    socket.on('remotePlayerGhosted', (pid) => { const rp = document.getElementById('remote_' + pid); if(rp) rp.style.opacity = '0.5'; if(game.remotePlayers[pid]) game.remotePlayers[pid].isGhost = true; window.renderPartyUI(); });
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
    socket.on('friendsListUpdate', (friendsList) => { const container = document.getElementById('friends-list-container'); container.innerHTML = ''; if (!friendsList || friendsList.length === 0) { container.innerHTML = '<p style="text-align:center; color:#aaa;">Your friends list is empty.</p>'; return; } friendsList.forEach(f => { const row = document.createElement('div'); row.className = 'friend-row'; let lvlColor = f.online ? '#ffd700' : '#888'; let levelHtml = `<span style="color:${lvlColor}; font-size:12px; margin-left: 5px;">(Lv.${f.level})</span>`; let classFmt = f.pClass ? `<span style="color:#aaa; font-size:11px;">${f.pClass}</span>` : `<span style="color:#555; font-size:11px;">Novice</span>`; let mapFmt = f.online ? `<span style="color:#2196F3; font-size:11px;">[${f.mapId || 'Town'}]</span>` : ''; let spectateBtn = (game.player.name === 'Kei' && f.online) ? `<button class="dm-btn" style="background:#f44336; margin-bottom:5px;" onclick="window.startSpectate('${f.id}')">👁️ Spectate</button>` : ''; row.innerHTML = `<div class="friend-info" style="flex-direction:column; align-items:flex-start; gap:2px;"><div style="display:flex; align-items:center; gap:5px;"><div class="status-dot ${f.online ? 'online' : 'offline'}"></div>${f.id} ${levelHtml}</div><div style="margin-left: 17px; display:flex; gap: 8px;">${classFmt} ${mapFmt}</div></div><div style="display:flex; flex-direction:column;">${spectateBtn}<button class="dm-btn" onclick="window.promptDM('${f.id}')">DM</button></div>`; container.appendChild(row); }); });
    socket.on('receiveDM', (data) => { dom.log.innerHTML = `<span class="chat-dm">[DM] ${data.from}: ${data.message}</span>`; if (!data.from.startsWith('To ')) { window.playDMSound(); } });
    socket.on('systemMessage', (msg) => { dom.log.innerHTML = `<span style="color:#ffeb3b;">[System] ${msg}</span>`; });
socket.on('forceTeleport', (tp) => {
    window.loadMapScript(tp.mapId, () => {
        safeMapData = window.MapDatabase[tp.mapId];
        safeMapData.id = tp.mapId;

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
        window.playBGM(tp.mapId.includes('floor') ? 'floors' : 'town');
        window.showMapAnnouncement(tp.mapId);

        if (tp.spectateTarget) {
            // ✅ Enter spectate mode
            window.isSpectating = true;
            window.spectateTargetId = tp.spectateTarget;
            game.isGhost = true; // admin behaves like ghost locally while spectating
            dom.playerContainer.style.display = 'none';
            document.getElementById('spectate-ui').style.display = 'block';
            dom.log.innerText = `[ADMIN] Now Spectating: ${tp.spectateTarget}`;
        } else {
            // ✅ Leave spectate mode
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
    });
});
    socket.on('teleportApproved', (tp) => { 
        let nextMapId = tp.targetMapId || 'town'; 
        const transScreen = document.getElementById('map-transition'); 
        document.getElementById('transition-text').innerText = `Entering ${nextMapId}...`; 
        transScreen.style.display = 'flex'; 
        setTimeout(() => { transScreen.style.opacity = '1'; }, 10); 
        game.player.teleportCooldown = 4000; 
        
        setTimeout(() => { 
            window.loadMapScript(nextMapId, () => { 
                safeMapData = window.MapDatabase[nextMapId]; 
                safeMapData.id = nextMapId; // 🛡️ CRITICAL FIX: FORCES MAP ID TO UPDATE SO MONSTERS RENDER!
                
                let targetId = tp.portalId % 2 === 1 ? tp.portalId + 1 : tp.portalId - 1; 
                let targetPortal = safeMapData.teleports.find(p => p.portalId === targetId); 
                
                window.preloadMapAssets(safeMapData, () => { 
                    game.player.x = targetPortal ? (targetPortal.x + (targetPortal.w / 2) - (game.player.width / 2)) : safeMapData.spawnX; 
                    game.player.y = targetPortal ? (targetPortal.y + targetPortal.h - game.player.height + 5) : safeMapData.spawnY; 
                    dom.world.style.backgroundImage = `url('${safeMapData.image}')`; 
                    window.buildCollisionLayers(); 
                    window.cleanupMap(); 
                    
                    if(socket) socket.emit('playerTeleported', { mapId: nextMapId, x: game.player.x, y: game.player.y, mapData: safeMapData }); 
                    window.playBGM(nextMapId.includes('floor') ? 'floors' : 'town'); 
                    window.showMapAnnouncement(nextMapId); 
                    
                    transScreen.style.opacity = '0'; 
                    setTimeout(() => { transScreen.style.display = 'none'; }, 1000); 
                }); 
            }); 
        }, 500); 
    });
    socket.on('remotePlayerMoved', (data) => { if (!game.remotePlayers[data.id]) window.addRemotePlayer({ id: data.id, name: data.id, x: data.x, y: data.y, spriteData: {} }); const p = game.remotePlayers[data.id]; if (!p) return; p.x = data.x; p.y = data.y; p.dom.style.left = p.x + 'px'; p.dom.style.top = p.y + 'px'; p.rig.style.transform = data.facingRight ? 'scaleX(-1)' : 'scaleX(1)'; let pulseActive = (Math.floor(Date.now() / 250) % 2 === 0); let bodySrc = 'animation/avatar_idlefront.png'; let isAtk = false; if (data.state === 'attack') { bodySrc = 'animation/avatar_attack.png'; isAtk = true; } else if (data.state === 'walk') { bodySrc = pulseActive ? 'animation/avatar_walk.png' : 'animation/avatar_idlefront.png'; } if (p.currentBodySrc !== bodySrc) { p.body.src = bodySrc; p.currentBodySrc = bodySrc; } if (data.weaponSprite) { p.weapon.style.display = 'block'; let fixedWpn = data.weaponSprite.replace('starter', 'basic'); let wpnSrc = `weapon/${fixedWpn}${(data.state === 'attack' && isAtk && !fixedWpn.includes('pendant')) ? '_attack' : ''}.png`; if (p.currentWeaponSrc !== wpnSrc) { p.weapon.src = wpnSrc; p.currentWeaponSrc = wpnSrc; } if (!p.spriteData) p.spriteData = {}; p.spriteData.weapon = fixedWpn; } else { p.weapon.style.display = 'none'; p.currentWeaponSrc = ''; if (p.spriteData) p.spriteData.weapon = null; } const cAuraEl = p.rig.querySelector('.cosmetic-aura'); if (cAuraEl) cAuraEl.className = data.spriteData?.aura ? `cosmetic-aura aura-${data.spriteData.aura}` : 'cosmetic-aura'; const titleEl = p.dom.querySelector('.title-tag');
        if (titleEl) {
            titleEl.innerText = data.spriteData?.title ? `<${data.spriteData.title}>` : '';
        }
        });
    socket.on('inspectData', (data) => { if (!data) return; dom.inspect.style.display = 'block'; dom.inspectTitle.innerText = `Inspect: ${data.name || data.id || "Unknown"}`; const equips = data.equips || {}; const slots = [ { key: 'weapon', label: 'Weapon' }, { key: 'armor', label: 'Armor' }, { key: 'leggings', label: 'Leggings' } ]; function fmtStatBlock(item) { if (!item) return `<div class="inspect-empty">None</div>`; const rarityColor = item.color || (window.RARITY_COLORS[item.rarity] || "#fff"); const nameClass = item.rarity === "Godly" ? "rarity-godly" : ""; const displayName = item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name; let html = `<div class="inspect-title"><div class="inspect-item-name ${nameClass}" style="color:${rarityColor};">${displayName}</div><div class="inspect-sub">Lv.${item.level || 1} ${item.rarity || "Unknown"}</div></div><div class="inspect-stat">`; if (item.fixedStat) { for (const k in item.fixedStat) html += `<div><b>Fixed:</b> +${item.fixedStat[k]} ${k.toUpperCase()}</div>`; } if (item.randomStat) { for (const k in item.randomStat) html += `<div><b>Random:</b> +${item.randomStat[k]} ${k.toUpperCase()}</div>`; } if (item.sprite) { html += `<div style="color:#888; margin-top:6px;">Sprite: ${item.sprite}.png</div>`; } html += `</div>`; return html; } let out = `<div style="font-size:14px; color:#ccc; margin-bottom:10px; text-align:center;">Level ${data.level || 1} &nbsp; | &nbsp; HP ${data.currentHp ?? "?"} / ${data.maxHp ?? "?"}</div>`; slots.forEach(s => { out += `<div class="inspect-equip"><div style="font-weight:bold; color:#ffeb3b; margin-bottom:6px;">${s.label}</div>${fmtStatBlock(equips[s.key])}</div>`; }); dom.inspectContent.innerHTML = out; });
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
    socket.on('remoteSkillEffect', (data) => { const p = game.remotePlayers[data.playerId]; if (p) { const aura = p.dom.querySelector('.aura') || document.createElement('div'); aura.className = `aura aura-${data.auraColor}`; if (!p.dom.querySelector('.aura')) p.dom.querySelector('.player-avatar-container').prepend(aura); aura.style.animation = 'none'; void aura.offsetWidth; aura.style.animation = 'aura-burst 0.6s ease-out forwards'; } });
    
    socket.on('monsterState', (monsters) => {
        if (!Array.isArray(monsters) || safeMapData.id === 'town') return; 
        const currentIds = new Set();
        monsters.forEach(m => {
            currentIds.add(m.id); let mEl = document.getElementById('mob_' + m.id);
            if (!mEl) {
                mEl = document.createElement('div'); mEl.id = 'mob_' + m.id; mEl.className = 'entity monster-container'; mEl.style.position = 'absolute'; mEl.style.cursor = 'crosshair'; mEl.style.zIndex = '50'; mEl.style.display = 'flex'; mEl.style.justifyContent = 'center'; mEl.style.alignItems = 'flex-end';
                mEl.innerHTML = `<div class="name-tag mob-name">${m.name} Lv.${m.level || 5}</div><div class="monster-sprite-layer" style="width:100%; height:100%; background-size:contain; background-repeat:no-repeat; background-position:bottom;"></div><div class="monster-ui-layer" style="position:absolute; top:-20px; left:0; width:100%; pointer-events:none;"><div class="bar-container" style="height:5px; border-radius:0; margin-bottom:0;"><div class="hp-fill monster-hp-fill" style="background-color:#f44336; height:100%; width:100%;"></div></div></div>`;
                mEl.addEventListener('pointerdown', (e) => { e.stopPropagation(); if(!window.isLoading){ window.attemptAttackTarget = m.id; window.attemptAttack(false); } });
                dom.world.appendChild(mEl);
            }
            game.monsters[m.id] = m;
            if (!m.alive) { mEl.style.display = 'none'; } else {
                mEl.style.display = 'flex'; mEl.style.left = m.x + 'px'; mEl.style.top = m.y + 'px'; mEl.style.width = (m.width || 40) + 'px'; mEl.style.height = (m.height || 40) + 'px';
                const hpBarFill = mEl.querySelector('.monster-hp-fill'); if(hpBarFill) hpBarFill.style.width = (m.currentHp / Math.max(1, m.maxHp)) * 100 + '%';
                const spriteLayer = mEl.querySelector('.monster-sprite-layer'); mEl.style.setProperty('--mob-color', m.cssColor); 
                if (m.monsterKey.includes('2')) { spriteLayer.className = 'monster-sprite-layer bat-sprite'; spriteLayer.style.background = m.cssColor; spriteLayer.style.border = 'none'; spriteLayer.style.animation = 'none'; } 
                else if (m.monsterKey.includes('3')) { spriteLayer.className = 'monster-sprite-layer fire-sprite'; spriteLayer.style.background = m.cssColor; spriteLayer.style.border = 'none'; spriteLayer.style.animation = 'none'; }
                else if (m.monsterKey.includes('1') || m.monsterKey.includes('common_mobs') || m.monsterKey.includes('mini_boss') || m.monsterKey.includes('floor_boss')) { spriteLayer.className = 'monster-sprite-layer'; spriteLayer.style.backgroundImage = 'none'; spriteLayer.style.backgroundColor = m.cssColor || '#ff69b4'; spriteLayer.style.border = `2px solid ${m.cssBorder || '#c71585'}`; spriteLayer.style.borderRadius = '50% 50% 40% 40%'; spriteLayer.style.animation = 'slime-bounce 0.5s infinite alternate'; } 
                else { spriteLayer.className = 'monster-sprite-layer'; spriteLayer.style.backgroundColor = 'transparent'; spriteLayer.style.border = 'none'; spriteLayer.style.borderRadius = '0'; spriteLayer.style.backgroundImage = `url('monsters/${m.monsterKey}.png')`; spriteLayer.style.animation = 'none'; }
            } 
        });
        Object.keys(game.monsters).forEach(id => { if (!currentIds.has(id)) { let staleEl = document.getElementById('mob_' + id); if (staleEl) staleEl.remove(); delete game.monsters[id]; } });
    });

socket.on('monsterAttack', (data) => {
    if (!data || !game.monsters[data.monsterId]) return;

    const m = game.monsters[data.monsterId];
    const mEl = document.getElementById('mob_' + m.id);
    if (!mEl) return;

    const targetId = data.targetId;
    let tx = game.player.x + 24;
    let ty = game.player.y + 48;

    if (targetId !== game.player.id && game.remotePlayers[targetId]) {
        const rp = game.remotePlayers[targetId];
        tx = rp.x + 24;
        ty = rp.y + 48;
    }

    let hitPet = null;
    if (game.player.activePets) {
        hitPet = game.player.activePets.find(p => p.id === targetId);
        if (hitPet) {
            tx = hitPet.x + 15;
            ty = hitPet.y + 15;
        }
    }

    const isElemental = m.monsterKey && String(m.monsterKey).includes('3');
    const mcx = m.x + (m.width / 2);
    const mcy = m.y + (m.height / 2);

    if (isElemental) {
        window.shootMonsterFireball(mcx, mcy, tx, ty);
    }

    let dx = tx - mcx;
    let dy = ty - mcy;
    let dist = Math.hypot(dx, dy) || 1;
    let moveX = (dx / dist) * 20;
    let moveY = (dy / dist) * 20;

    const spriteLayer = mEl.querySelector('.monster-sprite-layer');
    if (spriteLayer) {
        spriteLayer.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.1)`;
        setTimeout(() => {
            spriteLayer.style.transform = `translate(0px, 0px) scale(1)`;
        }, 150);
    }

    let sfxFile = 'bump';
    if (m.monsterKey.includes('2')) sfxFile = 'lightning';
    else if (m.monsterKey.includes('3')) sfxFile = 'splash';

    let hitSound = new Audio(`music/${sfxFile}.mp3`);
    hitSound.volume = 0.4;
    hitSound.play().catch(e => {});

 if (hitPet) {
        const serverAtk = Number(data.atk || m.atk || 25);
        const petDef = Math.floor(window.getDefense() * 0.25);
        const actualDmg = Math.max(1, serverAtk - petDef);
        hitPet.hp -= actualDmg;
        window.spawnDamageText(hitPet.x + 15, hitPet.y - 10, actualDmg, '#ff0000');
    } else if (targetId === game.player.id) {
        // 🛡️ THE FIX: Apply the server's damage to the LOCAL player!
        game.player.currentHp = Math.max(0, data.newHp);
        
        if (data.damage > 0) {
            window.spawnDamageText(game.player.x + 24, game.player.y - 10, data.damage, '#f44336');
            window.spawnSpark(game.player.x + 24, game.player.y + 48);
        }
        
        // Enforce Berserker Immortal Buff locally so UI doesn't break
        if (game.player.currentHp <= 0 && Date.now() < game.player.immortalUntil) {
            game.player.currentHp = 1;
            window.spawnDamageText(game.player.x + 24, game.player.y - 10, "IMMORTAL", '#ffeb3b');
        }
        
        window.updateUI();
    } else if (game.remotePlayers[targetId]) {
        // 🛡️ THE FIX: Show damage text when remote players get hit!
        const rp = game.remotePlayers[targetId];
        if (data.damage > 0) {
            window.spawnDamageText(rp.x + 24, rp.y - 10, data.damage, '#f44336');
            window.spawnSpark(rp.x + 24, rp.y + 48);
        }
    }
}); 

    socket.on('monsterSkill', (data) => { if (data.skillName === 'Earthquake') { const gameContainer = document.getElementById('game-container'); gameContainer.classList.add('screen-shake'); setTimeout(() => gameContainer.classList.remove('screen-shake'), 500); const ring = document.createElement('div'); ring.className = 'earthquake-ring'; ring.style.left = (data.x - data.radius) + 'px'; ring.style.top = (data.y - data.radius) + 'px'; ring.style.width = (data.radius * 2) + 'px'; ring.style.height = (data.radius * 2) + 'px'; document.getElementById('world').appendChild(ring); setTimeout(() => ring.remove(), 800); } });
   socket.on('monsterHit', (data) => { 
        if (!data || !game.monsters[data.monsterId]) return; 
        const m = game.monsters[data.monsterId]; 
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
    socket.on('monsterDied', (data) => { if (!data || !game.monsters[data.monsterId]) return; game.monsters[data.monsterId].alive = false; const mEl = document.getElementById('mob_' + data.monsterId); if(mEl) mEl.style.display = 'none'; window.updateUI(); });
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
    
    // Reveal Unstuck Button
    setTimeout(() => {
        let unstuckBtn = document.getElementById('unstuck-btn');
        if (unstuckBtn) unstuckBtn.style.display = 'block';
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

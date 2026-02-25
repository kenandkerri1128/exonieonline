// ==========================================
// ADMIN & MAPPER TOOLS (Completely Isolated)
// ==========================================
window.adminMode = false; 
let isDrawingBox = false; 
let isDrawingTeleport = false;
let drawStartX = 0; 
let drawStartY = 0; 
let tempDrawBox = null;

window.toggleAdminMode = function() {
    window.adminMode = !window.adminMode; 
    let panel = document.getElementById('admin-panel');
    if(panel) panel.style.display = window.adminMode ? 'block' : 'none';
    
    let world = document.getElementById('world');
    if(world) window.adminMode ? world.classList.add('admin-active') : world.classList.remove('admin-active');
    
    if (typeof buildCollisionLayers === 'function') buildCollisionLayers(); 
    if (typeof updateAdminPanel === 'function') updateAdminPanel();
}

window.adminSetPlayerLevel = function() {
    let lvl = parseInt(document.getElementById('admin-player-level').value) || 1;
    game.player.level = lvl;
    game.player.baseStats.hp = 100 + ((lvl - 1) * 10);
    game.player.baseStats.str = 10 + ((lvl - 1) * 2);
    game.player.baseStats.int = 10 + ((lvl - 1) * 2);
    game.player.exp = 0;
    
    let expAdded = 200;
    if (lvl >= 41) expAdded = 1500; else if (lvl >= 31) expAdded = 1000;
    else if (lvl >= 21) expAdded = 750; else if (lvl >= 11) expAdded = 500;
    
    game.player.maxExp = expAdded; 
    game.player.currentHp = getMaxHp();
    
    if(typeof updateUI === 'function') updateUI();
    let statScrn = document.getElementById('stat-screen');
    if(statScrn && statScrn.style.display === 'block') { toggleStats(); toggleStats(); } 
    let log = document.getElementById('combat-log');
    if(log) log.innerText = `Admin: Player level set to ${lvl}.`;
}

window.adminGiveCustomItem = function() {
    let lvl = parseInt(document.getElementById('admin-item-level').value) || 1;
    let enh = parseInt(document.getElementById('admin-item-enhance').value) || 0;
    let type = document.getElementById('admin-item-type').value; 
    let rarity = document.getElementById('admin-item-rarity').value; 

    let template = ITEM_TEMPLATES[type];
    let name = `[Admin] ${rarity} ${template.baseName}`;
    let spriteName = rarity.toLowerCase() + template.spriteName;
    
    let item = {
        id: Date.now() + Math.random(), name: name, type: template.slot, sprite: spriteName,
        level: lvl, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: enh
    };
    
    let getBaseStat = function(l) {
        if (l >= 50) return 100; if (l >= 45) return 45; if (l >= 40) return 40;
        if (l >= 35) return 30; if (l >= 30) return 27; if (l >= 25) return 22;
        if (l >= 20) return 20; if (l >= 15) return 15; if (l >= 10) return 12;
        if (l >= 5) return 8; return 5;
    };
    
    let baseScaling = getBaseStat(lvl);
    let rarityBonus = { "Starter": 0, "Basic": 0, "Rare": 2, "Unique": 5, "Legend": 8, "Godly": 12 }[rarity] || 0;
    let statVal = baseScaling + rarityBonus;
    
    if (type === 'pendant') statVal = Math.floor(statVal / 2);
    
    let enhBonus = { "Starter": 1, "Basic": 2, "Rare": 5, "Unique": 7, "Legend": 10, "Godly": 15 }[rarity] || 2;
    statVal += (enh * enhBonus);

    item.fixedStat[template.statKey] = statVal;
    item.randomStat = {};
    let rStat = STAT_TYPES[Math.floor(Math.random() * STAT_TYPES.length)];
    item.randomStat[rStat] = Math.floor(Math.random() * baseScaling) + 1 + (enh * enhBonus);

    if (typeof addLoot === 'function') addLoot(item);
}

window.updateAdminPanel = function() { 
    let out = document.getElementById('admin-output');
    if(out && typeof safeMapData !== 'undefined') {
        out.value = `window.MapDatabase = window.MapDatabase || {};\nwindow.MapDatabase["${safeMapData.id}"] = {\n    id: "${safeMapData.id}",\n    name: "${safeMapData.name}",\n    image: "${safeMapData.image}",\n    spawnX: ${safeMapData.spawnX},\n    spawnY: ${safeMapData.spawnY},\n    normalSpawns: ${JSON.stringify(safeMapData.normalSpawns || [])},\n    miniBossSpawns: ${JSON.stringify(safeMapData.miniBossSpawns || [])},\n    floorBossSpawns: ${JSON.stringify(safeMapData.floorBossSpawns || [])},\n    collisions: ${JSON.stringify(safeMapData.collisions, null, 2)},\n    teleports: ${JSON.stringify(safeMapData.teleports || [], null, 2)}\n};`; 
    }
}

window.undoLastBox = function() { 
    if (typeof safeMapData !== 'undefined') { 
        if(safeMapData.collisions.length > 0) { safeMapData.collisions.pop(); } 
        else if (safeMapData.teleports && safeMapData.teleports.length > 0) { safeMapData.teleports.pop(); }
        if(typeof buildCollisionLayers === 'function') buildCollisionLayers(); window.updateAdminPanel(); 
    } 
}

window.clearAllBoxes = function() { 
    if (typeof safeMapData !== 'undefined') { 
        safeMapData.collisions = []; safeMapData.teleports = []; safeMapData.normalSpawns = []; safeMapData.miniBossSpawns = []; safeMapData.floorBossSpawns = [];
        if(typeof buildCollisionLayers === 'function') buildCollisionLayers(); window.updateAdminPanel(); 
    } 
}

window.copyAdminData = function() { let out = document.getElementById('admin-output'); if(out) { out.select(); document.execCommand('copy'); alert("Copied Map Data!"); } }

window.addEventListener('load', () => {
    let worldEl = document.getElementById('world');
    if(!worldEl) return;

    worldEl.addEventListener('mousedown', (e) => {
        if (!window.adminMode) return;
        const rect = worldEl.getBoundingClientRect(); 
        const clickX = (e.clientX - rect.left) / CAMERA_ZOOM; const clickY = (e.clientY - rect.top) / CAMERA_ZOOM;
        
        if (game.keys['tab']) { safeMapData.spawnX = Math.floor(clickX); safeMapData.spawnY = Math.floor(clickY); game.player.x = safeMapData.spawnX; game.player.y = safeMapData.spawnY; window.updateAdminPanel(); if(typeof buildCollisionLayers === 'function') buildCollisionLayers(); return; }
        
        // Z, X, C Spawns
        if (game.keys['z']) { safeMapData.normalSpawns = safeMapData.normalSpawns || []; safeMapData.normalSpawns.push({x: Math.floor(clickX), y: Math.floor(clickY)}); window.updateAdminPanel(); if(typeof buildCollisionLayers === 'function') buildCollisionLayers(); return; }
        if (game.keys['x']) { safeMapData.miniBossSpawns = safeMapData.miniBossSpawns || []; safeMapData.miniBossSpawns.push({x: Math.floor(clickX), y: Math.floor(clickY)}); window.updateAdminPanel(); if(typeof buildCollisionLayers === 'function') buildCollisionLayers(); return; }
        if (game.keys['c']) { safeMapData.floorBossSpawns = safeMapData.floorBossSpawns || []; safeMapData.floorBossSpawns.push({x: Math.floor(clickX), y: Math.floor(clickY)}); window.updateAdminPanel(); if(typeof buildCollisionLayers === 'function') buildCollisionLayers(); return; }

        if (e.altKey && e.shiftKey) { 
            drawStartX = clickX; drawStartY = clickY; isDrawingBox = true; isDrawingTeleport = true;
            tempDrawBox = document.createElement('div'); tempDrawBox.className = 'collision-box temp-draw'; 
            tempDrawBox.style.background = 'rgba(0, 0, 255, 0.4)'; tempDrawBox.style.border = '2px dashed #00f'; 
            tempDrawBox.style.left = drawStartX + 'px'; tempDrawBox.style.top = drawStartY + 'px'; 
            document.getElementById('collision-layers').appendChild(tempDrawBox); 
        } else if (e.altKey && !e.shiftKey) { 
            drawStartX = clickX; drawStartY = clickY; isDrawingBox = true; isDrawingTeleport = false;
            tempDrawBox = document.createElement('div'); tempDrawBox.className = 'collision-box temp-draw'; 
            tempDrawBox.style.background = 'rgba(255, 0, 0, 0.4)'; tempDrawBox.style.border = '2px dashed #f00'; 
            tempDrawBox.style.left = drawStartX + 'px'; tempDrawBox.style.top = drawStartY + 'px'; 
            document.getElementById('collision-layers').appendChild(tempDrawBox); 
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDrawingBox) return;
        const rect = worldEl.getBoundingClientRect(); let curX = (e.clientX - rect.left) / CAMERA_ZOOM; let curY = (e.clientY - rect.top) / CAMERA_ZOOM;
        tempDrawBox.style.left = Math.min(drawStartX, curX) + 'px'; tempDrawBox.style.top = Math.min(drawStartY, curY) + 'px';
        tempDrawBox.style.width = Math.abs(curX - drawStartX) + 'px'; tempDrawBox.style.height = Math.abs(curY - drawStartY) + 'px';
    });

    window.addEventListener('mouseup', (e) => {
        if (!isDrawingBox) return; isDrawingBox = false;
        const rect = worldEl.getBoundingClientRect(); let curX = (e.clientX - rect.left) / CAMERA_ZOOM; let curY = (e.clientY - rect.top) / CAMERA_ZOOM;
        let w = Math.floor(Math.abs(curX - drawStartX)); let h = Math.floor(Math.abs(curY - drawStartY));
        
        let boxData = { x: Math.floor(Math.min(drawStartX, curX)), y: Math.floor(Math.min(drawStartY, curY)), w: w, h: h };

        if(w > 10 && h > 10) { 
            if (isDrawingTeleport) {
                let portalNum = prompt("Enter Portal Number (e.g., 1 pairs with 2):", "1");
                let targetMap = prompt("Enter the Target Map ID this goes to:", "town");
                boxData.portalId = parseInt(portalNum) || 1;
                boxData.targetMapId = targetMap;
                safeMapData.teleports = safeMapData.teleports || []; safeMapData.teleports.push(boxData);
            } else { safeMapData.collisions.push(boxData); }
            window.updateAdminPanel(); if(typeof buildCollisionLayers === 'function') buildCollisionLayers(); 
        } else { tempDrawBox.remove(); } tempDrawBox = null;
    });
});
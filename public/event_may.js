// ==========================================
// 🎉 MAY EVENT: COMPANION EVENT
// Client-side logic for the Event Portal & Dungeon
// ==========================================
(function() {
    'use strict';

    // ==========================================
    // EVENT PORTAL UI
    // ==========================================
    window.openEventPortal = function() {
        const screen = document.getElementById('event-portal-screen');
        if (!screen) return;
        screen.style.display = 'flex';

        // Lock player movement
        if (window.game) {
            window.game.keys.w = false;
            window.game.keys.a = false;
            window.game.keys.s = false;
            window.game.keys.d = false;
        }
        window.isEventUIOpen = true;

        // Update ID piece counts
        window.updateEventRewardCounts();
    };

    window.closeEventPortal = function() {
        const screen = document.getElementById('event-portal-screen');
        if (screen) screen.style.display = 'none';
        const rewardPanel = document.getElementById('event-rewards-panel');
        if (rewardPanel) rewardPanel.style.display = 'none';
        window.isEventUIOpen = false;

        // Release portal lock
        if (window.game && window.game.player) {
            window.game.player.currentPortal = 'JUST_SPAWNED';
            window.game.player.isTeleporting = false;
        }
        window.isLoading = false;
        window.isTransitioning = false;
    };

    // ==========================================
    // EVENT REWARDS UI
    // ==========================================
    window.openEventRewards = function() {
        const panel = document.getElementById('event-rewards-panel');
        if (panel) panel.style.display = 'flex';
        window.updateEventRewardCounts();
    };

    window.closeEventRewards = function() {
        const panel = document.getElementById('event-rewards-panel');
        if (panel) panel.style.display = 'none';
    };

    window.updateEventRewardCounts = function() {
        if (!window.game || !window.game.player) return;
        const inv = window.game.player.inventory || [];

        const types = ['Berserker', 'Healer', 'Ice Master'];
        types.forEach(type => {
            let count = 0;
            inv.forEach(i => {
                if (i && i.name === `${type} ID Piece`) count += (i.quantity || 1);
            });
            const el = document.getElementById(`event-piece-count-${type.replace(/\s/g, '')}`);
            if (el) el.innerText = `${count}/10`;

            const btn = document.getElementById(`event-trade-btn-${type.replace(/\s/g, '')}`);
            if (btn) {
                if (count >= 10) {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                } else {
                    btn.disabled = true;
                    btn.style.opacity = '0.4';
                    btn.style.cursor = 'not-allowed';
                }
            }
        });
    };

    window.tradeEventReward = function(companionClass) {
        if (!window.socket) return;

        // Check companion cap (max 2) — server will also validate
        const companions = window.game?.player?.companions || [];
        if (companions.length >= 2) {
            const log = document.getElementById('game-log');
            if (log) log.innerText = 'You already have 2 companions! You cannot activate more.';
            return;
        }

        window.socket.emit('tradeEventReward', { companionClass: companionClass });
    };

    // ==========================================
    // EVENT DUNGEON ENTRY
    // ==========================================
    window.startEventDungeon = function() {
        if (!window.socket) return;

        window.closeEventPortal();

        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.innerText = 'Entering the Cave...';
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'flex';

        window.socket.emit('startEventDungeon');
    };

    // ==========================================
    // EVENT DUNGEON TIMER
    // ==========================================
    let eventTimerInterval = null;

    window.startEventTimer = function(durationMs) {
        const timerEl = document.getElementById('event-dungeon-timer');
        if (!timerEl) return;
        timerEl.style.display = 'block';

        const endTime = Date.now() + durationMs;

        if (eventTimerInterval) clearInterval(eventTimerInterval);
        eventTimerInterval = setInterval(() => {
            const remaining = Math.max(0, endTime - Date.now());
            const seconds = Math.ceil(remaining / 1000);

            timerEl.innerText = `⏳ ${seconds}s`;

            if (seconds <= 10) {
                timerEl.style.color = '#f44336';
                timerEl.style.textShadow = '0 0 20px #f44336';
            } else {
                timerEl.style.color = '#ffeb3b';
                timerEl.style.textShadow = '0 0 15px #ff9800';
            }

            if (remaining <= 0) {
                clearInterval(eventTimerInterval);
                eventTimerInterval = null;
                timerEl.innerText = '⏳ 0s';
            }
        }, 100);
    };

    window.stopEventTimer = function() {
        if (eventTimerInterval) {
            clearInterval(eventTimerInterval);
            eventTimerInterval = null;
        }
        const timerEl = document.getElementById('event-dungeon-timer');
        if (timerEl) timerEl.style.display = 'none';
    };

    // ==========================================
    // COMPANION LIST UI (V Key)
    // ==========================================
    window.toggleCompanionList = function() {
        const screen = document.getElementById('companion-list-screen');
        if (!screen) return;

        const isOpen = screen.style.display === 'block';
        screen.style.display = isOpen ? 'none' : 'block';

        if (!isOpen) window.renderCompanionList();

        if (window.isMobileUI && window.isMobileUI()) {
            if (typeof window.enableMobileWindowControls === 'function') window.enableMobileWindowControls(screen);
            if (typeof window.bringWindowToFront === 'function') window.bringWindowToFront(screen);
            if (typeof window.clampWindowToViewport === 'function') window.clampWindowToViewport(screen);
        }
    };

    window.renderCompanionList = function() {
        const container = document.getElementById('companion-list-body');
        if (!container) return;
        container.innerHTML = '';

        const companions = window.game?.player?.companions || [];

        if (companions.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#aaa; margin-top:30px;">You have no companions yet.<br><span style="font-size:12px; color:#666;">Obtain Companion Tokens from the Event Portal to recruit one!</span></p>';
            return;
        }

        companions.forEach((comp, idx) => {
            const classColors = { 'Berserker': '#f44336', 'Healer': '#4CAF50', 'Ice Master': '#2196F3' };
            const color = classColors[comp.class] || '#fff';

            const card = document.createElement('div');
            card.className = 'companion-card';
            card.style.cssText = `background: rgba(0,0,0,0.6); border: 2px solid ${color}; border-radius: 8px; padding: 12px; margin-bottom: 10px; cursor: pointer; transition: all 0.2s;`;
            card.onmouseenter = () => { card.style.boxShadow = `0 0 15px ${color}`; };
            card.onmouseleave = () => { card.style.boxShadow = 'none'; };
            card.onclick = () => window.openCompanionDetail(idx);

            // Avatar preview
            const avatarDiv = document.createElement('div');
            avatarDiv.style.cssText = 'display:flex; align-items:center; gap:12px;';

            const avatarImg = document.createElement('div');
            avatarImg.style.cssText = `width:40px; height:50px; position:relative;`;
            avatarImg.innerHTML = `<img src="animation/avatar_idlefront.png" style="width:100%; height:100%; filter: brightness(1.3);">`;

            const info = document.createElement('div');
            info.innerHTML = `
                <div style="font-weight:bold; color:${color}; font-size:15px;">${comp.name || comp.class + ' Companion'}</div>
                <div style="color:#aaa; font-size:12px;">Level ${comp.level || 1} ${comp.class}</div>
                <div style="color:#888; font-size:11px;">HP: ${comp.currentHp || 100} / ${comp.maxHp || 100}</div>
            `;

            avatarDiv.appendChild(avatarImg);
            avatarDiv.appendChild(info);
            card.appendChild(avatarDiv);
            container.appendChild(card);
        });
    };

    window.openCompanionDetail = function(idx) {
        const companions = window.game?.player?.companions || [];
        const comp = companions[idx];
        if (!comp) return;

        const panel = document.getElementById('companion-detail-panel');
        if (!panel) return;
        panel.style.display = 'block';
        panel.dataset.companionIndex = idx;

        const classColors = { 'Berserker': '#f44336', 'Healer': '#4CAF50', 'Ice Master': '#2196F3' };
        const color = classColors[comp.class] || '#fff';

        // EXP bar percentage
        const expPct = comp.maxExp > 0 ? Math.min(100, (comp.exp / comp.maxExp) * 100) : 0;

        const body = document.getElementById('companion-detail-body');
        if (!body) return;

        body.innerHTML = `
            <div style="text-align:center; margin-bottom:15px;">
                <div style="font-size:20px; font-weight:bold; color:${color}; text-shadow: 0 0 10px ${color};">${comp.name || comp.class + ' Companion'}</div>
                <div style="color:#aaa; font-size:13px;">Level ${comp.level || 1} ${comp.class}</div>
                <div style="margin-top:8px; background:rgba(0,0,0,0.5); border-radius:4px; height:12px; overflow:hidden; border:1px solid #333;">
                    <div style="height:100%; width:${expPct}%; background: linear-gradient(90deg, ${color}, #fff); transition: width 0.3s;"></div>
                </div>
                <div style="color:#888; font-size:11px; margin-top:2px;">EXP: ${comp.exp || 0} / ${comp.maxExp || 200}</div>
            </div>

            <div style="font-size:13px; font-weight:bold; color:#ffeb3b; margin-bottom:8px;">Equipment</div>
            <div id="companion-equip-slots" style="display:flex; gap:8px; margin-bottom:12px;">
                ${['weapon', 'armor', 'leggings'].map(slot => {
                    const item = comp.equips?.[slot];
                    const rarityColor = item ? (window.RARITY_COLORS?.[item.rarity] || '#fff') : '#333';
                    const label = item ? `${item.name}${item.enhanceLevel ? ' +' + item.enhanceLevel : ''}` : 'Empty';
                    return `<div class="comp-equip-slot" data-slot="${slot}" data-comp-idx="${idx}"
                        style="flex:1; background:rgba(0,0,0,0.5); border:2px solid ${rarityColor}; border-radius:6px; padding:8px; text-align:center; min-height:50px; cursor:pointer; font-size:11px; color:${rarityColor};"
                        ondragover="event.preventDefault();"
                        ondrop="window.dropItemOnCompanion(event, ${idx}, '${slot}');"
                        onclick="window.unequipCompanionItem(${idx}, '${slot}');"
                    >
                        <div style="font-weight:bold; text-transform:capitalize; margin-bottom:4px;">${slot}</div>
                        <div>${label}</div>
                    </div>`;
                }).join('')}
            </div>

            <div style="font-size:11px; color:#666; text-align:center;">Drag items from your inventory to equip. Click an equipped item to unequip.</div>
        `;
    };

    window.closeCompanionDetail = function() {
        const panel = document.getElementById('companion-detail-panel');
        if (panel) panel.style.display = 'none';
    };

    // ==========================================
    // COMPANION ITEM EQUIPPING (Drag & Drop)
    // ==========================================
    window.dropItemOnCompanion = function(event, companionIdx, slot) {
        event.preventDefault();
        const itemIndex = event.dataTransfer.getData('text/plain');
        if (itemIndex === '' || itemIndex === undefined) return;

        if (!window.socket) return;
        window.socket.emit('equipCompanionItem', {
            companionIndex: companionIdx,
            inventoryIndex: parseInt(itemIndex),
            slot: slot
        });
    };

    window.unequipCompanionItem = function(companionIdx, slot) {
        const companions = window.game?.player?.companions || [];
        const comp = companions[companionIdx];
        if (!comp || !comp.equips || !comp.equips[slot]) return;

        if (!window.socket) return;
        window.socket.emit('unequipCompanionItem', {
            companionIndex: companionIdx,
            slot: slot
        });
    };

    // ==========================================
    // SOCKET LISTENERS (Event-Specific)
    // ==========================================
    function setupEventSocketListeners() {
        if (!window.socket) {
            setTimeout(setupEventSocketListeners, 500);
            return;
        }

        const socket = window.socket;

        // Event Dungeon Timer
        socket.on('eventDungeonTimerStart', (data) => {
            window.startEventTimer(data.durationMs);
        });

        socket.on('eventDungeonTimerStop', () => {
            window.stopEventTimer();
        });

        // Event Dungeon Result
        socket.on('eventDungeonResult', (data) => {
            window.stopEventTimer();
            const log = document.getElementById('game-log');

            if (data.survived) {
                // Massive glowing victory text
                const vText = document.createElement('div');
                vText.innerHTML = `<h1 style="font-size:80px; margin:0; text-shadow:0 0 30px #ffea00, 4px 4px 0 #000; letter-spacing: 5px; animation: pulseText 1s infinite alternate;">EVENT CLEAR!</h1>`;
                vText.style.position = 'fixed';
                vText.style.top = '40%';
                vText.style.left = '50%';
                vText.style.transform = 'translate(-50%, -50%)';
                vText.style.textAlign = 'center';
                vText.style.color = '#ffea00';
                vText.style.zIndex = '9999';
                document.body.appendChild(vText);
                
                // Remove text after 4 seconds
                setTimeout(() => { vText.remove(); }, 4000);

                if (data.drop) {
                    if (log) log.innerHTML = `<span style="color:#ffea00; font-weight:bold;">🎉 You survived! You found a ${data.drop.name}!</span>`;
                } else {
                    if (log) log.innerHTML = `<span style="color:#4CAF50;">You survived the Cave! No drops this time.</span>`;
                }
            } else {
                if (log) log.innerHTML = `<span style="color:#f44336;">You were defeated in the Cave...</span>`;
            }
        });

        // Reward Trade Success
        socket.on('eventRewardTraded', (data) => {
            if (window.game && window.game.player) {
                window.game.player.inventory = data.inventory;
            }
            window.updateEventRewardCounts();
            if (typeof window.renderInventory === 'function') window.renderInventory();
            const log = document.getElementById('game-log');
            if (log) log.innerHTML = `<span style="color:#ffea00; font-weight:bold;">🎉 You received a ${data.itemName}! Use it from your inventory to activate your companion.</span>`;
        });

        // Companion Activated
        socket.on('companionActivated', (data) => {
            if (window.game && window.game.player) {
                window.game.player.companions = data.companions;
                window.game.player.inventory = data.inventory;
            }
            if (typeof window.renderInventory === 'function') window.renderInventory();
            if (typeof window.renderCompanionList === 'function') window.renderCompanionList();
            const log = document.getElementById('game-log');
            if (log) log.innerHTML = `<span style="color:#ffea00; font-weight:bold;">🎉 ${data.companionName} has been activated! Press V to view your companions.</span>`;
        });

        // Companion Equip/Unequip sync
        socket.on('companionUpdated', (data) => {
            if (window.game && window.game.player) {
                window.game.player.companions = data.companions;
                if (data.inventory) window.game.player.inventory = data.inventory;
            }
            if (typeof window.renderInventory === 'function') window.renderInventory();
            if (typeof window.renderCompanionList === 'function') window.renderCompanionList();
            // Re-render detail if open
            const panel = document.getElementById('companion-detail-panel');
            if (panel && panel.style.display === 'block') {
                const idx = parseInt(panel.dataset.companionIndex || '0');
                window.openCompanionDetail(idx);
            }
        });
    }

    // Initialize socket listeners when ready
    if (document.readyState === 'complete') {
        setupEventSocketListeners();
    } else {
        window.addEventListener('load', setupEventSocketListeners);
    }

    // ==========================================
    // 🐾 PHASE 3: COMPANION AI & COMBAT
    // ==========================================

    // Active companion entities rendered in the world
    window._activeCompanions = [];

    const COMP_CLASS_COLORS = { 'Berserker': '#f44336', 'Healer': '#4CAF50', 'Ice Master': '#2196F3' };
    const COMP_CLASS_ATTACK_RANGE = { 'Berserker': 60, 'Healer': 250, 'Ice Master': 200 };
    const COMP_CLASS_ATTACK_CD = { 'Berserker': 1200, 'Healer': 3000, 'Ice Master': 1800 };
    const COMP_FOLLOW_SPEED = 0.08;
    const COMP_CHASE_SPEED = 0.12;

    // --- CREATE COMPANION DOM ELEMENT ---
    function createCompanionDOM(comp, idx) {
        const color = COMP_CLASS_COLORS[comp.class] || '#fff';

        const container = document.createElement('div');
        container.className = 'companion-entity';
        container.id = `companion_${idx}`;
        container.style.cssText = `
            position: absolute; width: 48px; height: 96px; z-index: 103;
            pointer-events: none; transition: none;
        `;

        // Avatar rig (same structure as player/remote player)
        const rig = document.createElement('div');
        rig.className = 'player-avatar-container avatar-rig';
        rig.style.cssText = 'position:relative; width:48px; height:96px;';

        const head = new Image(); head.className = 'avatar-layer layer-head'; head.src = 'animation/avatar_head.png';
        const body = new Image(); body.className = 'avatar-layer layer-body'; body.src = 'animation/avatar_idlefront.png';
        const hair = new Image(); hair.className = 'avatar-layer layer-hair';
        hair.src = `animation/avatar_hair${comp.hairStyle || '1'}.png`;

        // Apply skin/hair tints — use class color as a subtle tint
        const skinFilters = window.skinFilters || {};
        const hairFilters = window.hairFilters || {};
        head.style.filter = skinFilters[comp.skinColor] || skinFilters['white'] || '';
        body.style.filter = skinFilters[comp.skinColor] || skinFilters['white'] || '';
        hair.style.filter = hairFilters[comp.hairColor] || hairFilters['white'] || '';

        rig.appendChild(body);
        rig.appendChild(head);
        rig.appendChild(hair);

        // Weapon layer
        const weapon = new Image(); weapon.className = 'avatar-layer layer-weapon';
        weapon.style.display = 'none';
        if (comp.equips && comp.equips.weapon && comp.equips.weapon.sprite) {
            weapon.style.display = 'block';
            weapon.src = `weapon/${comp.equips.weapon.sprite.replace('starter', 'basic')}.png`;
        }
        rig.appendChild(weapon);

        container.appendChild(rig);

        // Name tag
        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.style.cssText = `color:${color}; font-size:11px; text-shadow: 0 0 5px ${color}; pointer-events:none;`;
        nameTag.innerText = `🐾 ${comp.name || comp.class}`;
        container.appendChild(nameTag);

        // HP Bar
        const hpBar = document.createElement('div');
        hpBar.style.cssText = 'position:absolute; top:-8px; left:4px; width:40px; height:4px; background:rgba(0,0,0,0.7); border-radius:2px; overflow:hidden;';
        const hpFill = document.createElement('div');
        hpFill.className = 'comp-hp-fill';
        hpFill.style.cssText = `width:100%; height:100%; background:${color}; transition: width 0.3s;`;
        hpBar.appendChild(hpFill);
        container.appendChild(hpBar);

        // Class glow effect
        const glow = document.createElement('div');
        glow.style.cssText = `
            position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%);
            width: 30px; height: 8px; border-radius: 50%;
            background: ${color}; opacity: 0.3; filter: blur(4px);
        `;
        container.appendChild(glow);

        return { container, rig, body, weapon, hpFill };
    }

    // --- SPAWN/DESPAWN COMPANIONS ON MAP ---
    window.spawnCompanionEntities = function() {
        // Remove old ones
        window.despawnCompanionEntities();

        const companions = window.game?.player?.companions;
        if (!companions || companions.length === 0) return;

        // 🐾 Only show companions in PvE combat areas (not towns/homes/solo)
        const currentMap = window.game.player.mapId || window.safeMapData?.id || '';
        const isPvEArea = currentMap.includes('floor') || currentMap.includes('dungeon') ||
            currentMap === 'battlefield' || currentMap === 'hauntedhouse' ||
            currentMap === 'event_cave' || currentMap === 'neutralzone' ||
            currentMap === 'trainingtavern';
        if (!isPvEArea) return;

        // Don't spawn if player is in a party
        if (window.game.party && window.game.party.members && window.game.party.members.length > 1) return;

        const world = document.getElementById('game-world');
        if (!world) return;

        companions.forEach((comp, idx) => {
            const elements = createCompanionDOM(comp, idx);
            const px = (window.game.player.x || 960) + (idx === 0 ? -60 : 60);
            const py = (window.game.player.y || 1000) + 10;

            elements.container.style.left = px + 'px';
            elements.container.style.top = py + 'px';
            world.appendChild(elements.container);

            window._activeCompanions.push({
                idx: idx,
                comp: comp,
                dom: elements.container,
                rig: elements.rig,
                bodyImg: elements.body,
                weaponImg: elements.weapon,
                hpFill: elements.hpFill,
                x: px,
                y: py,
                lastAttack: 0,
                lastHeal: 0,
                facingRight: idx === 1,
                currentBodySrc: '',
                isAttacking: false
            });
        });
    };

    window.despawnCompanionEntities = function() {
        window._activeCompanions.forEach(c => {
            if (c.dom && c.dom.parentNode) c.dom.parentNode.removeChild(c.dom);
        });
        window._activeCompanions = [];
    };

    // --- COMPANION AI GAME LOOP (runs inside the main game loop) ---
    window.updateCompanionAI = function() {
        if (!window.game || !window.game.player || window.game.isGhost) return;
        if (window._activeCompanions.length === 0) return;

        // Don't run AI if in party
        if (window.game.party && window.game.party.members && window.game.party.members.length > 1) {
            window.despawnCompanionEntities();
            return;
        }

        const now = Date.now();
        const playerX = window.game.player.x || 0;
        const playerY = window.game.player.y || 0;

        window._activeCompanions.forEach((c, cIdx) => {
            const comp = c.comp;
            const cls = comp.class;
            const atkRange = COMP_CLASS_ATTACK_RANGE[cls] || 80;
            const atkCd = COMP_CLASS_ATTACK_CD[cls] || 1500;

            // --- FIND TARGET ---
            let targetMob = null;
            if (cls === 'Healer') {
                // Healer doesn't attack — it heals the player
            } else {
                // Find nearest alive monster within detection range
                const detectRange = cls === 'Berserker' ? 250 : 350;
                let closestDist = Infinity;
                for (const mid in window.game.monsters) {
                    const m = window.game.monsters[mid];
                    if (!m || !m.alive) continue;
                    const mEl = document.getElementById('mob_' + m.id);
                    if (mEl && mEl.style.opacity === '0') continue;
                    const dist = Math.hypot(m.x - c.x, m.y - c.y);
                    if (dist < detectRange && dist < closestDist) {
                        closestDist = dist;
                        targetMob = m;
                    }
                }
            }

            // --- MOVEMENT ---
            if (targetMob && cls !== 'Healer') {
                // Chase the monster
                const dist = Math.hypot(targetMob.x - c.x, targetMob.y - c.y);
                if (dist > atkRange) {
                    c.x += (targetMob.x - c.x) * COMP_CHASE_SPEED;
                    c.y += (targetMob.y - c.y) * COMP_CHASE_SPEED;
                }
                c.facingRight = targetMob.x > c.x;
            } else {
                // Follow player — offset based on companion index
                const offsetX = cIdx === 0 ? -60 : 60;
                const offsetY = 10;
                const targetX = playerX + offsetX;
                const targetY = playerY + offsetY;
                const followDist = Math.hypot(targetX - c.x, targetY - c.y);

                if (followDist > 10) {
                    c.x += (targetX - c.x) * COMP_FOLLOW_SPEED;
                    c.y += (targetY - c.y) * COMP_FOLLOW_SPEED;
                }

                // Leash: if too far from player, snap back
                const playerDist = Math.hypot(playerX - c.x, playerY - c.y);
                if (playerDist > 400) {
                    c.x = playerX + offsetX;
                    c.y = playerY + offsetY;
                }

                c.facingRight = playerX > c.x;
            }

            // --- ATTACK ---
            if (targetMob && cls !== 'Healer' && now - c.lastAttack > atkCd) {
                const dist = Math.hypot(targetMob.x - c.x, targetMob.y - c.y);
                if (dist <= atkRange + 30) {
                    c.lastAttack = now;
                    c.isAttacking = true;
                    setTimeout(() => { c.isAttacking = false; }, 300);

                    // Send attack to server
                    if (window.socket) {
                        window.socket.emit('companionAttack', {
                            companionIndex: c.idx,
                            monsterId: targetMob.id
                        });
                    }

                    // Visual: attack animation
                    if (cls === 'Ice Master') {
                        // Ice projectile visual
                        spawnCompanionProjectile(c.x + 24, c.y + 40, targetMob.x + 24, targetMob.y + 24, '#2196F3');
                    }
                }
            }

            // --- HEALER: Heal player ---
            if (cls === 'Healer' && now - c.lastHeal > atkCd) {
                const pHp = window.game.player.currentHp || 0;
                const pMaxHp = window.getMaxHp ? window.getMaxHp() : 100;
                if (pHp < pMaxHp * 0.8) {
                    c.lastHeal = now;
                    c.isAttacking = true;
                    setTimeout(() => { c.isAttacking = false; }, 300);

                    if (window.socket) {
                        window.socket.emit('companionHeal', { companionIndex: c.idx });
                    }

                    // Visual: green heal pulse
                    spawnCompanionHealEffect(playerX + 24, playerY + 20);
                }
            }

            // --- UPDATE DOM ---
            c.dom.style.left = c.x + 'px';
            c.dom.style.top = c.y + 'px';

            // Flip sprite based on direction
            if (c.rig) c.rig.style.transform = c.facingRight ? '' : 'scaleX(-1)';

            // Walk animation
            const walkSrc = c.isAttacking ? 'animation/avatar_attack.png' : 'animation/avatar_walkfront.png';
            if (c.bodyImg && c.currentBodySrc !== walkSrc) {
                c.bodyImg.src = walkSrc;
                c.currentBodySrc = walkSrc;
            }

            // HP bar
            if (c.hpFill) {
                const hpPct = comp.maxHp > 0 ? Math.max(0, (comp.currentHp / comp.maxHp) * 100) : 100;
                c.hpFill.style.width = hpPct + '%';
            }
        });
    };

    // --- PROJECTILE VISUAL (Ice Master) ---
    function spawnCompanionProjectile(fromX, fromY, toX, toY, color) {
        const world = document.getElementById('game-world');
        if (!world) return;

        const proj = document.createElement('div');
        proj.style.cssText = `
            position: absolute; left: ${fromX}px; top: ${fromY}px;
            width: 8px; height: 8px; border-radius: 50%;
            background: ${color}; box-shadow: 0 0 10px ${color}, 0 0 20px ${color};
            z-index: 200; pointer-events: none;
            transition: left 0.3s linear, top 0.3s linear;
        `;
        world.appendChild(proj);

        requestAnimationFrame(() => {
            proj.style.left = toX + 'px';
            proj.style.top = toY + 'px';
        });

        setTimeout(() => { if (proj.parentNode) proj.parentNode.removeChild(proj); }, 400);
    }

    // --- HEAL VISUAL (Healer) ---
    function spawnCompanionHealEffect(x, y) {
        const world = document.getElementById('game-world');
        if (!world) return;

        const heal = document.createElement('div');
        heal.style.cssText = `
            position: absolute; left: ${x - 20}px; top: ${y - 20}px;
            width: 40px; height: 40px; border-radius: 50%;
            border: 2px solid #4CAF50; background: rgba(76, 175, 80, 0.15);
            box-shadow: 0 0 20px rgba(76, 175, 80, 0.4);
            z-index: 200; pointer-events: none;
            animation: compHealPulse 0.6s ease-out forwards;
        `;
        world.appendChild(heal);
        setTimeout(() => { if (heal.parentNode) heal.parentNode.removeChild(heal); }, 700);
    }

    // Add heal pulse CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes compHealPulse {
            0% { transform: scale(0.5); opacity: 1; }
            100% { transform: scale(2.5); opacity: 0; }
        }
        .companion-entity {
            image-rendering: pixelated;
        }
    `;
    document.head.appendChild(style);

    // --- HOOK INTO MAIN GAME LOOP ---
    // We patch into the existing requestAnimationFrame loop by hooking window.updateCompanionAI
    // into the game's update cycle. Check if companions need respawning on map change.
    let _lastCompanionMapId = null;
    let _companionLoopStarted = false;

    function companionMainLoop() {
        if (!window.game || !window.game.player) {
            requestAnimationFrame(companionMainLoop);
            return;
        }

        const currentMap = window.game.player.mapId || window.safeMapData?.id || '';
        let needsRespawn = false;

        // Respawn companions if map changed or if they're not spawned
        if (currentMap !== _lastCompanionMapId) {
            _lastCompanionMapId = currentMap;
            needsRespawn = true;
        }

        // Also respawn if the map was re-drawn (e.g. instance change) and DOM nodes were lost
        if (!needsRespawn && window._activeCompanions.length > 0) {
            if (!document.body.contains(window._activeCompanions[0].dom)) {
                needsRespawn = true;
            }
        }

        if (needsRespawn) {
            // Don't spawn in loading or on login screen
            if (currentMap && currentMap !== '') {
                setTimeout(() => {
                    window.spawnCompanionEntities();
                }, 1000); // Delay to let map fully load
            }
        }

        // If companions data changed (level up etc), refresh DOM data references
        const comps = window.game.player.companions || [];
        window._activeCompanions.forEach((ac, i) => {
            if (comps[ac.idx]) ac.comp = comps[ac.idx];
        });

        // Run the AI tick
        window.updateCompanionAI();

        requestAnimationFrame(companionMainLoop);
    }

    // Start the companion loop after load
    function startCompanionLoop() {
        if (_companionLoopStarted) return;
        _companionLoopStarted = true;
        companionMainLoop();
    }

    if (document.readyState === 'complete') {
        setTimeout(startCompanionLoop, 2000);
    } else {
        window.addEventListener('load', () => setTimeout(startCompanionLoop, 2000));
    }

})();

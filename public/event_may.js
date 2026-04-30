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

            <div style="margin-top: 20px; text-align: center;">
                <button onclick="window.unequipCompanion(${idx})" style="background:#f44336; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold; font-size:12px; transition:0.2s;" onmouseover="this.style.background='#d32f2f';" onmouseout="this.style.background='#f44336';">
                    ❌ Return to Token
                </button>
            </div>
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

    window.unequipCompanionItem = function(companionIndex, slot) {
        if (!window.socket) return;
        window.socket.emit('unequipCompanionItem', { companionIndex, slot });
    };

    window.unequipCompanion = function(companionIndex) {
        if (!window.socket) return;
        if (confirm("Are you sure you want to unequip this Companion? It will be converted into a token in your inventory. Any equipped gear will also be unequipped.")) {
            window.socket.emit('unequipCompanion', { companionIndex });
        }
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
                window.game.player.inventory = data.inventory;
                window.renderCompanionList();
                
                const panel = document.getElementById('companion-detail-panel');
                if (panel && panel.style.display === 'block') {
                    const idx = parseInt(panel.dataset.companionIndex);
                    if (!isNaN(idx)) {
                        window.openCompanionDetail(idx);
                    }
                }
                
                if (window.renderInventory) window.renderInventory();
                if (typeof window.spawnCompanionEntities === 'function') {
                    window.spawnCompanionEntities();
                }
            }
        });

        // 🐾 COMPANION UNEQUIPPED
        socket.on('companionUnequipped', (data) => {
            if (window.game && window.game.player) {
                window.game.player.companions = data.companions;
                window.game.player.inventory = data.inventory;
                
                const panel = document.getElementById('companion-detail-panel');
                if (panel) panel.style.display = 'none';

                window.renderCompanionList();
                if (window.renderInventory) window.renderInventory();
                if (typeof window.spawnCompanionEntities === 'function') {
                    window.spawnCompanionEntities();
                }
            }
        });
    }

    // Initialize socket listeners when ready
    if (document.readyState === 'complete') {
        setupEventSocketListeners();
    } else {
        window.addEventListener('load', setupEventSocketListeners);
    }

    // 🐾 COMPANION SYSTEM: Moved to game.js for proper safeMapData access

})();

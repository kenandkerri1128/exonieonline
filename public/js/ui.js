import { CLASSES, getItemSellPrice, CASH_SHOP_ITEMS, canStoneEnhanceItem, calculateEnhanceOutcome, MAX_ENHANCE_BY_RARITY, ENHANCE_BONUS_BY_RARITY } from './game_data.js';

export class UIManager {
    constructor(game) {
        this.game = game;

        // Player HUD Elements
        this.hpFill = document.querySelector('.bar-hp');
        this.mpFill = document.querySelector('.bar-mp');
        this.expFill = document.querySelector('.bar-exp');
        this.hpText = document.getElementById('hp-text');
        this.mpText = document.getElementById('mp-text');
        this.levelBadge = document.querySelector('.player-level-badge');
        this.nameText = document.querySelector('.player-name-text');
        this.classBadge = document.querySelector('.player-class-badge');
        this.floorTitle = document.querySelector('.floor-title');
        this.floorSubtitle = document.querySelector('.floor-subtitle');
        this.goldCounter = document.getElementById('gold-val');

        // Boss Health Bar
        this.bossBarContainer = document.getElementById('boss-health-bar');
        this.bossName = document.getElementById('boss-name');
        this.bossHpFill = document.getElementById('boss-hp-fill');
        this.bossHpText = document.getElementById('boss-hp-text');

        // Modals
        this.statsModal = document.getElementById('stats-modal');
        this.inventoryModal = document.getElementById('inventory-modal');
        this.skillModal = document.getElementById('skill-modal');
        this.confirmModal = document.getElementById('confirm-modal');
        this.settingsModal = document.getElementById('settings-modal');
        this.marketplaceModal = document.getElementById('marketplace-modal');
        this.storageModal = document.getElementById('storage-modal');
        this.inspectModal = document.getElementById('inspect-modal');
        this.dailyMissionsModal = document.getElementById('daily-missions-modal');
        this.tavernModal = document.getElementById('tavern-modal');
        this.leaderboardModal = document.getElementById('leaderboard-modal');
        this.friendsModal = document.getElementById('friends-modal');
        this.partyHud = document.getElementById('party-hud');
        this.partyMembersList = document.getElementById('party-members-list');
        this.partyInvitePrompt = document.getElementById('party-invite-prompt');
        this.pendingPartyInviteFrom = null;
        this.dungeonModal = document.getElementById('dungeon-modal');
        this.mazeGuideModal = document.getElementById('maze-guide-modal');
        this.hauntedHouseModal = document.getElementById('haunted-house-modal');
        this.cashShopModal = document.getElementById('cash-shop-modal');
        this.notEnoughGoldModal = document.getElementById('not-enough-gold-modal');
        this.enhancementModal = document.getElementById('enhancement-modal');
        this.tradeDialog = document.getElementById('trade-dialog');
        this.tradeScreen = document.getElementById('trade-screen');
        this.isTradeOpen = false;
        this.currentShopCategory = 'all';
        this.deathScreen = document.getElementById('death-screen');
        this.toastEl = document.getElementById('system-toast');
        this.lootBroadcastEl = document.getElementById('loot-broadcast');
        this.tavernTimerEl = document.getElementById('tavern-timer-ui');
        this.floorClearedBanner = document.getElementById('floor-cleared-banner');
        this.listeningBindAction = null;
        this.activeLeaderboardTab = 'floor';
        this.pendingDungeonMapId = 'dungeon1';

        // Minimap
        this.minimapCanvas = document.getElementById('minimap-canvas');
        if (this.minimapCanvas) {
            this.minimapCtx = this.minimapCanvas.getContext('2d');
            this.minimapCanvas.width = 110;
            this.minimapCanvas.height = 110;
        }

        // Virtual Touch Joystick State
        this.joystick = {
            active: false,
            touchId: null,
            startX: 0,
            startY: 0,
            deltaX: 0,
            deltaY: 0,
            vectorX: 0,
            vectorY: 0
        };

        this.selectedInventoryIndex = null;
        this.pendingClassToChoose = null;

        this.setupEventListeners();
        this.setupMobileControls();
    }

    setupEventListeners() {
        // Player Stats [P] Buttons
        const btnStats = document.getElementById('btn-stats');
        if (btnStats) btnStats.onclick = () => this.toggleStats();

        const mBtnStats = document.getElementById('m-btn-stats');
        if (mBtnStats) mBtnStats.onclick = () => this.toggleStats();

        const btnCloseStats = document.getElementById('btn-close-stats');
        if (btnCloseStats) btnCloseStats.onclick = () => { if (this.statsModal) this.statsModal.style.display = 'none'; };

        const btnStatsClose2 = document.getElementById('btn-stats-close');
        if (btnStatsClose2) btnStatsClose2.onclick = () => { if (this.statsModal) this.statsModal.style.display = 'none'; };

        const btnStatsSwitch = document.getElementById('btn-stats-switch-char');
        if (btnStatsSwitch) btnStatsSwitch.onclick = () => {
            if (this.statsModal) this.statsModal.style.display = 'none';
            if (window.ExonieFlow && window.ExonieFlow.openCharSelectFromGame) {
                window.ExonieFlow.openCharSelectFromGame();
            }
        };

        // Inventory / Bag Buttons
        const btnInv = document.getElementById('btn-inventory');
        if (btnInv) btnInv.onclick = () => this.toggleInventory();

        const mBtnInv = document.getElementById('m-btn-inventory');
        if (mBtnInv) mBtnInv.onclick = () => this.toggleInventory();

        const btnCloseInv = document.getElementById('btn-close-inventory');
        if (btnCloseInv) btnCloseInv.onclick = () => {
            if (this.inventoryModal) this.inventoryModal.style.display = 'none';
            this.hideTooltip();
        };

        // Skills Buttons
        const btnSkills = document.getElementById('btn-skills');
        if (btnSkills) btnSkills.onclick = () => this.toggleSkills();

        const mBtnSkills = document.getElementById('m-btn-skills');
        if (mBtnSkills) mBtnSkills.onclick = () => this.toggleSkills();

        const btnCloseSkills = document.getElementById('btn-close-skills');
        if (btnCloseSkills) btnCloseSkills.onclick = () => {
            if (this.skillModal) this.skillModal.style.display = 'none';
            this.hideTooltip();
        };

        // Potion Shortcut Buttons
        const mBtnPot = document.getElementById('m-btn-potion');
        if (mBtnPot) mBtnPot.onclick = () => this.game.useHealthPotion();

        // Hotbar Skill & Potion Click/Touch Binds
        const bindSlot = (id, fn) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.onclick = fn;
            el.addEventListener('pointerdown', (e) => {
                if (e.pointerType !== 'mouse') {
                    e.stopPropagation();
                    fn();
                }
            });
        };
        bindSlot('hotbar-1', () => this.game?.onSkillTrigger(1));
        bindSlot('hotbar-2', () => this.game?.onSkillTrigger(2));
        bindSlot('hotbar-3', () => this.game?.useHealthPotion());

        // Confirm Modal Buttons
        const btnNo = document.getElementById('btn-confirm-no');
        if (btnNo) btnNo.onclick = () => { if (this.confirmModal) this.confirmModal.style.display = 'none'; };

        const btnYes = document.getElementById('btn-confirm-yes');
        if (btnYes) btnYes.onclick = () => {
            if (this.confirmModal) this.confirmModal.style.display = 'none';
            if (this.pendingClassToChoose) {
                this.game.chooseClass(this.pendingClassToChoose);
                this.pendingClassToChoose = null;
            }
        };

        // Unequip items by clicking equipped slot (All 8 slots: weapon, armor, leggings, necklace, ring, earrings, aura, pet)
        ['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings', 'aura', 'pet'].forEach(slotKey => {
            const slotEl = document.getElementById('slot-' + slotKey);
            if (slotEl) {
                slotEl.onclick = () => this.game.unequipItem(slotKey);
            }
        });

        // Inspect Modal Close Button
        const btnCloseInspect = document.getElementById('btn-close-inspect');
        if (btnCloseInspect) {
            btnCloseInspect.onclick = () => this.closeInspectModal();
        }

        // Player Interaction Context Popup Buttons (Inspect, Add Friend, Invite Party, Trade, Invite Raid)
        const btnCtxInspect = document.getElementById('btn-ctx-inspect');
        if (btnCtxInspect) {
            btnCtxInspect.onclick = (e) => {
                e.stopPropagation();
                const target = this.selectedTargetPlayer;
                this.closePlayerInteractionMenu();
                if (target && this.game) {
                    const lookup = target.socketId || target.id || target.name;
                    this.game.inspectPlayer(lookup);
                }
            };
        }
        const btnCtxFriend = document.getElementById('btn-ctx-friend');
        if (btnCtxFriend) {
            btnCtxFriend.onclick = (e) => {
                e.stopPropagation();
                const target = this.selectedTargetPlayer;
                this.closePlayerInteractionMenu();
                if (target && this.game) {
                    const lookup = target.name || target.character_name || target.socketId;
                    this.game.addFriend(lookup);
                }
            };
        }
        const btnCtxParty = document.getElementById('btn-ctx-party');
        if (btnCtxParty) {
            btnCtxParty.onclick = (e) => {
                e.stopPropagation();
                const target = this.selectedTargetPlayer;
                this.closePlayerInteractionMenu();
                if (target && this.game) {
                    const lookup = target.name || target.character_name || target.socketId;
                    this.game.inviteParty(lookup);
                }
            };
        }
        const btnCtxTrade = document.getElementById('btn-ctx-trade');
        if (btnCtxTrade) {
            btnCtxTrade.onclick = (e) => {
                e.stopPropagation();
                const target = this.selectedTargetPlayer;
                this.closePlayerInteractionMenu();
                if (target && this.game) {
                    const lookup = target.name || target.character_name || target.socketId;
                    this.game.requestTrade(lookup);
                }
            };
        }
        const btnCtxRaid = document.getElementById('btn-ctx-raid');
        if (btnCtxRaid) {
            btnCtxRaid.onclick = (e) => {
                e.stopPropagation();
                const target = this.selectedTargetPlayer;
                this.closePlayerInteractionMenu();
                if (target && this.game) {
                    const lookup = target.name || target.character_name || target.socketId;
                    this.game.inviteRaid(lookup);
                }
            };
        }
        const btnCloseCtx = document.getElementById('btn-close-player-ctx');
        if (btnCloseCtx) {
            btnCloseCtx.onclick = (e) => {
                e.stopPropagation();
                this.closePlayerInteractionMenu();
            };
        }

        // Trade Modal & Dialog Handlers
        const btnTradeAccept = document.getElementById('btn-trade-accept');
        if (btnTradeAccept) btnTradeAccept.onclick = () => this.game?.respondTrade(true);

        const btnTradeDecline = document.getElementById('btn-trade-decline');
        if (btnTradeDecline) btnTradeDecline.onclick = () => this.game?.respondTrade(false);

        const btnCloseTrade = document.getElementById('btn-close-trade');
        if (btnCloseTrade) btnCloseTrade.onclick = () => this.game?.cancelTrade();

        const btnTradeCancel = document.getElementById('btn-trade-cancel');
        if (btnTradeCancel) btnTradeCancel.onclick = () => this.game?.cancelTrade();

        const btnTradeConfirm = document.getElementById('btn-trade-confirm');
        if (btnTradeConfirm) btnTradeConfirm.onclick = () => this.game?.confirmTrade();

        const tradeMyGold = document.getElementById('trade-my-gold');
        if (tradeMyGold) {
            tradeMyGold.oninput = (e) => this.game?.setTradeGold(e.target.value);
            tradeMyGold.onchange = (e) => this.game?.setTradeGold(e.target.value);
        }

        // Cash Shop Buttons (Keybind 'C' + HUD Button)
        const btnCashShop = document.getElementById('btn-cash-shop');
        if (btnCashShop) btnCashShop.onclick = () => this.toggleCashShop();

        const mBtnShop = document.getElementById('m-btn-shop');
        if (mBtnShop) mBtnShop.onclick = () => this.toggleCashShop();

        const btnCloseCashShop = document.getElementById('btn-close-cash-shop');
        if (btnCloseCashShop) btnCloseCashShop.onclick = () => this.toggleCashShop();

        // Cash Shop Filter Tabs
        ['all', 'pet', 'aura', 'utility'].forEach(cat => {
            const tabBtn = document.getElementById(`shop-tab-${cat}`);
            if (tabBtn) {
                tabBtn.onclick = () => {
                    document.querySelectorAll('.shop-filter-tabs .pill-btn').forEach(b => b.classList.remove('active'));
                    tabBtn.classList.add('active');
                    this.renderCashShop(cat);
                };
            }
        });

        window.addEventListener('click', (e) => {
            const menu = document.getElementById('player-interaction-menu');
            if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && e.target.id !== 'canvas-3d') {
                this.closePlayerInteractionMenu();
            }
        });

        // Settings Modal Buttons (ESC Menu)
        const btnSettings = document.getElementById('btn-settings');
        if (btnSettings) btnSettings.onclick = () => this.toggleSettings();

        const btnCloseSettings = document.getElementById('btn-close-settings');
        if (btnCloseSettings) btnCloseSettings.onclick = () => { if (this.settingsModal) this.settingsModal.style.display = 'none'; };

        const btnResume = document.getElementById('btn-settings-resume');
        if (btnResume) btnResume.onclick = () => { if (this.settingsModal) this.settingsModal.style.display = 'none'; };

        const btnUnstuck = document.getElementById('btn-settings-unstuck');
        if (btnUnstuck) btnUnstuck.onclick = () => {
            if (this.settingsModal) this.settingsModal.style.display = 'none';
            this.game.respawnInTown();
        };

        const btnSwitchChar = document.getElementById('btn-settings-switch-char');
        if (btnSwitchChar) btnSwitchChar.onclick = () => {
            if (this.settingsModal) this.settingsModal.style.display = 'none';
            if (window.ExonieFlow && window.ExonieFlow.openCharSelectFromGame) {
                window.ExonieFlow.openCharSelectFromGame();
            }
        };

        const btnToggleSky = document.getElementById('btn-toggle-sky-time');
        if (btnToggleSky) {
            btnToggleSky.onclick = () => {
                if (this.game.world && this.game.world.toggleSkyTime) {
                    const isNight = this.game.world.toggleSkyTime();
                    btnToggleSky.textContent = isNight ? '🌙 Starry Night' : '☀️ Morning / Day';
                    this.showToast(isNight ? '🌙 Switched Town Sky to Starry Night & Moon!' : '☀️ Switched Town Sky to Morning Sun & Clouds!');
                }
            };
        }

        // Interactive Keybind Customizer Buttons in Settings
        document.querySelectorAll('.keybind-btn').forEach(btn => {
            btn.onclick = () => {
                const action = btn.getAttribute('data-bind');
                if (!action) return;
                document.querySelectorAll('.keybind-btn').forEach(b => b.classList.remove('listening'));
                this.listeningBindAction = action;
                btn.classList.add('listening');
                btn.textContent = 'Press Key...';
            };
        });

        const btnResetBinds = document.getElementById('btn-reset-keybinds');
        if (btnResetBinds) {
            btnResetBinds.onclick = () => {
                if (this.game && this.game.resetKeybinds) {
                    this.game.resetKeybinds();
                    this.refreshKeybindLabels();
                    this.showToast('⌨️ Keybinds reset to default!');
                }
            };
        }

        const chkFullscreen = document.getElementById('chk-fullscreen');
        if (chkFullscreen) {
            chkFullscreen.onchange = (e) => {
                if (window.electronAPI && typeof window.electronAPI.toggleFullScreen === 'function') {
                    window.electronAPI.toggleFullScreen();
                    window.isElectronFS = e.target.checked;
                    return;
                }
                if (e.target.checked) {
                    document.documentElement.requestFullscreen?.().catch(() => {});
                } else {
                    document.exitFullscreen?.().catch(() => {});
                }
            };
        }
        if (window.electronAPI && typeof window.electronAPI.onFsChanged === 'function') {
            window.electronAPI.onFsChanged((isFS) => {
                window.isElectronFS = isFS;
                const chkFs = document.getElementById('chk-fullscreen');
                if (chkFs) chkFs.checked = !!isFS;
            });
        }

        // ==========================================
        // CIRCUIT SIEGE MOBILE MENU EVENTS (CENTERED POPUP MODAL)
        // ==========================================
        const btnMenuToggle = document.getElementById('btn-main-menu-toggle');
        if (btnMenuToggle) {
            btnMenuToggle.onclick = (e) => {
                e.stopPropagation();
                this.toggleMobileMenu();
            };
        }

        const btnCloseDropdown = document.getElementById('btn-close-mobile-menu') || document.getElementById('btn-close-dropdown');
        if (btnCloseDropdown) {
            btnCloseDropdown.onclick = (e) => {
                e.stopPropagation();
                this.closeMobileMenu();
            };
        }

        const mobMenuModal = document.getElementById('mobile-menu-modal');
        if (mobMenuModal) {
            mobMenuModal.addEventListener('click', (e) => {
                if (e.target === mobMenuModal) {
                    this.closeMobileMenu();
                }
            });
        }

        // Close dropdown when clicking outside the wrapper
        window.addEventListener('click', (e) => {
            const drop = document.getElementById('hud-dropdown-menu');
            if (drop && drop.style.display === 'flex') {
                if (!e.target.closest('#mobile-menu-wrapper')) {
                    this.closeMobileMenu();
                }
            }
        });

        // Universal dismiss tooltip on any tap or click outside item slots
        const dismissTooltipIfOutside = (e) => {
            const tip = document.getElementById('item-hover-tooltip');
            if (tip && tip.style.display !== 'none') {
                if (!e.target || !e.target.closest || !e.target.closest('.bag-slot, .equip-slot-box, .trade-slot, .storage-slot')) {
                    this.hideTooltip();
                }
            }
        };
        window.addEventListener('pointerdown', dismissTooltipIfOutside, { passive: true });
        window.addEventListener('touchstart', dismissTooltipIfOutside, { passive: true });
        window.addEventListener('click', dismissTooltipIfOutside, { passive: true });

        // Mobile Menu Button Actions
        const bindMobBtn = (id, action) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.onclick = () => {
                    this.closeMobileMenu();
                    action();
                };
            }
        };

        bindMobBtn('m-menu-inv', () => this.toggleInventory());
        bindMobBtn('m-menu-stats', () => this.toggleStats());
        bindMobBtn('m-menu-skills', () => this.toggleSkills());
        bindMobBtn('m-menu-shop', () => this.toggleMarketplace());
        bindMobBtn('m-menu-tavern', () => this.openTavernModal());
        bindMobBtn('m-menu-cash', () => this.toggleCashShop());
        bindMobBtn('m-menu-guild', () => this.toggleGuildModal());
        bindMobBtn('m-menu-party', () => this.toggleFriendsModal());
        bindMobBtn('m-menu-mail', () => this.toggleMailbox());
        bindMobBtn('m-menu-settings', () => this.toggleSettings());

        const chkHighQuality = document.getElementById('chk-high-quality');
        if (chkHighQuality) {
            chkHighQuality.onchange = (e) => {
                if (this.game.engine && this.game.engine.setGraphicsQuality) {
                    this.game.engine.setGraphicsQuality(e.target.checked);
                }
                this.showToast(e.target.checked ? "✨ High Quality 3D Graphics Enabled" : "⚡ Performance Graphics Mode Enabled");
            };
        }

        const rngVol = document.getElementById('rng-master-volume');
        const lblVol = document.getElementById('lbl-volume-pct');
        if (rngVol) {
            rngVol.oninput = (e) => {
                const v = Number(e.target.value);
                if (lblVol) lblVol.textContent = `${v}%`;
                if (this.game.audio) {
                    this.game.audio.setMasterVolume(v / 100);
                }
            };
        }

        // Marketplace & Forge Modal Buttons
        const btnCloseMarket = document.getElementById('btn-close-marketplace');
        if (btnCloseMarket) btnCloseMarket.onclick = () => {
            if (this.marketplaceModal) this.marketplaceModal.style.display = 'none';
            if (this.game) this.game.portalCooldown = 4.0;
        };

        const btnBuyPot = document.getElementById('btn-buy-potions');
        if (btnBuyPot) btnBuyPot.onclick = () => this.game.buyMarketplaceItem('potions');

        const btnBuyRev = document.getElementById('btn-buy-revival');
        if (btnBuyRev) btnBuyRev.onclick = () => this.game.buyMarketplaceItem('revival');

        const btnBuyStone = document.getElementById('btn-buy-stone');
        if (btnBuyStone) btnBuyStone.onclick = () => this.game.buyMarketplaceItem('stone');

        const btnBuyGem = document.getElementById('btn-buy-gem');
        if (btnBuyGem) btnBuyGem.onclick = () => this.game.buyMarketplaceItem('gem');

        // Death Screen Buttons
        const btnDeathRespawn = document.getElementById('btn-death-respawn');
        if (btnDeathRespawn) btnDeathRespawn.onclick = () => this.game.respawnInTown();

        const btnDeathRevive = document.getElementById('btn-death-revive');
        if (btnDeathRevive) btnDeathRevive.onclick = () => this.game.useRevivalJuice();

        // Home Storage Modal Buttons
        const btnCloseStorage = document.getElementById('btn-close-storage');
        if (btnCloseStorage) btnCloseStorage.onclick = () => this.closeStorageUI();

        const btnCloseStorage2 = document.getElementById('btn-storage-close-2');
        if (btnCloseStorage2) btnCloseStorage2.onclick = () => this.closeStorageUI();

        const btnStorageOpenBag = document.getElementById('btn-storage-open-bag');
        if (btnStorageOpenBag) {
            btnStorageOpenBag.onclick = () => {
                this.closeStorageUI();
                this.toggleInventory();
            };
        }

        // Daily Missions / Quest Board Modal Buttons
        const btnCloseMissions = document.getElementById('btn-close-daily-missions');
        if (btnCloseMissions) btnCloseMissions.onclick = () => {
            if (this.dailyMissionsModal) this.dailyMissionsModal.style.display = 'none';
            if (this.game) this.game.portalCooldown = 4.0;
        };

        const btnAbandonMission = document.getElementById('btn-abandon-mission');
        if (btnAbandonMission) {
            btnAbandonMission.onclick = () => {
                if (this.game && this.game.player) {
                    this.game.player.dailyMission = null;
                    this.game.saveCharacterToAccountSlot();
                    this.renderDailyMissions();
                    this.showToast('✖ Abandoned active Quest Board contract.');
                }
            };
        }

        window.acceptDailyMission = (difficulty) => {
            if (this.game && this.game.acceptDailyMission) {
                this.game.acceptDailyMission(difficulty);
            }
        };

        // Training Tavern & Leaderboard Modal Buttons
        const btnCloseTavern = document.getElementById('btn-close-tavern');
        if (btnCloseTavern) btnCloseTavern.onclick = () => {
            if (this.tavernModal) this.tavernModal.style.display = 'none';
            if (this.game) this.game.portalCooldown = 4.0;
        };

        const btnEnterTavern = document.getElementById('btn-enter-tavern');
        if (btnEnterTavern) {
            btnEnterTavern.onclick = () => {
                const typeSel = document.getElementById('tavern-boss-type');
                const lvlInp = document.getElementById('tavern-boss-level');
                const bType = typeSel ? typeSel.value : 'floor';
                const bLvl = lvlInp ? Math.max(1, Math.min(50, parseInt(lvlInp.value, 10) || 10)) : 10;
                if (this.tavernModal) this.tavernModal.style.display = 'none';
                this.game.enterTrainingTavern(bType, bLvl);
            };
        }

        const btnTavernOpenRanks = document.getElementById('btn-tavern-open-ranks');
        if (btnTavernOpenRanks) {
            btnTavernOpenRanks.onclick = () => {
                if (this.tavernModal) this.tavernModal.style.display = 'none';
                this.openLeaderboardModal('floor');
            };
        }

        const btnCloseLb = document.getElementById('btn-close-leaderboard');
        if (btnCloseLb) btnCloseLb.onclick = () => {
            if (this.leaderboardModal) this.leaderboardModal.style.display = 'none';
            if (this.game) this.game.portalCooldown = 4.0;
        };

        window.switchLeaderboardTab = (tab) => {
            this.activeLeaderboardTab = tab;
            this.renderLeaderboard(tab);
        };

        // Dungeon Difficulty & Maze Guide Modal Buttons
        const btnCloseDungeon = document.getElementById('btn-close-dungeon');
        if (btnCloseDungeon) btnCloseDungeon.onclick = () => {
            if (this.dungeonModal) this.dungeonModal.style.display = 'none';
            if (this.game) this.game.portalCooldown = 4.0;
        };

        window.enterDungeonWithDifficulty = (diffName, mult) => {
            if (this.dungeonModal) this.dungeonModal.style.display = 'none';
            this.game.enterDungeon(this.pendingDungeonMapId, diffName, mult);
        };

        const btnCloseMazeGuide = document.getElementById('btn-close-maze-guide');
        if (btnCloseMazeGuide) btnCloseMazeGuide.onclick = () => {
            if (this.mazeGuideModal) this.mazeGuideModal.style.display = 'none';
            if (this.game) this.game.portalCooldown = 4.0;
        };

        const btnCloseHaunted = document.getElementById('btn-close-haunted-house');
        if (btnCloseHaunted) btnCloseHaunted.onclick = () => {
            if (this.hauntedHouseModal) this.hauntedHouseModal.style.display = 'none';
            if (this.game) this.game.portalCooldown = 4.0;
        };

        const btnCloseEnhance = document.getElementById('btn-close-enhancement');
        if (btnCloseEnhance) btnCloseEnhance.onclick = () => {
            this.closeEnhanceModal();
        };

        window.enterHauntedHouseChallenge = (difficulty) => {
            let cost = 1000;
            if (difficulty === 'normal') cost = 10000;
            else if (difficulty === 'hard') cost = 500000;
            const currentGold = this.game?.player?.gold || 0;
            if (currentGold < cost) {
                this.showNotEnoughGoldModal(cost, currentGold, `Haunted House (${difficulty.toUpperCase()})`);
                return;
            }
            if (this.hauntedHouseModal) this.hauntedHouseModal.style.display = 'none';
            if (this.game) this.game.enterHauntedHouse(difficulty);
        };

        const btnNegClose = document.getElementById('btn-neg-close');
        if (btnNegClose) {
            btnNegClose.onclick = () => {
                if (this.notEnoughGoldModal) this.notEnoughGoldModal.style.display = 'none';
                else {
                    const m = document.getElementById('not-enough-gold-modal');
                    if (m) m.style.display = 'none';
                }
            };
        }

        // 🤝 Friends List [F] & Party Event Listeners
        const btnCloseFriends = document.getElementById('btn-close-friends');
        if (btnCloseFriends) btnCloseFriends.onclick = () => this.closeFriendsModal();

        const btnSendAddFriend = document.getElementById('btn-send-add-friend');
        const inputAddFriend = document.getElementById('input-add-friend');
        if (btnSendAddFriend) {
            btnSendAddFriend.onclick = () => {
                const targetName = inputAddFriend ? inputAddFriend.value.trim() : '';
                if (!targetName) return;
                if (this.game) this.game.addFriend(targetName);
                if (inputAddFriend) inputAddFriend.value = '';
            };
        }
        if (inputAddFriend) {
            inputAddFriend.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (btnSendAddFriend) btnSendAddFriend.click();
                }
            });
        }

        const btnPartyAccept = document.getElementById('btn-party-accept');
        if (btnPartyAccept) btnPartyAccept.onclick = () => this.respondPartyInvite(true);

        const btnPartyDecline = document.getElementById('btn-party-decline');
        if (btnPartyDecline) btnPartyDecline.onclick = () => this.respondPartyInvite(false);

        const btnLeaveParty = document.getElementById('btn-leave-party');
        if (btnLeaveParty) btnLeaveParty.onclick = () => this.leaveParty();
    }

    setupMobileControls() {
        const dpadContainer = document.getElementById('mobile-dpad-container') || document.getElementById('joystick-zone');
        const dpadEl = document.getElementById('mobile-dpad') || dpadContainer;
        const stickEl = document.getElementById('mobile-dpad-stick') || document.getElementById('joystick-thumb');

        if (dpadEl && stickEl) {
            const upArrow = dpadEl.querySelector ? dpadEl.querySelector('.up') : null;
            const downArrow = dpadEl.querySelector ? dpadEl.querySelector('.down') : null;
            const leftArrow = dpadEl.querySelector ? dpadEl.querySelector('.left') : null;
            const rightArrow = dpadEl.querySelector ? dpadEl.querySelector('.right') : null;

            let stickPointerId = null;

            const updateStick = (clientX, clientY) => {
                const rect = dpadEl.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const dx = clientX - cx;
                const dy = clientY - cy;
                const dist = Math.hypot(dx, dy);
                const maxR = rect.width * 0.36;
                const clampedDist = Math.min(dist, maxR);
                const angle = Math.atan2(dy, dx);
                const puckX = Math.cos(angle) * clampedDist;
                const puckY = Math.sin(angle) * clampedDist;

                stickEl.style.transform = `translate(${puckX}px, ${puckY}px)`;
                this.joystick.active = true;
                this.joystick.vectorX = maxR > 0 ? puckX / maxR : 0;
                this.joystick.vectorY = maxR > 0 ? puckY / maxR : 0;

                if (upArrow) upArrow.classList.toggle('active', this.joystick.vectorY < -0.32);
                if (downArrow) downArrow.classList.toggle('active', this.joystick.vectorY > 0.32);
                if (leftArrow) leftArrow.classList.toggle('active', this.joystick.vectorX < -0.32);
                if (rightArrow) rightArrow.classList.toggle('active', this.joystick.vectorX > 0.32);
            };

            const resetStick = () => {
                stickPointerId = null;
                this.joystick.active = false;
                this.joystick.vectorX = 0;
                this.joystick.vectorY = 0;
                stickEl.style.transform = 'translate(0px, 0px)';
                if (upArrow) upArrow.classList.remove('active');
                if (downArrow) downArrow.classList.remove('active');
                if (leftArrow) leftArrow.classList.remove('active');
                if (rightArrow) rightArrow.classList.remove('active');
            };

            dpadEl.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                stickPointerId = e.pointerId;
                try { dpadEl.setPointerCapture(e.pointerId); } catch (_) {}
                updateStick(e.clientX, e.clientY);
            });

            dpadEl.addEventListener('pointermove', (e) => {
                if (e.pointerId === stickPointerId) {
                    e.preventDefault();
                    updateStick(e.clientX, e.clientY);
                }
            });

            const onPointerEnd = (e) => {
                if (e.pointerId === stickPointerId) {
                    try { dpadEl.releasePointerCapture(e.pointerId); } catch (_) {}
                    resetStick();
                }
            };
            dpadEl.addEventListener('pointerup', onPointerEnd);
            dpadEl.addEventListener('pointercancel', onPointerEnd);
        }

        // Touch Combat Action Buttons (Circuit Siege Style with active press feedback)
        const bindTouchBtn = (id, action) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                btn.classList.add('active');
                action();
            });
            const endBtn = () => btn.classList.remove('active');
            btn.addEventListener('pointerup', endBtn);
            btn.addEventListener('pointercancel', endBtn);
            btn.addEventListener('pointerleave', endBtn);
        };

        bindTouchBtn('btn-touch-attack', () => this.game.onAttackTrigger());
        bindTouchBtn('btn-touch-jump', () => this.game.onJumpTrigger());
        bindTouchBtn('btn-touch-dodge', () => this.game.onDodgeTrigger());
        bindTouchBtn('btn-touch-skill1', () => this.game.onSkillTrigger(1));
        bindTouchBtn('btn-touch-skill2', () => this.game.onSkillTrigger(2));
        bindTouchBtn('btn-touch-lock', () => this.game.toggleTargetLock());
    }

    showToast(message, borderColor = null) {
        if (!this.toastEl) return;
        this.toastEl.innerHTML = message;
        if (borderColor) {
            this.toastEl.style.borderColor = borderColor;
            this.toastEl.style.boxShadow = `0 0 25px ${borderColor}, 0 8px 24px rgba(0, 0, 0, 0.75)`;
        } else {
            this.toastEl.style.borderColor = '#38bdf8';
            this.toastEl.style.boxShadow = '0 0 25px rgba(56, 189, 248, 0.45), 0 8px 24px rgba(0, 0, 0, 0.75)';
        }
        this.toastEl.classList.remove('show');
        void this.toastEl.offsetWidth;
        this.toastEl.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => {
            if (this.toastEl) this.toastEl.classList.remove('show');
        }, 3000);
    }

    updatePlayerHUD(player) {
        if (!player) return;

        // Health Bar
        const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
        if (this.hpFill) this.hpFill.style.width = `${hpPct}%`;
        if (this.hpText) this.hpText.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;

        // Mana Bar
        const mpPct = Math.max(0, Math.min(100, (player.mp / player.maxMp) * 100));
        if (this.mpFill) this.mpFill.style.width = `${mpPct}%`;
        if (this.mpText) this.mpText.textContent = `${Math.ceil(player.mp)} / ${player.maxMp}`;

        // Exp Bar
        const expPct = Math.max(0, Math.min(100, (player.exp / player.maxExp) * 100));
        if (this.expFill) this.expFill.style.width = `${expPct}%`;

        // Badges & Labels
        if (this.levelBadge) this.levelBadge.textContent = `Lv.${player.level}`;
        if (this.nameText) this.nameText.textContent = player.name;
        
        const pClass = (player.baseStats && player.baseStats.playerClass) || 'No Class';
        if (this.classBadge) this.classBadge.textContent = pClass;
        if (this.goldCounter) this.goldCounter.textContent = Number(player.gold || 0).toLocaleString();

        // Player Title Tag with Tier Colors & Glow
        const titleTag = document.getElementById('player-title-tag');
        if (titleTag) {
            if (player.title) {
                titleTag.style.display = 'block';
                titleTag.textContent = `<${player.title}>`;
                const tUpper = String(player.title).toUpperCase();
                if (tUpper.includes('FLOOR MASTER')) {
                    titleTag.style.color = '#ff4444';
                    titleTag.style.textShadow = '0 0 10px rgba(255, 68, 68, 0.7)';
                } else if (tUpper.includes('FLOOR DOMINATOR')) {
                    titleTag.style.color = '#e040fb';
                    titleTag.style.textShadow = '0 0 10px rgba(224, 64, 251, 0.7)';
                } else if (tUpper.includes('FLOOR CONQUEROR')) {
                    titleTag.style.color = '#ffd700';
                    titleTag.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.7)';
                } else {
                    titleTag.style.color = '#00e5ff';
                    titleTag.style.textShadow = '0 0 10px rgba(0, 229, 255, 0.7)';
                }
            } else {
                titleTag.style.display = 'none';
            }
        }

        // 🛡️ Distinct Class Logo & Themed Aura Glow in Player Profile Avatar Frame
        const classLogos = {
            'Blademaster':       { icon: '🗡️', color: '#00e5ff', glow: 'rgba(0, 229, 255, 0.45)' },
            'Berserker':         { icon: '⚔️', color: '#ff1744', glow: 'rgba(255, 23, 68, 0.45)' },
            'Healer':            { icon: '🌿', color: '#00e676', glow: 'rgba(0, 230, 118, 0.45)' },
            'Summoner':          { icon: '🔮', color: '#2979ff', glow: 'rgba(41, 121, 255, 0.45)' },
            'Ice Master':        { icon: '❄️', color: '#00b0ff', glow: 'rgba(0, 176, 255, 0.45)' },
            'Sniper':            { icon: '🎯', color: '#ffd600', glow: 'rgba(255, 214, 0, 0.45)' },
            'Explosives Expert': { icon: '💣', color: '#ff6d00', glow: 'rgba(255, 109, 0, 0.45)' },
            'Phantom Striker':   { icon: '🌘', color: '#d500f9', glow: 'rgba(213, 0, 249, 0.45)' },
            'Ninja Assassin':    { icon: '⚡', color: '#ffea00', glow: 'rgba(255, 234, 0, 0.45)' },
            'Tech Genius':       { icon: '🤖', color: '#1de9b6', glow: 'rgba(29, 233, 182, 0.45)' },
            'Novice':            { icon: '🛡️', color: '#94a3b8', glow: 'rgba(148, 163, 184, 0.3)' }
        };
        const logoInfo = classLogos[pClass] || classLogos['Novice'];
        const avatarIcon = document.querySelector('.player-avatar-icon');
        const avatarFrame = document.querySelector('.player-avatar-frame');
        if (avatarIcon) avatarIcon.textContent = logoInfo.icon;
        if (avatarFrame) {
            avatarFrame.style.borderColor = logoInfo.color;
            avatarFrame.style.boxShadow = `0 0 14px ${logoInfo.glow}`;
        }

        // Potion Quantity in Hotbar
        const potCount = this.game.getPotionCount();
        const potText = document.getElementById('potion-qty-text');
        if (potText) potText.textContent = `x${potCount}`;
        const mPotText = document.getElementById('m-potion-qty');
        if (mPotText) mPotText.textContent = potCount;

        // Update Active Skill Names on Hotbar 1 & 2 (Matching 2D Exonie!)
        const hbName1 = document.getElementById('hb-name-1');
        const hbName2 = document.getElementById('hb-name-2');
        const hbIcon1 = document.getElementById('hb-icon-1');
        const hbIcon2 = document.getElementById('hb-icon-2');
        if (pClass && CLASSES[pClass]) {
            const activeSkills = CLASSES[pClass].skills.filter(s => s.type === 'active');
            const s1 = activeSkills[0];
            const s2 = activeSkills[1];
            if (hbName1) {
                hbName1.textContent = s1 ? (player.level >= s1.unlock ? s1.name : `${s1.name} (Lv.${s1.unlock})`) : 'Passive';
                hbName1.style.color = (s1 && player.level >= s1.unlock) ? '#4ade80' : '#94a3b8';
            }
            if (hbName2) {
                hbName2.textContent = s2 ? (player.level >= s2.unlock ? s2.name : `${s2.name} (Lv.${s2.unlock})`) : 'Passive';
                hbName2.style.color = (s2 && player.level >= s2.unlock) ? '#38bdf8' : '#94a3b8';
            }
            if (hbIcon1) hbIcon1.textContent = '1';
            if (hbIcon2) hbIcon2.textContent = '2';
            const mIcon1 = document.getElementById('m-icon-skill1');
            if (mIcon1) mIcon1.textContent = '1';
            const mIcon2 = document.getElementById('m-icon-skill2');
            if (mIcon2) mIcon2.textContent = '2';
        } else {
            if (hbName1) { hbName1.textContent = 'Skill 1'; hbName1.style.color = '#94a3b8'; }
            if (hbName2) { hbName2.textContent = 'Skill 2'; hbName2.style.color = '#94a3b8'; }
            if (hbIcon1) hbIcon1.textContent = '1';
            if (hbIcon2) hbIcon2.textContent = '2';
            const mIcon1 = document.getElementById('m-icon-skill1');
            if (mIcon1) mIcon1.textContent = '1';
            const mIcon2 = document.getElementById('m-icon-skill2');
            if (mIcon2) mIcon2.textContent = '2';
        }

        this.refreshKeybindLabels();
        if (this.statsModal && this.statsModal.style.display === 'flex') {
            this.renderStatsModal();
        }

        // Update Skill Cooldown Buttons Visuals
        this.updateSkillCooldowns();

        // Update Persistent Daily Quest Tracker on HUD Right Side
        this.updateQuestTracker(player.dailyMission);
    }


        // ==========================================
    // 🗺️ MAZE GUIDE & FAST TRAVEL (2D REPLICATED)
    // ==========================================
    openMazeGuideModal() {
        if (typeof window.openMazeGuide === 'function') {
            window.openMazeGuide();
        }
    }

    openFastTravelUI() {
        if (typeof window.openFastTravelUI === 'function') {
            window.openFastTravelUI();
        }
    }

    openMazeTrialsUI() {
        if (typeof window.openMazeTrialsUI === 'function') {
            window.openMazeTrialsUI();
        }
    }

    // ==========================================
    // 🏡 REAL ESTATE UI: Private Residence Sale (PER CHARACTER)
    // ==========================================
    openHomeSaleUI() {
        let modal = document.getElementById('home-sale-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'home-sale-modal';
            modal.className = 'game-modal-dialog';
            modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(15,23,42,0.97); border:2px solid #4CAF50; padding:22px; z-index:99999; width:360px; border-radius:12px; box-shadow:0 0 30px rgba(76,175,80,0.5); color:white; text-align:center; backdrop-filter:blur(10px); font-family:inherit;';
            document.body.appendChild(modal);
        }

        const charName = (window.game && window.game.player && window.game.player.name) || 'This Character';

        modal.innerHTML = `
            <div style="cursor:grab; padding:10px; background:#1e293b; margin:-22px -22px 16px -22px; border-radius:10px 10px 0 0; border-bottom:2px solid #4CAF50;">
                <h2 style="margin:0; color:#4CAF50; font-size:1.2rem; text-shadow:0 0 10px rgba(76,175,80,0.6);">🏡 Home For Sale!</h2>
            </div>
            <p style="color:#cbd5e1; font-size:13px; line-height:1.45; margin-bottom:14px;">
                Purchase a private sanctuary for <strong style="color:#38bdf8;">${charName}</strong>.<br>
                Includes your private 15-slot Storage Vault and the ability to invite party members to visit!
            </p>
            <div style="margin: 14px 0; padding: 12px; background: rgba(0,0,0,0.45); border: 1px dashed #ffd700; border-radius: 8px;">
                <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Character Deed Price</div>
                <span style="color:#ffd700; font-size:26px; font-weight:800; letter-spacing:1px;">1,000,000 G</span>
                <div style="font-size:10.5px; color:#a3e635; margin-top:4px;">* Bound strictly to this character</div>
            </div>
            <button class="btn-item-action" style="background:linear-gradient(135deg, #22c55e, #16a34a); width:100%; margin-bottom:10px; font-size:14px; font-weight:800; padding:12px; border:none; border-radius:8px; color:#fff; cursor:pointer; box-shadow:0 0 15px rgba(34,197,94,0.4);" onclick="window.buyHome()">Purchase Deed (1,000,000 G)</button>
            <button class="btn-item-action" style="background:#334155; width:100%; font-size:13px; font-weight:700; padding:10px; border:none; border-radius:8px; color:#cbd5e1; cursor:pointer;" onclick="document.getElementById('home-sale-modal').style.display='none'">Maybe Later</button>
        `;
        modal.style.display = 'block';
    }

    // ==========================================
    // 🏰 GUILD SYSTEM UI (2D REPLICATED)
    // ==========================================
    toggleGuildModal() {
        this.closeMobileMenu();
        let modal = document.getElementById('guild-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'guild-modal';
            modal.className = 'game-modal-dialog';
            modal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(15,23,42,0.96); border:2px solid #4CAF50; padding:20px; z-index:99999; width:360px; border-radius:12px; box-shadow:0 0 25px rgba(76,175,80,0.4); color:white; text-align:center; backdrop-filter:blur(8px);';
            document.body.appendChild(modal);
        }

        if (modal.style.display === 'block') {
            modal.style.display = 'none';
        } else {
            modal.style.display = 'block';
            modal.innerHTML = '<h3 style="color:#4CAF50; margin-top:20px;">Loading Guild Data...</h3>';
            if (window.game?.socket) {
                window.game.socket.emit('requestGuildData');
            }
        }
    }

    isGuildModalOpen() {
        const modal = document.getElementById('guild-modal');
        return modal && modal.style.display === 'block';
    }

    renderGuildModal(data) {
        const modal = document.getElementById('guild-modal');
        if (!modal) return;
        this.lastGuildData = data;
        const game = window.game;

        if (data.hasGuild) {
            const d = data.details || {};
            const myRole = data.myRole || 'Member';
            const roleLevel = { 'Master': 4, 'Vice Master': 3, 'Captain': 2, 'Member': 1 };
            const currentLevel = data.guildLevel || 0;
            const statBoost = currentLevel * 2;
            const expBoost = currentLevel * 2;
            const maxMembers = 20 + (currentLevel * 5);

            let html = `
                <div style="cursor:grab; padding:10px; background:#1e293b; margin:-20px -20px 15px -20px; border-radius:10px 10px 0 0; border-bottom:2px solid #4CAF50;">
                    <h2 style="margin:0; color:#4CAF50; font-size:1.15rem; display:flex; justify-content:space-between; align-items:center;">
                        <span>🏰 ${d.name || 'Guild'} <span style="font-size:13px; color:#ffd700;">(Lv. ${currentLevel})</span></span>
                        <span style="font-size:12px; color:#94a3b8;">${(data.members || []).length}/${maxMembers}</span>
                    </h2>
                </div>

                <div style="display:flex; justify-content:space-between; margin:8px 0; font-size:13px; color:#94a3b8;">
                    <span>Role: <strong style="color:#fff;">${myRole}</strong></span>
                    <span>Funds: <strong style="color:#ffd700;">${(data.guildGold || 0).toLocaleString()} G</strong></span>
                </div>

                <div style="display:flex; justify-content:space-around; margin-bottom:10px; font-size:12px; background:#0f172a; padding:8px; border-radius:6px; border:1px solid #334155;">
                    <span>🛡️ Stats: <strong style="color:#4CAF50;">+${statBoost}%</strong></span>
                    <span>✨ EXP: <strong style="color:#38bdf8;">+${expBoost}%</strong></span>
                </div>
            `;

            // Master level up
            if (myRole === 'Master') {
                if (currentLevel < 10) {
                    html += `<button onclick="window.guildLevelUpConfirm()" style="width:100%; padding:9px; margin-bottom:10px; background:linear-gradient(45deg, #f59e0b, #ef4444); color:white; border:none; border-radius:6px; font-weight:800; cursor:pointer; font-size:12.5px;">⬆️ Level Up Guild to Lv. ${currentLevel + 1} (1,000,000 Guild Gold)</button>`;
                } else {
                    html += `<div style="text-align:center; color:#ffd700; margin-bottom:10px; font-weight:bold; font-size:12px;">🌟 GUILD MAX LEVEL REACHED (10) 🌟</div>`;
                }
            }

            // Member list
            html += `<div style="background:#0f172a; padding:10px; border:1px solid #334155; border-radius:6px; height:120px; overflow-y:auto; margin-bottom:10px; text-align:left;">`;
            (data.members || []).forEach(m => {
                let actionHtml = `<span style="font-size:11px; color:#94a3b8;">${m.role}</span>`;
                if (myRole === 'Master' && m.name !== game?.player?.name) {
                    actionHtml = `<select onchange="window.game?.socket?.emit('guildUpdateRole', {targetName:'${m.name}', newRole:this.value})" style="background:#1e293b; color:#fff; font-size:10px; padding:2px; border:1px solid #475569; border-radius:4px; outline:none; cursor:pointer;">
                        <option value="Member" ${m.role==='Member'?'selected':''}>Member</option>
                        <option value="Captain" ${m.role==='Captain'?'selected':''}>Captain</option>
                        <option value="Vice Master" ${m.role==='Vice Master'?'selected':''}>Vice Master</option>
                    </select>`;
                }

                const targetLvl = roleLevel[m.role] || 1;
                const canKick = (myRole === 'Master' && m.name !== game?.player?.name) || (myRole === 'Vice Master' && targetLvl <= 2);

                html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:5px 0; border-bottom:1px solid #1e293b;">
                    <span style="font-size:12px; color:${m.online ? '#fff' : '#64748b'};">
                        ${m.online ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#4CAF50;margin-right:4px;"></span>' : '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-right:4px;"></span>'} ${m.name}
                    </span>
                    <div style="display:flex; gap:5px; align-items:center;">
                        ${actionHtml}
                        ${canKick ? `<button onclick="window.guildKickMember('${m.name}')" style="background:#ef4444; color:white; border:none; padding:2px 6px; font-size:9px; cursor:pointer; border-radius:3px; font-weight:bold;">KICK</button>` : ''}
                    </div>
                </div>`;
            });
            html += `</div>`;

            // Applicants (Master / Vice Master only)
            if (roleLevel[myRole] >= 3) {
                html += `<h4 style="margin:5px 0; font-size:12px; color:#94a3b8; text-align:left;">Pending Applicants</h4>
                         <div style="background:#0f172a; padding:6px; border:1px solid #334155; border-radius:6px; height:55px; overflow-y:auto; margin-bottom:10px;">`;
                if (data.applicants && data.applicants.length > 0) {
                    data.applicants.forEach(name => {
                        html += `<div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:3px;">
                            <span>${name}</span>
                            <div>
                                <button onclick="window.game?.socket?.emit('guildHandleApplicant', {applicantName:'${name}', accept:true})" style="background:#22c55e; color:white; border:none; padding:2px 7px; cursor:pointer; border-radius:3px;">✅</button>
                                <button onclick="window.game?.socket?.emit('guildHandleApplicant', {applicantName:'${name}', accept:false})" style="background:#ef4444; color:white; border:none; padding:2px 7px; cursor:pointer; border-radius:3px;">❌</button>
                            </div>
                        </div>`;
                    });
                } else {
                    html += `<div style="color:#64748b; font-size:11px; margin-top:12px; text-align:center;">No pending applications</div>`;
                }
                html += `</div>`;
            }

            // Actions
            html += `<div style="display:flex; gap:6px; margin-bottom:6px;">
                <button style="background:#3b82f6; flex:1; font-size:12px; font-weight:bold; padding:8px; border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="window.donateGuildPrompt()">Donate Gold</button>
                <button style="background:#ef4444; flex:1; font-size:12px; font-weight:bold; padding:8px; border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="window.guildLeaveConfirm()">Leave Guild</button>
            </div>`;

            if (roleLevel[myRole] >= 2) {
                html += `<button style="background:#4f46e5; width:100%; margin-bottom:6px; padding:8px; font-size:12px; font-weight:bold; border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="window.guildInvitePrompt()">Invite Player</button>`;
            }

            if (data.hasBase) {
                html += `<button style="background:#22c55e; width:100%; margin-bottom:6px; padding:8px; font-size:12px; font-weight:bold; border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="window.enterGuildBase()">🏰 Enter Guild Base</button>`;
            } else if (myRole === 'Master') {
                html += `<button style="background:#f59e0b; width:100%; margin-bottom:6px; padding:8px; font-size:12px; font-weight:800; border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="window.buyGuildBaseConfirm()">🏰 Purchase Guild Base (1,000,000 Guild Gold)</button>`;
            } else {
                html += `<div style="background:#1e293b; border:1px dashed #f59e0b; border-radius:6px; padding:8px; margin-bottom:6px; text-align:center; font-size:11.5px; color:#f59e0b; font-weight:600;">🏰 Guild Base: Not Purchased<br><span style="color:#94a3b8; font-size:10.5px;">(Master can purchase for 1,000,000 Guild Funds)</span></div>`;
            }

            html += `<button style="background:#334155; width:100%; margin-top:4px; padding:8px; font-size:12px; font-weight:bold; border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="document.getElementById('guild-modal').style.display='none'">Close</button>`;
            modal.innerHTML = html;
        } else {
            // Guild Registry (No Guild)
            let html = `
                <div style="cursor:grab; padding:10px; background:#1e293b; margin:-20px -20px 15px -20px; border-radius:10px 10px 0 0; border-bottom:2px solid #4CAF50;">
                    <h2 style="margin:0; color:#4CAF50; font-size:1.15rem;">🏰 Guild Registry</h2>
                </div>
                <button style="background:linear-gradient(45deg, #f59e0b, #eab308); width:100%; margin-bottom:15px; font-weight:800; padding:12px; border:none; border-radius:6px; color:#000; font-size:13px; cursor:pointer;" onclick="window.createGuildPrompt()">Establish Guild (1,000,000 Gold)</button>
                <h3 style="color:#94a3b8; font-size:13px; border-bottom:1px solid #334155; padding-bottom:5px; text-align:left; margin:0 0 8px 0;">Open Guilds</h3>
                <div style="background:#0f172a; padding:10px; border:1px solid #334155; border-radius:6px; height:130px; overflow-y:auto; margin-bottom:15px; text-align:left;">
            `;

            if (data.openGuilds && data.openGuilds.length > 0) {
                data.openGuilds.forEach(g => {
                    html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid #1e293b;">
                        <span style="font-size:12px;">${g.name} <span style="color:#94a3b8; font-size:11px;">(${g.members} members)</span></span>
                        <button style="background:#22c55e; border:none; color:#fff; border-radius:4px; padding:3px 8px; font-size:11px; font-weight:bold; cursor:pointer;" onclick="window.applyToGuild('${g.name}')">Apply</button>
                    </div>`;
                });
            } else {
                html += '<div style="color:#64748b; text-align:center; margin-top:35px; font-size:12px;">No open guilds found.</div>';
            }

            html += `</div>
                <button style="background:#ef4444; width:100%; padding:8px; font-weight:bold; border:none; border-radius:6px; color:#fff; cursor:pointer;" onclick="document.getElementById('guild-modal').style.display='none'">Close</button>
            `;
            modal.innerHTML = html;
        }
    }

    showGuildInvite(data) {
        let gModal = document.getElementById('guild-invite-dialog');
        if (!gModal) {
            gModal = document.createElement('div');
            gModal.id = 'guild-invite-dialog';
            gModal.style.cssText = 'display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:rgba(15,23,42,0.96); border:2px solid #6366f1; padding:20px; z-index:99999; width:300px; border-radius:10px; box-shadow:0 0 25px rgba(99,102,241,0.5); color:white; text-align:center;';
            document.body.appendChild(gModal);
        }

        window._pendingGuildInvite = data.guildName;
        gModal.innerHTML = `
            <h3 style="color:#a855f7; margin-top:0;">Guild Invitation</h3>
            <p style="font-size:13px; color:#cbd5e1; margin-bottom:18px;"><strong>${data.from}</strong> invited you to join <strong>[${data.guildName}]</strong>.</p>
            <div style="display:flex; gap:10px;">
                <button style="background:#22c55e; color:#fff; border:none; border-radius:6px; padding:8px; font-weight:bold; flex:1; cursor:pointer;" onclick="window.respondGuildInvite(true)">Accept</button>
                <button style="background:#ef4444; color:#fff; border:none; border-radius:6px; padding:8px; font-weight:bold; flex:1; cursor:pointer;" onclick="window.respondGuildInvite(false)">Decline</button>
            </div>
        `;
        gModal.style.display = 'block';
    }

    updateQuestTracker(dm) {
        const el = document.getElementById('daily-quest-tracker');
        if (!el) return;
        if (!dm || !dm.active) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'block';
        const badge = document.getElementById('quest-tracker-badge');
        if (badge) {
            badge.textContent = dm.difficulty || dm.id || 'Active';
            if (dm.id === 'hard') badge.style.background = '#dc2626';
            else if (dm.id === 'medium') badge.style.background = '#eab308';
            else badge.style.background = '#0284c7';
        }
        const targetEl = document.getElementById('quest-tracker-target');
        if (targetEl) targetEl.textContent = `🎯 ${dm.targetName || 'Target'}: ${dm.progress || 0} / ${dm.targetCount || 1}`;
        const fill = document.getElementById('quest-tracker-bar-fill');
        if (fill) {
            const pct = Math.min(100, Math.round(((dm.progress || 0) / (dm.targetCount || 1)) * 100));
            fill.style.width = `${pct}%`;
        }
        const rew = document.getElementById('quest-tracker-reward');
        if (rew) rew.textContent = `💰 Reward: +${(dm.reward || 0).toLocaleString()} G`;
    }

    formatKeyLabel(code) {
        if (!code) return '';
        const map = {
            'ShiftLeft': 'SHIFT',
            'ShiftRight': 'R-SHIFT',
            'ControlLeft': 'CTRL',
            'ControlRight': 'R-CTRL',
            'AltLeft': 'ALT',
            'AltRight': 'R-ALT',
            'Space': 'SPACE',
            'Tab': 'TAB',
            'Enter': 'ENTER',
            'Escape': 'ESC',
            'Backspace': 'BKSP',
            'CapsLock': 'CAPS',
            'ArrowUp': 'UP',
            'ArrowDown': 'DOWN',
            'ArrowLeft': 'LEFT',
            'ArrowRight': 'RIGHT',
            'Backquote': '`',
            'Minus': '-',
            'Equal': '=',
            'BracketLeft': '[',
            'BracketRight': ']',
            'Backslash': '\\',
            'Semicolon': ';',
            'Quote': "'",
            'Comma': ',',
            'Period': '.',
            'Slash': '/'
        };
        if (map[code]) return map[code];
        return String(code)
            .replace(/^Key/, '')
            .replace(/^Digit/, '')
            .replace(/^Numpad/, 'NUM');
    }

    refreshKeybindLabels() {
        const kb = this.game?.keybinds;
        if (!kb) return;
        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.textContent = txt;
        };
        const setAttr = (id, attr, val) => {
            const el = document.getElementById(id);
            if (el) el.setAttribute(attr, val);
        };

        const k1 = `${this.formatKeyLabel(kb.skill1)} / ${this.formatKeyLabel(kb.skill1Alt || 'KeyQ')}`;
        const k2 = `${this.formatKeyLabel(kb.skill2)} / ${this.formatKeyLabel(kb.skill2Alt || 'KeyE')}`;
        const kPot = this.formatKeyLabel(kb.potion);

        setTxt('hb-key-1', k1);
        setTxt('hb-key-2', k2);
        setTxt('hb-key-3', kPot);

        // Settings Keybind Customizer Buttons
        setTxt('bind-btn-skill1', k1);
        setTxt('bind-btn-skill2', k2);
        setTxt('bind-btn-potion', kPot);
        setTxt('bind-btn-dodge', this.formatKeyLabel(kb.dodge));
        setTxt('bind-btn-jump', this.formatKeyLabel(kb.jump));
        setTxt('bind-btn-target', this.formatKeyLabel(kb.target));
        setTxt('bind-btn-chat', this.formatKeyLabel(kb.chat));

        setTxt('bind-btn-stats', this.formatKeyLabel(kb.stats));
        setTxt('bind-btn-bag', `${this.formatKeyLabel(kb.bag)} / I`);
        setTxt('bind-btn-skills', this.formatKeyLabel(kb.skills));
        setTxt('bind-btn-guild', this.formatKeyLabel(kb.guild));
        setTxt('bind-btn-friends', this.formatKeyLabel(kb.friends));
        setTxt('bind-btn-mailbox', this.formatKeyLabel(kb.mailbox));
        setTxt('bind-btn-shop', this.formatKeyLabel(kb.shop));

        // Update HUD Menu Button Tooltips
        setAttr('btn-stats', 'title', `Player Stats [${this.formatKeyLabel(kb.stats)}]`);
        setAttr('btn-inventory', 'title', `Inventory [${this.formatKeyLabel(kb.bag)}]`);
        setAttr('btn-skills', 'title', `Skills & Class [${this.formatKeyLabel(kb.skills)}]`);
        setAttr('btn-guild', 'title', `Guild [${this.formatKeyLabel(kb.guild)}]`);
        setAttr('btn-friends', 'title', `Friends [${this.formatKeyLabel(kb.friends)}]`);
        setAttr('btn-mailbox', 'title', `System Mail [${this.formatKeyLabel(kb.mailbox)}]`);
        setAttr('btn-cash-shop', 'title', `Cash Shop [${this.formatKeyLabel(kb.shop)}]`);
    }

    openMobileMenu() {
        const menu = document.getElementById('mobile-menu-modal') || document.getElementById('hud-dropdown-menu');
        if (!menu) return;
        document.exitPointerLock?.();
        menu.style.display = 'flex';
    }

    closeMobileMenu() {
        const menu = document.getElementById('mobile-menu-modal') || document.getElementById('hud-dropdown-menu');
        if (menu) menu.style.display = 'none';
        this.hideTooltip();
    }

    toggleMobileMenu() {
        const menu = document.getElementById('mobile-menu-modal') || document.getElementById('hud-dropdown-menu');
        if (!menu) return;
        if (menu.style.display === 'flex') {
            this.closeMobileMenu();
        } else {
            this.openMobileMenu();
        }
    }

    toggleStats() {
        this.closeMobileMenu();
        if (!this.statsModal) return;
        const isHidden = this.statsModal.style.display === 'none' || !this.statsModal.style.display;
        this.statsModal.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            document.exitPointerLock?.();
            this.renderStatsModal();
        }
    }

    renderStatsModal() {
        const p = this.game?.player;
        if (!p) return;
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setTxt('stat-name', p.name || 'Hero');
        setTxt('stat-class', p.baseStats?.playerClass || 'Novice');
        setTxt('stat-lvl', p.level || 1);
        setTxt('stat-exp', `${Math.floor(p.exp || 0).toLocaleString()} / ${Math.floor(p.maxExp || 100).toLocaleString()}`);
        setTxt('stat-maxhp', (p.maxHp || 100).toLocaleString());
        setTxt('stat-atk', (p.atk || 5).toLocaleString());
        setTxt('stat-matk', (p.mag || 5).toLocaleString());
        setTxt('stat-def', (p.def || 2).toLocaleString());
        setTxt('stat-spd', p.equips?.weapon?.fixedStat?.speed ? (1 + p.equips.weapon.fixedStat.speed) : 1);
        setTxt('stat-str', (p.totalStr || p.baseStats?.str || 10).toLocaleString());
        setTxt('stat-int', (p.totalInt || p.baseStats?.int || 10).toLocaleString());
    }

    updateSkillCooldowns() {
        const combat = this.game.combat;
        if (!combat) return;

        let baseCd1 = (combat.maxCooldowns && combat.maxCooldowns.skill1) || 15;
        let baseCd2 = (combat.maxCooldowns && combat.maxCooldowns.skill2) || 35;
        const pClass = (this.game.player.baseStats && this.game.player.baseStats.playerClass);
        if (pClass && CLASSES[pClass]) {
            const activeSkills = CLASSES[pClass].skills.filter(s => s.type === 'active');
            if (activeSkills[0] && activeSkills[0].cd) baseCd1 = Math.round(activeSkills[0].cd / 1000);
            if (activeSkills[1] && activeSkills[1].cd) baseCd2 = Math.round(activeSkills[1].cd / 1000);
        }

        const updateSlot = (overlayId, txtId, mOverlayId, mTxtId, cdSec, baseCd = 10) => {
            const overlay = document.getElementById(overlayId);
            const txt = document.getElementById(txtId);
            const mOverlay = document.getElementById(mOverlayId);
            const mTxt = document.getElementById(mTxtId);

            if (cdSec > 0) {
                const pct = Math.min(100, (cdSec / Math.max(1, baseCd)) * 100);
                const ceil = Math.ceil(cdSec);
                if (overlay) { overlay.style.height = `${pct}%`; }
                if (txt) { txt.style.display = 'flex'; txt.textContent = ceil; }
                if (mOverlay) { mOverlay.style.display = 'block'; mOverlay.style.height = `${pct}%`; }
                if (mTxt) { mTxt.style.display = 'flex'; mTxt.textContent = ceil; }
            } else {
                if (overlay) { overlay.style.height = '0%'; }
                if (txt) { txt.style.display = 'none'; }
                if (mOverlay) { mOverlay.style.display = 'none'; }
                if (mTxt) { mTxt.style.display = 'none'; }
            }
        };

        updateSlot('cd-1', 'cdt-1', 'm-cd-skill1', 'm-cdt-skill1', combat.cooldowns.skill1, baseCd1);
        updateSlot('cd-2', 'cdt-2', 'm-cd-skill2', 'm-cdt-skill2', combat.cooldowns.skill2, baseCd2);
    }

    updateFloorIndicator(mapId, mapName) {
        if (!this.floorTitle) return;
        this.floorTitle.textContent = mapName || "Town of Exonie";
        if (this.floorSubtitle) {
            if (mapId === 'town') this.floorSubtitle.textContent = "Safe Haven";
            else if (mapId === 'floor10') this.floorSubtitle.textContent = "Tower Climax (Floor 10)";
            else if (mapId.startsWith('floor')) this.floorSubtitle.textContent = "Infinite Spire";
            else this.floorSubtitle.textContent = "Sacred Realm";
        }
    }

    updateBossHealth(boss) {
        if (!this.game.bossEngaged || !boss || !boss.isAlive) {
            if (this.bossBarContainer) this.bossBarContainer.style.display = 'none';
            return;
        }

        if (this.bossBarContainer) this.bossBarContainer.style.display = 'flex';
        if (this.bossName) this.bossName.textContent = `[BOSS] ${boss.name} (Lv.${boss.level})`;

        const pct = Math.max(0, Math.min(100, (boss.hp / (boss.maxHp || 1)) * 100));
        if (this.bossHpFill) this.bossHpFill.style.width = `${pct}%`;
        if (this.bossHpText) this.bossHpText.textContent = `${Math.ceil(boss.hp).toLocaleString()} / ${Math.ceil(boss.maxHp || 1).toLocaleString()}`;
    }

    updateDayNightIndicator(info) {
        let el = document.getElementById('day-night-indicator');
        if (!el) {
            const center = document.querySelector('.hud-top-center');
            if (center) {
                el = document.createElement('div');
                el.id = 'day-night-indicator';
                el.className = 'day-night-badge';
                center.appendChild(el);
            }
        }
        if (el && info) {
            el.textContent = info.label || (info.isDay ? '☀️ Morning' : '🌙 Night');
            el.style.borderColor = info.isDay ? 'rgba(250, 204, 21, 0.6)' : 'rgba(96, 165, 250, 0.6)';
            el.style.color = info.isDay ? '#fde047' : '#93c5fd';
        }
    }

    showFloorCleared(mapName) {
        if (!this.floorClearedBanner) return;
        const bannerTitle = document.getElementById('banner-title');
        const bannerSub = document.getElementById('banner-sub');
        if (bannerTitle) bannerTitle.textContent = "AREA CONQUERED!";
        if (bannerSub) bannerSub.textContent = `Gate to Next Area is Now Active!`;
        this.floorClearedBanner.classList.add('show');
        setTimeout(() => {
            this.floorClearedBanner.classList.remove('show');
        }, 3000);
    }

    // ==========================================
    // INVENTORY / BAG SCREEN
    // ==========================================
    toggleInventory() {
        this.closeMobileMenu();
        if (!this.inventoryModal) return;
        const isHidden = this.inventoryModal.style.display === 'none' || !this.inventoryModal.style.display;
        this.inventoryModal.style.display = isHidden ? 'flex' : 'none';
        this.hideTooltip();
        if (isHidden) {
            document.exitPointerLock?.(); // Free cursor so user can click bag items
            this.renderInventory();
        }
    }

    // Rich Dragon Nest / Exonie Item Tooltip on Hover
    getItemTooltip(item) {
        if (!item) return '';
        const rarityColors = {
            Starter: '#aaaaaa',
            Basic: '#cd7f32',
            Rare: '#38bdf8',
            Unique: '#c084fc',
            Legendary: '#fb923c',
            Godly: '#f87171',
            Divine: '#facc15'
        };
        const rColor = rarityColors[item.rarity] || item.color || '#38bdf8';

        const reqLevel = Number(item.level || item.levelReq || item.minLevel) || 1;
        const pLevel = Number(this.game?.player?.level) || 1;

        let html = `<div class="tip-title" style="color:${rColor}; text-shadow:0 0 10px ${rColor};">${item.name}</div>`;
        html += `<div class="tip-subtitle">Lv.${reqLevel} ${item.rarity || 'Basic'} ${String(item.type).toUpperCase()}`;
        if (pLevel < reqLevel) {
            html += ` <span style="color:#f87171; font-weight:bold;">(Requires Lv.${reqLevel})</span>`;
        }
        html += `</div>`;

        // Fixed Stats
        if (item.fixedStat) {
            for (const [k, v] of Object.entries(item.fixedStat)) {
                let label = k.toUpperCase();
                if (k === 'hpHeal') label = 'HP RESTORE';
                html += `<div class="tip-stat-row">+${v} ${label}</div>`;
            }
        }

        // Random Bonus Stats
        if (item.randomStat) {
            for (const [k, v] of Object.entries(item.randomStat)) {
                html += `<div class="tip-stat-row" style="color:#22c55e;">+${v} ${k.toUpperCase()} (Bonus)</div>`;
            }
        }

        // Weapon Class Compatibility Info
        const sprite = String(item.sprite || item.name || '').toLowerCase();
        if (item.type === 'weapon') {
            let classComp = '';
            if (sprite.includes('touchpad')) classComp = 'Tech Genius (Commands Drone)';
            else if (sprite.includes('sword')) classComp = 'Berserker, Blademaster';
            else if (sprite.includes('gun')) classComp = 'Sniper, Explosives Expert';
            else if (sprite.includes('staff')) classComp = 'Summoner, Ice Master';
            else if (sprite.includes('pendant')) classComp = 'Healer';
            else if (sprite.includes('dagger')) classComp = 'Phantom Striker, Ninja Assassin';

            if (classComp) {
                html += `<div class="tip-class-row">⚡ Compatible: <strong style="color:#fff;">${classComp}</strong></div>`;
            }
        }

        // Description
        if (item.desc || item.description) {
            html += `<div class="tip-desc">"${item.desc || item.description}"</div>`;
        }

        const sellVal = getItemSellPrice(item);
        html += `<div class="tip-price">💰 Sell Price: ${sellVal.toLocaleString()} Gold</div>`;
        return html;
    }

    showTooltip(item, mouseEvent) {
        // On touch screens / mobile, item details are shown in the bottom detail panel
        const isTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && window.innerWidth <= 950) || document.body.classList.contains('touch-enabled');
        if (isTouchScreen) return;
        if (mouseEvent && (mouseEvent.pointerType === 'touch' || mouseEvent.sourceCapabilities?.firesTouchEvents)) {
            return;
        }

        const tip = document.getElementById('item-hover-tooltip');
        if (!tip || !item) return;
        tip.innerHTML = this.getItemTooltip(item);
        tip.style.display = 'block';

        const tipWidth = 260;
        const tipHeight = 160;
        let x = (mouseEvent?.clientX || 0) + 16;
        let y = (mouseEvent?.clientY || 0) + 16;

        if (x + tipWidth > window.innerWidth) x = (mouseEvent?.clientX || tipWidth) - tipWidth - 16;
        if (y + tipHeight > window.innerHeight) y = (mouseEvent?.clientY || tipHeight) - tipHeight - 16;

        tip.style.left = `${Math.max(10, x)}px`;
        tip.style.top = `${Math.max(10, y)}px`;
    }

    hideTooltip() {
        const tip = document.getElementById('item-hover-tooltip');
        if (tip) tip.style.display = 'none';
    }

    renderInventory() {
        const player = this.game.player;
        if (!player) return;

        // 1. Render Equipped Slots (All 8 Slots: Weapon, Armor, Leggings, Necklace, Ring, Earrings, Aura, Pet)
        const equipConfig = [
            { key: 'weapon', label: 'WEAPON', defaultText: 'Empty', icon: '⚔️' },
            { key: 'armor', label: 'ARMOR', defaultText: 'Empty', icon: '🛡️' },
            { key: 'leggings', label: 'LEGGINGS', defaultText: 'Empty', icon: '👖' },
            { key: 'necklace', label: 'NECKLACE', defaultText: 'Empty', icon: '📿' },
            { key: 'ring', label: 'RING', defaultText: 'Empty', icon: '💍' },
            { key: 'earrings', label: 'EARRINGS', defaultText: 'Empty', icon: '✨' },
            { key: 'aura', label: 'AURA', defaultText: 'Empty', icon: '✨' },
            { key: 'pet', label: 'PET', defaultText: 'Empty', icon: '🐾' }
        ];

        equipConfig.forEach(cfg => {
            const slotEl = document.getElementById(`slot-${cfg.key}`);
            const viewEl = document.getElementById(`equip-view-${cfg.key}`);
            const item = player.equips && player.equips[cfg.key];

            if (item) {
                // 2D EXONIE REPLICATION: Show enhancement level (e.g. +1, +5) instead of raw stat bonus
                const enh = item.enhanceLevel || item.refineLevel || 0;
                const enhStr = enh > 0 ? ` +${enh}` : '';
                if (viewEl) {
                    viewEl.innerHTML = `<span style="color:${item.color || '#38bdf8'}; font-weight:800;">${cfg.icon} ${item.name}${enhStr}</span>`;
                }
                if (slotEl) {
                    slotEl.classList.add('filled');
                    slotEl.onmouseenter = (e) => {
                        if (this.selectedInventoryIndex === null) this.showItemDetail(item, -1);
                        this.showTooltip(item, e);
                    };
                    slotEl.onmousemove = (e) => this.showTooltip(item, e);
                    slotEl.onmouseleave = () => this.hideTooltip();
                }
            } else {
                if (viewEl) viewEl.textContent = cfg.defaultText;
                if (slotEl) {
                    slotEl.classList.remove('filled');
                    slotEl.onmouseenter = null;
                    slotEl.onmousemove = null;
                    slotEl.onmouseleave = null;
                }
            }
        });

        // 2. Render Bag Grid (30 slots)
        const grid = document.getElementById('inventory-slots-grid');
        if (!grid) return;
        grid.innerHTML = '';

        for (let i = 0; i < 30; i++) {
            const item = player.inventory[i];
            const slotEl = document.createElement('div');
            slotEl.className = 'bag-slot';

            if (this.selectedInventoryIndex === i) {
                slotEl.classList.add('active');
            }

            if (item) {
                slotEl.innerHTML = `
                    <div class="bag-slot-icon">${this.getItemIcon(item.type, item.sprite)}</div>
                    ${item.quantity && item.quantity > 1 ? `<div class="bag-slot-qty">${item.quantity}</div>` : ''}
                `;

                // HOVER: Only update bottom inspector if NO slot is currently locked by left-click!
                slotEl.onmouseenter = (e) => {
                    if (this.selectedInventoryIndex === null) {
                        this.showItemDetail(item, i);
                    }
                    this.showTooltip(item, e);
                };
                slotEl.onmousemove = (e) => {
                    this.showTooltip(item, e);
                };
                slotEl.onmouseleave = () => {
                    this.hideTooltip();
                };

                // LEFT CLICK: Locks this item in the inspector or toggles into active Trade offer!
                slotEl.onclick = () => {
                    if (this.isTradeOpen) {
                        this.game?.addOrRemoveTradeItem(i);
                        this.renderInventory();
                        return;
                    }
                    this.selectedInventoryIndex = i;
                    this.renderInventory();
                    this.showItemDetail(item, i);
                };

                // DOUBLE CLICK: Instant Equip or Use!
                slotEl.ondblclick = () => {
                    this.hideTooltip();
                    if (['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings', 'aura', 'pet'].includes(item.type)) {
                        this.game.equipItemFromInventory(i);
                        this.selectedInventoryIndex = null;
                        this.renderInventory();
                    } else if (item.type === 'potion') {
                        this.game.useHealthPotion();
                        this.renderInventory();
                    }
                };
            } else {
                slotEl.innerHTML = `<span style="color:#475569; font-size:0.75rem;">${i + 1}</span>`;
                slotEl.onclick = () => {
                    this.selectedInventoryIndex = null;
                    this.renderInventory();
                    this.clearItemDetail();
                };
                slotEl.onmouseenter = () => this.hideTooltip();
            }

            grid.appendChild(slotEl);
        }

        // Keep locked item's Equip button visible at all times when selectedInventoryIndex is set
        if (this.selectedInventoryIndex !== null && player.inventory[this.selectedInventoryIndex]) {
            this.showItemDetail(player.inventory[this.selectedInventoryIndex], this.selectedInventoryIndex);
        }
    }

    getItemIcon(type, sprite = '') {
        const s = String(sprite).toLowerCase();
        if (s.includes('sword')) return '🗡️';
        if (s.includes('staff')) return `<svg viewBox="0 0 24 24" width="22" height="22" style="display:inline-block; vertical-align:middle; filter:drop-shadow(0 0 3px #00e5ff);"><line x1="5" y1="21" x2="16" y2="7" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round"/><line x1="4.5" y1="21.5" x2="6.5" y2="19.5" stroke="#facc15" stroke-width="2.5" stroke-linecap="round"/><path d="M13 10 C14 6, 18 4, 21 6 C19 9, 17 11, 13 10 Z" fill="#a855f7" stroke="#e9d5ff" stroke-width="1"/><circle cx="17.5" cy="5.5" r="2.5" fill="#00e5ff" stroke="#ffffff" stroke-width="1"/><circle cx="21" cy="3" r="0.8" fill="#ffd700"/><circle cx="14" cy="2" r="0.8" fill="#ffd700"/></svg>`;
        if (s.includes('pendant')) return '📿';
        if (s.includes('gun')) return '🔫';
        if (s.includes('dagger')) return '🗡️';
        if (s.includes('touchpad')) return '📱';
        if (s.includes('revival')) return '✨';
        if (s.includes('potion')) return '🧪';
        if (s.includes('refinement')) return '💠';
        if (s.includes('gem')) return '💎';
        if (s.includes('goldbar')) return '🪙';
        if (type === 'armor') return '🛡️';
        if (type === 'leggings') return '👖';
        if (type === 'necklace' || s.includes('necklace')) return '📿';
        if (type === 'ring' || s.includes('ring')) return '💍';
        if (type === 'earrings' || s.includes('earring')) return '✨';
        if (type === 'aura' || s.includes('aura')) return '✨';
        if (type === 'pet' || s.includes('pet')) return '🐾';
        if (type === 'ticket' || s.includes('ticket')) return '🎫';
        return '📦';
    }

    showItemDetail(item, index) {
        const titleEl = document.getElementById('detail-item-title');
        const descEl = document.getElementById('detail-item-desc');
        const actionsEl = document.getElementById('detail-item-actions');
        if (!titleEl || !descEl || !actionsEl) return;

        const reqLevel = Number(item.level || item.levelReq || item.minLevel) || 1;
        const playerLevel = Number(this.game?.player?.level) || 1;
        const canEquip = playerLevel >= reqLevel;
        const levelBadge = `<span style="font-size:0.75rem; color:${canEquip ? '#4ade80' : '#f87171'}; margin-left:6px; font-weight:bold;">[Lv.${reqLevel}${!canEquip ? ' - REQ LV.' + reqLevel : ''}]</span>`;

        titleEl.innerHTML = `<span style="color:${item.color || '#38bdf8'}; font-weight:900;">${item.name}</span> <span style="font-size:0.75rem; color:#94a3b8;">[${item.rarity || 'Basic'}]</span> ${levelBadge}`;

        let statsStr = '';
        if (item.fixedStat) {
            statsStr = Object.entries(item.fixedStat).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ');
        }
        if (item.randomStat) {
            const rndStr = Object.entries(item.randomStat).map(([k, v]) => `+${v} ${k.toUpperCase()} (Bonus)`).join(', ');
            statsStr = statsStr ? `${statsStr}, ${rndStr}` : rndStr;
        }
        descEl.innerHTML = `${item.desc || ''} ${statsStr ? `<br><strong style="color:#4ade80;">Stats: ${statsStr}</strong>` : ''}`;

        actionsEl.innerHTML = '';
        if (index < 0) return; // Viewing already-equipped item

        // If Trade Window is currently open, show Trade Offer Action
        if (this.isTradeOpen && index >= 0) {
            const btnTrade = document.createElement('button');
            btnTrade.className = 'btn-item-action';
            const isOffered = this.game.myTradeItems && this.game.myTradeItems.some(it => it && it.id === item.id);
            btnTrade.textContent = isOffered ? '➖ Remove from Trade' : '➕ Add to Trade';
            btnTrade.style.background = isOffered ? '#dc2626' : '#0284c7';
            btnTrade.style.borderColor = isOffered ? '#ef4444' : '#38bdf8';
            btnTrade.onclick = () => {
                this.game.addOrRemoveTradeItem(index);
                this.renderInventory();
            };
            actionsEl.appendChild(btnTrade);
        }

        if (['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings', 'aura', 'pet'].includes(item.type)) {
            const btnEquip = document.createElement('button');
            btnEquip.className = 'btn-item-action';
            if (canEquip) {
                btnEquip.textContent = `⚔️ Equip ${item.type.charAt(0).toUpperCase() + item.type.slice(1)}`;
                btnEquip.onclick = () => {
                    this.hideTooltip();
                    this.game.equipItemFromInventory(index);
                    this.selectedInventoryIndex = null;
                    this.renderInventory();
                };
            } else {
                btnEquip.textContent = `🔒 Requires Lv.${reqLevel}`;
                btnEquip.style.opacity = '0.75';
                btnEquip.style.background = '#450a0a';
                btnEquip.style.border = '1px solid #ef4444';
                btnEquip.style.color = '#fca5a5';
                btnEquip.style.cursor = 'not-allowed';
                btnEquip.onclick = () => {
                    this.game.audio.playSfx('bump');
                    this.showToast(`⛔ Level ${reqLevel} required to equip ${item.name}! (You are Lv.${playerLevel})`);
                };
            }
            actionsEl.appendChild(btnEquip);
        } else if (item.type === 'potion') {
            const btnUse = document.createElement('button');
            btnUse.className = 'btn-item-action';
            btnUse.textContent = `🧪 Drink ${item.name}`;
            btnUse.onclick = () => {
                this.game.useHealthPotion();
                this.renderInventory();
            };
            actionsEl.appendChild(btnUse);
        } else if (item.type === 'material' && (String(item.sprite || '').includes('refinement') || String(item.name || '').includes('Refinement') || String(item.name || '').includes('Divine Enhancement'))) {
            const btnEnhance = document.createElement('button');
            btnEnhance.className = 'btn-item-action';
            btnEnhance.style.background = 'linear-gradient(135deg, #0284c7, #38bdf8)';
            btnEnhance.style.color = '#fff';
            btnEnhance.style.fontWeight = 'bold';
            btnEnhance.textContent = `✨ Enhance Equipment`;
            btnEnhance.onclick = () => {
                this.openEnhanceModal(index);
            };
            actionsEl.appendChild(btnEnhance);
        } else if (item.type === 'material' && String(item.sprite || '').includes('gem')) {
            const btnUseMat = document.createElement('button');
            btnUseMat.className = 'btn-item-action';
            btnUseMat.textContent = `✨ Use ${item.name} on Weapon`;
            btnUseMat.onclick = () => {
                this.game.useMaterialFromInventory(index);
            };
            actionsEl.appendChild(btnUseMat);
        }

        // Deposit to Home Storage Vault button (Available inside Home or when Storage is active)
        if (this.game.currentMapId === 'home' || window.isStorageOpen) {
            const btnStore = document.createElement('button');
            btnStore.className = 'btn-item-action';
            btnStore.style.marginLeft = '8px';
            btnStore.style.background = '#f59e0b';
            btnStore.style.color = '#000';
            btnStore.style.fontWeight = '900';
            btnStore.textContent = `📥 Store in Home Vault`;
            btnStore.onclick = () => {
                this.game.transferToStorage(index);
                this.selectedInventoryIndex = null;
                this.renderInventory();
                this.renderStorage();
            };
            actionsEl.appendChild(btnStore);
        }

        // Sell button for any bag item (Exact 2D Exonie Sell Price formula)
        const sellVal = getItemSellPrice(item);
        const btnSell = document.createElement('button');
        btnSell.className = 'btn-item-action';
        btnSell.style.marginLeft = '8px';
        btnSell.style.background = '#334155';
        btnSell.textContent = `💰 Sell (${sellVal.toLocaleString()}G)`;
        btnSell.onclick = () => {
            this.game.sellItemFromInventory(index);
            this.selectedInventoryIndex = null;
        };
        actionsEl.appendChild(btnSell);
    }

    clearItemDetail() {
        const titleEl = document.getElementById('detail-item-title');
        const descEl = document.getElementById('detail-item-desc');
        const actionsEl = document.getElementById('detail-item-actions');
        if (titleEl) titleEl.textContent = 'Select an item to view stats';
        if (descEl) descEl.textContent = 'Equipping a weapon allows you to choose your permanent class in the Skills menu (K).';
        if (actionsEl) actionsEl.innerHTML = '';
    }

    closeEnhanceModal() {
        if (!this.enhancementModal) this.enhancementModal = document.getElementById('enhancement-modal');
        if (this.enhancementModal) this.enhancementModal.style.display = 'none';
    }

    openEnhanceModal(stoneIndex) {
        if (!this.enhancementModal) this.enhancementModal = document.getElementById('enhancement-modal');
        if (!this.enhancementModal) return;

        const stone = this.game?.player?.inventory ? this.game.player.inventory[stoneIndex] : null;
        if (!stone) {
            this.showToast('⚠️ Refinement stone not found.', '#ef4444');
            return;
        }

        const stoneInfoEl = document.getElementById('enhance-stone-info');
        const eqListEl = document.getElementById('enhance-equipment-list');
        if (!stoneInfoEl || !eqListEl) return;

        const stoneName = String(stone.name || 'Refinement Stone');
        const stoneRarity = String(stone.rarity || 'Basic');
        const stoneLvl = Number(stone.level) || 1;
        const stoneQty = stone.quantity || 1;
        const rarityColors = { Basic: '#ffffff', Rare: '#2196f3', Unique: '#ab47bc', Legendary: '#ff9800', Godly: '#f44336', Divine: '#ffd700' };
        const stoneColor = stone.color || rarityColors[stoneRarity] || '#ffffff';

        const isDivineStone = stoneRarity.toLowerCase() === 'divine' || stoneName.includes('Divine Enhancement');

        stoneInfoEl.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="width:44px; height:44px; border-radius:8px; background:rgba(0,0,0,0.5); border:2px solid ${stoneColor}; display:flex; align-items:center; justify-content:center; font-size:1.6rem; box-shadow:0 0 12px ${stoneColor}44;">
                        💎
                    </div>
                    <div>
                        <div style="font-weight:bold; color:${stoneColor}; font-size:1.05rem;">${stoneName}</div>
                        <div style="font-size:0.8rem; color:#94a3b8; margin-top:2px;">
                            Rarity: <strong style="color:${stoneColor};">${stoneRarity}</strong> | Level: <strong style="color:#fff;">Lv.${stoneLvl}</strong> | Available: <strong style="color:#38bdf8;">x${stoneQty}</strong>
                        </div>
                    </div>
                </div>
            </div>
            <div style="margin-top:10px; padding:8px 12px; background:rgba(0,0,0,0.35); border-radius:6px; font-size:0.82rem; border-left:3px solid ${isDivineStone ? '#ffd700' : '#38bdf8'};">
                ${isDivineStone 
                    ? `🌟 <strong style="color:#ffd700;">Divine Universal Stone:</strong> Can enhance <strong style="color:#ffd700;">ANY LEVEL</strong> of Divine Equipment! (Max +25)` 
                    : `🎯 <strong style="color:#38bdf8;">Strict Matching Rule:</strong> Can ONLY enhance <strong style="color:${stoneColor};">Lv.${stoneLvl} ${stoneRarity}</strong> equipment!`
                }
            </div>
        `;

        eqListEl.innerHTML = '';

        // Gather all candidates: Equipped gear first, then Inventory items
        const candidates = [];

        // 1. Equipped Gear
        const validSlots = ['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings'];
        if (this.game.player.equips) {
            for (const slot of validSlots) {
                const eq = this.game.player.equips[slot];
                if (eq) {
                    candidates.push({
                        item: eq,
                        source: 'equipped',
                        key: slot,
                        label: `Equipped: ${slot.toUpperCase()}`
                    });
                }
            }
        }

        // 2. Bag Equipment
        if (Array.isArray(this.game.player.inventory)) {
            this.game.player.inventory.forEach((it, idx) => {
                if (it && idx !== stoneIndex && validSlots.includes(it.type)) {
                    candidates.push({
                        item: it,
                        source: 'inventory',
                        key: idx,
                        label: `Bag Slot #${idx + 1}`
                    });
                }
            });
        }

        if (candidates.length === 0) {
            eqListEl.innerHTML = `<div style="text-align:center; padding:24px; color:#94a3b8; font-size:0.9rem;">No equipment found in your equipped slots or bag to enhance.</div>`;
            this.enhancementModal.style.display = 'flex';
            return;
        }

        candidates.forEach(cand => {
            const item = cand.item;
            const check = canStoneEnhanceItem(stone, item);
            const curEnh = item.enhanceLevel || item.refineLevel || 0;
            const itemColor = item.color || rarityColors[item.rarity] || '#ffffff';
            const cardEl = document.createElement('div');
            cardEl.style.cssText = `background:${check.valid ? 'rgba(15, 23, 42, 0.85)' : 'rgba(15, 23, 42, 0.45)'}; border:1px solid ${check.valid ? '#38bdf8' : '#334155'}; border-radius:10px; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px; transition:all 0.2s; ${check.valid ? 'box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);' : 'opacity:0.65;'}`;

            let outcomePreview = '';
            if (check.valid) {
                const outcome = calculateEnhanceOutcome(curEnh);
                const succPct = Math.round(outcome.successChance * 100);
                const shatPct = Math.round(outcome.destroyChance * 100);
                outcomePreview = `
                    <div style="font-size:0.78rem; margin-top:3px; display:flex; gap:10px; flex-wrap:wrap;">
                        <span style="color:#4ade80;">Success: <strong>${succPct}%</strong></span>
                        ${shatPct > 0 ? `<span style="color:#ef4444;">Shatter Risk: <strong>${shatPct}%</strong></span>` : `<span style="color:#94a3b8;">Safe (0% Shatter)</span>`}
                        <span style="color:#38bdf8;">Next: <strong>+${curEnh + 1}</strong> (+${check.bonus} all stats)</span>
                    </div>
                `;
            } else {
                outcomePreview = `
                    <div style="font-size:0.75rem; color:#f87171; margin-top:3px;">
                        ⛔ ${check.reason}
                    </div>
                `;
            }

            cardEl.innerHTML = `
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:0.7rem; background:#334155; color:#94a3b8; padding:2px 6px; border-radius:4px; font-weight:bold;">${cand.label}</span>
                        <strong style="color:${itemColor}; font-size:0.92rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</strong>
                        ${curEnh > 0 ? `<span style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid #38bdf8; font-size:0.72rem; padding:1px 5px; border-radius:4px; font-weight:bold;">+${curEnh}</span>` : ''}
                    </div>
                    <div style="font-size:0.75rem; color:#64748b; margin-top:2px;">
                        ${item.rarity || 'Basic'} | Lv.${item.level || 1} ${String(item.type || 'GEAR').toUpperCase()}
                    </div>
                    ${outcomePreview}
                </div>
            `;

            if (check.valid) {
                const btnEnh = document.createElement('button');
                btnEnh.type = 'button';
                btnEnh.textContent = '✨ Enhance';
                btnEnh.style.cssText = `background:linear-gradient(135deg, #0284c7, #38bdf8); color:#fff; border:none; border-radius:6px; padding:8px 14px; font-weight:bold; font-size:0.85rem; cursor:pointer; box-shadow:0 0 10px rgba(56, 189, 248, 0.4); white-space:nowrap; transition:transform 0.15s;`;
                btnEnh.onmouseenter = () => btnEnh.style.transform = 'scale(1.05)';
                btnEnh.onmouseleave = () => btnEnh.style.transform = 'scale(1.0)';
                btnEnh.onclick = () => {
                    this.game.enhanceItemWithStone(stoneIndex, cand.source, cand.key);
                };
                cardEl.appendChild(btnEnh);
            }

            eqListEl.appendChild(cardEl);
        });

        this.enhancementModal.style.display = 'flex';
    }

    // ==========================================
    // SKILLS & CLASS CHOOSING SCREEN
    // ==========================================
    toggleSkills() {
        this.closeMobileMenu();
        if (!this.skillModal) return;
        const isHidden = this.skillModal.style.display === 'none' || !this.skillModal.style.display;
        this.skillModal.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            document.exitPointerLock?.();
            this.renderSkills();
        }
    }

    // ==========================================
    // ESC SETTINGS MENU & MARKETPLACE MODAL
    // ==========================================
    toggleSettings() {
        // If mobile menu modal is open, pressing ESC closes that first
        const mobModal = document.getElementById('mobile-menu-modal');
        if (mobModal && mobModal.style.display === 'flex') {
            this.closeMobileMenu();
            return;
        }

        // If another modal is open, pressing ESC closes that modal first
        if (this.statsModal && this.statsModal.style.display === 'flex') {
            this.statsModal.style.display = 'none';
            return;
        }
        if (this.inventoryModal && this.inventoryModal.style.display === 'flex') {
            this.inventoryModal.style.display = 'none';
            this.hideTooltip();
            return;
        }
        if (this.skillModal && this.skillModal.style.display === 'flex') {
            this.skillModal.style.display = 'none';
            return;
        }
        if (this.marketplaceModal && this.marketplaceModal.style.display === 'flex') {
            this.marketplaceModal.style.display = 'none';
            return;
        }
        if (this.confirmModal && this.confirmModal.style.display === 'flex') {
            this.confirmModal.style.display = 'none';
            return;
        }
        if (this.storageModal && this.storageModal.style.display === 'flex') {
            this.closeStorageUI();
            return;
        }
        if (this.dailyMissionsModal && this.dailyMissionsModal.style.display === 'flex') {
            this.dailyMissionsModal.style.display = 'none';
            return;
        }
        if (this.tavernModal && this.tavernModal.style.display === 'flex') {
            this.tavernModal.style.display = 'none';
            return;
        }
        if (this.leaderboardModal && this.leaderboardModal.style.display === 'flex') {
            this.leaderboardModal.style.display = 'none';
            return;
        }
        if (this.dungeonModal && this.dungeonModal.style.display === 'flex') {
            this.dungeonModal.style.display = 'none';
            return;
        }
        if (this.mazeGuideModal && this.mazeGuideModal.style.display === 'flex') {
            this.mazeGuideModal.style.display = 'none';
            return;
        }
        if (this.cashShopModal && this.cashShopModal.style.display === 'flex') {
            this.cashShopModal.style.display = 'none';
            return;
        }
        if (this.tradeScreen && this.tradeScreen.style.display === 'flex') {
            this.game?.cancelTrade();
            return;
        }
        const homeSale = document.getElementById('home-sale-modal');
        if (homeSale && homeSale.style.display === 'block') {
            homeSale.style.display = 'none';
            return;
        }
        const guildM = document.getElementById('guild-modal');
        if (guildM && guildM.style.display === 'block') {
            guildM.style.display = 'none';
            return;
        }

        if (!this.settingsModal) return;
        const isHidden = this.settingsModal.style.display === 'none' || !this.settingsModal.style.display;
        this.settingsModal.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            document.exitPointerLock?.();
            const chkFs = document.getElementById('chk-fullscreen');
            if (chkFs) chkFs.checked = !!(document.fullscreenElement || window.isElectronFS);
        }
    }

    isAnyModalOpen() {
        const modals = [
            this.marketplaceModal, this.storageModal, this.dailyMissionsModal,
            this.tavernModal, this.leaderboardModal, this.dungeonModal,
            this.mazeGuideModal, this.settingsModal, this.statsModal,
            this.inventoryModal, this.skillsModal, this.inspectModal,
            this.cashShopModal, this.tradeScreen, this.notEnoughGoldModal,
            this.enhancementModal,
            document.getElementById('home-sale-modal'),
            document.getElementById('guild-modal'),
            document.getElementById('mobile-menu-modal'),
            document.getElementById('not-enough-gold-modal')
        ];
        return modals.some(m => m && (m.style.display === 'flex' || m.style.display === 'block'));
    }

    closeAllModals() {
        this.closeMobileMenu();
        this.hideTooltip();
        const modals = [
            this.marketplaceModal, this.storageModal, this.dailyMissionsModal,
            this.tavernModal, this.leaderboardModal, this.dungeonModal,
            this.mazeGuideModal, this.settingsModal, this.statsModal,
            this.inventoryModal, this.skillsModal, this.inspectModal,
            this.cashShopModal, this.tradeScreen, this.notEnoughGoldModal,
            this.enhancementModal,
            document.getElementById('home-sale-modal'),
            document.getElementById('guild-modal'),
            document.getElementById('guild-invite-dialog'),
            document.getElementById('friends-modal'),
            document.getElementById('mailbox-modal'),
            document.getElementById('mobile-menu-modal'),
            document.getElementById('cosmetic-preview-modal'),
            document.getElementById('not-enough-gold-modal')
        ];
        modals.forEach(m => {
            if (m) m.style.display = 'none';
        });
        document.querySelectorAll('.game-modal').forEach(m => m.style.display = 'none');
        document.querySelectorAll('.game-modal-dialog').forEach(m => m.style.display = 'none');
    }

    showNotEnoughGoldModal(required, current, actionName = 'this action') {
        window.game?.audio?.playSfx?.('bump');
        const modal = document.getElementById('not-enough-gold-modal');
        if (!modal) {
            alert(`Not enough Gold! You need ${Number(required || 0).toLocaleString()} G.`);
            return;
        }
        const reqEl = document.getElementById('neg-modal-required');
        const curEl = document.getElementById('neg-modal-current');
        const msgEl = document.getElementById('neg-modal-msg');
        if (reqEl) reqEl.textContent = `${Number(required || 0).toLocaleString()} G`;
        if (curEl) curEl.textContent = `${Number(current || 0).toLocaleString()} G`;
        if (msgEl) {
            const deficit = Math.max(0, (Number(required) || 0) - (Number(current) || 0));
            msgEl.innerHTML = `You do not have enough Gold for <strong>${actionName}</strong>.<br><span style="color:#94a3b8; font-size:0.83rem;">You are short by <strong style="color:#fde047;">${deficit.toLocaleString()} G</strong>.</span>`;
        }
        modal.style.display = 'flex';
        document.exitPointerLock?.();
    }

    openInspectModal(data) {
        if (!data) return;
        const modal = this.inspectModal || document.getElementById('inspect-modal');
        if (!modal) return;

        const titleEl = document.getElementById('inspect-modal-title');
        if (titleEl) {
            titleEl.textContent = `🔍 Inspect: ${data.name || 'Hero'}`;
        }

        const vitalsEl = document.getElementById('inspect-vitals-header');
        if (vitalsEl) {
            const pClass = data.playerClass || 'Novice';
            const lvl = data.level || 1;
            const hpStr = (data.currentHp !== undefined && data.maxHp !== undefined) ? `HP ${data.currentHp} / ${data.maxHp}` : `Level ${lvl}`;
            const titleHtml = data.title ? ` &nbsp;|&nbsp; <strong style="color:#ffd700; text-shadow:0 0 6px rgba(255,215,0,0.5);">&lt;${data.title}&gt;</strong>` : '';
            vitalsEl.innerHTML = `<strong>Level ${lvl}</strong> &nbsp;|&nbsp; <strong style="color:#38bdf8;">${pClass}</strong>${titleHtml} &nbsp;|&nbsp; <strong style="color:#4ade80;">${hpStr}</strong>`;
        }

        const gridEl = document.getElementById('inspect-equips-grid');
        if (gridEl) {
            gridEl.innerHTML = '';
            const equips = data.equips || {};
            const slots = [
                { key: 'weapon', label: 'Weapon', icon: '⚔️' },
                { key: 'armor', label: 'Armor', icon: '🛡️' },
                { key: 'leggings', label: 'Leggings', icon: '👖' },
                { key: 'necklace', label: 'Necklace', icon: '📿' },
                { key: 'ring', label: 'Ring', icon: '💍' },
                { key: 'earrings', label: 'Earrings', icon: '✨' },
                { key: 'aura', label: 'Aura', icon: '✨' },
                { key: 'pet', label: 'Pet', icon: '🐾' }
            ];

            slots.forEach(s => {
                const item = equips[s.key];
                const card = document.createElement('div');
                card.className = 'inspect-equip-card';

                if (!item) {
                    card.innerHTML = `
                        <div class="inspect-equip-slot-name">${s.icon} ${s.label}</div>
                        <div class="inspect-empty">Empty (None)</div>
                    `;
                } else {
                    const rarityColor = item.color || RARITY_COLORS[item.rarity] || '#ffffff';
                    const displayName = item.enhanceLevel ? `${item.name} +${item.enhanceLevel}` : item.name;

                    let socketsHtml = '';
                    if (['necklace', 'ring', 'earrings'].includes(item.type)) {
                        const maxGems = { Basic: 1, Rare: 1, Unique: 2, Legendary: 3, Godly: 4, Divine: 5 }[item.rarity] || 0;
                        if (maxGems > 0) {
                            const count = item.gemCount || 0;
                            let sockets = '';
                            for (let i = 0; i < maxGems; i++) {
                                sockets += (i < count) ? '◆ ' : '◇ ';
                            }
                            socketsHtml = `<div class="inspect-sockets">Sockets: ${sockets.trim()}</div>`;
                        }
                    }

                    let statsHtml = '';
                    if (item.fixedStat) {
                        for (const k in item.fixedStat) {
                            statsHtml += `<div><b>Fixed:</b> +${item.fixedStat[k]} ${k.toUpperCase()}</div>`;
                        }
                    }
                    if (item.randomStat) {
                        for (const k in item.randomStat) {
                            statsHtml += `<div><b>Random:</b> +${item.randomStat[k]} ${k.toUpperCase()}</div>`;
                        }
                    }

                    card.innerHTML = `
                        <div class="inspect-equip-slot-name">${s.icon} ${s.label}</div>
                        <div class="inspect-item-name" style="color:${rarityColor};">${displayName}</div>
                        <div class="inspect-item-sub">Lv.${item.level || 1} [${item.rarity || 'Basic'}]</div>
                        ${socketsHtml}
                        <div class="inspect-item-stat">${statsHtml || '<div style="color:#64748b;">No extra stats</div>'}</div>
                    `;
                }

                gridEl.appendChild(card);
            });
        }

        document.exitPointerLock?.();
        modal.style.display = 'flex';
    }

    closeInspectModal() {
        const modal = this.inspectModal || document.getElementById('inspect-modal');
        if (modal) modal.style.display = 'none';
    }

    openPlayerInteractionMenu(targetPlayer, clientX, clientY) {
        if (!targetPlayer) return;
        this.selectedTargetPlayer = targetPlayer;
        const menu = document.getElementById('player-interaction-menu');
        if (!menu) return;

        const nameEl = document.getElementById('player-ctx-name');
        const lvlEl = document.getElementById('player-ctx-level');
        const charName = targetPlayer.name || targetPlayer.character_name || 'Exonian';
        if (nameEl) nameEl.textContent = charName;
        if (lvlEl) {
            const pClass = targetPlayer.className || targetPlayer.playerClass || 'Novice';
            lvlEl.textContent = `Lv.${targetPlayer.level || 1} • ${pClass}`;
        }

        menu.style.display = 'flex';

        const menuWidth = 210;
        const menuHeight = 220;
        const maxX = window.innerWidth - menuWidth - 10;
        const maxY = window.innerHeight - menuHeight - 10;
        const left = Math.max(10, Math.min((clientX || window.innerWidth / 2) + 10, maxX));
        const top = Math.max(10, Math.min((clientY || window.innerHeight / 2) - 30, maxY));

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    closePlayerInteractionMenu() {
        const menu = document.getElementById('player-interaction-menu');
        if (menu) menu.style.display = 'none';
        this.selectedTargetPlayer = null;
    }

    toggleMarketplace(forceState = null) {
        if (!this.marketplaceModal) return;
        const isHidden = (forceState !== null)
            ? !forceState
            : (this.marketplaceModal.style.display === 'none' || !this.marketplaceModal.style.display);

        this.marketplaceModal.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) {
            document.exitPointerLock?.();
        } else {
            if (this.game) this.game.portalCooldown = 4.0;
        }
    }

    // ==========================================
    // 2D HOME STORAGE VAULT (15 SLOTS)
    // ==========================================
    openStorageUI() {
        if (!this.storageModal) return;
        window.isStorageOpen = true;
        document.exitPointerLock?.();
        this.renderStorage();
        this.storageModal.style.display = 'flex';
    }

    renderStorageUI() {
        this.renderStorage();
    }

    closeStorageUI() {
        window.isStorageOpen = false;
        if (this.storageModal) this.storageModal.style.display = 'none';
        if (this.game) this.game.portalCooldown = 4.0;
        this.hideTooltip();
    }

    renderStorage() {
        const player = this.game?.player;
        if (!player) return;
        if (!Array.isArray(player.storage)) {
            player.storage = Array(15).fill(null);
        }
        const grid = document.getElementById('storage-slots-grid');
        const countLbl = document.getElementById('storage-count-label');
        if (!grid) return;
        grid.innerHTML = '';

        let usedCount = 0;
        for (let i = 0; i < 15; i++) {
            const item = player.storage[i];
            const slotEl = document.createElement('div');
            slotEl.className = 'bag-slot';
            if (item) {
                usedCount++;
                slotEl.innerHTML = `
                    <div class="bag-slot-icon">${this.getItemIcon(item.type, item.sprite)}</div>
                    ${item.quantity && item.quantity > 1 ? `<div class="bag-slot-qty">${item.quantity}</div>` : ''}
                `;
                slotEl.onmouseenter = (e) => this.showTooltip(item, e);
                slotEl.onmousemove = (e) => this.showTooltip(item, e);
                slotEl.onmouseleave = () => this.hideTooltip();
                slotEl.onclick = () => {
                    this.hideTooltip();
                    this.game.transferFromStorage(i);
                    this.renderStorage();
                    if (this.inventoryModal && this.inventoryModal.style.display === 'flex') {
                        this.renderInventory();
                    }
                };
            } else {
                slotEl.innerHTML = `<span style="color:#475569; font-size:0.75rem;">V${i + 1}</span>`;
                slotEl.onmouseenter = () => this.hideTooltip();
            }
            grid.appendChild(slotEl);
        }
        if (countLbl) {
            countLbl.textContent = `Stored: ${usedCount} / 15`;
        }
    }

    // ==========================================
    // 2D QUEST BOARD / DAILY GOLD MISSIONS
    // ==========================================
    openDailyMissionsUI() {
        if (!this.dailyMissionsModal) return;
        document.exitPointerLock?.();
        this.renderDailyMissions();
        this.dailyMissionsModal.style.display = 'flex';
    }

    renderDailyMissions() {
        const player = this.game?.player;
        if (!player) return;
        const activeBox = document.getElementById('active-mission-box');
        const selectBox = document.getElementById('mission-selection-box');
        if (!activeBox || !selectBox) return;

        const dm = player.dailyMission;
        if (dm && dm.active) {
            activeBox.style.display = 'block';
            selectBox.style.display = 'none';
            const nameEl = document.getElementById('active-mission-name');
            const rewEl = document.getElementById('active-mission-reward');
            const progEl = document.getElementById('active-mission-progress');
            const barEl = document.getElementById('active-mission-bar');
            if (nameEl) nameEl.textContent = dm.name;
            if (rewEl) rewEl.textContent = Number(dm.reward || 25000).toLocaleString();
            if (progEl) progEl.textContent = `${dm.progress || 0} / ${dm.targetCount || 15}`;
            if (barEl) {
                const pct = Math.min(100, Math.round(((dm.progress || 0) / (dm.targetCount || 15)) * 100));
                barEl.style.width = `${pct}%`;
            }
        } else {
            activeBox.style.display = 'none';
            selectBox.style.display = 'flex';
        }
    }

    // ==========================================
    // 2D TRAINING TAVERN & LEADERBOARD
    // ==========================================
    openTavernModal() {
        if (!this.tavernModal) return;
        document.exitPointerLock?.();
        const entEl = document.getElementById('tavern-entries-text');
        const entries = this.game?.player?.tavernEntries !== undefined ? this.game.player.tavernEntries : 5;
        if (entEl) {
            entEl.textContent = `${entries} / 5`;
            entEl.style.color = entries > 0 ? '#4ade80' : '#ef4444';
        }
        this.tavernModal.style.display = 'flex';
    }

    openLeaderboardModal(tab = 'floor') {
        if (!this.leaderboardModal) return;
        document.exitPointerLock?.();
        this.activeLeaderboardTab = tab;
        ['floor', 'mini', 'common'].forEach(t => {
            const btn = document.getElementById(`lb-tab-${t}`);
            if (btn) btn.classList.toggle('active', t === tab);
        });
        const tbody = document.getElementById('leaderboard-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:22px; color:#94a3b8;">Loading Supabase Tavern Rankings...</td></tr>';
        }
        if (this.game && this.game.socket) {
            this.game.socket.emit('getTavernLeaderboard');
        }
        this.leaderboardModal.style.display = 'flex';
    }

    renderLeaderboard(tab = 'floor') {
        this.openLeaderboardModal(tab);
    }

    renderLeaderboardData(rows) {
        const tbody = document.getElementById('leaderboard-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!Array.isArray(rows) || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:22px; color:#94a3b8;">No Tavern Speedruns recorded yet in Supabase!</td></tr>';
            return;
        }

        const classLogos = {
            'Blademaster': '🗡️', 'Berserker': '⚔️', 'Healer': '🌿',
            'Summoner': '🔮', 'Ice Master': '❄️', 'Sniper': '🎯',
            'Explosives Expert': '💣', 'Phantom Striker': '🌘',
            'Ninja Assassin': '⚡', 'Tech Genius': '🤖', 'Novice': '🛡️'
        };

        const catLabels = {
            'floor_boss': '👑 Floor Boss',
            'mini_boss': '⭐ Mini Boss',
            'common_mobs': '👾 Common'
        };

        const myName = (this.game && this.game.player && this.game.player.name) || '';

        rows.forEach((r, idx) => {
            const tr = document.createElement('tr');
            const isRank1 = idx === 0;
            const isRank2 = idx === 1;
            const isRank3 = idx === 2;
            const isTop3 = idx < 3;
            const rankClass = isRank1 ? 'rank-1-name' : (isRank2 ? 'rank-2-name' : (isRank3 ? 'rank-3-name' : ''));
            const rankMedal = isRank1 ? '🥇 1' : (isRank2 ? '🥈 2' : (isRank3 ? '🥉 3' : `${idx + 1}`));
            const rankColor = isRank1 ? '#ffd700' : (isRank2 ? '#e2e8f0' : (isRank3 ? '#cd7f32' : '#94a3b8'));
            const pName = r.character_name || r.name || 'Hero';
            const isSelf = myName && (pName === myName);
            const pClass = r.player_class || r.playerClass || 'Novice';
            const icon = classLogos[pClass] || '🛡️';
            const pLvl = r.player_level || r.level || 1;
            const mobLvl = r.mob_level || 1;
            const oppStr = `${catLabels[r.mob_type] || 'Boss'} (Lv.${mobLvl})`;

            const rawVal = Number(r.time_taken !== undefined ? r.time_taken : (r.timeMs / 1000 || 0));
            const sec = (rawVal > 500) ? (rawVal / 1000) : rawVal;
            const mins = Math.floor(sec / 60);
            const remainSec = (sec % 60).toFixed(2);
            const timeFormatted = mins > 0 ? `${mins}m ${remainSec}s` : `${remainSec}s`;

            tr.style.borderBottom = '1px solid rgba(51,65,85,0.6)';
            if (isSelf) {
                tr.style.background = 'rgba(0, 229, 255, 0.15)';
            }
            tr.innerHTML = `
                <td style="padding:7px 8px; font-weight:900; color:${rankColor};">${rankMedal}</td>
                <td style="padding:7px 8px; font-weight:800;">
                    <span class="${rankClass}" style="${isSelf && !rankClass ? 'color:#00e5ff;' : ''}">${pName}</span>
                    <span style="font-size:0.75rem; color:#ffd700; font-weight:normal; margin-left:4px;">Lv.${pLvl}</span>
                </td>
                <td style="padding:7px 8px; color:#4ade80;">${icon} ${pClass}</td>
                <td style="padding:7px 8px; color:#fbbf24; font-weight:700;">${oppStr}</td>
                <td style="padding:7px 8px; text-align:right; font-family:var(--font-pixel); color:${isTop3 ? '#fde047' : '#38bdf8'}; font-weight:900;">${timeFormatted}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // ==========================================
    // 🤝 FRIENDS SYSTEM (HOTKEY 'F')
    // ==========================================
    openFriendsModal() {
        this.closeMobileMenu();
        if (!this.friendsModal) return;
        document.exitPointerLock?.();
        this.friendsModal.style.display = 'flex';
        if (this.game && this.game.socket) {
            this.game.socket.emit('getFriendsList');
        }
    }

    closeFriendsModal() {
        if (this.friendsModal) this.friendsModal.style.display = 'none';
    }

    toggleFriendsModal() {
        if (!this.friendsModal) return;
        if (this.friendsModal.style.display === 'flex') {
            this.closeFriendsModal();
        } else {
            this.openFriendsModal();
        }
    }

    renderFriendsList(friendsList) {
        const container = document.getElementById('friends-list-container');
        if (!container) return;
        container.innerHTML = '';

        if (!Array.isArray(friendsList) || friendsList.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8; font-size:0.85rem; text-align:center; padding:20px; margin:0;">Your friends list is empty. Add friends by name above!</p>';
            return;
        }

        const classLogos = {
            'Blademaster': '🗡️', 'Berserker': '⚔️', 'Healer': '🌿',
            'Summoner': '🔮', 'Ice Master': '❄️', 'Sniper': '🎯',
            'Explosives Expert': '💣', 'Phantom Striker': '🌘',
            'Ninja Assassin': '⚡', 'Tech Genius': '🤖', 'Novice': '🛡️'
        };

        friendsList.forEach(f => {
            const row = document.createElement('div');
            row.className = 'friend-item-row';
            const isOnline = !!f.online;
            const pClass = f.pClass || 'Novice';
            const icon = classLogos[pClass] || '🛡️';
            const mapStr = isOnline ? `[${f.mapId || 'Town'}]` : '(Offline)';

            row.innerHTML = `
                <div class="friend-meta-left">
                    <div class="friend-status-dot ${isOnline ? 'online' : 'offline'}" title="${isOnline ? 'Online' : 'Offline'}"></div>
                    <div class="friend-name-col">
                        <span class="friend-name-text">${f.id} <span style="font-size:0.75rem; color:#ffd700; font-weight:normal;">Lv.${f.level || 1}</span></span>
                        <span class="friend-sub-text">${icon} ${pClass} • ${mapStr}</span>
                    </div>
                </div>
                <div class="friend-actions-right">
                    ${isOnline ? `<button type="button" class="friend-act-btn friend-party-btn" onclick="window.game && window.game.inviteParty('${f.id}')">Party</button>` : ''}
                    <button type="button" class="friend-act-btn friend-remove-btn" onclick="window.game && window.game.removeFriend('${f.id}')">Remove</button>
                </div>
            `;
            container.appendChild(row);
        });
    }

    // ==========================================
    // ⚔️ PARTY SYSTEM (PROMPT & HUD)
    // ==========================================
    showPartyInvitePrompt(data) {
        if (!data || !this.partyInvitePrompt) return;
        this.pendingPartyInviteFrom = data.fromId || data.from || 'Adventurer';
        const txt = document.getElementById('party-invite-text');
        if (txt) txt.textContent = `${this.pendingPartyInviteFrom} has invited you to join their party!`;
        this.partyInvitePrompt.style.display = 'block';
    }

    closePartyInvitePrompt() {
        if (this.partyInvitePrompt) this.partyInvitePrompt.style.display = 'none';
        this.pendingPartyInviteFrom = null;
    }

    respondPartyInvite(accept) {
        if (this.pendingPartyInviteFrom && this.game && this.game.socket) {
            this.game.socket.emit('partyInviteResponse', { fromId: this.pendingPartyInviteFrom, accept });
        }
        this.closePartyInvitePrompt();
    }

    leaveParty() {
        if (this.game && this.game.socket) {
            this.game.socket.emit('leaveParty');
        }
        this.updatePartyHUD(null);
    }

    updatePartyHUD(partyData) {
        const hud = this.partyHud || document.getElementById('party-hud');
        const list = this.partyMembersList || document.getElementById('party-members-list');
        const title = document.getElementById('party-hud-title');
        if (!hud || !list) return;

        if (!partyData || !Array.isArray(partyData.members) || partyData.members.length <= 1) {
            hud.style.display = 'none';
            list.innerHTML = '';
            return;
        }

        hud.style.display = 'block';
        if (title) title.textContent = `⚔️ Party (${partyData.members.length}/4)`;
        list.innerHTML = '';

        const classLogos = {
            'Blademaster': '🗡️', 'Berserker': '⚔️', 'Healer': '🌿',
            'Summoner': '🔮', 'Ice Master': '❄️', 'Sniper': '🎯',
            'Explosives Expert': '💣', 'Phantom Striker': '🌘',
            'Ninja Assassin': '⚡', 'Tech Genius': '🤖', 'Novice': '🛡️'
        };

        const myName = (this.game && this.game.player && this.game.player.name) || '';

        partyData.members.forEach(m => {
            const card = document.createElement('div');
            card.className = 'party-member-card';

            const isLeader = partyData.leaderId === m.id;
            const isMe = m.name === myName || m.id === myName;
            const pClass = m.playerClass || 'Novice';
            const icon = classLogos[pClass] || '🛡️';

            const maxHp = Number(m.maxHp) || 100;
            const curHp = (typeof m.currentHp === 'number') ? m.currentHp : maxHp;
            const hpPct = Math.max(0, Math.min(100, Math.round((curHp / maxHp) * 100)));
            const isGhost = !!m.isGhost;
            const barBg = isGhost ? '#64748b' : (hpPct < 30 ? '#ef4444' : '#22c55e');

            card.innerHTML = `
                <div class="party-member-row">
                    <span class="party-member-name" style="color:${isMe ? '#38bdf8' : '#f8fafc'};">
                        ${isLeader ? '<span class="party-member-leader" title="Party Leader">👑</span>' : ''}
                        ${m.name || m.id}
                        <span style="font-size:0.68rem; color:#ffd700; font-weight:normal;">Lv.${m.level || 1}</span>
                        ${isGhost ? '<span style="color:#ef4444; font-size:0.65rem;">(DEAD)</span>' : ''}
                    </span>
                    <span class="party-member-class">${icon} ${pClass}</span>
                </div>
                <div class="party-hp-bar">
                    <div class="party-hp-fill" style="width:${hpPct}%; background:${barBg};"></div>
                </div>
            `;
            list.appendChild(card);
        });
    }

    // ==========================================
    // 2D DUNGEON DIFFICULTY & MAZE GUIDE MODALS
    // ==========================================
    openDungeonModal(targetMapId, label = 'Crystal Dungeon') {
        if (!this.dungeonModal) return;
        document.exitPointerLock?.();
        this.pendingDungeonMapId = targetMapId;
        const titleEl = document.getElementById('dungeon-modal-title');
        if (titleEl) titleEl.textContent = `🗝️ ${label} — Select Difficulty`;
        const entEl = document.getElementById('dungeon-entries-text');
        const entries = this.game?.player?.dungeonEntries !== undefined ? this.game.player.dungeonEntries : 7;
        if (entEl) {
            entEl.textContent = `${entries} / 7`;
            entEl.style.color = entries > 0 ? '#4ade80' : '#ef4444';
        }
        this.dungeonModal.style.display = 'flex';
    }

    openHauntedHouseModal() {
        if (!this.hauntedHouseModal) {
            this.hauntedHouseModal = document.getElementById('haunted-house-modal');
        }
        if (!this.hauntedHouseModal) return;
        document.exitPointerLock?.();

        // 2D Solo-only check
        if (this.game && this.game.partyMembers && this.game.partyMembers.length > 0) {
            this.showToast('👻 The Haunted House is a solo challenge. Please leave your party.');
            return;
        }

        this.hauntedHouseModal.style.display = 'flex';
    }

    showHauntedHouseClear() {
        const vText = document.createElement('div');
        vText.innerHTML = `
            <h1 style="font-size:70px; margin:0; text-shadow:0 0 35px #E040FB, 0 0 70px #9c27b0, 4px 4px 0 #000; letter-spacing: 6px; font-weight:900; animation: pulseText 1s infinite alternate; font-family:'Cinzel Decorative', 'Cinzel', serif;">HOUSE CLEAR!</h1>
        `;
        vText.style.position = 'fixed';
        vText.style.top = '40%';
        vText.style.left = '50%';
        vText.style.transform = 'translate(-50%, -50%)';
        vText.style.textAlign = 'center';
        vText.style.color = '#E040FB';
        vText.style.zIndex = '9999';
        vText.style.pointerEvents = 'none';
        document.body.appendChild(vText);
        setTimeout(() => {
            if (vText.parentNode) vText.parentNode.removeChild(vText);
        }, 4000);
    }

    // (Old duplicate removed in favor of authentic 2D openMazeGuide)

    updateFloorBossTimer(remainingMs, customLabel = null) {
        const el = document.getElementById('floor-boss-timer-ui');
        const valEl = document.getElementById('floor-boss-timer-val');
        const lblEl = document.getElementById('floor-boss-timer-lbl');
        if (!el || !valEl) return;
        if (remainingMs <= 0) {
            el.style.display = 'none';
            return;
        }
        el.style.display = 'inline-flex';
        if (lblEl) {
            lblEl.textContent = customLabel || 'Floor Boss Respawns in:';
        }
        const hrs = Math.floor(remainingMs / 3600000);
        const mins = Math.floor((remainingMs % 3600000) / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        let timeStr = '';
        if (hrs > 0) timeStr += `${hrs}h `;
        timeStr += `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
        valEl.textContent = timeStr;
    }

    // ==========================================
    // WORLD ANNOUNCEMENTS & TAVERN SPEEDRUN TIMER
    // ==========================================
    showWorldAnnouncement(messageHtml, borderColor = '#ffd700', broadcast = true) {
        if (this.lootBroadcastEl) {
            this.lootBroadcastEl.innerHTML = messageHtml;
            this.lootBroadcastEl.style.borderColor = borderColor;
            this.lootBroadcastEl.style.display = 'block';
            clearTimeout(this.broadcastTimer);
            this.broadcastTimer = setTimeout(() => {
                if (this.lootBroadcastEl) this.lootBroadcastEl.style.display = 'none';
            }, 5500);
        }

        // Mirror to World Chat tab
        if (this.game && this.game.appendChatLine) {
            this.game.appendChatLine('world', `📢 ${messageHtml}`);
            if (this.game.activeChatTab !== 'world') {
                const dot = document.getElementById('world-unread-dot');
                if (dot) dot.style.display = 'inline-block';
            }
        }

        // Broadcast to other players via socket
        if (broadcast && this.game?.socket?.connected) {
            this.game.socket.emit('broadcastWorldAnnouncement', { html: messageHtml, color: borderColor });
        }
    }

    updateTavernTimer(elapsedSec, visible = true) {
        if (!this.tavernTimerEl) return;
        if (!visible) {
            this.tavernTimerEl.style.display = 'none';
            return;
        }
        this.tavernTimerEl.style.display = 'inline-block';
        const mins = Math.floor(elapsedSec / 60);
        const secs = (elapsedSec % 60).toFixed(2).padStart(5, '0');
        this.tavernTimerEl.textContent = `⏱️ ${String(mins).padStart(2, '0')}:${secs}`;
    }

    showDeathScreen(hasRevivalJuice = false) {
        if (!this.deathScreen) return;
        document.exitPointerLock?.();
        const btnRevive = document.getElementById('btn-death-revive');
        if (btnRevive) {
            btnRevive.style.display = hasRevivalJuice ? 'inline-flex' : 'none';
        }
        this.deathScreen.style.display = 'flex';
    }

    hideDeathScreen() {
        if (this.deathScreen) {
            this.deathScreen.style.display = 'none';
        }
    }

    renderSkills() {
        const player = this.game.player;
        if (!player) return;

        const pClass = player.baseStats?.playerClass || null;
        const selArea = document.getElementById('class-selection-area');
        const activeArea = document.getElementById('active-class-area');
        const promptEl = document.getElementById('class-selection-prompt');
        const classGrid = document.getElementById('available-classes-grid');

        if (!pClass || !CLASSES[pClass]) {
            // Player has not chosen a class yet!
            selArea.style.display = 'block';
            activeArea.style.display = 'none';
            classGrid.innerHTML = '';

            const wpnType = this.game.getEquippedWeaponType();

            if (!wpnType) {
                promptEl.innerHTML = `<p style="color:#f43f5e; font-weight:800; font-size:1.05rem; text-align:center;">
                    ⚠️ Equip a weapon from your Bag (B) to view available classes.
                </p>`;
                return;
            }

            promptEl.innerHTML = `<p style="color:#38bdf8; font-size:1.0rem; text-align:center;">
                Equipped Weapon: <strong>${wpnType.toUpperCase()}</strong>. Choose your permanent class path:
            </p>`;

            for (const cName in CLASSES) {
                const cData = CLASSES[cName];
                if (cData.weapon === wpnType) {
                    const card = document.createElement('div');
                    card.className = 'skill-class-card';
                    card.innerHTML = `
                        <h3><span style="color:${this.getAuraHex(cData.aura)};">●</span> ${cName}</h3>
                        <div class="skill-class-card-desc">Weapon Specialization: <strong>${wpnType.charAt(0).toUpperCase() + wpnType.slice(1)}</strong></div>
                        <div style="font-size:0.8rem; color:#cbd5e1; margin-top:4px;">
                            ${cData.skills.map(s => `• <strong>${s.name}</strong> (${s.type === 'active' ? 'Active' : 'Passive'})`).join('<br>')}
                        </div>
                        <button class="btn-item-action" style="margin-top:8px; background:#f59e0b; color:#000; font-weight:900;">
                            AWAKEN AS ${cName.toUpperCase()} ⚔️
                        </button>
                    `;
                    card.onclick = () => {
                        this.promptChooseClass(cName);
                    };
                    classGrid.appendChild(card);
                }
            }
        } else {
            // Player already chose a class: Show 4 class skills!
            selArea.style.display = 'none';
            activeArea.style.display = 'block';

            document.getElementById('active-class-name').textContent = pClass;
            const auraEl = document.getElementById('active-class-aura');
            if (auraEl) {
                auraEl.textContent = `${CLASSES[pClass].aura.toUpperCase()} AURA`;
                auraEl.style.borderColor = this.getAuraHex(CLASSES[pClass].aura);
                auraEl.style.color = this.getAuraHex(CLASSES[pClass].aura);
            }
            document.getElementById('active-class-weapon').textContent = CLASSES[pClass].weapon.toUpperCase();

            const skillsList = document.getElementById('class-skills-list');
            skillsList.innerHTML = '';

            CLASSES[pClass].skills.forEach(s => {
                const unlocked = player.level >= s.unlock;
                const statusColor = unlocked ? '#22c55e' : '#f43f5e';

                const row = document.createElement('div');
                row.className = 'skill-row';
                row.innerHTML = `
                    <div class="skill-row-left">
                        <div class="skill-title-row">
                            <span class="skill-name-badge" style="color:${statusColor};">${s.name}</span>
                            <span class="skill-type-tag" style="background:${s.type === 'active' ? 'rgba(56,189,248,0.2)' : 'rgba(168,85,247,0.2)'}; color:${s.type === 'active' ? '#38bdf8' : '#c084fc'};">
                                ${s.type.toUpperCase()}
                            </span>
                        </div>
                        <div class="skill-desc-text">${s.desc}</div>
                    </div>
                    <div class="skill-row-right">
                        <div class="skill-unlock-tag" style="color:${statusColor};">Lv.${s.unlock}</div>
                        ${s.cd ? `<div class="skill-cd-tag">${s.cd / 1000}s CD</div>` : ''}
                    </div>
                `;
                skillsList.appendChild(row);
            });
        }
    }

    getAuraHex(aura) {
        const colors = {
            red: '#ef4444',
            blue: '#3b82f6',
            green: '#22c55e',
            white: '#f8fafc',
            orange: '#f97316',
            lightning: '#eab308'
        };
        return colors[aura] || '#38bdf8';
    }

    promptChooseClass(className) {
        this.pendingClassToChoose = className;
        const msgEl = document.getElementById('confirm-modal-msg');
        if (msgEl) {
            msgEl.innerHTML = `Are you sure you want to awaken as a <strong>${className}</strong>?<br><br><span style="color:#f59e0b; font-weight:800;">This choice is permanent!</span>`;
        }
        if (this.confirmModal) this.confirmModal.style.display = 'flex';
    }

    // Render 2D Minimap
    renderMinimap(playerPos, playerRotY, monsters, portals) {
        if (!this.minimapCtx) return;
        const ctx = this.minimapCtx;
        const w = 110, h = 110;
        const cx = w / 2, cy = h / 2;
        const mapBound = this.game?.world?.mapBound || 128;
        const scale = Math.max(0.36, Math.min(1.35, 50 / mapBound)); // Auto-scales for 15x Town & 10x Maze!

        ctx.clearRect(0, 0, w, h);

        // Circular clip
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, 52, 0, Math.PI * 2);
        ctx.clip();

        // Background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let x = 0; x <= w; x += 20) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, x); ctx.lineTo(w, x); ctx.stroke();
        }

        // Draw Portals (Cyan dots)
        if (portals) {
            ctx.fillStyle = '#00e5ff';
            for (const p of portals) {
                const mx = cx + (p.x - playerPos.x) * scale;
                const my = cy + (p.z - playerPos.z) * scale;
                ctx.beginPath();
                ctx.arc(mx, my, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw Monsters (Red / Yellow dots)
        if (monsters) {
            for (const m of monsters) {
                if (!m.isAlive) continue;
                const mx = cx + (m.group.position.x - playerPos.x) * scale;
                const my = cy + (m.group.position.z - playerPos.z) * scale;
                ctx.fillStyle = m.category === 'floor_boss' ? '#ffd600' : '#f43f5e';
                const r = m.category === 'floor_boss' ? 5 : 3;
                ctx.beginPath();
                ctx.arc(mx, my, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Draw Player in Center (Green Arrow pointing forward)
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-playerRotY);

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        ctx.restore();
    }

    // ==========================================
    // 📬 SYSTEM MAILBOX UI (2D EXONIE REPLICATED)
    // ==========================================
    toggleMailbox() {
        this.closeMobileMenu();
        const modal = document.getElementById('mailbox-modal');
        if (!modal) return;
        const isHidden = modal.style.display === 'none' || !modal.style.display;
        if (isHidden) {
            document.exitPointerLock?.();
            modal.style.display = 'flex';
            if (this.game?.socket && this.game.socket.connected) {
                this.game.socket.emit('getMail');
            }
        } else {
            modal.style.display = 'none';
        }
    }

    renderMailList(mails) {
        const container = document.getElementById('mail-list-container');
        if (!container) return;
        container.innerHTML = '';

        const badge = document.getElementById('hud-mail-badge');
        const count = Array.isArray(mails) ? mails.length : 0;
        if (badge) {
            badge.innerText = count;
            badge.style.display = count > 0 ? 'block' : 'none';
        }
        const mBadge = document.getElementById('mobile-mail-badge');
        if (mBadge) {
            mBadge.innerText = count;
            mBadge.style.display = count > 0 ? 'flex' : 'none';
        }

        if (count === 0) {
            container.innerHTML = '<p style="text-align:center; color:#64748b; font-size:0.9rem; padding:20px;">No messages in your mailbox.</p>';
            return;
        }

        mails.forEach(mail => {
            const card = document.createElement('div');
            card.className = 'mail-card';
            card.id = 'mail-item-' + mail.id;
            card.style.cssText = 'background:rgba(30,41,59,0.7); border:1px solid #334155; border-radius:8px; padding:12px; display:flex; flex-direction:column; gap:8px; text-align:left;';

            let lootHtml = '';
            if (mail.attached_item) {
                const item = mail.attached_item;
                const qty = item.quantity && item.quantity > 1 ? ('x' + item.quantity + ' ') : '';
                const rColor = item.color || '#ffd700';
                lootHtml = `
                    <div style="background:rgba(15,23,42,0.8); border:1px dashed ${rColor}; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="color:#94a3b8; font-size:0.75rem;">Attached Reward:</span><br>
                            <strong style="color:${rColor}; font-size:0.95rem;">${qty}${item.name}</strong>
                        </div>
                        <button class="btn" style="background:#0284c7; color:#fff; border:none; padding:6px 14px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="window.claimMail('${mail.id}')">Claim</button>
                    </div>
                `;
            }

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="color:#ffd700; font-weight:bold; font-size:0.95rem;">👑 System Mail</span>
                    <span style="color:#64748b; font-size:0.75rem;">${mail.created_at ? new Date(mail.created_at).toLocaleDateString() : 'Recent'}</span>
                </div>
                <div style="color:#e2e8f0; font-size:0.85rem; line-height:1.5;">${mail.message_text || 'System Notification'}</div>
                ${lootHtml}
            `;
            container.appendChild(card);
        });
    }

    onMailClaimed(mailId) {
        const itemEl = document.getElementById('mail-item-' + mailId);
        if (itemEl) itemEl.remove();
        const container = document.getElementById('mail-list-container');
        if (container && container.children.length === 0) {
            container.innerHTML = '<p style="text-align:center; color:#64748b; font-size:0.9rem; padding:20px;">No messages in your mailbox.</p>';
        }
        const badge = document.getElementById('hud-mail-badge');
        if (badge) {
            const cur = parseInt(badge.innerText, 10) || 1;
            const next = Math.max(0, cur - 1);
            badge.innerText = next;
            badge.style.display = next > 0 ? 'block' : 'none';
        }
        const mBadge = document.getElementById('mobile-mail-badge');
        if (mBadge) {
            const cur = parseInt(mBadge.innerText, 10) || 1;
            const next = Math.max(0, cur - 1);
            mBadge.innerText = next;
            mBadge.style.display = next > 0 ? 'flex' : 'none';
        }
        this.showToast('🎁 Reward claimed successfully to your inventory!');
    }

        // ==========================================
    // 💎 CASH SHOP (EXO EMPORIUM) UI METHODS (STEAM IAP REPLICATED)
    // ==========================================
    toggleCashShop() {
        this.closeMobileMenu();
        if (!this.cashShopModal) this.cashShopModal = document.getElementById('cash-shop-modal');
        if (!this.cashShopModal) return;

        const isHidden = this.cashShopModal.style.display === 'none' || !this.cashShopModal.style.display;
        if (isHidden) {
            document.exitPointerLock?.();
            window.openRealMoneyShop();
        } else {
            this.cashShopModal.style.display = 'none';
        }
    }

    renderCashShop(category = 'all') {
        this.currentShopCategory = category;
        const grid = document.getElementById('cash-shop-items-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const catalog = CASH_SHOP_ITEMS || [];
        const filtered = catalog.filter(it => {
            if (category === 'all') return true;
            if (category === 'pet') return it.type === 'pet';
            if (category === 'aura') return it.type === 'aura';
            if (category === 'utility') return ['material', 'potion', 'ticket'].includes(it.type);
            return true;
        });

        if (filtered.length === 0) {
            grid.innerHTML = `<p style="color:#94a3b8; font-size:0.85rem; text-align:center; padding:20px; grid-column:1/-1;">No items in this category.</p>`;
            return;
        }

        const currentGems = this.game?.player?.baseStats?.exoGems || 0;
        const balEl = document.getElementById('ui-gem-balance');
        if (balEl) balEl.innerText = currentGems;

        filtered.forEach(it => {
            const card = document.createElement('div');
            card.className = 'cash-shop-card';
            card.style.cssText = 'background:#1a102a; border:1px solid rgba(224,64,251,0.25); border-radius:8px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:8px; transition:border 0.2s;';
            const icon = this.getItemIcon(it.type, it.sprite);
            const rColor = it.color || '#e040fb';

            let tag = '';
            if (it.isSeasonal) tag = ' <span style="font-size:11px; color:#ffd700;">🐰 (Seasonal)</span>';
            else if (it.id === 'aura_divine') tag = ' <span style="font-size:11px; color:#ffea00; font-weight:bold;">👑 (Royal $75)</span>';

            card.innerHTML = `
                <div class="cash-shop-card-header" style="display:flex; gap:10px; align-items:center;">
                    <div class="cash-shop-icon-box" style="width:44px; height:44px; background:#11081f; border:1.5px solid ${rColor}; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:20px; box-shadow:0 0 10px ${rColor}33;">
                        ${icon}
                    </div>
                    <div class="cash-shop-info" style="flex:1;">
                        <div class="cash-shop-name" style="color:${rColor}; font-weight:bold; font-size:0.95rem;">${it.name}${tag}</div>
                        <span class="cash-shop-badge" style="background:${rColor}22; color:${rColor}; border:1px solid ${rColor}44; font-size:0.75rem; padding:1px 6px; border-radius:4px; font-weight:600;">${it.rarity || it.type.toUpperCase()}</span>
                    </div>
                </div>
                <div class="cash-shop-desc" style="color:#94a3b8; font-size:0.8rem; line-height:1.4;">${it.desc || 'Exclusive cosmetic / utility item.'}</div>
                <div class="cash-shop-footer" style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:4px;">
                    <button class="btn" style="background:#1e1e38; color:#38bdf8; border:1px solid #38bdf8; padding:6px 10px; border-radius:6px; font-size:0.85rem; font-weight:bold; cursor:pointer;" onclick="window.openCosmeticPreview('${it.type}', '${it.id}', '${it.name}', '${it.desc}')" title="Preview item">👁️ Preview</button>
                    <button class="btn" style="background:linear-gradient(45deg, #9c27b0, #e040fb); color:#fff; border:none; padding:7px 12px; border-radius:6px; font-size:0.85rem; font-weight:bold; cursor:pointer; flex:1; box-shadow:0 0 8px rgba(224,64,251,0.4);" onclick="window.buyWithGems('${it.id}', '${it.name}', ${it.priceGems})">💎 Buy for ${it.priceGems} Gems</button>
                </div>
            `;

            grid.appendChild(card);
        });
    }

    // ==========================================
    // 🔄 TRADE UI METHODS (2D EXONIE REPLICATED)
    // ==========================================
    showTradeDialog(fromName) {
        if (!this.tradeDialog) this.tradeDialog = document.getElementById('trade-dialog');
        if (!this.tradeDialog) return;
        document.exitPointerLock?.();

        const textEl = document.getElementById('trade-dialog-text');
        if (textEl) textEl.innerHTML = `🤝 <strong>${fromName}</strong> wants to trade with you!`;
        this.tradeDialog.style.display = 'flex';
        this.pendingTradeFrom = fromName;
    }

    hideTradeDialog() {
        if (this.tradeDialog) this.tradeDialog.style.display = 'none';
        this.pendingTradeFrom = null;
    }

    openTradeModal(targetName) {
        this.isTradeOpen = true;
        this.hideTradeDialog();
        if (!this.tradeScreen) this.tradeScreen = document.getElementById('trade-screen');
        if (!this.tradeScreen) return;
        document.exitPointerLock?.();

        const targetEl = document.getElementById('trade-target-name');
        if (targetEl) targetEl.textContent = targetName;

        const myGoldInp = document.getElementById('trade-my-gold');
        if (myGoldInp) myGoldInp.value = 0;

        const theirGoldEl = document.getElementById('trade-their-gold');
        if (theirGoldEl) theirGoldEl.textContent = '0';

        const statusEl = document.getElementById('trade-status-indicator');
        if (statusEl) {
            statusEl.textContent = 'Waiting for offers...';
            statusEl.style.color = '#94a3b8';
        }

        const confirmBtn = document.getElementById('btn-trade-confirm');
        if (confirmBtn) {
            confirmBtn.textContent = 'Confirm Trade';
            confirmBtn.style.background = '#0284c7';
        }

        this.tradeScreen.style.display = 'flex';
        document.body.classList.add('trade-mode-active');

        // Auto open inventory bag side-by-side for smooth trading experience
        if (this.inventoryModal && this.inventoryModal.style.display !== 'flex') {
            this.toggleInventory();
        }

        this.renderTradeSlots();
    }

    closeTradeModal() {
        this.isTradeOpen = false;
        document.body.classList.remove('trade-mode-active');
        if (this.tradeScreen) this.tradeScreen.style.display = 'none';
        this.renderInventory();
    }

    renderTradeSlots() {
        // My Offer Slots (3 Slots)
        const myGrid = document.getElementById('trade-my-items');
        if (myGrid && this.game) {
            myGrid.innerHTML = '';
            for (let i = 0; i < 3; i++) {
                const item = this.game.myTradeItems ? this.game.myTradeItems[i] : null;
                const slotEl = document.createElement('div');
                slotEl.className = `trade-slot-card ${item ? 'filled' : ''}`;

                if (item) {
                    slotEl.innerHTML = `
                        <div class="trade-slot-icon">${this.getItemIcon(item.type, item.sprite)}</div>
                        <div class="trade-slot-name" style="color:${item.color || '#fff'}">${item.name}</div>
                    `;
                    slotEl.title = 'Click to remove from trade';
                    slotEl.onclick = () => {
                        this.game.removeTradeItemAt(i);
                        this.renderTradeSlots();
                        this.renderInventory();
                    };
                } else {
                    slotEl.innerHTML = `<span style="font-size:0.72rem; color:#475569;">+ Item ${i + 1}</span>`;
                    slotEl.title = 'Click an item in your bag to offer';
                }
                myGrid.appendChild(slotEl);
            }
        }

        // Their Offer Slots (3 Slots)
        const theirGrid = document.getElementById('trade-their-items');
        if (theirGrid && this.game) {
            theirGrid.innerHTML = '';
            for (let i = 0; i < 3; i++) {
                const item = this.game.theirTradeItems ? this.game.theirTradeItems[i] : null;
                const slotEl = document.createElement('div');
                slotEl.className = `trade-slot-card ${item ? 'filled' : ''}`;

                if (item) {
                    slotEl.innerHTML = `
                        <div class="trade-slot-icon">${this.getItemIcon(item.type, item.sprite)}</div>
                        <div class="trade-slot-name" style="color:${item.color || '#fff'}">${item.name}</div>
                    `;
                    slotEl.onmouseenter = (e) => this.showTooltip(item, e);
                    slotEl.onmousemove = (e) => this.showTooltip(item, e);
                    slotEl.onmouseleave = () => this.hideTooltip();
                } else {
                    slotEl.innerHTML = `<span style="font-size:0.72rem; color:#475569;">Empty</span>`;
                }
                theirGrid.appendChild(slotEl);
            }
        }
    }

    updateTradeRemoteOffer(gold, items) {
        const theirGoldEl = document.getElementById('trade-their-gold');
        if (theirGoldEl) theirGoldEl.textContent = Number(gold || 0).toLocaleString();
        this.renderTradeSlots();
    }

    setTradeConfirmState(meConfirmed, otherConfirmed) {
        const confirmBtn = document.getElementById('btn-trade-confirm');
        const statusEl = document.getElementById('trade-status-indicator');

        if (confirmBtn) {
            if (meConfirmed) {
                confirmBtn.textContent = 'Waiting for Other Player...';
                confirmBtn.style.background = '#eab308';
            } else {
                confirmBtn.textContent = 'Confirm Trade';
                confirmBtn.style.background = '#0284c7';
            }
        }

        if (statusEl) {
            if (meConfirmed && otherConfirmed) {
                statusEl.textContent = '✅ Both players confirmed! Finalizing...';
                statusEl.style.color = '#4ade80';
            } else if (meConfirmed) {
                statusEl.textContent = '⏳ Waiting for other player to confirm...';
                statusEl.style.color = '#fbbf24';
            } else if (otherConfirmed) {
                statusEl.textContent = '⚡ Other player has confirmed their offer!';
                statusEl.style.color = '#38bdf8';
            } else {
                statusEl.textContent = 'Reviewing trade offers...';
                statusEl.style.color = '#94a3b8';
            }
        }
    }
}

// ============================================================
// TOWN MARKETPLACE SYSTEM (AUTHENTIC 2D EXONIE INTEGRATION)
// Tabs: Wandering Shop, Auction House, Divine Forge, Consumables, Cosmetics
// ============================================================

window.switchMarketTab = function(tabId) {
    const tabs = ['shop', 'ah', 'forge', 'craft', 'pets'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const view = document.getElementById(`market-view-${t}`);
        if (btn) {
            if (t === tabId) btn.classList.add('active');
            else btn.classList.remove('active');
        }
        if (view) {
            view.style.display = (t === tabId) ? 'flex' : 'none';
        }
    });

    if (tabId === 'ah') {
        window.switchAhSubtab('browse');
    } else if (tabId === 'forge') {
        window.populateForgeSelect();
        window.updateForgeMaterialCheck();
    } else if (tabId === 'pets') {
        window.updatePetsCraftCheck();
    }
};

window.switchAhSubtab = function(subId) {
    const subtabs = ['browse', 'my', 'list'];
    subtabs.forEach(s => {
        const btn = document.getElementById(`ah-subtab-${s}-btn`);
        const sec = document.getElementById(`ah-subtab-${s}`);
        if (btn) {
            if (s === subId) btn.classList.add('active');
            else btn.classList.remove('active');
        }
        if (sec) {
            sec.style.display = (s === subId) ? 'flex' : 'none';
        }
    });

    const socket = window.game?.socket;
    if (subId === 'browse') {
        const query = document.getElementById('ah-search-input')?.value || '';
        if (socket?.connected) socket.emit('ah_search', query);
    } else if (subId === 'my') {
        if (socket?.connected) socket.emit('ah_getMyAuctions');
    } else if (subId === 'list') {
        window.populateAhListSelect();
    }
};

window.ahSearch = function(query) {
    const socket = window.game?.socket;
    if (socket?.connected) {
        socket.emit('ah_search', String(query || '').trim());
    }
};

window.populateAhListSelect = function() {
    const sel = document.getElementById('ah-list-item-select');
    if (!sel) return;
    sel.innerHTML = '';
    const inv = window.game?.player?.inventory || [];
    let found = false;

    inv.forEach((item, idx) => {
        if (!item) return;
        // Rules from 2D: do not auction normal pets/auras or bound enhanced Godly/Divine
        if (item.type === 'aura' && !item.isSeasonal) return;
        if ((item.rarity === 'Godly' || item.rarity === 'Divine') && item.enhanceLevel > 0) return;

        found = true;
        const opt = document.createElement('option');
        opt.value = idx;
        const qtyStr = (item.quantity && item.quantity > 1) ? ` (x${item.quantity})` : '';
        opt.textContent = `[${item.rarity || 'Common'}] ${item.name}${qtyStr} — Slot ${idx + 1}`;
        sel.appendChild(opt);
    });

    if (!found) {
        const opt = document.createElement('option');
        opt.value = -1;
        opt.textContent = 'No tradeable items in inventory';
        sel.appendChild(opt);
    }
};

window.ahList = function() {
    const sel = document.getElementById('ah-list-item-select');
    const priceInput = document.getElementById('ah-list-price');
    const invIdx = parseInt(sel?.value, 10);
    const price = parseInt(priceInput?.value, 10);

    if (isNaN(invIdx) || invIdx < 0) {
        alert('Please select an item from your bag to list.');
        return;
    }
    if (isNaN(price) || price < 1) {
        alert('Please specify a valid asking price greater than 0.');
        return;
    }

    const socket = window.game?.socket;
    if (socket?.connected) {
        socket.emit('ah_list', { invIndex: invIdx, price: price });
    } else {
        alert('Not connected to game server.');
    }
};

window.ahBuy = function(auctionId, price, itemName) {
    const currentGold = window.game?.player?.gold || 0;
    const cost = Number(price) || 0;
    if (currentGold < cost) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showNotEnoughGoldModal(cost, currentGold, `Auction Listing: ${itemName}`);
        return;
    }
    if (!confirm(`Buy ${itemName} for ${Number(price).toLocaleString()} Gold?`)) return;
    const socket = window.game?.socket;
    if (socket?.connected) {
        socket.emit('ah_buy', { auctionId: auctionId });
    } else {
        alert('Not connected to game server.');
    }
};

window.ahCancel = function(auctionId) {
    if (!confirm(`Cancel this listing? The item will be returned to your bag.`)) return;
    const socket = window.game?.socket;
    if (socket?.connected) {
        socket.emit('ah_cancel', { auctionId: auctionId });
    } else {
        alert('Not connected to game server.');
    }
};

// ==========================================
// DIVINE FORGE (AUTHENTIC 2D BLACKSMITH ASCENSION)
// ==========================================

window.populateForgeSelect = function() {
    const sel = document.getElementById('forge-godly-select');
    if (!sel) return;
    sel.innerHTML = '';
    const player = window.game?.player;
    if (!player) return;

    let candidates = [];
    if (player.equips?.weapon && player.equips.weapon.rarity === 'Godly') {
        candidates.push({ loc: 'equip', slot: 'weapon', item: player.equips.weapon });
    }
    if (player.equips?.armor && player.equips.armor.rarity === 'Godly') {
        candidates.push({ loc: 'equip', slot: 'armor', item: player.equips.armor });
    }
    (player.inventory || []).forEach((item, idx) => {
        if (item && item.rarity === 'Godly' && ['weapon', 'armor', 'leggings'].includes(item.type)) {
            candidates.push({ loc: 'inv', slot: idx, item: item });
        }
    });

    if (candidates.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No Godly equipment found in bag or equipped';
        sel.appendChild(opt);
    } else {
        candidates.forEach((c) => {
            const opt = document.createElement('option');
            opt.value = JSON.stringify({ loc: c.loc, slot: c.slot });
            const locName = c.loc === 'equip' ? `[Equipped ${c.slot.toUpperCase()}]` : `[Bag Slot ${c.slot + 1}]`;
            opt.textContent = `${locName} ${c.item.name} (Lv.${c.item.level || 1})`;
            sel.appendChild(opt);
        });
    }
};

window.updateForgeMaterialCheck = function() {
    const player = window.game?.player;
    if (!player) return;

    let countEssence = 0, countRed = 0, countGreen = 0, countBlue = 0;
    (player.inventory || []).forEach(i => {
        if (!i || !i.name) return;
        const n = String(i.name).trim();
        const qty = Number(i.quantity) || 1;
        if (n.includes('Divine Essence')) countEssence += qty;
        if (n.includes('Red Exo Metal')) countRed += qty;
        if (n.includes('Green Exo Metal')) countGreen += qty;
        if (n.includes('Blue Exo Metal')) countBlue += qty;
    });

    const sel = document.getElementById('forge-godly-select');
    let isWeapon = true;
    try {
        const parsed = JSON.parse(sel?.value || '{}');
        if (parsed.loc === 'equip') isWeapon = parsed.slot === 'weapon';
        else if (parsed.loc === 'inv') {
            const itm = player.inventory[parsed.slot];
            isWeapon = itm?.type === 'weapon';
        }
    } catch(e) {}

    const reqGold = isWeapon ? 3000000 : 1000000;
    const reqEssence = isWeapon ? 3 : 1;

    const elEss = document.getElementById('forge-chk-essence');
    if (elEss) {
        elEss.textContent = `(${countEssence}/${reqEssence})`;
        elEss.style.color = countEssence >= reqEssence ? '#22c55e' : '#ef4444';
    }

    const elRed = document.getElementById('forge-chk-red');
    if (elRed) {
        elRed.textContent = `(${countRed}/1)`;
        elRed.style.color = countRed >= 1 ? '#22c55e' : '#ef4444';
    }

    const elGrn = document.getElementById('forge-chk-green');
    if (elGrn) {
        elGrn.textContent = `(${countGreen}/1)`;
        elGrn.style.color = countGreen >= 1 ? '#22c55e' : '#ef4444';
    }

    const elBlu = document.getElementById('forge-chk-blue');
    if (elBlu) {
        elBlu.textContent = `(${countBlue}/1)`;
        elBlu.style.color = countBlue >= 1 ? '#22c55e' : '#ef4444';
    }

    const reqGoldEl = document.getElementById('forge-req-gold');
    if (reqGoldEl) reqGoldEl.textContent = `${reqGold.toLocaleString()} G`;

    const elGold = document.getElementById('forge-chk-gold');
    if (elGold) {
        const hasGold = (player.gold || 0) >= reqGold;
        elGold.textContent = hasGold ? `(${player.gold.toLocaleString()} G Available)` : `(Insufficient: ${player.gold.toLocaleString()} G)`;
        elGold.style.color = hasGold ? '#22c55e' : '#ef4444';
    }
};

window.attemptDivineForge = function() {
    const game = window.game;
    const player = game?.player;
    if (!player) return;

    const sel = document.getElementById('forge-godly-select');
    if (!sel || !sel.value) {
        alert('Please select a Godly equipment piece to ascend.');
        return;
    }

    let targetInfo;
    try {
        targetInfo = JSON.parse(sel.value);
    } catch(e) {
        alert('Invalid item selection.');
        return;
    }

    let targetItem = null;
    if (targetInfo.loc === 'equip') {
        targetItem = player.equips[targetInfo.slot];
    } else if (targetInfo.loc === 'inv') {
        targetItem = player.inventory[targetInfo.slot];
    }

    if (!targetItem || targetItem.rarity !== 'Godly') {
        alert('You need a Godly equipment base to ascend to Divine.');
        return;
    }

    const isWeapon = targetItem.type === 'weapon';
    const reqGold = isWeapon ? 3000000 : 1000000;
    const reqEssence = isWeapon ? 3 : 1;

    let countEssence = 0, countRed = 0, countGreen = 0, countBlue = 0;
    (player.inventory || []).forEach(i => {
        if (!i || !i.name) return;
        const n = String(i.name).trim();
        const qty = Number(i.quantity) || 1;
        if (n.includes('Divine Essence')) countEssence += qty;
        if (n.includes('Red Exo Metal')) countRed += qty;
        if (n.includes('Green Exo Metal')) countGreen += qty;
        if (n.includes('Blue Exo Metal')) countBlue += qty;
    });

    if (countEssence < reqEssence || countRed < 1 || countGreen < 1 || countBlue < 1) {
        alert(`You need ${reqEssence}x Divine Essence, and 1x Red, Green, and Blue Exo Metals.`);
        return;
    }

    if ((player.gold || 0) < reqGold) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showNotEnoughGoldModal(reqGold, player.gold || 0, 'Divine Forge Ascension');
        return;
    }

    // Deduct Materials
    const deduct = (namePart, amount) => {
        let needed = amount;
        for (let i = 0; i < player.inventory.length; i++) {
            if (needed <= 0) break;
            const it = player.inventory[i];
            if (it && it.name && String(it.name).includes(namePart)) {
                const q = it.quantity || 1;
                if (q > needed) {
                    it.quantity -= needed;
                    needed = 0;
                } else {
                    needed -= q;
                    player.inventory[i] = null;
                }
            }
        }
    };

    deduct('Divine Essence', reqEssence);
    deduct('Red Exo Metal', 1);
    deduct('Green Exo Metal', 1);
    deduct('Blue Exo Metal', 1);
    player.gold -= reqGold;

    // Transform to Divine
    targetItem.rarity = 'Divine';
    targetItem.color = '#ffea00';
    targetItem.name = targetItem.name.replace('Godly', 'Divine');
    if (!targetItem.name.includes('Divine')) targetItem.name = `Divine ${targetItem.name}`;
    targetItem.enhanceLevel = 0;

    if (targetItem.fixedStat) {
        for (const k in targetItem.fixedStat) {
            targetItem.fixedStat[k] = Math.floor(targetItem.fixedStat[k] * 2);
        }
    }

    game.audio?.playSfx('lightning');
    game.engine?.addScreenshake(1.2);
    game.engine?.spawnLevelUpVFX(player.pos);
    game.combat?.spawnFloatingDamage(player.pos, '✨ DIVINE ASCENSION COMPLETE! ✨', true, true);

    game.ui?.showWorldAnnouncement(
        `⚡ <strong style="color:#00e5ff;">[DIVINE FORGE] ${player.name}</strong> has ascended <strong style="color:#ffd700;">[Divine] ${targetItem.name}</strong>!`,
        '#ffd700'
    );

    game.recalculateStats();
    game.ui?.updatePlayerHUD(player);
    game.ui?.renderInventory();
    game.saveCharacterToAccountSlot();

    if (game.socket?.connected) {
        game.socket.emit('requestCraftDivine', { baseIndex: targetInfo.loc === 'inv' ? targetInfo.slot : -1 });
    }

    window.populateForgeSelect();
    window.updateForgeMaterialCheck();
};

// ==========================================
// CONSUMABLES & COSMETICS CRAFTING
// ==========================================

window.craftStatForger = function() {
    const game = window.game;
    const player = game?.player;
    if (!player) return;

    if ((player.gold || 0) < 300000) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showNotEnoughGoldModal(300000, player.gold || 0, 'Unique Stat Forger Crafting');
        return;
    }

    const freeSlot = player.inventory.findIndex(i => i === null);
    if (freeSlot === -1) {
        alert('Your bag is full! Free up a slot first.');
        return;
    }

    player.gold -= 300000;
    player.inventory[freeSlot] = {
        id: `forger_${Date.now()}`,
        name: 'Unique Stat Forger',
        type: 'material',
        rarity: 'Unique',
        color: '#c084fc',
        desc: 'Reforges random sub-stats (STR / INT) on equipment of matching rarity.',
        quantity: 1
    };

    game.audio?.playSfx('splash');
    game.ui?.showToast('🧪 Successfully crafted 1x Unique Stat Forger!');
    game.ui?.updatePlayerHUD(player);
    game.ui?.renderInventory();
    game.saveCharacterToAccountSlot();
};

window.updatePetsCraftCheck = function() {
    const player = window.game?.player;
    if (!player) return;
    let soulCount = 0;
    (player.inventory || []).forEach(i => {
        if (i && (i.name === 'Soul Piece' || i.name === 'Divine ID Piece')) {
            soulCount += (i.quantity || 1);
        }
    });
    const el = document.getElementById('pets-soul-count');
    if (el) {
        el.textContent = soulCount;
        el.style.color = soulCount >= 10 ? '#4ade80' : '#f472b6';
    }
};

window.craftVoidPet = function() {
    const game = window.game;
    const player = game?.player;
    if (!player) return;

    let soulCount = 0;
    (player.inventory || []).forEach(i => {
        if (i && (i.name === 'Soul Piece' || i.name === 'Divine ID Piece')) {
            soulCount += (i.quantity || 1);
        }
    });

    if (soulCount < 10) {
        alert(`You need 10 Soul Pieces to craft the Void Pet (Current: ${soulCount}/10). Defeat the Wraith King in the Haunted House!`);
        return;
    }

    const freeSlot = player.inventory.findIndex(i => i === null);
    if (freeSlot === -1) {
        alert('Your bag is full! Free up a slot first.');
        return;
    }

    let needed = 10;
    for (let i = 0; i < player.inventory.length; i++) {
        if (needed <= 0) break;
        const it = player.inventory[i];
        if (it && (it.name === 'Soul Piece' || it.name === 'Divine ID Piece')) {
            const q = it.quantity || 1;
            if (q > needed) {
                it.quantity -= needed;
                needed = 0;
            } else {
                needed -= q;
                player.inventory[i] = null;
            }
        }
    }

    player.inventory[freeSlot] = {
        id: `void_pet_${Date.now()}`,
        name: 'Void Pet',
        type: 'aura',
        aura: 'void',
        rarity: 'Godly',
        color: '#e040fb',
        desc: 'A floating spectral void companion that channels dark energy beside you.',
        quantity: 1
    };

    game.audio?.playSfx('lightning');
    game.engine?.spawnGroundShockwave(player.pos, 0x9c27b0, 5.0);
    game.ui?.showWorldAnnouncement(
        `👻 <strong style="color:#00e5ff;">${player.name}</strong> has awakened the mystical <strong style="color:#e040fb;">[Godly] Void Pet</strong>!`,
        '#e040fb'
    );

    game.ui?.updatePlayerHUD(player);
    game.ui?.renderInventory();
    game.saveCharacterToAccountSlot();
    window.updatePetsCraftCheck();
};

// ==========================================
// AUCTION HOUSE SOCKET LISTENERS
// ==========================================
setTimeout(() => {
    const socket = window.game?.socket;
    if (!socket) return;

    socket.on('ah_searchResults', (results) => {
        const grid = document.getElementById('ah-listings-grid');
        if (!grid) return;
        if (!Array.isArray(results) || results.length === 0) {
            grid.innerHTML = '<p style="color:#94a3b8; font-size:0.83rem; grid-column:span 2; text-align:center; padding:20px;">No items currently listed on the Auction House.</p>';
            return;
        }

        let html = '';
        results.forEach(r => {
            const it = r.item_data || {};
            const rCol = it.color || '#38bdf8';
            html += `
                <div style="background:#0f172a; border:1px solid #334155; border-radius:8px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:800; color:${rCol}; font-size:0.86rem;">${it.name || r.item_name}</div>
                        <div style="font-size:0.75rem; color:#94a3b8;">Seller: ${r.seller_name} | Price: <strong style="color:#ffd700;">${Number(r.price).toLocaleString()} G</strong></div>
                    </div>
                    <button class="btn-item-action" onclick="window.ahBuy('${r.id}', ${r.price}, '${(it.name || r.item_name).replace(/'/g, "\\'")}')" style="background:#22c55e; color:#000; font-weight:800; padding:6px 12px; font-size:0.78rem;">Buy</button>
                </div>
            `;
        });
        grid.innerHTML = html;
    });

    socket.on('ah_myAuctions', (data) => {
        const countEl = document.getElementById('ah-my-count');
        const grid = document.getElementById('ah-my-grid');
        if (countEl) countEl.textContent = data?.count || 0;
        if (!grid) return;

        const auctions = data?.auctions || [];
        if (auctions.length === 0) {
            grid.innerHTML = '<p style="color:#94a3b8; font-size:0.83rem; grid-column:span 2; text-align:center; padding:20px;">You have no active listings.</p>';
            return;
        }

        let html = '';
        auctions.forEach(r => {
            const it = r.item_data || {};
            const rCol = it.color || '#38bdf8';
            html += `
                <div style="background:#0f172a; border:1px solid #334155; border-radius:8px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:800; color:${rCol}; font-size:0.86rem;">${it.name || r.item_name}</div>
                        <div style="font-size:0.75rem; color:#ffd700; font-weight:800;">Price: ${Number(r.price).toLocaleString()} Gold</div>
                    </div>
                    <button class="btn-item-action" onclick="window.ahCancel('${r.id}')" style="background:#ef4444; color:#fff; font-weight:800; padding:6px 12px; font-size:0.78rem;">Cancel</button>
                </div>
            `;
        });
        grid.innerHTML = html;
    });

    socket.on('ah_listSuccess', () => {
        window.game?.ui?.showToast('✅ Item successfully listed on the Auction House!');
        window.switchAhSubtab('my');
    });
}, 1200);


// ==========================================
// 🗺️ MAZE GUIDE & GUILD WINDOW GLOBALS (100% 2D EXONIE REPLICATED)
// ==========================================
window.openMazeGuide = function() {
    const game = window.game;
    if (game && game.party && game.party.members && game.party.members.length > 1) {
        if (game.party.leader !== game.player?.name && game.party.leaderId !== game.socket?.id) {
            game.ui?.showToast("Only the Party Leader can use the Maze Guide.");
            return;
        }
    }

    const modal = document.getElementById('maze-guide-modal');
    const dialog = document.getElementById('maze-guide-dialog') || modal;
    if (!modal || !dialog) return;

    let html = '<h2 style="margin-top:0; color:#2196F3;">🗺️ Maze Guide</h2>';
    html += '<p style="font-size:12px; color:#aaa; margin-bottom:20px;">Choose your destination.</p>';
    html += '<button class="btn" style="width:100%; margin-bottom:10px; padding:12px; font-weight:bold; font-size:16px; background:#4CAF50; color:#fff; border:none; border-radius:6px; cursor:pointer;" onclick="window.openFastTravelUI()"> Fast Travel</button>';
    html += '<button class="btn" style="width:100%; margin-bottom:15px; padding:12px; font-weight:bold; font-size:16px; background:#9c27b0; color:#fff; border:none; border-radius:6px; cursor:pointer; box-shadow:0 0 10px #9c27b0;" onclick="window.openMazeTrialsUI()">Maze Trials</button>';
    html += '<button class="btn" style="background:#f44336; width:100%; padding:10px; font-weight:bold; color:#fff; border:none; border-radius:6px; cursor:pointer;" onclick="document.getElementById(\'maze-guide-modal\').style.display=\'none\'">Close</button>';

    dialog.innerHTML = html;
    modal.style.display = 'flex';
};

window.openFastTravelUI = function() {
    const game = window.game;
    let maxFloor = 0;
    const titleString = String(game?.player?.title || "").toUpperCase();
    const match = titleString.match(/(?:FLOOR CONQUEROR|FLOOR DOMINATOR|FLOOR MASTER)\s+(\d+)/);
    if (match) {
        maxFloor = parseInt(match[1], 10);
    }

    const modal = document.getElementById('maze-guide-modal');
    const dialog = document.getElementById('maze-guide-dialog') || modal;
    if (!dialog) return;

    if (maxFloor === 0) {
        game?.ui?.showToast("You haven't conquered any floors yet!");
        let html = '<h2 style="margin-top:0; color:#4CAF50;">🚀 Fast Travel</h2>';
        html += '<p style="font-size:13px; color:#f87171; margin:20px 0;">You haven\'t conquered any floors yet!</p>';
        html += '<button class="btn" style="background:#f44336; width:100%; padding:10px; font-weight:bold; color:#fff; border:none; border-radius:6px; cursor:pointer;" onclick="window.openMazeGuide()">Back</button>';
        dialog.innerHTML = html;
        modal.style.display = 'flex';
        return;
    }

    let html = '<h2 style="margin-top:0; color:#4CAF50;">🚀 Fast Travel</h2>';
    html += '<p style="font-size:12px; color:#aaa; margin-bottom:15px;">Select a conquered floor to fast-travel.</p>';
    html += '<div style="max-height:300px; overflow-y:auto; margin-bottom:15px; padding-right:5px;">';
    for (let i = 1; i <= maxFloor; i++) {
        html += `<button class="btn" style="width:100%; margin-bottom:6px; padding:10px; background:#4CAF50; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="window.requestMazeTeleport(${i})">Teleport to Floor ${i}</button>`;
    }
    html += '</div>';
    html += '<button class="btn" style="background:#f44336; width:100%; padding:10px; font-weight:bold; color:#fff; border:none; border-radius:6px; cursor:pointer;" onclick="window.openMazeGuide()">Back</button>';

    dialog.innerHTML = html;
    modal.style.display = 'flex';
};

window.openMazeTrialsUI = function() {
    const modal = document.getElementById('maze-guide-modal');
    const dialog = document.getElementById('maze-guide-dialog') || modal;
    if (!dialog) return;

    let html = '<h2 style="margin-top:0; color:#E040FB;">🛡️ Maze Trials</h2>';
    html += '<p style="font-size:12px; color:#aaa; margin-bottom:15px;">Challenge a Floor Boss in a private instance. 1 Entry per day.</p>';
    html += '<div style="max-height:300px; overflow-y:auto; margin-bottom:15px; padding-right:5px;">';
    for (let i = 1; i <= 7; i++) {
        html += `<button class="btn" style="width:100%; margin-bottom:6px; padding:10px; background:#9c27b0; color:#fff; border:none; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="window.requestMazeTrial(${i})">Trial: Floor ${i}</button>`;
    }
    html += '</div>';
    html += '<button class="btn" style="background:#f44336; width:100%; padding:10px; font-weight:bold; color:#fff; border:none; border-radius:6px; cursor:pointer;" onclick="window.openMazeGuide()">Back</button>';

    dialog.innerHTML = html;
    modal.style.display = 'flex';
};

window.requestMazeTrial = function(floorNum) {
    const game = window.game;
    const isSolo = !game?.party || !game.party.members || game.party.members.length <= 1;
    const isLowLevel = (game?.player?.level || 1) <= 45;

    if (isSolo && isLowLevel) {
        const modal = document.getElementById('maze-guide-modal');
        const dialog = document.getElementById('maze-guide-dialog') || modal;
        let html = '<h2 style="margin-top:0; color:#ff9800; text-shadow: 0 0 10px rgba(255,152,0,0.5);">Warning</h2>';
        html += '<div style="background:rgba(255,152,0,0.1); border:1px solid #ff9800; border-radius:6px; padding:15px; margin-bottom:20px; text-align:left;">';
        html += `<p style="font-size:14px; color:#ffcc80; line-height:1.6; margin:0;">The Maze Trial is <b style="color:#f44336;">extremely difficult</b> for solo players at your current level (<b style="color:#ffeb3b;">Lv.${game?.player?.level || 1}</b>).</p>`;
        html += '<p style="font-size:14px; color:#ffcc80; line-height:1.6; margin:10px 0 0 0;">You will most likely <b style="color:#f44336;">not be able to finish it</b>, wasting your <b style="color:#E040FB;">daily entry</b>.</p>';
        html += '</div>';
        html += '<p style="font-size:13px; color:#aaa; margin-bottom:15px;">Consider forming a party or leveling up first.</p>';
        html += '<div style="display:flex; gap:10px;">';
        html += '<button class="btn" style="flex:1; background:#f44336; color:#fff; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;" onclick="window.openMazeTrialsUI()">Go Back</button>';
        html += `<button class="btn" style="flex:1; background:#ff9800; color:#000; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;" onclick="window.confirmMazeTrial(${floorNum})">Enter Anyway</button>`;
        html += '</div>';
        dialog.innerHTML = html;
        modal.style.display = 'flex';
        return;
    }

    document.getElementById('maze-guide-modal').style.display = 'none';
    if (window.game?.socket) {
        window.game.socket.emit('requestMazeTrial', { targetFloor: floorNum });
    }
};

window.confirmMazeTrial = function(floorNum) {
    document.getElementById('maze-guide-modal').style.display = 'none';
    if (window.game?.socket) {
        window.game.socket.emit('requestMazeTrial', { targetFloor: floorNum });
    }
};

window.requestMazeTeleport = function(floorNum) {
    document.getElementById('maze-guide-modal').style.display = 'none';
    if (window.game?.socket) {
        window.game.socket.emit('requestMazeTeleport', { targetFloor: floorNum });
    }
};

window.createGuildPrompt = function() {
    const currentGold = window.game?.player?.gold || 0;
    const reqGold = 1000000;
    if (currentGold < reqGold) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showNotEnoughGoldModal(reqGold, currentGold, 'Guild Establishment');
        return;
    }
    const name = prompt("Enter a name for your new Guild (3-15 chars):");
    if (name && name.trim().length >= 3 && name.trim().length <= 15) {
        window.game?.socket?.emit('createGuild', name.trim());
    } else if (name) {
        alert("Guild name must be between 3 and 15 characters.");
    }
};

window.applyToGuild = function(gName) {
    window.game?.socket?.emit('guildApply', gName);
    window.game?.ui?.showToast(`Application sent to ${gName}...`);
};

window.donateGuildPrompt = function() {
    const currentGold = window.game?.player?.gold || 0;
    const charName = window.game?.player?.name || 'Your character';
    if (currentGold <= 0) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showNotEnoughGoldModal(1, 0, 'Guild Donation');
        return;
    }
    const amtStr = prompt(`How much Gold would you like to donate to Guild Funds?\n\nAvailable Personal Gold (${charName}): ${currentGold.toLocaleString()} G`);
    if (amtStr === null) return;
    const parsed = parseInt(amtStr.replace(/,/g, '').trim(), 10);
    if (isNaN(parsed) || parsed <= 0) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showToast('⚠️ Please enter a valid positive Gold amount to donate.');
        return;
    }
    if (parsed > currentGold) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showToast(`⚠️ Insufficient Gold! ${charName} only has ${currentGold.toLocaleString()} G.`);
        window.game?.ui?.showNotEnoughGoldModal(parsed, currentGold, 'Guild Donation');
        return;
    }
    window.game?.socket?.emit('donateGuildGold', parsed);
};

window.guildLevelUpConfirm = function() {
    const data = window.game?.ui?.lastGuildData;
    const currentLevel = data?.guildLevel || 0;
    const guildGold = data?.guildGold || 0;
    if (currentLevel >= 10) {
        window.game?.ui?.showToast('🌟 Your guild is already at max level (10)!');
        return;
    }
    const nextLvl = currentLevel + 1;
    const reqFunds = 1000000;
    if (guildGold < reqFunds) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showNotEnoughGoldModal(reqFunds, guildGold, `Guild Level Up to Lv.${nextLvl} (Guild Funds)`);
        return;
    }
    if (confirm(`Level up the Guild to Level ${nextLvl} for 1,000,000 Guild Funds?\n\nAvailable Guild Funds: ${guildGold.toLocaleString()} G\nNext Level Perks:\n• +${nextLvl * 2}% All Combat Stats (+${nextLvl * 2}% to HP, ATK, MAG, DEF)\n• +${nextLvl * 2}% Bonus Monster & Boss EXP\n• ${20 + (nextLvl * 5)} Max Guild Members`)) {
        window.game?.socket?.emit('requestGuildLevelUp');
    }
};

window.guildLeaveConfirm = function() {
    if (confirm("Are you sure you want to leave the guild?")) {
        window.game?.socket?.emit('guildLeave');
    }
};

window.guildInvitePrompt = function() {
    const pName = prompt("Enter character name to invite to your guild:");
    if (pName && pName.trim()) {
        window.game?.socket?.emit('guildInvitePlayer', pName.trim());
    }
};

window.guildKickMember = function(mName) {
    if (confirm(`Kick ${mName} from the guild?`)) {
        window.game?.socket?.emit('guildKick', mName);
    }
};

// 🏡 Authentic 2D Exonie Private Residence (Home) Purchase
window.openHomeSaleUI = function() {
    window.game?.ui?.openHomeSaleUI?.();
};

window.buyHome = function() {
    const charName = window.game?.player?.name || 'This character';
    const currentGold = window.game?.player?.gold || 0;
    const cost = 1000000;
    if (currentGold < cost) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showToast(`⚠️ ${charName} needs 1,000,000 Gold to purchase a Home! (Current: ${currentGold.toLocaleString()} G)`);
        window.game?.ui?.showNotEnoughGoldModal(cost, currentGold, 'Home Deed Purchase');
        return;
    }
    const modal = document.getElementById('home-sale-modal');
    if (modal) {
        modal.innerHTML = `
            <div style="padding: 25px 10px;">
                <h3 style="color:#4CAF50; margin:0 0 10px 0;">🏡 Processing Deed Registration...</h3>
                <p style="color:#94a3b8; font-size:13px; margin:0;">Registering deed for <strong>${charName}</strong> with the Kingdom of Exonie...</p>
            </div>
        `;
    }
    window.game?.socket?.emit('requestBuyHome');
};

window.buyGuildBaseConfirm = function() {
    const guildGold = window.game?.ui?.lastGuildData?.guildGold || 0;
    const cost = 1000000;
    if (guildGold < cost) {
        window.game?.audio?.playSfx?.('bump');
        window.game?.ui?.showNotEnoughGoldModal(cost, guildGold, 'Guild Base Purchase (Guild Funds)');
        return;
    }
    if (confirm(`Spend 1,000,000 Guild Funds to purchase a Guild Base? (Available in Guild Funds: ${guildGold.toLocaleString()} G)\nOnly the Guild Master can purchase the Base.`)) {
        window.game?.socket?.emit('requestBuyGuildBase');
    }
};

window.enterGuildBase = function() {
    const modal = document.getElementById('guild-modal');
    if (modal) modal.style.display = 'none';
    if (window.game?.ui?.lastGuildData && !window.game.ui.lastGuildData.hasBase) {
        window.game?.ui?.showToast('⚠️ Your guild does not own a Guild Base yet!');
        return;
    }
    window.game?.loadMap('guildbase');
};

window.respondGuildInvite = function(accept) {
    const gModal = document.getElementById('guild-invite-dialog');
    if (gModal) gModal.style.display = 'none';
    if (accept && window._pendingGuildInvite) {
        window.game?.socket?.emit('joinGuild', window._pendingGuildInvite);
    }
    window._pendingGuildInvite = null;
};

// ==========================================
// 💳 PLATFORM IAP ROUTER (STEAM / GOOGLE PLAY — 100% 2D EXONIE COPY-PASTE)
// ==========================================
window.currentPlatform = 'web';
// 🛡️ THE FIX: Safer Electron & Capacitor/Cordova detection that bypasses Context Isolation limits
if (navigator.userAgent.toLowerCase().includes(' electron/') || (typeof process !== 'undefined' && process.versions && process.versions.electron) || (window.electronAPI && window.electronAPI.getSteamId)) {
    window.currentPlatform = 'steam';
} else if (window.Capacitor || (window.cordova && window.cordova.plugins) || window.CdvPurchase) {
    window.currentPlatform = 'android';
}

function getShopServerUrl() {
    if (window.serverUrl) return window.serverUrl;
    if (window.ExonieFlow && typeof window.ExonieFlow.getActiveServerUrl === 'function') {
        return window.ExonieFlow.getActiveServerUrl();
    }
    return 'https://exonieonline.onrender.com';
}

function getActiveUsername() {
    const game = window.game;
    return game?.player?.name || game?.player?.character_name || game?.player?.id || 'Player';
}

function getActiveSocket() {
    return window.game?.socket || window.exonieSocket || window.socket || null;
}

window.customAlert = window.customAlert || function(msg) {
    alert(msg);
};

window.openRealMoneyShop = function() {
    const modal = document.getElementById('cash-shop-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.exitPointerLock?.();

    if (window.game?.ui) {
        window.game.ui.renderCashShop(window.game.ui.currentShopCategory || 'all');
    }

    const socket = getActiveSocket();
    if (socket && socket.connected) {
        socket.emit('requestShopAccess');
    }
};

window.buyWithGems = function(itemId, name, priceGems) {
    const game = window.game;
    const currentGems = game?.player?.baseStats?.exoGems || 0;

    if (currentGems < priceGems) {
        if (confirm(`❌ Not enough Exo Gems!\n\nYou have ${currentGems} Exo Gems, but ${name} costs ${priceGems} Exo Gems.\n\nWould you like to purchase more Exo Gems?`)) {
            const grid = document.getElementById('cash-shop-items-grid');
            if (grid) grid.scrollTop = grid.scrollHeight;
        }
        return;
    }

    if (confirm(`Spend ${priceGems} Exo Gems to purchase ${name}?`)) {
        const socket = getActiveSocket();
        if (socket && socket.connected) {
            socket.emit('requestGemPurchase', { itemId: itemId });
        } else {
            game?.ui?.showToast("⚠️ Not connected to server.");
        }
    }
};

window.verifySteamPurchase = async function(orderId) {
    const serverUrl = getShopServerUrl();
    const username = getActiveUsername();
    document.getElementById('steam-overlay-notice-modal')?.remove();

    const statusModal = document.createElement('div');
    statusModal.id = 'steam-overlay-notice-modal';
    statusModal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#111; border:2px solid #E040FB; padding:20px; z-index:99999; width:350px; max-width:90vw; border-radius:8px; box-shadow:0 0 30px #E040FB; color:white; text-align:center; font-family:sans-serif;';
    statusModal.innerHTML = '<h2 style="color:#4CAF50; margin-top: 20px;">Verifying Purchase...</h2><p style="color:#ccc; font-size:12px;">Checking with Steam servers...</p>';
    document.body.appendChild(statusModal);

    try {
        const res = await fetch(serverUrl + '/api/shop/finalize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId: orderId,
                username: username
            })
        });
        const data = await res.json();

        if (!data.success) {
            statusModal.remove();
            window.customAlert("Transaction failed or not yet authorized: " + (data.error || data.message));
            window.openRealMoneyShop();
        } else {
            // Success! The server will socket 'gemPurchaseSuccess' to update your balance.
            statusModal.innerHTML = `
                <h2 style="color:#4CAF50; margin-top: 20px;">Purchase Successful!</h2>
                <p style="color:#fff;">Your Exo Gems have been added.</p>
                <button class="btn" style="background:#555; color:#fff; width:100%; margin-top:15px; padding:10px; border:none; border-radius:6px; cursor:pointer;" onclick="document.getElementById('steam-overlay-notice-modal')?.remove(); window.openRealMoneyShop();">Back to Shop</button>
            `;
            const socket = getActiveSocket();
            if (socket && socket.connected) socket.emit('requestShopAccess');
        }
    } catch (err) {
        statusModal.remove();
        window.customAlert("Error verifying purchase: " + err.message);
        window.openRealMoneyShop();
    }
};

window.purchaseExoGems = async function(packageId, priceCents, description) {
    // Re-check runtime platform in case Cordova/Capacitor/Electron finished loading after script init
    if (navigator.userAgent.toLowerCase().includes(' electron/') || (typeof process !== 'undefined' && process.versions && process.versions.electron) || (window.electronAPI && window.electronAPI.getSteamId)) {
        window.currentPlatform = 'steam';
    } else if (window.Capacitor || (window.cordova && window.cordova.plugins) || window.CdvPurchase) {
        window.currentPlatform = 'android';
    }

    const serverUrl = getShopServerUrl();
    const username = getActiveUsername();
    const socket = getActiveSocket();

    document.getElementById('steam-overlay-notice-modal')?.remove();
    const statusModal = document.createElement('div');
    statusModal.id = 'steam-overlay-notice-modal';
    statusModal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:#111; border:2px solid #E040FB; padding:20px; z-index:99999; width:350px; max-width:90vw; border-radius:8px; box-shadow:0 0 30px #E040FB; color:white; text-align:center; font-family:sans-serif;';
    statusModal.innerHTML = '<h2 style="color:#E040FB; margin-top: 20px;">Connecting to Store...</h2>';
    document.body.appendChild(statusModal);

    const abortPurchase = (msg) => {
        statusModal.remove();
        window.customAlert(msg);
        if (socket && socket.connected) socket.emit('requestShopAccess');
    };

    if (window.currentPlatform === 'steam') {
        try {
            let steamId = null;

            if (window.electronAPI && window.electronAPI.getSteamId) {
                let raw = await window.electronAPI.getSteamId();
                if (raw) {
                    let cleaned = String(raw).replace(/\D/g, '');
                    if (cleaned.length >= 17 && cleaned.startsWith('7')) {
                        steamId = cleaned.substring(0, 17);
                    }
                }
            }

            if (!steamId) {
                return abortPurchase("Steam Error: Could not extract a valid 17-digit Steam ID.");
            }

            const response = await fetch(serverUrl + '/api/shop/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    steamId: steamId,
                    username: username,
                    itemId: packageId,
                    amountCents: priceCents,
                    itemDescription: description || "Exo Gems"
                })
            });
            const data = await response.json();

            if (data.success) {
                if (window.electronAPI && window.electronAPI.initiateSteamPurchase) {
                    window.electronAPI.initiateSteamPurchase(data.orderId);

                    // 🛡️ THE BULLETPROOF FALLBACK: Added a manual "Verify" button!
                    statusModal.innerHTML = `
                        <h2 style="color:#4CAF50; margin-top: 20px;">Please authorize in the Steam Overlay!</h2>
                        <p style="color:#ccc; font-size:12px; margin-bottom:15px;">Waiting for Steam...</p>
                        <button class="btn" style="background:#2196F3; color:#fff; border:none; border-radius:6px; width:100%; margin-bottom:10px; padding:10px; font-weight:bold; cursor:pointer;" onclick="window.verifySteamPurchase('${data.orderId}')">I Authorized the Purchase</button>
                        <button class="btn" style="background:#f44336; color:#fff; border:none; border-radius:6px; width:100%; padding:10px; cursor:pointer;" onclick="document.getElementById('steam-overlay-notice-modal')?.remove(); window.openRealMoneyShop();">Cancel</button>
                    `;
                } else {
                    abortPurchase("Overlay Error: initiateSteamPurchase missing from preload.js.");
                }
            } else {
                let errorMsg = data.error || data.message || JSON.stringify(data);
                abortPurchase("Store Init Failed: " + errorMsg);
            }
        } catch (err) {
            abortPurchase("Store Connection Error: " + err.message);
        }
    }
    else if (window.currentPlatform === 'android') {
        if (window.CdvPurchase) {
            try {
                const store = window.CdvPurchase.store;
                const product = store.get(packageId);

                if (!product) return abortPurchase("Error: The app could not find this product ID: " + packageId);

                if (product.canPurchase) {
                    const offer = product.getOffer ? product.getOffer() : null;
                    if (offer) {
                        offer.order().catch(err => abortPurchase("Order failed to open: " + err));
                    } else {
                        store.order(product.id).catch(err => abortPurchase("Order fallback failed: " + err));
                    }
                } else {
                    abortPurchase("Google Play says you cannot purchase this item right now.");
                }
            } catch (e) {
                abortPurchase("Plugin error: " + e.message);
            }
        } else {
            abortPurchase("Store plugin not loaded!");
        }
    }
    else {
        abortPurchase("In-App Purchases are only available via the Steam or Android versions of Exonie!");
    }
};

// 🛡️ ANTI-SOFT-LOCK & STEAM FINALIZATION
if (window.electronAPI && window.electronAPI.onMicroTxnAuthorizationResponse) {
    window.electronAPI.onMicroTxnAuthorizationResponse(async (authorized, orderId) => {
        let statusModal = document.getElementById('steam-overlay-notice-modal');

        // 1. User clicked "Cancel" in the overlay
        if (!authorized) {
            if (statusModal) statusModal.remove();
            window.game?.ui?.showToast("Purchase cancelled.");
            window.openRealMoneyShop();
            return;
        }

        // 2. 🛡️ THE FIX: User authorized the purchase! Tell the server to finalize it and give the gems.
        if (statusModal) {
            statusModal.innerHTML = '<h2 style="color:#4CAF50; margin-top: 20px;">Verifying Purchase...</h2><p style="color:#ccc; font-size:12px;">Do not close the game.</p>';
        }

        try {
            const serverUrl = getShopServerUrl();
            const username = getActiveUsername();
            const res = await fetch(serverUrl + '/api/shop/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    username: username
                })
            });
            const data = await res.json();

            if (!data.success) {
                if (statusModal) statusModal.remove();
                window.customAlert("Transaction failed: " + (data.error || data.message));
                window.openRealMoneyShop();
            } else {
                // Success! The server will socket 'gemPurchaseSuccess' to update your balance.
                if (statusModal) {
                    statusModal.innerHTML = `
                        <h2 style="color:#4CAF50; margin-top: 20px;">Purchase Successful!</h2>
                        <p style="color:#fff;">Your Exo Gems have been added.</p>
                        <button class="btn" style="background:#555; color:#fff; border:none; border-radius:6px; width:100%; margin-top:15px; padding:10px; cursor:pointer;" onclick="document.getElementById('steam-overlay-notice-modal')?.remove(); window.openRealMoneyShop();">Back to Shop</button>
                    `;
                }
                const socket = getActiveSocket();
                if (socket && socket.connected) socket.emit('requestShopAccess');
            }
        } catch (err) {
            if (statusModal) statusModal.remove();
            window.customAlert("Error verifying purchase: " + err.message);
            window.openRealMoneyShop();
        }
    });
}

// 📥 LISTENS FOR THE RECEIPT FROM THE WRAPPERS
window.addEventListener('StorePurchaseSuccess', async (event) => {
    const receiptData = event.detail;
    let statusModal = document.getElementById('steam-overlay-notice-modal');
    if (statusModal) {
        statusModal.innerHTML = '<h2 style="color:#4CAF50; margin-top: 20px;">Verifying Purchase...</h2>';
    }

    const serverUrl = getShopServerUrl();
    const username = getActiveUsername();
    const socket = getActiveSocket();

    if (window.currentPlatform === 'steam') {
        // Steam uses the new HTTP Finalize route
        try {
            const res = await fetch(serverUrl + '/api/shop/finalize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: receiptData.receiptToken, // Electron passes the order ID back here
                    username: username // Tell the server who gets the gems!
                })
            });
            const data = await res.json();
            if (!data.success) {
                if (statusModal) statusModal.remove();
                window.customAlert("Transaction failed: " + (data.error || data.message));
                window.openRealMoneyShop();
            }
            // Success logic is handled by the socket 'gemPurchaseSuccess' auto-updating the UI
        } catch (err) {
            if (statusModal) statusModal.remove();
            window.customAlert("Error verifying purchase: " + err.message);
            window.openRealMoneyShop();
        }
    } else if (socket) {
        // Android uses the original Socket verification safely!
        socket.emit('verifyStoreReceipt', {
            platform: window.currentPlatform,
            receipt: receiptData.receiptToken,
            packageId: receiptData.packageId,
            username: username
        });
    }
});

// ==========================================
// 💳 ANDROID STORE INITIALIZATION (2D EXONIE COPY-PASTE)
// ==========================================
document.addEventListener('deviceready', () => {
    window.currentPlatform = 'android';
    if (window.CdvPurchase) {
        const { store, ProductType, Platform } = window.CdvPurchase;

        store.register([{
            id: 'gem_pack_50',
            type: ProductType.CONSUMABLE,
            platform: Platform.GOOGLE_PLAY,
        }, {
            id: 'gem_pack_15',
            type: ProductType.CONSUMABLE,
            platform: Platform.GOOGLE_PLAY,
        }]);

        // When a purchase is successful, trigger the "Handshake" to the server
        store.when().approved((transaction) => {
            // 🛡️ CORDOVA V13 BULLETPROOF TOKEN FIX
            let correctPackageId = transaction.productId || (transaction.products && transaction.products.length > 0 ? transaction.products[0].id : "gem_pack_50");
            let correctToken = transaction.purchaseToken || (transaction.nativePurchase && transaction.nativePurchase.purchaseToken) || transaction.id || "test_token";

            window.dispatchEvent(new CustomEvent('StorePurchaseSuccess', {
                detail: {
                    receiptToken: correctToken,
                    packageId: correctPackageId
                }
            }));

            transaction.finish();
        });

        store.error((err) => {
            document.getElementById('steam-overlay-notice-modal')?.remove();
            window.customAlert("Google Play Error: " + err.message);
            window.openRealMoneyShop(); // Un-freeze the UI
        });

        store.initialize([Platform.GOOGLE_PLAY]);

        // 🛑 THE FIX: Force the app to fetch the products from Google Play!
        store.update();
    }
}, false);

// 👁️ COSMETIC PREVIEW ENGINE (3D REALTIME DEMONSTRATION)
window.openCosmeticPreview = function(type, cosmId, itemName, desc) {
    const existing = document.getElementById('cosmetic-preview-modal');
    if (existing) existing.remove();

    const game = window.game;
    const modal = document.createElement('div');
    modal.id = 'cosmetic-preview-modal';
    modal.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:linear-gradient(135deg, #0d0d1a 0%, #1a1a2e 50%, #16213e 100%); border:2px solid #4fc3f7; padding:20px 24px; z-index:99999; width:320px; border-radius:12px; box-shadow:0 0 40px rgba(79,195,247,0.4); color:white; text-align:center; font-family:sans-serif;';

    let previewBadge = type === 'aura' ? '✨ Aura' : (type === 'pet' ? '🐾 Pet Companion' : '💎 Utility');

    modal.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(79,195,247,0.3); padding-bottom:8px;">
            <h3 style="margin:0; color:#4fc3f7; font-size:1.1rem; text-shadow:0 0 10px rgba(79,195,247,0.5);">👁️ Cosmetic Preview</h3>
            <button onclick="document.getElementById('cosmetic-preview-modal').remove()" style="background:none; border:none; color:#888; font-size:20px; cursor:pointer; padding:0 5px; line-height:1;">&times;</button>
        </div>
        <div style="color:#e040fb; font-weight:bold; font-size:1.1rem; margin-bottom:4px; text-shadow:0 0 8px rgba(224,64,251,0.4);">${itemName}</div>
        <span style="display:inline-block; background:rgba(79,195,247,0.15); border:1px solid #4fc3f7; color:#4fc3f7; font-size:0.75rem; padding:2px 8px; border-radius:10px; margin-bottom:12px;">${previewBadge}</span>
        <div style="color:#cbd5e1; font-size:0.85rem; line-height:1.5; margin-bottom:18px; min-height:45px;">${desc || 'Preview this exclusive item.'}</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
            <button class="btn" style="background:#0284c7; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;" onclick="window.tryOnCosmetic('${type}', '${cosmId}', '${itemName}')">✨ Try On Character (8s)</button>
            <button class="btn" style="background:#334155; color:#fff; border:none; padding:8px; border-radius:6px; cursor:pointer;" onclick="document.getElementById('cosmetic-preview-modal').remove()">Close</button>
        </div>
    `;

    document.body.appendChild(modal);
};

window.tryOnCosmetic = function(type, cosmId, itemName) {
    const game = window.game;
    if (!game || !game.player || !game.player.char3D) return;

    const originalAura = game.player.equips?.aura?.id || null;
    const originalPet = game.player.equips?.pet?.id || null;

    if (type === 'aura') {
        game.player.char3D.setCosmeticAura(cosmId);
    } else if (type === 'pet') {
        game.player.char3D.setCosmeticPet(cosmId);
    }

    game.ui?.showToast(`✨ Trying on [${itemName}] on your 3D character for 8 seconds!`);

    setTimeout(() => {
        if (game.player?.char3D) {
            game.player.char3D.setCosmeticAura(originalAura);
            game.player.char3D.setCosmeticPet(originalPet);
        }
    }, 8000);
};

// Global Universal Gold Modal trigger
window.showNotEnoughGoldModal = function(required, current, actionName) {
    if (window.game?.ui?.showNotEnoughGoldModal) {
        window.game.ui.showNotEnoughGoldModal(required, current, actionName);
    } else {
        alert(`Not enough gold! You need ${Number(required || 0).toLocaleString()} G.`);
    }
};

// ============================================================
// EXONIE 3D REMASTERED - BULLETPROOF FLOW MANAGER
// Handles Splash Credits -> Login -> Character Creation -> Story Prologue -> Game
// ============================================================

window.ExonieFlow = {
    step: 'splash_studio', // 'splash_studio', 'splash_credits', 'auth', 'char_select', 'creation', 'prologue', 'game'
    accountName: '',
    accountEmail: '',
    activeSlotIndex: 0,
    charData: {
        name: 'Aria',
        gender: 'female',
        hairStyle: '1',
        hairColor: '#111111',
        skinColor: '#f5c6a5',
        className: null,
        playerClass: null,
        weaponType: null
    },
    dialogueIndex: 0,
    splashTimer: null,
    previewInitialized: false,
    typewriterTimer: null,
    isTyping: false,
    currentFullText: '',
    audioCtx: null,
    menuBgm: null,

    init() {
        console.log('🛡️ [EXONIE 3D] Flow Manager initialized');
        this.cacheDOM();
        this.bindEvents();
        this.initPwaAndMobile();
        window.showLoadingTransition = (title, subtitle, durationMs, onMidpoint) => {
            this.showLoadingTransition(title, subtitle, durationMs, onMidpoint);
        };
        this.startSplash();

        // Start establishing background server socket connection immediately on boot
        setTimeout(() => this.getSocket(), 50);

        // Fail-safe watchdog: Never let splash or loading screen trap the player on a black screen
        setTimeout(() => {
            const splash = document.getElementById('scr-splash');
            if (splash && splash.style.display !== 'none' && (this.step === 'splash_studio' || this.step === 'splash_credits')) {
                console.warn('⚠️ Splash watchdog: advancing to auth screen');
                this.skipSplash();
            }
        }, 7500);
    },

    // ============================================================
    // AUTHENTIC 2D LOGIN / MENU MUSIC (music/loginmenu.mp3)
    // ============================================================
    playMenuMusic() {
        if (this.step === 'game') return;
        try {
            if (window.game && window.game.audio && window.game.audio.currentBgm) {
                window.game.audio.currentBgm.pause();
                window.game.audio.currentBgm = null;
            }
            if (!this.menuBgm) {
                this.menuBgm = new Audio('music/loginmenu.mp3');
                this.menuBgm.loop = true;
                this.menuBgm.volume = 0.42;
            }
            if (this.menuBgm.paused) {
                this.menuBgm.play().catch(() => {});
            }
        } catch (e) {}
    },

    stopMenuMusic() {
        try {
            if (this.menuBgm) {
                this.menuBgm.pause();
                this.menuBgm.currentTime = 0;
            }
        } catch (e) {}
    },

    // ============================================================
    // GLOBAL LOADING / MAP TRANSITION SCREEN (2D PICTURE LOADINGSCREEN.PNG)
    // ============================================================
    showLoadingTransition(title = 'ENTERING EXONIE...', subtitle = 'Preparing 3D Realm...', durationMs = 1350, onMidpoint = null) {
        const screen = document.getElementById('loading-screen') || document.getElementById('map-transition-screen');
        const titleEl = document.getElementById('loading-screen-title') || document.getElementById('transition-title');
        const subEl = document.getElementById('loading-screen-subtitle') || document.getElementById('transition-subtitle');
        const fillEl = document.getElementById('loading-bar-fill') || document.getElementById('transition-bar-fill');

        if (!screen) {
            if (onMidpoint) onMidpoint();
            return;
        }

        const effectiveDuration = Math.max(1250, durationMs || 1350);
        if (titleEl) titleEl.textContent = title;
        if (subEl) subEl.textContent = subtitle;
        if (fillEl) {
            fillEl.style.transition = 'none';
            fillEl.style.width = '4%';
        }

        screen.style.display = 'flex';
        screen.classList.add('active');
        void screen.offsetWidth;
        if (fillEl) {
            fillEl.style.transition = `width ${Math.floor(effectiveDuration * 0.82)}ms cubic-bezier(0.22, 1, 0.36, 1)`;
            fillEl.style.width = '100%';
        }

        clearTimeout(this._loadingMidTimer);
        clearTimeout(this._loadingEndTimer);
        clearTimeout(this._loadingSafetyTimer);

        this._loadingMidTimer = setTimeout(() => {
            if (onMidpoint) onMidpoint();
        }, Math.floor(effectiveDuration * 0.46));

        this._loadingEndTimer = setTimeout(() => {
            screen.classList.remove('active');
            setTimeout(() => {
                if (!screen.classList.contains('active')) {
                    screen.style.display = 'none';
                }
            }, 340);
        }, effectiveDuration);

        // Ultimate fail-safe watchdog timer: Force-hide after effectiveDuration + 1000ms
        this._loadingSafetyTimer = setTimeout(() => {
            screen.classList.remove('active');
            screen.style.display = 'none';
        }, effectiveDuration + 1000);
    },

    // Synthesized RPG Dialogue Typing Sound Effect (Web Audio API)
    playTypingBlip(speaker = '') {
        try {
            if (!this.audioCtx) {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return;
                this.audioCtx = new AudioContextClass();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const now = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            if (speaker.includes('Whisper')) {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(340 + (Math.random() * 60 - 30), now);
            } else if (speaker.includes('Narrator')) {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440 + (Math.random() * 40 - 20), now);
            } else {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(560 + (Math.random() * 70 - 35), now);
            }

            const masterVol = (window.game && window.game.audio) ? window.game.audio.masterVolume : 0.7;
            const vol = Math.max(0.01, 0.045 * masterVol);
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.038);
        } catch (e) {
            // Ignore audio context restrictions if not yet interacted
        }
    },

    cacheDOM() {
        this.scrSplash = document.getElementById('scr-splash');
        this.splashStudio = document.getElementById('splash-studio');
        this.splashCredits = document.getElementById('splash-credits');

        this.scrAuth = document.getElementById('auth-screen');
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.inputEmail = document.getElementById('login-email') || document.getElementById('login-user');
        this.inputUser = this.inputEmail;
        this.inputPass = document.getElementById('login-pass');
        this.inputRegEmail = document.getElementById('reg-email') || document.getElementById('reg-user');
        this.inputRegPass = document.getElementById('reg-pass');

        this.scrCharSelect = document.getElementById('char-select-screen');
        this.charSlotsGrid = document.getElementById('char-slots-grid');
        this.charSelectAccountName = document.getElementById('char-select-account-name');

        this.scrCreation = document.getElementById('creation-screen');
        this.inputCharName = document.getElementById('input-char-name');

        this.scrPrologue = document.getElementById('prologue-screen');
        this.prologueBg = document.getElementById('prologue-bg');
        this.bedroomVfx = document.getElementById('prologue-bedroom-vfx');
        this.voidVfx = document.getElementById('prologue-void-vfx');
        this.prologueSpeaker = document.getElementById('prologue-speaker');
        this.prologueText = document.getElementById('prologue-text');
    },

    bindEvents() {
        // Start loginmenu.mp3 on first interaction while in menus
        const resumeMenuAudio = () => {
            if (this.step !== 'game') {
                this.playMenuMusic();
            }
        };
        window.addEventListener('click', resumeMenuAudio);
        window.addEventListener('keydown', resumeMenuAudio);
        window.addEventListener('touchstart', resumeMenuAudio);

        // Keyboard navigation for dialogue (Space/Enter) and Auth forms (Enter)
        window.addEventListener('keydown', (e) => {
            if (this.step === 'splash_studio' || this.step === 'splash_credits') {
                if (e.code === 'Space' || e.code === 'Enter') {
                    this.skipSplash();
                }
            } else if (this.step === 'prologue') {
                if (e.code === 'Space' || e.code === 'Enter') {
                    e.preventDefault();
                    this.advanceDialogue();
                }
            } else if (this.step === 'auth' && e.code === 'Enter') {
                const isRegOpen = this.registerForm && this.registerForm.style.display !== 'none';
                if (isRegOpen) {
                    this.attemptRegister();
                } else {
                    this.attemptLogin();
                }
            }
        });
    },

    // ============================================================
    // 1. CIRCUIT SIEGE INTRO CREDITS SPLASH SCREEN (100% IDENTICAL)
    // ============================================================
    hidePreGameChat() {
        this.hideAllGameUI();
    },

    hideAllGameUI() {
        const hud = document.getElementById('game-hud');
        if (hud) hud.style.display = 'none';
        const mobile = document.getElementById('mobile-controls');
        if (mobile) mobile.style.display = 'none';
        const crosshair = document.getElementById('crosshair-center');
        if (crosshair) crosshair.style.display = 'none';
        const hoverInd = document.getElementById('player-hover-indicator');
        if (hoverInd) hoverInd.style.display = 'none';
        const banner = document.getElementById('floor-cleared-banner');
        if (banner) banner.style.display = 'none';
        const toast = document.getElementById('system-toast');
        if (toast) toast.style.display = 'none';
        const chatBox = document.getElementById('persistent-chat-box');
        if (chatBox) {
            chatBox.classList.remove('in-game', 'mobile-open', 'chat-open');
            chatBox.classList.add('chat-closed');
            chatBox.style.setProperty('display', 'none', 'important');
        }
        const mobChatBtn = document.getElementById('btn-mobile-chat-toggle');
        if (mobChatBtn) mobChatBtn.style.display = 'none';
        const mobMenu = document.getElementById('mobile-menu-modal');
        if (mobMenu) mobMenu.style.display = 'none';
        const tip = document.getElementById('item-hover-tooltip');
        if (tip) tip.style.display = 'none';
        const chatInput = document.getElementById('chat-input-container');
        if (chatInput) {
            chatInput.classList.remove('in-game', 'open');
            chatInput.style.display = 'none';
        }
        document.querySelectorAll('.game-modal').forEach(m => { m.style.display = 'none'; });
        const ctxMenu = document.getElementById('player-interaction-menu');
        if (ctxMenu) ctxMenu.style.display = 'none';
        if (window.game) {
            window.game.hasEnteredWorld = false;
            window.game.clearHoveredPlayer?.();
        }
    },

    startSplash() {
        this.hidePreGameChat();
        if (!this.scrSplash) this.cacheDOM();
        this.step = 'splash_studio';
        if (this.scrSplash) {
            this.scrSplash.style.display = 'flex';
            this.scrSplash.classList.remove('hidden');
        }
        if (this.splashStudio) this.splashStudio.classList.add('show');
        if (this.splashCredits) this.splashCredits.classList.remove('show');

        clearTimeout(this.splashTimer);
        this.splashTimer = setTimeout(() => {
            this.showCredits();
        }, 2200);
    },

    showCredits() {
        this.hidePreGameChat();
        this.step = 'splash_credits';
        if (this.splashStudio) this.splashStudio.classList.remove('show');
        if (this.splashCredits) this.splashCredits.classList.add('show');

        clearTimeout(this.splashTimer);
        this.splashTimer = setTimeout(() => {
            this.skipSplash();
        }, 3200);
    },

    skipSplash() {
        clearTimeout(this.splashTimer);
        if (this.splashStudio) this.splashStudio.classList.remove('show');
        if (this.splashCredits) this.splashCredits.classList.remove('show');
        if (this.scrSplash) {
            this.scrSplash.classList.add('hidden');
            this.scrSplash.style.display = 'none';
        }
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
            loadingScreen.style.display = 'none';
        }
        this.showAuth();
    },

    // ============================================================
    // 2. 2D EXONIE LOGIN SCREEN
    // ============================================================
    showAuth() {
        this.hidePreGameChat();
        this.step = 'auth';
        if (!this.scrAuth) this.cacheDOM();
        if (this.scrSplash) {
            this.scrSplash.classList.add('hidden');
            this.scrSplash.style.display = 'none';
        }
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
            loadingScreen.style.display = 'none';
        }
        if (this.scrAuth) {
            this.scrAuth.style.display = 'flex';
            this.scrAuth.classList.remove('hidden');
        }
        this.playMenuMusic();
    },

    clearAuthErrors() {
        const lErr = document.getElementById('login-error-msg');
        if (lErr) { lErr.textContent = ''; lErr.style.display = 'none'; lErr.style.color = '#ef4444'; }
        const rErr = document.getElementById('reg-error-msg');
        if (rErr) { rErr.textContent = ''; rErr.style.display = 'none'; rErr.style.color = '#ef4444'; }
    },

    showAuthError(form, msg) {
        this.clearAuthErrors();
        const errEl = (form === 'register') ? document.getElementById('reg-error-msg') : document.getElementById('login-error-msg');
        if (errEl) {
            errEl.textContent = msg;
            errEl.style.display = 'block';
        }
    },

    switchAuth(mode) {
        this.clearAuthErrors();
        if (!this.loginForm || !this.registerForm) this.cacheDOM();
        if (mode === 'register') {
            this.loginForm.style.display = 'none';
            this.registerForm.style.display = 'block';
        } else {
            this.registerForm.style.display = 'none';
            this.loginForm.style.display = 'block';
        }
    },

    updateServerStatus(status, text) {
        ['', '-reg'].forEach(suffix => {
            const dot = document.getElementById(`server-status-dot${suffix}`);
            const txt = document.getElementById(`server-status-text${suffix}`);
            if (!dot || !txt) return;
            if (status === 'connected') {
                dot.style.background = '#22c55e';
                dot.style.boxShadow = '0 0 8px #22c55e';
                txt.textContent = text || 'Server Online';
                txt.style.color = '#4ade80';
            } else if (status === 'connecting') {
                dot.style.background = '#eab308';
                dot.style.boxShadow = '0 0 8px #eab308';
                txt.textContent = text || 'Connecting...';
                txt.style.color = '#fde047';
            } else {
                dot.style.background = '#ef4444';
                dot.style.boxShadow = '0 0 8px #ef4444';
                txt.textContent = text || 'Server Offline';
                txt.style.color = '#f87171';
            }
        });
    },

    isPackagedNativeApp() {
        if (typeof window === 'undefined') return false;
        const ua = (navigator.userAgent || '').toLowerCase();
        if (ua.includes(' electron/') || (typeof process !== 'undefined' && process.versions && process.versions.electron) || (window.electronAPI && window.electronAPI.getSteamId)) {
            return true;
        }
        if (window.Capacitor || ua.includes('capacitor') || (window.cordova && window.cordova.plugins) || window.CdvPurchase) {
            return true;
        }
        if (window.location && window.location.protocol === 'file:') {
            return true;
        }
        return false;
    },

    isLocalEnvironment() {
        if (typeof window === 'undefined' || !window.location) return false;
        if (this.isPackagedNativeApp()) return false;
        const host = window.location.hostname;
        const port = window.location.port;
        return (host === 'localhost' || host === '127.0.0.1') && (port === '3003' || port === '3000');
    },

    getServerCandidates() {
        const list = [];
        if (this.isPackagedNativeApp()) {
            // Packaged Steam (Electron) & Mobile (Capacitor/Android) always connect directly to Live Server
            list.push('https://exonieonline.onrender.com');
            window.serverUrl = 'https://exonieonline.onrender.com';
            return list;
        }
        if (typeof window !== 'undefined' && window.location) {
            const origin = window.location.origin;
            const host = window.location.hostname;
            const port = window.location.port;

            if (origin && origin.startsWith('http')) {
                if ((host === 'localhost' || host === '127.0.0.1') && (port === '3003' || port === '3000')) {
                    if (port === '3003') {
                        list.push(origin, 'http://localhost:3000', 'https://exonieonline.onrender.com');
                    } else {
                        list.push(origin, 'http://localhost:3003', 'https://exonieonline.onrender.com');
                    }
                } else if (host.includes('testexonie')) {
                    list.push('https://testexonie.onrender.com', 'https://exonieonline.onrender.com');
                } else {
                    // Running on live cloud host (Render, Custom Domain, etc.)
                    list.push('https://exonieonline.onrender.com');
                    if (origin && !list.includes(origin) && !host.includes('localhost')) {
                        list.unshift(origin);
                    }
                }
            } else {
                list.push('https://exonieonline.onrender.com');
            }
        } else {
            list.push('https://exonieonline.onrender.com');
        }
        window.serverUrl = list[0] || 'https://exonieonline.onrender.com';
        return list;
    },

    getActiveServerUrl() {
        const url = this._activeServerUrl || (this.getServerCandidates()[0] || 'https://exonieonline.onrender.com');
        window.serverUrl = url;
        return url;
    },

    getSocket() {
        if (window.exonieSocket && window.exonieSocket.connected) {
            this.setupSocketListeners(window.exonieSocket);
            return window.exonieSocket;
        }
        if (window.exonieSocket) {
            this.setupSocketListeners(window.exonieSocket);
            return window.exonieSocket;
        }

        if (typeof io !== 'undefined') {
            const isLocal = this.isLocalEnvironment();
            const candidates = this.getServerCandidates();
            let candidateIdx = 0;

            // Trigger instant HTTP warm-up ping for Render sleeping containers
            try {
                const pingUrl = isLocal ? '/api/ping' : (candidates[0] + '/api/ping');
                fetch(pingUrl).catch(() => {});
            } catch(e) {}

            const tryConnectCandidate = () => {
                if (candidateIdx >= candidates.length) {
                    console.warn('⚠️ [Socket] All server candidate URLs exhausted.');
                    this.updateServerStatus('offline', isLocal ? 'Server Offline (Run: node server.js)' : 'Server Waking Up (Render)...');
                    return;
                }
                const url = candidates[candidateIdx];
                candidateIdx++;
                this._activeServerUrl = url;
                console.log(`📡 [Socket] Connecting to game server: ${url}`);
                this.updateServerStatus('connecting', isLocal ? `Connecting to ${url.replace(/https?:\/\//, '')}...` : 'Connecting to Live Server...');

                const s = io(url, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: Infinity,
                    reconnectionDelay: 1000,
                    reconnectionDelayMax: 5000,
                    timeout: 45000
                });

                window.exonieSocket = s;
                window.socket = s;
                this.setupSocketListeners(s);

                // For local development, if localhost isn't running after 6s, failover to Render
                if (isLocal && candidateIdx < candidates.length) {
                    const failoverTimer = setTimeout(() => {
                        if (!s.connected) {
                            console.warn(`⚠️ [Socket] Local server ${url} not responding, trying next candidate...`);
                            s.close();
                            tryConnectCandidate();
                        }
                    }, 6000);

                    s.once('connect', () => {
                        clearTimeout(failoverTimer);
                    });
                }

                s.once('connect', () => {
                    console.log(`✅ [Socket] Connected to Exonie server at: ${url} (ID: ${s.id})`);
                    this.updateServerStatus('connected', isLocal ? `Server Online (${url.replace(/https?:\/\//, '')})` : 'Server Online');
                });

                s.on('connect_error', (err) => {
                    if (isLocal && !s.connected && candidateIdx < candidates.length) {
                        console.warn(`⚠️ [Socket] Local connection error on ${url}: ${err.message}. Failing over...`);
                        s.close();
                        tryConnectCandidate();
                    }
                });
            };

            tryConnectCandidate();
            return window.exonieSocket;
        }
        return null;
    },

    setupSocketListeners(socket) {
        if (!socket) return;
        if (socket._flowListenersBound) return;
        socket._flowListenersBound = true;

        socket.on('connect', () => {
            this.updateServerStatus('connected', 'Server Online');
        });

        socket.on('disconnect', (reason) => {
            console.warn('[Socket] Disconnected from game server:', reason);
            this.updateServerStatus('offline', 'Server Disconnected');
        });

        socket.on('authError', (msg) => {
            clearTimeout(this._loginTimeout);
            console.warn('[Flow] Auth message:', msg);
            const activeForm = (this.registerForm && this.registerForm.style.display !== 'none') ? 'register' : 'login';
            const errEl = document.getElementById(activeForm === 'register' ? 'reg-error-msg' : 'login-error-msg');
            if (errEl) errEl.style.color = '';
            this.showAuthError(activeForm, msg || 'Authentication Error');
        });

        socket.on('needsCharacterCreation', (payload) => {
            clearTimeout(this._loginTimeout);
            console.log('✨ [Flow] Character needs creation:', payload);
            const email = (payload && typeof payload === 'object' && payload.email) ? payload.email : (typeof payload === 'string' ? payload : (this.accountEmail || 'hero@exonie.com'));
            const slotIdx = (payload && typeof payload === 'object' && payload.slotIndex !== undefined) ? payload.slotIndex : 0;
            this.accountEmail = email;
            this.accountName = email.split('@')[0] || 'Hero';
            this.activeSlotIndex = slotIdx;
            const defaultName = this.accountName;
            this.charData.name = defaultName;
            this.charData.email = this.accountEmail;
            this.charData.slotIndex = slotIdx;
            if (this.inputCharName) this.inputCharName.value = defaultName;
            this.showLoadingTransition('NEW EXONIAN DETECTED', 'Preparing Character Customizer...', 900, () => {
                if (this.scrAuth) {
                    this.scrAuth.classList.add('hidden');
                    this.scrAuth.style.display = 'none';
                }
                this.showCreation();
            });
        });

        socket.on('loginSuccess', (data) => {
            clearTimeout(this._loginTimeout);
            console.log('✅ [Flow] Supabase login success:', data);
            this.clearAuthErrors();
            this.accountEmail = data.email || data.username || this.accountEmail;
            this.accountName = this.accountEmail ? this.accountEmail.split('@')[0] : (data.username || 'HeroPlayer');
            if (Array.isArray(data.characters)) {
                this.accountSlots = data.characters;
                this.saveAccountSlots(data.characters);
            }
            this.onAuthSuccess(this.accountEmail, data.characters);
        });

        socket.on('registerSuccess', (registeredEmail) => {
            clearTimeout(this._loginTimeout);
            console.log(`✅ [Flow] Account ${registeredEmail} registered successfully.`);
            this.clearAuthErrors();
            this.switchAuth('login');
            const emailField = document.getElementById('login-email') || this.inputEmail;
            if (emailField) emailField.value = registeredEmail;
            const passInput = document.getElementById('login-pass');
            if (passInput) passInput.value = '';
            this.showAuthError('login', `Account "${registeredEmail}" created! Enter your password to log in.`);
            const lErr = document.getElementById('login-error-msg');
            if (lErr) lErr.style.color = '#4ade80';
        });

        socket.on('accountCharacters', (chars) => {
            if (Array.isArray(chars)) {
                this.accountSlots = chars;
                this.saveAccountSlots(chars);
                this.renderCharSlots();
            }
        });

        socket.on('characterCreated', (data) => {
            console.log('✅ [Flow] Character saved to Supabase:', data);
            const slots = this.getAccountSlots();
            if (data && data.slotIndex !== undefined && data.character) {
                slots[data.slotIndex] = data.character;
                this.saveAccountSlots(slots);
                this.renderCharSlots();
            }
        });
    },

    attemptLogin() {
        this.clearAuthErrors();
        const emailInput = document.getElementById('login-email') || this.inputEmail;
        const passInput = document.getElementById('login-pass') || this.inputPass;
        const inputVal = (emailInput && emailInput.value.trim()) ? emailInput.value.trim() : '';
        const password = (passInput && passInput.value) ? passInput.value : '';

        if (!inputVal || !password) {
            this.showAuthError('login', 'Please enter your Email or Character Name and Password.');
            return;
        }

        this.accountEmail = inputVal;
        this.accountName = inputVal.split('@')[0];

        const s = this.getSocket();
        if (!s) {
            this.showAuthError('login', 'Socket library unavailable. Please reload the page.');
            return;
        }

        const isLocal = this.isLocalEnvironment();

        if (s.connected) {
            this.doEmitLogin(s, inputVal, password);
        } else {
            this.showAuthError('login', isLocal ? 'Connecting to local game server...' : 'Waking up server from idle sleep... Please wait a moment.');
            const lErr = document.getElementById('login-error-msg');
            if (lErr) lErr.style.color = '#38bdf8';

            let connected = false;
            const onConn = () => {
                connected = true;
                clearTimeout(connWait);
                this.clearAuthErrors();
                this.doEmitLogin(s, inputVal, password);
            };
            const connWait = setTimeout(() => {
                if (!connected) {
                    s.off('connect', onConn);
                    this.showAuthError('login', isLocal
                        ? 'Server connection timed out. Please check that your local server is running.'
                        : 'Server is taking longer than usual to spin up on Render. Please wait 10 seconds and try again.');
                }
            }, 35000); // 35 seconds to allow Render free tier cold-start
            s.once('connect', onConn);
        }
    },

    doEmitLogin(socket, identifier, password) {
        clearTimeout(this._loginTimeout);
        const isLocal = this.isLocalEnvironment();
        this._loginTimeout = setTimeout(() => {
            this.showAuthError('login', isLocal
                ? 'Server response timed out. Please check server console.'
                : 'Server response timed out. The cloud server may still be initializing its database connection. Please try again in a few moments.');
        }, 30000);
        socket.emit('login', { email: identifier, username: identifier, password: password });
    },

    loginAsGuest() {
        this.showAuthError('login', 'Guest mode disabled. Please register an account.');
    },

    attemptRegister() {
        this.clearAuthErrors();
        const regInput = document.getElementById('reg-email') || this.inputRegEmail;
        const regPass = document.getElementById('reg-pass') || this.inputRegPass;
        const email = (regInput && regInput.value.trim()) ? regInput.value.trim() : '';
        const password = (regPass && regPass.value) ? regPass.value : '';

        if (!email || !password) {
            this.showAuthError('register', 'Please enter an Email or Username and Password.');
            return;
        }

        if (email.length < 3) {
            this.showAuthError('register', 'Email or Username must be at least 3 characters.');
            return;
        }

        if (password.length < 4) {
            this.showAuthError('register', 'Password must be at least 4 characters.');
            return;
        }

        const s = this.getSocket();
        if (!s) {
            this.showAuthError('register', 'Socket library unavailable. Please reload the page.');
            return;
        }

        const isLocal = this.isLocalEnvironment();

        if (s.connected) {
            this.doEmitRegister(s, email, password);
        } else {
            this.showAuthError('register', isLocal ? 'Connecting to local game server...' : 'Waking up server from idle sleep... Please wait a moment.');
            const rErr = document.getElementById('reg-error-msg');
            if (rErr) rErr.style.color = '#38bdf8';

            let connected = false;
            const onConn = () => {
                connected = true;
                clearTimeout(connWait);
                this.clearAuthErrors();
                this.doEmitRegister(s, email, password);
            };
            const connWait = setTimeout(() => {
                if (!connected) {
                    s.off('connect', onConn);
                    this.showAuthError('register', isLocal
                        ? 'Server connection timed out. Please check that your local server is running.'
                        : 'Server is taking longer than usual to spin up on Render. Please wait 10 seconds and try again.');
                }
            }, 35000);
            s.once('connect', onConn);
        }
    },

    doEmitRegister(socket, email, password) {
        clearTimeout(this._loginTimeout);
        const isLocal = this.isLocalEnvironment();
        this._loginTimeout = setTimeout(() => {
            this.showAuthError('register', isLocal
                ? 'Server response timed out. Please check server console.'
                : 'Server response timed out. The cloud server may still be initializing its database connection. Please try again in a few moments.');
        }, 30000);
        socket.emit('register', { email: email, username: email, password: password });
    },

    onAuthSuccess(email, characters) {
        console.log(`🛡️ [EXONIE 3D] Logged in as: ${email}`);
        this.accountEmail = email;
        this.accountName = email.split('@')[0] || 'Hero';
        if (this.charSelectAccountName) {
            this.charSelectAccountName.textContent = email;
        }

        if (Array.isArray(characters)) {
            this.accountSlots = characters;
            this.saveAccountSlots(characters);
        } else {
            // Request live Supabase characters for this account
            const s = this.getSocket();
            if (s && s.connected) {
                s.emit('getAccountCharacters', { email: this.accountEmail, username: this.accountEmail });
            }
        }

        this.showLoadingTransition('Character Selection', `Account: ${email}`, 900, () => {
            if (this.scrAuth) {
                this.scrAuth.classList.add('hidden');
                this.scrAuth.style.display = 'none';
            }
            this.showCharSelect();
        });
    },

    // ============================================================
    // 2B. 3-SLOT ACCOUNT CHARACTER STORAGE & SELECTION
    // ============================================================
    getAccountStorageKey() {
        const id = (this.accountEmail || this.accountName || 'HeroPlayer').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        return `exonie3d_chars_${id}`;
    },

    getAccountSlots() {
        if (Array.isArray(this.accountSlots) && this.accountSlots.length === 3) {
            return this.accountSlots;
        }
        try {
            const raw = localStorage.getItem(this.getAccountStorageKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length === 3) return parsed;
            }
        } catch (e) {}
        return [null, null, null];
    },

    saveAccountSlots(slots) {
        this.accountSlots = slots;
        try {
            localStorage.setItem(this.getAccountStorageKey(), JSON.stringify(slots));
        } catch (e) {}
    },

    saveActiveCharacterState(stateObj) {
        if (!stateObj) return;
        const slots = this.getAccountSlots();
        const idx = Math.max(0, Math.min(2, Number(this.activeSlotIndex) || 0));
        slots[idx] = Object.assign({}, slots[idx] || {}, stateObj, {
            slotIndex: idx,
            email: this.accountEmail
        });
        this.saveAccountSlots(slots);

        // Sync with Supabase (segregated per slot)
        const s = this.getSocket();
        if (s && s.connected) {
            s.emit('saveCharacter', {
                email: this.accountEmail || this.accountName,
                slotIndex: idx,
                characterState: slots[idx]
            });
        }
    },

    showCharSelect() {
        this.hidePreGameChat();
        this.step = 'char_select';
        if (!this.scrCharSelect) this.cacheDOM();
        if (this.scrSplash) {
            this.scrSplash.classList.add('hidden');
            this.scrSplash.style.display = 'none';
        }
        if (this.scrAuth) {
            this.scrAuth.classList.add('hidden');
            this.scrAuth.style.display = 'none';
        }
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
            loadingScreen.style.display = 'none';
        }
        if (this.charSelectAccountName) this.charSelectAccountName.textContent = this.accountEmail || this.accountName;
        this.renderCharSlots();
        if (this.scrCharSelect) {
            this.scrCharSelect.style.display = 'flex';
            this.scrCharSelect.classList.remove('hidden');
        }
        this.playMenuMusic();
    },

    renderCharSlots() {
        if (!this.charSlotsGrid) this.cacheDOM();
        if (!this.charSlotsGrid) return;
        const slots = this.getAccountSlots();
        this.charSlotsGrid.innerHTML = '';

        for (let i = 0; i < 3; i++) {
            const c = slots[i];
            const card = document.createElement('div');
            card.className = 'char-slot-card';
            if (c) {
                card.style.cursor = 'pointer';
                card.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    window.ExonieFlow.selectExistingCharacter(i);
                };
                const name = c.character_name || c.name || 'Hero';
                const cls = (c.base_stats && c.base_stats.playerClass) || c.playerClass || c.className || 'Novice';
                const lvl = c.level || 1;
                const gnd = (c.gender === 'male' || (c.base_stats && c.base_stats.gender === 'male')) ? 'Male' : 'Female';
                const gold = (c.gold !== undefined) ? c.gold : 500;
                card.innerHTML = `
                    <div class="char-slot-badge">CHARACTER SLOT ${i + 1}</div>
                    <div style="font-size:2.4rem; margin:4px 0;">${gnd === 'Male' ? '🗡️' : '⚔️'}</div>
                    <div class="char-slot-name">${name}</div>
                    <div class="char-slot-meta">
                        <strong style="color:#ffd700;">Lv. ${lvl}</strong> · <span style="color:#4ade80;">${cls}</span><br>
                        <span>${gnd} · 🪙 ${Number(gold).toLocaleString()} Gold</span>
                    </div>
                    <div class="char-slot-actions">
                        <button class="btn-item-action" style="flex:1; background:#22c55e; color:#000; font-weight:900; padding:9px;" onclick="window.ExonieFlow.selectExistingCharacter(${i})">▶ Play</button>
                        <button class="btn-item-action" style="background:#ef4444; padding:9px 12px;" title="Delete Character" onclick="window.ExonieFlow.deleteCharacterSlot(${i})">🗑️</button>
                    </div>
                `;
            } else {
                card.style.cursor = 'pointer';
                card.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    window.ExonieFlow.startNewCharacterInSlot(i);
                };
                card.innerHTML = `
                    <div class="char-slot-badge">CHARACTER SLOT ${i + 1}</div>
                    <div style="font-size:2.5rem; opacity:0.45; margin:10px 0;">➕</div>
                    <div class="char-slot-name" style="color:#94a3b8;">Empty Slot</div>
                    <div class="char-slot-meta">Create a new character on this account slot.</div>
                    <div class="char-slot-actions">
                        <button class="btn-item-action" style="flex:1; background:#0284c7; font-weight:800; padding:10px;" onclick="window.ExonieFlow.startNewCharacterInSlot(${i})">+ Create Character</button>
                    </div>
                `;
            }
            this.charSlotsGrid.appendChild(card);
        }
    },

    startNewCharacterInSlot(slotIdx) {
        this.activeSlotIndex = slotIdx;
        const defaultName = (this.accountName || 'Hero') + (slotIdx > 0 ? `_${slotIdx + 1}` : '');
        this.charData = {
            name: defaultName,
            gender: 'female',
            hairStyle: '1',
            hairColor: '#111111',
            skinColor: '#f5c6a5',
            className: null,
            playerClass: null,
            weaponType: null,
            slotIndex: slotIdx,
            email: this.accountEmail,
            isNewCharacter: true
        };
        if (this.inputCharName) this.inputCharName.value = this.charData.name;
        this.updateHairButtonsForGender('female');

        this.showLoadingTransition('Forging Avatar', `Slot ${slotIdx + 1} — Initializing 3D Character Studio...`, 900, () => {
            if (this.scrCharSelect) {
                this.scrCharSelect.classList.add('hidden');
                this.scrCharSelect.style.display = 'none';
            }
            this.showCreation();
        });
    },

    selectExistingCharacter(slotIdx) {
        const slots = this.getAccountSlots();
        const savedChar = slots[slotIdx];
        if (!savedChar) return;
        this.activeSlotIndex = slotIdx;
        const charName = savedChar.character_name || savedChar.name || 'Hero';
        this.charData = Object.assign({}, savedChar, {
            name: charName,
            slotIndex: slotIdx,
            email: this.accountEmail,
            isNewCharacter: false
        });
        this.step = 'game';
        this.stopMenuMusic();

        const s = this.getSocket();
        if (s && s.connected) {
            s.emit('enterWorld', Object.assign({}, savedChar, {
                email: this.accountEmail,
                slotIndex: slotIdx,
                character_name: charName,
                name: charName
            }));
        }

        this.showLoadingTransition('Town of Exonie', `Welcome back, ${charName} (Lv.${savedChar.level || 1})!`, 1350, () => {
            if (this.scrCharSelect) {
                this.scrCharSelect.classList.add('hidden');
                this.scrCharSelect.style.display = 'none';
            }
            let launchAttempts = 0;
            const tryLaunch = () => {
                launchAttempts++;
                if (window.launchExonieGame) {
                    window.launchExonieGame(this.charData);
                } else if (launchAttempts < 40) {
                    setTimeout(tryLaunch, 100);
                } else {
                    console.error('Launch timeout: window.launchExonieGame not available');
                    const ls = document.getElementById('loading-screen');
                    if (ls) {
                        ls.classList.remove('active');
                        ls.style.display = 'none';
                    }
                    if (this.scrCharSelect) {
                        this.scrCharSelect.classList.remove('hidden');
                        this.scrCharSelect.style.display = 'flex';
                    }
                }
            };
            tryLaunch();
        });
    },

    deleteCharacterSlot(slotIdx) {
        const slots = this.getAccountSlots();
        if (!slots[slotIdx]) return;
        const charName = slots[slotIdx].character_name || slots[slotIdx].name || `Slot ${slotIdx + 1}`;
        if (!confirm(`Are you sure you want to delete ${charName}? This cannot be undone.`)) {
            return;
        }
        slots[slotIdx] = null;
        this.saveAccountSlots(slots);
        this.renderCharSlots();

        const s = this.getSocket();
        if (s && s.connected) {
            s.emit('deleteCharacter', {
                email: this.accountEmail || this.accountName,
                slotIndex: slotIdx
            });
        }
    },

    logoutToAuth() {
        if (this.scrCharSelect) {
            this.scrCharSelect.classList.add('hidden');
            this.scrCharSelect.style.display = 'none';
        }
        this.showAuth();
    },

    openCharSelectFromGame() {
        this.hidePreGameChat();
        if (window.game && window.game.saveCharacterToAccountSlot) {
            window.game.saveCharacterToAccountSlot();
        }
        this.showLoadingTransition('Character Selection', 'Saving Progress & Returning to Character Slots...', 950, () => {
            const hud = document.getElementById('game-hud');
            if (hud) hud.style.display = 'none';
            document.querySelectorAll('.game-modal').forEach(m => { m.style.display = 'none'; });
            this.showCharSelect();
        });
    },

    // ============================================================
    // 3. CHARACTER CREATION SCREEN (FORGING AVATAR)
    // ============================================================
    showCreation() {
        this.hidePreGameChat();
        this.step = 'creation';
        if (!this.scrCreation) this.cacheDOM();
        if (this.scrSplash) {
            this.scrSplash.classList.add('hidden');
            this.scrSplash.style.display = 'none';
        }
        if (this.scrAuth) {
            this.scrAuth.classList.add('hidden');
            this.scrAuth.style.display = 'none';
        }
        if (this.scrCharSelect) {
            this.scrCharSelect.classList.add('hidden');
            this.scrCharSelect.style.display = 'none';
        }
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('active');
            loadingScreen.style.display = 'none';
        }
        if (this.scrCreation) {
            this.scrCreation.style.display = 'flex';
            this.scrCreation.classList.remove('hidden');
        }

        this.updateHairButtonsForGender(this.charData.gender || 'female');
        // Lazy-load live 3D preview on the pedestal (with instant + delayed retry to guarantee layout sizing)
        requestAnimationFrame(() => {
            this.initCharacterPreview();
            this.triggerPreviewUpdate();
        });
        setTimeout(() => {
            this.initCharacterPreview();
            this.triggerPreviewUpdate();
        }, 120);
    },

    updateHairButtonsForGender(gender) {
        const femaleLabels = [
            '1: Twin Tails',
            '2: Long Flowing',
            '3: Hime Bob',
            '4: High Ponytail',
            '5: Empress Buns'
        ];
        const maleLabels = [
            '1: Hero Spikes',
            '2: Royal Quiff',
            '3: Wolf-Tail',
            '4: Tactical Crop',
            '5: Parted Curtains'
        ];
        const labels = (gender === 'male') ? maleLabels : femaleLabels;
        for (let i = 1; i <= 5; i++) {
            const btn = document.getElementById(`hair-btn-${i}`);
            if (btn) btn.textContent = labels[i - 1];
        }
    },

    initCharacterPreview() {
        try {
            if (window.initCustomizer3D) {
                window.initCustomizer3D(this.charData);
            } else {
                // Retry every 80ms until game.js exports it
                setTimeout(() => this.initCharacterPreview(), 80);
            }
        } catch (e) {
            console.warn('3D preview retry:', e);
            setTimeout(() => this.initCharacterPreview(), 150);
        }
    },

    setGender(gender, element) {
        this.charData.gender = gender;
        document.querySelectorAll('#gender-pills .pill-btn').forEach(b => b.classList.remove('active'));
        if (element) element.classList.add('active');
        this.updateHairButtonsForGender(gender);
        this.triggerPreviewUpdate();
    },

    setHairStyle(style, element) {
        this.charData.hairStyle = style;
        document.querySelectorAll('#hair-pills .pill-btn').forEach(b => b.classList.remove('active'));
        if (element) element.classList.add('active');
        this.triggerPreviewUpdate();
    },

    setHairColor(color, element) {
        this.charData.hairColor = color;
        document.querySelectorAll('#hair-swatches .swatch').forEach(s => s.classList.remove('active'));
        if (element) element.classList.add('active');
        this.triggerPreviewUpdate();
    },

    setSkinColor(color, element) {
        this.charData.skinColor = color;
        document.querySelectorAll('#skin-swatches .swatch').forEach(s => s.classList.remove('active'));
        if (element) element.classList.add('active');
        this.triggerPreviewUpdate();
    },

    setClass(className, element) {
        this.charData.className = className;
        const weapons = {
            Blademaster: 'sword',
            Berserker: 'sword',
            Icemaster: 'staff',
            Healer: 'staff',
            Summoner: 'touchpad'
        };
        this.charData.weaponType = weapons[className] || 'sword';

        document.querySelectorAll('.class-card').forEach(c => c.classList.remove('active'));
        if (element) element.classList.add('active');
        this.triggerPreviewUpdate();
    },

    triggerPreviewUpdate() {
        if (window.updateCustomizerPreview) {
            window.updateCustomizerPreview(this.charData);
        }
    },

    finishCreation() {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        if (this.inputCharName && this.inputCharName.value.trim()) {
            this.charData.name = this.inputCharName.value.trim().replace(/\|/g, '');
        }
        this.charData.slotIndex = this.activeSlotIndex;
        this.charData.email = this.accountEmail || this.accountName;

        console.log('🛡️ [EXONIE 3D] Character creation finished:', this.charData);

        const s = this.getSocket();
        if (s && s.connected) {
            s.emit('createCharacter', {
                email: this.accountEmail || this.accountName,
                username: this.accountEmail || this.accountName,
                slotIndex: this.activeSlotIndex,
                charData: this.charData
            });
        }

        this.showLoadingTransition('Entering Story Prologue', '11:58 PM — The Night Before the Rift...', 950, () => {
            if (this.scrCreation) {
                this.scrCreation.classList.add('hidden');
                this.scrCreation.style.display = 'none';
            }
            this.startPrologue();
        });
    },

    // ============================================================
    // 4. STORY PROLOGUE DIALOGUE (BEDROOM -> SLEEP -> VOID)
    // ============================================================
    startPrologue() {
        this.hidePreGameChat();
        this.step = 'prologue';
        if (!this.scrPrologue) this.cacheDOM();
        if (this.scrPrologue) {
            this.scrPrologue.style.display = 'flex';
            this.scrPrologue.classList.remove('hidden');
        }

        this.dialogues = [
            // Act 1: Real-World Bedroom
            {
                scene: 'bedroom',
                speaker: this.charData.name,
                text: "11:58 PM... Another exhausting day in the real world is finally over."
            },
            {
                scene: 'bedroom',
                speaker: this.charData.name,
                text: "I just shut down my work laptop. My head is throbbing, and my eyelids feel like lead..."
            },
            {
                scene: 'bedroom',
                speaker: this.charData.name,
                text: "I just want to rest... even if it's just a few hours of peace... *yawns*"
            },
            // Act 2: Drifting into Sleep
            {
                scene: 'sleep',
                speaker: 'Narrator',
                text: "*Your eyes close... The room fades to silence as you drift into a deep slumber... Zzz...*"
            },
            // Act 3: The Void of Exonie & The 100th Floor Goal
            {
                scene: 'void',
                speaker: 'Mysterious Whisper',
                text: `Awaken, ${this.charData.name}... wandering soul from beyond the veil...`
            },
            {
                scene: 'void',
                speaker: 'Mysterious Whisper',
                text: "While you slumbered, your consciousness was pulled through the dimensional rift into the world of Exonie."
            },
            {
                scene: 'void',
                speaker: 'Mysterious Whisper',
                text: "The doorway back to your real world has been sealed shut at the pinnacle of the world: The 100th Floor of the Infinite Spire."
            },
            {
                scene: 'void',
                speaker: 'Mysterious Whisper',
                text: "In order to return home to the real world, you must conquer the 100th floor. Slay the guardian lords, claim the Gatekeeper's Key, and break the seal."
            },
            {
                scene: 'void',
                speaker: 'Mysterious Whisper',
                text: `Rise, ${this.charData.name}... Take up your weapon and conquer the Tower of Exonie!`
            }
        ];

        this.dialogueIndex = 0;
        this.renderDialogue();
    },

    renderDialogue() {
        clearInterval(this.typewriterTimer);
        const d = this.dialogues[this.dialogueIndex];
        if (!d) {
            this.skipPrologue();
            return;
        }

        if (this.prologueSpeaker) this.prologueSpeaker.textContent = d.speaker;
        this.currentFullText = d.text;
        this.isTyping = true;

        if (this.prologueText) {
            this.prologueText.textContent = '';
            let charIdx = 0;
            this.typewriterTimer = setInterval(() => {
                if (charIdx < this.currentFullText.length) {
                    const ch = this.currentFullText[charIdx];
                    this.prologueText.textContent += ch;
                    if (ch !== ' ' && charIdx % 2 === 0) {
                        this.playTypingBlip(d.speaker);
                    }
                    charIdx++;
                } else {
                    clearInterval(this.typewriterTimer);
                    this.isTyping = false;
                }
            }, 26);
        }

        // Switch visual scenes
        if (d.scene === 'bedroom') {
            if (this.prologueBg) this.prologueBg.className = 'bg-bedroom';
            if (this.bedroomVfx) this.bedroomVfx.style.display = 'block';
            if (this.voidVfx) this.voidVfx.style.display = 'none';
        } else if (d.scene === 'sleep') {
            if (this.prologueBg) this.prologueBg.className = 'bg-sleep';
            if (this.bedroomVfx) this.bedroomVfx.style.display = 'none';
            if (this.voidVfx) this.voidVfx.style.display = 'none';
        } else if (d.scene === 'void') {
            if (this.prologueBg) this.prologueBg.className = 'bg-void';
            if (this.bedroomVfx) this.bedroomVfx.style.display = 'none';
            if (this.voidVfx) this.voidVfx.style.display = 'block';
        }
    },

    advanceDialogue() {
        // If typewriter is still typing out the current line, finish it immediately on first click!
        if (this.isTyping) {
            clearInterval(this.typewriterTimer);
            this.isTyping = false;
            if (this.prologueText) {
                this.prologueText.textContent = this.currentFullText;
            }
            return;
        }

        this.dialogueIndex++;
        if (this.dialogueIndex < this.dialogues.length) {
            this.renderDialogue();
        } else {
            this.skipPrologue();
        }
    },

    skipPrologue() {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        clearInterval(this.typewriterTimer);
        this.isTyping = false;
        console.log('🛡️ [EXONIE 3D] Prologue finished -> Launching 3D Exonie World');
        this.step = 'game';
        this.stopMenuMusic();

        this.showLoadingTransition('Town of Exonie', 'Safe Haven — Entering the World of Exonie...', 1400, () => {
            if (this.scrPrologue) {
                this.scrPrologue.classList.add('hidden');
                this.scrPrologue.style.display = 'none';
            }

            let launchAttempts = 0;
            const tryLaunch = () => {
                launchAttempts++;
                if (window.launchExonieGame) {
                    window.launchExonieGame(this.charData);
                } else if (launchAttempts < 40) {
                    setTimeout(tryLaunch, 100);
                } else {
                    console.error('Launch timeout: window.launchExonieGame not available');
                    const ls = document.getElementById('loading-screen');
                    if (ls) {
                        ls.classList.remove('active');
                        ls.style.display = 'none';
                    }
                    if (this.scrCharSelect) {
                        this.scrCharSelect.classList.remove('hidden');
                        this.scrCharSelect.style.display = 'flex';
                    }
                }
            };
            tryLaunch();
        });
    },

    // ============================================================
    // CIRCUIT SIEGE PWA INSTALL ENGINE & MOBILE ADAPTIVE SUPPORT
    // ============================================================
    initPwaAndMobile() {
        const ua = navigator.userAgent || '';
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const hasTouch = (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const isMobile = isMobileUA || (hasTouch && isCoarse);

        if (document.body) {
            document.body.classList.toggle('touch-enabled', isMobile);
        }

        // PWA install trigger (Exact Circuit Siege behavior)
        window.triggerPwaInstall = async () => {
            let promptEvent = window.__deferredPwaPrompt;
            if (!promptEvent) {
                await new Promise((resolve) => {
                    const onReady = () => { window.removeEventListener('exonie-pwa-ready', onReady); resolve(); };
                    window.addEventListener('exonie-pwa-ready', onReady);
                    setTimeout(resolve, 1000);
                });
                promptEvent = window.__deferredPwaPrompt;
            }

            if (promptEvent) {
                try {
                    promptEvent.prompt();
                    const choice = await promptEvent.userChoice;
                    window.__deferredPwaPrompt = null;
                    this.updatePwaButtonState();
                    if (choice && choice.outcome === 'accepted') {
                        try { localStorage.setItem('exonie_pwa_installed', '1'); } catch (_) {}
                        alert('🎉 Exonie 3D installed to your device! Launch anytime from your Home Screen or Apps menu.');
                    }
                    return;
                } catch (_) {}
            }

            // Check iOS Safari
            const isIOS = /iPhone|iPad|iPod/.test(ua);
            const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
            if (isIOS || (isSafari && !('onbeforeinstallprompt' in window))) {
                const iosModal = document.getElementById('pwa-ios-modal');
                if (iosModal) iosModal.style.display = 'flex';
                return;
            }

            if ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || localStorage.getItem('exonie_pwa_installed') === '1') {
                alert('✓ Exonie 3D is already installed as a progressive web app on your device!');
            } else {
                alert('To install Exonie 3D, tap your browser menu (⋮ or Share) and select "Add to Home Screen" or "Install App".');
            }
        };

        this.updatePwaButtonState();
        window.addEventListener('exonie-pwa-ready', () => this.updatePwaButtonState());
        window.addEventListener('exonie-pwa-installed', () => {
            window.__deferredPwaPrompt = null;
            try { localStorage.setItem('exonie_pwa_installed', '1'); } catch (_) {}
            this.updatePwaButtonState();
        });

        // Chat minimize / expand toggle
        window.toggleChatBoxMinimized = (e) => {
            const chatBox = document.getElementById('persistent-chat-box');
            if (!chatBox) return;
            const isOpen = chatBox.classList.contains('chat-open') || chatBox.classList.contains('mobile-open') || chatBox.style.display === 'flex';
            if (isOpen) {
                if (window.shrinkChat) window.shrinkChat(e);
                else {
                    chatBox.classList.remove('chat-open', 'mobile-open');
                    chatBox.classList.add('chat-closed');
                    chatBox.style.setProperty('display', 'none', 'important');
                    const toggleBtn = document.getElementById('btn-mobile-chat-toggle');
                    if (toggleBtn) toggleBtn.style.setProperty('display', 'flex', 'important');
                }
            } else {
                if (window.expandChat) window.expandChat(e);
                else {
                    chatBox.classList.remove('chat-closed');
                    chatBox.classList.add('chat-open', 'mobile-open');
                    chatBox.style.setProperty('display', 'flex', 'important');
                    const toggleBtn = document.getElementById('btn-mobile-chat-toggle');
                    if (toggleBtn) toggleBtn.style.setProperty('display', 'none', 'important');
                }
            }
        };
    },

    updatePwaButtonState() {
        const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        const isInstalled = isStandalone || localStorage.getItem('exonie_pwa_installed') === '1';

        document.querySelectorAll('.btn-install-pwa').forEach(btn => {
            if (isInstalled) {
                btn.style.opacity = '0.75';
                const txt = btn.querySelector('#title-pwa-text') || btn.querySelector('span:last-child');
                if (txt) txt.textContent = '✓ APP INSTALLED';
            }
        });
    }
};

// Immediate or DOMReady Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.ExonieFlow.init());
} else {
    window.ExonieFlow.init();
}

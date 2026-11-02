import * as THREE from 'three';
import { Engine3D } from './engine3d.js?v=3.0';
import { Character3D } from './character3d.js?v=3.0';
import { World3D } from './world3d.js?v=3.0';
import { Monster3D } from './monsters3d.js?v=3.0';
import { CombatSystem } from './combat.js?v=3.0';
import { UIManager } from './ui.js?v=3.0';
import { CLASSES, MONSTER_DATABASE, STARTER_ITEMS, DEFAULT_BASE_STATS, MAX_LEVEL, getExpForNextLevel, generateLoot, generateTavernLoot, generateHauntedLoot, generateBattlefieldLoot, getItemSellPrice, CASH_SHOP_ITEMS, EVENT_CAVE_ACTIVE, canStoneEnhanceItem, calculateEnhanceOutcome } from './game_data.js?v=3.0';
import { MAPS_DATA } from './maps_data.js?v=3.0';

// ==========================================
// AUDIO MANAGER (EXONIE SOUND EFFECTS & BGM)
// ==========================================
class AudioManager {
    constructor() {
        this.currentBgm = null;
        this.currentTrackName = null;
        this.pendingTrack = 'loginmenu';
        this.audioEnabled = false;
        this.masterVolume = 0.70;
        this.ctx = null;

        const enableAudio = () => {
            this.audioEnabled = true;
            this.initWebAudio();
            if (this.pendingTrack && !this.currentBgm) {
                this.playBgm(this.pendingTrack);
            }
            window.removeEventListener('click', enableAudio);
            window.removeEventListener('keydown', enableAudio);
            window.removeEventListener('touchstart', enableAudio);
        };
        window.addEventListener('click', enableAudio);
        window.addEventListener('keydown', enableAudio);
        window.addEventListener('touchstart', enableAudio);
    }

    initWebAudio() {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    setMasterVolume(vol) {
        this.masterVolume = Math.max(0, Math.min(1, vol));
        if (this.currentBgm) {
            this.currentBgm.volume = 0.45 * (this.masterVolume / 0.70);
        }
    }

    playBgm(trackName) {
        this.pendingTrack = trackName;
        if (window.ExonieFlow && window.ExonieFlow.menuBgm && trackName !== 'loginmenu') {
            window.ExonieFlow.stopMenuMusic();
        }
        const url = `music/${trackName}.mp3`;
        if (this.currentBgm && this.currentTrackName === trackName && !this.currentBgm.paused) return;

        if (this.currentBgm) {
            this.currentBgm.pause();
        }

        this.currentTrackName = trackName;
        const audio = new Audio(url);
        audio.loop = true;
        audio.volume = Math.min(1, 0.45 * (this.masterVolume / 0.70));
        audio.play().then(() => {
            this.audioEnabled = true;
        }).catch(() => {});
        this.currentBgm = audio;
    }

    // ==========================================
    // 🎵 PROCEDURAL WEBAUDIO SFX SYNTHESIZERS
    // ==========================================

    // ❄️ Ice Master: Crisp crystalline shatter & ice lance impact crack
    playIceShatter() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.85 * (this.masterVolume / 0.70));

        // 1. Crystal ringing strike
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(340, now + 0.36);
        gain.gain.setValueAtTime(vol * 0.75, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.37);

        // 2. Highpass noise burst (shattering ice crystals)
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.32);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const out = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            out[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
        }
        const whiteNoise = this.ctx.createBufferSource();
        whiteNoise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(3800, now + 0.30);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(vol * 0.85, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        whiteNoise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        whiteNoise.start(now);

        // 3. Sub impact thump
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(150, now);
        sub.frequency.exponentialRampToValueAtTime(32, now + 0.28);
        subGain.gain.setValueAtTime(vol * 0.65, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        sub.connect(subGain);
        subGain.connect(this.ctx.destination);
        sub.start(now);
        sub.stop(now + 0.29);
    }

    // ✨ Healer: Sacred angelic harmonic chime
    playHolyChime() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.70 * (this.masterVolume / 0.70));
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C Major Chord
        freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + idx * 0.03);
            gain.gain.setValueAtTime(vol * 0.25, now + idx * 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.03);
            osc.stop(now + 0.66);
        });
    }

    // 🔮 Staff / Arcane: Ethereal magical projectile whoosh
    playMagicOrb() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.65 * (this.masterVolume / 0.70));
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(860, now + 0.16);
        gain.gain.setValueAtTime(vol * 0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
    }

    // 💥 Explosives: Deep punchy explosion blast
    playExplosion() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.90 * (this.masterVolume / 0.70));

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(26, now + 0.45);
        gain.gain.setValueAtTime(vol * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.46);

        const bufferSize = Math.floor(this.ctx.sampleRate * 0.40);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const out = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            out[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.12));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);
        filter.frequency.exponentialRampToValueAtTime(90, now + 0.38);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(vol * 0.85, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.40);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    }

    // 💨 Phantom Striker: Ethereal shadow phase whoosh
    playShadowBlink() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.75 * (this.masterVolume / 0.70));
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.18);
        gain.gain.setValueAtTime(vol * 0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
    }

    // 👑 Summoner Enhance!: Triumphant rising power-up fanfare
    playEnhanceFanfare() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.75 * (this.masterVolume / 0.70));
        const notes = [440, 554.37, 659.25, 880]; // A Major Arpeggio
        notes.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now + idx * 0.05);
            gain.gain.setValueAtTime(vol * 0.45, now + idx * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.32);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.33);
        });
    }

    // ⚔️ Blademaster: Sharp metallic deflection clang
    playParryClang() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.80 * (this.masterVolume / 0.70));
        const freqs = [1560, 2480];
        freqs.forEach(f => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, now);
            gain.gain.setValueAtTime(vol * 0.4, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.23);
        });
    }

    // 🛡️ Berserker: Low booming warcry roar
    playTauntRoar() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.85 * (this.masterVolume / 0.70));
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(65, now + 0.45);
        gain.gain.setValueAtTime(vol * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.46);
    }

    // 🍾 Molotov: Glass shatter & flame burst
    playBottleShatter() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.80 * (this.masterVolume / 0.70));
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(3200, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.14);
        gain.gain.setValueAtTime(vol * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
        this.playExplosion();
    }

    // 🎯 Sniper: High velocity sonic whip-crack beam
    playSniperBeam() {
        this.initWebAudio();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const vol = Math.min(1, 0.85 * (this.masterVolume / 0.70));
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(3100, now);
        osc.frequency.exponentialRampToValueAtTime(95, now + 0.12);
        gain.gain.setValueAtTime(vol * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playSfx(sfxName) {
        if (!this.audioEnabled) return;
        this.initWebAudio();

        // Procedural WebAudio SFX mappings for zero-latency, reliable audio
        switch (sfxName) {
            case 'ice':
                this.playIceShatter();
                return;
            case 'holy':
                this.playHolyChime();
                return;
            case 'magic':
                this.playMagicOrb();
                return;
            case 'explosion':
                this.playExplosion();
                return;
            case 'blink':
                this.playShadowBlink();
                return;
            case 'enhance':
                this.playEnhanceFanfare();
                return;
            case 'clang':
                this.playParryClang();
                return;
            case 'taunt':
                this.playTauntRoar();
                return;
            case 'glass':
                this.playBottleShatter();
                return;
            case 'beam':
                this.playSniperBeam();
                return;
        }

        const url = `music/${sfxName}.mp3`;
        const audio = new Audio(url);
        audio.volume = Math.min(1, 0.65 * (this.masterVolume / 0.70));
        audio.play().catch(() => {});
    }

    // Play Authentic 2D Exonie Class Voice shout on skill activation
    playClassVoice(hairStyle, className) {
        if (!this.audioEnabled) return;
        const hairPrefix = (!hairStyle || hairStyle === 'none') ? 'none' : `hair${hairStyle}`;
        const formattedClass = String(className).replace(/\s+/g, '').toLowerCase();
        const url = `skills/${hairPrefix}_${formattedClass}.mp3`;
        const audio = new Audio(url);
        audio.volume = Math.min(1, 0.65 * (this.masterVolume / 0.70));
        audio.play().catch(() => {});
    }

    // Play weapon-specific attack sound (charge.mp3 is strictly reserved for Minotaur dash!)
    playWeaponSfx(weaponSprite) {
        if (!this.audioEnabled) return;
        const s = String(weaponSprite || '').toLowerCase();
        if (s.includes('staff')) this.playSfx('magic');
        else if (s.includes('gun')) this.playSfx('gunshot');
        else if (s.includes('pendant')) this.playSfx('holy');
        else if (s.includes('sword') || s.includes('dagger')) this.playSfx('slash');
        else if (s.includes('touchpad')) this.playSfx('lightning');
        else this.playSfx('bump');
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ==========================================
// MAIN GAME CONTROLLER (EXONIE 3D REMASTERED)
// ==========================================
export class GameApp {
    constructor() {
        // Connect global launch hook from flow.js immediately
        window.launchExonieGame = (charData) => {
            this.onFlowComplete(charData);
        };

        // Initialize 3D Preview helper for Character Creation pedestal immediately
        this.setupCustomizer3DPreview();

        this.audio = new AudioManager();
        this.engine = new Engine3D('game-container');
        this.world = new World3D(this.engine.scene);
        this.combat = new CombatSystem(this.engine, this.audio);
        this.ui = new UIManager(this);

        // Connect Dragon Nest engine input callbacks
        this.engine.onAttackCallback = () => this.onAttackTrigger();
        this.engine.onDodgeCallback = () => this.onDodgeTrigger();

        this.monsters = [];
        this.currentFloor = 1;
        this.currentMapId = 'town';
        this.floorBoss = null;
        this.isGhost = false;
        this.portalCooldown = 0;
        this.potionCooldown = 0;
        this.bossCooldowns = {};
        this.playerShieldMesh = null;

        // Remote Player Hover & Interaction State
        this.hoveredPlayer = null;
        this._lastHoverCheck = 0;
        this._lastAimCheck = 0;
        this._hoverRaycaster = new THREE.Raycaster();
        this._hoverMouse = new THREE.Vector2();

        // Jump & Vertical Physics
        this.gravity = 26.0;
        this.jumpForce = 9.5;

        // Player State strictly conforming to 2D Exonie rules
        this.hasEnteredWorld = false;
        this.player = {
            name: '',
            gender: 'female',
            hairStyle: '1',
            hairColor: '#111111',
            skinColor: '#f5c6a5',
            level: 1,
            exp: 0,
            maxExp: 100,
            gold: 500,
            baseStats: JSON.parse(JSON.stringify(DEFAULT_BASE_STATS)),
            equips: JSON.parse(JSON.stringify(STARTER_ITEMS.equips)),
            inventory: (() => {
                const bag = Array(30).fill(null);
                (STARTER_ITEMS.inventory || []).forEach((item, idx) => {
                    if (idx < 30) bag[idx] = JSON.parse(JSON.stringify(item));
                });
                return bag;
            })(),
            storage: Array(15).fill(null),
            dailyMission: null,
            tavernEntries: 5,
            dungeonEntries: 7,
            hp: 105,
            maxHp: 105,
            mp: 100,
            maxMp: 100,
            atk: 10,
            mag: 10,
            def: 4,
            totalStr: 10,
            totalInt: 10,
            speed: 6.8,
            pos: new THREE.Vector3(0, 0, 0),
            rotY: 0,
            moveDir: new THREE.Vector3()
        };

        // Recalculate full player combat stats
        this.recalculateStats();

        // Key Input & Customizable Keybinds Tracking
        this.keys = {};
        this.loadKeybinds();
        this.setupKeyboardInput();

        // Socket.IO Setup (Multiplayer sync with offline simulation fallback)
        this.initSocket();

        // Authentic 2D Persistent Chat System (Local & World Tabs + Speech Bubbles)
        this.setupChatSystem();

        // Start Animation Loop
        this.lastTime = performance.now();
        requestAnimationFrame((t) => this.gameLoop(t));
    }

    setupCustomizer3DPreview() {
        let previewScene, previewCamera, previewRenderer, previewChar;

        window.initCustomizer3D = (charData) => {
            const previewCol = document.querySelector('.customizer-preview-col');
            if (!previewCol) return;

            const existingCanvas = document.getElementById('char-preview-canvas') || previewCol.querySelector('canvas');

            const w = Math.max(300, previewCol.clientWidth || 360);
            const h = Math.max(360, previewCol.clientHeight || 480);

            if (previewRenderer && previewChar) {
                if (charData) {
                    previewChar.setCustomization({
                        gender: charData.gender || 'female',
                        hairStyle: charData.hairStyle || '1',
                        hairColor: charData.hairColor || '#111111',
                        skinColor: charData.skinColor || '#f5c6a5',
                        weaponType: null
                    });
                }
                const actualW = previewCol.clientWidth || w;
                const actualH = previewCol.clientHeight || h;
                previewCamera.aspect = actualW / actualH;
                previewCamera.updateProjectionMatrix();
                previewRenderer.setSize(actualW, actualH);
                if (previewScene) previewRenderer.render(previewScene, previewCamera);
                return;
            }

            previewScene = new THREE.Scene();
            // Transparent background so glowing pedestal ring and radial backdrop show through
            previewScene.background = null;

            previewCamera = new THREE.PerspectiveCamera(36, w / h, 0.1, 50);
            previewCamera.position.set(0, 0.88, 4.4);
            previewCamera.lookAt(0, 0.65, 0);

            previewRenderer = new THREE.WebGLRenderer({
                canvas: existingCanvas,
                antialias: true,
                alpha: true
            });
            previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            previewRenderer.setSize(w, h, false);
            previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
            previewRenderer.toneMappingExposure = 1.35;
            if (THREE.SRGBColorSpace) previewRenderer.outputColorSpace = THREE.SRGBColorSpace;

            // Pedestal platform disk under the avatar (scaled neatly to match avatar)
            const pedestalGeo = new THREE.CylinderGeometry(0.65, 0.75, 0.07, 32);
            const pedestalMat = new THREE.MeshStandardMaterial({
                color: 0x0f172a,
                metalness: 0.85,
                roughness: 0.25
            });
            const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
            pedestalMesh.position.set(0, -0.04, 0);
            previewScene.add(pedestalMesh);

            const rimGeo = new THREE.TorusGeometry(0.70, 0.018, 12, 48);
            rimGeo.rotateX(Math.PI / 2);
            const rimMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
            const rimMesh = new THREE.Mesh(rimGeo, rimMat);
            rimMesh.position.set(0, 0.005, 0);
            previewScene.add(rimMesh);

            const ambLight = new THREE.AmbientLight(0xffffff, 2.0);
            previewScene.add(ambLight);

            const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
            keyLight.position.set(2, 4, 3);
            previewScene.add(keyLight);

            const fillLight = new THREE.DirectionalLight(0x00e5ff, 1.4);
            fillLight.position.set(-2, 2, -2);
            previewScene.add(fillLight);

            const backLight = new THREE.DirectionalLight(0xfffaed, 0.9);
            backLight.position.set(0, 3, -3);
            previewScene.add(backLight);

            previewChar = new Character3D({
                name: (charData && charData.name) || 'Hero',
                gender: (charData && charData.gender) || 'female',
                hairStyle: (charData && charData.hairStyle) || '1',
                hairColor: (charData && charData.hairColor) || '#111111',
                skinColor: (charData && charData.skinColor) || '#f5c6a5',
                weaponType: null
            });
            previewChar.group.rotation.y = 0;
            // Neatly proportioned scale to comfortably fit with ample headroom
            previewChar.group.scale.set(0.66, 0.66, 0.66);
            if (previewChar.overheadGroup) {
                previewChar.overheadGroup.visible = false;
            }
            previewScene.add(previewChar.group);

            // Allow manual drag rotation on the preview canvas (mouse & touch)
            let isDraggingPreview = false;
            let lastPreviewX = 0;
            const startDrag = (clientX) => {
                isDraggingPreview = true;
                lastPreviewX = clientX;
            };
            const moveDrag = (clientX) => {
                if (isDraggingPreview && previewChar) {
                    const dx = clientX - lastPreviewX;
                    lastPreviewX = clientX;
                    previewChar.group.rotation.y += dx * 0.014;
                }
            };
            const endDrag = () => { isDraggingPreview = false; };

            const targetCanvas = previewRenderer.domElement;
            targetCanvas.addEventListener('mousedown', (e) => startDrag(e.clientX));
            window.addEventListener('mouseup', endDrag);
            window.addEventListener('mousemove', (e) => moveDrag(e.clientX));

            targetCanvas.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) startDrag(e.touches[0].clientX);
            }, { passive: true });
            window.addEventListener('touchend', endDrag);
            window.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches[0]) moveDrag(e.touches[0].clientX);
            }, { passive: true });

            // Initial synchronous render
            try {
                previewRenderer.render(previewScene, previewCamera);
            } catch(e) {}

            const animPreview = () => {
                requestAnimationFrame(animPreview);
                if (previewCol && previewRenderer && previewCamera) {
                    const curW = previewCol.clientWidth;
                    const curH = previewCol.clientHeight;
                    if (curW > 50 && curH > 50) {
                        const canvas = previewRenderer.domElement;
                        const pr = previewRenderer.getPixelRatio() || 1;
                        if (canvas.width !== Math.round(curW * pr) || canvas.height !== Math.round(curH * pr)) {
                            previewCamera.aspect = curW / curH;
                            previewCamera.updateProjectionMatrix();
                            previewRenderer.setSize(curW, curH, false);
                        }
                    }
                }
                if (previewChar) {
                    try {
                        previewChar.update(0.016, false);
                    } catch(e) {}
                }
                if (previewRenderer && previewScene && previewCamera) {
                    try {
                        previewRenderer.render(previewScene, previewCamera);
                    } catch (e) {
                        console.error('Preview render error:', e);
                    }
                }
            };
            animPreview();
        };

        window.rotateCustomizerPreview = (delta, reset = false) => {
            if (!previewChar) return;
            if (reset) {
                previewChar.group.rotation.y = 0;
            } else {
                previewChar.group.rotation.y += delta;
            }
        };

        window.updateCustomizerPreview = (charData) => {
            if (!previewChar) {
                if (window.initCustomizer3D) window.initCustomizer3D(charData);
                return;
            }
            const previewCol = document.querySelector('.customizer-preview-col');
            if (previewRenderer && previewCamera && previewCol && previewCol.clientWidth > 50 && previewCol.clientHeight > 50) {
                const curW = previewCol.clientWidth;
                const curH = previewCol.clientHeight;
                previewCamera.aspect = curW / curH;
                previewCamera.updateProjectionMatrix();
                previewRenderer.setSize(curW, curH);
            }
            if (charData) {
                previewChar.setCustomization({
                    gender: charData.gender || 'female',
                    hairStyle: charData.hairStyle || '1',
                    hairColor: charData.hairColor || '#111111',
                    skinColor: charData.skinColor || '#f5c6a5',
                    weaponType: null
                });
            }
            if (previewRenderer && previewScene && previewCamera) {
                try {
                    previewRenderer.render(previewScene, previewCamera);
                } catch (e) {}
            }
        };
    }

    initSocket() {
        try {
            if (typeof io !== 'undefined') {
                // Reuse socket already created by flow.js or create unified connection
                this.socket = (window.ExonieFlow && window.ExonieFlow.getSocket()) || window.exonieSocket;
                if (!this.socket) {
                    const serverUrl = (window.ExonieFlow && window.ExonieFlow.getActiveServerUrl)
                        ? window.ExonieFlow.getActiveServerUrl()
                        : 'http://localhost:3003';
                    this.socket = io(serverUrl, {
                        transports: ['websocket', 'polling'],
                        reconnection: true,
                        timeout: 10000
                    });
                }
                window.socket = this.socket;
                window.exonieSocket = this.socket;

                this.socket.on('connect', () => {
                    const activeUrl = (window.ExonieFlow && window.ExonieFlow.getActiveServerUrl)
                        ? window.ExonieFlow.getActiveServerUrl()
                        : 'active server';
                    console.log(`[Socket] Connected to Exonie server (Socket ID: ${this.socket.id})`);
                    this.appendChatLine('system', `📡 Connected to Exonie Server (${activeUrl.replace(/https?:\/\//, '')})`);
                    // Only send enterWorld if the player has actually chosen a character and entered the game
                    if (this.hasEnteredWorld && this.player && this.player.name) {
                        this.sendEnterWorld();
                    }
                });

                this.socket.on('disconnect', (reason) => {
                    console.warn(`[Socket] Disconnected from server: ${reason}`);
                    this.appendChatLine('system', `⚠️ Connection lost. Attempting to reconnect...`);
                });

                this.remotePlayers = {};

                // Multiplayer Realtime Sync Listeners
                this.socket.on('gameState', (data) => {
                    console.log('📡 [Multiplayer] Received gameState:', data);
                    if (data && data.self && data.self.title) {
                        this.player.title = data.self.title;
                        this.ui.updatePlayerHUD(this.player);
                        if (this.player.char3D) {
                            const guildName = this.player.guild || (this.player.guild_details && this.player.guild_details.name) || null;
                            this.player.char3D.updateOverheadUI(this.player.name, this.player.level, this.player.hp, this.player.maxHp, true, this.player.title, guildName);
                        }
                    }
                    if (data && data.players) {
                        // 🛡️ INSTANCE PRUNING: Remove any remote players who are not in our new room/map!
                        for (const sid in this.remotePlayers) {
                            if (!data.players[sid]) {
                                this.removeRemotePlayer(sid);
                            }
                        }
                        for (const [sid, pData] of Object.entries(data.players)) {
                            const myName = this.player?.name;
                            if (sid !== this.socket.id && (!myName || pData.name !== myName)) {
                                this.addRemotePlayer(sid, pData);
                            }
                        }
                    }
                });

                this.socket.on('playerJoined', (pData) => {
                    if (!pData) return;
                    const sid = pData.socketId || pData.id;
                    if (sid === this.socket.id || (this.player.name && pData.name === this.player.name)) return;
                    console.log(`👋 [Multiplayer] Remote player joined/updated: ${pData.name} (Socket: ${sid})`);
                    this.addRemotePlayer(sid, pData);
                });

                this.socket.on('playerMoved', (pData) => {
                    if (!pData || (this.player.name && pData.name === this.player.name)) return;
                    const sid = pData.socketId || pData.id;
                    if (sid === this.socket.id) return;
                    const rp = this.remotePlayers[sid];
                    if (rp) {
                        rp.targetPos.set(pData.x || 0, pData.y || 0, pData.z || 0);
                        rp.targetRotY = pData.rotY || 0;
                        rp.anim = pData.anim || 'idle';
                        if (pData.hp !== undefined) rp.hp = pData.hp;
                        if (pData.maxHp !== undefined) rp.maxHp = pData.maxHp;
                        if (pData.weapon && (!rp.weapon || rp.weapon.name !== pData.weapon.name)) {
                            rp.weapon = pData.weapon;
                            if (rp.char3D) rp.char3D.setWeaponFromObject(pData.weapon);
                        }
                    } else {
                        this.addRemotePlayer(sid, pData);
                    }
                });

                this.socket.on('playerLeft', (sid) => {
                    console.log(`[Multiplayer] Player left: ${sid}`);
                    this.removeRemotePlayer(sid);
                });

                // Home Storage Vault Synchronization (2D Exonie Home Storage Engine)
                this.socket.on('syncStorage', (storageData) => {
                    if (Array.isArray(storageData)) {
                        this.player.storage = storageData;
                        if (!this.player.baseStats) this.player.baseStats = {};
                        this.player.baseStats.homeStorage = storageData;
                        this.saveCharacterToAccountSlot();
                        if (this.ui && this.ui.renderStorage && this.ui.storageModal && this.ui.storageModal.style.display === 'flex') {
                            this.ui.renderStorage();
                        }
                    }
                });

                this.socket.on('openStorageUI', (storageData) => {
                    if (Array.isArray(storageData)) {
                        this.player.storage = storageData;
                        if (!this.player.baseStats) this.player.baseStats = {};
                        this.player.baseStats.homeStorage = storageData;
                    }
                    if (this.ui) this.ui.openStorageUI();
                });

                // 2D Exonie Chat Message Listeners (server.js lines 4795-4799)
                this.socket.on('chatMessage', (data) => {
                    if (data && data.text) {
                        const name = data.name || data.id || 'Player';
                        const senderSid = data.socketId;
                        if (senderSid !== this.socket.id && name !== this.player.name) {
                            this.appendChatLine('local', `<b>${name}:</b> ${escapeHtml(data.text)}`);
                            this.showSpeechBubble(name, data.text, senderSid);
                        }
                    }
                });

                this.socket.on('worldChatMessage', (data) => {
                    if (data && data.text) {
                        const name = data.name || data.id || 'Player';
                        const senderSid = data.socketId;
                        // Do not duplicate self-sent messages
                        if (senderSid !== this.socket.id && name !== this.player.name) {
                            this.appendChatLine('world', `<b>[W] ${name}:</b> ${escapeHtml(data.text)}`);
                            if (this.activeChatTab !== 'world') {
                                const dot = document.getElementById('world-unread-dot');
                                if (dot) dot.style.display = 'inline-block';
                            }
                        }
                    }
                });

                // 2D Exonie System Announcements & World Broadcasts (Floor Boss respawns, Neutral Zone boss, PvP deaths)
                this.socket.on('systemMessage', (msg) => {
                    if (!msg) return;
                    const rawText = typeof msg === 'string' ? msg : (msg.text || JSON.stringify(msg));
                    const formatted = `<span style="color:#ffeb3b; font-weight:bold;">[System] ${rawText}</span>`;
                    this.appendChatLine('world', formatted);
                    this.appendChatLine('local', formatted);
                    if (this.activeChatTab !== 'world') {
                        const dot = document.getElementById('world-unread-dot');
                        if (dot) dot.style.display = 'inline-block';
                    }
                    const cleanToast = rawText.startsWith('<') ? rawText.replace(/<[^>]+>/g, '') : rawText;
                    this.ui.showToast(`📢 ${cleanToast}`);

                    // Universal Not Enough Gold Popup Trigger if server returned insufficient funds
                    const textLower = rawText.toLowerCase();
                    if ((textLower.includes('not enough gold') || textLower.includes('insufficient funds') || (textLower.includes('need') && textLower.includes('gold'))) && !textLower.includes('gems')) {
                        let req = 0;
                        const match = rawText.match(/([\d,]+)\s*(?:G|Gold)/i);
                        if (match) req = parseInt(match[1].replace(/,/g, ''), 10);
                        if (this.ui?.showNotEnoughGoldModal) {
                            this.ui.showNotEnoughGoldModal(req || 1000000, this.player.gold || 0, 'Server Transaction');
                        }
                    }
                });

                this.socket.on('worldAnnouncement', (data) => {
                    if (data && data.html) {
                        this.ui.showWorldAnnouncement(data.html, data.color || '#ffd700', false);
                    }
                });

                this.socket.on('titleUnlocked', (data) => {
                    const newTitle = (typeof data === 'object' && data.title) ? data.title : data;
                    this.player.title = newTitle;
                    this.audio.playSfx('levelup');
                    this.ui.showToast(`🏆 CONQUERED! Unlocked title <${newTitle}>!`);
                    this.ui.updatePlayerHUD(this.player);
                    if (this.player.char3D) {
                        const guildName = this.player.guild || (this.player.guild_details && this.player.guild_details.name) || null;
                        this.player.char3D.updateOverheadUI(this.player.name, this.player.level, this.player.hp, this.player.maxHp, true, this.player.title, guildName);
                    }
                    this.saveCharacterToAccountSlot();
                });

                this.socket.on('playerTitleUpdated', (data) => {
                    if (!data) return;
                    const lookupId = data.id || data.socketId || data.name;
                    const rp = this.remotePlayers[lookupId] || Object.values(this.remotePlayers).find(p => p.name === data.name);
                    if (rp) {
                        rp.title = data.title;
                        if (rp.char3D) {
                            const rGuild = rp.guild || (rp.guild_details && rp.guild_details.name) || null;
                            rp.char3D.updateOverheadUI(rp.name, rp.level, rp.hp, rp.maxHp, false, rp.title, rGuild);
                        }
                    }
                });

                this.socket.on('bossCooldownSync', (cooldowns) => {
                    if (cooldowns && typeof cooldowns === 'object') {
                        this.bossCooldowns = Object.assign({}, this.bossCooldowns, cooldowns);
                        // Strict 2D Exonie: Haunted House, Town, and Tavern NEVER have cooldowns!
                        delete this.bossCooldowns['hauntedhouse'];
                        delete this.bossCooldowns['hh_wraith_king'];
                        delete this.bossCooldowns['town'];
                        delete this.bossCooldowns['trainingtavern'];
                    }
                });

                this.socket.on('bossCooldownActive', (data) => {
                    if (data && data.floorId) {
                        if (data.floorId === 'hauntedhouse' || data.floorId === 'hh_wraith_king' || data.floorId === 'town' || data.floorId === 'trainingtavern') {
                            delete this.bossCooldowns[data.floorId];
                            return;
                        }
                        if (data.remaining > 0) {
                            this.bossCooldowns[data.floorId] = Date.now() + data.remaining;
                        } else {
                            delete this.bossCooldowns[data.floorId];
                        }
                    }
                });

                this.socket.on('inspectData', (data) => {
                    if (data && this.ui) {
                        this.ui.openInspectModal(data);
                    }
                });

                this.socket.on('forceTownTeleport', () => {
                    if (this.currentMapId === 'battlefield') {
                        this.ui.showToast('🏰 The Battlefield threat has retreated. Returning to Town.');
                        this.loadMap('town');
                    }
                });

                
                // ==========================================
                // ⚔️ REMOTE PLAYER ATTACKS & SKILL VFX (Pure Visuals)
                // ==========================================
                this.socket.on('remotePlayerAttack', (data) => {
                    if (!data) return;
                    const lookupId = data.id || data.socketId || data.name;
                    const rp = this.remotePlayers[lookupId] || Object.values(this.remotePlayers || {}).find(p => p.name === data.name || p.name === data.id);
                    if (rp && rp.char3D) {
                        if (data.rotY !== undefined) rp.char3D.group.rotation.y = data.rotY;
                        rp.char3D.triggerAttack(data.comboStep || 1, data.weaponType || 'sword');
                        const rpPos = rp.char3D.group.position;
                        if (data.weaponType === 'gun') {
                            const muzzlePos = rpPos.clone().add(new THREE.Vector3(Math.sin(data.rotY || 0) * 1.15, 1.38, Math.cos(data.rotY || 0) * 1.15));
                            const targetPos = muzzlePos.clone().add(new THREE.Vector3(Math.sin(data.rotY || 0) * 20, 0, Math.cos(data.rotY || 0) * 20));
                            this.engine.spawnBulletProjectile(muzzlePos, targetPos);
                            if (this.audio) this.audio.playSfx('gunshot');
                        } else if (data.weaponType === 'staff') {
                            const castPos = rpPos.clone().add(new THREE.Vector3(Math.sin(data.rotY || 0) * 1.0, 1.6, Math.cos(data.rotY || 0) * 1.0));
                            const targetPos = castPos.clone().add(new THREE.Vector3(Math.sin(data.rotY || 0) * 16, 0, Math.cos(data.rotY || 0) * 16));
                            this.engine.spawnMagicOrb(castPos, targetPos, 0x00e5ff);
                            if (this.audio) this.audio.playSfx('magic');
                        } else if (data.weaponType === 'pendant') {
                            const castPos = rpPos.clone().add(new THREE.Vector3(Math.sin(data.rotY || 0) * 1.0, 1.6, Math.cos(data.rotY || 0) * 1.0));
                            const targetPos = castPos.clone().add(new THREE.Vector3(Math.sin(data.rotY || 0) * 16, 0, Math.cos(data.rotY || 0) * 16));
                            this.engine.spawnShimmeringProjectile(castPos, targetPos, 0xffea00);
                            if (this.audio) this.audio.playSfx('magic');
                        } else {
                            this.engine.spawnSlashArc(rpPos, data.rotY || 0, 0x00e5ff, 2.5);
                            if (this.audio) this.audio.playSfx('slash');
                        }
                    }
                });

                this.socket.on('remotePlayerSkill', (data) => {
                    if (!data) return;
                    const lookupId = data.id || data.socketId || data.name;
                    const rp = this.remotePlayers[lookupId] || Object.values(this.remotePlayers || {}).find(p => p.name === data.name || p.name === data.id);
                    if (rp && rp.char3D) {
                        if (data.rotY !== undefined) rp.char3D.group.rotation.y = data.rotY;
                        rp.char3D.triggerSkillCast(0x00e5ff);
                        rp.char3D.triggerAttack(1, 'sword');
                    }
                    const pos = (rp && rp.char3D && rp.char3D.group.position) ? rp.char3D.group.position.clone() : new THREE.Vector3(data.x, data.y || 0, data.z);
                    if (this.combat && this.combat.spawnRemoteSkillVFX) {
                        this.combat.spawnRemoteSkillVFX(data.pClass, data.skillSlot, pos, data.rotY || 0);
                    }
                });

                // ==========================================
                // ⚔️ NEUTRAL ZONE PvP DAMAGE & DEATH
                // ==========================================
                this.socket.on('remotePlayerDamaged', (data) => {
                    if (!data) return;
                    const lookupId = data.id || data.socketId;
                    const rp = this.remotePlayers[lookupId] || Object.values(this.remotePlayers || {}).find(p => p.name === data.id);
                    if (rp) {
                        rp.hp = data.hp;
                        rp.maxHp = data.maxHp;
                        if (rp.char3D) {
                            rp.char3D.updateOverheadUI(rp.name, rp.level, rp.hp, rp.maxHp, false, rp.title, rp.guild);
                            this.engine.spawnHitSparks(rp.char3D.group.position, 0xff1744, 18);
                        }
                    }
                });

                this.socket.on('playerDefeated', (data) => {
                    this.player.hp = 0;
                    this.isGhost = true;
                    if (this.player.char3D) {
                        this.player.char3D.triggerDeath();
                    }
                    this.ui.showDeathScreen(data?.killer ? `Slain in PvP by ${data.killer}` : 'You have fallen in battle.');
                });

                this.socket.on('forceTeleport', (data) => {
                    if (data && data.mapId) {
                        if (data.isMazeTrial !== undefined) {
                            this.isMazeTrial = !!data.isMazeTrial;
                        }
                        this.loadMap(data.mapId, data.x, data.z);
                    }
                });

                // ==========================================
                // 🏰 GUILD SYSTEM REALTIME SYNC
                // ==========================================
                this.socket.on('guildDataResponse', (data) => {
                    if (this.ui) this.ui.renderGuildModal(data);
                });

                this.socket.on('guildInviteReceived', (data) => {
                    if (this.ui) this.ui.showGuildInvite(data);
                });

                this.socket.on('requestGuildUI_Refresh', () => {
                    if (this.ui && this.ui.isGuildModalOpen()) {
                        this.socket.emit('requestGuildData');
                    }
                });

                // 🏡 HOME PURCHASED SYNC (Per Character)
                this.socket.on('homeBought', (data) => {
                    const newGold = (data && data.gold !== undefined) ? data.gold : data;
                    if (typeof newGold === 'number') {
                        this.player.gold = newGold;
                    }
                    if (!this.player.baseStats) this.player.baseStats = {};
                    this.player.baseStats.hasHome = true;
                    this.saveCharacterToAccountSlot();
                    if (this.ui) {
                        this.ui.updatePlayerHUD(this.player);
                        const modal = document.getElementById('home-sale-modal');
                        if (modal) modal.style.display = 'none';
                        this.ui.showToast('🏡 Congratulations! You are now a Homeowner! You can enter your Home anytime.');
                    }
                    this.audio.playSfx('levelup');
                });

                this.socket.on('updateLocalGuildTag', (guildName) => {
                    this.player.guild = guildName;
                    if (this.player.guild_details) this.player.guild_details.name = guildName;
                    else if (guildName) this.player.guild_details = { name: guildName, role: 'Member', level: 0 };
                    if (this.player.char3D) {
                        this.player.char3D.updateOverheadUI(this.player.name, this.player.level, this.player.hp, this.player.maxHp, true, this.player.title, guildName);
                    }
                });

                this.socket.on('syncGuildDetails', (details) => {
                    if (!details) return;
                    this.player.guild_details = Object.assign({}, this.player.guild_details || {}, details);
                    if (details.name) this.player.guild = details.name;
                    this.recalculateStats();
                    if (this.player.char3D) {
                        this.player.char3D.updateOverheadUI(this.player.name, this.player.level, this.player.hp, this.player.maxHp, true, this.player.title, this.player.guild);
                    }
                    if (this.ui) {
                        this.ui.updatePlayerHUD(this.player);
                    }
                    this.saveCharacterToAccountSlot();
                });

                this.socket.on('goldUpdate', (data) => {
                    if (!data) return;
                    const newGold = data.gold !== undefined ? data.gold : data.newGold;
                    if (typeof newGold === 'number') {
                        this.player.gold = newGold;
                        this.saveCharacterToAccountSlot();
                        if (this.ui) this.ui.updatePlayerHUD(this.player);
                    }
                });

                this.socket.on('purchaseSuccess', (data) => {
                    if (!data) return;
                    const newGold = data.newGold !== undefined ? data.newGold : data.gold;
                    if (typeof newGold === 'number') {
                        this.player.gold = newGold;
                        this.saveCharacterToAccountSlot();
                        if (this.ui) this.ui.updatePlayerHUD(this.player);
                    }
                    if (Array.isArray(data.inventory)) {
                        this.player.inventory = data.inventory;
                        if (this.ui) this.ui.renderInventory();
                    }
                });

                this.socket.on('applyGammaShield', (data) => {
                    if (!data) return;
                    if (data.targetId === this.player.name) {
                        this.player.shieldHp = data.hp || 20;
                        this.createPlayerShieldVFX();
                    } else {
                        const rp = Object.values(this.remotePlayers || {}).find(p => p.name === data.targetId || p.id === data.targetId);
                        if (rp && rp.char3D) {
                            rp.char3D.attachGammaShield();
                        }
                    }
                });

                this.socket.on('breakGammaShield', (data) => {
                    if (!data) return;
                    if (data.targetId === this.player.name) {
                        this.destroyPlayerShieldVFX();
                    } else {
                        const rp = Object.values(this.remotePlayers || {}).find(p => p.name === data.targetId || p.id === data.targetId);
                        if (rp && rp.char3D) {
                            rp.char3D.detachGammaShield();
                            this.engine.spawnHitSparks(rp.currentPos || rp.char3D.group.position, 0x00e5ff, 22);
                        }
                    }
                });

                this.socket.on('partyHeal', (data) => {
                    if (!data || data.healerName === this.player.name) return;
                    const healAmt = Number(data.healAmt) || 25;
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
                    this.combat.spawnFloatingDamage(this.player.pos, `+${healAmt} HP (${data.healerName})`, false, true);
                    this.engine.spawnHitSparks(this.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0x00e676, 20);
                    if (this.ui) this.ui.updatePlayerHUD(this.player);
                });

                this.socket.on('partyRevive', (data) => {
                    if (!data) return;
                    if (this.isGhost) {
                        this.isGhost = false;
                        this.player.hp = this.player.maxHp;
                        if (this.ui) {
                            this.ui.hideDeathScreen();
                            this.ui.updatePlayerHUD(this.player);
                            this.ui.showToast(`✨ Revived by ${data.healerName}'s Purification miracle!`);
                        }
                        this.engine.spawnLevelUpVFX(this.player.pos);
                        this.combat.spawnFloatingDamage(this.player.pos, `✨ REVIVED BY ${data.healerName}!`, true, true);
                    }
                });

                this.socket.on('syncInventory', (newInv) => {
                    if (Array.isArray(newInv)) {
                        while (newInv.length < 30) newInv.push(null);
                        this.player.inventory = newInv;
                        if (this.ui) this.ui.renderInventory();
                    }
                });

                this.socket.on('playerEquipsChanged', (data) => {
                    if (!data) return;
                    const sid = data.socketId || data.id;
                    const rp = this.remotePlayers[sid] || Object.values(this.remotePlayers).find(p => p.name === data.name);
                    if (rp) {
                        rp.equips = data.equips || {};
                        rp.weapon = data.weapon || data.equips?.weapon || null;
                        if (rp.char3D) {
                            rp.char3D.setWeaponFromObject(rp.weapon);
                            rp.char3D.setCosmeticAura(rp.equips?.aura?.id || null);
                            rp.char3D.setCosmeticPet(rp.equips?.pet?.id || null);
                        }
                    }
                });

                this.socket.on('partyInvite', (data) => {
                    if (this.ui) {
                        this.ui.showToast(`⚔️ [PARTY INVITE] ${data.from} invited you to join their party!`);
                        this.ui.showPartyInvitePrompt(data);
                    }
                    this.appendChatLine('system', `⚔️ <b>${data.from}</b> invited you to join their party.`);
                });

                this.socket.on('partyInviteReceived', (data) => {
                    if (this.ui) {
                        this.ui.showToast(`⚔️ [PARTY INVITE] ${data.fromId || data.from} invited you to join their party!`);
                        this.ui.showPartyInvitePrompt(data);
                    }
                });

                this.socket.on('partyUpdate', (partyData) => {
                    this.party = partyData;
                    if (this.ui) this.ui.updatePartyHUD(partyData);
                });

                this.socket.on('partyKickedOrLeft', () => {
                    this.party = null;
                    if (this.ui) {
                        this.ui.updatePartyHUD(null);
                        this.ui.showToast('You left the party.');
                    }
                });

                this.socket.on('partyError', (msg) => {
                    if (this.ui) this.ui.showToast(`⚠️ ${msg}`);
                });

                this.socket.on('friendsListUpdate', (friendsList) => {
                    if (this.ui) this.ui.renderFriendsList(friendsList);
                });

                this.socket.on('updateLeaderboardUI', (rows) => {
                    if (this.ui) this.ui.renderLeaderboardData(rows);
                });

                this.socket.on('topTavernPlayers', (top3) => {
                    window.topTavernPlayers = Array.isArray(top3) ? top3 : [];
                    if (this.player && this.player.char3D) {
                        this.player.char3D._lastName = null;
                    }
                    for (const id in this.remotePlayers) {
                        if (this.remotePlayers[id]?.char3D) {
                            this.remotePlayers[id].char3D._lastName = null;
                        }
                    }
                });

                this.socket.on('tavernVictory', (data) => {
                    if (data && data.isNewBest) {
                        this.ui.showToast('🏆 NEW PERSONAL BEST! Tavern run recorded to Leaderboard!');
                        this.socket.emit('getTavernLeaderboard');
                    }
                });

                this.socket.on('raidInvite', (data) => {
                    if (this.ui) this.ui.showToast(`🏰 [RAID INVITE] ${data.from} invited you to join a Raid Team!`);
                    this.appendChatLine('system', `🏰 <b>${data.from}</b> invited you to join their Raid team.`);
                });

                this.socket.on('friendRequest', (data) => {
                    if (this.ui) this.ui.showToast(`🤝 [FRIEND REQUEST] ${data.from} sent you a friend request!`);
                    this.appendChatLine('system', `🤝 <b>${data.from}</b> sent you a friend request.`);
                });

                // 🔄 Trade Socket Listeners (2D Exonie Engine)
                this.socket.on('tradeInviteReceived', (data) => {
                    if (!data) return;
                    const fromName = data.fromId || data.from || 'A player';
                    if (this.ui) this.ui.showTradeDialog(fromName);
                    this.appendChatLine('system', `🔄 <b>${fromName}</b> invited you to trade.`);
                });

                this.socket.on('tradeStarted', (data) => {
                    if (!data) return;
                    const targetName = data.targetName || data.targetId || 'Hero';
                    this.tradeTarget = targetName;
                    this.myTradeItems = [null, null, null];
                    this.theirTradeItems = [null, null, null];
                    this.myTradeGold = 0;
                    this.theirTradeGold = 0;
                    if (this.ui) {
                        this.ui.openTradeModal(targetName);
                        this.ui.showToast(`🔄 Trade started with ${targetName}!`);
                    }
                });

                this.socket.on('tradeSyncReceived', (data) => {
                    if (!data) return;
                    this.theirTradeGold = data.gold || 0;
                    this.theirTradeItems = Array.isArray(data.items) ? data.items : [];
                    if (this.ui) {
                        this.ui.updateTradeRemoteOffer(this.theirTradeGold, this.theirTradeItems);
                    }
                });

                this.socket.on('tradeConfirmStatus', (data) => {
                    if (!data) return;
                    if (this.ui) {
                        this.ui.setTradeConfirmState(data.meConfirmed, data.otherConfirmed);
                    }
                });

                this.socket.on('tradeDone', (data) => {
                    if (!data) return;
                    if (data.newGold !== undefined) this.player.gold = data.newGold;
                    if (data.newInventory) this.player.inventory = data.newInventory;
                    this.myTradeItems = [null, null, null];
                    this.theirTradeItems = [null, null, null];
                    this.myTradeGold = 0;
                    this.theirTradeGold = 0;
                    this.tradeTarget = null;
                    this.saveCharacterToAccountSlot();
                    if (this.ui) {
                        this.ui.closeTradeModal();
                        this.ui.updatePlayerHUD(this.player);
                        this.ui.renderInventory();
                        this.ui.showToast('🎉 Trade completed successfully!');
                    }
                    this.audio.playSfx('levelup');
                });

                this.socket.on('tradeCancelled', () => {
                    this.myTradeItems = [null, null, null];
                    this.theirTradeItems = [null, null, null];
                    this.myTradeGold = 0;
                    this.theirTradeGold = 0;
                    this.tradeTarget = null;
                    if (this.ui) {
                        this.ui.closeTradeModal();
                        this.ui.showToast('⚠️ The trade was cancelled.');
                    }
                    this.audio.playSfx('bump');
                });

                // ⚔️ Party Portal Wait Alert (Debounced to avoid annoying chat spam)
                this.socket.on('partyPortalWaitAlert', (data) => {
                    if (!data) return;
                    const now = Date.now();
                    if (this._lastPortalAlertTime && (now - this._lastPortalAlertTime < 12000)) return;
                    this._lastPortalAlertTime = now;
                    this.audio.playSfx('bump');
                    if (this.ui) {
                        this.ui.showToast(`⚔️ [Party Teleport] ${data.from} is waiting at ${data.portalName}! (${data.readyCount}/${data.totalCount} ready)`);
                    }
                    this.appendChatLine('system', `⚔️ [Party Portal] <b>${data.from}</b> is waiting at <b>${data.portalName}</b>! Step on the portal to enter together!`);
                });

                // 💎 Cash Shop & Steam Microtransactions Realtime Balance Sync
                this.socket.on('shopAuthState', (data) => {
                    if (!this.player.baseStats) this.player.baseStats = {};
                    this.player.baseStats.exoGems = data.exoGems || 0;
                    const balEl = document.getElementById('ui-gem-balance');
                    if (balEl) balEl.innerText = this.player.baseStats.exoGems;
                });

                this.socket.on('gemPurchaseSuccess', (data) => {
                    if (!this.player.baseStats) this.player.baseStats = {};
                    this.player.baseStats.exoGems = data.newGems;
                    const balEl = document.getElementById('ui-gem-balance');
                    if (balEl) balEl.innerText = data.newGems;
                    this.saveCharacterToAccountSlot();
                    if (this.ui) {
                        this.ui.showToast(`💎 [EXO GEMS] Balance updated: ${data.newGems} Exo Gems!`);
                    }
                });

                this.socket.on('receiptVerified', (data) => {
                    if (!this.player.baseStats) this.player.baseStats = {};
                    this.player.baseStats.exoGems = data.newGems;
                    const balEl = document.getElementById('ui-gem-balance');
                    if (balEl) balEl.innerText = data.newGems;
                    this.saveCharacterToAccountSlot();
                    document.getElementById('steam-overlay-notice-modal')?.remove();
                    if (this.ui) {
                        this.ui.showToast(`🎉 Purchase Verified! Added ${data.gemsAdded} Exo Gems. Balance: ${data.newGems}`);
                    }
                    window.openRealMoneyShop();
                });

                this.socket.on('receiptFailed', (errorMsg) => {
                    document.getElementById('steam-overlay-notice-modal')?.remove();
                    alert("Purchase verification failed: " + errorMsg);
                    window.openRealMoneyShop();
                });

                // 📬 System Mailbox Listeners
                this.socket.on('mailList', (mails) => {
                    if (this.ui) this.ui.renderMailList(mails);
                });

                this.socket.on('mailClaimSuccess', (mailId) => {
                    if (this.ui) this.ui.onMailClaimed(mailId);
                });
            }
        } catch (e) {
            console.log('Running in standalone local simulation mode', e);
        }
    }

    addRemotePlayer(id, data) {
        if (!id || !data) return;
        const charName = data.name || data.character_name || 'Exonian';

        // If player already exists, check if their model needs to be re-created (e.g. name or appearance changed)
        if (this.remotePlayers[id]) {
            const existing = this.remotePlayers[id];
            if (existing.name !== charName || existing.gender !== data.gender || String(existing.hairStyle) !== String(data.hairStyle || '1') || existing.hairColor !== data.hairColor) {
                this.removeRemotePlayer(id);
            } else {
                // Otherwise refresh stats, equips and weapon
                existing.level = data.level || existing.level || 1;
                existing.hp = data.hp || existing.hp || 500;
                existing.maxHp = data.maxHp || existing.maxHp || 500;
                existing.className = data.className || data.playerClass || existing.className;
                existing.playerClass = existing.className;
                existing.equips = data.equips || existing.equips;
                if (data.title) existing.title = data.title;
                const w = (data.equips && data.equips.weapon) || data.weapon || existing.weapon;
                if (w && existing.char3D) existing.char3D.setWeaponFromObject(w);
                if (existing.char3D) {
                    existing.char3D.setCosmeticAura(existing.equips?.aura?.id || null);
                    existing.char3D.setCosmeticPet(existing.equips?.pet?.id || null);
                }
                if (existing.char3D) {
                    const eg = existing.guild || (existing.guild_details && existing.guild_details.name) || null;
                    existing.char3D.updateOverheadUI(existing.name, existing.level, existing.hp, existing.maxHp, false, existing.title || null, eg);
                }
                return;
            }
        }

        const wpn = (data.equips && data.equips.weapon) || data.weapon || null;
        const char3D = new Character3D({
            name: charName,
            gender: data.gender || 'female',
            hairStyle: String(data.hairStyle || '1'),
            hairColor: data.hairColor || '#111111',
            skinColor: data.skinColor || '#f5c6a5',
            className: data.className || data.playerClass || 'Novice',
            weapon: wpn,
            weaponType: wpn ? (wpn.weaponType || wpn.sprite) : null,
            weaponRarity: wpn ? (wpn.rarity || 'Starter') : 'Starter',
            armorRarity: (data.equips && data.equips.armor) ? data.equips.armor.rarity : 'Starter',
            leggingsRarity: (data.equips && data.equips.leggings) ? data.equips.leggings.rarity : 'Starter'
        });
        if (wpn) {
            char3D.setWeaponFromObject(wpn);
        }
        if (data.equips?.aura) {
            char3D.setCosmeticAura(data.equips.aura.id);
        }
        if (data.equips?.pet) {
            char3D.setCosmeticPet(data.equips.pet.id);
        }
        char3D.group.position.set(data.x || 0, data.y || 0, data.z || 0);
        char3D.group.rotation.y = data.rotY || 0;
        this.engine.scene.add(char3D.group);

        this.remotePlayers[id] = {
            id: id,
            socketId: data.socketId || id,
            name: charName,
            character_name: charName,
            gender: data.gender || 'female',
            hairStyle: String(data.hairStyle || '1'),
            hairColor: data.hairColor || '#111111',
            skinColor: data.skinColor || '#f5c6a5',
            level: data.level || 1,
            hp: data.hp || 500,
            maxHp: data.maxHp || 500,
            className: data.className || data.playerClass || 'Novice',
            playerClass: data.className || data.playerClass || 'Novice',
            char3D: char3D,
            equips: data.equips || {},
            weapon: wpn,
            currentPos: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
            targetPos: new THREE.Vector3(data.x || 0, data.y || 0, data.z || 0),
            targetRotY: data.rotY || 0,
            title: data.title || null,
            guild: data.guild || (data.guild_details && data.guild_details.name) || null
        };
        const dg = data.guild || (data.guild_details && data.guild_details.name) || null;
        char3D.updateOverheadUI(charName, data.level || 1, data.hp || 500, data.maxHp || 500, false, data.title || null, dg);
    }

    removeRemotePlayer(id) {
        const rp = this.remotePlayers[id];
        if (rp) {
            if (this.hoveredPlayer === rp) {
                this.clearHoveredPlayer();
            }
            if (rp.char3D && rp.char3D.group) {
                this.engine.scene.remove(rp.char3D.group);
            }
            delete this.remotePlayers[id];
        }
    }

    updateRemotePlayers(delta) {
        if (!this.remotePlayers) return;
        for (const [id, rp] of Object.entries(this.remotePlayers)) {
            const dist = rp.currentPos.distanceTo(rp.targetPos);
            const isMoving = dist > 0.08;
            rp.currentPos.lerp(rp.targetPos, Math.min(1, delta * 10));
            rp.char3D.group.position.copy(rp.currentPos);
            rp.char3D.group.rotation.y = rp.targetRotY;
            rp.char3D.update(delta, isMoving, 1.0);
            const rg = rp.guild || (rp.guild_details && rp.guild_details.name) || null;
            rp.char3D.updateOverheadUI(rp.name, rp.level, rp.hp, rp.maxHp, false, rp.title || null, rg);
        }
    }

    sendEnterWorld() {
        if (!this.socket || !this.socket.connected || !this.player || !this.player.name) return;
        this.hasEnteredWorld = true;
        const pClass = this.player.baseStats?.playerClass || 'Novice';
        const activeSlot = (this.player.slotIndex !== undefined && this.player.slotIndex !== null)
            ? Number(this.player.slotIndex)
            : (window.ExonieFlow?.activeSlotIndex ?? 0);
        this.socket.emit('enterWorld', {
            email: this.player.email || window.ExonieFlow?.accountEmail || '',
            slotIndex: activeSlot,
            character_name: this.player.name,
            name: this.player.name,
            gender: this.player.gender || 'female',
            hairStyle: String(this.player.hairStyle || '1'),
            hairColor: this.player.hairColor || '#111111',
            skinColor: this.player.skinColor || '#f5c6a5',
            level: this.player.level || 1,
            playerClass: pClass,
            equips: this.player.equips || {},
            weapon: this.player.equips ? this.player.equips.weapon : null,
            mapId: this.currentMapId || 'town',
            hp: this.player.hp || 100,
            maxHp: this.player.maxHp || 100,
            x: this.player.pos ? this.player.pos.x : 0,
            y: this.player.pos ? this.player.pos.y : 0,
            z: this.player.pos ? this.player.pos.z : 0,
            rotY: this.player.rotY || 0
        });
    }

    setupChatSystem() {
        this.activeChatTab = 'local';
        this.isChatting = false;
        this.lastChatTime = 0;
        const chatInput = document.getElementById('chat-input');
        const chatBox = document.getElementById('persistent-chat-box');
        const toggleBtn = document.getElementById('btn-mobile-chat-toggle');
        const minBtn = document.getElementById('chat-minimize-btn');
        const minIcon = document.getElementById('chat-min-icon');
        const minLabel = document.getElementById('chat-min-label');

        window.switchChatTab = (tab) => {
            this.activeChatTab = tab;
            document.querySelectorAll('.chat-tab').forEach(b => {
                if (b.id === `chat-tab-${tab}`) b.classList.add('active');
                else if (b.id === 'chat-tab-local' || b.id === 'chat-tab-world') b.classList.remove('active');
            });

            const localContent = document.getElementById('chat-tab-content-local');
            const worldContent = document.getElementById('chat-tab-content-world');

            if (tab === 'local') {
                if (localContent) localContent.style.display = 'flex';
                if (worldContent) worldContent.style.display = 'none';
            } else {
                if (localContent) localContent.style.display = 'none';
                if (worldContent) worldContent.style.display = 'flex';
                const unreadDot = document.getElementById('world-unread-dot');
                if (unreadDot) unreadDot.style.display = 'none';
            }
        };

        window.submitChat = () => this.submitChat();

        // 1. Shrink Chat function: collapses chat window COMPLETELY into the small button
        const shrinkChat = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (chatInput) chatInput.blur();
            this.isChatting = false;

            if (chatBox) {
                chatBox.classList.remove('chat-open', 'mobile-open');
                chatBox.classList.add('chat-closed');
                chatBox.style.setProperty('display', 'none', 'important');
            }
            if (toggleBtn) {
                toggleBtn.classList.remove('hidden');
                toggleBtn.classList.add('visible');
                toggleBtn.style.setProperty('display', 'flex', 'important');
            }
            if (minIcon) minIcon.textContent = '▾';
            if (minLabel) minLabel.textContent = 'Shrink';
        };

        // 2. Expand / Open Chat function: opens chat window
        const expandChat = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const unreadBadge = document.getElementById('m-chat-unread-badge');
            if (unreadBadge) unreadBadge.style.display = 'none';

            if (chatBox) {
                chatBox.classList.remove('chat-closed');
                chatBox.classList.add('chat-open', 'mobile-open');
                chatBox.style.setProperty('display', 'flex', 'important');
            }
            if (toggleBtn) {
                toggleBtn.classList.remove('visible');
                toggleBtn.classList.add('hidden');
                toggleBtn.style.setProperty('display', 'none', 'important');
            }
            if (minIcon) minIcon.textContent = '▾';
            if (minLabel) minLabel.textContent = 'Shrink';

            // Auto-scroll messages to bottom
            const activeCont = this.activeChatTab === 'world'
                ? document.getElementById('world-chat-content')
                : document.getElementById('persistent-chat-content');
            if (activeCont && activeCont.parentElement) {
                activeCont.parentElement.scrollTop = activeCont.parentElement.scrollHeight;
            }
        };

        this.shrinkChat = shrinkChat;
        this.expandChat = expandChat;
        window.shrinkChat = shrinkChat;
        window.expandChat = expandChat;
        window.toggleChatBoxMinimized = (e) => {
            if (chatBox && (chatBox.classList.contains('chat-open') || chatBox.classList.contains('mobile-open') || chatBox.style.display === 'flex')) {
                shrinkChat(e);
            } else {
                expandChat(e);
            }
        };

        // Bind Small Mobile Button to expand chat
        if (toggleBtn) {
            toggleBtn.onclick = expandChat;
            toggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            toggleBtn.addEventListener('touchend', expandChat);
        }

        // Bind Shrink Button in chat tab bar to shrink chat
        if (minBtn) {
            minBtn.onclick = shrinkChat;
            minBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
            minBtn.addEventListener('touchend', shrinkChat);
        }

        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.code === 'Enter') {
                    e.preventDefault();
                    this.submitChat();
                } else if (e.code === 'Escape') {
                    e.preventDefault();
                    chatInput.value = '';
                    chatInput.blur();
                    this.isChatting = false;
                    shrinkChat();
                }
            });
            chatInput.addEventListener('focus', () => {
                this.isChatting = true;
            });
            chatInput.addEventListener('blur', () => {
                this.isChatting = false;
            });
        }
    }

    submitChat() {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) return;
        const text = chatInput.value.trim();
        if (text.length > 0) {
            this.sendChatMessage(text);
        }
        chatInput.value = '';
        chatInput.blur();
        this.isChatting = false;
    }

    openChatInput() {
        if (this.expandChat) this.expandChat();
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            chatInput.focus();
            this.isChatting = true;
        }
    }

    sendChatMessage(text) {
        if (!text) return;

        if (text.startsWith('/inspect')) {
            const targetName = text.replace('/inspect', '').trim();
            this.inspectPlayer(targetName || this.player.name);
            return;
        }

        const now = performance.now();
        if (this.lastChatTime && (now - this.lastChatTime) < 2500) {
            this.appendChatLine('system', '⚠️ Please wait before sending another chat message (2.5s anti-spam limit).');
            return;
        }
        this.lastChatTime = now;

        const playerName = this.player.name || 'Hero';

        if (this.activeChatTab === 'world') {
            const formatted = `<b>[W] ${playerName}:</b> ${escapeHtml(text)}`;
            this.appendChatLine('world', formatted);
            if (this.socket) {
                this.socket.emit('worldChatMessage', { id: playerName, name: playerName, socketId: this.socket.id, text });
            }
        } else {
            const formatted = `<b>${playerName}:</b> ${escapeHtml(text)}`;
            this.appendChatLine('local', formatted);
            this.showSpeechBubble(playerName, text, this.socket?.id);
            if (this.socket) {
                this.socket.emit('chatMessage', { id: playerName, name: playerName, socketId: this.socket.id, text });
            }
        }
    }

    appendChatLine(channel, htmlContent) {
        const container = channel === 'world'
            ? document.getElementById('world-chat-content')
            : document.getElementById('persistent-chat-content');
        if (container) {
            const line = document.createElement('div');
            line.className = `chat-line ${channel}-line`;
            line.innerHTML = htmlContent;
            container.appendChild(line);

            const parent = container.parentElement;
            if (parent) {
                parent.scrollTop = parent.scrollHeight;
            }
        }

        // Show unread indicator on mobile small button if chat is currently closed/shrunk
        const chatBox = document.getElementById('persistent-chat-box');
        if (!chatBox || !chatBox.classList.contains('mobile-open')) {
            const badge = document.getElementById('m-chat-unread-badge');
            if (badge) badge.style.display = 'block';
        }
    }

    showSpeechBubble(speakerName, text, speakerSocketId = null) {
        const bubble = document.createElement('div');
        bubble.className = 'overhead-chat-bubble';
        bubble.innerText = text;

        const getTargetPos = () => {
            if ((!speakerName && !speakerSocketId) || (speakerName && speakerName === this.player.name) || (speakerSocketId && speakerSocketId === this.socket?.id)) {
                return this.player.pos;
            }
            // 1. Match remote player by exact socketId
            if (speakerSocketId && this.remotePlayers[speakerSocketId]) {
                return this.remotePlayers[speakerSocketId].currentPos;
            }
            // 2. Match remote player by character name
            if (speakerName) {
                const rp = Object.values(this.remotePlayers).find(p => p && (p.name === speakerName || p.character_name === speakerName));
                if (rp && rp.currentPos) return rp.currentPos;
            }
            // NEVER fallback to local player if it is another player's message!
            return null;
        };

        const updateBubblePos = () => {
            const pos = getTargetPos();
            if (!pos || !this.engine || !this.engine.camera) return;
            const p = pos.clone().add(new THREE.Vector3(0, 2.3, 0));
            p.project(this.engine.camera);
            if (p.z > 1.0) {
                bubble.style.display = 'none';
                return;
            }
            bubble.style.display = 'block';
            const x = (p.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-(p.y * 0.5) + 0.5) * window.innerHeight;
            bubble.style.left = `${x}px`;
            bubble.style.top = `${y}px`;
        };

        updateBubblePos();
        document.body.appendChild(bubble);

        const interval = setInterval(updateBubblePos, 16);
        setTimeout(() => {
            clearInterval(interval);
            if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
        }, 4000);
    }

    onFlowComplete(charData) {
        try {
            // Dismiss any pre-game screen overlays so 3D world is immediately visible
            ['scr-splash', 'auth-screen', 'char-select-screen', 'creation-screen', 'prologue-screen'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.add('hidden');
                    el.style.display = 'none';
                }
            });

            // Ensure loading screen is dismissed when map is ready
            setTimeout(() => {
                const ls = document.getElementById('loading-screen');
                if (ls) {
                    ls.classList.remove('active');
                    ls.style.display = 'none';
                }
            }, 800);

        // Remove previous 3D character mesh if switching characters
        if (this.player.char3D && this.player.char3D.group) {
            this.engine.scene.remove(this.player.char3D.group);
        }

        const isExisting = charData && charData.isNewCharacter === false;
        this.player.name = charData.name || 'Hero';
        this.player.gender = charData.gender === 'male' ? 'male' : 'female';
        let rawStyle = String(charData.hairStyle !== undefined ? charData.hairStyle : '1').trim();
        if (!['1', '2', '3', '4', '5'].includes(rawStyle)) rawStyle = '1';
        this.player.hairStyle = rawStyle;
        this.player.hairColor = charData.hairColor || '#111111';
        this.player.skinColor = charData.skinColor || '#f5c6a5';
        this.player.slotIndex = charData.slotIndex !== undefined ? Number(charData.slotIndex) || 0 : (window.ExonieFlow?.activeSlotIndex || 0);
        this.player.email = charData.email || window.ExonieFlow?.accountEmail || '';

        if (isExisting) {
            let baseStats = charData.baseStats || charData.base_stats;
            if (typeof baseStats === 'string') {
                try { baseStats = JSON.parse(baseStats); } catch(e) { baseStats = null; }
            }
            if (!baseStats || typeof baseStats !== 'object') {
                baseStats = JSON.parse(JSON.stringify(DEFAULT_BASE_STATS));
            }
            this.player.baseStats = baseStats;

            let equips = charData.equips;
            if (typeof equips === 'string') {
                try { equips = JSON.parse(equips); } catch(e) { equips = null; }
            }
            if (!equips || typeof equips !== 'object' || Array.isArray(equips)) {
                equips = JSON.parse(JSON.stringify(STARTER_ITEMS.equips));
            }
            this.player.equips = equips;

            let inventory = charData.inventory;
            if (typeof inventory === 'string') {
                try { inventory = JSON.parse(inventory); } catch(e) { inventory = null; }
            }
            if (!Array.isArray(inventory)) {
                inventory = JSON.parse(JSON.stringify(STARTER_ITEMS.inventory));
            }
            while (inventory.length < 30) inventory.push(null);
            this.player.inventory = inventory;

            this.player.level = Number(charData.level) || Number(baseStats.level) || 1;
            this.player.exp = Number(charData.exp) || 0;
            this.player.maxExp = Number(charData.maxExp) || getExpForNextLevel(this.player.level) || 100;
            this.player.gold = Number(charData.gold !== undefined ? charData.gold : (baseStats.gold !== undefined ? baseStats.gold : 500)) || 0;

            // 🧰 Ensure storage is loaded from charData.storage OR baseStats.homeStorage reliably
            let loadedStorage = null;
            if (Array.isArray(charData.storage) && charData.storage.length === 15) {
                loadedStorage = charData.storage;
            } else if (baseStats && Array.isArray(baseStats.homeStorage) && baseStats.homeStorage.length === 15) {
                loadedStorage = baseStats.homeStorage;
            } else if (charData.base_stats && Array.isArray(charData.base_stats.homeStorage) && charData.base_stats.homeStorage.length === 15) {
                loadedStorage = charData.base_stats.homeStorage;
            }
            if (!loadedStorage) {
                let sArr = (baseStats && Array.isArray(baseStats.homeStorage)) ? baseStats.homeStorage.slice(0, 15)
                    : (charData && Array.isArray(charData.storage)) ? charData.storage.slice(0, 15) : [];
                while (sArr.length < 15) sArr.push(null);
                loadedStorage = sArr;
            }
            this.player.storage = JSON.parse(JSON.stringify(loadedStorage));
            if (!this.player.baseStats) this.player.baseStats = {};
            this.player.baseStats.homeStorage = this.player.storage;
            this.player.dailyMission = charData.dailyMission || null;
            this.player.tavernEntries = charData.tavernEntries !== undefined ? Number(charData.tavernEntries) || 5 : 5;
            this.player.dungeonEntries = charData.dungeonEntries !== undefined ? Number(charData.dungeonEntries) || 7 : 7;
        } else {
            this.player.level = 1;
            this.player.exp = 0;
            this.player.maxExp = 100;
            this.player.gold = 500;
            this.player.baseStats = JSON.parse(JSON.stringify(DEFAULT_BASE_STATS));
            this.player.equips = JSON.parse(JSON.stringify(STARTER_ITEMS.equips));
            const starterBag = Array(30).fill(null);
            (STARTER_ITEMS.inventory || []).forEach((item, idx) => {
                if (idx < 30) starterBag[idx] = JSON.parse(JSON.stringify(item));
            });
            this.player.inventory = starterBag;
            this.player.storage = Array(15).fill(null);
            this.player.dailyMission = null;
            this.player.tavernEntries = 5;
            this.player.dungeonEntries = 7;
        }

        if (!this.player.pos || Number.isNaN(this.player.pos.x) || Number.isNaN(this.player.pos.z)) {
            this.player.pos = new THREE.Vector3(0, 0, 0);
        }
        this.player.speed = 6.8;

        this.recalculateStats();
        this.player.hp = this.player.maxHp;
        this.player.mp = this.player.maxMp;

        // Show HUD (and Mobile Controls ONLY on touch/mobile devices - Circuit Siege Architecture)
        const hud = document.getElementById('game-hud');
        if (hud) hud.style.display = 'flex';
        const ua = navigator.userAgent || '';
        const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        const hasTouch = (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) || ('ontouchstart' in window);
        const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const isTouch = isMobileUA || (hasTouch && isCoarse) || document.body.classList.contains('touch-enabled') || window.innerWidth <= 950;
        if (isTouch) document.body.classList.add('touch-enabled');
        const mobileCtrl = document.getElementById('mobile-controls');
        if (mobileCtrl) mobileCtrl.style.display = isTouch ? 'block' : 'none';

        // Blur any active input and clear keystrokes so movement is immediate
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        this.keys = {};
        this.isChatting = false;

        // Reveal persistent chat box inside the active game world
        const chatBox = document.getElementById('persistent-chat-box');
        if (chatBox) {
            chatBox.classList.add('in-game');
            if (isTouch) {
                // Mobile default: CHAT DEFAULTS AS SHRUNK (HIDDEN), SMALL BUTTON IS SHOWN
                this.shrinkChat();
            } else {
                this.expandChat();
            }
        }

        const equippedWpnType = this.getEquippedWeaponType();
        const equippedRarity = this.player.equips?.weapon?.rarity || 'Starter';
        const equippedArmorRarity = this.player.equips?.armor?.rarity || 'Starter';
        const equippedLeggingsRarity = this.player.equips?.leggings?.rarity || 'Starter';

        // Build 3D Player Character Model (Appearance changes by equipment rarity!)
        this.player.char3D = new Character3D({
            name: this.player.name,
            gender: this.player.gender,
            hairStyle: this.player.hairStyle,
            hairColor: this.player.hairColor,
            skinColor: this.player.skinColor,
            className: this.player.baseStats.playerClass || 'No Class',
            weaponType: equippedWpnType,
            weaponRarity: equippedRarity,
            armorRarity: equippedArmorRarity,
            leggingsRarity: equippedLeggingsRarity
        });

        if (this.player.equips?.weapon) {
            this.player.char3D.setWeaponFromObject(this.player.equips.weapon);
        }
        if (this.player.equips?.aura) {
            this.player.char3D.setCosmeticAura(this.player.equips.aura.id);
        }
        if (this.player.equips?.pet) {
            this.player.char3D.setCosmeticPet(this.player.equips.pet.id);
        }

        this.engine.scene.add(this.player.char3D.group);
        this.saveCharacterToAccountSlot();

        // 🌐 Register with Multiplayer World
        if (this.socket && this.socket.connected) {
            this.sendEnterWorld();
        }

        // Town of Exonie is ready; if a loading transition was already active (from flow.js), let it complete smoothly
        const loadingScreen = document.getElementById('loading-screen');
        const isTransitionActive = loadingScreen && (loadingScreen.classList.contains('active') || loadingScreen.style.display === 'flex');

        this.loadMap('town');
        this.audio.playBgm('town');
        this.ui.updatePlayerHUD(this.player);

        if (!isTransitionActive && window.showLoadingTransition) {
            window.showLoadingTransition('ENTERING EXONIE...', 'Town of Exonie (Safe Haven)', 1250);
        }

        this.ui.showToast(`Welcome to Exonie, ${this.player.name}! Press [P] for Stats or [B] for Bag.`);
        } catch (err) {
            console.error('❌ [CRITICAL] onFlowComplete error:', err);
            const ls = document.getElementById('loading-screen');
            if (ls) {
                ls.classList.remove('active');
                ls.style.display = 'none';
            }
        }
    }

    saveCharacterToAccountSlot() {
        if (!window.ExonieFlow || !window.ExonieFlow.saveActiveCharacterState) return;
        if (!this.player.baseStats) this.player.baseStats = {};
        if (Array.isArray(this.player.storage)) {
            this.player.baseStats.homeStorage = this.player.storage;
        }
        window.ExonieFlow.saveActiveCharacterState({
            name: this.player.name,
            slotIndex: this.player.slotIndex !== undefined ? this.player.slotIndex : (window.ExonieFlow.activeSlotIndex || 0),
            email: this.player.email || window.ExonieFlow.accountEmail || '',
            gender: this.player.gender,
            hairStyle: this.player.hairStyle,
            hairColor: this.player.hairColor,
            skinColor: this.player.skinColor,
            level: this.player.level,
            exp: this.player.exp,
            maxExp: this.player.maxExp,
            gold: this.player.gold,
            playerClass: this.player.baseStats?.playerClass || null,
            baseStats: this.player.baseStats,
            equips: this.player.equips,
            inventory: this.player.inventory,
            storage: this.player.storage || Array(15).fill(null),
            dailyMission: this.player.dailyMission || null,
            tavernEntries: this.player.tavernEntries !== undefined ? this.player.tavernEntries : 5,
            dungeonEntries: this.player.dungeonEntries !== undefined ? this.player.dungeonEntries : 7
        });
    }

    // ==========================================
    // 2D HOME STORAGE VAULT (15 SLOTS - SYNCS TO SUPABASE)
    // ==========================================
    transferToStorage(bagIdx) {
        if (!Array.isArray(this.player.storage)) {
            this.player.storage = Array(15).fill(null);
        }
        if (!this.player.baseStats) this.player.baseStats = {};
        if (!Array.isArray(this.player.baseStats.homeStorage)) {
            this.player.baseStats.homeStorage = this.player.storage;
        }
        const item = this.player.inventory[bagIdx];
        if (!item) return;

        let emptyVaultIdx = -1;
        for (let i = 0; i < 15; i++) {
            if (!this.player.storage[i]) {
                emptyVaultIdx = i;
                break;
            }
        }
        if (emptyVaultIdx === -1) {
            this.audio.playSfx('bump');
            this.ui.showToast('⚠️ Your 15-Slot Home Storage Vault is full!');
            return;
        }

        this.player.storage[emptyVaultIdx] = item;
        this.player.baseStats.homeStorage[emptyVaultIdx] = item;
        this.player.inventory[bagIdx] = null;

        if (this.socket && this.socket.connected) {
            this.socket.emit('transferToStorage', { invIndex: bagIdx, item: item, storageIndex: emptyVaultIdx });
        }
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('splash');
        this.ui.showToast(`📥 Stored ${item.name} in Home Vault (Slot ${emptyVaultIdx + 1})!`);
        if (this.ui) {
            this.ui.renderStorage();
            this.ui.renderInventory();
        }
    }

    transferFromStorage(vaultIdx) {
        if (!Array.isArray(this.player.storage)) return;
        const item = this.player.storage[vaultIdx];
        if (!item) return;

        if (!this.addItemToInventory(item)) {
            this.audio.playSfx('bump');
            this.ui.showToast('⚠️ Your Inventory Bag is full! Clear a slot first.');
            return;
        }

        this.player.storage[vaultIdx] = null;
        if (!this.player.baseStats) this.player.baseStats = {};
        if (!Array.isArray(this.player.baseStats.homeStorage)) {
            this.player.baseStats.homeStorage = Array(15).fill(null);
        }
        this.player.baseStats.homeStorage[vaultIdx] = null;

        if (this.socket && this.socket.connected) {
            this.socket.emit('transferFromStorage', { storageIndex: vaultIdx });
        }
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('splash');
        this.ui.showToast(`📤 Withdrew ${item.name} from Home Vault to Bag!`);
        this.ui.updatePlayerHUD(this.player);
        if (this.ui) {
            this.ui.renderStorage();
            this.ui.renderInventory();
        }
    }

    // ==========================================
    // 2D QUEST BOARD / DAILY GOLD MISSIONS
    // ==========================================
    acceptDailyMission(difficulty) {
        if (this.player.dailyMission && this.player.dailyMission.active) {
            this.ui.showToast('⚠️ You already have an active Daily Mission!');
            return;
        }

        // 🎯 2D EXONIE DAILY MISSION ENGINE (server.js lines 7147-7174):
        // Flips 50/50 roll between common mobs (25 kills) and mini bosses (5 kills) of the tier
        const isBoss = Math.random() < 0.5;
        let chosen = null;

        if (difficulty === 'easy') {
            chosen = isBoss
                ? { id: 'easy', difficulty: 'Beginner', name: 'Defeat 5 Orc Slimes', targetName: 'Orc Slime', targetKey: 'mini_boss1', targetCount: 5, progress: 0, reward: 25000, active: true }
                : { id: 'easy', difficulty: 'Beginner', name: 'Defeat 25 Slimes', targetName: 'Slime', targetKey: 'common_mobs1', targetCount: 25, progress: 0, reward: 25000, active: true };
        } else if (difficulty === 'medium') {
            chosen = isBoss
                ? { id: 'medium', difficulty: 'Novice', name: 'Defeat 5 Vampire Bats', targetName: 'Vampire Bat', targetKey: 'mini_boss2', targetCount: 5, progress: 0, reward: 100000, active: true }
                : { id: 'medium', difficulty: 'Novice', name: 'Defeat 25 Shadow Bats', targetName: 'Shadow Bat', targetKey: 'common_mobs2', targetCount: 25, progress: 0, reward: 100000, active: true };
        } else {
            chosen = isBoss
                ? { id: 'hard', difficulty: 'Expert', name: 'Defeat 5 Inferno Cores', targetName: 'Inferno Core', targetKey: 'mini_boss3', targetCount: 5, progress: 0, reward: 250000, active: true }
                : { id: 'hard', difficulty: 'Expert', name: 'Defeat 25 Fire Sprites', targetName: 'Fire Sprite', targetKey: 'common_mobs3', targetCount: 25, progress: 0, reward: 250000, active: true };
        }

        this.player.dailyMission = chosen;
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('splash');
        this.ui.renderDailyMissions();
        this.ui.updatePlayerHUD(this.player);
        this.ui.showToast(`📜 Accepted Contract: ${chosen.name} (+${chosen.reward.toLocaleString()} G)!`);
    }

    // ==========================================
    // 2D TRAINING TAVERN SOLO SPEEDRUN & RANKINGS
    // ==========================================
    enterTrainingTavern(bossType = 'floor', level = 10) {
        if ((this.player.tavernEntries || 0) <= 0) {
            this.audio.playSfx('bump');
            this.ui.showToast('⚠️ No Training Tavern entries remaining today (0/5)!');
            return;
        }

        // Close all modal windows immediately when entering the Tavern
        if (this.ui) {
            this.ui.closeAllModals?.();
            if (this.ui.tavernModal) this.ui.tavernModal.style.display = 'none';
            if (this.ui.leaderboardModal) this.ui.leaderboardModal.style.display = 'none';
        }
        document.querySelectorAll('.game-modal').forEach(m => m.style.display = 'none');

        this.player.tavernEntries = Math.max(0, (this.player.tavernEntries || 5) - 1);
        this.saveCharacterToAccountSlot();
        this.world.tavernChallengeConfig = { bossType, level };

        const labelMap = { common: 'Common Monster', mini: 'Mini Boss', floor: 'Floor Boss' };
        const subText = `Solo Speedrun vs Lv.${level} ${labelMap[bossType] || 'Boss'}`;

        if (window.showLoadingTransition) {
            window.showLoadingTransition('Training Tavern', subText, 1300, () => {
                document.querySelectorAll('.game-modal').forEach(m => m.style.display = 'none');
                if (this.ui?.tavernModal) this.ui.tavernModal.style.display = 'none';
                if (this.ui?.leaderboardModal) this.ui.leaderboardModal.style.display = 'none';
                this.loadMap('trainingtavern');
                this.tavernTimerActive = true;
                this.tavernStartTime = performance.now();
                this.ui.updateTavernTimer(0, true);
            });
        } else {
            this.loadMap('trainingtavern');
            this.tavernTimerActive = true;
            this.tavernStartTime = performance.now();
            this.ui.updateTavernTimer(0, true);
        }
    }

    getTavernLeaderboard(tab = 'floor') {
        const key = `exonie3d_tavern_lb_${tab}`;
        let list = [];
        try {
            const raw = localStorage.getItem(key);
            if (raw) list = JSON.parse(raw);
        } catch (e) {}

        if (!Array.isArray(list) || list.length === 0) {
            // Seed authentic Exonie champions so the Top 50 Leaderboard is lively immediately
            list = [
                { name: 'Xenie', playerClass: 'Blademaster', level: 50, timeMs: 14280 },
                { name: 'Kaelen', playerClass: 'Berserker', level: 45, timeMs: 16850 },
                { name: 'Lyra', playerClass: 'Ice Master', level: 40, timeMs: 18120 },
                { name: 'Vex', playerClass: 'Ninja Assassin', level: 35, timeMs: 19400 },
                { name: 'Nova', playerClass: 'Tech Genius', level: 30, timeMs: 21500 },
                { name: 'Seraph', playerClass: 'Summoner', level: 25, timeMs: 24100 },
                { name: 'Orion', playerClass: 'Sniper', level: 20, timeMs: 26300 },
                { name: 'Aegis', playerClass: 'Healer', level: 15, timeMs: 29800 }
            ];
        }
        list.sort((a, b) => (b.level - a.level) || (a.timeMs - b.timeMs));
        return list.slice(0, 50);
    }

    recordTavernRun(bossType, level, timeMs) {
        const key = `exonie3d_tavern_lb_${bossType}`;
        const list = this.getTavernLeaderboard(bossType);
        const pName = this.player.name || 'Hero';
        const pClass = this.player.baseStats?.playerClass || 'Blademaster';

        const existingIdx = list.findIndex(r => r.name === pName);
        if (existingIdx >= 0) {
            const prev = list[existingIdx];
            if (level > prev.level || (level === prev.level && timeMs < prev.timeMs)) {
                list[existingIdx] = { name: pName, playerClass: pClass, level, timeMs, isSelf: true };
            }
        } else {
            list.push({ name: pName, playerClass: pClass, level, timeMs, isSelf: true });
        }
        list.sort((a, b) => (b.level - a.level) || (a.timeMs - b.timeMs));
        try {
            localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
        } catch (e) {}
    }

    // ==========================================
    // 2D DUNGEON DIFFICULTY & MAZE GUIDE TELEPORT
    // ==========================================
    enterDungeon(mapId, diffName = 'easy', mult = 1.0) {
        if ((this.player.dungeonEntries || 0) <= 0) {
            this.audio.playSfx('bump');
            this.ui.showToast('⚠️ No Weekly Dungeon entries remaining (0/7)!');
            return;
        }
        this.player.dungeonEntries = Math.max(0, (this.player.dungeonEntries || 7) - 1);
        this.saveCharacterToAccountSlot();
        this.world.dungeonDifficultyMult = mult;

        const title = mapId === 'dungeon1' ? 'Crystal Dungeon 1' : 'Ancient Cave Dungeon 2';
        const sub = `Difficulty: ${diffName.toUpperCase()} (${mult}x Monster Power)`;
        if (window.showLoadingTransition) {
            window.showLoadingTransition(title, sub, 1350, () => {
                this.loadMap(mapId);
            });
        } else {
            this.loadMap(mapId);
        }
    }

    enterHauntedHouse(difficulty = 'easy') {
        if (this.partyMembers && this.partyMembers.length > 0) {
            this.audio.playSfx('bump');
            this.ui.showToast('👻 The Haunted House is a solo challenge. Please leave your party.');
            return;
        }
        let cost = 1000;
        let minLvl = 1;
        let maxLvl = 15;
        if (difficulty === 'normal') {
            cost = 10000;
            minLvl = 16;
            maxLvl = 30;
        } else if (difficulty === 'hard') {
            cost = 500000;
            minLvl = 31;
            maxLvl = 80;
        }

        if ((this.player.gold || 0) < cost) {
            this.audio.playSfx('bump');
            this.ui.showToast(`⚠️ Not enough gold! You need ${cost.toLocaleString()} G.`);
            if (this.ui?.showNotEnoughGoldModal) {
                this.ui.showNotEnoughGoldModal(cost, this.player.gold || 0, `Haunted House (${difficulty.toUpperCase()})`);
            }
            return;
        }

        this.player.gold -= cost;
        this.saveCharacterToAccountSlot();
        this.ui.updatePlayerHUD(this.player);

        const randomLevel = Math.floor(Math.random() * (maxLvl - minLvl + 1)) + minLvl;
        this.world.hauntedHouseLevel = randomLevel;

        const modal = document.getElementById('haunted-house-modal');
        if (modal) modal.style.display = 'none';

        if (window.showLoadingTransition) {
            window.showLoadingTransition('Haunted House', `Entering (${difficulty.toUpperCase()})... Boss Level: ${randomLevel}`, 1350, () => {
                this.loadMap('hauntedhouse');
            });
        } else {
            this.loadMap('hauntedhouse');
        }
    }

    teleportToFloor(floorMapId, floorTitle) {
        if (window.showLoadingTransition) {
            window.showLoadingTransition(floorTitle, 'Maze Guide Fast Travel...', 1300, () => {
                this.loadMap(floorMapId);
            });
        } else {
            this.loadMap(floorMapId);
        }
    }

    // ==========================================
    // STATS CALCULATION (EXACT 2D EXONIE RULES)
    // ==========================================
    recalculateStats() {
        const base = this.player.baseStats || DEFAULT_BASE_STATS;
        const equips = this.player.equips || STARTER_ITEMS.equips;

        let totalHp = Number(base.hp) || 100;
        let totalAtk = Number(base.attack) || 5;
        let totalMag = Number(base.magic) || 5;
        let totalDef = Number(base.defense) || 2;
        let bonusStr = 0;
        let bonusInt = 0;

        // Equip stats (Fixed + Random Bonus Stats)
        for (const slot in equips) {
            const eq = equips[slot];
            if (eq) {
                if (eq.fixedStat) {
                    if (eq.fixedStat.hp) totalHp += Number(eq.fixedStat.hp) || 0;
                    if (eq.fixedStat.defense) totalDef += Number(eq.fixedStat.defense) || 0;
                    if (eq.fixedStat.attack) totalAtk += Number(eq.fixedStat.attack) || 0;
                    if (eq.fixedStat.magic) totalMag += Number(eq.fixedStat.magic) || 0;
                }
                if (eq.randomStat) {
                    if (eq.randomStat.hp) totalHp += Number(eq.randomStat.hp) || 0;
                    if (eq.randomStat.defense) totalDef += Number(eq.randomStat.defense) || 0;
                    if (eq.randomStat.attack) totalAtk += Number(eq.randomStat.attack) || 0;
                    if (eq.randomStat.magic) totalMag += Number(eq.randomStat.magic) || 0;
                    if (eq.randomStat.str) bonusStr += Number(eq.randomStat.str) || 0;
                    if (eq.randomStat.int) bonusInt += Number(eq.randomStat.int) || 0;
                }
            }
        }

        const pClass = base.playerClass;
        // Class specific 2D passives
        if (pClass === 'Berserker' && this.player.level >= 25) {
            // Bulk Up! (Lv.25): +25% Base DEF and HP
            totalHp = Math.floor(totalHp * 1.25);
            totalDef = Math.floor(totalDef * 1.25);
        } else if (pClass === 'Blademaster') {
            // Sharpen Up! (Lv.1): +25% Base Attack
            totalAtk = Math.floor(totalAtk * 1.25);
        }

        if (this.player.calloutActive) {
            totalDef *= 3;
        }

        // 🏰 Authentic 2D Exonie Guild Level Perk (+2% per guild level to all combat stats)
        const gLevel = Number(this.player.guild_details?.level || 0);
        if (gLevel > 0) {
            const gMult = 1 + (gLevel * 0.02);
            totalHp = Math.floor(totalHp * gMult);
            totalDef = Math.floor(totalDef * gMult);
            totalAtk = Math.floor(totalAtk * gMult);
            totalMag = Math.floor(totalMag * gMult);
        }

        this.player.maxHp = Math.max(1, totalHp);
        this.player.hp = Math.max(1, Math.min(Number(this.player.hp) || totalHp, totalHp));
        this.player.totalStr = (Number(base.str) || 10) + bonusStr;
        this.player.totalInt = (Number(base.int) || 10) + bonusInt;
        this.player.atk = totalAtk + Math.floor(this.player.totalStr / 2);
        this.player.mag = totalMag + Math.floor(this.player.totalInt / 2);
        this.player.def = totalDef;
        this.player.speed = 6.8;

        if (!this.player.pos || Number.isNaN(this.player.pos.x) || Number.isNaN(this.player.pos.z)) {
            this.player.pos = new THREE.Vector3(0, 0, 0);
        }

        this.ui.updatePlayerHUD(this.player);
    }

    getEquippedWeaponType() {
        if (!this.player.equips?.weapon) return null;
        if (this.player.equips.weapon.weaponType) return this.player.equips.weapon.weaponType;
        const spriteStr = String(this.player.equips.weapon.sprite || this.player.equips.weapon.name || '').toLowerCase();
        if (spriteStr.includes('sword')) return 'sword';
        if (spriteStr.includes('staff')) return 'staff';
        if (spriteStr.includes('pendant')) return 'pendant';
        if (spriteStr.includes('gun')) return 'gun';
        if (spriteStr.includes('dagger')) return 'dagger';
        if (spriteStr.includes('touchpad')) return 'touchpad';
        return null;
    }

    // Equip weapon, armor, or leggings from inventory slot
    equipWeaponFromInventory(slotIndex) {
        this.equipItemFromInventory(slotIndex);
    }

    equipItemFromInventory(slotIndex) {
        const item = this.player.inventory[slotIndex];
        const validSlots = ['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings', 'aura', 'pet'];
        if (!item || !validSlots.includes(item.type)) return;

        // 2D Exonie Level Requirement Check (Full Exonie public/game.js line 3359)
        const reqLevel = Number(item.level || item.levelReq || item.minLevel) || 1;
        const playerLevel = Number(this.player.level) || 1;
        if (reqLevel > playerLevel) {
            this.audio.playSfx('bump');
            this.ui.showToast(`⛔ Level ${reqLevel} required to equip ${item.name}! (You are Lv.${playerLevel})`);
            return;
        }

        const slot = item.type;
        const oldEquip = this.player.equips[slot];
        this.player.equips[slot] = item;
        this.player.inventory[slotIndex] = oldEquip;
        this.ui?.hideTooltip?.();

        // Update 3D Character Model Equipment Visuals based on Rarity (2D Exonie style)
        if (this.player.char3D) {
            const wpnType = this.getEquippedWeaponType();
            const wpnRarity = this.player.equips?.weapon?.rarity || 'Starter';
            const armRarity = this.player.equips?.armor?.rarity || 'Starter';
            const legRarity = this.player.equips?.leggings?.rarity || 'Starter';
            this.player.char3D.setEquipVisuals({
                weaponType: wpnType,
                weaponRarity: wpnRarity,
                armorRarity: armRarity,
                leggingsRarity: legRarity
            });

            // Always keep both cosmetic aura and pet synchronized simultaneously
            this.player.char3D.setCosmeticAura(this.player.equips?.aura?.id || null);
            this.player.char3D.setCosmeticPet(this.player.equips?.pet?.id || null);
        }

        this.recalculateStats();
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('bump');
        this.ui.showToast(`Equipped ${item.name}!`);

        if (this.socket && this.socket.connected) {
            this.socket.emit('playerEquipUpdate', {
                equips: this.player.equips,
                weapon: this.player.equips?.weapon || null
            });
        }

        if (this.ui.skillModal && this.ui.skillModal.style.display !== 'none') {
            this.ui.renderSkills();
        }
    }

    // Use Refinement Stone or Power Gem on equipped weapon
    useMaterialFromInventory(slotIndex) {
        const item = this.player.inventory[slotIndex];
        if (!item) return;

        const wpn = this.player.equips.weapon;
        if (!wpn) {
            this.ui.showToast("⚠️ Equip a weapon first to refine or imbue it!");
            return;
        }

        const s = String(item.sprite || item.name).toLowerCase();
        if (s.includes('refinement')) {
            wpn.refineLevel = (wpn.refineLevel || 0) + 1;
            if (wpn.fixedStat) {
                for (const k of Object.keys(wpn.fixedStat)) {
                    wpn.fixedStat[k] = Math.max(wpn.fixedStat[k] + 2, Math.ceil(wpn.fixedStat[k] * 1.15));
                }
            }
            if (!wpn.name.includes('+')) wpn.name = `${wpn.name} +1`;
            else wpn.name = wpn.name.replace(/\+\d+$/, `+${wpn.refineLevel}`);
            this.ui.showToast(`✨ Refined ${wpn.name}!`);
        } else if (s.includes('gem')) {
            wpn.randomStat = wpn.randomStat || {};
            wpn.randomStat.str = (wpn.randomStat.str || 0) + Math.max(3, Math.floor(this.player.level * 0.6));
            wpn.randomStat.int = (wpn.randomStat.int || 0) + Math.max(3, Math.floor(this.player.level * 0.6));
            this.ui.showToast(`💎 Imbued ${wpn.name} with Power Gem!`);
        } else {
            return;
        }

        this.player.inventory[slotIndex] = null;
        this.recalculateStats();
        this.audio.playSfx('splash');
        this.engine.spawnHitSparks(this.player.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x00e5ff, 22);
        this.ui.renderInventory();
    }

    // ==========================================
    // 🛡️ AUTHENTIC 2D EXONIE EQUIPMENT ENHANCEMENT
    // ==========================================
    enhanceItemWithStone(stoneIndex, targetSource, targetKeyOrIndex) {
        const stone = this.player.inventory ? this.player.inventory[stoneIndex] : null;
        if (!stone) {
            this.ui.showToast('⚠️ Refinement stone not found.', '#ef4444');
            return;
        }

        let targetItem = null;
        if (targetSource === 'equipped') {
            targetItem = this.player.equips ? this.player.equips[targetKeyOrIndex] : null;
        } else {
            targetItem = this.player.inventory ? this.player.inventory[targetKeyOrIndex] : null;
        }

        if (!targetItem) {
            this.ui.showToast('⚠️ Target equipment not found.', '#ef4444');
            return;
        }

        const check = canStoneEnhanceItem(stone, targetItem);
        if (!check.valid) {
            if (this.audio) this.audio.playSfx('bump');
            this.ui.showToast(`⛔ ${check.reason}`, '#ef4444');
            return;
        }

        const currentEnhance = targetItem.enhanceLevel || targetItem.refineLevel || 0;
        const outcome = calculateEnhanceOutcome(currentEnhance);

        // Deduct 1 stone from inventory
        stone.quantity = (stone.quantity || 1) - 1;
        if (stone.quantity <= 0) {
            this.player.inventory[stoneIndex] = null;
        }

        const playerPos = this.playerMesh ? this.playerMesh.position.clone() : (this.player.pos ? this.player.pos.clone() : new THREE.Vector3(0, 0, 0));

        if (outcome.status === 'shattered') {
            const oldName = targetItem.name;
            if (targetSource === 'equipped') {
                this.player.equips[targetKeyOrIndex] = null;
            } else {
                this.player.inventory[targetKeyOrIndex] = null;
            }
            if (this.audio) this.audio.playSfx('bump');
            if (this.engine) this.engine.spawnHitSparks(playerPos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xef4444, 30);
            this.ui.showToast(`💥 CRITICAL FAILURE! <strong>${oldName}</strong> shattered into dust!`, '#ef4444');
            this.appendChatLine('local', `💥 <span style="color:#ef4444;">[Refinement]</span> CRITICAL FAILURE! <strong>${oldName}</strong> shattered into dust!`);
        } else if (outcome.status === 'failed') {
            if (this.audio) this.audio.playSfx('bump');
            if (this.engine) this.engine.spawnHitSparks(playerPos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0xf59e0b, 15);
            this.ui.showToast(`⚠️ FAILED! <strong>${targetItem.name}</strong> enhancement failed.`, '#f59e0b');
            this.appendChatLine('local', `⚠️ <span style="color:#f59e0b;">[Refinement]</span> Enhancement failed for <strong>${targetItem.name}</strong>.`);
        } else {
            // SUCCESS
            const newEnhance = currentEnhance + 1;
            targetItem.enhanceLevel = newEnhance;
            targetItem.refineLevel = newEnhance;
            const bonus = check.bonus || 1;

            if (targetItem.fixedStat) {
                for (const k in targetItem.fixedStat) {
                    if (typeof targetItem.fixedStat[k] === 'number') targetItem.fixedStat[k] += bonus;
                }
            }
            if (targetItem.randomStat) {
                for (const k in targetItem.randomStat) {
                    if (typeof targetItem.randomStat[k] === 'number') targetItem.randomStat[k] += bonus;
                }
            }

            if (!targetItem.name.includes('+')) {
                targetItem.name = `${targetItem.name} +${newEnhance}`;
            } else {
                targetItem.name = targetItem.name.replace(/\+\d+$/, `+${newEnhance}`);
            }

            if (this.audio) {
                this.audio.playSfx('levelup');
                this.audio.playSfx('holy');
            }
            if (this.engine) {
                this.engine.spawnHitSparks(playerPos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x38bdf8, 35);
            }
            this.ui.showToast(`✨ SUCCESS! <strong>${targetItem.name}</strong> is now <strong style="color:#38bdf8;">+${newEnhance}</strong>! (+${bonus} all stats)`, '#38bdf8');
            this.appendChatLine('local', `✨ <span style="color:#38bdf8;">[Refinement]</span> SUCCESS! <strong>${targetItem.name}</strong> is now <strong>+${newEnhance}</strong> (+${bonus} all stats)!`);
            this.combat.spawnFloatingDamage(
                playerPos.clone().add(new THREE.Vector3(0, 1.8, 0)),
                `✨ +${newEnhance} SUCCESS!`,
                true,
                false
            );
        }

        this.recalculateStats();
        this.saveCharacterToAccountSlot();
        this.ui.renderInventory();
        if (this.ui.updatePlayerHUD) this.ui.updatePlayerHUD(this.player);

        if (this.socket && this.socket.connected) {
            this.socket.emit('requestEnhance', {
                stoneIndex,
                targetSource,
                targetKeyOrIndex,
                outcome: outcome.status,
                characterName: this.player.name
            });
            if (targetSource === 'equipped') {
                this.socket.emit('playerEquipUpdate', {
                    weapon: this.player.equips.weapon,
                    equips: this.player.equips
                });
            }
        }

        // Refresh modal if stone still exists in slot, otherwise close modal
        if (this.player.inventory[stoneIndex]) {
            this.ui.openEnhanceModal(stoneIndex);
        } else {
            this.ui.closeEnhanceModal();
        }
    }

    // Sell item or Gold Bar for Gold (Exact 2D Exonie Sell Price formula)
    sellItemFromInventory(slotIndex) {
        const item = this.player.inventory[slotIndex];
        if (!item) return;
        const val = getItemSellPrice(item);
        this.player.gold += val;
        this.player.inventory[slotIndex] = null;
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('bump');
        this.ui.showToast(`💰 Sold ${item.name} for ${val.toLocaleString()} Gold!`);
        this.ui.updatePlayerHUD(this.player);
        this.ui.renderInventory();
    }

    addItemToInventory(newItem) {
        if (!newItem) return false;
        // Stack potions if possible across all 30 slots
        if (newItem.type === 'potion') {
            for (let i = 0; i < 30; i++) {
                const it = this.player.inventory[i];
                if (it && it.type === 'potion' && it.name === newItem.name) {
                    it.quantity = (it.quantity || 1) + (newItem.quantity || 1);
                    return true;
                }
            }
        }
        for (let i = 0; i < 30; i++) {
            if (!this.player.inventory[i]) {
                this.player.inventory[i] = newItem;
                return true;
            }
        }
        return false;
    }

    // Unequip any currently equipped slot back into the 30-slot bag
    unequipItem(slot) {
        const validSlots = ['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings', 'aura', 'pet'];
        if (!validSlots.includes(slot) || !this.player.equips || !this.player.equips[slot]) return;

        let emptyIdx = -1;
        for (let i = 0; i < 30; i++) {
            if (!this.player.inventory[i]) {
                emptyIdx = i;
                break;
            }
        }

        if (emptyIdx === -1) {
            this.ui.showToast("🎒 Your inventory bag is full! Cannot unequip.");
            return;
        }

        const unequipped = this.player.equips[slot];
        this.player.inventory[emptyIdx] = unequipped;
        this.player.equips[slot] = null;
        this.ui?.hideTooltip?.();

        if (slot === 'weapon' && this.player.char3D) {
            this.player.char3D.setWeapon(null);
        } else if (slot === 'aura' && this.player.char3D) {
            this.player.char3D.setCosmeticAura(null);
        } else if (slot === 'pet' && this.player.char3D) {
            this.player.char3D.setCosmeticPet(null);
        }

        this.recalculateStats();
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('bump');
        this.ui.showToast(`Unequipped ${unequipped.name}`);
        this.ui.renderInventory();

        if (this.socket && this.socket.connected) {
            this.socket.emit('playerEquipUpdate', {
                equips: this.player.equips,
                weapon: this.player.equips?.weapon || null
            });
        }

        if (slot === 'weapon' && this.ui.skillModal && this.ui.skillModal.style.display !== 'none') {
            this.ui.renderSkills();
        }
    }

    unequipWeapon() {
        this.unequipItem('weapon');
    }

    // Inspect Player System (2D Exonie port)
    inspectPlayer(targetId) {
        if (!targetId || targetId === this.player.name || targetId === this.socket?.id) {
            this.ui.openInspectModal({
                name: this.player.name,
                level: this.player.level,
                playerClass: this.player.baseStats?.playerClass || 'Novice',
                currentHp: this.player.hp,
                maxHp: this.player.maxHp,
                equips: this.player.equips
            });
            return;
        }
        if (this.socket) {
            this.socket.emit('inspectRequest', { targetId });
        }
    }

    addFriend(targetName) {
        if (!targetName || targetName === this.player.name) return;
        if (this.socket) {
            this.socket.emit('addFriend', { targetId: targetName });
        }
        this.ui.showToast(`🤝 Friend request sent to ${targetName}!`);
    }

    isPartyLeader() {
        if (!this.party || !this.party.members || this.party.members.length <= 1) return true;
        const mySid = this.socket ? this.socket.id : null;
        return this.party.leaderId === mySid;
    }

    inviteParty(targetName) {
        if (!targetName || targetName === this.player.name) return;
        if (this.socket) {
            this.socket.emit('partyInvite', { targetId: targetName });
        }
        this.ui.showToast(`⚔️ Party invitation sent to ${targetName}!`);
    }

    inviteRaid(targetName) {
        if (!targetName || targetName === this.player.name) return;
        if (this.socket) {
            this.socket.emit('raidInvite', { targetId: targetName });
        }
        this.ui.showToast(`🏰 Raid invitation sent to ${targetName}!`);
    }

    removeFriend(targetName) {
        if (!targetName) return;
        if (this.socket) {
            this.socket.emit('removeFriend', { targetName, targetId: targetName });
        }
        if (this.ui) this.ui.showToast(`Removed ${targetName} from friends.`);
    }

    checkPlayerRaycast(clientX, clientY) {
        if (!this.remotePlayers || !this.engine || !this.engine.camera || !this.engine.renderer) return null;
        const rect = this.engine.renderer.domElement.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;

        if (!this._hoverRaycaster) this._hoverRaycaster = new THREE.Raycaster();
        if (!this._hoverMouse) this._hoverMouse = new THREE.Vector2();

        this._hoverMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this._hoverMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this._hoverRaycaster.setFromCamera(this._hoverMouse, this.engine.camera);

        const targetCandidates = [];
        const objToPlayer = new Map();

        for (const sid in this.remotePlayers) {
            const rp = this.remotePlayers[sid];
            if (rp && rp.char3D && rp.char3D.group) {
                // Priority 1: dedicated invisible interaction hitbox cylinder
                if (rp.char3D.hitboxMesh) {
                    targetCandidates.push(rp.char3D.hitboxMesh);
                    objToPlayer.set(rp.char3D.hitboxMesh, rp);
                }
                // Priority 2: overhead UI nameplate sprite
                if (rp.char3D.overheadSprite) {
                    targetCandidates.push(rp.char3D.overheadSprite);
                    objToPlayer.set(rp.char3D.overheadSprite, rp);
                }
                // Priority 3: all mesh and sprite parts
                rp.char3D.group.traverse((child) => {
                    if (child.isMesh || child.isSprite) {
                        targetCandidates.push(child);
                        objToPlayer.set(child, rp);
                    }
                });
            }
        }

        if (targetCandidates.length === 0) return null;
        const hits = this._hoverRaycaster.intersectObjects(targetCandidates, false);
        if (hits.length > 0) {
            return objToPlayer.get(hits[0].object) || null;
        }
        return null;
    }

    setHoveredPlayer(hitPlayer, clientX, clientY, isAimMode = false) {
        if (!hitPlayer) {
            this.clearHoveredPlayer();
            return;
        }

        if (this.hoveredPlayer !== hitPlayer) {
            if (this.hoveredPlayer && this.hoveredPlayer.char3D && this.hoveredPlayer.char3D.setHoverHighlight) {
                this.hoveredPlayer.char3D.setHoverHighlight(false);
            }
            this.hoveredPlayer = hitPlayer;
            if (hitPlayer.char3D && hitPlayer.char3D.setHoverHighlight) {
                hitPlayer.char3D.setHoverHighlight(true);
            }
        }

        const indicator = document.getElementById('player-hover-indicator');
        const crosshair = document.getElementById('crosshair-center');
        const crosshairBadge = document.getElementById('crosshair-interact-badge');

        if (isAimMode) {
            // Pointer lock aim mode: reticle glows golden and shows interact prompt badge
            if (crosshair) crosshair.classList.add('target-interact');
            if (crosshairBadge) crosshairBadge.style.display = 'block';
            if (indicator) indicator.style.display = 'none';
            document.body.classList.remove('cursor-player-interact');
            const canvas = document.getElementById('canvas-3d');
            if (canvas) canvas.classList.remove('cursor-player-interact');
        } else {
            // Free mouse mode: change cursor to custom golden interaction pointer & show floating player badge
            document.body.classList.add('cursor-player-interact');
            const canvas = document.getElementById('canvas-3d');
            if (canvas) canvas.classList.add('cursor-player-interact');

            if (crosshair) crosshair.classList.remove('target-interact');
            if (crosshairBadge) crosshairBadge.style.display = 'none';

            if (indicator) {
                const nameEl = document.getElementById('hover-player-name');
                const metaEl = document.getElementById('hover-player-meta');
                if (nameEl) nameEl.textContent = hitPlayer.name || 'Hero';
                if (metaEl) {
                    const guildStr = hitPlayer.guild ? `[${hitPlayer.guild}] ` : '';
                    metaEl.textContent = `${guildStr}Lv.${hitPlayer.level || 1} ${hitPlayer.job || 'Novice'}`;
                }
                if (clientX !== undefined && clientY !== undefined) {
                    indicator.style.left = `${clientX}px`;
                    indicator.style.top = `${clientY}px`;
                }
                indicator.style.display = 'flex';
            }
        }
    }

    clearHoveredPlayer() {
        if (this.hoveredPlayer) {
            if (this.hoveredPlayer.char3D && this.hoveredPlayer.char3D.setHoverHighlight) {
                this.hoveredPlayer.char3D.setHoverHighlight(false);
            }
            this.hoveredPlayer = null;
        }

        document.body.classList.remove('cursor-player-interact');
        const canvas = document.getElementById('canvas-3d');
        if (canvas) canvas.classList.remove('cursor-player-interact');

        const indicator = document.getElementById('player-hover-indicator');
        if (indicator) indicator.style.display = 'none';

        const crosshair = document.getElementById('crosshair-center');
        if (crosshair) crosshair.classList.remove('target-interact');

        const crosshairBadge = document.getElementById('crosshair-interact-badge');
        if (crosshairBadge) crosshairBadge.style.display = 'none';
    }

    // Player Stun system (Minotaur Bull Rush Charge & status effects)
    applyPlayerStun(duration = 3.0) {
        if (this.isGhost || this.player.isInvulnerable) return;
        this.playerStunTimer = Math.max(this.playerStunTimer || 0, duration);
        this.combat.spawnFloatingDamage(this.player.pos, `💫 STUNNED! (${duration}s)`, true, true);
        this.ui.showToast(`💫 You are stunned for ${duration}s!`);
    }

    // Use Health Potion from inventory or hotbar
    useHealthPotion() {
        if (this.currentMapId === 'trainingtavern') {
            this.ui.showToast("⚠️ Potions are strictly forbidden inside the Training Tavern!");
            this.audio.playSfx('bump');
            return;
        }

        if (this.potionCooldown > 0) {
            this.ui.showToast("Potion is on cooldown!");
            return;
        }

        let potItem = null;
        let potIndex = -1;

        for (let i = 0; i < 30; i++) {
            const it = this.player.inventory[i];
            if (it && it.type === 'potion') {
                potItem = it;
                potIndex = i;
                break;
            }
        }

        if (!potItem) {
            this.ui.showToast("No health potions remaining!");
            return;
        }

        const healAmt = Math.min(this.player.maxHp, potItem.fixedStat?.hpHeal || 50);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        this.combat.spawnFloatingDamage(this.player.pos, `+${healAmt} HP`, false, true);
        this.engine.spawnHitSparks(this.player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 0x00e676, 20);
        this.audio.playSfx('splash');

        potItem.quantity = (potItem.quantity || 1) - 1;
        if (potItem.quantity <= 0) {
            this.player.inventory[potIndex] = null;
        }

        this.potionCooldown = 5.0;
        this.ui.showToast(`+${healAmt} HP restored!`);
        this.ui.updatePlayerHUD(this.player);
        this.ui.renderInventory();
    }

    getPotionCount() {
        let count = 0;
        for (let i = 0; i < 30; i++) {
            const it = this.player.inventory[i];
            if (it && it.type === 'potion') {
                count += it.quantity || 1;
            }
        }
        return count;
    }

    // Choose permanent class
    chooseClass(className) {
        if (!CLASSES[className]) return;

        this.player.baseStats.playerClass = className;
        if (this.player.char3D) {
            this.player.char3D.setJobClass(className);
        }
        this.recalculateStats();
        this.saveCharacterToAccountSlot();

        this.audio.playSfx('lightning');
        this.engine.spawnLevelUpVFX(this.player.pos);
        this.combat.spawnFloatingDamage(this.player.pos, `AWAKENED: ${className}!`, true);
        this.ui.showToast(`Congratulations! You are now a ${className}!`);

        this.ui.updatePlayerHUD(this.player);
        this.ui.renderSkills();
    }

    getDefaultKeybinds() {
        return {
            skill1: 'Digit1',
            skill1Alt: 'KeyQ',
            skill2: 'Digit2',
            skill2Alt: 'KeyE',
            potion: 'Digit3',
            dodge: 'ShiftLeft',
            jump: 'Space',
            target: 'Tab',
            chat: 'Enter',
            stats: 'KeyP',
            bag: 'KeyB',
            skills: 'KeyK',
            guild: 'KeyG',
            friends: 'KeyF',
            mailbox: 'KeyM',
            shop: 'KeyC'
        };
    }

    loadKeybinds() {
        this.keybinds = this.getDefaultKeybinds();
        try {
            const raw = localStorage.getItem('exonie3d_keybinds');
            if (raw) {
                const parsed = JSON.parse(raw);
                this.keybinds = Object.assign(this.getDefaultKeybinds(), parsed);
            }
        } catch (e) {}
    }

    saveKeybinds() {
        try {
            localStorage.setItem('exonie3d_keybinds', JSON.stringify(this.keybinds));
        } catch (e) {}
    }

    resetKeybinds() {
        this.keybinds = this.getDefaultKeybinds();
        this.saveKeybinds();
    }

    setupKeyboardInput() {
        window.addEventListener('keydown', (e) => {
            // Check if typing in an input box
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                if (e.target.id === 'chat-input') {
                    return; // let chat input handle keystrokes
                }
                const authScr = document.getElementById('auth-screen');
                const charScr = document.getElementById('creation-screen');
                const isAuthOpen = authScr && authScr.style.display !== 'none' && !authScr.classList.contains('hidden');
                const isCharOpen = charScr && charScr.style.display !== 'none' && !charScr.classList.contains('hidden');
                if (!isAuthOpen && !isCharOpen) {
                    // Unfocus lingering inputs from previous screens so movement keys register immediately!
                    e.target.blur();
                } else {
                    return;
                }
            }

            // If Settings Keybind Customizer is listening for a new key press:
            if (this.ui && this.ui.listeningBindAction) {
                e.preventDefault();
                const act = this.ui.listeningBindAction;
                this.ui.listeningBindAction = null;
                document.querySelectorAll('.keybind-btn').forEach(b => b.classList.remove('listening'));
                if (e.code !== 'Escape') {
                    this.keybinds[act] = e.code;
                    this.saveKeybinds();
                    this.ui.showToast(`⌨️ Bound ${act.toUpperCase()} to [${this.ui.formatKeyLabel(e.code)}]`);
                }
                this.ui.refreshKeybindLabels();
                return;
            }

            // 🛡️ Pre-Game & Input Field Guard: Never trigger in-game shortcuts if not inside the active game world or typing in an input field!
            if (!this.hasEnteredWorld || (window.ExonieFlow && window.ExonieFlow.step !== 'game')) return;

            const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
            if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || (e.target && e.target.isContentEditable)) {
                return;
            }

            this.keys[e.code] = true;
            const kb = this.keybinds || this.getDefaultKeybinds();

            if (e.code === 'Escape') {
                e.preventDefault();
                this.ui.toggleSettings();
            } else if (e.code === kb.stats) {
                this.ui.toggleStats();
            } else if (e.code === kb.bag || e.code === 'KeyI') {
                this.ui.toggleInventory();
            } else if (e.code === kb.skills) {
                this.ui.toggleSkills();
            } else if (e.code === (kb.friends || 'KeyF')) {
                this.ui.toggleFriendsModal();
            } else if (e.code === (kb.shop || 'KeyC')) {
                this.ui.toggleCashShop();
            } else if (e.code === (kb.guild || 'KeyG')) {
                this.ui.toggleGuildModal();
            } else if (e.code === (kb.mailbox || 'KeyM')) {
                this.ui.toggleMailbox();
            } else if (e.code === (kb.jump || 'Space')) {
                e.preventDefault();
                this.onJumpTrigger();
            } else if (e.code === kb.dodge || e.code === 'ShiftRight') {
                e.preventDefault();
                this.onDodgeTrigger();
            } else if (e.code === 'AltLeft' || e.code === 'AltRight') {
                e.preventDefault();
                this.engine.togglePointerLock();
            } else if (e.code === kb.skill1 || e.code === kb.skill1Alt) {
                this.onSkillTrigger(1);
            } else if (e.code === kb.skill2 || e.code === kb.skill2Alt) {
                this.onSkillTrigger(2);
            } else if (e.code === kb.potion) {
                this.useHealthPotion();
            } else if (e.code === (kb.target || 'Tab')) {
                e.preventDefault();
                this.toggleTargetLock();
            } else if (e.code === (kb.chat || 'Enter')) {
                e.preventDefault();
                this.openChatInput();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Mouse Move Hover System: Changes cursor and displays hover badge when cursor is over another player
        window.addEventListener('mousemove', (e) => {
            if (!this.hasEnteredWorld || (window.ExonieFlow && window.ExonieFlow.step !== 'game')) return;
            if (this.engine && this.engine.isPointerLocked) return;

            const now = performance.now();
            if (now - (this._lastHoverCheck || 0) < 25) {
                if (this.hoveredPlayer) {
                    const indicator = document.getElementById('player-hover-indicator');
                    if (indicator && indicator.style.display !== 'none') {
                        indicator.style.left = `${e.clientX}px`;
                        indicator.style.top = `${e.clientY}px`;
                    }
                }
                return;
            }
            this._lastHoverCheck = now;

            const hitPlayer = this.checkPlayerRaycast(e.clientX, e.clientY);
            if (hitPlayer) {
                this.setHoveredPlayer(hitPlayer, e.clientX, e.clientY, false);
            } else if (this.hoveredPlayer) {
                this.clearHoveredPlayer();
            }
        });

        window.addEventListener('mouseleave', () => {
            this.clearHoveredPlayer();
        });

        document.addEventListener('pointerlockchange', () => {
            this.clearHoveredPlayer();
        });

        // Desktop mouse left-click: Primary Attack combo OR Player Interaction
        window.addEventListener('mousedown', (e) => {
            if (!this.hasEnteredWorld || (window.ExonieFlow && window.ExonieFlow.step !== 'game')) return;
            if (e.target && e.target.id === 'canvas-3d') {
                if (e.button === 0) {
                    // If clicking directly on a hovered remote player while in free mouse mode, open interaction menu
                    if (!this.engine.isPointerLocked && this.hoveredPlayer) {
                        if (this.ui) this.ui.openPlayerInteractionMenu(this.hoveredPlayer, e.clientX, e.clientY);
                        return;
                    }
                    if (this.ui) this.ui.closePlayerInteractionMenu();
                    this.onAttackTrigger();
                }
            }
        });

        // Right-click: Player Interaction Context Menu (Both in free cursor and Dragon Nest aim modes)
        window.addEventListener('contextmenu', (e) => {
            if (!this.hasEnteredWorld || (window.ExonieFlow && window.ExonieFlow.step !== 'game')) return;
            if (e.target && e.target.id === 'canvas-3d') {
                e.preventDefault();
                // When in active Dragon Nest pointer lock aim mode, allow right-clicking an aimed target to interact
                if (this.engine && this.engine.isPointerLocked) {
                    if (this.hoveredPlayer) {
                        const targetPlayer = this.hoveredPlayer;
                        document.exitPointerLock?.();
                        setTimeout(() => {
                            if (this.ui) this.ui.openPlayerInteractionMenu(targetPlayer, window.innerWidth / 2, window.innerHeight / 2);
                        }, 50);
                    }
                    return;
                }
                const hitPlayer = this.hoveredPlayer || this.checkPlayerRaycast(e.clientX, e.clientY);
                if (hitPlayer) {
                    if (this.ui) this.ui.openPlayerInteractionMenu(hitPlayer, e.clientX, e.clientY);
                } else if (this.ui) {
                    this.ui.closePlayerInteractionMenu();
                }
            }
        });

        // Ensure clicking game canvas or HUD blurs any lingering inputs so keyboard controls are always responsive
        window.addEventListener('pointerdown', (e) => {
            if (!this.hasEnteredWorld || (window.ExonieFlow && window.ExonieFlow.step !== 'game')) return;
            if (e.target && e.target.id !== 'chat-input' && document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                document.activeElement.blur();
            }
        });
    }

    onAttackTrigger() {
        if (!this.player.char3D || this.isGhost || (this.playerStunTimer > 0)) return;
        if (this.player.char3D.isDodging) return; // Prevent attack during dodge roll
        this.combat.executePrimaryAttack(this.player, this.monsters, (deadMob) => {
            this.onMonsterDefeated(deadMob);
        });
    }

    onJumpTrigger() {
        if (!this.player.char3D || this.isGhost || (this.playerStunTimer > 0)) return;
        if (this.player.pos.y <= 0.05 && !this.player.isJumping) {
            this.player.isJumping = true;
            this.player.velocityY = this.jumpForce;
            this.player.char3D.triggerJump();
            this.audio.playSfx('bump');
        }
    }

    onDodgeTrigger() {
        if (!this.player.char3D || this.isGhost || this.combat.cooldowns.dodge > 0 || (this.playerStunTimer > 0)) return;
        this.combat.cooldowns.dodge = 1.2;
        this.player.isInvulnerable = true;
        setTimeout(() => { this.player.isInvulnerable = false; }, 420);
        this.player.char3D.triggerDodge(this.player.moveDir);
        this.audio.playSfx('bump');
        this.engine.spawnHitSparks(this.player.pos, 0x00e5ff, 12);
    }

    onSkillTrigger(slot) {
        if (!this.player.char3D || this.isGhost || (this.playerStunTimer > 0)) return;
        if (this.player.char3D.isDodging) return; // Prevent skills during dodge roll

        // 1. Weapon requirement
        if (!this.player.equips || !this.player.equips.weapon) {
            this.audio.playSfx('bump');
            this.ui.showToast("⚠️ Equip a weapon from your Bag (B) to use skills!");
            this.combat.spawnFloatingDamage(this.player.pos, "EQUIP WEAPON FIRST!", false);
            return;
        }

        // 2. Class awakening requirement
        const pClass = this.player.baseStats?.playerClass;
        if (!pClass || !CLASSES[pClass]) {
            this.audio.playSfx('bump');
            this.ui.showToast("⚠️ Awaken your class in the Skills menu (K) first!");
            this.combat.spawnFloatingDamage(this.player.pos, "AWAKEN CLASS IN SKILLS (K)!", false);
            return;
        }

        // 3. Class weapon type check (same as 2D Exonie: CLASSES[pClass].weapon)
        const reqWpn = CLASSES[pClass]?.weapon;
        const wpn = this.player.equips?.weapon;
        const wpnType = String(wpn?.weaponType || wpn?.sprite || wpn?.name || '').toLowerCase();
        if (reqWpn && !wpnType.includes(reqWpn)) {
            this.audio.playSfx('bump');
            this.ui.showToast(`⚠️ ${pClass} requires a ${reqWpn.toUpperCase()} to use class skills!`);
            this.combat.spawnFloatingDamage(this.player.pos, `WRONG WEAPON! (${reqWpn.toUpperCase()})`, false);
            return;
        }

        this.combat.executeSkill(slot, this.player, this.monsters, (deadMob) => {
            this.onMonsterDefeated(deadMob);
        });
    }

    toggleTargetLock() {
        if (this.combat.targetMonster) {
            this.combat.targetMonster = null;
        } else {
            this.combat.findTarget(this.player.pos, this.player.rotY, this.monsters, 16);
        }
    }

    // ==========================================
    // MAP LOADING & AUTHENTIC 2D DATA INGESTION
    // ==========================================
    loadMap(mapId, targetX, targetY) {
        if (this.socket) {
            this.socket.emit('requestBossCooldownSync');
        }
        // Clear old monsters
        for (const m of this.monsters) {
            this.engine.scene.remove(m.group);
        }
        this.monsters = [];
        this.floorBoss = null;

        // Clear map-specific minions and fire zones
        if (this.combat) {
            if (this.combat.alliedMinions) {
                for (const sm of this.combat.alliedMinions) {
                    this.engine.scene.remove(sm.group);
                }
                this.combat.alliedMinions = [];
            }
            if (this.combat.fireZones) {
                for (const f of this.combat.fireZones) {
                    this.engine.scene.remove(f.mesh);
                }
                this.combat.fireZones = [];
            }
        }
        this.currentMapId = mapId;

        // Clear remote player models from previous map to enforce strict instance/map isolation
        if (this.remotePlayers) {
            for (const sid in this.remotePlayers) {
                const rp = this.remotePlayers[sid];
                if (rp && rp.char3D && rp.char3D.group) {
                    this.engine.scene.remove(rp.char3D.group);
                }
            }
            this.remotePlayers = {};
        }
        this.clearHoveredPlayer();

        // Build the 3D map from 2D Exonie dataset
        const data = this.world.loadMap(mapId, targetX, targetY);
        this.player.pos.copy(data.spawn);

        // Ensure all modal windows are completely closed upon entering any map (including Tavern)
        if (this.ui) {
            this.ui.closeAllModals?.();
            if (this.ui.tavernModal) this.ui.tavernModal.style.display = 'none';
            if (this.ui.leaderboardModal) this.ui.leaderboardModal.style.display = 'none';
        }
        document.querySelectorAll('.game-modal').forEach(m => m.style.display = 'none');

        // Notify server to transfer socket instance room (Private Solo/Party instance for Home/Dungeons)
        if (this.socket && this.socket.connected) {
            this.socket.emit('changeMap', {
                mapId: mapId,
                x: this.player.pos.x,
                y: this.player.pos.y,
                z: this.player.pos.z,
                rotY: this.player.rotY
            });
        }

        // 🛡️ Authentic 2D: Purification uses reset to 0 upon entering Town
        if (mapId === 'town' && this.player) {
            this.player.purificationUses = 0;
        }

        // Safety check: ensure player is never spawned inside a wall or pillar collider
        if (this.world.checkCollision(this.player.pos.x, this.player.pos.z, 0.7)) {
            const offsets = [[0, -4], [0, 4], [4, 0], [-4, 0], [0, -8], [0, 8]];
            for (const [ox, oz] of offsets) {
                if (!this.world.checkCollision(this.player.pos.x + ox, this.player.pos.z + oz, 0.7)) {
                    this.player.pos.x += ox;
                    this.player.pos.z += oz;
                    break;
                }
            }
        }

        // Adjust lighting theme based on environment
        if (mapId === 'hauntedhouse' || mapId.startsWith('dungeon') || mapId === 'event_cave') {
            this.engine.setEnvironmentTheme('dungeon');
        } else {
            this.engine.setEnvironmentTheme('daylight');
        }

        // BGM selection matching 2D Exonie tracks
        if (mapId !== 'trainingtavern') {
            this.tavernTimerActive = false;
            if (this.ui && this.ui.updateTavernTimer) {
                this.ui.updateTavernTimer(0, false);
            }
        }
        let bgmTrack = 'town';
        if (mapId === 'town') bgmTrack = 'town';
        else if (mapId === 'trainingtavern') bgmTrack = 'bossfight';
        else if (mapId === 'home') bgmTrack = 'home';
        else if (mapId === 'neutralzone') bgmTrack = 'floors';
        else if (mapId === 'battlefield') bgmTrack = 'battlefield';
        else if (mapId === 'hauntedhouse') bgmTrack = 'bossfight';
        else if (mapId === 'guildbase') bgmTrack = 'guildbase';
        else if (mapId === 'floor10') bgmTrack = 'bossfight2';
        else if (mapId.startsWith('floor')) bgmTrack = 'floors';
        else if (mapId.startsWith('dungeon') || mapId === 'event_cave') bgmTrack = 'bossfight';

        this.audio.playBgm(bgmTrack);
        this.ui.updateFloorIndicator(mapId, data.name);

        // Spawn monsters defined in this map's data (Dungeon monsters NEVER respawn, per 2D rules)
        const isDungeon = mapId.startsWith('dungeon');
        const now = Date.now();
        const bossRemaining = (this.bossCooldowns && this.bossCooldowns[mapId]) ? (this.bossCooldowns[mapId] - now) : 0;
        const neutralRemaining = (this.bossCooldowns && this.bossCooldowns['neutralzone_boss']) ? (this.bossCooldowns['neutralzone_boss'] - now) : 0;
        const battlefieldRemaining = (this.bossCooldowns && this.bossCooldowns['battlefield_boss']) ? (this.bossCooldowns['battlefield_boss'] - now) : 0;

        if (Array.isArray(data.monsterSpawns)) {
            for (const sp of data.monsterSpawns) {
                // If this is a floor boss and its Supabase cooldown is active, skip spawning it
                if (sp.category === 'floor_boss' && mapId.startsWith('floor') && bossRemaining > 0 && !this.isMazeTrial) {
                    const hrs = Math.ceil(bossRemaining / 3600000);
                    this.ui.showToast(`⏳ [FLOOR BOSS COOLDOWN] ${sp.name} respawns in ~${hrs} hours.`);
                    continue;
                }
                // Neutral Zone boss cooldown check
                if (mapId === 'neutralzone' && (sp.category === 'floor_boss' || sp.isNeutralBoss) && neutralRemaining > 0) {
                    const hrs = (neutralRemaining / 3600000).toFixed(1);
                    this.ui.showToast(`⏳ [NEUTRAL ZONE WORLD BOSS] Respawns in ~${hrs} hours.`);
                    const remMins = Math.ceil(neutralRemaining / 60000);
                    const remHours = (remMins / 60).toFixed(1);
                    const timeText = remMins > 120 ? `${remHours} hours` : `${remMins} minutes`;
                    this.appendChatLine('world', `⏳ <span style="color:#aaa;">The boss of this area is dead. It will return in ${timeText}.</span>`);
                    continue;
                }
                // Battlefield boss cooldown check
                if (mapId === 'battlefield' && (sp.category === 'floor_boss' || sp.isBattlefieldBoss) && battlefieldRemaining > 0) {
                    const hrs = (battlefieldRemaining / 3600000).toFixed(1);
                    this.ui.showToast(`⏳ [BATTLEFIELD RAID BOSS] Next assault in ~${hrs} hours.`);
                    continue;
                }

                const mob = new Monster3D(sp, sp.position);
                if (isDungeon) {
                    mob.noRespawn = true;
                }
                if (mapId === 'neutralzone' && sp.category === 'floor_boss') {
                    mob.isNeutralBoss = true;
                }
                if (mapId === 'battlefield' && (sp.category === 'floor_boss' || sp.isBattlefieldBoss)) {
                    mob.isBattlefieldBoss = true;
                }
                this.engine.scene.add(mob.group);
                this.monsters.push(mob);
                if (sp.category === 'floor_boss') {
                    this.floorBoss = mob;
                }
            }
        }

        if (this.player.char3D) {
            this.player.char3D.group.position.copy(this.player.pos);
        }

        // Do not auto-show Boss HP Bar on floor entry; only show when player has attacked it!
        this.bossEngaged = false;
        this.ui.updateBossHealth(null);

        this.portalCooldown = 3.0; // 3s cooldown to prevent double teleports
    }

    onMonsterDefeated(mob) {
        if (!mob || mob._isDefeatedProcessed) return;
        mob._isDefeatedProcessed = true;

        this.audio.playSfx('bump');
        this.engine.spawnHitSparks(mob.group.position, 0xffea00, 25);

        // EXP and Gold
        this.gainExp(mob.expYield);
        this.player.gold += mob.goldYield;
        this.combat.spawnFloatingDamage(mob.group.position, `+${mob.expYield} EXP`, false, true);

        // Authoritative 2D Loot Drop System:
        // In Training Tavern, monsters STRICTLY drop Tavern Accessories (necklace, ring, earrings)! NO swords, weapons, or armor!
        const isTavern = this.currentMapId === 'trainingtavern' || mob.isTavernBoss;
        const drops = [];

        if (isTavern) {
            // 50% chance to drop Tavern Accessory (necklace, ring, earrings) matching 2D Exonie server.js
            if (Math.random() < 0.50) {
                const accDrop = generateTavernLoot(mob.level, mob.category || 'floor_boss');
                drops.push(accDrop);
            }
        } else {
            // Normal Dungeon / Floor / Overworld loot
            const normalDrops = generateLoot(mob);
            drops.push(...normalDrops);
        }

        for (const drop of drops) {
            const added = this.addItemToInventory(drop);
            const rColor = drop.color || '#38bdf8';
            const rLvl = drop.level ? ` (Lv.${drop.level})` : '';
            if (added) {
                // Personal prominent HUD notification to the player (Even for Basic equipment!)
                this.ui.showToast(`🎁 Looted <strong style="color:${rColor};">[${drop.rarity || 'Basic'}] ${drop.name}</strong>${rLvl}!`, rColor);

                // Personal Local chat notification - only for them, not the whole world or party
                this.appendChatLine('local', `🎁 <span style="color:#94a3b8;">[Loot]</span> You obtained: <strong style="color:${rColor};">[${drop.rarity || 'Basic'}] ${drop.name}</strong>${rLvl}!`);

                // 3D floating text above monster corpse
                this.combat.spawnFloatingDamage(
                    mob.group.position.clone().add(new THREE.Vector3(0, 0.7, 0)),
                    `🎁 ${drop.name}`,
                    drop.rarity === 'Legendary' || drop.rarity === 'Godly' || drop.rarity === 'Divine',
                    true
                );
            } else {
                this.ui.showToast(`⚠️ Bag Full! Could not pick up [${drop.rarity || 'Basic'}] ${drop.name}.`, '#ef4444');
                this.appendChatLine('local', `⚠️ <span style="color:#ef4444;">[Inventory Full]</span> Could not pick up <strong>${drop.name}</strong>.`);
            }
        }

        // ============================================================
        // 2D QUEST BOARD / DAILY GOLD MISSION KILL TRACKING
        // ============================================================
        if (this.player.dailyMission && this.player.dailyMission.active) {
            const dm = this.player.dailyMission;
            const mobKey = String(mob.dbKey || mob.monsterKey || '').toLowerCase();
            const mobName = String(mob.name || '').toLowerCase();
            const targetKey = String(dm.targetKey || '').toLowerCase();
            const targetName = String(dm.targetName || '').toLowerCase();

            // Strict 2D check: matches specific target monster type or name
            const countsForMission = mobKey.includes(targetKey) || mobName.includes(targetName);

            if (countsForMission) {
                dm.progress = (dm.progress || 0) + 1;
                if (dm.progress >= dm.targetCount) {
                    const goldReward = dm.reward || 25000;
                    this.player.gold += goldReward;
                    this.player.dailyMission = null;
                    this.audio.playSfx('lightning');
                    this.combat.spawnFloatingDamage(this.player.pos, `📜 QUEST COMPLETE! +${goldReward.toLocaleString()}G!`, true, true);
                    // 2D Exonie: Local confirmation only, NO world broadcast!
                    this.ui.showToast(`📜 MISSION COMPLETE: Defeated ${dm.targetName}s! Earned +${goldReward.toLocaleString()} Gold!`);
                } else {
                    this.ui.showToast(`📜 ${dm.targetName}: ${dm.progress} / ${dm.targetCount}`);
                }
                this.saveCharacterToAccountSlot();
                this.ui.updatePlayerHUD(this.player);
                if (this.ui.dailyMissionsModal && this.ui.dailyMissionsModal.style.display === 'flex') {
                    this.ui.renderDailyMissions();
                }
            }
        }

        // ============================================================
        // 2D TRAINING TAVERN SOLO SPEEDRUN COMPLETION & RANKING
        // ============================================================
        if (mob.isTavernBoss) {
            this.tavernTimerActive = false;
            const elapsedMs = Math.max(500, Math.round(performance.now() - (this.tavernStartTime || performance.now())));
            const cfg = this.world.tavernChallengeConfig || { bossType: 'floor', level: mob.level };
            const mobCat = mob.category || (cfg.bossType === 'floor' ? 'floor_boss' : (cfg.bossType === 'mini' ? 'mini_boss' : 'common_mobs'));

            // 1. Submit run to server for official Supabase Tavern_Leaderboard persistence
            if (this.socket) {
                this.socket.emit('submitTavernRun', {
                    mobType: mobCat,
                    mobLevel: mob.level,
                    timeTaken: elapsedMs,
                    playerLevel: this.player.level || 1,
                    playerClass: this.player.baseStats?.playerClass || this.player.className || 'Novice',
                    characterName: this.player.name || 'Hero'
                });
            }

            // 2. Local fallback update
            this.recordTavernRun(cfg.bossType, mob.level, elapsedMs);

            const secStr = (elapsedMs / 1000).toFixed(2);
            // Strict user requirement: Tavern announcement is strictly LOCAL, NEVER broadcast to WORLD
            this.appendChatLine('local', `🍺 <strong style="color:#00e5ff;">[TAVERN]</strong> Defeated Lv.${mob.level} <strong>${mob.name}</strong> in <strong style="color:#fde047;">${secStr}s</strong>!`);
            this.ui.showToast(`🍺 [TAVERN] Defeated Lv.${mob.level} ${mob.name} in ${secStr}s!`);

            // Auto-teleport back to town after victory matching 2D Exonie (No window popup per user request)
            setTimeout(() => {
                if (this.currentMapId === 'trainingtavern') {
                    this.ui.updateTavernTimer(0, false);
                    this.loadMap('town');
                }
            }, 3400);
        }

        // ============================================================
        // 2D BATTLEFIELD CO-OP RAID BOSS VICTORY (90% NULL, 9% HUGE NUGGET, 1% LV.150 DIVINE)
        // ============================================================
        if (mob.isBattlefieldBoss || this.currentMapId === 'battlefield') {
            this.audio.playSfx('lightning');
            if (this.socket) {
                this.socket.emit('battlefieldBossKilled', { bossName: mob.name, killerName: this.player.name });
            }
            const bfLoot = generateBattlefieldLoot();
            if (bfLoot) {
                this.addItemToInventory(bfLoot);
                if (bfLoot.name === 'Huge Nugget') {
                    this.combat.spawnFloatingDamage(this.player.pos, `+500,000 GOLD NUGGET!`, true, true);
                    this.ui.showWorldAnnouncement(
                        `🏰 <strong style="color:#ff1744;">[BATTLEFIELD RAID]</strong> <strong style="color:#00e5ff;">${this.player.name}</strong> slew the Lv.${mob.level} <strong>${mob.name}</strong> and claimed a <strong style="color:#ffd700;">Huge Gold Nugget (500,000 G)</strong>!`,
                        '#ff1744'
                    );
                } else {
                    this.combat.spawnFloatingDamage(this.player.pos, `🎁 [DIVINE] ${bfLoot.name}!`, true, true);
                    this.ui.showWorldAnnouncement(
                        `🏰 <strong style="color:#ff1744;">[BATTLEFIELD RAID]</strong> <strong style="color:#00e5ff;">${this.player.name}</strong> slew the Lv.${mob.level} <strong>${mob.name}</strong> and obtained <strong style="color:#facc15;">[Divine] ${bfLoot.name}</strong>!`,
                        '#facc15'
                    );
                }
            } else {
                this.ui.showToast('⚔️ Battlefield Boss defeated! (No drop this time)');
            }
            setTimeout(() => {
                if (this.currentMapId === 'battlefield') {
                    this.respawnInTown();
                }
            }, 4200);
            return;
        }

        // ============================================================
        // 2D NEUTRAL ZONE WORLD BOSS ANNOUNCEMENT
        // ============================================================
        if (mob.isNeutralBoss) {
            this.ui.showWorldAnnouncement(
                `🌲 <strong style="color:#4ade80;">[NEUTRAL ZONE]</strong> <strong style="color:#00e5ff;">${this.player.name}</strong> has defeated the Wild Woods World Boss <strong>${mob.name} (Lv.${mob.level})</strong>!`,
                '#4ade80'
            );
            if (this.socket) {
                this.socket.emit('neutralBossKilled', { bossName: mob.name, killerName: this.player.name });
            }
        }

        // ============================================================
        // 2D HAUNTED HOUSE SOLO CHALLENGE VICTORY & LOOT
        // (Wraith King is an unlimited solo minigame, NEVER has a cooldown or world announcement!)
        // ============================================================
        if (mob.isHauntedBoss || this.currentMapId === 'hauntedhouse') {
            this.audio.playSfx('lightning');
            this.ui.showHauntedHouseClear();
            const loot = generateHauntedLoot(mob.level);
            if (loot) {
                this.addItemToInventory(loot);
                this.ui.showToast(`🎁 Wraith King dropped: ${loot.name}!`);
            }
            setTimeout(() => {
                if (this.currentMapId === 'hauntedhouse') {
                    this.loadMap('town');
                }
            }, 4200);
            return; // 🛡️ CRITICAL: Never proceed to onFloorBossDefeated! Haunted House has NO boss cooldown.
        }

        // ============================================================
        // 2D DUNGEON VICTORY & AUTO-RETURN TO TOWN (NO ESCAPE PORTAL)
        // ============================================================
        if (this.currentMapId === 'dungeon1' && (mob.key === 'd1_boss' || mob.category === 'floor_boss')) {
            this.audio.playSfx('lightning');
            this.engine.addScreenshake(1.2);
            this.ui.showToast('🏆 Crystal Dungeon 1 Cleared! Slime King Defeated!');
            setTimeout(() => {
                if (this.currentMapId === 'dungeon1') {
                    this.loadMap('town');
                }
            }, 4200);
            return;
        }

        if (this.currentMapId === 'dungeon2c' && (mob.key === 'd2c_boss' || mob.category === 'floor_boss')) {
            this.audio.playSfx('lightning');
            this.engine.addScreenshake(1.5);
            this.ui.showToast('🏆 Ancient Cave Core Cleared! Ignis Dragon Defeated!');
            setTimeout(() => {
                if (this.currentMapId === 'dungeon2c') {
                    this.loadMap('town');
                }
            }, 4200);
            return;
        }

        // Boss defeat check
        if (mob.category === 'floor_boss') {
            this.onFloorBossDefeated(mob);
        }

        this.ui.updatePlayerHUD(this.player);
        if (this.ui.inventoryModal && this.ui.inventoryModal.style.display !== 'none') {
            this.ui.renderInventory();
        }

        if (this.socket) {
            this.socket.emit('monsterKill', { monsterKey: mob.monsterKey, level: mob.level });
        }
    }

    onFloorBossDefeated(mob) {
        // 🛡️ STRICT 2D EXONIE: Haunted House, Tavern, Battlefield, Neutral Zone, Dungeons NEVER set floor cooldown!
        if (this.isMazeTrial || mob.isTavernBoss || mob.isBattlefieldBoss || mob.isNeutralBoss || mob.isHauntedBoss || this.currentMapId === 'hauntedhouse' || this.currentMapId === 'trainingtavern' || this.currentMapId.startsWith('dungeon')) {
            if (this.isMazeTrial) {
                this.audio.playSfx('lightning');
                this.engine.addScreenshake(1.0);
                this.ui.showToast(`🏆 Floor Boss ${mob.name} Defeated!`);
            }
            return;
        }

        this.audio.playSfx('lightning');
        this.engine.addScreenshake(1.2);
        this.ui.showFloorCleared(this.currentMapId);

        if (!this.isMazeTrial) {
            this.ui.showWorldAnnouncement(
                `⚔️ <strong style="color:#00e5ff;">[WORLD ANNOUNCEMENT] ${this.player.name}</strong> has defeated <strong>[BOSS] ${mob.name} (Lv.${mob.level})</strong> on <strong>${this.currentMapId.toUpperCase()}</strong>!`,
                '#00e5ff'
            );
            // 24-hour Floor Boss Cooldown matching 2D Exonie (persisted to Supabase boss_timers)
            const respawnAt = Date.now() + (24 * 60 * 60 * 1000);
            this.bossCooldowns[this.currentMapId] = respawnAt;
            if (this.socket) {
                this.socket.emit('floorBossKilled', { floorId: this.currentMapId, bossName: mob.name });
            }
        } else {
            this.ui.showToast(`🏆 Maze Trial Defeated: ${mob.name}! Return to Town via portal.`);
        }

        if (this.currentMapId === 'floor10') {
            alert("🌟 CONGRATULATIONS! You have defeated The Void King on Floor 10! You have conquered the current pinnacle floor of Exonie Remastered!");
        }
    }

    // ==========================================
    // TECH GENIUS 3D GAMMA SHIELD & GOLEM SUMMON
    // ==========================================
    createPlayerShieldVFX() {
        if (this.playerShieldMesh && this.player.char3D?.group) {
            this.player.char3D.group.remove(this.playerShieldMesh);
            this.playerShieldMesh = null;
        }
        if (!this.player.char3D?.group) return;
        const geo = new THREE.SphereGeometry(1.35, 24, 24);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x00e5ff,
            transparent: true,
            opacity: 0.38,
            roughness: 0.1,
            metalness: 0.8,
            emissive: 0x00e5ff,
            emissiveIntensity: 0.65
        });
        this.playerShieldMesh = new THREE.Mesh(geo, mat);
        this.playerShieldMesh.position.set(0, 0.9, 0);
        this.player.char3D.group.add(this.playerShieldMesh);
    }

    destroyPlayerShieldVFX() {
        if (this.playerShieldMesh && this.player.char3D?.group) {
            this.engine.spawnHitSparks(this.player.pos, 0x00e5ff, 28);
            this.engine.spawnGroundShockwave(this.player.pos, 0x00e5ff, 3.8);
            this.combat.spawnFloatingDamage(this.player.pos, '💥 SHIELD BROKEN!', true, true);
            this.audio.playSfx('bump');
            this.player.char3D.group.remove(this.playerShieldMesh);
            this.playerShieldMesh = null;
        }
        this.player.shieldHp = 0;
    }

    spawnGolemBusterMinion() {
        const intVal = this.player.baseStats?.int || 10;
        const matk = Math.max(15, Math.floor((this.player.baseStats?.int || 10) * 1.8) + (this.player.mag || 10));
        this.combat.spawnGolemBuster(this.player, intVal, matk);
    }

    onMonsterHitPlayer(rawDmg, attackType = 'Attack', monster = null) {
        if (this.isGhost || this.player.isInvulnerable) return;

        // 1. 🌫️ Ninja Assassin: Smoke Bomb 75% enemy miss check
        if (this.player.smokeBombActive && Math.random() < 0.75) {
            this.combat.spawnFloatingDamage(this.player.pos, '💨 MISSED (SMOKE)!', false);
            return;
        }

        // 2. 🍃 Ninja Assassin: Passive Agility Dodge (25% at Lv.25, 35% at Lv.75)
        const pClass = this.player.baseStats?.playerClass || '';
        const pLevel = this.player.level || 1;
        if (pClass === 'Ninja Assassin' && pLevel >= 25) {
            const dodgeChance = pLevel >= 75 ? 0.35 : 0.25;
            if (Math.random() < dodgeChance) {
                this.engine.spawnHitSparks(this.player.pos, 0xb388ff, 16);
                this.combat.spawnFloatingDamage(this.player.pos, '🍃 DODGED!', true);
                this.audio.playSfx('bump');
                return;
            }
        }

        // 3. ⚔️ Blademaster: Active Parry Check (70% parry for 10s)
        if (this.player.isParrying && Math.random() < 0.70) {
            this.engine.spawnHitSparks(this.player.pos, 0x00e5ff, 20);
            this.engine.spawnSlashArc(this.player.pos, this.player.rotY, 0x00e5ff, 2.8);
            this.combat.spawnFloatingDamage(this.player.pos, '⚔️ PARRIED!', true);
            this.audio.playSfx('slash');
            return;
        }

        const cleanRaw = (typeof rawDmg === 'number' && Number.isFinite(rawDmg)) ? rawDmg : 15;
        const playerDef = (typeof this.player.def === 'number' && Number.isFinite(this.player.def)) ? this.player.def : 0;
        let dmg = Math.max(1, Math.floor(cleanRaw - playerDef));

        // 4. 🌀 Phantom Striker: Shadow Step (80% Damage Reduction for 2s)
        if (this.player.damageReductionTimer > 0) {
            dmg = Math.max(1, Math.floor(dmg * 0.20));
        }

        // 5. 🐉 Dragon Passive: Level Gap adds to damage
        if (monster && monster.isDragon && monster.level > this.player.level) {
            dmg += (monster.level - this.player.level);
        }

        // 6. 🛡️ Tech Genius Gamma Shield (Sturdy 2D Exonie: absorbs ENTIRE hit before breaking!)
        if ((this.player.shieldHp || 0) > 0) {
            if (dmg >= this.player.shieldHp) {
                dmg = 0; // Shield absorbs full hit!
                this.player.shieldHp = 0;
                this.destroyPlayerShieldVFX();
                if (this.socket) this.socket.emit('breakGammaShield', { targetId: this.player.name });
            } else {
                this.player.shieldHp -= dmg;
                this.combat.spawnFloatingDamage(this.player.pos, `🛡️ SHIELD (${this.player.shieldHp})`, false, true);
                dmg = 0;
            }
            if (dmg <= 0) return;
        }

        // 7. 🩸 Berserker Lv.75 Passive: I Love PAIN (15% chance to heal 1/3 of incoming damage)
        if (pClass === 'Berserker' && pLevel >= 75 && Math.random() < 0.15) {
            const heal = Math.max(1, Math.floor(dmg / 3));
            dmg = Math.max(1, dmg - heal);
            this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
            this.combat.spawnFloatingDamage(this.player.pos, `🩸 +${heal} HP (PAIN!)`, false, true);
            this.engine.spawnHitSparks(this.player.pos, 0xff1744, 12);
        }

        // 8. 🔥 Berserker Lv.50 Immortal Check (HP cannot drop below 1 for 10s)
        const currHp = (typeof this.player.hp === 'number' && Number.isFinite(this.player.hp)) ? this.player.hp : (this.player.maxHp || 105);
        this.player.hp = Math.max(this.player.isImmortal ? 1 : 0, currHp - dmg);
        this.audio.playSfx('bump');
        this.combat.spawnFloatingDamage(this.player.pos, `-${dmg} (${attackType})`, false);
        this.engine.addScreenshake(0.4);
        this.ui.updatePlayerHUD(this.player);

        if (Number.isNaN(this.player.hp) || this.player.hp <= 0) {
            this.player.hp = 0;
            this.isGhost = true;
            this.destroyPlayerShieldVFX();
            this.audio.playSfx('bump');
            this.ui.updatePlayerHUD(this.player);
            this.ui.showDeathScreen(this.hasRevivalJuice());
        }
    }

    // EXP and Leveling up matching 2D Exonie exactly
    gainExp(amt) {
        if (this.player.level >= MAX_LEVEL) return;
        let finalAmt = Number(amt) || 0;
        // 🏰 Authentic 2D Exonie Guild Level Perk (+2% bonus EXP per level)
        const gLevel = Number(this.player.guild_details?.level || 0);
        if (gLevel > 0) {
            finalAmt += Math.ceil(finalAmt * (gLevel * 0.02));
        }
        this.player.exp += finalAmt;

        while (this.player.exp >= this.player.maxExp && this.player.level < MAX_LEVEL) {
            this.player.exp -= this.player.maxExp;
            this.player.level++;
            this.player.maxExp += getExpForNextLevel(this.player.level);
            
            // 2D Exonie level up growth: +10 HP, +2 STR, +2 INT
            this.player.baseStats.hp += 10;
            this.player.baseStats.str += 2;
            this.player.baseStats.int += 2;

            this.recalculateStats();
            this.player.hp = this.player.maxHp;

            this.engine.spawnLevelUpVFX(this.player.pos);
            this.combat.spawnFloatingDamage(this.player.pos, "LEVEL UP!", true);
            this.audio.playSfx('splash');
            this.ui.showToast(`LEVEL UP! You are now Level ${this.player.level}!`);
            this.saveCharacterToAccountSlot();
        }
    }

    // Check if player stepped into any map teleport portal or interactive Town house doorway
    checkPortalCollision() {
        if (this.portalCooldown > 0 || this.isGhost) return;
        if (this.ui && this.ui.isAnyModalOpen()) return;

        const triggeredPortal = this.world.checkPortalTrigger(this.player.pos.x, this.player.pos.z);
        if (triggeredPortal) {
            const tid = triggeredPortal.targetMapId;

            // 🛡️ NO ESCAPE: Haunted House, Training Tavern, and Dungeons have NO return / escape portals ("There's no escape in these places")
            if (tid === 'town' || tid.startsWith('floor')) {
                if (this.currentMapId === 'trainingtavern' || this.currentMapId === 'hauntedhouse' || this.currentMapId.startsWith('dungeon')) {
                    return;
                }
            }

            // ⚔️ AUTHENTIC 2D PARTY PORTAL GATING: All party members must be on the portal pad
            const isCoopZone = tid.startsWith('dungeon') || tid.startsWith('floor') || tid === 'battlefield' || tid === 'neutralzone' || tid === 'neutral_zone' || tid === 'maze_guide' || tid === 'hauntedhouse';
            if (isCoopZone && this.party && this.party.members && this.party.members.length > 1) {
                const partyCheck = this.isPartyReadyAtPortal(triggeredPortal.x, triggeredPortal.z);
                if (!partyCheck.ready) {
                    this.portalCooldown = 3.0;
                    this.audio.playSfx('bump');
                    const now = Date.now();
                    if (!this._lastPortalWaitEmit || (now - this._lastPortalWaitEmit > 12000)) {
                        this._lastPortalWaitEmit = now;
                        this.ui.showToast(`⚔️ [Party Teleport] All party members must be on the portal to enter! (${partyCheck.readyCount}/${partyCheck.totalCount} ready)`);
                        this.socket?.emit('partyPortalWait', {
                            portalName: triggeredPortal.label || tid,
                            portalX: triggeredPortal.x,
                            portalZ: triggeredPortal.z,
                            readyCount: partyCheck.readyCount,
                            totalCount: partyCheck.totalCount
                        });
                    }
                    return;
                }
            }

            if (tid === 'marketplace') {
                if (this.ui.marketplaceModal && this.ui.marketplaceModal.style.display === 'flex') return;
                this.portalCooldown = 4.0;
                this.audio.playSfx('bump');
                this.ui.toggleMarketplace();
                return;
            }
            if (tid === 'storage') {
                if (this.ui.storageModal && this.ui.storageModal.style.display === 'flex') return;
                this.portalCooldown = 4.0;
                this.audio.playSfx('bump');
                this.ui.openStorageUI();
                return;
            }
            if (tid === 'daily_missions') {
                if (this.ui.dailyMissionsModal && this.ui.dailyMissionsModal.style.display === 'flex') return;
                this.portalCooldown = 4.0;
                this.audio.playSfx('bump');
                this.ui.openDailyMissionsUI();
                return;
            }
            if (tid === 'trainingtavern') {
                if (this.ui.tavernModal && this.ui.tavernModal.style.display === 'flex') return;
                this.portalCooldown = 4.0;
                this.audio.playSfx('bump');
                this.ui.openTavernModal();
                return;
            }
            if (tid === 'leaderboard') {
                if (this.ui.leaderboardModal && this.ui.leaderboardModal.style.display === 'flex') return;
                this.portalCooldown = 4.0;
                this.audio.playSfx('bump');
                this.ui.openLeaderboardModal('floor');
                return;
            }
            // 🛡️ Maze Guide Station in Town: Opens Maze Guide
            if (tid === 'maze_guide') {
                this.portalCooldown = 3.0;
                this.audio.playSfx('bump');
                window.openMazeGuide();
                return;
            }

            // 🏡 Authentic 2D Exonie Private Residence (Home) Intercept (Per Character)
            if (tid === 'home') {
                const hasHome = !!(this.player.baseStats && this.player.baseStats.hasHome);
                const isParty = this.party && this.party.members && this.party.members.length > 1;
                const isLeader = !isParty || (this.party.leader === this.player.name);

                if (!hasHome) {
                    if (isLeader) {
                        this.portalCooldown = 3.0;
                        this.player.pos.z += 2.5; // Bounce player back so they don't get stuck
                        this.audio.playSfx('bump');
                        this.ui.openHomeSaleUI();
                        return;
                    }
                }
            }

            // 🏰 Authentic 2D Exonie Guild Station (Portal K) Intercept
            if (tid === 'guildbase') {
                this.portalCooldown = 3.0;
                this.audio.playSfx('bump');
                this.ui.toggleGuildModal();
                return;
            }

            // 🛡️ Maze Trial Portal Lock: Only Return to Town allowed
            if (this.isMazeTrial && tid !== 'town') {
                this.portalCooldown = 3.0;
                this.audio.playSfx('bump');
                this.ui.showToast('⚠️ You are in a Maze Trial! You can only teleport back to Town.');
                return;
            }

            if (this.isMazeTrial && tid === 'town') {
                this.isMazeTrial = false;
            }
            if (tid === 'event_cave' && !EVENT_CAVE_ACTIVE) {
                this.portalCooldown = 3.0;
                this.audio.playSfx('bump');
                this.ui.showToast('⚠️ The Event Cave is currently closed. Stay tuned for future events!');
                return;
            }
            if (tid === 'hauntedhouse') {
                if (this.ui.hauntedHouseModal && this.ui.hauntedHouseModal.style.display === 'flex') return;
                this.portalCooldown = 4.0;
                this.audio.playSfx('bump');
                this.ui.openHauntedHouseModal();
                return;
            }
            if (tid === 'dungeon1' || tid === 'dungeon2a') {
                this.portalCooldown = 4.0;
                this.audio.playSfx('bump');
                this.ui.openDungeonModal(tid, triggeredPortal.label);
                return;
            }

            if (tid === 'battlefield') {
                const bfRemaining = (this.bossCooldowns && this.bossCooldowns['battlefield_boss']) ? (this.bossCooldowns['battlefield_boss'] - Date.now()) : 0;
                if (bfRemaining > 0) {
                    this.portalCooldown = 3.0;
                    this.audio.playSfx('bump');
                    const hrs = (bfRemaining / 3600000).toFixed(1);
                    this.ui.showToast(`🏰 [BATTLEFIELD] No threat outside the castle yet. Next assault in ~${hrs} hours.`);
                    return;
                }
            }

            this.portalCooldown = 3.2;
            this.audio.playSfx('splash');
            this.ui.showToast(`Entering ${triggeredPortal.label}...`);
            if (window.showLoadingTransition) {
                window.showLoadingTransition(
                    triggeredPortal.label,
                    triggeredPortal.subtitle || 'Entering Realm...',
                    1350,
                    () => {
                        this.loadMap(triggeredPortal.targetMapId, triggeredPortal.targetX, triggeredPortal.targetY);
                    }
                );
            } else {
                this.loadMap(triggeredPortal.targetMapId, triggeredPortal.targetX, triggeredPortal.targetY);
            }
        }
    }

    // Check if all living party members are standing on the portal trigger pad
    isPartyReadyAtPortal(portalX, portalZ, maxDist = 4.2) {
        if (!this.party || !this.party.members || this.party.members.length <= 1) {
            return { ready: true, readyCount: 1, totalCount: 1 };
        }

        let totalLiving = 0;
        let readyCount = 0;
        const myName = (this.player && this.player.name) || '';

        for (const m of this.party.members) {
            if (m.isGhost) continue; // Ghosts don't block party entry
            totalLiving++;

            if (m.name === myName || m.id === myName) {
                // Local player is standing on this portal
                readyCount++;
                continue;
            }

            // Find remote player in the current map
            let memberFound = false;
            for (const sid in this.remotePlayers) {
                const rp = this.remotePlayers[sid];
                if (rp && (rp.name === m.name || rp.name === m.id)) {
                    memberFound = true;
                    const d = Math.hypot(rp.targetPos.x - portalX, rp.targetPos.z - portalZ);
                    if (d <= maxDist) {
                        readyCount++;
                    }
                    break;
                }
            }
        }

        return {
            ready: readyCount >= totalLiving,
            readyCount,
            totalCount: totalLiving
        };
    }

    // ==========================================
    // 💎 CASH SHOP (EXO EMPORIUM) CLAIM ENGINE
    // ==========================================
    claimCashShopItem(itemId) {
        const item = CASH_SHOP_ITEMS.find(it => it.id === itemId);
        if (!item) return;

        // Check inventory space (30 slots)
        let emptyIdx = -1;
        for (let i = 0; i < 30; i++) {
            if (!this.player.inventory[i]) {
                emptyIdx = i;
                break;
            }
        }

        if (emptyIdx === -1) {
            this.audio.playSfx('bump');
            this.ui.showToast('🎒 Your inventory bag is full! Free up a slot first.');
            return;
        }

        // Clone item into bag
        const newItem = {
            id: item.id,
            name: item.name,
            type: item.type,
            sprite: item.sprite,
            rarity: item.rarity || 'Godly',
            color: item.color || '#e040fb',
            desc: item.desc,
            enhanceLevel: 0,
            quantity: item.quantity || 1
        };

        this.player.inventory[emptyIdx] = newItem;
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('pickup');
        this.ui.showToast(`💎 Claimed [${item.name}] from Cash Shop (Free Trial)! Press B/I to view.`);
        this.ui.renderInventory();
    }

    // ==========================================
    // 🔄 TRADE SYSTEM (2D EXONIE REPLICATED)
    // ==========================================
    requestTrade(targetName) {
        if (!targetName || targetName === this.player.name) return;
        if (this.socket && this.socket.connected) {
            this.socket.emit('tradeRequest', { targetId: targetName, targetName });
            this.ui.showToast(`🔄 Trade request sent to ${targetName}...`);
        }
    }

    respondTrade(accept) {
        const fromName = this.ui.pendingTradeFrom;
        this.ui.hideTradeDialog();
        if (!fromName) return;
        if (this.socket && this.socket.connected) {
            this.socket.emit('tradeInviteResponse', { fromId: fromName, accept: !!accept });
        }
    }

    addOrRemoveTradeItem(inventoryIndex) {
        const item = this.player.inventory[inventoryIndex];
        if (!item) return;

        if (!this.myTradeItems) this.myTradeItems = [null, null, null];

        // If already in trade, remove it
        const existingIdx = this.myTradeItems.findIndex(it => it && it.id === item.id);
        if (existingIdx !== -1) {
            this.myTradeItems[existingIdx] = null;
            this.audio.playSfx('bump');
            this.ui.showToast(`Removed ${item.name} from trade.`);
        } else {
            // Find empty trade slot (max 3)
            const emptyIdx = this.myTradeItems.findIndex(it => it === null);
            if (emptyIdx === -1) {
                this.audio.playSfx('bump');
                this.ui.showToast('⚠️ Maximum 3 items allowed per trade!');
                return;
            }
            this.myTradeItems[emptyIdx] = item;
            this.audio.playSfx('pickup');
            this.ui.showToast(`Added ${item.name} to trade offer.`);
        }

        this.syncTradeOffer();
        this.ui.renderTradeSlots();
    }

    removeTradeItemAt(tradeIndex) {
        if (!this.myTradeItems || !this.myTradeItems[tradeIndex]) return;
        const item = this.myTradeItems[tradeIndex];
        this.myTradeItems[tradeIndex] = null;
        this.audio.playSfx('bump');
        this.ui.showToast(`Removed ${item.name} from trade.`);
        this.syncTradeOffer();
        this.ui.renderTradeSlots();
    }

    setTradeGold(amount) {
        const parsed = Math.max(0, parseInt(amount) || 0);
        this.myTradeGold = Math.min(this.player.gold || 0, parsed);
        this.syncTradeOffer();
    }

    syncTradeOffer() {
        if (!this.socket || !this.socket.connected || !this.ui.isTradeOpen) return;
        const offeredItems = (this.myTradeItems || []).filter(Boolean);
        this.socket.emit('tradeSync', {
            gold: this.myTradeGold || 0,
            items: offeredItems
        });
    }

    confirmTrade() {
        if (!this.socket || !this.socket.connected || !this.ui.isTradeOpen) return;
        this.socket.emit('requestConfirmTrade');
        this.audio.playSfx('bump');
    }

    cancelTrade() {
        if (this.socket && this.socket.connected && this.ui.isTradeOpen) {
            this.socket.emit('tradeCancel');
        }
        this.myTradeItems = [null, null, null];
        this.theirTradeItems = [null, null, null];
        this.myTradeGold = 0;
        this.theirTradeGold = 0;
        this.tradeTarget = null;
        this.ui.closeTradeModal();
        this.ui.showToast('Trade cancelled.');
    }

    // Check if player has Revival Juice in bag
    hasRevivalJuice() {
        if (this.currentMapId === 'trainingtavern') return false;
        for (let i = 0; i < 30; i++) {
            const it = this.player.inventory[i];
            if (it && (it.name === 'Revival Juice' || it.sprite === 'revival_juice')) {
                return true;
            }
        }
        return false;
    }

    // Use Revival Juice on Death Screen to revive on the spot with 100% HP
    useRevivalJuice() {
        if (this.currentMapId === 'trainingtavern') {
            this.ui.showToast("⚠️ Revival Juice cannot be used in the Training Tavern!");
            this.audio.playSfx('bump');
            return;
        }
        for (let i = 0; i < 30; i++) {
            const it = this.player.inventory[i];
            if (it && (it.name === 'Revival Juice' || it.sprite === 'revival_juice')) {
                it.quantity = (it.quantity || 1) - 1;
                if (it.quantity <= 0) this.player.inventory[i] = null;
                this.isGhost = false;
                this.player.hp = this.player.maxHp;
                this.player.mp = this.player.maxMp;
                this.ui.hideDeathScreen();
                this.audio.playSfx('splash');
                this.engine.spawnLevelUpVFX(this.player.pos);
                this.combat.spawnFloatingDamage(this.player.pos, "REVIVED! FULL HP!", true, true);
                this.ui.updatePlayerHUD(this.player);
                return;
            }
        }
    }

    // Respawn in Town from Death Screen (or Settings Unstuck) with 100% FULL HP!
    respawnInTown() {
        this.ui.hideDeathScreen();
        this.isMazeTrial = false;
        if (window.showLoadingTransition) {
            window.showLoadingTransition(
                'Town of Exonie',
                'Restoring Life Force & Returning to Sanctuary...',
                950,
                () => {
                    this.isGhost = false;
                    this.isMazeTrial = false;
                    this.recalculateStats();
                    this.player.hp = this.player.maxHp;
                    this.player.mp = this.player.maxMp;
                    this.loadMap('town');
                    this.ui.updatePlayerHUD(this.player);
                    this.combat.spawnFloatingDamage(this.player.pos, "HP FULLY RESTORED!", false, true);
                    this.ui.showToast("Returned to Town of Exonie with full HP!");
                }
            );
        } else {
            this.isGhost = false;
            this.isMazeTrial = false;
            this.recalculateStats();
            this.player.hp = this.player.maxHp;
            this.player.mp = this.player.maxMp;
            this.loadMap('town');
            this.ui.updatePlayerHUD(this.player);
        }
    }

    // Buy item from Town Marketplace House
    buyMarketplaceItem(kind) {
        const prices = {
            potion: 100,
            potions: 100,
            refinement: 800,
            stone: 800,
            gem: 1200,
            revival: 500
        };
        const cost = prices[kind] || 100;
        const currentGold = this.player.gold || 0;
        if (currentGold < cost) {
            this.audio.playSfx('bump');
            this.ui.showToast(`⚠️ Not enough Gold! Need ${cost} Gold.`);
            const itemLabels = {
                potion: 'Health Potion x5',
                potions: 'Health Potion x5',
                refinement: 'Refinement Stone',
                stone: 'Refinement Stone',
                gem: 'Power Gem',
                revival: 'Revival Juice'
            };
            if (this.ui?.showNotEnoughGoldModal) {
                this.ui.showNotEnoughGoldModal(cost, currentGold, `Marketplace (${itemLabels[kind] || kind})`);
            }
            return;
        }

        let newItem = null;
        if (kind === 'potion' || kind === 'potions') {
            newItem = {
                name: 'Health Potion',
                type: 'potion',
                rarity: 'Basic',
                level: 1,
                quantity: 5,
                fixedStat: { hpHeal: 50 },
                sprite: 'potion1',
                desc: 'Restores 50 HP when consumed.'
            };
        } else if (kind === 'refinement' || kind === 'stone') {
            newItem = {
                name: 'Refinement Stone',
                type: 'material',
                rarity: 'Unique',
                level: 1,
                sprite: 'refinementstone',
                desc: 'Upgrades your equipped weapon (+1 Refinement Level & +15% stats).'
            };
        } else if (kind === 'gem') {
            newItem = {
                name: 'Power Gem',
                type: 'material',
                rarity: 'Legendary',
                level: 1,
                sprite: 'powergem',
                desc: 'Imbues your equipped weapon with bonus STR and INT.'
            };
        } else if (kind === 'revival') {
            newItem = {
                name: 'Revival Juice',
                type: 'potion',
                rarity: 'Unique',
                level: 1,
                quantity: 1,
                fixedStat: { hpHeal: 99999 },
                sprite: 'revivaljuice',
                desc: 'Allows instant revival on the spot if you fall in the Maze.'
            };
        }

        if (!this.addItemToInventory(newItem)) {
            this.ui.showToast("⚠️ Your inventory bag is full!");
            return;
        }

        this.player.gold -= cost;
        this.saveCharacterToAccountSlot();
        this.audio.playSfx('splash');
        this.ui.showToast(`🛒 Purchased ${newItem.name}!`);
        this.ui.updatePlayerHUD(this.player);
        const mGold = document.getElementById('market-gold-val');
        if (mGold) mGold.textContent = this.player.gold.toLocaleString();
    }

    // ==========================================
    // GAME LOOP (60 FPS FLUID ACTION)
    // ==========================================
    gameLoop(timestamp) {
        requestAnimationFrame((t) => this.gameLoop(t));

        const delta = Math.min(0.1, (timestamp - this.lastTime) * 0.001);
        this.lastTime = timestamp;

        // 🛡️ Pre-Game Guard: Never run game loop systems, HUD updates, or cooldowns if not actively in-game!
        if (!this.hasEnteredWorld || (window.ExonieFlow && window.ExonieFlow.step !== 'game')) {
            return;
        }

        if (this.portalCooldown > 0) this.portalCooldown -= delta;
        if (this.combat.cooldowns.dodge > 0) this.combat.cooldowns.dodge -= delta;
        if (this.playerStunTimer > 0) this.playerStunTimer -= delta;

        // Sync Skill 1 & Skill 2 Frontend Hotbar Cooldown Overlays with actual Cooldowns
        const cd1 = this.combat.cooldowns.skill1;
        const maxCd1 = this.combat.maxCooldowns?.skill1 || 1;
        const cdEl1 = document.getElementById('cd-1');
        const cdtEl1 = document.getElementById('cdt-1');
        if (cd1 > 0) {
            const pct = Math.min(100, (cd1 / maxCd1) * 100);
            if (cdEl1) cdEl1.style.height = `${pct}%`;
            if (cdtEl1) { cdtEl1.style.display = 'flex'; cdtEl1.textContent = Math.ceil(cd1); }
        } else {
            if (cdEl1) cdEl1.style.height = '0%';
            if (cdtEl1) cdtEl1.style.display = 'none';
        }

        const cd2 = this.combat.cooldowns.skill2;
        const maxCd2 = this.combat.maxCooldowns?.skill2 || 1;
        const cdEl2 = document.getElementById('cd-2');
        const cdtEl2 = document.getElementById('cdt-2');
        if (cd2 > 0) {
            const pct = Math.min(100, (cd2 / maxCd2) * 100);
            if (cdEl2) cdEl2.style.height = `${pct}%`;
            if (cdtEl2) { cdtEl2.style.display = 'flex'; cdtEl2.textContent = Math.ceil(cd2); }
        } else {
            if (cdEl2) cdEl2.style.height = '0%';
            if (cdtEl2) cdtEl2.style.display = 'none';
        }

        if (this.potionCooldown > 0) {
            this.potionCooldown -= delta;
            const potOverlay = document.getElementById('cd-3');
            const potTxt = document.getElementById('cdt-3');
            if (this.potionCooldown > 0) {
                const pct = (this.potionCooldown / 5.0) * 100;
                if (potOverlay) potOverlay.style.height = `${pct}%`;
                if (potTxt) { potTxt.style.display = 'flex'; potTxt.textContent = Math.ceil(this.potionCooldown); }
            } else {
                if (potOverlay) potOverlay.style.height = '0%';
                if (potTxt) potTxt.style.display = 'none';
            }
        }

        if (!this.player.char3D) return;

        // If player is defeated (on Death Screen), render scene ambiance without movement/combat
        if (this.isGhost) {
            this.world.update(delta, this.player.pos);
            this.combat.update(delta);
            this.engine.updateParticles(delta);
            this.engine.updateCamera(this.player.pos, delta);
            this.engine.render();
            return;
        }

        // Tech Genius / Touchpad Auto-Proximity Gadget Drone (fires automatically every 1.0s when near monsters)
        this.combat.updateAutoDrone(delta, this.player, this.monsters, (deadMob) => {
            this.onMonsterDefeated(deadMob);
        });

        // Jump & Vertical Gravity Physics
        if (this.player.isJumping || this.player.pos.y > 0) {
            this.player.velocityY -= this.gravity * delta;
            this.player.pos.y += this.player.velocityY * delta;
            if (this.player.pos.y <= 0) {
                this.player.pos.y = 0;
                this.player.velocityY = 0;
                this.player.isJumping = false;
                if (this.player.char3D) this.player.char3D.onLand();
            }
        }

        // 1. Process Player Movement
        let inputX = 0;
        let inputZ = 0;

        if (!this.isChatting) {
            if (this.keys['KeyW'] || this.keys['ArrowUp']) inputZ -= 1;
            if (this.keys['KeyS'] || this.keys['ArrowDown']) inputZ += 1;
            if (this.keys['KeyA'] || this.keys['ArrowLeft']) inputX -= 1;
            if (this.keys['KeyD'] || this.keys['ArrowRight']) inputX += 1;
        }

        if (this.ui.joystick.active) {
            inputX = this.ui.joystick.vectorX;
            inputZ = this.ui.joystick.vectorY;
        }

        const isMoving = (!this.playerStunTimer || this.playerStunTimer <= 0) && Math.hypot(inputX, inputZ) > 0.1;

        if (isMoving && !this.player.char3D.isAttacking) {
            const camYaw = this.engine.cameraYaw;
            const moveAngle = Math.atan2(inputX, inputZ) + camYaw;

            const speed = this.player.speed * (this.player.char3D.isDodging ? 2.2 : 1.0);
            const moveX = Math.sin(moveAngle) * speed * delta;
            const moveZ = Math.cos(moveAngle) * speed * delta;

            const nextX = this.player.pos.x + moveX;
            const nextZ = this.player.pos.z + moveZ;

            if (!this.world.checkCollision(nextX, this.player.pos.z, 0.6)) {
                this.player.pos.x = nextX;
            }
            if (!this.world.checkCollision(this.player.pos.x, nextZ, 0.6)) {
                this.player.pos.z = nextZ;
            }

            this.player.rotY = moveAngle;
            this.player.moveDir.set(Math.sin(moveAngle), 0, Math.cos(moveAngle));
        } else if (this.engine.isPointerLocked && !this.player.char3D.isDodging) {
            // In Dragon Nest pointer lock mode, player naturally faces crosshair direction when idle/aiming
            this.player.rotY = this.engine.cameraYaw + Math.PI;
            this.player.moveDir.set(Math.sin(this.player.rotY), 0, Math.cos(this.player.rotY));
        }

        // Update 3D Character Rig
        this.player.char3D.group.position.copy(this.player.pos);
        this.player.char3D.group.rotation.y = this.player.rotY;
        this.player.char3D.update(delta, isMoving, 1.0);

        // Tech Genius Lv.75 Passive: Advance Medicine (Heals shielded player for 10% INT/sec)
        const pClass = this.player.baseStats?.playerClass || '';
        if (pClass === 'Tech Genius' && this.player.level >= 75 && (this.player.shieldHp || 0) > 0) {
            this.medTimer = (this.medTimer || 0) + delta;
            if (this.medTimer >= 1.5) {
                this.medTimer = 0;
                const heal = Math.max(2, Math.floor((this.player.baseStats.int || 10) * 0.10));
                if (this.player.hp < this.player.maxHp) {
                    this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
                    this.combat.spawnFloatingDamage(this.player.pos, `+${heal} HP (Med)`, false, true);
                    this.ui.updatePlayerHUD(this.player);
                }
            }
        }

        // 2. Floor Boss Respawn Timer per floor & Neutral Zone / Battlefield timers
        const bossRemainingKey = this.currentMapId === 'neutralzone' ? 'neutralzone_boss' : (this.currentMapId === 'battlefield' ? 'battlefield_boss' : this.currentMapId);
        const bossRemaining = (this.bossCooldowns && this.bossCooldowns[bossRemainingKey]) ? (this.bossCooldowns[bossRemainingKey] - Date.now()) : 0;
        if (bossRemaining > 0 && (this.currentMapId.startsWith('floor') || this.currentMapId === 'neutralzone' || this.currentMapId === 'battlefield')) {
            const timerLabel = this.currentMapId === 'neutralzone' ? 'Neutral Zone Boss Respawns in:' : (this.currentMapId === 'battlefield' ? 'Raid Boss Respawns in:' : 'Floor Boss Respawns in:');
            this.ui.updateFloorBossTimer(bossRemaining, timerLabel);
            if (this.currentMapId === 'neutralzone' && this.world && this.world.updateNeutralBossAltarTimer) {
                this.world.updateNeutralBossAltarTimer(bossRemaining);
            }
        } else {
            this.ui.updateFloorBossTimer(0);
            if (this.currentMapId === 'neutralzone' && this.world && this.world.updateNeutralBossAltarTimer) {
                this.world.updateNeutralBossAltarTimer(0);
            }
        }

        if (this.player.damageReductionTimer > 0) {
            this.player.damageReductionTimer = Math.max(0, this.player.damageReductionTimer - delta);
        }

        // 3. Update Monsters AI, Respawn Timers & Combat
        if (this.tavernTimerActive && this.currentMapId === 'trainingtavern') {
            const elapsedSec = (performance.now() - (this.tavernStartTime || performance.now())) * 0.001;
            this.ui.updateTavernTimer(elapsedSec, true);
        }

        for (const m of this.monsters) {
            // Always update monster so dead monsters tick down their 2D respawn timer & floating countdown UI!
            m.update(delta, this.player.pos, (dmg) => this.onMonsterHitPlayer(dmg, 'Charge', m));
            if (!m.isAlive) continue;

            // Dynamic Boss BGM shift when approaching Floor Boss / World Boss
            if (m.category === 'floor_boss' && this.currentMapId.startsWith('floor') && this.currentMapId !== 'floor10') {
                const distToBoss = this.player.pos.distanceTo(m.group.position);
                if (distToBoss < 28 && this.audio.currentTrackName !== 'bossfight') {
                    this.audio.playBgm('bossfight');
                }
            }

            // Monster attacks player or provoked minion if in melee range
            if (m.state === 'attack') {
                m.attackCooldown -= delta;
                if (m.attackCooldown <= 0) {
                    m.attackCooldown = 1.4;

                    // 🛡️ GOLEM BUSTER / MINION TAUNT INTERCEPT: Damage minion instead of Tech Genius player!
                    if (m.provokeTimer > 0 && m.provokeTarget && m.provokeTarget.group) {
                        const minion = m.provokeTarget;
                        let minionDmg = Math.max(1, m.atk - (minion.def || 0));
                        if ((minion.shieldHp || 0) > 0) {
                            const absorbed = Math.min(minion.shieldHp, minionDmg);
                            minion.shieldHp -= absorbed;
                            minionDmg -= absorbed;
                            if (minion.shieldHp <= 0 && minion.shieldMesh) {
                                minion.group.remove(minion.shieldMesh);
                                minion.shieldMesh = null;
                            }
                        }
                        if (minionDmg > 0) {
                            minion.hp = (minion.hp || 100) - minionDmg;
                        }
                        this.audio.playSfx(m.getAttackSfx ? m.getAttackSfx() : 'bump');
                        this.engine.spawnHitSparks(minion.group.position, 0x00e5ff, 12);
                        this.combat.spawnFloatingDamage(minion.group.position, `-${minionDmg}`, false);
                        if (minion.hp <= 0) {
                            if (minion.group.parent) minion.group.parent.remove(minion.group);
                            this.combat.minions = (this.combat.minions || []).filter(item => item !== minion);
                            m.provokeTarget = null;
                            m.provokeTimer = 0;
                        }
                        continue; // Tech Genius takes ZERO damage!
                    }

                    // 1. Dodge invulnerability check (i-frames)
                    if (this.player.isInvulnerable) {
                        this.combat.spawnFloatingDamage(this.player.pos, "DODGED!", false, true);
                        continue;
                    }
                    // 2. Ninja Assassin Smoke Bomb (75% miss) & Agility (25% / 35% dodge)
                    if (this.player.smokeBombActive && Math.random() < 0.75) {
                        this.combat.spawnFloatingDamage(this.player.pos, "MISS (SMOKE)!", false, true);
                        continue;
                    }
                    if (pClass === 'Ninja Assassin' && this.player.level >= 25) {
                        const dodgeChance = this.player.level >= 75 ? 0.35 : 0.25;
                        if (Math.random() < dodgeChance) {
                            this.combat.spawnFloatingDamage(this.player.pos, "AGILITY DODGE!", false, true);
                            continue;
                        }
                    }
                    // 3. Blademaster Parry (70% chance to parry incoming attack)
                    if (this.player.isParrying && Math.random() < 0.70) {
                        this.combat.spawnFloatingDamage(this.player.pos, "⚔️ PARRIED!", true, true);
                        this.engine.spawnHitSparks(this.player.pos, 0x00e5ff, 12);
                        continue;
                    }

                    let dmg = Math.max(1, m.atk - this.player.def);
                    if (m.isDragon && m.level > this.player.level) {
                        dmg += (m.level - this.player.level);
                    }

                    // 4. Berserker Lv.75 Passive: I love PAIN (15% chance to heal 1/3 of incoming damage)
                    if (pClass === 'Berserker' && this.player.level >= 75 && Math.random() < 0.15) {
                        const painHeal = Math.max(2, Math.floor(dmg / 3));
                        this.player.hp = Math.min(this.player.maxHp, this.player.hp + painHeal);
                        this.combat.spawnFloatingDamage(this.player.pos, `+${painHeal} (I LOVE PAIN!)`, true, true);
                        this.ui.updatePlayerHUD(this.player);
                        continue;
                    }

                    // 5. Tech Genius Gamma Shield absorption
                    if ((this.player.shieldHp || 0) > 0) {
                        const absorbed = Math.min(this.player.shieldHp, dmg);
                        this.player.shieldHp -= absorbed;
                        dmg -= absorbed;
                        if (this.player.shieldHp <= 0) {
                            this.destroyPlayerShieldVFX();
                        } else {
                            this.combat.spawnFloatingDamage(this.player.pos, `SHIELD (${this.player.shieldHp})`, false, true);
                        }
                        if (dmg <= 0) {
                            continue;
                        }
                    }

                    this.player.hp = Math.max(this.player.isImmortal ? 1 : 0, this.player.hp - dmg);
                    this.audio.playSfx(m.getAttackSfx ? m.getAttackSfx() : 'bump');
                    this.combat.spawnFloatingDamage(this.player.pos, `-${dmg}`, false);
                    this.engine.addScreenshake(0.3);
                    this.ui.updatePlayerHUD(this.player);

                    if (this.player.hp <= 0) {
                        this.player.hp = 0;
                        this.isGhost = true;
                        this.audio.playSfx('bump');
                        this.ui.updatePlayerHUD(this.player);
                        this.ui.showDeathScreen(this.hasRevivalJuice());
                        break;
                    }
                }
            }
        }

        // 3. Update Boss Health Bar (Only show when boss has been attacked / engaged!)
        if (this.bossEngaged && this.floorBoss && this.floorBoss.isAlive) {
            this.ui.updateBossHealth(this.floorBoss);
        } else {
            this.ui.updateBossHealth(null);
        }

        // 4. Check World Portals
        this.checkPortalCollision();

        // 5. Update Local Player Overhead UI
        if (this.player.char3D && this.player.char3D.updateOverheadUI) {
            const guildName = this.player.guild || (this.player.guild_details && this.player.guild_details.name) || null;
            this.player.char3D.updateOverheadUI(this.player.name, this.player.level, this.player.hp, this.player.maxHp, true, this.player.title || null, guildName);
        }

        // 6. Update Remote Players & Multiplayer Sync
        this.updateRemotePlayers(delta);

        if (this.socket && this.socket.connected) {
            this._moveEmitTimer = (this._moveEmitTimer || 0) + delta;
            if (this._moveEmitTimer >= 0.05) {
                this._moveEmitTimer = 0;
                this.socket.emit('playerMove', {
                    x: this.player.pos.x,
                    y: this.player.pos.y,
                    z: this.player.pos.z,
                    rotY: this.player.rotY,
                    anim: isMoving ? 'walk' : 'idle',
                    hp: this.player.hp,
                    maxHp: this.player.maxHp,
                    weapon: this.player.equips?.weapon || null,
                    equips: this.player.equips || {}
                });
            }
        }

        // 7. Update Systems & 15-Minute Day/Night Cycle Rotation
        const isTown = this.currentMapId === 'town';
        const dayNight = this.engine.updateDayNightCycle(delta, isTown);
        if (this.ui && this.ui.updateDayNightIndicator) {
            this.ui.updateDayNightIndicator(dayNight);
        }

        this.world.update(delta, this.player.pos);
        this.combat.update(delta, this.player, this.monsters, (deadMob) => {
            this.onMonsterDefeated(deadMob);
        });
        this.engine.updateParticles(delta);
        this.engine.updateCamera(this.player.pos, delta);

        // Pointer Lock Reticle Interaction: Raycast center of screen when in aim mode
        if (this.engine && this.engine.isPointerLocked) {
            const now = performance.now();
            if (now - (this._lastAimCheck || 0) >= 50) {
                this._lastAimCheck = now;
                const centerX = window.innerWidth / 2;
                const centerY = window.innerHeight / 2;
                const hitPlayer = this.checkPlayerRaycast(centerX, centerY);
                if (hitPlayer) {
                    this.setHoveredPlayer(hitPlayer, centerX, centerY, true);
                } else if (this.hoveredPlayer) {
                    this.clearHoveredPlayer();
                }
            }
        }

        // 8. Render Minimap
        this.ui.renderMinimap(this.player.pos, this.player.rotY, this.monsters, this.world.portals);

        // 9. Render 3D Scene
        this.engine.render();
    }
}

// Start Game reliably whether DOMContentLoaded has already fired or not
function initGame() {
    if (!window.game) {
        window.game = new GameApp();
        window.gameInstance = window.game;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

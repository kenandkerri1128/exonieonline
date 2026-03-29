require('dotenv').config();
const { google } = require('googleapis');

// ==========================================
// 💳 STORE CREDENTIALS (TO BE FILLED LATER)
// ==========================================
const GOOGLE_PACKAGE_NAME = 'com.xeniegaming.exonie'; // Android App ID
const googleAuth = new google.auth.GoogleAuth({
    keyFile: './google-service-account.json', 
    scopes: ['https://www.googleapis.com/auth/androidpublisher']
});
const playDeveloper = google.androidpublisher({ version: 'v3', auth: googleAuth });

const STEAM_WEB_API_KEY = 'YOUR_STEAM_WEB_API_KEY_HERE'; 
const STEAM_APP_ID = 'YOUR_STEAM_APP_ID_HERE';
const express = require('express');
const activeLogins = new Set(); // Tracks currently logged-in usernames
const activeEmailSessions = {}; // 🛡️ Tracks which emails are currently online
const ipConnections = {}; // 🛡️ NEW: Tracks active IP addresses
const deviceConnections = {}; // 🛡️ Tracks active devices
const emailConnections = {}; // 🛡️ Tracks email multi-boxing
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const app = express();
// ==========================================
// 🔔 PAYPAL WEBHOOK (Item Delivery)
// ==========================================
// ==========================================
// 🔔 PAYPAL WEBHOOK (Item Delivery & Auto-Capture)
// ==========================================
app.post('/paypal-webhook', express.json(), async (req, res) => {
    try {
        const event = req.body;

        // 1. AUTO-CAPTURE: When player clicks "Approve" on PayPal, we tell PayPal to actually take the money!
        if (event && event.event_type === 'CHECKOUT.ORDER.APPROVED') {
            const orderId = event.resource.id;
            const isLive = true; // ⚠️ Make sure this matches your checkout setting!
            const baseURL = isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
            const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET).toString('base64');
            
            const tokenReq = await axios.post(`${baseURL}/v1/oauth2/token`, 'grant_type=client_credentials', {
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            await axios.post(`${baseURL}/v2/checkout/orders/${orderId}/capture`, {}, {
                headers: { 'Authorization': `Bearer ${tokenReq.data.access_token}`, 'Content-Type': 'application/json' }
            });
            console.log(`✅ [PayPal] Auto-Captured Order: ${orderId}`);
        }

        // 2. DELIVER ITEM: Once PayPal confirms the money is successfully captured.
        if (event && event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
            const customId = event.resource.custom_id; // e.g. "Kei-pet_fox"
            if (!customId) return res.status(200).send('No custom ID');

            const parts = customId.split('-');
            const playerName = parts[0];
            const itemId = parts[1];

            const itemTemplates = {
                'pet_fox': { name: "Spirit Fox Pet", type: 'aura', auraId: 'fox', rarity: 'Godly', color: '#ff7e00', description: "Click to apply to Leggings.", quantity: 1 },
                'pet_owl': { name: "Night Owl Pet", type: 'aura', auraId: 'owl', rarity: 'Godly', color: '#a0a0a0', description: "Click to apply to Leggings.", quantity: 1 },
                'aura_blaze': { name: "Blaze Aura Stone", type: 'aura', auraId: 'blaze', rarity: 'Legendary', color: '#f44336', description: "Click to apply to Armor.", quantity: 1 },
                'aura_liquid': { name: "Liquid Aura Stone", type: 'aura', auraId: 'liquid', rarity: 'Legendary', color: '#2196F3', description: "Click to apply to Armor.", quantity: 1 },
                'aura_nature': { name: "Nature Aura Stone", type: 'aura', auraId: 'nature', rarity: 'Legendary', color: '#4CAF50', description: "Click to apply to Armor.", quantity: 1 },
                'divine_pack': { name: "Divine Enhancement Stone", type: 'material', rarity: 'Divine', color: '#ffea00', description: "Enhances Divine equipment.", quantity: 5 },
                'revival_pack': { name: "Revival Juice", type: "consumable", rarity: "Unique", color: "#9c27b0", description: "Revives you instantly on the spot when used while dead.", quantity: 10 }
            };

            const deliveryItem = itemTemplates[itemId];
            if (deliveryItem) {
                await supabase.from('System_Mail').insert([{
                    recipient_name: playerName,
                    message_text: `Thank you for your purchase! Here is your ${deliveryItem.name}.`,
                    attached_item: JSON.stringify(deliveryItem),
                    is_claimed: false
                }]);
                
                const tsid = findSocketIdByPlayerId(playerName);
                if (tsid) {
                    io.to(tsid).emit('getMail'); 
                    io.to(tsid).emit('systemMessage', "🎉 Your PayPal purchase has arrived! Check your Mailbox (M).");
                }
                console.log(`🎁 [PayPal] Delivered ${deliveryItem.name} to ${playerName}`);
            }
        }
    } catch (err) { 
        console.error("PayPal Webhook Error:", err.response ? err.response.data : err.message); 
    }
    res.status(200).send('Webhook Received');
});
// ==========================================
// 💳 PAYPAL INSTANT CAPTURE (Return URL)
// ==========================================
app.get('/paypal-return', async (req, res) => {
    const orderId = req.query.token; // PayPal attaches the Order ID as a token in the URL
    if (!orderId) return res.redirect('/');
    
    try {
        const isLive = true; // ⚠️ Ensure this is TRUE for real money!
        const baseURL = isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
        const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET).toString('base64');
        
        const tokenReq = await axios.post(`${baseURL}/v1/oauth2/token`, 'grant_type=client_credentials', {
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // Force the Capture instantly!
        await axios.post(`${baseURL}/v2/checkout/orders/${orderId}/capture`, {}, {
            headers: { 'Authorization': `Bearer ${tokenReq.data.access_token}`, 'Content-Type': 'application/json' }
        });
        console.log(`✅ [PayPal] Instant Capture Successful for Order: ${orderId}`);
    } catch (err) {
        console.error("Return Capture Error:", err.response ? err.response.data : err.message);
    }
    
   res.send('<script>window.close();</script><p style="font-family: sans-serif; text-align: center; margin-top: 50px;">Payment complete! You can close this tab and return to the game.</p>');
});
// ==========================================
// 👑 PATREON WEBHOOK (Exo Gems & Royal Rewards)
// ==========================================
app.post('/patreon-webhook', express.text({ type: 'application/json' }), async (req, res) => {
    try {
        const crypto = require('crypto');
        const signature = req.headers['x-patreon-signature'];
        const secret = process.env.PATREON_WEBHOOK_SECRET;

        if (!signature || !secret) return res.status(401).send('Unauthorized');
        const hash = crypto.createHmac('md5', secret).update(req.body).digest('hex');
        if (signature !== hash) return res.status(401).send('Unauthorized');

        const event = JSON.parse(req.body);
        const eventType = req.headers['x-patreon-event'];
        const patronEmail = event?.data?.attributes?.email;
        if (!patronEmail) return res.status(200).send('No email');

        const amountCents = event?.data?.attributes?.currently_entitled_amount_cents || 0;
        const isRoyalTier = amountCents >= 11500; 

        // 👉 DYNAMIC GEMS: $1 = 1 Gem. If Royal Tier, hardcode to 50!
        let gemsToGive = Math.floor(amountCents / 100); 
        if (isRoyalTier) gemsToGive = 50;

        const { data: user } = await supabase.from('Exonians').select('character_name, inventory, equips, base_stats').eq('email', patronEmail).single();
        if (!user) return res.status(200).send('User not found');
        const playerName = user.character_name;

        // ❌ THE SCRUBBER: Removes Royal Aura if they downgrade or cancel
        if (eventType === 'members:pledge:delete' || (!isRoyalTier && eventType === 'members:pledge:update')) {
            let inv = Array.isArray(user.inventory) ? user.inventory : [];
            let eqs = typeof user.equips === 'object' ? user.equips : {};
            let itemsModified = false;

            for (let i = 0; i < inv.length; i++) {
                if (inv[i] && (inv[i].auraId === 'divine' || inv[i].aura === 'divine' || inv[i].name.includes('Divine Aura Stone'))) {
                    inv[i] = null; itemsModified = true;
                }
            }

            for (let key in eqs) {
                if (eqs[key] && eqs[key].aura === 'divine') {
                    delete eqs[key].aura;
                    if (eqs[key].originalName) { eqs[key].name = eqs[key].originalName; delete eqs[key].originalName; } 
                    else { eqs[key].name = eqs[key].name.replace('Divine ', ''); }
                    itemsModified = true;
                }
            }

            if (itemsModified) {
                await supabase.from('Exonians').update({ inventory: inv, equips: eqs }).eq('character_name', playerName);
                const tsid = findSocketIdByPlayerId(playerName);
                if (tsid && onlinePlayers[tsid]) {
                    onlinePlayers[tsid].inventory = inv; onlinePlayers[tsid].equips = eqs;
                    if (onlinePlayers[tsid].spriteData?.aura === 'divine') onlinePlayers[tsid].spriteData.aura = null;
                    io.to(tsid).emit('syncInventory', inv);
                    io.to(tsid).emit('inventoryItemUsed', { inventory: inv, equips: eqs });
                    io.to(tsid).emit('systemMessage', "🚨 Your Patreon Royal Tier has expired. The Aura of the Divine has been removed.");
                    const p = onlinePlayers[tsid];
                    io.emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
                }
            }
            if (eventType === 'members:pledge:delete') return res.status(200).send('Downgrade processed');
        }

        if (gemsToGive <= 0) return res.status(200).send('No gems to give');

        // 💎 EXO GEMS BUNDLE
        const exoGemsBundle = {
            id: Date.now() + Math.random(), name: `${gemsToGive} Exo Gems`, type: 'consumable', rarity: 'Divine', color: '#E040FB', 
            description: "Premium currency. Use this item to add the gems to your account balance!", quantity: gemsToGive, isGems: true
        };

        let safeStats = user.base_stats || {};
        
        // 📅 Calculate Next Renewal Date (30 Days from now)
        const renewalDate = new Date();
        renewalDate.setDate(renewalDate.getDate() + 30);
       safeStats.nextRenewalDate = renewalDate.getTime();
        safeStats.reminderSent = false;
        safeStats.lastPledgeAmount = Math.floor(amountCents / 100);
        if (eventType === 'members:pledge:create') {
            safeStats.lastChargeDate = event?.data?.attributes?.last_charge_date || new Date().toISOString();
            await supabase.from('System_Mail').insert([
                { recipient_name: playerName, message_text: `💎 Thank you for subscribing! Here are your ${gemsToGive} Exo Gems.`, attached_item: JSON.stringify(exoGemsBundle), is_claimed: false }
            ]);
            
            if (isRoyalTier) {
                const divineAura = { id: Date.now() + Math.random(), name: "Divine Aura Stone", type: 'aura', auraId: 'divine', sprite: 'aurastone', level: 1, rarity: 'Divine', color: '#ffea00', description: "Click to apply to an Armor. Purely cosmetic. Royal Patron Exclusive.", quantity: 1 };
                const royalGoldSack = { id: Date.now() + Math.random(), name: "Royal Gold Sack", type: 'consumable', rarity: 'Divine', color: '#FFD700', description: "A heavy sack of Royal Patreon Gold. Use to receive 1,000,000 Gold instantly.", quantity: 1 };
                
                await supabase.from('System_Mail').insert([
                    { recipient_name: playerName, message_text: "👑 Welcome to the Royal Tier! Here is your exclusive Divine Aura Stone.", attached_item: JSON.stringify(divineAura), is_claimed: false },
                    { recipient_name: playerName, message_text: "💰 Royal Stipend: Here is your 1,000,000 Gold!", attached_item: JSON.stringify(royalGoldSack), is_claimed: false }
                ]);
            }
            await supabase.from('Exonians').update({ base_stats: safeStats }).eq('character_name', playerName);
        }

        if (eventType === 'members:pledge:update') {
            const chargeStatus = event?.data?.attributes?.last_charge_status;
            const chargeDate = event?.data?.attributes?.last_charge_date;

            // 🛡️ THE FIX: Only give gems if the charge date is NEW!
            if (chargeStatus === 'Paid' && safeStats.lastChargeDate !== chargeDate) {
                safeStats.lastChargeDate = chargeDate; // Save new charge date

                await supabase.from('System_Mail').insert([{ recipient_name: playerName, message_text: `💎 Your monthly Patreon renewal is here! Enjoy your ${gemsToGive} Exo Gems.`, attached_item: JSON.stringify(exoGemsBundle), is_claimed: false }]);
                
                if (isRoyalTier) {
                    const royalGoldSack = { id: Date.now() + Math.random(), name: "Royal Gold Sack", type: 'consumable', rarity: 'Divine', color: '#FFD700', description: "A heavy sack of Royal Patreon Gold. Use to receive 1,000,000 Gold instantly.", quantity: 1 };
                    await supabase.from('System_Mail').insert([{ recipient_name: playerName, message_text: "💰 Royal Stipend: Here is your 1,000,000 Gold!", attached_item: JSON.stringify(royalGoldSack), is_claimed: false }]);
                }
                await supabase.from('Exonians').update({ base_stats: safeStats }).eq('character_name', playerName);
            }
        }

        const tsid = findSocketIdByPlayerId(playerName);
        if (tsid) {
            io.to(tsid).emit('getMail'); 
            io.to(tsid).emit('systemMessage', "👑 A Patreon Delivery has arrived in your Mailbox (M)!");
        }

    } catch (err) { console.error("Webhook Error:", err.message); }
    res.status(200).send('Patreon Webhook Received');
});
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ["https://testexonie.onrender.com", "https://exonieonline.onrender.com", /\.itch\.io$/, /\.itch\.zone$/, "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    },
    // 📱 MOBILE STABILITY SETTINGS
    pingTimeout: 60000,  // Wait 60 seconds (instead of 20) before giving up on a player
    pingInterval: 25000, // Send a "heartbeat" every 25 seconds
    connectTimeout: 45000, // Give them 45 seconds to finish the initial login
    allowEIO3: true      // Better compatibility for older mobile browsers
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

// 🛡️ THE BOUNCER (Currently DISABLED so normal PC Browsers can play)
app.use((req, res, next) => {
    // We are letting everyone in for now!
    next(); 
});

// Caches images and audio in the player's browser for 1 day
app.use(express.static(path.join(__dirname, 'public')));

const onlinePlayers = {}; 
const parties = {}; 
global.guilds = {}; // 🛡️ GLOBAL GUILD MEMORY
// 🛡️ GLOBAL ADMIN LIST
// Add any usernames here that should have full GM powers!
const ADMINS = ['Kei', 'Jubs4DaWin', 'TesterName'];

function isAdmin(username) { 
    return ADMINS.includes(username); 
}
const playerParty = {};    

// 🏆 GLOBAL TAVERN RANKINGS
global.topTavernPlayers = [];
async function updateAndBroadcastTopTavern() {
    try {
        // 🛡️ THE FIX: Grab a massive chunk of data (1000) ignoring speed, so the JS can properly sort the hardest bosses to the top!
        const { data } = await supabase.from('Tavern_Leaderboard').select('character_name, mob_type, mob_level, time_taken').limit(1000);
        let sorted = (data || []).sort((a, b) => {
            const w = { 'floor_boss': 3, 'mini_boss': 2, 'common_mobs': 1 };
            let aW = w[a.mob_type] || 0; let bW = w[b.mob_type] || 0;
            if (aW !== bW) return bW - aW; 
            if (a.mob_level !== b.mob_level) return b.mob_level - a.mob_level; 
            return a.time_taken - b.time_taken; 
        });
        
        // Find the top 3 UNIQUE players
        let uniqueTop3 = [];
        for (let row of sorted) {
            if (!uniqueTop3.includes(row.character_name)) uniqueTop3.push(row.character_name);
            if (uniqueTop3.length === 3) break;
        }
        global.topTavernPlayers = uniqueTop3;
        io.emit('topTavernPlayers', global.topTavernPlayers);
    } catch(e) { console.error("Error updating top tavern:", e); }
}
// Initialize the rankings immediately when the server boots
updateAndBroadcastTopTavern(); 

// 🌟 THE FIX: Auto-refresh the Leaderboard every 60 seconds!
// This ensures that if you manually delete a hacker or admin from the database, 
// the server will automatically update everyone's glowing nameplates within a minute.
setInterval(updateAndBroadcastTopTavern, 60000);

// ==========================================
// LOOT, GOLD & STAT GENERATION ENGINE
// ==========================================
const STAT_TYPES = ['attack', 'magic', 'defense', 'speed', 'int', 'str', 'hp'];
const RARITY_COLORS = { "Starter": "#aaaaaa", "Basic": "#8B4513", "Rare": "#2196F3", "Unique": "#9c27b0", "Legendary": "#f44336", "Godly": "#e0ffff" };
const ITEM_TEMPLATES = { 
    sword: { slot: 'weapon', statKey: 'attack', baseName: 'Sword', spriteName: 'sword' }, 
    staff: { slot: 'weapon', statKey: 'magic', baseName: 'Staff', spriteName: 'staff' }, 
    pendant: { slot: 'weapon', statKey: 'magic', baseName: 'Pendant', spriteName: 'pendant' }, 
    gun: { slot: 'weapon', statKey: 'attack', baseName: 'Gun', spriteName: 'gun' }, 
    dagger: { slot: 'weapon', statKey: 'attack', baseName: 'Dagger', spriteName: 'dagger' },
    armor: { slot: 'armor', statKey: 'defense', baseName: 'Armor', spriteName: 'armor' }, 
    leggings: { slot: 'leggings', statKey: 'hp', baseName: 'Leggings', spriteName: 'leggings' } 
};
const VALID_RARITIES = ['Starter', 'Basic', 'Rare', 'Unique', 'Legendary', 'Godly', 'Divine'];
const MAX_ENHANCE_BY_RARITY = {
    Starter: 0,
    Basic: 20,
    Rare: 20,
    Unique: 20,
    Legendary: 15,
    Godly: 10,
    Divine: 25
};

function clamp(value, min, max) {
    value = Number(value) || 0;
    return Math.max(min, Math.min(max, value));
}

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function sanitizeStatObject(stats) {
    const safe = {};
    if (!stats || typeof stats !== 'object') return safe;

    for (const key of Object.keys(stats)) {
        safe[key] = clamp(stats[key], 0, 999999);
    }
    return safe;
}

function sanitizeItem(item) {
    if (!item || typeof item !== 'object') return null;

    const safe = deepCopy(item);

    safe.id = safe.id || (Date.now() + Math.random());
    safe.name = String(safe.name || 'Unknown Item');
    safe.type = String(safe.type || '');
    safe.sprite = String(safe.sprite || '');
    safe.level = clamp(safe.level, 1, 9999);
    safe.rarity = safe.rarity || 'Basic';
    safe.color = typeof safe.color === 'string' ? safe.color : '#ffffff';
    safe.quantity = clamp(safe.quantity || 1, 1, 999);

    const isEquipment = !['material', 'potion', 'consumable', 'forger', 'gem'].includes(safe.type);

    if (isEquipment) {
        safe.enhanceLevel = Number(safe.enhanceLevel) || 0;
        safe.fixedStat = sanitizeStatObject(safe.fixedStat);
        safe.randomStat = sanitizeStatObject(safe.randomStat);
        
        // 🛡️ THE MIGRATION FIX: Automatically convert old gem stats into the new randomStat format
        if (safe.stats) {
            const statMap = { atk: 'attack', matk: 'magic', def: 'defense', spd: 'speed', hp: 'hp', int: 'int', str: 'str' };
            for (let oldKey in statMap) {
                if (safe.stats[oldKey] && safe.stats[oldKey] > 0) {
                    let newKey = statMap[oldKey];
                    // Move the stat over to randomStat so it shows up as a green bonus
                    safe.randomStat[newKey] = (safe.randomStat[newKey] || 0) + safe.stats[oldKey];
                    // Wipe the old stat so it never double-dips
                    safe.stats[oldKey] = 0; 
                }
            }
        }

        // Ensure legacy stat object exists so UI doesn't choke
        safe.stats = safe.stats || { hp: 0, atk: 0, def: 0, int: 0, spd: 0, str: 0, matk: 0 }; 
    } else {
        // 🌟 THE CRASH FIX: Do NOT delete them! Give the UI empty, safe shells to read!
        safe.stats = { hp: 0, atk: 0, def: 0, int: 0, spd: 0, str: 0, matk: 0 };
        safe.fixedStat = sanitizeStatObject(safe.fixedStat);
        safe.randomStat = sanitizeStatObject(safe.randomStat);
        safe.enhanceLevel = 0;
    }

   // 🐾 AURA & PET CHECKS
    const VALID_AURAS = ['lightning', 'blaze', 'liquid', 'nature', 'fox', 'owl', 'wisp', 'divine', 'egg', 'easter', 'void'];
    if (safe.aura && !VALID_AURAS.includes(safe.aura)) {
        delete safe.aura;
    }
    if (safe.auraId && !VALID_AURAS.includes(safe.auraId)) {
        delete safe.auraId;
    }

    return safe; 
}

function sanitizeInventory(inventory) {
    const safeInventory = Array.isArray(inventory) ? inventory.slice(0, 20) : [];
    while (safeInventory.length < 20) safeInventory.push(null);

    return safeInventory.map(item => {
        if (!item) return null;
        return sanitizeItem(item);
    });
}

function sanitizeEquips(equips) {
    const safe = { weapon: null, armor: null, leggings: null, necklace: null, ring: null, earrings: null };
    if (!equips || typeof equips !== 'object') return safe;

    if (equips.weapon) safe.weapon = sanitizeItem(equips.weapon);
    if (equips.armor) safe.armor = sanitizeItem(equips.armor);
    if (equips.leggings) safe.leggings = sanitizeItem(equips.leggings);
    if (equips.necklace) safe.necklace = sanitizeItem(equips.necklace);
    if (equips.ring) safe.ring = sanitizeItem(equips.ring);
    if (equips.earrings) safe.earrings = sanitizeItem(equips.earrings);

    return safe;
}

function sanitizeBaseStats(baseStats) {
    const fallback = {
        hp: 100, attack: 5, magic: 5, defense: 2, speed: 1, str: 10, int: 10, playerClass: null, title: null
    };

    const safe = Object.assign({}, fallback, (baseStats && typeof baseStats === 'object') ? baseStats : {});
    safe.hp = clamp(safe.hp, 1, 999999);
    safe.attack = clamp(safe.attack, 0, 999999);
    safe.magic = clamp(safe.magic, 0, 999999);
    safe.defense = clamp(safe.defense, 0, 999999);
    safe.speed = clamp(safe.speed, 0, 999999);
    safe.str = clamp(safe.str, 0, 999999);
    safe.int = clamp(safe.int, 0, 999999);
    safe.playerClass = safe.playerClass || null;
    safe.title = safe.title || null; // 🛡️ Ensure title is kept!
    safe.gotWisp = baseStats ? !!baseStats.gotWisp : false;
    safe.hasHome = baseStats ? !!baseStats.hasHome : false; // 🏡 ADD THIS LINE!
    safe.homeStorage = (baseStats && Array.isArray(baseStats.homeStorage)) ? baseStats.homeStorage.slice(0, 10) : new Array(10).fill(null);
    safe.watchedTutorial = baseStats ? !!baseStats.watchedTutorial : false;
    safe.tavernEntries = (baseStats && typeof baseStats.tavernEntries === 'number') ? baseStats.tavernEntries : 5;
    safe.dungeonEntries = (baseStats && typeof baseStats.dungeonEntries === 'number') ? baseStats.dungeonEntries : 7;
    safe.dungeonReset = baseStats ? baseStats.dungeonReset : 0;
    
 // 💎 PREMIUM CURRENCY & PATREON TRACKING
    safe.exoGems = clamp(baseStats?.exoGems || 0, 0, 999999);
    safe.nextRenewalDate = baseStats?.nextRenewalDate || null;
    safe.reminderSent = baseStats?.reminderSent || false;

    return safe;
}

function sanitizePlayerRecordFromDb(row) {
    const safe = Object.assign({}, row);
    safe.inventory = sanitizeInventory(row.inventory);
    safe.equips = sanitizeEquips(row.equips);
    safe.base_stats = sanitizeBaseStats(row.base_stats);
    safe.guild_details = row.guild_details || null; // 🛡️ Load Guild JSONB
    return safe;
}

function getBaseStat(lvl) { 
    // 🛡️ THE FIX: Controlled Scaling. +3 stats for every 5 levels beyond 50.
    if (lvl >= 50) {
        let extraTicks = Math.floor((lvl - 50) / 5);
        return 100 + (extraTicks * 3);
    }
    
    if (lvl >= 45) return 45; if (lvl >= 40) return 40; 
    if (lvl >= 35) return 30; if (lvl >= 30) return 27; if (lvl >= 25) return 22; 
    if (lvl >= 20) return 20; if (lvl >= 15) return 15; if (lvl >= 10) return 12; 
    if (lvl >= 5) return 8; return 5; 
}
// 🛡️ NEW: BOSS COUNTDOWN HELPER
function getBossCountdown(lastDeathTime) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const respawnTime = parseInt(lastDeathTime) + oneDay;
    return respawnTime - now; // Returns remaining milliseconds
}

function processMissionKill(p, monsterKey, targetSid) {
    // 1. If no mission, or already completed, STOP.
    if (!p || !p.baseStats || !p.baseStats.dailyMission || !p.baseStats.dailyMission.active || p.baseStats.dailyMission.completed) return;
    
    let todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);
    const resetTs = todayMidnight.getTime();
    
    // 2. Midnight expiry check
    if (p.baseStats.dailyMission.lastReset < resetTs) {
        p.baseStats.dailyMission.active = false;
        supabase.from('Exonians').update({ base_stats: p.baseStats }).eq('character_name', p.id).then(()=>{});
        return;
    }

    // 3. Match the monster key
    if (monsterKey && monsterKey === p.baseStats.dailyMission.targetMob) {
        p.baseStats.dailyMission.currentKills++;
        
        // 4. Completion check
        if (p.baseStats.dailyMission.currentKills >= p.baseStats.dailyMission.requiredKills) {
            p.baseStats.dailyMission.currentKills = p.baseStats.dailyMission.requiredKills;
            p.baseStats.dailyMission.completed = true;
            
            // Pay the player
            p.gold += p.baseStats.dailyMission.reward;
            
            if (targetSid) {
                io.to(targetSid).emit('systemMessage', `🎉 MISSION COMPLETE: You defeated all targets and earned ${p.baseStats.dailyMission.reward.toLocaleString()} Gold!`);
                // Sync Gold UI
                io.to(targetSid).emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
            }
        }
        
        // 5. Save progress to Supabase
        supabase.from('Exonians').update({ base_stats: p.baseStats, gold: p.gold }).eq('character_name', p.id).then(()=>{});
        
        // 6. Push update to Client (Updates the progress bar live!)
        if (targetSid) io.to(targetSid).emit('dailyMissionUpdate', p.baseStats.dailyMission);
    }
}

function generatePowerGem(level, rarity) {
    const stats = [...STAT_TYPES];
    const rStat = stats[Math.floor(Math.random() * stats.length)];
    let statVal = getBaseStat(level) + ({"Basic":0,"Rare":2,"Unique":5,"Legendary":8,"Godly":12}[rarity] || 0);
    
    return {
        id: Date.now() + Math.random(),
        name: `${rarity} Power Gem`,
        type: 'gem',
        sprite: rarity.toLowerCase() + 'gem',
        level: level,
        rarity: rarity,
        color: RARITY_COLORS[rarity],
        fixedStat: {}, 
        randomStat: { [rStat]: statVal }, // 🛡️ THE FIX: Moves stat to randomStat so it displays below the main stat
        enhanceLevel: 0,
        quantity: 1,
        description: `+${statVal} ${rStat.toUpperCase()}.`
    };
}
function generateHauntedLoot(mLevel) {
    if (Math.random() < 0.5) return null; // 50% chance of NO DROP

    let typeRoll = Math.random();
    let rarityRoll = Math.random();
    
    // Rarity for Equip/Gem/Acc (Unique to Godly)
    let gearRarity = "Unique";
    if (rarityRoll > 0.6) gearRarity = "Legendary";
    if (rarityRoll > 0.9) gearRarity = "Godly";

    // Refinement Stone Rarity (Basic to Divine)
    let stoneRarity = "Basic";
    let sRoll = Math.random();
    if (sRoll > 0.4) stoneRarity = "Rare";
    if (sRoll > 0.7) stoneRarity = "Unique";
    if (sRoll > 0.85) stoneRarity = "Legendary";
    if (sRoll > 0.95) stoneRarity = "Godly";
    if (sRoll > 0.99) stoneRarity = "Divine";

    if (typeRoll < 0.50) { // 50% Equipment
        const equipKeys = ['sword', 'staff', 'pendant', 'gun', 'dagger', 'armor', 'leggings'];
        const typeKey = equipKeys[Math.floor(Math.random() * equipKeys.length)];
        const template = ITEM_TEMPLATES[typeKey];
        const rPfx = gearRarity.toLowerCase();
        
        let item = { 
            id: Date.now() + Math.random(), name: `${gearRarity} ${template.baseName}`, 
            type: template.slot, sprite: rPfx + template.spriteName, 
            level: mLevel, rarity: gearRarity, color: RARITY_COLORS[gearRarity], 
            fixedStat: {}, randomStat: {}, enhanceLevel: 0, quantity: 1 
        };
        
        let statVal = getBaseStat(mLevel) + ({ "Unique": 5, "Legendary": 8, "Godly": 12 }[gearRarity] || 0);
        if (typeKey === 'gun' || typeKey === 'pendant') statVal = Math.floor(statVal / 2); 
        item.fixedStat[template.statKey] = statVal;

        let availableStats = [...STAT_TYPES]; 
        let numStats = gearRarity === "Godly" ? 3 : (gearRarity === "Legendary" ? 2 : 1);
        
        for (let i = 0; i < numStats; i++) {
            let rIdx = Math.floor(Math.random() * availableStats.length);
            let sKey = availableStats.splice(rIdx, 1)[0]; 
            item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(mLevel)) + 1;
        }
        return item;
    } 
    else if (typeRoll < 0.75) { // 25% Power Gems
        return generatePowerGem(mLevel, gearRarity);
    }
    else if (typeRoll < 0.90) { // 15% Refinement Stone
        return {
            id: Date.now() + Math.random(), name: `Refinement Stone Lv.${mLevel}`,
            type: "material", rarity: stoneRarity, level: mLevel, color: RARITY_COLORS[stoneRarity],
            description: "Enhances equipment.", quantity: 1
        };
    }
    else if (typeRoll < 0.95) { // 5% Accessories
        return generateTavernLoot(mLevel, gearRarity);
    }
    else if (typeRoll < 0.98) { // 3% Soul Piece
        return {
            id: 'mat_' + Math.random(), name: 'Soul Piece',
            type: 'material', rarity: 'Legendary', level: 1, color: '#E040FB',
            description: 'A glowing fragment of a Wraith. Used for crafting a ghost pet.', quantity: 1
        };
    }
    else { // 2% Divine Essence
        return {
            id: 'mat_' + Math.random(), name: 'Divine Essence',
            type: 'material', rarity: 'Divine', level: 1, color: '#ffea00',
            description: 'A blindingly bright golden essence. Required to craft Divine equipment.', quantity: 1
        };
    }
}
function generateDungeonLoot(m) {
    // 🌟 EXTREME DUNGEON EXO METALS (Lv 75+)
    if (m.level >= 75) {
        let metalRoll = Math.random();
        if (metalRoll < 0.03) return { id: 'mat_' + Math.random(), name: 'Red Exo Metal', type: 'material', rarity: 'Divine', level: 1, color: '#f44336', description: 'A rare red metal used for Divine crafting.', quantity: 1 };
        else if (metalRoll < 0.13) return { id: 'mat_' + Math.random(), name: 'Green Exo Metal', type: 'material', rarity: 'Divine', level: 1, color: '#4CAF50', description: 'A rare green metal used for Divine crafting.', quantity: 1 };
        else if (metalRoll < 0.28) return { id: 'mat_' + Math.random(), name: 'Blue Exo Metal', type: 'material', rarity: 'Divine', level: 1, color: '#2196F3', description: 'A rare blue metal used for Divine crafting.', quantity: 1 };
    }

    if (Math.random() < 0.45) return null; // 45% chance of NO DROP

    let roll = Math.random();
    let rarity = "Basic";
    
    if (roll < 0.013) rarity = "Godly";       
    else if (roll < 0.040) rarity = "Legendary"; 
    else if (roll < 0.66) rarity = "Unique";   
    else if (roll < 0.66) rarity = "Rare";       
    else rarity = "Basic";                     

    // 50% chance for a Power Gem, 50% chance for Equipment (No Accessories)
    if (Math.random() < 0.5) {
        return generatePowerGem(m.level, rarity);
    } else {
        // 🛡️ THE FIX: Added 'pendant' to the drop pool!
        const equipKeys = ['sword', 'staff', 'pendant', 'gun', 'dagger', 'armor', 'leggings'];
        const typeKey = equipKeys[Math.floor(Math.random() * equipKeys.length)];
        const template = ITEM_TEMPLATES[typeKey];
        const rPfx = rarity === "Starter" ? "basic" : rarity.toLowerCase();
        
        let item = { 
            id: Date.now() + Math.random(), name: `${rarity} ${template.baseName}`, 
            type: template.slot, sprite: rPfx + template.spriteName, 
            level: m.level, rarity: rarity, color: RARITY_COLORS[rarity], 
            fixedStat: {}, randomStat: {}, enhanceLevel: 0, quantity: 1 
        };
        
        let statVal = getBaseStat(m.level) + ({ "Unique": 5, "Legendary": 8, "Godly": 12, "Divine": 12 }[rarity] || 0);
        
        // 👑 THE FIX: Divine base stats are strictly DOUBLE the Godly base stats!
        if (rarity === "Divine") statVal = (getBaseStat(m.level) + 12) * 2;

        if (typeKey === 'gun' || typeKey === 'pendant') statVal = Math.floor(statVal / 2); 
        item.fixedStat[template.statKey] = statVal;

        let availableStats = [...STAT_TYPES]; 
        // 👑 THE FIX: Divine gets exactly 4 random stats!
        let numStats = rarity === "Divine" ? 4 : (rarity === "Godly" ? 3 : (rarity === "Legendary" ? 2 : 1));
        
        for (let i = 0; i < numStats; i++) {
            let rIdx = Math.floor(Math.random() * availableStats.length);
            let sKey = availableStats.splice(rIdx, 1)[0]; 
            item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(m.level)) + 1;
        }
        return item;
    }
}
function generateLoot(monster) {
  // 🌟 GOLDEN SLIME CUSTOM LOOT TABLE
    if (monster.monsterKey === "common_mobs_golden") {
      let mLevel = monster.level || 1;
        let roll = Math.random();

        // 14% Chance: Class Reset Book (0.00 to 0.15)
        if (roll < 0.15) {
            return { 
                id: Date.now() + Math.random(), 
                name: "Class Reset Book", 
                type: "consumable", 
                rarity: "Godly", 
                color: RARITY_COLORS["Godly"], 
                description: "Resets your chosen class so you can pick a new one.", 
                quantity: 1 
            };
        } 
       // 4% Chance: Divine Essence (0.15 to 0.18)
        else if (roll < 0.18) {
            return {
                id: 'mat_' + Math.random().toString(36).substr(2, 9),
                name: 'Divine Essence',
                type: 'material',
                rarity: 'Divine',
                level: 1,
                sellPrice: 100000,
                description: 'A blindingly bright golden essence. Required to craft Divine equipment.',
                quantity: 1
            };
        }
        // 10% Chance: Divine Enhancement Stone (0.18 to 0.28)
        else if (roll < 0.29) {
            return {
                id: Date.now() + Math.random(),
                name: "Divine Enhancement Stone",
                type: "material",
                rarity: "Divine",
                level: mLevel,
                color: "#ffea00",
                description: "Enhances Divine equipment.",
                quantity: 1
            };
        }
        
        // 72% Chance Remaining: 35% Legendary (0.28 to 0.63) or 37% Unique (0.63 to 1.00)
        let rarity = (roll < 0.63) ? "Legendary" : "Unique";
        
        const keys = Object.keys(ITEM_TEMPLATES);
        const typeKey = keys[Math.floor(Math.random() * keys.length)];
        const template = ITEM_TEMPLATES[typeKey];
        
        let item = { 
            id: Date.now() + Math.random(), 
            name: `${rarity} ${template.baseName}`, 
            type: template.slot, 
            sprite: rarity.toLowerCase() + template.spriteName, 
            level: mLevel, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: 0 
        };
        
   let statVal = getBaseStat(mLevel) + ({ "Starter": 0, "Basic": 0, "Rare": 2, "Unique": 5, "Legendary": 8, "Godly": 12, "Divine": 12 }[rarity] || 0);
    
    // 👑 THE FIX: Divine base stats are strictly DOUBLE the Godly base stats!
    if (rarity === "Divine") statVal = (getBaseStat(mLevel) + 12) * 2;
    
    if (typeKey === 'pendant' || typeKey === 'gun') statVal = Math.floor(statVal / 2); 
    item.fixedStat[template.statKey] = statVal;
    
    item.randomStat = {};
    // 👑 THE FIX: Divine gets exactly 4 random stats!
    let numStats = rarity === "Divine" ? 4 : (rarity === "Godly" ? 3 : (rarity === "Legendary" ? 2 : 1));

    let availableStats = [...STAT_TYPES]; 
    for (let i = 0; i < numStats; i++) {
        let rIdx = Math.floor(Math.random() * availableStats.length);
        let sKey = availableStats.splice(rIdx, 1)[0]; 
        item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(mLevel)) + 1;
    }
        return item;
    }
    
    // ==========================================
    // 1. CALCULATE ITEM DROP LEVEL (90% Same, 10% Lower)
    // ==========================================
    let baseLevel = monster.level || 5;
    let mLevel = baseLevel;
    
    // 10% chance to drop a lower level tier (subtracts up to 5 levels, minimum 1)
    if (Math.random() > 0.90) {
        mLevel = Math.max(1, baseLevel - 5);
    }

  // ==========================================
    // 2. COMMON MOB SPECIAL DROP: REVIVAL JUICE (1%)
    // ==========================================
    if (monster.category === "common_mobs" && Math.random() < 0.0009) {
        return {
            id: Date.now() + Math.random(),
            name: "Revival Juice",
            type: "consumable",
            rarity: "Unique",
            color: RARITY_COLORS["Unique"],
            description: "Revives you instantly on the spot when used while dead.",
            quantity: 1
        };
    }

    // ==========================================
    // 2.5 FLOOR BOSS SPECIAL DROP: DIVINE ENHANCEMENT STONE (5%)
    // ==========================================
    if (monster.category === "floor_boss" && Math.random() < 0.05) {
        return {
            id: Date.now() + Math.random(),
            name: "Divine Enhancement Stone",
            type: "material",
            rarity: "Divine",
            level: mLevel,
            color: "#ffea00",
            description: "Enhances Divine equipment.",
            quantity: 1
        };
    }

    // ==========================================
    // 3. REFINEMENT STONE DROP (45% Chance)
    // ==========================================
    if (Math.random() < 0.15) {
        let stoneRarity = "Basic";
        let r = Math.random();
        
   if (monster.category === "mini_boss") {
            stoneRarity = r < 0.35 ? "Unique" : "Rare";
        } 
   else if (monster.category === "floor_boss") {
            stoneRarity = r < 0.10 ? "Godly" : "Legendary";
        }else {
            stoneRarity = r < 0.10 ? "Rare" : "Basic";
        }

        return {
            id: Date.now() + Math.random(),
            name: `Refinement Stone Lv.${mLevel}`,
            type: "material", level: mLevel, rarity: stoneRarity, color: RARITY_COLORS[stoneRarity],
            description: "Enhances equipment.", quantity: 1
        };
    }

    // ==========================================
    // 3. GEAR DROP (50% Chance)
    // ==========================================
    const keys = Object.keys(ITEM_TEMPLATES);
    const typeKey = keys[Math.floor(Math.random() * keys.length)];
    
    let rarityRoll = Math.random();
    let rarity = "Basic";
    
    if (monster.category === "floor_boss") {
        // 👑 FLOOR BOSS DROP RATES FOR GEAR
        if (rarityRoll <= 0.35) rarity = "Godly";          // 5% chance
        else rarity = "Legendary";                             // 15% chance
    } else if (monster.category === "mini_boss") {
        rarity = rarityRoll < 0.35 ? "Unique" : "Rare";
    } else {
        rarity = rarityRoll < 0.15 ? "Rare" : "Basic";
    }

    const template = ITEM_TEMPLATES[typeKey];
    const rarityPrefix = rarity === "Starter" ? "basic" : rarity.toLowerCase();
    
    let itemName = `${rarity === "Rare" ? "Slime" : "Basic"} ${template.baseName}`;
    if (rarity !== "Rare" && rarity !== "Basic") itemName = `${rarity} ${template.baseName}`;

    let item = { id: Date.now() + Math.random(), name: itemName, type: template.slot, sprite: rarityPrefix + template.spriteName, level: mLevel, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: 0 };
    
    // ✅ STRICT PENDANT 50% PENALTY ENFORCED
    let statVal = getBaseStat(mLevel) + ({ "Starter": 0, "Basic": 0, "Rare": 2, "Unique": 5, "Legendary": 8, "Godly": 12 }[rarity] || 0);
    if (typeKey === 'pendant' || typeKey === 'gun') statVal = Math.floor(statVal / 2); 
    item.fixedStat[template.statKey] = statVal;
    
    // ✅ MULTIPLE BONUS STATS FOR HIGH RARITY
    item.randomStat = {};
    let numStats = 1;
    if (rarity === "Legendary") numStats = 2;
    if (rarity === "Godly") numStats = 3;

    // Clone the stat types so we can pick unique ones without repeating
    let availableStats = [...STAT_TYPES]; 
    for (let i = 0; i < numStats; i++) {
        let rIdx = Math.floor(Math.random() * availableStats.length);
        let sKey = availableStats.splice(rIdx, 1)[0]; // Pulls the stat out of the list
        item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(mLevel)) + 1;
    }
    
    return item;
}
function generateTavernLoot(level, rarity) {
    const types = ['necklace', 'ring', 'earrings'];
    const type = types[Math.floor(Math.random() * types.length)];
    const stats = [...STAT_TYPES];
    const rStat = stats[Math.floor(Math.random() * stats.length)];
    
    let statVal = getBaseStat(level) + ({"Basic":0,"Rare":2,"Unique":5,"Legendary":8,"Godly":12}[rarity] || 0);
    
    return {
        id: Date.now() + Math.random(),
        name: `${rarity} Tavern ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        type: type,
        sprite: rarity.toLowerCase() + type,
        level: level,
        rarity: rarity,
        color: RARITY_COLORS[rarity],
        fixedStat: {},
        randomStat: { [rStat]: statVal },
        enhanceLevel: 0,
        quantity: 1
    };
}
// ==========================================
// SCALED MONSTER DATABASE
// ==========================================
const MonsterDatabase = {
    "common_mobs1": { name: "Slime", category: "common_mobs", level: 5, maxHp: 100, atk: 15, def: 0, speed: 2.5, expYield: 25, goldYield: 1, aggroRadius: 250, chaseRadius: 400, attackRange: 55, width: 40, height: 40, respawnDelay: 10000, cssColor: '#ff69b4', cssBorder: '#c71585' },
    // 🌟 THE GOLDEN SLIME
    "common_mobs_golden": { name: "Golden Slime", category: "common_mobs", level: 5, maxHp: 100, atk: 15, def: 0, speed: 4.0, expYield: 500, goldYield: 1500, aggroRadius: 250, chaseRadius: 500, attackRange: 55, width: 40, height: 40, respawnDelay: 10000, cssColor: '#ffd700', cssBorder: '#b8860b' },
    "mini_boss1": { name: "Orc Slime", category: "mini_boss", level: 15, maxHp: 15500, atk: 250, def: 35, speed: 2.8, expYield: 500, goldYield: 3, aggroRadius: 350, chaseRadius: 500, attackRange: 90, width: 60, height: 60, respawnDelay: 120000, cssColor: '#2196F3', cssBorder: '#0b7dda' },
    "floor_boss1": { name: "Dragon Slime", category: "floor_boss", level: 25, maxHp: 35000, atk: 450, def: 100, speed: 3.5, expYield: 3000, goldYield: 5, aggroRadius: 500, chaseRadius: 700, attackRange: 130, width: 100, height: 100, respawnDelay: -1, cssColor: '#f44336', cssBorder: '#b71c1c' },
    // ==================
    // TYPE 2: BATS (Fast, Squishy, Melee)
    // ==================
    "common_mobs2": { name: "Shadow Bat", category: "common_mobs", level: 5, maxHp: 160, atk: 35, def: 0, speed: 4.5, expYield: 30, goldYield: 1, aggroRadius: 300, chaseRadius: 500, attackRange: 55, width: 40, height: 40, respawnDelay: 10000, cssColor: '#1a1a1a', cssBorder: 'none' },
    "mini_boss2": { name: "Vampire Bat", category: "mini_boss", level: 15, maxHp: 13700, atk: 280, def: 5, speed: 5.0, expYield: 600, goldYield: 3, aggroRadius: 400, chaseRadius: 600, attackRange: 90, width: 60, height: 60, respawnDelay: 120000, cssColor: '#8a2be2', cssBorder: 'none' },
    "floor_boss2": { name: "Bloodwing Terror", category: "floor_boss", level: 25, maxHp: 35500, atk: 530, def: 35, speed: 6.0, expYield: 3500, goldYield: 5, aggroRadius: 600, chaseRadius: 800, attackRange: 130, width: 100, height: 100, respawnDelay: -1, cssColor: '#d32f2f', cssBorder: 'none' },

    // ==================
    // TYPE 3: FIRE ELEMENTALS (Glass Cannons, Ranged)
    // ==================
    "common_mobs3": { name: "Fire Sprite", category: "common_mobs", level: 5, maxHp: 180, atk: 50, def: 0, speed: 2.5, expYield: 35, goldYield: 1, aggroRadius: 350, chaseRadius: 500, attackRange: 200, width: 40, height: 40, respawnDelay: 10000, cssColor: '#f44336', cssBorder: 'none' },
    "mini_boss3": { name: "Inferno Core", category: "mini_boss", level: 15, maxHp: 14200, atk: 320, def: 25, speed: 2.8, expYield: 700, goldYield: 3, aggroRadius: 450, chaseRadius: 650, attackRange: 250, width: 60, height: 60, respawnDelay: 120000, cssColor: '#ff9800', cssBorder: 'none' },
    "floor_boss3": { name: "Astral Blaze", category: "floor_boss", level: 25, maxHp: 37500, atk: 600, def: 75, speed: 3.5, expYield: 4000, goldYield: 5, aggroRadius: 800, chaseRadius: 900, attackRange: 300, width: 100, height: 100, respawnDelay: -1, cssColor: 'linear-gradient(45deg, #2196F3, #ff9800)', cssBorder: 'none' },

    // ==================
    // TYPE 4: STONE GOLEMS (Massive Tanks, Slow, High Defense)
    // ==================
    "common_golem": { name: "Stone Golem", category: "common_mobs", level: 10, maxHp: 400, atk: 45, def: 20, speed: 1.5, expYield: 60, goldYield: 1, aggroRadius: 200, chaseRadius: 350, attackRange: 60, width: 50, height: 50, respawnDelay: 12000, cssColor: '#795548', cssBorder: '#4E342E' },
    "mini_boss_golem": { name: "Obsidian Behemoth", category: "mini_boss", level: 15, maxHp: 28000, atk: 350, def: 75, speed: 1.8, expYield: 1200, goldYield: 3, aggroRadius: 300, chaseRadius: 450, attackRange: 90, width: 80, height: 80, respawnDelay: 120000, cssColor: '#424242', cssBorder: '#212121' },
    "floor_boss_golem": { name: "Titan of the Deep", category: "floor_boss", level: 25, maxHp: 100000, atk:350, def: 350, speed: 2.2, expYield: 6000, goldYield: 5, aggroRadius: 400, chaseRadius: 600, attackRange: 140, width: 120, height: 120, respawnDelay: -1, cssColor: 'linear-gradient(45deg, #5D4037, #212121)', cssBorder: '#3E2723' },

    // ==================
    // TYPE 5: SPECTRAL WRAITHS (Ethereal, Fast, Ranged Assassins)
    // ==================
    "common_wraith": { name: "Spectral Wraith", category: "common_mobs", level: 10, maxHp: 150, atk: 75, def: 0, speed: 4.8, expYield: 65, goldYield: 1, aggroRadius: 400, chaseRadius: 600, attackRange: 250, width: 40, height: 40, respawnDelay: 10000, cssColor: 'rgba(156, 39, 176, 0.7)', cssBorder: '#7B1FA2' },
    "mini_boss_wraith": { name: "Soul Reaper", category: "mini_boss", level: 15, maxHp: 11000, atk: 480, def: 10, speed: 5.5, expYield: 1300, goldYield: 3, aggroRadius: 500, chaseRadius: 700, attackRange: 300, width: 60, height: 60, respawnDelay: 120000, cssColor: 'rgba(103, 58, 183, 0.8)', cssBorder: '#512DA8' },
    "floor_boss_wraith": { name: "The Void King", category: "floor_boss", level: 25, maxHp: 45000, atk: 800, def: 100, speed: 6.5, expYield: 6500, goldYield: 5, aggroRadius: 700, chaseRadius: 1000, attackRange: 350, width: 100, height: 100, respawnDelay: -1, cssColor: 'linear-gradient(45deg, #4A148C, #000000)', cssBorder: '#311B92' },

    // ==================
    // TYPE 6: MINOTAURS (Brute Force, Charging Tanks)
    // ==================
    "common_minotaur": { name: "Minotaur Grunt", category: "common_mobs", level: 10, maxHp: 600, atk: 65, def: 15, speed: 2.0, expYield: 80, goldYield: 2, aggroRadius: 300, chaseRadius: 450, attackRange: 60, width: 60, height: 60, respawnDelay: 12000, cssColor: '#795548', cssBorder: '#3E2723' },
    "mini_boss_minotaur": { name: "Gorehorn", category: "mini_boss", level: 15, maxHp: 30000, atk: 450, def: 60, speed: 2.5, expYield: 1800, goldYield: 4, aggroRadius: 400, chaseRadius: 550, attackRange: 90, width: 90, height: 90, respawnDelay: 120000, cssColor: '#5D4037', cssBorder: '#212121' },
    "floor_boss_minotaur": { name: "Asterion The Labyrinth King", category: "floor_boss", level: 25, maxHp: 150000, atk: 550, def: 400, speed: 3.0, expYield: 8500, goldYield: 6, aggroRadius: 500, chaseRadius: 700, attackRange: 140, width: 140, height: 140, respawnDelay: -1, cssColor: 'linear-gradient(45deg, #4E342E, #b71c1c)', cssBorder: '#b71c1c' },

    // ==================
    // TYPE 7: DRAGONS (Armor Piercing, Fire Breathing)
    // ==================
    "common_dragon": { name: "Dragon Whelp", category: "common_mobs", level: 12, maxHp: 400, atk: 85, def: 10, speed: 3.5, expYield: 90, goldYield: 3, aggroRadius: 400, chaseRadius: 600, attackRange: 200, width: 50, height: 50, respawnDelay: 12000, cssColor: '#f44336', cssBorder: '#FF9800' },
    "mini_boss_dragon": { name: "Drake of Embers", category: "mini_boss", level: 15, maxHp: 28000, atk: 500, def: 30, speed: 4.0, expYield: 2000, goldYield: 4, aggroRadius: 500, chaseRadius: 700, attackRange: 250, width: 80, height: 80, respawnDelay: 120000, cssColor: '#d32f2f', cssBorder: '#FFeb3b' },
    "floor_boss_dragon": { name: "Ignis The Ancient", category: "floor_boss", level: 25, maxHp: 180000, atk: 800, def: 500, speed: 4.5, expYield: 9500, goldYield: 8, aggroRadius: 700, chaseRadius: 900, attackRange: 300, width: 160, height: 160, respawnDelay: -1, cssColor: 'linear-gradient(45deg, #b71c1c, #FF9800)', cssBorder: '#FFD700' }
};

function findSocketIdByPlayerId(playerId) { for (const sid of Object.keys(onlinePlayers)) { if (onlinePlayers[sid]?.id === playerId) return sid; } return null; }
function getPlayerById(playerId) { for (const sid of Object.keys(onlinePlayers)) { if (onlinePlayers[sid]?.id === playerId) return onlinePlayers[sid]; } return null; }
function playersInInstance(instId) { 
    return Object.values(onlinePlayers).filter(p => p.instanceId === instId); 
}

function playerAcceptsLoot(player, item) {
    if (!player || !item) return false;
    const rarity = item.rarity || 'Basic';
    const filter = player.lootFilter || {
        Starter: true,
        Basic: true,
        Rare: true,
        Unique: true,
        Legendary: true,
        Godly: true
    };

    if (typeof filter[rarity] === 'undefined') return true;
    return !!filter[rarity];
}

function emitPartyUpdate(partyId) {
    const party = parties[partyId]; if (!party) return; const members = [];
    for (const pid of party.members) {
        const p = getPlayerById(pid);
        if (p) members.push({ id: p.id, name: p.name, level: p.level || 1, currentHp: p.currentHp ?? null, maxHp: p.maxHp ?? null, isGhost: !!p.isGhost });
        else members.push({ id: pid, name: pid, level: 1, currentHp: null, maxHp: null, isGhost: false });
    }
    const payload = { partyId: party.id, leaderId: party.leaderId, name: `${party.leaderId}'s Party`, members };
    for (const pid of party.members) { const sid = findSocketIdByPlayerId(pid); if (sid) io.to(sid).emit('partyUpdate', payload); }
}

function removeFromParty(playerId) {
    const pid = playerParty[playerId]; if (!pid) return; const party = parties[pid]; if (!party) { delete playerParty[playerId]; return; }
    party.members.delete(playerId); delete playerParty[playerId];
    if (party.leaderId === playerId) { const next = party.members.values().next().value; party.leaderId = next || null; }
    if (!party.leaderId || party.members.size <= 1) { for (const rem of party.members) { delete playerParty[rem]; const sid = findSocketIdByPlayerId(rem); if (sid) io.to(sid).emit('partyKickedOrLeft'); } delete parties[pid]; return; }
    emitPartyUpdate(pid);
}

function getInstanceId(playerId, mapId) {
    // 🛡️ THE FIX: Neutral Zone is now a public instance for everyone!
    if (mapId === 'town' || mapId === 'neutralzone') return mapId; 
    const p = getPlayerById(playerId);
    const partyId = playerParty[playerId];
    
    // 🏰 GUILD BASE ROUTING (Private to the Guild!)
    if (mapId === 'guildbase') {
        if (p && p.guild_details && p.guild_details.name) {
            return `guildbase_${p.guild_details.name}`;
        }
        return 'town'; // Fallback if they try to glitch in without a guild
    }
    
    // ⚔️ Route to a private Maze Trial instance if the flag is active
    if (p && p.isMazeTrial) {
        return partyId ? `mazetrial_${mapId}_${partyId}` : `mazetrial_${mapId}_solo_${playerId}`;
    }
    
    return partyId ? `${mapId}_${partyId}` : `${mapId}_solo_${playerId}`; 
}

const worlds = {}; 
function ensureWorldFromMapData(instanceId, mapData) {
    if (!mapData) return null;

    if (!worlds[instanceId]) {
        // 🛡️ THE ANTI-LAG FIX: Do not initialize a world using an empty fallback map!
        // Prevents mobile users with bad connections from permanently creating "dead" empty rooms.
        const isFallback = (!mapData.collisions || mapData.collisions.length === 0) && 
                           (!mapData.normalSpawns || mapData.normalSpawns.length === 0);
        
        if (isFallback && instanceId !== 'town' && !instanceId.includes('home')) {
            console.log(`[ANTI-LAG] Rejected empty map payload for ${instanceId}`);
            return null; // Force the server to wait for a healthy connection to build the room!
        }

        worlds[instanceId] = {
            collisions: mapData.collisions || [],
            teleports: mapData.teleports || [],
            monsters: {},
            pets: {}
        };

       const processSpawns = async (spawnList, fallbackKey) => { 
            for (let i = 0; i < (spawnList || []).length; i++) {
                const sp = spawnList[i];
                const mKey = sp.monsterKey || fallbackKey;

              // 🛡️ SUPABASE-LIVE CHECK
                if (mKey.includes('floor_boss')) {
                    // 🛡️ MAZE TRIAL BYPASS: Ignore DB cooldowns and spawn instantly in private rooms!
                    if (instanceId.startsWith('mazetrial_')) {
                        const mId = `${instanceId}_mob_${Date.now()}_${i}_${Math.random()}`;
                        if (!worlds[instanceId]) return;
                        worlds[instanceId].monsters[mId] = spawnMonster(instanceId, mId, mKey, {
                            spawnArea: { minX: sp.x, maxX: sp.x, minY: sp.y, maxY: sp.y },
                            level: sp.level
                        });
                        continue; // Skip DB checks!
                    }

                    const floorId = instanceId.split('_')[0]; 
                    
                    const { data: timer } = await supabase.from('boss_timers')
                        .select('boss_id, last_death_time')
                        .eq('boss_id', floorId)
                        .single();

                    if (timer) {
                        const remaining = getBossCountdown(timer.last_death_time);
                        
                        if (remaining > 0) {
                            console.log(`[WORLD] ${floorId} boss on cooldown. Auto-spawning in ${Math.round(remaining/1000)}s.`);
                            
                            // 🌟 AUTOMATIC ALARM: Deletes the DB lock and spawns when timer hits 0!
                            setTimeout(async () => {
                                await supabase.from('boss_timers').delete().eq('boss_id', floorId);
                                
                                if (worlds[instanceId]) {
                                    const newMobId = `${instanceId}_mob_${Date.now()}`;
                                    const newBoss = spawnMonster(instanceId, newMobId, mKey, {
                                        spawnArea: { minX: sp.x, maxX: sp.x, minY: sp.y, maxY: sp.y },
                                        level: sp.level
                                    });
                                    worlds[instanceId].monsters[newMobId] = newBoss;
                                    io.to(instanceId).emit('monsterSpawned', serializeMonster(newBoss));
                                    io.emit('systemMessage', `⚠️ The ${floorId.toUpperCase()} Boss has respawned!`);
                                }
                            }, remaining);
                            
                            continue; // Skip the INSTANT spawn, the alarm will handle it.
                        } else {
                            // Timer finished while the room was empty! Clean DB and spawn instantly.
                            await supabase.from('boss_timers').delete().eq('boss_id', floorId);
                        }
                    }
                }

                const mId = `${instanceId}_mob_${Date.now()}_${i}_${Math.random()}`;
                
                // 🛡️ THE RACE CONDITION FIX: 
                // Stop immediately if the player already left the room while the DB was loading
                if (!worlds[instanceId]) return;

                worlds[instanceId].monsters[mId] = spawnMonster(instanceId, mId, mKey, {
                    spawnArea: { minX: sp.x, maxX: sp.x, minY: sp.y, maxY: sp.y },
                    level: sp.level
                });
            }
        };
        processSpawns(mapData.normalSpawns, 'common_mobs1');
        processSpawns(mapData.miniBossSpawns, 'mini_boss1');
        processSpawns(mapData.floorBossSpawns, 'floor_boss1');
    }

    return worlds[instanceId];
}
// ⚡ SPEED STAT: Cooldown Reduction Math Helper
function getReducedCd(p, baseCd) {
    const spd = getServerTotalStat(p, 'speed') || 0;
    const reductionMs = Math.floor(spd / 200) * 1000; // Every 300 speed = 1 sec
    return Math.max(500, baseCd - reductionMs); // Hard cap at 0.5s
}
// 🛡️ ANTI-CHEAT: SERVER-SIDE STAT CALCULATOR
function getServerTotalStat(p, statName) {
    if (!p) return 0;

    const baseStats = sanitizeBaseStats(p.baseStats || p.base_stats);
    const equips = sanitizeEquips(p.equips);

    let base = Number(baseStats[statName]) || 0;

   ['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings'].forEach(slot => {
        const eq = equips[slot];
        if (!eq) return;

        if (eq.fixedStat && typeof eq.fixedStat[statName] === 'number') {
            base += eq.fixedStat[statName];
        }
        if (eq.randomStat && typeof eq.randomStat[statName] === 'number') {
            base += eq.randomStat[statName];
        }
    });

if (baseStats.playerClass === 'Berserker' && (statName === 'hp' || statName === 'defense')) {
        base += Math.floor(base * 0.25);
    }

    if (baseStats.playerClass === 'Blademaster' && statName === 'attack') {
        base += Math.floor(base * 0.25);
    }

    return base;
}
function getServerAttackPower(p) {
    return getServerTotalStat(p, 'attack') + Math.floor(getServerTotalStat(p, 'str') / 2);
}

function getServerMagicAttack(p) {
    return getServerTotalStat(p, 'magic') + Math.floor(getServerTotalStat(p, 'int') / 2);
}

function getServerDefense(p) {
    let def = getServerTotalStat(p, 'defense');

    // Berserker Taunt / Callout buff is enforced here on the server
    if (p && p.tauntBuffUntil && Date.now() < p.tauntBuffUntil) {
        def *= 3;
    }

    return def;
}

function spawnMonster(instId, entityId, originalKey, cfg) {
    let monsterKey = originalKey; // 🌟 Store the original key to prevent mutations!
    let stats = MonsterDatabase[monsterKey] || MonsterDatabase["common_mobs1"];
    
    // 🌟 1% CHANCE TO OVERRIDE ANY COMMON MOB WITH THE GOLDEN SLIME
    if (stats.category === "common_mobs" && monsterKey !== "common_mobs_golden") {
        if (Math.random() < 0.0003) { 
            monsterKey = "common_mobs_golden";
            stats = MonsterDatabase["common_mobs_golden"];
        }
    }
    
    const baseLevel = stats.level || 5;
    const targetLevel = cfg.level || baseLevel;
    const scale = targetLevel / baseLevel; 

    return { 
        id: entityId, instanceId: instId, monsterKey, 
        originalKey: originalKey, // ✅ SAVES THE BASE MONSTER IDENTITY
        name: stats.name, category: stats.category, 
        level: targetLevel,
        x: cfg.spawnArea.minX, y: cfg.spawnArea.minY, homeX: cfg.spawnArea.minX, homeY: cfg.spawnArea.minY, 
        width: stats.width, height: stats.height, 
        maxHp: Math.max(1, Math.floor(stats.maxHp * scale)), 
        currentHp: Math.max(1, Math.floor(stats.maxHp * scale)), 
        atk: Math.max(1, Math.floor(stats.atk * scale)),     
        def: Math.max(0, Math.floor(stats.def * scale)),     
        speed: stats.speed, 
        expYield: Math.max(1, Math.floor(stats.expYield * scale)),   
        goldYield: Math.max(0, Math.floor(stats.goldYield * scale)), 
        aggroRadius: stats.aggroRadius, chaseRadius: stats.chaseRadius, attackRange: stats.attackRange, 
        cssColor: stats.cssColor, cssBorder: stats.cssBorder,
        lastAttack: 0, lastEarthquake: 0, alive: true, threatTable: {}, forcedTargetId: null, forcedUntil: 0, targetId: null, respawnDelayMs: stats.respawnDelay, frozenUntil: 0 
    };
}
function serializeMonster(m) { 
    return { 
        id: m.id, monsterKey: m.monsterKey, name: m.name, x: m.x, y: m.y, 
        width: m.width, height: m.height, maxHp: m.maxHp, currentHp: m.currentHp, 
        atk: m.atk, def: m.def, alive: m.alive, targetId: m.targetId || null, 
        cssColor: m.cssColor, cssBorder: m.cssBorder, level: m.level 
    }; 
}

function checkAndResetInstance(instId) {
    // 🛡️ THE FIX: Never delete Town or Neutral Zone from memory!
    if (!worlds[instId] || instId === 'town' || instId === 'neutralzone') return;

    // Check if there are any REAL players left (ignoring invisible admins)
    const activePlayers = playersInInstance(instId).filter(p => !p.isHiddenAdmin);

    if (activePlayers.length === 0) {
        // ⏳ CRITICAL FIX: Kill any lingering Dungeon or Tavern fail timers before deleting the room!
        // If we don't do this, JavaScript keeps ticking the clock in the background and will ruin the player's next run.
        if (worlds[instId].failTimer) {
            clearTimeout(worlds[instId].failTimer);
        }
        
        // Now safely delete the room so it spawns fresh next time
        delete worlds[instId];
    }
}
function isMonsterColliding(instId, mx, my, mWidth, mHeight) {
    const cols = worlds[instId]?.collisions || [];
    for (let box of cols) { if (mx < box.x + box.w && mx + mWidth > box.x && my < box.y + box.h && my + mHeight > box.y) return true; }
    return false;
}
function hasLineOfSight(instId, x1, y1, x2, y2) {
    const cols = worlds[instId]?.collisions || [];
    const steps = Math.max(8, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 16));

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;

        for (const box of cols) {
            if (
                px >= box.x &&
                px <= box.x + box.w &&
                py >= box.y &&
                py <= box.y + box.h
            ) {
                return false;
            }
        }
    }

    return true;
}
function pickTarget(m, instId, now) {
    for (const pid of Object.keys(m.threatTable)) { 
        const p = getPlayerById(pid); 
        // 🌟 ADDED !p.isHiddenAdmin
        if (!p || p.instanceId !== instId || p.isGhost || p.isHiddenAdmin || p.untargetableUntil > now || p.mapId === 'town') delete m.threatTable[pid]; 
    }
    
    if (m.forcedUntil > now && m.forcedTargetId) {
        const p = getPlayerById(m.forcedTargetId);
        // 🌟 ADDED !p.isHiddenAdmin
        if (p && p.instanceId === instId && !p.isGhost && !p.isHiddenAdmin && p.untargetableUntil <= now && p.mapId !== 'town' && (p.currentHp ?? 1) > 0) {
            return { id: p.id, isPet: false, x: p.x + 24, y: p.y + 48 };
        } else { m.forcedTargetId = null; }
    }

    const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2);

    const world = worlds[instId];
    if (world && world.pets) {
        let closestPet = null; let petDist = Infinity;
        for (const petId in world.pets) {
            const pet = world.pets[petId];
            const dist = Math.hypot(pet.x - mcx, pet.y - mcy);
            // 🛡️ THE FIX: Added hasLineOfSight check so monsters ignore pets behind walls
            if (dist <= m.chaseRadius && dist < petDist && hasLineOfSight(instId, mcx, mcy, pet.x, pet.y)) { 
                closestPet = pet; petDist = dist; 
            }
        }
        if (closestPet) return { id: closestPet.id, isPet: true, x: closestPet.x, y: closestPet.y };
    }

    let best = null; let bestThreat = -1; let bestDist = Infinity;
    for (const pid of Object.keys(m.threatTable)) {
        const threat = m.threatTable[pid] || 0; const p = getPlayerById(pid); 
        // 🌟 ADDED !p.isHiddenAdmin
        if (!p || p.isGhost || p.isHiddenAdmin || p.untargetableUntil > now || p.mapId === 'town') continue;
        const dist = Math.hypot((p.x + 24) - mcx, (p.y + 48) - mcy);
        if (dist > m.chaseRadius) continue;
        
        // Note: No Line of Sight check here. If they are on the threat table, the monster already saw them attack!
        if (threat > bestThreat || (threat === bestThreat && dist < bestDist)) { best = p; bestThreat = threat; bestDist = dist; }
    }
    if (best) return { id: best.id, isPet: false, x: best.x + 24, y: best.y + 48 };
    
    let nearest = null; let nearestDist = Infinity;
    for (const p of playersInInstance(instId)) {
        // 🌟 ADDED !p.isHiddenAdmin
        if (p.isGhost || p.isHiddenAdmin || p.untargetableUntil > now || p.mapId === 'town' || (p.currentHp ?? 1) <= 0) continue; 
        
        const px = p.x + 24;
        const py = p.y + 48;
        const dist = Math.hypot(px - mcx, py - mcy);
        
        // 🛡️ THE FIX: Added hasLineOfSight check for ambient player proximity aggro
        if (dist <= m.aggroRadius && dist < nearestDist && hasLineOfSight(instId, mcx, mcy, px, py)) { 
            nearest = p; nearestDist = dist; 
        }
    }
    if (nearest) { m.threatTable[nearest.id] = Math.max(1, m.threatTable[nearest.id] || 0); return { id: nearest.id, isPet: false, x: nearest.x + 24, y: nearest.y + 48 }; }
    
    return null;
}

function updateMonsterAI(instId, m, now) {
    if (!m.alive) return;
    if (now < m.frozenUntil) return;

    const target = pickTarget(m, instId, now); 
    m.targetId = target ? target.id : null;
    const mcx = m.x + (m.width / 2); 
    const mcy = m.y + (m.height / 2);
    
    if (!target) { 
        const dist = Math.hypot(m.homeX - m.x, m.homeY - m.y); 
        if (dist > 2) { 
            const ang = Math.atan2(m.homeY - m.y, m.homeX - m.x); 
            let nx = m.x + Math.cos(ang) * m.speed; 
            let ny = m.y + Math.sin(ang) * m.speed; 
            if (!isMonsterColliding(instId, nx, m.y, m.width, m.height)) m.x = nx;
            if (!isMonsterColliding(instId, m.x, ny, m.width, m.height)) m.y = ny;
        } 
        return; 
    }
    
if ((m.category === "mini_boss" || m.category === "floor_boss") && m.alive) {
    if (now - (m.lastSpecialSkill || 0) > 6000) {
        if (Math.random() < 0.15) {
            m.lastSpecialSkill = now;

            const isWraith = m.originalKey && m.originalKey.includes('wraith');

            if (isWraith) {
                // 👻 WRAITH MECHANIC: VANISH & REPOSITION
                m.threatTable = {};
                m.targetId = null;
                m.forcedTargetId = null;

                let foundSpot = false;
                let nx = m.x;
                let ny = m.y;

                for (let tries = 0; tries < 10; tries++) {
                    const angle = Math.random() * Math.PI * 2;
                    const jumpDist = 150 + Math.random() * 200;

                    let testX = m.x + Math.cos(angle) * jumpDist;
                    let testY = m.y + Math.sin(angle) * jumpDist;

                    let hitsWall = isMonsterColliding(instId, testX, testY, m.width, m.height);
                    let pathClear = hasLineOfSight(
                        instId,
                        m.x + m.width / 2,
                        m.y + m.height / 2,
                        testX + m.width / 2,
                        testY + m.height / 2
                    );

                    if (!hitsWall && pathClear) {
                        nx = testX;
                        ny = testY;
                        foundSpot = true;
                        break;
                    }
                }

                if (foundSpot) {
                    m.x = nx;
                    m.y = ny;
                }

                io.to(instId).emit('systemMessage', `<span style="color:#9c27b0;">👻 The ${m.name} vanishes into the shadows and drops all aggro!</span>`);
                io.to(instId).emit('monsterSkill', {
                    monsterId: m.id,
                    skillName: 'Vanish',
                    x: m.x,
                    y: m.y,
                    radius: 0
                });

            } else {
                // 🗿 GOLEM & SLIME MECHANIC: EARTHQUAKE
                const aoeRadius = m.category === "floor_boss" ? 400 : 200;

                io.to(instId).emit('monsterSkill', {
                    monsterId: m.id,
                    skillName: 'Earthquake',
                    x: mcx,
                    y: mcy,
                    radius: aoeRadius
                });

                const players = playersInInstance(instId);
                players.forEach(p => {
                    if (p.isGhost || p.isHiddenAdmin || p.mapId === 'town' || p.untargetableUntil > now) return;

                    const pDist = Math.hypot((p.x + 24) - mcx, (p.y + 48) - mcy);
                    if (pDist <= aoeRadius) {
                        const damage = Math.max(1, m.atk - getServerDefense(p));
                        p.currentHp = Math.max(0, p.currentHp - damage);

                        if (p.currentHp <= 0 && p.immortalUntil && now < p.immortalUntil) {
                            p.currentHp = 1;
                        }

                        io.to(instId).emit('monsterAttack', {
                            monsterId: m.id,
                            targetId: p.id,
                            targetX: p.x + 24,
                            targetY: p.y + 48,
                            atk: m.atk,
                            isAoE: true,
                            damage: damage,
                            newHp: p.currentHp
                        });

                        const victimSid = findSocketIdByPlayerId(p.id);
                        if (victimSid) {
                            io.to(victimSid).emit('playerVitals', {
                                currentHp: p.currentHp,
                                maxHp: p.maxHp,
                                level: p.level
                            });
                        }

                        if (p.currentHp <= 0 && !p.isGhost) {
                            p.isGhost = true;
                            p.currentHp = 0;
                            p.currentPortal = null;

                            io.to(instId).emit('remotePlayerGhosted', p.id);

                            const pid = playerParty[p.id];
                            if (!pid || !parties[pid]) {
                                if (victimSid) io.to(victimSid).emit('showDeathScreen');
                            } else {
                                const party = parties[pid];
                                let allDead = true;

                                for (const memberId of party.members) {
                                    const member = getPlayerById(memberId);
                                    if (member && !member.isGhost) {
                                        allDead = false;
                                        break;
                                    }
                                }

                                if (allDead) {
                                    for (const memberId of party.members) {
                                        const memberSid = findSocketIdByPlayerId(memberId);
                                        if (memberSid) io.to(memberSid).emit('showDeathScreen');
                                    }
                                    io.to(instId).emit('partyWiped');
                                }

                                emitPartyUpdate(pid);
                            }
                        }
                    }
                });
            }
        }
    }
}

   // 🐂 MINOTAUR CHARGE CHECK
    const isMinotaur = m.originalKey && m.originalKey.includes('minotaur');
    if (isMinotaur && m.alive && target) {
        if (!m.lastChargeTs || now - m.lastChargeTs > 8000) {
            if (Math.random() < 0.10) {
                m.lastChargeTs = now;
                
                // Dash aggressively in the closest axis
                let dx = target.x - mcx;
                let dy = target.y - mcy;
                let chargeDist = 350; 
                let endX = m.x; let endY = m.y;
                
                if (Math.abs(dx) > Math.abs(dy)) { endX += Math.sign(dx) * chargeDist; } 
                else { endY += Math.sign(dy) * chargeDist; }

                // Prevent charging through solid walls
                if (!isMonsterColliding(instId, endX, endY, m.width, m.height)) {
                    const minX = Math.min(m.x, endX) - 20; const maxX = Math.max(m.x, endX) + m.width + 20;
                    const minY = Math.min(m.y, endY) - 20; const maxY = Math.max(m.y, endY) + m.height + 20;

                    m.x = endX; m.y = endY;

                    io.to(instId).emit('monsterSkill', { monsterId: m.id, skillName: 'Charge', endX: endX, endY: endY, duration: 300 });

                    // Check if any players got run over by the charge!
                    const players = playersInInstance(instId);
                    players.forEach(p => {
                        if (p.isGhost || p.isHiddenAdmin || p.mapId === 'town' || p.untargetableUntil > now) return;
                        const px = p.x + 24; const py = p.y + 48;
                        
                        if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
                            const damage = Math.max(1, Math.floor(m.atk * 1.5) - getServerDefense(p)); // 1.5x Multiplier
                            p.currentHp = Math.max(0, p.currentHp - damage);
                            p.frozenUntil = now + 3000; // 🛡️ THE FIX: 3 Second Stun!
                            
                            io.to(instId).emit('monsterAttack', { monsterId: m.id, targetId: p.id, targetX: px, targetY: py, atk: m.atk, damage: damage, newHp: p.currentHp });
                            io.to(instId).emit('systemMessage', `<span style="color:#ffeb3b;">⚡ ${p.name} was STUNNED by a Minotaur Charge!</span>`);
                            io.to(instId).emit('playerStunned', { targetId: p.id, duration: 3000 }); // 🛡️ THE FIX: Send the freeze command to the client!
                            
                            // Death Check
                            if (p.currentHp <= 0 && !p.isGhost) {
                                p.isGhost = true; p.currentHp = 0; p.currentPortal = null;
                                io.to(instId).emit('remotePlayerGhosted', p.id);
                                const victimSid = findSocketIdByPlayerId(p.id);
                                if (victimSid) io.to(victimSid).emit('showDeathScreen');
                            } else {
                                const victimSid = findSocketIdByPlayerId(p.id);
                                if (victimSid) io.to(victimSid).emit('playerVitals', { currentHp: p.currentHp, maxHp: p.maxHp, level: p.level });
                            }
                        }
                    });
                    return; // Skip normal attack sequence since it charged
                }
            }
        }
    }

    const dist = Math.hypot(target.x - mcx, target.y - mcy);
if (dist > m.chaseRadius) {
    if (!target.isPet && m.threatTable[target.id]) m.threatTable[target.id] *= 0.9;
    if (!target.isPet && m.threatTable[target.id] < 1) delete m.threatTable[target.id];
    return;
}

const isRangedMonster = m.attackRange >= 180;
const canSeeTarget = !isRangedMonster || hasLineOfSight(instId, mcx, mcy, target.x, target.y);

if (dist > m.attackRange || (isRangedMonster && !canSeeTarget)) {
    const ang = Math.atan2(target.y - mcy, target.x - mcx);
    let nx = m.x + Math.cos(ang) * m.speed;
    let ny = m.y + Math.sin(ang) * m.speed;

    if (!isMonsterColliding(instId, nx, m.y, m.width, m.height)) m.x = nx;
    if (!isMonsterColliding(instId, m.x, ny, m.width, m.height)) m.y = ny;
} else {
    if (now - m.lastAttack > 1500) {
        m.lastAttack = now;

        // 🌫️ SMOKE BOMB MISS CHECK
        if (m.smokeBombUntil && now < m.smokeBombUntil) {
            if (Math.random() < 0.75) {
                io.to(instId).emit('attackEvaded', { targetId: target.id, monsterId: m.id, type: 'miss' });
                return;
            }
        }

        if (target.isPet) {
            io.to(instId).emit('monsterAttack', { monsterId: m.id, targetId: target.id, targetX: target.x, targetY: target.y, atk: m.atk });
            return;
        }

        const victim = getPlayerById(target.id);
        if (!victim || victim.isGhost || victim.isHiddenAdmin || victim.mapId === 'town') return;
        if (victim.untargetableUntil > now) return;

        // 🍃 NINJA ASSASSIN DODGE CHECK (Target dodges)
        if (victim.baseStats?.playerClass === 'Ninja Assassin' && victim.level >= 25) {
            let dodgeChance = victim.level >= 75 ? 0.35 : 0.25;
            if (Math.random() < dodgeChance) {
                io.to(instId).emit('attackEvaded', { targetId: victim.id, monsterId: m.id, type: 'dodge' });
                return;
            }
        }

       // ⚔️ BLADEMASTER PARRY CHECK
        if (victim.parryUntil && now < victim.parryUntil) {
            if (Math.random() < 0.70) {
                io.to(instId).emit('attackEvaded', { targetId: victim.id, monsterId: m.id, type: 'parry' });
                return;
            }
        }

      const isDragon = m.originalKey && m.originalKey.includes('dragon');
        let baseDamage = m.atk - getServerDefense(victim);
        let damage = Math.max(1, baseDamage);

        // 🐉 DRAGON PASSIVE: Armor Piercing (Adds Level Difference directly to Damage)
        if (isDragon && m.level > victim.level) {
            let levelGap = Math.max(0, m.level - victim.level);
            damage += levelGap; 
        }

        // 🩸 BERSERKER: I Love PAIN (Lv 75)
        if (victim.baseStats?.playerClass === 'Berserker' && victim.level >= 75 && Math.random() < 0.15) {
            const heal = Math.floor(damage / 3);
            damage = damage - heal;
            victim.currentHp = Math.min(getServerTotalStat(victim, 'hp') || 100, victim.currentHp + heal);
            io.to(instId).emit('playerHealed', { id: victim.id, amount: heal, currentHp: victim.currentHp });
        }

        victim.currentHp = Math.max(0, victim.currentHp - damage);

        // 🛡️ THE FIX: If Immortal is active, force HP to 1 instead of 0
        if (victim.currentHp <= 0 && victim.immortalUntil && now < victim.immortalUntil) {
            victim.currentHp = 1;
        }

        io.to(instId).emit('monsterAttack', {
            monsterId: m.id,
            targetId: victim.id,
            targetX: target.x,
            targetY: target.y,
            atk: m.atk,
            damage: damage,
            newHp: victim.currentHp
        });

        const victimSid = findSocketIdByPlayerId(victim.id);
        if (victimSid) {
            io.to(victimSid).emit('playerVitals', {
                currentHp: victim.currentHp,
                maxHp: victim.maxHp,
                level: victim.level
            });
        }

        const pid = playerParty[victim.id];
        if (pid) emitPartyUpdate(pid);

        if (victim.currentHp <= 0 && !victim.isGhost) {
            victim.isGhost = true;
            victim.currentHp = 0;
            victim.currentPortal = null;

            io.to(instId).emit('remotePlayerGhosted', victim.id);

            if (!pid || !parties[pid]) {
                if (victimSid) io.to(victimSid).emit('showDeathScreen');
            } else {
                const party = parties[pid];
                let allDead = true;

                for (const memberId of party.members) {
                    const member = getPlayerById(memberId);
                    if (member && !member.isGhost) {
                        allDead = false;
                        break;
                    }
                }

                if (allDead) {
                    for (const memberId of party.members) {
                        const memberSid = findSocketIdByPlayerId(memberId);
                        if (memberSid) io.to(memberSid).emit('showDeathScreen');
                    }
                    io.to(instId).emit('partyWiped');
                }

                emitPartyUpdate(pid);
                                }
                            }
                        }
                    }
    }
    setInterval(() => {
    const now = Date.now();
    for (const instId of Object.keys(worlds)) {
        const world = worlds[instId];
        const allMonsters = [];

        // 1. Process all Monster AI first
        for (const mid of Object.keys(world.monsters)) {
            const m = world.monsters[mid];
            updateMonsterAI(instId, m, now);
            allMonsters.push(m);
        }

        // 2. Fetch all active players in this specific room
        const playersInRoom = playersInInstance(instId);

      // 3. Calculate custom Line-of-Sight for EACH player
        for (const p of playersInRoom) {
            // 🛡️ THE FIX: No more God Vision and no more blindness! 
            // Ghosts and Spectators now run through the exact same distance and raycast checks as living players.
            const visibleMonsters = [];
            const px = p.x + 24; // Center of player
            const py = p.y + 48;

            for (const m of allMonsters) {
                if (!m.alive) continue;

                const mx = m.x + (m.width / 2); // Center of monster
                const my = m.y + (m.height / 2);

               // 🛡️ THE FIX: Removed the strict server-side Line-Of-Sight raycast! 
                        // If a monster spawns slightly inside a wall, the strict raycast was making them completely vanish from the network.
                        // Now, the server sends everything within a generous 1500px, and the client's Fog of War hides it naturally!
                        const dist = Math.hypot(px - mx, py - my);
                        if (dist <= 1500) {
                            visibleMonsters.push(serializeMonster(m));
                        }
                    }

                    // 4. Send this highly customized list ONLY to this specific player's socket
                    io.to(p.socketId).emit('monsterState', visibleMonsters);
        }
    }
}, 100);
// 🛡️ SOCKET BOUNCER (Currently DISABLED so PC Browsers can connect directly to Render)
io.use((socket, next) => {
    return next(); 
});
io.on('connection', (socket) => {
    let currentUser = null; 
// ✅ BACKEND FRIENDS & DM LOGIC
    // Note: For now, friendships are stored in-memory. 
    // If the server restarts, players will need to re-add friends.
    if (!global.playerFriends) global.playerFriends = {};

  // ✅ MADE ASYNC TO FETCH OFFLINE LEVELS FROM SUPABASE
 // ✅ ENHANCED FRIENDS LIST (MAP, CLASS, & SPECTATE DATA)
    async function sendFriendsUpdateTo(username) {
        const sid = findSocketIdByPlayerId(username);
        if (!sid) return;

        // 👑 ADMIN OVERRIDE: Kei sees all online players with full data
        if (isAdmin(username)) {
            const allOnline = Object.values(onlinePlayers)
                .filter(p => !isAdmin(p.id)) 
                .map(p => ({ 
                    id: p.id, online: true, level: p.level || 1, 
                    mapId: p.mapId || 'Unknown', pClass: p.baseStats?.playerClass || 'Novice' 
                }));
            io.to(sid).emit('friendsListUpdate', allOnline);
            return;
        }

        const myFriends = global.playerFriends[username] ? Array.from(global.playerFriends[username]) : [];
        if (myFriends.length === 0) { io.to(sid).emit('friendsListUpdate', []); return; }

        // ✅ BATCH FETCH FULL DATA FROM DB
        const { data: dbFriends } = await supabase
            .from('Exonians')
            .select('character_name, level, map_id, base_stats')
            .in('character_name', myFriends);

        const friendData = myFriends.map(f => {
            let isOnline = activeLogins.has(f);
            let currentLevel = 1, currentMap = 'Unknown', currentClass = 'Novice';
            
            if (isOnline) {
                for (let activeId in onlinePlayers) {
                    if (onlinePlayers[activeId].id === f) {
                        currentLevel = onlinePlayers[activeId].level || 1;
                        currentMap = onlinePlayers[activeId].mapId || 'Unknown';
                        currentClass = onlinePlayers[activeId].baseStats?.playerClass || 'Novice';
                        break;
                    }
                }
            } else if (dbFriends) {
                const dbF = dbFriends.find(row => row.character_name === f);
                if (dbF) {
                    currentLevel = dbF.level || 1;
                    currentMap = dbF.map_id || 'Unknown';
                    currentClass = dbF.base_stats?.playerClass || 'Novice';
                }
            }
            return { id: f, online: isOnline, level: currentLevel, mapId: currentMap, pClass: currentClass };
        });
        io.to(sid).emit('friendsListUpdate', friendData);
    }
   // 🛡️ SYSTEM MAILBOX: Fetch messages for the specific player
// 🛡️ SYSTEM MAILBOX: Handles Personal and "Everyone" mail
    socket.on('getMail', async () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        try {
            if (!p.baseStats.claimedMails) p.baseStats.claimedMails = [];

            // 🛡️ Fetch personal mail AND global "Everyone" mail
            const { data: mails, error } = await supabase
                .from('System_Mail')
                .select('*')
                .or(`recipient_name.ilike.${p.id},recipient_name.ilike.Everyone`);

            if (error) throw error;

            let formattedMails = (mails || [])
                .filter(m => {
                    const isEveryone = m.recipient_name.toLowerCase() === 'everyone';
                    // Hide global mails we already claimed, and personal mails that are marked true
                    if (isEveryone) return !p.baseStats.claimedMails.includes(m.id);
                    return m.is_claimed !== true;
                })
                .map(m => {
                    let rawData = m.attached_item || m.attached_file || null;
                    if (typeof rawData === 'string') {
                        try { m.attached_item = JSON.parse(rawData.trim()); } catch (e) { m.attached_item = null; }
                    } else {
                        m.attached_item = rawData;
                    }
                    return m;
                });

            socket.emit('mailList', formattedMails);
        } catch (e) {
            console.error(`[MAIL ERROR]:`, e.message);
            socket.emit('mailList', []);
        }
    });

    socket.on('claimMail', async (mailId) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        try {
            if (!p.baseStats.claimedMails) p.baseStats.claimedMails = [];

            const { data: mail, error } = await supabase
                .from('System_Mail')
                .select('*')
                .eq('id', mailId)
                .or(`recipient_name.ilike.${p.id},recipient_name.ilike.Everyone`)
                .single();

            if (error || !mail) return socket.emit('systemMessage', "Mail not found.");

            const isEveryoneMail = mail.recipient_name.toLowerCase() === 'everyone';

            if (isEveryoneMail) {
                if (p.baseStats.claimedMails.includes(mailId)) return socket.emit('systemMessage', "Already claimed.");
            } else {
                if (mail.is_claimed) return socket.emit('systemMessage', "Mail already claimed.");
            }

            let rawData = mail.attached_item || mail.attached_file || null;
            let finalItem = null;

            if (rawData) {
                if (typeof rawData === 'string') {
                    try { finalItem = JSON.parse(rawData.trim()); } catch (err) { return socket.emit('systemMessage', "Corrupted attachment."); }
                } else {
                    finalItem = rawData;
                }

                if (!finalItem || !finalItem.name) return socket.emit('systemMessage', "Invalid item.");
                if (!finalItem.id) finalItem.id = Date.now() + Math.random();
                if (!finalItem.quantity) finalItem.quantity = 1;

                const inv = Array.isArray(p.inventory) ? [...p.inventory] : [];
                while (inv.length < 20) inv.push(null);

                let stacked = false;
                if (['potion', 'material', 'consumable'].includes(finalItem.type)) {
                    const existingIndex = inv.findIndex(i => i && i.name === finalItem.name);
                    if (existingIndex !== -1) {
                        inv[existingIndex].quantity = (inv[existingIndex].quantity || 1) + finalItem.quantity;
                        stacked = true;
                    }
                }

                if (!stacked) {
                    const emptySlot = inv.findIndex(slot => slot == null);
                    if (emptySlot === -1) return socket.emit('systemMessage', "Inventory full! Clear space to claim.");
                    inv[emptySlot] = finalItem;
                }
                p.inventory = inv;
            }

            // 🛡️ THE FIX: How we save it determines if others can still claim it
            if (isEveryoneMail) {
                p.baseStats.claimedMails.push(mailId);
                await supabase.from('Exonians').update({ inventory: p.inventory, base_stats: p.baseStats }).eq('character_name', p.id);
            } else {
                await supabase.from('System_Mail').update({ is_claimed: true }).eq('id', mailId);
                await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
            }

            socket.emit('mailClaimSuccess', mailId);
            socket.emit('syncInventory', p.inventory);

            let qtyText = finalItem && finalItem.quantity > 1 ? `${finalItem.quantity}x ` : '';
            socket.emit('systemMessage', finalItem ? `Claimed ${qtyText}${finalItem.name}!` : "Mail successfully claimed!");
            
        } catch (e) {
            console.error(`[CLAIM ERROR]:`, e.message);
            socket.emit('systemMessage', "Server error during claim.");
        }
    });

    socket.on('addFriend', (data) => {
        const me = onlinePlayers[socket.id];
        if (!me || !data.targetId) return;

        if (!global.playerFriends[me.id]) global.playerFriends[me.id] = new Set();
        if (!global.playerFriends[data.targetId]) global.playerFriends[data.targetId] = new Set();

        // Add mutually to active memory
        global.playerFriends[me.id].add(data.targetId);
        global.playerFriends[data.targetId].add(me.id);

        // Convert the Sets back to Arrays so Supabase can read them
        const myFriendsArray = Array.from(global.playerFriends[me.id]);
        const targetFriendsArray = Array.from(global.playerFriends[data.targetId]);

        // ✅ SAVE TO SUPABASE DATABASE FOR BOTH PLAYERS
        supabase.from('Exonians').update({ friends: myFriendsArray }).eq('character_name', me.id).then(()=>{});
        supabase.from('Exonians').update({ friends: targetFriendsArray }).eq('character_name', data.targetId).then(()=>{});

        socket.emit('systemMessage', `Added ${data.targetId} to friends list.`);
        sendFriendsUpdateTo(me.id);

        const targetSid = findSocketIdByPlayerId(data.targetId);
        if (targetSid) {
            io.to(targetSid).emit('systemMessage', `${me.id} added you as a friend.`);
            sendFriendsUpdateTo(data.targetId);
        }
    });

    socket.on('sendDM', (data) => {
        const me = onlinePlayers[socket.id];
        if (!me || !data.targetId || !data.message) return;

        const targetSid = findSocketIdByPlayerId(data.targetId);
        if (targetSid) {
            // Send to target
            io.to(targetSid).emit('receiveDM', { from: me.id, message: data.message });
            // Echo back to sender
            socket.emit('receiveDM', { from: `To ${data.targetId}`, message: data.message }); 
        } else {
            socket.emit('systemMessage', `${data.targetId} is currently offline.`);
        }
    });

    socket.on('getFriendsList', () => {
        const me = onlinePlayers[socket.id];
        if (me) sendFriendsUpdateTo(me.id);
    });

    socket.on('updateLootFilter', (filter) => {
        const p = onlinePlayers[socket.id];
        if (!p || !filter || typeof filter !== 'object') return;

        p.lootFilter = {
            Starter: !!filter.Starter,
            Basic: !!filter.Basic,
            Rare: !!filter.Rare,
            Unique: !!filter.Unique,
            Legendary: !!filter.Legendary,
            Godly: !!filter.Godly
        };
    });
    socket.on('saveMapFile', (data) => {
        const p = onlinePlayers[socket.id];
        // 🛡️ ANTI-CHEAT: ONLY THE REAL SERVER ADMIN CAN SAVE MAPS
        if (!p || !isAdmin(p.id)) {
            console.log(`[CRITICAL WARNING] ${socket.id} attempted to overwrite map ${data.mapId}!`);
            return; 
        }
        if (!data.mapId || !data.content) return;
        const fileName = data.mapId === 'town' ? 'townmap.js' : `${data.mapId}.js`;
        const filePath = path.join(__dirname, 'public', fileName);
        try { fs.writeFileSync(filePath, data.content); } catch(err) {}
    });

  socket.on('partyHeal', () => { 
        const p = onlinePlayers[socket.id];
        // 👇 BLOCK NON-HEALERS 👇
        if (!p || p.isGhost || p.mapId === 'town' || p.baseStats?.playerClass !== 'Healer') return;

        const now = Date.now();
        if (p.skillCooldowns['partyHeal'] && now < p.skillCooldowns['partyHeal']) return;
        p.skillCooldowns['partyHeal'] = now + getReducedCd(p, 18000);

        // 🛡️ THE NEW INT SCALING 
        const myInt = getServerTotalStat(p, 'int') || 10; 
        
        // 🛡️ FIX: x2 INT base, x3 INT if Level 25+ (Boost Passive)
        let trueHealAmt = p.level >= 25 ? (myInt * 3) : (myInt * 2);

        // 🛡️ FIX: Use true calculated max HP so it doesn't cap at 100!
        let myMaxHp = getServerTotalStat(p, 'hp') || 100;
        p.currentHp = Math.min(myMaxHp, p.currentHp + trueHealAmt);
        io.to(p.instanceId).emit('playerHealed', { id: p.id, amount: trueHealAmt, currentHp: p.currentHp });

        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            const safeRadius = 400; // 🛡️ CRITICAL FIX: Defined safeRadius to stop 502 crashes!

            for (const memberId of parties[pid].members) {
                if (memberId === p.id) continue;
                const mp = getPlayerById(memberId);
                if (mp && !mp.isGhost && mp.instanceId === p.instanceId) {
                    const dist = Math.hypot(p.x - mp.x, p.y - mp.y);
                    if (dist <= safeRadius) {
                        let memberMaxHp = getServerTotalStat(mp, 'hp') || 100;
                        mp.currentHp = Math.min(memberMaxHp, mp.currentHp + trueHealAmt);
                        io.to(p.instanceId).emit('playerHealed', { id: mp.id, amount: trueHealAmt, currentHp: mp.currentHp });
                    }
                }
            }
            emitPartyUpdate(pid);
        }
    });
   socket.on('partyRevive', () => {
        const p = onlinePlayers[socket.id];
        
        if (!p || p.isGhost || p.mapId === 'town' || p.baseStats?.playerClass !== 'Healer') return;

        // 🛡️ THE NERF: Max 5 uses per instance
        p.purificationUses = p.purificationUses || 0;
        if (p.purificationUses >= 5) {
            socket.emit('systemMessage', "❌ You have exhausted your Purification miracles for this zone (Max 5/5).");
            return; // Stops the skill from casting!
        }

        // 🛡️ 100s COOLDOWN (95s leniency)
        const now = Date.now();
        if (p.skillCooldowns['partyRevive'] && now < p.skillCooldowns['partyRevive']) return;
        p.skillCooldowns['partyRevive'] = now + getReducedCd(p, 95000);

        // 🛡️ Increment uses and notify the Healer
        p.purificationUses++;
        socket.emit('systemMessage', `✨ Purification used (${p.purificationUses}/5 for this run).`);

        // 🛡️ FULL HEAL SELF (The Healer)
        const myMaxHp = getServerTotalStat(p, 'hp') || 100;
        p.currentHp = myMaxHp;
        io.to(p.instanceId).emit('playerHealed', { id: p.id, amount: 9999, currentHp: p.currentHp });

        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                if (memberId === p.id) continue; 
                
                const mp = getPlayerById(memberId);
                
                // 🛡️ GLOBAL REVIVE
                if (mp && mp.mapId !== 'town') {
                    let memberMaxHp = getServerTotalStat(mp, 'hp') || 100;
                    
                    if (mp.isGhost) {
                        mp.isGhost = false;
                        mp.currentHp = memberMaxHp; 
                        io.to(mp.instanceId).emit('playerRevived', { id: mp.id, currentHp: mp.currentHp });
                    } else {
                        mp.currentHp = memberMaxHp;
                        io.to(mp.instanceId).emit('playerHealed', { id: mp.id, amount: 9999, currentHp: mp.currentHp });
                    }
                }
            }
            emitPartyUpdate(pid); 
        }
    });
socket.on('broadcastSkill', (data) => {
    const p = onlinePlayers[socket.id];
    if (!p || p.isGhost || p.mapId === 'town') return;

    const now = Date.now();
    if (p.frozenUntil && now < p.frozenUntil) return; // ❄️ Frozen players cannot cast skills!
    const pClass = p.baseStats?.playerClass || null;
    const level = p.level || 1;
    const skillId = String(data?.skillId || '');

   const SKILL_RULES = {
        heal1: { className: 'Healer', name: 'Heal', unlock: 1, cd: 20000, auraColor: 'green' },
        heal3: { className: 'Healer', name: 'Purification', unlock: 50, cd: 100000, auraColor: 'green' },

        sum1:  { className: 'Summoner', name: 'Summon Slime', unlock: 1, cd: 25000, auraColor: 'blue' },
        sum3:  { className: 'Summoner', name: 'Enhance!', unlock: 50, cd: 100000, auraColor: 'blue' },

        ice1:  { className: 'Ice Master', name: 'Icicle Spear', unlock: 1, cd: 25000, auraColor: 'blue' },
        ice3:  { className: 'Ice Master', name: 'Icicle Storm', unlock: 50, cd: 100000, auraColor: 'blue' },

        ber1:  { className: 'Berserker', name: 'Callout!', unlock: 1, cd: 14000, auraColor: 'red' },
        ber3:  { className: 'Berserker', name: 'Immortal', unlock: 50, cd: 100000, auraColor: 'red' },

     bld2:  { className: 'Blademaster', name: 'Parry', unlock: 25, cd: 13000, auraColor: 'red' },
        bld3:  { className: 'Blademaster', name: 'Mega Slash', unlock: 50, cd: 50000, auraColor: 'red' },

        snp2:  { className: 'Sniper', name: 'Silver Bullet', unlock: 25, cd: 5000, auraColor: 'white' },
        snp3:  { className: 'Sniper', name: 'Killshot', unlock: 50, cd: 50000, auraColor: 'white' },

        exp1:  { className: 'Explosives Expert', name: 'Molotov', unlock: 1, cd: 12000, auraColor: 'orange' },
        exp3:  { className: 'Explosives Expert', name: 'Go Boom!', unlock: 50, cd: 30000, auraColor: 'orange' },
        phs1:  { className: 'Phantom Striker', name: 'Shadow Step', unlock: 1, cd: 5000, auraColor: 'liquid' },
        phs3:  { className: 'Phantom Striker', name: 'Blink Stab', unlock: 50, cd: 30000, auraColor: 'liquid' },
        nin1:  { className: 'Ninja Assassin', name: 'Smoke Bomb', unlock: 1, cd: 10000, auraColor: 'lightning' },
        nin3:  { className: 'Ninja Assassin', name: 'Shadow Copy', unlock: 50, cd: 50000, auraColor: 'lightning' }
    };

    const rule = SKILL_RULES[skillId];
    if (!rule) return;

    if (pClass !== rule.className) return;
    if (level < rule.unlock) return;

    if (!p.skillCooldowns) p.skillCooldowns = {};

    const cdKey = `visual_${skillId}`;
    if (p.skillCooldowns[cdKey] && now < p.skillCooldowns[cdKey]) return;
    p.skillCooldowns[cdKey] = now + getReducedCd(p, rule.cd);

   if (skillId === 'ber3') {
        p.immortalUntil = now + 10000;
    }

    if (skillId === 'bld2') {
        p.parryUntil = now + 10000;
    }
    // 👇 THE FIX: 2-Second Immunity (Untargetable/I-Frames) for Phantom Striker Blink
    if (skillId === 'phs1') {
        p.untargetableUntil = now + 2000;
}
    if (skillId === 'sum3') {
        const world = worlds[p.instanceId];
        if (world && world.pets) {
            for (let petId in world.pets) {
                if (world.pets[petId].ownerId === p.id) {
                    world.pets[petId].enhancedUntil = now + 10000;
                }
            }
        }
    }

    // 🌟 THE FIX: Broadcast the Name and the Weapon Sprite
    socket.to(p.instanceId).emit('remoteSkillEffect', {
        playerId: p.id,
        skillId: skillId,
        skillName: rule.name,
        weaponSprite: p.equips?.weapon?.sprite || '',
        x: p.x,
        y: p.y,
        auraColor: rule.auraColor
    });
});

     socket.on('syncMapData', (mapData) => {
        const world = ensureWorldFromMapData(mapData.instanceId, mapData);
        if (!world) return;

        io.to(mapData.instanceId).emit(
            'monsterState',
            Object.values(world.monsters).map(serializeMonster)
        );
    });

   socket.on('adminSpawnMonster', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !isAdmin(p.id)) return; // 🛡️ SECURITY: Only the real Kei can do this!

        if (!worlds[data.instanceId]) return;
        const newMobId = 'admin_' + Date.now();
        const newMob = spawnMonster(data.instanceId, newMobId, data.monsterKey, { 
            spawnArea: { minX: data.x, minY: data.y },
            level: data.level 
        });
        worlds[data.instanceId].monsters[newMobId] = newMob;
        
        io.to(data.instanceId).emit('monsterSpawned', serializeMonster(newMob));
    });

   socket.on('portalStep', (data) => {
        const p = onlinePlayers[socket.id]; if (!p || p.isGhost) return;
        p.currentPortal = data.portalId;
        
        // 🛡️ MAZE TRIAL BLOCKER: Prevent teleporting to other floors!
        if (p.isMazeTrial && data.targetMapId !== 'town') {
            p.currentPortal = null;
            return socket.emit('systemMessage', '❌ You are in a Maze Trial! You can only teleport back to Town.');
        }

        const pid = playerParty[p.id];
        
    // 🏡 HOME OWNERSHIP CHECK
        if (data.targetMapId.includes('home')) {
            const leaderId = pid ? parties[pid].leaderId : p.id;
            const leader = getPlayerById(leaderId);
            if (!leader || !leader.baseStats?.hasHome) {
                return socket.emit('systemMessage', '❌ The Party Leader does not own a home!');
            }
        }

        if (!pid) {
            socket.emit('teleportApproved', data);
        } else {
            const party = parties[pid];
            let allReady = true;
            for (const memberId of party.members) {
                const mp = getPlayerById(memberId);
                if (mp && mp.instanceId === p.instanceId && mp.currentPortal !== data.portalId && !mp.isGhost) {
                    allReady = false; break;
                }
            }
            if (allReady) {
                for (const memberId of party.members) {
                    const msid = findSocketIdByPlayerId(memberId);
                    if (msid) io.to(msid).emit('teleportApproved', data);
                }
            } else {
                socket.emit('partyError', 'Waiting for all alive party members to gather on the portal...');
            }
        }
    });

    socket.on('portalLeave', () => { const p = onlinePlayers[socket.id]; if(p) p.currentPortal = null; });
// ==========================================
    // 📧 EMAIL VERIFICATION ENGINE (BREVO)
    // ==========================================
    socket.on('requestEmailLink', async (data) => {
        const { username, email } = data;
        if (!username || !email) return socket.emit('emailError', 'Invalid data.');

        try {
            // 🛡️ ANTI-SPAM 3: Check Email Limit (Max 2)
        const { count, error } = await supabase.from('Exonians')
            .select('*', { count: 'exact', head: true })
            .eq('email', email)
            .eq('email_verified', true);

        if (count >= 2) {
            return socket.emit('emailError', 'Registration Limit: This email already has the maximum of 2 characters linked to it.');
        }

            // 2. Generate a 6-digit code and save to the database
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            await supabase.from('Exonians')
                .update({ email: email, verification_code: code })
                .eq('character_name', username);

            // 3. Send the email using Brevo
            await axios.post('https://api.brevo.com/v3/smtp/email', {
                sender: { email: process.env.SENDER_EMAIL, name: "Exonie Online" },
                to: [{ email: email }],
                subject: "Exonie Online - Verification Code",
                htmlContent: `<div style="font-family:sans-serif; text-align:center; padding:20px;">
                        <h2>Welcome to Exonie!</h2>
                        <p>Your verification code is:</p>
                        <h1 style="color:#2196F3; letter-spacing:5px;">${code}</h1>
                        <p>Please enter this in the game to verify your account.</p>
                       </div>`
            }, {
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                }
            });

            socket.emit('emailCodeSent');
        } catch (e) {
            console.error("Brevo Error:", e.response ? e.response.data : e.message);
            socket.emit('emailError', 'Server error sending email. Check API key.');
        }
    });

    socket.on('verifyEmailCode', async (data) => {
        const { username, code } = data;
        
        try {
            const { data: user } = await supabase.from('Exonians').select('verification_code, email').eq('character_name', username).single();
            
            if (!user || user.verification_code !== code) {
                return socket.emit('emailError', 'Invalid or expired verification code.');
            }

            // Success! Link the email and verify them in the database
            await supabase.from('Exonians')
                .update({ email_verified: true, verification_code: null })
                .eq('character_name', username);
            
            // Now automatically log them in by fetching their fresh data
            const { data: freshUser } = await supabase.from('Exonians').select('*').eq('character_name', username).single();
            // 👇 THE FIX: Register the session in server RAM so the game actually knows you are logged in!
            activeLogins.add(username);
            if (freshUser.email) activeEmailSessions[freshUser.email] = socket.id;
            socket.username = username;
            socket.email = freshUser.email;
            currentUser = username;
            socket.emit('emailVerifiedSuccess', freshUser);
        } catch (e) {
            console.error("Verification Confirm Error:", e);
            socket.emit('emailError', 'Server error during verification.');
        }
    });
  socket.on('register', async (data) => {
    console.log(`[REGISTER ATTEMPT] User: ${data.username}`);
    try {
        const { username, password, deviceId } = data;
        if (!username || !password) return socket.emit('authError', 'Invalid data.');

        const clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.handshake.address;
        const safeDeviceId = deviceId || 'unknown_device';

        // 🛡️ THE FIX: Admins completely bypass the character creation limits!
        if (!isAdmin(username)) {
            // 🛡️ ANTI-SPAM 1: Check IP Limit (Max 1)
            const { count: ipCount } = await supabase.from('Exonians').select('*', { count: 'exact', head: true }).eq('ip_address', clientIp);
            if (ipCount >= 1) {
                console.log(`[SECURITY] Blocked Registration - IP ${clientIp} reached the limit.`);
                return socket.emit('authError', 'Registration Limit: You can only create 1 character per network.');
            }

            // 🛡️ ANTI-VPN 2: Check Device ID Limit (Max 1)
            const { count: devCount } = await supabase.from('Exonians').select('*', { count: 'exact', head: true }).eq('device_id', safeDeviceId);
            if (devCount >= 1) {
                console.log(`[SECURITY] Blocked VPN Registration - Device ${safeDeviceId} reached the limit.`);
                return socket.emit('authError', 'Registration Limit: You can only create 1 character per device.');
            }
        }

        const { data: existingUser } = await supabase.from('Exonians').select('character_name').eq('character_name', username).single();
        if (existingUser) return socket.emit('authError', 'Username is already taken!');

        // 🛡️ THE FIX: Save BOTH the IP and Device ID to track them
        const { error } = await supabase.from('Exonians').insert([{ 
            character_name: username, 
            password: password, 
            ip_address: clientIp,
            device_id: safeDeviceId
        }]);

        if (error) {
            console.error(`[REGISTER ERROR] DB failed for ${username}:`, error.message);
            return socket.emit('authError', `Database Error: ${error.message}`);
        }
        socket.emit('registerSuccess', username);
    } catch(e) {
        console.error(`[REGISTER CRASH]`, e);
        socket.emit('authError', 'Server Error');
    }
});
socket.on('login', async (data) => {
    console.log(`[LOGIN ATTEMPT] User: ${data.username}`);
    try {
        const { username, password } = data;
        if (!username || !password) {
            return socket.emit('authError', 'Invalid username or password.');
        }

        const { data: user, error } = await supabase
            .from('Exonians')
            .select('*')
            .eq('character_name', username)
            .eq('password', password)
            .single();

       if (error || !user) {
            console.error(
                `[LOGIN FAILED] Invalid credentials for ${username}. Error:`,
                error?.message || 'No user found'
            );
            return socket.emit('authError', 'Invalid username or password.');
        }

        // 1. Intercept Unverified Users
        if (!user.email_verified) {
            return socket.emit('requireEmailVerification', username);
        }

        // 2. 🛡️ CONNECTION CAPS (2 IP, 1 Device, 2 Email) - Admins bypass
        // x-forwarded-for helps get the real IP if your game is hosted behind a proxy like Render or Cloudflare
        const clientIp = socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.handshake.address;
        const safeDeviceId = data.deviceId || 'unknown_device';
        
       if (!isAdmin(username)) {
            if ((ipConnections[clientIp] || 0) >= 2) {
                console.log(`[SECURITY] Blocked ${username} - IP Cap Reached for ${clientIp}`);
                return socket.emit('authError', 'Connection Limit: Max 2 accounts per network.');
            }
            if (safeDeviceId !== 'unknown_device' && (deviceConnections[safeDeviceId] || 0) >= 1) {
                console.log(`[SECURITY] Blocked ${username} - Device Cap Reached for ${safeDeviceId}`);
                return socket.emit('authError', 'Connection Limit: Max 1 account per device.');
            }
            if (user.email && (emailConnections[user.email] || 0) >= 2) {
                console.log(`[SECURITY] Blocked ${username} - Email Cap Reached for ${user.email}`);
                return socket.emit('authError', 'Connection Limit: Max 2 accounts per email.');
            }
        }
        // 3. THE ULTIMATE KICK ENGINE: Checks Username Only (Since Email is now capped at 2)
        let oldSocketId = null;
        let oldUsername = null;

        // Scan every active connection on the server
        for (const [sid, s] of io.sockets.sockets.entries()) {
            if (sid !== socket.id) {
                // If they share a username, mark them for termination (Email kick removed so they can multibox 2 accounts!)
                if (s.username === username) {
                    oldSocketId = sid;
                    oldUsername = s.username;
                    break;
                }
            }
        }

        // If an old session was found, completely wipe it
        if (oldSocketId) {
            console.log(`[SECURITY] Kicking conflicting session (Socket: ${oldSocketId}) for ${user.email}`);
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            const oldPlayer = onlinePlayers[oldSocketId];

            // Safely save their data before booting them
            if (oldPlayer) {
                const oldInstId = oldPlayer.instanceId;
                if (oldInstId) {
                    socket.to(oldInstId).emit('remotePlayerLeft', oldPlayer.id);
                }

                if (worlds[oldInstId] && worlds[oldInstId].pets) {
                    for (let petId in worlds[oldInstId].pets) {
                        if (worlds[oldInstId].pets[petId].ownerId === oldPlayer.id) {
                            delete worlds[oldInstId].pets[petId];
                        }
                    }
                }

                removeFromParty(oldPlayer.id);

                let saveMap = oldPlayer.isGhost ? 'town' : (oldPlayer.mapId || 'town');
                let saveX = oldPlayer.isGhost ? 960 : (oldPlayer.x || 960);
                let saveY = oldPlayer.isGhost ? 1000 : (oldPlayer.y || 1000);

                await supabase.from('Exonians')
                    .update({ map_id: saveMap, pos_x: saveX, pos_y: saveY })
                    .eq('character_name', oldPlayer.id);

                delete onlinePlayers[oldSocketId];
                checkAndResetInstance(oldInstId);
            }

            if (oldUsername) activeLogins.delete(oldUsername);

            if (oldSocket && oldSocket.connected) {
                oldSocket.emit('forcedLogout', 'Your account was logged in from another session or character.');
                oldSocket.disconnect(true);
            }
        }

        console.log(`[LOGIN SUCCESS] ${username} authenticated successfully.`);

        // 🌟 Record the exact time they logged in AND tag their IP/Device to catch old accounts
        supabase.from('Exonians')
            .update({ 
                last_login: new Date().toISOString(),
                ip_address: clientIp,
                device_id: data.deviceId || 'unknown_device' // 🛡️ ANTI-VPN: Stamps old characters with their Device ID!
            })
            .eq('character_name', username)
            .then(() => {});

        activeLogins.add(username);
        
        // 👇 THE FIX: Bind the data tightly to the socket connection!
        socket.username = username;
        socket.email = user.email; 
        socket.clientIp = clientIp; // Save the IP to the socket for cleanup
        socket.deviceId = data.deviceId || 'unknown_device'; // 🛡️ Store Device ID in memory to block alt parties!
        
        // Add +1 to the connection tallies (unless they are an admin)
        if (!isAdmin(username)) {
            ipConnections[clientIp] = (ipConnections[clientIp] || 0) + 1;
            if (socket.deviceId !== 'unknown_device') {
                deviceConnections[socket.deviceId] = (deviceConnections[socket.deviceId] || 0) + 1;
            }
            if (user.email) {
                emailConnections[user.email] = (emailConnections[user.email] || 0) + 1;
            }
        }

        currentUser = username;

        // 🌟 Send the global top players to the newly logged-in client
        socket.emit('topTavernPlayers', global.topTavernPlayers || []);

        if (!global.playerFriends) global.playerFriends = {};
        global.playerFriends[username] = new Set(user.friends || []);

        if (!user.skin_color) socket.emit('needsCharacterCreation', username);
        else socket.emit('characterSelect', user);

    } catch (e) {
        console.error(`[LOGIN CRASH] Exception thrown for ${data.username}:`, e);
        socket.emit('authError', 'Server Error');
    }
});
    socket.on('createCharacter', async (data) => {
        try {
            const { username, charData } = data;
            
            // ✅ Leave 'weapon' null so their hands are empty, but keep basic clothes on
            const starterEquips = {
                weapon: null, 
                armor: { id: Date.now() + Math.random(), name: "Starter Armor", type: "armor", sprite: "starterarmor", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { defense: 2 } },
                leggings: { id: Date.now() + Math.random(), name: "Starter Leggings", type: "leggings", sprite: "starterleggings", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { hp: 5 } }
            };

            const starterInventory = [];
            for (let i = 0; i < 20; i++) {
                starterInventory.push(null);
            }
            
            // ✅ Pack ALL FOUR weapons into the first inventory slots
            starterInventory[0] = { id: Date.now() + Math.random(), name: "Starter Sword", type: "weapon", sprite: "startersword", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { attack: 3 } };
            starterInventory[1] = { id: Date.now() + Math.random(), name: "Starter Staff", type: "weapon", sprite: "starterstaff", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 3 } };
            starterInventory[2] = { id: Date.now() + Math.random(), name: "Starter Pendant", type: "weapon", sprite: "starterpendant", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { magic: 2 } };
            starterInventory[3] = { id: Date.now() + Math.random(), name: "Starter Gun", type: "weapon", sprite: "startergun", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { attack: 2 } };
            starterInventory[4] = { id: Date.now() + Math.random(), name: "Starter Dagger", type: "weapon", sprite: "starterdagger", level: 1, rarity: "Starter", color: "#aaaaaa", fixedStat: { attack: 3, speed: 2 } };
            
            // 🎁 STARTER GIFT: 10 Health Potions! (Moved to slot 5)
            starterInventory[5] = { id: Date.now() + Math.random(), name: "Health Potion", type: "potion", sprite: "potion1", level: 1, rarity: "Basic", color: "#8B4513", fixedStat: { hpHeal: 50 }, quantity: 10 };

            const { data: user, error } = await supabase.from('Exonians')
                .update({ 
                    skin_color: charData.skinColor, 
                    hair_color: charData.hairColor, 
                    hair_style: charData.hairStyle,
                    equips: starterEquips,
                    inventory: starterInventory,
                    gold: 500 // 🎁 STARTER GIFT: 500 Starting Gold!
                })
                .eq('character_name', username)
                .select().single();
            
            if (error) {
                console.error("[CREATE CHAR ERROR] Supabase rejected the items:", error);
                return socket.emit('authError', 'Failed to save starter items. Check server console.');
            }

            // 🌟 THE FIX: Silently tag this specific login session as a brand new account
            socket.isBrandNewCharacter = true;

            if (user) socket.emit('characterSelect', user);
            
        } catch(e) { 
            console.error("[CREATE CHAR CRASH]", e);
            socket.emit('authError', 'Server Error during character creation.'); 
        }
    });

 socket.on('enterWorld', async (userData) => {
    const mapId = 'town';
    const instId = getInstanceId(userData.character_name, mapId);

    const { data: freshUser, error } = await supabase
        .from('Exonians')
        .select('*')
        .eq('character_name', userData.character_name)
        .single();

    if (error || !freshUser) {
        socket.emit('authError', 'Failed to load character data.');
        return;
    }

    const safeUser = sanitizePlayerRecordFromDb(freshUser);

    // 🌟 GLOBAL WELCOME BROADCAST (100% Secure for New Players Only) 🌟
    if (socket.isBrandNewCharacter) {
        socket.isBrandNewCharacter = false; // Erase the tag so it never fires again if they teleport!
        
        const epicWelcomeMsg = `<span style="color: #ffeb3b; font-size: 1.1em; font-weight: bold; text-shadow: 0 0 10px #ff9800, 0 0 20px #ffea00;">🎊 THE GATES OPEN: A new hero, ${safeUser.character_name}, has just stepped into the maze of Exonie! Welcome! 🎊</span>`;
        
        // Wait 2 seconds before sending, to ensure their client UI and chat box are fully rendered
        setTimeout(() => {
            io.emit('systemMessage', epicWelcomeMsg);
        }, 2000);
    }
     // 📅 PATREON RENEWAL REMINDER (3 Days Before)
    if (safeUser.base_stats.nextRenewalDate && !safeUser.base_stats.reminderSent) {
        const now = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        
        // If the current time is within 3 days of the renewal date
        if (now >= (safeUser.base_stats.nextRenewalDate - threeDaysMs)) {
            safeUser.base_stats.reminderSent = true; // Mark as sent so they aren't spammed every login
            
            // 🔥 This handles the $30 (x3) case perfectly!
            const pledgeAmount = safeUser.base_stats.lastPledgeAmount || 10; 
            
            setTimeout(() => {
                socket.emit('systemMessage', `⚠️ <span style="color:#ff9800; font-weight:bold;">RENEWAL NOTICE:</span> Your Patreon pledge ($${pledgeAmount}) is set to renew in less than 3 days. If you intended this to be a one-time gem purchase, please remember to adjust your pledge on Patreon!`);
            }, 5000); // Wait 5 seconds after login so they see it
        }
    }
    // 🎁 LEVEL 50 FREE WISP PET LOGIC (Mailed on Login)
   // 🎁 LEVEL 50 FREE WISP PET LOGIC (Mailed on Login)
    if (safeUser.level >= 50 && !safeUser.base_stats.gotWisp) {
        safeUser.base_stats.gotWisp = true;
        const wispItem = { id: Date.now() + Math.random(), name: "Sky Wisp Pet", type: 'aura', auraId: 'wisp', sprite: 'aurastone', level: 50, rarity: 'Godly', color: '#87CEEB', description: "Apply it on leggings. A loyal companion.", quantity: 1 };
        
        supabase.from('System_Mail').insert([{
            recipient_name: safeUser.character_name,
            message_text: "Congratulations on reaching Level 50! Here is your exclusive Sky Wisp. Apply it on leggings to equip it.",
            attached_item: JSON.stringify(wispItem),
            is_claimed: false
        }]).then(() => {
            setTimeout(() => { socket.emit('systemMessage', `<span style="color:#87CEEB; font-weight:bold;">🎉 LEVEL 50 REWARD: You have new mail! Check your Mailbox (M).</span>`); }, 3000);
        });
    }
    const trueMaxHp = getServerTotalStat({
        baseStats: safeUser.base_stats,
        equips: safeUser.equips,
        level: safeUser.level || 1
    }, 'hp') || 100;

    currentUser = safeUser.character_name;

    onlinePlayers[socket.id] = {
        socketId: socket.id,
        id: safeUser.character_name,
        name: safeUser.character_name,
        mapId: mapId,
        instanceId: instId,
        isGhost: false,
        currentPortal: null,
        x: 960,
        y: 1000,
        level: safeUser.level || 1,
        exp: safeUser.exp || 0,                 // 🛡️ THE FIX: Load EXP into server RAM
        maxExp: safeUser.max_exp || 200,        // 🛡️ THE FIX: Load Max EXP into server RAM
        currentHp: clamp(safeUser.current_hp || trueMaxHp, 0, trueMaxHp),
        maxHp: trueMaxHp,
        tradeTarget: null,
        inventory: safeUser.inventory,
        equips: safeUser.equips,
        baseStats: safeUser.base_stats,
        gold: safeUser.gold || 0,
        title: safeUser.title || null,
        guild_details: safeUser.guild_details || null, // 🛡️ Attach Guild to Player Object
      spriteData: {
            skin: safeUser.skin_color,
            hair: safeUser.hair_color,
            style: safeUser.hair_style,
            weapon: safeUser.equips.weapon?.sprite || null,
            aura: safeUser.equips.armor?.aura || null,
            pet: safeUser.equips.leggings?.aura || null,
            title: safeUser.title || null,
            isAdmin: isAdmin(safeUser.character_name), // 👑 THE FIX: Tells the client to render the GM tag!
            guildName: safeUser.guild_details ? safeUser.guild_details.name : null // 🛡️ Adds the Guild tag!
        },
        lootFilter: {
            Starter: true,
            Basic: true,
            Rare: true,
            Unique: true,
            Legendary: true,
            Godly: true
        },
        untargetableUntil: 0,
        tauntBuffUntil: 0,
        attackTokens: 3,
        lastTokenRefill: Date.now(),
        skillCooldowns: {}
    };

    await supabase
        .from('Exonians')
        .update({
            inventory: safeUser.inventory,
            equips: safeUser.equips,
            base_stats: safeUser.base_stats,
            map_id: 'town',
            pos_x: 960,
            pos_y: 1000,
            current_hp: onlinePlayers[socket.id].currentHp
        })
        .eq('character_name', currentUser);

    socket.join(instId);
    socket.emit('authSuccess', {
        ...safeUser,
        inventory: safeUser.inventory,
        equips: safeUser.equips,
        base_stats: safeUser.base_stats,
        current_hp: onlinePlayers[socket.id].currentHp,
        max_hp: trueMaxHp
    });

    socket.to(instId).emit('remotePlayerJoined', {
        id: onlinePlayers[socket.id].id,
        name: onlinePlayers[socket.id].name,
        mapId,
        instanceId: instId,
        x: onlinePlayers[socket.id].x,
        y: onlinePlayers[socket.id].y,
        spriteData: onlinePlayers[socket.id].spriteData,
        isGhost: false
    });

    const playersInInst = Object.values(onlinePlayers).filter(
        p => p.instanceId === instId && p.id !== safeUser.character_name
    );

    socket.emit('mapPlayersList', playersInInst.map(p => ({
        id: p.id,
        name: p.name,
        mapId: p.mapId,
        x: p.x,
        y: p.y,
        spriteData: p.spriteData,
        isGhost: p.isGhost
    })));
});

socket.on('saveData', async (playerData) => {
    if (!currentUser) return;
    const p = onlinePlayers[socket.id];
    if (!p) return;

    const now = Date.now();
    if (p.lastSaveTime && now - p.lastSaveTime < 500) return;
    p.lastSaveTime = now;

    const safeMapId = typeof playerData.mapId === 'string' ? playerData.mapId : p.mapId;
   const safeX = typeof playerData.x === 'number' ? playerData.x : p.x;
    const safeY = typeof playerData.y === 'number' ? playerData.y : p.y;

    // 🛡️ THE FIX: Tell the server to accept the watchedTutorial flag!
    if (playerData.baseStats) {
        if (playerData.baseStats.playerClass) {
            p.baseStats.playerClass = String(playerData.baseStats.playerClass);
        }
        if (playerData.baseStats.watchedTutorial !== undefined) {
            p.baseStats.watchedTutorial = !!playerData.baseStats.watchedTutorial;
        }
    }

   p.x = safeX;
    p.y = safeY;
    p.mapId = safeMapId;

    const trueMaxHp = getServerTotalStat(p, 'hp') || 100;
    p.maxHp = trueMaxHp;
    
  if (p.isGhost) {
        p.currentHp = 0;
    } else {
        // 🛡️ THE FIX: Stop trusting the client's HP value! 
        // By removing 'playerData.currentHp', we ensure the server's memory 
        // (which was just updated by the potion) is NOT overwritten by the client.
        p.currentHp = clamp(p.currentHp, 0, trueMaxHp);
    }

    p.spriteData.weapon = p.equips?.weapon?.sprite || null;
    p.spriteData.aura = p.equips?.armor?.aura || null;
    p.spriteData.pet = p.equips?.leggings?.aura || null;
    
    await supabase.from('Exonians').update({
        level: p.level,       // Uses server memory
        exp: p.exp,           // Uses server memory
        max_exp: p.maxExp,    // Uses server memory
        // 🛡️ SECURITY: Hard-cap gold at 50,000,000. No one should ever have more than this legitimately.
        gold: Math.min(50000000, Math.max(0, p.gold)),
        base_stats: p.baseStats, // Uses server memory
        current_hp: p.currentHp,
        pos_x: p.x,
        pos_y: p.y,
        map_id: p.mapId,
    inventory: p.inventory,
        equips: p.equips,
        guild_details: p.guild_details // 🛡️ Save Guild state!
    }).eq('character_name', currentUser);

    const pid = playerParty[p.id];
    if (pid) emitPartyUpdate(pid);
});
    // 🛡️ THE FIX: Force the server to hard-save accessory slots instantly
    socket.on('playerEquipUpdate', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !data || !data.equips) return;

        // Force server memory to recognize the accessory slots
        p.equips = sanitizeEquips(data.equips);

        // Hard-save directly to Supabase
        supabase.from('Exonians').update({
            equips: p.equips
        }).eq('character_name', p.id).then(() => {
            console.log(`[EQUIP SYNC] Saved accessories for ${p.id}`);
        });
    });
 socket.on('playerMoved', (data) => {
        if (!onlinePlayers[socket.id]) return; 
        const p = onlinePlayers[socket.id]; 

        // 🛡️ SERVER-SIDE ANTI-WALLHACK
        const world = worlds[p.instanceId];
        // 🌟 THE FIX: If they just teleported, ignore wallhacks for 4 seconds so they don't bounce!
        if (world && world.collisions && !p.isGhost && (!p.teleportGrace || Date.now() > p.teleportGrace)) {
            const hitX = data.x + 12; 
            const hitY = data.y + 76; 
            let isHacking = false;
            for (let box of world.collisions) {
                if (hitX < box.x + box.w && hitX + 24 > box.x && hitY < box.y + box.h && hitY + 20 > box.y) {
                    isHacking = true; break;
                }
            }
            if (isHacking && !isAdmin(p.id)) {
                socket.emit('forceTeleport', { mapId: p.mapId, x: p.x, y: p.y });
                return; 
            }
        }

        // 🛡️ THE ANIMATION FIX: Throttle 'attack' state broadcasts
        const now = Date.now();
        let broadcastState = data.state;
        
        if (data.state === 'attack') {
            if (p.lastAnimTs && now - p.lastAnimTs < 800) {
                broadcastState = 'idle'; // Force hackers to look 'idle' if they spam clicks
            } else {
                p.lastAnimTs = now;
            }
        }

        p.x = data.x; p.y = data.y; p.spriteData.weapon = data.weaponSprite;
        
        if (!p.isHiddenAdmin) {
            socket.to(p.instanceId).emit('remotePlayerMoved', { 
                id: p.id, x: data.x, y: data.y, state: broadcastState, // Send the throttled state
                facingRight: data.facingRight, weaponSprite: data.weaponSprite,
                spriteData: p.spriteData 
            });
        }
    });
// 🎥 TUTORIAL INSTANT SAVE (FIXED)
    socket.on('markTutorialWatched', async () => {
        const p = onlinePlayers[socket.id]; // 🛡️ Uses your correct player array!
        if (p && p.baseStats) {
            p.baseStats.watchedTutorial = true;
            
            // 🛡️ Uses your direct Supabase method to guarantee it saves instantly!
            try {
                await supabase
                    .from('Exonians')
                    .update({ base_stats: p.baseStats })
                    .eq('character_name', p.id);
                console.log(`[TUTORIAL] Saved watchedTutorial: true for ${p.id}`);
            } catch (err) {
                console.error('[TUTORIAL SAVE ERROR]', err);
            }
        }
    });
  socket.on('tauntMonsters', () => { // 🛡️ Ignored client data
    const p = onlinePlayers[socket.id];
    if (!p || p.isGhost) return;
    if (p.mapId === 'town' || p.baseStats?.playerClass !== 'Berserker') return;

    const now = Date.now();
    if (p.skillCooldowns['tauntMonsters'] && now < p.skillCooldowns['tauntMonsters']) return;
    p.skillCooldowns['tauntMonsters'] = now + getReducedCd(p, 13000);

    // ✅ SERVER now also stores the defensive taunt buff duration
    p.tauntBuffUntil = now + 10000;

    const world = worlds[p.instanceId];
    if (!world) return;

    for (let mId in world.monsters) {
        let m = world.monsters[mId];
        if (!m.alive) continue;

        let dist = Math.hypot(
            p.x + 24 - (m.x + m.width / 2),
            p.y + 48 - (m.y + m.height / 2)
        );

        if (dist <= 300) {
            m.forcedTargetId = p.id;
            m.forcedUntil = now + 10000;
        }
    }
});

socket.on('syncPet', (data) => {
        const p = onlinePlayers[socket.id]; if(!p) return;
        if (p.mapId === 'town') return; 
        const world = worlds[p.instanceId]; if(!world) return;
        if (!world.pets) world.pets = {};
        
        if (data.alive) { 
            let myPetCount = Object.values(world.pets).filter(pet => pet.ownerId === p.id).length;
            // 🛡️ THE FIX: Check if we are at the pet limit. But if it's an existing pet moving, let it sync!
            if (myPetCount >= 3 && !world.pets[data.id]) return; 
            
            // 🛡️ THE REAL FIX: Don't overwrite the pet if it already exists! Just update X and Y.
            // This ensures the `enhancedUntil` buff and attack cooldowns are never deleted!
            if (!world.pets[data.id]) {
                world.pets[data.id] = { 
                    id: data.id, 
                    ownerId: p.id, 
                    x: data.x, 
                    y: data.y, 
                    isClone: !!data.isClone, 
                    isBigBoss: !!data.isBigBoss 
                }; 
            } else {
                world.pets[data.id].x = data.x;
                world.pets[data.id].y = data.y;
            }
        } 
        else { delete world.pets[data.id]; }
        
        socket.to(p.instanceId).emit('remotePetSync', { ownerId: p.id, petData: data });
    });
    socket.on('setParryStance', () => { 
        const p = onlinePlayers[socket.id];
        if (p && p.mapId !== 'town' && p.baseStats?.playerClass === 'Blademaster') { 
            const now = Date.now();
            if (p.skillCooldowns['setParryStance'] && now < p.skillCooldowns['setParryStance']) return;
            p.skillCooldowns['setParryStance'] = now + getReducedCd(p, 13000);

            p.parryUntil = Date.now() + 10000; // 🛡️ Server enforces 10s buff
        }
    });

  socket.on('attackMonster', async (payload) => {
        const p = onlinePlayers[socket.id]; if (!p || p.isGhost) return; 
        if (p.mapId === 'town') return; 
        const now = Date.now();
        if (p.frozenUntil && now < p.frozenUntil) return; // ❄️ Frozen players cannot attack!

        // 👇 STRICT ANTI-CHEAT (NO MORE BURSTS) 👇
        if (payload.skillId === 'basic') {
            // 🛡️ STRICT GLOBAL COOLDOWN: 800ms between basic attacks. 
            // If they swing faster than this via macro or hacks, the server silently deletes the hit!
            if (p.lastBasicAttack && now - p.lastBasicAttack < 800) return;
            p.lastBasicAttack = now;
        }
        // 👆 END OF WRAPPER 👆

        const world = worlds[p.instanceId]; if (!world) return;
        const m = world.monsters[payload.monsterId]; 
        if (!m || !m.alive) return;
        
        const pcx = p.x + 24; const pcy = p.y + 48; const mcx = m.x + (m.width / 2); const mcy = m.y + (m.height / 2); 
        
        // 🛡️ THE FIX: Check Pet distance if it's a pet attack, otherwise check Player distance
        let dist = Math.hypot(pcx - mcx, pcy - mcy);
        if (payload.skillId === 'pet' && world.pets && world.pets[payload.petId]) {
            const pet = world.pets[payload.petId];
            dist = Math.hypot(pet.x - mcx, pet.y - mcy);
        }

        let maxDist = 350;
        if (p.baseStats?.playerClass === 'Sniper') maxDist = 402.5; 
        
        // Pets have their own range (Boss: 400 AoE, Slime: 150)
        let finalMax = payload.skillId === 'pet' ? 450 : maxDist;
        if (dist > finalMax) return;
        
        // 🛡️ 100% SERVER-SIDE MATH: The client's opinions are ignored entirely.
        let isMagicClass = ['Healer', 'Summoner', 'Ice Master'].includes(p.baseStats?.playerClass);
        let serverAtkPwr = isMagicClass ? getServerMagicAttack(p) : getServerAttackPower(p);
        let isPendant = p.equips?.weapon?.sprite?.includes('pendant') || false;
        
       // Base Swing (90% to 110%)
        let trueDmg = Math.floor(serverAtkPwr * (0.9 + Math.random() * 0.2));
        let pClass = p.baseStats?.playerClass;
        let hitCount = 1;

       // 🌀 PHANTOM STRIKER: Craftiness (Lv 75) - CD Reset
        if (pClass === 'Phantom Striker' && p.level >= 75 && payload.skillId === 'basic') {
            if (Math.random() < 0.25) {
                for (let key in p.skillCooldowns) p.skillCooldowns[key] = 0;
                // 🛡️ THE FIX: Only you see this reset now
                socket.emit('systemMessage', `<span style="color:#00E5FF; font-weight:bold;">🌀 Your Craftiness reset your skill cooldowns!</span>`);
                const msid = findSocketIdByPlayerId(p.id);
                if (msid) io.to(msid).emit('cdReset'); 
            }
        }

        // ⚔️ PHANTOM STRIKER: Sleight of Hand (Lv 25) - Double Hit
        if (pClass === 'Phantom Striker' && p.level >= 25 && payload.skillId !== 'pet' && Math.random() < 0.50) {
            hitCount = 2;
            // 🛡️ THE FIX: Only you see this trigger now
            socket.emit('systemMessage', `<span style="color:#ffffff; font-weight:bold;">🗡️ Sleight of Hand triggered a double attack!</span>`);
        }

        // 🎯 SNIPER: Dual Bullet (Lv 75)
        if (pClass === 'Sniper' && p.level >= 75 && payload.skillId !== 'pet' && Math.random() < 0.50) {
            hitCount *= 2;
        }

        // ⚕️ HEALER: Healing Touch (Lv 75)
        if (pClass === 'Healer' && p.level >= 75 && payload.skillId === 'basic') {
            const healAmt = Math.max(1, Math.floor((getServerTotalStat(p, 'int') || 10) * 0.05));
            const pid = playerParty[p.id];
            if (pid && parties[pid]) {
                for (const memberId of parties[pid].members) {
                    const mp = getPlayerById(memberId);
                    if (mp && !mp.isGhost && mp.instanceId === p.instanceId) {
                        let memberMaxHp = getServerTotalStat(mp, 'hp') || 100;
                        mp.currentHp = Math.min(memberMaxHp, mp.currentHp + healAmt);
                        io.to(p.instanceId).emit('playerHealed', { id: mp.id, amount: healAmt, currentHp: mp.currentHp });
                    }
                }
            } else {
                let myMaxHp = getServerTotalStat(p, 'hp') || 100;
                p.currentHp = Math.min(myMaxHp, p.currentHp + healAmt);
                io.to(p.instanceId).emit('playerHealed', { id: p.id, amount: healAmt, currentHp: p.currentHp });
            }
        }

// 🔫 SKILL DAMAGE LOGIC
        if (payload.skillId === 'snp2') {
             if (pClass !== 'Sniper') return;
             if (p.skillCooldowns['snp2'] && now < p.skillCooldowns['snp2'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 2);
             p.skillCooldowns['snp2'] = now + getReducedCd(p, 5000); 
             
         } else if (payload.skillId === 'snp3') {
             if (pClass !== 'Sniper') return;
             if (p.skillCooldowns['snp3'] && now < p.skillCooldowns['snp3'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 4);
             p.skillCooldowns['snp3'] = now + getReducedCd(p, 50000); 
             
         } else if (payload.skillId === 'exp1') {
             if (pClass !== 'Explosives Expert') return;
             if (p.skillCooldowns['exp1'] && now < p.skillCooldowns['exp1'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr); 
             p.skillCooldowns['exp1'] = now + getReducedCd(p, 12000); 

             let durationTicks = p.level >= 25 ? 10 : 3;
             let ticksDone = 0;
             const instId = p.instanceId;
             const targetMobId = m.id;
             
             const fireInt = setInterval(() => {
                 ticksDone++;
                 let tm = worlds[instId]?.monsters[targetMobId];
                 if (ticksDone > durationTicks || !tm || !tm.alive) {
                     clearInterval(fireInt); return;
                 }
                 let dotDmg = Math.max(1, Math.floor(serverAtkPwr) - (tm.def || 0));
                 tm.currentHp -= dotDmg;
                 if (tm.currentHp <= 0) tm.currentHp = 1; 
                 tm.threatTable[p.id] = (tm.threatTable[p.id] || 0) + dotDmg;
                 io.to(instId).emit('monsterHit', { monsterId: tm.id, attackerId: p.id, damage: dotDmg, newHp: tm.currentHp, maxHp: tm.maxHp });
             }, 1000);
             
         } else if (payload.skillId === 'exp3') {
             if (pClass !== 'Explosives Expert') return;
             if (p.skillCooldowns['exp3'] && now < p.skillCooldowns['exp3'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 5); 
             p.skillCooldowns['exp3'] = now + getReducedCd(p, 30000); 

         // 🌫️ NINJA: Smoke Bomb
         } else if (payload.skillId === 'nin1') {
             if (pClass !== 'Ninja Assassin') return;
             if (p.skillCooldowns['nin1'] && now < p.skillCooldowns['nin1'] && !isAdmin(p.id)) return; 
             m.smokeBombUntil = now + 10000;
             trueDmg = 1; // Pure 1 damage impact
             p.skillCooldowns['nin1'] = now + getReducedCd(p, 10000); 
             
         // 🗡️ PHANTOM: Blink Stab
         } else if (payload.skillId === 'phs3') {
             if (pClass !== 'Phantom Striker') return;
             if (p.skillCooldowns['phs3'] && now < p.skillCooldowns['phs3'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 2);
             p.skillCooldowns['phs3'] = now + getReducedCd(p, 30000); 
             
         } else if (payload.skillId === 'fox_bite') {
             trueDmg = 1; 
         } else if (payload.skillId === 'bld3') {
             if (pClass !== 'Blademaster') return; 
             if (p.skillCooldowns['heavyAttack'] && now < p.skillCooldowns['heavyAttack'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 5);
             p.skillCooldowns['heavyAttack'] = now + getReducedCd(p, 49000); 
             
         } else if (payload.skillId === 'ice1') {
             if (pClass !== 'Ice Master') return; 
             if (p.skillCooldowns['ice1'] && now < p.skillCooldowns['ice1'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 2);
             p.skillCooldowns['ice1'] = now + getReducedCd(p, 23000);
             
         } else if (payload.skillId === 'ice3') {
             if (pClass !== 'Ice Master') return; 
             if (p.skillCooldowns['ice3'] && now < p.skillCooldowns['ice3'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 6); 
             p.skillCooldowns['ice3'] = now + getReducedCd(p, 98000); 
             
        } else if (payload.skillId === 'pet') {
             const world = worlds[p.instanceId];
             const pet = world.pets[payload.petId]; 
             
             if (!pet) return;
             if (pet.lastAttackTs && now - pet.lastAttackTs < 900) return; 
             pet.lastAttackTs = now;
             
             if (pet.isBigBoss) {
                 // 👑 BIG BOSS PvP/PvE: Fixed Damage
                 let bossAtk = 450; // Base Floor Boss 1
                 if (pet.enhancedUntil && Date.now() < pet.enhancedUntil) {
                     bossAtk = 1800; // x4 Multiplier
                 }
                 trueDmg = bossAtk;
             } else {
                 // 🟢 NORMAL SLIMES & 🥷 SHADOW CLONES: % Scaling
                 let multiplier = 0.25; 
                 if (pet.enhancedUntil && Date.now() < pet.enhancedUntil) multiplier = 1.0; 
                 if (pet.isClone) multiplier = 1.0; // Clones always have 100% ATK!
                 
                 let sourceAtk = pet.isClone ? getServerAttackPower(p) : getServerMagicAttack(p);
                 trueDmg = Math.floor(sourceAtk * multiplier);
             }
             hitCount = 1; 
         }

        // 🌟 LEVEL 75 AoE LOGIC & BIG BOSS
        let targets = [m];
        if (p.level >= 75) {
            if (pClass === 'Ice Master' && (payload.skillId === 'ice1' || payload.skillId === 'ice3')) {
                targets = Object.values(world.monsters).filter(mob => mob.alive && Math.hypot(mob.x - m.x, mob.y - m.y) <= 300);
            }
            if (pClass === 'Explosives Expert' && payload.skillId === 'exp3') {
                targets = Object.values(world.monsters).filter(mob => mob.alive && Math.hypot(mob.x - m.x, mob.y - m.y) <= 500);
            }
        }
        if (payload.skillId === 'pet' && payload.isBigBoss) {
            const pet = world.pets[payload.petId];
            // 🛡️ THE FIX: Earthquake drops on the BOSS's location, not the enemy's location!
            if (pet && (!pet.lastEqTs || now - pet.lastEqTs > 4000)) {
                pet.lastEqTs = now;
                targets = Object.values(world.monsters).filter(mob => mob.alive && Math.hypot(mob.x - pet.x, mob.y - pet.y) <= 400);
                io.to(p.instanceId).emit('monsterSkill', { monsterId: payload.petId, skillName: 'Earthquake', x: pet.x, y: pet.y, radius: 400, color: 'blue' });
            }
        }

        // 🛡️ APPLY DAMAGE LOOP 
        for (let hc = 0; hc < hitCount; hc++) {
            setTimeout(() => {
                targets.forEach(targetMob => {
                    if (!targetMob.alive) return;
                    const dmg = Math.max(1, trueDmg - (targetMob.def || 0)); 
                    targetMob.currentHp -= dmg; if (targetMob.currentHp < 0) targetMob.currentHp = 0; 
                    targetMob.threatTable[p.id] = (targetMob.threatTable[p.id] || 0) + dmg;
                    
                    let didFreeze = false;
                    if (pClass === 'Ice Master' && p.level >= 25 && (payload.skillId === 'basic' || payload.skillId === 'ice1' || payload.skillId === 'ice3')) {
                        if (Math.random() < 0.25) { targetMob.frozenUntil = Date.now() + 3000; didFreeze = true; }
                    }

                    // 🩸 BLADEMASTER: Sharp Edge (Lv 75)
                    if (pClass === 'Blademaster' && p.level >= 75 && Math.random() < 0.25 && payload.skillId !== 'pet') {
                        const bleedDmg = Math.max(1, Math.floor(serverAtkPwr * 0.15));
                        let ticks = 0;
                        const bleedInt = setInterval(() => {
                            ticks++;
                            if (ticks > 3 || !targetMob.alive) { clearInterval(bleedInt); return; }
                            targetMob.currentHp -= bleedDmg; if (targetMob.currentHp < 0) targetMob.currentHp = 0;
                            targetMob.threatTable[p.id] = (targetMob.threatTable[p.id] || 0) + bleedDmg;
                            io.to(p.instanceId).emit('monsterHit', { monsterId: targetMob.id, attackerId: p.id, damage: bleedDmg, newHp: targetMob.currentHp, maxHp: targetMob.maxHp, isPendant: false, didFreeze: false });
                            
                            // Safe Bleed Death check
                            if (targetMob.currentHp <= 0 && targetMob.alive) {
                                targetMob.alive = false;
                                io.to(p.instanceId).emit('monsterDied', { monsterId: targetMob.id, killerId: p.id });
                            }
                        }, 1000);
                    }

                    io.to(p.instanceId).emit('monsterHit', { monsterId: targetMob.id, attackerId: p.id, damage: dmg, newHp: targetMob.currentHp, maxHp: targetMob.maxHp, isPendant: isPendant, didFreeze: didFreeze });
                
                if (m.currentHp <= 0) {
                    m.alive = false;
                    m.targetId = null;
                    m.threatTable = {};
                    m.forcedTargetId = null;
                    m.forcedUntil = 0;
                    m.frozenUntil = 0;
                    
                    if (m.isNeutralBoss) {
                        clearTimeout(global.neutralBossDespawnTimer);
                        supabase.from('boss_timers').upsert({ boss_id: 'neutralzone_boss', last_death_time: Date.now() }, { onConflict: 'boss_id' }).then(()=>{
                            io.emit('systemMessage', `🏆 [WORLD] The Neutral Zone Boss was defeated by ${p.name}! Respawning in 5 hours.`);
                            checkNeutralBoss(); 
                        });
                    }
                    io.to(p.instanceId).emit('monsterDied', { monsterId: m.id, killerId: p.id });

                    // 🏰 DUNGEON 1 WIN CONDITION & AUTO-KICK
                    if (p.mapId === 'dungeon1') {
                        const activeMobs = Object.values(worlds[p.instanceId].monsters).filter(mob => mob.alive).length;
                        if (activeMobs === 0) {
                            if (worlds[p.instanceId] && worlds[p.instanceId].failTimer) {
                                clearTimeout(worlds[p.instanceId].failTimer);
                            }
                            
                            io.to(p.instanceId).emit('dungeonTimerStop');
                            io.to(p.instanceId).emit('dungeonVictory');
                            
                            const playersInRoom = playersInInstance(p.instanceId);
                            playersInRoom.forEach(roomPlayer => {
                                setTimeout(() => {
                                    roomPlayer.mapId = 'town';
                                    roomPlayer.x = 960; 
                                    roomPlayer.y = 1000;
                                    roomPlayer.instanceId = getInstanceId(roomPlayer.id, 'town');
                                    
                                    const rsid = findSocketIdByPlayerId(roomPlayer.id);
                                    if (rsid) io.to(rsid).emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 }); 
                                    
                                    roomPlayer.dungeonReturnData = null; 
                                }, 4000);
                            });
                        }
                    }
                    // 👻 HAUNTED HOUSE WIN CONDITION & AUTO-KICK
                    if (p.mapId === 'hauntedhouse') {
                        const activeMobs = Object.values(worlds[p.instanceId].monsters).filter(mob => mob.alive).length;
                        if (activeMobs === 0) {
                            io.to(p.instanceId).emit('hauntedVictory');
                            
                            const playersInRoom = playersInInstance(p.instanceId);
                            playersInRoom.forEach(roomPlayer => {
                                setTimeout(() => {
                                    roomPlayer.mapId = 'town';
                                    roomPlayer.x = 960; roomPlayer.y = 1000;
                                    roomPlayer.instanceId = getInstanceId(roomPlayer.id, 'town');
                                    
                                    const rsid = findSocketIdByPlayerId(roomPlayer.id);
                                    if (rsid) io.to(rsid).emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 }); 
                                }, 4000);
                            });
                        }
                    }

                    // 1. Process EXP & Gold First
                    const expAmount = m.expYield || 25;
                    const goldAmount = m.goldYield || 15;
                    const pid = playerParty[p.id];

                    const processRewards = async (targetPlayer, targetSid) => {
                        if (!targetPlayer) return;
                        
                        // 🛡️ ANTI-AFK EXPLOIT: Only give rewards if they are actually in the boss room!
                        if (targetPlayer.instanceId !== p.instanceId) return;

                        targetPlayer.exp += expAmount;
                        targetPlayer.gold += goldAmount;

                        let leveledUp = false;
                        while (targetPlayer.exp >= targetPlayer.maxExp && targetPlayer.level < 80) {
                            targetPlayer.exp -= targetPlayer.maxExp;
                            targetPlayer.level++;
                            targetPlayer.maxExp += (targetPlayer.level >= 71 ? 10000 : targetPlayer.level >= 61 ? 7500 : targetPlayer.level >= 51 ? 5000 : targetPlayer.level >= 41 ? 1500 : targetPlayer.level >= 31 ? 1000 : targetPlayer.level >= 21 ? 750 : targetPlayer.level >= 11 ? 500 : 100);
                            targetPlayer.baseStats.hp += 10;
                            targetPlayer.baseStats.str += 2;
                            targetPlayer.baseStats.int += 2;
                            leveledUp = true;
                        }
                        
                        if (leveledUp) {
                            if (!targetPlayer.isGhost) targetPlayer.currentHp = getServerTotalStat(targetPlayer, 'hp') || 100;
                            
                            if (targetSid) {
                                io.to(targetSid).emit('serverLevelUp', { 
                                    level: targetPlayer.level, exp: targetPlayer.exp, maxExp: targetPlayer.maxExp, 
                                    baseStats: targetPlayer.baseStats, currentHp: targetPlayer.currentHp 
                                }); 
                            }

                            if (targetPlayer.level >= 50 && !targetPlayer.baseStats.gotWisp) {
                                targetPlayer.baseStats.gotWisp = true;
                                const wispItem = { id: Date.now() + Math.random(), name: "Sky Wisp Pet", type: 'aura', auraId: 'wisp', sprite: 'aurastone', level: 50, rarity: 'Godly', color: '#87CEEB', description: "Apply it on leggings. A loyal companion.", quantity: 1 };
                                
                                supabase.from('System_Mail').insert([{
                                    recipient_name: targetPlayer.id,
                                    message_text: "Congratulations on reaching Level 50! Here is your exclusive Sky Wisp. Apply it on leggings to equip it.",
                                    attached_item: JSON.stringify(wispItem),
                                    is_claimed: false
                                }]).then(() => {
                                    if (targetSid) io.to(targetSid).emit('systemMessage', `<span style="color:#87CEEB; font-weight:bold;">🎉 LEVEL 50 REWARD: A reward has been sent to your Mailbox (M)!</span>`);
                                });
                            }
                        }

                        if (targetPlayer.mapId !== 'trainingtavern') {
                            
                            // 💎 DYNAMIC LOOT ROUTING
                            let drop = null;
                            if (targetPlayer.mapId === 'hauntedhouse') {
                                drop = generateHauntedLoot(m.level);
                            } else if (String(targetPlayer.mapId).startsWith('dungeon')) {
                                drop = generateDungeonLoot(m);
                            } else {
                                drop = generateLoot(m);
                            }
                            let dropAccepted = drop && playerAcceptsLoot(targetPlayer, drop);

                            if (dropAccepted) {
                                const inv = Array.isArray(targetPlayer.inventory) ? targetPlayer.inventory : new Array(20).fill(null);
                                let stacked = false;

                                if (['potion', 'material', 'consumable'].includes(drop.type)) {
                                    let idx = inv.findIndex(i => i && i.name === drop.name);
                                    if (idx !== -1) {
                                        inv[idx].quantity = (inv[idx].quantity || 1) + (drop.quantity || 1);
                                        stacked = true;
                                    }
                                }

                                if (!stacked) {
                                    let emptySlot = inv.findIndex(i => i === null);
                                    if (emptySlot !== -1) inv[emptySlot] = drop;
                                }
                                targetPlayer.inventory = inv;
                            }

                            // 🏆 TITLE ENGINE FIX
                            if (m.category === "floor_boss" && targetPlayer.mapId) {
                                const match = targetPlayer.mapId.match(/floor(\d+)/i);
                                const killedFloorNum = match ? parseInt(match[1]) : null;
                                
                                if (killedFloorNum) {
                                    let currentHighestFloor = 0;
                                    let hasCustomTitle = false;
                                    
                                    const existingTitle = targetPlayer.title ? String(targetPlayer.title).toUpperCase() : ""; 
                                    
                                    if (existingTitle && existingTitle.startsWith('FLOOR CONQUEROR')) {
                                        const parts = existingTitle.split(' ');
                                        currentHighestFloor = parseInt(parts[2]) || 0;
                                    } else if (existingTitle && existingTitle.length > 0) {
                                        // 🛡️ They have a special title (like GM). Do not overwrite it!
                                        hasCustomTitle = true;
                                    }
                                    
                                    if (!hasCustomTitle && killedFloorNum > currentHighestFloor) {
                                        const newTitle = `FLOOR CONQUEROR ${killedFloorNum}`;
                                        targetPlayer.title = newTitle; 
                                        if (!targetPlayer.baseStats) targetPlayer.baseStats = {};
                                        targetPlayer.baseStats.title = newTitle; // 🛡️ THE FIX: Syncs to RAM so it doesn't rollback on disconnect!
                                        if (!targetPlayer.spriteData) targetPlayer.spriteData = {};
                                        targetPlayer.spriteData.title = newTitle;
                                        if (targetSid) io.to(targetSid).emit('titleUnlocked', newTitle);
                                        io.emit('systemMessage', `<span style="color:#ffd700; font-weight:bold; text-shadow: 0 0 5px #ff9800;">🏆 [WORLD] ${targetPlayer.name || targetPlayer.id} has conquered Floor ${killedFloorNum} and earned the title &lt;${newTitle}&gt;!</span>`);
                                    }
                                }
                            }

                            if (targetSid) {
                                if (dropAccepted) {
                                    io.to(targetSid).emit('lootDropped', drop); 

                                   // 🌟 BROADCAST GODLY, LEGENDARY & DIVINE ITEMS/GEMS TO WORLD
                                   if (drop.rarity === 'Legendary' || drop.rarity === 'Godly' || drop.rarity === 'Divine') {
                                        io.emit('rareLootBroadcast', {
                                            playerName: targetPlayer.name || targetPlayer.id,
                                            itemName: drop.name,
                                            rarity: drop.rarity,
                                            level: drop.level,
                                            color: drop.color
                                        });
                                    }
                                } else if (drop) {
                                    io.to(targetSid).emit('systemMessage', `Filtered loot ignored: ${drop.name} [${drop.rarity}]`);
                                }
                            }
                        }

                        if (targetSid) {
                            io.to(targetSid).emit('receiveExp', { amount: expAmount, gold: goldAmount, source: m.name });
                            io.to(targetSid).emit('syncInventory', targetPlayer.inventory);
                        }
                        
                        // 🛡️ CRITICAL FIX: Ensure Title actually saves to the Database!
                        supabase.from('Exonians').update({
                            level: targetPlayer.level,
                            exp: targetPlayer.exp,
                            max_exp: targetPlayer.maxExp,
                            gold: targetPlayer.gold,
                            base_stats: targetPlayer.baseStats,
                            current_hp: targetPlayer.currentHp,
                            inventory: targetPlayer.inventory,
                            title: targetPlayer.title 
                        }).eq('character_name', targetPlayer.id).then(()=>{});
                    };

                    if (pid && parties[pid]) {
                        for (const memberId of parties[pid].members) {
                            const mp = getPlayerById(memberId);
                            const msid = findSocketIdByPlayerId(memberId);
                            processRewards(mp, msid);
                            if (mp && msid) processMissionKill(mp, m.originalKey || m.monsterKey, msid);
                        }
                    } else {
                        processRewards(p, socket.id);
                        processMissionKill(p, m.originalKey || m.monsterKey, socket.id);
                    }

                    // ⚔️ TAVERN WIN CONDITION & LOOT (Strict Map Check)
                    if (p.mapId === 'trainingtavern' && m.id === p.tavernTargetId) {
                        const timeTaken = Date.now() - p.tavernStartTime;
                        
                        // 🛑 1. Instantly stop the timer directly on the killer's client
                        socket.emit('tavernTimerStop');
                        socket.emit('systemMessage', `🏁 Tavern Cleared in ${(timeTaken/1000).toFixed(2)}s!`);
                        
                        // 🏆 2. Database Record Engine (Strict Personal Best Hierarchy)
                        (async () => {
                            try {
                                // Fetch the single master record for this player
                                const { data: existingRecord } = await supabase
                                    .from('Tavern_Leaderboard')
                                    .select('*')
                                    .eq('character_name', p.id)
                                    .single();

                                let isNewBest = false;
                                const weight = { 'floor_boss': 3, 'mini_boss': 2, 'common_mobs': 1 };

                                if (!existingRecord) {
                                    // No record exists at all
                                    isNewBest = true;
                                } else {
                                    // Weight check 1: Boss Type
                                    let oldW = weight[existingRecord.mob_type] || 0;
                                    let newW = weight[m.category] || 0;
                                    
                                    if (newW > oldW) {
                                        isNewBest = true; // Beat a harder tier boss
                                    } else if (newW === oldW) {
                                        // Weight check 2: Boss Level
                                        if (m.level > existingRecord.mob_level) {
                                            isNewBest = true; // Beat a higher level of the same boss
                                        } else if (m.level === existingRecord.mob_level) {
                                            // Weight check 3: Timer
                                            if (timeTaken < existingRecord.time_taken) {
                                                isNewBest = true; // Beat the time on the exact same boss & level
                                            }
                                        }
                                    }
                                }

                                if (isNewBest) {
                                    const pClass = p.baseStats?.playerClass || 'Novice';
                                    
                                    if (existingRecord) {
                                        // Update the single row they own
                                        await supabase.from('Tavern_Leaderboard')
                                            .update({ 
                                                mob_type: m.category, mob_level: m.level, time_taken: timeTaken, achieved_at: new Date(),
                                                player_level: p.level, player_class: pClass
                                            })
                                            .eq('id', existingRecord.id);
                                    } else {
                                        // Create their one and only row
                                        await supabase.from('Tavern_Leaderboard').insert([{ 
                                            character_name: p.id, mob_type: m.category, mob_level: m.level, time_taken: timeTaken,
                                            player_level: p.level, player_class: pClass
                                        }]);
                                    }
                                }

                                socket.emit('tavernVictory', { time: timeTaken, isNewBest: isNewBest });
                                
                                // 🌟 Check if they broke into the Top 3 and broadcast it instantly to the server!
                                if (isNewBest) updateAndBroadcastTopTavern();
                            } catch (e) { console.error("[TAVERN RECORD ERROR]", e.message); }
                        })();

                        // 🎁 3. Tavern Accessory Drop
                        if (Math.random() < 0.5) {
                            let rarityRoll = Math.random(); 
                            let r = "Basic";
                            if (m.category === "floor_boss") { r = rarityRoll < 0.05 ? "Godly" : (rarityRoll < 0.25 ? "Legendary" : "Unique"); } 
                            else if (m.category === "mini_boss") { r = rarityRoll < 0.10 ? "Unique" : (rarityRoll < 0.40 ? "Rare" : "Basic"); } 
                            else { r = rarityRoll < 0.20 ? "Rare" : "Basic"; }
                            
                            let accDrop = generateTavernLoot(m.level, r);
                            const inv = Array.isArray(p.inventory) ? p.inventory : new Array(20).fill(null);
                            const emp = inv.findIndex(i => i === null);
                            if (emp !== -1) { 
                                inv[emp] = accDrop; 
                                p.inventory = inv; 
                                socket.emit('syncInventory', p.inventory); 
                                socket.emit('lootDropped', accDrop); 
                                
                                // 🌟 NEW: BROADCAST TAVERN GODLY/LEGENDARY/DIVINE LOOT
                              if (r === 'Legendary' || r === 'Godly' || r === 'Divine') {
                                    io.emit('rareLootBroadcast', {
                                        playerName: p.name || p.id,
                                        itemName: accDrop.name,
                                        rarity: accDrop.rarity,
                                        level: accDrop.level,
                                        color: accDrop.color
                                    });
                                }

                                supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id).then(()=>{});
                            }
                        }

                        // 🥾 4. Auto-kick back to town
                        setTimeout(() => { 
                            const checkP = onlinePlayers[socket.id];
                            if (checkP && checkP.instanceId === p.instanceId) {
                                checkP.mapId = 'town';
                                checkP.x = 960; checkP.y = 1000;
                                checkP.instanceId = getInstanceId(p.id, 'town');
                                socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 }); 
                            }
                        }, 5000);
                        
                        return; 
                    }

                    // ==========================================
                    // NORMAL OPEN WORLD BOSS SAVES & RESPAWNS
                    // ==========================================

                    // 🛡️ HARD-SAVE TO SUPABASE
                    if (m.category === "floor_boss" && !String(p.mapId).startsWith('dungeon') && p.mapId !== 'trainingtavern' && p.mapId !== 'hauntedhouse') {
                        const floorId = p.mapId;
                        const deathTime = Date.now();

                        // We use await to ensure it hits the DB before the code continues
                        supabase.from('boss_timers').upsert({ 
                            boss_id: floorId, 
                            last_death_time: deathTime 
                        }, { onConflict: 'boss_id' }).then(({error}) => {
                            if (error) console.error("CRITICAL: Boss timer failed", error.message);
                        });

                        m.respawnDelayMs = -1;
                        io.emit('systemMessage', `🏆 [WORLD] ${floorId.toUpperCase()} Boss Defeated!`);
                        
                        // 🌟 AUTOMATIC CLEANUP & SPAWN SCHEDULE 🌟
                        const fullCooldown = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds
                        
                        setTimeout(async () => {
                            // Automatically delete from Supabase exactly 24h later
                            await supabase.from('boss_timers').delete().eq('boss_id', floorId);
                            
                            // If players are waiting in the room, spawn it instantly!
                            if (worlds[p.instanceId]) {
                                const cfg = {
                                    spawnArea: { minX: m.homeX, maxX: m.homeX, minY: m.homeY, maxY: m.homeY },
                                    level: m.level
                                };
                                const nm = spawnMonster(p.instanceId, m.id, m.originalKey || m.monsterKey, cfg);
                                worlds[p.instanceId].monsters[m.id] = nm;
                                io.to(p.instanceId).emit('monsterSpawned', serializeMonster(nm));
                                io.emit('systemMessage', `⚠️ The ${floorId.toUpperCase()} Boss has respawned!`);
                            }
                        }, fullCooldown);
                    }

                    // Normal Respawn Logic (🛡️ THE FIX: Strictly block Dungeons, Tavern, and Haunted House from respawning!)
                    if (m.respawnDelayMs !== -1 && !String(p.mapId).startsWith('dungeon') && p.mapId !== 'trainingtavern' && p.mapId !== 'hauntedhouse') {
                        setTimeout(() => {
                            const cfg = {
                                spawnArea: { minX: m.homeX, maxX: m.homeX, minY: m.homeY, maxY: m.homeY },
                                level: m.level
                            };
                            const nm = spawnMonster(p.instanceId, m.id, m.originalKey || m.monsterKey, cfg);
                            world.monsters[m.id] = nm;
                            io.to(p.instanceId).emit('monsterSpawned', serializeMonster(nm));
                        }, m.respawnDelayMs || 10000);
                    }
                }
                    });
            }, hc * 150); // 150ms delay on the second hit
        }
    });

   socket.on('inspectRequest', (data) => {
        const targetId = data.targetId;
        const target = getPlayerById(targetId);
        if (target) {
            socket.emit('inspectData', { 
                id: target.id, 
                name: target.name, 
                level: target.level || 1, 
                currentHp: target.currentHp || 0, 
                maxHp: target.maxHp || 100, 
                equips: target.equips || { weapon: null, armor: null, leggings: null, necklace: null, ring: null, earrings: null } 
            });
        }
    });

    socket.on('tradeRequest', (data) => {
        const me = onlinePlayers[socket.id]; if (!me || !data.targetId) return;
        const targetSid = findSocketIdByPlayerId(data.targetId);
        if (!targetSid) return socket.emit('partyError', 'Target is not online.');
        io.to(targetSid).emit('tradeInviteReceived', { fromId: me.id });
    });

 socket.on('tradeInviteResponse', (data) => {
    const me = onlinePlayers[socket.id];
    if (!me || !data.fromId) return;

    const fromSid = findSocketIdByPlayerId(data.fromId);
    const targetPlayer = getPlayerById(data.fromId);
    if (!fromSid || !targetPlayer) return;

    if (data.accept) {
        me.tradeTarget = targetPlayer.id;
        targetPlayer.tradeTarget = me.id;

        // Reset trade session state
        me.currentTradeOffer = { gold: 0, items: [] };
        targetPlayer.currentTradeOffer = { gold: 0, items: [] };
        me.tradeConfirmed = false;
        targetPlayer.tradeConfirmed = false;

        socket.emit('tradeStarted', { targetId: data.fromId });
        io.to(fromSid).emit('tradeStarted', { targetId: me.id });

        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(fromSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
    } else {
        io.to(fromSid).emit('partyError', `${me.id} declined your trade request.`);
    }
});

  socket.on('tradeSync', (data) => {
    const me = onlinePlayers[socket.id];
    if (!me || !me.tradeTarget) return;

    const them = getPlayerById(me.tradeTarget);
    const targetSid = findSocketIdByPlayerId(me.tradeTarget);
    if (!them || !targetSid) return;

    // Save THIS player's latest offer on the server (🛡️ Stripping out any injected auras/pets/bound gear)
    me.currentTradeOffer = {
        gold: Math.max(0, parseInt(data.gold) || 0),
        items: Array.isArray(data.items) ? data.items.filter(Boolean).filter(i => {
            if (i.type === 'aura') return false;
            // 🛡️ THE FIX: Server strips bound items out of the trade array instantly
            if ((i.rarity === 'Godly' || i.rarity === 'Divine') && i.enhanceLevel > 0) return false;
            return true;
        }) : []
    };

    // Any change to offer resets both confirmations
    me.tradeConfirmed = false;
    them.tradeConfirmed = false;

    io.to(targetSid).emit('tradeSyncReceived', {
        gold: me.currentTradeOffer.gold,
        items: me.currentTradeOffer.items
    });

    socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
    io.to(targetSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
});

socket.on('tradeCancel', () => {
    const me = onlinePlayers[socket.id];
    if (!me || !me.tradeTarget) return;

    const targetSid = findSocketIdByPlayerId(me.tradeTarget);
    const targetPlayer = getPlayerById(me.tradeTarget);

    me.tradeTarget = null;
    me.currentTradeOffer = null;
    me.tradeConfirmed = false;

    if (targetPlayer) {
        targetPlayer.tradeTarget = null;
        targetPlayer.currentTradeOffer = null;
        targetPlayer.tradeConfirmed = false;
    }

    if (targetSid) io.to(targetSid).emit('tradeCancelled');
});
socket.on('requestConfirmTrade', () => {
    const me = onlinePlayers[socket.id];
    if (!me || !me.tradeTarget) return;

    const them = getPlayerById(me.tradeTarget);
    const themSid = findSocketIdByPlayerId(me.tradeTarget);
    if (!them || !themSid) return;

    if (!me.currentTradeOffer) me.currentTradeOffer = { gold: 0, items: [] };
    if (!them.currentTradeOffer) them.currentTradeOffer = { gold: 0, items: [] };

    // Mark ONLY this player as confirmed first
    me.tradeConfirmed = true;

    // Tell both clients current confirm state
    socket.emit('tradeConfirmStatus', { meConfirmed: true, otherConfirmed: !!them.tradeConfirmed });
    io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: !!them.tradeConfirmed, otherConfirmed: true });

    // Stop here until BOTH players confirm
    if (!them.tradeConfirmed) {
        socket.emit('systemMessage', 'Trade confirmed. Waiting for the other player...');
        io.to(themSid).emit('systemMessage', `${me.id} confirmed the trade.`);
        return;
    }

    const myOffer = me.currentTradeOffer || { gold: 0, items: [] };
    const theirOffer = them.currentTradeOffer || { gold: 0, items: [] };

    const myGoldOffer = Math.max(0, parseInt(myOffer.gold) || 0);
    const theirGoldOffer = Math.max(0, parseInt(theirOffer.gold) || 0);

    // Safety: both players must actually still have the gold they offered
    if ((me.gold || 0) < myGoldOffer) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: you no longer have enough gold.');
        io.to(themSid).emit('systemMessage', 'Trade failed: other player no longer has enough gold.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

    if ((them.gold || 0) < theirGoldOffer) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: other player no longer has enough gold.');
        io.to(themSid).emit('systemMessage', 'Trade failed: you no longer have enough gold.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

  // Verify exact offered item IDs still exist
    let myValidItems = [];
    let theirValidItems = [];
    let myClaimedIndices = new Set(); // 🛡️ ANTI-DUPE: Track used slots
    let theirClaimedIndices = new Set(); // 🛡️ ANTI-DUPE: Track used slots

    if (Array.isArray(myOffer.items)) {
        for (const offeredItem of myOffer.items) {
            if (!offeredItem || !offeredItem.id) continue;
            
            // 🛡️ ANTI-DUPE: Ensure we don't count the exact same item slot twice!
            const realIdx = me.inventory.findIndex((invItem, idx) => invItem && invItem.id === offeredItem.id && !myClaimedIndices.has(idx));
            
            if (realIdx === -1) {
                me.tradeConfirmed = false;
                them.tradeConfirmed = false;
                socket.emit('systemMessage', 'Trade failed: one of your offered items is missing or duplicated.');
                io.to(themSid).emit('systemMessage', 'Trade failed: other player changed or lost an offered item.');
                socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                return;
            }
            myClaimedIndices.add(realIdx);
            myValidItems.push({ index: realIdx, item: me.inventory[realIdx] });
        }
    }

    if (Array.isArray(theirOffer.items)) {
        for (const offeredItem of theirOffer.items) {
            if (!offeredItem || !offeredItem.id) continue;
            
            // 🛡️ ANTI-DUPE: Ensure we don't count the exact same item slot twice!
            const realIdx = them.inventory.findIndex((invItem, idx) => invItem && invItem.id === offeredItem.id && !theirClaimedIndices.has(idx));
            
            if (realIdx === -1) {
                me.tradeConfirmed = false;
                them.tradeConfirmed = false;
                socket.emit('systemMessage', 'Trade failed: other player changed or lost an offered item.');
                io.to(themSid).emit('systemMessage', 'Trade failed: one of your offered items is missing or duplicated.');
                socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
                return;
            }
            theirClaimedIndices.add(realIdx);
            theirValidItems.push({ index: realIdx, item: them.inventory[realIdx] });
        }
    }

    // Inventory capacity check before doing anything
    const myFreeSlots = me.inventory.filter(i => i === null).length;
    const theirFreeSlots = them.inventory.filter(i => i === null).length;

    const myItemsGiven = myValidItems.length;
    const theirItemsGiven = theirValidItems.length;

    const myNetIncoming = theirItemsGiven - myItemsGiven;
    const theirNetIncoming = myItemsGiven - theirItemsGiven;

    if (myFreeSlots < Math.max(0, myNetIncoming)) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: not enough inventory space on your side.');
        io.to(themSid).emit('systemMessage', 'Trade failed: other player does not have enough inventory space.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

    if (theirFreeSlots < Math.max(0, theirNetIncoming)) {
        me.tradeConfirmed = false;
        them.tradeConfirmed = false;
        socket.emit('systemMessage', 'Trade failed: other player does not have enough inventory space.');
        io.to(themSid).emit('systemMessage', 'Trade failed: not enough inventory space on your side.');
        socket.emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        io.to(themSid).emit('tradeConfirmStatus', { meConfirmed: false, otherConfirmed: false });
        return;
    }

    // Remove offered gold
    me.gold -= myGoldOffer;
    them.gold -= theirGoldOffer;

    // Add received gold
    me.gold += theirGoldOffer;
    them.gold += myGoldOffer;

    // Remove offered items by exact ID/index
    const removedFromMe = [];
    const removedFromThem = [];

    myValidItems.forEach(entry => {
        removedFromMe.push(entry.item);
        me.inventory[entry.index] = null;
    });

    theirValidItems.forEach(entry => {
        removedFromThem.push(entry.item);
        them.inventory[entry.index] = null;
    });

    // Give received items
    removedFromThem.forEach(item => {
        const emptyIdx = me.inventory.findIndex(i => i === null);
        if (emptyIdx !== -1) me.inventory[emptyIdx] = item;
    });

    removedFromMe.forEach(item => {
        const emptyIdx = them.inventory.findIndex(i => i === null);
        if (emptyIdx !== -1) them.inventory[emptyIdx] = item;
    });

    // Clear trade state
    me.currentTradeOffer = null;
    them.currentTradeOffer = null;
    me.tradeConfirmed = false;
    them.tradeConfirmed = false;
    me.tradeTarget = null;
    them.tradeTarget = null;

    // Save to Supabase
    supabase.from('Exonians').update({ gold: me.gold, inventory: me.inventory }).eq('character_name', me.id).then(()=>{});
    supabase.from('Exonians').update({ gold: them.gold, inventory: them.inventory }).eq('character_name', them.id).then(()=>{});

    socket.emit('tradeDone', { newGold: me.gold, newInventory: me.inventory });
    io.to(themSid).emit('tradeDone', { newGold: them.gold, newInventory: them.inventory });

    socket.emit('systemMessage', 'Trade completed successfully.');
    io.to(themSid).emit('systemMessage', 'Trade completed successfully.');
});

    socket.on('playerVitals', (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    // Do NOT trust client HP / maxHp.
    // Only allow level sync if needed for UI.
    p.level = clamp(data.level ?? p.level, 1, 80);

    const pid = playerParty[p.id];
    if (pid && parties[pid]) {
        for (const memberId of parties[pid].members) {
            if (memberId !== p.id) {
                const sid = findSocketIdByPlayerId(memberId);
                if (sid) {
                    io.to(sid).emit('partyMemberVitals', {
                        id: p.id,
                        currentHp: p.currentHp,
                        maxHp: p.maxHp,
                        level: p.level
                    });
                }
            }
        }
    }
});
    // 🛡️ SERVER-SIDE UNEQUIP (CRITICAL FOR SYNC)
    socket.on('requestUnequip', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !data.slot) return;

        const slot = data.slot;
       if (!['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings'].includes(slot)) return;

        const item = p.equips[slot];
        if (!item) return;

        const inv = Array.isArray(p.inventory) ? p.inventory : new Array(20).fill(null);
        const emptySlot = inv.findIndex(i => i === null);

        if (emptySlot === -1) {
            return socket.emit('systemMessage', 'Inventory full! Cannot unequip.');
        }

        // Swap it in server memory
        inv[emptySlot] = item;
        p.equips[slot] = null;
        p.inventory = inv;

        // Recalculate Stats instantly
        const trueMaxHp = getServerTotalStat(p, 'hp') || 100;
        p.maxHp = trueMaxHp;
        p.currentHp = Math.min(p.currentHp || trueMaxHp, trueMaxHp);

        p.spriteData.weapon = p.equips?.weapon?.sprite || null;
        p.spriteData.aura = p.equips?.armor?.aura || null;
        p.spriteData.pet = p.equips?.leggings?.aura || null;

        // ⚡ INSTANT UI UPDATE (No waiting for database!)
        socket.emit('syncInventory', p.inventory);
        socket.emit('inventoryItemUsed', {
            inventory: p.inventory,
            equips: p.equips,
            currentHp: p.currentHp,
            itemName: `Unequipped ${item.name}`
        });

        // Instantly update avatar for everyone around you
        const moveData = { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData };
        socket.emit('remotePlayerMoved', moveData);
        socket.to(p.instanceId).emit('remotePlayerMoved', moveData);

        // Silent background save to DB
        supabase.from('Exonians').update({
            inventory: p.inventory,
            equips: p.equips,
            current_hp: p.currentHp
        }).eq('character_name', p.id).then(()=>{});
    });

   // 🛡️ INSTANT EQUIP FIX
    socket.on('useInventoryItem', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        // 🛡️ THE FIX: Server strictly blocks dead players from using items!
        if (p.isGhost) {
            return socket.emit('systemMessage', 'You cannot use items while dead.');
        }
        
        // ⚔️ TAVERN ANTI-CHEAT: Block potions and consumables on the server
        const invTest = p.inventory[data?.index];
        if (invTest && p.mapId === 'trainingtavern' && (invTest.type === 'potion' || invTest.type === 'consumable')) {
            return socket.emit('systemMessage', '❌ Items are strictly forbidden in the Training Tavern!');
        }

        p.inventory = sanitizeInventory(p.inventory);
        p.equips = sanitizeEquips(p.equips);
        p.baseStats = sanitizeBaseStats(p.baseStats);

        const inv = p.inventory;
        const index = typeof data?.index === 'number' ? data.index : -1;

        if (index < 0 || index >= inv.length || !inv[index]) {
            return socket.emit('systemMessage', 'Item not found.');
        }

        const item = sanitizeItem(inv[index]);
        if (!item) {
            inv[index] = null;
            p.inventory = inv;
            await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
            socket.emit('syncInventory', p.inventory);
            return;
        }

        // POTION
        if (item.type === 'potion') {
            const now = Date.now();
            if (!p.skillCooldowns) p.skillCooldowns = {};
            
            // 🛡️ SERVER-SIDE 5-SECOND COOLDOWN
            if (p.skillCooldowns['potion'] && now < p.skillCooldowns['potion']) {
                return socket.emit('systemMessage', 'Potion is on cooldown!');
            }
            p.skillCooldowns['potion'] = now + 5000;

           // 🌟 THE CORRUPTION FIX: Hardcode 100 so it ignores broken database items!
            const healAmount = 100;
            const trueMaxHp = getServerTotalStat(p, 'hp') || p.maxHp || 100;

            p.maxHp = trueMaxHp;
            p.currentHp = Math.min(trueMaxHp, (p.currentHp || 0) + healAmount);

            item.quantity = (item.quantity || 1) - 1;
            inv[index] = item.quantity > 0 ? item : null;
            p.inventory = inv;

            supabase.from('Exonians').update({
                inventory: p.inventory,
                current_hp: p.currentHp,
                equips: sanitizeEquips(p.equips),
                base_stats: sanitizeBaseStats(p.baseStats)
            }).eq('character_name', p.id).then(()=>{});

          // 🌟 THE FIX: Send 'playerVitals' so the health bar actually moves!
            socket.emit('playerVitals', {
                currentHp: p.currentHp,
                maxHp: trueMaxHp,
                level: p.level
            });

            socket.emit('inventoryItemUsed', {
                inventory: p.inventory,
                currentHp: p.currentHp,
                itemName: item.name,
                healAmount
            });

            // Also alert everyone in the maze that you healed (green numbers)
            io.to(p.instanceId).emit('playerHealed', { id: p.id, amount: healAmount, currentHp: p.currentHp });

            const pid = playerParty[p.id];
            if (pid) emitPartyUpdate(pid);
            return;
        }
        // 💎 PREMIUM: EXO GEMS CONSUMABLE
        if (item.type === 'consumable' && item.isGems) {
            if (!p.baseStats) p.baseStats = {};
            p.baseStats.exoGems = (p.baseStats.exoGems || 0) + item.quantity;
            let gemsGained = item.quantity;

            item.quantity = 0;
            inv[index] = null;
            p.inventory = inv;

            supabase.from('Exonians').update({ inventory: p.inventory, base_stats: p.baseStats }).eq('character_name', p.id).then(()=>{});

            socket.emit('syncInventory', p.inventory);
            socket.emit('gemPurchaseSuccess', { newGems: p.baseStats.exoGems });
            socket.emit('systemMessage', `💎 You cracked open the bundle and received ${gemsGained} Exo Gems!`);
            return;
        }

       // 👑 PATREON: ROYAL GOLD SACK
        if (item.type === 'consumable' && item.name === 'Royal Gold Sack') {
            p.gold = (p.gold || 0) + 1000000; // Add 1 Million Gold!

            item.quantity = (item.quantity || 1) - 1;
            inv[index] = item.quantity > 0 ? item : null;
            p.inventory = inv;

            supabase.from('Exonians').update({
                inventory: p.inventory,
                gold: p.gold
            }).eq('character_name', p.id).then(()=>{});

            // Reusing the purchaseSuccess event because it updates the UI gold counter perfectly!
            socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
            socket.emit('systemMessage', `💰 You opened the Royal Gold Sack and received 1,000,000 Gold!`);
            return;
        }

        // CLASS RESET BOOK
        if (item.type === 'consumable' && item.name === 'Class Reset Book') {
            if (!p.baseStats.playerClass) {
                return socket.emit('systemMessage', "You don't have a class to reset yet!");
            }
            p.baseStats.playerClass = null;

            item.quantity = (item.quantity || 1) - 1;
            inv[index] = item.quantity > 0 ? item : null;
            p.inventory = inv;

            supabase.from('Exonians').update({
                inventory: p.inventory,
                base_stats: sanitizeBaseStats(p.baseStats)
            }).eq('character_name', p.id).then(()=>{});

            socket.emit('inventoryItemUsed', {
                inventory: p.inventory,
                currentHp: p.currentHp,
                itemName: item.name,
                classReset: true
            });

            return;
        }

        // EQUIP
        if (['weapon', 'armor', 'leggings', 'necklace', 'ring', 'earrings'].includes(item.type)) {
            const slot = item.type;
            const oldEquip = p.equips[slot] ? sanitizeItem(p.equips[slot]) : null;

            p.equips[slot] = item;
            inv[index] = oldEquip;
            p.inventory = sanitizeInventory(inv);
            p.equips = sanitizeEquips(p.equips);

            const trueMaxHp = getServerTotalStat(p, 'hp') || 100;
            p.maxHp = trueMaxHp;
            p.currentHp = Math.min(p.currentHp || trueMaxHp, trueMaxHp);

            p.spriteData.weapon = p.equips?.weapon?.sprite || null;
            p.spriteData.aura = p.equips?.armor?.aura || null;
            p.spriteData.pet = p.equips?.leggings?.aura || null;

            // ⚡ THE FIX: Send the UI update to the client INSTANTLY!
            socket.emit('syncInventory', p.inventory);
            socket.emit('inventoryItemUsed', {
                inventory: p.inventory,
                equips: p.equips, 
                currentHp: p.currentHp,
                itemName: item.name
            });

            // Instantly update avatars for everyone around you
            socket.emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
            socket.to(p.instanceId).emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });

            // ⚡ THE FIX: Silent background save
            supabase.from('Exonians').update({
                inventory: p.inventory,
                equips: p.equips,
                current_hp: p.currentHp
            }).eq('character_name', p.id).then(()=>{});

            return;
        }

        socket.emit('systemMessage', 'That item cannot be used this way.');
    });
// // ==========================================
    // 💾 SUPABASE GUILD SAVER & LOADER
    // ==========================================
    async function saveGuildsToDB() {
        try {
            for (let gName in global.guilds) {
                let g = global.guilds[gName];
                let payload = { 
                    name: g.name, 
                    gold: g.gold, 
                    members: Array.from(g.members), 
                    roles: g.roles, 
                    applicants: g.applicants, 
                    hasBase: g.hasBase 
                };
                
                // 🛡️ THE FIX: Manually check if the guild exists to bypass strict Supabase Primary Key rules
                const { data: existingGuild } = await supabase.from('guilds').select('name').eq('name', gName).single();
                
                if (existingGuild) {
                    await supabase.from('guilds').update({ data: payload }).eq('name', gName);
                } else {
                    await supabase.from('guilds').insert([{ name: gName, data: payload }]);
                }
            }
        } catch (e) { console.error("[GUILD SAVE ERROR]", e.message); }
    }

    // 🔄 Automatically load all Guilds (and offline players) into RAM on server boot
    setTimeout(async () => {
        try {
            const { data } = await supabase.from('guilds').select('*');
            if (data) {
                data.forEach(row => {
                    let g = row.data;
                    global.guilds[g.name] = {
                        name: g.name,
                        gold: g.gold || 0,
                        members: new Set(g.members || []),
                        roles: g.roles || {},
                        applicants: g.applicants || [],
                        hasBase: g.hasBase || false
                    };
                });
                console.log(`[GUILDS] Successfully loaded ${data.length} guilds from database.`);
            }
        } catch(e) { console.error("[GUILD LOAD ERROR]", e.message); }
    }, 3000);

    // ==========================================
    // 🛡️ GUILD SYSTEM ENGINE (PRO VERSION)
    // ==========================================
    const hasGuildPerm = (role, action, targetRole = null) => {
        const roleLvl = { 'Master': 4, 'Vice Master': 3, 'Captain': 2, 'Member': 1 };
        if (role === 'Master') return true;
        if (role === 'Vice Master') {
            if (action === 'kick') return roleLvl[targetRole || 'Member'] < 3;
            return ['invite', 'manage_apps'].includes(action);
        }
        if (role === 'Captain') return action === 'invite';
        return false;
    };

    socket.on('requestGuildData', () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        
        if (p.guild_details && p.guild_details.name) {
            let gName = p.guild_details.name;
            if (!global.guilds[gName]) {
                global.guilds[gName] = { name: gName, gold: p.guild_details.guildGold || 0, members: new Set([p.id]), roles: {}, applicants: [], hasBase: false };
            }
            
            const guild = global.guilds[gName];
            guild.members.add(p.id);
            if (!guild.roles) guild.roles = {};
            if (!guild.roles[p.id]) guild.roles[p.id] = p.guild_details.role || 'Member';

            let memberList = Array.from(guild.members).map(mName => {
                const isOnline = Object.values(onlinePlayers).some(op => op.id === mName);
                return { name: mName, role: guild.roles[mName] || 'Member', online: isOnline };
            });

            socket.emit('guildDataResponse', { 
                hasGuild: true, details: p.guild_details, guildGold: guild.gold, members: memberList, 
                applicants: guild.applicants || [], hasBase: !!guild.hasBase, myRole: guild.roles[p.id]
            });
        } else {
            let openGuilds = Object.values(global.guilds).map(g => ({ name: g.name, members: g.members.size }));
            socket.emit('guildDataResponse', { hasGuild: false, openGuilds: openGuilds });
        }
    });

    socket.on('createGuild', async (guildName) => {
        const p = onlinePlayers[socket.id]; if (!p || !guildName) return;
        if (p.guild_details) return socket.emit('systemMessage', "❌ You are already in a guild!");
        if (p.gold < 10000000) return socket.emit('systemMessage', "❌ You need 10,000,000 Gold to create a guild.");
        if (global.guilds[guildName]) return socket.emit('systemMessage', "❌ A guild name already exists.");
        
        p.gold -= 10000000;
        p.guild_details = { name: guildName, role: 'Master', guildGold: 0 };
        global.guilds[guildName] = { name: guildName, gold: 0, members: new Set([p.id]), roles: { [p.id]: 'Master' }, applicants: [], hasBase: false };
        p.spriteData.guildName = guildName;

        await supabase.from('Exonians').update({ gold: p.gold, guild_details: p.guild_details }).eq('character_name', p.id);
        
        socket.emit('systemMessage', `🎉 Guild Established: ${guildName}!`);
        socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
        socket.emit('updateLocalGuildTag', guildName); 
        io.emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
        
        saveGuildsToDB(); 
        socket.emit('requestGuildUI_Refresh');
    });

    socket.on('joinGuild', async (guildName) => {
        const p = onlinePlayers[socket.id]; if (!p || !guildName) return;
        if (p.guild_details) return socket.emit('systemMessage', "❌ You are already in a guild!");
        
        const guild = global.guilds[guildName];
        if (!guild) return socket.emit('systemMessage', "❌ That guild does not exist.");
        if (guild.members.size >= 20) return socket.emit('systemMessage', "❌ Guild is full (20/20).");

        guild.members.add(p.id);
        if (!guild.roles) guild.roles = {};
        guild.roles[p.id] = 'Member';
        
        p.guild_details = { name: guildName, role: 'Member', guildGold: guild.gold };
        p.spriteData.guildName = guildName;

        await supabase.from('Exonians').update({ guild_details: p.guild_details }).eq('character_name', p.id);
        
        socket.emit('systemMessage', `🎉 You joined ${guildName}!`);
        socket.emit('updateLocalGuildTag', guildName); 
        io.emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
        
        saveGuildsToDB(); 
        io.emit('requestGuildUI_Refresh');
    });

    socket.on('guildApply', (guildName) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.guild_details || !global.guilds[guildName]) return;
        
        const guild = global.guilds[guildName];
        if (!guild.applicants) guild.applicants = [];
        if (guild.applicants.includes(p.id)) return socket.emit('systemMessage', "Already applied.");
        
        guild.applicants.push(p.id);
        socket.emit('systemMessage', `📩 Application sent to ${guildName}!`);
        saveGuildsToDB(); 
        
        guild.members.forEach(memberId => {
            const targetSid = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === memberId);
            if (targetSid) io.to(targetSid).emit('requestGuildUI_Refresh');
        });
    });

    socket.on('guildInvitePlayer', (targetName) => {
        const p = onlinePlayers[socket.id]; if (!p || !p.guild_details) return;
        const guild = global.guilds[p.guild_details.name];
        
        if (!hasGuildPerm(guild.roles[p.id], 'invite')) return socket.emit('systemMessage', "❌ You do not have permission to invite players.");

        const targetSocketId = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === targetName);
        if (targetSocketId) {
            io.to(targetSocketId).emit('guildInviteReceived', { from: p.id, guildName: p.guild_details.name });
            socket.emit('systemMessage', `📩 Invite sent to ${targetName}.`);
        } else {
            socket.emit('systemMessage', "❌ Player is not online.");
        }
    });

    socket.on('guildHandleApplicant', async ({ applicantName, accept }) => {
        const p = onlinePlayers[socket.id]; if (!p || !p.guild_details) return;
        const guild = global.guilds[p.guild_details.name];
        if (!hasGuildPerm(guild.roles[p.id], 'manage_apps')) return;

        guild.applicants = (guild.applicants || []).filter(a => a !== applicantName);

        if (accept) {
            if (guild.members.size >= 20) return socket.emit('systemMessage', "❌ Guild is full (20/20).");
            guild.members.add(applicantName);
            if (!guild.roles) guild.roles = {};
            guild.roles[applicantName] = 'Member';
            
            const targetSocketId = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === applicantName);
            if (targetSocketId) {
                let tp = onlinePlayers[targetSocketId];
                tp.guild_details = { name: guild.name, role: 'Member', guildGold: guild.gold };
                tp.spriteData.guildName = guild.name;
                await supabase.from('Exonians').update({ guild_details: tp.guild_details }).eq('character_name', applicantName);
                
                io.to(targetSocketId).emit('systemMessage', `🎉 You were accepted into ${guild.name}!`);
                io.to(targetSocketId).emit('updateLocalGuildTag', guild.name); 
                io.emit('remotePlayerMoved', { id: tp.id, x: tp.x, y: tp.y, state: 'idle', facingRight: false, weaponSprite: tp.spriteData.weapon, spriteData: tp.spriteData });
            } else {
                await supabase.from('Exonians').update({ guild_details: { name: guild.name, role: 'Member', guildGold: guild.gold } }).eq('character_name', applicantName);
            }
            socket.emit('systemMessage', `✅ ${applicantName} joined the guild.`);
        }
        
        saveGuildsToDB(); 
        guild.members.forEach(memberId => {
            const targetSid = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === memberId);
            if (targetSid) io.to(targetSid).emit('requestGuildUI_Refresh');
        });
    });

    socket.on('guildUpdateRole', ({ targetName, newRole }) => {
        const p = onlinePlayers[socket.id]; if (!p || !p.guild_details) return;
        const guild = global.guilds[p.guild_details.name];
        
        if (guild.roles[p.id] !== 'Master') return;
        if (targetName === p.id) return socket.emit('systemMessage', "❌ Cannot change your own role here.");

        guild.roles[targetName] = newRole;
        saveGuildsToDB(); 
        
        guild.members.forEach(memberId => {
            const targetSid = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === memberId);
            if (targetSid) io.to(targetSid).emit('requestGuildUI_Refresh');
        });
    });

    socket.on('guildKick', async (targetName) => {
        const p = onlinePlayers[socket.id]; if (!p || !p.guild_details) return;
        const guild = global.guilds[p.guild_details.name];
        
        if (!hasGuildPerm(guild.roles[p.id], 'kick', guild.roles[targetName] || 'Member')) {
            return socket.emit('systemMessage', "❌ No permission to kick this player.");
        }

        guild.members.delete(targetName);
        delete guild.roles[targetName];

        await supabase.from('Exonians').update({ guild_details: null }).eq('character_name', targetName);
        
        const targetSid = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === targetName);
        if (targetSid) {
            let tp = onlinePlayers[targetSid];
            tp.guild_details = null;
            tp.spriteData.guildName = null;
            io.to(targetSid).emit('systemMessage', `⚠️ You were kicked from the guild.`);
            io.to(targetSid).emit('updateLocalGuildTag', null); 
            io.to(targetSid).emit('requestGuildUI_Refresh');
            io.emit('remotePlayerMoved', { id: tp.id, x: tp.x, y: tp.y, state: 'idle', facingRight: false, weaponSprite: tp.spriteData.weapon, spriteData: tp.spriteData });
        }
        
        socket.emit('systemMessage', `👢 Kicked ${targetName} from the guild.`);
        saveGuildsToDB(); 
        
        guild.members.forEach(memberId => {
            const targetSid2 = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === memberId);
            if (targetSid2) io.to(targetSid2).emit('requestGuildUI_Refresh');
        });
    });

    socket.on('guildLeave', async () => {
        const p = onlinePlayers[socket.id]; if (!p || !p.guild_details) return;
        const guild = global.guilds[p.guild_details.name];
        
        if (guild.roles[p.id] === 'Master') return socket.emit('systemMessage', "❌ Masters cannot leave. Demote yourself to another role or transfer leadership first!");

        guild.members.delete(p.id);
        delete guild.roles[p.id];
        p.guild_details = null;
        p.spriteData.guildName = null;

        await supabase.from('Exonians').update({ guild_details: null }).eq('character_name', p.id);
        
        socket.emit('systemMessage', "🚪 You have left the guild.");
        socket.emit('updateLocalGuildTag', null); 
        socket.emit('requestGuildUI_Refresh');
        io.emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
        
        saveGuildsToDB(); 
        
        guild.members.forEach(memberId => {
            const targetSid = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === memberId);
            if (targetSid) io.to(targetSid).emit('requestGuildUI_Refresh');
        });
    });

    socket.on('requestBuyGuildBase', () => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p || !p.guild_details) return;

            const guild = global.guilds[p.guild_details.name];
            if (!guild) return;

            if (guild.roles[p.id] !== 'Master') {
                return socket.emit('systemMessage', "❌ Only the Guild Master can purchase the Base.");
            }

            if (guild.hasBase) {
                return socket.emit('systemMessage', "❌ Your guild already owns a base.");
            }

            if ((guild.gold || 0) < 1000000) {
                return socket.emit('systemMessage', `❌ Insufficient Funds! Guild needs ${ (1000000 - guild.gold).toLocaleString() } G more.`);
            }

            guild.gold -= 1000000;
            guild.hasBase = true;

            saveGuildsToDB(); 

            socket.emit('systemMessage', "🎉 SUCCESS! Your Guild Base is now open!");

            guild.members.forEach(memberId => {
                let memberSocketId = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === memberId);
                if (memberSocketId) io.to(memberSocketId).emit('requestGuildUI_Refresh');
            });
        } catch (err) {
            socket.emit('systemMessage', "❌ A server error occurred during purchase.");
        }
    });

    socket.on('donateGuildGold', async (amount) => {
        const p = onlinePlayers[socket.id]; if (!p || !p.guild_details) return;
        let donateAmt = parseInt(amount);
        if (isNaN(donateAmt) || donateAmt <= 0) return;
        if (p.gold < donateAmt) return socket.emit('systemMessage', "❌ Not enough gold to donate.");
        
        let gName = p.guild_details.name;
        if (!global.guilds[gName]) return;

        p.gold -= donateAmt;
        global.guilds[gName].gold += donateAmt;
        p.guild_details.guildGold = global.guilds[gName].gold;
        
        await supabase.from('Exonians').update({ gold: p.gold, guild_details: p.guild_details }).eq('character_name', p.id);
        socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
        socket.emit('systemMessage', `💰 You donated ${donateAmt.toLocaleString()} Gold to the guild!`);
        
        saveGuildsToDB();
        global.guilds[gName].members.forEach(memberId => {
            const targetSid = Object.keys(onlinePlayers).find(sid => onlinePlayers[sid].id === memberId);
            if (targetSid) io.to(targetSid).emit('requestGuildUI_Refresh');
        });
    });
    socket.on('chatMessage', (data) => { 
        const p = onlinePlayers[socket.id]; 
        if (!p || !data.text) return; 
        
        const now = Date.now();
        if (p.lastChatTime && now - p.lastChatTime < 500) return; 
        p.lastChatTime = now;

        let safeText = String(data.text).slice(0, 120); 
        
        let displayName = p.id;
        if (isAdmin(p.id)) {
            displayName = `<span style="color:#ff4444; font-weight:bold;">[GM]</span> ${p.id}`;
        }
        
     // 🏰 GUILD BASE GREEN CHAT ROUTING
        // Only players physically in the guild base can SEND these messages
        if (p.mapId === 'guildbase' && p.guild_details) {
            const gName = p.guild_details.name;
            const guildMsg = `<span style="color:#4CAF50; font-weight:bold;">[Guild] ${displayName}: ${safeText}</span>`;
            
            // 🛡️ THE FIX: Broadcast to ALL online guild members, no matter what map they are on!
            if (global.guilds[gName] && global.guilds[gName].members) {
                for (const memberId of global.guilds[gName].members) {
                    const memberSid = findSocketIdByPlayerId(memberId);
                    if (memberSid) {
                        io.to(memberSid).emit('systemMessage', guildMsg);
                    }
                }
            }
            return; // Stop here so it doesn't do normal Local/Party chat!
        }
        
        // 1. Emit the local text bubble to everyone in the room
        io.to(p.instanceId).emit('chatMessage', { id: displayName, text: safeText }); 

        // 2. Automatically log it in the persistent Party Chat box if they are in a party
        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            for (const memberId of parties[pid].members) {
                const sid = findSocketIdByPlayerId(memberId);
                if (sid) {
                    io.to(sid).emit('partyChatMessage', { from: displayName, text: safeText });
                }
            }
        }
    });
    socket.on('partyInvite', ({ targetId }) => { 
        const me = onlinePlayers[socket.id]; 
        if (!me || !targetId) return; 
        
        // 🛡️ NEW: Party Leader Only Check
        const pid = playerParty[me.id];
        if (pid && parties[pid] && parties[pid].leaderId !== me.id) {
            return socket.emit('partyError', '❌ Only the Party Leader can invite new members.');
        }

        const targetSid = findSocketIdByPlayerId(targetId); 
        if (!targetSid) return socket.emit('partyError', 'Target is not online.'); 
        io.to(targetSid).emit('partyInviteReceived', { fromId: me.id }); 
    });
    
    socket.on('partyInviteResponse', ({ fromId, accept }) => {
        const me = onlinePlayers[socket.id]; 
        if (!me || !fromId) return; 
        
        const fromSid = findSocketIdByPlayerId(fromId); 
        const inviter = getPlayerById(fromId); 
        if (!inviter || !fromSid) return;
        
        if (!accept) { 
            io.to(fromSid).emit('partyError', `${me.id} declined your party invite.`); 
            return; 
        }

        let pid = playerParty[fromId]; 

        // 🛡️ THE FIX: Hard cap the party size at exactly 4 players!
        if (pid && parties[pid] && parties[pid].members.size >= 4) {
            socket.emit('systemMessage', '❌ That party is already full (Max 4 players).');
            io.to(fromSid).emit('systemMessage', `❌ ${me.id} tried to join, but your party is full!`);
            return; // Stops them from being added
        }

        // 🛡️ ANTI-MULTI-BOXING: Block teaming up with same IP, Email, or Device
        let isSpamAlt = false;
        let membersToCheck = pid && parties[pid] ? Array.from(parties[pid].members) : [fromId];

        if (!isAdmin(me.id)) {
            for (const mId of membersToCheck) {
                if (isAdmin(mId)) continue; // Let admins do whatever they want
                
                const mSid = findSocketIdByPlayerId(mId);
                if (mSid) {
                    const mSocket = io.sockets.sockets.get(mSid);
                    if (mSocket) {
                        if (
                            (mSocket.clientIp && mSocket.clientIp === socket.clientIp) ||
                            (mSocket.email && mSocket.email === socket.email) ||
                            (mSocket.deviceId && mSocket.deviceId === socket.deviceId && socket.deviceId !== 'unknown_device')
                        ) {
                            isSpamAlt = true;
                            break;
                        }
                    }
                }
            }
        }

        if (isSpamAlt) {
            socket.emit('systemMessage', '❌ You cannot party with accounts on the same Network, Email, or Device.');
            io.to(fromSid).emit('systemMessage', `❌ ${me.id} cannot join due to multi-boxing restrictions.`);
            return;
        }

        if (!pid) {
            pid = `party_${Date.now()}_${Math.floor(Math.random() * 9999)}`; 
            parties[pid] = { id: pid, leaderId: fromId, members: new Set([fromId]) }; 
            playerParty[fromId] = pid; 
        }

        // Remove them from any old party they were in before joining the new one
        if (playerParty[me.id] && playerParty[me.id] !== pid) { 
            removeFromParty(me.id); 
        }

        // Add to the new party
        parties[pid].members.add(me.id); 
        playerParty[me.id] = pid; 
        emitPartyUpdate(pid);
    });
   // ✅ GLOBAL ADMIN BROADCAST
    socket.on('adminBroadcast', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !isAdmin(p.id)) return; // 🛡️ SECURITY: Only the real Kei can do this!

        // Broadcasts an unmissable yellow system message to EVERY single player online
        io.emit('systemMessage', `[SERVER ANNOUNCEMENT] ${data.text}`);
    });
   socket.on('leaveParty', () => {
        const p = onlinePlayers[socket.id];
        if (p && playerParty[p.id]) {
            removeFromParty(p.id);
            
            // 🛡️ THE FIX: If they leave party while dead, forcefully revive them for Town
            if (p.isGhost) {
                p.isGhost = false;
                p.currentHp = getServerTotalStat(p, 'hp') || 100;
                socket.emit('playerRevived', { id: p.id, currentHp: p.currentHp });
            }
            
            if (p.mapId !== 'town') { socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 }); }
        }
    });

  socket.on('forceTeleport', (tp) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        
        // ⚔️ TAVERN ANTI-CHEAT: Block Escaping
        if (p.mapId === 'trainingtavern' && !isAdmin(p.id)) {
            socket.emit('systemMessage', "❌ You cannot use Unstuck to escape the Training Tavern.");
            return; 
        }
        
       if (playerParty[p.id] && !isAdmin(p.id)) {
            socket.emit('systemMessage', "❌ You cannot use Unstuck while in a party. Please leave the party first.");
            return; // 🛑 Stops the teleport completely!
        }

        if (tp.mapId === 'town') p.isMazeTrial = false; // Clear Maze Trial flag

        const oldInstId = p.instanceId; // 🌟 SAVE OLD INSTANCE
        socket.leave(p.instanceId); socket.to(p.instanceId).emit('remotePlayerLeft', p.id); 
        
        if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
            for (let petId in worlds[p.instanceId].pets) { if (worlds[p.instanceId].pets[petId].ownerId === p.id) delete worlds[p.instanceId].pets[petId]; }
        }

        p.mapId = tp.mapId; p.x = tp.x; p.y = tp.y; p.currentPortal = null;
       p.instanceId = getInstanceId(p.id, tp.mapId); 
        p.untargetableUntil = Date.now() + 3000; // 🛡️ 3-Second Spawn Protection (Invincible & Untargetable)
        socket.join(p.instanceId);
        
        checkAndResetInstance(oldInstId); // 🌟 RUN THE RESET CHECK
        
        socket.emit('forceTeleport', tp); 
        if (!p.isHiddenAdmin) {
            socket.to(p.instanceId).emit('remotePlayerJoined', { id: p.id, name: p.name, mapId: p.mapId, instanceId: p.instanceId, x: p.x, y: p.y, spriteData: p.spriteData, isGhost: p.isGhost });
        }
        
        // 🌟 FIX: Ensures the newly teleported player loads the room's population!
        const playersInInst = Object.values(onlinePlayers).filter(remote => remote.instanceId === p.instanceId && remote.id !== p.id && !remote.isHiddenAdmin);
        socket.emit('mapPlayersList', playersInInst.map(pp => ({ id: pp.id, name: pp.name, mapId: pp.mapId, x: pp.x, y: pp.y, spriteData: pp.spriteData, isGhost: pp.isGhost })));
        
        supabase.from('Exonians').update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y }).eq('character_name', p.id).then(()=>{});
    });

      socket.on('playerTeleported', async (data) => {
        const p = onlinePlayers[socket.id];
          if (!onlinePlayers[socket.id]) return;
          
        // 🛑 ANTI-CHEAT: THE BOUNCER
        if (data.mapId === 'trainingtavern' || String(data.mapId).startsWith('dungeon') || data.mapId === 'hauntedhouse') {
            // 🛡️ THE FIX: If they are ALREADY in the map, ignore the duplicate lag signal!
            if (p.mapId !== data.mapId) {
                if (p.expectedMapId !== data.mapId && !isAdmin(p.id)) {
                    console.log(`[ANTI-CHEAT] ${p.id} attempted to spoof teleport into ${data.mapId}!`);
                    return socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 });
                }
            }
        }
        p.expectedMapId = null; // Shred the ticket safely
        
        // ⚔️ NEUTRAL ZONE ENTRY CHECK
        if (data.mapId === 'neutralzone' && p.baseStats?.neutralLockout) {
            if (Date.now() < p.baseStats.neutralLockout) {
                const remainingMins = Math.ceil((p.baseStats.neutralLockout - Date.now()) / 60000);
                socket.emit('systemMessage', `❌ You cannot enter the Neutral Zone for ${remainingMins} more minutes after your recent defeat.`);
                return socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 });
            }
        }

       // 🛡️ THE FIX: Purification only resets when returning to town!
        if (data.mapId === 'town') {
            p.purificationUses = 0;
            p.isMazeTrial = false; // 🛡️ Also clears the Maze Trial lock when returning to town
        }

        const oldInstId = p.instanceId;
        socket.leave(p.instanceId);
        socket.to(p.instanceId).emit('remotePlayerLeft', p.id);

        // 🛡️ THE FIX: Clear Ghost state safely upon entering town
        if (data.mapId === 'town') {
            p.isGhost = false;
            p.currentHp = getServerTotalStat(p, 'hp') || 100;
        }

        if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
            for (let petId in worlds[p.instanceId].pets) {
                if (worlds[p.instanceId].pets[petId].ownerId === p.id) {
                    delete worlds[p.instanceId].pets[petId];
                }
            }
        }

       p.mapId = data.mapId;
        p.x = data.x;
        p.y = data.y;
        p.currentPortal = null;
        p.instanceId = getInstanceId(p.id, data.mapId);
        p.teleportGrace = Date.now() + 4000; // 🌟 Reset their immunity timer when they land
        p.untargetableUntil = Date.now() + 3000; // 🛡️ 3-Second Spawn Protection (Invincible & Untargetable)
        socket.join(p.instanceId);

        checkAndResetInstance(oldInstId);

        // Build the world immediately from the map data coming from the client
        if (data.mapData) {
            ensureWorldFromMapData(p.instanceId, data.mapData);
        }

        // Keep your existing sync flow too
        socket.emit('requestMapSync', { mapId: data.mapId, instanceId: p.instanceId });

      if (!p.isHiddenAdmin) {
            socket.to(p.instanceId).emit('remotePlayerJoined', {
                id: p.id,
                name: p.name,
                mapId: p.mapId,
                instanceId: p.instanceId,
                x: p.x,
                y: p.y,
                spriteData: p.spriteData,
                isGhost: p.isGhost
            });
        }

        const playersInInst = Object.values(onlinePlayers).filter(
            remote => remote.instanceId === p.instanceId && remote.id !== p.id && !remote.isHiddenAdmin
        );

        socket.emit('mapPlayersList', playersInInst.map(pp => ({
            id: pp.id,
            name: pp.name,
            mapId: pp.mapId,
            x: pp.x,
            y: pp.y,
            spriteData: pp.spriteData,
            isGhost: pp.isGhost
        })));

        // Send monster list immediately so the client renders them right away
        if (worlds[p.instanceId]) {
            socket.emit(
                'monsterState',
                Object.values(worlds[p.instanceId].monsters).map(serializeMonster)
            );
        }

        supabase
            .from('Exonians')
            .update({ map_id: p.mapId, pos_x: p.x, pos_y: p.y })
            .eq('character_name', currentUser)
            .then(() => {});
     // 🛡️ VISUAL MAP TIMER: Send cooldown to the client
        let queryBossId = p.mapId === 'neutralzone' ? 'neutralzone_boss' : p.mapId;
        supabase.from('boss_timers').select('last_death_time').eq('boss_id', queryBossId).single().then(({data: timer}) => {
            if (timer) {
                let remaining = 0;
                if (queryBossId === 'neutralzone_boss') {
                    remaining = (parseInt(timer.last_death_time) + (5 * 60 * 60 * 1000)) - Date.now();
                } else {
                    remaining = getBossCountdown(timer.last_death_time);
                }
                
                // 🛡️ MAZE TRIAL FIX: Ignore world timers if in a private Maze Trial
                if (remaining > 0 && !p.isMazeTrial) socket.emit('bossCooldownActive', { remaining });
            } else if (p.mapId === 'neutralzone') {
                // 🌟 THE FIX: If there's no timer in the DB, AND the boss isn't alive in RAM, spawn it!
                let boss = worlds['neutralzone']?.monsters['neutral_boss_1'];
                if (!boss || !boss.alive) {
                    spawnNeutralBoss();
                }
            }
        });
          // 🌟 THE TAVERN INJECTION 🌟
        // If they teleported into the tavern, spawn the boss securely on top of them!
        if (p.mapId === 'trainingtavern' && p.pendingTavernBoss) {
            setTimeout(() => {
                if (!worlds[p.instanceId]) return;
                
                // Wipe any accidental admin spawns so it's a strict 1v1
                worlds[p.instanceId].monsters = {}; 
                
                const mKey = p.pendingTavernBoss.mobType === 'floor_boss' ? 'floor_boss1' : (p.pendingTavernBoss.mobType === 'mini_boss' ? 'mini_boss1' : 'common_mobs1');
                const newMob = spawnMonster(p.instanceId, 't_mob_1', mKey, { spawnArea: { minX: 989, minY: 394 }, level: p.pendingTavernBoss.level });
                
                worlds[p.instanceId].monsters['t_mob_1'] = newMob;
                p.tavernTargetId = 't_mob_1';
                p.tavernStartTime = Date.now();
                
                socket.emit('monsterSpawned', serializeMonster(newMob));
                socket.emit('tavernTimerStart');
                
                p.pendingTavernBoss = null; // Clear the pending state
            }, 1000); // 1-second dramatic pause before the boss appears
        }
    });

   socket.on('respawnPlayer', () => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    // 🛡️ BLOCK GHOSTS FROM ABANDONING THEIR PARTY
    const pid = playerParty[p.id];
    if (pid && parties[pid]) {
        let allDead = true;
        
        // Check if anyone in the party is still alive
        for (const memberId of parties[pid].members) {
            const member = getPlayerById(memberId);
            if (member && !member.isGhost) {
                allDead = false;
                break;
            }
        }
        
        // If the party hasn't wiped yet, block the respawn!
        if (!allDead) {
            socket.emit('systemMessage', "❌ You cannot respawn to town while your party is still fighting!");
            return; // 🛑 Stops the teleport!
        }
    }

    const trueMaxHp = getServerTotalStat(p, 'hp') || p.maxHp || 100;

    // If already in town, just revive in place
    if (p.mapId === 'town') {
        p.isGhost = false;
        p.currentHp = trueMaxHp;
        p.maxHp = trueMaxHp;
        p.currentPortal = null;
        p.untargetableUntil = 0;
        p.tauntBuffUntil = 0;

        io.to(p.instanceId).emit('playerRevived', {
            id: p.id,
            currentHp: p.currentHp
        });

        if (pid) emitPartyUpdate(pid);

        supabase
            .from('Exonians')
            .update({
                map_id: 'town',
                pos_x: p.x,
                pos_y: p.y,
                current_hp: p.currentHp
            })
            .eq('character_name', p.id)
            .then(() => {});

        return;
    }

    // Real respawn flow: leave old map, go to town, then revive
    const oldInstId = p.instanceId;

    // ⚔️ NEUTRAL ZONE DEATH PENALTY
    // If they are respawning to town from the Neutral Zone, apply a 30-minute lockout!
    if (p.mapId === 'neutralzone') {
        if (!p.baseStats) p.baseStats = {};
        p.baseStats.neutralLockout = Date.now() + (30 * 60 * 1000); // 30 Minutes
    }

    socket.leave(p.instanceId);
    socket.to(p.instanceId).emit('remotePlayerLeft', p.id);

    if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
        for (let petId in worlds[p.instanceId].pets) {
            if (worlds[p.instanceId].pets[petId].ownerId === p.id) {
                delete worlds[p.instanceId].pets[petId];
            }
        }
    }

    p.mapId = 'town';
    p.x = 960;
    p.y = 1000;
    p.instanceId = getInstanceId(p.id, 'town');
    p.currentPortal = null;
    p.isGhost = false;
    p.maxHp = trueMaxHp;
    p.currentHp = trueMaxHp;
    p.untargetableUntil = 0;
    p.tauntBuffUntil = 0;
    p.isMazeTrial = false; // Clear Maze Trial flag on death respawn

    socket.join(p.instanceId);

    checkAndResetInstance(oldInstId);

    socket.emit('forceTeleport', {
        mapId: 'town',
        x: 960,
        y: 1000
    });

    if (!p.isHiddenAdmin) {
        socket.to(p.instanceId).emit('remotePlayerJoined', {
            id: p.id,
            name: p.name,
            mapId: p.mapId,
            instanceId: p.instanceId,
            x: p.x,
            y: p.y,
            spriteData: p.spriteData,
            isGhost: false
        });
    }

    const playersInInst = Object.values(onlinePlayers).filter(
        remote => remote.instanceId === p.instanceId && remote.id !== p.id && !remote.isHiddenAdmin
    );

    socket.emit('mapPlayersList', playersInInst.map(pp => ({
        id: pp.id,
        name: pp.name,
        mapId: pp.mapId,
        x: pp.x,
        y: pp.y,
        spriteData: pp.spriteData,
        isGhost: pp.isGhost
    })));

    socket.emit('playerRevived', {
        id: p.id,
        currentHp: p.currentHp
    });

    if (pid) emitPartyUpdate(pid);

    supabase
        .from('Exonians')
        .update({
            map_id: 'town',
            pos_x: 960,
            pos_y: 1000,
            current_hp: p.currentHp
        })
        .eq('character_name', p.id)
        .then(() => {});
});
    // 🌟 NEW: IN-PLACE REVIVAL FOR JUICE
    socket.on('localRevive', () => {
        const p = onlinePlayers[socket.id];
        if (p && p.isGhost) {
            p.isGhost = false;
            p.currentHp = p.maxHp || 100;
            io.to(p.instanceId).emit('playerRevived', { id: p.id, currentHp: p.currentHp });
        }
    });
socket.on('playerDied', () => {
    const p = onlinePlayers[socket.id];
    if (!p || p.isGhost) return;

    p.isGhost = true;
    p.currentHp = 0;
    p.currentPortal = null;

    io.to(p.instanceId).emit('remotePlayerGhosted', p.id);
    
    // ⚔️ TAVERN FAILURE CONDITION
    if (p.instanceId.startsWith('tavern_')) {
        socket.emit('systemMessage', '💀 You have fallen! Tavern challenge failed.');
        socket.emit('tavernTimerStop'); // 🛑 THIS INSTANTLY KILLS THE TIMER UI
        
        // Auto-kick back to town as a ghost after 4 seconds to look at their failure
        setTimeout(() => {
            const checkP = onlinePlayers[socket.id];
            if (checkP && checkP.instanceId === p.instanceId) {
                // Force ghost back to town without unstuck exploit
                checkP.mapId = 'town';
                checkP.x = 960;
                checkP.y = 1000;
                checkP.instanceId = 'town';
                socket.emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 });
            }
        }, 4000);
    }

    const pid = playerParty[p.id];

    // Solo player = show death screen immediately
    if (!pid || !parties[pid]) {
        socket.emit('showDeathScreen');
        return;
    }

    // Party player = only show death screen if whole party is dead
    const party = parties[pid];
    let allDead = true;

    for (const memberId of party.members) {
        const member = getPlayerById(memberId);
        if (member && !member.isGhost) {
            allDead = false;
            break;
        }
    }

    if (allDead) {
        for (const memberId of party.members) {
            const memberSid = findSocketIdByPlayerId(memberId);
            if (memberSid) {
                io.to(memberSid).emit('showDeathScreen');
            }
        }
        io.to(p.instanceId).emit('partyWiped');
    }

    emitPartyUpdate(pid);
});
// ✅ FETCH ALL NEWS AND SEND AS A QUEUE
    socket.on('requestNews', async () => {
        try {
            // Fetches all rows, ordered by ID (1, 2, 3...)
            const { data: newsList } = await supabase.from('Game_News').select('*').order('id', { ascending: true });
            socket.emit('latestNews', newsList || []);
        } catch(e) {
            socket.emit('latestNews', []);
        }
    });
// 🌟 ADMIN SPECTATE ENGINE
    socket.on('requestSpectate', (targetId) => {
        const p = onlinePlayers[socket.id];
        if (!p || !isAdmin(p.id)) return;

        const target = getPlayerById(targetId);
        if (!target) return;

        if (!p.savedSpectatePos) {
            p.savedSpectatePos = {
                mapId: p.mapId,
                x: p.x,
                y: p.y,
                instanceId: p.instanceId,
                wasGhost: !!p.isGhost
            };
        }

        // Admin becomes hidden + ghost while spectating
        p.isHiddenAdmin = true;
        p.isGhost = true;
        p.currentPortal = null;
        p.untargetableUntil = Date.now() + 999999999;

        socket.leave(p.instanceId);
        socket.to(p.instanceId).emit('remotePlayerLeft', p.id);

        p.mapId = target.mapId;
        p.x = target.x;
        p.y = target.y;
        p.instanceId = target.instanceId;

        socket.join(p.instanceId);

        socket.emit('forceTeleport', {
            mapId: p.mapId,
            x: p.x,
            y: p.y,
            spectateTarget: targetId
        });
    });

    socket.on('stopSpectate', () => {
        const p = onlinePlayers[socket.id];
        if (!p || !isAdmin(p.id) || !p.savedSpectatePos) return;

        const tp = p.savedSpectatePos;
        p.savedSpectatePos = null;

        socket.leave(p.instanceId);

        p.isHiddenAdmin = false;
        p.isGhost = !!tp.wasGhost;
        p.untargetableUntil = 0;
        p.currentPortal = null;

        p.mapId = tp.mapId;
        p.x = tp.x;
        p.y = tp.y;
        p.instanceId = tp.instanceId;

        socket.join(p.instanceId);

        socket.emit('forceTeleport', {
            mapId: p.mapId,
            x: p.x,
            y: p.y
        });
    });
   socket.on('requestEnhance', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    p.inventory = sanitizeInventory(p.inventory);

    let stone = p.inventory[data.stoneIndex];
    let targetItem = p.inventory[data.targetIndex];

    // 🛡️ ANTI-CHEAT: Block enhancing if an Aura or Pet is attached!
     if (targetItem.aura) {
    socket.emit('systemMessage', '❌ You must extract the Aura or Pet before enhancing this item!');
    socket.emit('syncInventory', p.inventory);
         return;
        }

    if (!stone || !targetItem || stone.type !== 'material') return;
    if (!VALID_RARITIES.includes(targetItem.rarity)) return;

    const maxAllowed = MAX_ENHANCE_BY_RARITY[targetItem.rarity] || 0;
    const currentEnhance = clamp(targetItem.enhanceLevel || 0, 0, 20);

   if (currentEnhance >= maxAllowed) {
        socket.emit('systemMessage', `${targetItem.rarity} items cannot go above +${maxAllowed}.`);
        socket.emit('syncInventory', p.inventory);
        return;
    }

    // 🛡️ THE FIX: Divine Enhancement Stones ignore the level requirement!
    let isDivineMatch = (stone.rarity === 'Divine' && targetItem.rarity === 'Divine' && stone.name === 'Divine Enhancement Stone');
    let isNormalMatch = (stone.rarity === targetItem.rarity && stone.level === targetItem.level && stone.name !== 'Divine Enhancement Stone');

    if (!isDivineMatch && !isNormalMatch) {
        socket.emit('systemMessage', '❌ Invalid enhancement stone for this item.');
        socket.emit('syncInventory', p.inventory);
        return;
    }

    stone.quantity = (stone.quantity || 1) - 1;
    if (stone.quantity <= 0) p.inventory[data.stoneIndex] = null;

    let successChance = 1.0;
    let destroyChance = 0.0;

    if (currentEnhance >= 6) {
        successChance = Math.max(0.15, 1.0 - ((currentEnhance - 5) * 0.15));
        destroyChance = Math.min(0.40, ((currentEnhance - 5) * 0.05));
    }

    const roll = Math.random();

    if (roll < destroyChance) {
        p.inventory[data.targetIndex] = null;
        socket.emit('systemMessage', `CRITICAL FAILURE! ${targetItem.name} +${currentEnhance} shattered!`);
    } else if (roll < destroyChance + successChance) {
        targetItem.enhanceLevel = currentEnhance + 1;

        const bonus = {
            Starter: 1,
            Basic: 1,
            Rare: 3,
            Unique: 5,
            Legendary: 8,
            Godly: 15,
            Divine: 25
        }[targetItem.rarity] || 1;

        if (targetItem.fixedStat) {
            for (const k in targetItem.fixedStat) {
                if (typeof targetItem.fixedStat[k] === 'number') {
                    targetItem.fixedStat[k] += bonus;
                }
            }
        }

        if (targetItem.randomStat) {
            for (const k in targetItem.randomStat) {
                if (typeof targetItem.randomStat[k] === 'number') {
                    targetItem.randomStat[k] += bonus;
                }
            }
        }

        p.inventory[data.targetIndex] = sanitizeItem(targetItem);

        socket.emit('systemMessage', `SUCCESS! Item is now +${targetItem.enhanceLevel}!`);
    } else {
        socket.emit('systemMessage', `FAILED! ${targetItem.name} +${currentEnhance} enhancement failed.`);
    }

    p.inventory = sanitizeInventory(p.inventory);

    await supabase
        .from('Exonians')
        .update({ inventory: p.inventory })
        .eq('character_name', p.id);

    socket.emit('syncInventory', p.inventory);
});
    // ==========================================
    // ✨ DIVINE FORGE CRAFTING SYSTEM
    // ==========================================
    socket.on('requestCraftDivine', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        
        const inv = p.inventory;
        const baseItem = inv[data.baseIndex];

        if (!baseItem || baseItem.rarity !== 'Godly') {
            return socket.emit('systemMessage', '❌ You need a Godly equipment base to ascend to Divine.');
        }

        // Determine requirements based on item type
        let reqEssence = 0, reqRed = 0, reqGreen = 0, reqBlue = 0, reqGold = 0;
        const isWeapon = baseItem.type === 'weapon';
        const isArmor = baseItem.type === 'armor' || baseItem.type === 'leggings';
        const isAcc = ['necklace', 'ring', 'earrings'].includes(baseItem.type);

        if (isWeapon) { reqEssence = 3; reqRed = 1; reqGreen = 1; reqBlue = 1; reqGold = 3000000; }
        else if (isArmor) { reqEssence = 1; reqRed = 1; reqGreen = 1; reqBlue = 1; reqGold = 1000000; }
        else if (isAcc) { reqEssence = 5; reqRed = 2; reqGreen = 2; reqBlue = 2; reqGold = 5000000; }
        else return socket.emit('systemMessage', '❌ Invalid item type for Divine crafting.');

        if (p.gold < reqGold) return socket.emit('systemMessage', `❌ You need ${reqGold.toLocaleString()} Gold to craft this.`);

       // 🛡️ THE FLEXIBLE CHECKER: Counts materials even if they are "old" versions
        let countEssence = 0, countRed = 0, countGreen = 0, countBlue = 0;
        inv.forEach(i => {
            if (!i || !i.name) return;
            const n = String(i.name).trim();
            if (n.includes('Divine Essence')) countEssence += i.quantity || 1;
            if (n.includes('Red Exo Metal')) countRed += i.quantity || 1;
            if (n.includes('Green Exo Metal')) countGreen += i.quantity || 1;
            if (n.includes('Blue Exo Metal')) countBlue += i.quantity || 1;
        });

        if (countEssence < reqEssence || countRed < reqRed || countGreen < reqGreen || countBlue < reqBlue) {
            return socket.emit('systemMessage', '❌ You do not have the required materials.');
        }

        // 🛡️ THE FLEXIBLE DEDUCTOR: Removes materials using fuzzy matching
        const deduct = (namePart, amount) => {
            let amt = amount;
            for (let i = 0; i < inv.length; i++) {
                if (amt <= 0) break;
                if (inv[i] && inv[i].name && String(inv[i].name).trim().includes(namePart)) {
                    if (inv[i].quantity > amt) {
                        inv[i].quantity -= amt;
                        amt = 0;
                    } else {
                        amt -= inv[i].quantity;
                        inv[i] = null;
                    }
                }
            }
        };

        deduct('Divine Essence', reqEssence);
        deduct('Red Exo Metal', reqRed);
        deduct('Green Exo Metal', reqGreen);
        deduct('Blue Exo Metal', reqBlue);
        p.gold -= reqGold;

        // ✨ TRANSFORM ITEM TO DIVINE ✨
        baseItem.rarity = 'Divine';
        baseItem.color = '#ffea00';
        baseItem.name = baseItem.name.replace('Godly', 'Divine');
        if (!baseItem.name.includes('Divine')) baseItem.name = `Divine ${baseItem.name}`;
        baseItem.enhanceLevel = 0; // Reset enhancement
        
        if (baseItem.gemCount) baseItem.gemCount = 0; // Wipe sockets
        baseItem.randomStat = {}; // Wipe old random stats

        // Double fixed stats
        for (let k in baseItem.fixedStat) {
            baseItem.fixedStat[k] *= 2;
        }

        // Apply new random stats
        const ALL_STATS = ['attack', 'magic', 'defense', 'speed', 'int', 'str', 'hp'];
        let numStats = isAcc ? 2 : 4;
        let availableStats = [...ALL_STATS];
        for (let i = 0; i < numStats; i++) {
            let rIdx = Math.floor(Math.random() * availableStats.length);
            let sKey = availableStats.splice(rIdx, 1)[0];
            baseItem.randomStat[sKey] = Math.floor(Math.random() * (baseItem.level || 50)) + 15; // Generous base roll
        }

        p.inventory = sanitizeInventory(inv);

        // Save & Sync
        await supabase.from('Exonians').update({ inventory: p.inventory, gold: p.gold }).eq('character_name', p.id);
        socket.emit('syncInventory', p.inventory);
        socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory }); // Reusing this event to update the gold UI safely
        socket.emit('systemMessage', `✨ Successfully forged ${baseItem.name}!`);
        socket.emit('craftSuccess');

        // --- LINES BEFORE ---
        io.emit('rareLootBroadcast', {
            playerName: p.name || p.id,
            itemName: baseItem.name,
            rarity: 'Divine',
            level: baseItem.level,
            color: baseItem.color
        });
    });
// ==========================================
    // ✨ STAT FORGER CRAFTING & REROLL ENGINE
    // ==========================================
    socket.on('requestCraftForger', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const targetRarity = data?.rarity || 'Godly';
        const validRarities = ['Basic', 'Rare', 'Unique', 'Legendary', 'Godly', 'Divine'];
        if (!validRarities.includes(targetRarity)) return socket.emit('systemMessage', '❌ Invalid rarity selected.');

        if (p.gold < 300000) return socket.emit('systemMessage', '❌ Not enough gold to craft a Forger.');

        const inv = p.inventory;
        const forgerName = `${targetRarity} Stat Forger`;
        let forgerIdx = inv.findIndex(i => i && i.name === forgerName);
        let emptyIdx = inv.findIndex(i => i === null);
        
        if (forgerIdx === -1 && emptyIdx === -1) {
            return socket.emit('systemMessage', '❌ Inventory is full!');
        }

        // 🛡️ THE FIX: Make ALL material checks flexible to support old items
        let countRed = 0, countGreen = 0, countBlue = 0, countStones = 0;
        inv.forEach(i => {
            if (!i || !i.name) return;
            const n = String(i.name).trim();
            if (n.includes('Red Exo Metal')) countRed += i.quantity || 1;
            else if (n.includes('Green Exo Metal')) countGreen += i.quantity || 1;
            else if (n.includes('Blue Exo Metal')) countBlue += i.quantity || 1;
            // 🛡️ THE FIX: Divine rarity bypasses the Level 50 requirement for counting!
            else if (n.includes('Refinement Stone') && (targetRarity === 'Divine' || i.level >= 100) && i.rarity === targetRarity) {
                countStones += i.quantity || 1;
            }
        });

        if (countRed < 3 || countGreen < 3 || countBlue < 3 || countStones < 3) {
            return socket.emit('systemMessage', '❌ You lack the required materials.');
        }

        // 🛡️ THE FIX: Flexible deduct function to handle the fuzzy matching for all items
        const deduct = (namePart, amount, reqRarity, isStone = false) => {
            let amt = amount;
            for (let i = 0; i < inv.length; i++) {
                if (amt <= 0) break;
                let item = inv[i];
                if (!item || !item.name) continue;
                
                const n = String(item.name).trim();
                let isMatch = false;

                if (isStone) {
                    // 🛡️ THE FIX: Divine rarity bypasses the Level 50 requirement for deduction!
                    isMatch = n.includes('Refinement Stone') && (reqRarity === 'Divine' || item.level >= 100) && item.rarity === reqRarity;
                } else {
                    isMatch = n.includes(namePart);
                }

                if (isMatch) {
                    if (item.quantity > amt) {
                        item.quantity -= amt;
                        amt = 0;
                    } else {
                        amt -= item.quantity;
                        inv[i] = null;
                    }
                }
            }
        };

        deduct('Red Exo Metal', 3);
        deduct('Green Exo Metal', 3);
        deduct('Blue Exo Metal', 3);
        deduct('Refinement Stone', 3, targetRarity, true);
        
        p.gold -= 300000;

        if (forgerIdx !== -1) {
            inv[forgerIdx].quantity = (inv[forgerIdx].quantity || 1) + 1;
        } else {
            const rColor = RARITY_COLORS[targetRarity] || "#E040FB";
            inv[emptyIdx] = { id: Date.now() + Math.random(), name: forgerName, type: "forger", rarity: targetRarity, color: rColor, description: `Rerolls a specific sub-stat on ${targetRarity} gear.`, quantity: 1 };
        }

        p.inventory = sanitizeInventory(inv);
        await supabase.from('Exonians').update({ inventory: p.inventory, gold: p.gold }).eq('character_name', p.id);
        
        socket.emit('syncInventory', p.inventory);
        socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
        socket.emit('systemMessage', `✨ Successfully crafted a ${forgerName}!`);
        socket.emit('craftForgerSuccess');
    });
socket.on('requestRerollStat', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const forgerIndex = data.forgerIndex;
        const targetIndex = data.targetIndex;
        const oldStatKey = data.statKey; // The stat they want to sacrifice (e.g., 'int')

        const forgerItem = p.inventory[forgerIndex];
        const targetItem = p.inventory[targetIndex];

        // Security Checks
        if (!forgerItem || forgerItem.type !== 'forger' || !targetItem) return;
        if (forgerItem.rarity !== targetItem.rarity) {
            return socket.emit('systemMessage', "Rarity mismatch!");
        }
        if (!targetItem.randomStat || typeof targetItem.randomStat[oldStatKey] === 'undefined') {
            return socket.emit('systemMessage', "That sub-stat does not exist on this item!");
        }

        // 🌟 THE FIX: Capture the exact old numeric value BEFORE deleting it
        const exactOldValue = targetItem.randomStat[oldStatKey];

        // 1. Define the pool of possible stats
        const STAT_TYPES = ['attack', 'magic', 'defense', 'speed', 'int', 'str', 'hp'];

        // 2. Pick a new random stat (but make sure it doesn't accidentally pick a stat the item ALREADY has!)
        let availableStats = STAT_TYPES.filter(s => typeof targetItem.randomStat[s] === 'undefined');
        
        if (availableStats.length === 0) availableStats = [oldStatKey]; 

        // Add the old stat back into the pool so there's a chance it stays the same
        if (!availableStats.includes(oldStatKey)) availableStats.push(oldStatKey);

        const newStatKey = availableStats[Math.floor(Math.random() * availableStats.length)];

        // 🌟 THE FIX: Delete the old stat, and apply the EXACT same number to the new stat
        delete targetItem.randomStat[oldStatKey];
        targetItem.randomStat[newStatKey] = exactOldValue;

        // 3. Consume 1 Forger
        forgerItem.quantity = (forgerItem.quantity || 1) - 1;
        if (forgerItem.quantity <= 0) p.inventory[forgerIndex] = null;

        // 4. Save and Sync
        await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
        
        socket.emit('syncInventory', p.inventory);
        socket.emit('rerollSuccess');
        
        // Let them know exactly what happened!
        let msg = oldStatKey === newStatKey 
            ? `Stat reforged! It stayed as ${newStatKey.toUpperCase()} (+${exactOldValue}).`
            : `Stat reforged! Your +${exactOldValue} ${oldStatKey.toUpperCase()} mutated into +${exactOldValue} ${newStatKey.toUpperCase()}!`;
            
        socket.emit('systemMessage', msg);
    });
    // ✨ APPEARANCE REROLL HANDLER
    socket.on('requestAppearanceChange', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || typeof data.index !== 'number' || !data.charData) return;

        const inv = p.inventory || [];
        const item = inv[data.index];
        if (!item || item.name !== 'Appearance Reroll Ticket') return;

        // Deduct ticket
        item.quantity = (item.quantity || 1) - 1;
        if (item.quantity <= 0) inv[data.index] = null;
        p.inventory = inv;

        const { skinColor, hairColor, hairStyle } = data.charData;
        p.spriteData.skin = skinColor; p.spriteData.hair = hairColor; p.spriteData.style = hairStyle;

        try {
            await supabase.from('Exonians').update({ skin_color: skinColor, hair_color: hairColor, hair_style: hairStyle, inventory: p.inventory }).eq('character_name', p.id);
            socket.emit('syncInventory', p.inventory);
            socket.emit('systemMessage', "✨ Appearance successfully changed!");
            const moveData = { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData };
            socket.emit('remotePlayerMoved', moveData);
            socket.to(p.instanceId).emit('remotePlayerMoved', moveData);
        } catch(e) { console.error(e); }
    });

    // ✨ NAME CHANGE HANDLER
    socket.on('requestNameChange', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || typeof data.index !== 'number' || !data.newName) return;

        const inv = p.inventory || [];
        const item = inv[data.index];
        if (!item || item.name !== 'Name Change Ticket') return;

        const newName = data.newName.trim();
        if (newName.length < 3 || newName.length > 16) return socket.emit('systemMessage', "❌ Name must be 3-16 characters.");

        // Check if name is taken
        const { data: existingUser } = await supabase.from('Exonians').select('character_name').eq('character_name', newName).single();
        if (existingUser) return socket.emit('systemMessage', "❌ That name is already taken!");

        // Deduct ticket
        item.quantity = (item.quantity || 1) - 1;
        if (item.quantity <= 0) inv[data.index] = null;
        p.inventory = inv;

        const oldName = p.id;

        try {
            await supabase.from('Exonians').update({ character_name: newName, inventory: p.inventory }).eq('character_name', oldName);
            
            p.id = newName; p.name = newName; socket.username = newName;
            activeLogins.delete(oldName); activeLogins.add(newName);
            
            const pid = playerParty[oldName];
            if (pid) {
                playerParty[newName] = pid; delete playerParty[oldName];
                parties[pid].members.delete(oldName); parties[pid].members.add(newName);
                if (parties[pid].leaderId === oldName) parties[pid].leaderId = newName;
                emitPartyUpdate(pid);
            }

            io.emit('systemMessage', `✨ [World] ${oldName} has changed their name to ${newName}!`);
            socket.emit('authSuccess', { ...p, character_name: newName, base_stats: p.baseStats, equips: p.equips });
            io.to(p.instanceId).emit('remotePlayerLeft', oldName);
            io.to(p.instanceId).emit('remotePlayerJoined', { id: p.id, name: p.name, mapId: p.mapId, instanceId: p.instanceId, x: p.x, y: p.y, spriteData: p.spriteData, isGhost: p.isGhost });
        } catch(e) { socket.emit('systemMessage', "❌ Failed to change name. DB Error."); }
    });
// 🛡️ SECURE GOLD SHOP: Server now generates items, not the client!
    socket.on('requestPurchase', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const type = data.type; // 'potion' or 'stone'
        const qty = Math.max(1, Math.min(99, parseInt(data.qty) || 1));
        let cost = 0;
        let item = null;

        if (type === 'potion') {
            cost = qty * 25;
            item = { id: Date.now() + Math.random(), name: "Health Potion", type: "potion", rarity: "Basic", color: "#fff", fixedStat: { hpHeal: 100 }, quantity: qty };
        } else if (type === 'stone') {
            const lvl = Math.max(1, Math.min(100, parseInt(data.level) || 10));
            const rarity = data.rarity || 'Basic';
            const rMult = { "Basic": 1, "Rare": 3, "Unique": 8, "Legendary": 20, "Godly": 50 }[rarity] || 1;
            cost = (lvl * 15) * rMult * qty;
            item = { id: Date.now() + Math.random(), name: (rarity === "Basic" ? "" : rarity + " ") + "Refinement Stone Lv." + lvl, type: "material", rarity: rarity, level: lvl, color: RARITY_COLORS[rarity], quantity: qty };
        }

        if (!item || p.gold < cost) {
            return socket.emit('systemMessage', "❌ Purchase Failed: Invalid item or insufficient gold.");
        }

        const inv = Array.isArray(p.inventory) ? p.inventory : new Array(20).fill(null);
        let added = false;
        if (['potion', 'material', 'consumable'].includes(item.type)) {
            const existingIndex = inv.findIndex(i => i && i.name === item.name);
            if (existingIndex !== -1) {
                inv[existingIndex].quantity = (inv[existingIndex].quantity || 1) + item.quantity;
                added = true;
            }
        }
        if (!added) {
            const emptySlot = inv.findIndex(i => i === null);
            if (emptySlot === -1) return socket.emit('systemMessage', "Inventory full!");
            inv[emptySlot] = item;
        }

        p.gold -= cost;
        p.inventory = inv;

        await supabase.from('Exonians').update({ gold: p.gold, inventory: p.inventory }).eq('character_name', p.id);
        socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
    });
    // ==========================================
    // 📜 DAILY MISSIONS ENGINE
    // ==========================================
    socket.on('requestDailyMission', () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        
        let todayMidnight = new Date();
        todayMidnight.setUTCHours(0, 0, 0, 0);
        const resetTs = todayMidnight.getTime();

        if (!p.baseStats.dailyMission) {
            p.baseStats.dailyMission = { active: false, lastReset: 0 };
        }

        // Automatic midnight wipe
        if (p.baseStats.dailyMission.lastReset < resetTs) {
            p.baseStats.dailyMission = { active: false, lastReset: resetTs };
            supabase.from('Exonians').update({ base_stats: p.baseStats }).eq('character_name', p.id).then(()=>{});
        }

        socket.emit('dailyMissionData', p.baseStats.dailyMission);
    });

   socket.on('acceptDailyMission', (difficulty) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        let todayMidnight = new Date();
        todayMidnight.setUTCHours(0, 0, 0, 0);
        const resetTs = todayMidnight.getTime();

        // Check if player already has an active mission for today
        if (p.baseStats.dailyMission && p.baseStats.dailyMission.active && p.baseStats.dailyMission.lastReset >= resetTs) {
            return socket.emit('systemMessage', "❌ You already have an active mission today.");
        }

        // 50/50 Coin Flip for type
        const chosenType = Math.random() < 0.5 ? 'common' : 'boss';
        
        let targetMob = '';
        let targetName = '';
        let requiredKills = 0;
        let reward = 0;

        // ⚖️ Difficulty Logic with Exact Names from MonsterDatabase
        if (difficulty === 'Beginner') {
            targetMob = chosenType === 'common' ? 'common_mobs1' : 'mini_boss1';
            targetName = chosenType === 'common' ? 'Slime' : 'Orc Slime';
            requiredKills = chosenType === 'common' ? 25 : 5;
            reward = 25000;
        } else if (difficulty === 'Novice') {
            targetMob = chosenType === 'common' ? 'common_mobs2' : 'mini_boss2';
            targetName = chosenType === 'common' ? 'Shadow Bat' : 'Vampire Bat';
            requiredKills = chosenType === 'common' ? 25 : 5;
            reward = 100000;
        } else if (difficulty === 'Expert') {
            targetMob = chosenType === 'common' ? 'common_mobs3' : 'mini_boss3';
            targetName = chosenType === 'common' ? 'Fire Sprite' : 'Inferno Core';
            requiredKills = chosenType === 'common' ? 25 : 5;
            reward = 250000;
        } else {
            return; // Invalid difficulty
        }

        p.baseStats.dailyMission = {
            active: true,
            difficulty: difficulty,
            type: chosenType,
            targetMob: targetMob,
            targetName: targetName, // 🛡️ This is what game.js displays
            currentKills: 0,
            requiredKills: requiredKills,
            reward: reward,
            completed: false,
            lastReset: resetTs
        };

        // Save to Database
        supabase.from('Exonians').update({ base_stats: p.baseStats }).eq('character_name', p.id).then(()=>{});
        
        // Sync to Client
        socket.emit('dailyMissionData', p.baseStats.dailyMission);
        socket.emit('systemMessage', `📜 Mission Accepted: Defeat ${requiredKills} ${targetName}s!`);
    });
    // 🏡 REAL ESTATE ENGINE: Buy a Home
    socket.on('requestBuyHome', async () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const HOME_PRICE = 1000000;

        if (p.gold < HOME_PRICE) {
            return socket.emit('systemMessage', '❌ Not enough gold to buy a home.');
        }

        if (p.baseStats && p.baseStats.hasHome) {
            return socket.emit('systemMessage', '❌ You already own a home!');
        }

        // Deduct Gold and Grant Deed
        p.gold -= HOME_PRICE;
        p.baseStats.hasHome = true;

        try {
            await supabase
                .from('Exonians')
                .update({ gold: p.gold, base_stats: p.baseStats })
                .eq('character_name', p.id);
                
            socket.emit('homeBought', p.gold);
            socket.emit('systemMessage', '🎉 You successfully bought a Home for 1,000,000 Gold!');
        } catch (err) {
            console.error('Home Buy Error:', err);
            socket.emit('systemMessage', '❌ Server error while purchasing home.');
        }
    });
socket.on('useRevivalJuice', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;
    if (!p.isGhost) return;
    
    // ⚔️ TAVERN ANTI-CHEAT: Block Revival Juice in Tavern
    if (p.mapId === 'trainingtavern') {
        return socket.emit('systemMessage', '❌ Revival is forbidden in the Training Tavern!');
    }

    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    const requestedIndex = typeof data?.invIndex === 'number' ? data.invIndex : -1;

    let juiceIndex = -1;

    if (
        requestedIndex >= 0 &&
        inv[requestedIndex] &&
        inv[requestedIndex].name === "Revival Juice"
    ) {
        juiceIndex = requestedIndex;
    } else {
        juiceIndex = inv.findIndex(i => i && i.name === "Revival Juice");
    }

    if (juiceIndex === -1) {
        return socket.emit('systemMessage', 'No Revival Juice found.');
    }

    const item = inv[juiceIndex];
    item.quantity = (item.quantity || 1) - 1;

    if (item.quantity <= 0) {
        inv[juiceIndex] = null;
    }

    p.inventory = inv;
    p.isGhost = false;

    const trueMaxHp = getServerTotalStat(p, 'hp') || p.maxHp || 100;
    p.maxHp = trueMaxHp;
    p.currentHp = trueMaxHp;
    p.currentPortal = null;

    try {
        await supabase
            .from('Exonians')
            .update({
                inventory: p.inventory,
                current_hp: p.currentHp,
                map_id: p.mapId,
                pos_x: p.x,
                pos_y: p.y
            })
            .eq('character_name', p.id);
    } catch (e) {
        console.error('[REVIVAL JUICE SAVE ERROR]', e.message);
    }

    io.to(p.instanceId).emit('playerRevived', {
        id: p.id,
        currentHp: p.currentHp
    });

    socket.emit('revivalJuiceUsed', {
        inventory: p.inventory,
        currentHp: p.currentHp
    });

    const pid = playerParty[p.id];
    if (pid) emitPartyUpdate(pid);
});
    socket.on('requestThrowItem', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || typeof data?.index !== 'number') return;
        
        const inv = p.inventory || [];
        const itemToThrow = inv[data.index];
        
        if (itemToThrow) {
            // 🛡️ ANTI-CHEAT: Block throwing if an Aura or Pet is attached!
            if (itemToThrow.aura) {
                return socket.emit('systemMessage', '❌ You must extract the Aura or Pet before throwing this item away!');
            }
            
            inv[data.index] = null;
            p.inventory = inv;
            await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
            socket.emit('syncInventory', p.inventory);
        }
    });
socket.on('adminSpawnItem', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !isAdmin(p.id)) return; // 🛡️ Security Check

        const { rarity, type, level, enhanceLevel } = data;
        let item;

        if (type.startsWith('aura_')) {
            const auraType = type.split('_')[1];
            const AURA_DATA = {
                'lightning': { name: 'Lightning', color: '#00ffff' },
                'divine': { name: 'Divine', color: '#ffea00' }, // 👑 NEW: Royal Premium Aura
                'blaze': { name: 'Blaze', color: '#ff4444' },
                'liquid': { name: 'Liquid', color: '#44aaff' },
                 'nature': { name: 'Nature', color: '#4CAF50' },
                'easter': { name: 'Easter', color: '#FFB7B2' }, // 🐰 ADDED EASTER AURA
                'void': { name: 'Void Pet', color: '#E040FB' },
                'fox': { name: 'Spirit Fox Pet', color: '#ff7e00' },
                'owl': { name: 'Night Owl Pet', color: '#a0a0a0' },
            'wisp': { name: 'Sky Wisp Pet', color: '#87CEEB' },
                'egg': { name: 'Easter Egg Pet', color: '#FFC1E3' }
            };
            let aData = AURA_DATA[auraType] || AURA_DATA['lightning'];
            
            // 🛡️ THE FIX: Removes "Aura Stone" from the name if it is a pet
            let isPetItem = ['fox', 'owl', 'wisp', 'egg', 'void'].includes(auraType);
        let finalName = isPetItem ? aData.name : `${aData.name} Aura Stone`;

        // 🛡️ THE FIX: Set rarity to the dynamic variable from the admin panel!
        item = { id: Date.now() + Math.random(), name: finalName, type: 'aura', auraId: auraType, sprite: 'aurastone', level: 1, rarity: rarity, color: aData.color, description: isPetItem ? "Click to apply to Leggings." : "Click to apply to an Armor. Purely cosmetic.", quantity: 1 };
    } else {
            const EXTENDED_TEMPLATES = {
                ...ITEM_TEMPLATES,
                'necklace': { slot: 'necklace', statKey: 'magic', baseName: 'Necklace', spriteName: 'necklace' },
                'ring': { slot: 'ring', statKey: 'attack', baseName: 'Ring', spriteName: 'ring' },
                'earrings': { slot: 'earrings', statKey: 'defense', baseName: 'Earrings', spriteName: 'earrings' }
            };
            const tmpl = EXTENDED_TEMPLATES[type];
            if (!tmpl) return;
            const rPfx = rarity === "Starter" ? "basic" : rarity.toLowerCase();
            item = { id: Date.now() + Math.random(), name: `${rarity} Admin ${tmpl.baseName}`, type: tmpl.slot, sprite: rPfx + tmpl.spriteName, level: level, rarity: rarity, color: RARITY_COLORS[rarity], fixedStat: {}, enhanceLevel: enhanceLevel, quantity: 1 };
            
          // Inside socket.on('adminSpawnItem')
let statVal = getBaseStat(level) + ({ "Starter": 0, "Basic": 0, "Rare": 2, "Unique": 5, "Legendary": 8, "Godly": 12, "Divine": 12 }[rarity] || 0);

// DOUBLE stats if Divine
if (rarity === "Divine") {
    statVal = (getBaseStat(level) + 12) * 2;
}

item.fixedStat[tmpl.statKey] = statVal;
item.randomStat = {};

if (rarity !== "Starter") {
    // Exactly 4 random stats for Divine
    let numStats = rarity === "Divine" ? 4 : (rarity === "Godly" ? 3 : (rarity === "Legendary" ? 2 : 1));
    let availableStats = [...STAT_TYPES];
    for (let i = 0; i < numStats; i++) {
        let rIdx = Math.floor(Math.random() * availableStats.length);
        let sKey = availableStats.splice(rIdx, 1)[0];
        item.randomStat[sKey] = Math.floor(Math.random() * getBaseStat(level)) + 1;
    }
}

            if (enhanceLevel > 0) {
                const bonusPerLevel = { "Starter": 1, "Basic": 1, "Rare": 3, "Unique": 5, "Legendary": 8, "Godly": 15 }[rarity] || 1;
                const totalBonus = bonusPerLevel * enhanceLevel;
                for (const k in item.fixedStat) { if (typeof item.fixedStat[k] === 'number') item.fixedStat[k] += totalBonus; }
                for (const k in item.randomStat) { if (typeof item.randomStat[k] === 'number') item.randomStat[k] += totalBonus; }
            }
        }

        const inv = p.inventory || [];
        const emptySlot = inv.findIndex(i => i === null);
        if (emptySlot !== -1) {
            inv[emptySlot] = item;
            p.inventory = inv;
            // 🛡️ Force it into the database immediately
            await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
            socket.emit('syncInventory', p.inventory);
            socket.emit('systemMessage', `[Admin] Spawned ${item.name}!`);
        } else {
            socket.emit('systemMessage', "Inventory full!");
        }
    });
    // 🛡️ PERMANENT ADMIN LEVEL SETTER
    socket.on('adminSetLevel', async (level) => {
        const p = onlinePlayers[socket.id];
        if (!p || !isAdmin(p.id)) return; // 🛡️ Ironclad Security Check

        let newLevel = clamp(level, 1, 80);
        p.level = newLevel;
        p.maxExp = 100 + (newLevel * 100);
        
        // Scale stats
        p.baseStats.hp = getBaseStat(newLevel) * 10;
        p.baseStats.str = getBaseStat(newLevel);
        p.baseStats.int = getBaseStat(newLevel);
        
        // Recalculate true HP
        const trueMaxHp = getServerTotalStat(p, 'hp') || 100;
        p.maxHp = trueMaxHp;
        p.currentHp = trueMaxHp;

        // Force save to database
        await supabase.from('Exonians').update({
            level: p.level,
            max_exp: p.maxExp,
            base_stats: p.baseStats,
            current_hp: p.currentHp
        }).eq('character_name', p.id);

        socket.emit('systemMessage', `[Admin] Force-leveled to ${p.level}! Refresh page to sync UI.`);
    });
// 🛡️ SECURE AURA & PET APPLICATION (Optimized)
    socket.on('requestApplyAura', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const stone = p.inventory[data.stoneIndex];
        const targetItem = p.inventory[data.targetIndex];

        if (!stone || !targetItem || stone.type !== 'aura') return;
        
       const isPet = ['fox', 'owl', 'wisp', 'egg', 'void'].includes(stone.auraId);
        const expectedType = isPet ? 'leggings' : 'armor';

        if (targetItem.type !== expectedType) return socket.emit('systemMessage', `This item only applies to ${expectedType}!`);
        if (targetItem.aura) return socket.emit('systemMessage', `That ${expectedType} already has an enchantment! Extract it first.`);

       const AURA_DATA = { 
            'lightning': 'Lightning', 
            'divine': 'Divine',
            'blaze': 'Blaze', 
            'liquid': 'Liquid', 
            'nature': 'Nature', 
            'easter': 'Easter', 
            'void': 'Void',
            'fox': 'Spirit Fox',
            'owl': 'Night Owl',
            'wisp': 'Sky Wisp',
            'egg': 'Easter Egg'
        };
        let aName = AURA_DATA[stone.auraId] || 'Lightning';

        targetItem.aura = stone.auraId;
        targetItem.originalName = targetItem.name;
        
        // 🛡️ THE FIX: Formats pets as "Leggings [Sky Wisp]" and Auras as "Lightning Armor"
        if (isPet) {
            targetItem.name = `${targetItem.name} [${aName}]`;
        } else {
            targetItem.name = `${aName} ${targetItem.name}`;
        }

        stone.quantity = (stone.quantity || 1) - 1;
        if (stone.quantity <= 0) p.inventory[data.stoneIndex] = null;

        // ⚡ INSTANT UI UPDATE
        socket.emit('syncInventory', p.inventory);
        socket.emit('systemMessage', `Applied ${aName} to your ${expectedType}!`);
        
        // Update instantly if they are wearing it!
        if (p.equips && p.equips[expectedType] && p.equips[expectedType].id === targetItem.id) {
             p.equips[expectedType] = targetItem;
             if (isPet) p.spriteData.pet = targetItem.aura;
             else p.spriteData.aura = targetItem.aura;
             
             socket.emit('inventoryItemUsed', { inventory: p.inventory, equips: p.equips });
             socket.emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
             socket.to(p.instanceId).emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
        }
        supabase.from('Exonians').update({ inventory: p.inventory, equips: p.equips }).eq('character_name', p.id).then(()=>{});
    });
// 💎 POWER GEM APPLICATION
    socket.on('requestApplyGem', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const gem = p.inventory[data.gemIndex];
        const targetAcc = p.inventory[data.targetIndex];

        if (!gem || !targetAcc || gem.type !== 'gem') return;
        
        // Ensure it's an accessory
        if (!['necklace', 'ring', 'earrings'].includes(targetAcc.type)) {
            return socket.emit('systemMessage', `❌ Power Gems can only be applied to Accessories (Necklace, Ring, Earrings)!`);
        }
        // 🛡️ NEW FIX: Limit Gem sockets based on Accessory Rarity
        const maxGems = { "Basic": 1, "Rare": 1, "Unique": 2, "Legendary": 3, "Godly": 4, "Divine": 5 }[targetAcc.rarity] || 1;
        targetAcc.gemCount = targetAcc.gemCount || 0;

        if (targetAcc.gemCount >= maxGems) {
            return socket.emit('systemMessage', `❌ This ${targetAcc.rarity} accessory has reached its maximum of ${maxGems} socket(s)!`);
        }

        // Apply the gem's stats
        if (!targetAcc.randomStat) targetAcc.randomStat = {};
        for (let statKey in gem.randomStat) {
            targetAcc.randomStat[statKey] = (targetAcc.randomStat[statKey] || 0) + gem.randomStat[statKey];
        }

        // Increase the socket counter
        targetAcc.gemCount++;

        // Destroy the Gem
        gem.quantity = (gem.quantity || 1) - 1;
        if (gem.quantity <= 0) p.inventory[data.gemIndex] = null;

        socket.emit('syncInventory', p.inventory);
        socket.emit('systemMessage', `💎 Successfully embedded ${gem.name} into your ${targetAcc.name}!`);
        supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id).then(()=>{});
    });
    // 🛡️ SECURE AURA EXTRACTION (Optimized)
    socket.on('requestExtractAura', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const item = p.inventory[data.targetIndex];
        if (!item || !item.aura) return;

        const emptySlot = p.inventory.findIndex(i => i === null);
        if (emptySlot === -1) return socket.emit('systemMessage', "Inventory full! Cannot extract.");

const AURA_DATA = {
            'lightning': { name: 'Lightning', color: '#00ffff' },
            'divine': { name: 'Divine', color: '#ffea00' },
            'blaze': { name: 'Blaze', color: '#ff4444' },
            'liquid': { name: 'Liquid', color: '#44aaff' },
            'nature': { name: 'Nature', color: '#4CAF50' },
            'easter': { name: 'Easter', color: '#FFB7B2' }, // 🐰 ADDED EASTER AURA
             'void': { name: 'Void Pet', color: '#E040FB' },
            'fox': { name: 'Spirit Fox Pet', color: '#ff7e00' },
            'owl': { name: 'Night Owl Pet', color: '#a0a0a0' },
            'wisp': { name: 'Sky Wisp Pet', color: '#87CEEB' },
            'egg': { name: 'Easter Egg Pet', color: '#FFC1E3' }
        };
        let aData = AURA_DATA[item.aura] || AURA_DATA['lightning'];
        let isPetExtract = ['fox', 'owl', 'wisp', 'egg', 'void'].includes(item.aura);

        let auraStone = { 
            id: Date.now() + Math.random(), 
            name: isPetExtract ? aData.name : `${aData.name} Aura Stone`, 
            type: 'aura', auraId: item.aura, sprite: 'aurastone', 
            level: 1, rarity: 'Divine', color: aData.color, 
            description: isPetExtract ? "Click to apply to Leggings." : "Click to apply to equipment. Purely cosmetic.", quantity: 1 
        };

        let cleanPetName = aData.name.replace(' Pet', ''); 
        item.name = item.originalName || item.name.replace(` [${cleanPetName}]`, "").replace(aData.name + " ", "");
        delete item.aura;
        delete item.originalName;

        p.inventory[emptySlot] = auraStone;

        socket.emit('syncInventory', p.inventory);
        socket.emit('systemMessage', "Extracted safely!");

        const expectedType = ['fox', 'owl', 'wisp', 'egg', 'void'].includes(auraStone.auraId) ? 'leggings' : 'armor';
        if (p.equips && p.equips[expectedType] && p.equips[expectedType].id === item.id) {
             if (expectedType === 'leggings') p.spriteData.pet = null;
             else p.spriteData.aura = null;

             socket.emit('inventoryItemUsed', { inventory: p.inventory, equips: p.equips });
             socket.emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
             socket.to(p.instanceId).emit('remotePlayerMoved', { id: p.id, x: p.x, y: p.y, state: 'idle', facingRight: false, weaponSprite: p.spriteData.weapon, spriteData: p.spriteData });
        }
        supabase.from('Exonians').update({ inventory: p.inventory, equips: p.equips }).eq('character_name', p.id).then(()=>{});
    });
    // ==========================================
    // ⚖️ AUCTION HOUSE ENGINE
    // ==========================================
    socket.on('ah_search', async (query) => {
        try {
            let q = supabase.from('Auction_House').select('*').order('created_at', { ascending: false }).limit(50);
            if (query && query.trim() !== '') {
                q = q.ilike('item_name', `%${query.trim()}%`);
            }
            const { data } = await q;
            socket.emit('ah_searchResults', data || []);
        } catch (e) { console.error("AH Search Error:", e); }
    });

    socket.on('ah_getMyAuctions', async () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { data } = await supabase.from('Auction_House').select('*').eq('seller_name', p.id).order('created_at', { ascending: false });
            socket.emit('ah_myAuctions', { count: (data || []).length, auctions: data || [] });
        } catch (e) { console.error("AH Get My Error:", e); }
    });

    socket.on('ah_list', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || typeof data.invIndex !== 'number' || !data.price || data.price < 1) return;

        // 🛡️ ANTI-SPAM LOCK: Prevents the 5-item bypass exploit!
        if (p.isListingAH) return socket.emit('systemMessage', "⏳ Processing... please wait.");
        p.isListingAH = true;

        try {
            // 1. Check if they hit the limit
            const { count, error } = await supabase.from('Auction_House').select('*', { count: 'exact', head: true }).eq('seller_name', p.id);
            if (count >= 5) {
                p.isListingAH = false; // Release lock
                return socket.emit('systemMessage', "❌ You can only have 5 items on the Auction House at once.");
            }

            const inv = Array.isArray(p.inventory) ? p.inventory : [];
            let originalItem = inv[data.invIndex];
            if (!originalItem) { p.isListingAH = false; return socket.emit('systemMessage', "Item not found."); }

           // 🛡️ ANTI-CHEAT: Block server from auctioning cosmetics/pets
            if (originalItem.type === 'aura' || originalItem.aura) {
                p.isListingAH = false;
                return socket.emit('systemMessage', "❌ Cosmetics, Pets, and enchanted gear cannot be auctioned. Extract it first!");
            }

            // 🛡️ THE FIX: Block server from auctioning bound high-tier gear
            if ((originalItem.rarity === 'Godly' || originalItem.rarity === 'Divine') && originalItem.enhanceLevel > 0) {
                p.isListingAH = false;
                return socket.emit('systemMessage', "❌ Enhanced Godly and Divine equipment cannot be auctioned.");
            }

            // 2. Create the exact item data to save (Force quantity to 1)
            let auctionItem = JSON.parse(JSON.stringify(originalItem));
            auctionItem.quantity = 1;

            // 3. Deduct from inventory
            if (originalItem.quantity > 1) {
                originalItem.quantity -= 1;
            } else {
                inv[data.invIndex] = null;
            }
            p.inventory = inv;

            // 4. Update DB Inventory & Insert Auction
            await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
            await supabase.from('Auction_House').insert([{
                seller_name: p.id,
                item_name: auctionItem.name,
                item_data: auctionItem,
                price: Math.floor(data.price)
            }]);
            
            socket.emit('syncInventory', p.inventory);
            socket.emit('ah_listSuccess');
            p.isListingAH = false; // Release lock
        } catch (e) {
            console.error("AH List Error:", e);
            p.isListingAH = false; // Release lock
            socket.emit('systemMessage', "Server error listing item.");
        }
    });

    socket.on('ah_cancel', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !data.auctionId) return;

        try {
            const { data: auc } = await supabase.from('Auction_House').select('*').eq('id', data.auctionId).single();
            if (!auc || auc.seller_name !== p.id) return socket.emit('systemMessage', "Auction not found.");

            // Give item back
            const inv = Array.isArray(p.inventory) ? p.inventory : new Array(20).fill(null);
            const emptySlot = inv.findIndex(i => i === null);
            if (emptySlot === -1) return socket.emit('systemMessage', "❌ Inventory full! Cannot cancel auction.");

            inv[emptySlot] = auc.item_data;
            p.inventory = inv;

            await supabase.from('Auction_House').delete().eq('id', data.auctionId);
            await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);

            socket.emit('syncInventory', p.inventory);
            socket.emit('systemMessage', `Cancelled auction for ${auc.item_name}.`);
            
            // Refresh their UI
            const { data: refreshData } = await supabase.from('Auction_House').select('*').eq('seller_name', p.id).order('created_at', { ascending: false });
            socket.emit('ah_myAuctions', { count: (refreshData || []).length, auctions: refreshData || [] });

        } catch (e) { console.error("AH Cancel Error:", e); }
    });

    socket.on('ah_buy', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !data.auctionId) return;

        try {
            // 1. Get the auction
            const { data: auc } = await supabase.from('Auction_House').select('*').eq('id', data.auctionId).single();
            if (!auc) return socket.emit('systemMessage', "❌ This item has already been sold or cancelled.");

            // 2. Check Buyer Gold
            if (p.gold < auc.price) return socket.emit('systemMessage', "❌ Not enough gold.");

            // 3. Check Buyer Inventory
            const inv = Array.isArray(p.inventory) ? p.inventory : new Array(20).fill(null);
            
            // We need to check if it stacks or needs an empty slot
            let added = false;
            let boughtItem = auc.item_data;
            if (['potion', 'material', 'consumable'].includes(boughtItem.type)) {
                let existIdx = inv.findIndex(i => i && i.name === boughtItem.name);
                if (existIdx !== -1) {
                    inv[existIdx].quantity = (inv[existIdx].quantity || 1) + 1;
                    added = true;
                }
            }
            if (!added) {
                const emptySlot = inv.findIndex(i => i === null);
                if (emptySlot === -1) return socket.emit('systemMessage', "❌ Inventory full!");
                inv[emptySlot] = boughtItem;
            }

            // 4. Delete the Auction to lock the transaction
            const { error: delErr } = await supabase.from('Auction_House').delete().eq('id', auc.id);
            if (delErr) throw delErr; // If someone else bought it a millisecond ago, this will fail safely.

            // 5. Update Buyer (Deduct Gold, Add Item)
            p.gold -= auc.price;
            p.inventory = inv;
            await supabase.from('Exonians').update({ gold: p.gold, inventory: p.inventory }).eq('character_name', p.id);

            // 6. Reward the Seller! (Direct DB update)
            const { data: sellerData } = await supabase.from('Exonians').select('gold').eq('character_name', auc.seller_name).single();
            if (sellerData) {
                await supabase.from('Exonians').update({ gold: sellerData.gold + auc.price }).eq('character_name', auc.seller_name);
                
                // If seller is online, sync their gold instantly
                const sellerSid = findSocketIdByPlayerId(auc.seller_name);
                if (sellerSid && onlinePlayers[sellerSid]) {
                    onlinePlayers[sellerSid].gold += auc.price;
                    io.to(sellerSid).emit('purchaseSuccess', { newGold: onlinePlayers[sellerSid].gold, inventory: onlinePlayers[sellerSid].inventory });
                    io.to(sellerSid).emit('systemMessage', `💰 Auction Sold: ${auc.item_name} for ${auc.price} Gold!`);
                }
            }

            // 7. Send System Mail Receipt to Seller
            await supabase.from('System_Mail').insert([{
                recipient_name: auc.seller_name,
                message_text: `Your auction for [${auc.item_name}] has sold!\n\n${auc.price} Gold has been automatically deposited into your account.`,
                is_claimed: false
            }]);

            // 8. Tell Buyer Success
            socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory });
            socket.emit('systemMessage', `🛒 Successfully purchased ${auc.item_name} for ${auc.price} Gold!`);
            
            // Refresh Browse Tab
            let q = supabase.from('Auction_House').select('*').order('created_at', { ascending: false }).limit(50);
            const { data: freshAh } = await q;
            socket.emit('ah_searchResults', freshAh || []);

        } catch (e) {
            console.error("AH Buy Error:", e);
            socket.emit('systemMessage', "Transaction failed.");
        }
    });
socket.on('requestSell', async (data) => {
    const p = onlinePlayers[socket.id];
    if (!p) return;

    const inv = Array.isArray(p.inventory) ? p.inventory : [];
    const requestedItemId = data?.itemId;
    const requestedIndex = typeof data?.index === 'number' ? data.index : -1;

    if (!requestedItemId) {
        return socket.emit('systemMessage', 'Invalid sell request.');
    }

    let sellIndex = -1;

    if (
        requestedIndex >= 0 &&
        requestedIndex < inv.length &&
        inv[requestedIndex] &&
        inv[requestedIndex].id === requestedItemId
    ) {
        sellIndex = requestedIndex;
    } else {
        sellIndex = inv.findIndex(item => item && item.id === requestedItemId);
    }

    if (sellIndex === -1) {
        return socket.emit('systemMessage', 'Sell blocked: item not found.');
    }

    const serverItem = inv[sellIndex];
    if (!serverItem) {
        return socket.emit('systemMessage', 'Item no longer exists.');
    }

    // 🛡️ ANTI-CHEAT: Block server from selling cosmetics/pets AND enchanted gear
    if (serverItem.type === 'aura' || serverItem.aura) {
        return socket.emit('systemMessage', '❌ Cosmetics, Pets, and enchanted gear cannot be sold. Extract it first!');
    }

    // 🛡️ SECURITY: Force everything to be a clean number
    let baseVal = (Number(serverItem.level) || 1) * 2;
    let multiplier = { "Starter": 1, "Basic": 1, "Rare": 1, "Unique": 2, "Legendary": 3, "Godly": 5 }[serverItem.rarity] || 1;
    
    let sellPrice = Math.floor(baseVal * multiplier);
    
    // Ensure quantity is a real number and not negative
    let safeQty = Math.max(1, Math.min(999, Number(serverItem.quantity) || 1));
    sellPrice *= safeQty;

    // Safety check: Don't let a single sell give more than 500k gold
    sellPrice = Math.min(500000, sellPrice);

    p.gold += sellPrice;
    inv[sellIndex] = null;
    p.inventory = inv;

    try {
        await supabase
            .from('Exonians')
            .update({
                gold: p.gold,
                inventory: p.inventory
            })
            .eq('character_name', p.id);
    } catch (e) {
        console.error('[SELL ERROR]', e.message);
        return socket.emit('systemMessage', 'Server error during sell.');
    }

    socket.emit('sellSuccess', {
        newGold: p.gold,
        inventory: p.inventory,
        price: sellPrice
    });
});
    // ==========================================
    // 🗺️ MAZE GUIDE & FAST TRAVEL ENGINE
    // ==========================================
    socket.on('requestMazeTeleport', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.isGhost) return;
        
        const targetFloor = parseInt(data.targetFloor);
        if (isNaN(targetFloor) || targetFloor < 1) return;

        // 🧮 SCALABLE MATH: Map is floorN, Portal is N * 2
        const targetMapId = `floor${targetFloor}`;
        const targetPortalId = targetFloor * 2;

       // Helper function to extract highest floor from title safely
        const getMaxFloor = (playerObj) => {
            let maxF = 0;
            // 🛡️ THE FIX: Check every possible place the title might be saved, and ignore case sensitivity!
            let titleString = (playerObj?.title || playerObj?.spriteData?.title || playerObj?.baseStats?.title || "").toUpperCase();
            
            const match = titleString.match(/FLOOR CONQUEROR (\d+)/);
            if (match) maxF = parseInt(match[1]);
            
            return maxF;
        };

        const pid = playerParty[p.id];
        
        if (pid && parties[pid]) {
            // --- PARTY MODE ---
            const party = parties[pid];
            
            if (party.leaderId !== p.id) {
                return socket.emit('systemMessage', "❌ Only the Party Leader can use the Maze Guide.");
            }

            let allEligible = true;
            let ineligibleName = "";
            
            // Verify every single member before authorizing the jump
            for (const memberId of party.members) {
                const mp = getPlayerById(memberId);
                if (!mp) {
                    allEligible = false; ineligibleName = memberId + " (Offline)"; break;
                }
                if (mp.instanceId !== p.instanceId) {
                    allEligible = false; ineligibleName = mp.name + " (Not in same map)"; break;
                }
                if (mp.isGhost) {
                    allEligible = false; ineligibleName = mp.name + " (Dead)"; break;
                }
                if (getMaxFloor(mp) < targetFloor) {
                    allEligible = false; ineligibleName = mp.name; break;
                }
            }

            if (!allEligible) {
                socket.emit('systemMessage', `❌ Cannot teleport: ${ineligibleName} has not conquered Floor ${targetFloor} yet.`);
                return;
            }

            // Everyone passed! Sync the teleport to the entire party
            for (const memberId of party.members) {
                const msid = findSocketIdByPlayerId(memberId);
                if (msid) {
                    io.to(msid).emit('teleportApproved', { portalId: targetPortalId, targetMapId: targetMapId, exactTarget: true });
                }
            }
        } else {
            // --- SOLO MODE ---
            if (getMaxFloor(p) < targetFloor) {
                return socket.emit('systemMessage', `❌ You have not conquered Floor ${targetFloor} yet.`);
            }
            // Authorized!
            socket.emit('teleportApproved', { portalId: targetPortalId, targetMapId: targetMapId, exactTarget: true });
        }
    });

    // ⚔️ MAZE TRIALS SYSTEM
    socket.on('requestMazeTrial', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.isGhost) return;

        if (p.isStartingInstance) return;
        p.isStartingInstance = true;
        setTimeout(() => { if (onlinePlayers[socket.id]) onlinePlayers[socket.id].isStartingInstance = false; }, 3000);

        const targetFloor = parseInt(data.targetFloor);
        if (isNaN(targetFloor) || targetFloor < 1) return;

        const targetMapId = `floor${targetFloor}`;
        const targetPortalId = targetFloor * 2;

        const pid = playerParty[p.id];
        let playersToEnter = [p];

        if (pid && parties[pid]) {
            const party = parties[pid];
            if (party.leaderId !== p.id && !isAdmin(p.id)) {
                return socket.emit('systemMessage', "❌ Only the Party Leader can start a Maze Trial.");
            }

            playersToEnter = [];
            for (const memberId of party.members) {
                const mp = getPlayerById(memberId);
                if (!mp) return socket.emit('systemMessage', `❌ Cannot start: ${memberId} is offline.`);
                if (mp.isGhost) return socket.emit('systemMessage', `❌ Cannot start: ${memberId} is dead.`);
                if (mp.instanceId !== p.instanceId) return socket.emit('systemMessage', `❌ Cannot start: ${memberId} is not in the same map.`);
                
                const now = new Date();
                let todayMidnight = new Date();
                todayMidnight.setUTCHours(0, 0, 0, 0);
                const resetTs = todayMidnight.getTime();

                if (!mp.baseStats.mazeTrialReset || mp.baseStats.mazeTrialReset < resetTs) {
                    mp.baseStats.mazeTrialEntries = 1;
                    mp.baseStats.mazeTrialReset = Date.now();
                }

                if (mp.baseStats.mazeTrialEntries <= 0 && !isAdmin(mp.id)) {
                    return socket.emit('systemMessage', `❌ Cannot start: ${mp.name} has already done a Maze Trial today.`);
                }
                playersToEnter.push(mp);
            }
        } else {
            const now = new Date();
            let todayMidnight = new Date();
            todayMidnight.setUTCHours(0, 0, 0, 0);
            const resetTs = todayMidnight.getTime();

            if (!p.baseStats.mazeTrialReset || p.baseStats.mazeTrialReset < resetTs) {
                p.baseStats.mazeTrialEntries = 1;
                p.baseStats.mazeTrialReset = Date.now();
            }

            if (p.baseStats.mazeTrialEntries <= 0 && !isAdmin(p.id)) {
                return socket.emit('systemMessage', '❌ You have already done a Maze Trial today. Resets at midnight UTC.');
            }
        }

        playersToEnter.forEach(async (mp) => {
            if (!isAdmin(mp.id) && mp.baseStats) {
                mp.baseStats.mazeTrialEntries = 0;
                mp.baseStats.mazeTrialReset = Date.now();
                await supabase.from('Exonians').update({ base_stats: mp.baseStats }).eq('character_name', mp.id);
                
                // 🛡️ ACCOUNT-WIDE LOCK: Find all alt characters with the same email and lock them too!
                const msid = findSocketIdByPlayerId(mp.id);
                const mSocket = msid ? io.sockets.sockets.get(msid) : null;
                
                if (mSocket && mSocket.email) {
                    const { data: alts } = await supabase.from('Exonians').select('character_name, base_stats').eq('email', mSocket.email);
                    if (alts) {
                        for (let alt of alts) {
                            if (alt.character_name !== mp.id) {
                                let altStats = alt.base_stats || {};
                                altStats.mazeTrialEntries = 0;
                                altStats.mazeTrialReset = Date.now();
                                await supabase.from('Exonians').update({ base_stats: altStats }).eq('character_name', alt.character_name);
                            }
                        }
                    }
                }
                
                if (msid) io.to(msid).emit('systemMessage', `🎟️ Maze Trial Entry used (Account-Wide). Remaining today: 0`);
            }
            mp.isMazeTrial = true; // 🛡️ Set the instancing flag
        });

        // Teleport everyone
        playersToEnter.forEach(mp => {
            mp.teleportGrace = Date.now() + 4000; 
            mp.expectedMapId = targetMapId; 
            const msid = findSocketIdByPlayerId(mp.id);
            if (msid) {
                // 🛡️ THE FIX: Use teleportApproved so it correctly calculates exact map portal spawn coordinates!
                io.to(msid).emit('teleportApproved', { portalId: targetPortalId, targetMapId: targetMapId, exactTarget: true });
                io.to(msid).emit('systemMessage', `Entering Maze Trial: Floor ${targetFloor}...`);
            }
        });
    });

  // ==========================================
    // ⚔️ TAVERN SYSTEM & LEADERBOARD
   socket.on('startTavern', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.isGhost) return;

        // 🛡️ ANTI-MACRO EXPLOIT LOCK: Prevents spamming while DB saves
        if (p.isStartingInstance) return;
        p.isStartingInstance = true;
        setTimeout(() => { if (onlinePlayers[socket.id]) onlinePlayers[socket.id].isStartingInstance = false; }, 3000);

      // 🛡️ LEVEL 50 LOCK
        if (p.level < 50 && !isAdmin(p.id)) {
            return socket.emit('systemMessage', "❌ You must be at least Level 50 to enter the Training Tavern.");
        }

       // 🛡️ SERVER-SIDE PARTY BLOCK
        if (playerParty[p.id] && !isAdmin(p.id)) {
            return socket.emit('systemMessage', "❌ Access Denied: Leave your party to enter the solo challenge.");
        }

        // 📅 STRICT UTC WEEKLY MONDAY RESET (8:00 AM PHT)
        const now = new Date();
        let dayOfWeek = now.getUTCDay(); // Strict UTC Day
        let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        
        let lastMonday = new Date(now.getTime());
        lastMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
        lastMonday.setUTCHours(0, 0, 0, 0); // Strict UTC Midnight
        const lastMondayTs = lastMonday.getTime();

        // If they have never entered, OR their last reset timestamp is older than THIS week's Monday...
        if (!p.baseStats.tavernReset || p.baseStats.tavernReset < lastMondayTs) {
            p.baseStats.tavernEntries = 5;
            p.baseStats.tavernReset = Date.now(); // Stamp it so it knows they claimed this week
        }

        if (p.baseStats.tavernEntries <= 0 && !isAdmin(p.id)) {
            return socket.emit('systemMessage', '❌ You have no Tavern entries left this week. Resets Monday at 12:00 AM.');
        }

        p.baseStats.tavernEntries--;
        supabase.from('Exonians').update({ base_stats: p.baseStats }).eq('character_name', p.id).then(()=>{});

        // 🌟 Set the pending boss securely in memory
        p.pendingTavernBoss = {
            mobType: data.mobType,
            level: data.level
        };

        // Teleport them. The injection happens when they arrive!
        p.expectedMapId = 'trainingtavern'; // 🎟️ THE FIX: Hand them a secure server ticket!
        socket.emit('forceTeleport', { mapId: 'trainingtavern', x: 960, y: 1000 });
        socket.emit('systemMessage', 'Entering the Training Tavern...');
    });
    socket.on('startHauntedHouse', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.isGhost) return;

        if (p.isStartingInstance) return;
        p.isStartingInstance = true;
        setTimeout(() => { if (onlinePlayers[socket.id]) onlinePlayers[socket.id].isStartingInstance = false; }, 3000);

        if (playerParty[p.id] && !isAdmin(p.id)) {
            return socket.emit('systemMessage', "❌ The Haunted House is a solo-only challenge. Please leave your party.");
        }

        let cost = 0; let minLvl = 1; let maxLvl = 15;
        if (data.difficulty === 'Easy') { cost = 1000; minLvl = 1; maxLvl = 15; }
        else if (data.difficulty === 'Normal') { cost = 10000; minLvl = 16; maxLvl = 30; }
        else if (data.difficulty === 'Hard') { cost = 300000; minLvl = 31; maxLvl = 80; }

        if (p.gold < cost) {
            socket.emit('closeHauntedUI');
            return socket.emit('systemMessage', `❌ Not enough gold! You need ${cost.toLocaleString()} G.`);
        }

        p.gold -= cost;
        supabase.from('Exonians').update({ gold: p.gold }).eq('character_name', p.id).then(()=>{});
        socket.emit('purchaseSuccess', { newGold: p.gold, inventory: p.inventory }); // Sync gold UI safely

        const targetMapId = 'hauntedhouse';
        const newInstId = getInstanceId(p.id, targetMapId);
        const randomLevel = Math.floor(Math.random() * (maxLvl - minLvl + 1)) + minLvl;

        p.teleportGrace = Date.now() + 4000; 
        p.expectedMapId = targetMapId; 
        
        socket.emit('closeHauntedUI');
        socket.emit('forceTeleport', { mapId: targetMapId, x: 960, y: 1000 });
        socket.emit('systemMessage', `👻 Entering Haunted House (${data.difficulty})... Boss Level: ${randomLevel}`);

        setTimeout(() => {
            if (!worlds[newInstId]) worlds[newInstId] = { monsters: {}, pets: {}, collisions: [], teleports: [] };
            worlds[newInstId].monsters = {}; 

            const mobId = `hh_boss_${Date.now()}`;
            // 💀 Spawns the Void King from your database at the rolled level!
            const newMob = spawnMonster(newInstId, mobId, 'floor_boss_wraith', { spawnArea: { minX: 960, minY: 400 }, level: randomLevel });
            worlds[newInstId].monsters[mobId] = newMob;
            
            io.to(newInstId).emit('monsterSpawned', serializeMonster(newMob));
        }, 1000);
    });
socket.on('startDungeon', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.isGhost) return;

        // 🛡️ ANTI-MACRO EXPLOIT LOCK: Prevents spamming while DB saves
        if (p.isStartingInstance) return;
        p.isStartingInstance = true;
        setTimeout(() => { if (onlinePlayers[socket.id]) onlinePlayers[socket.id].isStartingInstance = false; }, 3000);

        const pid = playerParty[p.id];
        let playersToEnter = [p];

        // 1. Party Logic & Entry Verification
        if (pid && parties[pid]) {
            const party = parties[pid];
            
            // Only the leader can start the dungeon for the group
            if (party.leaderId !== p.id && !isAdmin(p.id)) {
                return socket.emit('systemMessage', "❌ Only the Party Leader can start the dungeon.");
            }
            
            // Gather all members and strictly verify them
            playersToEnter = [];
            for (const memberId of party.members) {
                const mp = getPlayerById(memberId);
                if (!mp) {
                    io.to(p.instanceId).emit('closeDungeonUI');
                    return socket.emit('systemMessage', `❌ Cannot start: ${memberId} is offline.`);
                }
                if (mp.isGhost) {
                    io.to(p.instanceId).emit('closeDungeonUI');
                    return socket.emit('systemMessage', `❌ Cannot start: ${memberId} is dead.`);
                }
                if (mp.instanceId !== p.instanceId) {
                    io.to(p.instanceId).emit('closeDungeonUI');
                    return socket.emit('systemMessage', `❌ Cannot start: ${memberId} is not in the same map.`);
                }
                
           const now = new Date();
                let dayOfWeek = now.getUTCDay();
                let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
                
                let lastMonday = new Date(now.getTime());
                lastMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
                lastMonday.setUTCHours(0, 0, 0, 0);
                const lastMondayTs = lastMonday.getTime();

                if (!mp.baseStats.dungeonReset || mp.baseStats.dungeonReset < lastMondayTs) {
                    mp.baseStats.dungeonEntries = 7;
                    mp.baseStats.dungeonReset = Date.now();
                }

                if (mp.baseStats.dungeonEntries <= 0 && !isAdmin(mp.id)) {
                    for (const mId of party.members) {
                        const msid = findSocketIdByPlayerId(mId);
                        if (msid) io.to(msid).emit('closeDungeonUI');
                    }
                    return socket.emit('systemMessage', `❌ Cannot start: ${mp.name} has no Dungeon entries left this week.`);
                }
                
                // 🛡️ EXTREME PARTY CHECK: Everyone must be 50!
                if (data.difficulty === 'Extreme' && mp.level < 50 && !isAdmin(mp.id)) {
                    for (const mId of party.members) {
                        const msid = findSocketIdByPlayerId(mId);
                        if (msid) io.to(msid).emit('closeDungeonUI');
                    }
                    return socket.emit('systemMessage', `❌ Cannot start: ${mp.name} must be Level 50 for Extreme mode.`);
                }
                
                playersToEnter.push(mp);
            }
        } else {
         const now = new Date();
            let dayOfWeek = now.getUTCDay();
            let daysSinceMonday = (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
            
            let lastMonday = new Date(now.getTime());
            lastMonday.setUTCDate(now.getUTCDate() - daysSinceMonday);
            lastMonday.setUTCHours(0, 0, 0, 0);
            const lastMondayTs = lastMonday.getTime();

            if (!p.baseStats.dungeonReset || p.baseStats.dungeonReset < lastMondayTs) {
                p.baseStats.dungeonEntries = 7;
                p.baseStats.dungeonReset = Date.now();
            }

            if (p.baseStats.dungeonEntries <= 0 && !isAdmin(p.id)) {
                socket.emit('closeDungeonUI');
                return socket.emit('systemMessage', '❌ You have no Dungeon entries left this week.');
            }
            if (data.difficulty === 'Extreme' && p.level < 50 && !isAdmin(p.id)) {
                socket.emit('closeDungeonUI');
                return socket.emit('systemMessage', '❌ You must be Level 50 to enter Extreme mode.');
            }
        }

        /// 🌟 CRASH-PROOF FIX: Deduct entries carefully so the server doesn't halt
        playersToEnter.forEach(mp => {
            if (!isAdmin(mp.id) && mp.baseStats) {
                mp.baseStats.dungeonEntries = Math.max(0, (mp.baseStats.dungeonEntries || 7) - 1);
                supabase.from('Exonians').update({ base_stats: mp.baseStats }).eq('character_name', mp.id).then(()=>{});
                
                // 🎟️ THE UI FIX: Tell the player instantly how many entries they have left!
                const msid = findSocketIdByPlayerId(mp.id);
                if (msid) {
                    io.to(msid).emit('systemMessage', `🎟️ Dungeon Entry used. Remaining: ${mp.baseStats.dungeonEntries}/7`);
                }
            }
        });

        // Determine Level based on Difficulty
        let dLevel = 10;
        if (data.difficulty === 'Medium') dLevel = 30;
        if (data.difficulty === 'Hard') dLevel = 50;

        const targetMapId = 'dungeon1';
        const newInstId = getInstanceId(p.id, targetMapId);

        // 🌟 FORCE THE TELEPORT TO EVERYONE IN THE PARTY (Tavern Style)
        playersToEnter.forEach(mp => {
            mp.dungeonReturnData = data.returnData; 
            mp.teleportGrace = Date.now() + 4000; 
            mp.expectedMapId = targetMapId; // 🎟️ THE FIX: Hand them a secure server ticket!
            const msid = findSocketIdByPlayerId(mp.id);
            if (msid) {
                io.to(msid).emit('closeDungeonUI'); 
                io.to(msid).emit('forceTeleport', { mapId: targetMapId, x: 960, y: 1000 });
                io.to(msid).emit('systemMessage', `Entering Dungeon on ${data.difficulty} Mode...`);
            }
        });

        // Wait 1 second for everyone to load, then populate the room
        setTimeout(() => {
            if (!worlds[newInstId]) worlds[newInstId] = { monsters: {}, pets: {}, collisions: [], teleports: [] };
            worlds[newInstId].monsters = {}; 

            const spawns = [
                { key: 'floor_boss1', x: 960, y: 400 },
                { key: 'mini_boss1', x: 700, y: 550 },
                { key: 'common_mobs1', x: 1220, y: 550 },
                { key: 'common_mobs1', x: 800, y: 750 },
                { key: 'common_mobs1', x: 1120, y: 750 }
            ];

            spawns.forEach((sp, i) => {
                // ⚙️ EXTREME STAT FIX: You can easily edit '75' below to make them harder/easier!
                let finalLevel = dLevel;
                if (data.difficulty === 'Extreme') finalLevel = 75;

                const mobId = `d1_mob_${i}`;
                const newMob = spawnMonster(newInstId, mobId, sp.key, { spawnArea: { minX: sp.x, minY: sp.y }, level: finalLevel });
                worlds[newInstId].monsters[mobId] = newMob;
                io.to(newInstId).emit('monsterSpawned', serializeMonster(newMob));
            });

          // ⏳ EXTREME MODE 20-MINUTE TIMER
            if (data.difficulty === 'Extreme') {
                // 🛡️ THE FIX: Send the timer directly to the players' personal socket IDs!
                // This guarantees they receive the timer even if they are stuck on a loading screen.
                playersToEnter.forEach(mp => {
                    const msid = findSocketIdByPlayerId(mp.id);
                    if (msid) {
                        io.to(msid).emit('systemMessage', `<span style="color:#ff9800; font-weight:bold;">⏳ EXTREME MODE: You have exactly 20 minutes to clear this dungeon!</span>`);
                        io.to(msid).emit('dungeonTimerStart', { durationMs: 20 * 60 * 1000, startTime: Date.now() });
                    }
                });
                
                worlds[newInstId].failTimer = setTimeout(() => {
                    if (worlds[newInstId]) {
                        io.to(newInstId).emit('dungeonTimerStop');
                        io.to(newInstId).emit('systemMessage', "⏳ Time is up! You failed to clear the Extreme Dungeon.");
                        const playersInRoom = playersInInstance(newInstId);
                        playersInRoom.forEach(roomPlayer => {
                            roomPlayer.mapId = 'town';
                            roomPlayer.x = 960; roomPlayer.y = 1000;
                            roomPlayer.instanceId = getInstanceId(roomPlayer.id, 'town');
                            const rsid = findSocketIdByPlayerId(roomPlayer.id);
                            if (rsid) io.to(rsid).emit('forceTeleport', { mapId: 'town', x: 960, y: 1000 });
                            roomPlayer.dungeonReturnData = null; 
                        });
                        delete worlds[newInstId]; // Wipe the room to clean memory
                    }
                }, 20 * 60 * 1000); // 20 Minutes
            }
        }, 1000);
    });
    socket.on('getTavernLeaderboard', async () => {
        // 🛡️ THE FIX: Fetch up to 1000 records so we don't miss the high-level bosses
        const { data } = await supabase.from('Tavern_Leaderboard').select('*').limit(1000);
        
        let sorted = (data || []).sort((a, b) => {
            const w = { 'floor_boss': 3, 'mini_boss': 2, 'common_mobs': 1 };
            let aW = w[a.mob_type] || 0; let bW = w[b.mob_type] || 0;
            if (aW !== bW) return bW - aW; 
            if (a.mob_level !== b.mob_level) return b.mob_level - a.mob_level; 
            return a.time_taken - b.time_taken; 
        });

        // 🌟 Slice to exactly 50 AFTER the sort, so the UI correctly numbers them 1 to 50!
        socket.emit('updateLeaderboardUI', sorted.slice(0, 50));
    });
  // ==========================================
    // ⚔️ NEUTRAL ZONE PvP ENGINE
    // ==========================================
    socket.on('attackPlayer', (payload) => {
        const p = onlinePlayers[socket.id];
        if (!p || p.isGhost || p.mapId !== 'neutralzone') return;
        
        const now = Date.now();
        if (p.frozenUntil && now < p.frozenUntil) return; // ❄️ Frozen players cannot attack!
        if (payload.skillId === 'basic') {
            if (p.lastBasicAttack && now - p.lastBasicAttack < 800) return;
            p.lastBasicAttack = now;
        }

        const target = getPlayerById(payload.targetId);
        if (!target || target.isGhost || target.mapId !== 'neutralzone' || target.untargetableUntil > now) return;

        // 🛡️ ANTI-TK: Prevent damaging your own party members
        if (playerParty[p.id] && playerParty[p.id] === playerParty[target.id]) return;

        // Calculate Distance
        const pcx = p.x + 24; const pcy = p.y + 48; 
        const tcx = target.x + 24; const tcy = target.y + 48;
        
        let dist = Math.hypot(pcx - tcx, pcy - tcy);
        if (payload.skillId === 'pet' && world.pets && world.pets[payload.petId]) {
            const pet = world.pets[payload.petId];
            dist = Math.hypot(pet.x - tcx, pet.y - tcy);
        }

        let maxDist = 350;
        let finalMax = payload.skillId === 'pet' ? 450 : maxDist;
        if (dist > finalMax) return;

        // 🌫️ SMOKE BOMB MISS CHECK (Attacker is blinded)
        if (p.smokeBombUntil && now < p.smokeBombUntil) {
            if (Math.random() < 0.75) {
                io.to('neutralzone').emit('attackEvaded', { targetId: target.id, attackerId: p.id, type: 'miss' });
                return;
            }
        }

        // 🍃 NINJA ASSASSIN DODGE CHECK
        if (target.baseStats?.playerClass === 'Ninja Assassin' && target.level >= 25) {
            let dodgeChance = target.level >= 75 ? 0.35 : 0.25;
            if (Math.random() < dodgeChance) {
                io.to('neutralzone').emit('attackEvaded', { targetId: target.id, attackerId: p.id, type: 'dodge' });
                return;
            }
        }

        // ⚔️ BLADEMASTER PARRY CHECK
        if (target.parryUntil && now < target.parryUntil) {
            if (Math.random() < 0.75) {
                io.to('neutralzone').emit('attackEvaded', { targetId: target.id, attackerId: p.id, type: 'parry' });
                return;
            }
        }

        // Calculate Damage (Basic hit for PvP)
        let isMagicClass = ['Healer', 'Summoner', 'Ice Master'].includes(p.baseStats?.playerClass);
        let serverAtkPwr = isMagicClass ? getServerMagicAttack(p) : getServerAttackPower(p);
        let trueDmg = Math.floor(serverAtkPwr * (0.9 + Math.random() * 0.2));
        let pClass = p.baseStats?.playerClass;
        let hitCount = 1;

      // 🌀 PHANTOM STRIKER: Craftiness Reset PvP
        if (pClass === 'Phantom Striker' && p.level >= 75 && payload.skillId === 'basic') {
            if (Math.random() < 0.25) {
                for (let key in p.skillCooldowns) p.skillCooldowns[key] = 0;
                socket.emit('systemMessage', `<span style="color:#00E5FF; font-weight:bold;">🌀 Your Craftiness reset your skill cooldowns!</span>`);
                const msid = findSocketIdByPlayerId(p.id);
                if (msid) io.to(msid).emit('cdReset'); 
            }
        }

        // ⚔️ PHANTOM STRIKER: Sleight of Hand PvP
        if (pClass === 'Phantom Striker' && p.level >= 25 && payload.skillId !== 'pet' && Math.random() < 0.50) {
            hitCount = 2;
            socket.emit('systemMessage', `<span style="color:#ffffff; font-weight:bold;">🗡️ Sleight of Hand triggered a double attack!</span>`);
        }

        // 🔫 SKILL DAMAGE LOGIC FOR PVP
        if (payload.skillId === 'snp2') {
             if (pClass !== 'Sniper') return;
             if (p.skillCooldowns['snp2'] && now < p.skillCooldowns['snp2'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 2);
             p.skillCooldowns['snp2'] = now + getReducedCd(p, 5000); 
             
         } else if (payload.skillId === 'snp3') {
             if (pClass !== 'Sniper') return;
             if (p.skillCooldowns['snp3'] && now < p.skillCooldowns['snp3'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 4);
             p.skillCooldowns['snp3'] = now + getReducedCd(p, 50000); 
             
         } else if (payload.skillId === 'exp1') {
             if (pClass !== 'Explosives Expert') return;
             if (p.skillCooldowns['exp1'] && now < p.skillCooldowns['exp1'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr); 
             p.skillCooldowns['exp1'] = now + getReducedCd(p, 12000); 

             let durationTicks = p.level >= 25 ? 10 : 3;
             let ticksDone = 0;
             const targetPlayerId = target.id;
             
            const fireInt = setInterval(() => {
    ticksDone++;
    let tp = getPlayerById(targetPlayerId);
    if (ticksDone > durationTicks || !tp || tp.isGhost || tp.mapId !== 'neutralzone') {
        clearInterval(fireInt);
        return;
    }

    let dotDmg = Math.max(1, Math.floor(serverAtkPwr) - getServerDefense(tp));
    tp.currentHp -= dotDmg;
    if (tp.currentHp <= 0) tp.currentHp = 1; // Safely burns them to 1 HP

    io.to('neutralzone').emit('playerHit', {
        targetId: tp.id,
        attackerId: p.id,
        damage: dotDmg,
        newHp: Math.max(0, tp.currentHp)
    });
}, 1000);
             
         } else if (payload.skillId === 'exp3') {
             if (pClass !== 'Explosives Expert') return;
             if (p.skillCooldowns['exp3'] && now < p.skillCooldowns['exp3'] && !isAdmin(p.id)) return; 
             trueDmg = Math.floor(serverAtkPwr * 5); 
             p.skillCooldowns['exp3'] = now + getReducedCd(p, 30000); 

         // 🌫️ NINJA: Smoke Bomb
         } else if (payload.skillId === 'nin1') {
             if (pClass !== 'Ninja Assassin') return;
             if (p.skillCooldowns['nin1'] && now < p.skillCooldowns['nin1'] && !isAdmin(p.id)) return; 
             
             target.smokeBombUntil = now + 10000;
             trueDmg = 1; // Pure 1 damage impact
             p.skillCooldowns['nin1'] = now + getReducedCd(p, 10000); 
             
         // 🗡️ PHANTOM: Blink Stab
         } else if (payload.skillId === 'phs3') {
             if (pClass !== 'Phantom Striker') return;
             if (p.skillCooldowns['phs3'] && now < p.skillCooldowns['phs3'] && !isAdmin(p.id)) return; 
             
             trueDmg = Math.floor(serverAtkPwr * 2);
             p.skillCooldowns['phs3'] = now + getReducedCd(p, 30000); 
             
         } else if (payload.skillId === 'fox_bite') {
             trueDmg = 1; 
         } else if (payload.skillId === 'bld3') {
             if (pClass !== 'Blademaster') return; 
             if (p.skillCooldowns['heavyAttack'] && now < p.skillCooldowns['heavyAttack'] && !isAdmin(p.id)) return; 
             
             trueDmg = Math.floor(serverAtkPwr * 5);
             p.skillCooldowns['heavyAttack'] = now + getReducedCd(p, 49000); 
             
         } else if (payload.skillId === 'ice1') {
             if (pClass !== 'Ice Master') return; 
             if (p.skillCooldowns['ice1'] && now < p.skillCooldowns['ice1'] && !isAdmin(p.id)) return; 
             
             trueDmg = Math.floor(serverAtkPwr * 2);
             p.skillCooldowns['ice1'] = now + getReducedCd(p, 23000);
             
         } else if (payload.skillId === 'ice3') {
             if (pClass !== 'Ice Master') return; 
             if (p.skillCooldowns['ice3'] && now < p.skillCooldowns['ice3'] && !isAdmin(p.id)) return; 
             
             trueDmg = Math.floor(serverAtkPwr * 6); 
             p.skillCooldowns['ice3'] = now + getReducedCd(p, 98000); 
             
     } else if (payload.skillId === 'pet') {
             const world = worlds[p.instanceId];
             const pet = world.pets[payload.petId]; 
             
             if (!pet) return;
             if (pet.lastAttackTs && now - pet.lastAttackTs < 900) return; 
             pet.lastAttackTs = now;
             
             if (pet.isBigBoss) {
                 // 👑 BIG BOSS PvP/PvE: Fixed Damage
                 let bossAtk = 450;
                 if (pet.enhancedUntil && Date.now() < pet.enhancedUntil) {
                     bossAtk = 1800; 
                 }
                 trueDmg = bossAtk;
             } else {
                 // 🟢 NORMAL SLIMES & 🥷 SHADOW CLONES PvP: % Scaling
                 let multiplier = 0.25; 
                 if (pet.enhancedUntil && Date.now() < pet.enhancedUntil) multiplier = 1.0; 
                 if (pet.isClone) multiplier = 1.0; // Clones always have 100% ATK!
                 
                 let sourceAtk = pet.isClone ? getServerAttackPower(p) : getServerMagicAttack(p);
                 trueDmg = Math.floor(sourceAtk * multiplier);
             }
             hitCount = 1; 
         }

        // 🌟 LEVEL 75 AoE LOGIC FOR PVP (Ice Splash & Big Explosion)
        let targetPlayers = [target];
        if (p.level >= 75) {
            if (pClass === 'Ice Master' && (payload.skillId === 'ice1' || payload.skillId === 'ice3')) {
                targetPlayers = Object.values(onlinePlayers).filter(rp => 
                    rp.mapId === 'neutralzone' && !rp.isGhost && !rp.isHiddenAdmin && 
                    rp.id !== p.id && !(playerParty[p.id] && playerParty[p.id] === playerParty[rp.id]) &&
                    Math.hypot(rp.x - target.x, rp.y - target.y) <= 300
                );
            }
            if (pClass === 'Explosives Expert' && payload.skillId === 'exp3') {
                targetPlayers = Object.values(onlinePlayers).filter(rp => 
                    rp.mapId === 'neutralzone' && !rp.isGhost && !rp.isHiddenAdmin && 
                    rp.id !== p.id && !(playerParty[p.id] && playerParty[p.id] === playerParty[rp.id]) &&
                    Math.hypot(rp.x - target.x, rp.y - target.y) <= 500
                );
            }
        }
        if (payload.skillId === 'pet' && payload.isBigBoss) {
            const pet = world.pets[payload.petId];
            // 🛡️ THE FIX: Earthquake drops on the BOSS's location, not the enemy's location!
            if (pet && (!pet.lastEqTs || now - pet.lastEqTs > 4000)) {
                pet.lastEqTs = now;
                targetPlayers = Object.values(onlinePlayers).filter(rp => 
                    rp.mapId === 'neutralzone' && !rp.isGhost && !rp.isHiddenAdmin && 
                    rp.id !== p.id && !(playerParty[p.id] && playerParty[p.id] === playerParty[rp.id]) &&
                    Math.hypot(rp.x - pet.x, rp.y - pet.y) <= 400
                );
                io.to(p.instanceId).emit('monsterSkill', { monsterId: payload.petId, skillName: 'Earthquake', x: pet.x, y: pet.y, radius: 400, color: 'blue' });
            }
        }
        // 🛡️ APPLY DAMAGE LOOP FOR PVP (Supports AoE & Double Hits!)
        for (let hc = 0; hc < hitCount; hc++) {
            setTimeout(() => {
                targetPlayers.forEach(tp => {
                    if (tp.isGhost || tp.mapId !== 'neutralzone') return;
                    
                    let dmg = payload.skillId === 'fox_bite' ? 1 : Math.max(1, trueDmg - getServerDefense(tp));
                    
                    // ❄️ ICE MASTER: Freeze Passive (Lv 25)
                    let didFreeze = false;
                    if (pClass === 'Ice Master' && p.level >= 25 && (payload.skillId === 'basic' || payload.skillId === 'ice1' || payload.skillId === 'ice3')) {
                        if (Math.random() < 0.25) { 
                            tp.frozenUntil = Date.now() + 3000; 
                            didFreeze = true; 
                        }
                    }

                    // 🩸 BLADEMASTER: Sharp Edge Bleed (Lv 75)
                    if (pClass === 'Blademaster' && p.level >= 75 && Math.random() < 0.25 && payload.skillId !== 'pet') {
                        const bleedDmg = Math.max(1, Math.floor(serverAtkPwr * 0.15));
                        let ticks = 0;
                        const bleedInt = setInterval(() => {
                            ticks++;
                            if (ticks > 3 || tp.isGhost || tp.mapId !== 'neutralzone') { clearInterval(bleedInt); return; }
                            tp.currentHp -= bleedDmg;
                            if (tp.currentHp < 0) tp.currentHp = 0;
                            
                            io.to('neutralzone').emit('playerHit', { 
                                targetId: tp.id, attackerId: p.id, damage: bleedDmg, newHp: tp.currentHp, didFreeze: false 
                            });
                            
                            // Safe Bleed Death check
                            if (tp.currentHp <= 0 && !tp.isGhost) {
                                tp.isGhost = true;
                                tp.currentPortal = null;
                                io.to('neutralzone').emit('remotePlayerGhosted', tp.id);
                                io.emit('systemMessage', `⚔️ [PvP] <span style="color:#f44336;">${p.name} has bled ${tp.name} to death!</span>`);
                                const tpSid = findSocketIdByPlayerId(tp.id);
                                if (tpSid) io.to(tpSid).emit('showDeathScreen');
                                supabase.from('Exonians').update({ current_hp: 0 }).eq('character_name', tp.id).then(()=>{});
                            }
                        }, 1000);
                    }

                    // 🩸 BERSERKER: I Love PAIN (Lv 75) - PVP VERSION
                    if (tp.baseStats?.playerClass === 'Berserker' && tp.level >= 75 && Math.random() < 0.15) {
                        const heal = Math.floor(dmg / 3);
                        dmg = dmg - heal;
                        tp.currentHp = Math.min(getServerTotalStat(tp, 'hp') || 100, tp.currentHp + heal);
                        io.to('neutralzone').emit('playerHealed', { id: tp.id, amount: heal, currentHp: tp.currentHp });
                    }

                    tp.currentHp -= dmg;
                    if (tp.currentHp <= 0 && tp.immortalUntil && Date.now() < tp.immortalUntil) {
                        tp.currentHp = 1;
                    }

                    io.to('neutralzone').emit('playerHit', { 
                        targetId: tp.id, attackerId: p.id, damage: dmg, newHp: Math.max(0, tp.currentHp), didFreeze: didFreeze
                    });

                    // Handle PvP Death
                    if (tp.currentHp <= 0) {
                        tp.currentHp = 0;
                        tp.isGhost = true;
                        tp.currentPortal = null;
                        
                        io.to('neutralzone').emit('remotePlayerGhosted', tp.id);
                        io.emit('systemMessage', `⚔️ [PvP] <span style="color:#f44336;">${p.name} has slain ${tp.name} in the Neutral Zone!</span>`);
                        
                        const tpSid = findSocketIdByPlayerId(tp.id);
                        if (tpSid) io.to(tpSid).emit('showDeathScreen');
                        
                        supabase.from('Exonians').update({ current_hp: 0 }).eq('character_name', tp.id).then(()=>{});
                    } else {
                        const tpSid = findSocketIdByPlayerId(tp.id);
                        if (tpSid) io.to(tpSid).emit('playerVitals', { currentHp: tp.currentHp, maxHp: tp.maxHp, level: tp.level });
                    }
                });
            }, hc * 150);
        }
    });
    // 🎒 INVENTORY DRAG & DROP SWAPPING/MERGING
    socket.on('swapInventory', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !p.inventory) return;
        
        const from = data.from; const to = data.to;
        if (from >= 0 && from < 20 && to >= 0 && to < 20 && from !== to) {
            let fromItem = p.inventory[from];
            let toItem = p.inventory[to];

            // If dropping a stackable item onto the same item, merge them!
            if (fromItem && toItem && fromItem.name === toItem.name && ['potion', 'material', 'consumable'].includes(fromItem.type)) {
                toItem.quantity = (toItem.quantity || 1) + (fromItem.quantity || 1);
                p.inventory[from] = null;
            } else {
                // Otherwise, perform a standard swap
                let temp = p.inventory[from];
                p.inventory[from] = p.inventory[to];
                p.inventory[to] = temp;
            }
            
            supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id).then(()=>{});
            socket.emit('syncInventory', p.inventory);
        }
    });

    // ✂️ SPLIT STACK LOGIC
    socket.on('splitInventoryItem', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !p.inventory) return;
        
        const idx = data.index; const amt = data.amount;
        if (idx < 0 || idx >= 20 || !p.inventory[idx]) return;
        
        let item = p.inventory[idx];
        
        // Ensure they have enough to split, and aren't trying to split 0
        if (item.quantity > 1 && amt > 0 && amt < item.quantity) {
            const emptySlot = p.inventory.findIndex(i => i === null);
            if (emptySlot === -1) {
                return socket.emit('systemMessage', "Inventory full! Cannot split.");
            }
            
            // Create the new split stack
            let newItem = JSON.parse(JSON.stringify(item));
            newItem.id = Date.now() + Math.random(); // Give it a unique ID to prevent glitches
            newItem.quantity = amt;
            
            // Reduce original stack
            item.quantity -= amt;
            
            p.inventory[emptySlot] = newItem;
            supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id).then(()=>{});
            socket.emit('syncInventory', p.inventory);
        }
    });

    // 🔗 ITEM CHAT LINKING
    socket.on('linkItem', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !data.item) return;
        
        const pid = playerParty[p.id];
        if (pid && parties[pid]) {
            // Broadcast the item data to everyone in the party
            for (const memberId of parties[pid].members) {
                const sid = findSocketIdByPlayerId(memberId);
                if (sid) {
                    io.to(sid).emit('partyItemLink', { from: p.id, item: data.item });
                }
            }
        } else {
            socket.emit('systemMessage', "You must be in a party to link items!");
        }
    });
  // ==========================================
    // 💳 HYBRID CASH SHOP (PayPal & Exo Gems)
    // ==========================================
    socket.on('requestShopAccess', () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        socket.emit('shopAuthState', { state: 'shop_open', exoGems: p.baseStats?.exoGems || 0 });
    });

    // 1. PAYPAL CHECKOUT (One-Time Cash)
    socket.on('requestCheckoutCode', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !data.itemId) return;

        socket.emit('systemMessage', '⏳ Connecting to PayPal... please wait.');

       const MASTER_CATALOG = {
            'aura_easter': { priceGems: 15, item: { name: "Easter Aura Stone", type: 'aura', auraId: 'easter', rarity: 'Divine', color: '#FFB7B2', description: "Click to apply to an Armor. Purely cosmetic.", quantity: 1 } },
            'pet_egg': { priceGems: 15, item: { name: "Easter Egg Pet", type: 'aura', auraId: 'egg', rarity: 'Divine', color: '#FFC1E3', description: "Click to apply to Leggings.", quantity: 1 } },
            'name_change': { priceGems: 15, item: { name: "Name Change Ticket", type: 'consumable', rarity: 'Legendary', color: '#ff9800', description: "Changes your character's name permanently.", quantity: 1 } },
            'edit_char': { priceGems: 15, item: { name: "Appearance Reroll Ticket", type: 'consumable', rarity: 'Legendary', color: '#2196F3', description: "Redesign your hair, skin color, and style.", quantity: 1 } },
            'pet_fox': { priceGems: 10, item: { name: "Spirit Fox Pet", type: 'aura', auraId: 'fox', rarity: 'Godly', color: '#ff7e00', description: "Click to apply to Leggings.", quantity: 1 } },
            'pet_owl': { priceUSD: '10.00', name: 'Night Owl Pet' },
            'aura_blaze': { priceUSD: '10.00', name: 'Blaze Aura Stone' },
            'aura_liquid': { priceUSD: '10.00', name: 'Liquid Aura Stone' },
            'aura_nature': { priceUSD: '10.00', name: 'Nature Aura Stone' },
            'divine_pack': { priceUSD: '10.00', name: 'Divine Stone Bundle (x5)' },
            'revival_pack': { priceUSD: '5.00', name: 'Revival Juice Bundle (x10)' }
        };

        const item = MASTER_CATALOG[data.itemId];
        if (!item) return socket.emit('systemMessage', "❌ Security Error: Item not in catalog.");

        try {
            const isLive = true; 
            const baseURL = isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
            const auth = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET).toString('base64');
            
            const tokenReq = await axios.post(`${baseURL}/v1/oauth2/token`, 'grant_type=client_credentials', {
                headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const orderReq = await axios.post(`${baseURL}/v2/checkout/orders`, {
                intent: 'CAPTURE',
                purchase_units: [{
                    custom_id: `${p.id}-${data.itemId}`, 
                    description: item.name,
                    amount: { currency_code: 'USD', value: item.priceUSD }
                }],
                application_context: {
                    return_url: 'https://exonieonline.onrender.com/paypal-return', 
                    cancel_url: 'https://exonieonline.onrender.com',
                    brand_name: 'Exonie Online',
                    shipping_preference: 'NO_SHIPPING' 
                }
            }, {
                headers: { 'Authorization': `Bearer ${tokenReq.data.access_token}`, 'Content-Type': 'application/json' }
            });
            
            const checkoutUrl = orderReq.data.links.find(link => link.rel === 'approve').href;
            socket.emit('checkoutState', { state: 'approved', url: checkoutUrl });
            socket.emit('systemMessage', "✅ Secure PayPal link generated!");

        } catch (err) {
            socket.emit('systemMessage', `❌ Payment API Error. Check server console.`);
        }
    });

    // 2. EXO GEMS CHECKOUT (Premium Currency)
    socket.on('requestGemPurchase', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p || !data.itemId) return;

        const MASTER_CATALOG = {
            'aura_easter': { priceGems: 15, item: { name: "Easter Aura Stone", type: 'aura', auraId: 'easter', rarity: 'Divine', color: '#FFB7B2', description: "Click to apply to an Armor. Purely cosmetic.", quantity: 1 } },
            'pet_egg': { priceGems: 15, item: { name: "Easter Egg Pet", type: 'aura', auraId: 'egg', rarity: 'Divine', color: '#FFC1E3', description: "Click to apply to Leggings.", quantity: 1 } },
            'name_change': { priceGems: 15, item: { name: "Name Change Ticket", type: 'consumable', rarity: 'Legendary', color: '#ff9800', description: "Changes your character's name permanently.", quantity: 1 } },
            'edit_char': { priceGems: 15, item: { name: "Appearance Reroll Ticket", type: 'consumable', rarity: 'Legendary', color: '#2196F3', description: "Redesign your hair, skin color, and style.", quantity: 1 } },
            'pet_fox': { priceGems: 10, item: { name: "Spirit Fox Pet", type: 'aura', auraId: 'fox', rarity: 'Godly', color: '#ff7e00', description: "Click to apply to Leggings.", quantity: 1 } },
            'pet_owl': { priceGems: 10, item: { name: "Night Owl Pet", type: 'aura', auraId: 'owl', rarity: 'Godly', color: '#a0a0a0', description: "Click to apply to Leggings.", quantity: 1 } },
            'aura_blaze': { priceGems: 10, item: { name: "Blaze Aura Stone", type: 'aura', auraId: 'blaze', rarity: 'Legendary', color: '#f44336', description: "Click to apply to Armor.", quantity: 1 } },
            'aura_liquid': { priceGems: 10, item: { name: "Liquid Aura Stone", type: 'aura', auraId: 'liquid', rarity: 'Legendary', color: '#2196F3', description: "Click to apply to Armor.", quantity: 1 } },
            'aura_nature': { priceGems: 10, item: { name: "Nature Aura Stone", type: 'aura', auraId: 'nature', rarity: 'Legendary', color: '#4CAF50', description: "Click to apply to Armor.", quantity: 1 } },
            'divine_pack': { priceGems: 10, item: { name: "Divine Enhancement Stone", type: 'material', rarity: 'Divine', color: '#ffea00', description: "Enhances Divine equipment.", quantity: 5 } },
            'revival_pack': { priceGems: 5, item: { name: "Revival Juice", type: "consumable", rarity: "Unique", color: "#9c27b0", description: "Revives you instantly on the spot when used while dead.", quantity: 10 } }
        };

        const catalogItem = MASTER_CATALOG[data.itemId];
        if (!catalogItem) return socket.emit('systemMessage', "❌ Item not found in catalog.");

        if (!p.baseStats) p.baseStats = {};
        if ((p.baseStats.exoGems || 0) < catalogItem.priceGems) {
            return socket.emit('systemMessage', "❌ Not enough Exo Gems! Click 'Get More Gems' to top up via Patreon.");
        }

        const inv = Array.isArray(p.inventory) ? p.inventory : new Array(20).fill(null);
        let added = false;
        let deliveryItem = JSON.parse(JSON.stringify(catalogItem.item));
        deliveryItem.id = Date.now() + Math.random();

        if (['potion', 'material', 'consumable'].includes(deliveryItem.type)) {
            const existingIndex = inv.findIndex(i => i && i.name === deliveryItem.name);
            if (existingIndex !== -1) {
                inv[existingIndex].quantity = (inv[existingIndex].quantity || 1) + deliveryItem.quantity;
                added = true;
            }
        }

        if (!added) {
            const emptySlot = inv.findIndex(i => i === null);
            if (emptySlot === -1) return socket.emit('systemMessage', "❌ Inventory full! Clear space first.");
            inv[emptySlot] = deliveryItem;
        }

        p.baseStats.exoGems -= catalogItem.priceGems;
        p.inventory = inv;

        try {
            await supabase.from('Exonians').update({ inventory: p.inventory, base_stats: p.baseStats }).eq('character_name', p.id);
            socket.emit('syncInventory', p.inventory);
            socket.emit('gemPurchaseSuccess', { newGems: p.baseStats.exoGems });
            socket.emit('systemMessage', `💎 Successfully purchased ${deliveryItem.name}!`);
        } catch (e) {
            socket.emit('systemMessage', "❌ Transaction failed. Server error.");
        }
    });
    // ==========================================
    // 💳 SECURE STORE RECEIPT VERIFICATION
    // ==========================================
    socket.on('verifyStoreReceipt', async (data) => {
        if (!socket.username) return;

        const { platform, receipt, packageId } = data;
        let isValid = false;
        let gemsToAward = 0;

        // Map your Store Package IDs to exactly how many gems they grant
        if (packageId === 'gem_pack_50') gemsToAward = 50;
        else if (packageId === 'gem_pack_120') gemsToAward = 120;
        else return socket.emit('receiptFailed', "Invalid package ID.");

        try {
            if (platform === 'android') {
                // 🟢 GOOGLE PLAY VERIFICATION API
                const response = await playDeveloper.purchases.products.get({
                    packageName: GOOGLE_PACKAGE_NAME,
                    productId: packageId,
                    token: receipt
                });

                if (response.data.purchaseState === 0) isValid = true;
                else throw new Error("Google Play returned purchase as unverified or canceled.");
            } 
            else if (platform === 'steam') {
                // 🔵 STEAMWORKS VERIFICATION API
                const steamUrl = `https://partner.steam-api.com/ISteamMicroTxn/GetReport/v3/?key=${STEAM_WEB_API_KEY}&appid=${STEAM_APP_ID}&orderid=${receipt}`;
                
                const response = await fetch(steamUrl);
                const steamData = await response.json();

                if (steamData.response && steamData.response.result === 'OK') {
                    const order = steamData.response.orders.find(o => o.orderid === receipt);
                    if (order && order.status === 'Approved') isValid = true;
                    else throw new Error("Steam order is pending or rejected.");
                } else {
                    throw new Error("Failed to communicate with Steam API.");
                }
            }

            // 💎 IF THE STORE SAYS IT'S REAL, GRANT THE GEMS
            if (isValid) {
                // 1. Fetch current user stats from Exonians table
                const { data: user, error } = await supabase
                    .from('Exonians')
                    .select('base_stats')
                    .eq('character_name', socket.username)
                    .single();

                if (error || !user) throw new Error("Could not find user in database.");

                let safeStats = user.base_stats || {};
                let currentGems = parseInt(safeStats.exoGems) || 0;
                let newGems = currentGems + gemsToAward;
                
                // Update RAM if player is currently online
                if (onlinePlayers[socket.id] && onlinePlayers[socket.id].baseStats) {
                    onlinePlayers[socket.id].baseStats.exoGems = newGems;
                }

                // 2. Update Supabase
                safeStats.exoGems = newGems;
                const { error: updateError } = await supabase
                    .from('Exonians')
                    .update({ base_stats: safeStats })
                    .eq('character_name', socket.username);

                if (updateError) throw new Error("Database update failed.");

                // 3. Notify the client to update their UI
                socket.emit('receiptVerified', { newGems: newGems, gemsAdded: gemsToAward });
                
                console.log(`[STORE] Awarded ${gemsToAward} gems to ${socket.username}. New Balance: ${newGems}`);
            }

        } catch (err) {
            console.error('[STORE ERROR]', err.message);
            socket.emit('receiptFailed', "Transaction flagged or invalid. Contact support if you were charged.");
        }
    });
    // ==========================================
    // 🧰 HOME STORAGE ENGINE
    // ==========================================
    socket.on('requestOpenStorage', () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        if (!p.baseStats.homeStorage) p.baseStats.homeStorage = new Array(10).fill(null);
        socket.emit('openStorageUI', p.baseStats.homeStorage);
    });

    socket.on('transferToStorage', (invIndex) => {
        const p = onlinePlayers[socket.id];
        if (!p || !p.inventory[invIndex]) return;
        if (!p.baseStats.homeStorage) p.baseStats.homeStorage = new Array(10).fill(null);
        
        const emptySlot = p.baseStats.homeStorage.findIndex(i => i === null);
        if (emptySlot === -1) return socket.emit('systemMessage', '❌ Storage is full!');
        
        p.baseStats.homeStorage[emptySlot] = p.inventory[invIndex];
        p.inventory[invIndex] = null;
        
        supabase.from('Exonians').update({ inventory: p.inventory, base_stats: p.baseStats }).eq('character_name', p.id);
        socket.emit('syncInventory', p.inventory);
        socket.emit('syncStorage', p.baseStats.homeStorage);
    });
    socket.on('transferFromStorage', (storageIndex) => {
        const p = onlinePlayers[socket.id];
        if (!p || !p.baseStats.homeStorage || !p.baseStats.homeStorage[storageIndex]) return;
        
        const emptySlot = p.inventory.findIndex(i => i === null);
        if (emptySlot === -1) return socket.emit('systemMessage', '❌ Inventory is full!');
        
        p.inventory[emptySlot] = p.baseStats.homeStorage[storageIndex];
        p.baseStats.homeStorage[storageIndex] = null;
        
        supabase.from('Exonians').update({ inventory: p.inventory, base_stats: p.baseStats }).eq('character_name', p.id);
        socket.emit('syncInventory', p.inventory);
        socket.emit('syncStorage', p.baseStats.homeStorage);
    });
// ==========================================
    // 👻 COSMETICS CRAFTING (VOID PET)
    // ==========================================
    socket.on('requestCraftVoidPet', async () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;

        const inv = p.inventory || [];
        let soulPieceCount = 0;
        
        inv.forEach(i => {
            if (i && i.name === 'Soul Piece') soulPieceCount += (i.quantity || 1);
        });

        if (soulPieceCount < 10) return socket.emit('systemMessage', '❌ You need 10 Soul Pieces.');

        let emptyIdx = inv.findIndex(i => i === null);
        if (emptyIdx === -1) return socket.emit('systemMessage', '❌ Inventory full! Clear a slot for your pet.');

        // Deduct 10 Soul Pieces flexibly across stacks
        let amtToDeduct = 10;
        for (let i = 0; i < inv.length; i++) {
            if (amtToDeduct <= 0) break;
            if (inv[i] && inv[i].name === 'Soul Piece') {
                if (inv[i].quantity > amtToDeduct) {
                    inv[i].quantity -= amtToDeduct;
                    amtToDeduct = 0;
                } else {
                    amtToDeduct -= inv[i].quantity;
                    inv[i] = null;
                }
            }
        }

        // Generate the Void Pet
        const voidPet = {
            id: Date.now() + Math.random(),
            name: 'Void Pet',
            type: 'aura',
            auraId: 'void',
            sprite: 'aurastone',
            level: 1,
            rarity: 'Godly',
            color: '#E040FB',
            description: 'Click to apply to Leggings. The tamed soul of the Wraith King.',
            quantity: 1
        };

        inv[emptyIdx] = voidPet;
        p.inventory = sanitizeInventory(inv);

        await supabase.from('Exonians').update({ inventory: p.inventory }).eq('character_name', p.id);
        socket.emit('syncInventory', p.inventory);
        socket.emit('systemMessage', '👻 Successfully crafted the Void Pet!');
        socket.emit('craftVoidSuccess');
    });
   socket.on('disconnect', async () => {
       if (socket.username) { activeLogins.delete(socket.username); }
        if (socket.email && activeEmailSessions[socket.email] === socket.id) { delete activeEmailSessions[socket.email]; }
        
        // 🛡️ Free up the connection slots when they disconnect
        if (socket.clientIp && ipConnections[socket.clientIp]) {
            ipConnections[socket.clientIp]--;
            if (ipConnections[socket.clientIp] <= 0) delete ipConnections[socket.clientIp];
        }
        if (socket.deviceId && socket.deviceId !== 'unknown_device' && deviceConnections[socket.deviceId]) {
            deviceConnections[socket.deviceId]--;
            if (deviceConnections[socket.deviceId] <= 0) delete deviceConnections[socket.deviceId];
        }
        if (socket.email && emailConnections[socket.email]) {
            emailConnections[socket.email]--;
            if (emailConnections[socket.email] <= 0) delete emailConnections[socket.email];
        }

        const p = onlinePlayers[socket.id];
        if (p) {
            const oldInstId = p.instanceId; 
            socket.to(p.instanceId).emit('remotePlayerLeft', p.id);
            if (worlds[p.instanceId] && worlds[p.instanceId].pets) {
                for (let petId in worlds[p.instanceId].pets) { if (worlds[p.instanceId].pets[petId].ownerId === p.id) delete worlds[p.instanceId].pets[petId]; }
            }
            removeFromParty(p.id);
            
            // 🛡️ ANTI-CHEAT: If they disconnect while dead, FORCE Town coordinates into the DB
            let saveMap = p.mapId; let saveX = p.x; let saveY = p.y;
            if (p.isGhost) {
                saveMap = 'town'; saveX = 960; saveY = 1000;
            }
            
           // 🛡️ THE FIX: Save the entire server cache to the DB so nothing is lost on refresh!
            supabase.from('Exonians').update({ 
                map_id: saveMap, 
                pos_x: saveX, 
                pos_y: saveY,
                inventory: p.inventory,
                equips: p.equips,
                base_stats: p.baseStats,
                gold: p.gold,
                current_hp: p.currentHp,
                title: p.title // 🛡️ THE FIX: Ensure the top-level title column is hard-saved too!
            }).eq('character_name', p.id).then(()=>{});
            delete onlinePlayers[socket.id];
            
            checkAndResetInstance(oldInstId); 
        }
    });
});
// ==========================================
// 🧹 AUTOMATIC DATABASE CLEANUP ENGINE
// ==========================================
async function runDatabaseCleanup() {
    try {
        console.log("[CLEANUP] Running scheduled database sweep...");
        const now = Date.now();
        
        // Calculate the exact cutoff timestamps
        const oneDayAgo = new Date(now - (24 * 60 * 60 * 1000)).toISOString();
        const twoWeeksAgo = new Date(now - (14 * 24 * 60 * 60 * 1000)).toISOString();

        // 🛑 RULE 1: Delete Level 4 and below (Inactive for 1 Day)
        const { data: purge1, error: err1 } = await supabase
            .from('Exonians')
            .delete()
            .lte('level', 4)
            .lt('last_login', oneDayAgo)
            .select('character_name');

        if (purge1 && purge1.length > 0) {
            console.log(`[CLEANUP] Swept ${purge1.length} abandoned beginner accounts (Lv 1-4).`);
        }

        // 🛑 RULE 2: Delete Level 14 and below (Inactive for 2 Weeks)
        const { data: purge2, error: err2 } = await supabase
            .from('Exonians')
            .delete()
            .lte('level', 14)
            .lt('last_login', twoWeeksAgo)
            .select('character_name');

        if (purge2 && purge2.length > 0) {
            console.log(`[CLEANUP] Swept ${purge2.length} inactive low-level accounts (Lv 5-14).`);
        }

    } catch (e) {
        console.error("[CLEANUP ERROR] Failed to run database sweep:", e.message);
    }
}
// ==========================================
// ⚔️ NEUTRAL ZONE BOSS ENGINE
// ==========================================
global.neutralBossDespawnTimer = null;
const NEUTRAL_SPAWN_CD = 5 * 60 * 60 * 1000; // 5 hours
const NEUTRAL_DESPAWN_TIME = 12 * 60 * 60 * 1000; // 12 hours

async function checkNeutralBoss() {
    if (!worlds['neutralzone']) worlds['neutralzone'] = { monsters: {}, pets: {}, collisions: [], teleports: [] };

    const { data: timer } = await supabase.from('boss_timers').select('last_death_time').eq('boss_id', 'neutralzone_boss').single();
    
    let remaining = 0;
    if (timer) remaining = (parseInt(timer.last_death_time) + NEUTRAL_SPAWN_CD) - Date.now();

    if (remaining > 0) {
        io.to('neutralzone').emit('bossCooldownActive', { remaining: remaining });
        setTimeout(spawnNeutralBoss, remaining);
    } else {
        spawnNeutralBoss();
    }
}

function spawnNeutralBoss() {
    if (!worlds['neutralzone']) worlds['neutralzone'] = { monsters: {}, pets: {}, collisions: [], teleports: [] };
    
    // 🛑 SAFETY FIX: Prevent duplicate bosses if multiple players enter at the exact same time!
    if (worlds['neutralzone'].monsters['neutral_boss_1'] && worlds['neutralzone'].monsters['neutral_boss_1'].alive) {
        return; 
    }

    // Clean up DB lock
    supabase.from('boss_timers').delete().eq('boss_id', 'neutralzone_boss').then(()=>{});

    const keys = Object.keys(MonsterDatabase);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const randomLevel = Math.floor(Math.random() * 100) + 1; // Level 1 to 100

    const bossId = 'neutral_boss_1';
    // NOTE: Change the 960 and 1000 here to whatever X/Y coordinate you want the boss to spawn at!
    const cfg = { spawnArea: { minX: 960, maxX: 960, minY: 1000, maxY: 1000 }, level: randomLevel };
    
    const newBoss = spawnMonster('neutralzone', bossId, randomKey, cfg);
    newBoss.isNeutralBoss = true; 
    newBoss.respawnDelayMs = -1; // Never auto-respawns, handled by engine
    worlds['neutralzone'].monsters[bossId] = newBoss;

    io.to('neutralzone').emit('monsterSpawned', serializeMonster(newBoss));
    io.emit('systemMessage', `⚠️ A Level ${randomLevel} ${newBoss.name} has appeared in the Neutral Zone!`);

    clearTimeout(global.neutralBossDespawnTimer);
    global.neutralBossDespawnTimer = setTimeout(async () => {
        if (worlds['neutralzone'] && worlds['neutralzone'].monsters[bossId] && worlds['neutralzone'].monsters[bossId].alive) {
            worlds['neutralzone'].monsters[bossId].alive = false;
            io.to('neutralzone').emit('monsterDied', { monsterId: bossId, killerId: null });
            io.emit('systemMessage', `💨 The Neutral Zone boss has despawned after 12 hours.`);
            await supabase.from('boss_timers').upsert({ boss_id: 'neutralzone_boss', last_death_time: Date.now() }, { onConflict: 'boss_id' });
            checkNeutralBoss();
        }
    }, NEUTRAL_DESPAWN_TIME);
}
// Start Engine on boot
setTimeout(checkNeutralBoss, 5000);
// 1. Run the cleanup engine immediately when the server boots
runDatabaseCleanup();

// 2. Set it to run automatically every 12 hours while the server is alive
setInterval(runDatabaseCleanup, 12 * 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`Exonie server running on port ${PORT} (0.0.0.0)`));





































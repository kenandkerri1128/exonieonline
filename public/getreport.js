// Run this via command line: node getreport.js
const fetch = require('node-fetch'); // or use native fetch if Node 18+

const STEAM_API_KEY = "PASTE_YOUR_STEAMWORKS_WEB_API_KEY_HERE";
const APP_ID = "4579730";

async function getSteamReport() {
    // Look at the last 24 hours of transactions
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); 
    
    const url = `https://partner.steam-api.com/ISteamMicroTxn/GetReport/v4/?key=${STEAM_API_KEY}&appid=${APP_ID}&time=${startTime}&maxresults=100`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log("\n=== PASTE THIS JSON INTO THE STEAM TICKET ===\n");
        console.log(JSON.stringify(data, null, 2));
        console.log("\n=============================================\n");
    } catch (err) {
        console.error("Failed to fetch report:", err);
    }
}

getSteamReport();

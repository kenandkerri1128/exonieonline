// Run this via command line: node getreport.js
const fetch = require('node-fetch'); // or use native fetch if Node 18+

const STEAM_API_KEY = "4F9B94B4338DF119CB6EE7AEBD89F0C0";
const APP_ID = "4579730";

async function getSteamReport() {
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); 
    
    // 🛡️ THE FIX: This now points to ISteamMicroTxnSandbox so it grabs the test receipts!
    const url = `https://partner.steam-api.com/ISteamMicroTxnSandbox/GetReport/v4/?key=${STEAM_API_KEY}&appid=${APP_ID}&time=${startTime}&maxresults=100`;

    try {
        console.log("Fetching Sandbox transaction report from Steam...");
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

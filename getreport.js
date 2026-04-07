// getreport.js
// Run this via command line: node getreport.js

// Note: If you are using an older version of Node.js (below v18), you might need to run 'npm install node-fetch' first.
const fetch = require('node-fetch'); 

// 🛑 IMPORTANT: Replace this string with your actual Publisher Web API Key from Steamworks!
const STEAM_API_KEY = "4F9B94B4338DF119CB6EE7AEBD89F0C0";
const APP_ID = "4579730";

async function getSteamReport() {
    // This calculates the exact time 24 hours ago to pull recent test transactions
    const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); 
    
    // The exact endpoint Valve asked you to call
    const url = `https://partner.steam-api.com/ISteamMicroTxn/GetReport/v4/?key=${STEAM_API_KEY}&appid=${APP_ID}&time=${startTime}&maxresults=100`;

    try {
        console.log("Fetching transaction report from Steam...");
        const response = await fetch(url);
        const data = await response.json();
        
        console.log("\n=== PASTE THIS JSON INTO THE STEAM TICKET ===\n");
        // This formats the JSON nicely with indents so it is easy for the reviewer to read
        console.log(JSON.stringify(data, null, 2));
        console.log("\n=============================================\n");
        
    } catch (err) {
        console.error("Failed to fetch report:", err);
    }
}

getSteamReport();

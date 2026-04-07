require('dotenv').config();
const axios = require('axios');

async function fetchSteamReport() {
    try {
        // Uses your environment variables, or falls back to your hardcoded keys
        const apiKey = process.env.STEAM_WEB_API_KEY || '4F9B94B4338DF119CB6EE7AEBD89F0C0';
        const appId = process.env.STEAM_APP_ID || '4579730';

        console.log('⏳ Fetching Steam Microtransaction Report...');

        // Steam expects the time in Unix seconds. We subtract 86,400 to get the last 24 hours.
        const time24HoursAgo = Math.floor(Date.now() / 1000) - 86400;

        const params = new URLSearchParams({
            key: apiKey,
            appid: appId,
            time: time24HoursAgo.toString(),
            type: 'all' // 'all' fetches every settled transaction
        });

        const formData = params.toString();

        const response = await axios.get(
            `https://partner.steam-api.com/ISteamMicroTxn/GetReport/v2/?${formData}`
        );

        if (response.data?.response?.result === 'OK') {
            console.log('\n✅ SUCCESS! Copy the JSON below and send it to the Steam Reviewer:\n');
            // This prints the data in a beautifully formatted JSON block
            console.log(JSON.stringify(response.data.response, null, 2));
        } else {
            console.error('\n❌ Steam API returned an error:');
            console.log(JSON.stringify(response.data, null, 2));
        }
    } catch (error) {
        console.error('\n❌ Failed to connect to Steam API:', error.message);
        if (error.response) {
            console.error('Steam Response:', error.response.data);
        }
    }
}

// Execute the function
fetchSteamReport();

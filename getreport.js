require('dotenv').config();
const axios = require('axios');

async function fetchSteamReport() {
    try {
        const apiKey = process.env.STEAM_WEB_API_KEY || '4F9B94B4338DF119CB6EE7AEBD89F0C0';
        const appId = process.env.STEAM_APP_ID || '4579730';

        console.log('⏳ Fetching Steam Microtransaction Report...');

        // 🛡️ THE FIX: Steam strictly requires RFC 3339 format without milliseconds
        const date24hAgo = new Date(Date.now() - 86400000);
        const rfcTime = date24hAgo.toISOString().split('.')[0] + 'Z'; 

        const params = new URLSearchParams();
        params.append('key', apiKey);
        params.append('appid', appId);
        params.append('time', rfcTime);
        params.append('type', 'GAMESALES'); // 🛡️ THE FIX: Must be exactly 'GAMESALES'

        const formData = params.toString();
        const response = await axios.get(`https://partner.steam-api.com/ISteamMicroTxn/GetReport/v2/?${formData}`);

        if (response.data?.response?.result === 'OK') {
            console.log('\n✅ SUCCESS! Copy the JSON below and send it to Steam:\n');
            console.log(JSON.stringify(response.data.response, null, 2));
        } else {
            console.error('\n❌ Steam API Error:');
            console.log(JSON.stringify(response.data, null, 2));
        }
    } catch (error) {
        console.error('\n❌ Failed to connect:', error.message);
        if (error.response) console.error('Steam Response:', error.response.data);
    }
}

fetchSteamReport();

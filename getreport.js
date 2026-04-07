// 📊 STEAM RECONCILIATION (Required for Review)
app.get('/api/admin/steam-report', async (req, res) => {
    // SECURITY: In production, add admin check here. 
    // For the review, we need this to output the JSON data Steam requested.
    try {
        const apiKey = process.env.STEAM_WEB_API_KEY || '4F9B94B4338DF119CB6EE7AEBD89F0C0';
        const appId = process.env.STEAM_APP_ID || '4579730';

        // Get report for the last 24 hours
        const params = new URLSearchParams({
            key: apiKey,
            appid: appId,
            time: Math.floor(Date.now() / 1000) - 86400, // Last 24 hours
            type: 'all'
        });

        const response = await axios.get(
            `https://partner.steam-api.com/ISteamMicroTxn/GetReport/v2/?${params.toString()}`
        );

        res.json(response.data);
    } catch (error) {
        console.error("❌ GetReport Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

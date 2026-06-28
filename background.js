const API_BASE = "https://ai-rewards-wallet-production.up.railway.app";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`[Rewards Background] Message received:`, request);
    if (request.type === "PROMPT_CAPTURED") {
        handlePrompt(request.data);
    }
});

async function handlePrompt(data) {
    const { user } = await chrome.storage.local.get("user");
    console.log(`[Rewards Background] User state:`, user ? "Logged in" : "Not logged in");
    if (!user) {
        console.log(`[Rewards Background] Skipping API call: User not logged in`);
        return;
    }

    try {
        console.log(`[Rewards Background] Calling /analyze/intent for: ${data.prompt.substring(0, 30)}...`);
        const response = await fetch(`${API_BASE}/analyze/intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                prompt: data.prompt,
                site: data.url
            })
        });
        const result = await response.json();
        console.log(`[Rewards Background] API Result:`, result);

        if (result.offer_id) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'https://cdn-icons-png.flaticon.com/512/2530/2530001.png',
                title: '💰 Reward Opportunity!',
                message: `We found a great offer for ${result.category}! Click to earn.`,
                priority: 2
            });
        }
    } catch (e) {
        console.error("[Rewards Background] API Error:", e);
    }
}

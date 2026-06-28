const API_BASE = "https://ai-rewards-wallet-production.up.railway.app";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`[Rewards Background] Message received:`, request);
    
    if (request.type === "PROMPT_CAPTURED") {
        handlePrompt(request.data).then(result => {
            sendResponse({ status: "processed", result: result });
        });
        return true; 
    }
    sendResponse({ status: "ignored" });
});

async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            return response;
        } catch (e) {
            if (i === retries - 1) throw e;
            console.log(`[Rewards Background] Fetch failed, retrying in ${backoff}ms... (Attempt ${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, backoff));
        }
    }
}

async function handlePrompt(data) {
    const { user } = await chrome.storage.local.get("user");
    console.log(`[Rewards Background] User state:`, user ? `Logged in as ${user.email}` : "Not logged in");
    
    if (!user) {
        console.log(`[Rewards Background] Skipping API call: User not logged in`);
        return "no_user";
    }

    try {
        console.log(`[Rewards Background] Calling /analyze/intent for: ${data.prompt.substring(0, 30)}...`);
        const response = await fetchWithRetry(`${API_BASE}/analyze/intent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                prompt: data.prompt,
                site: data.url
            })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            console.error(`[Rewards Background] API Error Response (${response.status}): ${errText}`);
            return `api_error_${response.status}`;
        }

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
            return "offer_found";
        }
        
        console.log(`[Rewards Background] No active offer found for category: ${result.category}`);
        return "no_offer";
    } catch (e) {
        console.error("[Rewards Background] Final Network/Fetch Error details:", {
            message: e.message,
            stack: e.stack
        });
        return "network_error";
    }
}

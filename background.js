const API_BASE = "https://ai-rewards-wallet-production.up.railway.app";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`[Rewards Background] Message received:`, request);
    
    if (request.type === "PROMPT_CAPTURED") {
        handlePrompt(request.data).then(result => {
            sendResponse({ status: "processed", result: result });
        });
        return true; 
    }

    if (request.type === "TRANSFER_CONVERSATION") {
        handleTransfer(request.data).then(result => {
            sendResponse({ status: "processed", result: result });
        });
        return true;
    }

    sendResponse({ status: "ignored" });
});

async function handleTransfer(data) {
    const { messages, target_ai } = data;
    console.log(`[Transfer Background] Transferring ${messages.length} messages to ${target_ai}...`);

    try {
        const response = await fetch(`${API_BASE}/conversation-transfer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages,
                target_ai: target_ai
            })
        });

        if (!response.ok) {
            console.error(`[Transfer Background] API Error: ${response.status}`);
            return `api_error_${response.status}`;
        }

        const result = await response.json();
        console.log(`[Transfer Background] API Result:`, result);

        const urls = {
            'chatgpt': 'https://chatgpt.com',
            'claude': 'https://claude.ai',
            'gemini': 'https://gemini.google.com',
            'perplexity': 'https://perplexity.ai'
        };

        const targetUrl = urls[target_ai] || 'https://chatgpt.com';
        
        // Instead of copying here, we send the prompt back to the content script
        // so it can copy it from a document context.
        return {
            success: true,
            prompt: result.prompt,
            url: targetUrl
        };
    } catch (e) {
        console.error("[Transfer Background] Network Error:", e);
        return "network_error";
    }
}

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
            // 1. Still show the system notification as a backup
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'https://cdn-icons-png.flaticon.com/512/2530/2530001.png',
                title: '💰 Reward Opportunity!',
                message: `We found a great offer for ${result.category}! Click to earn.`,
                priority: 2
            });

            // 2. Send message to the content script to show the UI banner
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: "SHOW_OFFER_BANNER",
                        data: result
                    });
                }
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

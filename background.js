const API_BASE = "https://your-render-api-url.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "PROMPT_CAPTURED") {
        handlePrompt(request.data);
    }
});

async function handlePrompt(data) {
    const { user } = await chrome.storage.local.get("user");
    if (!user) return;

    try {
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

        if (result.offer_id) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon.png',
                title: '💰 Reward Opportunity!',
                message: `We found a great offer for ${result.category}! Click to earn.`,
                priority: 2
            });
        }
    } catch (e) {
        console.error("API Error:", e);
    }
}

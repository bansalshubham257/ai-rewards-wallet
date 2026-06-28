const COMMERCIAL_KEYWORDS = ['best', 'buy', 'price', 'recommend', 'hosting', 'vpn', 'crm', 'saas', 'laptop', 'insurance', 'course', 'credit card', 'software', 'cheap', 'top', 'deal', 'discount'];

function isCommercial(text) {
    const lowerText = text.toLowerCase();
    const found = COMMERCIAL_KEYWORDS.some(keyword => lowerText.includes(keyword));
    console.log(`[Rewards] Checking text: "${text.substring(0, 50)}..." - Commercial: ${found}`);
    return found;
}

async function capturePrompt() {
    const selectors = [
        '#prompt-textarea', 
        'div[contenteditable="true"]', 
        'textarea', 
        'div[role="textbox"]',
        '[data-testid="prompt-textarea"]'
    ];

    let promptText = "";
    for (let selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            promptText = el.textContent || el.value || el.innerText;
            break;
        }
    }

    if (!promptText || promptText.trim().length === 0) {
        return;
    }

    const trimmedPrompt = promptText.trim();
    console.log(`[Rewards] Captured prompt: "${trimmedPrompt.substring(0, 50)}..."`);

    if (isCommercial(trimmedPrompt)) {
        // Check if user is logged in before sending
        const { user } = await chrome.storage.local.get("user");
        if (!user) {
            console.log(`[Rewards] Skipping: User not logged in. Please login via the extension popup.`);
            return;
        }

        console.log(`[Rewards] Sending commercial prompt to background script...`);
        chrome.runtime.sendMessage({
            type: "PROMPT_CAPTURED",
            data: {
                prompt: trimmedPrompt,
                url: window.location.hostname
            }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`[Rewards] Error sending message: ${chrome.runtime.lastError.message}`);
            } else {
                console.log(`[Rewards] Background responded:`, response);
            }
        });
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        setTimeout(capturePrompt, 500);
    }
});

document.addEventListener('click', (e) => {
    if (e.target.closest('button')) {
        setTimeout(capturePrompt, 500);
    }
});

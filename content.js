const COMMERCIAL_KEYWORDS = ['best', 'buy', 'price', 'recommend', 'hosting', 'vpn', 'crm', 'saas', 'laptop', 'insurance', 'course', 'credit card', 'software', 'cheap', 'top', 'deal', 'discount'];

function isCommercial(text) {
    const lowerText = text.toLowerCase();
    const found = COMMERCIAL_KEYWORDS.some(keyword => lowerText.includes(keyword));
    console.log(`[Rewards] Checking text: "${text.substring(0, 50)}..." - Commercial: ${found}`);
    return found;
}

function showOfferBanner(offer) {
    // Remove existing banner if any
    const existingBanner = document.getElementById('ai-rewards-banner');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.id = 'ai-rewards-banner';
    banner.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(90deg, #ff9800, #f57c00);
        color: white;
        padding: 12px 24px;
        border-radius: 50px;
        z-index: 999999;
        font-family: sans-serif;
        font-weight: bold;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: all 0.3s ease;
        animation: slideDown 0.5s ease-out;
    `;

    banner.innerHTML = `
        <span>💰</span>
        <span>${offer.recommendation}</span>
        <span style="background: white; color: #f57c00; padding: 2px 8px; border-radius: 10px; font-size: 12px; margin-left: 10px;">Claim Now</span>
    `;

    // Add animation style
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes slideDown {
            from { transform: translate(-50%, -100px); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    banner.onclick = () => {
        window.open(offer.url, '_blank');
        banner.remove();
    };

    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (banner.parentNode) {
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }
    }, 10000);

    document.body.appendChild(banner);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SHOW_OFFER_BANNER") {
        showOfferBanner(request.data);
        sendResponse({ status: "banner_shown" });
    }
});

async function capturePrompt() {
    try {
        const selectors = [
            '#prompt-textarea', 
            'div[contenteditable="true"]', 
            'textarea', 
            'div[role="textbox"]',
            '[data-testid="prompt-textarea"]',
            'textarea[placeholder*="Ask"]',
            'textarea[placeholder*="Message"]'
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
                    if (chrome.runtime.lastError.message.includes("context invalidated")) {
                        console.warn(`[Rewards] Extension updated. Please refresh the page to continue earning rewards.`);
                    } else {
                        console.error(`[Rewards] Error sending message: ${chrome.runtime.lastError.message}`);
                    }
                } else {
                    console.log(`[Rewards] Background responded:`, response);
                }
            });
        }
    } catch (e) {
        if (e && e.message && e.message.includes("context invalidated")) {
            console.warn(`[Rewards] Extension updated. Please refresh the page to continue earning rewards.`);
        } else {
            console.error(`[Rewards] Unexpected error in capturePrompt:`, e);
        }
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        capturePrompt();
    }
});

document.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('[role="button"]') || e.target.closest('[data-testid="send-button"]') || e.target.closest('button[type="submit"]')) {
        capturePrompt();
    }
});

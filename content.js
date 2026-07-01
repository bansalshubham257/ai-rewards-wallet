/** 
 * AI Rewards Wallet - Content Script 
 * Version: 1.2 (Impression-based Ads)
 */

function showVerticalAdBanner() {
    const existingBanner = document.getElementById('ai-rewards-vertical-ad');
    if (existingBanner) existingBanner.remove();

    const banner = document.createElement('div');
    banner.id = 'ai-rewards-vertical-ad';
    banner.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        width: 160px;
        height: 600px;
        background: #f8f9fa;
        border: 2px solid #ddd;
        border-radius: 12px;
        z-index: 2147483647;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.3s ease;
        animation: slideInRight 0.5s ease-out;
    `;

    // Ad Header
    const header = document.createElement('div');
    header.style.cssText = "background: #eee; padding: 8px; text-align: center; font-size: 10px; color: #666; font-family: sans-serif; font-weight: bold; border-bottom: 1px solid #ddd;";
    header.innerText = "SPONSORED";
    banner.appendChild(header);

    // Ad Content (Iframe for Google Ads / Third Party)
    // Using an iframe to bypass CSP on AI sites. 
    // The user should replace 'https://your-ad-server.com/ad' with their own ad-serving page.
    const adFrame = document.createElement('iframe');
    adFrame.src = "https://example.com/ad-placeholder"; // PLACEHOLDER: User's ad-serving URL
    adFrame.style.cssText = "width: 100%; height: 100%; border: none;";
    banner.appendChild(adFrame);

    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes slideInRight {
            from { transform: translateX(120%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(banner);

    // Ad auto-removes after 30 seconds to keep UX clean
    setTimeout(() => {
        if (banner.parentNode) {
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }
    }, 30000);
}

// --- CONTEXT TRANSFER LOGIC ---

const PLATFORM_CONFIG = {
    'chatgpt.com': {
        userMsg: '[data-testid="user-message"]',
        aiMsg: '[data-testid="assistant-message"]',
        container: 'main'
    },
    'claude.ai': {
        userMsg: 'div[class*="user"]',
        aiMsg: 'div[class*="assistant"]',
        container: '.flex-1.overflow-y-auto'
    },
    'gemini.google.com': {
        userMsg: '.user-query, [data-test-id="user-message"]', 
        aiMsg: '.model-response, [data-test-id="assistant-message"]',
        container: 'main'
    },
    'perplexity.ai': {
        userMsg: 'div[class*="user"]',
        aiMsg: 'div[class*="assistant"]',
        container: 'main'
    }
};

function extractConversation() {
    const hostname = window.location.hostname.replace('www.', '');
    console.log(`[Transfer] Detecting platform for hostname: ${hostname}`);
    
    const config = PLATFORM_CONFIG[hostname];
    
    if (!config) {
        console.warn(`[Transfer] Platform ${hostname} not supported for extraction.`);
        return null;
    }

    console.log(`[Transfer] Using config:`, config);

    const messages = [];
    const container = document.querySelector(config.container) || document.body;
    
    if (hostname === 'gemini.google.com') {
        const items = container.querySelectorAll('div[role="listitem"]');
        items.forEach(item => {
            const isUser = item.querySelector('.user-query') || item.innerText.includes('You');
            const text = item.innerText || item.textContent;
            if (text && text.trim().length > 0) {
                messages.push({
                    role: isUser ? 'user' : 'assistant',
                    text: text.trim()
                });
            }
        });
    } else {
        // Only look for elements matching our specific message selectors within the container
        const targets = Array.from(container.querySelectorAll(`${config.userMsg}, ${config.aiMsg}`));

        targets.forEach(el => {
            const isUser = el.matches(config.userMsg) || 
                           el.classList.contains('user') || 
                           el.getAttribute('data-testid')?.includes('user');
            
            const text = el.innerText || el.textContent;
            if (text && text.trim().length > 0) {
                messages.push({
                    role: isUser ? 'user' : 'assistant',
                    text: text.trim()
                });
            }
        });
    }

    // Deduplicate consecutive messages from the same role
    const deduplicated = [];
    messages.forEach(msg => {
        if (deduplicated.length > 0 && deduplicated[deduplicated.length - 1].role === msg.role) {
            deduplicated[deduplicated.length - 1].text += `\n\n${msg.text}`;
        } else {
            deduplicated.push(msg);
        }
    });

    console.log(`[Transfer] Successfully extracted ${deduplicated.length} messages.`);
    return deduplicated;
}

function injectTransferUI() {
    if (!document.body) return;
    if (document.getElementById('ai-transfer-menu')) return;

    console.log(`[Transfer] Injecting UI menu...`);
    const menu = document.createElement('div');
    menu.id = 'ai-transfer-menu';
    menu.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #202123;
        color: white;
        border: 1px solid #444;
        border-radius: 12px;
        padding: 10px;
        z-index: 2147483647;
        font-family: sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 200px;
    `;

    const title = document.createElement('div');
    title.innerText = "Continue in another AI";
    title.style.cssText = "font-size: 12px; color: #aaa; text-align: center; margin-bottom: 5px; font-weight: bold;";
    menu.appendChild(title);

    const platforms = [
        { name: 'ChatGPT', id: 'chatgpt' },
        { name: 'Claude', id: 'claude' },
        { name: 'Gemini', id: 'gemini' },
        { name: 'Perplexity', id: 'perplexity' }
    ];

    platforms.forEach(p => {
        const btn = document.createElement('button');
        btn.innerText = `Transfer to ${p.name}`;
        btn.style.cssText = `
            background: #343541;
            color: white;
            border: 1px solid #565869;
            padding: 6px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            text-align: left;
        `;
        btn.onclick = () => {
            const history = extractConversation();
            if (history && history.length > 0) {
                chrome.runtime.sendMessage({
                    type: "TRANSFER_CONVERSATION",
                    data: {
                        messages: history,
                        target_ai: p.id
                    }
                }, async (resp) => {
                    console.log("[Transfer] Background response:", resp);
                    if (resp && resp.status === "processed" && resp.result && resp.result.success) {
                        const result = resp.result;
                        try {
                            await navigator.clipboard.writeText(result.prompt);
                            console.log("[Transfer] Prompt copied to clipboard!");
                        } catch (err) {
                            console.error("[Transfer] Clipboard copy failed:", err);
                        }
                        window.open(result.url, '_blank');
                    } else {
                        alert("Transfer failed. Please check logs.");
                    }
                });
            } else {
                alert("No conversation found to transfer!");
            }
        };
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
}

function initTransfer() {
    if (!document.body) {
        console.log(`[Transfer] Body not ready, retrying...`);
        setTimeout(initTransfer, 500);
        return;
    }
    
    console.log(`[Transfer] Initializing UI...`);
    injectTransferUI();
    const observer = new MutationObserver(() => injectTransferUI());
    observer.observe(document.body, { childList: true, subtree: true });
}

initTransfer();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "SHOW_AD_BANNER") {
        showVerticalAdBanner();
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

        console.log(`[Ads] Prompt captured. Triggering ad and tracking...`);

        // Track ad impression and show banner
        chrome.runtime.sendMessage({
            type: "TRACK_AD_IMPRESSION",
            data: { url: window.location.hostname }
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`[Ads] Message error: ${chrome.runtime.lastError.message}`);
            } else {
                // Once tracking is sent, show the ad banner
                showVerticalAdBanner();
            }
        });

    } catch (e) {
        console.error(`[Ads] Unexpected error in capturePrompt:`, e);
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

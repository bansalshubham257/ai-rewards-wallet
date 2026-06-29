/** 
 * AI Rewards Wallet - Content Script 
 * Version: 1.1
 */

const COMMERCIAL_KEYWORDS = ['best', 'buy', 'price', 'recommend', 'hosting', 'vpn', 'crm', 'saas', 'laptop', 'insurance', 'course', 'credit card', 'software', 'cheap', 'top', 'deal', 'discount'];

function isCommercial(text) {
    const lowerText = text.toLowerCase();
    const found = COMMERCIAL_KEYWORDS.some(keyword => lowerText.includes(keyword));
    console.log(`[Rewards] Checking text: "${text.substring(0, 50)}..." - Commercial: ${found}`);
    return found;
}

function showOfferBanner(offer) {
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
        z-index: 2147483647;
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

    setTimeout(() => {
        if (banner.parentNode) {
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }
    }, 10000);

    document.body.appendChild(banner);
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
    
    if (hostname === 'gemini.google.com') {
        const items = document.querySelectorAll('div[role="listitem"]');
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
        // Heuristic approach: Find all elements that look like messages
        const allElements = Array.from(document.querySelectorAll('div, section, article'));
        
        // Filter for elements that have a role of message or match our config
        const chatBlocks = allElements.filter(el => {
            return el.matches(config.userMsg) || 
                   el.matches(config.aiMsg) || 
                   (el.innerText && el.innerText.length < 5000 && el.children.length === 0 && el.innerText.trim().length > 0);
        });

        // If heuristic fails, use the explicit config selectors
        const targets = chatBlocks.length > 0 ? chatBlocks : Array.from(document.querySelectorAll(`${config.userMsg}, ${config.aiMsg}`));

        targets.forEach(el => {
            // Logic to determine role: User messages usually have different styles/ids
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
                    if (resp && resp.success) {
                        // 1. Copy the prompt to clipboard
                        try {
                            await navigator.clipboard.writeText(resp.prompt);
                            console.log("[Transfer] Prompt copied to clipboard!");
                        } catch (err) {
                            console.error("[Transfer] Clipboard copy failed:", err);
                        }
                        // 2. Open the target AI site
                        window.open(resp.url, '_blank');
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
                console.log(`[Rewards] Skipping: User not logged in.`);
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
                        console.warn(`[Rewards] Extension updated. Please refresh the page.`);
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
            console.warn(`[Rewards] Extension updated. Please refresh the page.`);
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

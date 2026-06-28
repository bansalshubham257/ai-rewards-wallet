const COMMERCIAL_KEYWORDS = ['best', 'buy', 'price', 'recommend', 'hosting', 'vpn', 'crm', 'saas', 'laptop', 'insurance', 'course', 'credit card', 'software', 'cheap', 'top', 'deal', 'discount'];

function isCommercial(text) {
    const lowerText = text.toLowerCase();
    const found = COMMERCIAL_KEYWORDS.some(keyword => lowerText.includes(keyword));
    console.log(`[Rewards] Checking text: "${text.substring(0, 50)}..." - Commercial: ${found}`);
    return found;
}

function capturePrompt() {
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

    console.log(`[Rewards] Captured prompt: "${promptText ? promptText.substring(0, 50) + '...' : 'empty'}"`);

    if (promptText && promptText.trim().length > 0 && isCommercial(promptText)) {
        console.log(`[Rewards] Sending commercial prompt to background script...`);
        chrome.runtime.sendMessage({
            type: "PROMPT_CAPTURED",
            data: {
                prompt: promptText.trim(),
                url: window.location.hostname
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

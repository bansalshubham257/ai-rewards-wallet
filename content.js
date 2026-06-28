const COMMERCIAL_KEYWORDS = ['best', 'buy', 'price', 'recommend', 'hosting', 'vpn', 'crm', 'saas', 'laptop', 'insurance', 'course', 'credit card', 'software', 'cheap', 'top', 'deal', 'discount'];

function isCommercial(text) {
    const lowerText = text.toLowerCase();
    return COMMERCIAL_KEYWORDS.some(keyword => lowerText.includes(keyword));
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

    if (promptText && promptText.trim().length > 0 && isCommercial(promptText)) {
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

const API_BASE = "https://ai-rewards-wallet-production.up.railway.app";

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (res.ok) {
        await chrome.storage.local.set({ user: { email } });
        location.reload();
    } else {
        const err = await res.json();
        alert(err.detail || "Login failed");
    }
});

async function loadWallet() {
    const { user } = await chrome.storage.local.get("user");
    
    if (!user) {
        document.getElementById('login-section').classList.remove('hidden');
        return;
    }

    const res = await fetch(`${API_BASE}/wallet/balance?email=${user.email}`);
    const data = await res.json();
    document.getElementById('balance').innerText = data.balance;
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('wallet-section').classList.remove('hidden');
}

document.getElementById('logout-btn').addEventListener('click', () => {
    chrome.storage.local.remove("user");
    location.reload();
});

document.getElementById('withdraw-btn').addEventListener('click', async () => {
    const { user } = await chrome.storage.local.get("user");
    if (!user) return;

    const upi = prompt("Please enter your UPI ID for withdrawal:");
    if (!upi) return;

    const res = await fetch(`${API_BASE}/user/update-upi?email=${user.email}&upi=${upi}`, {
        method: 'POST'
    });

    if (res.ok) {
        alert("UPI ID updated! Your withdrawal request has been noted.");
    } else {
        alert("Failed to update UPI ID.");
    }
});

loadWallet();

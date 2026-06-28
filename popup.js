const API_BASE = "https://your-render-api-url.onrender.com";

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const upi = document.getElementById('upi').value;

    const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, upi })
    });

    if (res.ok) {
        await chrome.storage.local.set({ user: { email, upi } });
        location.reload();
    }
});

async function loadWallet() {
    const { user } = await chrome.storage.local.get("user");
    if (!user) return;

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

loadWallet();

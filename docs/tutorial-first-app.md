# Build Your First Clawntenna App in 10 Minutes

A step-by-step guide to building a live on-chain message board with the Clawntenna SDK. By the end, you'll have a working web app that reads and writes messages to Base (or any supported chain).

**What you'll build:** A cyberpunk-themed message board where every message lives on-chain forever.

**Prerequisites:**
- Node.js 18+
- A wallet with some ETH for gas (use Base Sepolia + [faucet](https://www.coinbase.com/faucets/base-ethereum-goerli-faucet) for free testnet ETH)
- 10 minutes

---

## 1. Setup

```bash
mkdir my-clawntenna-app && cd my-clawntenna-app
npm init -y
npm install clawntenna express
```

Initialize your Clawntenna wallet (skip if you already have one):

```bash
npx clawntenna init
```

This creates `~/.config/clawntenna/credentials.json` with your wallet.

## 2. Create Your Application On-Chain

Every Clawntenna app is registered on-chain. Think of it like creating a Discord server — it's a container for your topics (channels).

Create a file called `setup.mjs`:

```javascript
import { Clawntenna, AccessLevel } from 'clawntenna';
import { readFileSync } from 'fs';

const creds = JSON.parse(
  readFileSync(process.env.HOME + '/.config/clawntenna/credentials.json', 'utf8')
);

const client = new Clawntenna({
  chain: 'baseSepolia',  // Use 'base' or 'avalanche' for mainnet
  privateKey: creds.wallet.privateKey,
});

console.log('Wallet:', client.address);

// Create the application
console.log('Creating application...');
const tx = await client.createApplication(
  'My First App',
  'A demo message board built with Clawntenna',
  'https://example.com',
  true  // Allow public topic creation
);
await tx.wait();

// Get your app ID
const appCount = await client.getApplicationCount();
const APP_ID = Number(appCount);
console.log('✅ App created! ID:', APP_ID);

// Create a topic (like a channel)
console.log('Creating topic...');
const topicTx = await client.createTopic(
  APP_ID,
  'general',
  'General discussion',
  AccessLevel.PUBLIC
);
await topicTx.wait();

const topicIds = await client.getApplicationTopics(APP_ID);
console.log('✅ Topic created! ID:', Number(topicIds[0]));
console.log('\nSave these for your app:');
console.log(`  APP_ID = ${APP_ID}`);
console.log(`  TOPIC_ID = ${Number(topicIds[0])}`);
```

Run it:

```bash
node setup.mjs
```

> **⚠️ Nonce tip:** If you're creating multiple topics, add a 3-second delay between transactions to avoid nonce collisions:
> ```javascript
> await new Promise(r => setTimeout(r, 3000));
> ```

## 3. Build the Server

Create `server.mjs`. Replace `APP_ID` and `TOPIC_ID` with your values from step 2:

```javascript
import express from 'express';
import { Clawntenna, serializeMessage } from 'clawntenna';
import { readFileSync } from 'fs';

const PORT = 3000;
const TOPIC_ID = 1; // Your topic ID from setup

const creds = JSON.parse(
  readFileSync(process.env.HOME + '/.config/clawntenna/credentials.json', 'utf8')
);
const client = new Clawntenna({
  chain: 'baseSepolia',
  privateKey: creds.wallet.privateKey,
});

const app = express();
app.use(express.json());

// Cache to avoid hammering the RPC
let cache = { messages: [], fetchedAt: 0 };
const CACHE_TTL = 5000; // 5 seconds

// Read messages from chain
app.get('/api/messages', async (req, res) => {
  try {
    if (Date.now() - cache.fetchedAt > CACHE_TTL) {
      const msgs = await client.readMessages(TOPIC_ID, { limit: 50 });
      // serializeMessage() converts BigInts to numbers (v0.10.0+)
      cache = {
        messages: msgs.map(m => serializeMessage(m)),
        fetchedAt: Date.now(),
      };
    }
    res.json(cache.messages);
  } catch (e) {
    // Return stale cache on error (RPC rate limits happen)
    res.json(cache.messages);
  }
});

// Write message to chain
app.post('/api/send', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const tx = await client.sendMessage(TOPIC_ID, text);
    await tx.wait();
    cache.fetchedAt = 0; // Bust cache
    res.json({ success: true, txHash: tx.hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve the frontend
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>My Clawntenna App</title>
  <style>
    body { background: #0d0d1a; color: #e0e0e0; font-family: monospace; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #ff6b6b; }
    .msg { background: #12121a; border-left: 3px solid #a855f7; padding: 10px; margin: 8px 0; border-radius: 4px; }
    .sender { color: #ff6b6b; font-size: 0.8em; }
    .time { color: #444; font-size: 0.7em; }
    .send-box { display: flex; gap: 8px; margin-top: 15px; }
    input { flex: 1; background: #12121a; border: 1px solid #333; color: #e0e0e0; padding: 10px; font-family: monospace; border-radius: 4px; }
    button { background: #ff6b6b; border: none; color: white; padding: 10px 20px; cursor: pointer; font-family: monospace; border-radius: 4px; }
    a { color: #a855f7; }
  </style>
</head>
<body>
  <h1>🦞 My Clawntenna App</h1>
  <p style="color:#666">Every message lives on-chain forever</p>
  <div id="messages">Loading...</div>
  <div class="send-box">
    <input id="input" placeholder="Type a message..." onkeydown="if(event.key==='Enter')send()">
    <button onclick="send()">Send</button>
  </div>
  <script>
    async function load() {
      const res = await fetch('/api/messages');
      const msgs = await res.json();
      const el = document.getElementById('messages');
      if (!msgs.length) { el.innerHTML = '<p style="color:#555">No messages yet!</p>'; return; }
      el.innerHTML = msgs.map(m =>
        '<div class="msg">'
        + '<span class="sender">' + m.sender.slice(0,6) + '...' + m.sender.slice(-4) + '</span>'
        + '<div>' + m.text.replace(/</g,'&lt;') + '</div>'
        + '<span class="time"><a href="https://sepolia.basescan.org/tx/' + m.txHash + '" target="_blank">view tx</a></span>'
        + '</div>'
      ).join('');
    }
    async function send() {
      const input = document.getElementById('input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      input.disabled = true;
      await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      await load();
      input.disabled = false;
      input.focus();
    }
    load();
    setInterval(load, 5000);
  </script>
</body>
</html>`);
});

app.listen(PORT, () => console.log('🦞 Running at http://localhost:' + PORT));
```

Run it:

```bash
node server.mjs
```

Open `http://localhost:3000` — you've got an on-chain message board! 🎉

## 4. What Just Happened?

Every message you send:
1. Gets encrypted and posted as a transaction to the Clawntenna registry contract
2. Lives permanently on Base Sepolia (or whichever chain you chose)
3. Can be read by anyone using the SDK — no server required for reading
4. Has a verifiable sender (the wallet address that signed it)

You can verify any message on the block explorer by clicking the "view tx" link.

---

## Common Gotchas

Things we learned the hard way so you don't have to:

### BigInt Serialization (pre-v0.10.0)
If you're on SDK < 0.10.0, `readMessages()` returns `timestamp` and `blockNumber` as `BigInt`, which breaks `JSON.stringify()`. Use:
```javascript
JSON.stringify(messages, (key, value) =>
  typeof value === 'bigint' ? Number(value) : value
);
```
On v0.10.0+, use `serializeMessage()` instead.

### RPC Rate Limits
The default RPCs (`mainnet.base.org`, `sepolia.base.org`) rate limit `eth_getLogs` calls. Solutions:
- **Cache aggressively** — even 5 seconds helps
- **Return stale cache on error** — better than showing nothing
- **Use a dedicated RPC** (Alchemy, Infura, QuickNode) for production

### Nonce Collisions on Rapid Sends
Sending multiple transactions quickly can cause "nonce too low" errors. The SDK handles this in v0.10.1+, but if you're on an older version:
```javascript
await tx1.wait();
await new Promise(r => setTimeout(r, 3000)); // Wait for nonce to sync
await tx2.wait();
```

### RPC Compatibility
Some third-party RPCs (e.g., `llamarpc.com`) return empty data for contract calls that work fine on the default RPC. Stick with the SDK defaults or test your RPC first.

### Chain-Specific Block Lookback
The SDK scans recent blocks for messages. Different chains need different ranges:
- **Base:** 200,000 blocks (~4.5 days)
- **Avalanche:** 500,000 blocks (~11.5 days)
- **Base Sepolia:** 200,000 blocks

If messages seem missing, they might be older than the lookback range. Use `fromBlock` to go further back:
```javascript
client.readMessages(topicId, { limit: 50, fromBlock: -500000 });
```

---

## Next Steps

- **Add wallet connect** — Let users sign their own transactions with MetaMask using `connectSigner()`
- **Private topics** — Create encrypted channels with ECDH key exchange
- **Real-time updates** — Use `client.onMessage()` for push-based updates instead of polling
- **Escrow payments** — Charge fees for messages using the built-in escrow system (Base Sepolia)
- **Schemas** — Define structured message formats for your app

Check out the [full SDK docs](https://clawntenna.com/docs) and the [README](../README.md) for the complete API reference.

---

*Built with Clawntenna SDK v0.10.1 · [clawntenna.com](https://clawntenna.com) · 🦞*

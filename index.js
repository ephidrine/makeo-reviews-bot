const gplay = require('google-play-scraper');
const store = require('app-store-scraper');
const fetch = require('node-fetch');
const cron = require('node-cron');
const fs = require('fs');

// Config
const INSTANCE_ID = process.env.INSTANCE_ID;
const API_TOKEN = process.env.API_TOKEN;
const GROUP_ID = process.env.GROUP_ID;
const SEEN_FILE = 'seen.json';

// Load seen review IDs
function loadSeen() {
  if (!fs.existsSync(SEEN_FILE)) return {};
  return JSON.parse(fs.readFileSync(SEEN_FILE));
}

// Save seen review IDs
function saveSeen(seen) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen));
}

// Send WhatsApp message via Green API
async function sendWhatsApp(message) {
  const url = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId: GROUP_ID, message })
  });
}

// Format stars
function stars(n) {
  return '⭐'.repeat(n) + '☆'.repeat(5 - n);
}

// Check Play Store reviews
async function checkPlayStore(seen) {
  const reviews = await gplay.reviews({
    appId: 'com.toothsi',
    sort: gplay.sort.NEWEST,
    num: 10
  });

  for (const r of reviews.data) {
    if (seen[r.id]) continue;
    seen[r.id] = true;
    const msg = `🤖 *New Play Store Review*\n${stars(r.score)} \n👤 ${r.userName}\n📅 ${new Date(r.date).toDateString()}\n\n"${r.text}"`;
    await sendWhatsApp(msg);
  }
}

// Check App Store reviews
async function checkAppStore(seen) {
  const reviews = await store.reviews({
    appId: '1669671696',
    country: 'in',
    sort: store.sort.RECENT,
    page: 1
  });

  for (const r of reviews) {
    if (seen[r.id]) continue;
    seen[r.id] = true;
    const msg = `🍎 *New App Store Review*\n${stars(r.score)}\n👤 ${r.userName}\n📅 ${new Date(r.updated).toDateString()}\n\n"${r.text}"`;
    await sendWhatsApp(msg);
  }
}

// Main check function
async function checkReviews() {
  console.log('Checking reviews at', new Date().toISOString());
  const seen = loadSeen();
  try { await checkPlayStore(seen); } catch (e) { console.error('Play Store error:', e.message); }
  try { await checkAppStore(seen); } catch (e) { console.error('App Store error:', e.message); }
  saveSeen(seen);
}

// Run every hour
cron.schedule('0 * * * *', checkReviews);

// Also run immediately on start
checkReviews();
console.log('Bot started ✅');

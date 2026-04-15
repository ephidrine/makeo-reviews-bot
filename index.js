const gplay = require('google-play-scraper');
const store = require('app-store-scraper');
const fetch = require('node-fetch');
const { google } = require('googleapis');

// Config from environment variables
const INSTANCE_ID = process.env.INSTANCE_ID;
const API_TOKEN = process.env.API_TOKEN;
const GROUP_ID = process.env.GROUP_ID;
const SHEET_ID = '1mkGjmA51eZnVyY5WgkfNZMBmpFG5qriEQgzqaUs8_zI';
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

// Google Sheets auth
async function getSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

// Load seen IDs from Google Sheet
async function loadSeen(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:A'
  });
  const rows = res.data.values || [];
  const seen = {};
  rows.flat().forEach(id => seen[id] = true);
  return seen;
}

// Save new ID to Google Sheet
async function saveId(sheets, id) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [[id]] }
  });
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
async function checkPlayStore(sheets, seen) {
  const reviews = await gplay.reviews({
    appId: 'com.toothsi',
    sort: gplay.sort.NEWEST,
    num: 10
  });

  for (const r of reviews.data) {
    if (seen[r.id]) continue;
    seen[r.id] = true;
    await saveId(sheets, r.id);
    const msg = `🤖 *New Play Store Review*\n${stars(r.score)}\n👤 ${r.userName}\n📅 ${new Date(r.date).toDateString()}\n\n"${r.text}"`;
    await sendWhatsApp(msg);
    console.log('Sent Play Store review:', r.id);
  }
}

// Check App Store reviews
async function checkAppStore(sheets, seen) {
  const reviews = await store.reviews({
    appId: '1669671696',
    country: 'in',
    sort: store.sort.RECENT,
    page: 1
  });

  for (const r of reviews) {
    if (seen[r.id]) continue;
    seen[r.id] = true;
    await saveId(sheets, r.id);
    const msg = `🍎 *New App Store Review*\n${stars(r.score)}\n👤 ${r.userName}\n📅 ${new Date(r.updated).toDateString()}\n\n"${r.text}"`;
    await sendWhatsApp(msg);
    console.log('Sent App Store review:', r.id);
  }
}

// Main
async function main() {
  console.log('Running at', new Date().toISOString());
  const sheets = await getSheet();
  const seen = await loadSeen(sheets);
  try { await checkPlayStore(sheets, seen); } catch (e) { console.error('Play Store error:', e.message); }
  try { await checkAppStore(sheets, seen); } catch (e) { console.error('App Store error:', e.message); }
  console.log('Done ✅');
}

main();

const gplay = require('google-play-scraper');
const store = require('app-store-scraper');
const https = require('https');
const { google } = require('googleapis');

const INSTANCE_ID = process.env.INSTANCE_ID;
const API_TOKEN = process.env.API_TOKEN;
const GROUP_ID = process.env.GROUP_ID;
const SHEET_ID = '1mkGjmA51eZnVyY5WgkfNZMBmpFG5qriEQgzqaUs8_zI';
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

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

async function saveId(sheets, id) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:A',
    valueInputOption: 'RAW',
    requestBody: { values: [[id]] }
  });
}

async function sendWhatsApp(message) {
  const url = `https://api.green-api.com/waInstance${INSTANCE_ID}/sendMessage/${API_TOKEN}`;
  const body = JSON.stringify({ chatId: GROUP_ID, message });
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
function stars(n) {
  return '⭐'.repeat(n) + '☆'.repeat(5 - n);
}

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
    const msg = `*New Play Store Review*\n${stars(r.score)}\n ${r.userName}\n ${new Date(r.date).toDateString()}\n\n"${r.text}"`;
    await sendWhatsApp(msg);
    console.log('Sent Play Store review:', r.id);
  }
}

async function checkAppStore(sheets, seen) {
  const reviews = await store.reviews({
    id: 1573537173,
    country: 'in',
    sort: store.sort.RECENT,
    page: 1
  });
  for (const r of reviews) {
    if (seen[r.id]) continue;
    seen[r.id] = true;
    await saveId(sheets, r.id);
    const msg = `*New App Store Review*\n${stars(r.score)}\n👤 ${r.userName}\n ${new Date(r.updated).toDateString()}\n\n"${r.text}"`;
    await sendWhatsApp(msg);
    console.log('Sent App Store review:', r.id);
  }
}

async function main() {
  console.log('Running at', new Date().toISOString());
  const sheets = await getSheet();
  const seen = await loadSeen(sheets);
  try { await checkPlayStore(sheets, seen); } catch (e) { console.error('Play Store error:', e.message); }
  try { await checkAppStore(sheets, seen); } catch (e) { console.error('App Store error:', e.message); }
  console.log('Done ✅');
}

main();

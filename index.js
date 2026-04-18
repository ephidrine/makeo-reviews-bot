const gplay = require('google-play-scraper');
const store = require('app-store-scraper');
const https = require('https');
const { google } = require('googleapis');

const INSTANCE_ID = process.env.INSTANCE_ID;
const API_TOKEN = process.env.API_TOKEN;
const GROUP_ID = process.env.GROUP_ID;
const SHEET_ID = '1mkGjmA51eZnVyY5WgkfNZMBmpFG5qriEQgzqaUs8_zI';
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
const IS_SUMMARY = process.env.GITHUB_EVENT_SCHEDULE === '30 4 * * *';

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
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

async function getSheet() {
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function loadRows(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: 'Sheet1!A:A'
  });
  return res.data.values || [];
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

function getYesterdayIST() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  now.setDate(now.getDate() - 1);
  now.setHours(0, 0, 0, 0);
  return now;
}

function isYesterday(date) {
  const yesterday = getYesterdayIST();
  const d = new Date(new Date(date).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
}

async function sendSummary() {
  console.log('Fetching summary...');
  let playCount = 0, appleCount = 0;
  let playTotal = 0, appleTotal = 0;

  // Count yesterday's Play Store reviews
  try {
    const reviews = await gplay.reviews({
      appId: 'com.toothsi',
      sort: gplay.sort.NEWEST,
      num: 50
    });
    for (const r of reviews.data) {
      playTotal++;
      if (isYesterday(r.date)) playCount++;
    }
  } catch (e) { console.error('Play Store summary error:', e.message); }

  // Count yesterday's App Store reviews
  try {
    const reviews = await store.reviews({
      id: 1573537173,
      country: 'in',
      sort: store.sort.RECENT,
      page: 1
    });
    for (const r of reviews) {
      appleTotal++;
      if (isYesterday(r.updated)) appleCount++;
    }
  } catch (e) { console.error('App Store summary error:', e.message); }

  const yesterday = getYesterdayIST();
  const dateStr = yesterday.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const total = playCount + appleCount;

  const msg = ` *Daily Review Summary*\n ${dateStr}\n\n Play Store: ${playCount} new review${playCount !== 1 ? 's' : ''}\n App Store: ${appleCount} new review${appleCount !== 1 ? 's' : ''}\n\n*Total: ${total} new review${total !== 1 ? 's' : ''} yesterday*`;
  await sendWhatsApp(msg);
  console.log('Summary sent!');
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
    const msg = ` *New Play Store Review*\n${stars(r.score)}\n ${r.userName}\n ${new Date(r.date).toDateString()}\n\n"${r.text}"`;
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
    const msg = ` *New App Store Review*\n${stars(r.score)}\n ${r.userName}\n ${new Date(r.updated).toDateString()}\n\n"${r.text}"`;
    await sendWhatsApp(msg);
    console.log('Sent App Store review:', r.id);
  }
}

async function main() {
  console.log('Running at', new Date().toISOString());
  console.log('IS_SUMMARY:', IS_SUMMARY);

  if (IS_SUMMARY) {
    await sendSummary();
    return;
  }

  const sheets = await getSheet();
  const rows = await loadRows(sheets);
  const seen = {};
  rows.forEach(r => { if (r[0]) seen[r[0]] = true; });

  try { await checkPlayStore(sheets, seen); } catch (e) { console.error('Play Store error:', e.message); }
  try { await checkAppStore(sheets, seen); } catch (e) { console.error('App Store error:', e.message); }
  console.log('Done ✅');
}

main();

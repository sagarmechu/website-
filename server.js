const express = require('express');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
const XLSX = require('xlsx');
const db = require('./db');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const importScript = require('./import');
require('dotenv').config();

const app = express();
// Increase global JSON limit to allow saving large HTML payloads
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Simple request logger for debugging routes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// --- Admin: Chart data editor APIs ---
// Load chart data for a given game/year (reads from uploads CSV/XLSX or prebuilt JSON as fallback)
// Guard direct access to admin HTML files before static middleware
app.get('/admin.html', (req, res, next) => {
  const token = req.cookies && req.cookies['admin_token'] || req.headers['x-admin-token'];
  if (!verifyToken(token)) return res.redirect(302, '/login');
  res.sendFile(path.join(__dirname, 'static', 'admin.html'));
});
app.get('/admin-chart.html', (req, res, next) => {
  const token = req.cookies && req.cookies['admin_token'] || req.headers['x-admin-token'];
  if (!verifyToken(token)) return res.redirect(302, '/login');
  res.sendFile(path.join(__dirname, 'static', 'admin-chart.html'));
});

app.get('/admin/api/chart-data', requireAdmin, async (req, res) => {
  try{
    const gameRaw = (req.query.game || '').toString().trim();
    const yearRaw = (req.query.year || '').toString().trim();
    if (!gameRaw || !/^\d{4}$/.test(yearRaw)) return res.status(400).json({ error: 'invalid_params' });
    // Reuse logic of /api/chart-file
    req.query.game = gameRaw; req.query.year = yearRaw;
    const safeGame = gameRaw.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const base = `${safeGame}-${yearRaw}`;
    const csvPath = path.join(__dirname, 'static', 'uploads', base + '.csv');
    const xlsxPath = path.join(__dirname, 'static', 'uploads', base + '.xlsx');
    const dataPath = path.join(__dirname, 'static', 'data', base + '.json');
    // try CSV then XLSX then JSON
    let items = [];
    try{
      const content = await fs.promises.readFile(csvPath, 'utf8');
      const lines = content.split(/\r?\n/).filter(l=>l.trim().length>0);
      const header = (lines[0]||'').toLowerCase();
      const hasGame = /(^|,)game(,|$)/.test(header);
      for (let i=1;i<lines.length;i++){
        const row = lines[i].split(',');
        const cols = (lines[0]||'').split(',').map(s=>s.trim().toLowerCase());
        const di = cols.indexOf('date'); const ri = cols.indexOf('result'); const gi = cols.indexOf('game');
        const date = (row[di]||'').trim(); const result = (row[ri]||'').trim(); const game = hasGame ? (row[gi]||'').trim() : gameRaw;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date) && result) items.push({ date, result, game });
      }
    }catch(_){
      try{
        const wb = XLSX.readFile(xlsxPath); const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        for (const r of rows){
          const k = Object.keys(r).reduce((a,k)=>{a[k.toLowerCase()]=r[k]; return a;},{});
          const date = String(k.date||'').trim(); const result = String(k.result||'').trim(); const game = String(k.game||gameRaw).trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(date) && result) items.push({ date, result, game });
        }
      }catch(_e){
        try{
          const j = JSON.parse(await fs.promises.readFile(dataPath,'utf8'));
          items = (j && j.items) || [];
        }catch(__){ items = []; }
      }
    }
    res.json({ game: gameRaw, year: yearRaw, items });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

// Save chart data for a given game/year: writes uploads CSV and XLSX, and updates static/data JSON
app.post('/admin/api/chart-data', requireAdmin, express.json({ limit: '2mb' }), async (req, res) => {
  try{
    const { game, year, items } = req.body || {};
    const gameRaw = (game||'').toString().trim();
    const yearRaw = (year||'').toString().trim();
    if (!gameRaw || !/^\d{4}$/.test(yearRaw) || !Array.isArray(items)) return res.status(400).json({ error: 'invalid_params' });
    const safeGame = gameRaw.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
    const base = `${safeGame}-${yearRaw}`;
    const uploadsDir = path.join(__dirname, 'static', 'uploads');
    const dataDir = path.join(__dirname, 'static', 'data');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    await fs.promises.mkdir(dataDir, { recursive: true });
    // Normalize and sort by date
    const clean = items
      .map(it=>({
        date: String(it.date||'').trim(),
        result: String(it.result||'').trim(),
        game: (String(it.game||'').trim() || gameRaw)
      }))
      .filter(it=>/^\d{4}-\d{2}-\d{2}$/.test(it.date) && it.result);
    clean.sort((a,b)=> a.date.localeCompare(b.date));
    // Write CSV
    const csv = ['date,result,game'].concat(clean.map(it=>`${it.date},${it.result},${it.game}`)).join('\n');
    await fs.promises.writeFile(path.join(uploadsDir, base + '.csv'), csv, 'utf8');
    // Write XLSX
    try{
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(clean.map(it=>({ Date: it.date, Result: it.result, Game: it.game })));
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, path.join(uploadsDir, base + '.xlsx'));
    }catch(e){ console.warn('xlsx write failed', e.message); }
    // Write JSON
    const json = { game: gameRaw, year: yearRaw, items: clean };
    await fs.promises.writeFile(path.join(dataDir, base + '.json'), JSON.stringify(json), 'utf8');
    res.json({ ok: true, saved: clean.length });
  }catch(err){ res.status(500).json({ error: err.message }); }
});

app.use('/static', express.static(path.join(__dirname, 'static')));
// Also serve static files at site root so relative links like /chart-1-2025.html work
app.use(express.static(path.join(__dirname, 'static')));
// Serve prebuilt JSON data with strong caching
app.use('/data', express.static(path.join(__dirname, 'static', 'data'), { maxAge: '7d', immutable: true }));

app.get('/api/results', async (req, res) => {
  const rows = await db.listResults(200);
  res.json({ data: rows });
});

// return chart rows
app.get('/api/chart', async (req, res) => {
  try{
    if (typeof db.listCharts !== 'function') return res.json({ rows: [] });
    const rows = await db.listCharts(5000);
    // rows: [{id, chart_date, game, result, source}, ...]
    // Group by chart_date and pivot games into columns
    const map = new Map();
    for (const r of rows){
      const date = r.chart_date || r.date || '';
      if (!map.has(date)) map.set(date, { date });
      const obj = map.get(date);
      // normalize game name keys
      const key = (r.game || '').trim();
      if (key) obj[key] = r.result;
    }
    const out = Array.from(map.values());
    res.json({ rows: out });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

// Redirect legacy chart pages like /chart-1-2021.html to generic viewer
const ID_TO_GAME = {
  '1': 'GALI',
  '2': 'DISAWER',
  '3': 'FARIDABAD',
  '4': 'GAZIYABAD',
  '5': 'DELHI BAZAR',
  '6': 'SHRI GANESH',
  '7': 'ALWAR',
  '8': 'AGRA',
  '9': 'DWARKA',
  '10': 'SADAR BAZAR',
  '11': 'GWALIOR',
  '12': 'KAROL BAGH',
  '18': 'RAJ SHREE',
  '31': 'DAMAN',
  '57': 'DIAMOND SATTA',
  '73': 'HR SATTA',
  '76': 'DELHI SUPER',
  '80': 'UJJALA SUPER',
  '82': 'NEW GANGA',
  '89': 'DELHI MATKA',
  '93': 'DEHRADUN CITY',
  '104': 'UDAIPUR',
  '105': 'SAROJINI'
};
app.get(/^\/chart-(\d+)-(\d{4})\.html$/i, (req, res) => {
  const id = req.params[0];
  const year = req.params[1];
  const game = ID_TO_GAME[id];
  if (!game) return res.status(404).send('Unknown chart id');
  const url = `/chart-view.html?game=${encodeURIComponent(game)}&year=${encodeURIComponent(year)}`;
  res.redirect(302, url);
});

// Lightweight file-backed chart API: reads CSV like `${game}-${year}.csv` from static/uploads
// CSV format expected: header row with at least `date,result` where date is YYYY-MM-DD
// Example:
// date,result\n
// 2021-01-01,04\n
// 2021-02-01,91
app.get('/api/chart-file', async (req, res) => {
  try{
    const gameRaw = (req.query.game || '').toString().trim();
    const yearRaw = (req.query.year || '').toString().trim();
    if (!gameRaw || !/^[0-9]{4}$/.test(yearRaw)){
      return res.status(400).json({ error: 'invalid_params', hint: 'Provide game and year=YYYY' });
    }
    // sanitize filename: lowercase, replace spaces and non-word with dash
    const safeGame = gameRaw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const base = `${safeGame}-${yearRaw}`;
    const csvPath = path.join(__dirname, 'static', 'uploads', base + '.csv');
    const xlsxPath = path.join(__dirname, 'static', 'uploads', base + '.xlsx');
    const items = [];
    async function tryParseCSV(){
      try{
        const content = await fs.promises.readFile(csvPath, 'utf8');
        const lines = content.split(/\r?\n/).filter(l=>l.trim().length>0);
        if (!lines.length) return false;
        const header = lines[0].split(',').map(s=>s.trim().toLowerCase());
        const colIdx = { date: header.indexOf('date'), result: header.indexOf('result'), game: header.indexOf('game') };
        if (colIdx.date === -1 || colIdx.result === -1) return false;
        for (let i=1;i<lines.length;i++){
          const row = lines[i].split(',');
          const date = (row[colIdx.date]||'').trim();
          const result = (row[colIdx.result]||'').trim();
          const game = colIdx.game !== -1 ? (row[colIdx.game]||'').trim() : gameRaw;
          if (!date || !result) continue;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          items.push({ date, result, game });
        }
        return true;
      }catch(e){ return false; }
    }
    function tryParseXLSX(){
      try{
        const wb = XLSX.readFile(xlsxPath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows || !rows.length) return false;
        for (const r of rows){
          const keys = Object.keys(r).reduce((acc,k)=>{ acc[k.toLowerCase()] = r[k]; return acc; }, {});
          const date = String(keys['date']||'').trim();
          const result = String(keys['result']||'').trim();
          const game = String(keys['game']||gameRaw).trim();
          if (!date || !result) continue;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          items.push({ date, result, game });
        }
        return true;
      }catch(e){ return false; }
    }
    const okCSV = await tryParseCSV();
    const okXLSX = okCSV ? false : tryParseXLSX();
    if (!okCSV && !okXLSX){
      return res.status(404).json({ error: 'not_found', message: `No data file found: uploads/${base}.csv or .xlsx` });
    }
    res.json({ game: gameRaw, year: yearRaw, items });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

// Admin or passcode: save homepage edits (index.html)
app.post('/admin/api/page', express.json({ limit: '10mb' }), async (req, res) => {
  try{
    const { file, html, passcode } = req.body || {};
    // allow if admin cookie valid OR passcode matches
    let okAuth = false;
    try{
      const token = (req.cookies && req.cookies['admin_token']) || req.get('x-admin-token');
      if (token && typeof verifyToken === 'function' && verifyToken(token)) okAuth = true;
    }catch(_){}
    if (!okAuth){
      const EDIT_PASSCODE = process.env.EDIT_PASSCODE || 'a7edit';
      if (!passcode || passcode !== EDIT_PASSCODE) return res.status(401).json({ error: 'unauthorized' });
    }
    if (!html || typeof html !== 'string') return res.status(400).json({ error: 'html_required' });
    // Only allow specific files for safety
    const allowed = new Set(['index.html','chart.html','contact.html']);
    const safeFile = allowed.has(file) ? file : 'index.html';
    const target = path.join(__dirname, 'static', safeFile);
    if (html.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'too_large' });
    await fs.promises.writeFile(target, html, 'utf8');
    let chartsUpdated = 0;
    try{
      if (safeFile === 'index.html'){
        chartsUpdated = await extractAndStoreTodayResults(html);
      }
    }catch(parseErr){
      console.warn('extractAndStoreTodayResults failed:', parseErr.message);
    }
    res.json({ ok: true, chartsUpdated });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

// return latest row per game
app.get('/api/latest', async (req, res) => {
  try{
    const rows = await db.latestByGame();
    res.json({ data: rows });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

// Serve chart and contact pages directly at root paths
app.get('/chart.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'chart.html'));
});

app.get('/contact.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'contact.html'));
});

// Mirror lucky-satta paths expected by mirrored HTML
app.get(['/yearsChart','/yearsChart/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'chart.html'));
});

app.get(['/contact','/contact/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'contact.html'));
});

// Serve dedicated login page
app.get(['/login','/login/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'login.html'));
});

const port = process.env.PORT || 3000;

// Admin cookie helpers
const ADMIN_COOKIE = 'admin_token';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'change-me-please';
function signToken(user, ts){
  const payload = `${user}:${ts}`;
  const h = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  return `${payload}:${h}`;
}
function verifyToken(token){
  if (!token) return null;
  const parts = token.split(':');
  if (parts.length < 3) return null;
  const h = parts.slice(2).join(':');
  const payload = `${parts[0]}:${parts[1]}`;
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(h,'hex'))) return null;
  const ts = parseInt(parts[1],10);
  if (isNaN(ts)) return null;
  // expire after 14 days
  if (Date.now() - ts > 1000*60*60*24*14) return null;
  return { user: parts[0], ts };
}

function requireAdmin(req, res, next){
  const token = req.cookies && req.cookies[ADMIN_COOKIE] || req.headers['x-admin-token'];
  const info = verifyToken(token);
  if (!info) return res.status(401).json({ error: 'unauthorized' });
  req.admin = info;
  next();
}

// Middleware for admin pages: redirect to /login if not authenticated
function requireAdminPage(req, res, next){
  const token = req.cookies && req.cookies[ADMIN_COOKIE] || req.headers['x-admin-token'];
  const info = verifyToken(token);
  if (!info) return res.redirect(302, '/login');
  req.admin = info;
  next();
}

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'admin.html'));
});

// Admin chart editor page
app.get('/admin/chart', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'admin-chart.html'));
});

app.post('/admin/login', async (req, res) => {
  const { user, password } = req.body || {};
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
  if (user === ADMIN_USER && password === ADMIN_PASSWORD){
    const ts = Date.now();
    const token = signToken(user, ts);
    // set httpOnly cookie
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'Lax' });
    return res.json({ ok: true });
  }
  res.status(403).json({ error: 'invalid_credentials' });
});

app.post('/admin/logout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE);
  res.json({ ok: true });
});

app.get('/admin/api/me', (req, res) => {
  const token = req.cookies && req.cookies[ADMIN_COOKIE] || req.headers['x-admin-token'];
  const info = verifyToken(token);
  if (!info) return res.json({ loggedIn: false });
  return res.json({ loggedIn: true, user: info.user });
});

// Protected admin API to trigger an import
app.post('/admin/api/import', requireAdmin, async (req, res) => {
  try{
    await importScript.run();
    res.json({ ok: true, message: 'import started' });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

// Admin CRUD for results
app.get('/admin/api/results', requireAdmin, async (req, res) => {
  try{
    const limit = parseInt(req.query.limit || '200', 10);
    const rows = await db.listResults(isNaN(limit) ? 200 : limit);
    res.json({ data: rows });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/api/results', requireAdmin, async (req, res) => {
  try{
    const { game, result, result_time, date, source } = req.body || {};
    if (!game || !result) return res.status(400).json({ error: 'game_and_result_required' });
    const id = await db.insertResult({ game, result, result_time: result_time || null, date: date || null, source: source || 'admin' });
    const row = await db.getResultById(id);
    res.json({ ok: true, data: row });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/api/results/:id', requireAdmin, async (req, res) => {
  try{
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
    const { game, result, result_time, date, source } = req.body || {};
    const changes = await db.updateResult(id, { game, result, result_time, date, source });
    if (!changes) return res.status(404).json({ error: 'not_found' });
    const row = await db.getResultById(id);
    res.json({ ok: true, data: row });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/api/results/:id', requireAdmin, async (req, res) => {
  try{
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'invalid_id' });
    const changes = await db.deleteResult(id);
    if (!changes) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

(async ()=>{
  await db.init();
  if (typeof db.initCharts === 'function') await db.initCharts();
  app.listen(port, () => console.log('Server running on port', port));
})();

// Friendly 404 for anything else
app.use((req, res) => {
  res.status(404).send(`Route not found: ${req.method} ${req.originalUrl}`);
});

// --- Helpers: parse homepage and store today's results into charts table ---
function todayYMD(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

async function extractAndStoreTodayResults(html){
  const $ = cheerio.load(html);
  // Find a table that has a header containing 'आज का रिज़ल्ट'
  let table = null;
  $('table').each((_, t)=>{
    const text = $(t).text();
    if (/आज\s*का\s*रि?ज़?ज?ल?्ट/i.test(text)) { table = t; return false; }
  });
  if (!table) return 0;
  const date = todayYMD();
  let count = 0;
  // Try to find header row and column indexes
  let headerIdxs = { game: 0, today: 2 };
  let foundHeader = false;
  const rows = $(table).find('tr');
  rows.each((i, tr)=>{
    if (foundHeader) return;
    const cells = $(tr).children('th,td');
    if (!cells.length) return;
    let g = -1, tcol = -1;
    cells.each((j, cell)=>{
      const txt = $(cell).text().trim();
      if (g === -1 && /(game|नाम|सट्टा|गैम|घाट)\s*(का|के)?\s*(नाम)?/i.test(txt)) g = j;
      if (tcol === -1 && /(आज)\s*(का)?\s*(रि?ज़?ज?ल?्ट|result)/i.test(txt)) tcol = j;
    });
    if (g !== -1 || tcol !== -1){
      headerIdxs.game = g !== -1 ? g : headerIdxs.game;
      headerIdxs.today = tcol !== -1 ? tcol : headerIdxs.today;
      foundHeader = true;
    }
  });
  rows.each((i, tr)=>{
    const tds = $(tr).find('td');
    if (tds.length === 0) return; // skip header rows
    const gi = Math.min(headerIdxs.game, tds.length-1);
    const ti = Math.min(headerIdxs.today, tds.length-1);
    // game name
    let gameRaw = $(tds[gi]).text().trim();
    if (!gameRaw) return;
    const firstLine = gameRaw.split('\n').map(s=>s.trim()).filter(Boolean)[0] || gameRaw;
    const game = firstLine.toUpperCase();
    // today's result
    let result = $(tds[ti]).text().trim();
    result = result.replace(/[^0-9*-]+/g,'').trim();
    if (!/\d/.test(result)) return;
    // Store into charts (upsert by date+game)
    if (typeof db.upsertChart === 'function'){
      db.upsertChart({ chart_date: date, game, result, source: 'admin-save' })
        .catch(e=>console.warn('upsertChart error', e.message));
      count++;
    } else if (typeof db.insertChart === 'function'){
      db.insertChart({ chart_date: date, game, result, source: 'admin-save' })
        .catch(e=>console.warn('insertChart error', e.message));
      count++;
    }
  });
  console.log('extractAndStoreTodayResults updated rows:', count);
  return count;
}

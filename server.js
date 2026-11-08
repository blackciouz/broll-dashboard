#!/usr/bin/env node
'use strict';
/*
 * B-Roll Dashboard — serveur : statique + proxy vers l'API + zip à la volée.
 * Zéro dépendance. La clé admin de l'API reste côté serveur (env BROLL_API_KEY).
 * L'accès au dashboard est protégé par DASHBOARD_KEY (env).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DASHBOARD_KEY = process.env.DASHBOARD_KEY || '';
const API_BASE = (process.env.BROLL_API_URL || 'http://10.0.1.1:3070').replace(/\/+$/, '');
const API_KEY = process.env.BROLL_API_KEY || '';
const HTTP_LIB = API_BASE.startsWith('https') ? require('https') : http;

if (!DASHBOARD_KEY || DASHBOARD_KEY.length < 16 || !API_KEY) {
  console.error('FATAL: DASHBOARD_KEY (>=16) et BROLL_API_KEY requises.');
  process.exit(1);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, code, body, headers) {
  const b = typeof body === 'string' ? Buffer.from(body) : body;
  res.writeHead(code, Object.assign({ 'Content-Length': b.length, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' }, headers || {}));
  res.end(b);
}
function sendJson(res, code, obj, headers) { send(res, code, JSON.stringify(obj), Object.assign({'Content-Type':'application/json; charset=utf-8'}, headers||{})); }
function timingEq(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

// ---- sessions (jetons émis au login, 12 h) ----
const sessions = new Map(); // token -> expires
function newSession() {
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, Date.now() + 12 * 3600 * 1000);
  return t;
}
function sessionValid(req, url) {
  const t = req.headers['x-dash-session'] || (url && url.searchParams.get('session'));
  const exp = typeof t === 'string' && sessions.get(t);
  if (!exp) return false;
  if (Date.now() > exp) { sessions.delete(t); return false; }
  return true;
}
function proxy(req, res, urlPath, query) {
  const target = API_BASE + urlPath + (query || '');
  const headers = { 'X-API-Key': API_KEY };
  if (req.headers.range) headers['Range'] = req.headers.range;
  if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
  if (req.headers['content-length']) headers['Content-Length'] = req.headers['content-length'];
  const up = HTTP_LIB.request(target, { method: req.method, headers }, (ur) => {
    const h = { 'Content-Type': ur.headers['content-type'] || 'application/octet-stream' };
    if (ur.headers['content-length']) h['Content-Length'] = ur.headers['content-length'];
    if (ur.headers['content-range']) h['Content-Range'] = ur.headers['content-range'];
    if (ur.headers['accept-ranges']) h['Accept-Ranges'] = ur.headers['accept-ranges'];
    if (ur.headers['content-disposition']) h['Content-Disposition'] = ur.headers['content-disposition'];
    h['Cache-Control'] = 'no-store';
    res.writeHead(ur.statusCode, h);
    ur.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) sendJson(res, 502, { error: 'API injoignable' }); else res.destroy(); });
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) req.pipe(up);
  else up.end();
}

// ---- zip à la volée (méthode store, streaming) ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

const streamMod = require('stream');
async function apiGet(p) {
  const r = await fetch(API_BASE + p, { headers: { 'X-API-Key': API_KEY } });
  if (r.status !== 200) { await r.arrayBuffer().catch(() => {}); throw new Error('upstream ' + r.status); }
  return streamMod.Readable.fromWeb(r.body);
}
function fetchJson(p) { return apiGet(p).then((s) => new Promise((res2, rej2) => { let d = ''; s.on('data', (c) => d += c); s.on('end', () => { try { res2(JSON.parse(d)); } catch (e) { rej2(e); } }); s.on('error', rej2); })); }

async function zipHandler(req, res, query) {
  const q = new URLSearchParams(query);
  const bank = q.get('bank');
  const names = (q.get('files') || '').split(',').filter((s) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(s));
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(bank || '') || !names.length || names.length > 500) return sendJson(res, 400, { error: 'paramètres invalides' });
  res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${bank}-selection.zip"`, 'Cache-Control': 'no-store' });
  const central = [];
  let offset = 0;
  const write = (buf) => new Promise((ok) => { offset += buf.length; if (!res.write(buf)) res.once('drain', ok); else ok(); });
  const pump = (stream, crc) => new Promise((resolve) => {
    stream.on('data', (chunk) => { offset += chunk.length; crc.c = crcUpdate(crc.c, chunk); crc.size += chunk.length; if (!res.write(chunk)) stream.pause(), res.once('drain', () => stream.resume()); });
    stream.on('end', resolve);
    stream.on('error', (e) => { console.log('ZIP stream err:', e.message); resolve(); });
  });
  for (const name of names) {
    const type = name.startsWith('thumb_') ? 'thumbs' : 'files';
    let stream;
    try { stream = await apiGet(`/v1/banks/${bank}/${type}/${name}/raw`); }
    catch { continue; }
    const localOffset = offset;
    const crc = { c: 0xFFFFFFFF, size: 0 };
    const header = Buffer.alloc(30 + Buffer.byteLength(name));
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0808, 6);            // bit 3 = data descriptor ; méthode 0 = store
    header.writeUInt16LE(0, 10); header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14); header.writeUInt32LE(0, 18); header.writeUInt32LE(0, 22);
    header.writeUInt16LE(Buffer.byteLength(name), 26); header.write(name, 30);
    await write(header);
    await pump(stream, crc);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE((crc.c ^ 0xFFFFFFFF) >>> 0, 4);
    descriptor.writeUInt32LE(crc.size, 8); descriptor.writeUInt32LE(crc.size, 12);
    await write(descriptor);
    central.push({ name, crc: (crc.c ^ 0xFFFFFFFF) >>> 0, size: crc.size, offset: localOffset });
  }
  let cdSize = 0;
  console.log('ZIP central:', JSON.stringify(central));
  const cdBufs = central.map((c) => {
    const h = Buffer.alloc(46 + Buffer.byteLength(c.name));
    h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6);
    h.writeUInt16LE(0x0008, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0, 12); h.writeUInt16LE(0, 14);
    h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.size, 20); h.writeUInt32LE(c.size, 24);
    h.writeUInt16LE(Buffer.byteLength(c.name), 28); h.writeUInt16LE(0, 30); h.writeUInt16LE(0, 32);
    h.writeUInt16LE(0, 34); h.writeUInt16LE(0, 36); h.writeUInt32LE(c.offset, 42); h.write(c.name, 46);
    cdSize += h.length; return h;
  });
  const cdOffset = offset;
  for (const b of cdBufs) await write(b);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(central.length, 8); end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(cdOffset, 16); end.writeUInt16LE(0, 20);
  await write(end);
  res.end();
}
function crcUpdate(c, buf) { for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return c; }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (p === '/api/login' && req.method === 'POST') {
      let d = '';
      req.on('data', (c) => { d += c; if (d.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const key = JSON.parse(d).key || '';
          if (timingEq(key, DASHBOARD_KEY)) return sendJson(res, 200, { ok: true, token: newSession() });
          sendJson(res, 401, { error: 'clé incorrecte' });
        } catch { sendJson(res, 400, { error: 'JSON invalide' }); }
      });
      return;
    }
    if (p.startsWith('/api/zip') && req.method === 'GET') {
      if (!sessionValid(req, url)) return sendJson(res, 401, { error: 'non connecté' });
      return zipHandler(req, res, url.search);
    }
    if (p.startsWith('/api/v1/')) {
      if (!sessionValid(req, url)) return sendJson(res, 401, { error: 'non connecté' });
      return proxy(req, res, p.replace('/api', ''), url.search);
    }
    // statique
    let file = p === '/' ? 'index.html' : p.slice(1);
    file = file.replace(/\.\./g, '');
    const fp = path.join(PUBLIC_DIR, file);
    if (!fp.startsWith(PUBLIC_DIR)) return send(res, 403, 'interdit');
    fs.stat(fp, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'introuvable');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-cache' });
      fs.createReadStream(fp).pipe(res);
    });
  } catch (e) {
    console.error('ERR', req.method, req.url, e.message, e.stack && e.stack.split('\n')[1]);
    if (!res.headersSent) sendJson(res, 500, { error: 'erreur interne' });
    else res.destroy();
  }
});
server.requestTimeout = 600000;
server.listen(PORT, HOST, () => console.log(new Date().toISOString(), `B-Roll Dashboard sur ${HOST}:${PORT} → ${API_BASE}`));

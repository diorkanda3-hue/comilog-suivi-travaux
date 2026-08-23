/**
 * Mini serveur — Suivi Travaux Patrimoine (Comilog)
 * ---------------------------------------------------
 * Serveur 100% Node.js natif (aucune dépendance à installer : pas de
 * `npm install`). Il fait trois choses :
 *   1. Sert l'application (dossier /public) sur http://localhost:PORT
 *   2. Expose une API REST qui lit/écrit data/dossiers.json (les ordres
 *      de travail), pour que tout ce qui est saisi dans l'application
 *      soit conservé entre deux ouvertures.
 *   3. Gère des comptes utilisateurs (data/users.json) avec connexion
 *      par identifiant/mot de passe, et une administration réservée
 *      aux comptes "admin" pour créer/supprimer des comptes.
 *
 * Lancement :
 *   node server.js
 * Puis ouvrir : http://localhost:3000
 *
 * Premier lancement : comme aucun compte n'existe encore, l'écran de
 * connexion propose de créer le premier compte — il devient
 * automatiquement administrateur.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DOSSIERS_FILE = path.join(DATA_DIR, 'dossiers.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ACTIVITY_FILE = path.join(DATA_DIR, 'activity.json');
const ACTIVITY_MAX_ENTRIES = 1000; // évite que le fichier ne grossisse indéfiniment

// ============================================================
// Stockage fichier (dossiers + utilisateurs + historique)
// ============================================================
function ensureDataFiles(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if(!fs.existsSync(DOSSIERS_FILE)) fs.writeFileSync(DOSSIERS_FILE, '[]', 'utf8');
  if(!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');
  if(!fs.existsSync(ACTIVITY_FILE)) fs.writeFileSync(ACTIVITY_FILE, '[]', 'utf8');
}
function readJSON(file){
  ensureDataFiles();
  try{ return JSON.parse(fs.readFileSync(file, 'utf8') || '[]'); }
  catch(err){ console.error('Erreur de lecture de', file, ':', err.message); return []; }
}
function writeJSON(file, data){
  ensureDataFiles();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
const readDossiers = () => readJSON(DOSSIERS_FILE);
const writeDossiers = (list) => writeJSON(DOSSIERS_FILE, list);
const readUsers = () => readJSON(USERS_FILE);
const writeUsers = (list) => writeJSON(USERS_FILE, list);
const readActivity = () => readJSON(ACTIVITY_FILE);

let __activityIdCounter = Date.now();
function logActivity(username, action, details){
  const list = readActivity();
  list.unshift({
    id: ++__activityIdCounter,
    username,
    action, // 'ajout' | 'modification' | 'suppression' | 'import'
    details: details || null,
    at: new Date().toISOString(),
  });
  if(list.length > ACTIVITY_MAX_ENTRIES) list.length = ACTIVITY_MAX_ENTRIES;
  writeJSON(ACTIVITY_FILE, list);
}

let __idCounter = Date.now();
function nextId(){ __idCounter += 1; return __idCounter; }

// ============================================================
// Authentification : mots de passe hachés (scrypt, natif Node,
// aucune dépendance externe) + jetons de session en mémoire.
// ============================================================
function hashPassword(password, salt){
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash){
  const attempt = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(attempt, 'hex');
  const b = Buffer.from(hash, 'hex');
  if(a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// jeton -> { userId, expiresAt }  (perdu si le serveur redémarre : il
// suffit de se reconnecter, comportement volontairement simple)
const sessions = new Map();
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 heures
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // considéré "en ligne" si actif dans les 5 dernières minutes

function createSession(userId){
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_DURATION_MS, lastActivityAt: Date.now() });
  return token;
}
function getSessionUser(token){
  if(!token) return null;
  const session = sessions.get(token);
  if(!session) return null;
  if(session.expiresAt < Date.now()){ sessions.delete(token); return null; }
  session.lastActivityAt = Date.now();
  const users = readUsers();
  const user = users.find(u => u.id === session.userId);
  if(user && user.active === false) return null;
  return user || null;
}
function getOnlineUserIds(){
  const online = new Set();
  const now = Date.now();
  for(const session of sessions.values()){
    if(session.expiresAt >= now && (now - session.lastActivityAt) <= ONLINE_THRESHOLD_MS){
      online.add(session.userId);
    }
  }
  return online;
}
function publicUser(u, onlineIds){
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
    online: onlineIds ? onlineIds.has(u.id) : false,
    active: u.active !== false,
  };
}

// ============================================================
// Utilitaires HTTP
// ============================================================
function sendJSON(res, statusCode, payload){
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}
function readBody(req){
  return new Promise((resolve, reject)=>{
    let chunks = [], size = 0;
    req.on('data', (chunk)=>{
      size += chunk.length;
      if(size > 10 * 1024 * 1024){ reject(new Error('Corps de requête trop volumineux')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', ()=>{
      const raw = Buffer.concat(chunks).toString('utf8');
      if(!raw){ resolve(null); return; }
      try{ resolve(JSON.parse(raw)); }
      catch(err){ reject(new Error('JSON invalide : ' + err.message)); }
    });
    req.on('error', reject);
  });
}
function getBearerToken(req){
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer (.+)$/);
  return m ? m[1] : null;
}
function requireAuth(req, res){
  const user = getSessionUser(getBearerToken(req));
  if(!user){ sendJSON(res, 401, { error: 'Non authentifié. Veuillez vous reconnecter.' }); return null; }
  return user;
}
function requireAdmin(req, res){
  const user = requireAuth(req, res);
  if(!user) return null;
  if(user.role !== 'admin'){ sendJSON(res, 403, { error: 'Réservé aux administrateurs.' }); return null; }
  return user;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
function serveStatic(req, res, pathname){
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, decodeURIComponent(filePath));
  if(!filePath.startsWith(PUBLIC_DIR)){ res.writeHead(403); res.end('Interdit'); return; }
  fs.readFile(filePath, (err, content)=>{
    if(err){
      if(err.code === 'ENOENT'){ res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); res.end('404 — Fichier non trouvé'); }
      else{ res.writeHead(500, {'Content-Type':'text/plain; charset=utf-8'}); res.end('500 — Erreur serveur : ' + err.message); }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'});
    res.end(content);
  });
}

function validCredentials(username, password){
  if(typeof username !== 'string' || typeof password !== 'string') return false;
  username = username.trim();
  return username.length >= 2 && password.length >= 4;
}

// ============================================================
// Serveur HTTP
// ============================================================
const server = http.createServer(async (req, res)=>{
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  console.log(`${new Date().toLocaleTimeString('fr-FR')}  ${req.method}  ${pathname}`);

  if(req.method === 'OPTIONS'){
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // ---------------- AUTHENTIFICATION ----------------
  if(pathname === '/api/auth/status' && req.method === 'GET'){
    const users = readUsers();
    sendJSON(res, 200, { hasUsers: users.length > 0 });
    return;
  }

  if(pathname === '/api/auth/register-first' && req.method === 'POST'){
    try{
      const users = readUsers();
      if(users.length > 0){ sendJSON(res, 403, { error: 'Un compte existe déjà — connectez-vous, ou demandez à un administrateur de vous créer un compte.' }); return; }
      const body = await readBody(req) || {};
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if(!validCredentials(username, password)){ sendJSON(res, 400, { error: 'Identifiant (2+ car.) et mot de passe (4+ car.) requis.' }); return; }
      const { salt, hash } = hashPassword(password);
      const nowIso = new Date().toISOString();
      const user = { id: nextId(), username, salt, hash, role: 'admin', createdAt: nowIso, lastLoginAt: nowIso, active: true };
      writeUsers([user]);
      const token = createSession(user.id);
      sendJSON(res, 201, { token, user: publicUser(user, getOnlineUserIds()) });
    }catch(err){ sendJSON(res, 400, { error: err.message }); }
    return;
  }

  if(pathname === '/api/auth/login' && req.method === 'POST'){
    try{
      const body = await readBody(req) || {};
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const users = readUsers();
      const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
      if(!user || !verifyPassword(password, user.salt, user.hash)){
        sendJSON(res, 401, { error: 'Identifiant ou mot de passe incorrect.' });
        return;
      }
      if(user.active === false){
        sendJSON(res, 403, { error: 'Ce compte a été désactivé. Contactez un administrateur.' });
        return;
      }
      const token = createSession(user.id);
      user.lastLoginAt = new Date().toISOString();
      const allUsers = readUsers();
      const idx = allUsers.findIndex(u => u.id === user.id);
      if(idx !== -1){ allUsers[idx].lastLoginAt = user.lastLoginAt; writeUsers(allUsers); }
      sendJSON(res, 200, { token, user: publicUser(user, getOnlineUserIds()) });
    }catch(err){ sendJSON(res, 400, { error: err.message }); }
    return;
  }

  if(pathname === '/api/auth/me' && req.method === 'GET'){
    const user = requireAuth(req, res);
    if(!user) return;
    sendJSON(res, 200, { user: publicUser(user, getOnlineUserIds()) });
    return;
  }

  if(pathname === '/api/auth/logout' && req.method === 'POST'){
    const token = getBearerToken(req);
    if(token) sessions.delete(token);
    sendJSON(res, 200, { loggedOut: true });
    return;
  }

  // ---------------- ADMINISTRATION DES COMPTES ----------------
  if(pathname === '/api/users' && req.method === 'GET'){
    const admin = requireAdmin(req, res);
    if(!admin) return;
    const onlineIds = getOnlineUserIds();
    sendJSON(res, 200, readUsers().map(u => publicUser(u, onlineIds)));
    return;
  }

  if(pathname === '/api/users' && req.method === 'POST'){
    const admin = requireAdmin(req, res);
    if(!admin) return;
    try{
      const body = await readBody(req) || {};
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      const role = body.role === 'admin' ? 'admin' : 'user';
      if(!validCredentials(username, password)){ sendJSON(res, 400, { error: 'Identifiant (2+ car.) et mot de passe (4+ car.) requis.' }); return; }
      const users = readUsers();
      if(users.some(u => u.username.toLowerCase() === username.toLowerCase())){
        sendJSON(res, 409, { error: 'Cet identifiant existe déjà.' });
        return;
      }
      const { salt, hash } = hashPassword(password);
      const user = { id: nextId(), username, salt, hash, role, createdAt: new Date().toISOString(), lastLoginAt: null, active: true };
      users.push(user);
      writeUsers(users);
      sendJSON(res, 201, publicUser(user, getOnlineUserIds()));
    }catch(err){ sendJSON(res, 400, { error: err.message }); }
    return;
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if(userMatch && req.method === 'PUT'){
    const admin = requireAdmin(req, res);
    if(!admin) return;
    try{
      const id = Number(userMatch[1]);
      const body = await readBody(req) || {};
      if(typeof body.active !== 'boolean'){ sendJSON(res, 400, { error: 'Champ "active" (booléen) requis.' }); return; }
      const users = readUsers();
      const idx = users.findIndex(u => u.id === id);
      if(idx === -1){ sendJSON(res, 404, { error: 'Compte introuvable.' }); return; }
      if(!body.active){
        if(id === admin.id){ sendJSON(res, 400, { error: 'Vous ne pouvez pas désactiver votre propre compte.' }); return; }
        const remainingActiveAdmins = users.filter(u => u.role === 'admin' && u.id !== id && u.active !== false).length;
        if(users[idx].role === 'admin' && remainingActiveAdmins === 0){
          sendJSON(res, 400, { error: 'Impossible de désactiver le dernier compte administrateur actif.' });
          return;
        }
      }
      users[idx].active = body.active;
      writeUsers(users);
      if(!body.active){
        // invalide les sessions de ce compte pour un effet immédiat
        for(const [token, s] of sessions){ if(s.userId === id) sessions.delete(token); }
      }
      sendJSON(res, 200, publicUser(users[idx], getOnlineUserIds()));
    }catch(err){ sendJSON(res, 400, { error: err.message }); }
    return;
  }

  if(userMatch && req.method === 'DELETE'){
    const admin = requireAdmin(req, res);
    if(!admin) return;
    const id = Number(userMatch[1]);
    const users = readUsers();
    if(id === admin.id){ sendJSON(res, 400, { error: 'Vous ne pouvez pas supprimer votre propre compte.' }); return; }
    const remainingAdmins = users.filter(u => u.role === 'admin' && u.id !== id).length;
    const target = users.find(u => u.id === id);
    if(target && target.role === 'admin' && remainingAdmins === 0){
      sendJSON(res, 400, { error: 'Impossible de supprimer le dernier compte administrateur.' });
      return;
    }
    const next = users.filter(u => u.id !== id);
    if(next.length === users.length){ sendJSON(res, 404, { error: 'Compte introuvable.' }); return; }
    writeUsers(next);
    // invalide les sessions de ce compte
    for(const [token, s] of sessions){ if(s.userId === id) sessions.delete(token); }
    sendJSON(res, 200, { deleted: true });
    return;
  }

  // ---------------- DOSSIERS (protégés : tout utilisateur connecté) ----------------
  if(pathname === '/api/dossiers' && req.method === 'GET'){
    if(!requireAuth(req, res)) return;
    sendJSON(res, 200, readDossiers());
    return;
  }

  if(pathname === '/api/dossiers' && req.method === 'POST'){
    const actor = requireAuth(req, res);
    if(!actor) return;
    try{
      const record = await readBody(req);
      if(!record || typeof record !== 'object'){ sendJSON(res, 400, { error: 'Dossier invalide' }); return; }
      const list = readDossiers();
      record.id = nextId();
      list.unshift(record);
      writeDossiers(list);
      logActivity(actor.username, 'ajout', `Dossier N° OT ${record.N_OT || record.id}`);
      sendJSON(res, 201, record);
    }catch(err){ sendJSON(res, 400, { error: err.message }); }
    return;
  }

  if(pathname === '/api/dossiers/import' && req.method === 'POST'){
    const actor = requireAuth(req, res);
    if(!actor) return;
    try{
      const records = await readBody(req);
      if(!Array.isArray(records)){ sendJSON(res, 400, { error: 'Un tableau de dossiers est attendu' }); return; }
      const withIds = records.map(r => ({ ...r, id: nextId() }));
      writeDossiers(withIds);
      logActivity(actor.username, 'import', `${withIds.length} dossier(s) importé(s) depuis Excel`);
      sendJSON(res, 200, { imported: withIds.length, dossiers: withIds });
    }catch(err){ sendJSON(res, 400, { error: err.message }); }
    return;
  }

  const singleMatch = pathname.match(/^\/api\/dossiers\/([^/]+)$/);
  if(singleMatch && req.method === 'PUT'){
    const actor = requireAuth(req, res);
    if(!actor) return;
    try{
      const id = singleMatch[1];
      const updates = await readBody(req);
      const list = readDossiers();
      const idx = list.findIndex(r => String(r.id) === id);
      if(idx === -1){ sendJSON(res, 404, { error: 'Dossier introuvable' }); return; }
      list[idx] = { ...list[idx], ...updates, id: list[idx].id };
      writeDossiers(list);
      logActivity(actor.username, 'modification', `Dossier N° OT ${list[idx].N_OT || id}`);
      sendJSON(res, 200, list[idx]);
    }catch(err){ sendJSON(res, 400, { error: err.message }); }
    return;
  }

  if(singleMatch && req.method === 'DELETE'){
    const actor = requireAuth(req, res);
    if(!actor) return;
    const id = singleMatch[1];
    const list = readDossiers();
    const target = list.find(r => String(r.id) === id);
    const next = list.filter(r => String(r.id) !== id);
    if(next.length === list.length){ sendJSON(res, 404, { error: 'Dossier introuvable' }); return; }
    writeDossiers(next);
    logActivity(actor.username, 'suppression', `Dossier N° OT ${target && target.N_OT || id}`);
    sendJSON(res, 200, { deleted: true, id });
    return;
  }

  // ---------------- HISTORIQUE DES ACTIONS (protégé : tout utilisateur connecté) ----------------
  if(pathname === '/api/activity' && req.method === 'GET'){
    if(!requireAuth(req, res)) return;
    sendJSON(res, 200, readActivity());
    return;
  }

  if(pathname === '/api/health' && req.method === 'GET'){
    sendJSON(res, 200, { status: 'ok', dossiers: readDossiers().length, users: readUsers().length });
    return;
  }

  // ---------------- FICHIERS STATIQUES ----------------
  if(req.method === 'GET'){
    serveStatic(req, res, pathname);
    return;
  }

  sendJSON(res, 405, { error: 'Méthode non autorisée' });
});

server.listen(PORT, '0.0.0.0', ()=>{
  ensureDataFiles();
  const dossierCount = readDossiers().length;
  const userCount = readUsers().length;
  const os = require('os');
  const nets = os.networkInterfaces();
  const lanIps = [];
  Object.values(nets).forEach(ifaces=>{ (ifaces||[]).forEach(iface=>{ if(iface.family==='IPv4' && !iface.internal) lanIps.push(iface.address); }); });
  console.log('');
  console.log('  Suivi Travaux Patrimoine — mini serveur (avec authentification)');
  console.log('  -----------------------------------------------------------------');
  console.log(`  Sur cet ordinateur   : http://localhost:${PORT}`);
  lanIps.forEach(ip => console.log(`  Sur le réseau local  : http://${ip}:${PORT}`));
  console.log(`  API                  : http://localhost:${PORT}/api/dossiers`);
  console.log(`  Dossiers en mémoire  : ${dossierCount}`);
  console.log(`  Comptes utilisateurs : ${userCount}${userCount === 0 ? ' (aucun — le premier compte créé sera administrateur)' : ''}`);
  console.log('  (Ctrl+C pour arrêter)');
  console.log('');
});

const { encrypt, decrypt } = require('./crypto');

const SESSION_COOKIE = 'altenar_sess'; // sessão ativa (curta)
const DEVICE_COOKIE = 'altenar_device'; // "lembrar este dispositivo" (longa) - evita pedir 2FA de novo
const PENDING_COOKIE = 'altenar_pending'; // estado intermediário entre senha e código 2FA (curtíssima)

const SESSION_MAX_AGE = 30 * 60; // 30 minutos
const DEVICE_MAX_AGE = 60 * 24 * 60 * 60; // 60 dias - ajustar se a Altenar usar outro prazo
const PENDING_MAX_AGE = 5 * 60; // 5 minutos pra digitar o código

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function readEncryptedCookies(req, name) {
  const cookies = parseCookies(req);
  const token = cookies[name];
  if (!token) return null;
  try {
    const data = decrypt(token);
    if (!data || !Array.isArray(data.cookies)) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return data.cookies;
  } catch (e) {
    return null;
  }
}

function writeEncryptedCookies(res, name, altenarCookies, maxAgeSeconds) {
  const payload = { cookies: altenarCookies, expiresAt: Date.now() + maxAgeSeconds * 1000 };
  const token = encrypt(payload);
  const existing = res.getHeader('Set-Cookie');
  const newCookie = `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
  const all = existing ? (Array.isArray(existing) ? existing.concat(newCookie) : [existing, newCookie]) : [newCookie];
  res.setHeader('Set-Cookie', all);
}

// Estado intermediário do 2FA. Guarda as CREDENCIAIS (usuário/senha) cifradas
// por pouco tempo (5 min), porque o 2FA é TOTP (Google Authenticator): o
// verify2fa refaz o login inteiro numa sessão só. Fica só no cookie httpOnly do
// navegador do próprio usuário, cifrado (AES-256-GCM), nunca em banco/disco.
function writeEncryptedCreds(res, name, creds, maxAgeSeconds) {
  const payload = { creds, expiresAt: Date.now() + maxAgeSeconds * 1000 };
  const token = encrypt(payload);
  const existing = res.getHeader('Set-Cookie');
  const newCookie = `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
  const all = existing ? (Array.isArray(existing) ? existing.concat(newCookie) : [existing, newCookie]) : [newCookie];
  res.setHeader('Set-Cookie', all);
}

function readEncryptedCreds(req, name) {
  const cookies = parseCookies(req);
  const token = cookies[name];
  if (!token) return null;
  try {
    const data = decrypt(token);
    if (!data || !data.creds) return null;
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return data.creds;
  } catch (e) {
    return null;
  }
}

function clearCookie(res, name) {
  const existing = res.getHeader('Set-Cookie');
  const newCookie = `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
  const all = existing ? (Array.isArray(existing) ? existing.concat(newCookie) : [existing, newCookie]) : [newCookie];
  res.setHeader('Set-Cookie', all);
}

module.exports = {
  // sessão ativa
  getAltenarCookies: (req) => readEncryptedCookies(req, SESSION_COOKIE),
  setAltenarCookies: (res, cookies) => writeEncryptedCookies(res, SESSION_COOKIE, cookies, SESSION_MAX_AGE),
  clearSession: (res) => clearCookie(res, SESSION_COOKIE),

  // "lembrar este dispositivo" - evita pedir 2FA de novo
  getDeviceCookies: (req) => readEncryptedCookies(req, DEVICE_COOKIE),
  setDeviceCookies: (res, cookies) => writeEncryptedCookies(res, DEVICE_COOKIE, cookies, DEVICE_MAX_AGE),
  clearDeviceCookies: (res) => clearCookie(res, DEVICE_COOKIE),

  // estado intermediário entre senha e código 2FA (credenciais cifradas, 5 min)
  getPendingCredentials: (req) => readEncryptedCreds(req, PENDING_COOKIE),
  setPendingCredentials: (res, creds) => writeEncryptedCreds(res, PENDING_COOKIE, creds, PENDING_MAX_AGE),
  clearPendingCookies: (res) => clearCookie(res, PENDING_COOKIE),
};

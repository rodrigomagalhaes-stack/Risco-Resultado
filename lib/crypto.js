// Criptografia simétrica (AES-256-GCM) usada só para embrulhar os cookies de
// sessão do Altenar dentro do cookie httpOnly da nossa própria ferramenta.
// A senha do usuário NUNCA passa por aqui - ela é usada uma única vez, na
// hora do login (api/login.js), e descartada depois. O que fica guardado
// (criptografado, no navegador do próprio usuário, nunca em disco nosso)
// é só o cookie de sessão que o Altenar já teria dado de qualquer forma.

const crypto = require('crypto');

function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'SESSION_SECRET não configurada (ou curta demais). Defina uma variável de ambiente ' +
      'SESSION_SECRET com uma string aleatória longa (ex: openssl rand -hex 32) no projeto Vercel.'
    );
  }
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

function encrypt(plainObj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(plainObj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

function decrypt(token) {
  const key = getKey();
  const raw = Buffer.from(token, 'base64url');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

module.exports = { encrypt, decrypt };

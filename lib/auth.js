// Shared-passcode session signing. Works in both the Edge middleware and
// Node API routes because it only uses the standard Web Crypto API
// (globalThis.crypto.subtle), available in both runtimes.

const COOKIE_NAME = 'ps_session';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function toBase64Url(bytes) {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    b64url.length + ((4 - (b64url.length % 4)) % 4),
    '='
  );
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacKey() {
  const passcode = process.env.APP_PASSCODE || '';
  const enc = new TextEncoder().encode('prairie-star-session:' + passcode);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function createSessionToken() {
  const payload = JSON.stringify({ exp: Date.now() + THIRTY_DAYS_MS });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payloadB64, sigB64] = token.split('.');
  try {
    const key = await hmacKey();
    const expectedSig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
    const expectedSigB64 = toBase64Url(new Uint8Array(expectedSig));
    if (expectedSigB64 !== sigB64) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function checkPasscode(candidate) {
  const expected = process.env.APP_PASSCODE || '';
  if (!expected) return false;
  // Not constant-time, but this guards a shared team passcode behind normal
  // rate limiting from Vercel/browser round-trips, not a high-value secret.
  return candidate === expected;
}

export { COOKIE_NAME };

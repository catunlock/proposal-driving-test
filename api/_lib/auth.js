// Sesión del examen: la contraseña se comprueba SIEMPRE en el servidor (Vercel).
// Variables de entorno (Vercel → Settings → Environment Variables):
//   GAME_PASSWORD   la contraseña. Si no se define, la web es pública y no se pide nada
//   SESSION_SECRET  una frase larga aleatoria para firmar la cookie de sesión
export const COOKIE = 'cari_session';
export const MAX_AGE = 60 * 60 * 24 * 120;          // 120 días: no hay que volver a escribirla

// minúsculas, sin acentos ni espacios ni signos: "Te quiero", "te QUIERO!" → "tequiero"
export function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ0-9]/g, '');
}

const raw = () => process.env.GAME_PASSWORD || '';
export function password() { return normalize(raw()); }
export function gateEnabled() { return password() !== ''; }

// Casillas de la matrícula: letras de cada palabra ("Te quiero" → [2, 6])
export function shape() { return raw().split(/\s+/).map(w => [...normalize(w)].length).filter(Boolean); }

function secret() { return process.env.SESSION_SECRET || 'autoescuela-cari::' + password(); }

// Token de sesión = HMAC-SHA256(secreto, "cari-ok") en hex
export async function sessionToken() {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode('cari-ok-v1'));
    return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function readCookie(request, name) {
    const raw = request.headers.get('cookie') || '';
    for (const part of raw.split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
    }
    return null;
}

export async function isLoggedIn(request) {
    if (!gateEnabled()) return true;
    const c = readCookie(request, COOKIE);
    return !!c && c === await sessionToken();
}

// Cuando falla, el servidor solo dice si va bien encaminada: 'close' (a 1-2 letras de distancia)
// o 'half' (ha acertado una de las palabras). Nunca qué letras ni cuántas tiene: la contraseña
// no se puede ir deduciendo a fuerza de intentos.
export function closeness(guess) {
    const word = password();
    if (guess && distance(guess, word) <= 2) return 'close';
    const parts = raw().split(/\s+/).map(normalize).filter(w => w.length >= 3);
    return parts.some(w => guess.includes(w)) ? 'half' : null;
}

function distance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[b.length];
}

// GET  /api/login  →  { slots: [5, 8] }  (casillas de la matrícula, una por letra de cada palabra)
// POST /api/login  { guess }  →  { ok: true }  (y cookie de sesión)  |  { ok: false, hot: 'close' | 'half' | null }
import { COOKIE, MAX_AGE, normalize, password, gateEnabled, shape, sessionToken, closeness } from './_lib/auth.js';

export default {
    async fetch(request) {
        if (request.method === 'GET') return Response.json({ slots: shape() });
        if (request.method !== 'POST') return Response.json({ error: 'method' }, { status: 405 });
        let body = {};
        try { body = await request.json(); } catch (e) { /* cuerpo vacío */ }
        const word = password();
        const guess = normalize(body.guess).slice(0, 24);
        if (!gateEnabled() || guess === word) {
            const token = await sessionToken();
            const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
            return Response.json({ ok: true }, {
                headers: { 'Set-Cookie': `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure}` }
            });
        }
        return Response.json({ ok: false, hot: closeness(guess) });
    }
};

// GET /api/session  →  { ok: true | false }   (¿ya se ha puesto la contraseña en este navegador?)
// Lo usa la portada pública: si ya hay sesión, START va directo al examen sin pedir la matrícula.
import { isLoggedIn } from './_lib/auth.js';

export default {
    async fetch(request) {
        return Response.json({ ok: await isLoggedIn(request) }, { headers: { 'Cache-Control': 'no-store' } });
    }
};

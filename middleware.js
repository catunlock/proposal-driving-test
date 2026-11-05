// Routing Middleware de Vercel: todo el sitio exige la sesión del examen, salvo la portada
// (portada.html con su hoja de estilos y el detector del Tesla), la página de acceso
// (login.html) y la API que comprueba la contraseña.
// Sin sesión, la raíz muestra la portada: la contraseña se pide al pulsar START.
// Sin GAME_PASSWORD no hay contraseña: isLoggedIn() siempre es cierto y todo pasa.
import { next } from '@vercel/functions';
import { isLoggedIn } from './api/_lib/auth.js';

export const config = { matcher: ['/((?!login\\.html|portada\\.html|game/game\\.css|shared/car-browser\\.js|api/login|api/session|favicon\\.ico).*)'] };

export default async function middleware(request) {
    if (await isLoggedIn(request)) return next();
    const url = new URL(request.url);
    if ((url.pathname === '/' || url.pathname === '/index.html') && !url.search) {
        return Response.redirect(new URL('/portada.html', request.url), 302);
    }
    const back = url.pathname + url.search;
    const to = new URL('/login.html', request.url);
    if (back !== '/' && back !== '/index.html') to.searchParams.set('next', back);
    return Response.redirect(to, 302);
}

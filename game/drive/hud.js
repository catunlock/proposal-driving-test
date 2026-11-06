// HUD del modo conducción: un panel por jugador (vuelta, tiempo, posición, velocímetro, turbo),
// cuenta atrás, avisos, minimapa y ayuda de controles.
import { KMH } from './vehicle.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e; };
export const fmt = t => {
    if (!isFinite(t)) return '–:––.––';
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export class HUD {
    constructor(root) {
        this.root = root;
        this.panels = [];
        this.count = el('div', 'dh-count');
        this.mini = el('canvas', 'dh-mini');
        this.help = el('div', 'dh-help');
        this.banner = el('div', 'dh-banner');
        this.mini.hidden = true;
        root.append(this.count, this.mini, this.help, this.banner);
    }
    // n paneles (1 o 2); fields: qué chips mostrar
    setup(n, { lap = true, pos = false, best = true, points = false, title = '', extra = [] } = {}) {
        this.panels.forEach(p => p.box.remove());
        this.panels = [];
        for (let i = 0; i < n; i++) {
            const box = el('div', `dh-panel dh-p${i} dh-of${n}`);
            const top = el('div', 'dh-top');
            const chip = (label, cls) => { const c = el('div', 'dh-chip ' + cls, `<span>${label}</span><b>–</b>`); top.append(c); return c.querySelector('b'); };
            const P = { box };
            if (n > 1) top.append(el('div', 'dh-chip dh-who', `<b>J${i + 1}</b>`));
            if (title && i === 0) top.append(el('div', 'dh-chip dh-title', `<b>${title}</b>`));
            if (lap) P.lap = chip('Vuelta', 'dh-lap');
            P.time = chip('Tiempo', 'dh-time');
            if (best) P.best = chip('Mejor vuelta', 'dh-best');
            if (pos) P.pos = chip('Posición', 'dh-pos');
            if (points) P.points = chip('Puntos', 'dh-points');
            for (const [k, label] of extra) P[k] = chip(label, 'dh-' + k);
            const dash = el('div', 'dh-dash', '<b class="dh-kmh">0</b><small>km/h</small><div class="dh-turbo"><i></i></div>');
            P.kmh = dash.querySelector('.dh-kmh'); P.turbo = dash.querySelector('.dh-turbo i');
            P.msg = el('div', 'dh-msg');
            box.append(top, dash, P.msg);
            this.root.append(box);
            this.panels.push(P);
        }
        this.root.hidden = false;
        requestAnimationFrame(() => this.root.classList.add('on'));
    }
    set(i, field, text) {
        const P = this.panels[i];
        if (P && P[field] && P[field].textContent !== text) {
            P[field].textContent = text;
            if (field !== 'time') { P[field].classList.remove('bump'); void P[field].offsetWidth; P[field].classList.add('bump'); }
        }
    }
    dash(i, v) {
        const P = this.panels[i]; if (!P) return;
        const k = String(Math.round(Math.abs(v.vf) * KMH));
        if (P.kmh.textContent !== k) P.kmh.textContent = k;
        P.turbo.style.width = Math.round(v.turbo * 100) + '%';
        P.turbo.parentElement.classList.toggle('on', v.boostT > 0);
    }
    msg(i, text, kind = 'info', ms = 1800) {
        const P = this.panels[i]; if (!P) return;
        P.msg.textContent = text; P.msg.dataset.kind = kind;
        P.msg.classList.remove('on'); void P.msg.offsetWidth; P.msg.classList.add('on');
        clearTimeout(P._mt); P._mt = setTimeout(() => P.msg.classList.remove('on'), ms);
    }
    say(text, ms = 2600) {
        this.banner.textContent = text;
        this.banner.classList.remove('on'); void this.banner.offsetWidth; this.banner.classList.add('on');
        clearTimeout(this._bt); this._bt = setTimeout(() => this.banner.classList.remove('on'), ms);
    }
    // Cuenta atrás 3 · 2 · 1 · ¡YA!
    async countdown(sfx, steps = ['3', '2', '1']) {
        for (const s of steps) {
            this.count.textContent = s; this.count.className = 'dh-count on';
            if (sfx) sfx.tap();
            await new Promise(r => setTimeout(r, 750));
            this.count.className = 'dh-count';
            await new Promise(r => setTimeout(r, 120));
        }
        this.count.textContent = '¡YA!'; this.count.className = 'dh-count on go';
        if (sfx) sfx.start();
        setTimeout(() => { this.count.className = 'dh-count'; }, 700);
    }
    // Ayuda de controles: se ve al empezar y se va sola (vuelve con la pausa)
    setHelp(html, ms = 9000) {
        this.help.innerHTML = html; this.help.hidden = !html;
        this.help.classList.remove('gone');
        clearTimeout(this._ht); if (html && ms) this._ht = setTimeout(() => this.help.classList.add('gone'), ms);
    }

    // Minimapa: el trazado y un punto por coche
    miniSetup(C, { scale = null } = {}) {
        const cv = this.mini, g = cv.getContext('2d');
        const pts = [];
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let i = 0; i < C.n; i += 3) { pts.push([C.xs[i], C.zs[i]]); x0 = Math.min(x0, C.xs[i]); x1 = Math.max(x1, C.xs[i]); z0 = Math.min(z0, C.zs[i]); z1 = Math.max(z1, C.zs[i]); }
        const S = 150, pad = 12;
        const k = scale || (S - pad * 2) / Math.max(x1 - x0, z1 - z0);
        cv.width = S; cv.height = S;
        // vista desde arriba con +z hacia arriba y +x a la izquierda (como se ve desde detrás al salir)
        const map = (x, z) => [S / 2 - (x - (x0 + x1) / 2) * k, S / 2 - (z - (z0 + z1) / 2) * k];
        this._mini = { g, pts, map, S, w: C.width * k };
        this.mini.hidden = false;
    }
    miniDraw(cars) {
        const M = this._mini; if (!M) return;
        const { g, pts, map, S } = M;
        g.clearRect(0, 0, S, S);
        g.lineJoin = 'round'; g.lineCap = 'round';
        for (const [w, c] of [[Math.max(6, M.w + 4), '#1b1b2f'], [Math.max(3, M.w), '#fffaf0']]) {
            g.strokeStyle = c; g.lineWidth = w; g.beginPath();
            pts.forEach(([x, z], i) => { const [a, b] = map(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
            g.closePath(); g.stroke();
        }
        for (const v of cars) {
            const [a, b] = map(v.x, v.z);
            g.fillStyle = v.color; g.strokeStyle = '#1b1b2f'; g.lineWidth = 2;
            g.beginPath(); g.arc(a, b, v.isPlayer ? 6 : 4.5, 0, 7); g.fill(); g.stroke();
        }
    }
    hide() {
        this.root.classList.remove('on');
        this.mini.hidden = true;
        this.count.className = 'dh-count';
        setTimeout(() => { if (!this.root.classList.contains('on')) this.root.hidden = true; }, 300);
    }
}

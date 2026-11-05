// Capa HTML sobre el 3D: portada, carteles, tarjeta de pregunta, pantallas finales.
import { URLP, CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise(r => setTimeout(r, URLP.fast ? ms / 4 : ms));

const STAGE_LABEL = {
    theory: 'Parte 1 · Teoría',
    technical: 'Parte 2 · El coche',
    commitment: 'Parte 3 · Compromiso'
};

// (el token evita que un "mostrar" retrasado vuelva a encender algo que ya se ha ocultado)
function show(el) { const tk = el._tk = (el._tk || 0) + 1; el.hidden = false; requestAnimationFrame(() => { if (el._tk === tk) el.classList.add('on'); }); }
function hide(el) { el._tk = (el._tk || 0) + 1; el.classList.remove('on'); setTimeout(() => { if (!el.classList.contains('on')) el.hidden = true; }, 350); }

export const UI = {
    wait,

    loading(done, total) {
        const pct = total ? Math.round((done / total) * 100) : 0;
        $('loading-bar').style.width = pct + '%';
    },
    hideLoading() { hide($('loading')); },

    // Portada: devuelve 'start' | 'practical'
    title({ tesla }) {
        const el = $('title-screen');
        show(el);
        $('tesla-box').hidden = !tesla;
        return new Promise(resolve => {
            const done = (v) => { hide(el); resolve(v); };
            $('btn-start').onclick = () => done('start');
            $('btn-continue-route').onclick = () => done('practical');
            $('btn-theater').onclick = () => window.enterTeslaTheater();
            let taps = 0;
            $('title-logo').onclick = () => { if (++taps >= 3) done('practical'); };
        });
    },

    // Indicadores de parte y pregunta: se quedan fijos durante toda la parte
    hud(stop) {
        const el = $('hud');
        if (!stop || !stop.q) { el.classList.remove('on'); return; }
        $('hud-stage').textContent = STAGE_LABEL[stop.stage] || '';
        const count = $('hud-count'), txt = `Pregunta ${stop.number}/${stop.total}`;
        if (count.textContent !== txt) {
            count.textContent = txt;
            count.classList.remove('bump'); void count.offsetWidth; count.classList.add('bump');
        }
        el.classList.add('on');
        el.hidden = false;
    },
    hideHud() { $('hud').classList.remove('on'); },

    async placeBanner(place) {
        const el = $('place-banner');
        $('pb-name').textContent = place.name;
        $('pb-sub').textContent = place.subtitle || '';
        $('pb-sub').hidden = !place.subtitle;
        show(el);
        await wait(2600);
        hide(el);
    },

    // Muestra la pregunta y resuelve con { index, button } al tocar una opción.
    // judge(index) → 'correct' | 'wrong' | 'retry'
    question(stop, judge) {
        const q = stop.q;
        const card = $('question-card');
        card.dataset.kind = stop.kind;
        $('qc-place').textContent = stop.place.name;
        $('qc-text').textContent = q.text;
        const thumb = $('qc-thumb');
        if (q.image) {
            thumb.hidden = false;
            thumb.src = q.image;
            thumb.onclick = () => UI.lightbox(q.image);
        } else {
            thumb.hidden = true;
            thumb.removeAttribute('src');
        }
        const opts = $('qc-options');
        opts.innerHTML = '';
        card.classList.remove('leaving', 'collapsed');
        const tog = $('qc-toggle');
        tog.textContent = '👁 Ver escena';
        tog.onclick = (e) => {
            e.stopPropagation();
            const c = card.classList.toggle('collapsed');
            tog.textContent = c ? '▲ Responder' : '👁 Ver escena';
        };
        show(card);
        if (!UI._hinted) {
            UI._hinted = true;
            const h = $('drag-hint');
            h.classList.add('on');
            setTimeout(() => h.classList.remove('on'), 5000);
        }
        return new Promise(resolve => {
            q.options.forEach((text, i) => {
                const b = document.createElement('button');
                b.className = 'option-btn';
                b.innerHTML = `<span class="opt-letter">${'ABC'[i] || '•'}</span><span class="opt-text"></span>`;
                b.querySelector('.opt-text').textContent = text;
                b.onclick = () => {
                    const verdict = judge(i);
                    if (verdict === 'retry') {
                        b.classList.add('incorrect');
                        b.disabled = true;
                        return;
                    }
                    opts.querySelectorAll('button').forEach(x => x.disabled = true);
                    b.classList.add(verdict === 'correct' ? 'correct' : 'incorrect');
                    if (verdict === 'wrong' && q.correctIndex >= 0) opts.children[q.correctIndex].classList.add('correct');
                    resolve({ index: i, verdict });
                };
                opts.appendChild(b);
                b.style.animationDelay = (0.15 + i * 0.08) + 's';
            });
        });
    },

    async hideQuestion() {
        const card = $('question-card');
        card.classList.add('leaving');
        hide(card);
        await wait(250);
    },

    // Banner de viaje: origen → destino
    route(from, to, label = '') {
        $('route-from').textContent = '📍 ' + from;
        $('route-to').textContent = to + ' 📍';
        $('route-label').textContent = label;
        $('route-label').hidden = !label;
        this.routeProgress(0);
        show($('route'));
    },
    routeProgress(t) {
        const p = Math.max(0, Math.min(1, t)) * 100;
        $('route-fill').style.width = p + '%';
        $('route-car').style.left = p + '%';
    },
    hideRoute() { hide($('route')); },

    // Mensaje con un botón; resuelve al pulsarlo
    prompt(text, button) {
        const el = $('prompt');
        $('prompt-text').textContent = text;
        $('prompt-btn').textContent = button;
        show(el);
        return new Promise(res => { $('prompt-btn').onclick = () => { hide(el); res(); }; });
    },

    lightbox(src) {
        const lb = $('lightbox');
        $('lightbox-img').src = src;
        show(lb);
        lb.onclick = () => hide(lb);
    },

    toast(text, ms = 1400) {
        const t = $('toast');
        t.textContent = text;
        show(t);
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => hide(t), URLP.fast ? ms / 4 : ms);
    },

    // Fin de la teoría: corazón que se llena y mensaje
    async theoryResult() {
        const el = $('theory-result');
        const fill = $('tr-fill'), pct = $('tr-pct');
        $('tr-step1').hidden = false; $('tr-step2').hidden = true;
        fill.style.transition = 'none'; fill.style.transform = 'translateY(100%)'; pct.textContent = '0%';
        show(el);
        await wait(400);
        const dur = URLP.fast ? 800 : 3000;
        fill.style.transition = `transform ${dur}ms ease-in-out`;
        fill.style.transform = 'translateY(0%)';
        const t0 = performance.now();
        await new Promise(res => {
            const step = (now) => {
                const k = Math.min(1, (now - t0) / dur);
                pct.textContent = Math.floor(k * 100) + '%';
                if (k < 1) requestAnimationFrame(step); else res();
            };
            requestAnimationFrame(step);
        });
        await wait(700);
        $('tr-step1').hidden = true; $('tr-step2').hidden = false;
        return new Promise(resolve => {
            $('btn-tr-continue').onclick = () => { hide(el); resolve('continue'); };
            $('btn-tr-home').onclick = () => { hide(el); resolve('home'); };
        });
    },

    // Fin de una parte: tarjeta con sello (p. ej. APTO al acabar el práctico)
    // Con button2 sale un segundo botón (p. ej. "Repetir"): resuelve 'continue' o 'again'
    stageResult({ stamp, title, text, button, button2 = null }) {
        const el = $('stage-result');
        $('sr-stamp').textContent = stamp;
        $('sr-title').textContent = title;
        $('sr-text').innerHTML = text;
        $('sr-btn').textContent = button;
        $('sr-btn').hidden = true;
        $('sr-btn2').hidden = true;
        if (button2) $('sr-btn2').textContent = button2;
        el.classList.remove('stamped');
        show(el);
        setTimeout(() => el.classList.add('stamped'), URLP.fast ? 200 : 700);
        setTimeout(() => { $('sr-btn').hidden = false; if (button2) $('sr-btn2').hidden = false; }, URLP.fast ? 600 : 2200);
        return new Promise(resolve => {
            $('sr-btn').onclick = () => { hide(el); resolve('continue'); };
            $('sr-btn2').onclick = () => { hide(el); resolve('again'); };
        });
    },

    // Cortinilla de capítulo a pantalla completa entre partes
    chapter({ kicker, title, sub, button }) {
        const el = $('chapter');
        $('ch-kicker').textContent = kicker;
        $('ch-title').textContent = title;
        $('ch-sub').innerHTML = sub;
        const btn = $('ch-btn');
        btn.textContent = button;
        el.hidden = false;
        el.classList.remove('play', 'out');
        void el.offsetWidth;
        el.classList.add('on', 'play');
        return new Promise(resolve => {
            btn.onclick = () => {
                el.classList.add('out');
                el.classList.remove('on');
                setTimeout(() => { el.hidden = true; el.classList.remove('play', 'out'); }, 1200);
                resolve();
            };
        });
    },

    // "Y ahora la última pregunta... 🤫❤️"
    async cinematic() {
        const el = $('cinematic');
        el.hidden = false;
        el.classList.remove('play');
        void el.offsetWidth;
        el.classList.add('on', 'play');
        await wait(CONFIG.timings.lastIntroDuration);
        el.classList.remove('on', 'play');
        await wait(400);
        el.hidden = true;
    },

    proposal() {
        const el = $('proposal');
        const opts = $('proposal-options');
        opts.classList.remove('on');
        el.hidden = false;
        el.classList.remove('play');
        void el.offsetWidth;
        el.classList.add('on', 'play');
        setTimeout(() => opts.classList.add('on'), URLP.fast ? 1500 : CONFIG.timings.proposalButtonsDelay);
        return new Promise(resolve => {
            opts.querySelectorAll('button').forEach(b => b.onclick = () => {
                el.classList.remove('on', 'play');
                setTimeout(() => { el.hidden = true; }, 400);
                resolve();
            });
        });
    },

    celebration() {
        const el = $('celebration');
        show(el);
        return new Promise(resolve => {
            $('btn-glovebox').onclick = () => { hide(el); resolve('glovebox'); };
        });
    },

    glovebox() {
        const el = $('glovebox');
        $('gb-step1').hidden = false; $('gb-step2').hidden = true;
        $('couple-initials').textContent = CONFIG.coupleInitials;
        show(el);
        return {
            opened: new Promise(r => { $('btn-gb-open').onclick = () => r(); }),
            reveal() { $('gb-step1').hidden = true; $('gb-step2').hidden = false; },
            done: new Promise(r => { $('btn-gb-home').onclick = () => { hide(el); r(); }; })
        };
    },

    fade(on) {
        const f = $('fader');
        f.hidden = false;
        f.classList.toggle('on', on);
        return wait(500);
    }
};

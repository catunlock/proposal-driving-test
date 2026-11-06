// ============================================================================
//  MANDOS: Gamepad API (mapeo estándar) + teclado, para uno o dos jugadores
// ============================================================================
//   Mando:   RT acelerar · LT frenar / atrás · stick izquierdo (o cruceta) girar ·
//            A turbo · B freno de mano · Y volver a la pista · X claxon · Start pausa
//   Teclado (jugador 1 o en solitario): W A S D o flechas · Espacio freno de mano · Mayús turbo ·
//            R volver a la pista · H claxon · Esc pausa
//   Dos jugadores: J1 = W A S D + Espacio (freno) + Mayús izq. (turbo) + R, o el 1er mando
//                  J2 = flechas + Ctrl dcho. (freno) + Mayús dcha. (turbo) + Retroceso, o el 2º mando
import * as THREE from 'three';

const dz = (v, t = 0.14) => Math.abs(v) < t ? 0 : (v - Math.sign(v) * t) / (1 - t);

const SCHEMES = {
    any: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], hb: ['Space'], turbo: ['ShiftLeft', 'ShiftRight'], reset: ['KeyR'], horn: ['KeyH'] },
    p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], hb: ['Space'], turbo: ['ShiftLeft'], reset: ['KeyR'], horn: ['KeyH'] },
    p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], hb: ['ControlRight', 'Enter'], turbo: ['ShiftRight'], reset: ['Backspace'], horn: ['KeyL'] }
};

export class Controls {
    constructor() {
        this.down = new Set();
        this.taps = new Set();
        this.prev = new Map();
        this.onKey = e => {
            const c = e.code;
            if (e.type === 'keydown') { if (!e.repeat) this.taps.add(c); this.down.add(c); } else this.down.delete(c);
            if (this.capture && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Backspace'].includes(c)) e.preventDefault();
        };
        addEventListener('keydown', this.onKey);
        addEventListener('keyup', this.onKey);
        addEventListener('blur', () => this.down.clear());
    }
    pads() {
        const all = navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : [];
        return all.sort((a, b) => a.index - b.index);
    }
    padFor(slot) {
        const pads = this.pads();
        if (slot === 'p2') return pads[1] || null;
        return pads[0] || null;
    }
    // Lee los controles de un jugador ('any' en solitario, 'p1' / 'p2' a dos)
    read(slot = 'any') {
        const K = SCHEMES[slot] || SCHEMES.any;
        const key = names => names.some(n => this.down.has(n) || this.taps.has(n));
        const gp = this.padFor(slot === 'any' ? 'p1' : slot);
        const pads = slot === 'any' ? this.pads() : gp ? [gp] : [];
        const B = i => Math.max(0, ...pads.map(p => (p.buttons[i] ? p.buttons[i].value : 0)));
        const axis = Math.max(-1, Math.min(1, pads.reduce((s, p) => s + dz(p.axes[0] || 0), 0)));
        const s = {
            thr: Math.max(B(7), key(K.up) ? 1 : 0),
            brk: Math.max(B(6), key(K.down) ? 1 : 0),
            steer: THREE.MathUtils.clamp(axis + (B(15) - B(14)) + (key(K.right) ? 1 : 0) - (key(K.left) ? 1 : 0), -1, 1),
            hb: B(1) > 0.5 || key(K.hb),
            turbo: B(0) > 0.5 || key(K.turbo),
            reset: B(3) > 0.5 || key(K.reset),
            horn: B(2) > 0.5 || key(K.horn),
            pause: B(9) > 0.5 || (slot !== 'p2' && key(['Escape', 'KeyP'])),
            pad: pads.length > 0
        };
        // flancos de subida
        s.pressed = {};
        for (const n of ['reset', 'horn', 'pause', 'turbo', 'hb']) {
            const id = slot + ':' + n;
            s.pressed[n] = s[n] && !this.prev.get(id);
            this.prev.set(id, s[n]);
        }
        return s;
    }
    endFrame() { this.taps.clear(); }
    rumble(slot, strong = 0.6, ms = 160) {
        const p = this.padFor(slot === 'any' ? 'p1' : slot);
        const a = p && p.vibrationActuator;
        if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }).catch(() => {});
    }

    // ---- Menús con el mando: cruceta/stick para moverse, A para pulsar, B para volver ----
    // Devuelve { dir: 'up'|'down'|'left'|'right'|null, a, b, start } con repetición al mantener
    menu(dt) {
        const pads = this.pads();
        const B = i => pads.some(p => p.buttons[i] && p.buttons[i].pressed);
        const ax = pads.reduce((s, p) => s + dz(p.axes[0] || 0, 0.5), 0), ay = pads.reduce((s, p) => s + dz(p.axes[1] || 0, 0.5), 0);
        let dir = B(12) || ay < -0.3 ? 'up' : B(13) || ay > 0.3 ? 'down' : B(14) || ax < -0.3 ? 'left' : B(15) || ax > 0.3 ? 'right' : null;
        const out = { dir: null, a: false, b: false, start: false, any: pads.length > 0 };
        if (dir) {
            if (dir !== this._mDir) { out.dir = dir; this._mT = 0.42; }
            else { this._mT -= dt; if (this._mT <= 0) { out.dir = dir; this._mT = 0.12; } }
        }
        this._mDir = dir;
        for (const [n, i] of [['a', 0], ['b', 1], ['start', 9]]) {
            const v = B(i);
            out[n] = v && !this['_m' + n];
            this['_m' + n] = v;
        }
        return out;
    }
}

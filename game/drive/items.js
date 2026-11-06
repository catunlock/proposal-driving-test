// ============================================================================
//  OBJETOS (carrera y pique a dos)
// ============================================================================
// Cajas «?» en tres filas del circuito. Al romper una, ruleta y objeto según el puesto (el último
// recibe los mejores, como en los juegos de karts). Objetos:
//   🍄 seta turbo          acelerón
//   🍌 plátano             se suelta detrás; quien lo pisa, trompo
//   🛢️ mancha de aceite    se suelta detrás; quien la pisa, resbala sin agarre
//   🎾 pelota rebotona     sale disparada recta y rebota en las paredes (frenando, hacia atrás)
//   🚀 cohete teledirigido va volando a por el coche de delante
//   ⭐ estrella            6 s invencible y más rápido; a quien toques, trompo
//   ⚡ rayo                todos los demás encogen y van lentos 5 s
import * as THREE from 'three';

const sfx = (n, ...a) => { if (window.sfx && window.sfx[n]) window.sfx[n](...a); };
export const ITEMS = {
    turbo: { emoji: '🍄', name: 'Seta turbo' },
    banana: { emoji: '🍌', name: 'Plátano' },
    oil: { emoji: '🛢️', name: 'Aceite' },
    ball: { emoji: '🎾', name: 'Pelota rebotona' },
    rocket: { emoji: '🚀', name: 'Cohete teledirigido' },
    star: { emoji: '⭐', name: 'Estrella' },
    bolt: { emoji: '⚡', name: 'Rayo' }
};
const KEYS = Object.keys(ITEMS);
// probabilidades según el puesto (0 = primero … 1 = último)
const TABLE = [
    [0.00, { banana: 40, oil: 30, ball: 20, turbo: 10 }],
    [0.34, { banana: 20, oil: 15, ball: 30, turbo: 20, rocket: 15 }],
    [0.67, { ball: 25, turbo: 30, rocket: 25, star: 15, bolt: 5 }],
    [1.00, { turbo: 25, rocket: 30, star: 30, bolt: 15 }]
];
function pick(rel) {
    let row = TABLE[0][1];
    for (const [k, r] of TABLE) if (rel >= k - 1e-6) row = r;
    const tot = Object.values(row).reduce((a, b) => a + b, 0);
    let x = Math.random() * tot;
    for (const [k, w] of Object.entries(row)) { x -= w; if (x <= 0) return k; }
    return 'turbo';
}

export class Items {
    // S: la sesión de carrera (C, cars, cams, app, rank(v))
    constructor(S) {
        this.S = S; this.C = S.C;
        this.root = new THREE.Group(); this.C.root.add(this.root);
        this.boxes = []; this.traps = []; this.shots = []; this.bolts = [];
        this._build();
    }

    _build() {
        const C = this.C;
        // caja: cubo translúcido con «?» y un brillo que cambia de color
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(255,255,255,0.62)'; g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 12; g.strokeRect(6, 6, 116, 116);
        g.font = '400 100px Bangers, Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 10; g.strokeStyle = '#1b1b2f'; g.strokeText('?', 64, 70); g.fillStyle = '#ffffff'; g.fillText('?', 64, 70);
        const qTex = new THREE.CanvasTexture(c); qTex.colorSpace = THREE.SRGBColorSpace;
        this.boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
        const rows = this.C.def.itemRows || [0.15, 0.52, 0.7];
        for (const f of rows) for (const k of [-0.33, -0.11, 0.11, 0.33]) {
            const p = C.at(C.len * f, k * C.width);
            const mat = new THREE.MeshToonMaterial({ map: qTex, transparent: true, opacity: 0.88, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25 });
            const m = new THREE.Mesh(this.boxGeo, mat);
            m.castShadow = true;
            m.position.set(p.x, C.ground(p.x, p.z, 5) + 1.2, p.z);
            this.root.add(m);
            this.boxes.push({ x: p.x, z: p.z, m, mat, ph: Math.random() * 6, off: 0 });
        }
        // piezas reutilizables
        this.bananaGeo = new THREE.TorusGeometry(0.42, 0.16, 8, 16, Math.PI * 1.1);
        this.bananaMat = new THREE.MeshToonMaterial({ color: '#ffd23f' });
        this.ballGeo = new THREE.SphereGeometry(0.5, 16, 12);
        this.ballMat = new THREE.MeshToonMaterial({ color: '#d7f542', emissive: new THREE.Color('#d7f542'), emissiveIntensity: 0.25 });
        this.rocketGeo = new THREE.CylinderGeometry(0.22, 0.26, 1.2, 12); this.rocketGeo.rotateX(Math.PI / 2);
        this.noseGeo = new THREE.ConeGeometry(0.22, 0.5, 12); this.noseGeo.rotateX(Math.PI / 2); this.noseGeo.translate(0, 0, 0.85);
        this.redMat = new THREE.MeshToonMaterial({ color: '#e8173b' }); this.whiteMat = new THREE.MeshToonMaterial({ color: '#f4f6fb' });
        this.fireMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
    }

    // ---------------------------------------------------------------- usar
    use(v, back = false) {
        const it = v.item;
        if (!it || v.itemRoll > 0) return false;
        v.item = null;
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        const L = v.model.dims.len;
        if (it === 'turbo') { v.kick(1.8); sfx('shimmer'); }
        else if (it === 'banana' || it === 'oil') {
            const x = v.x - fx * (L / 2 + 1), z = v.z - fz * (L / 2 + 1);
            this._trap(it, x, z, v);
            sfx('drop');
        } else if (it === 'ball') {
            const dir = back ? -1 : 1, sp = Math.max(28, Math.abs(v.vf) + 16);
            this._shot('ball', v.x + fx * dir * (L / 2 + 0.8), v.z + fz * dir * (L / 2 + 0.8), fx * sp * dir, fz * sp * dir, v);
            sfx('throwItem');
        } else if (it === 'rocket') {
            const sp = Math.max(32, Math.abs(v.vf) + 16);
            const s = this._shot('rocket', v.x + fx * (L / 2 + 0.8), v.z + fz * (L / 2 + 0.8), fx * sp, fz * sp, v);
            s.target = this.S.ahead(v);
            sfx('throwItem');
        } else if (it === 'star') { v.starT = 6; sfx('starPower'); }
        else if (it === 'bolt') {
            sfx('zap');
            this.S.app.hud.flash();
            for (const o of this.S.cars) {
                if (o === v || o.ghost || o.starT > 0) continue;
                o.shrinkT = 5; o.spinOut(0.6);
                this._lightning(o);
            }
        }
        if (v.isPlayer) this.S.app.controls.rumble(v.slot, 0.35, 90);
        return true;
    }

    _trap(type, x, z, owner) {
        let m;
        const gy = this.C.ground(x, z, 5);
        if (type === 'banana') {
            m = new THREE.Mesh(this.bananaGeo, this.bananaMat);
            m.rotation.set(Math.PI / 2, 0, Math.random() * 6); m.position.set(x, gy + 0.2, z); m.castShadow = true;
        } else {
            const g = new THREE.CircleGeometry(2.1, 24); g.rotateX(-Math.PI / 2);
            m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#16161f', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
            m.position.set(x, gy + 0.04, z);
            // brillo tornasolado del aceite
            const sh = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.2, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8e5bd8', transparent: true, opacity: 0.35, depthWrite: false }));
            sh.position.y = 0.01; m.add(sh);
        }
        this.root.add(m);
        this.traps.push({ type, x, z, r: type === 'banana' ? 0.75 : 2.1, owner, t: 0, life: type === 'banana' ? 60 : 14, m, cool: new Map() });
        if (this.traps.length > 24) this._remove(this.traps, this.traps[0]);
    }

    _shot(type, x, z, vx, vz, owner) {
        const g = new THREE.Group();
        if (type === 'ball') {
            const b = new THREE.Mesh(this.ballGeo, this.ballMat); b.castShadow = true; g.add(b);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 20), this.whiteMat); band.rotation.x = Math.PI / 2; b.add(band);
        } else {
            g.add(new THREE.Mesh(this.rocketGeo, this.whiteMat), new THREE.Mesh(this.noseGeo, this.redMat));
            const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.9, 10), this.fireMat); fl.rotation.x = -Math.PI / 2; fl.position.z = -1; g.add(fl);
            g.userData.fl = fl;
        }
        g.position.set(x, this.C.ground(x, z, 5) + (type === 'ball' ? 0.5 : 1.3), z);
        this.root.add(g);
        const s = { type, x, z, vx, vz, owner, t: 0, life: type === 'ball' ? 7 : 8, m: g, bounces: 0 };
        this.shots.push(s);
        return s;
    }

    _lightning(o) {
        const pts = [];
        for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(o.x + (k && k < 8 ? (Math.random() - 0.5) * 1.6 : 0), o.y + 26 - k * 3.2, o.z + (k && k < 8 ? (Math.random() - 0.5) * 1.6 : 0)));
        const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), 24, 0.18, 6), new THREE.MeshBasicMaterial({ color: '#fff3a8', toneMapped: false, transparent: true }));
        this.root.add(m);
        this.bolts.push({ m, t: 0 });
    }

    _remove(list, it) {
        const i = list.indexOf(it); if (i >= 0) list.splice(i, 1);
        this.root.remove(it.m);
        it.m.traverse(o => { if (o.geometry && o.geometry !== this.bananaGeo && o.geometry !== this.ballGeo && o.geometry !== this.rocketGeo && o.geometry !== this.noseGeo) o.geometry.dispose(); });
    }

    // ¿Toca el círculo (x, z, r) a algún coche? → el coche
    _hitCar(x, z, r, y, skip) {
        for (const v of this.S.cars) {
            if (v.ghost || v === skip) continue;
            if (Math.abs(v.y - y) > 2.2) continue;
            const fx = Math.sin(v.h), fz = Math.cos(v.h);
            for (const c of v.circles) if (Math.hypot(v.x + fx * c.lz - x, v.z + fz * c.lz - z) < c.r + r) return v;
        }
        return null;
    }

    // ---------------------------------------------------------------- cada fotograma
    update(dt, running, time) {
        const S = this.S, C = this.C;
        // cajas
        for (const b of this.boxes) {
            b.ph += dt;
            if (b.off > 0) { b.off -= dt; const k = b.off <= 0.4 ? 1 - b.off / 0.4 : 0; b.m.scale.setScalar(Math.max(0.001, k)); }
            else b.m.scale.setScalar(1);
            b.m.rotation.set(b.ph * 0.9, b.ph * 1.3, 0);
            b.m.position.y = C.ground(b.x, b.z, 5) + 1.2 + Math.sin(b.ph * 2.2) * 0.18;
            b.mat.color.setHSL((b.ph * 0.15) % 1, 0.85, 0.6);
            if (!running || b.off > 0) continue;
            const v = this._hitCar(b.x, b.z, 0.9, b.m.position.y - 1, null);
            if (v) {
                b.off = 3.2;
                if (!v.item && !(v.itemRoll > 0)) { v.itemRoll = 1.1; v.itemNext = pick(S.rank(v)); }
                if (v.isPlayer) { sfx('itemBox'); S.app.controls.rumble(v.slot, 0.25, 60); }
            }
        }
        // ruletas
        for (const v of S.cars) {
            if (!(v.itemRoll > 0)) continue;
            v.itemRoll -= dt;
            if (v.isPlayer) { v._rt = (v._rt || 0) - dt; if (v._rt <= 0) { v._rt = 0.08; sfx('roulette'); } }
            if (v.itemRoll <= 0) { v.item = v.itemNext; v.itemHold = 1.2 + Math.random() * 3; if (v.isPlayer) sfx('itemGet'); }
        }
        // trampas
        for (const t of [...this.traps]) {
            t.t += dt;
            if (t.t > t.life) { this._remove(this.traps, t); continue; }
            if (t.type === 'banana') t.m.position.y = C.ground(t.x, t.z, 5) + 0.2;
            const v = this._hitCar(t.x, t.z, t.r, C.ground(t.x, t.z, 5), t.t < 0.8 ? t.owner : null);
            if (!v || (t.cool.get(v) || 0) > t.t) continue;
            if (t.type === 'banana') {
                if (v.spinOut(1.0)) this._react(v, '🍌 ¡Plátano!');
                this._remove(this.traps, t);
            } else {
                t.cool.set(v, t.t + 2);
                if (!(v.starT > 0)) { v.slipT = 1.4; v.w += (Math.random() < 0.5 ? -1 : 1) * 2.5; this._react(v, '🛢️ ¡Aceite!'); }
            }
        }
        // proyectiles
        for (const s of [...this.shots]) {
            s.t += dt;
            if (s.t > s.life) { this._remove(this.shots, s); continue; }
            if (s.type === 'rocket') {
                const T = s.target;
                if (T && !T.ghost) {
                    const want = Math.atan2(T.x - s.x, T.z - s.z), cur = Math.atan2(s.vx, s.vz);
                    let d = want - cur; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
                    const turn = Math.max(-4 * dt, Math.min(4 * dt, d)), sp = Math.hypot(s.vx, s.vz), h = cur + turn;
                    s.vx = Math.sin(h) * sp; s.vz = Math.cos(h) * sp;
                }
                s.x += s.vx * dt; s.z += s.vz * dt;
                s.m.position.set(s.x, C.ground(s.x, s.z, 5) + 1.3, s.z);
                s.m.rotation.y = Math.atan2(s.vx, s.vz);
                s.m.userData.fl.scale.set(1, 0.7 + Math.random() * 0.6, 1);
            } else {
                // pelota: rueda y rebota en lo sólido
                let nx = s.x + s.vx * dt, nz = s.z + s.vz * dt;
                for (const o of C._near(nx, nz)) {
                    if (o.bump || o.h < 0.8) continue;
                    const P = C._pen(o, nx, nz, 0.5);
                    if (!P) continue;
                    nx += P.ux * P.pen; nz += P.uz * P.pen;
                    const vn = s.vx * P.ux + s.vz * P.uz;
                    if (vn < 0) { s.vx -= 2 * vn * P.ux; s.vz -= 2 * vn * P.uz; s.bounces++; }
                }
                s.x = nx; s.z = nz;
                const gy = C.ground(s.x, s.z, s.m.position.y);
                if (gy < -5) { this._remove(this.shots, s); continue; }       // se cae de la mesa
                s.m.position.set(s.x, gy + 0.5, s.z);
                s.m.children[0].rotation.x += Math.hypot(s.vx, s.vz) * dt / 0.5;
                s.m.rotation.y = Math.atan2(s.vx, s.vz);
                if (s.bounces > 6) { this._remove(this.shots, s); continue; }
            }
            const v = this._hitCar(s.x, s.z, 0.55, s.m.position.y - (s.type === 'ball' ? 0.5 : 1.3), s.t < 0.35 ? s.owner : null);
            if (v) {
                if (v.spinOut(s.type === 'rocket' ? 1.25 : 1.05)) { this._react(v, s.type === 'rocket' ? '🚀 ¡Cohete!' : '🎾 ¡Pelotazo!'); if (s.type === 'rocket') v.hop = 1; }
                this._remove(this.shots, s);
            }
        }
        // rayos
        for (const b of [...this.bolts]) { b.t += dt; b.m.material.opacity = 1 - b.t / 0.35; if (b.t > 0.35) this._remove(this.bolts, b); }
        // la IA usa sus objetos
        if (running) for (const v of S.cars) if ((v.ai || v.auto) && v.item) this._ai(v, dt);
        // ranuras del HUD
        S.cars.filter(v => v.isPlayer).forEach((v, i) => { const k = v.itemRoll > 0 ? KEYS[Math.floor(time * 12) % KEYS.length] : v.item; S.app.hud.item(i, k ? ITEMS[k].emoji : null, v.itemRoll > 0); });
    }

    _react(v, text) {
        if (v.isPlayer) { this.S.app.hud.msg(v.pi, text, 'bad', 1400); this.S.app.controls.rumble(v.slot, 0.8, 260); }
        sfx('spinOut');
    }

    // Cuándo usa la IA lo que lleva
    _ai(v, dt) {
        v.itemHold -= dt;
        if (v.itemHold > 0) return;
        const it = v.item, S = this.S;
        const others = S.cars.filter(o => o !== v && !o.ghost);
        const gapTo = o => o.lap.total - v.lap.total;          // > 0: va por delante
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        let go = v.itemHold < -8;                               // si no, al final lo usa igualmente
        if (it === 'banana' || it === 'oil') go = go || others.some(o => gapTo(o) < 0 && gapTo(o) > -14);
        else if (it === 'ball') go = go || others.some(o => { const g = gapTo(o); if (g <= 0 || g > 30) return false; const a = Math.atan2(o.x - v.x, o.z - v.z) - Math.atan2(fx, fz); return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.25; });
        else if (it === 'turbo') go = go || Math.abs(this.C.curvatureAt((v.prog ? v.prog.along : 0) + 10)) < 0.01;
        else go = true;                                         // cohete, estrella, rayo: en cuanto puede
        if (go) this.use(v, false);
    }

    dispose() { this.C.root.remove(this.root); }
}

// ============================================================================
//  CIRCUITO: trazado, superficies, relieve (rampas y plataformas), choques y caídas
// ============================================================================
// Cada mapa (game/drive/maps/*.js) construye su decorado con estas piezas:
//   track(puntos, { width })          trazado cerrado (spline) → asfalto, salida y progreso por vuelta
//   circle / box / wall                obstáculos sólidos; con `h` (altura) pequeña son "baches":
//                                      los coches con más altura libre que `h` pasan por encima
//   ramp / platform                    relieve: las rampas lanzan al coche, las plataformas se pisan
//   hazard(forma, superficie)          manchas con otro agarre (mermelada, charcos, barro, aceite)
//   boost(x, z, …)                     placas de turbo
//   voidFn = (x, z) => bool            fuera de la mesa: el coche se cae y vuelve a la pista
// Las superficies son { grip, drag, cap (velocidad máx. relativa), dust (color del polvo), name }.
import * as THREE from 'three';
import { toon, model, textTexture } from '../assets.js';
import { Occlusion } from './camera.js';

const CELL = 8;

export class Circuit {
    constructor(scene, def) {
        this.scene = scene;
        this.def = def;
        this.root = new THREE.Group();
        this.root.name = 'circuit-' + def.id;
        scene.add(this.root);
        this.colliders = [];
        this.ramps = [];
        this.platforms = [];
        this.hazards = [];
        this.boosts = [];
        this.anims = [];
        this.voidFn = null;
        this.voidY = -70;
        this.baseY = 0;
        this.gravity = def.gravity ?? 30;
        this.onSurface = { grip: 1, drag: 0, cap: 1, name: 'pista', ...(def.road || {}) };
        this.offSurface = { grip: 0.72, drag: 0.55, cap: 0.72, name: 'fuera', ...(def.off || {}) };
        this.occ = new Occlusion();
        this.grid = new Map();
    }

    add(obj) { this.root.add(obj); return obj; }
    anim(fn) { this.anims.push(fn); }
    occluder(obj, r) {
        const b = new THREE.Box3().setFromObject(obj);
        const c = b.getCenter(new THREE.Vector3());
        this.occ.add(obj, c, r ?? b.getSize(new THREE.Vector3()).length() * 0.42);
    }
    // Modelo de Kenney a un tamaño dado (mayor dimensión horizontal = size, o altura = height)
    async prop(key, x, z, { size = null, height = null, rot = 0, y = 0, color = null } = {}) {
        const m = await model(key);
        const b = new THREE.Box3().setFromObject(m), s = b.getSize(new THREE.Vector3());
        const k = height ? height / s.y : size ? size / Math.max(s.x, s.z) : 1;
        m.scale.multiplyScalar(k);
        const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3());
        m.position.set(-c.x, -b2.min.y, -c.z);
        if (color) m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(color); } });
        const g = new THREE.Group(); g.add(m);
        g.position.set(x, y, z); g.rotation.y = rot;
        this.root.add(g);
        g.userData.size = b2.getSize(new THREE.Vector3());
        return g;
    }

    // ------------------------------------------------------------------ trazado
    track(points, { width = 9, tension = 0.5 } = {}) {
        const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', tension);
        const L = curve.getLength();
        const n = Math.max(60, Math.ceil(L / 0.6));
        const xs = new Float32Array(n), zs = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n), ds = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const p = curve.getPointAt(i / n), t = curve.getTangentAt(i / n);
            xs[i] = p.x; zs[i] = p.z;
            const l = Math.hypot(t.x, t.z) || 1;
            tx[i] = t.x / l; tz[i] = t.z / l;
            ds[i] = L * i / n;
        }
        // curvatura (para la IA)
        const curv = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const a = (i - 3 + n) % n, b = (i + 3) % n;
            let da = Math.atan2(tx[b], tz[b]) - Math.atan2(tx[a], tz[a]);
            while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
            curv[i] = da / (6 * L / n);
        }
        Object.assign(this, { curve, len: L, n, xs, zs, tx, tz, ds, curv, width });
        return this;
    }
    idx(d) { const n = this.n; return ((Math.floor(d / this.len * n) % n) + n) % n; }
    at(d, off = 0) {
        const L = this.len;
        d = ((d % L) + L) % L;
        const f = d / L * this.n, i = Math.floor(f) % this.n, j = (i + 1) % this.n, k = f - Math.floor(f);
        const x = this.xs[i] + (this.xs[j] - this.xs[i]) * k, z = this.zs[i] + (this.zs[j] - this.zs[i]) * k;
        const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * k, tz = this.tz[i] + (this.tz[j] - this.tz[i]) * k;
        const l = Math.hypot(tx, tz) || 1;
        // derecha de la marcha = (−tz, tx)
        return { x: x - tz / l * off, z: z + tx / l * off, tx: tx / l, tz: tz / l, h: Math.atan2(tx, tz) };
    }
    curvatureAt(d) { return this.curv[this.idx(d)]; }
    // Proyección sobre el trazado. hint (índice) limita la búsqueda alrededor del progreso actual.
    project(x, z, hint = -1) {
        const n = this.n;
        let best = -1, bd = Infinity;
        const span = hint < 0 ? n : 60;
        const i0 = hint < 0 ? 0 : hint - span;
        for (let k = 0; k <= (hint < 0 ? n - 1 : span * 2); k++) {
            const i = ((i0 + k) % n + n) % n;
            const dx = x - this.xs[i], dz = z - this.zs[i], d2 = dx * dx + dz * dz;
            if (d2 < bd) { bd = d2; best = i; }
        }
        const i = best;
        const off = (x - this.xs[i]) * -this.tz[i] + (z - this.zs[i]) * this.tx[i];
        const along = this.ds[i] + ((x - this.xs[i]) * this.tx[i] + (z - this.zs[i]) * this.tz[i]);
        return { i, along: ((along % this.len) + this.len) % this.len, off, dist: Math.sqrt(bd) };
    }

    // Asfalto (cinta a lo largo del trazado). mat: material; uvLen: metros por repetición de textura
    roadMesh(mat, { width = this.width, y = 0.02, uvLen = 8 } = {}) {
        const n = this.n, pos = [], uv = [], idx = [];
        for (let i = 0; i <= n; i++) {
            const k = i % n;
            const nx = -this.tz[k], nz = this.tx[k];
            for (const s of [-1, 1]) {
                pos.push(this.xs[k] + nx * s * width / 2, y, this.zs[k] + nz * s * width / 2);
                uv.push(s < 0 ? 0 : 1, (i === n ? this.len : this.ds[k]) / uvLen);
            }
            if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        if (g.attributes.normal.getY(0) < 0) { g.index.array.reverse(); g.index.needsUpdate = true; g.computeVertexNormals(); }
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        this.root.add(m);
        return m;
    }
    // Piezas repetidas a lo largo del borde (cereales, piedras, conos…): InstancedMesh
    edgeInstances(geo, mat, { every = 1.6, off = null, y = 0, jitter = 0, scale = 1, sides = [-1, 1], skip = null } = {}) {
        const pts = [];
        const o = off ?? this.width / 2 + 0.4;
        for (let d = 0; d < this.len; d += every) for (const s of sides) {
            if (skip && skip(d, s)) continue;
            const p = this.at(d, s * (o + (Math.random() - 0.5) * jitter));
            pts.push([p.x, p.z, p.h]);
        }
        const im = new THREE.InstancedMesh(geo, mat, pts.length);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        pts.forEach(([x, z, h], i) => {
            q.setFromEuler(new THREE.Euler(0, h + Math.random() * 6, 0));
            const k = scale * (0.85 + Math.random() * 0.3);
            sc.set(k, k, k);
            m4.compose(new THREE.Vector3(x, y, z), q, sc);
            im.setMatrixAt(i, m4);
        });
        im.castShadow = true; im.receiveShadow = true;
        this.root.add(im);
        return im;
    }
    // Línea de salida (a cuadros) y arco de meta
    startLine({ arch = true, banner = 'SALIDA · META', color = '#ff4d8d' } = {}) {
        const p = this.at(0);
        const c = document.createElement('canvas'); c.width = 256; c.height = 32;
        const g = c.getContext('2d');
        for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#1b1b2f' : '#ffffff'; g.fillRect(i * 16, j * 16, 16, 16); }
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        // plano tumbado: x = a lo ancho de la pista, z = en el sentido de la marcha
        const lg = new THREE.PlaneGeometry(this.width, 1.2); lg.rotateX(-Math.PI / 2);
        const line = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -4 }));
        const holder = new THREE.Group(); holder.add(line);
        holder.position.set(p.x, this.baseY + 0.04, p.z); holder.rotation.y = p.h;
        this.root.add(holder);
        if (arch) {
            const A = new THREE.Group();
            const W = this.width + 2.4, H = 5.2;
            const mat = toon('#f4f6fb');
            for (const s of [-1, 1]) {
                const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, H, 12), mat);
                post.position.set(s * W / 2, H / 2, 0); post.castShadow = true; A.add(post);
            }
            const tex = textTexture('', { width: 1024, height: 128, bg: color, fg: '#ffffff', lines: [banner], font: 'Bangers', weight: 400, border: 10, borderColor: '#1b1b2f', radius: 18 });
            const ban = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 1.3, 0.3), [mat, mat, mat, mat, new THREE.MeshBasicMaterial({ map: tex }), new THREE.MeshBasicMaterial({ map: tex })]);
            ban.position.y = H; ban.castShadow = true; A.add(ban);
            A.position.set(p.x, 0, p.z); A.rotation.y = p.h;
            this.root.add(A);
            this.circle(p.x - Math.cos(p.h) * W / 2, p.z + Math.sin(p.h) * W / 2, 0.4);
            this.circle(p.x + Math.cos(p.h) * W / 2, p.z - Math.sin(p.h) * W / 2, 0.4);
        }
        return holder;
    }
    // Posiciones de salida (en parrilla, por detrás de la línea): [{ x, z, h, along }]
    grid2(n, { gap = 5.5 } = {}) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
            const d = this.len - 4 - row * gap - (i % 2) * 1.2;
            const p = this.at(d, side * this.width * 0.22);
            out.push({ x: p.x, z: p.z, h: p.h, along: d });
        }
        return out;
    }

    // ------------------------------------------------------------- obstáculos
    // bump: bache (siempre se pasa por encima; los coches bajos botan y frenan)
    circle(x, z, r, { h = 99, bump = false } = {}) { const c = { type: 'c', x, z, r, h, bump }; this.colliders.push(c); return c; }
    box(x, z, w, d, rot = 0, { h = 99 } = {}) {
        const c = { type: 'b', x, z, hw: w / 2, hd: d / 2, cs: Math.cos(rot), sn: Math.sin(rot), h, r: Math.hypot(w, d) / 2 };
        this.colliders.push(c); return c;
    }
    // Muro como cadena de segmentos (con grosor)
    wall(points, { thick = 0.4, h = 99, closed = false } = {}) {
        const pts = closed ? [...points, points[0]] : points;
        for (let i = 0; i < pts.length - 1; i++) {
            const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
            this.colliders.push({ type: 's', ax, az, bx, bz, r: thick / 2, h, x: (ax + bx) / 2, z: (az + bz) / 2, len: Math.hypot(bx - ax, bz - az) });
        }
    }
    // Rampa: rectángulo girado rot; la altura sube de h0 (en −d/2) a h1 (en +d/2) a lo largo de su eje
    ramp(x, z, w, d, rot, h1, h0 = 0) { const r = { x, z, hw: w / 2, hd: d / 2, cs: Math.cos(rot), sn: Math.sin(rot), h0, h1 }; this.ramps.push(r); return r; }
    platform(x, z, w, d, rot, top) {
        const p = { x, z, hw: w / 2, hd: d / 2, cs: Math.cos(rot), sn: Math.sin(rot), top };
        this.platforms.push(p);
        this.box(x, z, w, d, rot, { h: top });
        return p;
    }
    // Plataforma redonda (un plato, una tapa…): se sube si cabe el escalón
    disc(x, z, r, top) {
        const p = { x, z, r, top, round: true };
        this.platforms.push(p);
        this.circle(x, z, r, { h: top });
        return p;
    }
    hazard(shape, surf) { this.hazards.push({ ...shape, surf }); }
    boost(x, z, w, d, rot) { this.boosts.push({ x, z, hw: w / 2, hd: d / 2, cs: Math.cos(rot), sn: Math.sin(rot) }); }

    _local(o, x, z) {
        const dx = x - o.x, dz = z - o.z;
        return [dx * o.cs - dz * o.sn, dx * o.sn + dz * o.cs];
    }
    _inRect(o, x, z) { const [lx, lz] = this._local(o, x, z); return Math.abs(lx) <= o.hw && Math.abs(lz) <= o.hd ? [lx, lz] : null; }
    _inShape(s, x, z) {
        if (s.r !== undefined && s.hw === undefined) return Math.hypot(x - s.x, z - s.z) < s.r;
        return !!this._inRect({ ...s, cs: s.cs ?? 1, sn: s.sn ?? 0 }, x, z);
    }

    // Construye la rejilla de búsqueda de obstáculos (llamar al acabar el mapa)
    finalize() {
        this.grid.clear();
        for (const c of this.colliders) {
            const ext = c.type === 's' ? c.len / 2 + c.r : c.r;
            const x0 = Math.floor((c.x - ext) / CELL), x1 = Math.floor((c.x + ext) / CELL);
            const z0 = Math.floor((c.z - ext) / CELL), z1 = Math.floor((c.z + ext) / CELL);
            for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
                const k = i + ',' + j;
                if (!this.grid.has(k)) this.grid.set(k, []);
                this.grid.get(k).push(c);
            }
        }
    }
    _near(x, z) {
        const k = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
        return this.grid.get(k) || [];
    }

    // ------------------------------------------------------------------ física
    // Altura del suelo en (x, z) para un coche a altura y con cierta altura libre
    ground(x, z, y = 0, clear = 0.15) {
        let g = this.voidFn && this.voidFn(x, z) ? this.voidY : this.baseY;
        // a una plataforma se sube si el escalón cabe bajo la carrocería (o si ya se va por encima)
        for (const p of this.platforms) {
            const inside = p.round ? Math.hypot(x - p.x, z - p.z) <= p.r : this._inRect(p, x, z);
            if (inside && y >= p.top - Math.max(0.25, clear + 0.1)) g = Math.max(g, p.top);
        }
        for (const r of this.ramps) {
            const l = this._inRect(r, x, z);
            if (!l) continue;
            const h = r.h0 + (r.h1 - r.h0) * (l[1] + r.hd) / (2 * r.hd);
            if (y >= h - 1.0) g = Math.max(g, h);
        }
        return g;
    }
    // Penetración de un círculo (cx, cz, r) en un obstáculo: { ux, uz, pen } (normal hacia fuera) o null
    _pen(o, cx, cz, r) {
        if (o.type === 'c' || o.type === 's') {
            let qx = o.x, qz = o.z;
            if (o.type === 's') {
                const vx = o.bx - o.ax, vz = o.bz - o.az, L2 = vx * vx + vz * vz || 1e-6;
                const t = THREE.MathUtils.clamp(((cx - o.ax) * vx + (cz - o.az) * vz) / L2, 0, 1);
                qx = o.ax + vx * t; qz = o.az + vz * t;
            }
            const dx = cx - qx, dz = cz - qz, d = Math.hypot(dx, dz), min = r + o.r;
            if (d >= min) return null;
            if (d < 1e-4) return { ux: 1, uz: 0, pen: min };
            return { ux: dx / d, uz: dz / d, pen: min - d };
        }
        // caja girada (mundo → local: rotación inversa de rotation.y)
        const [lx, lz] = this._local(o, cx, cz);
        const kx = THREE.MathUtils.clamp(lx, -o.hw, o.hw), kz = THREE.MathUtils.clamp(lz, -o.hd, o.hd);
        let nlx, nlz, pen;
        if (lx !== kx || lz !== kz) {
            const ex = lx - kx, ez = lz - kz, d = Math.hypot(ex, ez);
            if (d >= r) return null;
            nlx = ex / d; nlz = ez / d; pen = r - d;
        } else {                                                   // el centro está dentro: por el lado más cercano
            const ex = o.hw - Math.abs(lx), ez = o.hd - Math.abs(lz);
            if (ex < ez) { nlx = Math.sign(lx) || 1; nlz = 0; pen = ex + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; pen = ez + r; }
        }
        // local → mundo
        return { ux: nlx * o.cs + nlz * o.sn, uz: -nlx * o.sn + nlz * o.cs, pen };
    }
    // Choques del coche v si se moviera a (nx, nz): { x, z, nx, nz } o null
    collide(v, nx, nz) {
        const fx = Math.sin(v.h), fz = Math.cos(v.h);
        let px = nx, pz = nz, hit = null, bump = 0;
        const clear = v.P.clearance;
        const above = v.y - this.baseY;
        for (let it = 0; it < 3; it++) {
            let moved = false;
            for (const C of v.circles) {
                const cx = px + fx * C.lz, cz = pz + fz * C.lz;
                for (const o of this._near(cx, cz)) {
                    const P = this._pen(o, cx, cz, C.r);
                    if (!P) continue;
                    // bache: se pasa por encima; cuanto más bajo el coche, más bota
                    if (o.bump) { if (clear < o.h + 0.2) bump = Math.max(bump, (o.h + 0.2 - clear) / (o.h + 0.2)); continue; }
                    // escalón bajo: se pasa por encima si cabe por debajo o ya va por encima
                    if (o.h < 90 && (clear >= o.h || above >= o.h - 0.15)) continue;
                    px += P.ux * P.pen; pz += P.uz * P.pen; moved = true;
                    hit = { x: px, z: pz, nx: P.ux, nz: P.uz };
                }
            }
            if (!moved) break;
        }
        if (bump > 0 && !v.air && v.hop < 0.2 && Math.abs(v.vf) > 2) { v.hop = 0.25 + bump * 0.4; const k = 1 - bump * 0.06; v.vx *= k; v.vz *= k; }
        if (hit) { hit.x = px; hit.z = pz; }
        return hit;
    }
    // Superficie bajo el coche; también actualiza su progreso en el trazado y las placas de turbo
    surface(x, z, v) {
        if (v) {
            const pr = this.project(x, z, v.ti ?? -1);
            v.ti = pr.i; v.prog = pr;
            for (const b of this.boosts) if (this._inRect(b, x, z) && !v.air) { if (!(v.boostT > 0.8)) { v.kick(1.2); if (v.onBoost) v.onBoost(); } }
        }
        for (const h of this.hazards) if (this._inShape(h, x, z)) return h.surf;
        const pr = v ? v.prog : this.project(x, z);
        if (this.offFn) { const s = this.offFn(x, z, pr); if (s) return s; }
        return Math.abs(pr.off) <= this.width / 2 + 0.3 ? this.onSurface : this.offSurface;
    }

    update(dt, t, cams) {
        for (const f of this.anims) f(dt, t);
        if (cams) this.occ.update(dt, cams);
    }
    dispose() {
        this.scene.remove(this.root);
        this.root.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && m.map.isCanvasTexture) m.map.dispose(); m.dispose(); });
        });
    }
}

// ----------------------------------------------------------------------------
//  Progreso por vueltas: continuo (vueltas · largo + posición), sin contar atajos
// ----------------------------------------------------------------------------
export class Lapper {
    constructor(circuit, v, startAlong) {
        this.c = circuit; this.v = v;
        this.laps = -1;                       // la parrilla está justo antes de la línea
        this.last = startAlong;
        this.total = startAlong - circuit.len;
        this.lapTimes = [];
        this.lapStart = 0;
        this.best = Infinity;
        this.lastGood = startAlong;           // último punto en la pista (para volver tras una caída)
    }
    // Devuelve 'lap' si acaba de completar una vuelta
    update(time) {
        const pr = this.v.prog;
        if (!pr) return null;
        const L = this.c.len;
        if (pr.dist > this.c.width * 1.6) return null;          // lejos de la pista: no cuenta
        let d = pr.along - this.last;
        if (d < -L / 2) { d += L; this.laps++; }
        else if (d > L / 2) { d -= L; this.laps--; }
        if (Math.abs(d) > 25) return null;                     // salto raro (no debería pasar)
        this.last = pr.along;
        const prevTotal = this.total;
        this.total = this.laps * L + pr.along;
        if (Math.abs(pr.off) < this.c.width / 2 && !this.v.air) this.lastGood = pr.along;
        const done = Math.floor(this.total / L), was = Math.floor(prevTotal / L);
        if (done > was && done >= 1 && done > this.lapTimes.length) {
            const lt = time - this.lapStart;
            this.lapTimes.push(lt);
            this.best = Math.min(this.best, lt);
            this.lapStart = time;
            return 'lap';
        }
        return null;
    }
    get lap() { return Math.max(1, Math.floor(this.total / this.c.len) + 1); }
    // Recolocar el coche en `along` (tras una caída o en el pique a dos) sin descuadrar las vueltas
    teleport(along, laps = this.laps) {
        const L = this.c.len;
        while (along < 0) { along += L; laps--; }
        while (along >= L) { along -= L; laps++; }
        this.laps = laps; this.last = along; this.lastGood = along;
        this.total = laps * L + along;
    }
}

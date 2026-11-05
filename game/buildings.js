// ============================================================================
//  GENERADOR DE EDIFICIOS DETALLADOS
// ============================================================================
// building({ w, d, floors, style, ... }) devuelve un THREE.Group con la fachada
// mirando hacia +Z (hacia la carretera cuando se coloca con ctx.put).
//
// Estilos:
//   'eixample'      piedra clara, balcones de hierro en cada ventana, comercios abajo
//   'mediterranean' blanco encalado, persianas verdes o azules, macetas
//   'modern'        bandas de cristal azulado y antepechos blancos
//   'stone'         piedra señorial, ventanas altas, cornisa marcada
//   'almacenes'     gran almacén: bandas horizontales de ventanas
//   'brick'         ladrillo, ventanas con marco blanco
// Las fachadas son texturas de canvas (baratas) + detalles 3D sólo en la fachada principal.
// ============================================================================
import * as THREE from 'three';
import { toon, textPlane } from './assets.js';

const STYLES = {
    eixample: { wall: '#e8d9c0', wall2: '#dcc8a8', win: '#3a4660', frame: '#f6efe2', shutter: null, cols: 1.6, floorH: 1.15, balcony: true, cornice: '#cdb894', shops: true },
    mediterranean: { wall: '#fbfaf6', wall2: '#efece4', win: '#2c3b52', frame: '#ffffff', shutter: '#2f8a3c', cols: 1.8, floorH: 1.1, balcony: false, cornice: '#f2efe6', shops: false, pots: true },
    blue: { wall: '#fbfaf6', wall2: '#efece4', win: '#2c3b52', frame: '#ffffff', shutter: '#2f6fc0', cols: 1.8, floorH: 1.1, balcony: false, cornice: '#f2efe6', shops: false, pots: true },
    modern: { wall: '#f1f3f6', wall2: '#e3e7ee', win: '#5d8fc0', frame: '#f8fafc', shutter: null, cols: 1.4, floorH: 1.05, band: true, cornice: '#d9dee6', shops: true },
    stone: { wall: '#d9c7a6', wall2: '#cbb690', win: '#2f3a52', frame: '#efe5d0', shutter: null, cols: 1.7, floorH: 1.3, balcony: true, cornice: '#b9a27e', shops: true, tall: true },
    almacenes: { wall: '#f2efe8', wall2: '#e6e1d6', win: '#55708f', frame: '#f8f6f0', shutter: null, cols: 1.5, floorH: 1.15, band: true, cornice: '#d8d2c4', shops: true },
    brick: { wall: '#b5654a', wall2: '#a65a41', win: '#2f3a52', frame: '#f4efe6', shutter: null, cols: 1.6, floorH: 1.1, balcony: true, cornice: '#e9dfcf', shops: true }
};

const mats = new Map();
const M = (c, o) => { const k = c + JSON.stringify(o || {}); if (!mats.has(k)) mats.set(k, toon(c, o)); return mats.get(k); };

// Textura de una "crujía" (una columna de ventanas por planta), repetible en horizontal
const facadeTex = new Map();
function facadeTexture(styleName) {
    const key = styleName;
    if (facadeTex.has(key)) return facadeTex.get(key);
    const S = STYLES[styleName];
    const floors = 1;
    const W = 64, FH = 64, H = FH * floors;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = S.wall; g.fillRect(0, 0, W, H);
    // textura sutil de la pared
    for (let i = 0; i < 160; i++) { g.fillStyle = Math.random() < 0.5 ? S.wall2 : S.wall; g.globalAlpha = 0.35; g.fillRect(Math.random() * W, Math.random() * H, 3, 2); }
    g.globalAlpha = 1;
    for (let f = 0; f < floors; f++) {
        const y0 = H - (f + 1) * FH;     // planta f (0 = baja) empezando por abajo
        // línea de forjado
        g.fillStyle = S.cornice; g.fillRect(0, y0 + FH - 4, W, 4);
        if (S.band) {
            // banda continua de cristal
            g.fillStyle = S.win; g.fillRect(0, y0 + 14, W, FH - 30);
            g.fillStyle = S.frame; g.fillRect(W / 2 - 1, y0 + 14, 2, FH - 30);
            g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(4, y0 + 16, 10, FH - 34);
            continue;
        }
        const ww = S.tall ? 26 : 28, wh = S.tall ? 42 : 36, wx = (W - ww) / 2, wy = y0 + (FH - wh) / 2 - 2;
        g.fillStyle = S.frame; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
        g.fillStyle = S.win; g.fillRect(wx, wy, ww, wh);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(wx + 3, wy + 3, 6, wh - 6);
        g.fillStyle = S.frame; g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        if (S.shutter) {
            g.fillStyle = S.shutter;
            g.fillRect(wx - 12, wy - 2, 9, wh + 4); g.fillRect(wx + ww + 3, wy - 2, 9, wh + 4);
            g.fillStyle = 'rgba(0,0,0,0.15)';
            for (let k = 0; k < wh; k += 5) { g.fillRect(wx - 12, wy + k, 9, 1); g.fillRect(wx + ww + 3, wy + k, 9, 1); }
        }
        // dintel decorado (eixample / piedra)
        if (S.balcony || S.tall) { g.fillStyle = S.cornice; g.fillRect(wx - 6, wy - 9, ww + 12, 5); }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    const mat = new THREE.MeshToonMaterial({ map: t });
    facadeTex.set(key, mat);
    return mat;
}

// Plano de fachada con las UV escaladas para que cada crujía mida "cols" unidades
function facePlane(w, h, mat, colW, floorsRep = 1) {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    const reps = Math.max(1, Math.round(w / colW));
    for (let i = 0; i < uv.count; i++) { uv.setX(i, uv.getX(i) * reps); uv.setY(i, uv.getY(i) * floorsRep); }
    return new THREE.Mesh(geo, mat);
}

const SHOP_COLORS = ['#e8173b', '#2f8a3c', '#1d5bbf', '#ffb703', '#7a2340', '#2b2d42'];

export function building({ w = 8, d = 6, floors = 5, style = 'eixample', roof = 'flat', shops = null, seed = 1, sign = null, signColor = '#1b1b2f' } = {}) {
    const S = STYLES[style] || STYLES.eixample;
    const rnd = (() => { let s = seed * 9301 + 49297; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
    const fh = S.floorH, H = floors * fh;
    const g = new THREE.Group();
    const facade = facadeTexture(style);
    // Cuerpo (núcleo) y las cuatro fachadas texturizadas
    const core = new THREE.Mesh(new THREE.BoxGeometry(w - 0.02, H, d - 0.02), M(S.wall2));
    core.position.y = H / 2; g.add(core);
    const faces = [
        [w, 0, d / 2, 0], [w, 0, -d / 2, Math.PI], [d, w / 2, 0, Math.PI / 2], [d, -w / 2, 0, -Math.PI / 2]
    ];
    const shopsFloor = (shops ?? S.shops) ? 1 : 0;      // la planta baja con comercios: pared lisa + escaparates 3D
    const upperH = H - shopsFloor * fh;
    for (const [fw, x, z, ry] of faces) {
        const p = facePlane(fw, upperH, facade, S.cols, floors - shopsFloor);
        p.position.set(x, shopsFloor * fh + upperH / 2, z); p.rotation.y = ry;
        g.add(p);
        if (shopsFloor) {
            const base = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), M(S.wall2));
            base.position.set(x, fh / 2, z); base.rotation.y = ry;
            g.add(base);
        }
    }
    // Cornisa y antepecho
    const cor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.35, 0.22, d + 0.35), M(S.cornice)); cor.position.y = H + 0.05; g.add(cor);
    const par = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.35, d + 0.1), M(S.wall)); par.position.y = H + 0.33; g.add(par);
    const roofTop = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.05, d - 0.2), M('#9a958b')); roofTop.position.y = H + 0.45; g.add(roofTop);
    if (roof === 'tiles') {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0, Math.max(w, d) * 0.62, 1.4, 4), M('#b5523b'));
        r.rotation.y = Math.PI / 4; r.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); r.position.y = H + 1.0; g.add(r);
    } else {
        // azotea: depósito, chimeneas y caseta
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 10), M('#c7ccd8')); tank.position.set(w * 0.25, H + 0.8, -d * 0.2); g.add(tank);
        for (let i = 0; i < 2; i++) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.35), M(S.cornice)); ch.position.set(-w * 0.3 + i * 0.6, H + 0.75, -d * 0.3); g.add(ch); }
        const hut = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.0), M(S.wall)); hut.position.set(-w * 0.15, H + 0.85, d * 0.1); g.add(hut);
    }
    // Planta baja: comercios con escaparate y toldo
    const hasShops = shops ?? S.shops;
    if (hasShops) {
        const n = Math.max(1, Math.round(w / 2.6)), sw = w / n;
        for (let i = 0; i < n; i++) {
            const x = -w / 2 + sw * (i + 0.5);
            const glass = new THREE.Mesh(new THREE.PlaneGeometry(sw * 0.78, fh * 0.72), M('#88b4d8'));
            glass.position.set(x, fh * 0.4, d / 2 + 0.012); g.add(glass);
            const col = SHOP_COLORS[Math.floor(rnd() * SHOP_COLORS.length)];
            const aw = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.86, 0.06, 0.6), M(col));
            aw.position.set(x, fh * 0.86, d / 2 + 0.3); aw.rotation.x = 0.35; g.add(aw);
            const lip = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.86, 0.14, 0.03), M(col)); lip.position.set(x, fh * 0.75, d / 2 + 0.58); g.add(lip);
        }
    }
    // Balcones de hierro (sólo fachada principal)
    if (S.balcony) {
        const cols = Math.max(1, Math.round(w / S.cols)), cw = w / cols;
        const iron = M('#2a2d3a');
        for (let f = hasShops ? 1 : 0; f < floors; f++) {
            for (let i = 0; i < cols; i++) {
                const x = -w / 2 + cw * (i + 0.5), y = f * fh + 0.12;
                const slab = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.72, 0.07, 0.38), M(S.cornice)); slab.position.set(x, y, d / 2 + 0.19); g.add(slab);
                const rail = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.72, 0.04, 0.04), iron); rail.position.set(x, y + 0.36, d / 2 + 0.37); g.add(rail);
                for (const sx of [-1, 0, 1]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.03), iron); bar.position.set(x + sx * cw * 0.34, y + 0.2, d / 2 + 0.37); g.add(bar); }
            }
        }
    }
    // Macetas con geranios (mediterráneo)
    if (S.pots) {
        const cols = Math.max(1, Math.round(w / S.cols)), cw = w / cols;
        for (let f = 1; f < floors; f++) for (let i = 0; i < cols; i++) {
            if (rnd() < 0.45) continue;
            const x = -w / 2 + cw * (i + 0.5), y = f * fh + 0.15;
            const pot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), M('#b5523b')); pot.position.set(x, y, d / 2 + 0.09); g.add(pot);
            const fl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 4), M(rnd() < 0.5 ? '#e8173b' : '#ff7eb3')); fl.position.set(x, y + 0.14, d / 2 + 0.1); fl.scale.set(1.6, 0.7, 0.8); g.add(fl);
        }
    }
    // Rótulo opcional sobre la planta baja
    if (sign) {
        const s = textPlane(sign, Math.min(w * 0.8, 6), { width: 900, height: 160, bg: '#ffffff', fg: signColor, border: 8, borderColor: signColor });
        s.position.set(0, hasShops ? fh * 1.05 : H * 0.85, d / 2 + 0.05); g.add(s);
    }
    g.userData.height = H;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
}

// Edificio con cúpula (como el de Banesto en Plaça Catalunya)
export function domeBuilding({ w = 7, d = 7, floors = 6, seed = 3 } = {}) {
    const g = building({ w, d, floors, style: 'stone', seed });
    const H = g.userData.height;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 1.2, 20), M('#d9c7a6')); drum.position.set(w / 2 - 1.6, H + 1.0, d / 2 - 1.6); g.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.45, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M('#5f7f8f')); dome.position.set(w / 2 - 1.6, H + 1.6, d / 2 - 1.6); g.add(dome);
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.8, 8), M('#d4af37')); lan.position.set(w / 2 - 1.6, H + 3.3, d / 2 - 1.6); g.add(lan);
    return g;
}

export const BUILDING_STYLES = Object.keys(STYLES);

// ============================================================================
//  MASIA CATALANA
// ============================================================================
// Piedra con cantoneras, tejado a dos aguas de teja árabe con el caballete
// perpendicular a la fachada, portal de arco de dovelas, ventanas con marco de
// piedra y porticones, reloj de sol, chimenea y pajar adosado.
// Fachada hacia +Z. userData.door = posición local del portal.
// ============================================================================
const texCache = new Map();
function canvasTex(key, w, h, draw) {
    if (texCache.has(key)) return texCache.get(key);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    texCache.set(key, t);
    return t;
}
// Mampostería de piedra irregular
function stoneMat() {
    return stoneMatCache || (stoneMatCache = new THREE.MeshToonMaterial({
        map: canvasTex('stone', 256, 256, (g, W, H) => {
            g.fillStyle = '#d9c6a0'; g.fillRect(0, 0, W, H);
            const tones = ['#c9ad7f', '#bfa173', '#d4b98c', '#b8976a', '#cdb489', '#c2a87c'];
            let y = 0, seed = 7;
            const r = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
            while (y < H) {
                const rh = 18 + r() * 16;
                let x = -r() * 30;
                while (x < W) {
                    const sw = 26 + r() * 34;
                    g.fillStyle = tones[Math.floor(r() * tones.length)];
                    g.beginPath();
                    const j = () => (r() - 0.5) * 4;
                    g.moveTo(x + 2 + j(), y + 2 + j()); g.lineTo(x + sw - 2 + j(), y + 2 + j());
                    g.lineTo(x + sw - 2 + j(), y + rh - 2 + j()); g.lineTo(x + 2 + j(), y + rh - 2 + j());
                    g.closePath(); g.fill();
                    // repetir en el borde para que la textura sea continua
                    if (x + sw > W) { g.save(); g.translate(-W, 0); g.fill(); g.restore(); }
                    x += sw;
                }
                y += rh;
            }
        })
    }));
}
let stoneMatCache = null;
// Teja árabe: canales que bajan por la pendiente (u) y filas de solape (v)
let tileMatCache = null;
function tileMat() {
    return tileMatCache || (tileMatCache = new THREE.MeshToonMaterial({
        map: canvasTex('tiles', 128, 128, (g, W, H) => {
            g.fillStyle = '#b4573c'; g.fillRect(0, 0, W, H);
            for (let i = 0; i < 8; i++) {
                const y = i * 16;
                const grd = g.createLinearGradient(0, y, 0, y + 16);
                grd.addColorStop(0, '#8f3f2a'); grd.addColorStop(0.5, i % 2 ? '#c86a4a' : '#bf6142'); grd.addColorStop(1, '#8f3f2a');
                g.fillStyle = grd; g.fillRect(0, y, W, 16);
            }
            g.fillStyle = 'rgba(70,25,15,.45)';
            for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 3, H);
        })
    }));
}
// UV en metros (la textura se repite cada "tile" unidades, sin estirarse)
function metricUV(geo, tile) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const [u, v] = nx > 0.5 ? [z, y] : ny > 0.5 ? [x, z] : [x, y];
        uv.setXY(i, u / tile, v / tile);
    }
    uv.needsUpdate = true;
    return geo;
}
const sunTexKey = 'sundial';
function sundialTex() {
    return canvasTex(sunTexKey, 256, 256, (g, W, H) => {
        g.fillStyle = '#f4ead6'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#a0522d'; g.lineWidth = 10; g.strokeRect(8, 8, W - 16, H - 16);
        g.strokeStyle = '#3a2a1a'; g.lineWidth = 3;
        const cx = W / 2, cy = 46;
        for (let k = 0; k <= 12; k++) {
            const a = Math.PI * (0.12 + 0.76 * k / 12);
            g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 170, cy + Math.sin(a) * 170); g.stroke();
        }
        g.fillStyle = '#f4ead6'; g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8a33d'; g.beginPath(); g.arc(cx, cy + 4, 22, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#3a2a1a'; g.font = '700 22px serif'; g.textAlign = 'center';
        g.fillText('♥ 2026 ♥', cx, H - 22);
    });
}

export function masia({ w = 10.5, d = 9, h = 6.4, ridge = 2.7, shutter = '#4d7c6b', seed = 5 } = {}) {
    const g = new THREE.Group();
    const stone = stoneMat(), tiles = tileMat();
    const light = M('#e6d3ac'), wood = M('#5a3a22'), dark = M('#2a1d14'), iron = M('#2a2d3a');
    const T = 2.6;   // metros por repetición de la textura de piedra

    // Cuerpo, zócalo y hastiales
    const body = new THREE.Mesh(metricUV(new THREE.BoxGeometry(w, h, d), T), stone);
    body.position.y = h / 2; g.add(body);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.55, d + 0.12), M('#a88f68'));
    plinth.position.y = 0.27; g.add(plinth);
    const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, ridge); tri.closePath();
    const gable = new THREE.ExtrudeGeometry(tri, { depth: d, bevelEnabled: false });
    const guv = gable.attributes.uv; for (let i = 0; i < guv.count; i++) guv.setXY(i, guv.getX(i) / T, guv.getY(i) / T);
    const gm = new THREE.Mesh(gable, stone); gm.position.set(0, h, -d / 2); g.add(gm);

    // Tejado: dos faldones con alero y caballete
    const over = 0.5, half = w / 2 + over, drop = ridge * over / (w / 2);
    const slope = Math.atan2(ridge, w / 2);
    const L = Math.hypot(half, ridge + drop);
    for (const sx of [-1, 1]) {
        const geo = metricUV(new THREE.BoxGeometry(L, 0.2, d + 0.8), 2);
        const slab = new THREE.Mesh(geo, tiles);
        slab.rotation.z = -sx * slope;
        const nx = Math.sin(slope) * sx, ny = Math.cos(slope);    // normal hacia fuera del faldón
        slab.position.set(sx * half / 2 + nx * 0.1, h + ridge - (ridge + drop) / 2 + ny * 0.1, 0);
        g.add(slab);
        // alero (canto de tejas) bajo el borde
        const eave = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, d + 0.8), M('#e9dcc2'));
        eave.position.set(sx * (w / 2 + 0.12), h - 0.08, 0); g.add(eave);
    }
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, d + 0.9, 8), M('#9a4630'));
    cap.rotation.x = Math.PI / 2; cap.position.set(0, h + ridge + 0.17, 0); g.add(cap);

    // Chimenea de piedra
    const chim = new THREE.Mesh(metricUV(new THREE.BoxGeometry(0.75, 2.2, 0.75), T), stone);
    chim.position.set(w * 0.22, h + ridge * 0.55 + 0.9, -d * 0.25); g.add(chim);
    const chimCap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.12, 0.95), M('#9a4630')); chimCap.position.set(w * 0.22, h + ridge * 0.55 + 2.05, -d * 0.25); g.add(chimCap);

    // Cantoneras (piedra clara alterna en las esquinas)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        for (let y = 0.6, i = 0; y < h - 0.2; y += 0.48, i++) {
            const [bx, bz] = i % 2 ? [0.85, 0.5] : [0.5, 0.85];
            const q = new THREE.Mesh(new THREE.BoxGeometry(bx, 0.42, bz), light);
            q.position.set(sx * (w / 2 - bx / 2 + 0.04), y + 0.21, sz * (d / 2 - bz / 2 + 0.04)); g.add(q);
        }
    }

    const fz = d / 2;    // plano de la fachada
    // Portal adovellado: puerta de madera con arco de medio punto y dovelas
    const dr = 0.9, dh = 1.7;
    const doorShape = new THREE.Shape();
    doorShape.moveTo(-dr, 0); doorShape.lineTo(dr, 0); doorShape.lineTo(dr, dh);
    doorShape.absarc(0, dh, dr, 0, Math.PI, false); doorShape.lineTo(-dr, 0);
    const door = new THREE.Mesh(new THREE.ShapeGeometry(doorShape, 16), wood);
    door.position.set(0, 0.02, fz + 0.03); g.add(door);
    const split = new THREE.Mesh(new THREE.BoxGeometry(0.05, dh + dr - 0.05, 0.02), dark); split.position.set(0, (dh + dr) / 2, fz + 0.04); g.add(split);
    for (const sx of [-0.35, 0.35]) { const knock = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 12), iron); knock.position.set(sx, 1.25, fz + 0.06); g.add(knock); }
    const NV = 13;
    for (let i = 0; i < NV; i++) {
        const a0 = Math.PI * i / NV + 0.012, a1 = Math.PI * (i + 1) / NV - 0.012;
        const sh = new THREE.Shape();
        const r0 = dr + 0.02, r1 = dr + 0.62 + (i % 2) * 0.1;
        sh.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        sh.lineTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
        sh.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        sh.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
        const v = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }), i % 2 ? light : M('#ddc8a0'));
        v.position.set(0, dh, fz); g.add(v);
    }
    for (const sx of [-1, 1]) for (let y = 0.05, i = 0; y < dh - 0.1; y += 0.42, i++) {
        const bw = i % 2 ? 0.45 : 0.65;
        const j = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.38, 0.08), light);
        j.position.set(sx * (dr + bw / 2 + 0.02), y + 0.19, fz + 0.04); g.add(j);
    }
    // Placa de cerámica de bienvenida
    const plaque = textPlane('Benvinguts ♥', 1.2, { width: 400, height: 120, bg: '#f7f3ea', fg: '#1d5bbf', borderColor: '#1d5bbf', border: 8, radius: 10, font: 'Playfair Display' });
    plaque.position.set(-dr - 1.35, 1.9, fz + 0.03); g.add(plaque);

    // Ventanas: marco de piedra, vierteaguas, porticones abiertos; rejas en la planta baja
    const winGlass = M('#2c3550');
    const windowAt = (x, y, ww, wh, { bars = false, shutters = true, balcony = false, lit = false } = {}) => {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.3, wh + 0.3, 0.1), light);
        frame.position.set(x, y, fz + 0.03); g.add(frame);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), lit ? new THREE.MeshBasicMaterial({ color: 0xffd57a, toneMapped: false }) : winGlass);
        glass.position.set(x, y, fz + 0.085); g.add(glass);
        const mull = new THREE.Mesh(new THREE.BoxGeometry(0.05, wh, 0.03), wood); mull.position.set(x, y, fz + 0.1); g.add(mull);
        const sill = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.5, 0.1, 0.3), light); sill.position.set(x, y - wh / 2 - 0.18, fz + 0.12); g.add(sill);
        if (shutters) for (const sx of [-1, 1]) {
            const sh = new THREE.Mesh(new THREE.BoxGeometry(ww / 2, wh, 0.05), M(shutter));
            sh.position.set(x + sx * (ww * 0.75 + 0.2), y, fz + 0.06); g.add(sh);
            for (let k = 1; k < 4; k++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(ww / 2 - 0.06, 0.025, 0.02), M('#3a5c50')); sl.position.set(x + sx * (ww * 0.75 + 0.2), y - wh / 2 + k * wh / 4, fz + 0.09); g.add(sl); }
        }
        if (bars) for (let k = -1; k <= 1; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, wh, 0.035), iron); b.position.set(x + k * ww / 4, y, fz + 0.14); g.add(b); }
        if (balcony) {
            const slab = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.9, 0.12, 0.6), light); slab.position.set(x, y - wh / 2 - 0.2, fz + 0.3); g.add(slab);
            const rail = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.8, 0.05, 0.05), iron); rail.position.set(x, y - wh / 2 + 0.55, fz + 0.57); g.add(rail);
            for (let k = 0; k <= 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.03), iron); b.position.set(x - (ww + 0.8) / 2 + k * (ww + 0.8) / 6, y - wh / 2 + 0.2, fz + 0.57); g.add(b); }
            // geranios en el balcón
            for (const sx of [-1, 1]) {
                const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.22, 10), M('#b5523b')); pot.position.set(x + sx * (ww / 2 + 0.2), y - wh / 2 - 0.03, fz + 0.35); g.add(pot);
                const fl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), M('#e8173b')); fl.position.set(x + sx * (ww / 2 + 0.2), y - wh / 2 + 0.18, fz + 0.35); fl.scale.set(1.2, 0.8, 1); g.add(fl);
            }
        }
    };
    windowAt(-3.3, 1.7, 0.7, 0.85, { bars: true, shutters: false });
    windowAt(3.3, 1.7, 0.7, 0.85, { bars: true, shutters: false });
    windowAt(-3.3, 3.95, 0.9, 1.3);
    windowAt(0, 4.0, 1.0, 1.45, { balcony: true, lit: true });
    windowAt(3.3, 3.95, 0.9, 1.3);
    // Ventanita de arco en el hastial (las "golfes")
    const gw = new THREE.Shape(); gw.moveTo(-0.32, 0); gw.lineTo(0.32, 0); gw.lineTo(0.32, 0.5); gw.absarc(0, 0.5, 0.32, 0, Math.PI, false); gw.lineTo(-0.32, 0);
    const gwin = new THREE.Mesh(new THREE.ShapeGeometry(gw, 10), winGlass); gwin.position.set(0, h + 0.55, fz + 0.03); g.add(gwin);
    const gfr = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.5, 14, 1, 0, Math.PI), light); gfr.position.set(0, h + 1.05, fz + 0.035); g.add(gfr);
    // Reloj de sol con su gnomon
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshToonMaterial({ map: sundialTex() }));
    dial.position.set(2.1, 5.55, fz + 0.03); g.add(dial);
    const gnomon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.35), iron); gnomon.position.set(2.1, 5.85, fz + 0.18); gnomon.rotation.x = -0.6; g.add(gnomon);

    // Buganvilla trepando por la esquina derecha
    const leaf = M('#3f7f3a'), pink = M('#e0457b');
    for (let i = 0; i < 9; i++) {
        const y = 0.6 + i * 0.5, x = w / 2 - 0.35 - Math.sin(i * 1.3) * 0.25;
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 - i * 0.015, 0), leaf); b.position.set(x, y, fz + 0.25); b.scale.set(1.2, 0.9, 0.6); g.add(b);
        for (let k = 0; k < 3; k++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), pink); f.position.set(x + (k - 1) * 0.25, y + 0.15 * k - 0.1, fz + 0.45); g.add(f); }
    }

    // Pajar adosado a la izquierda: arco grande con balas de paja dentro y tejado a un agua
    const pw = 5, ph = 3.9, pd = d - 1.6, px = -w / 2 - pw / 2, pz = -0.8;
    const barn = new THREE.Mesh(metricUV(new THREE.BoxGeometry(pw, ph, pd), T), stone); barn.position.set(px, ph / 2, pz); g.add(barn);
    const opening = new THREE.Shape(); opening.moveTo(-1.5, 0); opening.lineTo(1.5, 0); opening.lineTo(1.5, 1.7); opening.absarc(0, 1.7, 1.5, 0, Math.PI, false); opening.lineTo(-1.5, 0);
    const hole = new THREE.Mesh(new THREE.ShapeGeometry(opening, 14), dark); hole.position.set(px, 0.02, pz + pd / 2 + 0.03); g.add(hole);
    const arch = new THREE.Mesh(new THREE.RingGeometry(1.52, 1.85, 16, 1, 0, Math.PI), light); arch.position.set(px, 1.72, pz + pd / 2 + 0.04); g.add(arch);
    const straw = M('#e2bf5a');
    for (const [bx, by] of [[-0.75, 0.4], [0.75, 0.4], [0, 1.15], [-0.75, 1.15], [0.35, 1.9]]) {
        const bale = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.9), straw); bale.position.set(px + bx, by, pz + pd / 2 - 0.5); g.add(bale);
    }
    const proof = new THREE.Mesh(metricUV(new THREE.BoxGeometry(pw + 0.7, 0.18, pd + 0.6), 2), tiles);
    const pang = Math.atan2(0.9, pw);
    proof.rotation.z = pang;   // baja hacia la izquierda
    proof.position.set(px - 0.15, ph + 0.5, pz); g.add(proof);

    g.userData.height = h + ridge;
    g.userData.door = new THREE.Vector3(0, 0, fz);
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
}

export { stoneMat as stoneMaterial, tileMat as tileMaterial, metricUV };

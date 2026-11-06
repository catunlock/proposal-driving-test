// Piezas comunes de los mapas: luz y cielo, texturas procedurales y formas sencillas.
import * as THREE from 'three';
import { toon } from '../../assets.js';

// ---------------------------------------------------------------- luz y cielo
// env: { bg, fog: [near, far], sky, ground, hemi, sun, sunI, sunDir: [x, y, z] }
export function setupEnv(engine, C, env) {
    const scene = engine.scene;
    scene.background = new THREE.Color(env.bg);
    scene.fog = env.fog ? new THREE.Fog(env.bg, env.fog[0], env.fog[1]) : null;
    const hemi = new THREE.HemisphereLight(env.sky || '#ffffff', env.ground || '#8a7a66', env.hemi ?? 1.2);
    const sun = new THREE.DirectionalLight(env.sun || '#fff1d6', env.sunI ?? 2.2);
    const dir = new THREE.Vector3(...(env.sunDir || [0.5, 1, 0.35])).normalize();
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const S = 42;
    Object.assign(sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 200 });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    C.root.add(hemi, sun, sun.target);
    // la sombra sigue al coche (nítida donde se mira)
    C.follow = (p) => {
        sun.position.set(p.x + dir.x * 90, p.y + dir.y * 90, p.z + dir.z * 90);
        sun.target.position.set(p.x, p.y, p.z);
    };
    C.follow(new THREE.Vector3());
    return { hemi, sun };
}

// ---------------------------------------------------------------- texturas
function canvasTex(w, h, draw, { repeat = [1, 1], aniso = 8 } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = aniso;
    return t;
}
const rnd = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();

// Madera de mesa: tablones con vetas
export function woodTex(repeat = [1, 1], { base = '#c98a4b', dark = '#a86b33' } = {}) {
    return canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        const planks = 4;
        for (let p = 0; p < planks; p++) {
            const y0 = p * h / planks;
            g.fillStyle = p % 2 ? 'rgba(255,230,190,0.08)' : 'rgba(90,50,20,0.06)';
            g.fillRect(0, y0, w, h / planks);
            for (let k = 0; k < 26; k++) {
                g.strokeStyle = `rgba(110,60,25,${0.08 + rnd() * 0.12})`;
                g.lineWidth = 1 + rnd() * 2;
                g.beginPath();
                const yy = y0 + rnd() * h / planks;
                g.moveTo(0, yy);
                for (let x = 0; x <= w; x += 32) g.lineTo(x, yy + Math.sin(x * 0.02 + k) * 3 * rnd());
                g.stroke();
            }
            g.fillStyle = dark; g.fillRect(0, y0, w, 3);
        }
    }, { repeat });
}
// Mantel de cuadros (vichy)
export function ginghamTex(repeat = [8, 8], color = '#e8173b') {
    return canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#fffaf2'; g.fillRect(0, 0, w, h);
        g.fillStyle = color; g.globalAlpha = 0.45;
        g.fillRect(0, 0, w / 2, h); g.fillRect(0, 0, w, h / 2);
        g.globalAlpha = 0.35; g.fillRect(0, 0, w / 2, h / 2);
        g.globalAlpha = 1;
    }, { repeat });
}
// Pista de tela: banda clara con costura en los bordes y raya central discontinua
export function clothRoadTex({ base = '#f6e7c8', edge = '#e8173b', center = '#ffffff' } = {}) {
    return canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = base; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,110,60,${rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
        g.fillStyle = edge; g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
        g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.setLineDash([8, 6]);
        for (const x of [14, w - 14]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
        g.setLineDash([]);
        g.fillStyle = center; g.globalAlpha = 0.8; g.fillRect(w / 2 - 3, 0, 6, h * 0.55); g.globalAlpha = 1;
    });
}
// Hoja de cuaderno: cuadrícula azul y margen rojo
export function paperTex(repeat = [6, 6]) {
    return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(70,120,220,0.32)'; g.lineWidth = 1.5;
        for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * h / 8); g.lineTo(w, i * h / 8); g.stroke(); g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, h); g.stroke(); }
    }, { repeat });
}
// Pista dibujada a lápiz: grafito con bordes a rotulador
export function pencilRoadTex() {
    return canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = '#d9dade'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) { g.strokeStyle = `rgba(60,62,70,${0.05 + rnd() * 0.12})`; g.lineWidth = 1; const x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 + rnd() * 20, y + (rnd() - 0.5) * 6); g.stroke(); }
        g.fillStyle = '#26324f'; g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h);
        g.fillStyle = '#ff4d8d'; for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 3, y, 6, 34);
    });
}
// Césped con matas
export function grassTex(repeat = [10, 10]) {
    return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#6cbf4c'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 2200; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(40,120,40,0.25)' : 'rgba(170,230,110,0.22)'; g.fillRect(rnd() * w, rnd() * h, 2, 4 + rnd() * 5); }
    }, { repeat });
}
// Camino de tierra
export function dirtRoadTex() {
    return canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = '#c69a64'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 700; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(120,80,40,0.25)' : 'rgba(240,210,160,0.25)'; const r = 1 + rnd() * 3; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(90,60,30,0.25)'; g.fillRect(w * 0.25, 0, 10, h); g.fillRect(w * 0.75 - 10, 0, 10, h);   // rodadas
    });
}
// Polvo marciano
export function marsTex(repeat = [10, 10]) {
    return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#c4572e'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1800; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(120,40,20,0.18)' : 'rgba(250,160,100,0.18)'; const r = 1 + rnd() * 4; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 7); g.fill(); }
    }, { repeat });
}
export function marsRoadTex() {
    return canvasTex(128, 256, (g, w, h) => {
        g.fillStyle = '#e08a52'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(110,40,20,${rnd() * 0.18})`; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
        g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
        for (let y = 0; y < h; y += 64) { g.fillRect(4, y, 8, 32); g.fillRect(w - 12, y + 32, 8, 32); }
        g.globalAlpha = 1;
    });
}
// Asfalto de pista de prácticas
export function asphaltTex(repeat = [1, 1]) {
    return canvasTex(256, 256, (g, w, h) => {
        g.fillStyle = '#5d6275'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1500; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(30,32,45,0.2)' : 'rgba(200,205,220,0.12)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    }, { repeat });
}

// ---------------------------------------------------------------- formas
const M = new Map();
export const mat = (c, o) => { const k = c + JSON.stringify(o || {}); if (!M.has(k)) M.set(k, toon(c, o)); return M.get(k); };
export function mesh(geo, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, opts, shadow = true } = {}) {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color, opts) : color);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.castShadow = shadow; m.receiveShadow = true;
    return m;
}
export function flatTex(w, d, map, { x = 0, y = 0, z = 0, ry = 0 } = {}) {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, toon('#ffffff', { map }));
    m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true;
    return m;
}
// Mancha irregular (mermelada, leche, charco) en el suelo
export function splat(r, color, { x = 0, y = 0.03, z = 0, opacity = 0.92, seed = 1 } = {}) {
    const s = new THREE.Shape();
    const n = 18;
    for (let i = 0; i <= n; i++) {
        const a = i / n * Math.PI * 2;
        const k = r * (0.8 + 0.25 * Math.sin(a * 3 + seed) + 0.12 * Math.sin(a * 7 + seed * 2));
        const px = Math.cos(a) * k, pz = Math.sin(a) * k;
        i ? s.lineTo(px, pz) : s.moveTo(px, pz);
    }
    const g = new THREE.ShapeGeometry(s, 12); g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.position.set(x, y, z); m.receiveShadow = true;
    return m;
}
// Placa de turbo: flechas que brillan
export function boostPad(w, d) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256;
    const g = c.getContext('2d');
    // fondo translúcido con borde y tres flechas gruesas que brillan
    g.fillStyle = 'rgba(47,111,224,0.35)'; g.fillRect(0, 0, 128, 256);
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 248);
    g.lineJoin = 'round';
    for (let k = 0; k < 3; k++) {
        const y = 52 + k * 72;
        g.beginPath(); g.moveTo(64, y - 36); g.lineTo(118, y + 18); g.lineTo(90, y + 18); g.lineTo(64, y - 8); g.lineTo(38, y + 18); g.lineTo(10, y + 18); g.closePath();
        g.fillStyle = '#7ad7ff'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ffffff'; g.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
    // las flechas apuntan hacia +z local (sentido de la marcha si se gira con el rumbo de la pista)
    geo.rotateY(Math.PI);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: t, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, transparent: true, opacity: 0.95 }));
    m.userData.tex = t;
    return m;
}
// Cuña (rampa) con la cara inclinada hacia +z: largo d, ancho w, alto h
export function wedgeGeo(w, d, h) {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(d / 2, h); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(-Math.PI / 2);          // el perfil (x) pasa a z
    g.computeVertexNormals();
    return g;
}

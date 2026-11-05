// Carga de modelos (Kenney + Tesla), materiales cartoon y utilidades de texturas.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from './config.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const texLoader = new THREE.TextureLoader();

// Rampa de 3 tonos para el sombreado cartoon
const gradientMap = (() => {
    const data = new Uint8Array([90, 170, 255]);
    const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
})();

const toonCache = new Map();
export function toon(color, opts = {}) {
    return new THREE.MeshToonMaterial({ color, gradientMap, ...opts });
}

// Convierte cualquier material a toon, reutilizando el mismo para materiales iguales
export function toToon(mat) {
    if (toonCache.has(mat.uuid)) return toonCache.get(mat.uuid);
    const m = new THREE.MeshToonMaterial({
        color: mat.color ? mat.color.clone() : 0xffffff,
        map: mat.map || null,
        gradientMap,
        transparent: mat.transparent,
        opacity: mat.opacity,
        side: mat.side,
        emissive: mat.emissive ? mat.emissive.clone() : 0x000000,
        emissiveMap: mat.emissiveMap || null
    });
    m.name = mat.name;
    toonCache.set(mat.uuid, m);
    return m;
}

const modelCache = new Map();
let progressCb = null;
let pending = 0, done = 0;
export function onLoadProgress(cb) { progressCb = cb; }
function tick(delta) {
    if (delta > 0) pending += delta; else done++;
    if (progressCb) progressCb(done, pending);
}

// key: 'nature/tree_default', 'city/building-a', 'car/cone'... o 'tesla'
export function loadModel(key) {
    if (modelCache.has(key)) return modelCache.get(key);
    tick(1);
    const kit = key.split('/')[0];
    const p = loader.loadAsync(`assets/models/${key}.glb`).then(gltf => {
        const root = gltf.scene;
        root.userData.animations = gltf.animations || [];
        const s = CONFIG.modelScale[kit] || 1;
        root.scale.setScalar(s);
        root.traverse(o => {
            if (o.isMesh) {
                o.material = Array.isArray(o.material) ? o.material.map(toToon) : toToon(o.material);
                o.castShadow = true;
                o.receiveShadow = true;
            }
        });
        tick(-1);
        return root;
    }).catch(err => {
        console.warn('No se pudo cargar el modelo', key, err);
        tick(-1);
        return new THREE.Group();
    });
    modelCache.set(key, p);
    return p;
}

export async function model(key) {
    const src = await loadModel(key);
    let skinned = false;
    src.traverse(o => { if (o.isSkinnedMesh) skinned = true; });
    const c = skinned ? cloneSkinned(src) : src.clone(true);
    c.userData.animations = src.userData.animations;
    return c;
}

// Altura real (en la escena) de un modelo, útil para apilar cosas encima
export function sizeOf(obj) {
    return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
}

const imgCache = new Map();
export function imageTexture(src) {
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise(resolve => {
        texLoader.load(src, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; resolve(t); },
            undefined, () => resolve(null));
    });
    imgCache.set(src, p);
    return p;
}

// Textura con texto dibujado en canvas (carteles, letreros, marquesinas)
export function textTexture(text, {
    width = 512, height = 128, bg = '#ffd23f', fg = '#1b1b2f', font = 'Fredoka', weight = 700,
    size = null, border = 10, borderColor = '#1b1b2f', radius = 28, lines = null, stroke = null
} = {}) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    const g = c.getContext('2d');
    if (bg) {
        g.fillStyle = borderColor;
        roundRect(g, 0, 0, width, height, radius); g.fill();
        g.fillStyle = bg;
        roundRect(g, border, border, width - border * 2, height - border * 2, Math.max(0, radius - border)); g.fill();
    }
    const rows = lines || [text];
    const fs = size || Math.min(height * 0.62 / rows.length, (width * 1.7) / Math.max(...rows.map(r => r.length)));
    g.font = `${weight} ${fs}px ${font}, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    rows.forEach((r, i) => {
        const y = height / 2 + (i - (rows.length - 1) / 2) * fs * 1.1;
        if (stroke) { g.lineWidth = fs * 0.14; g.strokeStyle = stroke; g.strokeText(r, width / 2, y); }
        g.fillStyle = fg;
        g.fillText(r, width / 2, y);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
}

function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

// Plano con texto, listo para colocar como letrero
export function textPlane(text, worldWidth, opts = {}) {
    const tex = textTexture(text, opts);
    const aspect = (opts.height || 128) / (opts.width || 512);
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(worldWidth, worldWidth * aspect),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
    );
    return mesh;
}

// Forma de corazón reutilizable (extruida, redondeada)
let heartGeo = null;
export function heartGeometry() {
    if (heartGeo) return heartGeo;
    const s = new THREE.Shape();
    s.moveTo(0, -0.9);
    s.bezierCurveTo(-0.15, -0.75, -1, -0.2, -1, 0.3);
    s.bezierCurveTo(-1, 0.85, -0.35, 1.05, 0, 0.6);
    s.bezierCurveTo(0.35, 1.05, 1, 0.85, 1, 0.3);
    s.bezierCurveTo(1, -0.2, 0.15, -0.75, 0, -0.9);
    heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.16, bevelSegments: 4, curveSegments: 16 });
    heartGeo.center();
    return heartGeo;
}

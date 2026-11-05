// El final: estuche del anillo en el mirador y la cajita del corazón debajo del mueble de la tele.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, textPlane } from './assets.js';
import { ease } from './effects.js';
import { CONFIG } from './config.js';

// Destello de 4 puntas (textura compartida) para los brillos del anillo y los regalos
let starTex = null;
function starTexture() {
    if (starTex) return starTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 30);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,246,208,.55)'); grd.addColorStop(1, 'rgba(255,246,208,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(32, 2); g.lineTo(35, 29); g.lineTo(62, 32); g.lineTo(35, 35); g.lineTo(32, 62); g.lineTo(29, 35); g.lineTo(2, 32); g.lineTo(29, 29); g.closePath(); g.fill();
    starTex = new THREE.CanvasTexture(c);
    starTex.colorSpace = THREE.SRGBColorSpace;
    return starTex;
}
function sparkles(n, radius, color = 0xfff6d0) {
    const group = new THREE.Group();
    const list = [];
    for (let i = 0; i < n; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
        const a = (i / n) * Math.PI * 2, r = radius * (0.75 + Math.random() * 0.45);
        sp.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.9, (Math.random() - 0.5) * 0.2);
        sp.userData.phase = Math.random() * Math.PI * 2;
        sp.userData.size = 0.12 + Math.random() * 0.12;
        group.add(sp); list.push(sp);
    }
    group.visible = false;
    return {
        group,
        update(t, k = 1) {
            for (const sp of list) {
                const w = Math.max(0, Math.sin(t * 2.6 + sp.userData.phase));
                sp.material.opacity = w * k;
                sp.scale.setScalar(sp.userData.size * (0.5 + w));
            }
        }
    };
}

// Halo suave (disco radial aditivo) para que el anillo destaque
let haloTex = null;
function haloTexture() {
    if (haloTex) return haloTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(0.45, 'rgba(255,240,215,.45)'); grd.addColorStop(1, 'rgba(255,240,215,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    haloTex = new THREE.CanvasTexture(c);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    return haloTex;
}

// Estuche de terciopelo con el anillo, sobre el pedestal del mirador
export function buildRingBox(scene, at) {
    const g = new THREE.Group();
    g.position.copy(at);
    g.scale.setScalar(1.9);
    const velvet = toon('#a3123a');
    const base = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.3, 0.62, 3, 0.05), velvet);
    base.position.y = 0.15;
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.06, 0.5, 2, 0.025), toon('#f6e7ee'));
    cushion.position.y = 0.31;
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.3), toon('#d9c3cf'));
    slot.position.y = 0.345;
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.3, -0.31);
    const lid = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.2, 0.62, 3, 0.05), velvet);
    lid.position.set(0, 0.1, 0.31);
    const lidSatin = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.52), toon('#fbeef4'));
    lidSatin.rotation.x = Math.PI / 2; lidSatin.position.set(0, -0.005, 0.31);
    hinge.add(lid, lidSatin);

    // Anillo: banda dorada, garras y diamante
    const ring = new THREE.Group();
    const gold = toon('#ffd54a', { emissive: new THREE.Color('#a8790c'), emissiveIntensity: 0.55 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.032, 14, 40), gold);
    const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.06, 8), gold);
    setting.position.y = 0.17;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), new THREE.MeshBasicMaterial({ color: 0xeaf8ff, toneMapped: false }));
    gem.position.y = 0.245;
    gem.scale.y = 1.25;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(0.95);
    halo.position.set(0, 0.06, -0.08);
    ring.add(halo, band, setting, gem);
    ring.position.y = 0.42;
    const spark = sparkles(9, 0.32);
    spark.group.position.y = 0.06;
    ring.add(spark.group);
    g.add(base, cushion, slot, hinge, ring);
    ring.visible = false;
    scene.add(g);

    return {
        group: g,
        // El frente del estuche (y el anillo) miran hacia la cámara
        aim(pos) { g.rotation.y = Math.atan2(pos.x - g.position.x, pos.z - g.position.z); },
        async open(fx) {
            ring.visible = true;
            ring.scale.setScalar(0.001);
            await fx.tween(1.4, e => { hinge.rotation.x = -e * 1.85; }, ease.back);
            spark.group.visible = true;
            fx.tween(1.4, e => {
                ring.scale.setScalar(Math.max(0.001, e * 1.55));   // grande: se ve bien entre las columnas
                ring.position.y = 0.42 + e * 0.5;
                halo.material.opacity = e * 0.6;
            }, ease.back);
            fx.every((dt, t) => {
                ring.rotation.y = Math.sin(t * 0.9) * 0.4;
                ring.position.y = 0.92 + Math.sin(t * 1.6) * 0.025;
                gem.rotation.y = -t * 1.5;
                spark.update(t);
                return true;
            });
        }
    };
}

// ---------------------------------------------------------------------------
// Plató final: el mueble de la tele de casa, de noche, con la cajita roja con forma de corazón
// escondida debajo. Al abrirla salen la libreta, la pluma y la tinta.
// Coordenadas locales: x → derecha, y arriba, +z hacia la cámara. (La API se sigue llamando
// "glovebox" porque antes era la guantera del coche.)
// ---------------------------------------------------------------------------
function heartShape(s) {
    const h = new THREE.Shape();
    h.moveTo(0, -0.5 * s);
    h.bezierCurveTo(-0.15 * s, -0.36 * s, -0.62 * s, -0.12 * s, -0.62 * s, 0.2 * s);
    h.bezierCurveTo(-0.62 * s, 0.5 * s, -0.3 * s, 0.64 * s, 0, 0.38 * s);
    h.bezierCurveTo(0.3 * s, 0.64 * s, 0.62 * s, 0.5 * s, 0.62 * s, 0.2 * s);
    h.bezierCurveTo(0.62 * s, -0.12 * s, 0.15 * s, -0.36 * s, 0, -0.5 * s);
    return h;
}
// Corazón macizo tumbado (la punta mira a la cámara), de altura d sobre y = 0
function heartSlab(s, d, mat) {
    const geo = new THREE.ExtrudeGeometry(heartShape(s), { depth: d, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 18 });
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, mat);
}

export function buildGlovebox(scene) {
    const g = new THREE.Group();
    g.position.set(0, 140, 0);
    const M = (c, o) => toon(c, o);

    // Salón: suelo de madera, pared y alfombra
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 10).rotateX(-Math.PI / 2), M('#b58157'));
    floor.position.set(0, 0, 1.5);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 7), M('#e9dccb'));
    wall.position.set(0, 3.5, -1.3);
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(16, 0.18, 0.06), M('#fbf6ee'));
    skirting.position.set(0, 0.09, -1.27);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 40).rotateX(-Math.PI / 2), M('#f3c6d4'));
    rug.scale.set(1.5, 1, 0.8); rug.position.set(0.8, 0.01, 2.4);

    // Mueble de la tele, bajito y con patas (debajo queda el hueco de la cajita)
    const LEG = 0.82, CW = 7.4, CD = 1.45, CH = 0.95;
    const cab = new THREE.Mesh(new RoundedBoxGeometry(CW, CH, CD, 3, 0.06), M('#8a5a3b'));
    cab.position.set(0.6, LEG + CH / 2, -0.45);
    const topBoard = new THREE.Mesh(new RoundedBoxGeometry(CW + 0.12, 0.08, CD + 0.08, 2, 0.03), M('#6e452c'));
    topBoard.position.set(0.6, LEG + CH + 0.04, -0.45);
    const drawers = [];
    for (const dx of [-2.4, 0, 2.4]) {
        const d = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.7, 0.05, 2, 0.02), M('#9c6a48'));
        d.position.set(0.6 + dx, LEG + CH / 2, -0.45 + CD / 2 + 0.02);
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M('#e8c25a'));
        knob.position.set(0.6 + dx, LEG + CH / 2, -0.45 + CD / 2 + 0.07);
        drawers.push(d, knob);
    }
    const legs = [];
    for (const lx of [-2.9, 4.1]) for (const lz of [-1.05, 0.15]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, LEG, 8), M('#4b2f1d'));
        l.position.set(lx, LEG / 2, lz); l.rotation.z = lx < 0 ? 0.08 : -0.08;
        legs.push(l);
    }
    // La tele, con la "ficha técnica" en pantalla
    const tvY = LEG + CH + 0.08;
    // colgada en la pared, a la derecha y por encima de los regalos (la tarjeta va a la izquierda)
    const TVX = 2.1, TVY = 3.95;
    const tv = new THREE.Mesh(new RoundedBoxGeometry(3.2, 1.85, 0.12, 3, 0.05), M('#14161f'));
    tv.position.set(TVX, TVY, -1.2);
    const tvStand = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.06), M('#2b2e3b'));
    tvStand.position.set(TVX, TVY, -1.27);
    const tvNeck = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), M('#2b2e3b'));
    const screenFace = textPlane('', 3.0, { width: 740, height: 420, bg: '#0e1a2f', fg: '#7ad7ff', lines: ['Inspección técnica', '✔ Aprobada', '💍 Comprometidos'], border: 0, radius: 12 });
    screenFace.position.set(TVX, TVY, -1.13);
    // Plantita y vela encima del mueble
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.36, 16), M('#f3eee6'));
    pot.position.set(-2.2, tvY + 0.18, -0.6);
    const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), M('#4f9a55'));
    plant.position.set(-2.2, tvY + 0.62, -0.6); plant.scale.y = 1.2;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 16), M('#fff8e7'));
    candle.position.set(-1.2, tvY + 0.15, -0.35);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b, toneMapped: false }));
    flame.scale.y = 1.8; flame.position.set(-1.2, tvY + 0.38, -0.35);

    // La cajita roja con forma de corazón, escondida debajo del mueble
    const GX = 2.2;
    const box = new THREE.Group();
    box.position.set(GX, 0, -0.45);
    const red = M('#d0103a', { emissive: new THREE.Color('#7a0820'), emissiveIntensity: 0.25 });
    const BS = 1.5, BH = 0.42;
    const base = heartSlab(BS, BH, red);
    const inside = heartSlab(BS * 0.86, 0.02, M('#fbe3ec'));
    inside.position.y = BH - 0.04;
    const hinge = new THREE.Group();            // tapa, con bisagra en la parte de atrás del corazón
    hinge.position.set(0, BH + 0.03, -0.42 * BS);
    const lid = heartSlab(BS * 1.04, 0.13, red);
    lid.position.set(0, 0, 0.42 * BS);
    const ribbonMat = M('#ffd54a', { emissive: new THREE.Color('#a8790c'), emissiveIntensity: 0.4 });
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, BS * 1.05), ribbonMat);
    ribbon.position.set(0, 0.175, 0.42 * BS + 0.02);
    const bow = new THREE.Group();
    for (const sx of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 18), ribbonMat);
        loop.rotation.set(Math.PI / 2, 0, sx * 0.6); loop.position.x = sx * 0.1; loop.scale.set(1, 0.6, 1);
        bow.add(loop);
    }
    bow.position.set(0, 0.22, 0.42 * BS - 0.1);
    hinge.add(lid, ribbon, bow);
    box.add(base, inside, hinge);
    const glowBack = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd58a, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glowBack.position.y = BH + 0.01;
    box.add(glowBack);
    const BOX_OUT = 2.3;      // la cajita sale de debajo del mueble hasta aquí (z): bien fuera, la tapa no lo toca al abrir
    // --- Los regalos: libreta, pluma y tintero -------------------------------
    // Libreta de piel con goma y las iniciales en dorado
    const book = new THREE.Group();
    const cover = new THREE.Mesh(new RoundedBoxGeometry(0.95, 1.25, 0.16, 2, 0.04), M('#5a1830'));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.18, 0.12), M('#fff8e7'));
    pages.position.x = 0.05;
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.27, 0.18), M('#1b1b2f'));
    strap.position.x = 0.3;
    const mono = textPlane(CONFIG.coupleInitials || 'C ♥ C', 0.62, { width: 512, height: 220, bg: null, fg: '#e8c25a', font: 'Playfair Display', weight: 700, border: 0 });
    mono.position.z = 0.085;
    book.add(cover, pages, strap, mono);
    // Pluma estilográfica
    const pen = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 16), M('#1b1b2f'));
    const capEnd = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), M('#1b1b2f'));
    capEnd.position.y = 0.5;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.06, 16), M('#e8c25a'));
    band.position.y = 0.12;
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.04), M('#e8c25a'));
    clip.position.set(0, 0.3, 0.075);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.18, 16), M('#e8c25a'));
    grip.position.y = -0.59;
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 12), M('#e8c25a'));
    nib.rotation.x = Math.PI; nib.position.y = -0.78;
    pen.add(barrel, capEnd, band, clip, grip, nib);
    // Tintero redondo de cristal con tinta azul
    const ink = new THREE.Group();
    const prof = [[0, 0], [0.26, 0], [0.3, 0.06], [0.3, 0.3], [0.24, 0.4], [0.12, 0.44], [0.11, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshToonMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.55 }));
    const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.26, 24), M('#1f3f9f'));
    liquid.position.y = 0.16;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 16), M('#1b1b2f'));
    cap.position.y = 0.57;
    const label = textPlane('♥', 0.34, { width: 256, height: 160, bg: '#fff8e7', fg: '#d6336c', border: 0, radius: 16 });
    label.position.set(0, 0.2, 0.305);
    ink.add(bottle, liquid, cap, label);

    const gifts = [
        { obj: book, to: new THREE.Vector3(GX, 1.95, BOX_OUT + 0.95), rot: [0.15, -0.35, 0.05], scale: 1 },
        { obj: pen, to: new THREE.Vector3(GX - 1.25, 1.85, BOX_OUT + 0.85), rot: [0.2, 0, -0.75], scale: 1 },
        { obj: ink, to: new THREE.Vector3(GX + 1.2, 1.5, BOX_OUT + 0.85), rot: [0.1, -0.4, 0], scale: 1.15 }
    ];
    const giftGlow = sparkles(14, 1.25);
    giftGlow.group.position.set(GX, 1.85, BOX_OUT + 0.8);
    for (const gf of gifts) {
        gf.obj.position.set(GX, 0.3, BOX_OUT);
        gf.obj.scale.setScalar(0.001);
        gf.obj.visible = false;
        g.add(gf.obj);
    }

    // Luces: cálida de la cajita y relleno suave del salón (creadas desde el principio)
    const lamp = new THREE.PointLight(0xffd8a0, 0, 9, 1.5);
    lamp.position.set(GX, 1.4, BOX_OUT + 1.2);
    const fill = new THREE.PointLight(0xffe2c8, 0, 24, 1.2);
    fill.position.set(-1.5, 4.5, 7);
    g.add(floor, wall, skirting, rug, cab, topBoard, ...drawers, ...legs, tv, tvStand, tvNeck, screenFace, pot, plant, candle, flame, box, lamp, fill, giftGlow.group);
    scene.add(g);

    const W = (x, y, z) => new THREE.Vector3(x, y, z).add(g.position);
    return {
        group: g,
        // Encuadre: en horizontal la tarjeta va a la izquierda → la cajita a la derecha; en vertical, arriba
        camera(aspect) {
            if (aspect < 0.8) return { pos: W(GX - 0.1, 3.9, 11.5), look: W(GX, 2.3, 0.4) };
            return { pos: W(0.0, 3.4, 10.6), look: W(1.15, 2.0, 0.4) };
        },
        show() { fill.intensity = 12; lamp.intensity = 2; },
        async open(fx) {
            if (window.sfx) window.sfx.tap();
            // Sale de debajo del mueble, y se abre la tapa
            const z0 = box.position.z;
            await fx.tween(1.0, e => { box.position.z = z0 + (BOX_OUT - z0) * e; }, ease.out || (e => e));
            await fx.tween(1.2, e => {
                hinge.rotation.x = -e * 1.8;       // la tapa se abre hacia atrás (~100°), sin tocar el mueble
                lamp.intensity = 2 + e * 10;
                glowBack.material.opacity = e;
            }, ease.back);
            giftGlow.group.visible = true;
            // Salen uno a uno de la cajita y se quedan flotando delante
            for (const [i, gf] of gifts.entries()) {
                gf.obj.visible = true;
                const from = gf.obj.position.clone();
                fx.tween(1.1, e => {
                    gf.obj.scale.setScalar(Math.max(0.001, e * gf.scale));
                    gf.obj.position.lerpVectors(from, gf.to, e);
                    gf.obj.rotation.set(gf.rot[0] * e, gf.rot[1] * e + (1 - e) * 3, gf.rot[2] * e);
                }, ease.back);
                if (window.sfx) setTimeout(() => window.sfx.pop(), 200);
                await new Promise(r => setTimeout(r, 450 + i * 50));
            }
            await new Promise(r => setTimeout(r, 700));
            fx.every((dt, t) => {
                gifts.forEach((gf, i) => {
                    gf.obj.position.y = gf.to.y + Math.sin(t * 1.4 + i * 1.7) * 0.06;
                    gf.obj.rotation.y = gf.rot[1] + Math.sin(t * 0.8 + i) * 0.25;
                });
                giftGlow.update(t, 0.8);
                lamp.intensity = 12 + Math.sin(t * 3) * 1.5;
                return true;
            });
        }
    };
}

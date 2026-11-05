// ============================================================================
//  OBJETOS 3D PARA LAS PREGUNTAS SIN IMAGEN
// ============================================================================
// En las preguntas del coche (y las de compromiso) no hay foto: en lugar de la señal
// aparece una pequeña maqueta 3D del contenido de la pregunta. Cada pregunta indica su
// objeto con el campo "prop" (data/practical-questions.js). Si no tiene, no sale nada.
//
// Cada objeto es una función async (engine) => { group, update?(dt, t) }.
// El grupo mira hacia +Z (hacia la cámara) y mide unos 2–3 unidades de alto.
// ============================================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { model, toon, textPlane, textTexture, heartGeometry } from './assets.js';
import { parkedTesla } from './car.js';

const mats = new Map();
const M = (c, o) => { const k = c + JSON.stringify(o || {}); if (!mats.has(k)) mats.set(k, toon(c, o)); return mats.get(k); };
const glow = (c, opacity = 1) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: opacity < 1, opacity });
const box = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? M(c) : c); return m; };
const cyl = (rt, rb, h, c, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof c === 'string' ? M(c) : c);

// Peana redonda común
function pedestal(r = 1.6, color = '#ffffff') {
    const g = new THREE.Group();
    const base = cyl(r, r + 0.1, 0.3, color, 40); base.position.y = 0.15; g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.05, 8, 48), glow('#ff7eb3'));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
    return g;
}

// Rayo extruido
function bolt(size = 1, color = '#ffd23f') {
    const s = new THREE.Shape();
    s.moveTo(0.1, 1); s.lineTo(-0.35, 0.05); s.lineTo(0, 0.05); s.lineTo(-0.15, -1); s.lineTo(0.4, 0.15); s.lineTo(0.05, 0.15); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 });
    geo.center();
    const m = new THREE.Mesh(geo, M(color, { emissive: new THREE.Color(color), emissiveIntensity: 0.5 }));
    m.scale.setScalar(size);
    return m;
}

function screenPanel(w, h, lines, { bg = '#0e1a2f', fg = '#7ad7ff', size = null } = {}) {
    const g = new THREE.Group();
    g.add(box(w + 0.16, h + 0.16, 0.1, '#1b1b2f'));
    const tex = textTexture('', { width: 800, height: Math.round(800 * h / w), bg, fg, lines, border: 0, radius: 16, size });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    face.position.z = 0.056;
    g.add(face);
    return g;
}

export const PROPS = {
    // Frunk: Tesla en plataforma giratoria con el capó delantero abierto y la compra dentro
    async frunk() {
        const g = new THREE.Group();
        g.add(pedestal(1.9));
        const turn = new THREE.Group(); turn.position.y = 0.3; g.add(turn);
        // Modelo completo (el ligero se ve roto de cerca)
        const car = await parkedTesla('#f4f6fb', { full: true });
        car.scale.multiplyScalar(0.95);
        turn.add(car);
        // Medidas del modelo (espacio local del coche, morro hacia +Z): el capó va de la base
        // del parabrisas (z 0,8) al morro (z 1,17) y baja de y 0,49 a 0,40
        const Z0 = 0.8, Z1 = 1.17, XW = 0.46, Y0 = 0.465, SLOPE = 0.2308;
        // Recortamos el capó del modelo con planos (sólo en este coche): se queda el hueco del frunk
        const local = [
            new THREE.Plane(new THREE.Vector3(0, 0, -1), Z0),
            new THREE.Plane(new THREE.Vector3(0, 0, 1), -Z1),
            new THREE.Plane(new THREE.Vector3(1, 0, 0), -XW),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), -XW),
            new THREE.Plane(new THREE.Vector3(0, -1, -SLOPE).normalize(), 0)
        ];
        { const n = Math.hypot(1, SLOPE); local[4].constant = (Y0 + SLOPE * Z0) / n; }
        const world = local.map(p => p.clone());
        const matCache = new Map();
        car.traverse(o => {
            if (!o.isMesh) return;
            if (!matCache.has(o.material)) {
                const m = o.material.clone();
                m.clippingPlanes = world; m.clipIntersection = true; m.side = THREE.DoubleSide;
                matCache.set(o.material, m);
            }
            o.material = matCache.get(o.material);
        });
        // Cubeta del maletero delantero, con la compra dentro
        const tub = new THREE.Group();
        const tubMat = M('#2b2e3b');
        const depth = 0.26, yTop = Y0 - 0.02, w = XW * 2 - 0.04, len = Z1 - Z0 - 0.02;
        const bottom = box(w, 0.02, len, tubMat); bottom.position.set(0, yTop - depth, (Z0 + Z1) / 2); tub.add(bottom);
        for (const sx of [-1, 1]) { const wall = box(0.02, depth, len, tubMat); wall.position.set(sx * w / 2, yTop - depth / 2, (Z0 + Z1) / 2); tub.add(wall); }
        for (const z of [Z0 + 0.01, Z1 - 0.01]) { const wall = box(w, depth, 0.02, tubMat); wall.position.set(0, yTop - depth / 2 - (z > 1 ? SLOPE * (Z1 - Z0) : 0), z); tub.add(wall); }
        for (const [x, h] of [[-0.2, 0.36], [0.16, 0.3]]) {
            const b = await model('food/bag');
            const bh = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).y || 1;
            b.scale.multiplyScalar(h / bh); b.position.set(x, yTop - depth + 0.01, (Z0 + Z1) / 2); b.rotation.y = x * 2;
            tub.add(b);
        }
        car.add(tub);
        // Tapa con la forma curvada del capó, con la bisagra junto al parabrisas
        const LL = Math.hypot(Z1 - Z0, SLOPE * (Z1 - Z0));
        const lidGeo = new THREE.BoxGeometry(XW * 2, 0.025, LL, 8, 1, 2);
        const lp = lidGeo.attributes.position;
        for (let i = 0; i < lp.count; i++) { const x = lp.getX(i); lp.setY(i, lp.getY(i) - 0.035 * (x / XW) ** 2); }
        lidGeo.computeVertexNormals();
        const lid = new THREE.Mesh(lidGeo, M('#f4f6fb'));
        lid.position.z = LL / 2;
        const hinge = new THREE.Group();
        hinge.position.set(0, Y0 + 0.03, Z0);
        hinge.add(lid);
        car.add(hinge);
        const rest = Math.atan(SLOPE);       // inclinación del capó cerrado
        const sign = textPlane('FRUNK', 1.4, { width: 512, height: 160, bg: '#ffd23f', fg: '#1b1b2f', font: 'Bangers', weight: 400, border: 8 });
        sign.position.set(0, 2.1, 0); g.add(sign);
        return {
            group: g,
            update: (dt, t) => {
                turn.rotation.y = 0.8 + Math.sin(t * 0.5) * 0.9;
                sign.position.y = 2.1 + Math.sin(t * 2) * 0.06;
                // se abre y se cierra despacio, como enseñándolo
                const open = 0.5 + 0.5 * Math.sin(t * 0.9);
                hinge.rotation.x = rest - (0.25 + open * 0.95);
                car.updateMatrixWorld(true);
                local.forEach((p, i) => world[i].copy(p).applyMatrix4(car.matrixWorld));
            }
        };
    },

    // Frenada regenerativa: batería que se llena con una flecha que gira y un rayo
    async regen() {
        const g = new THREE.Group();
        g.add(pedestal(1.3));
        const batt = new THREE.Group(); batt.position.y = 1.2; g.add(batt);
        const shell = box(1.9, 1.0, 0.7, M('#e9ecf2', { transparent: true, opacity: 0.55 })); batt.add(shell);
        const cap = box(0.2, 0.36, 0.36, '#9aa3b5'); cap.position.x = 1.05; batt.add(cap);
        const cells = [];
        for (let i = 0; i < 4; i++) { const c = box(0.38, 0.78, 0.5, glow('#3ddc84')); c.position.x = -0.66 + i * 0.44; batt.add(c); cells.push(c); }
        const arrow = new THREE.Group(); arrow.position.y = 1.2; g.add(arrow);
        const arc = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.07, 8, 40, Math.PI * 1.6), glow('#3ddc84'));
        arrow.add(arc);
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 10), glow('#3ddc84'));
        head.position.set(1.45, 0, 0); head.rotation.z = Math.PI; arrow.add(head);
        const b = bolt(0.5); b.position.set(0, 2.55, 0); g.add(b);
        return { group: g, update: (dt, t) => {
            const k = (t * 0.6) % 1.4;
            cells.forEach((c, i) => { c.visible = k * 4 > i; });
            arrow.rotation.z = -t * 1.5;
            b.rotation.y = t;
        } };
    },

    // Supercharger: poste V4 en miniatura con un rayo flotando
    async supercharger() {
        const g = new THREE.Group();
        g.add(pedestal(1.2));
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.9, 6, 16), M('#f4f5f7'));
        body.scale.set(1, 1, 0.62); body.position.y = 1.6; g.add(body);
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.5), glow('#e31937')); strip.position.set(0, 1.65, 0.205); g.add(strip);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.22), glow('#7ad7ff')); scr.position.set(0, 2.2, 0.204); g.add(scr);
        const cable = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 20, Math.PI * 1.4), M('#1e2130'));
        cable.rotation.y = Math.PI / 2; cable.position.set(0.38, 1.1, 0.05); g.add(cable);
        const b = bolt(0.45); b.position.set(0, 3.3, 0); g.add(b);
        return { group: g, update: (dt, t) => { b.rotation.y = t * 1.5; b.position.y = 3.3 + Math.sin(t * 2) * 0.1; } };
    },

    // Modo Centinela: un ojo que vigila y graba
    async sentry() {
        const g = new THREE.Group();
        g.add(pedestal(1));
        const pole = cyl(0.08, 0.1, 1.4, '#9aa3b5', 8); pole.position.y = 1; g.add(pole);
        const eye = new THREE.Group(); eye.position.y = 2.2; g.add(eye);
        eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), M('#ffffff')));
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), glow('#e31937')); iris.position.z = 0.42; iris.scale.z = 0.5; eye.add(iris);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), M('#111111')); pupil.position.z = 0.57; pupil.scale.z = 0.4; eye.add(pupil);
        const rec = textPlane('● REC', 0.9, { width: 400, height: 140, bg: '#1b1b2f', fg: '#ff3b3b', border: 0 });
        rec.position.set(0, 3.15, 0); g.add(rec);
        return { group: g, update: (dt, t) => { eye.rotation.y = Math.sin(t * 0.9) * 0.6; eye.rotation.x = Math.sin(t * 1.3) * 0.15; rec.visible = Math.floor(t * 2) % 2 === 0; } };
    },

    // Marcha D: pantalla con P R N D y un dedo que desliza hacia arriba
    async drive() {
        const g = new THREE.Group();
        g.add(pedestal(1.2));
        const scr = screenPanel(1.3, 2.0, ['P', 'R', 'N', 'D ⬆'], { size: 150 });
        scr.position.y = 1.55; scr.rotation.x = -0.12; g.add(scr);
        const finger = new THREE.Group();
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 4, 10), M('#f1c3a2'));
        f.rotation.x = Math.PI / 2 - 0.4; finger.add(f);
        finger.position.set(0.35, 1.0, 0.4); g.add(finger);
        return { group: g, update: (dt, t) => { const k = (t * 0.7) % 1; finger.position.y = 0.95 + k * 1.2; finger.position.z = 0.42 + Math.sin(k * Math.PI) * 0.05; } };
    },

    // Puerta: panel de puerta con el botón de apertura iluminado
    async door() {
        const g = new THREE.Group();
        g.add(pedestal(1.3));
        const panel = box(1.9, 1.3, 0.16, '#f4f5f7'); panel.position.y = 1.2; g.add(panel);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.75), M('#25324f')); win.position.set(0, 2.25, 0); g.add(win);
        const frame = box(1.9, 0.08, 0.18, '#1b1b2f'); frame.position.set(0, 1.86, 0); g.add(frame);
        const trim = box(1.5, 0.12, 0.05, '#3b3f4f'); trim.position.set(0, 1.5, 0.1); g.add(trim);
        const btn = cyl(0.13, 0.13, 0.06, glow('#4cc9f0'), 20); btn.rotation.x = Math.PI / 2; btn.position.set(0.55, 1.62, 0.12); g.add(btn);
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 10), glow('#ffd23f'));
        arrow.rotation.z = Math.PI / 2; arrow.position.set(0.95, 1.62, 0.18); g.add(arrow);
        return { group: g, update: (dt, t) => { const s = 1 + Math.sin(t * 5) * 0.15; btn.scale.set(s, 1, s); arrow.position.x = 0.95 + Math.sin(t * 5) * 0.08; } };
    },

    // Intermitentes: volante con dos botones que parpadean
    async signals() {
        const g = new THREE.Group();
        g.add(pedestal(1.3));
        const wheel = new THREE.Group(); wheel.position.y = 1.55; g.add(wheel);
        wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 12, 40), M('#1e2130')));
        const hub = cyl(0.3, 0.3, 0.14, '#2a2d3a', 20); hub.rotation.x = Math.PI / 2; wheel.add(hub);
        for (const a of [0, Math.PI, -Math.PI / 2]) { const sp = box(0.75, 0.12, 0.08, '#2a2d3a'); sp.position.set(Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0); sp.rotation.z = a; wheel.add(sp); }
        const mkArrow = (dir) => { const c = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.22, 3), glow('#ff9214')); c.rotation.z = dir * Math.PI / 2; return c; };
        const left = mkArrow(1), right = mkArrow(-1);
        left.position.set(-0.55, 0.12, 0.1); right.position.set(-0.55, -0.12, 0.1);
        wheel.add(left, right);
        const col = cyl(0.1, 0.12, 1.1, '#3b3f4f', 10); col.position.set(0, 0.85, -0.3); col.rotation.x = 0.5; g.add(col);
        return { group: g, update: (dt, t) => { const on = Math.floor(t * 2.5) % 2 === 0; left.visible = on; right.visible = !on; wheel.rotation.z = Math.sin(t * 0.8) * 0.15; } };
    },

    // Puerto de carga: el coche de espaldas con el puerto trasero izquierdo encendido
    async chargeport() {
        const g = new THREE.Group();
        g.add(pedestal(1.9));
        const turn = new THREE.Group(); turn.position.y = 0.3; g.add(turn);
        const car = await parkedTesla('#f4f6fb');
        turn.add(car);
        car.rotation.y = Math.PI + 0.7;   // de espaldas, enseñando el lado izquierdo
        const port = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), glow('#3ddc84', 0.95));
        port.position.set(0.56, 0.64, -CONFIG.car.length / 2 + 0.14);
        car.add(port);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 24), glow('#3ddc84'));
        ring.position.copy(port.position); ring.rotation.y = Math.PI / 2; car.add(ring);
        return { group: g, update: (dt, t) => { const s = 1 + Math.sin(t * 4) * 0.25; port.scale.setScalar(s); ring.scale.setScalar(1 + ((t * 0.8) % 1) * 1.5); ring.material.opacity = 1 - ((t * 0.8) % 1); ring.material.transparent = true; } };
    },

    // Tarjeta llave junto al pilar central
    async keycard() {
        const g = new THREE.Group();
        g.add(pedestal(1.2));
        const pillar = box(0.45, 2.3, 0.35, '#1e2130'); pillar.position.set(-0.45, 1.45, 0); g.add(pillar);
        const cam = cyl(0.07, 0.07, 0.05, glow('#4cc9f0'), 12); cam.rotation.x = Math.PI / 2; cam.position.set(-0.45, 2.2, 0.18); g.add(cam);
        const card = new THREE.Group();
        card.add(box(1.0, 0.62, 0.03, '#1b1b2f'));
        const lbl = textPlane('KEY CARD', 0.8, { width: 512, height: 160, bg: '#1b1b2f', fg: '#ffffff', border: 0, font: 'Fredoka', weight: 700 });
        lbl.position.z = 0.02; card.add(lbl);
        card.position.set(0.55, 1.7, 0.3); g.add(card);
        const halo = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.28, 24), glow('#4cc9f0', 0.8)); halo.position.set(-0.45, 1.6, 0.19); g.add(halo);
        return { group: g, update: (dt, t) => {
            const k = (Math.sin(t * 1.4) + 1) / 2;
            card.position.x = 0.75 - k * 0.95; card.rotation.y = -0.6 + k * 0.6;
            halo.visible = k > 0.85; halo.scale.setScalar(1 + (t * 2 % 1) * 0.6);
        } };
    },

    // Tracción trasera: chasis con las ruedas traseras girando y el motor encendido
    async rwd() {
        const g = new THREE.Group();
        g.add(pedestal(1.9));
        const ch = new THREE.Group(); ch.position.y = 0.75; ch.rotation.y = 0.9; g.add(ch);
        const frame = box(0.9, 0.12, 2.6, '#9aa3b5'); ch.add(frame);
        const wheels = [];
        for (const z of [0.95, -0.95]) for (const x of [-0.6, 0.6]) {
            const w = cyl(0.36, 0.36, 0.22, z < 0 ? '#1e2130' : '#3b3f4f', 20); w.rotation.z = Math.PI / 2; w.position.set(x, 0, z); ch.add(w);
            if (z < 0) wheels.push(w);
        }
        for (const z of [0.95, -0.95]) { const ax = cyl(0.05, 0.05, 1.2, '#c7ccd8', 8); ax.rotation.z = Math.PI / 2; ax.position.set(0, 0, z); ch.add(ax); }
        const motor = box(0.55, 0.38, 0.45, glow('#e31937')); motor.position.set(0, 0.12, -0.95); ch.add(motor);
        const b = bolt(0.32); b.position.set(0, 0.72, -0.95); ch.add(b);
        const tag = textPlane('TRASERA', 1.3, { width: 512, height: 150, bg: '#e31937', fg: '#ffffff', font: 'Bangers', weight: 400, border: 0 });
        tag.position.set(0, 2.1, 0); g.add(tag);
        return { group: g, update: (dt, t) => { wheels.forEach(w => { w.rotation.x += dt * 8; }); b.rotation.y = t * 2; } };
    },

    // Modo Perro: la pantalla del coche con el mensaje tranquilizador
    async dog() {
        const g = new THREE.Group();
        g.add(pedestal(1.4));
        const scr = screenPanel(2.2, 1.35, ['🐶 Mi dueño volverá', 'pronto. ¡Estoy bien!', '20 °C ❄️'], { bg: '#0e1a2f', fg: '#ffffff' });
        scr.position.y = 1.55; scr.rotation.x = -0.1; g.add(scr);
        const paws = [];
        for (let i = 0; i < 3; i++) {
            const p = textPlane('🐾', 0.45, { width: 128, height: 128, bg: null, fg: '#ff7eb3', size: 100 });
            p.position.set(-0.8 + i * 0.8, 2.5, 0.1); g.add(p); paws.push(p);
        }
        return { group: g, update: (dt, t) => { paws.forEach((p, i) => { p.position.y = 2.5 + Math.abs(Math.sin(t * 2 + i)) * 0.25; }); } };
    },

    // Modo Camping: tienda, hoguera y luna
    async camp() {
        const g = new THREE.Group();
        g.add(pedestal(1.7));
        const tent = await model('nature/tent_detailedOpen');
        const h = new THREE.Box3().setFromObject(tent).getSize(new THREE.Vector3()).y || 1;
        tent.scale.multiplyScalar(1.3 / h); tent.position.set(-0.3, 0.3, -0.2); g.add(tent);
        const fire = new THREE.Group(); fire.position.set(0.9, 0.3, 0.5); g.add(fire);
        [['#ffb347', 0.22, 0.55], ['#ff6b3d', 0.15, 0.42], ['#fff2b0', 0.08, 0.28]].forEach(([c, r, hh]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 8), glow(c)); f.position.y = hh / 2; fire.add(f); });
        const moon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), glow('#fff6d0')); moon.position.set(0.7, 2.6, -0.3); g.add(moon);
        const stars = [];
        for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), glow('#ffffff')); s.position.set(-1.2 + i * 0.45, 2.2 + (i % 3) * 0.25, -0.4); g.add(s); stars.push(s); }
        return { group: g, update: (dt, t) => {
            fire.children.forEach((f, i) => { f.scale.y = 0.85 + Math.sin(t * (9 + i * 3)) * 0.2; });
            stars.forEach((s, i) => { s.visible = Math.sin(t * 3 + i * 1.7) > -0.6; });
        } };
    },

    // Caja de juguetes: caja abierta de la que saltan pelotas y un cojín de pedorretas
    async toybox() {
        const g = new THREE.Group();
        g.add(pedestal(1.4));
        const crate = new THREE.Group(); crate.position.y = 0.3; g.add(crate);
        const wallM = M('#c98a4b');
        const base = box(1.5, 0.08, 1.1, wallM); base.position.y = 0.04; crate.add(base);
        for (const [x, z, w, d] of [[0, 0.55, 1.5, 0.08], [0, -0.55, 1.5, 0.08], [0.75, 0, 0.08, 1.1], [-0.75, 0, 0.08, 1.1]]) { const wl = box(w, 0.8, d, wallM); wl.position.set(x, 0.4, z); crate.add(wl); }
        const hinge = new THREE.Group(); hinge.position.set(0, 0.82, -0.55); crate.add(hinge);
        const lid = box(1.55, 0.08, 1.15, '#ff4d8d'); lid.position.set(0, 0, 0.57); hinge.add(lid); hinge.rotation.x = -1.9;
        const toys = [];
        ['#ffd23f', '#4cc9f0', '#7bed9f'].forEach((c, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), M(c)); crate.add(b); toys.push(b); });
        const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 10), M('#ff7eb3')); cushion.scale.set(1, 0.4, 1); cushion.position.set(0, 1.0, 0.75); g.add(cushion);
        const tag = textPlane('TOYBOX 🎮', 1.5, { width: 512, height: 150, bg: '#1b1b2f', fg: '#ffd23f', font: 'Bangers', weight: 400, border: 0 });
        tag.position.set(0, 2.5, 0); g.add(tag);
        return { group: g, update: (dt, t) => {
            toys.forEach((b, i) => { const k = (t * 0.9 + i / 3) % 1; b.position.set(-0.4 + i * 0.4, 0.5 + Math.sin(k * Math.PI) * 1.3, 0); });
            const p = 1 + Math.max(0, Math.sin(t * 4)) * 0.25; cushion.scale.set(p, 0.4 / p, p);
        } };
    },

    // La guantera: cerrada, con un candado de corazón… (misterio)
    async glovebox() {
        const g = new THREE.Group();
        g.add(pedestal(1.4));
        const dash = box(2.2, 0.9, 0.9, '#454a60'); dash.position.y = 1.0; g.add(dash);
        const top = box(2.25, 0.12, 0.95, '#f4efe8'); top.position.y = 1.5; g.add(top);
        const door = box(1.3, 0.6, 0.06, '#5a5f78'); door.position.set(0, 1.0, 0.47); g.add(door);
        const heart = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.5 }));
        heart.scale.setScalar(0.16); heart.position.set(0, 1.02, 0.54); g.add(heart);
        const q = textPlane('?', 0.9, { width: 256, height: 256, bg: null, fg: '#ffd23f', size: 230, stroke: '#1b1b2f', font: 'Bangers', weight: 400 });
        q.position.set(0, 2.25, 0); g.add(q);
        return { group: g, update: (dt, t) => { q.position.y = 2.25 + Math.sin(t * 2) * 0.12; q.rotation.y = Math.sin(t) * 0.4; heart.scale.setScalar(0.16 * (1 + Math.max(0, Math.sin(t * 4)) * 0.2)); } };
    },

    // Compromiso: un corazón grande que late sobre su peana
    async heart() {
        const g = new THREE.Group();
        g.add(pedestal(1.2, '#fff3f8'));
        const h = new THREE.Mesh(heartGeometry(), M('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.45 }));
        h.scale.setScalar(0.85); h.position.y = 1.7; g.add(h);
        const sparks = [];
        for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), glow('#fff2b0')); g.add(s); sparks.push(s); }
        return { group: g, update: (dt, t) => {
            const beat = 1 + Math.max(0, Math.sin(t * 5)) * 0.08 + Math.max(0, Math.sin(t * 5 - 0.9)) * 0.05;
            h.scale.setScalar(0.85 * beat); h.rotation.y = Math.sin(t * 0.8) * 0.5;
            sparks.forEach((s, i) => { const a = t * 0.9 + i * 1.25; s.position.set(Math.cos(a) * 1.15, 1.7 + Math.sin(a * 1.3) * 0.6, Math.sin(a) * 1.15); });
        } };
    }
};

export async function buildProp(name) {
    const fn = PROPS[name];
    if (!fn) return null;
    const p = await fn();
    p.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return p;
}

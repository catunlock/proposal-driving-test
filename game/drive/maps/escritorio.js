// ============================================================================
//  EL ESCRITORIO
// ============================================================================
// Una pista dibujada a lápiz sobre papel cuadriculado, alrededor de un portátil abierto. Los lápices
// tumbados hacen de quitamiedos (los monster truck se los saltan), un libro es rampa, la tinta
// derramada resbala y las virutas del sacapuntas hacen botar. Y la mesa también tiene borde…
import * as THREE from 'three';
import { setupEnv, woodTex, paperTex, pencilRoadTex, mat, mesh, splat, boostPad, wedgeGeo, flatTex } from './common.js';
import { textTexture } from '../../assets.js';

const DESK = { x0: -86, x1: 86, z0: -58, z1: 62 };

// Lápiz tumbado de (ax, az) a (bx, bz)
function pencil(C, ax, az, bx, bz, color = '#ffd23f') {
    const L = Math.hypot(bx - ax, bz - az), r = 0.55;
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(r, r, L - 2.2, 6), color, { rz: Math.PI / 2 }));
    g.add(mesh(new THREE.ConeGeometry(r, 1.6, 6), '#f2d3a0', { x: (L - 2.2) / 2 + 0.8, rz: -Math.PI / 2 }));
    g.add(mesh(new THREE.ConeGeometry(0.2, 0.55, 6), '#2b2d3a', { x: (L - 2.2) / 2 + 1.45, rz: -Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.6, 12), '#c7ccd8', { x: -(L - 2.2) / 2 - 0.3, rz: Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(r, r, 0.7, 12), '#ff7eb3', { x: -(L - 2.2) / 2 - 0.95, rz: Math.PI / 2 }));
    g.position.set((ax + bx) / 2, r, (az + bz) / 2);
    g.rotation.y = -Math.atan2(bz - az, bx - ax);
    C.add(g);
    C.wall([[ax, az], [bx, bz]], { thick: r * 2, h: r * 2 });
}

export default {
    id: 'escritorio',
    name: 'El escritorio',
    emoji: '✏️',
    desc: 'Pista a lápiz entre el portátil, la taza y los libros. Ojo con la tinta.',
    gravity: 30,
    laps: 3,
    road: { grip: 1.02, drag: 0, cap: 1 },
    off: { grip: 0.82, drag: 0.35, cap: 0.82, dust: 0xffffff, name: 'papel' },

    async build(C, engine) {
        setupEnv(engine, C, { bg: '#d9e6f2', fog: [130, 340], sky: '#f4f8ff', ground: '#9a7d63', hemi: 1.2, sun: '#ffffff', sunI: 2.1, sunDir: [0.4, 1, -0.25] });
        const P = [[-60, -38], [-10, -40], [30, -38], [55, -30], [62, -12], [50, 2], [30, 0], [18, 10], [24, 26], [44, 34], [62, 42], [44, 52],
            [10, 50], [-14, 42], [-30, 26], [-24, 8], [-40, -2], [-62, 4], [-72, -18]];
        C.track(P, { width: 9 });

        // --- Escritorio y papel -----------------------------------------------------
        const W = DESK.x1 - DESK.x0, D = DESK.z1 - DESK.z0, cx = (DESK.x0 + DESK.x1) / 2, cz = (DESK.z0 + DESK.z1) / 2;
        C.add(flatTex(W, D, woodTex([3, 2], { base: '#7a4b2a', dark: '#5c3519' }), { x: cx, y: -0.02, z: cz }));
        C.add(mesh(new THREE.BoxGeometry(W, 3, D), '#5c3519', { x: cx, y: -1.52, z: cz, shadow: false }));
        C.add(flatTex(700, 700, woodTex([30, 30], { base: '#b9a58f', dark: '#9a8670' }), { y: -72 }));
        C.add(flatTex(156, 108, paperTex([12, 9]), { x: 0, y: 0.006, z: 4 }));
        // margen rojo del cuaderno
        C.add(mesh(new THREE.BoxGeometry(0.5, 0.02, 108), '#e8173b', { x: -64, y: 0.02, z: 4, shadow: false }));
        // notas adhesivas
        for (const [x, z, c, r] of [[-30, 50, '#ffe66d', 0.2], [70, 10, '#7ad7ff', -0.3], [-50, -48, '#ff9fc8', 0.1], [5, -50, '#b6f5c8', -0.15], [74, -30, '#ffe66d', 0.4]])
            C.add(mesh(new THREE.BoxGeometry(10, 0.05, 10), c, { x, y: 0.03, z, ry: r, shadow: false }));
        C.voidFn = (x, z) => x < DESK.x0 || x > DESK.x1 || z < DESK.z0 || z > DESK.z1;
        C.voidY = -71.5;
        C.offFn = (x, z) => (x < -78 || x > 78 || z < -50 || z > 58) ? { grip: 0.85, drag: 0.3, cap: 0.88, name: 'madera' } : null;

        // --- La pista a lápiz -------------------------------------------------------
        C.roadMesh(new THREE.MeshToonMaterial({ map: pencilRoadTex(), polygonOffset: true, polygonOffsetFactor: -1 }), { y: 0.015, uvLen: 10 });
        C.startLine({ banner: 'GRAN PREMIO ✏️', color: '#2f6fe0' });

        // --- Portátil abierto ---------------------------------------------------------
        const lap = new THREE.Group();
        lap.add(mesh(new THREE.BoxGeometry(22, 1.2, 15), '#c7ccd8', { y: 0.6 }));
        const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 0.3, 1.25), mat('#2b2d3a'), 13 * 5);
        const m4 = new THREE.Matrix4();
        let k = 0;
        for (let r = 0; r < 5; r++) for (let c = 0; c < 13; c++) { m4.makeTranslation(-9 + c * 1.5, 1.35, -5.2 + r * 1.5 + 1.2); keys.setMatrixAt(k++, m4); }
        lap.add(keys);
        lap.add(mesh(new THREE.BoxGeometry(7, 0.1, 4.2), '#9aa3b5', { y: 1.22, z: 5.2 }));                 // panel táctil
        const screen = new THREE.Group();
        screen.add(mesh(new THREE.BoxGeometry(22, 14, 0.8), '#c7ccd8', { y: 7 }));
        const st = textTexture('', { width: 800, height: 500, bg: '#1b1b2f', fg: '#7ad7ff', lines: ['🏁 drive.html', 'Vuelta récord: ¡a por ella!'], font: 'Fredoka', weight: 700, border: 18, borderColor: '#1b1b2f', radius: 10 });
        screen.add(mesh(new THREE.PlaneGeometry(19.5, 12.2), new THREE.MeshBasicMaterial({ map: st, toneMapped: false }), { y: 7.3, z: 0.42, shadow: false }));
        screen.position.set(0, 1.2, -7.4); screen.rotation.x = -0.25;
        lap.add(screen);
        lap.position.set(40, 0, -17);
        C.add(lap); C.box(40, -17, 22, 15, 0); C.occluder(lap, 13);
        // ratón con su cable
        const mouse = mesh(new THREE.SphereGeometry(2.4, 16, 12), '#f4f6fb', { x: -2, y: 0.9, z: -22 });
        mouse.scale.set(1, 0.42, 1.5);
        C.add(mouse); C.circle(-2, -22, 2.8);

        // --- Taza, goma, sacapuntas, maceta, libros -------------------------------------
        const mug = new THREE.Group();
        mug.add(mesh(new THREE.CylinderGeometry(5, 4.6, 10, 28), '#2f6fe0', { y: 5 }));
        mug.add(mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.2, 28), '#3b2414', { y: 9.4 }));
        mug.add(mesh(new THREE.TorusGeometry(2.2, 0.6, 8, 18, Math.PI * 1.2), '#2f6fe0', { x: 5.5, y: 5, rz: -Math.PI * 0.6 }));
        mug.position.set(-3, 0, 6);
        C.add(mug); C.circle(-3, 6, 5.4); C.occluder(mug, 7);
        C.add(mesh(new THREE.BoxGeometry(6, 2, 3.2), '#ff7eb3', { x: -9, y: 1, z: 22, ry: 0.5 })); C.box(-9, 22, 6, 3.2, 0.5);
        C.add(mesh(new THREE.BoxGeometry(2.6, 2, 2.6), '#e8173b', { x: 9, y: 1, z: -6, ry: 0.3 })); C.box(9, -6, 2.6, 2.6, 0.3);
        await C.prop('furniture/pottedPlant', -50, 36, { height: 16 }); C.circle(-50, 36, 4.4);
        await C.prop('furniture/books', -38, -22, { size: 14, rot: 0.3 }); C.box(-38, -22, 13, 9, 0.3);
        await C.prop('furniture/radio', 77, 14, { size: 12, rot: -0.6 }); C.box(77, 14, 11, 6, -0.6);
        // flexo
        const lamp = new THREE.Group();
        lamp.add(mesh(new THREE.CylinderGeometry(4.5, 5, 1, 28), '#1e2130', { y: 0.5 }));
        lamp.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 16, 10), '#9aa3b5', { y: 8.5, rz: 0.25 }));
        lamp.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 10), '#9aa3b5', { x: 4.5, y: 17, rz: -1.1 }));
        lamp.add(mesh(new THREE.ConeGeometry(3.4, 4.5, 24, 1, true), '#e8173b', { x: 10, y: 18, rz: 0.6, opts: { side: THREE.DoubleSide } }));
        lamp.position.set(72, 0, -46);
        C.add(lamp); C.circle(72, -46, 5);

        // --- Lápices de quitamiedos en el exterior de la horquilla ------------------------
        pencil(C, 52, 59, 72, 50, '#ffd23f');
        pencil(C, 73, 46, 72, 30, '#2f9e44');
        pencil(C, -72, 4, -82, -14, '#e8173b');
        pencil(C, 64, -40, 72, -22, '#2f6fe0');

        // --- Tinta derramada, virutas y regla -------------------------------------------
        const ink = { grip: 0.38, drag: 0.35, cap: 0.9, name: 'tinta', marks: false };
        for (const [x, z, r, s] of [[33, -37.5, 3.4, 2], [-27, 16, 3, 5]]) { C.add(splat(r, '#1b2a6b', { x, z, seed: s, opacity: 0.95 })); C.hazard({ x, z, r: r * 0.95 }, ink); }
        const shav = new THREE.ConeGeometry(0.35, 0.25, 7, 1, true);
        for (const [d0, n] of [[70, 8], [180, 8]]) for (let i = 0; i < n; i++) {
            const p = C.at(d0 + i * 1.4, (Math.random() - 0.5) * 6);
            C.add(mesh(shav, i % 2 ? '#f2d3a0' : '#ffd23f', { x: p.x, y: 0.1, z: p.z, rx: Math.PI / 2 * Math.random(), ry: Math.random() * 6, opts: { side: THREE.DoubleSide } }));
            C.circle(p.x, p.z, 0.3, { h: 0.22, bump: true });
        }
        // regla cruzada (bache largo)
        const rl = C.at(C.len * 0.62);
        const ruler = new THREE.Group();
        ruler.add(mesh(new THREE.BoxGeometry(14, 0.28, 2.4), '#f2e2a0', { y: 0.14 }));
        for (let i = 0; i < 14; i++) ruler.add(mesh(new THREE.BoxGeometry(0.06, 0.02, i % 5 ? 0.6 : 1.1), '#1b1b2f', { x: -6.8 + i, y: 0.29, z: -0.8, shadow: false }));
        ruler.position.set(rl.x, 0, rl.z); ruler.rotation.y = rl.h + Math.PI / 2;
        C.add(ruler);
        for (let i = -3; i <= 3; i++) { const p = C.at(C.len * 0.62, i * 1.6); C.circle(p.x, p.z, 0.9, { h: 0.28, bump: true }); }

        // --- Libro-rampa y placas de turbo -----------------------------------------------
        const rp = C.at(34);
        const book = new THREE.Group();
        book.add(mesh(wedgeGeo(8, 8, 2.1), '#8e5bd8'));
        book.add(mesh(new THREE.BoxGeometry(8.2, 0.12, 0.3), '#ffd23f', { y: 2.06, z: 3.9 }));
        book.position.set(rp.x, 0, rp.z); book.rotation.y = rp.h;
        C.add(book); C.ramp(rp.x, rp.z, 8, 8, rp.h, 2.1);
        for (const d of [C.len * 0.3, C.len * 0.8]) {
            const b = C.at(d);
            const pad = boostPad(5, 6); pad.position.set(b.x, 0.03, b.z); pad.rotation.y = b.h;
            C.add(pad); C.boost(b.x, b.z, 5, 6, b.h);
            C.anim((dt, t) => { pad.userData.tex.offset.y = -(t * 1.5 % 1); });
        }
        C.finalize();
    }
};

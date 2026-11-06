// ============================================================================
//  LA MESA DEL DESAYUNO (el clásico de Micro Machines)
// ============================================================================
// Mesa de madera con mantel de cuadros. La pista es una cinta de tela bordeada de cereales que
// rodea el tazón de leche, la taza de café y el plato del huevo frito. Mermelada y leche
// derramadas resbalan, las migas hacen botar, la tostada es un trampolín y, si te sales por el
// borde de la mesa… al suelo de la cocina.
import * as THREE from 'three';
import { setupEnv, woodTex, ginghamTex, clothRoadTex, mat, mesh, splat, boostPad, wedgeGeo, flatTex } from './common.js';

const TABLE = { x0: -84, x1: 84, z0: -56, z1: 58 };

export default {
    id: 'desayuno',
    name: 'La mesa del desayuno',
    emoji: '🥣',
    desc: 'Cereales, mermelada que resbala y un borde de mesa muy traicionero.',
    gravity: 30,
    laps: 3,
    road: { grip: 1, drag: 0, cap: 1, marks: true },
    off: { grip: 0.74, drag: 0.5, cap: 0.75, dust: 0xf3e6d0, name: 'mantel' },

    async build(C, engine) {
        setupEnv(engine, C, { bg: '#ffe7c7', fog: [120, 330], sky: '#fff6e6', ground: '#c08a55', hemi: 1.25, sun: '#fff0d4', sunI: 2.3, sunDir: [-0.45, 1, 0.3] });
        const P = [[-45, -40], [-5, -43], [35, -40], [58, -34], [68, -18], [66, 0], [58, 14], [62, 30], [52, 44], [30, 46], [14, 36],
            [10, 20], [-2, 8], [-20, 4], [-36, 10], [-44, 26], [-58, 40], [-70, 30], [-70, 8], [-64, -16], [-58, -32]];
        C.track(P, { width: 9 });

        // --- Mesa, mantel y suelo de la cocina -------------------------------------
        const W = TABLE.x1 - TABLE.x0, D = TABLE.z1 - TABLE.z0, cx = (TABLE.x0 + TABLE.x1) / 2, cz = (TABLE.z0 + TABLE.z1) / 2;
        C.add(flatTex(W, D, woodTex([3, 2]), { x: cx, y: -0.02, z: cz }));
        C.add(mesh(new THREE.BoxGeometry(W, 2.2, D), '#a86b33', { x: cx, y: -1.13, z: cz, shadow: false }));
        for (const [lx, lz] of [[TABLE.x0 + 6, TABLE.z0 + 6], [TABLE.x1 - 6, TABLE.z0 + 6], [TABLE.x0 + 6, TABLE.z1 - 6], [TABLE.x1 - 6, TABLE.z1 - 6]])
            C.add(mesh(new THREE.CylinderGeometry(3, 2.4, 68, 12), '#8a5528', { x: lx, y: -36, z: lz, shadow: false }));
        const floor = flatTex(700, 700, ginghamTex([40, 40], '#2f6fe0'), { y: -70 });
        C.add(floor);
        const cloth = flatTex(150, 104, ginghamTex([18, 12]), { x: 0, y: 0.005, z: 2 });
        C.add(cloth);
        C.voidFn = (x, z) => x < TABLE.x0 || x > TABLE.x1 || z < TABLE.z0 || z > TABLE.z1;
        C.voidY = -69.5;
        // fuera de la pista: sobre la madera se resbala un poco más que sobre el mantel
        C.offFn = (x, z) => (x < -75 || x > 75 || z < -50 || z > 54) ? { grip: 0.8, drag: 0.35, cap: 0.85, name: 'madera' } : null;

        // --- La pista: cinta de tela con cereales en los bordes --------------------
        const rt = clothRoadTex(); rt.repeat.set(1, 1);
        C.roadMesh(new THREE.MeshToonMaterial({ map: rt, polygonOffset: true, polygonOffsetFactor: -1 }), { y: 0.015, uvLen: 9 });
        const ring = new THREE.TorusGeometry(0.3, 0.12, 6, 12); ring.rotateX(Math.PI / 2);
        const cereal = ['#f2b33d', '#e8173b', '#2f9e44', '#ff7a2b', '#8e5bd8'].map(c => mat(c));
        cereal.forEach((m, i) => C.edgeInstances(ring, m, { every: 1.1, off: C.width / 2 + 0.45, y: 0.13, jitter: 0.3, scale: 1, skip: (d) => Math.round(d / 1.1) % cereal.length !== i }));
        C.startLine({ banner: 'DESAYUNO GP', color: '#ff4d8d' });

        // --- El tazón de leche con cereales ----------------------------------------
        const bowl = new THREE.Group();
        const prof = [[0, 0], [7.5, 0], [10, 1.6], [11.6, 4.5], [12.2, 7.2], [11.6, 7.2], [11, 4.8], [9.4, 2.2], [0, 1.8]].map(([r, y]) => new THREE.Vector2(r, y));
        bowl.add(mesh(new THREE.LatheGeometry(prof, 40), '#f4f6fb'));
        bowl.add(mesh(new THREE.TorusGeometry(11.9, 0.32, 8, 48), '#2f6fe0', { y: 7.2, rx: Math.PI / 2 }));
        bowl.add(mesh(new THREE.CylinderGeometry(11.5, 11.5, 0.2, 40), '#fffdf6', { y: 6.2 }));       // la leche
        const flakes = new THREE.InstancedMesh(new THREE.TorusGeometry(0.55, 0.26, 6, 10), mat('#f2b33d'), 70);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < 70; i++) {
            const a = Math.random() * 6.28, r = Math.random() * 10;
            m4.compose(new THREE.Vector3(Math.cos(a) * r, 6.35, Math.sin(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (Math.random() - 0.5) * 0.6, Math.random() * 6, 0)), new THREE.Vector3(1, 1, 1));
            flakes.setMatrixAt(i, m4);
        }
        bowl.add(flakes);
        const spoon = new THREE.Group();
        spoon.add(mesh(new THREE.BoxGeometry(0.9, 0.25, 14), '#c7ccd8', { z: 5 }));
        spoon.add(mesh(new THREE.SphereGeometry(2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#c7ccd8', { z: -2.5, rx: Math.PI }));
        spoon.position.set(4, 8, 0); spoon.rotation.set(-0.7, 0.5, 0);
        bowl.add(spoon);
        bowl.position.set(-10, 0, -18);
        C.add(bowl); C.circle(-10, -18, 12.3); C.occluder(bowl, 13);

        // --- Taza de café ------------------------------------------------------------
        const mug = new THREE.Group();
        mug.add(mesh(new THREE.CylinderGeometry(6, 5.4, 11, 32, 1, true), '#ff4d8d', { y: 5.5, opts: { side: THREE.DoubleSide } }));
        mug.add(mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.6, 32), '#ff4d8d', { y: 0.3 }));
        mug.add(mesh(new THREE.CylinderGeometry(5.7, 5.7, 0.2, 32), '#5a3418', { y: 9.6 }));
        mug.add(mesh(new THREE.TorusGeometry(2.6, 0.7, 10, 20, Math.PI * 1.2), '#ff4d8d', { x: 6.6, y: 5.6, rz: -Math.PI * 0.6 }));
        mug.add(mesh(new THREE.TorusGeometry(6, 0.35, 8, 40), '#ffffff', { y: 11, rx: Math.PI / 2 }));
        mug.position.set(38, 0, 24);
        C.add(mug); C.circle(38, 24, 6.6); C.circle(44.6, 24, 1.6); C.occluder(mug, 8);
        // vapor
        const steam = [];
        for (let i = 0; i < 5; i++) {
            const s = mesh(new THREE.SphereGeometry(1.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false }), { shadow: false });
            C.add(s); steam.push(s);
        }
        C.anim((dt, t) => steam.forEach((s, i) => { const k = (t * 0.25 + i / 5) % 1; s.position.set(38 + Math.sin(t + i) * 1.5, 11 + k * 9, 24 + Math.cos(t * 0.7 + i) * 1.5); s.scale.setScalar(0.6 + k * 1.4); s.material.opacity = 0.4 * (1 - k); }));

        // --- Plato con huevo frito y beicon (los coches altos se suben encima) -------
        const plate = new THREE.Group();
        plate.add(mesh(new THREE.CylinderGeometry(9.5, 8.6, 0.55, 40), '#f4f6fb', { y: 0.27 }));
        plate.add(mesh(new THREE.TorusGeometry(9.2, 0.25, 8, 48), '#ffd23f', { y: 0.58, rx: Math.PI / 2 }));
        plate.add(splat(4, '#fffdf8', { y: 0.6, opacity: 1, seed: 3 }));
        plate.add(mesh(new THREE.SphereGeometry(1.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#ffb703', { y: 0.6, x: 0.6, z: -0.5 }));
        for (const [bx, bz, r] of [[-4.5, 3.5, 0.4], [-2, 5.2, 0.2]]) plate.add(mesh(new THREE.BoxGeometry(6, 0.3, 1.6), '#b8452f', { x: bx, y: 0.75, z: bz, ry: r }));
        plate.position.set(35, 0, -18);
        C.add(plate); C.disc(35, -18, 9.4, 0.58);

        // --- Mermelada: tarro y mancha resbaladiza -----------------------------------
        const jar = new THREE.Group();
        jar.add(mesh(new THREE.CylinderGeometry(4.2, 4.2, 8, 24), new THREE.MeshToonMaterial({ color: '#c0103a', transparent: true, opacity: 0.88 }), { y: 4 }));
        jar.add(mesh(new THREE.CylinderGeometry(4.5, 4.5, 1.4, 24), '#ffffff', { y: 8.7 }));
        jar.add(mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.5, 24), '#e8173b', { y: 9.6 }));
        jar.position.set(-56, 0, 22);
        C.add(jar); C.circle(-56, 22, 4.4); C.occluder(jar, 6);
        const jam = { grip: 0.32, drag: 0.4, cap: 0.85, name: 'mermelada', marks: false };
        for (const [x, z, r, s] of [[-12, 5.5, 3.6, 1], [-50, 31, 2.8, 4]]) { C.add(splat(r, '#c0103a', { x, z, seed: s })); C.hazard({ x, z, r: r * 0.95 }, jam); }
        const milk = { grip: 0.42, drag: 0.3, cap: 0.9, name: 'leche', marks: false };
        C.add(splat(4.2, '#fffdf6', { x: 60, z: -28, seed: 7 })); C.hazard({ x: 60, z: -28, r: 4 }, milk);

        // --- Zumo, mantequilla, cruasanes y migas --------------------------------------
        const glass = new THREE.Group();
        glass.add(mesh(new THREE.CylinderGeometry(3.6, 3.2, 12, 24, 1, true), new THREE.MeshToonMaterial({ color: '#dff3ff', transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false })));
        glass.add(mesh(new THREE.CylinderGeometry(3.4, 3.2, 8.5, 24), new THREE.MeshToonMaterial({ color: '#ff9f1c', transparent: true, opacity: 0.9 }), { y: -1.6 }));
        glass.position.set(-14, 6, 36);
        C.add(glass); C.circle(-14, 36, 3.8); C.occluder(glass, 6);
        const butter = new THREE.Group();
        butter.add(mesh(new THREE.BoxGeometry(9, 0.6, 6), '#f4f6fb', { y: 0.3 }));
        butter.add(mesh(new THREE.BoxGeometry(5, 2.2, 3.4), '#ffe08a', { y: 1.7 }));
        butter.position.set(30, 0, 34); butter.rotation.y = 0.3;
        C.add(butter); C.box(30, 34, 9, 6, 0.3);
        for (const [x, z, r] of [[-30, -28, 0.4], [16, -24, 2], [-40, 38, 1], [74, 30, 0.6]]) {
            const cr = await C.prop('food/croissant', x, z, { size: 4.2, rot: r });
            void cr;
            C.circle(x, z, 1.6, { h: 1.4 });
        }
        await C.prop('food/donut-sprinkles', 74, -44, { size: 7, rot: 0.4 });
        C.circle(74, -44, 3.3);
        await C.prop('food/cupcake', -76, -46, { size: 4.5 });
        C.circle(-76, -46, 2.2);
        // migas: botes para los bajos, nada para los altos
        const crumbGeo = new THREE.DodecahedronGeometry(0.2, 0);
        for (const [d0, n] of [[95, 9], [205, 8], [300, 7]]) for (let k = 0; k < n; k++) {
            const p = C.at(d0 + k * 1.6, (Math.random() - 0.5) * 6);
            C.add(mesh(crumbGeo, '#e8b878', { x: p.x, y: 0.12, z: p.z, ry: Math.random() * 6, rx: Math.random() }));
            C.circle(p.x, p.z, 0.25, { h: 0.25, bump: true });
        }

        // --- La tostada-trampolín y las placas de turbo ------------------------------
        const rp = C.at(18); const rh = p => p.h;
        const toast = new THREE.Group();
        toast.add(mesh(wedgeGeo(7.5, 7, 1.9), '#e0a55a'));
        toast.add(mesh(new THREE.BoxGeometry(7.7, 0.25, 0.6), '#9b5a24', { y: 1.9, z: 3.4 }));
        toast.position.set(rp.x, 0, rp.z); toast.rotation.y = rh(rp);
        C.add(toast);
        C.ramp(rp.x, rp.z, 7.5, 7, rp.h, 1.9);
        for (const d of [C.len * 0.86, C.len * 0.42]) {
            const b = C.at(d);
            const pad = boostPad(5, 6); pad.position.set(b.x, 0.03, b.z); pad.rotation.y = b.h;
            C.add(pad); C.boost(b.x, b.z, 5, 6, b.h);
            C.anim((dt, t) => { pad.userData.tex.offset.y = -(t * 1.5 % 1); });
        }
        C.finalize();
    }
};

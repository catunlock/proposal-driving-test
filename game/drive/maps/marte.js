// ============================================================================
//  MARTE
// ============================================================================
// Gravedad baja (un 38 % de la terrestre): las rampas de los bordes de los cráteres hacen volar.
// Pista marcada con balizas, una base con cúpulas, el rover paseando, el cohete en su plataforma y,
// en un pedestal, un descapotable rojo con su astronauta (como el que de verdad está en órbita).
// Fuera de la pista, polvo suelto que resbala; en las placas de hielo, todavía más.
import * as THREE from 'three';
import { setupEnv, marsTex, marsRoadTex, mat, mesh, splat, boostPad, wedgeGeo, flatTex } from './common.js';
import { parkedTesla } from '../../car.js';

export default {
    id: 'marte',
    name: 'Marte',
    emoji: '🔴',
    desc: 'Gravedad baja: cada rampa es un vuelo. El polvo y el hielo no perdonan.',
    gravity: 11.4,
    laps: 3,
    road: { grip: 0.95, drag: 0, cap: 1, dust: 0xe8a27a },
    off: { grip: 0.55, drag: 0.4, cap: 0.75, dust: 0xd9774a, name: 'polvo' },

    async build(C, engine) {
        setupEnv(engine, C, { bg: '#e6a97f', fog: [120, 380], sky: '#ffd3b0', ground: '#8a3a1e', hemi: 1.15, sun: '#fff0dc', sunI: 2.0, sunDir: [-0.6, 0.8, -0.3] });
        const P = [[-60, -40], [-10, -46], [40, -44], [70, -30], [74, 0], [56, 18], [30, 12], [10, 24], [20, 46], [-6, 58], [-34, 50], [-40, 26], [-62, 18], [-78, -6], [-76, -28]];
        C.track(P, { width: 10 });

        // --- Suelo, cielo, borde --------------------------------------------------------
        C.add(flatTex(600, 600, marsTex([36, 36]), { y: -0.02 }));
        const sky = new THREE.Group();
        sky.add(mesh(new THREE.SphereGeometry(14, 32, 20), new THREE.MeshBasicMaterial({ color: '#4f8fe8', fog: false }), { x: -120, y: 120, z: -260, shadow: false }));
        sky.add(mesh(new THREE.SphereGeometry(14.4, 32, 20), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, fog: false }), { x: -120, y: 120, z: -260, shadow: false }));
        sky.add(mesh(new THREE.DodecahedronGeometry(6, 1), new THREE.MeshBasicMaterial({ color: '#8a7a6a', fog: false }), { x: 160, y: 90, z: -240, shadow: false }));
        C.add(sky);
        // anillo de montañas lejanas (y muro invisible para no perderse)
        const rockM = mat('#a84a28');
        for (let i = 0; i < 40; i++) {
            const a = i / 40 * Math.PI * 2, r = 135 + Math.random() * 25;
            const m = mesh(new THREE.ConeGeometry(14 + Math.random() * 16, 18 + Math.random() * 26, 6), rockM, { x: Math.cos(a) * r, y: 8, z: Math.sin(a) * r, ry: Math.random() * 6, shadow: false });
            C.add(m);
        }
        const ring = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; ring.push([Math.cos(a) * 112, Math.sin(a) * 112]); }
        C.wall(ring, { closed: true, thick: 2 });

        // --- Pista con balizas --------------------------------------------------------------
        C.roadMesh(new THREE.MeshToonMaterial({ map: marsRoadTex(), polygonOffset: true, polygonOffsetFactor: -1 }), { y: 0.02, uvLen: 10 });
        const bm = new THREE.MeshBasicMaterial({ color: '#ff3355', toneMapped: false });
        C.edgeInstances(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), mat('#e6e9ef'), { every: 6, off: C.width / 2 + 0.8, y: 0.6, scale: 1 });
        const beacons = C.edgeInstances(new THREE.SphereGeometry(0.22, 8, 6), bm, { every: 6, off: C.width / 2 + 0.8, y: 1.3, scale: 1 });
        beacons.castShadow = false;
        C.anim((dt, t) => { bm.color.setHSL(0.98, 1, 0.45 + 0.2 * Math.sin(t * 4)); });
        C.startLine({ banner: 'MARS GP 🚀', color: '#e8173b' });

        // --- Cráteres con rampa en el borde ---------------------------------------------------
        const craterRamp = (d, H = 2.4) => {
            const p = C.at(d);
            const w = mesh(wedgeGeo(9, 9, H), '#b8532c');
            w.position.set(p.x, 0, p.z); w.rotation.y = p.h; C.add(w);
            C.ramp(p.x, p.z, 9, 9, p.h, H);
            // el cráter, justo después (decorado: un anillo hundido)
            const q = C.at(d + 14);
            const cr = mesh(new THREE.TorusGeometry(6.5, 1.1, 8, 28), '#9a3f20', { x: q.x, y: 0.1, z: q.z, rx: Math.PI / 2 });
            C.add(cr);
            C.add(mesh(new THREE.CircleGeometry(6, 28), '#7e321a', { x: q.x, y: 0.03, z: q.z, rx: -Math.PI / 2, shadow: false }));
        };
        craterRamp(C.len * 0.1);
        craterRamp(C.len * 0.47, 3);
        craterRamp(C.len * 0.79, 2.2);

        // --- Base marciana ---------------------------------------------------------------------
        const domeM = new THREE.MeshToonMaterial({ color: '#dff3ff', transparent: true, opacity: 0.55, depthWrite: false });
        for (const [x, z, r] of [[44, -10, 9], [24, -18, 6], [56, -18, 5]]) {
            C.add(mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), domeM, { x, z, shadow: false }));
            C.add(mesh(new THREE.CylinderGeometry(r + 0.4, r + 0.6, 0.8, 24), '#c7ccd8', { x, y: 0.4, z }));
            C.circle(x, z, r);
        }
        for (const [x, z] of [[44, -10], [24, -18]]) await C.prop('nature/plant_bushLarge', x, z, { height: 3, color: '#5fbf4a' });
        // paneles solares
        for (let i = 0; i < 4; i++) {
            const g = new THREE.Group();
            g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.4, 6), '#9aa3b5', { y: 1.2 }));
            g.add(mesh(new THREE.BoxGeometry(5, 0.2, 3), '#20306b', { y: 2.5, rx: -0.5 }));
            g.position.set(-4 + i * 7, 0, -26); C.add(g); C.circle(-4 + i * 7, -26, 1.4);
        }
        // cohete en su plataforma
        const rocket = new THREE.Group();
        rocket.add(mesh(new THREE.CylinderGeometry(7, 7, 1, 24), '#5d6275', { y: 0.5 }));
        rocket.add(mesh(new THREE.CylinderGeometry(2.6, 2.6, 24, 20), '#f4f6fb', { y: 13 }));
        rocket.add(mesh(new THREE.ConeGeometry(2.6, 7, 20), '#e8173b', { y: 28.5 }));
        for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; rocket.add(mesh(new THREE.BoxGeometry(0.4, 6, 4), '#e8173b', { x: Math.cos(a) * 3, y: 4, z: Math.sin(a) * 3, ry: -a })); }
        rocket.add(mesh(new THREE.CylinderGeometry(2.7, 2.7, 1.2, 20), '#1e2130', { y: 18 }));
        rocket.position.set(-58, 0, 44);
        C.add(rocket); C.circle(-58, 44, 7.2); C.occluder(rocket, 10);
        // rover paseando por dentro del circuito
        const rover = new THREE.Group();
        rover.add(mesh(new THREE.BoxGeometry(3.6, 1.2, 5), '#f4f6fb', { y: 1.4 }));
        rover.add(mesh(new THREE.BoxGeometry(3, 0.15, 3), '#20306b', { y: 2.15, z: -0.6 }));
        rover.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 2, 6), '#9aa3b5', { x: 1.2, y: 3, z: 1.8 }));
        rover.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), '#ffd23f', { x: 1.2, y: 4, z: 1.8 }));
        const rw = [];
        for (const [x, z] of [[-2, -1.8], [2, -1.8], [-2, 0], [2, 0], [-2, 1.8], [2, 1.8]]) { const w = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12), '#2a2d3a', { x, y: 0.55, z, rz: Math.PI / 2 }); rover.add(w); rw.push(w); }
        C.add(rover);
        const roverCol = C.circle(0, 0, 3.2);
        C.anim((dt, t) => {
            const a = t * 0.08;
            rover.position.set(-16 + Math.cos(a) * 12, 0, 10 + Math.sin(a) * 10);
            rover.rotation.y = -a;
            roverCol.x = rover.position.x; roverCol.z = rover.position.z;
            rw.forEach(w => { w.rotation.x += dt * 2; });
        });
        let gridT = 0; C.anim(dt => { gridT += dt; if (gridT > 0.5) { gridT = 0; C.finalize(); } });
        // el descapotable rojo con su astronauta, sobre un pedestal
        const red = await parkedTesla('#d7263d');
        red.scale.setScalar(1.6);
        const ped = new THREE.Group();
        ped.add(mesh(new THREE.CylinderGeometry(4.5, 5, 2, 20), '#5d6275', { y: 1 }));
        red.position.y = 2; red.rotation.y = 0.8; ped.add(red);
        const helmet = mesh(new THREE.SphereGeometry(0.55, 14, 10), '#ffffff', { y: 3.9 });
        ped.add(helmet);
        ped.position.set(82, 0, 30);
        C.add(ped); C.circle(82, 30, 5);
        C.anim((dt, t) => { red.rotation.y = 0.8 + t * 0.2; helmet.position.set(Math.sin(0.8 + t * 0.2) * 0.4, 3.9, Math.cos(0.8 + t * 0.2) * 0.4); });

        // --- Rocas, hielo y turbo --------------------------------------------------------------
        for (const [x, z, s] of [[-30, -18, 7], [-14, 34, 6], [86, -40, 10], [-88, 40, 12], [0, -62, 9], [36, 64, 8]]) {
            await C.prop('nature/rock_largeA', x, z, { size: s, rot: Math.random() * 6, color: '#b5532d' }); C.circle(x, z, s * 0.42);
        }
        const pebble = new THREE.DodecahedronGeometry(0.3, 0);
        for (const [d0, n] of [[C.len * 0.3, 8], [C.len * 0.62, 8]]) for (let i = 0; i < n; i++) {
            const p = C.at(d0 + i * 1.6, (Math.random() - 0.5) * 6.5);
            C.add(mesh(pebble, '#8a3a1e', { x: p.x, y: 0.15, z: p.z, ry: Math.random() * 6 }));
            C.circle(p.x, p.z, 0.3, { h: 0.3, bump: true });
        }
        const ice = { grip: 0.25, drag: 0.1, cap: 1, name: 'hielo', marks: false, dust: 0xffffff };
        for (const [d, s] of [[C.len * 0.27, 2], [C.len * 0.66, 5]]) { const p = C.at(d, 1.5); C.add(splat(4.2, '#dff3ff', { x: p.x, z: p.z, seed: s, opacity: 0.9 })); C.hazard({ x: p.x, z: p.z, r: 4 }, ice); }
        for (const d of [C.len * 0.2, C.len * 0.57, C.len * 0.92]) {
            const b = C.at(d);
            const pad = boostPad(5.5, 6); pad.position.set(b.x, 0.04, b.z); pad.rotation.y = b.h;
            C.add(pad); C.boost(b.x, b.z, 5.5, 6, b.h);
            C.anim((dt, t) => { pad.userData.tex.offset.y = -(t * 1.5 % 1); });
        }
        C.finalize();
    }
};

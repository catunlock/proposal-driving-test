// ============================================================================
//  EL JARDÍN
// ============================================================================
// Camino de tierra entre el césped, con flores y setas gigantes, una regadera, un enanito y la
// manguera serpenteando como quitamiedos. Los charcos salpican y frenan, el barro todavía más, la
// tabla sobre el ladrillo es un trampolín y un caracol cruza la pista sin ninguna prisa.
import * as THREE from 'three';
import { setupEnv, grassTex, dirtRoadTex, mat, mesh, splat, boostPad, wedgeGeo, flatTex } from './common.js';

export default {
    id: 'jardin',
    name: 'El jardín',
    emoji: '🌻',
    desc: 'Camino de tierra, charcos que salpican y un caracol que no cede el paso.',
    gravity: 30,
    laps: 3,
    road: { grip: 0.95, drag: 0.05, cap: 1, dust: 0xd8b48a },
    off: { grip: 0.7, drag: 0.6, cap: 0.68, dust: 0x9bd77a, name: 'césped', marks: false },

    async build(C, engine) {
        setupEnv(engine, C, { bg: '#9fdcff', fog: [140, 360], sky: '#dff3ff', ground: '#5a9a3c', hemi: 1.35, sun: '#fff4dc', sunI: 2.4, sunDir: [0.3, 1, 0.45] });
        const P = [[-58, -44], [-8, -46], [40, -42], [64, -26], [60, -4], [40, 4], [34, 22], [52, 38], [40, 54], [6, 50], [-8, 30], [-24, 20], [-46, 34], [-68, 26], [-70, 0], [-48, -10], [-36, -24], [-56, -30]];
        C.track(P, { width: 9.5 });

        // --- Césped, seto y cielo ---------------------------------------------------
        C.add(flatTex(420, 420, grassTex([28, 28]), { y: -0.02 }));
        const hedge = mat('#3e8a3a');
        const B = { x0: -92, x1: 92, z0: -66, z1: 72 };
        const wall = [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]];
        for (let i = 0; i < 4; i++) {
            const [ax, az] = wall[i], [bx, bz] = wall[(i + 1) % 4];
            const L = Math.hypot(bx - ax, bz - az);
            const h = new THREE.Mesh(new THREE.BoxGeometry(L + 6, 9, 6), hedge);
            h.position.set((ax + bx) / 2, 4.5, (az + bz) / 2); h.rotation.y = -Math.atan2(bz - az, bx - ax);
            h.castShadow = true; h.receiveShadow = true; C.add(h);
        }
        C.wall(wall, { closed: true, thick: 6 });
        // nubes
        for (let i = 0; i < 8; i++) {
            const g = new THREE.Group();
            for (let k = 0; k < 4; k++) g.add(mesh(new THREE.SphereGeometry(6 + Math.random() * 5, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }), { x: k * 8 - 12, y: Math.random() * 3, shadow: false }));
            g.position.set(-200 + i * 55, 70 + Math.random() * 20, -160 + Math.random() * 40);
            C.add(g);
            C.anim((dt) => { g.position.x += dt * 2; if (g.position.x > 240) g.position.x = -240; });
        }

        // --- Camino de tierra con piedrecitas en el borde -----------------------------
        C.roadMesh(new THREE.MeshToonMaterial({ map: dirtRoadTex(), polygonOffset: true, polygonOffsetFactor: -1 }), { y: 0.02, uvLen: 10 });
        C.edgeInstances(new THREE.DodecahedronGeometry(0.42, 0), mat('#c7ccd8'), { every: 1.5, off: C.width / 2 + 0.5, y: 0.15, jitter: 0.5, scale: 1 });
        C.startLine({ banner: 'JARDÍN RALLY', color: '#2f9e44' });

        // --- Flores y setas gigantes ---------------------------------------------------
        for (const [key, x, z, hgt, r] of [['nature/flower_redA', -30, -2, 18, 3], ['nature/flower_yellowA', 14, 8, 20, 3], ['nature/flower_purpleA', 20, -20, 16, 3],
            ['nature/flower_redA', -10, 66, 22, 3], ['nature/flower_yellowA', 80, 12, 18, 3], ['nature/flower_purpleA', -84, -40, 20, 3]]) {
            const f = await C.prop(key, x, z, { height: hgt, rot: Math.random() * 6 });
            C.circle(x, z, r); C.occluder(f, 6);
        }
        for (const [x, z, h] of [[-20, -32, 7], [60, 18, 8], [-84, 48, 9]]) { await C.prop('nature/mushroom_red', x, z, { height: h }); C.circle(x, z, h * 0.42); }
        for (const [key, x, z, s] of [['nature/rock_largeA', 78, -46, 10], ['nature/rock_largeB', -76, 62, 12], ['nature/rock_tallA', 4, -14, 6], ['nature/stone_tallA', 76, 62, 7]]) {
            await C.prop(key, x, z, { size: s, rot: Math.random() * 6 }); C.circle(x, z, s * 0.42);
        }

        // --- Regadera ---------------------------------------------------------------------
        const can = new THREE.Group();
        can.add(mesh(new THREE.CylinderGeometry(5, 5.4, 9, 24), '#2f9e44', { y: 4.5 }));
        can.add(mesh(new THREE.TorusGeometry(3.6, 0.6, 8, 20, Math.PI), '#2f9e44', { y: 9, rz: 0 }));
        const spout = mesh(new THREE.CylinderGeometry(0.5, 0.9, 10, 10), '#2f9e44', { x: 7.5, y: 6, rz: -1.0 });
        can.add(spout);
        can.add(mesh(new THREE.CylinderGeometry(1.8, 1.2, 1.2, 14), '#ffd23f', { x: 11.6, y: 8.8, rz: -1.0 }));
        can.position.set(-6, 0, 10); can.rotation.y = 0.6;
        C.add(can); C.circle(-6, 10, 5.6); C.occluder(can, 9);

        // --- Enanito de jardín --------------------------------------------------------------
        const gnome = new THREE.Group();
        gnome.add(mesh(new THREE.CylinderGeometry(2.2, 2.8, 5, 14), '#2f6fe0', { y: 2.5 }));
        gnome.add(mesh(new THREE.SphereGeometry(2, 14, 10), '#ffd7b5', { y: 6.2 }));
        gnome.add(mesh(new THREE.ConeGeometry(2.1, 5.5, 14), '#e8173b', { y: 9.6 }));
        gnome.add(mesh(new THREE.ConeGeometry(1.8, 3.2, 12), '#ffffff', { y: 4.9, rx: Math.PI }));
        gnome.position.set(-56, 0, 6);
        C.add(gnome); C.circle(-56, 6, 3);

        // --- Manguera: quitamiedos verde que serpentea por fuera de las curvas -------------
        const hoseMat = mat('#6cd04e');
        const hose = (pts) => {
            const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.55, z)));
            const g = new THREE.TubeGeometry(curve, pts.length * 12, 0.55, 8, false);
            const m = new THREE.Mesh(g, hoseMat); m.castShadow = true; C.add(m);
            const sp = curve.getSpacedPoints(pts.length * 6).map(p => [p.x, p.z]);
            C.wall(sp, { thick: 1.1, h: 1.1 });
        };
        hose([[68, -38], [74, -24], [72, -6], [64, 4]]);
        hose([[44, 64], [58, 58], [62, 44]]);
        hose([[-60, 44], [-74, 40], [-80, 24], [-80, 6]]);

        // --- Charcos, barro y el caracol -----------------------------------------------------
        const puddle = { grip: 0.55, drag: 0.9, cap: 0.6, name: 'charco', marks: false, splash: true, dust: 0xbfe8ff };
        const mud = { grip: 0.45, drag: 1.4, cap: 0.5, name: 'barro', marks: true, dust: 0x7a5232 };
        for (const [x, z, r, s] of [[22, -44.5, 4, 1], [36, 16, 3.6, 3]]) { C.add(splat(r, '#6fb8e8', { x, z, seed: s, opacity: 0.8 })); C.hazard({ x, z, r: r * 0.92 }, puddle); }
        C.add(splat(4.4, '#6b4423', { x: -62, z: 30, seed: 6, opacity: 0.95 })); C.hazard({ x: -62, z: 30, r: 4.1 }, mud);
        const snail = new THREE.Group();
        const shell = mesh(new THREE.TorusKnotGeometry(1.3, 0.75, 48, 8, 1, 3), '#d98a3a');
        shell.position.y = 2; snail.add(shell);
        const body = mesh(new THREE.CapsuleGeometry(0.8, 4, 6, 10), '#e8d6a8', { y: 0.7, rz: Math.PI / 2 });
        snail.add(body);
        for (const s of [-0.4, 0.4]) snail.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6), '#e8d6a8', { x: 2.6, y: 1.8, z: s, rz: -0.4 }));
        C.add(snail);
        const sn = C.at(C.len * 0.55);
        const snailCol = C.circle(sn.x, sn.z, 2.2, { h: 2.6 });
        C.anim((dt, t) => {
            // cruza la pista de lado a lado, ida y vuelta, muy despacio
            const k = Math.sin(t * 0.06) * (C.width / 2 + 2);
            const p = C.at(C.len * 0.55, k);
            snail.position.set(p.x, 0, p.z);
            snail.rotation.y = p.h + Math.PI / 2 * (Math.cos(t * 0.06) > 0 ? 1 : -1);
            snailCol.x = p.x; snailCol.z = p.z;
            body.scale.x = 1 + Math.sin(t * 3) * 0.06;
        });
        // el caracol se mueve: la rejilla de choques se actualiza cada segundo
        let gridT = 0; C.anim(dt => { gridT += dt; if (gridT > 1) { gridT = 0; C.finalize(); } });

        // --- Aspersor (solo decorado) -----------------------------------------------------
        const spr = new THREE.Group();
        spr.add(mesh(new THREE.CylinderGeometry(0.6, 0.9, 1.6, 10), '#1e2130', { y: 0.8 }));
        const jet = new THREE.Group();
        const dropGeo = new THREE.SphereGeometry(0.22, 6, 5), dropMat = new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.8 });
        for (let i = 0; i < 26; i++) { const d = new THREE.Mesh(dropGeo, dropMat); const u = i / 25; d.position.set(u * 16, 1.6 + Math.sin(u * Math.PI) * 6, 0); jet.add(d); }
        spr.add(jet);
        spr.position.set(-40, 0, 52);
        C.add(spr); C.circle(-40, 52, 1);
        C.anim((dt, t) => { jet.rotation.y = Math.sin(t * 0.7) * 1.4; });

        // --- Tabla sobre un ladrillo (trampolín) y placas de turbo ---------------------------
        const rp = C.at(C.len * 0.07);
        const plank = new THREE.Group();
        plank.add(mesh(wedgeGeo(7.5, 8, 2.2), '#b9814a'));
        plank.add(mesh(new THREE.BoxGeometry(5, 2.2, 2.4), '#b5654a', { y: 1.1, z: 2.8 }));
        plank.position.set(rp.x, 0, rp.z); plank.rotation.y = rp.h;
        C.add(plank); C.ramp(rp.x, rp.z, 7.5, 8, rp.h, 2.2);
        for (const d of [C.len * 0.35, C.len * 0.75]) {
            const b = C.at(d);
            const pad = boostPad(5, 6); pad.position.set(b.x, 0.04, b.z); pad.rotation.y = b.h;
            C.add(pad); C.boost(b.x, b.z, 5, 6, b.h);
            C.anim((dt, t) => { pad.userData.tex.offset.y = -(t * 1.5 % 1); });
        }
        C.finalize();
    }
};

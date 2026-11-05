// ============================================================================
//  PASEO NOCTURNO (entre la Parte 3 y el mirador)
// ============================================================================
// Una carretera en bucle infinito alrededor de un lago con forma de corazón, de noche,
// con farolillos, luciérnagas y la luna reflejada en el agua. El Tesla da vueltas solo,
// sin prisa, y la cámara va cambiando de plano. No hay preguntas: es el momento de
// hablar tranquilos. Al pulsar "Continuar" (o A en el mando / Enter) se sigue hasta el
// mirador para la última pregunta.
//
// El escenario está lejos del recorrido (la niebla lo aísla), como el del examen.
// ============================================================================
import * as THREE from 'three';
import { toon, model, heartGeometry } from './assets.js';
import { UI } from './ui.js';

const O = new THREE.Vector3(-6000, 0, 6000);   // origen del escenario (lejos de todo)
const Y = 0.3;                                  // altura del asfalto
const A = 46, B = 30;                           // semiejes de la carretera (elipse)
const LANE = -1.3;                              // el coche va por el carril derecho (el de dentro, junto al lago)
const SPEED = 5.2;                              // unidades/s: un paseo tranquilo

const M = {};
const mat = (c, o) => { const k = c + JSON.stringify(o || {}); return M[k] || (M[k] = toon(c, o)); };

// Punto de la elipse para el parámetro t (0..2π) y su tangente (sentido antihorario)
function ellipse(t, off = 0) {
    const x = A * Math.cos(t), z = B * Math.sin(t);
    const tx = -A * Math.sin(t), tz = B * Math.cos(t);
    const L = Math.hypot(tx, tz);
    const nx = tz / L, nz = -tx / L;        // normal hacia fuera
    return { x: x + nx * off, z: z + nz * off, tx: tx / L, tz: tz / L, nx, nz };
}

// Cinta de carretera a lo largo de la elipse
function ribbon(width, y, color, off = 0, seg = 240, opts = {}) {
    const pos = [], idx = [];
    for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        const a = ellipse(t, off - width / 2), b = ellipse(t, off + width / 2);
        pos.push(a.x, y, a.z, b.x, y, b.z);
        if (i < seg) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }   // cara hacia arriba
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, opts.basic ? new THREE.MeshBasicMaterial({ color, toneMapped: false }) : mat(color, { polygonOffset: true, polygonOffsetFactor: opts.po || -2, polygonOffsetUnits: opts.po || -2 }));
    m.receiveShadow = true;
    return m;
}

// Lago con forma de corazón
function heartLake(s) {
    const h = new THREE.Shape();
    h.moveTo(0, -0.62 * s);
    h.bezierCurveTo(-0.2 * s, -0.42 * s, -0.75 * s, -0.12 * s, -0.75 * s, 0.22 * s);
    h.bezierCurveTo(-0.75 * s, 0.56 * s, -0.35 * s, 0.7 * s, 0, 0.42 * s);
    h.bezierCurveTo(0.35 * s, 0.7 * s, 0.75 * s, 0.56 * s, 0.75 * s, 0.22 * s);
    h.bezierCurveTo(0.75 * s, -0.12 * s, 0.2 * s, -0.42 * s, 0, -0.62 * s);
    return h;
}

function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,248,220,1)'); gr.addColorStop(0.3, 'rgba(255,230,170,0.6)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

async function fit(key, h) {
    const o = await model(key);
    const s = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());
    o.scale.multiplyScalar(h / (s.y || 1));
    return o;
}

async function build(app) {
    const root = new THREE.Group();
    root.name = 'paseo';
    root.position.copy(O);
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

    // Prado (tapa el mar dentro de la niebla)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), mat('#3f7a52'));
    ground.position.y = Y - 0.02; ground.receiveShadow = true; root.add(ground);

    // Carretera: arcén, asfalto, líneas laterales y discontinua central
    root.add(ribbon(7.4, Y + 0.005, '#d8cdb2', 0, 240, { po: -1 }));
    root.add(ribbon(5.4, Y + 0.012, '#5d6378', 0, 240, { po: -2 }));
    for (const off of [-2.45, 2.45]) root.add(ribbon(0.14, Y + 0.02, '#e9e4d6', off, 240, { po: -3 }));
    const dashes = [];
    const N = 70;
    for (let i = 0; i < N; i++) {
        const t0 = (i / N) * Math.PI * 2, t1 = t0 + (Math.PI * 2 / N) * 0.5;
        const a = ellipse(t0), b = ellipse(t1);
        const g = new THREE.PlaneGeometry(0.16, Math.hypot(b.x - a.x, b.z - a.z)).rotateX(-Math.PI / 2);
        g.rotateY(Math.atan2(b.x - a.x, b.z - a.z));
        g.translate((a.x + b.x) / 2, Y + 0.025, (a.z + b.z) / 2);
        dashes.push(g);
    }
    const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
    root.add(new THREE.Mesh(mergeGeometries(dashes), new THREE.MeshToonMaterial({ color: '#ffd23f', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));

    // Lago con forma de corazón en el centro, la luna reflejada y nenúfares
    const lakeGeo = new THREE.ShapeGeometry(heartLake(30), 40).rotateX(-Math.PI / 2);   // cabe dentro del bucle
    const shore = new THREE.Mesh(new THREE.ShapeGeometry(heartLake(32), 40).rotateX(-Math.PI / 2), mat('#b8a57e'));
    shore.position.y = Y + 0.01; root.add(shore);
    const lake = new THREE.Mesh(lakeGeo, new THREE.MeshToonMaterial({ color: '#1d3566', emissive: new THREE.Color('#0d1a3a'), emissiveIntensity: 0.6 }));
    lake.position.y = Y + 0.03; root.add(lake);
    const glow = glowTexture();
    const reflect = new THREE.Mesh(new THREE.CircleGeometry(4, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    reflect.scale.set(1, 1, 2.2); reflect.position.set(-4, Y + 0.05, -8); root.add(reflect);
    for (let i = 0; i < 9; i++) {
        try {
            const l = await fit('nature/lily_large', 0.2);
            l.position.set((rnd() - 0.5) * 24, Y + 0.04, (rnd() - 0.5) * 14 - 1);
            l.scale.multiplyScalar(2.2); l.rotation.y = rnd() * 6; root.add(l);
        } catch (e) { /* sin nenúfares */ }
    }

    // Luna grande sobre el lago
    const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: '#fff6dc', fog: false, toneMapped: false }));
    moon.position.set(-30, 85, -230); root.add(moon);
    const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#fff2c8', transparent: true, opacity: 0.5, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    moonHalo.scale.setScalar(52); moonHalo.position.copy(moon.position).z += 1; root.add(moonHalo);

    // Farolillos a lo largo de la carretera (por fuera), con su halo
    const lanternSrc = await fit('town/lantern', 2.3);
    const halos = [];
    for (let i = 0; i < 26; i++) {
        const t = (i / 26) * Math.PI * 2;
        const p = ellipse(t, 4.6);
        const l = lanternSrc.clone(true);
        l.position.set(p.x, Y, p.z); root.add(l);
        const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: '#ffd59a', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        h.scale.setScalar(1.8); h.position.set(p.x, Y + 2.25, p.z); root.add(h);
        halos.push(h);
    }

    // Bosque alrededor (fuera de la carretera) y algunos árboles junto al lago
    const kinds = ['nature/tree_pineRoundA', 'nature/tree_pineTallA', 'nature/tree_cone', 'nature/tree_default', 'nature/tree_oak'];
    const srcs = [];
    for (const k of kinds) srcs.push(await fit(k, 1));
    const forest = new THREE.Group();
    for (let i = 0; i < 190; i++) {
        const t = rnd() * Math.PI * 2;
        const off = 8 + Math.pow(rnd(), 0.7) * 70;
        const p = ellipse(t, off);
        const o = srcs[i % srcs.length].clone(true);
        o.scale.multiplyScalar(4 + rnd() * 4);
        o.position.set(p.x, Y, p.z); o.rotation.y = rnd() * 6;
        forest.add(o);
    }
    for (let i = 0; i < 16; i++) {
        const t = rnd() * Math.PI * 2;
        const p = ellipse(t, -7 - rnd() * 3);
        if (Math.abs(p.x) < 25 && Math.abs(p.z) < 20) continue;     // dentro del lago no
        const o = srcs[3 + (i % 2)].clone(true);
        o.scale.multiplyScalar(3.4 + rnd() * 1.6);
        o.position.set(p.x, Y, p.z); o.rotation.y = rnd() * 6;
        forest.add(o);
    }
    forest.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.add(forest);

    // Banco junto al lago con un corazón encima (vuestro sitio)
    const bench = new THREE.Group();
    const wood = mat('#7a4f2e');
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.6), wood); seat.position.y = 0.5; bench.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.1), wood); back.position.set(0, 0.85, -0.26); bench.add(back);
    for (const x of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), mat('#3a3f52')); leg.position.set(x, 0.25, 0); bench.add(leg); }
    const bp = ellipse(Math.PI * 0.5, -5.2);
    bench.position.set(bp.x, Y, bp.z); bench.rotation.y = Math.PI; root.add(bench);
    const heart = new THREE.Mesh(heartGeometry(), toon('#ff4d8d', { emissive: new THREE.Color('#ff4d8d'), emissiveIntensity: 0.5 }));
    heart.scale.setScalar(0.45); heart.position.set(bp.x, Y + 2.1, bp.z); root.add(heart);

    // Luciérnagas
    const fN = 160, fpos = new Float32Array(fN * 3), fph = new Float32Array(fN);
    for (let i = 0; i < fN; i++) {
        const t = rnd() * Math.PI * 2, p = ellipse(t, (rnd() - 0.4) * 22);
        fpos[i * 3] = p.x; fpos[i * 3 + 1] = Y + 0.6 + rnd() * 2.6; fpos[i * 3 + 2] = p.z; fph[i] = rnd() * 6.28;
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    const fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#fff3a0', size: 0.22, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    fireflies.frustumCulled = false;
    root.add(fireflies);

    // Luz de luna suave (la noche del juego es muy oscura para un sitio tan grande)
    const moonLight = new THREE.HemisphereLight('#b9c6ff', '#2a4a3a', 0.9);
    root.add(moonLight);

    root.visible = false;
    app.engine.scene.add(root);
    return { root, halos, heart, fireflies, fpos, fph, reflect };
}

export async function buildPaseo(app) {
    const W = await build(app);

    // Da vueltas hasta que se pulse "Continuar". input: el del examen (A en el mando / Enter pulsa el botón)
    async function run({ input } = {}) {
        const { car, rig, engine } = app;
        const pose = { pos: new THREE.Vector3(), h: 0, v: SPEED, acc: 0, yawRate: 0, dist: 0 };
        let t = -Math.PI / 2, dist = 0;      // empieza en el lado sur, mirando hacia el lago
        const shotPos = new THREE.Vector3(), shotLook = new THREE.Vector3();
        rig.fixed(shotPos, shotLook, 1.0, { amount: 0.8, focus: 0.5, range: 0.3 });
        const fixedMode = rig.mode;
        let shot = 0, shotT = 0;
        app.paseoDebug = { setShot: (n) => { shot = (n + SHOTS - 1) % SHOTS; shotT = 99; } };
        const SHOTS = 4;

        const place = (dt) => {
            // velocidad constante a lo largo de la elipse
            const p0 = ellipse(t, LANE);
            const sp = Math.hypot(-A * Math.sin(t), B * Math.cos(t));
            t += (SPEED * dt) / sp;
            const p = ellipse(t, LANE);
            dist += SPEED * dt;
            const h = Math.atan2(p.tx, p.tz);
            const dh = Math.atan2(Math.sin(h - Math.atan2(p0.tx, p0.tz)), Math.cos(h - Math.atan2(p0.tx, p0.tz)));
            pose.yawRate = dt > 0 ? dh / dt : 0;
            pose.pos.set(O.x + p.x, Y - 0.02, O.z + p.z);
            pose.h = h; pose.dist = dist; pose.v = SPEED;
            car.setFree(pose);
            car.root.position.copy(pose.pos);
            car.root.rotation.y = h;
            return p;
        };

        // Planos de cámara que se van alternando
        const frame = (p, dt) => {
            shotT += dt;
            let cut = false;
            if (shotT > 11) { shotT = 0; shot = (shot + 1) % SHOTS; cut = true; if (shot === 0) rig.chase(); else if (rig.mode !== fixedMode) { rig.mode = fixedMode; rig.stiffness = 2.5; } }
            const cx = O.x + p.x, cz = O.z + p.z;
            if (shot === 1) {          // de lado, desde el lago, con los farolillos detrás
                shotPos.set(cx - p.nx * 8.5, Y + 2.6, cz - p.nz * 8.5);
                shotLook.set(cx, Y + 0.9, cz);
            } else if (shot === 2) {   // vista alta: el lago con forma de corazón y el coche dando la vuelta
                shotPos.set(cx + p.nx * 14 - p.tx * 6, Y + 17, cz + p.nz * 14 - p.tz * 6);
                shotLook.set(O.x + p.x * 0.45, Y, O.z + p.z * 0.45);
            } else if (shot === 3) {   // por delante, el coche viene hacia la cámara con la luna detrás
                const a = ellipse(t + 0.32, LANE + 1.5);
                shotPos.set(O.x + a.x, Y + 1.6, O.z + a.z);
                shotLook.set(cx, Y + 1.1, cz);
            }
            fixedMode.p.copy(shotPos); fixedMode.l.copy(shotLook);
            if (cut) rig.snap();       // corte limpio entre planos
        };

        // Arranque
        W.root.visible = true;
        const p0 = place(0);
        rig.chase();
        frame(p0, 0);
        rig.snap();

        let off;
        const pad = input ? input.padUI(engine) : null;
        const promptEl = document.getElementById('prompt');
        promptEl.classList.add('compact');      // pequeño, en una esquina: que se vea el paseo
        const done = UI.prompt('🌙 Paseo bajo las estrellas', 'Continuar 💍');
        off = engine.onUpdate((dt, time) => {
            const p = place(dt);
            frame(p, dt);
            W.heart.rotation.y = time * 0.8;
            W.heart.position.y = O.y + Y + 2.1 + Math.sin(time * 1.6) * 0.12;
            for (let i = 0; i < W.halos.length; i++) W.halos[i].material.opacity = 0.7 + Math.sin(time * 3 + i * 1.3) * 0.15;
            const fp = W.fpos;
            for (let i = 0; i < W.fph.length; i++) fp[i * 3 + 1] += Math.sin(time * 1.3 + W.fph[i]) * dt * 0.25;
            W.fireflies.geometry.attributes.position.needsUpdate = true;
            W.fireflies.material.opacity = 0.65 + Math.sin(time * 2.2) * 0.25;
            W.reflect.material.opacity = 0.45 + Math.sin(time * 0.9) * 0.1;
        });
        await done;
        setTimeout(() => promptEl.classList.remove('compact'), 600);
        if (pad) pad();
        off();
    }

    function leave() {
        W.root.visible = false;
        app.car.setFree(null);
    }

    return { run, leave };
}

// Cielo, luces, mar, terreno y vegetación.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { toon, loadModel, model, textPlane } from './assets.js';
import { variants, treeMaterial, treeMaterialStatic, updateWind } from './nature.js';

// Aleatorio con semilla: el mundo sale igual cada vez
export function rng(seed = 1) {
    return () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

const VIEW_DIST = 300;   // más allá no se dibuja nada (lo tapa la niebla)

export class World {
    constructor(engine, track) {
        this.engine = engine;
        this.scene = engine.scene;
        this.track = track;
        this.clearZones = [];
        this.cullables = [];
        this.trees = [];            // árboles a plantar: { kind, x, y, z, scale, rot }
        this.treeGrid = new Map();  // índice espacial para ocultar los que tapan la cámara
        this.hiddenTrees = new Set();
        this.focus = new THREE.Vector3();   // punto de interés (el coche)
        this._buildSkies();
        this._buildSky();
        this._buildLights();
        this._buildSea();
        engine.onUpdate((dt, t) => this._update(dt, t));
    }

    // --- Cielo --------------------------------------------------------------------

    _buildSkies() {
        this.presets = {};
        for (const [name, p] of Object.entries(CONFIG.skies)) {
            const c = {};
            for (const [k, v] of Object.entries(p)) c[k] = typeof v === 'string' ? new THREE.Color(v) : Array.isArray(v) ? new THREE.Vector3(...v).normalize() : v;
            if (c.bugs === undefined) c.bugs = c.stars;     // luciérnagas: de noche
            if (c.quiet === undefined) c.quiet = 0;         // 1 = sin ambiente (espacio, Marte)
            this.presets[name] = c;
        }
        this._tmp = new THREE.Color();
        this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3);
    }

    _buildSky() {
        this.skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
        this.dome = new THREE.Mesh(
            new THREE.SphereGeometry(800, 32, 16),
            new THREE.ShaderMaterial({
                uniforms: this.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
                vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
                fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
                    void main(){ float h = smoothstep(-0.05, 0.6, vP.y); gl_FragColor = vec4(mix(bottom, top, h), 1.); }`
            })
        );
        this.dome.renderOrder = -1;
        this.dome.frustumCulled = false;
        this.scene.add(this.dome);
        this.scene.fog = new THREE.Fog(0xffffff, 110, VIEW_DIST + 20);

        const r = rng(7), n = 700, pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const th = r() * Math.PI * 2, ph = Math.acos(0.05 + r() * 0.95);
            pos.set([Math.sin(ph) * Math.cos(th) * 700, Math.cos(ph) * 700, Math.sin(ph) * Math.sin(th) * 700], i * 3);
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
        this.stars.frustumCulled = false;
        this.scene.add(this.stars);
        // En el espacio hay estrellas en todas direcciones (también por debajo)
        const n2 = 900, pos2 = new Float32Array(n2 * 3);
        for (let i = 0; i < n2; i++) {
            const u = r() * 2 - 1, th = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
            pos2.set([rr * Math.cos(th) * 650, u * 650, rr * Math.sin(th) * 650], i * 3);
        }
        const sg2 = new THREE.BufferGeometry(); sg2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
        this.starsAll = new THREE.Points(sg2, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
        this.starsAll.frustumCulled = false;
        this.starsAll.visible = false;
        this.scene.add(this.starsAll);
        this.spaceK = 0;

        // Luciérnagas alrededor del coche (de noche)
        const fn = 140, fpos = new Float32Array(fn * 3);
        for (let i = 0; i < fn; i++) fpos.set([(r() - 0.5) * 70, 0.6 + r() * 3, (r() - 0.5) * 70], i * 3);
        const fg = new THREE.BufferGeometry();
        fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
        // puntos redondos y difuminados (sin textura se veían como cuadrados por toda la pantalla)
        const dc = document.createElement('canvas'); dc.width = dc.height = 64;
        const dg = dc.getContext('2d'), grd = dg.createRadialGradient(32, 32, 0, 32, 32, 32);
        grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        dg.fillStyle = grd; dg.fillRect(0, 0, 64, 64);
        this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: 0xd8ff7a, map: new THREE.CanvasTexture(dc), size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.fireflies.frustumCulled = false;
        this.scene.add(this.fireflies);
    }

    _buildLights() {
        this.hemi = new THREE.HemisphereLight(0xffffff, 0x88aa66, 1);
        this.scene.add(this.hemi);
        this.sun = new THREE.DirectionalLight(0xffffff, 2);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(1024, 1024);
        const c = this.sun.shadow.camera;
        c.left = -24; c.right = 24; c.top = 24; c.bottom = -24; c.near = 1; c.far = 220;
        this.sun.shadow.bias = -0.0008;
        this.sun.shadow.normalBias = 0.03;
        this.scene.add(this.sun, this.sun.target);
    }

    _buildSea() {
        this.seaMat = toon('#3fc6d8', { transparent: true, opacity: 0.86 });
        this.sea = new THREE.Mesh(new THREE.CircleGeometry(900, 64), this.seaMat);
        this.sea.rotation.x = -Math.PI / 2;
        this.sea.receiveShadow = true;
        this.sea.frustumCulled = false;
        this.scene.add(this.sea);
    }

    // Mezcla de dos cielos (t = 0 → a, 1 → b). Se llama cada frame según la posición del coche.
    setSkyMix(a, b, t = 0) {
        const A = this.presets[a] || this.presets.morning, B = this.presets[b] || A;
        t = THREE.MathUtils.clamp(t, 0, 1);
        const c = (k, target) => target.copy(A[k]).lerp(B[k], t);
        const n = (k) => A[k] + (B[k] - A[k]) * t;
        c('top', this.skyUniforms.top.value);
        c('bottom', this.skyUniforms.bottom.value);
        c('fog', this.scene.fog.color);
        c('sun', this.sun.color);
        c('hemiSky', this.hemi.color);
        c('hemiGround', this.hemi.groundColor);
        c('sea', this.seaMat.color);
        this.sun.intensity = n('sunI') * (this.sunScale ?? 1);
        this.hemi.intensity = n('hemiI') * (this.hemiScale ?? 1);
        this.stars.material.opacity = n('stars');
        this.fireflyBase = Math.max(0, n('bugs') - 0.3) * 1.3;
        this.quiet = n('quiet');
        this.sunDir.copy(A.sunPos).lerp(B.sunPos, t).normalize();
        this.nightness = n('stars');
    }

    // Compatibilidad: fija un cielo
    setSky(name) { this.setSkyMix(name, name, 0); }

    // --- Terreno -------------------------------------------------------------------------

    buildTerrain() {
        const t = this.track;
        const T = 24;                                 // tamaño de baldosa
        const segs = this.engine.lite ? 14 : 22;
        const tiles = new Set();
        for (let s = 0; s < t.length; s += 6) {
            const f = t.frame(s);
            const bio = t.biomeAt(s);
            const w = t.islandWeight(s);
            if (w < 0.05) continue;
            const reach = Math.max(bio.wl, bio.wr) * w + 8;
            for (let d = -reach; d <= reach; d += T / 2) {
                const x = f.x + f.nx * d, z = f.z + f.nz * d;
                tiles.add(`${Math.floor(x / T)},${Math.floor(z / T)}`);
            }
        }
        const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: grainTexture() });
        this.terrainMat = mat;
        this.underwaterClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2)];   // en el espacio: sin fondo marino
        const info = {};
        const rock = new THREE.Color('#9b8d78'), rockDark = new THREE.Color('#7d705f');
        const dry = new THREE.Color('#bfb46a'), dirt = new THREE.Color('#a8865c'), white = new THREE.Color('#ffffff');
        const nrm = new THREE.Vector3();
        let built = 0;
        for (const key of tiles) {
            const [cx, cz] = key.split(',').map(Number);
            const x0 = cx * T, z0 = cz * T;
            const cands = t.candidates(x0, z0, x0 + T, z0 + T);
            if (!cands.length) continue;
            const geo = new THREE.PlaneGeometry(T, T, segs, segs);
            geo.rotateX(-Math.PI / 2);
            geo.translate(x0 + T / 2, 0, z0 + T / 2);
            const pos = geo.attributes.position;
            const uv = geo.attributes.uv;
            const colors = new Float32Array(pos.count * 3);
            const base = [];
            let maxH = -99;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), z = pos.getZ(i);
                const h = t.heightAt(x, z, cands, info);
                pos.setY(i, h);
                uv.setXY(i, x / 5, z / 5);     // textura de grano en coordenadas de mundo
                maxH = Math.max(maxH, h);
                base.push(info.color ? info.color.clone() : new THREE.Color('#e0d0a0'), h);
            }
            if (maxH < -1.5) { geo.dispose(); continue; }
            geo.computeVertexNormals();
            const nor = geo.attributes.normal;
            for (let i = 0; i < pos.count; i++) {
                const c = base[i * 2], h = base[i * 2 + 1];
                const x = pos.getX(i), z = pos.getZ(i);
                nrm.set(nor.getX(i), nor.getY(i), nor.getZ(i));
                if (h > 0.4) {
                    // manchas de prado seco y de tierra
                    const m1 = Math.sin(x * 0.061 + z * 0.043) * Math.sin(x * 0.027 - z * 0.071 + 1.7);
                    const m2 = Math.sin(x * 0.19 + 0.5) * Math.cos(z * 0.17 - 0.3);
                    if (m1 > 0.35) c.lerp(dry, (m1 - 0.35) * 0.9);
                    if (m2 > 0.75 && m1 < 0) c.lerp(dirt, (m2 - 0.75) * 1.6);
                    // roca en las pendientes fuertes
                    const slope = 1 - nrm.y;
                    if (slope > 0.12) c.lerp(slope > 0.3 ? rockDark : rock, THREE.MathUtils.smoothstep(slope, 0.12, 0.32));
                }
                if (h > -0.1 && h < 0.16) c.lerp(white, 0.45);      // espuma en la orilla
                c.multiplyScalar(1.12);                               // compensa la textura de grano
                colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
            }
            geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geo.computeBoundingSphere();
            const mesh = new THREE.Mesh(geo, mat);
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            this.cull(mesh, new THREE.Vector3(x0 + T / 2, 0, z0 + T / 2), T);
            built++;
        }
        this.tileCount = built;
    }

    reserve(x, z, radius) { this.clearZones.push({ x, z, radius }); }

    _isFree(x, z, roadMargin) {
        for (const c of this.clearZones) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.radius ** 2) return false;
        if (this.track.distanceToRoad(x, z) < roadMargin) return false;
        return true;
    }

    // Objetos que se ocultan cuando están lejos de la cámara
    cull(obj, center, radius) { this.cullables.push({ obj, center: center.clone(), radius }); }

    // --- Vegetación y paisaje por bioma ------------------------------------------------

    // Plantar un árbol procedural (se instancia todo junto en buildTrees)
    plantTree(kind, x, z, scale = 1, rot = 0, y = null) {
        this.trees.push({ kind, x, y: y ?? this.track.heightAt(x, z), z, scale, rot });
    }

    async scatter() {
        const t = this.track;
        const r = rng(42);
        const lite = this.engine.lite;
        // [tipo, densidad por unidad², franja máxima desde la carretera]
        const D = {
            island: [['oak', 1 / 110], ['umbrella', 1 / 170], ['cypress', 1 / 320], ['olive', 1 / 260], ['palm', 1 / 420], ['bush', 1 / 120], ['grass', 1 / 14, 14], ['flower', 1 / 45], ['rock', 1 / 300]],
            city: [['oak', 1 / 170], ['cypress', 1 / 260], ['bush', 1 / 150], ['grass', 1 / 26, 12], ['flower', 1 / 60]],
            beach: [['palm', 1 / 55], ['bush', 1 / 260], ['rock', 1 / 220], ['grass', 1 / 60, 10]],
            cliff: [['umbrella', 1 / 110], ['cypress', 1 / 200], ['oak', 1 / 190], ['grass', 1 / 12, 16], ['flower', 1 / 35], ['rock', 1 / 160]],
            desert: [['cactus', 1 / 90], ['rock', 1 / 140], ['mesa', 1 / 900]],
            forest: [['nightpine', 1 / 13], ['bush', 1 / 90], ['grass', 1 / 30, 12], ['flower', 1 / 90], ['rock', 1 / 260]],
            mountain: [['pine', 1 / 24], ['umbrella', 1 / 140], ['rock', 1 / 90], ['bush', 1 / 100], ['grass', 1 / 28, 10], ['flower', 1 / 110]],
            urban: [],
            volcanic: [['cactus', 1 / 110], ['palm', 1 / 260], ['rock', 1 / 70], ['bush', 1 / 300]],
            mars: [['rock', 1 / 55]],
            country: [['oak', 1 / 100], ['umbrella', 1 / 220], ['cypress', 1 / 260], ['grass', 1 / 20, 12], ['flower', 1 / 50], ['turbine', 1 / 2200], ['farm', 1 / 2600]]
        };
        const PROC = new Set(['oak', 'umbrella', 'cypress', 'olive', 'palm', 'bush', 'grass', 'pine', 'nightpine', 'rock']);
        const MODELS = {
            flower: ['nature/flower_redA', 'nature/flower_yellowA', 'nature/flower_purpleA', 'nature/grass_large'],
            rock: ['nature/rock_largeA', 'nature/rock_largeB', 'nature/rock_tallA'],
            cactus: ['nature/cactus_tall', 'nature/cactus_short']
        };
        const SCALE = { oak: [0.85, 1.35], umbrella: [0.9, 1.3], cypress: [0.8, 1.2], olive: [0.9, 1.3], palm: [0.9, 1.25], bush: [0.8, 1.5], grass: [0.8, 1.5], pine: [0.9, 1.5], nightpine: [1, 1.7], flower: [0.9, 1.4], rock: [0.6, 1.3], cactus: [1, 1.7] };
        const MARGIN = { oak: 3.6, umbrella: 3.6, cypress: 3.2, olive: 3.4, palm: 3.4, bush: 2.6, grass: 1.9, pine: 3.4, nightpine: 3.6, flower: 2, rock: 2.8, cactus: 3, mesa: 30, turbine: 14, farm: 9 };

        const CH = 140;
        for (let s0 = 0; s0 < t.length; s0 += CH) {
            const per = new Map();
            const special = [];
            const center = t.point(s0 + CH / 2, 0);
            for (let s = s0; s < s0 + CH; s += 2) {
                const w = t.islandWeight(s);
                if (w < 0.2) continue;
                const bio = t.biomeAt(s);
                const reg = t.regionAt(s);
                const biome = (reg.type === 'highway' || reg.type === 'roadtrip') ? 'country' : reg.approach === 'ronda' ? 'urban' : t.placeAt(s).biome;
                for (const [kind, dens, band] of D[biome] || D.island) {
                    const wl = band ? Math.min(band, bio.wl * w) : bio.wl * w;
                    const wr = band ? Math.min(band, bio.wr * w) : bio.wr * w;
                    const width = wl + wr;
                    let expected = dens * width * 2 * (lite && kind !== 'mesa' ? 0.5 : 1);
                    while (expected > 0) {
                        if (r() > expected) break;
                        expected -= 1;
                        const d = -wl + r() * width;
                        const f = t.frame(s + r() * 2);
                        const x = f.x + f.nx * d, z = f.z + f.nz * d;
                        const h = t.heightAt(x, z);
                        if (h < 0.5) continue;
                        if ((d < 0 ? -d - t.leftExtra : d) < MARGIN[kind] || !this._isFree(x, z, MARGIN[kind])) continue;
                        if (d < 0 && -d < t.corridorLeft(s) + 2.5) continue;   // calzada contraria
                        if (kind === 'mesa' || kind === 'turbine' || kind === 'farm') { special.push({ kind, x, y: h, z, r: r(), rot: Math.atan2(f.tx, f.tz) }); continue; }
                        const sc = SCALE[kind];
                        const scale = sc[0] + r() * (sc[1] - sc[0]);
                        if (PROC.has(kind)) { this.plantTree(kind, x, z, scale, r() * Math.PI * 2, h - 0.05); continue; }
                        const list = MODELS[kind];
                        const key = list[Math.floor(r() * list.length)];
                        const m = new THREE.Matrix4().compose(
                            new THREE.Vector3(x, h - 0.05, z),
                            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2),
                            new THREE.Vector3().setScalar(scale)
                        );
                        if (!per.has(key)) per.set(key, []);
                        per.get(key).push(m);
                    }
                }
            }
            const group = new THREE.Group();
            for (const [key, mats] of per) group.add(await instanced(key, mats));
            for (const sp of special) {
                if (sp.kind === 'mesa') group.add(mesa(sp));
                else if (sp.kind === 'turbine') group.add(this._turbine(sp));
                else group.add(await this._farm(sp));
            }
            this.scene.add(group);
            this.cull(group, center, CH);
        }
    }

    // Instancia todos los árboles plantados, por zonas de 50x50 y por variante
    buildTrees() {
        const ZONE = 64;    // equilibrio entre llamadas de dibujo y recorte (también en las sombras)
        const zones = new Map();
        for (const tr of this.trees) {
            const k = `${Math.floor(tr.x / ZONE)},${Math.floor(tr.z / ZONE)}`;
            if (!zones.has(k)) zones.set(k, []);
            zones.get(k).push(tr);
        }
        const mat = treeMaterial();
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        for (const [k, list] of zones) {
            const [cx, cz] = k.split(',').map(Number);
            const group = new THREE.Group();
            const byVar = new Map();
            for (const tr of list) {
                const vars = variants(tr.kind, tr.kind === 'grass' ? 2 : 3);
                const vi = Math.floor(Math.abs(Math.sin(tr.x * 12.9 + tr.z * 78.2)) * vars.length) % vars.length;
                const key = tr.kind + vi;
                if (!byVar.has(key)) byVar.set(key, { geo: vars[vi], list: [] });
                byVar.get(key).list.push(tr);
            }
            for (const { geo, list: L } of byVar.values()) {
                const im = new THREE.InstancedMesh(geo, mat, L.length);
                L.forEach((tr, i) => {
                    q.setFromAxisAngle(up, tr.rot);
                    m4.compose(new THREE.Vector3(tr.x, tr.y, tr.z), q, new THREE.Vector3(tr.scale, tr.scale, tr.scale));
                    im.setMatrixAt(i, m4);
                    tr.mesh = im; tr.index = i; tr.matrix = m4.clone();
                    // Registro para ocultar los árboles que tapan la cámara (la hierba no hace falta)
                    if (!SMALL_KINDS.has(tr.kind)) {
                        const ck = `${Math.floor(tr.x / 8)},${Math.floor(tr.z / 8)}`;
                        if (!this.treeGrid.has(ck)) this.treeGrid.set(ck, []);
                        this.treeGrid.get(ck).push(tr);
                    }
                });
                im.castShadow = !NO_SHADOW.has(L[0].kind);
                if (L[0].kind === 'rock') im.material = treeMaterialStatic();
                im.receiveShadow = true;
                im.computeBoundingSphere();
                group.add(im);
            }
            this.scene.add(group);
            this.cull(group, new THREE.Vector3(cx * ZONE + ZONE / 2, 0, cz * ZONE + ZONE / 2), ZONE);
        }
    }

    // Oculta los árboles pegados a la cámara o que, en pantalla, tapan el coche (y, en los planos
    // fijos, lo que se mira). Antes se miraba solo la línea cámara→punto de mira, que en marcha va
    // unos metros por delante del coche: se ocultaban los de al lado y no los que lo tapaban.
    updateTreeOcclusion(camera, look, car, protectLook) {
        const cam = camera.position;
        camera.updateMatrixWorld();
        const inv = camera.matrixWorldInverse;
        const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect;
        const p = new THREE.Vector3();
        // rectángulo en pantalla (coordenadas normalizadas) de unos puntos en el espacio de la cámara
        const rectOf = (pts, pad = 0) => {
            const R = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, near: 1e9, far: 0 };
            for (const q of pts) {
                const d = Math.max(0.3, -q.z);
                const x = q.x / (d * tanH), y = q.y / (d * tanV);
                R.x0 = Math.min(R.x0, x); R.x1 = Math.max(R.x1, x); R.y0 = Math.min(R.y0, y); R.y1 = Math.max(R.y1, y);
                R.near = Math.min(R.near, -q.z); R.far = Math.max(R.far, -q.z);
            }
            R.x0 -= pad; R.x1 += pad; R.y0 -= pad; R.y1 += pad;
            return R;
        };
        const targets = [];
        if (car && car.root.visible && car.size) {
            const S = car.size, m = car.root.matrixWorld, pts = [];
            for (const x of [-S.x / 2, S.x / 2]) for (const y of [0, S.y]) for (const z of [-S.z / 2, S.z / 2])
                pts.push(new THREE.Vector3(x, y, z).applyMatrix4(m).applyMatrix4(inv));
            if (pts.some(q => q.z < -0.5)) targets.push({ at: car.root.position, R: rectOf(pts, 0.04) });
        }
        if (protectLook && look) {
            const c = p.copy(look).applyMatrix4(inv), r = 3;
            if (c.z < -0.5) targets.push({ at: look, R: rectOf([c.clone().set(c.x - r, c.y - r, c.z), c.clone().set(c.x + r, c.y + r, c.z)]) });
        }
        // Candidatos: celdas a lo largo de la línea cámara→objetivo (y las vecinas)
        const cand = new Set(), visited = new Set();
        const check = (x, z) => {
            const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
                const key = `${cx + a},${cz + b}`;
                if (visited.has(key)) continue;
                visited.add(key);
                const list = this.treeGrid.get(key);
                if (list) for (const tr of list) cand.add(tr);
            }
        };
        check(cam.x, cam.z);
        for (const t of targets) {
            const dx = t.at.x - cam.x, dz = t.at.z - cam.z;
            const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 4));
            for (let i = 1; i <= steps; i++) check(cam.x + dx * i / steps, cam.z + dz * i / steps);
        }
        const want = new Set();
        for (const tr of cand) {
            const [rad0, h0] = TREE_DIM[tr.kind] || [1.5, 3.2];
            const rad = rad0 * tr.scale, top = tr.y + h0 * tr.scale;
            // la cámara dentro de la copa
            if (Math.hypot(cam.x - tr.x, cam.z - tr.z) < rad + 1.2 && cam.y < top + 1) { want.add(tr); continue; }
            if (!targets.length) continue;
            const base = new THREE.Vector3(tr.x, tr.y, tr.z).applyMatrix4(inv);
            const crown = new THREE.Vector3(tr.x, top, tr.z).applyMatrix4(inv);
            if (base.z > -0.3 && crown.z > -0.3) continue;      // detrás de la cámara
            const pts = [];
            for (const q of [base, crown]) pts.push(q.clone().setX(q.x - rad), q.clone().setX(q.x + rad));
            const T = rectOf(pts);
            for (const t of targets) {
                // la copa tiene que quedar por delante del objetivo y solaparse con él en pantalla
                if (T.near - rad * 0.6 > (t.R.near + t.R.far) / 2) continue;
                if (T.x1 < t.R.x0 || T.x0 > t.R.x1 || T.y1 < t.R.y0 || T.y0 > t.R.y1) continue;
                want.add(tr); break;
            }
        }
        const zero = new THREE.Matrix4().makeScale(0, 0, 0);
        const dirty = new Set();
        for (const tr of this.hiddenTrees) if (!want.has(tr)) { tr.mesh.setMatrixAt(tr.index, tr.matrix); dirty.add(tr.mesh); }
        for (const tr of want) if (!this.hiddenTrees.has(tr)) { tr.mesh.setMatrixAt(tr.index, zero); dirty.add(tr.mesh); }
        for (const m of dirty) m.instanceMatrix.needsUpdate = true;
        this.hiddenTrees = want;
    }

    async _farm({ x, y, z, r, rot }) {
        const g = new THREE.Group();
        const house = await model(r < 0.5 ? 'suburb/building-type-a' : 'suburb/building-type-d');
        g.add(house);
        const barn = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 3), toon('#c0392b'));
        barn.position.set(4, 1, 0.5);
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 1.9, 1.2, 4), toon('#7f2a20'));
        roof.rotation.y = Math.PI / 4; roof.scale.set(0.9, 1, 1.25); roof.position.set(4, 2.6, 0.5);
        g.add(barn, roof);
        g.position.set(x, y, z);
        g.rotation.y = rot + Math.PI / 2;
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        return g;
    }

    // Entrada a Barcelona por la Ronda (tramo con approach: 'ronda')
    async decorateApproaches() {
        const t = this.track;
        for (const r of t.regions) {
            if (r.approach !== 'ronda') continue;
            const len = r.s1 - r.s0;
            const chunk = new THREE.Group();
            const LX = -t.leftExtra;   // la calzada propia es más ancha por la izquierda
            const at = (s, side, y = 0) => { const p = t.point(s, side); p.y = (Math.abs(side) < 8 ? t.roadY(s) : p.y) + y; return p; };
            const face = (s, back = false) => t.headingAt(s) + (back ? Math.PI : 0);
            // Calzada paralela (sentido contrario) a la izquierda, con barreras de hormigón
            const strips = (side, width, y0, y1, color, sStart = r.s0 + 6, sEnd = r.s1 - 6) => {
                const pts = [], idx = [];
                let n = 0;
                for (let s = sStart; s <= sEnd; s += 1) {
                    const f = t.frame(s), y = t.roadY(s);
                    for (const w of [-width / 2, width / 2]) {
                        const x = f.x + f.nx * (side + w), z = f.z + f.nz * (side + w);
                        pts.push(x, y + y0 + (y1 - y0) * (w > 0 ? 1 : 0) * 0, z);
                    }
                    const b = pts.length / 3 - 2;
                    if (n > 0) idx.push(b - 2, b - 1, b, b - 1, b + 1, b);
                    n++;
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
                geo.setIndex(idx);
                geo.computeVertexNormals();
                if (geo.attributes.normal.getY(0) < 0) { const ix = geo.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; geo.computeVertexNormals(); }
                const m = new THREE.Mesh(geo, toon(color, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
                m.receiveShadow = true;
                chunk.add(m);
            };
            strips(-6.2 + LX, 6, 0.1, 0.1, '#5d6275');                 // calzada contraria (2 carriles)
            strips(-6.2 + LX, 0.18, 0.16, 0.16, '#ffffff');            // línea entre carriles
            const wall = (side) => {
                const pts = [], idx = []; let n = 0;
                for (let s = r.s0 + 4; s <= r.s1 - 4; s += 1) {
                    const f = t.frame(s), y = t.roadY(s);
                    const x = f.x + f.nx * side, z = f.z + f.nz * side;
                    pts.push(x, y, z, x, y + 0.75, z);
                    const b = pts.length / 3 - 2;
                    if (n > 0) idx.push(b - 2, b, b - 1, b - 1, b, b + 1);
                    n++;
                }
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
                geo.setIndex(idx); geo.computeVertexNormals();
                const m = new THREE.Mesh(geo, toon('#cfccc4', { side: THREE.DoubleSide }));
                m.castShadow = true;
                chunk.add(m);
            };
            wall(-2.2 + LX); wall(t.rightEdge + 0.8); wall(-9.6 + LX);
            // Farolas altas en la mediana
            for (let s = r.s0 + 10; s < r.s1 - 6; s += 16) {
                const lm = await model('roads/light-square-double');
                const h = new THREE.Box3().setFromObject(lm).getSize(new THREE.Vector3()).y || 1;
                lm.scale.multiplyScalar(5.5 / h);
                lm.position.copy(at(s, -2.6 + LX));
                lm.rotation.y = face(s) + Math.PI / 2;
                chunk.add(lm);
            }
            // Pórticos con carteles azules
            const gantries = [
                [0.18, ['Ronda de Dalt · B-20', 'Barcelona ↑']],
                [0.45, ['↑ Barcelona centre', 'Pl. Catalunya · 3 km']],
                [0.72, ['Sortida: Pl. Catalunya', 'Grans Magatzems ↗']]
            ];
            for (const [k, lines] of gantries) {
                const s = r.s0 + len * k;
                const g = new THREE.Group();
                const board = textPlane('', 6.5, { width: 1000, height: 280, bg: '#1d5bbf', fg: '#ffffff', lines, borderColor: '#ffffff', border: 12, radius: 12 });
                board.position.set(-1.5 + LX / 2, 5.6, 0);
                g.add(board);
                for (const dx of [-10.5 + LX, 2.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6.4, 8), toon('#9aa3b5')); p.position.set(dx, 3.2, 0); g.add(p); }
                const beam = new THREE.Mesh(new THREE.BoxGeometry(13.2 - LX, 0.25, 0.25), toon('#9aa3b5')); beam.position.set(-3.95 + LX / 2, 6.4, 0); g.add(beam);
                g.position.copy(at(s, 0));
                g.rotation.y = face(s, true);
                g.traverse(o => { if (o.isMesh) o.castShadow = true; });
                chunk.add(g);
            }
            // Cartel de bienvenida
            const wel = textPlane('', 7, { width: 1100, height: 300, bg: '#ffffff', fg: '#d71f3a', lines: ['Benvinguts a', 'BARCELONA'], borderColor: '#d71f3a', border: 14, radius: 20, font: 'Bangers', weight: 400 });
            const wg = new THREE.Group(); wel.position.y = 3.6; wg.add(wel);
            for (const dx of [-2.6, 2.6]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8), toon('#9aa3b5')); p.position.set(dx, 1.25, 0); wg.add(p); }
            wg.position.copy(at(r.s0 + 12, 7));
            wg.rotation.y = face(r.s0 + 12, true) + 0.4;
            chunk.add(wg);
            // Bloques de edificios a ambos lados (Eixample)
            const keys = ['city/low-detail-building-a', 'city/low-detail-building-b', 'city/low-detail-building-c', 'city/low-detail-building-d', 'city/building-skyscraper-a', 'city/building-d', 'city/building-e'];
            const rr = rng(77);
            for (let s = r.s0 + 8; s < r.s1 - 8; s += 7) {
                for (const side of [-17 + LX - rr() * 8, 9 + rr() * 9]) {
                    const b = await model(keys[Math.floor(rr() * keys.length)]);
                    const h = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).y || 1;
                    b.scale.multiplyScalar((5 + rr() * 7) / h);
                    b.position.copy(t.point(s, side));
                    b.rotation.y = face(s) + Math.floor(rr() * 4) * Math.PI / 2;
                    chunk.add(b);
                }
            }
            // Tráfico en la calzada contraria
            const cars = ['car/taxi', 'car/sedan', 'car/van', 'car/suv', 'car/taxi', 'car/delivery'];
            const movers = [];
            for (let i = 0; i < cars.length; i++) {
                const c = await model(cars[i]);
                chunk.add(c);
                movers.push({ c, u: i / cars.length, lane: (i % 2 ? -4.8 : -7.6) + LX, v: 0.045 + (i % 3) * 0.01 });
            }
            this.engine.onUpdate(dt => {
                if (!chunk.visible) return;
                for (const m of movers) {
                    m.u = (m.u + dt * m.v) % 1;
                    const s = r.s1 - 8 - m.u * (len - 16);
                    m.c.position.copy(at(s, m.lane, 0.05));
                    m.c.rotation.y = face(s, true);
                }
            });
            // En el horizonte: Sagrada Família y Torre Glòries
            const sf = sagradaFamilia();
            sf.position.copy(t.point(r.s1 - 10, -70)); sf.position.y = 0;
            const tg = torreGlories();
            tg.position.copy(t.point(r.s1 + 20, 60)); tg.position.y = 0;
            chunk.add(sf, tg);
            chunk.traverse(o => { if (o.isMesh) { o.castShadow = o.castShadow || false; o.receiveShadow = true; } });
            this.scene.add(chunk);
            this.cull(chunk, t.point((r.s0 + r.s1) / 2, 0), len / 2 + 80);
        }
    }

    // Carteles azules de autopista con la distancia hasta la siguiente parte
    decorateHighways() {
        const t = this.track;
        for (const r of t.regions) {
            if (r.type !== 'highway') continue;
            for (let s = r.s0 + 30; s < r.s1 - 25; s += 70) {
                const km = Math.max(1, Math.round((r.s1 - s) / 12));
                const g = new THREE.Group();
                const board = textPlane('', 5.4, { width: 900, height: 300, bg: '#1d5bbf', fg: '#ffffff', lines: [`↑ ${r.to.zone.label}`, `${r.to.name} · ${km} km`], borderColor: '#ffffff', border: 12, radius: 14 });
                board.position.set(t.offset, 5.2, 0);
                g.add(board);
                for (const dx of [-t.leftEdge - 0.9, t.rightEdge + 0.9]) {
                    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), toon('#9aa3b5'));
                    p.position.set(dx, 3, 0);
                    g.add(p);
                }
                const beam = new THREE.Mesh(new THREE.BoxGeometry(t.width + 2, 0.2, 0.2), toon('#9aa3b5'));
                beam.position.set(t.offset, 5.9, 0);
                g.add(beam);
                const pnt = t.point(s, 0);
                g.position.set(pnt.x, t.roadY(s), pnt.z);
                g.rotation.y = t.headingAt(s) + Math.PI;
                g.traverse(o => { if (o.isMesh) o.castShadow = true; });
                this.scene.add(g);
                this.cull(g, pnt, 6);
            }
        }
    }

    _turbine({ x, y, z, r }) {
        const g = new THREE.Group();
        const white = toon('#f4f6fb');
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 16, 10), white);
        pole.position.y = 8;
        const hub = new THREE.Group();
        hub.position.set(0, 16, 0.5);
        for (let i = 0; i < 3; i++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.12), white);
            blade.position.y = 3.5;
            const arm = new THREE.Group(); arm.rotation.z = i * Math.PI * 2 / 3; arm.add(blade);
            hub.add(arm);
        }
        g.add(pole, hub);
        g.position.set(x, y, z);
        g.rotation.y = r * Math.PI * 2;
        g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        const speed = 0.6 + r;
        this.engine.onUpdate(dt => { hub.rotation.z += dt * speed; });
        return g;
    }

    // Nubes esponjosas que acompañan a la cámara
    buildClouds() {
        const r = rng(3);
        const mat = toon('#ffffff', { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35 });
        this.clouds = [];
        for (let i = 0; i < 16; i++) {
            const g = new THREE.Group();
            const puffs = 3 + Math.floor(r() * 3);
            for (let j = 0; j < puffs; j++) {
                const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2 + r() * 2.2, 1), mat);
                m.position.set(j * 2.8 - puffs * 1.4, r() * 1.2, (r() - 0.5) * 2);
                m.scale.y = 0.7;
                g.add(m);
            }
            g.userData = { ox: (r() - 0.5) * 360, oz: (r() - 0.5) * 360, y: 26 + r() * 18, speed: 1.5 + r() * 2 };
            this.scene.add(g);
            this.clouds.push(g);
        }
    }

    _update(dt, time) {
        const f = this.focus;
        // El sol (y su sombra) siguen al coche
        this.sun.position.copy(f).addScaledVector(this.sunDir, 90);
        this.sun.target.position.copy(f);
        const cam = this.engine.camera.position;
        this.sea.position.set(cam.x, 0, cam.z);
        this.dome.position.set(cam.x, 0, cam.z);
        this.stars.position.set(cam.x, 0, cam.z);
        // espacio: estrellas alrededor de la cámara, sin mar ni nubes
        const sk = this.spaceK || 0;
        this.starsAll.visible = sk > 0.02;
        this.starsAll.position.copy(cam);
        this.starsAll.material.opacity = sk;
        this.starsAll.rotation.y = time * 0.004;
        this.sea.visible = sk < 0.6;
        // En el espacio no hay mar: se recorta lo que queda bajo el agua (orillas y fondo) y el lugar
        // se apoya limpio sobre el planeta
        const clip = sk > 0.04;
        if (this.terrainMat && clip !== this._terrClip) { this._terrClip = clip; this.terrainMat.clippingPlanes = clip ? this.underwaterClip : null; this.terrainMat.needsUpdate = true; }
        const cloudsOn = sk < 0.3 && (this.quiet || 0) < 0.5;
        this.fireflies.position.set(f.x, f.y - 1 + Math.sin(time * 0.8) * 0.3, f.z);
        this.fireflies.material.opacity = (this.fireflyBase || 0) * (0.55 + 0.45 * Math.sin(time * 2.3));
        if (this.clouds) for (const c of this.clouds) {
            c.visible = cloudsOn;
            const u = c.userData;
            u.ox += u.speed * dt;
            const wrap = v => ((v + 180) % 360 + 360) % 360 - 180;
            // Coordenadas envueltas alrededor de la cámara: siempre hay nubes cerca
            c.position.set(cam.x + wrap(u.ox - cam.x), u.y, cam.z + wrap(u.oz - cam.z));
        }
        updateWind(time);
        // Árboles que tapan la cámara: comprobar varias veces por segundo
        this._occT = (this._occT || 0) - dt;
        if (this._occT <= 0 && this.treeGrid.size && this.lookTarget) {
            this._occT = 0.08;
            this.updateTreeOcclusion(this.engine.camera, this.lookTarget, this.occCar, this.occLook);
        }
        // Ocultar lo que está lejos (cada pocos frames)
        this._cullT = (this._cullT || 0) - dt;
        if (this._cullT <= 0) {
            this._cullT = 0.2;
            const max = VIEW_DIST;
            for (const c of this.cullables) {
                const dx = c.center.x - cam.x, dz = c.center.z - cam.z;
                c.obj.visible = Math.sqrt(dx * dx + dz * dz) - c.radius < max;
            }
        }
    }
}

// Plantas pequeñas: no tapan la cámara (no se ocultan) y algunas no hacen sombra
// Radio de copa y altura de cada especie (a escala 1), para saber qué tapa cada árbol
const TREE_DIM = { almond: [1.6, 3.1], orange: [0.95, 1.9], oak: [1.5, 3.1], olive: [1.2, 2.2], pine: [1.4, 3.7], nightpine: [1.4, 3.7], umbrella: [1.5, 3], cypress: [0.35, 2.95], palm: [2.5, 3.15] };
const SMALL_KINDS = new Set(['grass', 'bush', 'rock', 'sunflower', 'tulip', 'vine', 'wheat']);
const NO_SHADOW = new Set(['grass', 'sunflower', 'tulip', 'wheat']);

// Textura de grano para el suelo (hierba / tierra), gris claro alrededor de 0.9
let grainTex = null;
function grainTexture() {
    if (grainTex) return grainTex;
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d');
    g.fillStyle = 'rgb(232,232,232)'; g.fillRect(0, 0, N, N);
    const r = rng(9);
    for (let i = 0; i < 5200; i++) {
        const v = 200 + Math.floor(r() * 55);
        g.fillStyle = `rgba(${v},${v},${v},0.55)`;
        const x = r() * N, y = r() * N;
        g.fillRect(x, y, 1 + r() * 2, 2 + r() * 3);   // pequeñas briznas
    }
    for (let i = 0; i < 90; i++) {
        const v = 210 + Math.floor(r() * 30);
        g.fillStyle = `rgba(${v},${v},${v},0.35)`;
        g.beginPath(); g.arc(r() * N, r() * N, 4 + r() * 10, 0, 7); g.fill();
    }
    grainTex = new THREE.CanvasTexture(c);
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
    grainTex.colorSpace = THREE.SRGBColorSpace;
    grainTex.anisotropy = 4;
    return grainTex;
}

// Meseta del desierto (tipo Monument Valley): cilindros apilados con bandas
const mesaMats = [];
function mesa({ x, y, z, r }) {
    if (!mesaMats.length) mesaMats.push(toon('#c8693f'), toon('#dd8a55'), toon('#b4542f'));
    const g = new THREE.Group();
    const R = 4 + r * 6, H = 7 + r * 9;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.25, R * 1.6, H * 0.35, 8), mesaMats[1]);
    base.position.y = H * 0.175 - 1;
    const mid = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.1, H * 0.5, 7), mesaMats[0]);
    mid.position.y = H * 0.35 + H * 0.25 - 1;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R, H * 0.15, 7), mesaMats[2]);
    top.position.y = H * 0.85 + H * 0.075 - 1;
    g.add(base, mid, top);
    g.position.set(x, y, z);
    g.rotation.y = r * 7;
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
}

// Sagrada Família de juguete: torres con remate, en piedra
function sagradaFamilia() {
    const g = new THREE.Group();
    const stone = toon('#d8c3a0'), dark = toon('#b9a27e');
    const spires = [[0, 0, 34], [-4, 0, 26], [4, 0, 26], [-8, 0, 22], [8, 0, 22], [-3, -7, 28], [3, -7, 28], [0, 7, 30]];
    for (const [x, z, h] of spires) {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, h * 0.8, 10), stone);
        body.position.set(x, h * 0.4, z);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.9, h * 0.28, 10), dark);
        tip.position.set(x, h * 0.8 + h * 0.14, z);
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), toon('#e8b84a'));
        ball.position.set(x, h * 1.08, z);
        g.add(body, tip, ball);
    }
    const nave = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 12), stone);
    nave.position.y = 5;
    g.add(nave);
    return g;
}

// Torre Glòries: bala redondeada con fachada de colores
function torreGlories() {
    const g = new THREE.Group();
    const c = document.createElement('canvas'); c.width = 64; c.height = 128;
    const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, '#9fd3f5'); grd.addColorStop(0.5, '#3a7bd5'); grd.addColorStop(1, '#d6455b');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.35})`; x.fillRect(Math.random() * 64, Math.random() * 128, 3, 2); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(5, 26, 8, 20), new THREE.MeshToonMaterial({ map: tex }));
    body.position.y = 15;
    g.add(body);
    return g;
}

// Crea un InstancedMesh por cada malla del modelo
export async function instanced(key, matrices) {
    const src = await loadModel(key);
    const group = new THREE.Group();
    src.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    const rootScale = new THREE.Matrix4().makeScale(src.scale.x, src.scale.y, src.scale.z);
    src.traverse(o => {
        if (!o.isMesh) return;
        const local = new THREE.Matrix4().multiplyMatrices(rootScale, new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld));
        const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
        matrices.forEach((m, i) => im.setMatrixAt(i, new THREE.Matrix4().multiplyMatrices(m, local)));
        im.castShadow = true;
        im.receiveShadow = true;
        im.computeBoundingSphere();
        group.add(im);
    });
    return group;
}

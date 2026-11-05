// ============================================================================
//  PROPUESTAS DE ESTILO VISUAL (?look=cine | acuarela | boda)
// ============================================================================
// Capa encima del juego actual: cambia materiales, luz, postproceso y la interfaz
// (clase look-<nombre> en <html>, estilos en game/looks.css). Sin el parámetro, el
// juego se ve exactamente igual que siempre.
//
//  cine      Película de animación: materiales PBR suaves, oclusión ambiental,
//            bloom, tone mapping ACES y gradación cálida. Interfaz de cristal.
//  acuarela  Cuento ilustrado: contornos de tinta, papel, colores de acuarela
//            que se corren un poco. Interfaz de papel y letra a mano.
//  boda      Invitación de boda: tonos pastel y crema, brillo suave, viñeta y
//            pétalos. Interfaz crema con dorado y tipografía serif.
// ============================================================================
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

// 'cartoon' es el estilo por defecto: la interfaz cartoon de siempre con el filtro cálido de "boda"
// en el 3D. 'actual' = sin filtro (como era antes).
export const LOOK_NAMES = ['cartoon', 'actual', 'cine', 'acuarela', 'boda'];

// --- Shaders ----------------------------------------------------------------------

// Gradación de color: saturación, contraste, levantar sombras hacia un tono, tinte y viñeta
const GradeShader = {
    uniforms: {
        tDiffuse: { value: null },
        saturation: { value: 1 }, contrast: { value: 1 }, lift: { value: new THREE.Color(0, 0, 0) }, liftAmount: { value: 0 },
        tint: { value: new THREE.Color(1, 1, 1) }, vignette: { value: 0.25 }, vignetteColor: { value: new THREE.Color(0, 0, 0) }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform float saturation, contrast, liftAmount, vignette;
        uniform vec3 lift, tint, vignetteColor; varying vec2 vUv;
        void main(){
            vec4 c = texture2D(tDiffuse, vUv);
            float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
            c.rgb = mix(vec3(l), c.rgb, saturation);
            c.rgb = (c.rgb - 0.5) * contrast + 0.5;
            c.rgb = mix(c.rgb, lift, liftAmount * (1.0 - smoothstep(0.0, 0.85, l)));
            c.rgb *= tint;
            float d = distance(vUv, vec2(0.5));
            c.rgb = mix(c.rgb, vignetteColor, vignette * smoothstep(0.35, 0.85, d));
            gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0), c.a);
        }`
};

// Acuarela: contornos de tinta (Sobel por canal), pigmento acumulado en los bordes del color,
// lavado suave (el color se corre), granulado del papel y bordes de papel claros
const WatercolorShader = {
    uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec2 resolution; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
        vec3 tex(vec2 uv){ return texture2D(tDiffuse, uv).rgb; }
        void main(){
            vec2 px = 1.0 / resolution;
            vec2 wob = (vec2(noise(vUv * 60.0), noise(vUv * 60.0 + 7.3)) - 0.5) * px * 5.0;
            vec2 uv = vUv + wob;
            // lavado: media de unas muestras (el color se corre un poco)
            vec3 c = tex(uv) * 0.4 + (tex(uv + px * vec2(2, 1)) + tex(uv - px * vec2(2, 1)) + tex(uv + px * vec2(-1, 2)) + tex(uv - px * vec2(-1, 2))) * 0.15;
            // tinta: gradiente de color por canal
            vec3 gx = -tex(uv + px*vec2(-1,-1)) - 2.0*tex(uv + px*vec2(-1,0)) - tex(uv + px*vec2(-1,1)) + tex(uv + px*vec2(1,-1)) + 2.0*tex(uv + px*vec2(1,0)) + tex(uv + px*vec2(1,1));
            vec3 gy = -tex(uv + px*vec2(-1,-1)) - 2.0*tex(uv + px*vec2(0,-1)) - tex(uv + px*vec2(1,-1)) + tex(uv + px*vec2(-1,1)) + 2.0*tex(uv + px*vec2(0,1)) + tex(uv + px*vec2(1,1));
            float g = length(gx) + length(gy);
            float ink = smoothstep(0.35, 0.9, g);
            float pigment = smoothstep(0.08, 0.35, g) * (1.0 - ink);
            // colores de acuarela: menos saturados, más claros, papel que se transparenta
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(vec3(l), c, 0.8);
            c = mix(c, floor(c * 5.0 + 0.5) / 5.0, 0.25);
            vec3 paper = vec3(0.985, 0.955, 0.89);
            float granul = noise(vUv * resolution * 0.35) * 0.6 + noise(vUv * resolution * 0.07) * 0.4;
            c = mix(c, paper, 0.16 + 0.12 * granul);
            c *= 1.0 - pigment * 0.18;                 // borde de pigmento más oscuro
            c = mix(c, vec3(0.24, 0.18, 0.14), ink * 0.85);
            float fib = noise(vUv * resolution * vec2(0.9, 0.12));
            c *= 0.96 + 0.06 * fib;
            float d = distance(vUv * vec2(1.0, 0.85), vec2(0.5, 0.425));
            c = mix(c, paper, smoothstep(0.42, 0.72, d + (noise(vUv * 14.0) - 0.5) * 0.08) * 0.85);
            gl_FragColor = vec4(c, 1.0);
        }`
};

// --- Materiales ---------------------------------------------------------------------

const converted = new Map();
function toStandard(m, rough) {
    if (converted.has(m)) return converted.get(m);
    if (m.onBeforeCompile && m.onBeforeCompile.toString().length > 30) { converted.set(m, m); return m; }   // árboles con viento
    const s = new THREE.MeshStandardMaterial({
        color: m.color ? m.color.clone() : 0xffffff, map: m.map || null, vertexColors: m.vertexColors,
        transparent: m.transparent, opacity: m.opacity, side: m.side, roughness: rough, metalness: 0,
        emissive: m.emissive ? m.emissive.clone() : 0x000000, emissiveIntensity: m.emissiveIntensity ?? 1,
        polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
        depthWrite: m.depthWrite, clippingPlanes: m.clippingPlanes || null
    });
    s.name = m.name;
    converted.set(m, s);
    return s;
}
function convertScene(scene, rough = 0.62) {
    scene.traverse(o => {
        if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
        const m = o.material;
        if (m.isMeshToonMaterial || m.isMeshLambertMaterial) o.material = toStandard(m, m.isMeshLambertMaterial ? 0.9 : rough);
    });
}

// --- Aplicar ------------------------------------------------------------------------

// Selector en la portada para comparar las propuestas (cambia ?look= y recarga)
export function lookSwitcher() {
    const cur = new URLSearchParams(location.search).get('look') || 'actual';
    const el = document.createElement('div');
    el.className = 'look-switch';
    el.innerHTML = 'Estilo: ' + LOOK_NAMES.map(n => {
        const u = new URL(location.href); if (n === 'actual') u.searchParams.delete('look'); else u.searchParams.set('look', n);
        return `<a href="${u.pathname}${u.search}" class="${n === cur ? 'on' : ''}">${n[0].toUpperCase() + n.slice(1)}</a>`;
    }).join('');
    document.body.appendChild(el);
    return el;
}

export function applyLook(app, name) {
    if (!name || name === 'actual' || !LOOK_NAMES.includes(name)) return;
    const { engine, world } = app;
    const R = engine.renderer, scene = engine.scene, cam = engine.camera;
    if (name !== 'cartoon') document.documentElement.classList.add('look-' + name);    // cartoon: interfaz de siempre
    const passes = [];
    const w = window.innerWidth, h = window.innerHeight;

    if (name === 'cine') {
        R.toneMapping = THREE.ACESFilmicToneMapping;
        R.toneMappingExposure = 1.15;
        convertScene(scene);
        setInterval(() => convertScene(scene), 1500);    // lo que aparece después (señales, flores...)
        world.hemiScale = 1.35; world.sunScale = 1.25;
        world.sun.shadow.mapSize.set(2048, 2048);
        if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
        const ao = new GTAOPass(scene, cam, w, h);
        ao.output = GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 1.0;
        ao.updateGtaoMaterial({ radius: 0.9, distanceFallOff: 1, thickness: 1, scale: 1 });
        passes.push(ao);
        passes.push(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.6, 0.86));
        const g = new ShaderPass(GradeShader);
        Object.assign(g.uniforms.saturation, { value: 1.12 });
        g.uniforms.contrast.value = 1.06;
        g.uniforms.tint.value.set('#fff3e4');
        g.uniforms.vignette.value = 0.32;
        passes.push(g);
        engine.tiltScale = 0.55;          // menos efecto maqueta, más "cine"
    }

    if (name === 'acuarela') {
        const wc = new ShaderPass(WatercolorShader);
        wc.uniforms.resolution.value.set(w * R.getPixelRatio(), h * R.getPixelRatio());
        window.addEventListener('resize', () => wc.uniforms.resolution.value.set(window.innerWidth * R.getPixelRatio(), window.innerHeight * R.getPixelRatio()));
        passes.push(wc);
        world.hemiScale = 1.15;
        engine.tiltScale = 0.7;
    }

    // Filtro cálido de "boda": brillo suave en las luces, tonos crema/rosados y viñeta rosada.
    // Lo usan 'boda' (con su interfaz y pétalos) y 'cartoon' (sólo el filtro, interfaz cartoon).
    if (name === 'boda' || name === 'cartoon') {
        R.toneMapping = THREE.ACESFilmicToneMapping;
        R.toneMappingExposure = 1.05;
        world.hemiScale = 1.1;
        passes.push(new UnrealBloomPass(new THREE.Vector2(w, h), 0.28, 0.7, 0.86));
        const g = new ShaderPass(GradeShader);
        g.uniforms.saturation.value = name === 'cartoon' ? 0.96 : 0.9;
        g.uniforms.contrast.value = 1.02;
        g.uniforms.lift.value.set('#ffe9e0');
        g.uniforms.liftAmount.value = 0.08;
        g.uniforms.tint.value.set('#fff6ee');
        g.uniforms.vignette.value = 0.3;
        g.uniforms.vignetteColor.value.set('#f6d9cf');
        passes.push(g);
        engine.tiltScale = 1.0;
        // De noche y en el espacio el tono crema y la viñeta rosa aclararían los negros (quedan lechosos):
        // el filtro se adapta y pasa a una viñeta morada oscura sin "levantar" las sombras
        const dayVig = new THREE.Color('#f6d9cf'), nightVig = new THREE.Color('#140c22'), dayTint = new THREE.Color('#fff6ee'), nightTint = new THREE.Color('#f4eeff');
        engine.onUpdate(() => {
            const k = THREE.MathUtils.clamp(Math.max(world.nightness || 0, world.spaceK || 0), 0, 1);
            g.uniforms.liftAmount.value = 0.08 * (1 - k);
            g.uniforms.vignetteColor.value.copy(dayVig).lerp(nightVig, k);
            g.uniforms.tint.value.copy(dayTint).lerp(nightTint, k);
            g.uniforms.vignette.value = 0.3 + 0.12 * k;
        });
        if (name === 'boda') addPetals(app);
    }

    engine.lookPasses = passes;
    engine._setupComposer();
    engine._resize();
}

// Pétalos de rosa cayendo delante de la cámara (look boda)
function addPetals(app) {
    const { engine } = app;
    const geo = new THREE.CircleGeometry(0.09, 6); geo.scale(1, 0.6, 1);
    const mats = ['#ffb7c9', '#ffd1dc', '#ffffff', '#f7a1b5'].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
    const petals = [];
    const group = new THREE.Group();
    for (let i = 0; i < 70; i++) {
        const m = new THREE.Mesh(geo, mats[i % mats.length]);
        m.userData = { o: new THREE.Vector3((Math.random() - 0.5) * 18, Math.random() * 10, -4 - Math.random() * 14), sp: 0.3 + Math.random() * 0.5, ph: Math.random() * 6 };
        group.add(m); petals.push(m);
    }
    engine.scene.add(group);
    engine.onUpdate((dt, t) => {
        group.position.copy(engine.camera.position);
        group.quaternion.copy(engine.camera.quaternion);
        for (const p of petals) {
            const u = p.userData;
            u.o.y -= dt * u.sp; if (u.o.y < -5) u.o.y = 6;
            p.position.set(u.o.x + Math.sin(t * 0.8 + u.ph) * 0.6, u.o.y, u.o.z);
            p.rotation.set(t * u.sp * 2 + u.ph, t * 0.7 + u.ph, 0);
        }
    });
}

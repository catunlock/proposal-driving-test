// Renderizador, escena, cámara, postproceso (tilt-shift) y bucle principal.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { URLP } from './config.js';

// Desenfoque arriba y abajo de la franja de enfoque: efecto maqueta en miniatura
const TiltShiftShader = {
    uniforms: {
        tDiffuse: { value: null },
        delta: { value: new THREE.Vector2(1, 0) },
        focus: { value: 0.45 },
        range: { value: 0.22 },
        amount: { value: 2.2 }
    },
    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2 delta;
        uniform float focus, range, amount;
        varying vec2 vUv;
        void main() {
            float d = abs(vUv.y - focus);
            float b = smoothstep(range * 0.5, range * 1.8, d) * amount;
            vec4 sum = texture2D(tDiffuse, vUv) * 0.2270270270;
            vec2 o1 = delta * 1.3846153846 * b, o2 = delta * 3.2307692308 * b;
            sum += texture2D(tDiffuse, vUv + o1) * 0.3162162162;
            sum += texture2D(tDiffuse, vUv - o1) * 0.3162162162;
            sum += texture2D(tDiffuse, vUv + o2) * 0.0702702703;
            sum += texture2D(tDiffuse, vUv - o2) * 0.0702702703;
            gl_FragColor = sum;
        }`
};

export class Engine {
    constructor(canvas) {
        this.canvas = canvas;
        this.lite = URLP.lite;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lite, powerPreference: 'high-performance' });
        this.renderer.localClippingEnabled = true;   // planos de recorte por material (el frunk abierto)
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = !this.lite;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.info.autoReset = false;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(32, 1, 0.5, 900);
        this.camera.position.set(0, 80, 120);

        this.clock = new THREE.Clock();
        this.updaters = new Set();
        this.time = 0;
        this.fps = 60;

        document.documentElement.classList.toggle('lite', this.lite);
        this._setupComposer();
        this._resize = this._resize.bind(this);
        window.addEventListener('resize', this._resize);
        this._resize();

        if (URLP.debug) {
            this.fpsEl = document.createElement('div');
            this.fpsEl.className = 'fps-meter';
            document.body.appendChild(this.fpsEl);
        }
    }

    _setupComposer() {
        if (this.lite) { this.composer = null; return; }
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        for (const p of this.lookPasses || []) this.composer.addPass(p);     // propuestas de estilo (game/looks.js)
        this.tiltH = new ShaderPass(TiltShiftShader);
        this.tiltV = new ShaderPass(TiltShiftShader);
        this.composer.addPass(this.tiltH);
        this.composer.addPass(this.tiltV);
        this.composer.addPass(new OutputPass());
    }

    setLite(lite) {
        if (lite === this.lite) return;
        this.lite = lite;
        this.renderer.shadowMap.enabled = !lite;
        this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
        this._setupComposer();
        this._resize();
        document.documentElement.classList.toggle('lite', lite);
    }

    // Intensidad del efecto miniatura (0 = sin desenfoque)
    setTiltShift(amount, focus = 0.45, range = 0.22) {
        if (!this.tiltH) return;
        amount *= this.tiltScale ?? 1;
        for (const p of [this.tiltH, this.tiltV]) {
            p.uniforms.amount.value = amount;
            p.uniforms.focus.value = focus;
            p.uniforms.range.value = range;
        }
    }

    _resize() {
        const w = window.innerWidth, h = window.innerHeight;
        const maxDpr = this.lite ? 1 : 1.5;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        if (this.composer) {
            this.composer.setPixelRatio(dpr);
            this.composer.setSize(w, h);
            this.tiltH.uniforms.delta.value.set(1 / (w * dpr), 0);
            this.tiltV.uniforms.delta.value.set(0, 1 / (h * dpr));
        }
    }

    onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

    start() {
        let frames = 0, acc = 0, slowSeconds = 0;
        const loop = () => {
            requestAnimationFrame(loop);
            const dt = Math.min(this.clock.getDelta(), 0.1) * URLP.timescale;
            this.renderer.info.reset();
            this.time += dt;
            for (const fn of this.updaters) fn(dt, this.time);
            if (this.composer) this.composer.render(dt);
            else this.renderer.render(this.scene, this.camera);

            // Medidor de FPS y paso automático a modo ligero si va lento
            frames++; acc += dt;
            if (acc >= 1) {
                this.fps = frames / acc;
                if (this.fpsEl) this.fpsEl.textContent = `${this.fps.toFixed(0)} fps · ${this.renderer.info.render.calls} dc`;
                if (!this.lite && !URLP.noauto && this.fps < 28 && this.time > 4) {
                    if (++slowSeconds >= 3) { console.log('Rendimiento bajo: activando modo ligero'); this.setLite(true); }
                } else slowSeconds = 0;
                frames = 0; acc = 0;
            }
        };
        loop();
    }
}

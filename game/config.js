// Ajustes generales del juego. Los lugares están en data/places.js y las preguntas
// en questions.json (teoría) y data/practical-questions.js (partes 2 y 3).

export const CONFIG = {
    coupleInitials: 'C ♥ C',

    // Muñequitos de la pareja: cualquiera de los personajes de Kenney de assets/models/chars
    couple: { her: 'chars/character-female-f', him: 'chars/character-male-f' },

    // Geometría del mundo (unidades ≈ metros de maqueta)
    road: {
        width: 5.2,           // calzada de dos carriles; el coche va por el carril derecho
        lane: 2.6,            // ancho de cada carril
        placeBase: 24,        // longitud mínima de cada isla/lugar
        stopSpacing: 10,      // longitud extra por cada parada
        firstStopBack: 8,     // la primera pregunta de cada lugar, un poco antes (se ve la maqueta delante)
        placeGap: 64,         // tramo de viaje entre lugares (puente o carretera)
        stageGap: 230,        // autopista entre partes del juego
        signSide: -5.4,       // la señal va a la izquierda de la carretera (más allá del carril contrario)
        dioramaDepth: 10      // fondo disponible para la maqueta (a la derecha)
    },

    // Cada parte del juego es una zona distinta
    zones: {
        theory: { biome: 'island', gap: 'bridge', music: 'day', label: 'Parte 1 · Teoría' },
        technical: { biome: 'desert', gap: 'land', music: 'road', label: 'Parte 2 · El coche' },
        commitment: { biome: 'forest', gap: 'land', music: 'romance', label: 'Parte 3 · Compromiso' },
        finale: { biome: 'cliff', gap: 'land', music: 'romance', label: 'El mirador' }
    },

    car: {
        length: 2.6,          // largo del Tesla en la maqueta
        speed: 7.5,           // velocidad dentro de un lugar (unidades/s)
        travelSpeed: 15,      // velocidad en los tramos de viaje
        highwaySpeed: 22,     // velocidad en la autopista entre partes
        accel: 5,             // aceleración máxima
        brake: 6.5,           // frenada máxima
        lateralGrip: 11,      // aceleración lateral máxima (frena antes de las curvas)
        // El modelo de Tesla viene mirando hacia -Z: lo giramos 180°
        forwardSign: -1
    },

    // Escalas para que los kits de Kenney encajen entre sí
    modelScale: {
        car: 1.0,
        city: 3.4,
        suburb: 3.2,
        nature: 2.2,
        castle: 2.6,
        food: 0.8,
        furniture: 1.25,
        town: 1.6,
        water: 1.4,
        chars: 1.7,
        roads: 5,
        holiday: 1.6
    },

    // Ambientes del cielo
    skies: {
        morning: { top: '#5ec4ff', bottom: '#d9f3ff', fog: '#cdeeff', sun: '#fff6dc', sunI: 2.2, hemiSky: '#bfe6ff', hemiGround: '#7bbf6a', hemiI: 1.1, sea: '#3fc6d8', stars: 0, sunPos: [40, 60, 30] },
        noon: { top: '#3fb2ff', bottom: '#e4f7ff', fog: '#d6f1ff', sun: '#ffffff', sunI: 2.4, hemiSky: '#cfefff', hemiGround: '#83c46c', hemiI: 1.15, sea: '#2fbfd6', stars: 0, sunPos: [20, 80, 20] },
        golden: { top: '#7fb6f0', bottom: '#ffe0a3', fog: '#ffe3b5', sun: '#ffd28a', sunI: 2.2, hemiSky: '#ffe1b8', hemiGround: '#88a860', hemiI: 1.0, sea: '#4cb4c9', stars: 0, sunPos: [-50, 35, 30] },
        sunset: { top: '#6a5acd', bottom: '#ffab8a', fog: '#f4b5a0', sun: '#ffc39a', sunI: 1.9, hemiSky: '#ffd0c0', hemiGround: '#6d6a8a', hemiI: 1.0, sea: '#5d8fc0', stars: 0.15, sunPos: [-60, 18, 10] },
        dusk: { top: '#2b2f6b', bottom: '#b06aa8', fog: '#7c5a96', sun: '#ffb3d1', sunI: 1.0, hemiSky: '#8a7cc8', hemiGround: '#3a3a5e', hemiI: 0.8, sea: '#384f8a', stars: 0.6, sunPos: [-60, 10, -20] },
        night: { top: '#0b1030', bottom: '#2e2a63', fog: '#1d1f48', sun: '#b8c4ff', sunI: 0.95, hemiSky: '#6f78cc', hemiGround: '#2a2848', hemiI: 1.05, sea: '#1b2b5a', stars: 1, sunPos: [30, 50, -40] },
        // Espacio y Marte: fondo negro con estrellas (sin luciérnagas ni grillos: quiet = 1)
        space: { top: '#000000', bottom: '#07051a', fog: '#07051a', sun: '#ffffff', sunI: 2.4, hemiSky: '#a9b4d8', hemiGround: '#231b33', hemiI: 0.95, sea: '#07051a', stars: 1, bugs: 0, quiet: 1, sunPos: [40, 45, 30] },
        mars: { top: '#020106', bottom: '#2a120c', fog: '#3a1a10', sun: '#ffe6cc', sunI: 2.3, hemiSky: '#ffb38c', hemiGround: '#7a2e14', hemiI: 1.05, sea: '#7c3218', stars: 1, bugs: 0, quiet: 1, sunPos: [-40, 55, 30] }
    },

    timings: {
        answerDelay: 900,        // ms entre responder y arrancar
        lastIntroDuration: 14500, // "Y ahora la última pregunta..." (tiempo para sacar el anillo)
        proposalButtonsDelay: 6000
    }
};

// Parámetros de URL para depuración
const params = new URLSearchParams(location.search);
export const URLP = {
    go: params.get('go'),                // start | practical: viene de la portada pública (ya ha pulsado START)
    stage: params.get('stage'),          // theory | technical | exam | commitment | paseo | last | proposal | celebration | glovebox
    q: params.has('q') ? parseInt(params.get('q'), 10) : null,
    lite: params.get('lite') === '1',
    noauto: params.get('noauto') === '1',   // no pasar a modo ligero automáticamente
    debug: params.get('debug') === '1',
    tesla: params.get('tesla') === 'true' || params.get('tesla_fullscreen') === 'true',
    teslaFullscreen: params.get('tesla_fullscreen') === 'true',
    fast: params.get('fast') === '1',    // acelera animaciones (para pruebas)
    look: params.get('look'),             // propuesta de estilo: cine | acuarela | boda (game/looks.js)
    timescale: params.has('timescale') ? parseFloat(params.get('timescale')) : 1   // cámara lenta/rápida (pruebas)
};

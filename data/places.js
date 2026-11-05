// ============================================================================
//  ITINERARIO DE LA ISLA
// ============================================================================
// El orden de esta lista es el orden del viaje. El camino de la isla se genera
// automáticamente a partir de ella, así que para:
//   · Añadir un lugar  → añade un objeto en la posición que quieras.
//   · Quitar un lugar  → bórralo (sus preguntas caerán en el lugar anterior).
//   · Mover preguntas  → cambia el campo "place" de la pregunta (questions.json,
//                        o desde admin.html) al "id" del lugar.
//
// Campos:
//   id        identificador único (sin espacios). Es lo que va en "place".
//   name      nombre que aparece en el cartel al llegar.
//   subtitle  frase corta de vuestra historia (opcional).
//   stage     etapa del juego: 'theory' (en casa), 'technical' (Tesla, parte 2),
//             'commitment' (parte 3) o 'finale' (la pedida).
//   sky       ambiente: 'morning', 'noon', 'golden', 'sunset', 'dusk', 'night', 'space', 'mars'.
//   diorama   cómo se construye la maqueta 3D (game/dioramas.js). Si no existe,
//             se usa 'generic', que pone edificios/árboles con los parámetros
//             de "props" (buildings, trees, flag).
//   props     parámetros libres para el diorama (colores, textos...) y del terreno:
//             biome ('island', 'city', 'beach', 'desert', 'forest', 'cliff', 'country'),
//             elevation (altura de la isla), islandRight / islandLeft (anchura de tierra),
//             approach: 'ronda' (el tramo de llegada es la entrada a Barcelona por la Ronda),
//             approach: 'roadtrip' (viaje largo por carretera y autopista, con escenas a los lados),
//             approach: 'flight' (el Tesla despega con alas desde la autopista y vuela hasta el lugar),
//             approach: 'space' (el Tesla saca cohetes y viaja por el espacio; mars: true = el lugar es Marte),
//             showcase: true (sin preguntas: el coche se para, se presenta el lugar y sigue),
//             mountain: { legs, legLength, spacing, height } (carretera de montaña con horquillas).
//   minStops  paradas mínimas aunque no tenga preguntas (0 = solo se pasa por delante).
//   props.stopSpacing  distancia entre paradas (por defecto 10); props.length  longitud fija.
//   props.parking: true  el coche aparca aquí al terminar una parte (Supercharger).
//   props.noQuestions: true  las preguntas sin "place" no caen aquí.
// ============================================================================
window.PLACES = [
    {
        id: 'autoescuela', name: 'Autoescuela Cari', subtitle: 'Aquí empieza el examen más importante',
        stage: 'theory', sky: 'morning', diorama: 'autoescuela',
        props: { biome: 'city', islandRight: 48 }
    },
    {
        id: 'cafeteria', name: 'La cafetería', subtitle: 'Donde nos conocimos ✨',
        stage: 'theory', sky: 'morning', diorama: 'cafeteria',
        props: { biome: 'city' }
    },
    {
        id: 'la-mola', name: 'La Mola', subtitle: 'Nuestra primera subida juntos',
        stage: 'theory', sky: 'morning', diorama: 'laMola',
        // Carretera de montaña: tramos en zigzag, longitud de cada tramo, separación y altura de la cima
        props: { biome: 'mountain', mountain: { legs: 7, legLength: 34, spacing: 10.5, height: 38 } }
    },
    {
        id: 'cine', name: 'Cine', subtitle: 'La peli pendiente… algún día 🍿',
        stage: 'theory', sky: 'noon', diorama: 'cine',
        props: { biome: 'city' }
    },
    {
        id: 'escuela', name: 'Escola de català', subtitle: 'Aprendiendo a decir «t\'estimo» 💛',
        stage: 'theory', sky: 'noon', diorama: 'escuela',
        props: { biome: 'city', stopLookUp: 1.6 }
    },
    {
        id: 'compras', name: 'Los grandes almacenes', subtitle: 'Tantas cosas vistas aquí',
        stage: 'theory', sky: 'noon', diorama: 'grandesAlmacenes', props: { biome: 'city' }
    },
    {
        id: 'placa-catalunya', name: 'Barcelona · Plaça Catalunya', subtitle: 'La era de las fotos 📸',
        stage: 'theory', sky: 'noon', diorama: 'placaCatalunya', props: { biome: 'city', islandRight: 46, islandLeft: 22, length: 64, approach: 'ronda', establishSide: 15 }
    },
    {
        id: 'gimnasio', name: 'El gimnasio', subtitle: 'Iniciación deportiva 💪',
        stage: 'theory', sky: 'noon', diorama: 'gimnasio',
        props: { biome: 'city' }
    },
    {
        // De camino a la Costa Brava por la AP-7: el área de servicio de La Jonquera, junto a la frontera
        id: 'ap7', name: 'AP-7 · La Jonquera', subtitle: 'Área de servicio: ¡comidita para el conductor! 🥪',
        stage: 'theory', sky: 'golden', diorama: 'jonquera',
        // approach 'roadtrip' con plan 'ap7': autopista ancha de 3 carriles por sentido hasta el área
        props: { biome: 'country', islandRight: 44, islandLeft: 36, establishSide: 14, stopSide: 14, length: 50,
            approach: 'roadtrip', roadtrip: { plan: 'ap7' }, wideRoad: true }
    },
    {
        id: 'masia', name: 'La masía · Empordà', subtitle: 'Un finde en el campo 🌾',
        stage: 'theory', sky: 'golden', diorama: 'masia',
        props: { biome: 'country', islandRight: 50, islandLeft: 30, establishSide: 13 }
    },
    {
        id: 'valencia', name: 'Valencia', subtitle: 'Paella junto al mar 🥘',
        stage: 'theory', sky: 'golden', diorama: 'valencia',
        // approach 'roadtrip': viaje largo con rotondas, autopista, gasolinera, peaje... (game/roadtrip.js)
        props: { biome: 'city', approach: 'roadtrip' }
    },
    {
        id: 'villena', name: 'Castillo de Villena', subtitle: 'De camino al sur',
        stage: 'theory', sky: 'golden', diorama: 'castillo',
        props: { stopSide: 19, stopYaw: 0.55, stopLookUp: 4.3, stopMinDist: 36, stopMaxDist: 44, establishSide: 22, islandRight: 50 }
    },
    {
        id: 'malaga', name: 'Málaga', subtitle: 'Espetos y playa ☀️',
        stage: 'theory', sky: 'golden', diorama: 'playa',
        // road trip por el sur: olivares, toro de Osborne, pueblos blancos... (game/roadtrip.js)
        props: { biome: 'beach', palms: true, approach: 'roadtrip', roadtrip: { plan: 'sur' } }
    },
    {
        // La torre de control: aquí se hace la pregunta del vuelo CARI1 y se despega
        id: 'torre', name: 'Torre de control', subtitle: '«CARI1 saliendo…» ✈️',
        stage: 'theory', sky: 'golden', diorama: 'torre',
        props: { biome: 'city', islandRight: 34, length: 40 }
    },
    {
        // Montserrat, en su propia isla rodeada de mar: se llega volando (primera transformación: alas)
        id: 'montserrat', name: 'Montserrat', subtitle: '',
        stage: 'theory', sky: 'golden', diorama: 'montserrat', minStops: 1,
        props: { approach: 'flight', showcase: true, biome: 'mountain', islandLeft: 56, islandRight: 18, length: 40,
            photo: 'assets/happy_couple_travel_1776806740487.webp', fallbackPhoto: 'assets/foto_pendiente.webp' }
    },
    {
        // Lanzarote es el planeta Marte: se llega en cohete (segunda transformación) por el espacio
        id: 'lanzarote', name: 'Lanzarote · Marte', subtitle: 'Nuestro planeta rojo 🚀🔴',
        stage: 'theory', sky: 'mars', diorama: 'lanzarote', minStops: 1,
        props: { approach: 'space', mars: true, biome: 'mars', showcase: true, islandRight: 48, islandLeft: 40, elevation: 1.4 }
    },
    {
        id: 'supercharger', name: 'Supercharger', subtitle: 'Fin de la Parte 1 · ¡a cargar! ⚡',
        stage: 'technical', sky: 'sunset', diorama: 'supercharger',
        // parking: aquí aparca el coche al terminar la Parte 1 y de aquí sale la Parte 2
        // approach 'space': vuelta a la Tierra en cohete desde Marte
        props: { approach: 'space', elevation: 2, parking: true, noQuestions: true, length: 50, islandRight: 30 }
    },
    {
        id: 'ruta-desierto', name: 'Ruta del desierto', subtitle: 'Parte 2 · Examen práctico en marcha 🚗',
        stage: 'technical', sky: 'sunset', diorama: 'desierto',
        props: { elevation: 2, stopSpacing: 24 }
    },
    {
        id: 'farolillos', name: 'El camino de los farolillos', subtitle: 'Parte 3 · Compromiso',
        stage: 'commitment', sky: 'night', diorama: 'farolillos', minStops: 1,
        props: { elevation: 1.6 }
    },
    {
        id: 'mirador', name: 'El mirador', subtitle: '',
        stage: 'finale', sky: 'night', diorama: 'mirador', minStops: 1,
        props: { elevation: 6 }
    }
];

// Preguntas de las partes 2 y 3 (en el coche). Las usan la versión 3D (index.html) y la clásica (classic.html).
// - technical: tienen respuesta correcta; si fallas, reintentas.
// - commitment: todas las opciones son afirmativas.
// Campo opcional `place`: id del lugar de data/places.js donde se hace la parada (por defecto, el primero de su etapa).
// Campo opcional `prop`: objeto 3D que aparece junto a la carretera (ver game/props.js). Sin él no sale nada.
// (Las de compromiso muestran un corazón.)
window.PRACTICAL = {
    technical: [
        {
            text: "¿Cómo se llama el maletero delantero de un Tesla?",
            options: ["Frunk", "Trunkfront", "Guantera XL"],
            correctIndex: 0,
            prop: 'frunk'
        },
        {
            text: "Al levantar el pie del acelerador, el coche frena y recupera energía para la batería. ¿Cómo se llama este sistema?",
            options: ["Freno de mano eléctrico", "Frenada regenerativa", "Modo perezoso"],
            correctIndex: 1,
            prop: 'regen'
        },
        {
            text: "¿Dónde se carga un Tesla de forma rápida en un viaje largo?",
            options: ["En un Supercharger", "En una gasolinera con manguera grande", "En el enchufe de la cocina de casa de la suegra"],
            correctIndex: 0,
            prop: 'supercharger'
        },
        {
            text: "¿Qué hace el modo Centinela (Sentry) con el coche aparcado?",
            options: ["Hace la compra por ti", "Vigila con las cámaras y graba si alguien se acerca", "Aparca solo en la mejor plaza"],
            correctIndex: 1,
            prop: 'sentry'
        },
        // --- Model 3 (Standard) ---
        {
            text: "En nuestro Model 3, ¿cómo se pone la marcha D para salir?",
            options: ["Con una palanca detrás del volante", "Deslizando hacia arriba en la pantalla táctil", "Diciendo «¡Arre, caballo!»"],
            correctIndex: 1,
            prop: 'drive'
        },
        {
            text: "¿Cómo se abre la puerta desde dentro?",
            options: ["Pulsando el botón que hay junto a la ventanilla", "Tirando fuerte de una manilla cromada", "Pidiéndoselo con educación al coche"],
            correctIndex: 0,
            prop: 'door'
        },
        {
            text: "¿Dónde están los intermitentes del Model 3?",
            options: ["En una palanca a la izquierda del volante", "En unos botones del propio volante", "No tiene: se saca la mano por la ventanilla"],
            correctIndex: 1,
            prop: 'signals'
        },
        {
            text: "¿Dónde está el puerto de carga?",
            options: ["Detrás, en el piloto trasero izquierdo", "Debajo del logo delantero", "En el maletero, junto a las bolsas de la compra"],
            correctIndex: 0,
            prop: 'chargeport'
        },
        {
            text: "Si el móvil se queda sin batería, ¿con qué abrimos el coche?",
            options: ["Con la tarjeta llave, apoyándola en el pilar central", "Con la tarjeta sanitaria", "Con un beso en la ventanilla"],
            correctIndex: 0,
            prop: 'keycard'
        },
        {
            text: "¿Qué tracción tiene el Model 3 Standard?",
            options: ["Tracción delantera", "Tracción trasera, con un solo motor", "Tracción a pedales"],
            correctIndex: 1,
            prop: 'rwd'
        },
        {
            text: "Si dejamos a un perrito en el coche un momento, ¿qué modo mantiene el clima y avisa en la pantalla de que está bien?",
            options: ["Modo Croqueta", "Modo Perro", "Modo Centinela"],
            correctIndex: 1,
            prop: 'dog'
        },
        {
            text: "¿Para qué sirve el Modo Camping?",
            options: ["Para dormir dentro con el clima, las luces y la música encendidos", "Monta una tienda de campaña en el techo", "Pone sonido de grillos por los altavoces"],
            correctIndex: 0,
            prop: 'camp'
        },
        {
            text: "¿Qué hay en la «Caja de juguetes» (Toybox) de la pantalla?",
            options: ["Las piezas de repuesto", "Juegos, espectáculos de luces y un cojín de pedorretas", "Los cargadores del móvil"],
            correctIndex: 1,
            prop: 'toybox'
        },
        {
            text: "Y la más importante: ¿cómo se abre la guantera del Model 3?",
            options: ["Con una llavecita dorada", "Dándole un golpecito con la rodilla", "Desde la pantalla táctil"],
            correctIndex: 2,
            prop: 'glovebox'
        }
    ],
    commitment: [
        {
            text: "¿Aceptas no separarte nunca, y ver envejecer a tu Cari?",
            options: ["¡Acepto! ❤️", "¡Claro que sí! 🥰"]
        },
        {
            text: "¿Nos cuidaremos mutuamente hasta hacernos viejitos?",
            options: ["¡Obvio! 👴👵", "¡Por supuesto! 💖"]
        },
        {
            text: "¿Me aceptarás el café que te prepare todas las mañanas?",
            options: ["¡Cada mañana! ☕", "¡Me encantaría! ☀️"]
        },
        {
            text: "¿Ir de viaje conmigo a todos los lugares del mundo que nos apetezca?",
            options: ["¡Sin pensarlo! ✈️", "¡Vámonos ya! 🌍"]
        },
        {
            text: "¿Cuidar juntos de la familia que formemos?",
            options: ["¡Con todo mi amor! 🍼", "¡Siempre! 💕"]
        }
    ]
};

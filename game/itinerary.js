// Construye el itinerario: une los lugares (data/places.js) con las preguntas.
//
// Reglas de reparto (para que añadir/quitar/mover preguntas sea trivial):
//  · Una pregunta va al lugar indicado en su campo "place".
//  · Si no tiene "place" (o el lugar no existe / es de otra etapa), va al mismo lugar
//    que la pregunta anterior de su etapa; si es la primera, al primer lugar de la etapa.
//  · Dentro de un lugar, las preguntas se hacen en el orden en que aparecen en el fichero.
//  · Los lugares sin preguntas se recorren igualmente (se pasa por delante de la maqueta).

export const STAGES = ['theory', 'technical', 'commitment', 'finale'];

export async function buildItinerary() {
    let theory = [];
    try {
        const res = await fetch('questions.json', { cache: 'no-store' });
        if (res.ok) theory = await res.json();
    } catch (e) {
        console.error('Error cargando questions.json', e);
    }
    const practical = window.PRACTICAL || { technical: [], commitment: [] };

    // Las etapas siempre van en orden; si un lugar está "fuera de sitio" en la lista, lo recolocamos.
    const places = [...(window.PLACES || [])]
        .map((p, i) => ({ minStops: 0, props: {}, diorama: 'generic', ...p, order: i, stops: [] }))
        .sort((a, b) => (STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)) || (a.order - b.order));
    const byId = new Map(places.map(p => [p.id, p]));

    const assign = (questions, stage, kind) => {
        const stagePlaces = places.filter(p => p.stage === stage);
        if (!stagePlaces.length) { console.warn(`No hay ningún lugar para la etapa "${stage}"`); return; }
        let last = stagePlaces.find(p => !(p.props && p.props.noQuestions)) || stagePlaces[0];
        questions.forEach(q => {
            let p = q.place ? byId.get(q.place) : null;
            if (q.place && !p) console.warn(`Lugar "${q.place}" no existe; la pregunta va a "${last.id}":`, q.text);
            if (p && p.stage !== stage) { console.warn(`"${q.place}" no es de la etapa ${stage}`); p = null; }
            p = p || last;
            p.stops.push({ kind, q });
            last = p;
        });
    };
    assign(theory, 'theory', 'theory');
    assign(practical.technical, 'technical', 'technical');
    assign(practical.commitment, 'commitment', 'commitment');

    // Paradas mínimas (p. ej. el mirador de la pedida)
    for (const p of places) {
        while (p.stops.length < p.minStops) p.stops.push({ kind: p.stage === 'finale' ? 'finale' : 'arrive', q: null });
    }

    // Lista plana de paradas en orden de viaje, con numeración por etapa
    const stops = [];
    const counters = {};
    const totals = {};
    places.forEach(p => p.stops.forEach(s => { if (s.q) totals[p.stage] = (totals[p.stage] || 0) + 1; }));
    places.forEach(p => p.stops.forEach((s, k) => {
        s.place = p;
        s.localIndex = k;
        s.index = stops.length;
        s.stage = p.stage;
        if (s.q) {
            counters[p.stage] = (counters[p.stage] || 0) + 1;
            s.number = counters[p.stage];
            s.total = totals[p.stage];
        }
        stops.push(s);
    }));

    return { places, stops };
}

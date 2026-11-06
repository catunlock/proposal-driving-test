// Circuitos de carrera (contrarreloj, carrera y pique a dos), en el orden del menú
import desayuno from './desayuno.js';
import escritorio from './escritorio.js';
import jardin from './jardin.js';
import marte from './marte.js';

export const MAPS = [desayuno, escritorio, jardin, marte];
export const mapById = id => MAPS.find(m => m.id === id) || null;

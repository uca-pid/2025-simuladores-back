/**
 * Shuffle determinístico usado para randomizar el orden de las opciones de una
 * pregunta por estudiante, SIN necesidad de persistir el permutado en la base.
 *
 * Por qué existe esto: antes, el orden de las opciones se randomizaba del lado
 * del cliente (Math.random()) después de que el array completo (sin tocar, en
 * su orden original) ya había llegado por la red. Para 'fill_in_blank' y
 * 'matching', ese orden original ES la respuesta correcta (las primeras N
 * opciones son las correctas, o la respuesta del concepto i está en la
 * posición N+i), así que inspeccionando la respuesta de la API se podía
 * inferir la respuesta correcta sin randomizar nada del lado del cliente.
 *
 * La solución: el backend mezcla las opciones ANTES de mandarlas, usando una
 * seed determinística derivada de (userId, examId, preguntaId). Como la seed
 * es reproducible, no hace falta guardar el permutado en ningún lado: al
 * corregir, se vuelve a generar la MISMA seed y el MISMO permutado, y se usa
 * para traducir la posición que mandó el estudiante (posición mostrada) de
 * vuelta al índice real dentro de `opciones` tal como está en la base.
 */

/** Hash simple de un string a un entero de 32 bits (xfnv1a). */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0);
}

/** PRNG determinístico (mulberry32) sembrado con un entero de 32 bits. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Genera un permutado determinístico de longitud `n` a partir de `seedStr`.
 * `perm[i]` = índice ORIGINAL que termina ubicado en la posición mostrada `i`.
 *
 * Llamar de nuevo con el mismo (n, seedStr) devuelve exactamente el mismo
 * resultado - no hay estado global ni randomness real involucrada.
 */
export function seededPermutation(n: number, seedStr: string): number[] {
  const rand = mulberry32(hashSeed(seedStr));
  const perm = Array.from({ length: n }, (_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

/** Aplica un permutado a un array: shuffled[i] = array[perm[i]]. */
export function applyPermutation<T>(array: T[], perm: number[]): T[] {
  return perm.map((originalIndex) => array[originalIndex]);
}

/**
 * Seed estándar para randomizar las opciones de una pregunta: depende del
 * estudiante, el examen y la pregunta puntual, así que es estable para el
 * mismo estudiante en el mismo examen (no cambia si refresca la página) pero
 * distinta entre estudiantes.
 */
export function questionOptionsSeed(userId: number, examId: number, preguntaId: number): string {
  return `${userId}:${examId}:${preguntaId}`;
}

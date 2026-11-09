import { seededPermutation, applyPermutation, questionOptionsSeed } from "./seededShuffle.ts";

/**
 * Mezcla de opciones del lado del servidor (idea de Fabri, ver seededShuffle.ts).
 *
 * Antes el back mandaba las opciones en su orden original y el front las
 * mezclaba. En 'fill_in_blank' y 'matching' ese orden ES la respuesta (las
 * primeras N opciones son las correctas, o la respuesta del concepto i está
 * en la posición N+i), así que se podía leer en la respuesta de la API. Ahora
 * el alumno recibe las opciones ya mezcladas y manda posiciones mostradas,
 * que se traducen a índices reales con el mismo permutado antes de guardar
 * y corregir.
 */

type Pregunta = { id: number; tipo: string; opciones: any; correcta?: number | null; imagenesOpciones?: any };

const TIPOS_MEZCLA_COMPLETA = ['multiple_choice', 'multiple_response', 'true_false', 'fill_in_blank'];

/** Pregunta con las opciones (y sus imágenes) en el orden que ve este alumno. */
export function mezclarOpcionesParaAlumno<T extends Pregunta>(pregunta: T, userId: number, examId: number): T {
  if (!Array.isArray(pregunta.opciones)) return pregunta;
  const seed = questionOptionsSeed(userId, examId, pregunta.id);

  if (TIPOS_MEZCLA_COMPLETA.includes(pregunta.tipo)) {
    const perm = seededPermutation(pregunta.opciones.length, seed);
    return {
      ...pregunta,
      opciones: applyPermutation(pregunta.opciones, perm),
      ...(Array.isArray(pregunta.imagenesOpciones) ? { imagenesOpciones: applyPermutation(pregunta.imagenesOpciones, perm) } : {})
    };
  }

  if (pregunta.tipo === 'matching') {
    // Los conceptos (primeros N) no son secretos y quedan en orden; se mezclan las respuestas
    const numConceptos = pregunta.correcta || 0;
    const respuestas = pregunta.opciones.slice(numConceptos);
    const perm = seededPermutation(respuestas.length, seed);
    return { ...pregunta, opciones: [...pregunta.opciones.slice(0, numConceptos), ...applyPermutation(respuestas, perm)] };
  }

  return pregunta;
}

/** Posición mostrada -> índice real en pregunta.opciones (o -1 si es inválida). */
const aIndiceReal = (perm: number[], posicion: any, desplazamiento = 0) =>
  Number.isInteger(posicion) && posicion - desplazamiento >= 0 && posicion - desplazamiento < perm.length
    ? desplazamiento + perm[posicion - desplazamiento]
    : -1;

/**
 * Traduce la respuesta del alumno (en posiciones mostradas) a índices reales
 * de pregunta.opciones, regenerando el permutado de mezclarOpcionesParaAlumno.
 * Las respuestas de texto/número/archivo se devuelven tal cual.
 */
export function traducirRespuestaAlumno(pregunta: Pregunta, valor: any, userId: number, examId: number): any {
  if (!Array.isArray(pregunta.opciones) || valor === null || valor === undefined) return valor;
  const seed = questionOptionsSeed(userId, examId, pregunta.id);

  if (TIPOS_MEZCLA_COMPLETA.includes(pregunta.tipo)) {
    const perm = seededPermutation(pregunta.opciones.length, seed);
    if (Array.isArray(valor)) return valor.map((posicion: any) => aIndiceReal(perm, posicion));
    return typeof valor === 'number' ? aIndiceReal(perm, valor) : valor;
  }

  if (pregunta.tipo === 'matching' && Array.isArray(valor)) {
    // El alumno manda, por concepto, el índice absoluto (N + posición) de la respuesta elegida
    const numConceptos = pregunta.correcta || 0;
    const perm = seededPermutation(pregunta.opciones.length - numConceptos, seed);
    return valor.map((posicion: any) => aIndiceReal(perm, posicion, numConceptos));
  }

  return valor;
}

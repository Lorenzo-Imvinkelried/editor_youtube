/**
 * Responsabilidad Única: Preparar el texto narrado antes de enviarlo a cualquier motor TTS
 * (`edge-tts` o `ElevenLabs`) para que las letras sueltas (ej. "vitamina C", "vitamina K",
 * "como la K y la A", "B9", "B12", "D3") y siglas científicas ("LDL", "HDL", "ADN", "pH")
 * se pronuncien con pausa clara y sílaba completa, manteniendo intacto el texto editorial en pantalla.
 */

const LETTER_PHONETIC_ES: Record<string, string> = {
  A: 'A',
  B: 'Be',
  C: 'Ce',
  D: 'De',
  E: 'E',
  F: 'Efe',
  G: 'Ge',
  H: 'Hache',
  I: 'I',
  J: 'Jota',
  K: 'Ka',
  L: 'Ele',
  M: 'Eme',
  N: 'Ene',
  O: 'O',
  P: 'Pe',
  Q: 'Cu',
  R: 'Erre',
  S: 'Ese',
  T: 'Te',
  U: 'U',
  V: 'Uve',
  W: 'Doble u',
  X: 'Equis',
  Y: 'I griega',
  Z: 'Zeta'
};

const SMALL_NUMBER_WORDS_ES: Record<string, string> = {
  '1': 'uno',
  '2': 'dos',
  '3': 'tres',
  '4': 'cuatro',
  '5': 'cinco',
  '6': 'seis',
  '7': 'siete',
  '8': 'ocho',
  '9': 'nueve',
  '10': 'diez',
  '11': 'once',
  '12': 'doce'
};

const SPELLED_ACRONYMS_ES: Record<string, string> = {
  LDL: 'L, D, L',
  HDL: 'H, D, L',
  VLDL: 'V, L, D, L',
  ADN: 'A, D, N',
  ARN: 'A, R, N',
  IMC: 'I, M, C',
  ATP: 'A, T, P',
  EGCG: 'E, G, C, G',
  EPA: 'E, P, A',
  DHA: 'D, H, A',
  ALA: 'A, L, A',
  UV: 'U, V',
  UVA: 'U, V, A',
  UVB: 'U, V, B',
  pH: 'pe hache',
  PH: 'pe hache'
};

function spellLetterToken(letter: string, num?: string): string {
  const spokenLetter = LETTER_PHONETIC_ES[letter.toUpperCase()] ?? letter;
  if (!num) return spokenLetter;
  const spokenNum = SMALL_NUMBER_WORDS_ES[num] ?? num;
  return `${spokenLetter} ${spokenNum}`;
}

function wrapWithPause(prefix: string, spokenCore: string, trailingPunct: string): string {
  const cleanPrefix = prefix.replace(/,\s*$/, '').trimEnd();
  if (trailingPunct) {
    return `${cleanPrefix}, ${spokenCore}${trailingPunct}`;
  }
  return `${cleanPrefix}, ${spokenCore},`;
}

/**
 * Formatea una frase en español exclusivamente para síntesis de voz (TTS):
 * - Inserta pausas naturales y lectura clara alrededor de letras sueltas ("vitamina C" -> "vitamina, Ce,")
 *   y combinaciones como "como la K y la A" -> "como la, Ka, y la, A".
 * - Evita que el TTS trague letras seguidas de punto final ("vitamina C." -> "vitamina, Ce.").
 * - Deletrea siglas clínicas clave ("colesterol LDL" -> "colesterol, L, D, L").
 * - No altera conjunciones ni preposiciones normales ("Y si...", "A veces...", "O bien...").
 */
export function formatTextForNaturalSpanishTts(rawText: string): string {
  let out = rawText.replace(/\s+/g, ' ').trim();
  if (!out) return out;

  // 1. "vitamina(s) <LETRA>[NUMERO]" (ej: "vitamina C", "vitamina K1", "vitamina B12", "vitamina D3")
  out = out.replace(
    /\b(vitaminas?)\s+([A-Z])(\d{1,2})?(?=$|[\s.,;:!?])([.,;:!?])?/gi,
    (_m, vitWord: string, letter: string, num: string | undefined, punct: string | undefined) => {
      // Asegurar que sea una letra de vitamina real (A, B, C, D, E, K, P)
      const up = letter.toUpperCase();
      if (!'ABCDEKP'.includes(up)) return _m;
      return wrapWithPause(vitWord, spellLetterToken(up, num), punct || '');
    }
  );

  // 2. Letras sueltas precedidas por artículo o clasificador ("la K", "la A", "tipo B", "grupo B", "letra C", "complejo B")
  // Sensible a mayúscula en la letra para nunca afectar palabras comunes ni preposiciones minúsculas
  out = out.replace(
    /\b(la|el|letra|letras|tipo|grupo|complejo|factor|rayos|hepatitis)\s+([A-Z])(\d{1,2})?(?=$|[\s.,;:!?])([.,;:!?])?/g,
    (_m, lead: string, letter: string, num: string | undefined, punct: string | undefined) => {
      // Evitar tocar números romanos comunes con "el" si aparecieran sin número
      if (!num && lead === 'el' && (letter === 'I' || letter === 'V' || letter === 'X')) {
        return _m;
      }
      return wrapWithPause(lead, spellLetterToken(letter, num), punct || '');
    }
  );

  // 3. Letras técnicas con número aisladas (ej: "B9", "B12", "D3", "K1", "K2", "Q10", "Omega 3" no entra)
  out = out.replace(
    /(^|[\s(])([BDKQ])(\d{1,2})(?=$|[\s.,;:!?)])([.,;:!?])?/g,
    (_m, before: string, letter: string, num: string, punct: string | undefined) => {
      const spoken = spellLetterToken(letter, num);
      const trail = punct || ',';
      const lead = before.trimEnd() ? `${before}, ` : `${before}`;
      return `${lead}${spoken}${trail}`;
    }
  );

  // 4. Siglas científicas / clínicas deletreadas con pausa (LDL, HDL, ADN, ARN, IMC, EGCG, pH...)
  out = out.replace(
    /\b(VLDL|LDL|HDL|ADN|ARN|IMC|ATP|EGCG|EPA|DHA|ALA|UVA|UVB|UV|pH|PH)\b([.,;:!?])?/g,
    (_m, acro: string, punct: string | undefined) => {
      const spelled = SPELLED_ACRONYMS_ES[acro];
      if (!spelled) return _m;
      return punct ? `, ${spelled}${punct}` : `, ${spelled},`;
    }
  );

  // 5. Limpieza fina de puntuación redundante (sin comas dobles ni coma antes de punto)
  out = out
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/([:;(¿¡])\s*,\s*/g, '$1 ')
    .replace(/,\s*([.,;:!?])/g, '$1')
    .replace(/^\s*,\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return out;
}

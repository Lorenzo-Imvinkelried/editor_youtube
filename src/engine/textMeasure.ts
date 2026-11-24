/**
 * Responsabilidad Única: Medir texto en Canvas 2D y resolver el ajuste tipográfico
 * (reducción de tamaño y salto de línea) para que cualquier texto entre en un ancho máximo.
 */

import { TextFontFamily } from '../dsl/dslTypes';

export const FONT_STACK_MAP: Record<TextFontFamily, string> = {
  display: '"Georgia", "Playfair Display", "Times New Roman", serif',
  serif: '"Georgia", "Palatino Linotype", "Book Antiqua", serif',
  sans: '"Inter", "Segoe UI", system-ui, sans-serif',
  mono: '"Courier New", "Cascadia Mono", "Consolas", monospace',
  handwritten: '"Segoe Print", "Bradley Hand", "Caveat", cursive'
};

export interface FittedText {
  size: number;
  font: string;
  lines: string[];
}

let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

export function measureTextWidth(font: string, size: number, text: string): number {
  const ctx = getMeasureContext();
  if (!ctx) return text.length * size * 0.56;
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Salto de línea por palabras; si una palabra sola no entra, se corta por caracteres. */
export function wrapTextToWidth(text: string, font: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(font, size, candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);

    if (measureTextWidth(font, size, word) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = '';
    for (const ch of Array.from(word)) {
      if (chunk && measureTextWidth(font, size, chunk + ch) > maxWidth) {
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    current = chunk;
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Busca el tamaño de fuente más grande con el que el texto entra en `maxWidth`.
 * Primero intenta reducir el tamaño (hasta `shrinkBeforeWrap`) en una sola línea,
 * después permite hasta `maxLines` líneas y, como último recurso, sigue reduciendo.
 */
export function fitTextToBox(
  text: string,
  fontFor: (size: number) => string,
  baseSize: number,
  maxWidth: number,
  maxLines: number,
  shrinkBeforeWrap: number,
  minScale = 0.5
): FittedText {
  let last: FittedText | null = null;

  for (let factor = 1; factor >= minScale - 1e-6; factor -= 0.05) {
    const size = Math.max(8, Math.round(baseSize * factor * 10) / 10);
    const font = fontFor(size);
    const lines = wrapTextToWidth(text, font, size, maxWidth);
    last = { size, font, lines };

    if (lines.length === 1) return last;
    if (lines.length <= maxLines && factor <= shrinkBeforeWrap + 1e-6) return last;
  }

  return last ?? { size: baseSize, font: fontFor(baseSize), lines: [text] };
}

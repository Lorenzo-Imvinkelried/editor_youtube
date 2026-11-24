/**
 * Responsabilidad Única: Calcular el diseño de cada nodo de texto (tamaño ajustado, líneas,
 * cajas de papel y extensión real dibujada). El renderizador dibuja exactamente este diseño
 * y el encuadre automático de cámara usa su extensión, así ambos nunca discrepan.
 */

import { DslCanvasNode, TextShapeVariant } from '../dsl/dslTypes';
import { FittedText, FONT_STACK_MAP, fitTextToBox, measureTextWidth } from './textMeasure';

export type TextAlignMode = 'left' | 'center' | 'right';

export interface LocalExtents {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface LaidOutLine {
  text: string;
  width: number;
  y: number;
}

export interface TextNodeLayout {
  variant: TextShapeVariant;
  align: TextAlignMode;
  mainFont: string;
  mainSize: number;
  lines: LaidOutLine[];
  subFont: string;
  subSize: number;
  subLines: LaidOutLine[];
  divider?: { y: number; width: number };
  box?: { w: number; h: number; rotation: number };
  arc?: { radius: number; offsetY: number; chars: string[]; angles: number[] };
  totalChars: number;
  /** Extensión real dibujada relativa al centro del nodo (incluye sombras y rotación de la caja) */
  extents: LocalExtents;
}

const layoutCache = new Map<string, TextNodeLayout>();
const MAX_CACHE_ENTRIES = 3000;
const monoFont = (weight: number) => (s: number) => `${weight} ${s}px "Courier New", monospace`;

export function alignedLeft(align: TextAlignMode, width: number): number {
  if (align === 'left') return 0;
  if (align === 'right') return -width;
  return -width / 2;
}

export function layoutTextNode(node: DslCanvasNode, isLightPaper: boolean): TextNodeLayout {
  const key = [
    node.text ?? '',
    node.label,
    node.subtitle ?? '',
    node.textVariant ?? '',
    node.fontFamily ?? '',
    node.fontSize ?? '',
    node.width,
    node.textAlign ?? '',
    isLightPaper ? 1 : 0
  ].join('\u0001');

  const cached = layoutCache.get(key);
  if (cached) return cached;

  const layout = computeLayout(node, isLightPaper);
  if (layoutCache.size > MAX_CACHE_ENTRIES) layoutCache.clear();
  layoutCache.set(key, layout);
  return layout;
}

function computeLayout(node: DslCanvasNode, isLightPaper: boolean): TextNodeLayout {
  const text = node.text || node.label || 'Texto';
  const family = node.fontFamily || 'serif';
  const base = node.fontSize || 34;
  const boxW = Math.max(140, node.width || 600);
  const weight = family === 'mono' ? '700' : '800';
  const mainFontFor = (s: number) => `${weight} ${s}px ${FONT_STACK_MAP[family]}`;

  switch (node.textVariant || 'editorial-paper') {
    case 'clean-subtitle':
      return layoutTitleWithSubtitle(text, node, base, boxW);
    case 'vintage-stamp':
      return layoutStamp(text, node, base, boxW, mainFontFor);
    case 'highlight-box':
      return layoutHighlight(text, base, boxW, mainFontFor);
    case '3d-pop':
      return layoutLetterpress(text, base, boxW);
    case 'curved-arc':
      return layoutArc(text, base, boxW, mainFontFor);
    case 'outline-hollow':
      return layoutOutline(text, node, base, boxW, mainFontFor);
    case 'neon-glow':
      return layoutQuote(text, node, base, boxW, mainFontFor, isLightPaper);
    default:
      return layoutCaptionCard(text, base, boxW);
  }
}

function emptyLayout(variant: TextShapeVariant, align: TextAlignMode): TextNodeLayout {
  return {
    variant,
    align,
    mainFont: '',
    mainSize: 0,
    lines: [],
    subFont: '',
    subSize: 0,
    subLines: [],
    totalChars: 0,
    extents: { left: 0, right: 0, top: 0, bottom: 0 }
  };
}

function placeLines(fit: FittedText, top: number, lineHeight: number): LaidOutLine[] {
  return fit.lines.map((text, i) => ({
    text,
    width: measureTextWidth(fit.font, fit.size, text),
    y: top + lineHeight * (i + 0.5)
  }));
}

function widest(lines: LaidOutLine[]): number {
  return lines.reduce((max, line) => Math.max(max, line.width), 0);
}

function countChars(lines: LaidOutLine[]): number {
  return lines.reduce((sum, line) => sum + line.text.length, 0);
}

function rotatedHalf(hw: number, hh: number, rotation: number): [number, number] {
  const c = Math.abs(Math.cos(rotation));
  const s = Math.abs(Math.sin(rotation));
  return [hw * c + hh * s, hw * s + hh * c];
}

function withMain(layout: TextNodeLayout, fit: FittedText, lines: LaidOutLine[]): TextNodeLayout {
  return { ...layout, mainFont: fit.font, mainSize: fit.size, lines, totalChars: countChars(lines) };
}

function layoutTitleWithSubtitle(text: string, node: DslCanvasNode, base: number, boxW: number): TextNodeLayout {
  const align = node.textAlign || 'left';
  const main = fitTextToBox(text, (s) => `800 ${s}px "Georgia", "Playfair Display", serif`, base, boxW, 2, 0.8);
  const lh = main.size * 1.15;
  const sub = node.subtitle
    ? fitTextToBox(node.subtitle.toUpperCase(), monoFont(700), Math.round(main.size * 0.52), boxW, 2, 0.75)
    : null;
  const gap = main.size * 0.28;
  const subLh = sub ? sub.size * 1.3 : 0;
  const mainH = main.lines.length * lh;
  const total = mainH + (sub ? gap * 2 + sub.lines.length * subLh : 0);
  const top = -total / 2;

  const lines = placeLines(main, top, lh);
  const mainW = widest(lines);
  const dividerY = top + mainH + gap;
  const divider = sub ? { y: dividerY, width: Math.min(boxW, 340, Math.max(140, mainW)) } : undefined;
  const subLines = sub ? placeLines(sub, dividerY + gap, subLh) : [];
  const blockW = Math.max(mainW, widest(subLines), divider?.width ?? 0);
  const left = alignedLeft(align, blockW);

  return {
    ...withMain(emptyLayout('clean-subtitle', align), main, lines),
    subFont: sub?.font ?? '',
    subSize: sub?.size ?? 0,
    subLines,
    divider,
    extents: { left: left - 2, right: left + blockW + 3, top: top - 3, bottom: top + total + 3 }
  };
}

function layoutStamp(
  text: string,
  node: DslCanvasNode,
  base: number,
  boxW: number,
  mainFontFor: (s: number) => string
): TextNodeLayout {
  const inner = Math.max(100, boxW - 52);
  const main = fitTextToBox(text, mainFontFor, base, inner, 2, 0.8);
  const lh = main.size * 1.15;
  const sub = node.subtitle
    ? fitTextToBox(node.subtitle.toUpperCase(), monoFont(700), Math.round(main.size * 0.48), inner, 2, 0.75)
    : null;
  const gap = main.size * 0.22;
  const subLh = sub ? sub.size * 1.25 : 0;
  const mainH = main.lines.length * lh;
  const contentH = mainH + (sub ? gap + sub.lines.length * subLh : 0);
  const top = -contentH / 2;

  const lines = placeLines(main, top, lh);
  const subLines = sub ? placeLines(sub, top + mainH + gap, subLh) : [];
  const blockW = Math.max(widest(lines), widest(subLines));
  const w = Math.max(Math.min(240, boxW), blockW + 52);
  const h = contentH + 30;
  const rotation = -0.025;
  const [hw, hh] = rotatedHalf(w / 2, h / 2, rotation);

  return {
    ...withMain(emptyLayout('vintage-stamp', 'center'), main, lines),
    subFont: sub?.font ?? '',
    subSize: sub?.size ?? 0,
    subLines,
    box: { w, h, rotation },
    extents: { left: -hw - 2, right: hw + 2, top: -hh - 2, bottom: hh + 2 }
  };
}

function layoutHighlight(text: string, base: number, boxW: number, mainFontFor: (s: number) => string): TextNodeLayout {
  const main = fitTextToBox(text, mainFontFor, base, Math.max(100, boxW - 48), 2, 0.8);
  const lh = main.size * 1.15;
  const mainH = main.lines.length * lh;
  const lines = placeLines(main, -mainH / 2, lh);
  const w = Math.max(180, widest(lines) + 48);
  const h = mainH + 28;
  const rotation = -0.016;
  const [hw, hh] = rotatedHalf(w / 2, h / 2, rotation);

  return {
    ...withMain(emptyLayout('highlight-box', 'center'), main, lines),
    box: { w, h, rotation },
    extents: { left: -hw - 1, right: hw + 6, top: -hh - 1, bottom: hh + 7 }
  };
}

function layoutLetterpress(text: string, base: number, boxW: number): TextNodeLayout {
  const main = fitTextToBox(text, (s) => `900 ${s}px "Georgia", "Times New Roman", serif`, base, boxW - 8, 2, 0.78);
  const lh = main.size * 1.15;
  const mainH = main.lines.length * lh;
  const ruleGap = main.size * 0.14;
  const total = mainH + ruleGap + 6;
  const top = -total / 2;
  const lines = placeLines(main, top, lh);
  const blockW = widest(lines);
  const ruleW = Math.min(boxW, blockW + 24);
  const halfW = Math.max(blockW / 2, ruleW / 2);

  return {
    ...withMain(emptyLayout('3d-pop', 'center'), main, lines),
    divider: { y: top + mainH + ruleGap, width: ruleW },
    extents: { left: -halfW - 1, right: halfW + 5, top: top - 2, bottom: top + total + 5 }
  };
}

function layoutOutline(
  text: string,
  node: DslCanvasNode,
  base: number,
  boxW: number,
  mainFontFor: (s: number) => string
): TextNodeLayout {
  const align = node.textAlign || 'center';
  const main = fitTextToBox(text, mainFontFor, base, boxW - 4, 2, 0.8);
  const lh = main.size * 1.15;
  const mainH = main.lines.length * lh;
  const top = -mainH / 2;
  const lines = placeLines(main, top, lh);
  const blockW = widest(lines);
  const left = alignedLeft(align, blockW);

  return {
    ...withMain(emptyLayout('outline-hollow', align), main, lines),
    extents: { left: left - 2, right: left + blockW + 2, top: top - 2, bottom: top + mainH + 2 }
  };
}

function layoutQuote(
  text: string,
  node: DslCanvasNode,
  base: number,
  boxW: number,
  mainFontFor: (s: number) => string,
  isLightPaper: boolean
): TextNodeLayout {
  const align = node.textAlign || 'center';
  const fontFor = isLightPaper ? (s: number) => `italic 700 ${s}px "Georgia", "Playfair Display", serif` : mainFontFor;
  const main = fitTextToBox(text, fontFor, base, boxW - 12, 2, 0.8);
  const lh = main.size * 1.15;
  const sub = node.subtitle
    ? fitTextToBox(`— ${node.subtitle}`, monoFont(600), Math.round(main.size * 0.5), boxW - 12, 2, 0.7)
    : null;
  const gap = main.size * 0.18;
  const subLh = sub ? sub.size * 1.3 : 0;
  const mainH = main.lines.length * lh;
  const total = mainH + (sub ? gap + sub.lines.length * subLh : 0);
  const top = -total / 2;

  const lines = placeLines(main, top, lh);
  const subLines = sub ? placeLines(sub, top + mainH + gap, subLh) : [];
  const blockW = Math.max(widest(lines), widest(subLines));
  const left = alignedLeft(align, blockW);
  const glow = isLightPaper ? 2 : 6;

  return {
    ...withMain(emptyLayout('neon-glow', align), main, lines),
    subFont: sub?.font ?? '',
    subSize: sub?.size ?? 0,
    subLines,
    extents: { left: left - glow, right: left + blockW + glow, top: top - glow, bottom: top + total + glow }
  };
}

function layoutArc(text: string, base: number, boxW: number, mainFontFor: (s: number) => string): TextNodeLayout {
  const chars = Array.from(text);
  let size = base;
  let font = mainFontFor(size);
  let widths: number[] = [];
  let radius = 1;
  let theta = 0;
  let halfChord = 0;

  // El radio crece con el largo del texto para que las letras no se pisen; si el arco es más ancho que la caja, se achica.
  for (let factor = 1; factor >= 0.5 - 1e-6; factor -= 0.05) {
    size = Math.max(8, Math.round(base * factor * 10) / 10);
    font = mainFontFor(size);
    widths = chars.map((c) => measureTextWidth(font, size, c));
    const textW = Math.max(size, widths.reduce((a, b) => a + b, 0));
    radius = Math.max(size * 5.5, textW / 1.5);
    theta = textW / radius;
    halfChord = radius * Math.sin(theta / 2) + size * 0.6;
    if (halfChord * 2 <= boxW) break;
  }

  let cumulative = 0;
  const angles = widths.map((w) => {
    const angle = -theta / 2 + (cumulative + w / 2) / radius;
    cumulative += w;
    return angle;
  });
  const sag = radius * (1 - Math.cos(theta / 2));
  const offsetY = -sag / 2;

  return {
    ...emptyLayout('curved-arc', 'center'),
    mainFont: font,
    mainSize: size,
    arc: { radius, offsetY, chars, angles },
    totalChars: chars.length,
    extents: { left: -halfChord, right: halfChord, top: offsetY - size * 0.65, bottom: offsetY + sag + size * 0.65 }
  };
}

function layoutCaptionCard(text: string, base: number, boxW: number): TextNodeLayout {
  const main = fitTextToBox(text, (s) => `600 ${s}px "Georgia", "Inter", serif`, base, Math.max(100, boxW - 60), 3, 1);
  const lh = main.size * 1.3;
  const mainH = main.lines.length * lh;
  const lines = placeLines(main, -mainH / 2, lh);
  const w = Math.min(boxW, Math.max(Math.min(220, boxW), widest(lines) + 60));
  const h = Math.max(58, mainH + 30);

  return {
    ...withMain(emptyLayout('editorial-paper', 'center'), main, lines),
    box: { w, h, rotation: 0 },
    extents: { left: -w / 2 - 1, right: w / 2 + 6, top: -h / 2 - 1, bottom: h / 2 + 7 }
  };
}

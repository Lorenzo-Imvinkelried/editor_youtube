/**
 * Responsabilidad Única: Dibujar nodos de texto con estética editorial / papel vintage a partir
 * del diseño calculado por textLayout (tamaño ajustado y saltos de línea), de modo que el texto
 * dibujado nunca exceda la caja que usa el encuadre automático de la cámara.
 */

import { DslCanvasNode } from '../dsl/dslTypes';
import { clamp } from '../shared/math';
import { alignedLeft, LaidOutLine, layoutTextNode, TextAlignMode, TextNodeLayout } from './textLayout';

type Painter = (text: string, x: number, y: number) => void;

export function drawRichTextNode(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  textRevealProgress: number,
  isSelected: boolean,
  isLightPaper = true
): void {
  const layout = layoutTextNode(node, isLightPaper);
  const budget = Math.max(1, Math.round(layout.totalChars * clamp(textRevealProgress, 0, 1)));
  const mainInk = isLightPaper ? '#1e1610' : '#f8fafc';
  const accentInk = adaptAccentForPaper(node.color, isLightPaper);

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const fill: Painter = (t, x, y) => ctx.fillText(t, x, y);

  switch (layout.variant) {
    case 'clean-subtitle':
      drawTitleWithSubtitle(ctx, layout, budget, mainInk, accentInk, isLightPaper, fill);
      break;
    case 'vintage-stamp':
      drawStamp(ctx, layout, budget, accentInk, fill);
      break;
    case 'highlight-box':
      drawHighlightStrip(ctx, layout, budget, node.color, isLightPaper, fill);
      break;
    case '3d-pop':
      drawLetterpress(ctx, layout, budget, mainInk, accentInk, isLightPaper, fill);
      break;
    case 'curved-arc':
      drawArc(ctx, layout, budget, mainInk, accentInk, isLightPaper);
      break;
    case 'outline-hollow':
      ctx.font = layout.mainFont;
      ctx.strokeStyle = accentInk;
      ctx.lineWidth = 2.4;
      paintLines(layout.lines, layout.align, budget, (t, x, y) => ctx.strokeText(t, x, y));
      break;
    case 'neon-glow':
      drawQuote(ctx, layout, budget, node.color, accentInk, isLightPaper, fill);
      break;
    default:
      drawCaptionCard(ctx, layout, budget, accentInk, isLightPaper, fill);
      break;
  }

  if (isSelected) {
    const e = layout.extents;
    ctx.strokeStyle = '#9b2226';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(e.left, e.top, e.right - e.left, e.bottom - e.top);
  }

  ctx.restore();
}

/** Pinta las líneas respetando la alineación de la línea completa, así el efecto máquina de escribir no se desplaza. */
function paintLines(
  lines: LaidOutLine[],
  align: TextAlignMode,
  budget: number,
  paint: Painter,
  dx = 0,
  dy = 0
): void {
  let remaining = budget;
  for (const line of lines) {
    if (remaining <= 0) break;
    const part = remaining >= line.text.length ? line.text : line.text.slice(0, remaining);
    remaining -= line.text.length;
    paint(part, alignedLeft(align, line.width) + dx, line.y + dy);
  }
}

function drawTitleWithSubtitle(
  ctx: CanvasRenderingContext2D,
  layout: TextNodeLayout,
  budget: number,
  mainInk: string,
  accentInk: string,
  isLightPaper: boolean,
  fill: Painter
): void {
  ctx.font = layout.mainFont;
  if (isLightPaper) {
    ctx.fillStyle = 'rgba(255, 252, 245, 0.85)';
    paintLines(layout.lines, layout.align, budget, fill, 1.5, 1.5);
  }
  ctx.fillStyle = mainInk;
  paintLines(layout.lines, layout.align, budget, fill);

  if (layout.divider) {
    const x = alignedLeft(layout.align, layout.divider.width);
    ctx.save();
    ctx.strokeStyle = accentInk;
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, layout.divider.y);
    ctx.lineTo(x + layout.divider.width, layout.divider.y);
    ctx.stroke();
    ctx.restore();
  }

  if (layout.subLines.length > 0) {
    ctx.font = layout.subFont;
    ctx.fillStyle = accentInk;
    paintLines(layout.subLines, layout.align, Infinity, fill);
  }
}

function drawStamp(
  ctx: CanvasRenderingContext2D,
  layout: TextNodeLayout,
  budget: number,
  stampInk: string,
  fill: Painter
): void {
  const box = layout.box ?? { w: 0, h: 0, rotation: 0 };
  ctx.save();
  ctx.rotate(box.rotation);
  ctx.strokeStyle = stampInk;
  ctx.lineWidth = 3;
  ctx.strokeRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(-box.w / 2 + 5, -box.h / 2 + 5, box.w - 10, box.h - 10);

  ctx.fillStyle = stampInk;
  ctx.font = layout.mainFont;
  paintLines(layout.lines, 'center', budget, fill);
  if (layout.subLines.length > 0) {
    ctx.font = layout.subFont;
    paintLines(layout.subLines, 'center', Infinity, fill);
  }
  ctx.restore();
}

function drawHighlightStrip(
  ctx: CanvasRenderingContext2D,
  layout: TextNodeLayout,
  budget: number,
  rawColor: string,
  isLightPaper: boolean,
  fill: Painter
): void {
  const box = layout.box ?? { w: 0, h: 0, rotation: 0 };
  ctx.save();
  ctx.rotate(box.rotation);
  ctx.fillStyle = 'rgba(38, 26, 14, 0.2)';
  ctx.fillRect(-box.w / 2 + 5, -box.h / 2 + 6, box.w, box.h);
  ctx.fillStyle = isLightPaper ? '#e6c27a' : rawColor || '#d4a359';
  ctx.fillRect(-box.w / 2, -box.h / 2, box.w, box.h);
  ctx.strokeStyle = 'rgba(62, 42, 22, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-box.w / 2 + 3, -box.h / 2 + 3, box.w - 6, box.h - 6);
  ctx.restore();

  ctx.font = layout.mainFont;
  ctx.fillStyle = '#1d150e';
  paintLines(layout.lines, 'center', budget, fill);
}

function drawLetterpress(
  ctx: CanvasRenderingContext2D,
  layout: TextNodeLayout,
  budget: number,
  mainInk: string,
  accentInk: string,
  isLightPaper: boolean,
  fill: Painter
): void {
  ctx.font = layout.mainFont;
  ctx.fillStyle = isLightPaper ? 'rgba(139, 38, 29, 0.25)' : 'rgba(0, 0, 0, 0.6)';
  paintLines(layout.lines, 'center', budget, fill, 4, 4);
  ctx.fillStyle = isLightPaper ? mainInk : '#f8ebd2';
  paintLines(layout.lines, 'center', budget, fill);

  if (layout.divider) {
    const { y, width } = layout.divider;
    ctx.strokeStyle = accentInk;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-width / 2, y);
    ctx.lineTo(width / 2, y);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-width / 2 + 16, y + 5);
    ctx.lineTo(width / 2 - 16, y + 5);
    ctx.stroke();
  }
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  layout: TextNodeLayout,
  budget: number,
  mainInk: string,
  accentInk: string,
  isLightPaper: boolean
): void {
  const arc = layout.arc;
  if (!arc) return;

  ctx.font = layout.mainFont;
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(0, arc.offsetY + arc.radius);
  const count = Math.min(budget, arc.chars.length);
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.rotate(arc.angles[i]);
    ctx.translate(0, -arc.radius);
    if (!isLightPaper) {
      ctx.strokeStyle = accentInk;
      ctx.lineWidth = 3;
      ctx.strokeText(arc.chars[i], 0, 0);
    }
    ctx.fillStyle = isLightPaper ? accentInk : mainInk;
    ctx.fillText(arc.chars[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawQuote(
  ctx: CanvasRenderingContext2D,
  layout: TextNodeLayout,
  budget: number,
  rawColor: string,
  accentInk: string,
  isLightPaper: boolean,
  fill: Painter
): void {
  ctx.font = layout.mainFont;
  if (isLightPaper) {
    ctx.fillStyle = accentInk;
    paintLines(layout.lines, layout.align, budget, fill);
  } else {
    ctx.save();
    ctx.strokeStyle = rawColor;
    ctx.globalAlpha *= 0.3;
    ctx.lineWidth = 8;
    paintLines(layout.lines, layout.align, budget, (t, x, y) => ctx.strokeText(t, x, y));
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    paintLines(layout.lines, layout.align, budget, fill);
  }

  if (layout.subLines.length > 0) {
    ctx.font = layout.subFont;
    ctx.fillStyle = isLightPaper ? '#4a3b2c' : '#cbd5e1';
    paintLines(layout.subLines, layout.align, Infinity, fill);
  }
}

function drawCaptionCard(
  ctx: CanvasRenderingContext2D,
  layout: TextNodeLayout,
  budget: number,
  accentInk: string,
  isLightPaper: boolean,
  fill: Painter
): void {
  const { w, h } = layout.box ?? { w: 0, h: 0 };
  ctx.fillStyle = isLightPaper ? 'rgba(42, 28, 14, 0.18)' : 'rgba(0, 0, 0, 0.48)';
  ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
  ctx.fillStyle = isLightPaper ? '#fbf6eb' : '#f3ead8';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = '#c8b79a';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = accentInk;
  ctx.fillRect(-w / 2, -h / 2, 6, h);

  ctx.font = layout.mainFont;
  ctx.fillStyle = '#1f1710';
  paintLines(layout.lines, 'center', budget, fill, 3);
}

function adaptAccentForPaper(rawColor: string | undefined, isLightPaper: boolean): string {
  if (!rawColor) return isLightPaper ? '#8b261d' : '#e0b354';
  if (!isLightPaper) return rawColor;

  // Proyectos viejos con colores neón sobre papel claro se mapean a tintas históricas
  const lower = rawColor.toLowerCase();
  if (['#38bdf8', '#22d3ee', '#06b6d4', '#60a5fa'].includes(lower)) return '#1d3557';
  if (['#facc15', '#fbbf24'].includes(lower)) return '#8c4a15';
  if (['#34d399', '#10b981'].includes(lower)) return '#26463b';
  if (['#818cf8', '#a855f7'].includes(lower)) return '#4a2545';
  if (['#f97316', '#f43f5e', '#ec4899'].includes(lower)) return '#8b261d';
  return rawColor;
}

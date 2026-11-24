/**
 * Responsabilidad Única: Renderizar nodos de texto en múltiples fuentes tipográficas
 * (display, serif, mono, handwritten, sans) y formas visuales (3d-pop, highlight-box,
 * neon-glow, curved-arc, outline-hollow, pill-badge) con soporte para efecto typewriter.
 */

import { DslCanvasNode, TextFontFamily, TextShapeVariant } from '../dsl/dslTypes';
import { clamp } from '../shared/math';

const FONT_STACK_MAP: Record<TextFontFamily, string> = {
  display: '"Impact", "Arial Black", "Montserrat", system-ui, sans-serif',
  sans: '"Inter", "Segoe UI", system-ui, sans-serif',
  serif: '"Georgia", "Times New Roman", serif',
  mono: '"Cascadia Code", "Fira Code", "Consolas", monospace',
  handwritten: '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive'
};

export function drawRichTextNode(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  textRevealProgress: number,
  isSelected: boolean
): void {
  const fullText = node.text || node.label || 'Texto';
  const charCount = Math.max(1, Math.round(fullText.length * clamp(textRevealProgress, 0, 1)));
  const visibleText = fullText.slice(0, charCount);

  const fontFamilyKey: TextFontFamily = node.fontFamily || 'display';
  const variant: TextShapeVariant = node.textVariant || '3d-pop';
  const fontSize = node.fontSize || (variant === '3d-pop' ? 38 : 28);
  const fontWeight = fontFamilyKey === 'display' ? '900' : '700';

  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_STACK_MAP[fontFamilyKey]}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  switch (variant) {
    case '3d-pop': {
      draw3dPopText(ctx, visibleText, fontSize, node.color, node.accentColor || '#ffffff');
      break;
    }
    case 'highlight-box': {
      drawHighlightBoxText(ctx, visibleText, fontSize, node.color, node.accentColor || '#030712');
      break;
    }
    case 'neon-glow': {
      drawNeonGlowText(ctx, visibleText, node.color, node.accentColor || '#ffffff');
      break;
    }
    case 'curved-arc': {
      drawCurvedArcText(ctx, visibleText, fontSize, node.color, node.accentColor || '#ffffff');
      break;
    }
    case 'outline-hollow': {
      drawOutlineHollowText(ctx, visibleText, node.color);
      break;
    }
    case 'pill-badge':
    default: {
      drawPillBadgeText(ctx, visibleText, node.width, node.height, node.color, node.accentColor || '#ffffff');
      break;
    }
  }

  // Marco de selección cuando el usuario clickea el texto
  if (isSelected) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-node.width / 2, -node.height / 2, node.width, node.height);
  }

  ctx.restore();
}

function draw3dPopText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  primaryColor: string,
  faceColor: string
): void {
  const depthLayers = Math.max(4, Math.round(fontSize * 0.16));

  // Capas de extrusión 3D
  ctx.fillStyle = primaryColor;
  for (let d = depthLayers; d >= 1; d--) {
    ctx.fillText(text, d * 1.1, d * 1.2);
  }

  // Contorno negro grueso estilo miniatura/título de YouTube
  ctx.lineWidth = Math.max(4, fontSize * 0.18);
  ctx.strokeStyle = '#020617';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, 0, 0);

  // Cara frontal nítida
  ctx.fillStyle = faceColor;
  ctx.fillText(text, 0, 0);
}

function drawHighlightBoxText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  highlightColor: string,
  textColor: string
): void {
  const metrics = ctx.measureText(text);
  const padX = 24;
  const padY = 14;
  const boxW = Math.max(120, metrics.width + padX * 2);
  const boxH = fontSize + padY * 2;

  ctx.save();
  ctx.rotate(-0.025); // Leve inclinación editorial estilo documental
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = highlightColor;
  ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);
  ctx.restore();

  ctx.fillStyle = textColor;
  ctx.fillText(text, 0, 0);
}

function drawNeonGlowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  glowColor: string,
  coreColor: string
): void {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 28;
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = 3;
  ctx.strokeText(text, 0, 0);

  ctx.shadowBlur = 14;
  ctx.fillStyle = coreColor;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawOutlineHollowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  strokeColor: string
): void {
  ctx.save();
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2.8;
  ctx.strokeText(text, 0, 0);
  ctx.restore();
}

function drawCurvedArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  glowColor: string,
  fillColor: string
): void {
  const radius = Math.max(140, fontSize * 4.2);
  const anglePerChar = 0.085;
  const totalAngle = (text.length - 1) * anglePerChar;
  const startAngle = -Math.PI / 2 - totalAngle / 2;

  ctx.save();
  ctx.translate(0, radius * 0.72);
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 16;

  for (let i = 0; i < text.length; i++) {
    const charAngle = startAngle + i * anglePerChar;
    ctx.save();
    ctx.rotate(charAngle + Math.PI / 2);
    ctx.translate(0, -radius);
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 4;
    ctx.strokeText(text[i], 0, 0);
    ctx.fillStyle = fillColor;
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function drawPillBadgeText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  borderColor: string,
  textColor: string
): void {
  const metrics = ctx.measureText(text);
  const w = Math.max(width, metrics.width + 44);
  const h = Math.max(height, 64);

  ctx.save();
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2.5;

  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -h / 2);
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
  ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.fillStyle = textColor;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

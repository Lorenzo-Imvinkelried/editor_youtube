/**
 * Responsabilidad Única: Renderizar nodos de texto con estética Editorial / Imprenta / Arte en Papel Vintage
 * (tiras de papel rasgado/recortado, sellos de archivo, titulares serif clásicos en tinta carbón/carmesí,
 * cintas resaltadas color ocre y máquina de escribir), adaptándose automáticamente a fondos claros u oscuros.
 */

import { DslCanvasNode, TextFontFamily, TextShapeVariant } from '../dsl/dslTypes';
import { clamp } from '../shared/math';

const FONT_STACK_MAP: Record<TextFontFamily, string> = {
  display: '"Georgia", "Playfair Display", "Times New Roman", serif',
  serif: '"Georgia", "Palatino Linotype", "Book Antiqua", serif',
  sans: '"Inter", "Segoe UI", system-ui, sans-serif',
  mono: '"Courier New", "Cascadia Mono", "Consolas", monospace',
  handwritten: '"Segoe Print", "Bradley Hand", "Caveat", cursive'
};

export function drawRichTextNode(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  textRevealProgress: number,
  isSelected: boolean,
  isLightPaper = true
): void {
  const fullText = node.text || node.label || 'Texto';
  const charCount = Math.max(1, Math.round(fullText.length * clamp(textRevealProgress, 0, 1)));
  const visibleText = fullText.slice(0, charCount);

  const fontFamilyKey: TextFontFamily = node.fontFamily || 'serif';
  const variant: TextShapeVariant = node.textVariant || 'editorial-paper';
  const fontSize = node.fontSize || 34;
  const fontWeight = fontFamilyKey === 'mono' ? '700' : '800';

  const defaultInk = isLightPaper ? '#1e1610' : '#f8fafc';
  const accentInk = adaptAccentForPaper(node.color, isLightPaper);

  ctx.save();
  ctx.font = `${fontWeight} ${fontSize}px ${FONT_STACK_MAP[fontFamilyKey]}`;
  ctx.textAlign = node.textAlign || 'center';
  ctx.textBaseline = 'middle';

  switch (variant) {
    case 'clean-subtitle': {
      drawEditorialTitleAndSubtitle(
        ctx,
        visibleText,
        node.subtitle,
        fontSize,
        accentInk,
        defaultInk,
        node.textAlign || 'left',
        isLightPaper
      );
      break;
    }
    case 'vintage-stamp': {
      drawVintageStampText(ctx, visibleText, node.subtitle, fontSize, accentInk);
      break;
    }
    case 'highlight-box': {
      drawPaperHighlightStrip(ctx, visibleText, fontSize, node.color, isLightPaper);
      break;
    }
    case '3d-pop': {
      drawVintageLetterpressTitle(ctx, visibleText, fontSize, accentInk, defaultInk, isLightPaper);
      break;
    }
    case 'curved-arc': {
      drawCurvedArcText(ctx, visibleText, fontSize, accentInk, defaultInk, isLightPaper);
      break;
    }
    case 'outline-hollow': {
      ctx.strokeStyle = accentInk;
      ctx.lineWidth = 2.4;
      ctx.strokeText(visibleText, 0, 0);
      break;
    }
    case 'neon-glow': {
      // En modo papel vintage se convierte en manuscrito en tinta estilográfica con subrayado cálido
      if (isLightPaper) {
        drawFountainPenQuote(ctx, visibleText, node.subtitle, fontSize, accentInk);
      } else {
        drawDarkGlowText(ctx, visibleText, node.color, '#ffffff');
      }
      break;
    }
    case 'editorial-paper':
    case 'pill-badge':
    default: {
      drawPaperCutoutCaptionCard(ctx, visibleText, fontSize, node.width, accentInk, isLightPaper);
      break;
    }
  }

  if (isSelected) {
    ctx.strokeStyle = '#9b2226';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-node.width / 2, -node.height / 2, node.width, node.height);
  }

  ctx.restore();
}

function adaptAccentForPaper(rawColor: string | undefined, isLightPaper: boolean): string {
  if (!rawColor) return isLightPaper ? '#8b261d' : '#e0b354';
  if (!isLightPaper) return rawColor;

  // Si un proyecto viejo traía colores cian/neón brillantes sobre papel claro, mapearlos a tintas históricas ricas
  const lower = rawColor.toLowerCase();
  if (lower === '#38bdf8' || lower === '#22d3ee' || lower === '#06b6d4' || lower === '#60a5fa') {
    return '#1d3557'; // Azul de Prusia histórico
  }
  if (lower === '#facc15' || lower === '#fbbf24') {
    return '#8c4a15'; // Sepia cobre intenso
  }
  if (lower === '#34d399' || lower === '#10b981') {
    return '#26463b'; // Verde bosque imprenta
  }
  if (lower === '#818cf8' || lower === '#a855f7') {
    return '#4a2545'; // Borgoña ciruela antiguo
  }
  if (lower === '#f97316' || lower === '#f43f5e' || lower === '#ec4899') {
    return '#8b261d'; // Rojo lacre editorial
  }
  return rawColor;
}

function drawEditorialTitleAndSubtitle(
  ctx: CanvasRenderingContext2D,
  mainText: string,
  subtitle: string | undefined,
  fontSize: number,
  accentInk: string,
  mainInk: string,
  align: 'center' | 'left' | 'right',
  isLightPaper: boolean
): void {
  ctx.save();
  ctx.textAlign = align;

  // Sombra sutil de relieve en papel
  if (isLightPaper) {
    ctx.fillStyle = 'rgba(255, 252, 245, 0.85)';
    ctx.font = `800 ${fontSize}px "Georgia", "Playfair Display", serif`;
    ctx.fillText(mainText, 1.5, (subtitle ? -fontSize * 0.42 : 0) + 1.5);
  }

  ctx.fillStyle = mainInk;
  ctx.font = `800 ${fontSize}px "Georgia", "Playfair Display", serif`;
  ctx.fillText(mainText, 0, subtitle ? -fontSize * 0.42 : 0);

  if (subtitle) {
    // Línea divisoria fina estilo grabado editorial
    const lineY = fontSize * 0.08;
    const lineW = Math.min(340, Math.max(140, mainText.length * fontSize * 0.42));
    const startX = align === 'left' ? 0 : align === 'right' ? -lineW : -lineW / 2;

    ctx.strokeStyle = accentInk;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(startX, lineY);
    ctx.lineTo(startX + lineW, lineY);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = accentInk;
    ctx.font = `700 ${Math.round(fontSize * 0.52)}px "Courier New", monospace`;
    ctx.fillText(subtitle.toUpperCase(), 0, fontSize * 0.52);
  }
  ctx.restore();
}

function drawVintageLetterpressTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  accentInk: string,
  mainInk: string,
  isLightPaper: boolean
): void {
  ctx.save();
  ctx.font = `900 ${fontSize}px "Georgia", "Times New Roman", serif`;

  // Sombra desplazada de xilografía / prensa antigua
  ctx.fillStyle = isLightPaper ? 'rgba(139, 38, 29, 0.25)' : 'rgba(0, 0, 0, 0.6)';
  ctx.fillText(text, 4, 4);

  ctx.fillStyle = isLightPaper ? mainInk : '#f8ebd2';
  ctx.fillText(text, 0, 0);

  // Doble filete decorativo inferior estilo titular de periódico de 1895
  const w = Math.min(680, ctx.measureText(text).width + 24);
  const lineY = fontSize * 0.62;
  ctx.strokeStyle = accentInk;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-w / 2, lineY);
  ctx.lineTo(w / 2, lineY);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 16, lineY + 5);
  ctx.lineTo(w / 2 - 16, lineY + 5);
  ctx.stroke();

  ctx.restore();
}

function drawPaperHighlightStrip(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  rawColor: string,
  isLightPaper: boolean
): void {
  const metrics = ctx.measureText(text);
  const boxW = Math.max(180, metrics.width + 48);
  const boxH = fontSize + 28;

  ctx.save();
  ctx.rotate(-0.016);

  // Sombra suave de recorte de papel pegado
  ctx.fillStyle = 'rgba(38, 26, 14, 0.2)';
  ctx.fillRect(-boxW / 2 + 5, -boxH / 2 + 6, boxW, boxH);

  // Tira de papel ocre/mostaza vintage o terracota suave
  ctx.fillStyle = isLightPaper ? '#e6c27a' : rawColor || '#d4a359';
  ctx.fillRect(-boxW / 2, -boxH / 2, boxW, boxH);

  ctx.strokeStyle = 'rgba(62, 42, 22, 0.45)';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-boxW / 2 + 3, -boxH / 2 + 3, boxW - 6, boxH - 6);
  ctx.restore();

  ctx.fillStyle = '#1d150e';
  ctx.fillText(text, 0, 0);
}

function drawVintageStampText(
  ctx: CanvasRenderingContext2D,
  text: string,
  subtitle: string | undefined,
  fontSize: number,
  stampInk: string
): void {
  const metrics = ctx.measureText(text);
  const boxW = Math.max(240, metrics.width + 52);
  const boxH = subtitle ? fontSize * 1.9 + 24 : fontSize + 30;

  ctx.save();
  ctx.rotate(-0.025);
  ctx.strokeStyle = stampInk;
  ctx.lineWidth = 3;
  ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

  ctx.lineWidth = 1.2;
  ctx.strokeRect(-boxW / 2 + 5, -boxH / 2 + 5, boxW - 10, boxH - 10);

  ctx.fillStyle = stampInk;
  ctx.fillText(text, 0, subtitle ? -fontSize * 0.28 : 0);

  if (subtitle) {
    ctx.font = `700 ${Math.round(fontSize * 0.48)}px "Courier New", monospace`;
    ctx.fillText(subtitle.toUpperCase(), 0, fontSize * 0.45);
  }
  ctx.restore();
}

function drawFountainPenQuote(
  ctx: CanvasRenderingContext2D,
  text: string,
  subtitle: string | undefined,
  fontSize: number,
  accentInk: string
): void {
  ctx.save();
  ctx.font = `italic 700 ${fontSize}px "Georgia", "Playfair Display", serif`;
  ctx.fillStyle = accentInk;
  ctx.fillText(text, 0, subtitle ? -fontSize * 0.3 : 0);

  if (subtitle) {
    ctx.font = `600 ${Math.round(fontSize * 0.5)}px "Courier New", monospace`;
    ctx.fillStyle = '#4a3b2c';
    ctx.fillText(`— ${subtitle}`, 0, fontSize * 0.48);
  }
  ctx.restore();
}

function drawDarkGlowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  glowColor: string,
  coreColor: string
): void {
  ctx.save();
  ctx.strokeStyle = glowColor;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 8;
  ctx.strokeText(text, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = coreColor;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawCurvedArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  accentInk: string,
  mainInk: string,
  isLightPaper: boolean
): void {
  const radius = Math.max(200, fontSize * 5.5);
  const anglePerChar = 0.064;
  const totalAngle = (text.length - 1) * anglePerChar;
  const startAngle = -Math.PI / 2 - totalAngle / 2;

  ctx.save();
  ctx.translate(0, radius);

  for (let i = 0; i < text.length; i++) {
    const charAngle = startAngle + i * anglePerChar;
    ctx.save();
    ctx.rotate(charAngle + Math.PI / 2);
    ctx.translate(0, -radius);
    if (!isLightPaper) {
      ctx.strokeStyle = accentInk;
      ctx.lineWidth = 3;
      ctx.strokeText(text[i], 0, 0);
    }
    ctx.fillStyle = isLightPaper ? accentInk : mainInk;
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Tira de papel crema tipo ficha mecanografiada / recorte documental para narraciones y subtítulos.
 */
function drawPaperCutoutCaptionCard(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  minWidth: number,
  accentInk: string,
  isLightPaper: boolean
): void {
  ctx.save();
  ctx.font = `600 ${fontSize}px "Georgia", "Inter", serif`;
  const metrics = ctx.measureText(text);
  const w = Math.max(minWidth, metrics.width + 52);
  const h = Math.max(58, fontSize + 32);

  // Sombra cálida de papel recortado apoyado sobre la mesa
  ctx.fillStyle = isLightPaper ? 'rgba(42, 28, 14, 0.18)' : 'rgba(0, 0, 0, 0.48)';
  ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);

  // Ficha de papel crema antiguo (#fbf6eb)
  ctx.fillStyle = isLightPaper ? '#fbf6eb' : '#f3ead8';
  ctx.fillRect(-w / 2, -h / 2, w, h);

  // Borde fino de papel y marcador lateral izquierdo en tinta
  ctx.strokeStyle = '#c8b79a';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(-w / 2, -h / 2, w, h);

  ctx.fillStyle = accentInk;
  ctx.fillRect(-w / 2, -h / 2, 6, h);

  ctx.fillStyle = '#1f1710';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 3, 0);
  ctx.restore();
}

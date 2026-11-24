/**
 * Responsabilidad Única: Renderizar un fotograma completo del Canvas Cuasi Infinito
 * con estética de Arte en Papel Vintage (fotografías impresas grandes con marco crema,
 * cinta de papel kraft, grabados de patente en tinta y recortes editoriales) a 60 FPS.
 */

import { DslCanvasNode, DslScene } from '../dsl/dslTypes';
import { degToRad } from '../shared/math';
import {
  isSceneLightPaper,
  renderCinematicBackground
} from './backgroundRenderer';
import { CameraState } from './cameraEvaluator';
import { getOrLoadCanvasImage } from './imageCache';
import { EvaluatedCanvasNode } from './nodeEvaluator';
import { drawBuiltinVectorIcon } from './svgIcons';
import { drawRichTextNode } from './textRenderer';
import {
  computeYouTubeFrameRect,
  renderYouTubeScreenOverlay,
  YouTubeOverlayOptions
} from './youtubeFrameOverlay';

export interface ViewportTransformOverride {
  panX: number;
  panY: number;
  zoomMultiplier: number;
}

export function renderInfiniteCanvasFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: DslScene,
  evaluatedNodes: EvaluatedCanvasNode[],
  camera: CameraState,
  selectedNodeId: string | null,
  manualOverride: ViewportTransformOverride,
  youtubeOptions: YouTubeOverlayOptions
): void {
  ctx.save();

  const ytFrame = computeYouTubeFrameRect(
    width,
    height,
    youtubeOptions.aspectRatio,
    Boolean(youtubeOptions.isExportRender)
  );

  const effectiveZoom = camera.zoom * manualOverride.zoomMultiplier * ytFrame.scaleFactor;
  const effectiveCamX = camera.x - manualOverride.panX / effectiveZoom;
  const effectiveCamY = camera.y - manualOverride.panY / effectiveZoom;
  const lightPaper = isSceneLightPaper(scene);

  // 1. Fondo de papel antiguo con textura de fibra y viñeta cálida
  renderCinematicBackground(
    ctx,
    width,
    height,
    ytFrame.centerX,
    ytFrame.centerY,
    effectiveCamX,
    effectiveCamY,
    scene
  );

  // 2. Transformación de espacio de cámara centrada exactamente en el marco YouTube
  ctx.save();
  ctx.translate(ytFrame.centerX, ytFrame.centerY);
  ctx.scale(effectiveZoom, effectiveZoom);
  ctx.rotate(degToRad(-camera.rotation));
  ctx.translate(-effectiveCamX, -effectiveCamY);

  // 3. Ordenar por profundidad Z para Parallax 2.5D suave con Frustum Culling
  const sortedByDepth = [...evaluatedNodes].sort((a, b) => a.node.z - b.node.z);
  const cullRadiusWorldX = (width / effectiveZoom) * 0.85 + 750;
  const cullRadiusWorldY = (height / effectiveZoom) * 0.85 + 750;

  for (const item of sortedByDepth) {
    if (
      item.node.type === 'image' &&
      Math.abs(item.x - effectiveCamX) < 4200 &&
      Math.abs(item.y - effectiveCamY) < 3200
    ) {
      getOrLoadCanvasImage(item.node.src, item.node.imageQuery);
    }

    if (item.opacity <= 0.01 || item.scale <= 0.01) continue;

    const parallaxFactor = item.node.z * 0.1;
    const parallaxOffsetX = (effectiveCamX - item.x) * -parallaxFactor;
    const parallaxOffsetY = (effectiveCamY - item.y) * -parallaxFactor;
    const finalX = item.x + parallaxOffsetX;
    const finalY = item.y + parallaxOffsetY;

    if (
      Math.abs(finalX - effectiveCamX) > cullRadiusWorldX ||
      Math.abs(finalY - effectiveCamY) > cullRadiusWorldY
    ) {
      continue;
    }

    drawSingleCanvasNode(
      ctx,
      item,
      finalX,
      finalY,
      item.node.id === selectedNodeId,
      lightPaper
    );
  }
  ctx.restore();

  // 4. Simulador de Pantalla de YouTube encima del canvas infinito (se omite al exportar MP4)
  if (!youtubeOptions.isExportRender) {
    renderYouTubeScreenOverlay(ctx, width, height, ytFrame, youtubeOptions);
  }

  ctx.restore();
}

function drawSingleCanvasNode(
  ctx: CanvasRenderingContext2D,
  evaluated: EvaluatedCanvasNode,
  renderX: number,
  renderY: number,
  isSelected: boolean,
  isLightPaper: boolean
): void {
  const { node, scale, scaleX, scaleY, rotation, opacity, textRevealProgress } = evaluated;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(renderX, renderY);
  ctx.rotate(degToRad(rotation));
  ctx.scale(scale * (scaleX ?? 1), scale * (scaleY ?? 1));

  if (node.type === 'text') {
    drawRichTextNode(ctx, node, textRevealProgress, isSelected, isLightPaper);
  } else if (node.type === 'image') {
    drawVintagePrintedPhotograph(ctx, node, isSelected, opacity);
  } else {
    drawVintagePatentSketchCard(ctx, node, isSelected, opacity);
  }

  ctx.restore();
}

/**
 * Dibuja una fotografía impresa en papel antiguo / marco Polaroid de archivo grande,
 * con sombra de papel sobre la mesa, encuadre aspect-cover sin deformar rostros,
 * veladura cálida vintage y cinta adhesiva de papel kraft arriba.
 */
function drawVintagePrintedPhotograph(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  isSelected: boolean,
  opacity: number
): void {
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const cached = getOrLoadCanvasImage(node.src, node.imageQuery);

  ctx.save();

  // 1. Sombra cálida de fotografía de papel apoyada sobre la mesa
  ctx.fillStyle = 'rgba(36, 24, 12, 0.26)';
  ctx.fillRect(-halfW + 9, -halfH + 12, node.width, node.height);

  // 2. Papel fotográfico crema antiguo (#fcf8ef)
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#fcf8ef';
  ctx.fillRect(-halfW, -halfH, node.width, node.height);

  // Borde sutil de cartulina fotográfica envejecida
  ctx.strokeStyle = isSelected ? '#9b2226' : '#cbbba0';
  ctx.lineWidth = isSelected ? 3.5 : 1.8;
  ctx.strokeRect(-halfW, -halfH, node.width, node.height);

  // Ventana interior de la foto (margen tipo copia revelada de archivo)
  const padSide = 15;
  const padTop = 15;
  const padBottom = node.label ? 48 : 18;
  const photoX = -halfW + padSide;
  const photoY = -halfH + padTop;
  const photoW = node.width - padSide * 2;
  const photoH = node.height - padTop - padBottom;

  // Fondo sepia suave dentro de la ventana fotográfica
  ctx.fillStyle = '#e5dac3';
  ctx.fillRect(photoX, photoY, photoW, photoH);

  if (cached && cached.status === 'loaded') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(photoX, photoY, photoW, photoH);
    ctx.clip();

    drawImageCover(ctx, cached.img, photoX, photoY, photoW, photoH);

    // Veladura cálida de archivo histórico + viñeta interna sutil
    ctx.fillStyle = 'rgba(155, 118, 68, 0.09)';
    ctx.fillRect(photoX, photoY, photoW, photoH);

    ctx.strokeStyle = 'rgba(45, 32, 18, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(photoX, photoY, photoW, photoH);
    ctx.restore();
  } else {
    // Mientras descarga la foto de internet, mostrar grabado de retrato clásico en tinta sepia
    drawBuiltinVectorIcon(
      ctx,
      node.icon || 'portrait',
      Math.min(photoW, photoH) * 0.68,
      '#5c4328'
    );
  }

  // 3. Cinta adhesiva de papel kraft / masking tape pegada arriba de la foto
  drawKraftMaskingTape(ctx, 0, -halfH - 2, 118, 24, -0.035);

  // 4. Epígrafe impreso estilo máquina de escribir en el margen inferior blanco de la foto
  if (node.label) {
    ctx.fillStyle = '#261c14';
    ctx.font = '700 15px "Courier New", "Georgia", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.label, 0, halfH - padBottom / 2 - 1);
  }

  ctx.restore();
}

/**
 * Dibuja tarjetas de vectores/diagramas como Láminas de Patente / Grabados en Tinta sobre Pergamino.
 */
function drawVintagePatentSketchCard(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  isSelected: boolean,
  opacity: number
): void {
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const inkColor = resolveVintageInkColor(node.color);

  ctx.save();

  // Sombra de papel pergamino sobre la mesa
  ctx.fillStyle = 'rgba(38, 25, 12, 0.23)';
  ctx.fillRect(-halfW + 8, -halfH + 10, node.width, node.height);

  // Papel pergamino técnico (#f0e5ce)
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#f0e5ce';
  ctx.fillRect(-halfW, -halfH, node.width, node.height);

  // Doble recuadro de lámina de patente del siglo XIX
  ctx.strokeStyle = isSelected ? '#9b2226' : inkColor;
  ctx.lineWidth = isSelected ? 3.2 : 2.2;
  ctx.strokeRect(-halfW + 8, -halfH + 8, node.width - 16, node.height - 16);

  ctx.lineWidth = 1;
  ctx.strokeRect(-halfW + 14, -halfH + 14, node.width - 28, node.height - 28);

  // Encabezado pequeño estilo "FIG. PATENT ARCHIVE"
  ctx.fillStyle = inkColor;
  ctx.globalAlpha = opacity * 0.72;
  ctx.font = '700 11px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('• ARCHIVO HISTÓRICO / LÁMINA •', 0, -halfH + 28);

  ctx.globalAlpha = opacity;
  if (node.type === 'badge') {
    ctx.fillStyle = inkColor;
    ctx.font = '800 20px "Georgia", serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.text || node.label, 0, -6);

    ctx.fillStyle = '#5c4732';
    ctx.font = '600 13px "Courier New", monospace';
    ctx.fillText(node.label, 0, 24);
  } else {
    drawBuiltinVectorIcon(
      ctx,
      node.icon || 'portrait',
      Math.min(node.width, node.height) * 0.58,
      inkColor
    );

    if (node.label) {
      ctx.fillStyle = '#231911';
      ctx.font = '700 15px "Georgia", serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, 0, halfH - 26);
    }
  }

  // Cinta adhesiva kraft arriba
  drawKraftMaskingTape(ctx, 0, -halfH - 1, 104, 22, 0.03);

  ctx.restore();
}

function drawKraftMaskingTape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  angleRad: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.fillStyle = 'rgba(222, 196, 145, 0.78)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(160, 132, 86, 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const iw = img.naturalWidth || img.width || w;
  const ih = img.naturalHeight || img.height || h;
  const imgRatio = iw / Math.max(1, ih);
  const boxRatio = w / Math.max(1, h);

  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;

  if (imgRatio > boxRatio) {
    sw = ih * boxRatio;
    sx = (iw - sw) * 0.5;
  } else {
    sh = iw / boxRatio;
    // Priorizar el tercio superior (0.20) para no cortar frentes/cabezas en retratos históricos
    sy = (ih - sh) * 0.2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function resolveVintageInkColor(rawColor: string | undefined): string {
  if (!rawColor) return '#2b2118';
  const lower = rawColor.toLowerCase();
  if (lower === '#38bdf8' || lower === '#22d3ee' || lower === '#06b6d4' || lower === '#60a5fa') {
    return '#1d3557'; // Azul de Prusia
  }
  if (lower === '#facc15' || lower === '#fbbf24' || lower === '#f59e0b') {
    return '#7f4f24'; // Sepia cobre
  }
  if (lower === '#34d399' || lower === '#10b981') {
    return '#26463b'; // Verde imprenta
  }
  if (lower === '#818cf8' || lower === '#a855f7') {
    return '#4a2545'; // Ciruela antiguo
  }
  if (lower === '#f97316' || lower === '#f43f5e' || lower === '#ec4899') {
    return '#8b261d'; // Rojo lacre
  }
  return rawColor;
}

export function hitTestCanvasNode(
  screenX: number,
  screenY: number,
  viewportWidth: number,
  viewportHeight: number,
  evaluatedNodes: EvaluatedCanvasNode[],
  camera: CameraState,
  manualOverride: ViewportTransformOverride,
  aspectRatio: '16:9' | '9:16' = '16:9'
): DslCanvasNode | null {
  const ytFrame = computeYouTubeFrameRect(viewportWidth, viewportHeight, aspectRatio);
  const effectiveZoom = camera.zoom * manualOverride.zoomMultiplier * ytFrame.scaleFactor;
  const effectiveCamX = camera.x - manualOverride.panX / effectiveZoom;
  const effectiveCamY = camera.y - manualOverride.panY / effectiveZoom;

  const worldX = (screenX - ytFrame.centerX) / effectiveZoom + effectiveCamX;
  const worldY = (screenY - ytFrame.centerY) / effectiveZoom + effectiveCamY;

  for (let i = evaluatedNodes.length - 1; i >= 0; i--) {
    const item = evaluatedNodes[i];
    if (item.opacity <= 0.05) continue;
    const halfW = (item.node.width * item.scale) / 2;
    const halfH = (item.node.height * item.scale) / 2;
    if (
      worldX >= item.x - halfW &&
      worldX <= item.x + halfW &&
      worldY >= item.y - halfH &&
      worldY <= item.y + halfH
    ) {
      return item.node;
    }
  }
  return null;
}

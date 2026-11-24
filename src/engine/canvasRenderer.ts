/**
 * Responsabilidad Única: Renderizar un fotograma completo del Canvas Cuasi Infinito,
 * con fondo cinematográfico sin líneas (estilo Niels Bohr), tarjetas con degradado interior
 * y borde de neón suave, soporte para 15+ tipos de animaciones y Simulador de Pantalla de YouTube.
 */

import { DslCanvasNode, DslScene } from '../dsl/dslTypes';
import { degToRad } from '../shared/math';
import { renderCinematicBackground } from './backgroundRenderer';
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

  // 1. Fondo cinematográfico sin líneas (degradado radial + micropartículas estilo Niels Bohr)
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

  // Opcional: solo dibujar grilla si el usuario explícitamente activó scene.showGrid === true
  if (scene.showGrid) {
    drawOptionalGrid(
      ctx,
      width,
      height,
      ytFrame.centerX,
      ytFrame.centerY,
      effectiveCamX,
      effectiveCamY,
      effectiveZoom,
      scene.gridColor
    );
  }

  // 2. Transformación de espacio de cámara centrada exactamente en el marco YouTube
  ctx.save();
  ctx.translate(ytFrame.centerX, ytFrame.centerY);
  ctx.scale(effectiveZoom, effectiveZoom);
  ctx.rotate(degToRad(-camera.rotation));
  ctx.translate(-effectiveCamX, -effectiveCamY);

  // 3. Ordenar por profundidad Z para Parallax 2.5D suave con Frustum Culling
  const sortedByDepth = [...evaluatedNodes].sort((a, b) => a.node.z - b.node.z);
  const cullRadiusWorldX = (width / effectiveZoom) * 0.85 + 650;
  const cullRadiusWorldY = (height / effectiveZoom) * 0.85 + 650;

  for (const item of sortedByDepth) {
    if (
      item.node.type === 'image' &&
      Math.abs(item.x - effectiveCamX) < 3800 &&
      Math.abs(item.y - effectiveCamY) < 2800
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
      item.node.id === selectedNodeId
    );
  }
  ctx.restore();

  // 4. Simulador de Pantalla de YouTube encima del canvas infinito (se omite al exportar MP4)
  if (!youtubeOptions.isExportRender) {
    renderYouTubeScreenOverlay(ctx, width, height, ytFrame, youtubeOptions);
  }

  ctx.restore();
}

function drawOptionalGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  camX: number,
  camY: number,
  zoom: number,
  gridColor: string
): void {
  ctx.save();
  const stepPx = Math.max(28, 160 * zoom);
  const offsetX = ((centerX - camX * zoom) % stepPx + stepPx) % stepPx;
  const offsetY = ((centerY - camY * zoom) % stepPx + stepPx) % stepPx;

  ctx.strokeStyle = gridColor || '#1e293b';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.25;

  ctx.beginPath();
  for (let x = offsetX; x < width; x += stepPx) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = offsetY; y < height; y += stepPx) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSingleCanvasNode(
  ctx: CanvasRenderingContext2D,
  evaluated: EvaluatedCanvasNode,
  renderX: number,
  renderY: number,
  isSelected: boolean
): void {
  const { node, scale, scaleX, scaleY, rotation, opacity, textRevealProgress } = evaluated;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(renderX, renderY);
  ctx.rotate(degToRad(rotation));
  ctx.scale(scale * (scaleX ?? 1), scale * (scaleY ?? 1));

  if (node.type === 'text') {
    drawRichTextNode(ctx, node, textRevealProgress, isSelected);
  } else if (node.type === 'image') {
    drawBohrStyleImageOrPortraitCard(ctx, node, isSelected, opacity);
  } else {
    drawBohrStyleVectorCard(ctx, node, isSelected, opacity);
  }

  ctx.restore();
}

/**
 * Dibuja una tarjeta de vector o retrato con el estilo exacto de la captura de Niels Bohr:
 * Degradado interior azul oscuro, halo de neón exterior suave y silueta/ícono luminoso.
 */
function drawBohrStyleVectorCard(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  isSelected: boolean,
  opacity: number
): void {
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const primaryColor = node.color || '#38bdf8';

  // Halo de neón multicapa alrededor de la tarjeta
  roundRect(ctx, -halfW, -halfH, node.width, node.height, 18);
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 14;
  ctx.globalAlpha = opacity * 0.12;
  ctx.stroke();

  ctx.lineWidth = 6;
  ctx.globalAlpha = opacity * 0.25;
  ctx.stroke();

  // Relleno con degradado vertical suave estilo Niels Bohr
  ctx.globalAlpha = opacity;
  const cardGrad = ctx.createLinearGradient(0, -halfH, 0, halfH);
  cardGrad.addColorStop(0, 'rgba(19, 38, 78, 0.92)');
  cardGrad.addColorStop(1, 'rgba(7, 13, 28, 0.96)');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  ctx.strokeStyle = isSelected ? '#ffffff' : primaryColor;
  ctx.lineWidth = isSelected ? 3.2 : 2.2;
  ctx.stroke();

  if (node.type === 'badge') {
    ctx.fillStyle = node.accentColor || primaryColor;
    ctx.font = '700 18px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.text || node.label, 0, -6);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText(node.label, 0, 22);
  } else {
    drawBuiltinVectorIcon(
      ctx,
      node.icon || 'portrait',
      Math.min(node.width, node.height) * 0.68,
      primaryColor
    );

    if (node.label) {
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 13.5px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, 0, halfH - 18);
    }
  }
}

function drawBohrStyleImageOrPortraitCard(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  isSelected: boolean,
  opacity: number
): void {
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const primaryColor = node.color || '#38bdf8';
  const cached = getOrLoadCanvasImage(node.src, node.imageQuery);

  ctx.save();
  roundRect(ctx, -halfW, -halfH, node.width, node.height, 18);

  // Halo de neón exterior suave estilo Niels Bohr
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 14;
  ctx.globalAlpha = opacity * 0.12;
  ctx.stroke();

  ctx.lineWidth = 6;
  ctx.globalAlpha = opacity * 0.25;
  ctx.stroke();

  // Fondo interior con degradado azul profundo
  ctx.globalAlpha = opacity;
  const cardGrad = ctx.createLinearGradient(0, -halfH, 0, halfH);
  cardGrad.addColorStop(0, 'rgba(18, 36, 74, 0.94)');
  cardGrad.addColorStop(1, 'rgba(6, 12, 26, 0.98)');
  ctx.fillStyle = cardGrad;
  ctx.fill();

  if (cached && cached.status === 'loaded') {
    ctx.save();
    roundRect(ctx, -halfW + 3, -halfH + 3, node.width - 6, node.height - 6, 15);
    ctx.clip();
    ctx.drawImage(cached.img, -halfW + 3, -halfH + 3, node.width - 6, node.height - 6);

    // Viñeta inferior suave para integrar la etiqueta si existe
    const vig = ctx.createLinearGradient(0, halfH - 46, 0, halfH);
    vig.addColorStop(0, 'rgba(6, 12, 26, 0)');
    vig.addColorStop(1, 'rgba(6, 12, 26, 0.88)');
    ctx.fillStyle = vig;
    ctx.fillRect(-halfW, halfH - 46, node.width, 46);
    ctx.restore();
  } else {
    // Mientras carga o si el usuario aún no puso imagen, dibujar la silueta minimalista de neón estilo Niels Bohr
    drawBuiltinVectorIcon(
      ctx,
      node.icon || 'portrait',
      Math.min(node.width, node.height) * 0.72,
      primaryColor
    );
  }

  // Borde fino de neón encima
  roundRect(ctx, -halfW, -halfH, node.width, node.height, 18);
  ctx.strokeStyle = isSelected ? '#ffffff' : primaryColor;
  ctx.lineWidth = isSelected ? 3.2 : 2.2;
  ctx.stroke();

  if (node.label) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 12.5px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(node.label, 0, halfH - 13);
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
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

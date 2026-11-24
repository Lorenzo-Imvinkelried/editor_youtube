/**
 * Responsabilidad Única: Renderizar un fotograma completo del Canvas Cuasi Infinito,
 * incluyendo imágenes cargadas por URL (Google Images), vectores SVG, textos ricos
 * y el Simulador de Pantalla de YouTube perfectamente centrado y optimizado a 60 FPS constantes.
 */

import { DslCanvasNode, DslScene } from '../dsl/dslTypes';
import { degToRad } from '../shared/math';
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

  // 1. Fondo base del proyecto
  ctx.fillStyle = scene.background || '#090d16';
  ctx.fillRect(0, 0, width, height);

  // Calcular el cuadro de YouTube (16:9 o 9:16) perfectamente centrado en (width/2, height/2)
  const ytFrame = computeYouTubeFrameRect(
    width,
    height,
    youtubeOptions.aspectRatio,
    Boolean(youtubeOptions.isExportRender)
  );

  // Escalar el zoom de la cámara virtual proporcionalmente al marco de YouTube
  const effectiveZoom = camera.zoom * manualOverride.zoomMultiplier * ytFrame.scaleFactor;
  const effectiveCamX = camera.x - manualOverride.panX / effectiveZoom;
  const effectiveCamY = camera.y - manualOverride.panY / effectiveZoom;

  // 2. Grilla Cuasi Infinita centrada en el marco de YouTube (paso constante para no saltar durante zoom)
  drawInfiniteGrid(
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

  // 3. Transformación de espacio de cámara centrada exactamente en el centro del marco YouTube
  ctx.save();
  ctx.translate(ytFrame.centerX, ytFrame.centerY);
  ctx.scale(effectiveZoom, effectiveZoom);
  ctx.rotate(degToRad(-camera.rotation));
  ctx.translate(-effectiveCamX, -effectiveCamY);

  // 4. Líneas conectoras entre nodos con posicionamiento relativo
  drawRelativeConnectors(ctx, evaluatedNodes);

  // 5. Ordenar por profundidad Z para Parallax 2.5D suave
  const sortedByDepth = [...evaluatedNodes].sort((a, b) => a.node.z - b.node.z);

  for (const item of sortedByDepth) {
    if (item.opacity <= 0.01 || item.scale <= 0.01) continue;

    // Parallax calibrado (0.10) para dar profundidad 2.5D sin empujar títulos fuera del borde de YouTube
    const parallaxFactor = item.node.z * 0.1;
    const parallaxOffsetX = (effectiveCamX - item.x) * -parallaxFactor;
    const parallaxOffsetY = (effectiveCamY - item.y) * -parallaxFactor;

    drawSingleCanvasNode(
      ctx,
      item,
      item.x + parallaxOffsetX,
      item.y + parallaxOffsetY,
      item.node.id === selectedNodeId
    );
  }
  ctx.restore();

  // 6. Simulador de Pantalla de YouTube encima del canvas infinito (se omite al exportar el MP4 final)
  if (!youtubeOptions.isExportRender) {
    renderYouTubeScreenOverlay(ctx, width, height, ytFrame, youtubeOptions);
  }

  ctx.restore();
}

function drawInfiniteGrid(
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
  ctx.globalAlpha = 0.4;

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

  const originScreenX = centerX - camX * zoom;
  const originScreenY = centerY - camY * zoom;
  ctx.strokeStyle = '#334155';
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.moveTo(originScreenX, 0);
  ctx.lineTo(originScreenX, height);
  ctx.moveTo(0, originScreenY);
  ctx.lineTo(width, originScreenY);
  ctx.stroke();

  ctx.restore();
}

function drawRelativeConnectors(ctx: CanvasRenderingContext2D, nodes: EvaluatedCanvasNode[]): void {
  const map = new Map(nodes.map((n) => [n.node.id, n]));
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';

  for (const item of nodes) {
    if (!item.node.relativeTo || item.opacity < 0.1) continue;
    const target = map.get(item.node.relativeTo.targetId);
    if (!target || target.opacity < 0.1) continue;

    ctx.beginPath();
    ctx.moveTo(target.x, target.y);
    ctx.lineTo(item.x, item.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSingleCanvasNode(
  ctx: CanvasRenderingContext2D,
  evaluated: EvaluatedCanvasNode,
  renderX: number,
  renderY: number,
  isSelected: boolean
): void {
  const { node, scale, rotation, opacity, textRevealProgress, activeActions } = evaluated;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(renderX, renderY);
  ctx.rotate(degToRad(rotation));
  ctx.scale(scale, scale);

  const halfW = node.width / 2;
  const halfH = node.height / 2;

  if (node.type === 'text') {
    drawRichTextNode(ctx, node, textRevealProgress, isSelected);
  } else if (node.type === 'image') {
    drawExternalImageNode(ctx, node, isSelected, opacity);
  } else {
    // Halo luminoso vectorial ultra rápido (evita el costo de CPU/GPU de Gaussian shadowBlur al rotar cámara)
    roundRect(ctx, -halfW, -halfH, node.width, node.height, 24);
    ctx.strokeStyle = node.color;
    ctx.lineWidth = isSelected ? 12 : 8;
    ctx.globalAlpha = opacity * 0.22;
    ctx.stroke();

    ctx.globalAlpha = opacity;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.strokeStyle = isSelected ? '#ffffff' : node.color;
    ctx.lineWidth = isSelected ? 3.5 : 2.4;
    ctx.fill();
    ctx.stroke();

    if (node.type === 'badge') {
      ctx.fillStyle = node.accentColor || node.color;
      ctx.font = '600 17px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(node.text || node.label, 0, -6);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      ctx.fillText(node.label, 0, 22);
    } else {
      drawBuiltinVectorIcon(ctx, node.icon, Math.min(node.width, node.height) * 0.62, node.color);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, 0, halfH - 22);
    }
  }

  if (activeActions.length > 0 || isSelected) {
    const tagText = activeActions.length > 0 ? activeActions.join(' • ') : `z:${node.z}`;
    ctx.fillStyle = node.color || '#38bdf8';
    ctx.font = '600 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tagText.toUpperCase(), 0, -halfH - 12);
  }

  ctx.restore();
}

function drawExternalImageNode(
  ctx: CanvasRenderingContext2D,
  node: DslCanvasNode,
  isSelected: boolean,
  opacity: number
): void {
  const halfW = node.width / 2;
  const halfH = node.height / 2;
  const cached = getOrLoadCanvasImage(node.src);

  ctx.save();
  roundRect(ctx, -halfW, -halfH, node.width, node.height, 20);

  ctx.strokeStyle = node.color || '#38bdf8';
  ctx.lineWidth = 9;
  ctx.globalAlpha = opacity * 0.22;
  ctx.stroke();

  ctx.globalAlpha = opacity;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.strokeStyle = isSelected ? '#ffffff' : node.color || '#38bdf8';
  ctx.lineWidth = isSelected ? 3.5 : 2.5;
  ctx.fill();
  ctx.stroke();

  if (cached && cached.status === 'loaded') {
    ctx.save();
    roundRect(ctx, -halfW + 4, -halfH + 4, node.width - 8, node.height - 36, 16);
    ctx.clip();
    ctx.drawImage(cached.img, -halfW + 4, -halfH + 4, node.width - 8, node.height - 36);
    ctx.restore();
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const statusMsg =
      cached?.status === 'error'
        ? '⚠️ Link de imagen inválido (click para cambiar)'
        : '🖼️ Cargando imagen por URL...';
    ctx.fillText(statusMsg, 0, -10);
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 13px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(node.label, 0, halfH - 14);

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

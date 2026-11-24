/**
 * Responsabilidad Única: Renderizar un fotograma completo del Canvas Cuasi Infinito,
 * aplicando la transformación de la Cámara Virtual 2.5D, paralaje por profundidad Z,
 * nodos de texto ricos y el Simulador de Pantalla de YouTube (16:9 / 9:16).
 */

import { DslCanvasNode, DslScene } from '../dsl/dslTypes';
import { degToRad } from '../shared/math';
import { CameraState } from './cameraEvaluator';
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

  // Calcular el cuadro de YouTube (16:9 o 9:16) centrado en el viewport
  const ytFrame = computeYouTubeFrameRect(width, height, youtubeOptions.aspectRatio);

  // Escalar el zoom de la cámara virtual proporcionalmente al marco de YouTube para que el encuadre sea exacto
  const effectiveZoom = camera.zoom * manualOverride.zoomMultiplier * ytFrame.scaleFactor;
  const effectiveCamX = camera.x - manualOverride.panX / effectiveZoom;
  const effectiveCamY = camera.y - manualOverride.panY / effectiveZoom;

  // 2. Grilla Cuasi Infinita (se adapta dinámicamente al zoom)
  drawInfiniteGrid(ctx, width, height, effectiveCamX, effectiveCamY, effectiveZoom, scene.gridColor);

  // 3. Transformación de espacio de cámara
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(effectiveZoom, effectiveZoom);
  ctx.rotate(degToRad(-camera.rotation));
  ctx.translate(-effectiveCamX, -effectiveCamY);

  // 4. Líneas conectoras entre nodos con posicionamiento relativo
  drawRelativeConnectors(ctx, evaluatedNodes);

  // 5. Ordenar por profundidad Z para Parallax 2.5D real
  const sortedByDepth = [...evaluatedNodes].sort((a, b) => a.node.z - b.node.z);

  for (const item of sortedByDepth) {
    if (item.opacity <= 0.01 || item.scale <= 0.01) continue;

    // Desplazamiento de paralaje según la profundidad Z del nodo
    const parallaxFactor = item.node.z * 0.25;
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

  // 6. Simulador de Pantalla de YouTube encima del canvas infinito
  renderYouTubeScreenOverlay(ctx, width, height, ytFrame, youtubeOptions);

  ctx.restore();
}

function drawInfiniteGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  camX: number,
  camY: number,
  zoom: number,
  gridColor: string
): void {
  ctx.save();
  const baseStep = zoom < 0.45 ? 240 : zoom > 1.8 ? 60 : 120;
  const stepPx = baseStep * zoom;

  const offsetX = (width / 2 - camX * zoom) % stepPx;
  const offsetY = (height / 2 - camY * zoom) % stepPx;

  ctx.strokeStyle = gridColor || '#1e293b';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.45;

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

  // Ejes centrales (0,0) del canvas infinito
  const originScreenX = width / 2 - camX * zoom;
  const originScreenY = height / 2 - camY * zoom;
  ctx.strokeStyle = '#334155';
  ctx.globalAlpha = 0.7;
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
  } else {
    // Sombra y resplandor (Glow) con color del nodo
    ctx.shadowColor = node.color;
    ctx.shadowBlur = isSelected ? 36 : 22;

    // Contenedor redondeado translúcido estilo glassmorphism
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = isSelected ? '#ffffff' : node.color;
    ctx.lineWidth = isSelected ? 3.5 : 2.2;

    roundRect(ctx, -halfW, -halfH, node.width, node.height, 24);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

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

      // Etiqueta del nodo debajo del ícono
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, 0, halfH - 22);
    }
  }

  // Indicador de profundidad Z y acciones activas
  if (activeActions.length > 0 || isSelected) {
    const tagText = activeActions.length > 0 ? activeActions.join(' • ') : `z:${node.z}`;
    ctx.fillStyle = node.color;
    ctx.font = '600 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tagText.toUpperCase(), 0, -halfH - 12);
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

/**
 * Permite detectar qué nodo del canvas infinito clickeó el usuario (incluyendo textos y SVGs).
 */
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

  const worldX = (screenX - viewportWidth / 2) / effectiveZoom + effectiveCamX;
  const worldY = (screenY - viewportHeight / 2) / effectiveZoom + effectiveCamY;

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

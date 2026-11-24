/**
 * Responsabilidad Única: Ajustar automáticamente cada toma de `cameraTrack` (y resguardar
 * cada fotograma en vivo) para garantizar que todos los textos, fotos y tarjetas de la escena
 * queden siempre bien centrados y 100% dentro de los márgenes seguros del video (16:9 o 9:16).
 */

import {
  DslCameraKeyframe,
  DslCanvasNode,
  DslTimelineAction,
  YouTubeAspectPreset
} from '../dsl/dslTypes';
import { clamp, degToRad } from '../shared/math';
import { EvaluatedCanvasNode, evaluateNodesAtTime } from './nodeEvaluator';
import { computeNodeWorldBoundsInWindow, getNodeLocalExtents } from './nodeBounds';

export interface FramingContext {
  aspectRatio: YouTubeAspectPreset;
  isLightPaper: boolean;
  duration: number;
}

const SAFE_MARGIN_X = 68;
const SAFE_MARGIN_TOP = 62;
const SAFE_MARGIN_BOTTOM = 74; // Deja aire extra sobre la barra inferior de YouTube

const CLUSTER_RADIUS_X = 980;
const CLUSTER_RADIUS_Y = 660;

export function getLogicalViewportSize(aspectRatio: YouTubeAspectPreset): {
  width: number;
  height: number;
} {
  return aspectRatio === '9:16'
    ? { width: 900, height: 1600 }
    : { width: 1600, height: 900 };
}

/**
 * Re-encuadra de forma determinista todas las tomas de `cameraTrack` calculando el centro
 * óptico exacto del grupo de nodos activos y limitando el `zoom` para que ningún borde se corte.
 */
export function autoFrameCameraKeyframes(
  rawTrack: DslCameraKeyframe[],
  resolvedNodes: DslCanvasNode[],
  timeline: DslTimelineAction[],
  context: FramingContext
): DslCameraKeyframe[] {
  if (resolvedNodes.length === 0) return rawTrack;

  const nodeMap = new Map(resolvedNodes.map((n) => [n.id, n]));
  const actionsByNode = new Map<string, DslTimelineAction[]>();
  for (const act of timeline) {
    const list = actionsByNode.get(act.targetId) ?? [];
    list.push(act);
    actionsByNode.set(act.targetId, list);
  }

  const baseTrack: DslCameraKeyframe[] =
    rawTrack.length > 0
      ? [...rawTrack].sort((a, b) => a.at - b.at)
      : [
          {
            at: 0,
            duration: 0.8,
            action: 'moveTo',
            x: resolvedNodes[0].x,
            y: resolvedNodes[0].y,
            zoom: 1,
            rotation: 0,
            easing: 'easeOutCubic'
          }
        ];

  const { width: logicalW, height: logicalH } = getLogicalViewportSize(context.aspectRatio);
  const safeW = Math.max(200, logicalW - SAFE_MARGIN_X * 2);
  const safeH = Math.max(200, logicalH - SAFE_MARGIN_TOP - SAFE_MARGIN_BOTTOM);
  // Pequeño sesgo vertical para centrar ópticamente por encima de la barra inferior
  const opticalBiasY = (SAFE_MARGIN_BOTTOM - SAFE_MARGIN_TOP) * 0.5;

  let prevX = 0;
  let prevY = 0;
  let prevZoom = 1;

  return baseTrack.map((kf, idx) => {
    const nextKfAt = idx + 1 < baseTrack.length ? baseTrack[idx + 1].at : context.duration;
    const windowStart = kf.at;
    const windowEnd = Math.max(windowStart + Math.max(0.2, kf.duration), nextKfAt - 0.05);
    // Evaluar visibilidad cuando las animaciones de entrada ya se asentaron en la toma
    const sampleTime = Math.min(
      windowEnd,
      Math.max(windowStart + Math.min(1.1, kf.duration + 0.35), (windowStart + windowEnd) * 0.5)
    );

    let anchorX = prevX;
    let anchorY = prevY;
    if (kf.action === 'focusOn' && kf.targetId) {
      const tNode = nodeMap.get(kf.targetId);
      if (tNode) {
        anchorX = typeof kf.x === 'number' ? kf.x : tNode.x;
        anchorY = typeof kf.y === 'number' ? kf.y : tNode.y;
      }
    } else {
      if (typeof kf.x === 'number') anchorX = kf.x;
      if (typeof kf.y === 'number') anchorY = kf.y;
    }

    const requestedZoom = typeof kf.zoom === 'number' ? kf.zoom : prevZoom;
    const isOverviewShot = requestedZoom < 0.45 && kf.action !== 'focusOn';

    // Detectar qué nodos están visibles durante esta toma
    const sampledAtMid = evaluateNodesAtTime(resolvedNodes, timeline, sampleTime);
    const sampledAtEnd = evaluateNodesAtTime(resolvedNodes, timeline, windowEnd);
    const visibleIds = new Set<string>();
    for (const s of [...sampledAtMid, ...sampledAtEnd]) {
      if (s.opacity > 0.08 && s.scale > 0.08) {
        visibleIds.add(s.node.id);
      }
    }

    // Filtrar los nodos que pertenecen espacialmente a esta escena (o todos si es toma panorámica)
    let clusterNodes = resolvedNodes.filter((n) => {
      if (!visibleIds.has(n.id)) return false;
      if (isOverviewShot) return true;
      return (
        Math.abs(n.x - anchorX) <= CLUSTER_RADIUS_X &&
        Math.abs(n.y - anchorY) <= CLUSTER_RADIUS_Y
      );
    });

    // Si es focusOn y el nodo objetivo existe, garantizar que siempre esté incluido
    if (kf.action === 'focusOn' && kf.targetId) {
      const target = nodeMap.get(kf.targetId);
      if (target && !clusterNodes.some((n) => n.id === target.id)) {
        clusterNodes = [target, ...clusterNodes];
      }
    }

    if (clusterNodes.length === 0) {
      prevX = anchorX;
      prevY = anchorY;
      prevZoom = requestedZoom;
      return kf;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let maxAbsZ = 0;

    for (const node of clusterNodes) {
      const acts = actionsByNode.get(node.id) ?? [];
      const b = computeNodeWorldBoundsInWindow(
        node,
        acts,
        windowStart,
        windowEnd,
        context.isLightPaper
      );
      if (b.minX < minX) minX = b.minX;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxY > maxY) maxY = b.maxY;
      if (Math.abs(node.z) > maxAbsZ) maxAbsZ = Math.abs(node.z);
    }

    // Compensar desplazamiento máximo de paralaje (1 + |z| * 0.1) y rotación de cámara
    const parallaxScale = 1 + maxAbsZ * 0.11;
    const rawSpanW = Math.max(120, (maxX - minX) * parallaxScale);
    const rawSpanH = Math.max(100, (maxY - minY) * parallaxScale);

    const rotRad = degToRad(Math.abs(kf.rotation ?? 0));
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    const rotatedSpanW = rawSpanW * cos + rawSpanH * sin;
    const rotatedSpanH = rawSpanW * sin + rawSpanH * cos;

    const maxSafeZoom = Math.min(safeW / rotatedSpanW, safeH / rotatedSpanH);
    const fittedZoom = clamp(Math.min(requestedZoom, maxSafeZoom), 0.005, 2.5);

    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5 + opticalBiasY / fittedZoom;

    prevX = centerX;
    prevY = centerY;
    prevZoom = fittedZoom;

    return {
      ...kf,
      action: 'moveTo',
      x: centerX,
      y: centerY,
      zoom: fittedZoom
    };
  });
}

/**
 * Resguardo por fotograma en tiempo real: cuando la cámara no está en pleno viaje entre dos escenas
 * lejanas, verifica que ningún nodo asentado de la toma actual sobresalga del cuadro del video.
 */
export function guardFrameBounds(
  camX: number,
  camY: number,
  camZoom: number,
  camRotationDeg: number,
  evaluatedNodes: EvaluatedCanvasNode[],
  aspectRatio: YouTubeAspectPreset,
  isLightPaper: boolean,
  isCameraTransitioning: boolean
): { x: number; y: number; zoom: number } {
  if (isCameraTransitioning || evaluatedNodes.length === 0) {
    return { x: camX, y: camY, zoom: camZoom };
  }

  const { width: logicalW, height: logicalH } = getLogicalViewportSize(aspectRatio);
  const padX = 36;
  const padTop = 34;
  const padBottom = 42;
  const safeW = logicalW - padX * 2;
  const safeH = logicalH - padTop - padBottom;

  // Considerar nodos de la escena actual ya asentados (evitar perseguir un nodo que recién entra por slideIn)
  const localSettled = evaluatedNodes.filter((item) => {
    if (item.opacity < 0.85 || item.scale < 0.5) return false;
    const isSliding = item.activeActions.some((a) => a.startsWith('slideIn'));
    if (isSliding) return false;
    if (camZoom < 0.35) return true;
    return (
      Math.abs(item.x - camX) <= CLUSTER_RADIUS_X &&
      Math.abs(item.y - camY) <= CLUSTER_RADIUS_Y
    );
  });

  if (localSettled.length === 0) {
    return { x: camX, y: camY, zoom: camZoom };
  }

  const rotRad = degToRad(-camRotationDeg);
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  let minRelX = Infinity;
  let maxRelX = -Infinity;
  let minRelY = Infinity;
  let maxRelY = -Infinity;

  for (const item of localSettled) {
    const ext = getNodeLocalExtents(item.node, isLightPaper);
    const sx = item.scale * (item.scaleX ?? 1);
    const sy = item.scale * (item.scaleY ?? 1);
    const parallaxFactor = item.node.z * 0.1;
    const worldRenderX = item.x + (camX - item.x) * -parallaxFactor;
    const worldRenderY = item.y + (camY - item.y) * -parallaxFactor;

    const nodeRot = degToRad(item.rotation);
    const nCos = Math.cos(nodeRot);
    const nSin = Math.sin(nodeRot);

    const corners: Array<[number, number]> = [
      [ext.left * sx, ext.top * sy],
      [ext.right * sx, ext.top * sy],
      [ext.right * sx, ext.bottom * sy],
      [ext.left * sx, ext.bottom * sy]
    ];

    for (const [ lx, ly ] of corners) {
      const wx = worldRenderX + lx * nCos - ly * nSin - camX;
      const wy = worldRenderY + lx * nSin + ly * nCos - camY;
      // Rotar al espacio alineado de la cámara
      const cx = wx * cos - wy * sin;
      const cy = wx * sin + wy * cos;
      if (cx < minRelX) minRelX = cx;
      if (cx > maxRelX) maxRelX = cx;
      if (cy < minRelY) minRelY = cy;
      if (cy > maxRelY) maxRelY = cy;
    }
  }

  const halfSafeW = safeW / (2 * camZoom);
  const halfSafeTop = (logicalH * 0.5 - padTop) / camZoom;
  const halfSafeBottom = (logicalH * 0.5 - padBottom) / camZoom;

  const fitsHorizontally = minRelX >= -halfSafeW && maxRelX <= halfSafeW;
  const fitsVertically = minRelY >= -halfSafeTop && maxRelY <= halfSafeBottom;

  if (fitsHorizontally && fitsVertically) {
    return { x: camX, y: camY, zoom: camZoom };
  }

  // Si algún elemento recién editado o con rebote excede el margen seguro, recentrar y ajustar zoom suavemente
  const spanW = Math.max(100, maxRelX - minRelX);
  const spanH = Math.max(100, maxRelY - minRelY);
  const neededZoom = Math.min(camZoom, safeW / spanW, safeH / spanH);

  const offsetCamSpaceX = (minRelX + maxRelX) * 0.5;
  const offsetCamSpaceY = (minRelY + maxRelY) * 0.5 + (padBottom - padTop) / (2 * neededZoom);

  // Des-rotar corrección al espacio del mundo
  const invCos = Math.cos(-rotRad);
  const invSin = Math.sin(-rotRad);
  const deltaWorldX = offsetCamSpaceX * invCos - offsetCamSpaceY * invSin;
  const deltaWorldY = offsetCamSpaceX * invSin + offsetCamSpaceY * invCos;

  return {
    x: camX + deltaWorldX,
    y: camY + deltaWorldY,
    zoom: clamp(neededZoom, 0.005, 2.5)
  };
}

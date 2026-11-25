/**
 * Responsabilidad Única: Garantizar que los nodos co-visibles de una escena (títulos,
 * subtítulos, fotografías y láminas) nunca se solapen visualmente, resolviendo `relativeTo`
 * con cajas tipográficas reales medidas y aplicando un resolvedor determinista de colisiones
 * que funciona a prueba de cualquier JSON (con o sin `relativeTo`).
 */

import { DslCanvasNode, DslScene, DslTimelineAction } from '../dsl/dslTypes';
import { degToRad } from '../shared/math';
import { isSceneLightPaper } from './backgroundRenderer';
import { computeNodeWorldBoundsInWindow, getNodeLocalExtents, WorldBounds } from './nodeBounds';
import { LocalExtents } from './textLayout';

const MIN_CLEARANCE_X = 34;
const MIN_CLEARANCE_Y = 28;
const MAX_RELATIVE_PASSES = 4;
const MAX_RELAX_PASSES = 8;

const ENTRANCE_ACTIONS = new Set([
  'popIn',
  'slideInLeft',
  'slideInRight',
  'slideInUp',
  'slideInDown',
  'flipIn3D',
  'unfoldWidth',
  'blurFadeIn',
  'spiralIn',
  'typewriter'
]);

interface VisibilitySpan {
  start: number;
  end: number;
}

/**
 * Resuelve posicionamiento relativo exacto usando las dimensiones reales renderizadas
 * (incluyendo `textAlign`, saltos de línea, cintas kraft y rotación) y elimina cualquier
 * solapamiento residual entre nodos visibles al mismo tiempo.
 */
export function resolveSceneOverlaps(
  scene: DslScene,
  baseNodes: DslCanvasNode[]
): DslCanvasNode[] {
  if (baseNodes.length <= 1) return baseNodes;

  const isLightPaper = isSceneLightPaper(scene);
  const nodes = baseNodes.map((n) => ({ ...n }));
  const nodeMap = new Map<string, DslCanvasNode>(nodes.map((n) => [n.id, n]));

  // 1. Refinar `relativeTo` usando extensiones locales reales medidas (evita desfase de textAlign)
  for (let pass = 0; pass < MAX_RELATIVE_PASSES; pass++) {
    for (const node of nodes) {
      if (!node.relativeTo) continue;
      const anchor = nodeMap.get(node.relativeTo.targetId);
      if (!anchor) continue;

      const anchorExt = getRotatedLocalExtents(anchor, isLightPaper);
      const nodeExt = getRotatedLocalExtents(node, isLightPaper);
      const gap = Math.max(24, node.relativeTo.gap ?? 48);
      const keepAxis = node.relativeTo.align === 'keepAxis';

      const anchorMidX = (anchorExt.left + anchorExt.right) / 2;
      const anchorMidY = (anchorExt.top + anchorExt.bottom) / 2;
      const nodeMidX = (nodeExt.left + nodeExt.right) / 2;
      const nodeMidY = (nodeExt.top + nodeExt.bottom) / 2;

      switch (node.relativeTo.direction) {
        case 'rightOf':
          node.x = anchor.x + anchorExt.right + gap - nodeExt.left;
          if (!keepAxis) node.y = anchor.y + anchorMidY - nodeMidY;
          break;
        case 'leftOf':
          node.x = anchor.x + anchorExt.left - gap - nodeExt.right;
          if (!keepAxis) node.y = anchor.y + anchorMidY - nodeMidY;
          break;
        case 'below':
          if (!keepAxis) node.x = anchor.x + anchorMidX - nodeMidX;
          node.y = anchor.y + anchorExt.bottom + gap - nodeExt.top;
          break;
        case 'above':
          if (!keepAxis) node.x = anchor.x + anchorMidX - nodeMidX;
          node.y = anchor.y + anchorExt.top - gap - nodeExt.bottom;
          break;
      }
    }
  }

  if (scene.autoAvoidOverlap === false) {
    return nodes;
  }

  // 2. Preparar ventanas de visibilidad y acciones por nodo para el solver de colisiones
  const actionsByNode = new Map<string, DslTimelineAction[]>();
  for (const act of scene.timeline) {
    const list = actionsByNode.get(act.targetId) ?? [];
    list.push(act);
    actionsByNode.set(act.targetId, list);
  }

  const spans = nodes.map((node) =>
    computeVisibilitySpan(node, actionsByNode.get(node.id) ?? [], scene.duration)
  );
  const priorities = nodes.map((node) =>
    getNodeStabilityPriority(node, actionsByNode.get(node.id) ?? [])
  );
  const bounds: WorldBounds[] = nodes.map((node, idx) =>
    computeNodeWorldBoundsInWindow(
      node,
      actionsByNode.get(node.id) ?? [],
      spans[idx].start,
      spans[idx].end,
      isLightPaper
    )
  );

  // 3. Relajación iterativa anti-solapamiento entre nodos co-visibles del mismo encuadre
  for (let pass = 0; pass < MAX_RELAX_PASSES; pass++) {
    let anyMoved = false;

    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].allowOverlap) continue;
      const bI = bounds[i];
      const cIx = (bI.minX + bI.maxX) / 2;
      const cIy = (bI.minY + bI.maxY) / 2;

      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[j].allowOverlap) continue;
        if (!spansOverlap(spans[i], spans[j])) continue;

        const bJ = bounds[j];
        const cJx = (bJ.minX + bJ.maxX) / 2;
        const cJy = (bJ.minY + bJ.maxY) / 2;

        // Descarte rápido para escenas en distintas zonas del canvas infinito
        if (Math.abs(cIx - cJx) > 1700 || Math.abs(cIy - cJy) > 1200) continue;

        const overlapX = Math.min(bI.maxX, bJ.maxX) - Math.max(bI.minX, bJ.minX) + MIN_CLEARANCE_X;
        const overlapY = Math.min(bI.maxY, bJ.maxY) - Math.max(bI.minY, bJ.minY) + MIN_CLEARANCE_Y;
        if (overlapX <= 0.5 || overlapY <= 0.5) continue;

        // El nodo visual (prioridad 0) actúa siempre como ancla fija; se desplaza el texto
        const iIsAnchor = priorities[i] <= priorities[j];
        const anchorIdx = iIsAnchor ? i : j;
        const moverIdx = iIsAnchor ? j : i;

        const delta = computeCleanSeparation(
          nodes[anchorIdx],
          bounds[anchorIdx],
          nodes[moverIdx],
          bounds[moverIdx],
          priorities[moverIdx]
        );

        if (Math.abs(delta.dx) > 0.25 || Math.abs(delta.dy) > 0.25) {
          nodes[moverIdx].x = Math.round((nodes[moverIdx].x + delta.dx) * 10) / 10;
          nodes[moverIdx].y = Math.round((nodes[moverIdx].y + delta.dy) * 10) / 10;
          bounds[moverIdx] = {
            minX: bounds[moverIdx].minX + delta.dx,
            maxX: bounds[moverIdx].maxX + delta.dx,
            minY: bounds[moverIdx].minY + delta.dy,
            maxY: bounds[moverIdx].maxY + delta.dy
          };
          anyMoved = true;
        }
      }
    }

    if (!anyMoved) break;
  }

  return nodes;
}

function getRotatedLocalExtents(node: DslCanvasNode, isLightPaper: boolean): LocalExtents {
  const local = getNodeLocalExtents(node, isLightPaper);
  const rotDeg = node.initialRotation ?? 0;
  if (Math.abs(rotDeg) < 0.01) return local;

  const rad = degToRad(rotDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: Array<[number, number]> = [
    [local.left, local.top],
    [local.right, local.top],
    [local.right, local.bottom],
    [local.left, local.bottom]
  ];

  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const [x, y] of corners) {
    const rx = x * cos - y * sin;
    const ry = x * sin + y * cos;
    if (rx < left) left = rx;
    if (rx > right) right = rx;
    if (ry < top) top = ry;
    if (ry > bottom) bottom = ry;
  }

  return { left, right, top, bottom };
}

function computeVisibilitySpan(
  node: DslCanvasNode,
  actions: DslTimelineAction[],
  duration: number
): VisibilitySpan {
  const startsVisible = (node.initialOpacity ?? 1) > 0.01 && (node.initialScale ?? 1) > 0.01;
  let start = startsVisible ? 0 : Infinity;
  let end = duration;

  for (const act of actions) {
    if (ENTRANCE_ACTIONS.has(act.action)) {
      start = Math.min(start, act.at);
    }
    if (act.action === 'popOut') {
      end = Math.min(end, act.at + act.duration);
    }
  }

  if (!Number.isFinite(start)) start = 0;
  return { start, end: Math.max(start + 0.1, end) };
}

function spansOverlap(a: VisibilitySpan, b: VisibilitySpan): boolean {
  return a.end > b.start + 0.05 && b.end > a.start + 0.05;
}

function getNodeStabilityPriority(
  node: DslCanvasNode,
  actions: DslTimelineAction[]
): number {
  if (node.type === 'image' || node.type === 'svg' || node.type === 'shape') {
    return 0;
  }
  const hasTypewriter = actions.some((a) => a.action === 'typewriter');
  if (
    hasTypewriter ||
    node.textVariant === 'editorial-paper' ||
    node.textVariant === 'pill-badge'
  ) {
    return 2;
  }
  return 1;
}

function computeCleanSeparation(
  anchorNode: DslCanvasNode,
  anchorB: WorldBounds,
  moverNode: DslCanvasNode,
  moverB: WorldBounds,
  moverPriority: number
): { dx: number; dy: number } {
  const dxRight = anchorB.maxX + MIN_CLEARANCE_X - moverB.minX;
  const dxLeft = anchorB.minX - MIN_CLEARANCE_X - moverB.maxX;
  const dyDown = anchorB.maxY + MIN_CLEARANCE_Y - moverB.minY;
  const dyUp = anchorB.minY - MIN_CLEARANCE_Y - moverB.maxY;

  // 1. Si el nodo declaró una relación explícita hacia este ancla, respetar siempre esa dirección
  if (moverNode.relativeTo?.targetId === anchorNode.id) {
    switch (moverNode.relativeTo.direction) {
      case 'rightOf':
        return { dx: dxRight, dy: 0 };
      case 'leftOf':
        return { dx: dxLeft, dy: 0 };
      case 'above':
        return { dx: 0, dy: dyUp };
      case 'below':
        return { dx: 0, dy: dyDown };
    }
  }

  const anchorCx = (anchorB.minX + anchorB.maxX) / 2;
  const anchorCy = (anchorB.minY + anchorB.maxY) / 2;
  const moverCx = (moverB.minX + moverB.maxX) / 2;
  const moverCy = (moverB.minY + moverB.maxY) / 2;
  const anchorW = Math.max(1, anchorB.maxX - anchorB.minX);
  const anchorH = Math.max(1, anchorB.maxY - anchorB.minY);
  const moverW = Math.max(1, moverB.maxX - moverB.minX);

  // 2. Fichas narrativas / subtítulos debajo del contenido siempre bajan limpiamente
  if (moverPriority === 2 && moverCy >= anchorCy - anchorH * 0.15) {
    return { dx: 0, dy: dyDown };
  }

  const naturalDx = moverCx >= anchorCx ? dxRight : dxLeft;
  const naturalDy = moverCy <= anchorCy ? dyUp : dyDown;

  // 3. Composición lado a lado (centros verticales cercanos): separar en X
  if (Math.abs(moverCy - anchorCy) < anchorH * 0.36 && moverW < anchorW * 1.45) {
    return { dx: naturalDx, dy: 0 };
  }

  // 4. Composición apilada verticalmente (centros horizontales cercanos): separar en Y
  if (Math.abs(moverCx - anchorCx) < anchorW * 0.45) {
    return { dx: 0, dy: naturalDy };
  }

  // 5. Caso general: elegir el desplazamiento natural más corto
  return Math.abs(naturalDx) <= Math.abs(naturalDy)
    ? { dx: naturalDx, dy: 0 }
    : { dx: 0, dy: naturalDy };
}

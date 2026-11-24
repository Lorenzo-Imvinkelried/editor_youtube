/**
 * Responsabilidad Única: Calcular la caja envolvente real (bounding box) en espacio local y mundial
 * de cualquier nodo del canvas (texto con layout envuelto, fotografía con sombra/cinta o lámina SVG),
 * contemplando rotación, escala y amplitud de animaciones continuas.
 */

import { DslCanvasNode, DslTimelineAction } from '../dsl/dslTypes';
import { degToRad } from '../shared/math';
import { layoutTextNode, LocalExtents } from './textLayout';

export interface WorldBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Devuelve la extensión local real dibujada alrededor del origen `(0, 0)` del nodo,
 * incluyendo sombras proyectadas, cintas adhesivas kraft y saltos de línea de texto.
 */
export function getNodeLocalExtents(
  node: DslCanvasNode,
  isLightPaper = true
): LocalExtents {
  if (node.type === 'text') {
    return layoutTextNode(node, isLightPaper).extents;
  }

  const halfW = node.width / 2;
  const halfH = node.height / 2;

  if (node.type === 'image') {
    // Contempla sombra derecha/abajo (+9, +12) y cinta kraft superior (-14)
    return {
      left: -halfW - 3,
      right: halfW + 10,
      top: -halfH - 14,
      bottom: halfH + 13
    };
  }

  // Tarjetas SVG / Patentes / Badges (sombra +8/+10 y cinta superior -12)
  return {
    left: -halfW - 3,
    right: halfW + 9,
    top: -halfH - 12,
    bottom: halfH + 11
  };
}

/**
 * Calcula la caja envolvente en coordenadas del mundo de un nodo durante una ventana de tiempo,
 * incorporando su rotación inicial, escala objetivo y márgenes de movimiento continuo
 * (`float`, `orbit`, `pendulum`, `pulse`, `wiggle`).
 */
export function computeNodeWorldBoundsInWindow(
  node: DslCanvasNode,
  nodeActions: DslTimelineAction[],
  windowStart: number,
  windowEnd: number,
  isLightPaper = true
): WorldBounds {
  const local = getNodeLocalExtents(node, isLightPaper);

  let baseX = node.x;
  let baseY = node.y;
  let maxScale = Math.max(1, node.initialScale ?? 1);
  let maxExtraRotDeg = 0;
  let padX = 0;
  let padY = 0;

  for (const act of nodeActions) {
    if (act.at > windowEnd) continue;

    switch (act.action) {
      case 'moveTo': {
        if (typeof act.params?.x === 'number') baseX = act.params.x;
        if (typeof act.params?.y === 'number') baseY = act.params.y;
        break;
      }
      case 'scaleTo': {
        maxScale = Math.max(maxScale, act.params?.scale ?? 1.25);
        break;
      }
      case 'popIn':
      case 'spiralIn': {
        // Pequeño colchón para el rebote elástico del resorte cerca de su asentamiento
        maxScale = Math.max(maxScale, 1.06);
        break;
      }
      case 'pulse': {
        if (act.at + act.duration >= windowStart) {
          maxScale *= 1 + (act.params?.scaleAmount ?? 0.08);
        }
        break;
      }
      case 'float': {
        if (act.at + act.duration >= windowStart) {
          padY += act.params?.amplitude ?? 10;
        }
        break;
      }
      case 'orbit': {
        if (act.at + act.duration >= windowStart) {
          const r = act.params?.radius ?? 14;
          padX += r;
          padY += r * 0.65;
        }
        break;
      }
      case 'pendulum':
      case 'wiggle': {
        if (act.at + act.duration >= windowStart) {
          maxExtraRotDeg = Math.max(maxExtraRotDeg, act.params?.angle ?? 6);
        }
        break;
      }
    }
  }

  const baseRotRad = degToRad(node.initialRotation ?? 0);
  const extraRotRad = degToRad(maxExtraRotDeg);

  // Evaluar las 4 esquinas rotadas (incluyendo variación máxima de péndulo/wiggle)
  const corners: Array<[number, number]> = [
    [local.left * maxScale, local.top * maxScale],
    [local.right * maxScale, local.top * maxScale],
    [local.right * maxScale, local.bottom * maxScale],
    [local.left * maxScale, local.bottom * maxScale]
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const anglesToTest =
    extraRotRad > 0
      ? [baseRotRad - extraRotRad, baseRotRad, baseRotRad + extraRotRad]
      : [baseRotRad];

  for (const ang of anglesToTest) {
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    for (const [cx, cy] of corners) {
      const rx = cx * cos - cy * sin;
      const ry = cx * sin + cy * cos;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
  }

  return {
    minX: baseX + minX - padX,
    maxX: baseX + maxX + padX,
    minY: baseY + minY - padY,
    maxY: baseY + maxY + padY
  };
}

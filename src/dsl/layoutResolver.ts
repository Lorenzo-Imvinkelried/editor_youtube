/**
 * Responsabilidad Única: Resolver coordenadas relativas (rightOf, leftOf, above, below)
 * en coordenadas cartesianas absolutas dentro del canvas cuasi infinito.
 * Esto evita que un LLM superponga imágenes por error al escribir el DSL.
 */

import { DslCanvasNode } from './dslTypes';

export function resolveSceneLayout(nodes: DslCanvasNode[]): DslCanvasNode[] {
  const resolvedMap = new Map<string, DslCanvasNode>();
  const clonedNodes = nodes.map((node) => ({ ...node }));

  // Primera pasada: registrar posiciones base
  for (const node of clonedNodes) {
    resolvedMap.set(node.id, node);
  }

  // Segunda pasada: resolver referencias relativas (hasta 4 niveles de encadenamiento)
  for (let pass = 0; pass < 4; pass++) {
    for (const node of clonedNodes) {
      if (!node.relativeTo) continue;
      const anchor = resolvedMap.get(node.relativeTo.targetId);
      if (!anchor) continue;

      const gap = node.relativeTo.gap ?? 160;
      switch (node.relativeTo.direction) {
        case 'rightOf':
          node.x = anchor.x + anchor.width / 2 + gap + node.width / 2;
          node.y = anchor.y;
          break;
        case 'leftOf':
          node.x = anchor.x - anchor.width / 2 - gap - node.width / 2;
          node.y = anchor.y;
          break;
        case 'below':
          node.x = anchor.x;
          node.y = anchor.y + anchor.height / 2 + gap + node.height / 2;
          break;
        case 'above':
          node.x = anchor.x;
          node.y = anchor.y - anchor.height / 2 - gap - node.height / 2;
          break;
      }
    }
  }

  return clonedNodes;
}

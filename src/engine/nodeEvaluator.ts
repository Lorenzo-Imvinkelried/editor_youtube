/**
 * Responsabilidad Única: Evaluar el estado visual de cada nodo (imagen, SVG, badge)
 * en un instante exacto `t` aplicando todas las acciones del timeline (popIn, float, wiggle, spin, etc.).
 */

import { DslCanvasNode, DslTimelineAction } from '../dsl/dslTypes';
import { clamp, lerp } from '../shared/math';
import { evaluateEasing } from './easings';

export interface EvaluatedCanvasNode {
  node: DslCanvasNode;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  activeActions: string[];
}

export function evaluateNodesAtTime(
  resolvedNodes: DslCanvasNode[],
  timeline: DslTimelineAction[],
  timeSeconds: number
): EvaluatedCanvasNode[] {
  const sortedActions = [...timeline].sort((a, b) => a.at - b.at);

  return resolvedNodes.map((node) => {
    let x = node.x;
    let y = node.y;
    let scale = node.initialScale ?? 1;
    let rotation = node.initialRotation ?? 0;
    let opacity = node.initialOpacity ?? 1;
    const activeActions: string[] = [];

    const nodeActions = sortedActions.filter((a) => a.targetId === node.id);

    for (const act of nodeActions) {
      if (timeSeconds < act.at) continue;

      const duration = Math.max(0.05, act.duration);
      const elapsed = timeSeconds - act.at;
      const rawProgress = clamp(elapsed / duration, 0, 1);
      const isCurrentlyRunning = elapsed >= 0 && elapsed <= duration;
      if (isCurrentlyRunning) {
        activeActions.push(act.action);
      }

      switch (act.action) {
        case 'popIn': {
          const overshoot = act.params?.overshoot ?? 1.28;
          const eased = evaluateEasing(act.easing || 'springBouncy', rawProgress, overshoot);
          opacity = clamp(rawProgress * 2.5, 0, 1);
          scale = Math.max(0, eased);
          break;
        }
        case 'popOut': {
          const eased = evaluateEasing(act.easing || 'easeInCubic', rawProgress);
          opacity = clamp(1 - eased, 0, 1);
          scale = lerp(scale, 0, eased);
          break;
        }
        case 'moveTo': {
          const eased = evaluateEasing(act.easing || 'easeInOutCubic', rawProgress);
          if (typeof act.params?.x === 'number') x = lerp(x, act.params.x, eased);
          if (typeof act.params?.y === 'number') y = lerp(y, act.params.y, eased);
          break;
        }
        case 'scaleTo': {
          const eased = evaluateEasing(act.easing || 'springBouncy', rawProgress);
          const targetScale = act.params?.scale ?? 1.25;
          scale = lerp(scale, targetScale, eased);
          break;
        }
        case 'rotateTo':
        case 'spin': {
          const eased = evaluateEasing(act.easing || 'easeInOutCubic', rawProgress);
          const deg = act.params?.degrees ?? 360;
          rotation += deg * eased;
          break;
        }
        case 'float': {
          if (elapsed <= duration) {
            const amp = act.params?.amplitude ?? 12;
            const speed = act.params?.speed ?? 2;
            y += Math.sin(elapsed * speed) * amp;
          }
          break;
        }
        case 'wiggle': {
          if (elapsed <= duration) {
            const angle = act.params?.angle ?? 8;
            const envelope = Math.sin(rawProgress * Math.PI);
            rotation += Math.sin(rawProgress * Math.PI * 6) * angle * envelope;
          }
          break;
        }
        case 'pulse': {
          if (elapsed <= duration) {
            const amount = act.params?.scaleAmount ?? 0.1;
            const speed = act.params?.speed ?? 4;
            scale *= 1 + Math.sin(elapsed * speed) * amount;
          }
          break;
        }
      }
    }

    return {
      node,
      x,
      y,
      scale,
      rotation,
      opacity,
      activeActions
    };
  });
}

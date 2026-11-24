/**
 * Responsabilidad Única: Evaluar el estado visual de cada nodo (imagen, SVG, texto, badge)
 * en un instante exacto `t` soportando una amplia variedad de animaciones de entrada y movimiento:
 * popIn, slideInLeft/Right/Up/Down, flipIn3D, unfoldWidth, blurFadeIn, spiralIn,
 * typewriter, float, orbit, pendulum, neonFlicker, wiggle, pulse y spin.
 */

import { DslCanvasNode, DslTimelineAction } from '../dsl/dslTypes';
import { clamp, lerp } from '../shared/math';
import { evaluateEasing } from './easings';

export interface EvaluatedCanvasNode {
  node: DslCanvasNode;
  x: number;
  y: number;
  scale: number;
  /** Escala horizontal independiente para efectos flipIn3D y unfoldWidth */
  scaleX: number;
  /** Escala vertical independiente */
  scaleY: number;
  rotation: number;
  opacity: number;
  /** Progreso de escritura de texto (0 a 1) para acción typewriter */
  textRevealProgress: number;
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
    let scaleX = 1;
    let scaleY = 1;
    let rotation = node.initialRotation ?? 0;
    let opacity = node.initialOpacity ?? 1;

    const hasTypewriter = sortedActions.some(
      (a) => a.targetId === node.id && a.action === 'typewriter'
    );
    let textRevealProgress = hasTypewriter ? 0 : 1;

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
        case 'slideInLeft': {
          const eased = evaluateEasing(act.easing || 'easeOutCubic', rawProgress);
          opacity = clamp(rawProgress * 2.2, 0, 1);
          scale = 1;
          x = node.x - (1 - eased) * 320;
          break;
        }
        case 'slideInRight': {
          const eased = evaluateEasing(act.easing || 'easeOutCubic', rawProgress);
          opacity = clamp(rawProgress * 2.2, 0, 1);
          scale = 1;
          x = node.x + (1 - eased) * 320;
          break;
        }
        case 'slideInUp': {
          const eased = evaluateEasing(act.easing || 'easeOutCubic', rawProgress);
          opacity = clamp(rawProgress * 2.2, 0, 1);
          scale = 1;
          y = node.y + (1 - eased) * 220;
          break;
        }
        case 'slideInDown': {
          const eased = evaluateEasing(act.easing || 'springBouncy', rawProgress, 1.18);
          opacity = clamp(rawProgress * 2.2, 0, 1);
          scale = 1;
          y = node.y - (1 - eased) * 220;
          break;
        }
        case 'flipIn3D': {
          const eased = evaluateEasing(act.easing || 'springSmooth', rawProgress);
          opacity = clamp(rawProgress * 3, 0, 1);
          scale = 1;
          scaleX = Math.max(0.02, eased);
          break;
        }
        case 'unfoldWidth': {
          const eased = evaluateEasing(act.easing || 'easeOutCubic', rawProgress);
          opacity = clamp(rawProgress * 2.8, 0, 1);
          scale = 1;
          scaleX = Math.max(0.02, eased);
          scaleY = clamp(0.6 + eased * 0.4, 0.6, 1);
          break;
        }
        case 'blurFadeIn': {
          const eased = evaluateEasing(act.easing || 'easeOutCubic', rawProgress);
          opacity = eased;
          scale = lerp(1.22, 1.0, eased);
          break;
        }
        case 'spiralIn': {
          const eased = evaluateEasing(act.easing || 'springBouncy', rawProgress, 1.2);
          opacity = clamp(rawProgress * 2.5, 0, 1);
          scale = Math.max(0, eased);
          rotation = (1 - eased) * -140;
          break;
        }
        case 'typewriter': {
          opacity = 1;
          if (scale === 0) scale = 1;
          textRevealProgress = rawProgress;
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
            const amp = act.params?.amplitude ?? 10;
            const speed = act.params?.speed ?? 2;
            y += Math.sin(elapsed * speed) * amp;
          }
          break;
        }
        case 'orbit': {
          if (elapsed <= duration) {
            const radius = act.params?.radius ?? 14;
            const speed = act.params?.speed ?? 1.8;
            x += Math.cos(elapsed * speed) * radius;
            y += Math.sin(elapsed * speed) * (radius * 0.65);
          }
          break;
        }
        case 'pendulum': {
          if (elapsed <= duration) {
            const angle = act.params?.angle ?? 4.5;
            const speed = act.params?.speed ?? 2.2;
            rotation += Math.sin(elapsed * speed) * angle;
          }
          break;
        }
        case 'neonFlicker': {
          if (elapsed <= duration) {
            const flicker =
              Math.sin(elapsed * 28) * Math.cos(elapsed * 17) > 0.55 ? 0.68 : 1.0;
            opacity = clamp(opacity * flicker, 0.2, 1);
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
            const amount = act.params?.scaleAmount ?? 0.08;
            const speed = act.params?.speed ?? 3.5;
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
      scaleX,
      scaleY,
      rotation,
      opacity,
      textRevealProgress,
      activeActions
    };
  });
}

/**
 * Responsabilidad Única: Calcular el estado exacto de la Cámara Virtual 2.5D
 * (posición x, y, nivel de zoom y ángulo de rotación) en cualquier segundo `t`.
 */

import { DslCameraKeyframe, DslCanvasNode } from '../dsl/dslTypes';
import { lerp } from '../shared/math';
import { evaluateEasing } from './easings';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  activeTargetId?: string;
}

export function evaluateCameraAtTime(
  cameraTrack: DslCameraKeyframe[],
  nodes: DslCanvasNode[],
  timeSeconds: number
): CameraState {
  const state: CameraState = {
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0
  };

  if (!cameraTrack.length) {
    return state;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sorted = [...cameraTrack].sort((a, b) => a.at - b.at);

  // Inicializar la cámara en el primer objetivo para evitar barridos desde coordenadas vacías en t=0
  const firstKf = sorted[0];
  if (firstKf) {
    const firstPos = resolveKeyframeTargetPosition(firstKf, nodeMap, 0, 0);
    state.x = firstPos.x;
    state.y = firstPos.y;
    state.zoom = (firstKf.zoom ?? 1) * 0.92;
    state.rotation = 0;
    state.activeTargetId = firstPos.activeTargetId;
  }

  for (const keyframe of sorted) {
    if (timeSeconds < keyframe.at) break;

    const resolved = resolveKeyframeTargetPosition(keyframe, nodeMap, state.x, state.y);
    const targetZoom = typeof keyframe.zoom === 'number' ? keyframe.zoom : state.zoom;
    const targetRotation = typeof keyframe.rotation === 'number' ? keyframe.rotation : state.rotation;

    const duration = Math.max(0.05, keyframe.duration);
    const rawProgress = (timeSeconds - keyframe.at) / duration;
    const eased = evaluateEasing(keyframe.easing || 'easeInOutCubic', rawProgress);

    state.x = lerp(state.x, resolved.x, eased);
    state.y = lerp(state.y, resolved.y, eased);
    state.zoom = lerp(state.zoom, targetZoom, eased);
    state.rotation = lerp(state.rotation, targetRotation, eased);
    state.activeTargetId = resolved.activeTargetId;
  }

  return state;
}

function resolveKeyframeTargetPosition(
  keyframe: DslCameraKeyframe,
  nodeMap: Map<string, DslCanvasNode>,
  fallbackX: number,
  fallbackY: number
): { x: number; y: number; activeTargetId?: string } {
  if (keyframe.action === 'focusOn' && keyframe.targetId) {
    const targetNode = nodeMap.get(keyframe.targetId);
    if (targetNode) {
      return {
        x: typeof keyframe.x === 'number' ? keyframe.x : targetNode.x,
        y: typeof keyframe.y === 'number' ? keyframe.y : targetNode.y,
        activeTargetId: targetNode.id
      };
    }
  }

  return {
    x: typeof keyframe.x === 'number' ? keyframe.x : fallbackX,
    y: typeof keyframe.y === 'number' ? keyframe.y : fallbackY,
    activeTargetId: undefined
  };
}

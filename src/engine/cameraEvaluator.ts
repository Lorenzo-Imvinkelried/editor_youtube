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

  for (const keyframe of sorted) {
    if (timeSeconds < keyframe.at) break;

    let targetX = state.x;
    let targetY = state.y;

    if (keyframe.action === 'focusOn' && keyframe.targetId) {
      const targetNode = nodeMap.get(keyframe.targetId);
      if (targetNode) {
        targetX = targetNode.x;
        targetY = targetNode.y;
        state.activeTargetId = targetNode.id;
      }
    } else {
      if (typeof keyframe.x === 'number') targetX = keyframe.x;
      if (typeof keyframe.y === 'number') targetY = keyframe.y;
      state.activeTargetId = undefined;
    }

    const targetZoom = typeof keyframe.zoom === 'number' ? keyframe.zoom : state.zoom;
    const targetRotation = typeof keyframe.rotation === 'number' ? keyframe.rotation : state.rotation;

    const duration = Math.max(0.05, keyframe.duration);
    const rawProgress = (timeSeconds - keyframe.at) / duration;
    const eased = evaluateEasing(keyframe.easing || 'easeInOutCubic', rawProgress);

    state.x = lerp(state.x, targetX, eased);
    state.y = lerp(state.y, targetY, eased);
    state.zoom = lerp(state.zoom, targetZoom, eased);
    state.rotation = lerp(state.rotation, targetRotation, eased);
  }

  return state;
}

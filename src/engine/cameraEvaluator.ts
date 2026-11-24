/**
 * Responsabilidad Única: Calcular el estado exacto de la Cámara Virtual 2.5D
 * (posición x, y, nivel de zoom y ángulo de rotación) en cualquier segundo `t`,
 * integrando el encuadre seguro automático (`cameraAutoFramer`) para que ningún
 * texto ni imagen salga jamás fuera de los bordes del video.
 */

import {
  DslCameraKeyframe,
  DslCanvasNode,
  DslTimelineAction,
  YouTubeAspectPreset
} from '../dsl/dslTypes';
import { lerp } from '../shared/math';
import {
  autoFrameCameraKeyframes,
  FramingContext,
  guardFrameBounds
} from './cameraAutoFramer';
import { evaluateEasing } from './easings';
import { EvaluatedCanvasNode } from './nodeEvaluator';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  activeTargetId?: string;
}

export interface CameraEvaluationOptions {
  timeline?: DslTimelineAction[];
  evaluatedNodes?: EvaluatedCanvasNode[];
  aspectRatio?: YouTubeAspectPreset;
  isLightPaper?: boolean;
  duration?: number;
}

// Caché en memoria de pistas de cámara ya auto-encuadradas por referencia de escena
let lastTrackRef: DslCameraKeyframe[] | null = null;
let lastNodesRef: DslCanvasNode[] | null = null;
let lastTimelineRef: DslTimelineAction[] | null = null;
let lastAspect: YouTubeAspectPreset | null = null;
let lastLight: boolean | null = null;
let cachedFramedTrack: DslCameraKeyframe[] = [];

function getFramedTrackCached(
  cameraTrack: DslCameraKeyframe[],
  nodes: DslCanvasNode[],
  timeline: DslTimelineAction[],
  ctx: FramingContext
): DslCameraKeyframe[] {
  if (
    cameraTrack === lastTrackRef &&
    nodes === lastNodesRef &&
    timeline === lastTimelineRef &&
    ctx.aspectRatio === lastAspect &&
    ctx.isLightPaper === lastLight
  ) {
    return cachedFramedTrack;
  }

  cachedFramedTrack = autoFrameCameraKeyframes(cameraTrack, nodes, timeline, ctx);
  lastTrackRef = cameraTrack;
  lastNodesRef = nodes;
  lastTimelineRef = timeline;
  lastAspect = ctx.aspectRatio;
  lastLight = ctx.isLightPaper;
  return cachedFramedTrack;
}

export function evaluateCameraAtTime(
  cameraTrack: DslCameraKeyframe[],
  nodes: DslCanvasNode[],
  timeSeconds: number,
  options?: CameraEvaluationOptions
): CameraState {
  const aspectRatio: YouTubeAspectPreset = options?.aspectRatio === '9:16' ? '9:16' : '16:9';
  const isLightPaper = options?.isLightPaper ?? true;
  const timeline = options?.timeline ?? [];
  const duration = options?.duration ?? 10;

  const state: CameraState = {
    x: 0,
    y: 0,
    zoom: 1,
    rotation: 0
  };

  if (nodes.length === 0 && cameraTrack.length === 0) {
    return state;
  }

  const framedTrack = getFramedTrackCached(cameraTrack, nodes, timeline, {
    aspectRatio,
    isLightPaper,
    duration
  });

  if (!framedTrack.length) {
    return state;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const firstKf = framedTrack[0];
  if (firstKf) {
    const firstPos = resolveKeyframeTargetPosition(firstKf, nodeMap, 0, 0);
    state.x = firstPos.x;
    state.y = firstPos.y;
    // Zoom inicial sutil hacia adentro (0.96 -> 1.0 del zoom seguro) sin salir nunca del borde
    state.zoom = (firstKf.zoom ?? 1) * 0.96;
    state.rotation = 0;
    state.activeTargetId = firstKf.targetId ?? firstPos.activeTargetId;
  }

  let isCameraTransitioning = false;

  for (let i = 0; i < framedTrack.length; i++) {
    const keyframe = framedTrack[i];
    if (timeSeconds < keyframe.at) break;

    const resolved = resolveKeyframeTargetPosition(keyframe, nodeMap, state.x, state.y);
    const targetZoom = typeof keyframe.zoom === 'number' ? keyframe.zoom : state.zoom;
    const targetRotation = typeof keyframe.rotation === 'number' ? keyframe.rotation : state.rotation;

    const kfDuration = Math.max(0.05, keyframe.duration);
    const rawProgress = (timeSeconds - keyframe.at) / kfDuration;
    if (i > 0 && rawProgress >= 0 && rawProgress < 1) {
      isCameraTransitioning = true;
    }

    const eased = evaluateEasing(keyframe.easing || 'easeInOutCubic', rawProgress);

    state.x = lerp(state.x, resolved.x, eased);
    state.y = lerp(state.y, resolved.y, eased);
    state.zoom = lerp(state.zoom, targetZoom, eased);
    state.rotation = lerp(state.rotation, targetRotation, eased);
    state.activeTargetId = keyframe.targetId ?? resolved.activeTargetId;
  }

  // Resguardo en vivo por si el usuario edita o agrega nodos manualmente fuera de un keyframe
  if (options?.evaluatedNodes) {
    const guarded = guardFrameBounds(
      state.x,
      state.y,
      state.zoom,
      state.rotation,
      options.evaluatedNodes,
      aspectRatio,
      isLightPaper,
      isCameraTransitioning
    );
    state.x = guarded.x;
    state.y = guarded.y;
    state.zoom = guarded.zoom;
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

/**
 * Responsabilidad Única: Extraer en orden cronológico los segmentos narrativos (locución)
 * de cualquier escena `DslScene` y re-sincronizar matemáticamente los tiempos del video
 * (`cameraTrack`, `timeline`, `chapters` y `typewriter`) a la duración hablada real de cada frase,
 * garantizando que la siguiente escena y voz jamás arranquen antes de terminar la anterior.
 */

import { DslCanvasNode, DslScene } from '../dsl/dslTypes';

export interface SceneNarrationSegment {
  index: number;
  startAt: number;
  endAt: number;
  text: string;
  subtitleNodeId?: string;
  /** Título breve de la escena (para identificar rápido cada nodo en el selector) */
  sceneTitle?: string;
}

export interface RetimedSceneWindow {
  segmentIndex: number;
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  audioStart: number;
  audioEnd: number;
  spokenDur: number;
  subtitleNodeId?: string;
}

export interface PreservedAudioSlice {
  srcStart: number;
  srcEnd: number;
  dstStart: number;
}

export interface RetimedNarrationResult {
  updatedScene: DslScene;
  audioStartOffsets: number[];
  retimedWindows: RetimedSceneWindow[];
  totalDuration: number;
}

const LEAD_IN_SECONDS = 0.35;
const MIN_PAUSE_SECONDS = 0.25;
const BOUNDARY_TOLERANCE = 0.015;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Extrae una frase de locución por cada toma de cámara (o por cada nodo de texto si no hay tomas),
 * priorizando las fichas narrativas (`editorial-paper`, `pill-badge` o nodos con acción `typewriter`).
 */
export function extractSceneNarrationSegments(scene: DslScene): SceneNarrationSegment[] {
  const nodeMap = new Map<string, DslCanvasNode>(scene.nodes.map((n) => [n.id, n]));
  const sortedCamera = [...scene.cameraTrack].sort((a, b) => a.at - b.at);

  const firstActionAt = new Map<string, number>();
  const hasTypewriter = new Set<string>();
  for (const act of scene.timeline) {
    const prev = firstActionAt.get(act.targetId);
    if (prev === undefined || act.at < prev) {
      firstActionAt.set(act.targetId, act.at);
    }
    if (act.action === 'typewriter') {
      hasTypewriter.add(act.targetId);
    }
  }

  const textNodes = scene.nodes.filter(
    (n) => n.type === 'text' && Boolean((n.text || n.label || '').trim())
  );

  if (sortedCamera.length === 0) {
    const ordered = [...textNodes].sort(
      (a, b) => (firstActionAt.get(a.id) ?? 0) - (firstActionAt.get(b.id) ?? 0)
    );
    return ordered.map((node, idx) => {
      const at = firstActionAt.get(node.id) ?? idx * 4;
      return {
        index: idx,
        startAt: at,
        endAt: ordered[idx + 1] ? (firstActionAt.get(ordered[idx + 1].id) ?? at + 4) : scene.duration,
        text: cleanSpokenText(node.text || node.label),
        subtitleNodeId: node.id
      };
    });
  }

  const segments: SceneNarrationSegment[] = [];
  const usedNodeIds = new Set<string>();

  for (let i = 0; i < sortedCamera.length; i++) {
    const kf = sortedCamera[i];
    const windowStart = kf.at;
    const windowEnd = i + 1 < sortedCamera.length ? sortedCamera[i + 1].at : scene.duration;

    const candidates = textNodes.filter((n) => {
      if (usedNodeIds.has(n.id)) return false;
      const enterAt = firstActionAt.get(n.id);
      if (enterAt === undefined) return i === 0;
      return enterAt >= windowStart - 0.15 && enterAt < windowEnd - 0.05;
    });

    if (candidates.length === 0) continue;

    const best = pickBestNarrationNode(candidates, hasTypewriter, nodeMap);
    for (const c of candidates) usedNodeIds.add(c.id);

    const spoken = cleanSpokenText(best.text || best.label);
    if (!spoken) continue;

    const titleCandidate = candidates.find((c) => c.id !== best.id);
    const sceneTitle = titleCandidate
      ? cleanSpokenText(titleCandidate.text || titleCandidate.label)
      : undefined;

    segments.push({
      index: segments.length,
      startAt: windowStart,
      endAt: windowEnd,
      text: spoken,
      subtitleNodeId: best.id,
      sceneTitle
    });
  }

  return segments;
}

function pickBestNarrationNode(
  candidates: DslCanvasNode[],
  hasTypewriter: Set<string>,
  _nodeMap: Map<string, DslCanvasNode>
): DslCanvasNode {
  const typewriterNode = candidates.find((c) => hasTypewriter.has(c.id));
  if (typewriterNode) return typewriterNode;

  const editorialCard = candidates.find(
    (c) => c.textVariant === 'editorial-paper' || c.textVariant === 'pill-badge'
  );
  if (editorialCard) return editorialCard;

  return [...candidates].sort(
    (a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0)
  )[0];
}

function cleanSpokenText(raw: string): string {
  return raw
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Re-sincroniza los tiempos de las escenas narradas para que cada toma dure EXACTAMENTE
 * lo que tarda la voz real en pronunciar su texto (+ pausa natural de respiración) sin
 * acumulación de errores de redondeo ni posibilidad de que una escena o voz pise a la siguiente.
 */
export function retimeSceneToSpokenDurations(
  scene: DslScene,
  narratedSegments: SceneNarrationSegment[],
  spokenDurations: number[],
  pauseSeconds = 0.5
): RetimedNarrationResult {
  const cloned: DslScene = JSON.parse(JSON.stringify(scene)) as DslScene;
  if (narratedSegments.length === 0 || spokenDurations.length === 0) {
    return {
      updatedScene: cloned,
      audioStartOffsets: [],
      retimedWindows: [],
      totalDuration: cloned.duration
    };
  }

  const safePause = Math.max(MIN_PAUSE_SECONDS, pauseSeconds);
  const windows: RetimedSceneWindow[] = [];
  const audioStartOffsets: number[] = [];

  let cursor = round2(Math.max(0, narratedSegments[0].startAt));
  let prevOldEnd = narratedSegments[0].startAt;

  for (let i = 0; i < narratedSegments.length; i++) {
    const seg = narratedSegments[i];
    if (i > 0 && seg.startAt > prevOldEnd + 0.05) {
      cursor = round2(cursor + (seg.startAt - prevOldEnd));
    }

    const voiceDur = Math.max(0.4, spokenDurations[i] ?? 2.5);
    const oldSpan = Math.max(0.5, seg.endAt - seg.startAt);
    const newStart = round2(cursor);
    const audioStart = round2(newStart + LEAD_IN_SECONDS);
    const audioEnd = round3(audioStart + voiceDur);

    // Redondeo siempre HACIA ARRIBA para que el fin de escena jamás acorte la voz ni la pausa
    const minSceneEnd = Math.ceil((audioEnd + safePause) * 100) / 100;
    const newEnd = Math.max(round2(newStart + 2.4), minSceneEnd);

    audioStartOffsets.push(audioStart);
    windows.push({
      segmentIndex: seg.index,
      oldStart: seg.startAt,
      oldEnd: seg.startAt + oldSpan,
      newStart,
      newEnd,
      audioStart,
      audioEnd,
      spokenDur: voiceDur,
      subtitleNodeId: seg.subtitleNodeId
    });

    cursor = newEnd;
    prevOldEnd = seg.startAt + oldSpan;
  }

  const lastWindow = windows[windows.length - 1];
  const lastOldEnd = lastWindow.oldEnd;
  const tailShift = round2(lastWindow.newEnd - lastOldEnd);

  const findWindowForTime = (oldT: number): RetimedSceneWindow | undefined => {
    for (let idx = 0; idx < windows.length; idx++) {
      const w = windows[idx];
      const lowerTol = idx === 0 ? 0.05 : BOUNDARY_TOLERANCE;
      if (oldT >= w.oldStart - lowerTol && oldT < w.oldEnd - BOUNDARY_TOLERANCE) {
        return w;
      }
    }
    return undefined;
  };

  const mapTimestamp = (oldT: number): number => {
    for (let idx = 0; idx < windows.length; idx++) {
      const w = windows[idx];
      const lowerTol = idx === 0 ? 0.05 : BOUNDARY_TOLERANCE;
      if (oldT >= w.oldStart - lowerTol && oldT < w.oldEnd - BOUNDARY_TOLERANCE) {
        const localOffset = Math.max(0, oldT - w.oldStart);
        const ratio = (w.newEnd - w.newStart) / Math.max(0.2, w.oldEnd - w.oldStart);
        const mappedOffset = localOffset <= 0.8 ? localOffset : localOffset * ratio;
        return round2(Math.min(w.newEnd - 0.1, w.newStart + mappedOffset));
      }
      const nextW = windows[idx + 1];
      if (nextW && oldT >= w.oldEnd - BOUNDARY_TOLERANCE && oldT < nextW.oldStart - BOUNDARY_TOLERANCE) {
        const shiftHere = w.newEnd - w.oldEnd;
        return round2(Math.max(0, oldT + shiftHere));
      }
    }
    if (oldT >= lastOldEnd - BOUNDARY_TOLERANCE) {
      return round2(Math.max(0, oldT + tailShift));
    }
    return round2(oldT);
  };

  const mappedCamera = cloned.cameraTrack.map((kf) => ({
    ...kf,
    at: mapTimestamp(kf.at)
  }));

  const newTotalDuration = Math.max(
    Math.ceil(cursor + 0.5),
    round2(cloned.duration + tailShift)
  );

  // Asegurar que la transición de cámara de cada toma nunca invada la siguiente escena
  cloned.cameraTrack = mappedCamera.map((kf, idx) => {
    const nextAt = idx + 1 < mappedCamera.length ? mappedCamera[idx + 1].at : newTotalDuration;
    const slot = Math.max(0.5, nextAt - kf.at);
    const safeDuration = round2(Math.min(kf.duration, Math.max(0.35, slot * 0.45)));
    return {
      ...kf,
      duration: safeDuration
    };
  });

  if (cloned.chapters && cloned.chapters.length > 0) {
    cloned.chapters = cloned.chapters.map((ch) => ({
      ...ch,
      time: mapTimestamp(ch.time)
    }));
  }

  const windowBySubtitleId = new Map<string, RetimedSceneWindow>();
  for (const w of windows) {
    if (w.subtitleNodeId) windowBySubtitleId.set(w.subtitleNodeId, w);
  }

  cloned.timeline = cloned.timeline.map((act) => {
    if (act.action === 'typewriter') {
      const exactWindow = windowBySubtitleId.get(act.targetId);
      if (exactWindow) {
        return {
          ...act,
          at: exactWindow.audioStart,
          duration: round2(exactWindow.spokenDur)
        };
      }
    }

    const newAt = mapTimestamp(act.at);
    const matchedWindow = findWindowForTime(act.at);

    if (
      matchedWindow &&
      (act.action === 'float' ||
        act.action === 'orbit' ||
        act.action === 'pendulum' ||
        act.action === 'pulse')
    ) {
      const remaining = Math.max(1, matchedWindow.newEnd - newAt - 0.1);
      return {
        ...act,
        at: newAt,
        duration: round2(remaining)
      };
    }

    return {
      ...act,
      at: newAt
    };
  });

  cloned.duration = newTotalDuration;

  return {
    updatedScene: cloned,
    audioStartOffsets,
    retimedWindows: windows,
    totalDuration: newTotalDuration
  };
}

/**
 * Calcula los tramos exactos de una pista de voz existente que NO fueron reemplazados
 * y su nueva posición de destino cuando se re-sincronizó un subconjunto de escenas,
 * evitando desincronización o solapamiento con el resto del video ya narrado.
 */
export function buildPreservedExistingAudioSlices(
  existingDurationSeconds: number,
  retimedWindows: RetimedSceneWindow[]
): PreservedAudioSlice[] {
  if (existingDurationSeconds <= 0.05 || retimedWindows.length === 0) {
    return [];
  }

  const sorted = [...retimedWindows].sort((a, b) => a.oldStart - b.oldStart);
  const slices: PreservedAudioSlice[] = [];

  // Tramo previo a la primera escena regenerada
  if (sorted[0].oldStart > 0.05) {
    slices.push({
      srcStart: 0,
      srcEnd: Math.min(existingDurationSeconds, sorted[0].oldStart),
      dstStart: 0
    });
  }

  // Tramos intermedios entre escenas regeneradas no contiguas
  for (let i = 0; i < sorted.length - 1; i++) {
    const curr = sorted[i];
    const next = sorted[i + 1];
    if (next.oldStart > curr.oldEnd + 0.05 && curr.oldEnd < existingDurationSeconds) {
      slices.push({
        srcStart: curr.oldEnd,
        srcEnd: Math.min(existingDurationSeconds, next.oldStart),
        dstStart: curr.newEnd
      });
    }
  }

  // Tramo posterior a la última escena regenerada
  const last = sorted[sorted.length - 1];
  if (last.oldEnd < existingDurationSeconds - 0.05) {
    slices.push({
      srcStart: last.oldEnd,
      srcEnd: existingDurationSeconds,
      dstStart: last.newEnd
    });
  }

  return slices.filter((s) => s.srcEnd - s.srcStart > 0.04);
}

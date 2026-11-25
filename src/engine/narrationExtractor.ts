/**
 * Responsabilidad Única: Extraer en orden cronológico los segmentos narrativos (locución)
 * de cualquier escena `DslScene` y opcionalmente re-sincronizar los tiempos del video
 * (`cameraTrack`, `timeline` y `typewriter`) a la duración hablada real de cada frase.
 */

import { DslCanvasNode, DslScene } from '../dsl/dslTypes';

export interface SceneNarrationSegment {
  index: number;
  startAt: number;
  endAt: number;
  text: string;
  subtitleNodeId?: string;
}

/**
 * Extrae una frase de locución por cada toma de cámara (o por cada nodo de texto si no hay tomas),
 * priorizando las fichas narrativas (`editorial-paper`, `pill-badge` o nodos con acción `typewriter`).
 */
export function extractSceneNarrationSegments(scene: DslScene): SceneNarrationSegment[] {
  const nodeMap = new Map<string, DslCanvasNode>(scene.nodes.map((n) => [n.id, n]));
  const sortedCamera = [...scene.cameraTrack].sort((a, b) => a.at - b.at);

  // Mapa del primer instante de entrada de cada nodo en el timeline
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
    // Omitir tomas panorámicas mudas de cierre si duran pocos segundos sin nodos nuevos
    const windowStart = kf.at;
    const windowEnd = i + 1 < sortedCamera.length ? sortedCamera[i + 1].at : scene.duration;

    const candidates = textNodes.filter((n) => {
      if (usedNodeIds.has(n.id)) return false;
      const enterAt = firstActionAt.get(n.id);
      if (enterAt === undefined) return i === 0;
      return enterAt >= windowStart - 0.15 && enterAt < windowEnd - 0.05;
    });

    if (candidates.length === 0) continue;

    // Priorizar el subtítulo narrativo (ficha editorial / typewriter / frase más completa)
    const best = pickBestNarrationNode(candidates, hasTypewriter, nodeMap);
    for (const c of candidates) usedNodeIds.add(c.id);

    const spoken = cleanSpokenText(best.text || best.label);
    if (!spoken) continue;

    segments.push({
      index: segments.length,
      startAt: windowStart,
      endAt: windowEnd,
      text: spoken,
      subtitleNodeId: best.id
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

export interface RetimedNarrationResult {
  updatedScene: DslScene;
  audioStartOffsets: number[];
  totalDuration: number;
}

/**
 * Re-sincroniza los tiempos de las escenas narradas para que cada toma dure exactamente
 * lo que tarda la voz de ElevenLabs en pronunciar su texto (+ una pausa natural de respiración),
 * ajustando además la velocidad del `typewriter` a la voz real.
 */
export function retimeSceneToSpokenDurations(
  scene: DslScene,
  narratedSegments: SceneNarrationSegment[],
  spokenDurations: number[],
  pauseSeconds = 0.45
): RetimedNarrationResult {
  const cloned: DslScene = JSON.parse(JSON.stringify(scene)) as DslScene;
  if (narratedSegments.length === 0 || spokenDurations.length === 0) {
    return {
      updatedScene: cloned,
      audioStartOffsets: [],
      totalDuration: cloned.duration
    };
  }

  const leadInSeconds = 0.35; // Pequeña entrada visual antes de que empiece la voz
  const windows: Array<{
    oldStart: number;
    oldEnd: number;
    newStart: number;
    newEnd: number;
    spokenDur: number;
    subtitleNodeId?: string;
  }> = [];

  let cursor = 0;
  const audioStartOffsets: number[] = [];

  for (let i = 0; i < narratedSegments.length; i++) {
    const seg = narratedSegments[i];
    const voiceDur = Math.max(0.8, spokenDurations[i] ?? 3);
    const oldSpan = Math.max(0.5, seg.endAt - seg.startAt);
    const newSpan = Math.max(2.6, leadInSeconds + voiceDur + pauseSeconds);

    const newStart = Number(cursor.toFixed(2));
    const newEnd = Number((cursor + newSpan).toFixed(2));
    audioStartOffsets.push(Number((newStart + leadInSeconds).toFixed(2)));

    windows.push({
      oldStart: seg.startAt,
      oldEnd: seg.startAt + oldSpan,
      newStart,
      newEnd,
      spokenDur: voiceDur,
      subtitleNodeId: seg.subtitleNodeId
    });

    cursor += newSpan;
  }

  const lastOldEnd = windows[windows.length - 1].oldEnd;
  const tailShift = cursor - lastOldEnd;

  const mapTimestamp = (oldT: number): number => {
    for (const w of windows) {
      if (oldT >= w.oldStart - 0.05 && oldT < w.oldEnd - 0.02) {
        const localOffset = Math.max(0, oldT - w.oldStart);
        const ratio = (w.newEnd - w.newStart) / Math.max(0.2, w.oldEnd - w.oldStart);
        // Las animaciones de entrada (<1s) conservan su agilidad; las posteriores escalan
        const mappedOffset = localOffset <= 0.8 ? localOffset : localOffset * ratio;
        return Number(Math.min(w.newEnd - 0.1, w.newStart + mappedOffset).toFixed(2));
      }
    }
    if (oldT >= lastOldEnd - 0.02) {
      return Number(Math.max(0, oldT + tailShift).toFixed(2));
    }
    return oldT;
  };

  cloned.cameraTrack = cloned.cameraTrack.map((kf) => ({
    ...kf,
    at: mapTimestamp(kf.at)
  }));

  if (cloned.chapters && cloned.chapters.length > 0) {
    cloned.chapters = cloned.chapters.map((ch) => ({
      ...ch,
      time: mapTimestamp(ch.time)
    }));
  }

  cloned.timeline = cloned.timeline.map((act) => {
    const newAt = mapTimestamp(act.at);
    const matchedWindow = windows.find(
      (w) => act.at >= w.oldStart - 0.05 && act.at < w.oldEnd - 0.02
    );

    if (matchedWindow) {
      if (act.action === 'typewriter' && act.targetId === matchedWindow.subtitleNodeId) {
        return {
          ...act,
          at: Number((matchedWindow.newStart + leadInSeconds).toFixed(2)),
          duration: Number(matchedWindow.spokenDur.toFixed(2))
        };
      }
      if (
        act.action === 'float' ||
        act.action === 'orbit' ||
        act.action === 'pendulum' ||
        act.action === 'pulse'
      ) {
        const remaining = Math.max(1, matchedWindow.newEnd - newAt - 0.1);
        return {
          ...act,
          at: newAt,
          duration: Number(remaining.toFixed(2))
        };
      }
    }

    return {
      ...act,
      at: newAt
    };
  });

  const newTotalDuration = Math.max(
    Math.ceil(cursor + 0.5),
    Number((cloned.duration + tailShift).toFixed(1))
  );
  cloned.duration = newTotalDuration;

  return {
    updatedScene: cloned,
    audioStartOffsets,
    totalDuration: newTotalDuration
  };
}

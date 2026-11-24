/**
 * Responsabilidad Única: Compilar instrucciones en lenguaje natural (prompts del chat de IA)
 * hacia mutaciones válidas en el Lenguaje Interno (DSL) del proyecto activo.
 */

import {
  BuiltinSvgIcon,
  DslCanvasNode,
  DslScene,
  NodeActionType,
  RelativeDirection
} from '../dsl/dslTypes';
import { createId, slugifyProjectId } from '../shared/id';

export interface PromptCompilationResult {
  updatedScene: DslScene;
  assistantReply: string;
  appliedOperations: string[];
}

const ICON_KEYWORDS: Array<{ keywords: string[]; icon: BuiltinSvgIcon; color: string; defaultLabel: string }> = [
  { keywords: ['cohete', 'rocket', 'despegue', 'lanzamiento'], icon: 'rocket', color: '#f97316', defaultLabel: 'Cohete IA' },
  { keywords: ['cerebro', 'mente', 'neurona', 'ia', 'brain'], icon: 'brain', color: '#38bdf8', defaultLabel: 'Red Neuronal' },
  { keywords: ['chip', 'cpu', 'procesador', 'motor', 'codigo'], icon: 'cpu', color: '#f59e0b', defaultLabel: 'Motor Core' },
  { keywords: ['mundo', 'globo', 'mapa', 'planeta', 'global'], icon: 'globe', color: '#06b6d4', defaultLabel: 'Escala Global' },
  { keywords: ['grafico', 'metricas', 'ventas', 'chart', 'subida'], icon: 'chart', color: '#10b981', defaultLabel: 'Métricas +250%' },
  { keywords: ['estrella', 'brillo', 'magia', 'destello', 'idea'], icon: 'sparkles', color: '#ec4899', defaultLabel: 'Idea Clave' }
];

export function compileUserPromptToDsl(promptText: string, currentScene: DslScene): PromptCompilationResult {
  const lower = promptText.toLowerCase();
  const nextScene: DslScene = JSON.parse(JSON.stringify(currentScene)) as DslScene;
  const operations: string[] = [];

  // 1. Detectar si pide una vista panorámica general de todo el canvas infinito
  if (lower.includes('panorama') || lower.includes('mostrar todo') || lower.includes('alejar camara')) {
    const lastCamTime = getLatestSceneTimestamp(nextScene);
    nextScene.cameraTrack.push({
      at: Number((lastCamTime + 0.3).toFixed(2)),
      duration: 1.2,
      action: 'moveTo',
      x: 0,
      y: 0,
      zoom: 0.6,
      rotation: 0,
      easing: 'easeInOutCubic'
    });
    nextScene.duration = Math.max(nextScene.duration, lastCamTime + 2.0);
    operations.push('camera:overview');

    return {
      updatedScene: nextScene,
      assistantReply:
        'Agregué un movimiento de cámara panorámico (`zoom: 0.6`) al final del `cameraTrack` para mostrar todo el lienzo infinito.',
      appliedOperations: operations
    };
  }

  // 2. Detectar si quiere aplicar un efecto (giro, sacudida, pulso, flotación) a los nodos existentes
  if (
    (lower.includes('todos') || lower.includes('todo')) &&
    (lower.includes('gire') || lower.includes('rotar') || lower.includes('sacud') || lower.includes('wiggle') || lower.includes('pulso'))
  ) {
    const action: NodeActionType =
      lower.includes('gire') || lower.includes('rotar')
        ? 'spin'
        : lower.includes('pulso')
          ? 'pulse'
          : 'wiggle';

    const startAt = Number((getLatestSceneTimestamp(nextScene) + 0.2).toFixed(2));
    for (const node of nextScene.nodes) {
      nextScene.timeline.push({
        id: createId('act'),
        at: startAt,
        duration: 1.1,
        targetId: node.id,
        action,
        easing: 'easeInOutCubic',
        params: { degrees: 360, angle: 10, scaleAmount: 0.16, speed: 5 }
      });
      operations.push(`${action}:${node.id}`);
    }
    nextScene.duration = Math.max(nextScene.duration, startAt + 1.8);

    return {
      updatedScene: nextScene,
      assistantReply: `Apliqué la acción \`${action}\` en el segundo \`${startAt}s\` a todos los elementos del canvas en \`scene.dsl.json\`.`,
      appliedOperations: operations
    };
  }

  // 3. Crear un nuevo nodo en el canvas infinito + posicionarlo relativamente + animar cámara y pop-up
  const matchedVisual =
    ICON_KEYWORDS.find((item) => item.keywords.some((kw) => lower.includes(kw))) || ICON_KEYWORDS[5];

  const direction = detectRelativeDirection(lower);
  const anchorNode = nextScene.nodes[nextScene.nodes.length - 1];

  // Extraer nombre personalizado si escribió comillas, o usar etiqueta semántica
  const quotedMatch = promptText.match(/"([^"]+)"|'([^']+)'/);
  const label = quotedMatch ? (quotedMatch[1] || quotedMatch[2]) : matchedVisual.defaultLabel;
  const newNodeId = `${slugifyProjectId(label)}-${nextScene.nodes.length + 1}`;

  const isBadge = Boolean(quotedMatch && (lower.includes('texto') || lower.includes('cartel') || lower.includes('badge')));

  const newNode: DslCanvasNode = {
    id: newNodeId,
    label,
    type: isBadge ? 'badge' : 'svg',
    icon: matchedVisual.icon,
    text: isBadge ? label : undefined,
    color: matchedVisual.color,
    accentColor: '#ffffff',
    x: anchorNode ? anchorNode.x + 420 : 0,
    y: anchorNode ? anchorNode.y : 0,
    z: Number(((Math.random() * 0.5) - 0.15).toFixed(2)),
    width: isBadge ? 320 : 240,
    height: isBadge ? 120 : 240,
    relativeTo: anchorNode
      ? {
          targetId: anchorNode.id,
          direction,
          gap: 320
        }
      : undefined,
    initialOpacity: 0,
    initialScale: 0
  };

  nextScene.nodes.push(newNode);
  operations.push(`addNode:${newNodeId}`);

  const eventStart = Number((getLatestSceneTimestamp(nextScene) + 0.4).toFixed(2));

  // Movimiento de Cámara Virtual hacia el nuevo nodo con leve inclinación cinematográfica
  const tilt = lower.includes('rotar') || lower.includes('giro') ? 6 : -3;
  nextScene.cameraTrack.push({
    at: eventStart,
    duration: 1.0,
    action: 'focusOn',
    targetId: newNodeId,
    zoom: 1.38,
    rotation: tilt,
    easing: 'easeInOutCubic'
  });
  operations.push(`camera:focusOn(${newNodeId})`);

  // Efecto Pop-Up con física springBouncy
  const popStart = Number((eventStart + 0.2).toFixed(2));
  nextScene.timeline.push({
    id: createId('act'),
    at: popStart,
    duration: 0.85,
    targetId: newNodeId,
    action: 'popIn',
    easing: 'springBouncy',
    params: { overshoot: 1.35 }
  });
  operations.push(`timeline:popIn(${newNodeId})`);

  // Agregar efecto adicional según el prompt (wiggle, spin, float, pulse)
  const secondaryAction: NodeActionType =
    lower.includes('gire') || lower.includes('rotar')
      ? 'spin'
      : lower.includes('sacud') || lower.includes('wiggle')
        ? 'wiggle'
        : lower.includes('pulso') || lower.includes('latido')
          ? 'pulse'
          : 'float';

  nextScene.timeline.push({
    id: createId('act'),
    at: Number((popStart + 0.8).toFixed(2)),
    duration: secondaryAction === 'float' ? 4.0 : 1.1,
    targetId: newNodeId,
    action: secondaryAction,
    easing: secondaryAction === 'float' ? 'linear' : 'easeInOutCubic',
    params: { amplitude: 14, speed: 2.4, degrees: 360, angle: 9, scaleAmount: 0.14 }
  });
  operations.push(`timeline:${secondaryAction}(${newNodeId})`);

  nextScene.duration = Math.max(nextScene.duration, Math.ceil(popStart + 2.5));

  return {
    updatedScene: nextScene,
    assistantReply: `Creé el nodo \`${newNodeId}\` (${direction} de \`${anchorNode?.id ?? 'origen'}\`), programé la cámara virtual para viajar hacia él en \`t=${eventStart}s\` y disparé un \`popIn\` con física \`springBouncy\` + \`${secondaryAction}\`.`,
    appliedOperations: operations
  };
}

function detectRelativeDirection(lowerPrompt: string): RelativeDirection {
  if (lowerPrompt.includes('izquierda') || lowerPrompt.includes('left')) return 'leftOf';
  if (lowerPrompt.includes('arriba') || lowerPrompt.includes('encima') || lowerPrompt.includes('above')) return 'above';
  if (lowerPrompt.includes('abajo') || lowerPrompt.includes('debajo') || lowerPrompt.includes('below')) return 'below';
  return 'rightOf';
}

function getLatestSceneTimestamp(scene: DslScene): number {
  let maxTime = 0;
  for (const c of scene.cameraTrack) {
    maxTime = Math.max(maxTime, c.at + c.duration * 0.7);
  }
  for (const act of scene.timeline) {
    if (act.action !== 'float' && act.action !== 'pulse') {
      maxTime = Math.max(maxTime, act.at + act.duration);
    }
  }
  return Math.min(maxTime, scene.duration - 0.5);
}

/**
 * Responsabilidad Única: Compilar instrucciones en lenguaje natural (prompts del chat de IA)
 * hacia mutaciones válidas en el Lenguaje Interno (DSL) del proyecto activo, incluyendo
 * creación de textos con múltiples fuentes/formas y cambio de formato de pantalla YouTube.
 */

import {
  BuiltinSvgIcon,
  DslCanvasNode,
  DslScene,
  NodeActionType,
  RelativeDirection,
  TextFontFamily,
  TextShapeVariant
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

  // 0. Detectar cambio de pantalla YouTube (Shorts 9:16 vs YouTube 16:9)
  if (lower.includes('short') || lower.includes('9:16') || lower.includes('vertical')) {
    nextScene.aspectRatio = '9:16';
    operations.push('youtubeScreen:9:16');
    return {
      updatedScene: nextScene,
      assistantReply: 'Cambié el encuadre del proyecto a **YouTube Shorts 9:16 (1080×1920)**.',
      appliedOperations: operations
    };
  }
  if (lower.includes('16:9') || lower.includes('horizontal') || lower.includes('youtube normal')) {
    nextScene.aspectRatio = '16:9';
    operations.push('youtubeScreen:16:9');
    return {
      updatedScene: nextScene,
      assistantReply: 'Cambié el encuadre del proyecto a **Pantalla YouTube 16:9 (1920×1080)**.',
      appliedOperations: operations
    };
  }

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
        'Agregué un movimiento de cámara panorámico (`zoom: 0.6`) al final del `cameraTrack` para mostrar todo el lienzo infinito dentro de la pantalla de YouTube.',
      appliedOperations: operations
    };
  }

  // 2. Detectar si quiere aplicar un efecto global a todos los nodos
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

  // 3. Detectar si el usuario pide buscar/insertar una IMAGEN o FOTO de internet
  const isImageRequest =
    lower.includes('imagen de') ||
    lower.includes('foto de') ||
    lower.includes('busca imagen') ||
    lower.includes('buscá imagen') ||
    lower.includes('pone una foto') ||
    lower.includes('poné una foto');

  const quotedMatch = promptText.match(/"([^"]+)"|'([^']+)'/);
  const direction = detectRelativeDirection(lower);
  const anchorNode = nextScene.nodes[nextScene.nodes.length - 1];

  if (isImageRequest) {
    const queryMatch = promptText.match(/(?:imagen|foto)\s+de\s+([a-zA-Z0-9áéíóúñÁÉÍÓÚÑ\s]+)/i);
    const rawQuery = quotedMatch
      ? (quotedMatch[1] || quotedMatch[2])
      : queryMatch
        ? queryMatch[1].replace(/\b(a la derecha|a la izquierda|arriba|abajo|con pop.*)\b/gi, '').trim()
        : 'Artificial Intelligence';

    const cleanQuery = rawQuery || 'Technology';
    const newNodeId = `img-${slugifyProjectId(cleanQuery).slice(0, 14)}-${nextScene.nodes.length + 1}`;

    const imgNode: DslCanvasNode = {
      id: newNodeId,
      label: cleanQuery,
      type: 'image',
      imageQuery: cleanQuery,
      color: '#38bdf8',
      x: anchorNode ? anchorNode.x + 420 : 0,
      y: anchorNode ? anchorNode.y : 0,
      z: 0.1,
      width: 300,
      height: 240,
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

    nextScene.nodes.push(imgNode);
    operations.push(`internetImage:${cleanQuery}`);

    const eventStart = Number((getLatestSceneTimestamp(nextScene) + 0.35).toFixed(2));
    nextScene.cameraTrack.push({
      at: eventStart,
      duration: 1.0,
      action: 'focusOn',
      targetId: newNodeId,
      zoom: 1.2,
      rotation: 0,
      easing: 'easeInOutCubic'
    });

    const popStart = Number((eventStart + 0.15).toFixed(2));
    nextScene.timeline.push({
      id: createId('act'),
      at: popStart,
      duration: 0.85,
      targetId: newNodeId,
      action: 'popIn',
      easing: 'springBouncy',
      params: { overshoot: 1.3 }
    });

    nextScene.duration = Math.max(nextScene.duration, Math.ceil(popStart + 2.4));

    return {
      updatedScene: nextScene,
      assistantReply: `Busqué en internet una imagen real para **"${cleanQuery}"** (\`imageQuery: "${cleanQuery}"\`) y la inserté en el canvas con efecto Pop-Up.`,
      appliedOperations: operations
    };
  }

  // 4. Detectar si el usuario quiere crear TEXTO con diversas formas y fuentes
  const isTextRequest =
    lower.includes('texto') ||
    lower.includes('titulo') ||
    lower.includes('título') ||
    lower.includes('cartel') ||
    lower.includes('escrib') ||
    lower.includes('frase') ||
    lower.includes('fuente') ||
    lower.includes('3d') ||
    lower.includes('curvo') ||
    lower.includes('neon') ||
    lower.includes('neón');

  if (isTextRequest) {
    const contentText = quotedMatch ? (quotedMatch[1] || quotedMatch[2]) : '¡IMPACTO VISUAL IA!';
    const fontFamily = detectTextFontFamily(lower);
    const textVariant = detectTextShapeVariant(lower);
    const textColor = detectRequestedColor(lower, textVariant);
    const newNodeId = `texto-${slugifyProjectId(contentText).slice(0, 14)}-${nextScene.nodes.length + 1}`;

    const textNode: DslCanvasNode = {
      id: newNodeId,
      label: `Texto: ${contentText.slice(0, 18)}`,
      type: 'text',
      text: contentText,
      fontFamily,
      textVariant,
      fontSize: textVariant === '3d-pop' ? 42 : 30,
      color: textColor,
      accentColor: textVariant === 'highlight-box' ? '#020617' : '#ffffff',
      x: anchorNode ? anchorNode.x : 0,
      y: anchorNode ? anchorNode.y - 260 : 0,
      z: 0.35,
      width: Math.max(300, contentText.length * 22),
      height: 110,
      relativeTo: anchorNode
        ? {
            targetId: anchorNode.id,
            direction,
            gap: 220
          }
        : undefined,
      initialOpacity: 0,
      initialScale: 0
    };

    nextScene.nodes.push(textNode);
    operations.push(`addText:${newNodeId}(${textVariant}/${fontFamily})`);

    const eventStart = Number((getLatestSceneTimestamp(nextScene) + 0.35).toFixed(2));
    nextScene.cameraTrack.push({
      at: eventStart,
      duration: 0.95,
      action: 'focusOn',
      targetId: newNodeId,
      zoom: 1.32,
      rotation: textVariant === '3d-pop' ? -2 : 0,
      easing: 'easeInOutCubic'
    });
    operations.push(`camera:focusOn(${newNodeId})`);

    const useTypewriter =
      lower.includes('maquina') ||
      lower.includes('máquina') ||
      lower.includes('typewriter') ||
      lower.includes('escrib') ||
      fontFamily === 'mono';

    const entryAction: NodeActionType = useTypewriter ? 'typewriter' : 'popIn';
    const popStart = Number((eventStart + 0.15).toFixed(2));

    nextScene.timeline.push({
      id: createId('act'),
      at: popStart,
      duration: useTypewriter ? 1.2 : 0.85,
      targetId: newNodeId,
      action: entryAction,
      easing: 'springBouncy',
      params: { overshoot: 1.38 }
    });
    operations.push(`timeline:${entryAction}(${newNodeId})`);

    nextScene.duration = Math.max(nextScene.duration, Math.ceil(popStart + 2.4));

    return {
      updatedScene: nextScene,
      assistantReply: `Agregué el nodo de texto \`${newNodeId}\` ("${contentText}") con forma **${textVariant}**, fuente **${fontFamily}** y animación **${entryAction}** ubicado \`${direction}\` de \`${anchorNode?.id ?? 'origen'}\`.`,
      appliedOperations: operations
    };
  }

  // 4. Crear un nuevo nodo visual (SVG/Imagen) + posicionarlo relativamente + animar cámara y pop-up
  const matchedVisual =
    ICON_KEYWORDS.find((item) => item.keywords.some((kw) => lower.includes(kw))) || ICON_KEYWORDS[5];

  const label = quotedMatch ? (quotedMatch[1] || quotedMatch[2]) : matchedVisual.defaultLabel;
  const newNodeId = `${slugifyProjectId(label)}-${nextScene.nodes.length + 1}`;

  const newNode: DslCanvasNode = {
    id: newNodeId,
    label,
    type: 'svg',
    icon: matchedVisual.icon,
    color: matchedVisual.color,
    accentColor: '#ffffff',
    x: anchorNode ? anchorNode.x + 420 : 0,
    y: anchorNode ? anchorNode.y : 0,
    z: Number(((Math.random() * 0.5) - 0.15).toFixed(2)),
    width: 240,
    height: 240,
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

function detectTextFontFamily(lower: string): TextFontFamily {
  if (lower.includes('manuscrit') || lower.includes('mano') || lower.includes('hand')) return 'handwritten';
  if (lower.includes('mono') || lower.includes('codigo') || lower.includes('código') || lower.includes('terminal')) return 'mono';
  if (lower.includes('serif') || lower.includes('editorial') || lower.includes('libro')) return 'serif';
  if (lower.includes('sans') || lower.includes('limpi')) return 'sans';
  return 'display';
}

function detectTextShapeVariant(lower: string): TextShapeVariant {
  if (lower.includes('curv') || lower.includes('arco')) return 'curved-arc';
  if (lower.includes('resalt') || lower.includes('vox') || lower.includes('cinta') || lower.includes('highlight')) return 'highlight-box';
  if (lower.includes('neon') || lower.includes('neón') || lower.includes('brill')) return 'neon-glow';
  if (lower.includes('hueco') || lower.includes('contorno') || lower.includes('outline')) return 'outline-hollow';
  if (lower.includes('capsula') || lower.includes('cápsula') || lower.includes('pill')) return 'pill-badge';
  return '3d-pop';
}

function detectRequestedColor(lower: string, variant: TextShapeVariant): string {
  if (lower.includes('amarill')) return '#facc15';
  if (lower.includes('rojo')) return '#f43f5e';
  if (lower.includes('verde')) return '#10b981';
  if (lower.includes('rosa') || lower.includes('magenta')) return '#ec4899';
  if (variant === 'highlight-box') return '#facc15';
  if (variant === 'neon-glow') return '#38bdf8';
  return '#f97316';
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

/**
 * Responsabilidad Única: Validar y parsear un documento JSON crudo hacia un objeto DslScene seguro.
 * Informa errores claros en español si la IA o el usuario introduce sintaxis inválida.
 */

import { DslScene } from './dslTypes';

export interface DslValidationResult {
  valid: boolean;
  scene?: DslScene;
  error?: string;
}

export function validateAndParseDsl(rawJson: string): DslValidationResult {
  try {
    const parsed = JSON.parse(rawJson) as Partial<DslScene>;

    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'El DSL debe ser un objeto JSON válido.' };
    }
    if (!Array.isArray(parsed.nodes)) {
      return { valid: false, error: 'El DSL requiere un arreglo "nodes" con los elementos del canvas.' };
    }
    if (!Array.isArray(parsed.timeline)) {
      return { valid: false, error: 'El DSL requiere un arreglo "timeline" con las animaciones.' };
    }
    if (!Array.isArray(parsed.cameraTrack)) {
      return { valid: false, error: 'El DSL requiere un arreglo "cameraTrack" para la cámara virtual.' };
    }

    const duration = typeof parsed.duration === 'number' && parsed.duration > 0 ? parsed.duration : 10;

    const chapters = Array.isArray(parsed.chapters)
      ? parsed.chapters.filter(
          (ch): ch is { label: string; time: number } =>
            Boolean(ch) &&
            typeof ch.label === 'string' &&
            ch.label.trim().length > 0 &&
            typeof ch.time === 'number' &&
            Number.isFinite(ch.time) &&
            ch.time >= 0
        )
      : undefined;

    const scene: DslScene = {
      version: parsed.version || '1.5.0',
      duration,
      aspectRatio: parsed.aspectRatio === '9:16' ? '9:16' : '16:9',
      backgroundStyle: parsed.backgroundStyle || 'vintage-paper',
      background: parsed.background || '#f4ecdc',
      backgroundSecondary: parsed.backgroundSecondary || '#d7c6a9',
      showGrid: Boolean(parsed.showGrid),
      autoAvoidOverlap: parsed.autoAvoidOverlap !== false,
      autoFillFrame: parsed.autoFillFrame !== false,
      gridColor: parsed.gridColor || '#cbbba0',
      audioTrack: parsed.audioTrack,
      chapters: chapters && chapters.length > 0 ? chapters : undefined,
      nodes: parsed.nodes,
      cameraTrack: parsed.cameraTrack,
      timeline: parsed.timeline
    };

    return { valid: true, scene };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido de JSON';
    return { valid: false, error: `Error de sintaxis en el DSL: ${message}` };
  }
}

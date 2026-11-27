/**
 * Responsabilidad Única: Conectar con la API oficial de ElevenLabs Text-to-Speech,
 * proveer el catálogo de voces oficiales `premade` (100% habilitadas en cuentas gratuitas por API),
 * consultar el caché local de clips para no desperdiciar tokens y devolver cada clip analizado.
 */

import { getCachedTtsClipBytes, saveCachedTtsClipBytes } from './elevenLabsClipCache';
import { SynthesizedClip } from './narrationWavAssembler';
import { analyzeAndTrimSpeechBuffer } from './speechAudioAnalyzer';

export {
  assembleClipsIntoMasterWavUrl,
  assembleMasterNarrationWav,
  decodeExistingVoiceTrack,
  stitchTwoVoiceFilesToMasterWavUrl
} from './narrationWavAssembler';
export type {
  MasterWavAssemblyResult,
  MasterWavMergeOptions,
  SynthesizedClip
} from './narrationWavAssembler';

// George (premade oficial de ElevenLabs): habilitada gratis por API y de tono cálido documental
export const DEFAULT_ELEVENLABS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';

export interface ElevenLabsVoiceOption {
  id: string;
  name: string;
  role: string;
  previewUrl?: string;
}

/**
 * Voces oficiales "premade" de ElevenLabs que funcionan GRATIS vía API (sin error 402)
 * y hablan español fluido al usar `eleven_flash_v2_5` o `eleven_multilingual_v2`.
 */
export const FREE_TIER_PREMADE_VOICES: ElevenLabsVoiceOption[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', role: 'Narrador Documental Cálido (Recomendado)' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', role: 'Locutor Firme / Historia y Ciencia' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', role: 'Voz Profunda y Resonante' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', role: 'Sabio, Maduro y Clásico' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', role: 'Narrador Intenso y Dominante' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', role: 'Suave, Claro y Confiable' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', role: 'Dinámico / Estilo YouTube' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', role: 'Relajado y Resonante' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', role: 'Narradora Profesional y Educativa' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', role: 'Educadora Clara y Dinámica' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', role: 'Locutora Confiable Estilo TV' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', role: 'Cálida y Luminosa' }
];

const STORAGE_API_KEY = 'infinite_editor.elevenlabs.api_key';
const STORAGE_VOICE_ID = 'infinite_editor.elevenlabs.voice_id';
const STORAGE_MODEL_ID = 'infinite_editor.elevenlabs.model_id';

// Voces comunitarias conocidas que devuelven 402 en cuentas gratuitas; se migran a George por defecto
const BLOCKED_ON_FREE_LIBRARY_IDS = new Set(['UK00oAtGYBrHBUbesfMv']);

export type ElevenLabsModelId =
  | 'eleven_flash_v2_5'
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2_5';

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: ElevenLabsModelId;
}

export function loadSavedElevenLabsConfig(): ElevenLabsConfig {
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_ELEVENLABS_API_KEY;
  const storedVoice = localStorage.getItem(STORAGE_VOICE_ID) || '';
  const safeVoice =
    !storedVoice || BLOCKED_ON_FREE_LIBRARY_IDS.has(storedVoice)
      ? DEFAULT_ELEVENLABS_VOICE_ID
      : storedVoice;

  return {
    apiKey: localStorage.getItem(STORAGE_API_KEY) || envKey || '',
    voiceId: safeVoice,
    modelId:
      (localStorage.getItem(STORAGE_MODEL_ID) as ElevenLabsModelId) ||
      'eleven_flash_v2_5'
  };
}

export function saveElevenLabsConfig(config: ElevenLabsConfig): void {
  localStorage.setItem(STORAGE_API_KEY, config.apiKey.trim());
  localStorage.setItem(
    STORAGE_VOICE_ID,
    config.voiceId.trim() || DEFAULT_ELEVENLABS_VOICE_ID
  );
  localStorage.setItem(STORAGE_MODEL_ID, config.modelId);
}

/**
 * Consulta sin costo de créditos las URLs de muestra (`preview_url`) de las voces oficiales de ElevenLabs.
 */
export async function fetchFreePremadePreviewMap(): Promise<Record<string, string>> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices');
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, string> = {};
    if (Array.isArray(data?.voices)) {
      for (const v of data.voices) {
        if (v?.voice_id && v?.preview_url) {
          map[v.voice_id] = v.preview_url;
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function isLikelyElevenLabsKeyId(rawKey: string): boolean {
  const clean = rawKey.trim();
  return clean.length >= 20 && !clean.startsWith('sk_');
}

const KEY_ID_HELP_MESSAGE =
  'Pegaste el "API Key ID" (sin prefijo "sk_") en lugar de la clave secreta real. En ElevenLabs → Developers → API Keys tocá "Create API Key" (o el menú "..." → "Rotate" en tu clave actual) y copiá la clave secreta que empieza con "sk_..." apenas aparece.';

/**
 * Sintetiza (o recupera instantáneamente del caché local sin gastar créditos) un fragmento
 * de texto usando ElevenLabs, analiza su forma de onda real para medir la duración hablada
 * exacta sin silencios muertos y devuelve el clip listo para ensamblar sin solapamientos.
 */
export async function synthesizeElevenLabsSegment(
  text: string,
  config: ElevenLabsConfig,
  decodeCtx: BaseAudioContext,
  abortSignal?: AbortSignal,
  projectId?: string
): Promise<SynthesizedClip> {
  const cleanVoice = config.voiceId.trim() || DEFAULT_ELEVENLABS_VOICE_ID;

  // 1. Revisar caché local (IndexedDB + disco físico) primero: 0 tokens si ya se narró
  const cachedBytes = await getCachedTtsClipBytes(cleanVoice, config.modelId, text, projectId);
  if (cachedBytes) {
    try {
      const decoded = await decodeCtx.decodeAudioData(cachedBytes);
      const analyzed = analyzeAndTrimSpeechBuffer(decoded);
      return {
        audioBuffer: decoded,
        durationSeconds: analyzed.spokenDurationSeconds,
        rawDurationSeconds: decoded.duration,
        trimmedPcm: analyzed.pcm,
        trimmedSampleRate: analyzed.sampleRate,
        fromCache: true
      };
    } catch {
      // Si el registro cacheado estuviera corrupto, continuar a síntesis normal
    }
  }

  const cleanKey = config.apiKey.trim();
  if (!cleanKey) {
    throw new Error('Ingresá tu API Key secreta de ElevenLabs (empieza con sk_...) para generar la voz.');
  }
  if (isLikelyElevenLabsKeyId(cleanKey)) {
    throw new Error(KEY_ID_HELP_MESSAGE);
  }

  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
    cleanVoice
  )}?output_format=mp3_44100_128`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'xi-api-key': cleanKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: config.modelId,
      voice_settings: {
        stability: 0.52,
        similarity_boost: 0.78,
        style: 0.18,
        use_speaker_boost: true
      }
    }),
    signal: abortSignal
  });

  if (!response.ok) {
    let detail = '';
    let code = '';
    try {
      const errJson = await response.json();
      detail = errJson?.detail?.message || errJson?.message || '';
      code = errJson?.detail?.code || errJson?.detail?.status || '';
    } catch {
      // Ignorar si no es JSON
    }

    const detailLower = detail.toLowerCase();
    const codeLower = String(code).toLowerCase();

    if (
      codeLower.includes('api_key_id') ||
      detailLower.includes('api key id used as api key') ||
      detailLower.includes("start with 'sk_'")
    ) {
      throw new Error(KEY_ID_HELP_MESSAGE);
    }
    if (
      response.status === 401 ||
      codeLower.includes('invalid_api_key') ||
      detailLower.includes('api key')
    ) {
      throw new Error(
        `API Key inválida o sin permiso de Text-to-Speech (recordá usar la clave secreta que empieza con "sk_..."). ${detail}`.trim()
      );
    }
    if (response.status === 402) {
      throw new Error(
        `ElevenLabs bloquea voces de la librería comunitaria (${cleanVoice}) en cuentas gratuitas (Error 402). Elegí arriba cualquiera de las 12 Voces Oficiales Gratis (George, Daniel, Brian, Matilda, etc.) que funcionan sin pagar suscripción.`
      );
    }
    if (response.status === 404 || (response.status === 400 && detailLower.includes('voice'))) {
      throw new Error(
        `No se encontró el Voice ID "${cleanVoice}". Elegí una de las Voces Oficiales Gratis del selector. (${detail || response.status})`
      );
    }
    if (response.status === 400) {
      throw new Error(`Solicitud rechazada por ElevenLabs (400): ${detail || response.statusText}`);
    }
    if (response.status === 429) {
      throw new Error(
        `Límite de peticiones o cuota de caracteres alcanzado en tu cuenta de ElevenLabs. ${detail}`.trim()
      );
    }
    throw new Error(
      `Error de ElevenLabs (${response.status}): ${detail || response.statusText}`
    );
  }

  const mp3Bytes = await response.arrayBuffer();
  // Clonar ANTES de decodeAudioData (Web Audio desconecta el ArrayBuffer original al decodificar)
  const bytesForCache = mp3Bytes.slice(0);
  await saveCachedTtsClipBytes(cleanVoice, config.modelId, text, bytesForCache, projectId);

  const decoded = await decodeCtx.decodeAudioData(mp3Bytes);
  const analyzed = analyzeAndTrimSpeechBuffer(decoded);

  return {
    audioBuffer: decoded,
    durationSeconds: analyzed.spokenDurationSeconds,
    rawDurationSeconds: decoded.duration,
    trimmedPcm: analyzed.pcm,
    trimmedSampleRate: analyzed.sampleRate,
    fromCache: false
  };
}

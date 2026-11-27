/**
 * Responsabilidad Única: Cliente de narración neuronal gratuita e ilimitada (`edge-tts`)
 * conectado al bridge local de Vite (`/__local-tts/*`), con catálogo curado de voces en
 * español y multilingües HD, caché doble (IndexedDB + disco) y análisis PCM anti-solapamiento.
 */

import { getCachedTtsClipBytes, saveCachedTtsClipBytes } from './elevenLabsClipCache';
import { SynthesizedClip } from './narrationWavAssembler';
import { analyzeAndTrimSpeechBuffer } from './speechAudioAnalyzer';

export interface FreeNeuralVoiceOption {
  id: string;
  name: string;
  region: string;
  role: string;
  gender: 'F' | 'M';
}

export const DEFAULT_FREE_NEURAL_VOICE_ID = 'es-MX-DaliaNeural';

/**
 * Voces neuronales verificadas en vivo contra `edge-tts 7.3.1` (0 tokens, ilimitadas).
 */
export const FREE_NEURAL_VOICES: FreeNeuralVoiceOption[] = [
  {
    id: 'es-MX-DaliaNeural',
    name: 'Dalia',
    region: 'México (Latino Neutro)',
    role: 'Cálida, Clara y Cercana — Recomendada para Juana La Sana',
    gender: 'F'
  },
  {
    id: 'es-CO-SalomeNeural',
    name: 'Salomé',
    region: 'Colombia',
    role: 'Amable, Dulce y Muy Natural',
    gender: 'F'
  },
  {
    id: 'en-US-AvaMultilingualNeural',
    name: 'Ava (Multilingüe HD)',
    region: 'Internacional / Copilot HD',
    role: 'Ultra Expresiva y Cálida (estilo conversacional natural)',
    gender: 'F'
  },
  {
    id: 'en-US-EmmaMultilingualNeural',
    name: 'Emma (Multilingüe HD)',
    region: 'Internacional / Copilot HD',
    role: 'Luminosa, Clara y Conversacional',
    gender: 'F'
  },
  {
    id: 'es-US-PalomaNeural',
    name: 'Paloma',
    region: 'Latino EE.UU.',
    role: 'Locutora Editorial / Estilo Documental TV',
    gender: 'F'
  },
  {
    id: 'es-AR-ElenaNeural',
    name: 'Elena',
    region: 'Argentina',
    role: 'Rioplatense Natural y Amigable',
    gender: 'F'
  },
  {
    id: 'es-UY-ValentinaNeural',
    name: 'Valentina',
    region: 'Uruguay',
    role: 'Suave y Cercana',
    gender: 'F'
  },
  {
    id: 'es-ES-XimenaNeural',
    name: 'Ximena',
    region: 'España',
    role: 'Moderna, Fluida y Expresiva',
    gender: 'F'
  },
  {
    id: 'es-ES-ElviraNeural',
    name: 'Elvira',
    region: 'España',
    role: 'Documental Clásica y Serena',
    gender: 'F'
  },
  {
    id: 'es-PE-CamilaNeural',
    name: 'Camila',
    region: 'Perú',
    role: 'Clara y Didáctica',
    gender: 'F'
  },
  {
    id: 'es-CL-CatalinaNeural',
    name: 'Catalina',
    region: 'Chile',
    role: 'Serena y Confiable',
    gender: 'F'
  },
  {
    id: 'es-MX-JorgeNeural',
    name: 'Jorge',
    region: 'México (Latino Neutro)',
    role: 'Narrador Masculino Documental',
    gender: 'M'
  },
  {
    id: 'en-US-AndrewMultilingualNeural',
    name: 'Andrew (Multilingüe HD)',
    region: 'Internacional / Copilot HD',
    role: 'Cálido y Auténtico (ES / EN)',
    gender: 'M'
  },
  {
    id: 'es-CO-GonzaloNeural',
    name: 'Gonzalo',
    region: 'Colombia',
    role: 'Narrador Masculino Cálido',
    gender: 'M'
  },
  {
    id: 'es-AR-TomasNeural',
    name: 'Tomás',
    region: 'Argentina',
    role: 'Masculino Conversacional',
    gender: 'M'
  },
  {
    id: 'es-ES-AlvaroNeural',
    name: 'Álvaro',
    region: 'España',
    role: 'Documental Historia y Ciencia',
    gender: 'M'
  }
];

export interface FreeNeuralTtsConfig {
  voiceId: string;
  /** Ej: '-10%', '-5%', '+0%', '+5%', '+10%' */
  rate: string;
  /** Ej: '-4Hz', '+0Hz', '+3Hz' */
  pitch: string;
}

const STORAGE_VOICE = 'infinite_editor.free_tts.voice_id';
const STORAGE_RATE = 'infinite_editor.free_tts.rate';
const STORAGE_PITCH = 'infinite_editor.free_tts.pitch';

export function buildFreeNeuralCacheModelTag(config: FreeNeuralTtsConfig): string {
  return `edge-tts_${config.rate}_${config.pitch}`;
}

export function loadSavedFreeNeuralConfig(): FreeNeuralTtsConfig {
  return {
    voiceId: localStorage.getItem(STORAGE_VOICE) || DEFAULT_FREE_NEURAL_VOICE_ID,
    rate: localStorage.getItem(STORAGE_RATE) || '+0%',
    pitch: localStorage.getItem(STORAGE_PITCH) || '+0Hz'
  };
}

export function saveFreeNeuralConfig(config: FreeNeuralTtsConfig): void {
  localStorage.setItem(STORAGE_VOICE, config.voiceId.trim() || DEFAULT_FREE_NEURAL_VOICE_ID);
  localStorage.setItem(STORAGE_RATE, config.rate || '+0%');
  localStorage.setItem(STORAGE_PITCH, config.pitch || '+0Hz');
}

export async function checkFreeNeuralTtsStatus(): Promise<{ available: boolean; error?: string }> {
  try {
    const res = await fetch('/__local-tts/status', { cache: 'no-store' });
    if (!res.ok) return { available: false, error: 'Bridge local no activo' };
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return { available: false, error: 'Requiere ejecutar el editor con npm run dev' };
    }
    const data = (await res.json()) as { ok?: boolean; available?: boolean };
    return { available: Boolean(data?.ok && data?.available) };
  } catch {
    return { available: false, error: 'No se pudo conectar con /__local-tts/status' };
  }
}

/**
 * Genera una muestra corta gratuita en español para probar el timbre de la voz seleccionada.
 */
export async function generateFreeNeuralSampleUrl(
  config: FreeNeuralTtsConfig,
  sampleText = 'Hola, soy Juana. Hoy vamos a ver ciencia clara y práctica para cuidar tu salud todos los días.'
): Promise<string> {
  const res = await fetch('/__local-tts/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: sampleText,
      voice: config.voiceId,
      rate: config.rate,
      pitch: config.pitch
    })
  });
  if (!res.ok) {
    let detail = '';
    try {
      const json = (await res.json()) as { error?: string };
      detail = json.error || '';
    } catch {
      // Ignorar si no es JSON
    }
    throw new Error(detail || `Error al generar muestra de voz (${res.status})`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * Sintetiza una escena con `edge-tts` (o la recupera al instante desde el caché local en
 * IndexedDB / disco físico), analiza su forma de onda PCM real para medir la duración
 * hablada exacta y devuelve el clip listo para ensamblar sin solapamientos.
 */
export async function synthesizeFreeNeuralSegment(
  text: string,
  config: FreeNeuralTtsConfig,
  decodeCtx: BaseAudioContext,
  abortSignal?: AbortSignal,
  projectId?: string
): Promise<SynthesizedClip> {
  const cleanVoice = config.voiceId.trim() || DEFAULT_FREE_NEURAL_VOICE_ID;
  const modelTag = buildFreeNeuralCacheModelTag(config);

  // 1. Revisar caché local (IndexedDB + disco físico) primero
  const cachedBytes = await getCachedTtsClipBytes(cleanVoice, modelTag, text, projectId);
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
      // Si el registro en caché fallara, regenerar normalmente
    }
  }

  const response = await fetch('/__local-tts/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice: cleanVoice,
      rate: config.rate,
      pitch: config.pitch
    }),
    signal: abortSignal
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errJson = (await response.json()) as { error?: string };
      detail = errJson?.error || '';
    } catch {
      // Ignorar si no es JSON
    }
    throw new Error(detail || `Error al generar voz neuronal gratuita (${response.status}).`);
  }

  const mp3Bytes = await response.arrayBuffer();
  if (mp3Bytes.byteLength === 0) {
    throw new Error('El motor de voz gratuito devolvió un audio vacío.');
  }

  // Clonar antes de decodeAudioData porque Web Audio desconecta el ArrayBuffer original
  const bytesForCache = mp3Bytes.slice(0);
  await saveCachedTtsClipBytes(cleanVoice, modelTag, text, bytesForCache, projectId);

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

/**
 * Responsabilidad Única: Conectar con la API oficial de ElevenLabs Text-to-Speech,
 * proveer el catálogo de voces oficiales `premade` (100% habilitadas en cuentas gratuitas por API),
 * decodificar cada clip de voz y ensamblar una pista maestra WAV de 44.1 kHz.
 */

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

export interface SynthesizedClip {
  audioBuffer: AudioBuffer;
  durationSeconds: number;
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
 * Sintetiza un fragmento de texto usando ElevenLabs y devuelve su `AudioBuffer` decodificado.
 */
export async function synthesizeElevenLabsSegment(
  text: string,
  config: ElevenLabsConfig,
  decodeCtx: BaseAudioContext,
  abortSignal?: AbortSignal
): Promise<SynthesizedClip> {
  const cleanKey = config.apiKey.trim();
  const cleanVoice = config.voiceId.trim() || DEFAULT_ELEVENLABS_VOICE_ID;

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
  const decoded = await decodeCtx.decodeAudioData(mp3Bytes);
  return {
    audioBuffer: decoded,
    durationSeconds: decoded.duration
  };
}

export interface MasterWavMergeOptions {
  /** AudioBuffer de la pista de voz ya cargada en el proyecto */
  existingVoiceBuffer: AudioBuffer;
  /**
   * 'prepend-shift': desplaza la voz existente hacia adelante e inserta la intro nueva antes.
   * 'replace-ranges': mantiene la voz existente intacta fuera de las escenas regeneradas.
   */
  mode: 'prepend-shift' | 'replace-ranges';
  /** Desplazamiento en segundos para 'prepend-shift' */
  shiftExistingBySeconds?: number;
  /** Ventanas a silenciar de la voz anterior antes de insertar los clips nuevos ('replace-ranges') */
  replacedRanges?: Array<{ start: number; end: number }>;
}

/**
 * Decodifica una pista de voz existente (Blob URL, Data URL o link) para poder combinarla
 * con clips recién generados sin volver a gastar créditos en el resto del video.
 */
export async function decodeExistingVoiceTrack(
  audioUrl: string,
  decodeCtx: BaseAudioContext
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return await decodeCtx.decodeAudioData(bytes);
  } catch {
    return null;
  }
}

/**
 * Une múltiples clips de voz decodificados en sus instantes exactos (`startOffsets`)
 * dentro de un archivo WAV PCM 16-bit de 44.1 kHz, con soporte opcional para anteponer
 * o parchar sobre una pista de voz existente sin regenerar el video completo.
 */
export function assembleClipsIntoMasterWavUrl(
  clips: SynthesizedClip[],
  startOffsets: number[],
  totalDurationSeconds: number,
  mergeOptions?: MasterWavMergeOptions
): string {
  const sampleRate = 44100;
  let maxRequiredSeconds = totalDurationSeconds;

  for (let i = 0; i < clips.length; i++) {
    const end = (startOffsets[i] ?? 0) + clips[i].durationSeconds + 0.2;
    if (end > maxRequiredSeconds) maxRequiredSeconds = end;
  }

  if (mergeOptions?.existingVoiceBuffer) {
    const shiftSec =
      mergeOptions.mode === 'prepend-shift'
        ? Math.max(0, mergeOptions.shiftExistingBySeconds ?? 0)
        : 0;
    const existingEnd = shiftSec + mergeOptions.existingVoiceBuffer.duration + 0.2;
    if (existingEnd > maxRequiredSeconds) maxRequiredSeconds = existingEnd;
  }

  const totalSamples = Math.max(sampleRate, Math.ceil(maxRequiredSeconds * sampleRate));
  const mixedPcm = new Float32Array(totalSamples);

  // 1. Volcar primero la pista de voz existente (si se solicitó combinar/anteponer)
  if (mergeOptions?.existingVoiceBuffer) {
    const baseBuf = mergeOptions.existingVoiceBuffer;
    const shiftSec =
      mergeOptions.mode === 'prepend-shift'
        ? Math.max(0, mergeOptions.shiftExistingBySeconds ?? 0)
        : 0;
    const baseStartSample = Math.floor(shiftSec * sampleRate);
    const ch0 = baseBuf.getChannelData(0);
    const ch1 = baseBuf.numberOfChannels > 1 ? baseBuf.getChannelData(1) : null;
    const ratio = baseBuf.sampleRate / sampleRate;
    const outLen = Math.floor(baseBuf.length / ratio);
    const ranges = mergeOptions.replacedRanges ?? [];
    const rampSec = 0.035;

    for (let s = 0; s < outLen; s++) {
      const targetIdx = baseStartSample + s;
      if (targetIdx >= totalSamples) break;
      const targetTime = targetIdx / sampleRate;

      let maskGain = 1;
      for (const r of ranges) {
        if (targetTime >= r.start && targetTime <= r.end) {
          maskGain = 0;
          break;
        }
        if (targetTime >= r.start - rampSec && targetTime < r.start) {
          maskGain = Math.min(maskGain, (r.start - targetTime) / rampSec);
        } else if (targetTime > r.end && targetTime <= r.end + rampSec) {
          maskGain = Math.min(maskGain, (targetTime - r.end) / rampSec);
        }
      }
      if (maskGain <= 0.0001) continue;

      const srcPos = s * ratio;
      const idx0 = Math.min(baseBuf.length - 1, Math.floor(srcPos));
      const idx1 = Math.min(baseBuf.length - 1, idx0 + 1);
      const frac = srcPos - idx0;
      const v0 = ch1 ? (ch0[idx0] + ch1[idx0]) * 0.5 : ch0[idx0];
      const v1 = ch1 ? (ch0[idx1] + ch1[idx1]) * 0.5 : ch0[idx1];
      const val = v0 + (v1 - v0) * frac;
      mixedPcm[targetIdx] = val * maskGain;
    }
  }

  // 2. Superponer los clips recién generados en sus instantes exactos
  for (let i = 0; i < clips.length; i++) {
    const buf = clips[i].audioBuffer;
    const offsetSec = Math.max(0, startOffsets[i] ?? 0);
    const startSample = Math.floor(offsetSec * sampleRate);

    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const ratio = buf.sampleRate / sampleRate;
    const outLen = Math.floor(buf.length / ratio);

    for (let s = 0; s < outLen; s++) {
      const targetIdx = startSample + s;
      if (targetIdx >= totalSamples) break;
      const srcPos = s * ratio;
      const idx0 = Math.min(buf.length - 1, Math.floor(srcPos));
      const idx1 = Math.min(buf.length - 1, idx0 + 1);
      const frac = srcPos - idx0;
      const s0 = ch1 ? (ch0[idx0] + ch1[idx0]) * 0.5 : ch0[idx0];
      const s1 = ch1 ? (ch0[idx1] + ch1[idx1]) * 0.5 : ch0[idx1];
      const sampleVal = s0 + (s1 - s0) * frac;
      mixedPcm[targetIdx] = Math.max(-1, Math.min(1, mixedPcm[targetIdx] + sampleVal));
    }
  }

  return encodeFloat32ToWavBlobUrl(mixedPcm, sampleRate);
}

/**
 * Une dos archivos de voz locales (ej. Intro nueva + Audio viejo de 10 minutos) en un único
 * archivo WAV maestro de 44.1 kHz, colocando el segundo archivo exactamente en `secondStartAtSeconds`.
 */
export async function stitchTwoVoiceFilesToMasterWavUrl(
  firstFile: File,
  secondFile: File,
  secondStartAtSeconds: number,
  totalDurationSeconds: number
): Promise<{ wavUrl: string; firstDuration: number; secondDuration: number }> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const [b1, b2] = await Promise.all([
      firstFile.arrayBuffer().then((ab) => ctx.decodeAudioData(ab)),
      secondFile.arrayBuffer().then((ab) => ctx.decodeAudioData(ab))
    ]);

    const wavUrl = assembleClipsIntoMasterWavUrl(
      [
        { audioBuffer: b1, durationSeconds: b1.duration },
        { audioBuffer: b2, durationSeconds: b2.duration }
      ],
      [0, Math.max(0, secondStartAtSeconds)],
      Math.max(totalDurationSeconds, Math.max(0, secondStartAtSeconds) + b2.duration + 0.3)
    );

    return {
      wavUrl,
      firstDuration: b1.duration,
      secondDuration: b2.duration
    };
  } finally {
    ctx.close().catch(() => {});
  }
}

function encodeFloat32ToWavBlobUrl(samples: Float32Array, sampleRate: number): string {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped * 32767, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

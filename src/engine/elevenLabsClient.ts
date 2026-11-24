/**
 * Responsabilidad Única: Conectar con la API oficial de ElevenLabs Text-to-Speech
 * (`https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`), decodificar cada clip de voz
 * y ensamblar una pista maestra WAV de 44.1 kHz lista para reproducir y exportar a MP4.
 */

export const DEFAULT_ELEVENLABS_VOICE_ID = 'UK00oAtGYBrHBUbesfMv';

const STORAGE_API_KEY = 'infinite_editor.elevenlabs.api_key';
const STORAGE_VOICE_ID = 'infinite_editor.elevenlabs.voice_id';
const STORAGE_MODEL_ID = 'infinite_editor.elevenlabs.model_id';

export type ElevenLabsModelId =
  | 'eleven_multilingual_v2'
  | 'eleven_flash_v2_5'
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
  return {
    apiKey: localStorage.getItem(STORAGE_API_KEY) || envKey || '',
    voiceId: localStorage.getItem(STORAGE_VOICE_ID) || DEFAULT_ELEVENLABS_VOICE_ID,
    modelId:
      (localStorage.getItem(STORAGE_MODEL_ID) as ElevenLabsModelId) ||
      'eleven_multilingual_v2'
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
    throw new Error('Ingresá tu API Key de ElevenLabs (xi-api-key) para generar la narración.');
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
    try {
      const errJson = await response.json();
      detail = errJson?.detail?.message || errJson?.message || '';
    } catch {
      // Ignorar si no es JSON
    }

    if (response.status === 401) {
      throw new Error(
        `API Key de ElevenLabs inválida o sin permiso de Text-to-Speech. ${detail}`.trim()
      );
    }
    if (response.status === 404 || response.status === 400) {
      throw new Error(
        `ElevenLabs no pudo usar el Voice ID "${cleanVoice}". Si es una voz pública de la librería, entrá a ElevenLabs → Voices, buscala y tocá "Add to My Voices". (${detail || response.status})`
      );
    }
    if (response.status === 429) {
      throw new Error(
        `Límite de peticiones o cuota de caracteres alcanzado en ElevenLabs. ${detail}`.trim()
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

/**
 * Une múltiples clips de voz decodificados en sus instantes exactos (`startOffsets`)
 * dentro de un archivo WAV PCM 16-bit de 44.1 kHz listo para reproducir y muxear en MP4.
 */
export function assembleClipsIntoMasterWavUrl(
  clips: SynthesizedClip[],
  startOffsets: number[],
  totalDurationSeconds: number
): string {
  const sampleRate = 44100;
  let maxRequiredSeconds = totalDurationSeconds;
  for (let i = 0; i < clips.length; i++) {
    const end = (startOffsets[i] ?? 0) + clips[i].durationSeconds + 0.2;
    if (end > maxRequiredSeconds) maxRequiredSeconds = end;
  }

  const totalSamples = Math.max(sampleRate, Math.ceil(maxRequiredSeconds * sampleRate));
  const mixedPcm = new Float32Array(totalSamples);

  for (let i = 0; i < clips.length; i++) {
    const buf = clips[i].audioBuffer;
    const offsetSec = Math.max(0, startOffsets[i] ?? 0);
    const startSample = Math.floor(offsetSec * sampleRate);

    // Mezclar canal 0 (y canal 1 si es estéreo) remuestreando linealmente si difiere de 44100 Hz
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    const ratio = buf.sampleRate / sampleRate;
    const outLen = Math.floor(buf.length / ratio);

    for (let s = 0; s < outLen; s++) {
      const targetIdx = startSample + s;
      if (targetIdx >= totalSamples) break;
      const srcPos = s * ratio;
      const srcIdx = Math.min(buf.length - 1, Math.floor(srcPos));
      const sampleVal = ch1 ? (ch0[srcIdx] + ch1[srcIdx]) * 0.5 : ch0[srcIdx];
      mixedPcm[targetIdx] = Math.max(-1, Math.min(1, mixedPcm[targetIdx] + sampleVal));
    }
  }

  return encodeFloat32ToWavBlobUrl(mixedPcm, sampleRate);
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
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono nítido para voz
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

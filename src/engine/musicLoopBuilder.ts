/**
 * Responsabilidad Única: Decodificar cualquier canción instrumental (WAV, MP3, M4A, OGG, FLAC,
 * AAC, WEBM, OPUS) y construir una pista maestra estéreo en bucle inteligente que cubra la
 * duración exacta del video: recorta silencios muertos al inicio/fin, empalma repeticiones con
 * crossfade de potencia constante (sin saltos ni bajones de volumen) y aplica fade-in / fade-out.
 */

export interface SmartMusicLoopOptions {
  /** Duración objetivo del video en segundos (ej. 600 para 10 min) */
  targetDurationSeconds: number;
  /** Crossfade suave en cada empalme fin → inicio (segundos) */
  crossfadeSeconds?: number;
  /** Fade-in al arrancar el video (segundos) */
  fadeInSeconds?: number;
  /** Fade-out al cerrar el video (segundos) */
  fadeOutSeconds?: number;
  /** Recortar automáticamente silencios muertos al inicio y final de la canción */
  trimSilence?: boolean;
  /** Frecuencia de muestreo de salida (por defecto 44100 Hz estéreo) */
  outputSampleRate?: number;
}

export interface SeamlessLoopPcmResult {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  sourceDuration: number;
  trimmedDuration: number;
  trimmedSilenceSeconds: number;
  loopCount: number;
  appliedCrossfade: number;
  firstSeamAtSeconds: number | null;
  targetDuration: number;
}

export interface SmartLoopedMusicOutput extends Omit<SeamlessLoopPcmResult, 'left' | 'right'> {
  wavBlobUrl: string;
}

const SILENCE_RMS_THRESHOLD = 0.008; // ≈ -42 dBFS
const SILENCE_WINDOW_SEC = 0.02; // Ventanas de 20 ms
const TRIM_CUSHION_SEC = 0.08; // Colchón natural de 80 ms para no cortar ataques ni colas suaves
const MIN_USABLE_CLIP_SEC = 2.0;

/**
 * Núcleo DSP puro (sin dependencias de navegador) que construye el bucle estéreo continuo.
 */
export function buildSeamlessLoopedPcm(
  rawLeft: Float32Array,
  rawRight: Float32Array,
  sourceSampleRate: number,
  options: SmartMusicLoopOptions
): SeamlessLoopPcmResult {
  const sampleRate = options.outputSampleRate ?? 44100;
  const targetDuration = Math.max(1, options.targetDurationSeconds);
  const trimSilence = options.trimSilence !== false;

  // 1. Remuestrear linealmente a 44.1 kHz si la canción original viene en otra tasa (ej. 48 kHz)
  const srcLeft = resampleChannel(rawLeft, sourceSampleRate, sampleRate);
  const srcRight = resampleChannel(rawRight, sourceSampleRate, sampleRate);
  const sourceSamples = Math.min(srcLeft.length, srcRight.length);
  const sourceDuration = sourceSamples / sampleRate;

  if (sourceSamples < 16) {
    throw new Error('El archivo de audio está vacío o es demasiado corto para procesarlo.');
  }

  // 2. Detectar y recortar silencios muertos al principio y al final (muy común en canciones IA)
  const { startSample, endSample } = trimSilence
    ? detectActiveAudioBounds(srcLeft, srcRight, sampleRate)
    : { startSample: 0, endSample: sourceSamples };

  const clipLen = Math.max(16, endSample - startSample);
  const trimmedDuration = clipLen / sampleRate;
  const trimmedSilenceSeconds = Math.max(0, sourceDuration - trimmedDuration);

  const totalOutSamples = Math.ceil(targetDuration * sampleRate);
  const outLeft = new Float32Array(totalOutSamples);
  const outRight = new Float32Array(totalOutSamples);

  // 3. Calcular crossfade seguro (nunca supera 25% del clip útil)
  const requestedCrossfade = Math.max(0, options.crossfadeSeconds ?? 3.0);
  const needsLoop = clipLen < totalOutSamples;
  const maxSafeCrossfade = Math.max(0, Math.min(trimmedDuration * 0.25, 8));
  const appliedCrossfade = needsLoop ? Math.min(requestedCrossfade, maxSafeCrossfade) : 0;
  const xfSamples = Math.floor(appliedCrossfade * sampleRate);
  const stride = Math.max(1, clipLen - xfSamples);

  // 4. Ensamblar ciclos con crossfade de potencia constante (cos² + sin² = 1)
  let loopCount = 0;
  let offset = 0;
  while (offset < totalOutSamples) {
    const isFirstCycle = loopCount === 0;
    const isLastCycle = offset + stride >= totalOutSamples;

    for (let i = 0; i < clipLen; i++) {
      const dest = offset + i;
      if (dest >= totalOutSamples) break;

      let gain = 1;
      if (!isFirstCycle && xfSamples > 0 && i < xfSamples) {
        // Entrada suave en potencia constante
        const p = i / xfSamples;
        gain *= Math.sin(p * Math.PI * 0.5);
      }
      if (!isLastCycle && xfSamples > 0 && i >= clipLen - xfSamples) {
        // Salida suave en potencia constante que se solapa con la entrada del ciclo siguiente
        const p = (i - (clipLen - xfSamples)) / xfSamples;
        gain *= Math.cos(p * Math.PI * 0.5);
      }

      const srcIdx = startSample + i;
      outLeft[dest] += srcLeft[srcIdx] * gain;
      outRight[dest] += srcRight[srcIdx] * gain;
    }

    loopCount++;
    offset += stride;
  }

  // 5. Aplicar Fade-In suave al segundo 0 y Fade-Out suave al final exacto del video
  const fadeInSec = Math.min(Math.max(0, options.fadeInSeconds ?? 1.5), targetDuration * 0.25);
  const fadeOutSec = Math.min(Math.max(0, options.fadeOutSeconds ?? 3.5), targetDuration * 0.35);
  const fadeInSamples = Math.floor(fadeInSec * sampleRate);
  const fadeOutSamples = Math.floor(fadeOutSec * sampleRate);

  for (let i = 0; i < fadeInSamples && i < totalOutSamples; i++) {
    const p = i / fadeInSamples;
    const env = 0.5 - 0.5 * Math.cos(Math.PI * p); // Curva S suave
    outLeft[i] *= env;
    outRight[i] *= env;
  }

  for (let i = 0; i < fadeOutSamples && i < totalOutSamples; i++) {
    const dest = totalOutSamples - 1 - i;
    const p = i / fadeOutSamples;
    const env = 0.5 - 0.5 * Math.cos(Math.PI * p);
    outLeft[dest] *= env;
    outRight[dest] *= env;
  }

  // 6. Limitador suave de seguridad para evitar clipping en empalmes densos
  applySoftPeakLimiter(outLeft, outRight);

  const firstSeamAtSeconds =
    loopCount > 1 ? Number((stride / sampleRate).toFixed(2)) : null;

  return {
    left: outLeft,
    right: outRight,
    sampleRate,
    sourceDuration: Number(sourceDuration.toFixed(2)),
    trimmedDuration: Number(trimmedDuration.toFixed(2)),
    trimmedSilenceSeconds: Number(trimmedSilenceSeconds.toFixed(2)),
    loopCount,
    appliedCrossfade: Number(appliedCrossfade.toFixed(2)),
    firstSeamAtSeconds,
    targetDuration
  };
}

/**
 * Decodifica un archivo local (MP3, WAV, M4A, OGG, FLAC, AAC, WEBM, OPUS) y genera
 * su Blob URL WAV estéreo en bucle inteligente listo para reproducir y exportar.
 */
export async function buildSmartLoopedMusicFromFile(
  file: File,
  options: SmartMusicLoopOptions
): Promise<SmartLoopedMusicOutput> {
  const arrayBuffer = await file.arrayBuffer();
  return buildSmartLoopedMusicFromArrayBuffer(arrayBuffer, options);
}

/**
 * Decodifica un audio remoto desde URL y construye su bucle inteligente.
 */
export async function buildSmartLoopedMusicFromUrl(
  url: string,
  options: SmartMusicLoopOptions
): Promise<SmartLoopedMusicOutput> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo descargar el audio (${response.status}).`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return buildSmartLoopedMusicFromArrayBuffer(arrayBuffer, options);
}

/**
 * Decodifica un `ArrayBuffer` de cualquier formato de audio soportado por el navegador
 * y produce la pista maestra estéreo WAV lista para el timeline completo.
 */
export async function buildSmartLoopedMusicFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  options: SmartMusicLoopOptions
): Promise<SmartLoopedMusicOutput> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();

  try {
    // Clonar el buffer porque decodeAudioData desvincula (detaches) el ArrayBuffer original
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const left = decoded.getChannelData(0);
    const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : left;

    const pcm = buildSeamlessLoopedPcm(left, right, decoded.sampleRate, options);
    const wavBlobUrl = encodeStereoPcmToWavBlobUrl(pcm.left, pcm.right, pcm.sampleRate);

    return {
      wavBlobUrl,
      sampleRate: pcm.sampleRate,
      sourceDuration: pcm.sourceDuration,
      trimmedDuration: pcm.trimmedDuration,
      trimmedSilenceSeconds: pcm.trimmedSilenceSeconds,
      loopCount: pcm.loopCount,
      appliedCrossfade: pcm.appliedCrossfade,
      firstSeamAtSeconds: pcm.firstSeamAtSeconds,
      targetDuration: pcm.targetDuration
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : '';
    throw new Error(
      `No se pudo decodificar este archivo de audio. Probá con WAV, MP3, M4A, OGG, FLAC o WEBM. ${detail}`.trim()
    );
  } finally {
    ctx.close().catch(() => {});
  }
}

export function encodeStereoPcmToWavBlobUrl(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): string {
  const numFrames = Math.min(left.length, right.length);
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataByteLength = numFrames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function detectActiveAudioBounds(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): { startSample: number; endSample: number } {
  const total = Math.min(left.length, right.length);
  const winSize = Math.max(64, Math.floor(SILENCE_WINDOW_SEC * sampleRate));
  const cushion = Math.floor(TRIM_CUSHION_SEC * sampleRate);

  let firstActive = 0;
  let foundStart = false;
  for (let pos = 0; pos < total; pos += winSize) {
    const end = Math.min(total, pos + winSize);
    if (windowRms(left, right, pos, end) >= SILENCE_RMS_THRESHOLD) {
      firstActive = Math.max(0, pos - cushion);
      foundStart = true;
      break;
    }
  }

  let lastActive = total;
  let foundEnd = false;
  for (let pos = total; pos > 0; pos -= winSize) {
    const start = Math.max(0, pos - winSize);
    if (windowRms(left, right, start, pos) >= SILENCE_RMS_THRESHOLD) {
      lastActive = Math.min(total, pos + cushion);
      foundEnd = true;
      break;
    }
  }

  if (!foundStart || !foundEnd || (lastActive - firstActive) / sampleRate < MIN_USABLE_CLIP_SEC) {
    return { startSample: 0, endSample: total };
  }

  return { startSample: firstActive, endSample: lastActive };
}

function windowRms(
  left: Float32Array,
  right: Float32Array,
  start: number,
  end: number
): number {
  let sumSq = 0;
  const count = Math.max(1, end - start);
  for (let i = start; i < end; i++) {
    const m = 0.5 * (left[i] + right[i]);
    sumSq += m * m;
  }
  return Math.sqrt(sumSq / count);
}

function resampleChannel(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[idx] ?? 0;
    const s1 = input[Math.min(input.length - 1, idx + 1)] ?? s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

function applySoftPeakLimiter(left: Float32Array, right: Float32Array): void {
  let peak = 0;
  for (let i = 0; i < left.length; i++) {
    const al = Math.abs(left[i]);
    const ar = Math.abs(right[i]);
    if (al > peak) peak = al;
    if (ar > peak) peak = ar;
  }
  if (peak <= 0.98) return;
  const scale = 0.96 / peak;
  for (let i = 0; i < left.length; i++) {
    left[i] *= scale;
    right[i] *= scale;
  }
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Responsabilidad Única: Analizar la forma de onda PCM real de un clip de voz,
 * recortar silencios muertos al inicio/final con micro-fades limpios sin clicks,
 * calcular la duración hablada exacta y garantizar matemáticamente que ningún
 * clip de narración se solape jamás con el siguiente.
 */

export interface AnalyzedSpeechPcm {
  pcm: Float32Array;
  sampleRate: number;
  spokenDurationSeconds: number;
  originalDurationSeconds: number;
  trimmedLeadingSeconds: number;
  trimmedTrailingSeconds: number;
}

export interface NonOverlappingScheduleResult {
  startOffsets: number[];
  endOffsets: number[];
  pushedCount: number;
  overlapCount: number;
  minGapSeconds: number;
}

export interface OverlapVerificationResult {
  valid: boolean;
  overlapCount: number;
  minGapSeconds: number;
}

/**
 * Convierte un `AudioBuffer` (mono o estéreo) a mono Float32Array.
 */
export function extractMonoPcm(audioBuffer: AudioBuffer): Float32Array {
  const len = audioBuffer.length;
  const ch0 = audioBuffer.getChannelData(0);
  if (audioBuffer.numberOfChannels <= 1) {
    return new Float32Array(ch0);
  }
  const ch1 = audioBuffer.getChannelData(1);
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    mono[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return mono;
}

/**
 * Analiza un clip de voz PCM mono, detecta los límites reales de la voz usando
 * energía RMS + pico en ventanas de 10 ms y recorta únicamente el silencio digital
 * muerto (preservando pre-roll de 30 ms para consonantes iniciales y cola de 70 ms
 * para respiraciones naturales, con micro-fades suaves para cero clicks).
 */
export function analyzeAndTrimMonoPcm(
  mono: Float32Array,
  sampleRate: number
): AnalyzedSpeechPcm {
  const totalSamples = mono.length;
  const originalDurationSeconds = totalSamples / Math.max(1, sampleRate);

  if (totalSamples < Math.floor(sampleRate * 0.15)) {
    return {
      pcm: mono,
      sampleRate,
      spokenDurationSeconds: originalDurationSeconds,
      originalDurationSeconds,
      trimmedLeadingSeconds: 0,
      trimmedTrailingSeconds: 0
    };
  }

  const windowSize = Math.max(64, Math.floor(sampleRate * 0.01)); // Ventanas de 10 ms
  const startPeakThreshold = 0.008; // ~ -42 dB
  const startRmsThreshold = 0.0045; // ~ -47 dB
  const endPeakThreshold = 0.006; // ~ -44 dB
  const endRmsThreshold = 0.0035; // ~ -49 dB

  let firstActiveSample = -1;
  let lastActiveSample = -1;

  for (let pos = 0; pos < totalSamples; pos += windowSize) {
    const end = Math.min(totalSamples, pos + windowSize);
    let peak = 0;
    let sumSq = 0;
    for (let i = pos; i < end; i++) {
      const v = Math.abs(mono[i]);
      if (v > peak) peak = v;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - pos));

    if (firstActiveSample === -1 && (peak >= startPeakThreshold || rms >= startRmsThreshold)) {
      firstActiveSample = pos;
    }
    if (peak >= endPeakThreshold || rms >= endRmsThreshold) {
      lastActiveSample = end;
    }
  }

  // Fallback seguro si el clip fuera extremadamente bajo o mudo
  if (firstActiveSample === -1 || lastActiveSample <= firstActiveSample) {
    return {
      pcm: mono,
      sampleRate,
      spokenDurationSeconds: originalDurationSeconds,
      originalDurationSeconds,
      trimmedLeadingSeconds: 0,
      trimmedTrailingSeconds: 0
    };
  }

  const preRollSamples = Math.floor(sampleRate * 0.03); // 30 ms antes de la primera sílaba
  const postRollSamples = Math.floor(sampleRate * 0.07); // 70 ms después de la última sílaba

  const trimStart = Math.max(0, firstActiveSample - preRollSamples);
  const trimEnd = Math.min(totalSamples, lastActiveSample + postRollSamples);

  if (trimEnd - trimStart < Math.floor(sampleRate * 0.15)) {
    return {
      pcm: mono,
      sampleRate,
      spokenDurationSeconds: originalDurationSeconds,
      originalDurationSeconds,
      trimmedLeadingSeconds: 0,
      trimmedTrailingSeconds: 0
    };
  }

  const trimmed = mono.slice(trimStart, trimEnd);
  applyEdgeMicroFades(trimmed, sampleRate, 0.01, 0.022);

  return {
    pcm: trimmed,
    sampleRate,
    spokenDurationSeconds: trimmed.length / sampleRate,
    originalDurationSeconds,
    trimmedLeadingSeconds: trimStart / sampleRate,
    trimmedTrailingSeconds: (totalSamples - trimEnd) / sampleRate
  };
}

/**
 * Wrapper directo para `AudioBuffer` decodificado por Web Audio API.
 */
export function analyzeAndTrimSpeechBuffer(audioBuffer: AudioBuffer): AnalyzedSpeechPcm {
  return analyzeAndTrimMonoPcm(extractMonoPcm(audioBuffer), audioBuffer.sampleRate);
}

/**
 * Aplica micro-fade-in y micro-fade-out con curva coseno suave en los bordes del clip
 * para evitar saltos DC / clicks al insertar en la pista maestra WAV.
 */
export function applyEdgeMicroFades(
  pcm: Float32Array,
  sampleRate: number,
  fadeInSeconds: number,
  fadeOutSeconds: number
): void {
  const fadeInSamples = Math.min(
    Math.floor(pcm.length * 0.25),
    Math.max(1, Math.floor(sampleRate * fadeInSeconds))
  );
  const fadeOutSamples = Math.min(
    Math.floor(pcm.length * 0.25),
    Math.max(1, Math.floor(sampleRate * fadeOutSeconds))
  );

  for (let i = 0; i < fadeInSamples; i++) {
    const t = i / fadeInSamples;
    const gain = 0.5 - 0.5 * Math.cos(Math.PI * t);
    pcm[i] *= gain;
  }

  const outStart = pcm.length - fadeOutSamples;
  for (let i = 0; i < fadeOutSamples; i++) {
    const t = i / fadeOutSamples;
    const gain = 0.5 + 0.5 * Math.cos(Math.PI * t);
    pcm[outStart + i] *= gain;
  }
}

/**
 * Calcula una agenda de inicio/fin 100% libre de solapamientos:
 * ningún clip `i` puede arrancar jamás antes de `fin(clip[i-1]) + minGapSeconds`.
 */
export function computeNonOverlappingSchedule(
  requestedStarts: number[],
  durations: number[],
  minGapSeconds = 0.35
): NonOverlappingScheduleResult {
  const safeMinGap = Math.max(0.05, minGapSeconds);
  const startOffsets: number[] = [];
  const endOffsets: number[] = [];
  let pushedCount = 0;
  let prevEnd = 0;
  let observedMinGap = Number.POSITIVE_INFINITY;

  for (let i = 0; i < durations.length; i++) {
    const dur = Math.max(0.05, durations[i] ?? 0);
    const requested = Math.max(0, requestedStarts[i] ?? 0);
    const minAllowedStart = i === 0 ? 0 : prevEnd + safeMinGap;
    const actualStart = requested < minAllowedStart ? minAllowedStart : requested;

    if (actualStart > requested + 0.005) {
      pushedCount++;
    }

    if (i > 0) {
      observedMinGap = Math.min(observedMinGap, actualStart - prevEnd);
    }

    const actualEnd = actualStart + dur;
    startOffsets.push(actualStart);
    endOffsets.push(actualEnd);
    prevEnd = actualEnd;
  }

  const verification = verifyZeroOverlapPlacements(startOffsets, durations);

  return {
    startOffsets,
    endOffsets,
    pushedCount,
    overlapCount: verification.overlapCount,
    minGapSeconds:
      durations.length > 1 && Number.isFinite(observedMinGap) ? observedMinGap : safeMinGap
  };
}

/**
 * Audita explícitamente que ningún par consecutivo de clips se superponga en el tiempo.
 */
export function verifyZeroOverlapPlacements(
  starts: number[],
  durations: number[]
): OverlapVerificationResult {
  let overlapCount = 0;
  let minGap = Number.POSITIVE_INFINITY;

  for (let i = 1; i < starts.length; i++) {
    const prevEnd = starts[i - 1] + Math.max(0, durations[i - 1] ?? 0);
    const gap = starts[i] - prevEnd;
    if (gap < -0.0005) {
      overlapCount++;
    }
    if (gap < minGap) {
      minGap = gap;
    }
  }

  return {
    valid: overlapCount === 0,
    overlapCount,
    minGapSeconds: Number.isFinite(minGap) ? minGap : 0
  };
}

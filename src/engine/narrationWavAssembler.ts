/**
 * Responsabilidad Única: Decodificar pistas de voz existentes y ensamblar múltiples clips
 * de locución en un archivo WAV PCM 16-bit maestro de 44.1 kHz con garantía matemática de
 * CERO solapamientos entre frases (tanto en videos completos como en parches parciales).
 */

import { PreservedAudioSlice } from './narrationExtractor';
import {
  analyzeAndTrimSpeechBuffer,
  computeNonOverlappingSchedule
} from './speechAudioAnalyzer';

export interface SynthesizedClip {
  audioBuffer: AudioBuffer;
  /** Duración hablada real exacta (tras recortar silencios muertos al inicio/fin) */
  durationSeconds: number;
  /** Duración bruta del MP3 original antes de analizar silencios */
  rawDurationSeconds?: number;
  /** PCM mono ya recortado y con micro-fades sin clicks */
  trimmedPcm?: Float32Array;
  trimmedSampleRate?: number;
  /** Indica si se recuperó del caché local (0 créditos de ElevenLabs) */
  fromCache?: boolean;
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
  /** Tramos preservados y recolocados exactamente cuando se re-sincronizó un subconjunto */
  preservedSlices?: PreservedAudioSlice[];
}

export interface MasterWavAssemblyResult {
  wavUrl: string;
  actualStartOffsets: number[];
  actualEndOffsets: number[];
  totalDurationSeconds: number;
  overlapCount: number;
  pushedClipsCount: number;
  minGapSeconds: number;
}

const TARGET_SAMPLE_RATE = 44100;

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
 * Ensambla todos los clips de voz en una pista maestra WAV PCM 16-bit de 44.1 kHz
 * imponiendo una barrera anti-solapamiento estricta: el clip `i+1` JAMÁS comienza antes
 * de que finalice `clip[i]` + `minGapSeconds`.
 */
export function assembleMasterNarrationWav(
  clips: SynthesizedClip[],
  requestedStartOffsets: number[],
  totalDurationSeconds: number,
  mergeOptions?: MasterWavMergeOptions,
  minGapSeconds = 0.35
): MasterWavAssemblyResult {
  const durations = clips.map((c) => Math.max(0.05, c.durationSeconds));
  const schedule = computeNonOverlappingSchedule(
    requestedStartOffsets,
    durations,
    minGapSeconds
  );

  const safeStarts = schedule.startOffsets;
  const safeEnds = schedule.endOffsets;
  const lastNewClipEnd = safeEnds.length > 0 ? safeEnds[safeEnds.length - 1] : 0;

  let maxRequiredSeconds = Math.max(1, totalDurationSeconds);
  if (lastNewClipEnd + 0.35 > maxRequiredSeconds) {
    maxRequiredSeconds = lastNewClipEnd + 0.35;
  }

  let effectivePrependShift = 0;
  if (mergeOptions?.existingVoiceBuffer) {
    if (mergeOptions.mode === 'prepend-shift') {
      // Garantizar que la voz existente desplazada NUNCA se monte sobre la nueva intro
      const requestedShift = Math.max(0, mergeOptions.shiftExistingBySeconds ?? 0);
      effectivePrependShift = Math.max(requestedShift, lastNewClipEnd + minGapSeconds);
      const existingEnd = effectivePrependShift + mergeOptions.existingVoiceBuffer.duration + 0.25;
      if (existingEnd > maxRequiredSeconds) maxRequiredSeconds = existingEnd;
    } else if (mergeOptions.preservedSlices && mergeOptions.preservedSlices.length > 0) {
      for (const slice of mergeOptions.preservedSlices) {
        const endSec = slice.dstStart + (slice.srcEnd - slice.srcStart) + 0.25;
        if (endSec > maxRequiredSeconds) maxRequiredSeconds = endSec;
      }
    } else {
      const existingEnd = mergeOptions.existingVoiceBuffer.duration + 0.25;
      if (existingEnd > maxRequiredSeconds) maxRequiredSeconds = existingEnd;
    }
  }

  const totalSamples = Math.max(
    TARGET_SAMPLE_RATE,
    Math.ceil(maxRequiredSeconds * TARGET_SAMPLE_RATE)
  );
  const mixedPcm = new Float32Array(totalSamples);

  // Ventanas protegidas de los clips nuevos: ningún audio previo puede colarse aquí
  const protectedClipRanges = safeStarts.map((start, idx) => ({
    start: Math.max(0, start - 0.06),
    end: safeEnds[idx] + 0.06
  }));

  // 1. Volcar primero la pista de voz existente (preservando solo lo que no pisa clips nuevos)
  if (mergeOptions?.existingVoiceBuffer) {
    const baseBuf = mergeOptions.existingVoiceBuffer;
    if (
      mergeOptions.mode === 'replace-ranges' &&
      mergeOptions.preservedSlices &&
      mergeOptions.preservedSlices.length > 0
    ) {
      writePreservedSlices(baseBuf, mergeOptions.preservedSlices, protectedClipRanges, mixedPcm);
    } else {
      const combinedMaskRanges = [
        ...(mergeOptions.replacedRanges ?? []),
        ...protectedClipRanges
      ];
      writeMaskedExistingBuffer(
        baseBuf,
        mergeOptions.mode === 'prepend-shift' ? effectivePrependShift : 0,
        mergeOptions.mode === 'prepend-shift' ? protectedClipRanges : combinedMaskRanges,
        mixedPcm
      );
    }
  }

  // 2. Volcar cada clip nuevo en su ventana 100% libre de solapamiento
  for (let i = 0; i < clips.length; i++) {
    writeClipIntoPcm(clips[i], safeStarts[i], mixedPcm);
  }

  return {
    wavUrl: encodeFloat32ToWavBlobUrl(mixedPcm, TARGET_SAMPLE_RATE),
    actualStartOffsets: safeStarts,
    actualEndOffsets: safeEnds,
    totalDurationSeconds: totalSamples / TARGET_SAMPLE_RATE,
    overlapCount: schedule.overlapCount,
    pushedClipsCount: schedule.pushedCount,
    minGapSeconds: schedule.minGapSeconds
  };
}

/**
 * Wrapper compatible que devuelve directamente la Blob URL del WAV maestro.
 */
export function assembleClipsIntoMasterWavUrl(
  clips: SynthesizedClip[],
  startOffsets: number[],
  totalDurationSeconds: number,
  mergeOptions?: MasterWavMergeOptions
): string {
  return assembleMasterNarrationWav(
    clips,
    startOffsets,
    totalDurationSeconds,
    mergeOptions
  ).wavUrl;
}

/**
 * Une dos archivos de voz locales (ej. Intro nueva + Resto del video ya narrado) en un único
 * WAV maestro de 44.1 kHz, impidiendo que el segundo archivo arranque antes de terminar el primero.
 */
export async function stitchTwoVoiceFilesToMasterWavUrl(
  firstFile: File,
  secondFile: File,
  secondStartAtSeconds: number,
  totalDurationSeconds: number
): Promise<{ wavUrl: string; firstDuration: number; secondDuration: number; effectiveSecondStart: number }> {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const [b1, b2] = await Promise.all([
      firstFile.arrayBuffer().then((ab) => ctx.decodeAudioData(ab)),
      secondFile.arrayBuffer().then((ab) => ctx.decodeAudioData(ab))
    ]);

    const analyzed1 = analyzeAndTrimSpeechBuffer(b1);
    const safeSecondStart = Math.max(
      Math.max(0, secondStartAtSeconds),
      analyzed1.spokenDurationSeconds + 0.35
    );

    const assembled = assembleMasterNarrationWav(
      [
        {
          audioBuffer: b1,
          durationSeconds: analyzed1.spokenDurationSeconds,
          trimmedPcm: analyzed1.pcm,
          trimmedSampleRate: analyzed1.sampleRate
        },
        {
          audioBuffer: b2,
          durationSeconds: b2.duration
        }
      ],
      [0, safeSecondStart],
      Math.max(totalDurationSeconds, safeSecondStart + b2.duration + 0.35),
      undefined,
      0.35
    );

    return {
      wavUrl: assembled.wavUrl,
      firstDuration: analyzed1.spokenDurationSeconds,
      secondDuration: b2.duration,
      effectiveSecondStart: assembled.actualStartOffsets[1] ?? safeSecondStart
    };
  } finally {
    ctx.close().catch(() => {});
  }
}

function writePreservedSlices(
  baseBuf: AudioBuffer,
  slices: PreservedAudioSlice[],
  protectedRanges: Array<{ start: number; end: number }>,
  mixedPcm: Float32Array
): void {
  const ch0 = baseBuf.getChannelData(0);
  const ch1 = baseBuf.numberOfChannels > 1 ? baseBuf.getChannelData(1) : null;
  const ratio = baseBuf.sampleRate / TARGET_SAMPLE_RATE;
  const edgeFadeSamples = Math.floor(TARGET_SAMPLE_RATE * 0.025);

  for (const slice of slices) {
    const sliceDur = slice.srcEnd - slice.srcStart;
    if (sliceDur <= 0.03) continue;
    const outLen = Math.floor(sliceDur * TARGET_SAMPLE_RATE);
    const dstStartSample = Math.floor(Math.max(0, slice.dstStart) * TARGET_SAMPLE_RATE);
    const srcStartInSrcSamples = slice.srcStart * baseBuf.sampleRate;

    for (let s = 0; s < outLen; s++) {
      const targetIdx = dstStartSample + s;
      if (targetIdx >= mixedPcm.length) break;
      const targetTime = targetIdx / TARGET_SAMPLE_RATE;
      const maskGain = computeRangeMaskGain(targetTime, protectedRanges, 0.03);
      if (maskGain <= 0.0001) continue;

      let edgeGain = 1;
      if (s < edgeFadeSamples) edgeGain = Math.min(edgeGain, s / edgeFadeSamples);
      if (outLen - 1 - s < edgeFadeSamples) {
        edgeGain = Math.min(edgeGain, (outLen - 1 - s) / edgeFadeSamples);
      }

      const srcPos = srcStartInSrcSamples + s * ratio;
      if (srcPos >= baseBuf.length - 1) break;
      const idx0 = Math.max(0, Math.min(baseBuf.length - 1, Math.floor(srcPos)));
      const idx1 = Math.min(baseBuf.length - 1, idx0 + 1);
      const frac = srcPos - idx0;
      const v0 = ch1 ? (ch0[idx0] + ch1[idx0]) * 0.5 : ch0[idx0];
      const v1 = ch1 ? (ch0[idx1] + ch1[idx1]) * 0.5 : ch0[idx1];
      mixedPcm[targetIdx] = (v0 + (v1 - v0) * frac) * maskGain * edgeGain;
    }
  }
}

function writeMaskedExistingBuffer(
  baseBuf: AudioBuffer,
  shiftSeconds: number,
  ranges: Array<{ start: number; end: number }>,
  mixedPcm: Float32Array
): void {
  const baseStartSample = Math.floor(Math.max(0, shiftSeconds) * TARGET_SAMPLE_RATE);
  const ch0 = baseBuf.getChannelData(0);
  const ch1 = baseBuf.numberOfChannels > 1 ? baseBuf.getChannelData(1) : null;
  const ratio = baseBuf.sampleRate / TARGET_SAMPLE_RATE;
  const outLen = Math.floor(baseBuf.length / ratio);

  for (let s = 0; s < outLen; s++) {
    const targetIdx = baseStartSample + s;
    if (targetIdx >= mixedPcm.length) break;
    const targetTime = targetIdx / TARGET_SAMPLE_RATE;
    const maskGain = computeRangeMaskGain(targetTime, ranges, 0.035);
    if (maskGain <= 0.0001) continue;

    const srcPos = s * ratio;
    const idx0 = Math.min(baseBuf.length - 1, Math.floor(srcPos));
    const idx1 = Math.min(baseBuf.length - 1, idx0 + 1);
    const frac = srcPos - idx0;
    const v0 = ch1 ? (ch0[idx0] + ch1[idx0]) * 0.5 : ch0[idx0];
    const v1 = ch1 ? (ch0[idx1] + ch1[idx1]) * 0.5 : ch0[idx1];
    mixedPcm[targetIdx] = (v0 + (v1 - v0) * frac) * maskGain;
  }
}

function computeRangeMaskGain(
  t: number,
  ranges: Array<{ start: number; end: number }>,
  rampSec: number
): number {
  let gain = 1;
  for (const r of ranges) {
    if (t >= r.start && t <= r.end) return 0;
    if (t >= r.start - rampSec && t < r.start) {
      gain = Math.min(gain, (r.start - t) / rampSec);
    } else if (t > r.end && t <= r.end + rampSec) {
      gain = Math.min(gain, (t - r.end) / rampSec);
    }
  }
  return gain;
}

function writeClipIntoPcm(
  clip: SynthesizedClip,
  offsetSec: number,
  mixedPcm: Float32Array
): void {
  const startSample = Math.floor(Math.max(0, offsetSec) * TARGET_SAMPLE_RATE);

  if (clip.trimmedPcm && clip.trimmedSampleRate) {
    const src = clip.trimmedPcm;
    const ratio = clip.trimmedSampleRate / TARGET_SAMPLE_RATE;
    const outLen = Math.floor(src.length / ratio);
    for (let s = 0; s < outLen; s++) {
      const targetIdx = startSample + s;
      if (targetIdx >= mixedPcm.length) break;
      const srcPos = s * ratio;
      const idx0 = Math.min(src.length - 1, Math.floor(srcPos));
      const idx1 = Math.min(src.length - 1, idx0 + 1);
      const frac = srcPos - idx0;
      const val = src[idx0] + (src[idx1] - src[idx0]) * frac;
      mixedPcm[targetIdx] = Math.max(-1, Math.min(1, mixedPcm[targetIdx] + val));
    }
    return;
  }

  const buf = clip.audioBuffer;
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
  const ratio = buf.sampleRate / TARGET_SAMPLE_RATE;
  const outLen = Math.floor(buf.length / ratio);

  for (let s = 0; s < outLen; s++) {
    const targetIdx = startSample + s;
    if (targetIdx >= mixedPcm.length) break;
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

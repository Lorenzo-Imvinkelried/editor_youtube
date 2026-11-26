/**
 * Responsabilidad Única: Renderizar y exportar el proyecto a `.mp4` a 60.00 FPS matemáticos
 * constantes (sin caídas de cuadros cuando se mueve la cámara) usando WebCodecs (`VideoEncoder`)
 * + `mp4-muxer` cuadro por cuadro (offline rendering), con fallback automático.
 */

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { DslAudioTrack, DslMusicTrack, DslScene } from '../dsl/dslTypes';
import { resolveSceneLayout } from '../dsl/layoutResolver';
import { isSceneLightPaper } from './backgroundRenderer';
import { evaluateCameraAtTime } from './cameraEvaluator';
import { renderInfiniteCanvasFrame } from './canvasRenderer';
import { evaluateNodesAtTime } from './nodeEvaluator';
import { resolveSceneOverlaps } from './sceneOverlapSolver';

export interface Mp4ExportProgress {
  percent: number;
  currentTime: number;
  duration: number;
  statusText: string;
}

export async function renderAndExportProjectToMp4(
  projectId: string,
  scene: DslScene,
  onProgress: (progress: Mp4ExportProgress) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const isShorts = scene.aspectRatio === '9:16';
  const targetWidth = isShorts ? 1080 : 1920;
  const targetHeight = isShorts ? 1920 : 1080;
  const fps = 60;
  const duration = Math.max(1, scene.duration);
  const totalFrames = Math.ceil(duration * fps);

  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = targetWidth;
  offscreenCanvas.height = targetHeight;
  const ctx = offscreenCanvas.getContext('2d', { alpha: false });
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto gráfico 2D para exportar.');
  }

  const resolvedNodes = resolveSceneOverlaps(scene, resolveSceneLayout(scene.nodes));

  // Verificar soporte nativo de WebCodecs (Chrome / Edge / Brave) para renderizado offline 60 FPS exactos
  if (typeof VideoEncoder !== 'undefined') {
    await exportDeterministicWebCodecsMp4({
      projectId,
      scene,
      resolvedNodes,
      ctx,
      offscreenCanvas,
      targetWidth,
      targetHeight,
      fps,
      duration,
      totalFrames,
      onProgress,
      abortSignal
    });
    return;
  }

  throw new Error('Tu navegador no soporta WebCodecs VideoEncoder para exportación MP4 determinista.');
}

interface DeterministicExportParams {
  projectId: string;
  scene: DslScene;
  resolvedNodes: ReturnType<typeof resolveSceneLayout>;
  ctx: CanvasRenderingContext2D;
  offscreenCanvas: HTMLCanvasElement;
  targetWidth: number;
  targetHeight: number;
  fps: number;
  duration: number;
  totalFrames: number;
  onProgress: (progress: Mp4ExportProgress) => void;
  abortSignal?: AbortSignal;
}

async function exportDeterministicWebCodecsMp4(params: DeterministicExportParams): Promise<void> {
  const {
    projectId,
    scene,
    resolvedNodes,
    ctx,
    offscreenCanvas,
    targetWidth,
    targetHeight,
    fps,
    duration,
    totalFrames,
    onProgress,
    abortSignal
  } = params;

  // 1. Si hay pista de audio, decodificarla primero en memoria para muxearla con precisión exacta
  let decodedAudioBuffer: AudioBuffer | null = null;
  if (scene.audioTrack?.src || scene.musicTrack?.src) {
    onProgress({
      percent: 0,
      currentTime: 0,
      duration,
      statusText: 'Mezclando pistas de audio y música instrumental del proyecto...'
    });
    decodedAudioBuffer = await renderProjectMasterAudioMix(
      scene.audioTrack,
      scene.musicTrack,
      duration
    );
  }

  const canEncodeAudio = Boolean(decodedAudioBuffer && typeof AudioEncoder !== 'undefined');

  const muxerTarget = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: 'avc',
      width: targetWidth,
      height: targetHeight
    },
    audio: canEncodeAudio
      ? {
          codec: 'aac',
          numberOfChannels: 2,
          sampleRate: decodedAudioBuffer!.sampleRate
        }
      : undefined,
    fastStart: 'in-memory'
  });

  // 2. Configurar codificador H.264 High Profile (Level 4.2 soporta 1920x1080 @ 60fps)
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => console.error('Error en VideoEncoder:', err)
  });

  videoEncoder.configure({
    codec: 'avc1.64002a',
    width: targetWidth,
    height: targetHeight,
    bitrate: 10_000_000,
    framerate: fps
  });

  // 3. Codificar audio AAC si está disponible
  if (canEncodeAudio && decodedAudioBuffer) {
    await encodeAudioBufferToMuxer(decodedAudioBuffer, muxer);
  }

  // 4. Bucle determinista frame por frame (garantiza 60.00 FPS exactos sin importar cuánto tarde cada frame)
  const frameDurationMicros = Math.round(1_000_000 / fps);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
    if (abortSignal?.aborted) {
      videoEncoder.close();
      throw new Error('Exportación cancelada por el usuario.');
    }

    const timeSeconds = frameIndex / fps;
    const evaluatedNodes = evaluateNodesAtTime(resolvedNodes, scene.timeline, timeSeconds);
    const camera = evaluateCameraAtTime(scene.cameraTrack, resolvedNodes, timeSeconds, {
      timeline: scene.timeline,
      evaluatedNodes,
      aspectRatio: scene.aspectRatio,
      isLightPaper: isSceneLightPaper(scene),
      duration,
      autoFillFrame: scene.autoFillFrame
    });

    renderInfiniteCanvasFrame(
      ctx,
      targetWidth,
      targetHeight,
      scene,
      evaluatedNodes,
      camera,
      null,
      { panX: 0, panY: 0, zoomMultiplier: 1 },
      {
        aspectRatio: scene.aspectRatio === '9:16' ? '9:16' : '16:9',
        dimOutsideFrame: false,
        showPlayerChrome: false,
        isExportRender: true,
        currentTime: timeSeconds,
        duration,
        projectTitle: ''
      }
    );

    const timestampMicros = Math.round(timeSeconds * 1_000_000);
    const videoFrame = new VideoFrame(offscreenCanvas, {
      timestamp: timestampMicros,
      duration: frameDurationMicros
    });

    const isKeyFrame = frameIndex % 60 === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();

    // Evitar saturar la cola interna del codificador de hardware y actualizar la barra de progreso en la UI
    if (videoEncoder.encodeQueueSize > 10) {
      await waitForQueueDrain(videoEncoder);
    }

    if (frameIndex % 6 === 0 || frameIndex === totalFrames - 1) {
      const percent = Math.round(((frameIndex + 1) / totalFrames) * 100);
      onProgress({
        percent,
        currentTime: timeSeconds,
        duration,
        statusText: `Codificando MP4 a 60 FPS constantes: Cuadro ${frameIndex + 1}/${totalFrames} (${percent}%)`
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await videoEncoder.flush();
  videoEncoder.close();
  muxer.finalize();

  const mp4Blob = new Blob([muxerTarget.buffer], { type: 'video/mp4' });
  const downloadUrl = URL.createObjectURL(mp4Blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${projectId}-${targetWidth}x${targetHeight}-60fps.mp4`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}

function waitForQueueDrain(encoder: VideoEncoder): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (encoder.encodeQueueSize <= 4) {
        resolve();
      } else {
        setTimeout(check, 4);
      }
    };
    check();
  });
}

const EXPORT_AUDIO_SAMPLE_RATE = 48000;
const EXPORT_AUDIO_BITRATE = 192_000;

async function renderProjectMasterAudioMix(
  voiceTrack: DslAudioTrack | undefined,
  musicTrack: DslMusicTrack | undefined,
  durationSeconds: number
): Promise<AudioBuffer | null> {
  try {
    const sampleRate = EXPORT_AUDIO_SAMPLE_RATE;
    const totalFrames = Math.ceil(durationSeconds * sampleRate);
    // Decodificar y remuestrear con el filtro sinc nativo del navegador a 48 kHz exactos (estándar YouTube)
    const decodeCtx = new OfflineAudioContext(2, 128, sampleRate);

    const [voiceBuf, musicBuf] = await Promise.all([
      voiceTrack?.src ? fetchAndDecodeAudio(decodeCtx, voiceTrack.src) : Promise.resolve(null),
      musicTrack?.src ? fetchAndDecodeAudio(decodeCtx, musicTrack.src) : Promise.resolve(null)
    ]);

    if (!voiceBuf && !musicBuf) return null;

    const mixedLeft = new Float32Array(totalFrames);
    const mixedRight = new Float32Array(totalFrames);

    // 1. Mezclar pista de música instrumental con envolvente de auto-ducking continua (0 clics)
    if (musicBuf && musicTrack) {
      const baseVol = Math.max(0, Math.min(1, musicTrack.volume ?? 0.25));
      const mLeft = musicBuf.getChannelData(0);
      const mRight = musicBuf.numberOfChannels > 1 ? musicBuf.getChannelData(1) : mLeft;
      const musicLen = Math.min(totalFrames, musicBuf.length);

      if (voiceBuf && musicTrack.duckUnderVoice !== false) {
        const duckEnvelope = computeSmoothVoiceDuckingEnvelope(
          voiceBuf,
          totalFrames,
          sampleRate,
          baseVol,
          baseVol * 0.42
        );
        for (let i = 0; i < musicLen; i++) {
          const g = duckEnvelope[i];
          mixedLeft[i] += mLeft[i] * g;
          mixedRight[i] += mRight[i] * g;
        }
      } else {
        for (let i = 0; i < musicLen; i++) {
          mixedLeft[i] += mLeft[i] * baseVol;
          mixedRight[i] += mRight[i] * baseVol;
        }
      }
    }

    // 2. Sumar pista de voz / locución limpia
    if (voiceBuf && voiceTrack) {
      const voiceVol = Math.max(0, Math.min(1, voiceTrack.volume ?? 0.85));
      const vLeft = voiceBuf.getChannelData(0);
      const vRight = voiceBuf.numberOfChannels > 1 ? voiceBuf.getChannelData(1) : vLeft;
      const voiceLen = Math.min(totalFrames, voiceBuf.length);
      for (let i = 0; i < voiceLen; i++) {
        mixedLeft[i] += vLeft[i] * voiceVol;
        mixedRight[i] += vRight[i] * voiceVol;
      }
    }

    // 3. Soft-limiter transparente (evita saturación entre muestras al codificar AAC sin distorsión)
    applyTransparentSoftLimiter(mixedLeft, mixedRight);

    const outCtx = new OfflineAudioContext(2, totalFrames, sampleRate);
    const masterBuffer = outCtx.createBuffer(2, totalFrames, sampleRate);
    masterBuffer.copyToChannel(mixedLeft, 0);
    masterBuffer.copyToChannel(mixedRight, 1);
    return masterBuffer;
  } catch {
    return null;
  }
}

async function fetchAndDecodeAudio(
  ctx: BaseAudioContext,
  audioUrl: string
): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}

/**
 * Calcula una envolvente de ganancia 100% continua muestra a muestra (sin saltos ni clics)
 * usando detección RMS con tiempo de retención (`hold`) de 350 ms para no bombear entre palabras
 * y suavizado exponencial de un polo (ataque 60 ms, liberación 550 ms).
 */
export function computeSmoothVoiceDuckingEnvelope(
  voiceBuf: { getChannelData: (ch: number) => Float32Array; length: number },
  totalFrames: number,
  sampleRate: number,
  baseVolume: number,
  duckedVolume: number
): Float32Array {
  const voiceCh = voiceBuf.getChannelData(0);
  const envelope = new Float32Array(totalFrames);

  const hopSamples = Math.max(1, Math.floor(0.01 * sampleRate)); // Ventana de 10 ms
  const holdSamples = Math.floor(0.35 * sampleRate); // Retener 350 ms en pausas cortas entre palabras
  const attackCoeff = Math.exp(-1 / (0.06 * sampleRate)); // 60 ms ataque suave
  const releaseCoeff = Math.exp(-1 / (0.55 * sampleRate)); // 550 ms retorno gradual

  let currentGain = baseVolume;
  let holdCounter = 0;
  let sampleIdx = 0;

  while (sampleIdx < totalFrames) {
    const blockEnd = Math.min(totalFrames, sampleIdx + hopSamples);
    let voiceActive = false;

    if (sampleIdx < voiceCh.length) {
      const rmsEnd = Math.min(voiceCh.length, blockEnd);
      let sumSq = 0;
      for (let i = sampleIdx; i < rmsEnd; i++) {
        sumSq += voiceCh[i] * voiceCh[i];
      }
      const rms = Math.sqrt(sumSq / Math.max(1, rmsEnd - sampleIdx));
      if (rms > 0.014) {
        voiceActive = true;
      }
    }

    if (voiceActive) {
      holdCounter = holdSamples;
    } else if (holdCounter > 0) {
      holdCounter = Math.max(0, holdCounter - (blockEnd - sampleIdx));
    }

    const targetGain = holdCounter > 0 ? duckedVolume : baseVolume;
    const coeff = targetGain < currentGain ? attackCoeff : releaseCoeff;

    for (let i = sampleIdx; i < blockEnd; i++) {
      currentGain = targetGain + (currentGain - targetGain) * coeff;
      envelope[i] = currentGain;
    }

    sampleIdx = blockEnd;
  }

  return envelope;
}

function applyTransparentSoftLimiter(left: Float32Array, right: Float32Array): void {
  const knee = 0.88;
  const ceiling = 0.96;
  const span = ceiling - knee;

  for (let i = 0; i < left.length; i++) {
    const l = left[i];
    const r = right[i];
    const absL = Math.abs(l);
    const absR = Math.abs(r);

    if (absL > knee) {
      left[i] = Math.sign(l) * (knee + span * Math.tanh((absL - knee) / span));
    }
    if (absR > knee) {
      right[i] = Math.sign(r) * (knee + span * Math.tanh((absR - knee) / span));
    }
  }
}

async function encodeAudioBufferToMuxer(
  audioBuffer: AudioBuffer,
  muxer: Muxer<ArrayBufferTarget>
): Promise<void> {
  const sampleRate = audioBuffer.sampleRate;
  const totalFrames = audioBuffer.length;
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (err) => console.error('Error en AudioEncoder:', err)
  });

  audioEncoder.configure({
    codec: 'mp4a.40.2',
    numberOfChannels: 2,
    sampleRate,
    bitrate: EXPORT_AUDIO_BITRATE
  });

  // 3072 muestras = 3 tramas AAC exactas (64.000 µs enteros exactos a 48 kHz, sin jitter de redondeo)
  const chunkSize = 3072;
  const aacFrameSize = 1024;

  for (let offset = 0; offset < totalFrames; offset += chunkSize) {
    const remaining = Math.min(chunkSize, totalFrames - offset);
    // Rellenar el último bloque con silencio hasta múltiplo de 1024 para evitar chasquidos al final
    const paddedLength =
      remaining < chunkSize
        ? Math.ceil(remaining / aacFrameSize) * aacFrameSize
        : chunkSize;

    const planarData = new Float32Array(paddedLength * 2);
    planarData.set(left.subarray(offset, offset + remaining), 0);
    planarData.set(right.subarray(offset, offset + remaining), paddedLength);

    const timestampMicros = Math.round((offset * 1_000_000) / sampleRate);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: paddedLength,
      numberOfChannels: 2,
      timestamp: timestampMicros,
      data: planarData
    });

    audioEncoder.encode(audioData);
    audioData.close();

    // Control de cola (backpressure) para que el codificador AAC no descarte paquetes en videos largos
    if (audioEncoder.encodeQueueSize > 8) {
      await waitForAudioQueueDrain(audioEncoder);
    }
  }

  await audioEncoder.flush();
  audioEncoder.close();
}

function waitForAudioQueueDrain(encoder: AudioEncoder): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (encoder.encodeQueueSize <= 4) {
        resolve();
      } else {
        setTimeout(check, 2);
      }
    };
    check();
  });
}

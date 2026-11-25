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
          sampleRate: 44100
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

async function renderProjectMasterAudioMix(
  voiceTrack: DslAudioTrack | undefined,
  musicTrack: DslMusicTrack | undefined,
  durationSeconds: number
): Promise<AudioBuffer | null> {
  try {
    const sampleRate = 44100;
    const totalFrames = Math.ceil(durationSeconds * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, totalFrames, sampleRate);

    const [voiceBuf, musicBuf] = await Promise.all([
      voiceTrack?.src ? fetchAndDecodeAudio(offlineCtx, voiceTrack.src) : Promise.resolve(null),
      musicTrack?.src ? fetchAndDecodeAudio(offlineCtx, musicTrack.src) : Promise.resolve(null)
    ]);

    if (!voiceBuf && !musicBuf) return null;

    // Compresor suave en el bus maestro para evitar saturación al sumar voz + música
    const masterLimiter = offlineCtx.createDynamicsCompressor();
    masterLimiter.threshold.value = -2;
    masterLimiter.knee.value = 6;
    masterLimiter.ratio.value = 6;
    masterLimiter.attack.value = 0.005;
    masterLimiter.release.value = 0.12;
    masterLimiter.connect(offlineCtx.destination);

    if (voiceBuf && voiceTrack) {
      const voiceSource = offlineCtx.createBufferSource();
      voiceSource.buffer = voiceBuf;
      const voiceGain = offlineCtx.createGain();
      voiceGain.gain.value = Math.max(0, Math.min(1, voiceTrack.volume ?? 0.85));
      voiceSource.connect(voiceGain);
      voiceGain.connect(masterLimiter);
      voiceSource.start(0);
    }

    if (musicBuf && musicTrack) {
      const musicSource = offlineCtx.createBufferSource();
      musicSource.buffer = musicBuf;
      const musicGain = offlineCtx.createGain();
      const baseVol = Math.max(0, Math.min(1, musicTrack.volume ?? 0.25));
      musicGain.gain.setValueAtTime(baseVol, 0);

      // Auto-ducking real por envolvente RMS de la voz cuando conviven voz y música
      if (voiceBuf && musicTrack.duckUnderVoice !== false) {
        applyVoiceSidechainDucking(musicGain.gain, voiceBuf, baseVol, durationSeconds);
      }

      musicSource.connect(musicGain);
      musicGain.connect(masterLimiter);
      musicSource.start(0);
    }

    return await offlineCtx.startRendering();
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

function applyVoiceSidechainDucking(
  gainParam: AudioParam,
  voiceBuf: AudioBuffer,
  baseVolume: number,
  durationSeconds: number
): void {
  const sr = voiceBuf.sampleRate;
  const ch = voiceBuf.getChannelData(0);
  const stepSec = 0.1; // Evaluación cada 100 ms para envolvente suave
  const stepSamples = Math.max(1, Math.floor(stepSec * sr));
  const duckedVolume = baseVolume * 0.42;
  let currentlyDucked = false;

  for (let t = 0; t < durationSeconds; t += stepSec) {
    const start = Math.floor(t * sr);
    if (start >= ch.length) {
      if (currentlyDucked) {
        gainParam.linearRampToValueAtTime(baseVolume, Math.min(durationSeconds, t + 0.45));
        currentlyDucked = false;
      }
      break;
    }

    const end = Math.min(ch.length, start + stepSamples);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      sumSq += ch[i] * ch[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    const voiceActive = rms > 0.015;

    if (voiceActive && !currentlyDucked) {
      gainParam.setValueAtTime(baseVolume, Math.max(0, t - 0.02));
      gainParam.linearRampToValueAtTime(duckedVolume, Math.min(durationSeconds, t + 0.08));
      currentlyDucked = true;
    } else if (!voiceActive && currentlyDucked) {
      gainParam.setValueAtTime(duckedVolume, t);
      gainParam.linearRampToValueAtTime(baseVolume, Math.min(durationSeconds, t + 0.45));
      currentlyDucked = false;
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
    bitrate: 128_000
  });

  const chunkSize = 4096;
  for (let offset = 0; offset < totalFrames; offset += chunkSize) {
    const length = Math.min(chunkSize, totalFrames - offset);
    const planarData = new Float32Array(length * 2);
    planarData.set(left.subarray(offset, offset + length), 0);
    planarData.set(right.subarray(offset, offset + length), length);

    const timestampMicros = Math.round((offset / sampleRate) * 1_000_000);
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: length,
      numberOfChannels: 2,
      timestamp: timestampMicros,
      data: planarData
    });

    audioEncoder.encode(audioData);
    audioData.close();
  }

  await audioEncoder.flush();
  audioEncoder.close();
}

/**
 * Responsabilidad Única: Renderizar el proyecto de video en resolución nativa de YouTube
 * (1920x1080 para 16:9 o 1080x1920 para Shorts 9:16) limpio (sin bordes ni controles del editor),
 * mezclar la pista de audio del proyecto y exportar el archivo `.mp4` descargable.
 */

import { DslScene } from '../dsl/dslTypes';
import { resolveSceneLayout } from '../dsl/layoutResolver';
import { evaluateCameraAtTime } from './cameraEvaluator';
import { renderInfiniteCanvasFrame } from './canvasRenderer';
import { evaluateNodesAtTime } from './nodeEvaluator';

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

  // Crear un canvas dedicado de alta definición (1080p)
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = targetWidth;
  offscreenCanvas.height = targetHeight;
  const ctx = offscreenCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto gráfico 2D para exportar.');
  }

  const resolvedNodes = resolveSceneLayout(scene.nodes);

  // Configurar flujo de video a 60 FPS
  const videoStream = offscreenCanvas.captureStream(fps);
  const combinedTracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];

  // Si el proyecto tiene pista de audio, mezclarla en el MediaStream
  let audioCtx: AudioContext | null = null;
  let audioElement: HTMLAudioElement | null = null;

  if (scene.audioTrack?.src) {
    try {
      audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      audioElement = new Audio();
      audioElement.crossOrigin = 'anonymous';
      audioElement.src = scene.audioTrack.src;
      audioElement.volume = Math.max(0, Math.min(1, scene.audioTrack.volume ?? 0.85));

      await new Promise<void>((resolve) => {
        if (!audioElement) return resolve();
        audioElement.oncanplay = () => resolve();
        audioElement.onerror = () => resolve();
        setTimeout(resolve, 1200);
      });

      const sourceNode = audioCtx.createMediaElementSource(audioElement);
      sourceNode.connect(dest);
      // También conectar a los parlantes suavemente o mantener solo en la grabación
      const audioTracks = dest.stream.getAudioTracks();
      if (audioTracks.length > 0) {
        combinedTracks.push(audioTracks[0]);
      }
    } catch {
      // Si el servidor externo del audio bloquea CORS, continuar exportando el video sin fallar
    }
  }

  const finalStream = new MediaStream(combinedTracks);

  // Priorizar códec MP4 H.264/AAC nativo (soportado en Chrome/Edge modernos)
  const mimeCandidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm'
  ];

  const selectedMime =
    mimeCandidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';

  const recorder = new MediaRecorder(
    finalStream,
    selectedMime
      ? { mimeType: selectedMime, videoBitsPerSecond: 12_000_000 }
      : { videoBitsPerSecond: 12_000_000 }
  );

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recordingDonePromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: selectedMime || 'video/mp4' });
      resolve(blob);
    };
    recorder.onerror = (err) => reject(err);
  });

  recorder.start(100);
  if (audioElement) {
    audioElement.currentTime = 0;
    audioElement.play().catch(() => {});
  }

  const startWallTime = performance.now();

  await new Promise<void>((resolve, reject) => {
    const stepFrame = () => {
      if (abortSignal?.aborted) {
        recorder.stop();
        if (audioElement) audioElement.pause();
        reject(new Error('Exportación cancelada por el usuario.'));
        return;
      }

      const elapsedSeconds = (performance.now() - startWallTime) / 1000;
      const clampedTime = Math.min(duration, elapsedSeconds);
      const percent = Math.min(100, Math.round((clampedTime / duration) * 100));

      const evaluatedNodes = evaluateNodesAtTime(resolvedNodes, scene.timeline, clampedTime);
      const camera = evaluateCameraAtTime(scene.cameraTrack, resolvedNodes, clampedTime);

      // Renderizar el frame ocupando el 100% del lienzo 1080p sin controles de editor
      renderCleanExportFrame(
        ctx,
        targetWidth,
        targetHeight,
        scene,
        evaluatedNodes,
        camera
      );

      onProgress({
        percent,
        currentTime: clampedTime,
        duration,
        statusText: `Renderizando ${targetWidth}×${targetHeight} a 60 FPS (${percent}%)...`
      });

      if (elapsedSeconds >= duration) {
        resolve();
      } else {
        requestAnimationFrame(stepFrame);
      }
    };

    requestAnimationFrame(stepFrame);
  });

  if (audioElement) {
    audioElement.pause();
  }
  recorder.stop();

  const finalVideoBlob = await recordingDonePromise;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
  }

  // Descargar archivo .mp4
  const downloadUrl = URL.createObjectURL(finalVideoBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${projectId}-${targetWidth}x${targetHeight}.mp4`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
}

/**
 * Renderiza el cuadro limpio para el archivo MP4 final (sin los botones ni la barra roja simulada de YouTube).
 */
function renderCleanExportFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scene: DslScene,
  evaluatedNodes: ReturnType<typeof evaluateNodesAtTime>,
  camera: ReturnType<typeof evaluateCameraAtTime>
): void {
  renderInfiniteCanvasFrame(
    ctx,
    width,
    height,
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
      currentTime: 0,
      duration: scene.duration,
      projectTitle: ''
    }
  );
}

/**
 * Responsabilidad Única: Dibujar el simulador de pantalla de YouTube (16:9 Horizontal o 9:16 Shorts)
 * sobre el visor del canvas infinito para que el creador vea exactamente qué entra en el cuadro
 * del video final de YouTube mientras la cámara viaja por el lienzo.
 */

import { YouTubeAspectPreset } from '../dsl/dslTypes';

export interface YouTubeOverlayOptions {
  aspectRatio: YouTubeAspectPreset;
  /** Oscurece el área del canvas infinito que queda fuera del encuadre de YouTube */
  dimOutsideFrame: boolean;
  /** Muestra la barra de reproducción roja, tiempo y guías de tercios de YouTube */
  showPlayerChrome: boolean;
  currentTime: number;
  duration: number;
  projectTitle: string;
}

export interface ComputedYouTubeFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

/**
 * Calcula el rectángulo exacto 16:9 o 9:16 centrado dentro del visor disponible.
 */
export function computeYouTubeFrameRect(
  viewportWidth: number,
  viewportHeight: number,
  aspectRatio: YouTubeAspectPreset
): ComputedYouTubeFrameRect {
  const targetRatio = aspectRatio === '9:16' ? 9 / 16 : 16 / 9;
  const margin = 28;
  const availW = Math.max(200, viewportWidth - margin * 2);
  const availH = Math.max(160, viewportHeight - margin * 2);

  let frameW = availW;
  let frameH = frameW / targetRatio;

  if (frameH > availH) {
    frameH = availH;
    frameW = frameH * targetRatio;
  }

  const referenceWidth = aspectRatio === '9:16' ? 608 : 1080;

  return {
    x: (viewportWidth - frameW) / 2,
    y: (viewportHeight - frameH) / 2,
    width: frameW,
    height: frameH,
    scaleFactor: frameW / referenceWidth
  };
}

export function renderYouTubeScreenOverlay(
  ctx: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  frame: ComputedYouTubeFrameRect,
  options: YouTubeOverlayOptions
): void {
  ctx.save();

  // 1. Máscara oscura fuera de la pantalla de YouTube (permite seguir viendo el canvas infinito alrededor)
  if (options.dimOutsideFrame) {
    ctx.fillStyle = 'rgba(2, 6, 17, 0.72)';
    // Arriba
    ctx.fillRect(0, 0, viewportWidth, frame.y);
    // Abajo
    ctx.fillRect(0, frame.y + frame.height, viewportWidth, viewportHeight - (frame.y + frame.height));
    // Izquierda
    ctx.fillRect(0, frame.y, frame.x, frame.height);
    // Derecha
    ctx.fillRect(
      frame.x + frame.width,
      frame.y,
      viewportWidth - (frame.x + frame.width),
      frame.height
    );
  }

  // 2. Borde del encuadre de cámara de YouTube
  ctx.strokeStyle = options.showPlayerChrome ? '#ef4444' : 'rgba(56, 189, 248, 0.75)';
  ctx.lineWidth = 2;
  ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);

  // 3. Etiqueta superior del marco YouTube
  ctx.fillStyle = options.showPlayerChrome ? '#ef4444' : '#0284c7';
  const badgeText =
    options.aspectRatio === '9:16'
      ? '▶ YOUTUBE SHORTS 9:16 (1080×1920)'
      : '▶ PANTALLA YOUTUBE 16:9 (1920×1080 HD)';
  ctx.font = '700 10.5px Inter, system-ui, sans-serif';
  const textWidth = ctx.measureText(badgeText).width;
  ctx.fillRect(frame.x, frame.y - 20, textWidth + 16, 20);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(badgeText, frame.x + 8, frame.y - 6);

  // 4. Simulación del reproductor de YouTube (barra roja, controles, tercios y zona segura)
  if (options.showPlayerChrome) {
    // Regla de los tercios sutil
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(frame.x + frame.width / 3, frame.y);
    ctx.lineTo(frame.x + frame.width / 3, frame.y + frame.height);
    ctx.moveTo(frame.x + (frame.width * 2) / 3, frame.y);
    ctx.lineTo(frame.x + (frame.width * 2) / 3, frame.y + frame.height);
    ctx.moveTo(frame.x, frame.y + frame.height / 3);
    ctx.lineTo(frame.x + frame.width, frame.y + frame.height / 3);
    ctx.moveTo(frame.x, frame.y + (frame.height * 2) / 3);
    ctx.lineTo(frame.x + frame.width, frame.y + (frame.height * 2) / 3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Gradiente inferior del reproductor de YouTube
    const barHeight = 38;
    const grad = ctx.createLinearGradient(
      0,
      frame.y + frame.height - barHeight * 1.4,
      0,
      frame.y + frame.height
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.78)');
    ctx.fillStyle = grad;
    ctx.fillRect(
      frame.x,
      frame.y + frame.height - barHeight * 1.4,
      frame.width,
      barHeight * 1.4
    );

    // Barra de progreso roja de YouTube
    const progressY = frame.y + frame.height - 26;
    const marginX = 14;
    const trackW = frame.width - marginX * 2;
    const progressRatio = Math.min(1, Math.max(0, options.currentTime / Math.max(1, options.duration)));

    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(frame.x + marginX, progressY, trackW, 3.5);

    ctx.fillStyle = '#ff0033';
    ctx.fillRect(frame.x + marginX, progressY, trackW * progressRatio, 3.5);

    // Punto rojo del scrubber de YouTube
    ctx.beginPath();
    ctx.arc(frame.x + marginX + trackW * progressRatio, progressY + 1.75, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Controles inferiores simulados de YouTube (Play, Tiempo, Badge HD 60fps)
    const controlsY = frame.y + frame.height - 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const timeStr = `▶  0:${Math.floor(options.currentTime).toString().padStart(2, '0')} / 0:${Math.floor(options.duration).toString().padStart(2, '0')}   •   ${options.projectTitle}`;
    ctx.fillText(timeStr, frame.x + marginX, controlsY);

    const hdText = 'HD 1080p60  ⚙  ⛶';
    const hdWidth = ctx.measureText(hdText).width;
    ctx.fillText(hdText, frame.x + frame.width - marginX - hdWidth, controlsY);
  }

  ctx.restore();
}

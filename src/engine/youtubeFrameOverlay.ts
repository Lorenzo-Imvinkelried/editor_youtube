/**
 * Responsabilidad Única: Dibujar el simulador de pantalla de YouTube (16:9 Horizontal o 9:16 Shorts)
 * exactamente centrado tanto horizontal como verticalmente sobre el visor del canvas infinito.
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
  centerX: number;
  centerY: number;
  scaleFactor: number;
}

/**
 * Calcula el rectángulo exacto 16:9 o 9:16 perfectamente centrado en (viewportWidth/2, viewportHeight/2).
 */
export function computeYouTubeFrameRect(
  viewportWidth: number,
  viewportHeight: number,
  aspectRatio: YouTubeAspectPreset
): ComputedYouTubeFrameRect {
  const targetRatio = aspectRatio === '9:16' ? 9 / 16 : 16 / 9;
  const padX = 48;
  const padY = 48;

  const availW = Math.max(240, viewportWidth - padX * 2);
  const availH = Math.max(180, viewportHeight - padY * 2);

  let frameW = availW;
  let frameH = frameW / targetRatio;

  if (frameH > availH) {
    frameH = availH;
    frameW = frameH * targetRatio;
  }

  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const x = centerX - frameW / 2;
  const y = centerY - frameH / 2;

  const referenceWidth = aspectRatio === '9:16' ? 580 : 1120;

  return {
    x,
    y,
    width: frameW,
    height: frameH,
    centerX,
    centerY,
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

  // 1. Máscara oscura simétrica fuera de la pantalla de YouTube
  if (options.dimOutsideFrame) {
    ctx.fillStyle = 'rgba(3, 7, 18, 0.76)';
    ctx.fillRect(0, 0, viewportWidth, frame.y);
    ctx.fillRect(0, frame.y + frame.height, viewportWidth, viewportHeight - (frame.y + frame.height));
    ctx.fillRect(0, frame.y, frame.x, frame.height);
    ctx.fillRect(
      frame.x + frame.width,
      frame.y,
      viewportWidth - (frame.x + frame.width),
      frame.height
    );
  }

  // 2. Marco luminoso exacto de la pantalla de YouTube
  ctx.strokeStyle = options.showPlayerChrome ? '#ff0033' : 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 2.2;
  ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);

  // 3. Pastilla centrada arriba del cuadro de YouTube
  const badgeText =
    options.aspectRatio === '9:16'
      ? '▶ YOUTUBE SHORTS 9:16 (1080×1920)'
      : '▶ PANTALLA YOUTUBE 16:9 (1920×1080)';
  ctx.font = '700 11px Inter, system-ui, sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 22;
  const badgeH = 22;
  const badgeX = frame.centerX - badgeW / 2;
  const badgeY = frame.y - badgeH - 6;

  ctx.fillStyle = options.showPlayerChrome ? '#ff0033' : '#0284c7';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 99);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, frame.centerX, badgeY + badgeH / 2);

  // 4. Simulación del reproductor de YouTube (barra roja, controles y guía central/tercios)
  if (options.showPlayerChrome) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
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

    // Sombra inferior del reproductor de YouTube
    const barHeight = 40;
    const grad = ctx.createLinearGradient(
      0,
      frame.y + frame.height - barHeight * 1.4,
      0,
      frame.y + frame.height
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.82)');
    ctx.fillStyle = grad;
    ctx.fillRect(
      frame.x,
      frame.y + frame.height - barHeight * 1.4,
      frame.width,
      barHeight * 1.4
    );

    // Barra de progreso roja de YouTube
    const progressY = frame.y + frame.height - 26;
    const marginX = 16;
    const trackW = frame.width - marginX * 2;
    const progressRatio = Math.min(1, Math.max(0, options.currentTime / Math.max(1, options.duration)));

    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.fillRect(frame.x + marginX, progressY, trackW, 3.5);

    ctx.fillStyle = '#ff0033';
    ctx.fillRect(frame.x + marginX, progressY, trackW * progressRatio, 3.5);

    ctx.beginPath();
    ctx.arc(frame.x + marginX + trackW * progressRatio, progressY + 1.75, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Tiempo e íconos de YouTube
    const controlsY = frame.y + frame.height - 11;
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const timeStr = `▶  0:${Math.floor(options.currentTime).toString().padStart(2, '0')} / 0:${Math.floor(options.duration).toString().padStart(2, '0')}   •   ${options.projectTitle}`;
    ctx.fillText(timeStr, frame.x + marginX, controlsY);

    ctx.textAlign = 'right';
    ctx.fillText('HD 1080p60  ⚙  ⛶', frame.x + frame.width - marginX, controlsY);
  }

  ctx.restore();
}

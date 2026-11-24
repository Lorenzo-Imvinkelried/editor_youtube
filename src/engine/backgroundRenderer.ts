/**
 * Responsabilidad Única: Renderizar fondos cinematográficos sin líneas de grilla
 * (inspirados en la estética documental de Niels Bohr: degradado radial azul medianoche
 * profundo con micropartículas de polvo espacial con paralaje suave).
 */

import { BackgroundPresetStyle, DslScene } from '../dsl/dslTypes';

export interface BackgroundPalette {
  id: BackgroundPresetStyle;
  label: string;
  innerColor: string;
  outerColor: string;
  particleColor: string;
}

export const BACKGROUND_PRESETS: BackgroundPalette[] = [
  {
    id: 'midnight-bohr',
    label: 'Azul Noche (Estilo Niels Bohr)',
    innerColor: '#13203d',
    outerColor: '#050811',
    particleColor: 'rgba(148, 197, 255, 0.35)'
  },
  {
    id: 'deep-space',
    label: 'Cosmos Violeta Profundo',
    innerColor: '#1f133d',
    outerColor: '#06040e',
    particleColor: 'rgba(216, 180, 254, 0.32)'
  },
  {
    id: 'emerald-studio',
    label: 'Estudio Esmeralda Oscuro',
    innerColor: '#0d2b28',
    outerColor: '#030909',
    particleColor: 'rgba(110, 231, 183, 0.3)'
  },
  {
    id: 'amber-vintage',
    label: 'Documental Ámbar Histórico',
    innerColor: '#2c1c11',
    outerColor: '#090604',
    particleColor: 'rgba(253, 224, 71, 0.28)'
  },
  {
    id: 'obsidian-clean',
    label: 'Obsidiana Puro Minimalista',
    innerColor: '#111520',
    outerColor: '#030407',
    particleColor: 'rgba(148, 163, 184, 0.25)'
  }
];

// Semillas deterministas para las micropartículas de polvo del fondo (como en la captura de Niels Bohr)
const AMBIENT_PARTICLES = Array.from({ length: 42 }, (_, i) => ({
  seedX: ((i * 7919) % 2000) - 1000,
  seedY: ((i * 6271) % 1200) - 600,
  radius: (i % 3) * 0.55 + 0.8,
  alpha: ((i % 5) + 2) * 0.08,
  depth: ((i % 4) + 1) * 0.04
}));

export function renderCinematicBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  camX: number,
  camY: number,
  scene: DslScene
): void {
  ctx.save();

  const styleId: BackgroundPresetStyle = scene.backgroundStyle || 'midnight-bohr';
  const preset =
    BACKGROUND_PRESETS.find((p) => p.id === styleId) || BACKGROUND_PRESETS[0];

  const inner =
    styleId === 'custom-solid' && scene.background
      ? scene.background
      : preset.innerColor;
  const outer =
    styleId === 'custom-solid' && scene.backgroundSecondary
      ? scene.backgroundSecondary
      : preset.outerColor;

  // 1. Degradado radial suave centrado en la pantalla de YouTube (exactamente como la imagen de Niels Bohr)
  const radius = Math.max(width, height) * 0.65;
  const radial = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.05,
    centerX,
    centerY,
    radius
  );
  radial.addColorStop(0, inner);
  radial.addColorStop(0.55, lerpHexColor(inner, outer, 0.55));
  radial.addColorStop(1, outer);

  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // 2. Micropartículas de polvo luminoso flotando con paralaje sutil (sin líneas de grilla)
  ctx.fillStyle = preset.particleColor;
  for (const p of AMBIENT_PARTICLES) {
    const px =
      ((((centerX + p.seedX - camX * p.depth) % width) + width) % width);
    const py =
      ((((centerY + p.seedY - camY * p.depth) % height) + height) % height);

    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(px, py, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return { r: 10, g: 16, b: 30 };
  return {
    r: parseInt(clean.slice(0, 2), 16) || 10,
    g: parseInt(clean.slice(2, 4), 16) || 16,
    b: parseInt(clean.slice(4, 6), 16) || 30
  };
}

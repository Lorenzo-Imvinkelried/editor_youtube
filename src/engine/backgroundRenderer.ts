/**
 * Responsabilidad Única: Renderizar fondos con estética de Arte en Papel Vintage
 * (textura procedural de fibras de papel en caché, motas orgánicas de celulosa,
 * viñeta cálida de bordes envejecidos) además de mesas de archivo oscuras.
 */

import { BackgroundPresetStyle, DslScene } from '../dsl/dslTypes';

export interface BackgroundPalette {
  id: BackgroundPresetStyle;
  label: string;
  innerColor: string;
  outerColor: string;
  speckleColor: string;
  isLightPaper: boolean;
}

export const BACKGROUND_PRESETS: BackgroundPalette[] = [
  {
    id: 'vintage-paper',
    label: '📜 Papel Antiguo Collage (Vintage)',
    innerColor: '#f4ecdc',
    outerColor: '#d7c6a9',
    speckleColor: 'rgba(92, 68, 40, 0.16)',
    isLightPaper: true
  },
  {
    id: 'sepia-parchment',
    label: '🏛️ Pergamino Sepia 1890',
    innerColor: '#ead9bc',
    outerColor: '#c2a67d',
    speckleColor: 'rgba(78, 52, 26, 0.2)',
    isLightPaper: true
  },
  {
    id: 'newsprint-aged',
    label: '📰 Papel Imprenta / Diario Antiguo',
    innerColor: '#efece4',
    outerColor: '#ccc5b5',
    speckleColor: 'rgba(60, 55, 48, 0.15)',
    isLightPaper: true
  },
  {
    id: 'walnut-archive',
    label: '🪵 Mesa de Archivo Oscura (Cálida)',
    innerColor: '#2d2118',
    outerColor: '#120c08',
    speckleColor: 'rgba(214, 184, 140, 0.16)',
    isLightPaper: false
  },
  {
    id: 'midnight-bohr',
    label: '🌌 Azul Noche Documental',
    innerColor: '#13203d',
    outerColor: '#050811',
    speckleColor: 'rgba(148, 197, 255, 0.25)',
    isLightPaper: false
  },
  {
    id: 'obsidian-clean',
    label: '⬛ Obsidiana Minimalista',
    innerColor: '#141416',
    outerColor: '#050506',
    speckleColor: 'rgba(160, 160, 170, 0.18)',
    isLightPaper: false
  }
];

export function isSceneLightPaper(scene: DslScene): boolean {
  const styleId = scene.backgroundStyle || 'vintage-paper';
  const preset = BACKGROUND_PRESETS.find((p) => p.id === styleId);
  return preset ? preset.isLightPaper : true;
}

// Textura de grano y fibras de papel pre-renderizada una única vez en un tile 256x256 para mantener 60 FPS
let cachedPaperPatternCanvas: HTMLCanvasElement | null = null;

function getPaperGrainTile(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (cachedPaperPatternCanvas) return cachedPaperPatternCanvas;

  const tile = document.createElement('canvas');
  tile.width = 240;
  tile.height = 240;
  const tctx = tile.getContext('2d');
  if (!tctx) return null;

  // Fibras finísimas cruzadas y granulado orgánico de papel algodón
  for (let i = 0; i < 900; i++) {
    const x = (i * 173) % 240;
    const y = (i * 293) % 240;
    const isDark = i % 3 !== 0;
    tctx.fillStyle = isDark ? 'rgba(75, 53, 31, 0.035)' : 'rgba(255, 252, 245, 0.05)';
    tctx.fillRect(x, y, (i % 3) + 1, (i % 2) + 1);
  }

  tctx.strokeStyle = 'rgba(88, 64, 38, 0.028)';
  tctx.lineWidth = 0.8;
  for (let j = 0; j < 45; j++) {
    const sx = (j * 97) % 240;
    const sy = (j * 151) % 240;
    const angle = ((j * 47) % 314) / 100;
    tctx.beginPath();
    tctx.moveTo(sx, sy);
    tctx.lineTo(sx + Math.cos(angle) * 14, sy + Math.sin(angle) * 14);
    tctx.stroke();
  }

  cachedPaperPatternCanvas = tile;
  return tile;
}

// Motas orgánicas de celulosa / archivo que se desplazan sutilmente con la cámara
const PAPER_FIBERS = Array.from({ length: 48 }, (_, i) => ({
  seedX: ((i * 7919) % 2200) - 1100,
  seedY: ((i * 6271) % 1300) - 650,
  radius: (i % 3) * 0.65 + 0.7,
  alpha: ((i % 4) + 2) * 0.09,
  depth: ((i % 3) + 1) * 0.05
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

  const styleId: BackgroundPresetStyle = scene.backgroundStyle || 'vintage-paper';
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

  // 1. Degradado radial de iluminación de mesa de papel (centro luminoso cálido, bordes envejecidos)
  const radius = Math.max(width, height) * 0.72;
  const radial = ctx.createRadialGradient(
    centerX,
    centerY,
    radius * 0.08,
    centerX,
    centerY,
    radius
  );
  radial.addColorStop(0, inner);
  radial.addColorStop(0.65, lerpHexColor(inner, outer, 0.48));
  radial.addColorStop(1, outer);

  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // 2. Capa de textura de grano de papel desplazándose solidariamente con el lienzo
  const grainTile = getPaperGrainTile();
  if (grainTile) {
    const pattern = ctx.createPattern(grainTile, 'repeat');
    if (pattern) {
      ctx.save();
      const offsetX = -((camX * 0.15) % 240);
      const offsetY = -((camY * 0.15) % 240);
      ctx.translate(offsetX, offsetY);
      ctx.fillStyle = pattern;
      ctx.fillRect(-240, -240, width + 480, height + 480);
      ctx.restore();
    }
  }

  // 3. Pequeñas motas de celulosa / papel antiguo
  ctx.fillStyle = preset.speckleColor;
  for (const f of PAPER_FIBERS) {
    const px = (((centerX + f.seedX - camX * f.depth) % width) + width) % width;
    const py = (((centerY + f.seedY - camY * f.depth) % height) + height) % height;

    ctx.globalAlpha = f.alpha;
    ctx.beginPath();
    ctx.arc(px, py, f.radius, 0, Math.PI * 2);
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
  if (clean.length !== 6) return { r: 240, g: 232, b: 216 };
  return {
    r: parseInt(clean.slice(0, 2), 16) || 240,
    g: parseInt(clean.slice(2, 4), 16) || 232,
    b: parseInt(clean.slice(4, 6), 16) || 216
  };
}

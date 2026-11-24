/**
 * Responsabilidad Única: Funciones matemáticas puras (interpolación, vectores, sujeción de rangos y formato MM:SS).
 * Sin dependencias del DOM ni de React.
 */

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function formatTimeMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface Vec2 {
  x: number;
  y: number;
}

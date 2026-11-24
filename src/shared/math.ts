/**
 * Responsabilidad Única: Funciones matemáticas puras (interpolación, vectores y sujeción de rangos).
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

export interface Vec2 {
  x: number;
  y: number;
}

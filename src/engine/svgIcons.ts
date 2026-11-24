/**
 * Responsabilidad Única: Dibujar íconos vectoriales (SVGs nativos en Canvas 2D) nítidos a cualquier nivel de zoom.
 */

import { BuiltinSvgIcon } from '../dsl/dslTypes';

export function drawBuiltinVectorIcon(
  ctx: CanvasRenderingContext2D,
  icon: BuiltinSvgIcon | undefined,
  size: number,
  color: string
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2.5, size * 0.055);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const r = size * 0.32;

  switch (icon) {
    case 'brain': {
      // Dos hemisferios neuronales con nodos conectados
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.2, r * 0.45, Math.PI * 0.5, Math.PI * 1.7);
      ctx.arc(-r * 0.35, r * 0.25, r * 0.42, Math.PI * 0.4, Math.PI * 1.4);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(r * 0.35, -r * 0.2, r * 0.45, -Math.PI * 0.7, Math.PI * 0.5);
      ctx.arc(r * 0.35, r * 0.25, r * 0.42, -Math.PI * 0.4, Math.PI * 0.6);
      ctx.stroke();

      // Sinapsis centrales
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.55);
      ctx.lineTo(0, r * 0.55);
      ctx.stroke();
      break;
    }
    case 'cpu': {
      const box = r * 0.95;
      ctx.strokeRect(-box / 2, -box / 2, box, box);
      ctx.strokeRect(-box * 0.22, -box * 0.22, box * 0.44, box * 0.44);
      const pins = [-0.28, 0, 0.28];
      for (const p of pins) {
        const offset = p * box;
        ctx.beginPath();
        ctx.moveTo(offset, -box / 2);
        ctx.lineTo(offset, -box * 0.75);
        ctx.moveTo(offset, box / 2);
        ctx.lineTo(offset, box * 0.75);
        ctx.moveTo(-box / 2, offset);
        ctx.lineTo(-box * 0.75, offset);
        ctx.moveTo(box / 2, offset);
        ctx.lineTo(box * 0.75, offset);
        ctx.stroke();
      }
      break;
    }
    case 'rocket': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.65, -r * 0.2, r * 0.45, r * 0.55);
      ctx.lineTo(-r * 0.45, r * 0.55);
      ctx.quadraticCurveTo(-r * 0.65, -r * 0.2, 0, -r * 0.9);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, -r * 0.15, r * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'globe': {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.42, r * 0.85, 0, 0, Math.PI * 2);
      ctx.moveTo(-r * 0.85, 0);
      ctx.lineTo(r * 0.85, 0);
      ctx.stroke();
      break;
    }
    case 'chart': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.65);
      ctx.lineTo(-r * 0.2, r * 0.1);
      ctx.lineTo(r * 0.2, r * 0.35);
      ctx.lineTo(r * 0.75, -r * 0.55);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(r * 0.35, -r * 0.55);
      ctx.lineTo(r * 0.75, -r * 0.55);
      ctx.lineTo(r * 0.75, -r * 0.15);
      ctx.stroke();
      break;
    }
    case 'portrait': {
      // Silueta minimalista estilo Niels Bohr (cabeza, cuello y hombros en línea de neón azul)
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.22, r * 0.34, r * 0.44, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Cuello y solapa en V
      ctx.beginPath();
      ctx.moveTo(-r * 0.14, r * 0.18);
      ctx.lineTo(-r * 0.14, r * 0.34);
      ctx.lineTo(0, r * 0.58);
      ctx.lineTo(r * 0.14, r * 0.34);
      ctx.lineTo(r * 0.14, r * 0.18);
      ctx.stroke();

      // Hombros curvos hacia la base de la tarjeta
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, r * 0.92);
      ctx.quadraticCurveTo(-r * 0.64, r * 0.38, -r * 0.14, r * 0.34);
      ctx.moveTo(r * 0.14, r * 0.34);
      ctx.quadraticCurveTo(r * 0.64, r * 0.38, r * 0.72, r * 0.92);
      ctx.stroke();
      break;
    }
    case 'sparkles':
    case 'star':
    default: {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        const nextAngle = angle + Math.PI / 4;
        ctx.lineTo(Math.cos(angle) * r * 0.9, Math.sin(angle) * r * 0.9);
        ctx.lineTo(Math.cos(nextAngle) * r * 0.32, Math.sin(nextAngle) * r * 0.32);
      }
      ctx.closePath();
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

/**
 * Responsabilidad Única: Funciones de easing y físicas de resorte (spring)
 * para lograr el efecto "pop-up" orgánico y transiciones de cámara cinematográficas.
 */

import { EasingName } from '../dsl/dslTypes';
import { clamp } from '../shared/math';

export function evaluateEasing(name: EasingName | undefined, rawT: number, overshoot = 1.28): number {
  const t = clamp(rawT, 0, 1);

  switch (name) {
    case 'linear':
      return t;
    case 'easeInCubic':
      return t * t * t;
    case 'easeOutCubic':
      return 1 - Math.pow(1 - t, 3);
    case 'easeInOutCubic':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'springSmooth': {
      const c4 = (2 * Math.PI) / 4.2;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 9 - 0.75) * c4) + 1;
    }
    case 'springBouncy':
    default: {
      // Curva con rebote elástico calibrado para el efecto Pop-Up
      const c1 = 1.70158 * overshoot;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
  }
}

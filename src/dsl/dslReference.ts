/**
 * Responsabilidad Única: Documentar la gramática del lenguaje interno (DSL) para que tanto
 * el usuario como cualquier LLM entiendan las primitivas disponibles.
 */

export const DSL_LANGUAGE_REFERENCE = `
# Especificación del Lenguaje Interno (MotionCanvas-DSL v1.0)

El editor utiliza un lenguaje declarativo JSON diseñado específicamente para ser escrito por LLMs:

1. **Nodos en el Canvas Infinito (\`nodes[]\`)**:
   - \`id\`: Identificador único semántico (ej. \`"personaje-ia"\`, \`"mapa-mundo"\`).
   - \`type\`: \`"svg"\` | \`"image"\` | \`"badge"\` | \`"shape"\`.
   - \`x, y\`: Coordenadas en el lienzo infinito (el centro es \`0, 0\`).
   - \`z\`: Profundidad Parallax (\`-0.5\` fondo lejano, \`0\` plano medio, \`+0.4\` primer plano).
   - \`relativeTo\`: \`{ targetId, direction: "rightOf" | "leftOf" | "above" | "below", gap }\`.

2. **Cámara Virtual 2.5D (\`cameraTrack[]\`)**:
   - \`action: "focusOn"\` -> Viaja suavemente hasta centrar \`targetId\` con \`zoom\` y \`rotation\`.
   - \`action: "moveTo"\` -> Desplaza la cámara a cualquier coordenada \`(x, y)\` del canvas infinito.

3. **Acciones de Línea de Tiempo (\`timeline[]\`)**:
   - \`popIn\`: Efecto Pop-Up con física de resorte (\`easing: "springBouncy"\`, \`params.overshoot\`).
   - \`popOut\`: Desaparición rápida con contracción.
   - \`float\`: Levitación continua sinusoidal (\`params: { amplitude, speed }\`).
   - \`wiggle\`: Sacudida de rotación para llamar la atención (\`params: { angle }\`).
   - \`pulse\`: Latido rítmico de escala (\`params: { scaleAmount, speed }\`).
   - \`spin\`: Giro de \`degrees\` grados.
   - \`moveTo\`: Traslación a nuevas coordenadas \`(x, y)\`.
`.trim();

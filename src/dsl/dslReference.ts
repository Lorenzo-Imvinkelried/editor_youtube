/**
 * Responsabilidad Única: Documentar la gramática del lenguaje interno (DSL) para que tanto
 * el usuario como cualquier LLM entiendan las primitivas disponibles (incluyendo textos y marco YouTube).
 */

export const DSL_LANGUAGE_REFERENCE = `
# Especificación del Lenguaje Interno (MotionCanvas-DSL v1.1)

El editor utiliza un lenguaje declarativo JSON diseñado específicamente para ser escrito por LLMs:

1. **Formato de Pantalla YouTube (\`aspectRatio\`)**:
   - \`"16:9"\`: Formato estándar de YouTube horizontal (1920x1080).
   - \`"9:16"\`: Formato vertical para YouTube Shorts / Reels (1080x1920).

2. **Nodos en el Canvas Infinito (\`nodes[]\`)**:
   - \`id\`: Identificador único semántico (ej. \`"titulo-principal"\`, \`"foto-infusion"\`).
   - \`type\`: Usar SIEMPRE \`"text"\` para textos y \`"image"\` (con \`src\` verificado o \`imageQuery\` preciso y coherente con lo narrado) para todos los elementos visuales. **NO generar nodos \`"svg"\` ni íconos vectoriales personalizados.**
   - \`fontFamily\` (para \`type: "text"\`):
     - \`"display"\` (Impact / Montserrat Black — titulares de YouTube)
     - \`"serif"\` (Georgia / Editorial — estilo ensayo)
     - \`"mono"\` (Fira Code — estilo código / técnico)
     - \`"handwritten"\` (Manuscrita / apuntes sobre lienzo)
     - \`"sans"\` (Inter — limpia y moderna)
   - \`textVariant\` (formas visuales de texto):
     - \`"3d-pop"\` (Texto 3D extruido con borde grueso)
     - \`"highlight-box"\` (Cinta resaltadora estilo documental Vox)
     - \`"neon-glow"\` (Texto neón luminoso)
     - \`"curved-arc"\` (Texto curvo en arco)
     - \`"outline-hollow"\` (Texto hueco con contorno)
     - \`"pill-badge"\` (Cápsula redondeada)
   - \`relativeTo\`: \`{ targetId, direction: "rightOf" | "leftOf" | "above" | "below", gap, align?: "anchor" | "keepAxis" }\` (resuelto con cajas reales medidas para evitar solapamientos).
   - \`autoAvoidOverlap\`: \`true\` por defecto en la raíz de la escena (el motor separa automáticamente cualquier texto que invada una imagen).
   - \`autoFillFrame\`: \`true\` por defecto en la raíz de la escena (auto-zoom inteligente que llena la pantalla 16:9 o 9:16 sin desbordar jamás el borde).

3. **Acciones de Línea de Tiempo (\`timeline[]\`)**:
   - \`popIn\`: Efecto Pop-Up con física de resorte (\`easing: "springBouncy"\`).
   - \`typewriter\`: Escritura progresiva letra por letra para nodos de texto.
   - \`float\`, \`wiggle\`, \`pulse\`, \`spin\`, \`moveTo\`, \`scaleTo\`.
   - **Locución TTS clara:** las letras sueltas (como \`vitamina C\`, \`vitamina K\`, \`B12\`, \`D3\`) y siglas (\`LDL\`, \`HDL\`, \`ADN\`) deben ir bien puntuadas en el guion y el motor \`ttsPronunciationFormatter\` las pausa fonéticamente al narrar para que nunca se pronuncien apuradas.
`.trim();

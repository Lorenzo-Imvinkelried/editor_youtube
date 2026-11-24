/**
 * Responsabilidad Única: Contener y generar el Prompt Maestro listo para copiar y pegar
 * en cualquier IA externa (ChatGPT, Claude, Gemini) para que devuelva un video completo
 * o una escena en el lenguaje interno (DSL) del editor, soportando links de imágenes de Google.
 */

export function buildMasterPromptForExternalAi(userTopic?: string): string {
  const topicText = userTopic?.trim()
    ? userTopic.trim()
    : '[ESCRIBÍ ACÁ TU IDEA O TEMA DEL VIDEO, EJ: "Cómo funciona Bitcoin explicado en 15 segundos"]';

  return `Actuá como un Director de Motion Graphics y Animador Experto en nuestro motor "InfiniteCanvas 2.5D".
Tu objetivo es crear la animación de un video para YouTube sobre el siguiente tema:
TEMA DEL VIDEO: "${topicText}"

Debés responder ÚNICAMENTE con un bloque de código JSON válido (sin texto extra fuera del JSON) que siga exactamente la gramática de nuestro lenguaje interno (MotionCanvas-DSL).

### CONCEPTO DEL MOTOR (CÓMO PENSAR LA ANIMACIÓN)
1. Tenemos un **Canvas Cuasi Infinito** donde ubicás elementos (textos en distintas formas/fuentes, imágenes por URL y vectores SVG) en coordenadas \`(x, y, z)\` o usando posicionamiento relativo (\`relativeTo\`) para que NUNCA se pisen entre sí.
2. Una **Cámara Virtual 2.5D** (\`cameraTrack\`) viaja por ese lienzo infinito enfocando cada elemento (\`focusOn\`) con zoom e inclinación (\`rotation\`), o haciendo tomas panorámicas (\`moveTo\`).
3. En la **Línea de Tiempo** (\`timeline\`), los elementos aparecen en el momento exacto con efecto **Pop-Up elástico** (\`popIn\` con \`springBouncy\`), máquina de escribir (\`typewriter\`), levitación (\`float\`), sacudida (\`wiggle\`), pulso (\`pulse\`) o giro (\`spin\`).

---

### ESPECIFICACIÓN EXACTA DEL JSON QUE DEBÉS GENERAR

\`\`\`json
{
  "version": "1.2.0",
  "duration": 14,
  "aspectRatio": "16:9",
  "background": "#090d16",
  "gridColor": "#1e293b",
  "nodes": [
    {
      "id": "titulo-principal",
      "label": "Título de Apertura",
      "type": "text",
      "text": "EL SECRETO DEL TEMA",
      "fontFamily": "display",
      "textVariant": "3d-pop",
      "fontSize": 44,
      "color": "#f97316",
      "accentColor": "#ffffff",
      "x": 0,
      "y": -230,
      "z": 0.3,
      "width": 520,
      "height": 100,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "imagen-central",
      "label": "Imagen Principal (Pegar Link de Google Images)",
      "type": "image",
      "src": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
      "color": "#38bdf8",
      "x": 0,
      "y": 40,
      "z": 0,
      "width": 320,
      "height": 240,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "dato-vox",
      "label": "Dato Clave",
      "type": "text",
      "text": "+300% MÁS RÁPIDO",
      "fontFamily": "sans",
      "textVariant": "highlight-box",
      "fontSize": 30,
      "color": "#facc15",
      "accentColor": "#020617",
      "relativeTo": { "targetId": "imagen-central", "direction": "rightOf", "gap": 340 },
      "x": 660,
      "y": 40,
      "z": 0.2,
      "width": 420,
      "height": 90,
      "initialOpacity": 0,
      "initialScale": 0
    }
  ],
  "cameraTrack": [
    {
      "at": 0.0,
      "duration": 1.0,
      "action": "focusOn",
      "targetId": "imagen-central",
      "zoom": 1.15,
      "rotation": 0,
      "easing": "easeOutCubic"
    },
    {
      "at": 3.0,
      "duration": 1.1,
      "action": "focusOn",
      "targetId": "dato-vox",
      "zoom": 1.3,
      "rotation": -3,
      "easing": "easeInOutCubic"
    },
    {
      "at": 6.0,
      "duration": 1.3,
      "action": "moveTo",
      "x": 300,
      "y": 0,
      "zoom": 0.65,
      "rotation": 0,
      "easing": "easeInOutCubic"
    }
  ],
  "timeline": [
    {
      "id": "anim-1",
      "at": 0.1,
      "duration": 0.85,
      "targetId": "titulo-principal",
      "action": "popIn",
      "easing": "springBouncy",
      "params": { "overshoot": 1.35 }
    },
    {
      "id": "anim-2",
      "at": 0.3,
      "duration": 0.85,
      "targetId": "imagen-central",
      "action": "popIn",
      "easing": "springBouncy",
      "params": { "overshoot": 1.25 }
    },
    {
      "id": "anim-3",
      "at": 1.2,
      "duration": 10.0,
      "targetId": "imagen-central",
      "action": "float",
      "easing": "linear",
      "params": { "amplitude": 12, "speed": 2.0 }
    },
    {
      "id": "anim-4",
      "at": 3.2,
      "duration": 0.8,
      "targetId": "dato-vox",
      "action": "popIn",
      "easing": "springBouncy",
      "params": { "overshoot": 1.3 }
    }
  ]
}
\`\`\`

### REGLAS OBLIGATORIAS PARA TU RESPUESTA:
1. **Tipos de nodos (\`type\`)**:
   - \`"image"\`: Usa la propiedad \`"src"\` con una URL pública válida (o dejá una URL de referencia y un \`"label"\` bien descriptivo como \`"Foto de satelite (cambiar link)"\` para que yo pegue un link de Google Images en 1 segundo).
   - \`"text"\`: Combiná distintas fuentes y formas visuales para que el video sea súper atractivo:
     - \`fontFamily\`: \`"display"\` (Impact/YouTube), \`"sans"\` (limpia), \`"serif"\` (editorial), \`"mono"\` (código), \`"handwritten"\` (manuscrita).
     - \`textVariant\`: \`"3d-pop"\` (3D extruido), \`"highlight-box"\` (cinta resaltada estilo Vox), \`"neon-glow"\` (neón), \`"curved-arc"\` (texto en arco), \`"outline-hollow"\` (contorno hueco), \`"pill-badge"\` (cápsula).
   - \`"svg"\`: Usa \`"icon"\` con uno de estos valores: \`"brain"\`, \`"cpu"\`, \`"rocket"\`, \`"globe"\`, \`"chart"\`, \`"sparkles"\`, \`"star"\`.
2. **Posicionamiento sin superposiciones**:
   - Usá \`"relativeTo": { "targetId": "id-anterior", "direction": "rightOf" | "leftOf" | "above" | "below", "gap": 320 }\` para distribuir las etapas del video por el canvas infinito.
3. **Acciones permitidas en \`timeline\`**:
   - \`"popIn"\`, \`"popOut"\`, \`"typewriter"\` (ideal para textos), \`"float"\`, \`"wiggle"\`, \`"pulse"\`, \`"spin"\`, \`"moveTo"\`, \`"scaleTo"\`.
4. **Easings permitidos**:
   - \`"springBouncy"\`, \`"springSmooth"\`, \`"easeInOutCubic"\`, \`"easeOutCubic"\`, \`"easeInCubic"\`, \`"linear"\`.

Generá entre 6 y 12 nodos bien coreografiados con movimientos de cámara dinámicos para cubrir el tema pedido. Devolvé SOLO el JSON válido.`;
}

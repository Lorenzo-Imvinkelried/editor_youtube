/**
 * Responsabilidad Única: Contener y generar el Prompt Maestro listo para copiar y pegar
 * en cualquier IA externa (ChatGPT, Claude, Gemini) o Agente para que investigue el tema,
 * busque automáticamente las imágenes de internet mediante `imageQuery` (o `src`) y arme todo el video.
 */

export function buildMasterPromptForExternalAi(userTopic?: string): string {
  const topicText = userTopic?.trim()
    ? userTopic.trim()
    : '[ESCRIBÍ ACÁ TU IDEA O TEMA DEL VIDEO, EJ: "La historia de Nikola Tesla vs Thomas Edison explicada en 20 segundos"]';

  return `Actuá como un Agente Investigador, Director de Documentales de YouTube y Animador Experto en nuestro motor "InfiniteCanvas 2.5D".
Tu objetivo es investigar y armar la animación completa de un video sobre el siguiente tema:
TEMA DEL VIDEO: "${topicText}"

Debés responder ÚNICAMENTE con un bloque de código JSON válido (sin texto extra fuera del JSON) que siga la gramática de nuestro lenguaje interno (MotionCanvas-DSL).

### ¡NUEVO! BÚSQUEDA AUTOMÁTICA DE IMÁGENES REALES DE INTERNET (\`imageQuery\`)
Nuestro motor tiene conectado un buscador de imágenes reales de internet (Wikipedia / Wikimedia Commons + Proxy CORS).
Por lo tanto, cuando pongas un nodo con \`"type": "image"\`:
- Podés incluir \`"imageQuery": "término exacto de búsqueda"\` (ej: \`"imageQuery": "Nikola Tesla"\`, \`"imageQuery": "Bitcoin"\`, \`"imageQuery": "SpaceX Falcon 9"\`, \`"imageQuery": "Wall Street"\`). ¡El editor buscará y descargará automáticamente la foto real desde internet!
- Opcionalmente también podés poner \`"src": "https://..."\` si tenés el link directo de una imagen pública. Si solo ponés \`"imageQuery"\`, dejá \`"src": ""\` y el motor lo resuelve solo desde internet.

---

### ESPECIFICACIÓN EXACTA DEL JSON QUE DEBÉS GENERAR

\`\`\`json
{
  "version": "1.3.0",
  "duration": 14,
  "aspectRatio": "16:9",
  "background": "#090d16",
  "gridColor": "#1e293b",
  "nodes": [
    {
      "id": "titulo-apertura",
      "label": "Título 3D YouTube",
      "type": "text",
      "text": "EL GENIO ELÉCTRICO",
      "fontFamily": "display",
      "textVariant": "3d-pop",
      "fontSize": 42,
      "color": "#f97316",
      "accentColor": "#ffffff",
      "x": 0,
      "y": -185,
      "z": 0.2,
      "width": 520,
      "height": 90,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "foto-protagonista",
      "label": "Nikola Tesla (1890)",
      "type": "image",
      "imageQuery": "Nikola Tesla",
      "color": "#38bdf8",
      "x": 0,
      "y": 45,
      "z": 0,
      "width": 300,
      "height": 260,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "dato-vox",
      "label": "Dato Histórico",
      "type": "text",
      "text": "CORRIENTE ALTERNA (AC)",
      "fontFamily": "sans",
      "textVariant": "highlight-box",
      "fontSize": 28,
      "color": "#facc15",
      "accentColor": "#020617",
      "relativeTo": { "targetId": "foto-protagonista", "direction": "rightOf", "gap": 340 },
      "x": 640,
      "y": 45,
      "z": 0.15,
      "width": 440,
      "height": 90,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "segunda-imagen",
      "label": "Bobina de Tesla",
      "type": "image",
      "imageQuery": "Tesla coil",
      "color": "#10b981",
      "relativeTo": { "targetId": "dato-vox", "direction": "below", "gap": 180 },
      "x": 640,
      "y": 320,
      "z": 0.1,
      "width": 300,
      "height": 240,
      "initialOpacity": 0,
      "initialScale": 0
    }
  ],
  "cameraTrack": [
    {
      "at": 0.0,
      "duration": 1.1,
      "action": "moveTo",
      "x": 0,
      "y": -35,
      "zoom": 1.05,
      "rotation": 0,
      "easing": "easeOutCubic"
    },
    {
      "at": 3.0,
      "duration": 1.1,
      "action": "focusOn",
      "targetId": "dato-vox",
      "zoom": 1.2,
      "rotation": -3,
      "easing": "easeInOutCubic"
    },
    {
      "at": 5.5,
      "duration": 1.1,
      "action": "focusOn",
      "targetId": "segunda-imagen",
      "zoom": 1.25,
      "rotation": 2,
      "easing": "easeInOutCubic"
    },
    {
      "at": 8.5,
      "duration": 1.4,
      "action": "moveTo",
      "x": 300,
      "y": 80,
      "zoom": 0.72,
      "rotation": 0,
      "easing": "easeInOutCubic"
    }
  ],
  "timeline": [
    {
      "id": "anim-1",
      "at": 0.1,
      "duration": 0.85,
      "targetId": "titulo-apertura",
      "action": "popIn",
      "easing": "springBouncy",
      "params": { "overshoot": 1.35 }
    },
    {
      "id": "anim-2",
      "at": 0.35,
      "duration": 0.85,
      "targetId": "foto-protagonista",
      "action": "popIn",
      "easing": "springBouncy",
      "params": { "overshoot": 1.25 }
    },
    {
      "id": "anim-3",
      "at": 1.2,
      "duration": 10.0,
      "targetId": "foto-protagonista",
      "action": "float",
      "easing": "linear",
      "params": { "amplitude": 10, "speed": 2.0 }
    },
    {
      "id": "anim-4",
      "at": 3.2,
      "duration": 0.8,
      "targetId": "dato-vox",
      "action": "popIn",
      "easing": "springBouncy",
      "params": { "overshoot": 1.3 }
    },
    {
      "id": "anim-5",
      "at": 5.7,
      "duration": 0.85,
      "targetId": "segunda-imagen",
      "action": "popIn",
      "easing": "springBouncy",
      "params": { "overshoot": 1.3 }
    }
  ]
}
\`\`\`

### REGLAS OBLIGATORIAS PARA TU RESPUESTA:
1. **Investigá el tema y usá \`type: "image"\` con \`imageQuery\`**:
   - Poné términos concretos y fáciles de encontrar en Wikipedia/Wikimedia Commons (nombres de personas, países, inventos, empresas, planetas, animales, tecnologías, etc., preferentemente en inglés o español claro).
2. **Combiná con \`type: "text"\` en diversas fuentes y formas**:
   - \`fontFamily\`: \`"display"\`, \`"sans"\`, \`"serif"\`, \`"mono"\`, \`"handwritten"\`.
   - \`textVariant\`: \`"3d-pop"\`, \`"highlight-box"\`, \`"neon-glow"\`, \`"curved-arc"\`, \`"outline-hollow"\`, \`"pill-badge"\`.
3. **También podés usar \`type: "svg"\`** con \`icon\`: \`"brain"\`, \`"cpu"\`, \`"rocket"\`, \`"globe"\`, \`"chart"\`, \`"sparkles"\`, \`"star"\`.
4. **Posicionamiento sin superposiciones**:
   - Usá \`"relativeTo": { "targetId": "id-anterior", "direction": "rightOf" | "leftOf" | "above" | "below", "gap": 320 }\` para expandir la historia por el canvas infinito.

Generá entre 6 y 12 nodos bien coreografiados con movimientos de cámara dinámicos. Devolvé SOLO el JSON válido.`;
}

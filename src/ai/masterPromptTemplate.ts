/**
 * Responsabilidad Única: Contener y generar el Prompt Maestro listo para copiar y pegar
 * en cualquier IA externa (ChatGPT, Claude, Gemini) para que investigue el tema y arme el video
 * con estética de Arte en Papel Vintage, fotografías impresas grandes y animaciones variadas.
 */

export function buildMasterPromptForExternalAi(userTopic?: string): string {
  const topicText = userTopic?.trim()
    ? userTopic.trim()
    : '[ESCRIBÍ ACÁ TU IDEA O TEMA DEL VIDEO, EJ: "La historia de la imprenta o el Imperio Romano en estilo collage de papel"]';

  return `Actuá como un Director de Documentales de Estilo "Arte en Papel / Collage de Archivo" (estilo Johnny Harris / Vox) y Animador Experto en nuestro motor "InfiniteCanvas 2.5D".
Tu objetivo es investigar y armar la animación completa de un video en formato JSON sobre el siguiente tema:
TEMA DEL VIDEO: "${topicText}"

Debés responder ÚNICAMENTE con un bloque de código JSON válido (sin texto extra fuera del JSON).

### 1. ESTÉTICA DE ARTE EN PAPEL VINTAGE (\`backgroundStyle\`)
Usá \`"showGrid": false\` y elegí uno de estos fondos de papel con textura orgánica:
- \`"vintage-paper"\` (Papel antiguo crema collage con fibras y viñeta cálida — RECOMENDADO)
- \`"sepia-parchment"\` (Pergamino sepia histórico estilo 1890)
- \`"newsprint-aged"\` (Papel de prensa / diario antiguo)
- \`"walnut-archive"\` (Mesa de madera oscura de archivo donde resaltan las fotos crema)

Usá colores de tinta clásica para la propiedad \`color\` de los nodos:
- Rojo lacre: \`"#8b261d"\` | Azul de Prusia: \`"#1d3557"\` | Sepia cobre: \`"#7f4f24"\` | Verde imprenta: \`"#26463b"\` | Carbón: \`"#1e1610"\`.

### 2. FOTOGRAFÍAS REALES DE CALIDAD (\`type: "image"\`) — CERO SVGs PERSONALIZADOS
- **PROHIBIDO usar \`"type": "svg"\`, \`"type": "shape"\` o íconos vectoriales dibujados.** El 100% de los elementos visuales de todas las escenas deben ser \`"type": "image"\` con fotografías reales o láminas editoriales/históricas de alta calidad.
- ¡Hacé las imágenes GRANDES y protagonistas! Usá tamaños entre \`"width": 520, "height": 410\` y \`"width": 600, "height": 440\`, con una leve rotación orgánica de papel (\`"initialRotation": -1.6\` o \`1.5\`).
- Usá \`"imageQuery"\` con términos **precisos, descriptivos y sin ambigüedad** que correspondan exactamente a lo que se está narrando en esa escena (ej: \`"Camellia sinensis botanical illustration"\`, \`"Nikola Tesla portrait"\`, \`"Roman Colosseum architecture"\` — evitá palabras sueltas ambiguas que puedan traer fotos fuera de tema) o incluí un \`"src"\` directo verificado de Wikimedia Commons. Cada escena debe tener una imagen visualmente coherente con la frase hablada.

### 3. ESTILOS DE TEXTO EDITORIAL / PAPEL (\`textVariant\`)
- \`"clean-subtitle"\`: Título en serif grande + línea divisoria + fecha mecanografiada en \`"subtitle"\`.
- \`"vintage-stamp"\`: Sello de archivo rectangular doble en tinta.
- \`"editorial-paper"\`: Ficha de papel recortado color crema (ideal para subtítulos narrativos abajo).
- \`"highlight-box"\`: Tira de papel ocre resaltada.
- \`"3d-pop"\`: Titular de prensa antigua con doble filete inferior.

### 4. LAYOUT INTELIGENTE ANTI-SOLAPAMIENTO (\`relativeTo\` + \`autoAvoidOverlap\`)
- Poné \`"autoAvoidOverlap": true\` en la raíz de la escena para que el motor garantice separación real entre textos, cintas kraft y fotografías.
- En lugar de adivinar coordenadas a ojo, anclá cada título y subtítulo a la fotografía de su escena con \`"relativeTo"\`:
  - Título al costado derecho: \`"relativeTo": { "targetId": "foto-archivo-1", "direction": "rightOf", "gap": 54 }\` + \`"textAlign": "left"\`
  - Título al costado izquierdo: \`"relativeTo": { "targetId": "foto-archivo-1", "direction": "leftOf", "gap": 54 }\` + \`"textAlign": "right"\` (o \`"center"\`)
  - Título centrado arriba: \`"relativeTo": { "targetId": "foto-archivo-1", "direction": "above", "gap": 46 }\` + \`"textAlign": "center"\`
  - Subtítulo narrativo centrado debajo: \`"relativeTo": { "targetId": "foto-archivo-1", "direction": "below", "gap": 44, "align": "keepAxis" }\` (conservando su \`x\` centrado en la escena).

### 5. VARIEDAD DE ANIMACIONES (\`timeline\`)
Alterná entre: \`"slideInLeft"\`, \`"slideInRight"\`, \`"slideInUp"\`, \`"slideInDown"\`, \`"flipIn3D"\`, \`"blurFadeIn"\`, \`"unfoldWidth"\`, \`"popIn"\`, \`"typewriter"\`, y movimientos suaves de papel como \`"float"\`, \`"pendulum"\`, \`"orbit"\` y \`"pulse"\`.

### EJEMPLO DE ESCENA JSON EN ARTE PAPEL:
\`\`\`json
{
  "version": "1.6.0",
  "duration": 15,
  "aspectRatio": "16:9",
  "backgroundStyle": "vintage-paper",
  "background": "#f4ecdc",
  "backgroundSecondary": "#d7c6a9",
  "showGrid": false,
  "autoAvoidOverlap": true,
  "gridColor": "#cbbba0",
  "nodes": [
    {
      "id": "foto-archivo-1",
      "label": "Archivo Histórico • 1896",
      "type": "image",
      "imageQuery": "Nikola Tesla",
      "icon": "portrait",
      "color": "#8b261d",
      "x": -280,
      "y": -35,
      "z": 0,
      "width": 520,
      "height": 410,
      "initialRotation": -1.6,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "titulo-imprenta-1",
      "label": "Nikola Tesla",
      "type": "text",
      "text": "Nikola Tesla",
      "subtitle": "1856–1943 • Archivo Smiljan",
      "fontFamily": "serif",
      "textVariant": "clean-subtitle",
      "textAlign": "left",
      "fontSize": 44,
      "color": "#8b261d",
      "accentColor": "#1e1610",
      "relativeTo": { "targetId": "foto-archivo-1", "direction": "rightOf", "gap": 54 },
      "x": 45,
      "y": -35,
      "z": 0.1,
      "width": 560,
      "height": 116,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "ficha-narracion-1",
      "label": "Narración 1",
      "type": "text",
      "text": "Sus patentes polifásicas encendieron la segunda revolución industrial.",
      "fontFamily": "serif",
      "textVariant": "editorial-paper",
      "fontSize": 21,
      "color": "#8b261d",
      "relativeTo": { "targetId": "foto-archivo-1", "direction": "below", "gap": 44, "align": "keepAxis" },
      "x": 0,
      "y": 250,
      "z": 0.08,
      "width": 900,
      "height": 74,
      "initialOpacity": 0,
      "initialScale": 0
    }
  ],
  "cameraTrack": [
    {
      "at": 0,
      "duration": 1.2,
      "action": "moveTo",
      "x": 0,
      "y": 0,
      "zoom": 1.0,
      "rotation": 0,
      "easing": "easeOutCubic"
    }
  ],
  "timeline": [
    {
      "id": "a1",
      "at": 0.1,
      "duration": 0.85,
      "targetId": "foto-archivo-1",
      "action": "slideInLeft",
      "easing": "easeOutCubic"
    },
    {
      "id": "a2",
      "at": 0.3,
      "duration": 0.8,
      "targetId": "titulo-imprenta-1",
      "action": "blurFadeIn",
      "easing": "easeOutCubic"
    },
    {
      "id": "a3",
      "at": 0.45,
      "duration": 2.4,
      "targetId": "ficha-narracion-1",
      "action": "typewriter"
    }
  ]
}
\`\`\`

Devolvé SOLO el bloque JSON válido.`;
}

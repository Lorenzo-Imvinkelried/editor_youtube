/**
 * Responsabilidad Única: Contener y generar el Prompt Maestro listo para copiar y pegar
 * en cualquier IA externa (ChatGPT, Claude, Gemini) para que investigue el tema,
 * use múltiples tipos de animaciones y layouts variados (incluyendo estilo Niels Bohr)
 * y devuelva todo el video en formato JSON (`scene.dsl.json`).
 */

export function buildMasterPromptForExternalAi(userTopic?: string): string {
  const topicText = userTopic?.trim()
    ? userTopic.trim()
    : '[ESCRIBÍ ACÁ TU IDEA O TEMA DEL VIDEO, EJ: "Historia de la Física Cuántica y Niels Bohr"]';

  return `Actuá como un Agente Investigador, Director de Documentales y Animador Experto en nuestro motor "InfiniteCanvas 2.5D".
Tu objetivo es investigar y armar la animación completa de un video en formato JSON sobre el siguiente tema:
TEMA DEL VIDEO: "${topicText}"

Debés responder ÚNICAMENTE con un bloque de código JSON válido (sin texto extra fuera del JSON).

### 1. ESTÉTICA Y FONDOS SIN LÍNEAS (\`backgroundStyle\`)
Usá \`"showGrid": false\` y elegí uno de estos fondos cinematográficos con degradado radial y partículas:
- \`"midnight-bohr"\` (Azul noche profundo radial estilo documental Niels Bohr — recomendado)
- \`"deep-space"\` (Violeta cósmico profundo)
- \`"emerald-studio"\` (Verde esmeralda oscuro)
- \`"amber-vintage"\` (Ámbar documental histórico)
- \`"obsidian-clean"\` (Negro obsidiana minimalista)

### 2. VARIEDAD DE ANIMACIONES EN \`timeline\` (¡NO USES SIEMPRE LA MISMA!)
Alterná entre estas animaciones de entrada y movimiento continuo para que cada escena sea distinta:
- **Entradas (\`action\`)**:
  - \`"flipIn3D"\`: Giro de tarjeta en perspectiva 3D horizontal.
  - \`"slideInLeft"\` / \`"slideInRight"\` / \`"slideInUp"\` / \`"slideInDown"\`: Entrada deslizante con desaceleración suave.
  - \`"unfoldWidth"\`: Despliegue horizontal de banner/título.
  - \`"blurFadeIn"\`: Aparición cinematográfica suave con zoom.
  - \`"spiralIn"\`: Entrada en espiral con rotación.
  - \`"popIn"\`: Efecto Pop-Up con rebote elástico (\`easing: "springBouncy"\`).
  - \`"typewriter"\`: Escritura progresiva letra por letra (ideal para subtítulos narrativos).
- **Movimientos continuos (\`action\`)**:
  - \`"float"\` (levitación vertical), \`"orbit"\` (órbita circular suave), \`"pendulum"\` (balanceo de péndulo), \`"neonFlicker"\` (parpadeo eléctrico), \`"pulse"\` (latido de escala), \`"wiggle"\` (sacudida), \`"spin"\` (giro 360°).

### 3. BÚSQUEDA AUTOMÁTICA DE IMÁGENES (\`imageQuery\` o \`src\`) Y TARJETAS ESTILO NIELS BOHR
- En nodos \`"type": "image"\`: poné \`"imageQuery": "Nombre exacto en Wikipedia"\` (ej. \`"Niels Bohr"\`, \`"Nikola Tesla"\`, \`"Wardenclyffe Tower"\`) o una URL directa en \`"src"\`, y \`"icon": "portrait"\` (mientras carga o si no hay foto, dibuja una silueta minimalista de neón azul estilo Niels Bohr).
- En nodos \`"type": "text"\`: podés usar \`"textVariant": "clean-subtitle"\` con \`"text": "Niels Bohr"\`, \`"subtitle": "1885–1962"\` y \`"textAlign": "left"\` ubicado a la derecha de la tarjeta para lograr el diseño exacto de documental moderno, además de \`"3d-pop"\`, \`"highlight-box"\`, \`"neon-glow"\`, \`"curved-arc"\` y \`"pill-badge"\`.

### EJEMPLO DE ESTRUCTURA JSON DEL VIDEO:
\`\`\`json
{
  "version": "1.4.0",
  "duration": 15,
  "aspectRatio": "16:9",
  "backgroundStyle": "midnight-bohr",
  "background": "#13203d",
  "backgroundSecondary": "#050811",
  "showGrid": false,
  "gridColor": "#1e293b",
  "nodes": [
    {
      "id": "retrato-bohr",
      "label": "Niels Bohr",
      "type": "image",
      "imageQuery": "Niels Bohr",
      "icon": "portrait",
      "color": "#38bdf8",
      "x": -180,
      "y": -30,
      "z": 0,
      "width": 220,
      "height": 275,
      "initialOpacity": 0,
      "initialScale": 0
    },
    {
      "id": "titulo-bohr",
      "label": "Niels Bohr 1885-1962",
      "type": "text",
      "text": "Niels Bohr",
      "subtitle": "1885–1962",
      "fontFamily": "sans",
      "textVariant": "clean-subtitle",
      "textAlign": "left",
      "fontSize": 42,
      "color": "#38bdf8",
      "accentColor": "#ffffff",
      "x": -30,
      "y": -35,
      "z": 0.15,
      "width": 460,
      "height": 100,
      "initialOpacity": 0,
      "initialScale": 0
    }
  ],
  "cameraTrack": [
    {
      "at": 0,
      "duration": 1.1,
      "action": "moveTo",
      "x": 0,
      "y": 0,
      "zoom": 1.05,
      "rotation": 0,
      "easing": "easeOutCubic"
    }
  ],
  "timeline": [
    {
      "id": "a1",
      "at": 0.1,
      "duration": 0.85,
      "targetId": "retrato-bohr",
      "action": "flipIn3D",
      "easing": "springSmooth"
    },
    {
      "id": "a2",
      "at": 0.3,
      "duration": 0.8,
      "targetId": "titulo-bohr",
      "action": "slideInRight",
      "easing": "easeOutCubic"
    },
    {
      "id": "a3",
      "at": 1.0,
      "duration": 8.0,
      "targetId": "retrato-bohr",
      "action": "orbit",
      "params": { "radius": 8, "speed": 1.8 }
    }
  ]
}
\`\`\`

Armá el video completo combinando distintos layouts y animaciones variadas. Devolvé SOLO el JSON válido.`;
}

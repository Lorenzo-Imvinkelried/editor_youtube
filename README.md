# InfiniteCanvas AI — Editor de Video para YouTube por DSL

Editor de video y animador de escenas sobre un **canvas cuasi infinito 2.5D**, controlado mediante un lenguaje declarativo en JSON (**MotionCanvas-DSL**) diseñado para trabajar junto a agentes de IA y producir videos documentales o explicativos listos para **YouTube (16:9)** y **YouTube Shorts (9:16)**.

---

## Características principales

- **Motor determinista en Canvas 2D (60 FPS)**: evalúa cualquier instante `t` de forma pura (`renderFrame`), con cámara virtual 2.5D, profundidad `z` con parallax, auto-encuadre matemático por escena y ajuste automático de textos sin desbordes.
- **Simulador de pantalla YouTube**: previsualización exacta en **16:9 (1920×1080)** y **Shorts 9:16 (1080×1920)** con HUD de reproducción y recorte fiel al cuadro final.
- **Estética documental y fondos configurables**: presets de arte en papel vintage (`vintage-paper`, `sepia-parchment`, `newsprint-aged`, `walnut-archive`), estilos limpios (`midnight-bohr`, `obsidian-clean`) y color personalizado.
- **Lenguaje declarativo (DSL) + Prompt Maestro para IA**:
  - Editá la escena directamente en JSON, desde el chat de IA local o copiando el **Prompt Maestro** hacia cualquier LLM externo (ChatGPT, Claude, Gemini) para importar un video completo.
  - Soporta posicionamiento relativo (`rightOf`, `leftOf`, `above`, `below`), 9 variantes tipográficas (`editorial-paper`, `vintage-stamp`, `clean-subtitle`, `highlight-box`, `3d-pop`, etc.) y más de 20 primitivas de animación (`popIn`, `typewriter`, `flipIn3D`, `slideIn*`, `float`, `orbit`, `pendulum`, `pulse`, entre otras).
- **Imágenes reales desde internet sin errores CORS**: especificá `imageQuery` en cualquier nodo de imagen para buscar automáticamente en **Wikipedia / Wikimedia Commons** con proxy CORS seguro para que la exportación a MP4 nunca falle.
- **Audio y narración automática con ElevenLabs**:
  - Cargá una pista de audio local/externa o generá la locución escena por escena con el cliente integrado de **ElevenLabs**.
  - Incluye catálogo de **12 voces oficiales `premade` habilitadas en plan gratuito**, escucha previa sin consumir créditos, ensamblado en **WAV maestro a 44.1 kHz** y re-sincronización automática del timeline a la duración hablada real.
- **Exportación a MP4 en 60 FPS constantes**: renderizado determinista cuadro por cuadro con **WebCodecs (`VideoEncoder`) + `mp4-muxer`** mezclando video y pista de audio.
- **Aislamiento por proyecto**: cada video vive en su propia carpeta dentro de `projects/<project-id>/` con manifiesto, escena DSL, historial de chat, assets y exportaciones independientes.

---

## Requisitos previos

- **Node.js** 18 o superior y **npm**.
- Navegador basado en Chromium (**Chrome, Edge o Brave**) recomendado para la exportación determinista a MP4 mediante **WebCodecs**.

---

## Inicio rápido

```bash
# 1. Clonar el repositorio
git clone https://github.com/Lorenzo-Imvinkelried/editor_youtube.git
cd editor_youtube

# 2. Instalar dependencias
npm install

# 3. Levantar el entorno de desarrollo
npm run dev
```

Abrí `http://localhost:5173` en tu navegador.

### Scripts disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo de Vite en el puerto `5173`. |
| `npm run typecheck` | Ejecuta verificación estricta de tipos (`tsc --noEmit`). |
| `npm run build` | Compila TypeScript y genera el bundle de producción en `dist/`. |
| `npm run preview` | Previsualiza localmente el build de producción. |

---

## Configuración opcional de ElevenLabs (TTS)

Para usar la narración automática no hace falta modificar el código: podés pegar tu API Key secreta de ElevenLabs (`sk_...`) directamente en el modal de **Audio → Narrador ElevenLabs** (se guarda únicamente en `localStorage` de tu navegador).

Si preferís precargarla en desarrollo local, creá un archivo `.env.local` (ignorado por Git):

```env
VITE_ELEVENLABS_API_KEY=sk_tu_clave_secreta
```

---

## Cómo crear un video paso a paso

1. **Elegí o creá un proyecto** desde el selector superior (cada proyecto mantiene su escena, audio e historial aislados).
2. **Construí la escena** usando una de tres vías:
   - **Prompt Maestro**: generá el prompt listo para pegar en ChatGPT/Claude/Gemini e importá el JSON resultante.
   - **Chat de IA / Inspector**: ajustá nodos, textos, imágenes (`imageQuery` o URL) y formato (`16:9` o `9:16`).
   - **Editor DSL**: editá el JSON de la escena en vivo con validación automática.
3. **Agregá voz o música** desde el modal de **Audio** (subiendo un MP3/WAV o generando locución sincronizada con ElevenLabs).
4. **Exportá a MP4** desde el modal de exportación en resolución nativa (`1920×1080` o `1080×1920`) a `60 FPS`.

---

## Ejemplo mínimo del DSL

```json
{
  "version": "1.3.0",
  "duration": 8,
  "aspectRatio": "16:9",
  "backgroundStyle": "vintage-paper",
  "background": "#f3ebd9",
  "gridColor": "#d6c8ad",
  "nodes": [
    {
      "id": "titulo",
      "label": "Título",
      "type": "text",
      "text": "La era de la corriente alterna",
      "subtitle": "1888",
      "fontFamily": "serif",
      "textVariant": "editorial-paper",
      "fontSize": 56,
      "color": "#1f1a17",
      "x": 0,
      "y": -220,
      "z": 0.1,
      "width": 760,
      "height": 140
    },
    {
      "id": "foto-tesla",
      "label": "Nikola Tesla",
      "type": "image",
      "imageQuery": "Nikola Tesla portrait",
      "color": "#1f1a17",
      "x": 0,
      "y": 90,
      "z": 0,
      "width": 520,
      "height": 380
    }
  ],
  "cameraTrack": [
    { "at": 0, "duration": 1.2, "action": "focusOn", "targetId": "foto-tesla", "zoom": 1, "easing": "easeInOutCubic" }
  ],
  "timeline": [
    { "id": "a1", "at": 0.2, "duration": 0.8, "targetId": "titulo", "action": "typewriter" },
    { "id": "a2", "at": 0.6, "duration": 0.9, "targetId": "foto-tesla", "action": "popIn", "easing": "springBouncy" }
  ]
}
```

---

## Proyectos incluidos

El repositorio incluye 3 proyectos demo públicos en `projects/` (todos los demás proyectos privados creados en `projects/<id>/` y cualquier video/audio exportado son descubiertos automáticamente en local por el editor pero ignorados en `.gitignore` para no subirse a GitHub):

| Proyecto | Duración | Descripción |
| --- | --- | --- |
| `projects/historia-nikola-tesla-10m/` | 10 min (600s) | Documental completo en 10 capítulos y 80 escenas con imágenes históricas buscadas automáticamente. |
| `projects/explicacion-ia-cerebro/` | 10s | Video explicativo estilo Kurzgesagt/Vox sobre redes neuronales en canvas 2.5D. |
| `projects/lanzamiento-startup-fintech/` | 8s | Reel dinámico con recorridos rápidos de cámara, métricas y animaciones pop-up. |

---

## Arquitectura del proyecto

El código sigue estrictamente el **Principio de Responsabilidad Única (SRP)** separando motor gráfico, DSL, IA, gestión de proyectos e interfaz React:

```text
├── .agents/rules/      # Reglas de arquitectura (SRP) y convención de commits en Git
├── projects/           # Proyectos de video autocontenidos e independientes
└── src/
    ├── dsl/            # Tipos, validador, resolución de layout relativo y referencia del DSL
    ├── engine/         # Motor determinista Canvas 2D (0% React): cámara, texto, imágenes, TTS y MP4
    ├── projects/       # Repositorio y carga aislada de proyectos
    ├── ai/             # Prompt maestro, system prompt y compilador de instrucciones a DSL
    ├── ui/             # Paneles y modales de la interfaz en React
    └── shared/         # Utilidades matemáticas puras y generadores de ID
```

Para el mapa completo archivo por archivo y las reglas de contribución (SRP y formato de commits en español imperativo), consultá [`AGENTS.md`](./AGENTS.md), [`.agents/rules/architecture.md`](./.agents/rules/architecture.md) y [`.agents/rules/git-commits.md`](./.agents/rules/git-commits.md).

---

## Stack tecnológico

- **TypeScript** (Strict Mode)
- **React 19** + **Vite 6**
- **Canvas 2D API** (motor gráfico y tipográfico propio)
- **WebCodecs (`VideoEncoder`)** + **`mp4-muxer`** (exportación determinista MP4 a 60 FPS)
- **Lucide React** (iconografía de interfaz)

# Guía Maestro del Proyecto para Agentes de IA (`AGENTS.md`)

Bienvenido al repositorio del **Editor de Videos / Animador de Imágenes en Canvas Infinito impulsado por IA**.
Este archivo sirve como mapa mental rápido para que cualquier IA comprenda de inmediato cómo está organizado el proyecto y qué reglas debe respetar.

## 1. Reglas Obligatorias (`.agents/rules/`)
- **[Convención de Git](./.agents/rules/git-commits.md)**: Todos los commits y pushes DEBEN escribirse en **español en modo IMPERATIVO** (`Agrega`, `Refacciona`, `Corrige`, `Actualiza`, `Elimina`) e incluir obligatoriamente un **body explicando el porqué** de la decisión.
- **[Arquitectura y SRP](./.agents/rules/architecture.md)**: Cada archivo tiene **una única responsabilidad**. Está prohibido mezclar motor de renderizado, gramática del DSL, gestión de proyectos y componentes React en un mismo archivo.

## 2. Stack Tecnológico Elegido y Justificación
- **Lenguaje**: **TypeScript (Strict Mode)** — Garantiza contratos exactos entre el lenguaje interno (DSL) que genera la IA y el motor de animación.
- **Bundler / Entorno**: **Vite + React** — Para la interfaz de usuario del editor (paneles, línea de tiempo, chat de IA, explorador de proyectos aislados).
- **Motor Gráfico (`src/engine/`)**: **Canvas 2D acelerado con Cámara Virtual 2.5D y Físicas Spring deterministas** (desacoplado de React). Evalúa cualquier instante `t` (en segundos) de forma pura `renderFrame(scene, t)`, lo que permite tanto previsualizar a 60 FPS como exportar video frame a frame con precisión matemática.
- **Lenguaje Interno (`src/dsl/`)**: **JSON Declarativo Tipado (MotionCanvas-DSL)** con posicionamiento absoluto/relativo (`rightOf`, `below`, `center`), cámara virtual (`focusOn`, `moveTo`, `zoomTo`, `shake`) y primitivas de animación de alto nivel (`popIn`, `popOut`, `float`, `wiggle`, `pulse`, `orbit`, `typewriter`).

## 3. Mapa de Directorios

```text
EDITOR/
├── .agents/
│   └── rules/
│       ├── git-commits.md               # Regla: Español Imperativo + Body con el "porqué"
│       └── architecture.md              # Regla: SRP y aislamiento por proyecto de video
├── projects/                            # Contenedor raíz de proyectos de video aislados
│   └── <project-id>/                    # Cada video tiene su carpeta 100% independiente
│       ├── project.manifest.json        # Configuración del video (FPS, resolución, autor, fechas)
│       ├── scene.dsl.json               # Escena del canvas infinito y línea de tiempo en DSL
│       ├── chat.history.json            # Historial de prompts de IA exclusivo de este video
│       ├── assets/                      # Recursos multimedia exclusivos de este proyecto
│       │   ├── images/
│       │   ├── svgs/
│       │   └── audio/
│       └── exports/                     # Videos/snapshots renderizados de este proyecto
└── src/
    ├── shared/                          # Utilidades puras sin estado
    │   ├── math.ts                      # Interpolación, vectores, matrices 2.5D
    │   └── id.ts                        # Generador de identificadores únicos
    ├── dsl/                             # Lenguaje interno del editor (lo que lee/escribe la IA)
    │   ├── dslTypes.ts                  # Contratos TypeScript de nodos, cámara y acciones
    │   ├── dslValidator.ts              # Validación y sanitización del DSL generado por IA
    │   ├── layoutResolver.ts            # Resuelve posiciones relativas (rightOf, below, etc.)
    │   └── dslReference.ts              # Especificación del lenguaje para el System Prompt del LLM
    ├── engine/                          # Motor determinista del Canvas Infinito (0% React)
    │   ├── easings.ts                   # Curvas cubic-bezier y físicas de resorte (spring pop-up)
    │   ├── svgIcons.ts                  # Íconos vectoriales nativos dibujados en Canvas 2D
    │   ├── textMeasure.ts               # Medición y salto de línea automático para ajuste de textos
    │   ├── textLayout.ts                # Cálculo de cajas tipográficas y extensión real dibujada
    │   ├── textRenderer.ts              # Renderiza textos editoriales y sellos vintage dentro de su caja
    │   ├── nodeBounds.ts                # Calcula cajas envolventes (bounding boxes) con rotación y animaciones
    │   ├── sceneOverlapSolver.ts        # Resuelve relativeTo exacto y elimina solapamientos entre texto e imagen
    │   ├── cameraAutoFramer.ts          # Encuadra y centra automáticamente cada toma dentro del margen seguro
    │   ├── cameraEvaluator.ts           # Calcula posición (x,y), zoom, rotación y parallax 2.5D
    │   ├── nodeEvaluator.ts             # Calcula estado visual de cada imagen/SVG/texto en el segundo t
    │   ├── backgroundRenderer.ts        # Fondos de papel antiguo con grano procedural y viñeta
    │   ├── imageCache.ts                # Carga asíncrona y caché CORS-safe de imágenes externas
    │   ├── internetImageSearch.ts       # Búsqueda de imágenes en Wikipedia/Wikimedia y proxy CORS
    │   ├── audioController.ts           # Sincronización multipista (voz + música) con el reloj del timeline
    │   ├── audioPersistenceStore.ts     # Persistencia local en IndexedDB para conservar voz y música tras F5
    │   ├── musicLoopBuilder.ts          # Motor DSP de bucle instrumental inteligente (trim, crossfade, fades)
    │   ├── youtubeFrameOverlay.ts       # Simulador de pantalla YouTube 16:9 y Shorts 9:16 con HUD
    │   ├── narrationExtractor.ts        # Extrae guion por escena y re-sincroniza tiempos a la voz real
    │   ├── elevenLabsClient.ts          # Cliente TTS de ElevenLabs, catálogo premade y pista maestra WAV
    │   ├── mp4Exporter.ts               # Codificador determinista 60 FPS a MP4 con WebCodecs y audio
    │   └── canvasRenderer.ts            # Dibuja fotografías en papel, láminas de patente y recorte de cuadro
    ├── projects/                        # Gestión aislada de cada proyecto de video
    │   ├── projectTypes.ts              # Estructura de un paquete de proyecto aislado
    │   ├── defaultProjects.ts           # Proyectos semilla autocontenidos
    │   └── projectRepository.ts         # Repositorio de proyectos (aislamiento, exportación JSON/bundle)
    ├── ai/                              # Cerebro de IA que traduce prompts al lenguaje DSL
    │   ├── systemPromptBuilder.ts       # Construye el contexto exacto del proyecto actual para el LLM
    │   ├── masterPromptTemplate.ts      # Generador de Prompt Maestro para copiar/pegar en LLMs externos
    │   └── promptToDslEngine.ts         # Intérprete local + conector API LLM para editar la escena por chat
    └── ui/                              # Interfaz profesional del editor dividida por panel y modal
        ├── project-switcher/            # Selector y creador de proyectos aislados
        ├── canvas-viewport/             # Visor interactivo del canvas cuasi infinito
        ├── ai-chat-panel/               # Chat de IA que modifica el DSL del proyecto activo
        ├── ai-prompt-modal/             # Modal de Prompt Maestro e importación/exportación JSON
        ├── audio-modal/                 # Gestor de pista de audio y narrador automático ElevenLabs
        ├── export-modal/                # Modal de renderizado y descarga de video MP4 a 60 FPS
        ├── image-search-modal/          # Buscador visual de imágenes de archivo en internet
        ├── dsl-code-panel/              # Editor en vivo del lenguaje interno (DSL)
        ├── timeline-panel/              # Línea de tiempo multipista y controles de reproducción
        └── inspector-panel/             # Propiedades del nodo seleccionado y carpeta de assets del proyecto
```

## 4. Flujo Obligatorio al Crear Nuevos Proyectos de Video
Antes de generar el `scene.dsl.json` de cualquier proyecto de video nuevo, el agente DEBE preguntar al usuario cómo quiere armar la **introducción** (además del tono, estética y variante de español):
- Si desea incluir una **intro de presentación del canal/personaje** (ej. saludo, origen o sello personal del canal como *Juana La Sana*) o arrancar directo con el gancho del tema.
- Qué orden y duración prefiere para los primeros segundos (ej. gancho del tema en `00:00–00:07` + presentación breve en `00:07–00:15`), asegurando que los nodos de intro usen prefijo `intro-*` y que el Capítulo 1 no repita el saludo.

### Regla Obligatoria de Recursos Visuales (Cero SVGs Personalizados)
- **PROHIBIDO crear nodos `type: "svg"` o dibujar íconos/vectores personalizados** (como `brain`, `sparkles`, `chart`, `bolt`, `globe`, `star`, `rocket`, etc.).
- **100% de los elementos visuales deben ser `type: "image"`** usando fotografías reales, láminas botánicas/históricas o ilustraciones de buena calidad obtenidas de fuentes externas confiables (ej. Wikimedia Commons / Wikipedia con URLs directas `wikimedia.org` verificadas con `HTTP 200` y CORS abierto).
- **Coherencia temática estricta**: antes de escribir el `scene.dsl.json`, el agente debe verificar el título/archivo real de cada imagen para garantizar que tenga alta calidad visual y corresponda exactamente a lo que se está narrando en esa escena (nunca confiar a ciegas en búsquedas ambiguas que devuelven fotos fuera de tema).

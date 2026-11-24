---
trigger: always_on
description: Reglas de arquitectura modular, separación de responsabilidades (SRP) y aislamiento de datos por proyecto de video.
---

# Arquitectura, Separación de Responsabilidades y Aislamiento de Proyectos

Este repositorio está diseñado para que cualquier agente de IA o desarrollador entienda la estructura en segundos y pueda modificar una parte sin romper otra.

## 1. Principio de Responsabilidad Única (SRP) por Archivo y Carpeta
- **Un archivo = Una responsabilidad clara**. Ningún archivo debe mezclar lógica de renderizado de canvas, validación del DSL, almacenamiento de proyectos y componentes de interfaz (UI).
- **Límite orientativo**: Evitar archivos monolíticos (>250 líneas). Si un módulo crece, dividirlo en submódulos cohesivos dentro de su dominio.
- **Nombres autoexplicativos**: Los nombres de archivos deben describir exactamente qué hacen (`cameraController.ts`, `dslParser.ts`, `springPhysics.ts`, `projectRepository.ts`).

## 2. Estructura de Capas del Editor (`src/`)
- `src/dsl/`: Gramática, tipos, esquemas Zod/JSON, parser, validador y documentación del lenguaje interno de animación que escribe la IA.
- `src/engine/`: Motor de renderizado del canvas cuasi infinito, cámara virtual 2.5D (pan, zoom, tilt, parallax), reloj de reproducción (timeline clock) y físicas/easings (`popIn`, `float`, `wiggle`, `spring`). **Cero dependencia de React/UI**.
- `src/projects/`: Gestión de proyectos aislados (creación, carga, guardado, importación/exportación de paquetes de proyecto).
- `src/ai/`: Prompts de sistema, generador de instrucciones del DSL para LLMs y adaptadores de chat IA.
- `src/ui/`: Componentes visuales del editor divididos en paneles (`canvas-viewport/`, `timeline-bar/`, `ai-chat-panel/`, `project-explorer/`, `inspector-panel/`).
- `src/shared/`: Utilidades matemáticas puras (`math.ts`, `color.ts`, `id.ts`).

## 3. Aislamiento Estricto por Proyecto de Video (`projects/<project-id>/`)
Cada video es un **proyecto independiente y autocontenido** (como en Premiere, After Effects o DaVinci Resolve). Nunca se deben mezclar assets, historiales de chat ni timelines entre distintos videos.

Cada proyecto vive en su propio contenedor lógico/carpeta con la siguiente estructura estándar:
```text
projects/<project-id>/
├── project.manifest.json    # Metadatos del proyecto (id, nombre, resolución, fps, fecha, versión del DSL)
├── scene.dsl.json           # Script en el lenguaje interno (nodos del canvas infinito, cámara y timeline)
├── chat.history.json        # Historial de prompts y respuestas del asistente IA de este proyecto
├── assets/                  # Archivos exclusivos de este proyecto
│   ├── images/              # Imágenes generadas por IA / PNGs sin fondo
│   ├── svgs/                # Vectores e íconos del proyecto
│   └── audio/               # Locuciones (TTS), música y efectos de sonido
└── exports/                 # Renders finales y snapshots generados para este video
```

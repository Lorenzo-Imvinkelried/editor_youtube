/**
 * Responsabilidad Única: Gestionar el ciclo de vida, aislamiento de almacenamiento
 * y exportación independiente de cada proyecto de video.
 * Cada proyecto se persiste bajo su propia clave `infinite_editor.project.<id>`
 * para que ningún dato se mezcle entre proyectos.
 */

import { slugifyProjectId } from '../shared/id';
import { SEED_PROJECTS } from './defaultProjects';
import { VideoProjectBundle } from './projectTypes';

const INDEX_STORAGE_KEY = 'infinite_editor.project_index.v7';
const PROJECT_KEY_PREFIX = 'infinite_editor.project_bundle.v7.';

export function loadAllIsolatedProjects(): VideoProjectBundle[] {
  try {
    const rawIndex = localStorage.getItem(INDEX_STORAGE_KEY);
    if (!rawIndex) {
      saveAllIsolatedProjects(SEED_PROJECTS);
      return SEED_PROJECTS;
    }

    const projectIds = JSON.parse(rawIndex) as string[];
    const loaded: VideoProjectBundle[] = [];

    for (const id of projectIds) {
      const rawBundle = localStorage.getItem(`${PROJECT_KEY_PREFIX}${id}`);
      if (rawBundle) {
        loaded.push(JSON.parse(rawBundle) as VideoProjectBundle);
      }
    }

    if (loaded.length === 0) {
      saveAllIsolatedProjects(SEED_PROJECTS);
      return SEED_PROJECTS;
    }

    return loaded;
  } catch {
    return SEED_PROJECTS;
  }
}

export function saveSingleIsolatedProject(bundle: VideoProjectBundle): void {
  const updatedBundle: VideoProjectBundle = {
    ...bundle,
    manifest: {
      ...bundle.manifest,
      updatedAt: new Date().toISOString()
    }
  };
  localStorage.setItem(`${PROJECT_KEY_PREFIX}${bundle.manifest.id}`, JSON.stringify(updatedBundle));
}

export function saveAllIsolatedProjects(bundles: VideoProjectBundle[]): void {
  const ids = bundles.map((b) => b.manifest.id);
  localStorage.setItem(INDEX_STORAGE_KEY, JSON.stringify(ids));
  for (const bundle of bundles) {
    saveSingleIsolatedProject(bundle);
  }
}

export function createIsolatedProjectBundle(name: string, description: string): VideoProjectBundle {
  const id = slugifyProjectId(name);
  const now = new Date().toISOString();

  return {
    directoryPath: `projects/${id}/`,
    manifest: {
      id,
      name,
      description: description || 'Proyecto de animación en canvas infinito',
      createdAt: now,
      updatedAt: now,
      resolution: { width: 1920, height: 1080 },
      fps: 60,
      durationSeconds: 10,
      dslVersion: '1.0.0',
      paths: {
        scene: 'scene.dsl.json',
        chatHistory: 'chat.history.json',
        assetsDir: 'assets/',
        exportsDir: 'exports/'
      }
    },
    scene: {
      version: '1.5.0',
      duration: 10,
      aspectRatio: '16:9',
      backgroundStyle: 'vintage-paper',
      background: '#f4ecdc',
      backgroundSecondary: '#d7c6a9',
      showGrid: false,
      gridColor: '#cbbba0',
      nodes: [
        {
          id: 'foto-principal',
          label: name,
          type: 'image',
          imageQuery: 'Nikola Tesla',
          icon: 'portrait',
          color: '#8b261d',
          x: -240,
          y: -20,
          z: 0,
          width: 520,
          height: 420,
          initialRotation: -1.8,
          initialOpacity: 0,
          initialScale: 0
        },
        {
          id: 'titulo-inicial',
          label: name,
          type: 'text',
          text: name,
          subtitle: 'Archivo Documental',
          fontFamily: 'serif',
          textVariant: 'clean-subtitle',
          textAlign: 'left',
          fontSize: 44,
          color: '#8b261d',
          accentColor: '#1e1610',
          x: 70,
          y: -30,
          z: 0.14,
          width: 560,
          height: 110,
          initialOpacity: 0,
          initialScale: 0
        }
      ],
      cameraTrack: [
        {
          at: 0,
          duration: 1.0,
          action: 'moveTo',
          x: 0,
          y: -15,
          zoom: 1.0,
          rotation: 0,
          easing: 'easeOutCubic'
        }
      ],
      timeline: [
        {
          id: 'init-pop',
          at: 0.12,
          duration: 0.85,
          targetId: 'foto-principal',
          action: 'slideInLeft',
          easing: 'easeOutCubic'
        },
        {
          id: 'init-title',
          at: 0.28,
          duration: 0.8,
          targetId: 'titulo-inicial',
          action: 'blurFadeIn',
          easing: 'easeOutCubic'
        }
      ]
    },
    chatHistory: [
      {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        timestamp: now,
        text: `Proyecto aislado creado en \`projects/${id}/\`. Todos los assets, historial de chat y código DSL de este video se guardan de manera 100% independiente.`
      }
    ],
    assets: []
  };
}

export function exportProjectBundleToJsonFile(bundle: VideoProjectBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${bundle.manifest.id}.project-bundle.json`;
  link.click();
  URL.revokeObjectURL(url);
}

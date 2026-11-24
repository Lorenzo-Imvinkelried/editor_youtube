/**
 * Responsabilidad Única: Gestionar el ciclo de vida, aislamiento de almacenamiento
 * y exportación independiente de cada proyecto de video.
 * Cada proyecto se persiste bajo su propia clave `infinite_editor.project.<id>`
 * para que ningún dato se mezcle entre proyectos.
 */

import { slugifyProjectId } from '../shared/id';
import { SEED_PROJECTS } from './defaultProjects';
import { VideoProjectBundle } from './projectTypes';

const INDEX_STORAGE_KEY = 'infinite_editor.project_index.v3';
const PROJECT_KEY_PREFIX = 'infinite_editor.project_bundle.v3.';

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
      version: '1.0.0',
      duration: 10,
      background: '#090d16',
      gridColor: '#1e293b',
      nodes: [
        {
          id: 'nodo-inicial',
          label: name,
          type: 'svg',
          icon: 'sparkles',
          color: '#38bdf8',
          accentColor: '#818cf8',
          x: 0,
          y: 0,
          z: 0,
          width: 240,
          height: 240,
          initialOpacity: 0,
          initialScale: 0
        }
      ],
      cameraTrack: [
        {
          at: 0,
          duration: 1.0,
          action: 'focusOn',
          targetId: 'nodo-inicial',
          zoom: 1.25,
          rotation: 0,
          easing: 'easeOutCubic'
        }
      ],
      timeline: [
        {
          id: 'init-pop',
          at: 0.15,
          duration: 0.85,
          targetId: 'nodo-inicial',
          action: 'popIn',
          easing: 'springBouncy',
          params: { overshoot: 1.3 }
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

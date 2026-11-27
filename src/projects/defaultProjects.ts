/**
 * Responsabilidad Única: Descubrir y ensamblar dinámicamente los paquetes de proyectos
 * presentes en disco dentro de `projects/<project-id>/`.
 * Funciona tanto con los demos públicos del repositorio como con los proyectos privados
 * locales (ignorados en `.gitignore`) sin acoplar imports estáticos a proyectos privados.
 */

import { DslScene } from '../dsl/dslTypes';
import {
  ProjectAssetItem,
  ProjectChatMessage,
  ProjectManifest,
  VideoProjectBundle
} from './projectTypes';

const DEMO_PROJECT_ASSETS: Record<string, ProjectAssetItem[]> = {
  'explicacion-ia-cerebro': [
    {
      id: 'asset-brain-svg',
      name: 'brain_neural.svg',
      kind: 'svg',
      relativePath: 'projects/explicacion-ia-cerebro/assets/svgs/brain_neural.svg',
      createdAt: '2026-11-24T19:00:00.000Z'
    }
  ],
  'lanzamiento-startup-fintech': [
    {
      id: 'asset-globe-svg',
      name: 'global_market.svg',
      kind: 'svg',
      relativePath: 'projects/lanzamiento-startup-fintech/assets/svgs/global_market.svg',
      createdAt: '2026-11-24T19:05:00.000Z'
    }
  ]
};

const manifestModules = import.meta.glob<ProjectManifest>(
  '../../projects/*/project.manifest.json',
  { eager: true, import: 'default' }
);

const sceneModules = import.meta.glob<DslScene>(
  '../../projects/*/scene.dsl.json',
  { eager: true, import: 'default' }
);

const chatModules = import.meta.glob<ProjectChatMessage[]>(
  '../../projects/*/chat.history.json',
  { eager: true, import: 'default' }
);

const PUBLIC_DEMO_ORDER = new Map<string, number>([
  ['historia-nikola-tesla-10m', 1],
  ['explicacion-ia-cerebro', 2],
  ['lanzamiento-startup-fintech', 3]
]);

function extractProjectFolderId(modulePath: string): string | null {
  const match = modulePath.match(/projects\/([^/]+)\/[^/]+$/);
  return match ? match[1] : null;
}

function buildDiscoveredSeedProjects(): VideoProjectBundle[] {
  const bundles: VideoProjectBundle[] = [];

  for (const [manifestPath, manifest] of Object.entries(manifestModules)) {
    const folderId = extractProjectFolderId(manifestPath);
    if (!folderId) continue;

    const baseDir = manifestPath.slice(0, manifestPath.lastIndexOf('/'));
    const scene = sceneModules[`${baseDir}/scene.dsl.json`];
    if (!scene) continue;

    const chatHistory = chatModules[`${baseDir}/chat.history.json`] ?? [];
    bundles.push({
      directoryPath: `projects/${folderId}/`,
      manifest,
      scene,
      chatHistory,
      assets: DEMO_PROJECT_ASSETS[manifest.id] ?? []
    });
  }

  // Priorizar proyectos privados locales más recientes primero y luego los demos públicos en orden estable
  return bundles.sort((a, b) => {
    const demoRankA = PUBLIC_DEMO_ORDER.get(a.manifest.id);
    const demoRankB = PUBLIC_DEMO_ORDER.get(b.manifest.id);
    const isDemoA = demoRankA !== undefined;
    const isDemoB = demoRankB !== undefined;

    if (isDemoA !== isDemoB) {
      return isDemoA ? 1 : -1;
    }
    if (isDemoA && isDemoB) {
      return demoRankA - demoRankB;
    }
    return b.manifest.updatedAt.localeCompare(a.manifest.updatedAt);
  });
}

export const SEED_PROJECTS: VideoProjectBundle[] = buildDiscoveredSeedProjects();

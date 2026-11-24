/**
 * Responsabilidad Única: Proveer los paquetes de proyectos iniciales autocontenidos,
 * espejando exactamente la estructura de `projects/<project-id>/` en disco.
 */

import { VideoProjectBundle, ProjectChatMessage, ProjectManifest } from './projectTypes';
import teslaManifest from '../../projects/historia-nikola-tesla-10m/project.manifest.json';
import teslaScene from '../../projects/historia-nikola-tesla-10m/scene.dsl.json';
import teslaChat from '../../projects/historia-nikola-tesla-10m/chat.history.json';
import cerebroManifest from '../../projects/explicacion-ia-cerebro/project.manifest.json';
import cerebroScene from '../../projects/explicacion-ia-cerebro/scene.dsl.json';
import cerebroChat from '../../projects/explicacion-ia-cerebro/chat.history.json';
import fintechManifest from '../../projects/lanzamiento-startup-fintech/project.manifest.json';
import fintechScene from '../../projects/lanzamiento-startup-fintech/scene.dsl.json';
import fintechChat from '../../projects/lanzamiento-startup-fintech/chat.history.json';
import { DslScene } from '../dsl/dslTypes';

export const SEED_PROJECTS: VideoProjectBundle[] = [
  {
    directoryPath: 'projects/historia-nikola-tesla-10m/',
    manifest: teslaManifest as ProjectManifest,
    scene: teslaScene as unknown as DslScene,
    chatHistory: teslaChat as ProjectChatMessage[],
    assets: []
  },
  {
    directoryPath: 'projects/explicacion-ia-cerebro/',
    manifest: cerebroManifest as ProjectManifest,
    scene: cerebroScene as unknown as DslScene,
    chatHistory: cerebroChat as ProjectChatMessage[],
    assets: [
      {
        id: 'asset-brain-svg',
        name: 'brain_neural.svg',
        kind: 'svg',
        relativePath: 'projects/explicacion-ia-cerebro/assets/svgs/brain_neural.svg',
        createdAt: '2026-11-24T19:00:00.000Z'
      }
    ]
  },
  {
    directoryPath: 'projects/lanzamiento-startup-fintech/',
    manifest: fintechManifest as ProjectManifest,
    scene: fintechScene as unknown as DslScene,
    chatHistory: fintechChat as ProjectChatMessage[],
    assets: [
      {
        id: 'asset-globe-svg',
        name: 'global_market.svg',
        kind: 'svg',
        relativePath: 'projects/lanzamiento-startup-fintech/assets/svgs/global_market.svg',
        createdAt: '2026-11-24T19:05:00.000Z'
      }
    ]
  }
];

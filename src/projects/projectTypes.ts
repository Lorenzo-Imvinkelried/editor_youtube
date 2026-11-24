/**
 * Responsabilidad Única: Contratos de datos de un Proyecto de Video Aislado.
 * Garantiza que cada proyecto conserve su propio manifiesto, escena DSL, historial de chat y carpeta de assets.
 */

import { DslScene } from '../dsl/dslTypes';

export interface ProjectManifest {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  durationSeconds: number;
  dslVersion: string;
  paths: {
    scene: string;
    chatHistory: string;
    assetsDir: string;
    exportsDir: string;
  };
}

export interface ProjectChatMessage {
  id: string;
  role: 'user' | 'assistant';
  timestamp: string;
  text: string;
  appliedOperations?: string[];
}

export interface ProjectAssetItem {
  id: string;
  name: string;
  kind: 'image' | 'svg' | 'audio';
  relativePath: string;
  createdAt: string;
}

export interface VideoProjectBundle {
  /** Ruta física de aislamiento: projects/<id>/ */
  directoryPath: string;
  manifest: ProjectManifest;
  scene: DslScene;
  chatHistory: ProjectChatMessage[];
  assets: ProjectAssetItem[];
}

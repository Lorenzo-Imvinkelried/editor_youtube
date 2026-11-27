/**
 * Responsabilidad Única: Persistir con doble redundancia los archivos binarios de voz
 * (`audioTrack`) y música instrumental (`musicTrack`) por proyecto:
 * 1) Disco físico local (`projects/<project-id>/assets/audio/voice-master.wav` / `music-loop.wav`)
 *    a través del plugin dev de Vite (sobrevive reinicios, limpieza de Chrome o cambio de puerto).
 * 2) IndexedDB del navegador como respaldo secundario automático.
 */

import { VideoProjectBundle } from '../projects/projectTypes';
import {
  deleteTrackFromLocalDisk,
  restoreTrackFromLocalDisk,
  saveTrackBlobToLocalDisk
} from './localDiskAudioVault';

export type PersistedAudioChannel = 'voice' | 'music';

export interface AudioPersistOutcome {
  persisted: boolean;
  savedToDisk: boolean;
  savedToIndexedDb: boolean;
  diskPath?: string;
}

const DB_NAME = 'infinite_editor_audio_db';
const DB_VERSION = 1;
const STORE_NAME = 'audio_blobs';

function makeKey(projectId: string, channel: PersistedAudioChannel): string {
  return `${projectId}::${channel}`;
}

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este entorno.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB de audio.'));
  });
}

async function saveBlobToIndexedDb(
  projectId: string,
  channel: PersistedAudioChannel,
  blob: Blob
): Promise<boolean> {
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, makeKey(projectId, channel));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

async function restoreBlobFromIndexedDb(
  projectId: string,
  channel: PersistedAudioChannel
): Promise<Blob | null> {
  try {
    const db = await openAudioDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(makeKey(projectId, channel));
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!blob || !(blob instanceof Blob) || blob.size === 0) return null;
    return blob;
  } catch {
    return null;
  }
}

/**
 * Guarda simultáneamente en disco físico (`projects/<id>/assets/audio/`) y en IndexedDB
 * el archivo binario asociado a una URL `blob:` o `data:` del proyecto.
 */
export async function persistAudioFromUrl(
  projectId: string,
  channel: PersistedAudioChannel,
  audioUrl: string,
  trackName?: string
): Promise<AudioPersistOutcome> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      return { persisted: false, savedToDisk: false, savedToIndexedDb: false };
    }
    const blob = await response.blob();
    if (!blob || blob.size === 0) {
      return { persisted: false, savedToDisk: false, savedToIndexedDb: false };
    }

    const [diskResult, savedToIndexedDb] = await Promise.all([
      saveTrackBlobToLocalDisk(projectId, channel, blob, trackName),
      saveBlobToIndexedDb(projectId, channel, blob)
    ]);

    return {
      persisted: diskResult.saved || savedToIndexedDb,
      savedToDisk: diskResult.saved,
      savedToIndexedDb,
      diskPath: diskResult.relativePath
    };
  } catch {
    return { persisted: false, savedToDisk: false, savedToIndexedDb: false };
  }
}

/**
 * Recupera un audio priorizando el archivo físico en disco (`projects/<id>/assets/audio/`)
 * y usando IndexedDB como respaldo secundario (auto-migrándolo a disco si faltaba allí).
 */
export async function restorePersistedAudio(
  projectId: string,
  channel: PersistedAudioChannel
): Promise<{ blobUrl: string; name?: string } | null> {
  // 1. Prioridad: archivo real en disco físico del proyecto
  const fromDisk = await restoreTrackFromLocalDisk(projectId, channel);
  if (fromDisk?.blobUrl) {
    return { blobUrl: fromDisk.blobUrl, name: fromDisk.name };
  }

  // 2. Respaldo secundario: IndexedDB del navegador
  const fromIdb = await restoreBlobFromIndexedDb(projectId, channel);
  if (fromIdb) {
    // Auto-respaldar en disco local para futuros reinicios
    void saveTrackBlobToLocalDisk(projectId, channel, fromIdb);
    return { blobUrl: URL.createObjectURL(fromIdb) };
  }

  return null;
}

/**
 * Wrapper de compatibilidad que devuelve únicamente la `blob:` URL restaurada.
 */
export async function restorePersistedAudioUrl(
  projectId: string,
  channel: PersistedAudioChannel
): Promise<string | null> {
  const restored = await restorePersistedAudio(projectId, channel);
  return restored?.blobUrl ?? null;
}

/**
 * Elimina de disco físico y de IndexedDB el audio persistido cuando el usuario lo quita explícitamente.
 */
export async function deletePersistedAudio(
  projectId: string,
  channel: PersistedAudioChannel
): Promise<void> {
  await Promise.all([
    deleteTrackFromLocalDisk(projectId, channel),
    (async () => {
      try {
        const db = await openAudioDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(makeKey(projectId, channel));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      } catch {
        // Ignorar errores de limpieza si IndexedDB no está disponible
      }
    })()
  ]);
}

/**
 * Hidrata al arrancar la aplicación las pistas `audioTrack` y `musicTrack` de todos los proyectos
 * desde disco físico o IndexedDB, reemplazando `blob:` URLs caducadas tras cerrar o reiniciar.
 */
export async function hydrateAllProjectsAudio(
  bundles: VideoProjectBundle[]
): Promise<{ bundles: VideoProjectBundle[]; changed: boolean }> {
  let changed = false;
  const hydrated: VideoProjectBundle[] = [];

  for (const bundle of bundles) {
    const projectId = bundle.manifest.id;
    let nextVoice = bundle.scene.audioTrack;
    let nextMusic = bundle.scene.musicTrack;

    // 1. Hidratar Voz (`audioTrack`)
    const restoredVoice = await restorePersistedAudio(projectId, 'voice');
    if (restoredVoice) {
      nextVoice = {
        name: nextVoice?.name || restoredVoice.name || 'Voz guardada en disco',
        volume: nextVoice?.volume ?? 0.95,
        src: restoredVoice.blobUrl
      };
      changed = true;
    } else if (nextVoice?.src?.startsWith('blob:')) {
      nextVoice = undefined;
      changed = true;
    }

    // 2. Hidratar Música Instrumental (`musicTrack`)
    const restoredMusic = await restorePersistedAudio(projectId, 'music');
    if (restoredMusic) {
      nextMusic = {
        ...(nextMusic ?? { name: restoredMusic.name || 'Música Instrumental', volume: 0.25 }),
        src: restoredMusic.blobUrl
      };
      changed = true;
    } else if (nextMusic?.src?.startsWith('blob:')) {
      nextMusic = undefined;
      changed = true;
    }

    if (nextVoice !== bundle.scene.audioTrack || nextMusic !== bundle.scene.musicTrack) {
      hydrated.push({
        ...bundle,
        scene: {
          ...bundle.scene,
          audioTrack: nextVoice,
          musicTrack: nextMusic
        }
      });
    } else {
      hydrated.push(bundle);
    }
  }

  return { bundles: hydrated, changed };
}

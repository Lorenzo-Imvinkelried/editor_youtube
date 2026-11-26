/**
 * Responsabilidad Única: Persistir en IndexedDB los blobs binarios de voz (`audioTrack`)
 * y música instrumental (`musicTrack`) por proyecto para que sobrevivan recargas (F5) y
 * reinicios del navegador sin perderse al expirar los `blob:` URLs temporales.
 */

import { VideoProjectBundle } from '../projects/projectTypes';

export type PersistedAudioChannel = 'voice' | 'music';

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

/**
 * Guarda en IndexedDB el archivo binario asociado a una URL `blob:` o `data:` del proyecto.
 */
export async function persistAudioFromUrl(
  projectId: string,
  channel: PersistedAudioChannel,
  audioUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) return false;
    const blob = await response.blob();
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

/**
 * Recupera un audio guardado en IndexedDB y genera una `blob:` URL fresca y reproducible.
 */
export async function restorePersistedAudioUrl(
  projectId: string,
  channel: PersistedAudioChannel
): Promise<string | null> {
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
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/**
 * Elimina de IndexedDB el audio persistido cuando el usuario quita la pista de voz o música.
 */
export async function deletePersistedAudio(
  projectId: string,
  channel: PersistedAudioChannel
): Promise<void> {
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
}

/**
 * Hidrata al arrancar la aplicación las pistas `audioTrack` y `musicTrack` de todos los proyectos
 * desde IndexedDB, reemplazando `blob:` URLs caducadas tras un F5 por URLs vivas.
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
    const restoredVoiceUrl = await restorePersistedAudioUrl(projectId, 'voice');
    if (restoredVoiceUrl) {
      nextVoice = {
        name: nextVoice?.name || 'Voz guardada',
        volume: nextVoice?.volume ?? 0.9,
        src: restoredVoiceUrl
      };
      changed = true;
    } else if (nextVoice?.src?.startsWith('blob:')) {
      // URL blob expirada de una sesión previa sin copia en IndexedDB
      nextVoice = undefined;
      changed = true;
    }

    // 2. Hidratar Música Instrumental (`musicTrack`)
    const restoredMusicUrl = await restorePersistedAudioUrl(projectId, 'music');
    if (restoredMusicUrl) {
      nextMusic = {
        ...(nextMusic ?? { name: 'Música Instrumental', volume: 0.25 }),
        src: restoredMusicUrl
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

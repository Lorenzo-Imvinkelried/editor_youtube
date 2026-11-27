/**
 * Responsabilidad Única: Cachear con doble redundancia los clips MP3 crudos generados por
 * ElevenLabs (IndexedDB + disco físico en `projects/<id>/assets/audio/clips/*.mp3`),
 * indexados por firma determinista `(voiceId, modelId, textoNormalizado)`, para nunca
 * volver a gastar tokens aunque se cierre la app, se reinicie la PC o se limpie el navegador.
 */

import {
  checkClipsPresentOnLocalDisk,
  loadClipBytesFromLocalDisk,
  saveClipBytesToLocalDisk
} from './localDiskAudioVault';

const CACHE_DB_NAME = 'infinite_editor_elevenlabs_clip_cache_v1';
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'tts_clips';

interface CachedTtsRecord {
  key: string;
  voiceId: string;
  modelId: string;
  textLength: number;
  bytes: ArrayBuffer;
  createdAt: number;
}

function normalizeCacheText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Hash determinista rápido (doble FNV-1a 32-bit) independiente de SubtleCrypto para funcionar
 * igual en localhost HTTP, producción HTTPS y entornos de pruebas Node.
 */
function deterministicDoubleHash(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + ((i * 31) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function buildTtsClipCacheKey(voiceId: string, modelId: string, text: string): string {
  const normalized = normalizeCacheText(text);
  const hash = deterministicDoubleHash(normalized);
  const head = normalized.slice(0, 12);
  const tail = normalized.slice(-12);
  return `v1::${voiceId.trim()}::${modelId.trim()}::${normalized.length}::${hash}::${head}|${tail}`;
}

/**
 * Nombre de archivo seguro para disco (`clips/<hash>.mp3`) sin caracteres especiales.
 */
export function buildTtsClipDiskFileHash(voiceId: string, modelId: string, text: string): string {
  const normalized = normalizeCacheText(text);
  const safeVoice = voiceId.trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 14) || 'voice';
  const safeModel = modelId.trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 18) || 'model';
  const hash = deterministicDoubleHash(`${voiceId.trim()}::${modelId.trim()}::${normalized}`);
  return `v1_${safeVoice}_${safeModel}_${normalized.length}_${hash}`;
}

function openClipCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const req = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Error abriendo caché de clips TTS'));
  });
}

async function putRecordInIndexedDb(record: CachedTtsRecord): Promise<void> {
  try {
    const db = await openClipCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      tx.objectStore(CACHE_STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignorar si IndexedDB no está disponible
  }
}

/**
 * Recupera una copia fresca (`slice(0)`) de los bytes MP3 cacheados, buscando primero
 * en IndexedDB y luego en disco físico (`projects/<id>/assets/audio/clips/*.mp3`).
 */
export async function getCachedTtsClipBytes(
  voiceId: string,
  modelId: string,
  text: string,
  projectId?: string
): Promise<ArrayBuffer | null> {
  const key = buildTtsClipCacheKey(voiceId, modelId, text);
  const diskHash = buildTtsClipDiskFileHash(voiceId, modelId, text);

  // 1. Buscar en IndexedDB
  try {
    const db = await openClipCacheDb();
    const record = await new Promise<CachedTtsRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const req = tx.objectStore(CACHE_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as CachedTtsRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (record && record.bytes instanceof ArrayBuffer && record.bytes.byteLength > 0) {
      return record.bytes.slice(0);
    }
  } catch {
    // Continuar hacia respaldo en disco físico
  }

  // 2. Respaldo en disco físico (`projects/<projectId>/assets/audio/clips/<hash>.mp3`)
  if (projectId) {
    const fromDisk = await loadClipBytesFromLocalDisk(projectId, diskHash);
    if (fromDisk && fromDisk.byteLength > 0) {
      // Re-hidratar IndexedDB en segundo plano
      void putRecordInIndexedDb({
        key,
        voiceId: voiceId.trim(),
        modelId: modelId.trim(),
        textLength: normalizeCacheText(text).length,
        bytes: fromDisk.slice(0),
        createdAt: Date.now()
      });
      return fromDisk.slice(0);
    }
  }

  return null;
}

/**
 * Guarda simultáneamente una copia segura de los bytes MP3 en IndexedDB y en disco físico
 * (`projects/<id>/assets/audio/clips/<hash>.mp3`) apenas responde ElevenLabs.
 */
export async function saveCachedTtsClipBytes(
  voiceId: string,
  modelId: string,
  text: string,
  mp3Bytes: ArrayBuffer,
  projectId?: string
): Promise<void> {
  if (!mp3Bytes || mp3Bytes.byteLength === 0) return;

  const key = buildTtsClipCacheKey(voiceId, modelId, text);
  const diskHash = buildTtsClipDiskFileHash(voiceId, modelId, text);
  const record: CachedTtsRecord = {
    key,
    voiceId: voiceId.trim(),
    modelId: modelId.trim(),
    textLength: normalizeCacheText(text).length,
    bytes: mp3Bytes.slice(0),
    createdAt: Date.now()
  };

  await Promise.all([
    putRecordInIndexedDb(record),
    projectId
      ? saveClipBytesToLocalDisk(projectId, diskHash, mp3Bytes.slice(0))
      : Promise.resolve(false)
  ]);
}

/**
 * Cuenta cuántos textos de una lista ya existen en caché local (IndexedDB o disco físico)
 * para mostrar al instante cuántos clips costarán 0 créditos de ElevenLabs.
 */
export async function countCachedSegmentsForConfig(
  texts: string[],
  voiceId: string,
  modelId: string,
  projectId?: string
): Promise<{ cachedCount: number; uncachedCharacters: number }> {
  if (texts.length === 0) {
    return { cachedCount: 0, uncachedCharacters: 0 };
  }

  const foundFlags = new Array<boolean>(texts.length).fill(false);

  // 1. Comprobar IndexedDB en una sola transacción
  try {
    const db = await openClipCacheDb();
    const keys = texts.map((t) => buildTtsClipCacheKey(voiceId, modelId, t));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      for (let i = 0; i < keys.length; i++) {
        const req = store.count(keys[i]);
        req.onsuccess = () => {
          if ((req.result || 0) > 0) foundFlags[i] = true;
        };
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Continuar con disco físico
  }

  // 2. Comprobar disco físico en un solo request rápido
  if (projectId) {
    const diskHashes = texts.map((t) => buildTtsClipDiskFileHash(voiceId, modelId, t));
    const diskPresence = await checkClipsPresentOnLocalDisk(projectId, diskHashes);
    if (diskPresence) {
      for (let i = 0; i < texts.length; i++) {
        if (diskPresence[i]) foundFlags[i] = true;
      }
    }
  }

  let cachedCount = 0;
  let uncachedCharacters = 0;
  for (let i = 0; i < texts.length; i++) {
    if (foundFlags[i]) {
      cachedCount++;
    } else {
      uncachedCharacters += texts[i].length;
    }
  }

  return { cachedCount, uncachedCharacters };
}

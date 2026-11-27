/**
 * Responsabilidad Única: Cachear localmente en IndexedDB los clips MP3 crudos generados por
 * ElevenLabs indexados por firma determinista `(voiceId, modelId, textoNormalizado)`, para
 * evitar volver a gastar tokens al re-sincronizar pausas, retomar tras un error o editar otra escena.
 */

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

/**
 * Recupera una copia fresca (`slice(0)`) de los bytes MP3 cacheados para evitar
 * problemas de ArrayBuffer desconectado tras `decodeAudioData`.
 */
export async function getCachedTtsClipBytes(
  voiceId: string,
  modelId: string,
  text: string
): Promise<ArrayBuffer | null> {
  try {
    const key = buildTtsClipCacheKey(voiceId, modelId, text);
    const db = await openClipCacheDb();
    const record = await new Promise<CachedTtsRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const req = tx.objectStore(CACHE_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as CachedTtsRecord | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!record || !(record.bytes instanceof ArrayBuffer) || record.bytes.byteLength === 0) {
      return null;
    }
    return record.bytes.slice(0);
  } catch {
    return null;
  }
}

/**
 * Guarda inmediatamente una copia segura de los bytes MP3 devueltos por ElevenLabs.
 */
export async function saveCachedTtsClipBytes(
  voiceId: string,
  modelId: string,
  text: string,
  mp3Bytes: ArrayBuffer
): Promise<void> {
  if (!mp3Bytes || mp3Bytes.byteLength === 0) return;
  try {
    const key = buildTtsClipCacheKey(voiceId, modelId, text);
    const record: CachedTtsRecord = {
      key,
      voiceId: voiceId.trim(),
      modelId: modelId.trim(),
      textLength: normalizeCacheText(text).length,
      bytes: mp3Bytes.slice(0),
      createdAt: Date.now()
    };
    const db = await openClipCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
      tx.objectStore(CACHE_STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Nunca interrumpir la generación si el almacenamiento local está lleno o bloqueado
  }
}

/**
 * Cuenta cuántos textos de una lista ya existen en caché local (0 créditos de ElevenLabs)
 * usando una sola transacción rápida de lectura.
 */
export async function countCachedSegmentsForConfig(
  texts: string[],
  voiceId: string,
  modelId: string
): Promise<{ cachedCount: number; uncachedCharacters: number }> {
  if (texts.length === 0) {
    return { cachedCount: 0, uncachedCharacters: 0 };
  }

  try {
    const db = await openClipCacheDb();
    const keys = texts.map((t) => buildTtsClipCacheKey(voiceId, modelId, t));
    const foundFlags = await new Promise<boolean[]>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const flags = new Array<boolean>(keys.length).fill(false);

      for (let i = 0; i < keys.length; i++) {
        const req = store.count(keys[i]);
        req.onsuccess = () => {
          flags[i] = (req.result || 0) > 0;
        };
      }
      tx.oncomplete = () => resolve(flags);
      tx.onerror = () => reject(tx.error);
    });
    db.close();

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
  } catch {
    return {
      cachedCount: 0,
      uncachedCharacters: texts.reduce((acc, t) => acc + t.length, 0)
    };
  }
}

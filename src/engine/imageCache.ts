/**
 * Responsabilidad Única: Gestionar la carga asíncrona y caché en memoria de imágenes externas
 * (ya sea por link directo `src` o buscando automáticamente en internet mediante `imageQuery`),
 * asegurando compatibilidad CORS (`crossOrigin = "anonymous"`) para que la exportación a MP4 nunca falle.
 */

import {
  buildCorsSafeImageUrl,
  resolveBestInternetImageForQuery
} from './internetImageSearch';

export interface CachedImageEntry {
  img: HTMLImageElement;
  status: 'loading' | 'loaded' | 'error';
  resolvedUrl?: string;
}

const imageCache = new Map<string, CachedImageEntry>();
const pendingQueries = new Set<string>();
const listeners = new Set<() => void>();

export function subscribeToImageLoads(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyImageLoaded(): void {
  for (const cb of listeners) {
    cb();
  }
}

export function getOrLoadCanvasImage(
  src: string | undefined,
  imageQuery?: string
): CachedImageEntry | null {
  const cleanSrc = src?.trim();
  const cleanQuery = imageQuery?.trim();

  if (cleanSrc) {
    return loadImageByDirectUrl(cleanSrc);
  }

  if (cleanQuery) {
    const queryCacheKey = `query:${cleanQuery.toLowerCase()}`;
    const existing = imageCache.get(queryCacheKey);
    if (existing) {
      return existing;
    }

    if (!pendingQueries.has(queryCacheKey)) {
      pendingQueries.add(queryCacheKey);
      const placeholderEntry: CachedImageEntry = {
        img: new Image(),
        status: 'loading'
      };
      imageCache.set(queryCacheKey, placeholderEntry);

      resolveBestInternetImageForQuery(cleanQuery)
        .then((foundUrl) => {
          pendingQueries.delete(queryCacheKey);
          if (!foundUrl) {
            placeholderEntry.status = 'error';
            notifyImageLoaded();
            return;
          }
          const loadedEntry = loadImageByDirectUrl(foundUrl);
          imageCache.set(queryCacheKey, loadedEntry);
          notifyImageLoaded();
        })
        .catch(() => {
          pendingQueries.delete(queryCacheKey);
          placeholderEntry.status = 'error';
          notifyImageLoaded();
        });
    }

    return imageCache.get(queryCacheKey) || null;
  }

  return null;
}

function loadImageByDirectUrl(cleanUrl: string): CachedImageEntry {
  const existing = imageCache.get(cleanUrl);
  if (existing) {
    return existing;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  const entry: CachedImageEntry = {
    img,
    status: 'loading',
    resolvedUrl: cleanUrl
  };

  imageCache.set(cleanUrl, entry);
  let triedProxy = false;

  img.onload = () => {
    entry.status = 'loaded';
    notifyImageLoaded();
  };

  img.onerror = () => {
    // Si el servidor externo bloquea CORS, reintentar vía proxy CORS (wsrv.nl) manteniendo crossOrigin='anonymous'
    // para que el Canvas 2D pueda exportarse a MP4 sin error de "Tainted Canvas".
    if (!triedProxy) {
      triedProxy = true;
      const proxiedUrl = buildCorsSafeImageUrl(cleanUrl);
      if (proxiedUrl !== cleanUrl) {
        img.crossOrigin = 'anonymous';
        img.src = proxiedUrl;
        return;
      }
    }
    entry.status = 'error';
    notifyImageLoaded();
  };

  img.src = cleanUrl;
  return entry;
}

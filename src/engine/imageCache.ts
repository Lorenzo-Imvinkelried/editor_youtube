/**
 * Responsabilidad Única: Gestionar la carga asíncrona y caché en memoria de imágenes externas
 * (links de Google Images, Unsplash, PNGs transparentes, etc.) para dibujarlas a 60 FPS en el Canvas 2D.
 */

interface CachedImageEntry {
  img: HTMLImageElement;
  status: 'loading' | 'loaded' | 'error';
}

const imageCache = new Map<string, CachedImageEntry>();
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

export function getOrLoadCanvasImage(url: string | undefined): CachedImageEntry | null {
  if (!url || !url.trim()) return null;
  const cleanUrl = url.trim();

  const existing = imageCache.get(cleanUrl);
  if (existing) {
    return existing;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';

  const entry: CachedImageEntry = {
    img,
    status: 'loading'
  };

  imageCache.set(cleanUrl, entry);

  img.onload = () => {
    entry.status = 'loaded';
    notifyImageLoaded();
  };

  img.onerror = () => {
    // Reintentar sin crossOrigin si el servidor externo bloquea cabeceras CORS pero permite renderizado
    if (img.crossOrigin) {
      img.crossOrigin = '';
      img.src = cleanUrl;
      return;
    }
    entry.status = 'error';
    notifyImageLoaded();
  };

  img.src = cleanUrl;
  return entry;
}

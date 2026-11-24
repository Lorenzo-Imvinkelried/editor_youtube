/**
 * Responsabilidad Única: Buscar imágenes reales en internet (Wikipedia / Wikimedia Commons / IA)
 * a partir de una consulta de texto (`imageQuery`) escrita por el Agente de IA o el usuario,
 * y proveer un proxy CORS seguro (`wsrv.nl`) para que cualquier URL de internet pueda exportarse a MP4.
 */

export interface InternetImageResult {
  title: string;
  url: string;
  thumbUrl: string;
  source: 'wikipedia' | 'commons' | 'ai-web';
}

const queryResolutionCache = new Map<string, string>();

/**
 * Envuelve cualquier URL de imagen de internet en un proxy público con cabeceras CORS (`Access-Control-Allow-Origin: *`)
 * cuando el servidor original bloquea CORS, evitando que el Canvas 2D falle al exportar a MP4.
 */
export function buildCorsSafeImageUrl(rawUrl: string): string {
  const clean = rawUrl.trim();
  if (
    clean.startsWith('data:') ||
    clean.startsWith('blob:') ||
    clean.includes('wsrv.nl') ||
    clean.includes('wikimedia.org')
  ) {
    return clean;
  }
  return `https://wsrv.nl/?url=${encodeURIComponent(clean)}&w=960&output=webp`;
}

/**
 * Resuelve automáticamente la mejor URL de imagen real en internet para un `imageQuery` dado.
 */
export async function resolveBestInternetImageForQuery(query: string): Promise<string | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  if (queryResolutionCache.has(normalized)) {
    return queryResolutionCache.get(normalized)!;
  }

  const results = await searchInternetImages(query, 4);
  if (results.length > 0) {
    const bestUrl = results[0].url;
    queryResolutionCache.set(normalized, bestUrl);
    return bestUrl;
  }

  return null;
}

/**
 * Busca imágenes reales en internet combinando Wikipedia (ES/EN) y Wikimedia Commons (100% libres de CORS).
 */
export async function searchInternetImages(
  query: string,
  limit = 8
): Promise<InternetImageResult[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const results: InternetImageResult[] = [];

  try {
    // 1. Buscar imágenes principales de artículos en Wikipedia Español e Inglés en paralelo
    const [esWiki, enWiki, commons] = await Promise.allSettled([
      fetchWikipediaPageImages('es', cleanQuery, 4),
      fetchWikipediaPageImages('en', cleanQuery, 4),
      fetchWikimediaCommonsImages(cleanQuery, limit)
    ]);

    if (esWiki.status === 'fulfilled') results.push(...esWiki.value);
    if (enWiki.status === 'fulfilled') results.push(...enWiki.value);
    if (commons.status === 'fulfilled') results.push(...commons.value);
  } catch {
    // Continuar con los resultados obtenidos
  }

  // Deduplicar por URL
  const seen = new Set<string>();
  const unique: InternetImageResult[] = [];
  for (const item of results) {
    if (!seen.has(item.url)) {
      seen.add(item.url);
      unique.push(item);
    }
  }

  return unique.slice(0, limit);
}

async function fetchWikipediaPageImages(
  lang: 'es' | 'en',
  query: string,
  limit: number
): Promise<InternetImageResult[]> {
  const endpoint = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    query
  )}&gsrlimit=${limit}&prop=pageimages&piprop=thumbnail&pithumbsize=800&format=json&origin=*`;

  const res = await fetch(endpoint);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  const list: InternetImageResult[] = [];
  for (const key of Object.keys(pages)) {
    const page = pages[key];
    const thumb = page?.thumbnail?.source as string | undefined;
    if (thumb && !thumb.endsWith('.svg')) {
      list.push({
        title: page.title || query,
        url: thumb,
        thumbUrl: thumb,
        source: 'wikipedia'
      });
    }
  }
  return list;
}

async function fetchWikimediaCommonsImages(
  query: string,
  limit: number
): Promise<InternetImageResult[]> {
  const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
    query
  )}&gsrlimit=${limit}&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=800&format=json&origin=*`;

  const res = await fetch(endpoint);
  if (!res.ok) return [];
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  const list: InternetImageResult[] = [];
  for (const key of Object.keys(pages)) {
    const page = pages[key];
    const info = page?.imageinfo?.[0];
    const thumbUrl = (info?.thumburl || info?.url) as string | undefined;
    if (!thumbUrl) continue;

    const lowerUrl = thumbUrl.toLowerCase();
    if (
      lowerUrl.endsWith('.jpg') ||
      lowerUrl.endsWith('.jpeg') ||
      lowerUrl.endsWith('.png') ||
      lowerUrl.endsWith('.webp')
    ) {
      list.push({
        title: (page.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
        url: thumbUrl,
        thumbUrl,
        source: 'commons'
      });
    }
  }
  return list;
}

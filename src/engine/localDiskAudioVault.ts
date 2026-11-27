/**
 * Responsabilidad Única: Cliente HTTP liviano del navegador hacia la bóveda física de disco
 * (`/__local-audio/*`) servida por Vite en local. Permite guardar y recuperar pistas reales
 * (`voice-master.wav`, `music-loop.wav`) y clips MP3 de ElevenLabs en `projects/<id>/assets/audio/`
 * con degradación silenciosa si la app corre como sitio estático sin servidor dev.
 */

export type VaultAudioChannel = 'voice' | 'music';

export interface DiskAudioSaveResult {
  saved: boolean;
  relativePath?: string;
  sizeBytes?: number;
}

export interface DiskAudioRestoreResult {
  blobUrl: string;
  name?: string;
  relativePath?: string;
}

function inferExtensionFromMimeOrName(mimeType: string, name?: string): string {
  const fromName = (name || '').toLowerCase().match(/\.(wav|mp3|m4a|ogg|flac|webm|opus|aac)$/)?.[1];
  if (fromName) return fromName;
  const lower = mimeType.toLowerCase();
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  if (lower.includes('mp4') || lower.includes('m4a')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('flac')) return 'flac';
  if (lower.includes('webm')) return 'webm';
  if (lower.includes('aac')) return 'aac';
  return 'wav';
}

export async function saveTrackBlobToLocalDisk(
  projectId: string,
  channel: VaultAudioChannel,
  blob: Blob,
  trackName?: string
): Promise<DiskAudioSaveResult> {
  if (!projectId || !blob || blob.size === 0) return { saved: false };
  try {
    const ext = inferExtensionFromMimeOrName(blob.type || 'audio/wav', trackName);
    const params = new URLSearchParams({
      projectId,
      channel,
      ext,
      name: trackName || (channel === 'voice' ? 'Voz guardada' : 'Música instrumental')
    });
    const res = await fetch(`/__local-audio/track?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream' },
      body: blob
    });
    if (!res.ok) return { saved: false };
    const data = (await res.json()) as { ok?: boolean; relativePath?: string; sizeBytes?: number };
    if (!data?.ok) return { saved: false };
    return {
      saved: true,
      relativePath: data.relativePath,
      sizeBytes: data.sizeBytes
    };
  } catch {
    return { saved: false };
  }
}

export async function restoreTrackFromLocalDisk(
  projectId: string,
  channel: VaultAudioChannel
): Promise<DiskAudioRestoreResult | null> {
  if (!projectId) return null;
  try {
    const params = new URLSearchParams({ projectId, channel });
    const res = await fetch(`/__local-audio/track?${params.toString()}`, {
      cache: 'no-store'
    });
    if (!res.ok) return null;

    // Verificar que realmente devolvió audio y no index.html de un hosting SPA estático
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('audio/') && !contentType.includes('octet-stream')) {
      return null;
    }

    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;

    const rawName = res.headers.get('x-audio-name');
    const rawPath = res.headers.get('x-audio-path');
    return {
      blobUrl: URL.createObjectURL(blob),
      name: rawName ? decodeURIComponent(rawName) : undefined,
      relativePath: rawPath ? decodeURIComponent(rawPath) : undefined
    };
  } catch {
    return null;
  }
}

export async function deleteTrackFromLocalDisk(
  projectId: string,
  channel: VaultAudioChannel
): Promise<void> {
  if (!projectId) return;
  try {
    const params = new URLSearchParams({ projectId, channel });
    await fetch(`/__local-audio/track?${params.toString()}`, { method: 'DELETE' });
  } catch {
    // Ignorar en entornos sin servidor dev local
  }
}

export async function saveClipBytesToLocalDisk(
  projectId: string,
  clipHash: string,
  mp3Bytes: ArrayBuffer
): Promise<boolean> {
  if (!projectId || !clipHash || !mp3Bytes || mp3Bytes.byteLength === 0) return false;
  try {
    const params = new URLSearchParams({ projectId, clipHash });
    const res = await fetch(`/__local-audio/clip?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/mpeg' },
      body: mp3Bytes
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function loadClipBytesFromLocalDisk(
  projectId: string,
  clipHash: string
): Promise<ArrayBuffer | null> {
  if (!projectId || !clipHash) return null;
  try {
    const params = new URLSearchParams({ projectId, clipHash });
    const res = await fetch(`/__local-audio/clip?${params.toString()}`, {
      cache: 'no-store'
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('audio/')) return null;
    const ab = await res.arrayBuffer();
    return ab.byteLength > 0 ? ab : null;
  } catch {
    return null;
  }
}

export async function checkClipsPresentOnLocalDisk(
  projectId: string,
  clipHashes: string[]
): Promise<boolean[] | null> {
  if (!projectId || clipHashes.length === 0) return null;
  try {
    const params = new URLSearchParams({ projectId });
    const res = await fetch(`/__local-audio/clips-check?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hashes: clipHashes })
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; present?: boolean[] };
    if (!data?.ok || !Array.isArray(data.present)) return null;
    return data.present;
  } catch {
    return null;
  }
}

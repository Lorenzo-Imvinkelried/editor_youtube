/**
 * Responsabilidad Única: Sincronizar la reproducción de la pista de audio del proyecto activo
 * con el reloj de la línea de tiempo (Play, Pause, Seek, Loop y Volumen), además de generar
 * una pista instrumental/sintetizada WAV en memoria si el usuario quiere probar audio con 1 click.
 */

import { DslAudioTrack } from '../dsl/dslTypes';

class ProjectAudioController {
  private audioElement: HTMLAudioElement | null = null;
  private currentSrc: string | null = null;

  public syncWithTimeline(
    track: DslAudioTrack | undefined,
    isPlaying: boolean,
    currentTime: number
  ): void {
    if (!track || !track.src) {
      this.stopAndClear();
      return;
    }

    if (this.currentSrc !== track.src || !this.audioElement) {
      this.stopAndClear();
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.src = track.src;
      audio.preload = 'auto';
      this.audioElement = audio;
      this.currentSrc = track.src;
    }

    const audio = this.audioElement;
    audio.volume = Math.max(0, Math.min(1, track.volume ?? 0.85));

    // Si la diferencia entre el reloj del editor y el audio supera 0.28s, re-sincronizar
    if (Math.abs(audio.currentTime - currentTime) > 0.28) {
      try {
        audio.currentTime = currentTime;
      } catch {
        // Ignorar mientras los metadatos del audio aún están cargando
      }
    }

    if (isPlaying && audio.paused) {
      audio.play().catch(() => {
        // El navegador puede requerir interacción previa del usuario
      });
    } else if (!isPlaying && !audio.paused) {
      audio.pause();
    }
  }

  public forceSeek(timeSeconds: number): void {
    if (!this.audioElement) return;
    try {
      this.audioElement.currentTime = timeSeconds;
    } catch {
      // Ignorar si aún no está listo
    }
  }

  public stopAndClear(): void {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement = null;
    }
    this.currentSrc = null;
  }
}

export const projectAudioController = new ProjectAudioController();

/**
 * Genera un archivo WAV instrumental ambient/synthwave en memoria (Blob URL)
 * para que el usuario pueda probar audio y exportación MP4 al instante sin buscar archivos externos.
 */
export function generateBuiltinSynthAudioWavUrl(durationSeconds = 12): string {
  const sampleRate = 44100;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);

  // Cabecera WAV PCM 16-bit Mono
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 1 canal
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  // Acorde ambient electrónico con pulso rítmico suave estilo video explicativo
  const notes = [220, 277.18, 329.63, 440]; // A major 7th pad
  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const beatPulse = 0.65 + 0.35 * Math.sin(t * Math.PI * 4);
    const bassFreq = t % 4 < 2 ? 110 : 87.31;

    let sample = Math.sin(2 * Math.PI * bassFreq * t) * 0.18 * beatPulse;
    for (let n = 0; n < notes.length; n++) {
      const freq = notes[n];
      sample += Math.sin(2 * Math.PI * freq * t) * 0.08;
    }

    // Efecto "pop" sutil cada 2 segundos
    const popPhase = t % 2.0;
    if (popPhase < 0.08) {
      const popEnv = 1 - popPhase / 0.08;
      sample += Math.sin(2 * Math.PI * (520 + popPhase * 1800) * t) * 0.22 * popEnv;
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped * 32767, true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

/**
 * Responsabilidad Única: Interfaz para cargar cualquier canción instrumental (WAV, MP3, M4A,
 * OGG, FLAC, AAC, WEBM, OPUS) por arrastrar/soltar, selector o link, y construir automáticamente
 * una pista en bucle inteligente (recorte de silencios + crossfade igual-potencia + fade-in/out)
 * que cubre exactamente la duración del video y convive con la narración.
 */

import React, { useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Music,
  RefreshCw,
  Repeat,
  SkipForward,
  Trash2,
  Upload,
  Volume2,
  Wand2
} from 'lucide-react';
import { DslMusicTrack, DslScene } from '../../dsl/dslTypes';
import { generateBuiltinSynthAudioWavUrl } from '../../engine/audioController';
import {
  buildSmartLoopedMusicFromArrayBuffer,
  buildSmartLoopedMusicFromUrl,
  SmartLoopedMusicOutput
} from '../../engine/musicLoopBuilder';
import { formatTimeMmSs } from '../../shared/math';

interface InstrumentalMusicTabProps {
  scene: DslScene;
  onSaveMusicTrack: (track: DslMusicTrack | undefined) => void;
  onClose: () => void;
}

const ACCEPTED_AUDIO_ATTR = 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.opus';

export const InstrumentalMusicTab: React.FC<InstrumentalMusicTabProps> = ({
  scene,
  onSaveMusicTrack,
  onClose
}) => {
  const existing = scene.musicTrack;
  const hasVoice = Boolean(scene.audioTrack?.src);

  const [trackName, setTrackName] = useState(existing?.name || '');
  const [processedUrl, setProcessedUrl] = useState(existing?.src || '');
  const [volume, setVolume] = useState(existing?.volume ?? (hasVoice ? 0.24 : 0.45));
  const [crossfadeSeconds, setCrossfadeSeconds] = useState(existing?.crossfadeSeconds ?? 3.0);
  const [fadeInSeconds, setFadeInSeconds] = useState(existing?.fadeInSeconds ?? 1.5);
  const [fadeOutSeconds, setFadeOutSeconds] = useState(existing?.fadeOutSeconds ?? 3.5);
  const [trimSilence, setTrimSilence] = useState(existing?.trimSilence !== false);
  const [duckUnderVoice, setDuckUnderVoice] = useState(existing?.duckUnderVoice !== false);

  const [remoteUrl, setRemoteUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [stats, setStats] = useState<{
    sourceDuration?: number;
    trimmedSilenceSeconds?: number;
    loopCount?: number;
    appliedCrossfade?: number;
    firstSeamAtSeconds?: number | null;
  }>({
    sourceDuration: existing?.sourceDuration,
    loopCount: existing?.loopCount,
    appliedCrossfade: existing?.crossfadeSeconds,
    firstSeamAtSeconds: existing?.firstSeamAtSeconds ?? null
  });

  // Guardamos el ArrayBuffer crudo de la canción cargada para poder reprocesar crossfade/fades al instante
  const rawBufferRef = useRef<ArrayBuffer | null>(null);
  const generatedUrlsRef = useRef<string[]>([]);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const processBuffer = async (
    buffer: ArrayBuffer,
    displayName: string,
    overrides?: {
      crossfadeSeconds?: number;
      fadeInSeconds?: number;
      fadeOutSeconds?: number;
      trimSilence?: boolean;
    }
  ) => {
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const result: SmartLoopedMusicOutput = await buildSmartLoopedMusicFromArrayBuffer(buffer, {
        targetDurationSeconds: scene.duration,
        crossfadeSeconds: overrides?.crossfadeSeconds ?? crossfadeSeconds,
        fadeInSeconds: overrides?.fadeInSeconds ?? fadeInSeconds,
        fadeOutSeconds: overrides?.fadeOutSeconds ?? fadeOutSeconds,
        trimSilence: overrides?.trimSilence ?? trimSilence
      });

      // Liberar URLs temporales previas creadas en esta sesión del modal
      for (const oldUrl of generatedUrlsRef.current) {
        if (oldUrl !== existing?.src) {
          URL.revokeObjectURL(oldUrl);
        }
      }
      generatedUrlsRef.current = [result.wavBlobUrl];

      setTrackName(displayName);
      setProcessedUrl(result.wavBlobUrl);
      setStats({
        sourceDuration: result.sourceDuration,
        trimmedSilenceSeconds: result.trimmedSilenceSeconds,
        loopCount: result.loopCount,
        appliedCrossfade: result.appliedCrossfade,
        firstSeamAtSeconds: result.firstSeamAtSeconds
      });
      setNeedsRebuild(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Error al procesar el archivo de audio instrumental.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectedFile = async (file: File) => {
    try {
      const arrayBuf = await file.arrayBuffer();
      rawBufferRef.current = arrayBuf;
      await processBuffer(arrayBuf, file.name);
    } catch {
      setErrorMsg('No se pudo leer el archivo seleccionado.');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleSelectedFile(file);
    }
  };

  const handleLoadFromUrl = async () => {
    const clean = remoteUrl.trim();
    if (!clean) return;
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const res = await fetch(clean);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      rawBufferRef.current = buf;
      const derivedName = clean.split('/').pop()?.split('?')[0] || 'Instrumental por Link';
      await processBuffer(buf, derivedName);
    } catch {
      // Fallback directo si CORS impide leer bytes pero buildSmartLoopedMusicFromUrl falla
      try {
        const result = await buildSmartLoopedMusicFromUrl(clean, {
          targetDurationSeconds: scene.duration,
          crossfadeSeconds,
          fadeInSeconds,
          fadeOutSeconds,
          trimSilence
        });
        setTrackName('Instrumental por Link');
        setProcessedUrl(result.wavBlobUrl);
        setStats({
          sourceDuration: result.sourceDuration,
          trimmedSilenceSeconds: result.trimmedSilenceSeconds,
          loopCount: result.loopCount,
          appliedCrossfade: result.appliedCrossfade,
          firstSeamAtSeconds: result.firstSeamAtSeconds
        });
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No se pudo descargar o decodificar el audio desde ese link (puede bloquear CORS).'
        );
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const handleUseBuiltinAmbient = async () => {
    setErrorMsg(null);
    setIsProcessing(true);
    try {
      const synthUrl = generateBuiltinSynthAudioWavUrl(16);
      const res = await fetch(synthUrl);
      const buf = await res.arrayBuffer();
      URL.revokeObjectURL(synthUrl);
      rawBufferRef.current = buf;
      await processBuffer(buf, 'Base Ambient Sintetizada (Bucle)');
    } catch {
      setErrorMsg('No se pudo generar la base ambient.');
      setIsProcessing(false);
    }
  };

  const handleRebuild = async () => {
    if (!rawBufferRef.current) return;
    await processBuffer(rawBufferRef.current, trackName || 'Canción Instrumental');
  };

  const seekPreviewTo = (seconds: number) => {
    const el = previewAudioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(scene.duration - 0.5, seconds));
    el.play().catch(() => {});
  };

  const handleApply = () => {
    if (!processedUrl) {
      onSaveMusicTrack(undefined);
      onClose();
      return;
    }

    onSaveMusicTrack({
      src: processedUrl,
      name: trackName || 'Música Instrumental',
      volume,
      sourceDuration: stats.sourceDuration,
      crossfadeSeconds: stats.appliedCrossfade ?? crossfadeSeconds,
      fadeInSeconds,
      fadeOutSeconds,
      trimSilence,
      loopCount: stats.loopCount,
      firstSeamAtSeconds: stats.firstSeamAtSeconds ?? undefined,
      duckUnderVoice
    });
    onClose();
  };

  const handleRemove = () => {
    onSaveMusicTrack(undefined);
    onClose();
  };

  return (
    <div className="eleven-tab-container">
      <div className="music-drop-row">
        <label
          className={`upload-drop-btn music-drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <Upload size={18} />
          <span>
            <strong>Subí o arrastrá tu canción instrumental</strong>
            <small>WAV, MP3, M4A, OGG, FLAC, AAC, WEBM • Bucle inteligente hasta {formatTimeMmSs(scene.duration)}</small>
          </span>
          <input
            type="file"
            accept={ACCEPTED_AUDIO_ATTR}
            onChange={handleFileInput}
            style={{ display: 'none' }}
          />
        </label>

        <button
          type="button"
          className="upload-drop-btn synth-btn"
          onClick={handleUseBuiltinAmbient}
          disabled={isProcessing}
        >
          <Wand2 size={16} />
          <span>Probar Base Ambient</span>
        </button>
      </div>

      <div className="inspector-col">
        <label>O pegá un link directo de audio (MP3, WAV, OGG, M4A):</label>
        <div className="topic-row">
          <input
            type="url"
            placeholder="https://ejemplo.com/instrumental.mp3"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={isProcessing || !remoteUrl.trim()}
            onClick={handleLoadFromUrl}
          >
            Cargar Link
          </button>
        </div>
      </div>

      {/* Ajustes del Bucle Inteligente */}
      <div className="music-settings-grid">
        <div className="inspector-col">
          <label>
            <Repeat size={12} /> Crossfade fin → inicio ({crossfadeSeconds.toFixed(1)}s)
          </label>
          <input
            type="range"
            min={0}
            max={6}
            step={0.5}
            value={crossfadeSeconds}
            onChange={(e) => {
              setCrossfadeSeconds(parseFloat(e.target.value));
              if (rawBufferRef.current) setNeedsRebuild(true);
            }}
          />
        </div>

        <div className="inspector-col">
          <label>Fade-In inicial ({fadeInSeconds.toFixed(1)}s)</label>
          <input
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={fadeInSeconds}
            onChange={(e) => {
              setFadeInSeconds(parseFloat(e.target.value));
              if (rawBufferRef.current) setNeedsRebuild(true);
            }}
          />
        </div>

        <div className="inspector-col">
          <label>Fade-Out final ({fadeOutSeconds.toFixed(1)}s)</label>
          <input
            type="range"
            min={0}
            max={6}
            step={0.5}
            value={fadeOutSeconds}
            onChange={(e) => {
              setFadeOutSeconds(parseFloat(e.target.value));
              if (rawBufferRef.current) setNeedsRebuild(true);
            }}
          />
        </div>
      </div>

      <div className="music-checkbox-group">
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={trimSilence}
            onChange={(e) => {
              setTrimSilence(e.target.checked);
              if (rawBufferRef.current) setNeedsRebuild(true);
            }}
          />
          <span>Recortar silencios muertos al inicio/fin (evita pausas vacías en canciones IA)</span>
        </label>

        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={duckUnderVoice}
            onChange={(e) => setDuckUnderVoice(e.target.checked)}
          />
          <span>Atenuar música automáticamente cuando haya pista de voz (auto-ducking en MP4)</span>
        </label>
      </div>

      {needsRebuild && rawBufferRef.current && (
        <button
          type="button"
          className="btn-secondary"
          onClick={handleRebuild}
          disabled={isProcessing}
        >
          <RefreshCw size={14} />
          Reprocesar bucle con los nuevos tiempos de crossfade/fade
        </button>
      )}

      {isProcessing && (
        <div className="narration-progress-box">
          <Loader2 size={15} className="spin-icon" />
          <span>
            Decodificando canción y ensamblando bucle inteligente estéreo hasta{' '}
            <strong>{formatTimeMmSs(scene.duration)}</strong>...
          </span>
        </div>
      )}

      {errorMsg && <div className="json-error-banner">{errorMsg}</div>}

      {processedUrl && !isProcessing && (
        <div className="audio-preview-card">
          <div className="audio-preview-row">
            <div className="music-card-title-row">
              <strong>
                <Music size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                {trackName || 'Música Instrumental'}
              </strong>
              <span className="music-status-badge">
                Cubre {formatTimeMmSs(scene.duration)} exactos
              </span>
            </div>

            {stats.loopCount && (
              <div className="music-stats-pills">
                {stats.sourceDuration && (
                  <span>Original: {formatTimeMmSs(stats.sourceDuration)}</span>
                )}
                <span>
                  {stats.loopCount === 1
                    ? '1 ciclo (cubre todo el video)'
                    : `${stats.loopCount} ciclos empalmados`}
                </span>
                {typeof stats.appliedCrossfade === 'number' && stats.loopCount > 1 && (
                  <span>Crossfade: {stats.appliedCrossfade.toFixed(1)}s</span>
                )}
                {typeof stats.trimmedSilenceSeconds === 'number' &&
                  stats.trimmedSilenceSeconds >= 0.2 && (
                    <span>Silencio recortado: {stats.trimmedSilenceSeconds.toFixed(1)}s</span>
                  )}
                <span>Fade-out final: {fadeOutSeconds.toFixed(1)}s</span>
              </div>
            )}

            <audio
              ref={previewAudioRef}
              src={processedUrl}
              controls
              className="mini-audio-player"
            />

            <div className="music-audition-row">
              {stats.firstSeamAtSeconds !== null &&
                stats.firstSeamAtSeconds !== undefined && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => seekPreviewTo(Math.max(0, stats.firstSeamAtSeconds! - 3))}
                  >
                    <SkipForward size={13} />
                    Oír Empalme #1 ({formatTimeMmSs(stats.firstSeamAtSeconds)})
                  </button>
                )}
              <button
                type="button"
                className="btn-secondary"
                onClick={() => seekPreviewTo(Math.max(0, scene.duration - Math.max(6, fadeOutSeconds + 2)))}
              >
                <SkipForward size={13} />
                Oír Fade-Out Final ({formatTimeMmSs(Math.max(0, scene.duration - 6))})
              </button>
            </div>
          </div>

          <div className="volume-row">
            <Volume2 size={15} />
            <span>Volumen música: {Math.round(volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
            />
          </div>
        </div>
      )}

      <div className="modal-footer-actions">
        {existing && (
          <button type="button" className="btn-danger-ghost" onClick={handleRemove}>
            <Trash2 size={14} />
            Quitar Música
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn-copy-big"
          disabled={isProcessing || !processedUrl}
          onClick={handleApply}
        >
          <Check size={15} />
          Aplicar Música al Video
        </button>
      </div>
    </div>
  );
};

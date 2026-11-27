/**
 * Responsabilidad Única: Interfaz para generar locución neuronal 100% gratuita e ilimitada
 * mediante `edge-tts` local (voces neuronales en español latino/multilingües HD), con prueba
 * de voz en 1 clic, anti-solapamiento inteligente, caché doble y respaldo automático en disco.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  HardDrive,
  Loader2,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Volume2
} from 'lucide-react';
import { DslAudioTrack, DslScene } from '../../dsl/dslTypes';
import { persistAudioFromUrl } from '../../engine/audioPersistenceStore';
import { countCachedSegmentsForConfig } from '../../engine/elevenLabsClipCache';
import {
  buildFreeNeuralCacheModelTag,
  checkFreeNeuralTtsStatus,
  FREE_NEURAL_VOICES,
  generateFreeNeuralSampleUrl,
  loadSavedFreeNeuralConfig,
  saveFreeNeuralConfig,
  synthesizeFreeNeuralSegment
} from '../../engine/freeNeuralTtsClient';
import {
  buildPreservedExistingAudioSlices,
  extractSceneNarrationSegments,
  retimeSceneToSpokenDurations,
  SceneNarrationSegment
} from '../../engine/narrationExtractor';
import { formatTextForNaturalSpanishTts } from '../../engine/ttsPronunciationFormatter';
import {
  assembleMasterNarrationWav,
  decodeExistingVoiceTrack,
  MasterWavAssemblyResult,
  MasterWavMergeOptions,
  SynthesizedClip
} from '../../engine/narrationWavAssembler';
import { NarrationNodePicker } from './NarrationNodePicker';

interface FreeNeuralNarrationTabProps {
  projectId: string;
  scene: DslScene;
  onApplyNarration: (audioTrack: DslAudioTrack, retimedScene?: DslScene) => void;
  onClose: () => void;
}

type NarrationScope = 'selected-nodes' | 'first-minute' | 'full-video' | 'custom-script';
type ExistingVoiceCombineMode = 'prepend-shift' | 'replace-ranges' | 'standalone';

interface LastRunSnapshot {
  clips: SynthesizedClip[];
  segments: SceneNarrationSegment[];
  existingVoiceBuffer: AudioBuffer | null;
  combineMode: ExistingVoiceCombineMode;
  fromCacheCount: number;
}

interface AssemblyAuditSummary {
  overlapCount: number;
  pushedClipsCount: number;
  minGapSeconds: number;
  totalDurationSeconds: number;
  fromCacheCount: number;
  totalClips: number;
  usedAutoSync: boolean;
}

function computeDefaultSelectedNodeIndices(segments: SceneNarrationSegment[]): Set<number> {
  const introIds = segments
    .filter((s) => (s.subtitleNodeId || '').toLowerCase().startsWith('intro-'))
    .map((s) => s.index);
  if (introIds.length > 0) return new Set(introIds);
  return new Set(segments.slice(0, 2).map((s) => s.index));
}

function formatMinutesSeconds(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const FreeNeuralNarrationTab: React.FC<FreeNeuralNarrationTabProps> = ({
  projectId,
  scene,
  onApplyNarration,
  onClose
}) => {
  const saved = useMemo(() => loadSavedFreeNeuralConfig(), []);
  const allSegments = useMemo(() => extractSceneNarrationSegments(scene), [scene]);
  const hasExistingVoice = Boolean(scene.audioTrack?.src);

  const [voiceId, setVoiceId] = useState(saved.voiceId);
  const [rate, setRate] = useState(saved.rate);
  const [pitch, setPitch] = useState(saved.pitch);
  const [scope, setScope] = useState<NarrationScope>(() =>
    hasExistingVoice ? 'selected-nodes' : 'full-video'
  );
  const [selectedNodeIndices, setSelectedNodeIndices] = useState<Set<number>>(() =>
    computeDefaultSelectedNodeIndices(allSegments)
  );
  const [combineMode, setCombineMode] = useState<ExistingVoiceCombineMode>('replace-ranges');
  const [autoSyncTimeline, setAutoSyncTimeline] = useState(true);
  const [pauseSeconds, setPauseSeconds] = useState(0.5);
  const [customScript, setCustomScript] = useState(() =>
    allSegments
      .slice(0, 8)
      .map((s) => s.text)
      .join(' ')
  );

  const [engineReady, setEngineReady] = useState<boolean | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [cachedStats, setCachedStats] = useState({ cachedCount: 0, uncachedCharacters: 0 });
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedWavUrl, setGeneratedWavUrl] = useState<string | null>(null);
  const [pendingScene, setPendingScene] = useState<DslScene | undefined>(undefined);
  const [auditSummary, setAuditSummary] = useState<AssemblyAuditSummary | null>(null);
  const [savedDiskPath, setSavedDiskPath] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastRunRef = useRef<LastRunSnapshot | null>(null);

  const currentConfig = useMemo(() => ({ voiceId, rate, pitch }), [voiceId, rate, pitch]);
  const cacheModelTag = useMemo(
    () => buildFreeNeuralCacheModelTag(currentConfig),
    [currentConfig]
  );

  useEffect(() => {
    checkFreeNeuralTtsStatus().then((res) => {
      setEngineReady(res.available);
      if (!res.available && res.error) setEngineError(res.error);
    });
    return () => {
      sampleAudioRef.current?.pause();
    };
  }, []);

  const activeSegments = useMemo(() => {
    if (scope === 'selected-nodes') {
      return allSegments.filter((s) => selectedNodeIndices.has(s.index));
    }
    if (scope === 'first-minute') {
      return allSegments.filter((s) => s.startAt < 60);
    }
    return allSegments;
  }, [allSegments, scope, selectedNodeIndices]);

  useEffect(() => {
    let cancelled = false;
    const texts =
      scope === 'custom-script'
        ? customScript.trim()
          ? [formatTextForNaturalSpanishTts(customScript.trim())]
          : []
        : activeSegments.map((s) => formatTextForNaturalSpanishTts(s.text));

    countCachedSegmentsForConfig(texts, voiceId, cacheModelTag, projectId).then((res) => {
      if (!cancelled) setCachedStats(res);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, customScript, activeSegments, voiceId, cacheModelTag, projectId]);

  const handlePlaySample = async () => {
    setErrorMsg(null);
    setIsLoadingSample(true);
    try {
      saveFreeNeuralConfig(currentConfig);
      sampleAudioRef.current?.pause();
      const url = await generateFreeNeuralSampleUrl(currentConfig);
      const audio = new Audio(url);
      sampleAudioRef.current = audio;
      await audio.play();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo reproducir la muestra.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  const buildMasterTrackFromClips = (
    snapshot: LastRunSnapshot,
    useAutoSync: boolean,
    gapPauseSec: number
  ) => {
    const { clips, segments, existingVoiceBuffer, combineMode: mode, fromCacheCount } = snapshot;
    const minGap = Math.max(0.25, gapPauseSec);
    let assembled: MasterWavAssemblyResult;
    let nextScene: DslScene | undefined;

    if (useAutoSync) {
      const spokenDurations = clips.map((c) => c.durationSeconds);
      const retimed = retimeSceneToSpokenDurations(
        scene,
        segments,
        spokenDurations,
        gapPauseSec
      );
      const lastWindow = retimed.retimedWindows[retimed.retimedWindows.length - 1];
      const shiftExisting = lastWindow ? lastWindow.newEnd : 0;

      const mergeOptions: MasterWavMergeOptions | undefined =
        existingVoiceBuffer && mode !== 'standalone'
          ? {
              existingVoiceBuffer,
              mode,
              shiftExistingBySeconds: shiftExisting,
              replacedRanges: segments.map((s) => ({ start: s.startAt, end: s.endAt })),
              preservedSlices:
                mode === 'replace-ranges'
                  ? buildPreservedExistingAudioSlices(
                      existingVoiceBuffer.duration,
                      retimed.retimedWindows
                    )
                  : undefined
            }
          : undefined;

      assembled = assembleMasterNarrationWav(
        clips,
        retimed.audioStartOffsets,
        retimed.totalDuration,
        mergeOptions,
        minGap
      );
      nextScene = retimed.updatedScene;
    } else {
      const fixedOffsets = segments.map((s) => s.startAt + 0.35);
      const mergeOptions: MasterWavMergeOptions | undefined =
        existingVoiceBuffer && mode !== 'standalone'
          ? {
              existingVoiceBuffer,
              mode,
              replacedRanges: segments.map((s) => ({ start: s.startAt, end: s.endAt }))
            }
          : undefined;

      assembled = assembleMasterNarrationWav(
        clips,
        fixedOffsets,
        scene.duration,
        mergeOptions,
        minGap
      );
      nextScene = undefined;
    }

    setGeneratedWavUrl(assembled.wavUrl);
    setPendingScene(nextScene);
    setAuditSummary({
      overlapCount: assembled.overlapCount,
      pushedClipsCount: assembled.pushedClipsCount,
      minGapSeconds: assembled.minGapSeconds,
      totalDurationSeconds: assembled.totalDurationSeconds,
      fromCacheCount,
      totalClips: clips.length,
      usedAutoSync: useAutoSync
    });
    setStatusText(`¡${clips.length} escenas narradas gratis y sincronizadas sin solapamientos!`);

    const shouldAutoPersistMaster =
      scope === 'full-video' || !hasExistingVoice || mode !== 'standalone';
    if (shouldAutoPersistMaster) {
      const voiceObj = FREE_NEURAL_VOICES.find((v) => v.id === voiceId);
      const label = `Voz IA Gratis (${voiceObj ? voiceObj.name : voiceId})`;
      void persistAudioFromUrl(projectId, 'voice', assembled.wavUrl, label).then((outcome) => {
        if (outcome.savedToDisk && outcome.diskPath) {
          setSavedDiskPath(outcome.diskPath);
        }
      });
    }
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    saveFreeNeuralConfig(currentConfig);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);

    const audioCtx = new AudioContext();
    try {
      if (scope === 'custom-script') {
        const text = customScript.trim();
        if (!text) throw new Error('Escribí un texto para narrar.');
        setStatusText('Sintetizando locución neuronal gratuita...');
        const clip = await synthesizeFreeNeuralSegment(
          text,
          currentConfig,
          audioCtx,
          controller.signal,
          projectId
        );
        const assembled = assembleMasterNarrationWav(
          [clip],
          [0.25],
          Math.max(scene.duration, clip.durationSeconds + 0.6),
          undefined,
          pauseSeconds
        );
        lastRunRef.current = null;
        setGeneratedWavUrl(assembled.wavUrl);
        setPendingScene(undefined);
        void persistAudioFromUrl(projectId, 'voice', assembled.wavUrl, 'Voz IA Gratis (Guión)').then(
          (outcome) => {
            if (outcome.savedToDisk && outcome.diskPath) setSavedDiskPath(outcome.diskPath);
          }
        );
        setAuditSummary({
          overlapCount: assembled.overlapCount,
          pushedClipsCount: assembled.pushedClipsCount,
          minGapSeconds: assembled.minGapSeconds,
          totalDurationSeconds: assembled.totalDurationSeconds,
          fromCacheCount: clip.fromCache ? 1 : 0,
          totalClips: 1,
          usedAutoSync: false
        });
        setStatusText(`¡Locución gratuita lista! (${clip.durationSeconds.toFixed(1)}s)`);
      } else {
        if (activeSegments.length === 0) {
          throw new Error('Seleccioná al menos una escena para narrar.');
        }

        const clips: SynthesizedClip[] = [];
        let fromCacheCount = 0;

        for (let i = 0; i < activeSegments.length; i++) {
          setStatusText(
            `Narrando gratis escena ${i + 1} de ${activeSegments.length} (#${activeSegments[i].index + 1})...`
          );
          const clip = await synthesizeFreeNeuralSegment(
            activeSegments[i].text,
            currentConfig,
            audioCtx,
            controller.signal,
            projectId
          );
          if (clip.fromCache) fromCacheCount++;
          clips.push(clip);
        }

        const effectiveCombineMode: ExistingVoiceCombineMode =
          scope === 'full-video' ? 'standalone' : combineMode;

        let existingVoiceBuffer: AudioBuffer | null = null;
        if (hasExistingVoice && scene.audioTrack?.src && effectiveCombineMode !== 'standalone') {
          setStatusText('Combinando escenas nuevas con tu pista de voz actual...');
          existingVoiceBuffer = await decodeExistingVoiceTrack(scene.audioTrack.src, audioCtx);
        }

        const snapshot: LastRunSnapshot = {
          clips,
          segments: activeSegments,
          existingVoiceBuffer,
          combineMode: effectiveCombineMode,
          fromCacheCount
        };
        lastRunRef.current = snapshot;
        buildMasterTrackFromClips(snapshot, autoSyncTimeline, pauseSeconds);
        setCachedStats({ cachedCount: activeSegments.length, uncachedCharacters: 0 });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setErrorMsg(err instanceof Error ? err.message : 'Error generando voz gratuita.');
      }
    } finally {
      audioCtx.close().catch(() => {});
      setIsGenerating(false);
    }
  };

  const handleFreeReassemble = (forceAutoSync?: boolean) => {
    if (!lastRunRef.current) return;
    const nextAutoSync = forceAutoSync ?? autoSyncTimeline;
    if (forceAutoSync !== undefined) setAutoSyncTimeline(forceAutoSync);
    buildMasterTrackFromClips(lastRunRef.current, nextAutoSync, pauseSeconds);
  };

  const handleConfirmApply = () => {
    if (!generatedWavUrl) return;
    const voiceObj = FREE_NEURAL_VOICES.find((v) => v.id === voiceId);
    onApplyNarration(
      {
        src: generatedWavUrl,
        name: `Voz IA Gratis (${voiceObj ? voiceObj.name : voiceId})`,
        volume: 0.95
      },
      pendingScene
    );
    onClose();
  };

  return (
    <div className="eleven-tab-container">
      <div className="music-status-badge" style={{ borderRadius: 8, padding: '7px 10px', fontWeight: 500 }}>
        ✨ <strong>100% Gratis e Ilimitada (0 tokens • sin API Key):</strong> usa las voces neuronales de Microsoft (`edge-tts`) desde tu entorno aislado en <code>D:</code>, con respaldo físico en disco y barrera anti-solapamiento.
      </div>

      {engineReady === false && (
        <div className="json-error-banner">
          El motor local `edge-tts` no respondió ({engineError || 'iniciá el editor con npm run dev'}).
        </div>
      )}

      <div className="inspector-col">
        <label>
          <Mic size={12} /> Voz Neuronal en Español / Multilingüe HD (probá todas con "Oír Muestra")
        </label>
        <div className="topic-row">
          <select
            style={{
              flex: 1,
              background: 'var(--bg-dark)',
              border: '1px solid var(--border)',
              color: 'var(--text-main)',
              padding: '7px 10px',
              borderRadius: 7,
              fontSize: 12.5
            }}
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          >
            {FREE_NEURAL_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.gender === 'F' ? '👩' : '👨'} {v.name} ({v.region}) — {v.role}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn-secondary"
            disabled={isLoadingSample || engineReady === false}
            onClick={handlePlaySample}
            title="Escuchar una frase de prueba con esta voz (100% gratis)"
          >
            {isLoadingSample ? <Loader2 size={14} className="spin-icon" /> : <Volume2 size={14} />}
            Oír Muestra
          </button>
        </div>
      </div>

      <div className="inspector-grid-2">
        <div className="inspector-col">
          <label>Velocidad y Tono de Locución</label>
          <div className="topic-row">
            <select
              style={{ flex: 1 }}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            >
              <option value="-12%">Muy calmada (-12%)</option>
              <option value="-6%">Pausada (+50 ideal, -6%)</option>
              <option value="+0%">Natural (0%)</option>
              <option value="+5%">Ágil (+5%)</option>
              <option value="+10%">Dinámica (+10%)</option>
            </select>
            <select
              style={{ width: 120 }}
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
            >
              <option value="-4Hz">Más cálida (-4Hz)</option>
              <option value="+0Hz">Tono natural</option>
              <option value="+3Hz">Más brillante (+3Hz)</option>
            </select>
          </div>
        </div>

        <div className="inspector-col">
          <label>
            Alcance a Narrar ({activeSegments.length} escenas
            {cachedStats.cachedCount > 0 ? ` • ⚡ ${cachedStats.cachedCount} en caché` : ''})
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as NarrationScope)}
          >
            <option value="full-video">Video completo ({allSegments.length} escenas)</option>
            <option value="selected-nodes">
              🎯 Elegir escenas específicas ({selectedNodeIndices.size} elegidas)
            </option>
            {scene.duration > 90 && (
              <option value="first-minute">
                Primer minuto ({allSegments.filter((s) => s.startAt < 60).length} escenas)
              </option>
            )}
            <option value="custom-script">Guión libre personalizado</option>
          </select>
        </div>
      </div>

      {hasExistingVoice && scope !== 'full-video' && scope !== 'custom-script' && (
        <div className="inspector-col">
          <label>Ya tenés una voz cargada ({scene.audioTrack?.name}) — ¿cómo combinamos?</label>
          <select
            value={combineMode}
            onChange={(e) => setCombineMode(e.target.value as ExistingVoiceCombineMode)}
          >
            <option value="replace-ranges">
              🩹 Reemplazar solo estas escenas (conserva y recoloca el resto sin pisar voces)
            </option>
            <option value="prepend-shift">
              ➕ Anteponer al audio actual (desplaza el resto sin solapamiento)
            </option>
            <option value="standalone">
              🆕 Generar solo estas escenas (sin mezclar con la voz anterior)
            </option>
          </select>
        </div>
      )}

      {scope === 'custom-script' ? (
        <textarea
          className="prompt-preview-textarea"
          style={{ minHeight: 90 }}
          value={customScript}
          onChange={(e) => setCustomScript(e.target.value)}
          placeholder="Escribí acá el texto que querés narrar..."
        />
      ) : (
        <div className="narration-preview-box">
          <div className="topic-row" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <label className="sync-checkbox-row" style={{ flex: 1, minWidth: 260 }}>
              <input
                type="checkbox"
                checked={autoSyncTimeline}
                onChange={(e) => setAutoSyncTimeline(e.target.checked)}
              />
              <span>
                <strong>Anti-solapamiento inteligente (Recomendado):</strong> cada escena cambia recién cuando la voz termina de leer + pausa
              </span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
              <span style={{ color: 'var(--text-muted)' }}>Pausa:</span>
              <select
                value={pauseSeconds}
                onChange={(e) => setPauseSeconds(parseFloat(e.target.value) || 0.5)}
                style={{
                  background: 'var(--bg-dark)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-main)',
                  padding: '4px 7px',
                  borderRadius: 6,
                  fontSize: 11.5
                }}
              >
                <option value={0.3}>0.30s (Ágil)</option>
                <option value={0.5}>0.50s (Natural)</option>
                <option value={0.75}>0.75s (Pausado)</option>
                <option value={1.0}>1.00s (Muy calmo)</option>
              </select>
            </div>
          </div>

          {scope === 'selected-nodes' ? (
            <NarrationNodePicker
              segments={allSegments}
              selectedIndices={selectedNodeIndices}
              onChangeSelected={setSelectedNodeIndices}
            />
          ) : (
            <div className="segments-mini-list">
              {activeSegments.slice(0, 5).map((seg) => (
                <div key={seg.index} className="segment-mini-item">
                  <code>#{seg.index + 1}</code>
                  <span>{seg.text}</span>
                </div>
              ))}
              {activeSegments.length > 5 && (
                <div className="segment-mini-more">
                  + {activeSegments.length - 5} escenas listas (~30 segundos para narrar todo gratis)...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {errorMsg && <div className="json-error-banner">{errorMsg}</div>}

      {generatedWavUrl && (
        <div className="audio-preview-card">
          <div className="audio-preview-row">
            <strong>🎙️ {statusText}</strong>
            <audio src={generatedWavUrl} controls className="mini-audio-player" />
          </div>

          {auditSummary && (
            <div className="music-stats-pills">
              <span style={{ color: '#34d399', fontWeight: 600 }}>
                <ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                {auditSummary.overlapCount === 0
                  ? '0 solapamientos verificados'
                  : `${auditSummary.overlapCount} cruces`}
              </span>
              <span>Pausa mín: {auditSummary.minGapSeconds.toFixed(2)}s</span>
              <span>Duración: {formatMinutesSeconds(auditSummary.totalDurationSeconds)}</span>
              {auditSummary.fromCacheCount > 0 && (
                <span>⚡ {auditSummary.fromCacheCount}/{auditSummary.totalClips} desde caché</span>
              )}
              {savedDiskPath && (
                <span style={{ color: '#7dd3fc' }}>
                  <HardDrive size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  Guardado en disco: <code>{savedDiskPath}</code>
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={generatedWavUrl}
              download={`${projectId}-voz-ia-gratis.wav`}
              className="btn-secondary"
              style={{ textDecoration: 'none' }}
            >
              <Download size={13} />
              Descargar Locución (.wav)
            </a>

            {lastRunRef.current && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleFreeReassemble()}
              >
                <RefreshCw size={13} />
                Re-aplicar Pausa / Sync
              </button>
            )}
          </div>
        </div>
      )}

      <div className="modal-footer-actions">
        {isGenerating ? (
          <button
            type="button"
            className="btn-danger-ghost"
            onClick={() => abortRef.current?.abort()}
          >
            Detener ({statusText})
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        )}

        <button
          type="button"
          className="btn-primary"
          disabled={isGenerating || engineReady === false}
          onClick={handleGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 size={15} className="spin-icon" />
              Narrando...
            </>
          ) : (
            <>
              <Sparkles size={15} />
              Generar Voz Gratis Ilimitada
            </>
          )}
        </button>

        {generatedWavUrl && !isGenerating && (
          <button
            type="button"
            className="btn-copy-big"
            onClick={handleConfirmApply}
          >
            <Check size={15} />
            Insertar en el Video
          </button>
        )}
      </div>
    </div>
  );
};

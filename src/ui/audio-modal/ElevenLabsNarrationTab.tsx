/**
 * Responsabilidad Única: Interfaz para generar locución automática con ElevenLabs
 * usando voces oficiales `premade` (habilitadas gratis por API), caché local de clips
 * para cero tokens desperdiciados y sincronización inteligente anti-solapamiento.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  HardDrive,
  KeyRound,
  Loader2,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Volume2
} from 'lucide-react';
import { DslAudioTrack, DslScene } from '../../dsl/dslTypes';
import { persistAudioFromUrl } from '../../engine/audioPersistenceStore';
import {
  assembleMasterNarrationWav,
  decodeExistingVoiceTrack,
  DEFAULT_ELEVENLABS_VOICE_ID,
  ElevenLabsModelId,
  fetchFreePremadePreviewMap,
  FREE_TIER_PREMADE_VOICES,
  isLikelyElevenLabsKeyId,
  loadSavedElevenLabsConfig,
  MasterWavAssemblyResult,
  MasterWavMergeOptions,
  saveElevenLabsConfig,
  synthesizeElevenLabsSegment,
  SynthesizedClip
} from '../../engine/elevenLabsClient';
import { countCachedSegmentsForConfig } from '../../engine/elevenLabsClipCache';
import {
  buildPreservedExistingAudioSlices,
  extractSceneNarrationSegments,
  retimeSceneToSpokenDurations,
  SceneNarrationSegment
} from '../../engine/narrationExtractor';
import { formatTextForNaturalSpanishTts } from '../../engine/ttsPronunciationFormatter';
import { NarrationNodePicker } from './NarrationNodePicker';

interface ElevenLabsNarrationTabProps {
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

export const ElevenLabsNarrationTab: React.FC<ElevenLabsNarrationTabProps> = ({
  projectId,
  scene,
  onApplyNarration,
  onClose
}) => {
  const saved = useMemo(() => loadSavedElevenLabsConfig(), []);
  const allSegments = useMemo(() => extractSceneNarrationSegments(scene), [scene]);
  const hasExistingVoice = Boolean(scene.audioTrack?.src);

  const isSavedPreset = FREE_TIER_PREMADE_VOICES.some((v) => v.id === saved.voiceId);

  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [selectedPresetVoice, setSelectedPresetVoice] = useState<string>(
    isSavedPreset ? saved.voiceId : 'custom'
  );
  const [customVoiceId, setCustomVoiceId] = useState<string>(
    isSavedPreset ? '' : saved.voiceId
  );
  const [modelId, setModelId] = useState<ElevenLabsModelId>(saved.modelId);
  const [scope, setScope] = useState<NarrationScope>(() =>
    hasExistingVoice ? 'selected-nodes' : 'full-video'
  );
  const [selectedNodeIndices, setSelectedNodeIndices] = useState<Set<number>>(() =>
    computeDefaultSelectedNodeIndices(allSegments)
  );
  const defaultIntroEndSeconds = useMemo(() => {
    const introSegs = allSegments.filter((s) =>
      (s.subtitleNodeId || '').toLowerCase().startsWith('intro-')
    );
    if (introSegs.length > 0) return introSegs[introSegs.length - 1].endAt;
    return 15;
  }, [allSegments]);

  const [combineMode, setCombineMode] = useState<ExistingVoiceCombineMode>('replace-ranges');
  const [prependShiftSeconds, setPrependShiftSeconds] = useState<number>(defaultIntroEndSeconds);
  // Activado por defecto: garantiza que cada escena pase recién cuando termina de hablar la voz
  const [autoSyncTimeline, setAutoSyncTimeline] = useState(true);
  const [pauseSeconds, setPauseSeconds] = useState(0.5);
  const [customScript, setCustomScript] = useState(() =>
    allSegments
      .slice(0, 8)
      .map((s) => s.text)
      .join(' ')
  );

  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [cachedStats, setCachedStats] = useState<{
    cachedCount: number;
    uncachedCharacters: number;
  }>({ cachedCount: 0, uncachedCharacters: 0 });
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

  useEffect(() => {
    fetchFreePremadePreviewMap().then(setPreviewUrls);
    return () => {
      sampleAudioRef.current?.pause();
    };
  }, []);

  const effectiveVoiceId =
    selectedPresetVoice === 'custom'
      ? customVoiceId.trim() || DEFAULT_ELEVENLABS_VOICE_ID
      : selectedPresetVoice;

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

    countCachedSegmentsForConfig(texts, effectiveVoiceId, modelId, projectId).then((res) => {
      if (!cancelled) setCachedStats(res);
    });
    return () => {
      cancelled = true;
    };
  }, [scope, customScript, activeSegments, effectiveVoiceId, modelId, projectId]);

  const totalCharacters = useMemo(() => {
    if (scope === 'custom-script') return customScript.trim().length;
    return activeSegments.reduce((acc, s) => acc + s.text.length, 0);
  }, [scope, customScript, activeSegments]);

  const allInLocalCache =
    scope !== 'custom-script'
      ? activeSegments.length > 0 && cachedStats.cachedCount === activeSegments.length
      : customScript.trim().length > 0 && cachedStats.cachedCount === 1;

  const handlePlayFreePreview = () => {
    const url = previewUrls[effectiveVoiceId];
    if (!url) return;
    sampleAudioRef.current?.pause();
    const audio = new Audio(url);
    sampleAudioRef.current = audio;
    audio.play().catch(() => {});
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
      const isStandaloneSubset =
        scope === 'selected-nodes' && (!existingVoiceBuffer || mode === 'standalone');
      const fixedOffsets = segments.map((s) => s.startAt + 0.35);
      const mergeOptions: MasterWavMergeOptions | undefined =
        existingVoiceBuffer && mode !== 'standalone'
          ? {
              existingVoiceBuffer,
              mode,
              shiftExistingBySeconds: prependShiftSeconds,
              replacedRanges: segments.map((s) => ({ start: s.startAt, end: s.endAt }))
            }
          : undefined;

      const targetTotal = isStandaloneSubset
        ? Math.max(
            segments[segments.length - 1].endAt + 0.5,
            (fixedOffsets[fixedOffsets.length - 1] ?? 0) +
              (clips[clips.length - 1]?.durationSeconds ?? 2) +
              0.5
          )
        : scene.duration;

      assembled = assembleMasterNarrationWav(
        clips,
        fixedOffsets,
        targetTotal,
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
    setStatusText(
      useAutoSync
        ? `¡${clips.length} escenas narradas y sincronizadas sin solapamientos!`
        : `¡${clips.length} escenas ensambladas sin cruces de voz!`
    );

    // Respaldo automático inmediato en disco físico + IndexedDB (sobrevive cierres o reinicios)
    const shouldAutoPersistMaster =
      scope === 'full-video' || !hasExistingVoice || mode !== 'standalone';
    if (shouldAutoPersistMaster) {
      const presetObj = FREE_TIER_PREMADE_VOICES.find((v) => v.id === effectiveVoiceId);
      const trackLabel = `Voz ElevenLabs (${presetObj ? presetObj.name : effectiveVoiceId.slice(0, 8)})`;
      void persistAudioFromUrl(projectId, 'voice', assembled.wavUrl, trackLabel).then((outcome) => {
        if (outcome.savedToDisk && outcome.diskPath) {
          setSavedDiskPath(outcome.diskPath);
        }
      });
    }
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    const config = {
      apiKey: apiKey.trim(),
      voiceId: effectiveVoiceId,
      modelId
    };
    saveElevenLabsConfig(config);

    if (!config.apiKey && !allInLocalCache) {
      setErrorMsg('Pegá tu API Key secreta de ElevenLabs (empieza con sk_...) arriba.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);

    const audioCtx = new AudioContext();
    try {
      if (scope === 'custom-script') {
        const text = customScript.trim();
        if (!text) throw new Error('Escribí un texto para narrar.');
        setStatusText('Generando locución en ElevenLabs...');
        const clip = await synthesizeElevenLabsSegment(
          text,
          config,
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
        void persistAudioFromUrl(projectId, 'voice', assembled.wavUrl, 'Voz ElevenLabs (Guión)').then(
          (outcome) => {
            if (outcome.savedToDisk && outcome.diskPath) {
              setSavedDiskPath(outcome.diskPath);
            }
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
        setStatusText(
          `¡Locución lista! (${clip.durationSeconds.toFixed(1)}s${clip.fromCache ? ' • caché local' : ''})`
        );
      } else {
        if (activeSegments.length === 0) {
          throw new Error(
            scope === 'selected-nodes'
              ? 'Seleccioná al menos un nodo de la lista para narrar.'
              : 'No se encontraron textos narrables en las escenas del proyecto.'
          );
        }

        const clips: SynthesizedClip[] = [];
        let fromCacheCount = 0;

        for (let i = 0; i < activeSegments.length; i++) {
          setStatusText(
            `Analizando y narrando escena ${i + 1} de ${activeSegments.length} (#${activeSegments[i].index + 1})...`
          );
          const clip = await synthesizeElevenLabsSegment(
            activeSegments[i].text,
            config,
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
          setStatusText('Combinando clips nuevos con tu pista de voz existente...');
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

        // Actualizar indicador de caché tras guardar todos los clips en IndexedDB
        setCachedStats({
          cachedCount: activeSegments.length,
          uncachedCharacters: 0
        });
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setErrorMsg(err instanceof Error ? err.message : 'Error al conectar con ElevenLabs');
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
    const presetObj = FREE_TIER_PREMADE_VOICES.find((v) => v.id === effectiveVoiceId);
    onApplyNarration(
      {
        src: generatedWavUrl,
        name: `Voz ElevenLabs (${presetObj ? presetObj.name : effectiveVoiceId.slice(0, 8)})`,
        volume: 0.95
      },
      pendingScene
    );
    onClose();
  };

  return (
    <div className="eleven-tab-container">
      <div className="inspector-col">
        <label>
          <KeyRound size={12} /> ElevenLabs API Key secreta (empieza con <code>sk_...</code>, guardada localmente)
        </label>
        <input
          type="password"
          placeholder="sk_..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        {isLikelyElevenLabsKeyId(apiKey) && (
          <div className="dsl-error-box" style={{ marginTop: 6 }}>
            Eso parece un <strong>API Key ID</strong> (no empieza con <code>sk_</code>). En ElevenLabs → <strong>Developers → API Keys</strong> creá una clave nueva o tocá <strong>Rotate</strong> y copiá la clave secreta que empieza con <code>sk_...</code>.
          </div>
        )}
      </div>

      <div className="inspector-col">
        <label>
          <Mic size={12} /> Voz Oficial Habilitada en Plan Gratis (hablan español fluido con Flash/Multilingual)
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
            value={selectedPresetVoice}
            onChange={(e) => setSelectedPresetVoice(e.target.value)}
          >
            {FREE_TIER_PREMADE_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                ✅ {v.name} — {v.role} (Gratis por API)
              </option>
            ))}
            <option value="custom">🔒 Otro Voice ID personalizado (requiere plan pago en ElevenLabs)</option>
          </select>

          {previewUrls[effectiveVoiceId] && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handlePlayFreePreview}
              title="Escuchar timbre de la voz gratis sin gastar créditos"
            >
              <Volume2 size={14} />
              Oír Muestra
            </button>
          )}
        </div>
      </div>

      {selectedPresetVoice === 'custom' && (
        <div className="inspector-col">
          <label>Voice ID Personalizado (Nota: ElevenLabs bloquea voces de librería en cuentas Free con error 402)</label>
          <input
            type="text"
            placeholder="Pegá el Voice ID..."
            value={customVoiceId}
            onChange={(e) => setCustomVoiceId(e.target.value)}
          />
        </div>
      )}

      <div className="inspector-grid-2">
        <div className="inspector-col">
          <label>Modelo Multilingüe (Español)</label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value as ElevenLabsModelId)}
          >
            <option value="eleven_flash_v2_5">Flash v2.5 (Rápido • Gasta 50% menos créditos)</option>
            <option value="eleven_multilingual_v2">Multilingual v2 (Máximo realismo documental)</option>
            <option value="eleven_turbo_v2_5">Turbo v2.5 (Balanceado)</option>
          </select>
        </div>

        <div className="inspector-col">
          <label>
            Alcance a Narrar (
            {cachedStats.cachedCount > 0
              ? `${cachedStats.uncachedCharacters} nuevos • ⚡ ${cachedStats.cachedCount} en caché`
              : `${totalCharacters} caracteres`}
            )
          </label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as NarrationScope)}
          >
            <option value="full-video">
              Video completo ({allSegments.length} escenas)
            </option>
            <option value="selected-nodes">
              🎯 Elegir escenas / nodos específicos ({selectedNodeIndices.size} elegidos)
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
          <label>Ya tenés una voz cargada ({scene.audioTrack?.name}) — ¿cómo combinamos estos nodos?</label>
          <div className="topic-row">
            <select
              style={{ flex: 1 }}
              value={combineMode}
              onChange={(e) => setCombineMode(e.target.value as ExistingVoiceCombineMode)}
            >
              <option value="replace-ranges">
                🩹 Reemplazar solo estos nodos (conserva y recoloca el resto sin pisar voces)
              </option>
              <option value="prepend-shift">
                ➕ Anteponer al audio actual (desplaza tu audio previo sin solapamiento)
              </option>
              <option value="standalone">
                🆕 Generar solo estos nodos (sin mezclar con la voz anterior)
              </option>
            </select>
            {combineMode === 'prepend-shift' && !autoSyncTimeline && (
              <input
                type="number"
                min={0}
                step={0.5}
                value={prependShiftSeconds}
                onChange={(e) =>
                  setPrependShiftSeconds(Math.max(0, parseFloat(e.target.value) || 0))
                }
                title="Segundos mínimos que se desplaza el audio anterior hacia adelante"
                style={{ width: 82 }}
              />
            )}
          </div>
        </div>
      )}

      {scope === 'custom-script' ? (
        <textarea
          className="prompt-preview-textarea"
          style={{ minHeight: 90 }}
          value={customScript}
          onChange={(e) => setCustomScript(e.target.value)}
          placeholder="Escribí acá el texto que querés que narre la voz..."
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

          {cachedStats.cachedCount > 0 && (
            <div className="music-status-badge" style={{ borderRadius: 7, padding: '5px 9px', fontWeight: 500 }}>
              ⚡ Caché local activo: {cachedStats.cachedCount} de {activeSegments.length} escenas ya guardadas en tu PC (0 créditos). Solo se pedirán a ElevenLabs {activeSegments.length - cachedStats.cachedCount} nuevas ({cachedStats.uncachedCharacters} caracteres).
            </div>
          )}

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
                  + {activeSegments.length - 5} escenas más listas para narrar...
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
                <span>⚡ {auditSummary.fromCacheCount}/{auditSummary.totalClips} desde caché (0 créditos)</span>
              )}
              {savedDiskPath && (
                <span style={{ color: '#7dd3fc' }}>
                  <HardDrive size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  Guardado en disco: <code>{savedDiskPath}</code>
                </span>
              )}
            </div>
          )}

          {auditSummary && !auditSummary.usedAutoSync && auditSummary.pushedClipsCount > 0 && (
            <div className="dsl-error-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <span>
                ⚠️ {auditSummary.pushedClipsCount} frases duraron más que el tiempo fijo de su escena. El audio las empujó automáticamente para que <strong>no se pisen dos voces</strong>, pero conviene ajustar las visuales a la voz real.
              </span>
              {lastRunRef.current && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleFreeReassemble(true)}
                >
                  <RefreshCw size={13} />
                  Sincronizar escenas (0 créditos)
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a
              href={generatedWavUrl}
              download={`${projectId}-narracion-elevenlabs.wav`}
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
                title="Re-ensambla el WAV y el timeline con la pausa y sincronización elegidas sin llamar a ElevenLabs"
              >
                <RefreshCw size={13} />
                Re-aplicar Pausa / Sync (0 créditos)
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
          disabled={isGenerating}
          onClick={handleGenerate}
        >
          {isGenerating ? (
            <>
              <Loader2 size={15} className="spin-icon" />
              Generando Voz...
            </>
          ) : (
            <>
              <Sparkles size={15} />
              {allInLocalCache
                ? 'Ensamblar desde Caché (0 créditos)'
                : cachedStats.cachedCount > 0
                  ? `Completar Faltantes (${activeSegments.length - cachedStats.cachedCount} nuevas)`
                  : 'Generar Voz Gratis por API'}
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

/**
 * Responsabilidad Única: Interfaz para generar locución automática con ElevenLabs
 * usando las voces oficiales gratuitas (`premade`, que no tiran error 402 en Plan Free)
 * con botón para escuchar muestra sin gastar créditos, o usando un Voice ID personalizado.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, KeyRound, Loader2, Mic, Sparkles, Volume2 } from 'lucide-react';
import { DslAudioTrack, DslScene } from '../../dsl/dslTypes';
import {
  assembleClipsIntoMasterWavUrl,
  decodeExistingVoiceTrack,
  DEFAULT_ELEVENLABS_VOICE_ID,
  ElevenLabsModelId,
  fetchFreePremadePreviewMap,
  FREE_TIER_PREMADE_VOICES,
  isLikelyElevenLabsKeyId,
  loadSavedElevenLabsConfig,
  MasterWavMergeOptions,
  saveElevenLabsConfig,
  synthesizeElevenLabsSegment,
  SynthesizedClip
} from '../../engine/elevenLabsClient';
import {
  extractSceneNarrationSegments,
  retimeSceneToSpokenDurations
} from '../../engine/narrationExtractor';
import { NarrationNodePicker } from './NarrationNodePicker';

interface ElevenLabsNarrationTabProps {
  projectId: string;
  scene: DslScene;
  onApplyNarration: (audioTrack: DslAudioTrack, retimedScene?: DslScene) => void;
  onClose: () => void;
}

type NarrationScope = 'selected-nodes' | 'first-minute' | 'full-video' | 'custom-script';
type ExistingVoiceCombineMode = 'prepend-shift' | 'replace-ranges' | 'standalone';

function computeDefaultSelectedNodeIndices(
  segments: ReturnType<typeof extractSceneNarrationSegments>
): Set<number> {
  const introIds = segments
    .filter((s) => (s.subtitleNodeId || '').toLowerCase().startsWith('intro-'))
    .map((s) => s.index);
  if (introIds.length > 0) return new Set(introIds);
  return new Set(segments.slice(0, 2).map((s) => s.index));
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
  const [scope, setScope] = useState<NarrationScope>(() => {
    const hasIntro = allSegments.some((s) =>
      (s.subtitleNodeId || '').toLowerCase().startsWith('intro-')
    );
    if (hasIntro || hasExistingVoice) return 'selected-nodes';
    return scene.duration > 90 ? 'first-minute' : 'full-video';
  });
  const [selectedNodeIndices, setSelectedNodeIndices] = useState<Set<number>>(() =>
    computeDefaultSelectedNodeIndices(allSegments)
  );
  const [combineMode, setCombineMode] = useState<ExistingVoiceCombineMode>('prepend-shift');
  const [autoSyncTimeline, setAutoSyncTimeline] = useState(false);
  const [customScript, setCustomScript] = useState(() =>
    allSegments
      .slice(0, 8)
      .map((s) => s.text)
      .join(' ')
  );

  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedWavUrl, setGeneratedWavUrl] = useState<string | null>(null);
  const [pendingScene, setPendingScene] = useState<DslScene | undefined>(undefined);

  const abortRef = useRef<AbortController | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);

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

  const totalCharacters = useMemo(() => {
    if (scope === 'custom-script') return customScript.trim().length;
    return activeSegments.reduce((acc, s) => acc + s.text.length, 0);
  }, [scope, customScript, activeSegments]);

  const handlePlayFreePreview = () => {
    const url = previewUrls[effectiveVoiceId];
    if (!url) return;
    sampleAudioRef.current?.pause();
    const audio = new Audio(url);
    sampleAudioRef.current = audio;
    audio.play().catch(() => {});
  };

  const handleGenerate = async () => {
    setErrorMsg(null);
    const config = {
      apiKey: apiKey.trim(),
      voiceId: effectiveVoiceId,
      modelId
    };
    saveElevenLabsConfig(config);

    if (!config.apiKey) {
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
          controller.signal
        );
        const wavUrl = assembleClipsIntoMasterWavUrl(
          [clip],
          [0.2],
          Math.max(scene.duration, clip.durationSeconds + 0.5)
        );
        setGeneratedWavUrl(wavUrl);
        setPendingScene(undefined);
        setStatusText(`¡Locución lista! (${clip.durationSeconds.toFixed(1)}s)`);
      } else {
        if (activeSegments.length === 0) {
          throw new Error(
            scope === 'selected-nodes'
              ? 'Seleccioná al menos un nodo de la lista para narrar.'
              : 'No se encontraron textos narrables en las escenas del proyecto.'
          );
        }

        const clips: SynthesizedClip[] = [];
        for (let i = 0; i < activeSegments.length; i++) {
          setStatusText(
            `Narrando nodo ${i + 1} de ${activeSegments.length} (#${activeSegments[i].index + 1}) en ElevenLabs...`
          );
          const clip = await synthesizeElevenLabsSegment(
            activeSegments[i].text,
            config,
            audioCtx,
            controller.signal
          );
          clips.push(clip);
        }

        // Decodificar voz existente si el usuario pidió anteponer o parchar sobre su audio actual
        let existingVoiceBuffer: AudioBuffer | null = null;
        if (hasExistingVoice && scene.audioTrack?.src && combineMode !== 'standalone') {
          setStatusText('Combinando clips nuevos con tu pista de voz existente...');
          existingVoiceBuffer = await decodeExistingVoiceTrack(scene.audioTrack.src, audioCtx);
        }

        if (autoSyncTimeline) {
          const spokenDurations = clips.map((c) => c.durationSeconds);
          const retimed = retimeSceneToSpokenDurations(
            scene,
            activeSegments,
            spokenDurations
          );
          const lastSegEnd =
            (retimed.audioStartOffsets[retimed.audioStartOffsets.length - 1] ?? 0) +
            (spokenDurations[spokenDurations.length - 1] ?? 0) +
            0.45;
          const mergeOptions: MasterWavMergeOptions | undefined =
            existingVoiceBuffer && combineMode !== 'standalone'
              ? {
                  existingVoiceBuffer,
                  mode: combineMode,
                  shiftExistingBySeconds: lastSegEnd,
                  replacedRanges: activeSegments.map((s) => ({ start: s.startAt, end: s.endAt }))
                }
              : undefined;

          const wavUrl = assembleClipsIntoMasterWavUrl(
            clips,
            retimed.audioStartOffsets,
            retimed.totalDuration,
            mergeOptions
          );
          setGeneratedWavUrl(wavUrl);
          setPendingScene(retimed.updatedScene);
          setStatusText(
            mergeOptions
              ? `¡${clips.length} nodos narrados, sincronizados y empalmados con tu voz anterior!`
              : `¡${clips.length} nodos narrados y sincronizados automáticamente!`
          );
        } else {
          const isStandaloneSubset =
            scope === 'selected-nodes' && (!existingVoiceBuffer || combineMode === 'standalone');
          const fixedOffsets = activeSegments.map((s) => s.startAt + 0.3);
          const shiftBy = activeSegments[activeSegments.length - 1]?.endAt ?? 15;
          const mergeOptions: MasterWavMergeOptions | undefined =
            existingVoiceBuffer && combineMode !== 'standalone'
              ? {
                  existingVoiceBuffer,
                  mode: combineMode,
                  shiftExistingBySeconds: shiftBy,
                  replacedRanges: activeSegments.map((s) => ({ start: s.startAt, end: s.endAt }))
                }
              : undefined;

          // Si es solo un subconjunto sin audio previo, mantener tiempos reales del video para que coincida con las escenas
          const targetTotal = isStandaloneSubset
            ? Math.max(
                activeSegments[activeSegments.length - 1].endAt + 0.5,
                (fixedOffsets[fixedOffsets.length - 1] ?? 0) +
                  (clips[clips.length - 1]?.durationSeconds ?? 2) +
                  0.5
              )
            : scene.duration;

          const wavUrl = assembleClipsIntoMasterWavUrl(
            clips,
            fixedOffsets,
            targetTotal,
            mergeOptions
          );
          setGeneratedWavUrl(wavUrl);
          setPendingScene(undefined);
          setStatusText(
            mergeOptions
              ? `¡${clips.length} nodos narrados y combinados con tu pista de voz actual!`
              : `¡${clips.length} nodos narrados en sus tiempos exactos!`
          );
        }
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
          <label>Alcance a Narrar ({totalCharacters} caracteres)</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as NarrationScope)}
          >
            <option value="selected-nodes">
              🎯 Elegir escenas / nodos específicos ({selectedNodeIndices.size} elegidos)
            </option>
            {scene.duration > 90 && (
              <option value="first-minute">
                Primer minuto ({allSegments.filter((s) => s.startAt < 60).length} escenas)
              </option>
            )}
            <option value="full-video">
              Video completo ({allSegments.length} escenas)
            </option>
            <option value="custom-script">Guión libre personalizado</option>
          </select>
        </div>
      </div>

      {hasExistingVoice && scope !== 'full-video' && scope !== 'custom-script' && (
        <div className="inspector-col">
          <label>Ya tenés una voz cargada ({scene.audioTrack?.name}) — ¿cómo combinamos estos nodos?</label>
          <select
            value={combineMode}
            onChange={(e) => setCombineMode(e.target.value as ExistingVoiceCombineMode)}
          >
            <option value="prepend-shift">
              ➕ Anteponer al audio actual (corre la voz existente después de la intro nueva)
            </option>
            <option value="replace-ranges">
              🩹 Reemplazar solo estos nodos (conserva el resto de tu audio intacto)
            </option>
            <option value="standalone">
              🆕 Generar solo estos nodos (sin mezclar con la voz anterior)
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
          placeholder="Escribí acá el texto que querés que narre la voz..."
        />
      ) : scope === 'selected-nodes' ? (
        <div className="narration-preview-box">
          <label className="sync-checkbox-row">
            <input
              type="checkbox"
              checked={autoSyncTimeline}
              onChange={(e) => setAutoSyncTimeline(e.target.checked)}
            />
            <span>
              Auto-ajustar duración de los nodos elegidos y <code>typewriter</code> a la voz real
            </span>
          </label>
          <NarrationNodePicker
            segments={allSegments}
            selectedIndices={selectedNodeIndices}
            onChangeSelected={setSelectedNodeIndices}
          />
        </div>
      ) : (
        <div className="narration-preview-box">
          <label className="sync-checkbox-row">
            <input
              type="checkbox"
              checked={autoSyncTimeline}
              onChange={(e) => setAutoSyncTimeline(e.target.checked)}
            />
            <span>
              Auto-ajustar duración de cada escena y efecto <code>typewriter</code> a la voz real
            </span>
          </label>
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
        </div>
      )}

      {errorMsg && <div className="json-error-banner">{errorMsg}</div>}

      {generatedWavUrl && (
        <div className="audio-preview-card">
          <div className="audio-preview-row">
            <strong>🎙️ {statusText}</strong>
            <audio src={generatedWavUrl} controls className="mini-audio-player" />
          </div>
          <a
            href={generatedWavUrl}
            download={`${projectId}-narracion-elevenlabs.wav`}
            className="btn-secondary"
            style={{ textDecoration: 'none', alignSelf: 'flex-start' }}
          >
            <Download size={13} />
            Descargar Locución (.wav)
          </a>
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
              Generar Voz Gratis por API
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

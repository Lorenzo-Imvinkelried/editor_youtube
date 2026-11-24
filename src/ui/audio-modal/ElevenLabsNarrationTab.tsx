/**
 * Responsabilidad Única: Interfaz para generar locución automática con ElevenLabs
 * usando el Voice ID `UK00oAtGYBrHBUbesfMv` (u otro elegido), permitiendo narrar
 * escena por escena sincronizando el timeline o narrar un guion libre.
 */

import React, { useMemo, useRef, useState } from 'react';
import { Check, Download, KeyRound, Loader2, Mic, Sparkles } from 'lucide-react';
import { DslAudioTrack, DslScene } from '../../dsl/dslTypes';
import {
  assembleClipsIntoMasterWavUrl,
  DEFAULT_ELEVENLABS_VOICE_ID,
  ElevenLabsModelId,
  loadSavedElevenLabsConfig,
  saveElevenLabsConfig,
  synthesizeElevenLabsSegment,
  SynthesizedClip
} from '../../engine/elevenLabsClient';
import {
  extractSceneNarrationSegments,
  retimeSceneToSpokenDurations
} from '../../engine/narrationExtractor';

interface ElevenLabsNarrationTabProps {
  projectId: string;
  scene: DslScene;
  onApplyNarration: (audioTrack: DslAudioTrack, retimedScene?: DslScene) => void;
  onClose: () => void;
}

type NarrationScope = 'first-minute' | 'full-video' | 'custom-script';

export const ElevenLabsNarrationTab: React.FC<ElevenLabsNarrationTabProps> = ({
  projectId,
  scene,
  onApplyNarration,
  onClose
}) => {
  const saved = useMemo(() => loadSavedElevenLabsConfig(), []);
  const allSegments = useMemo(() => extractSceneNarrationSegments(scene), [scene]);

  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [voiceId, setVoiceId] = useState(saved.voiceId || DEFAULT_ELEVENLABS_VOICE_ID);
  const [modelId, setModelId] = useState<ElevenLabsModelId>(saved.modelId);
  const [scope, setScope] = useState<NarrationScope>(() =>
    scene.duration > 90 ? 'first-minute' : 'full-video'
  );
  const [autoSyncTimeline, setAutoSyncTimeline] = useState(true);
  const [customScript, setCustomScript] = useState(() =>
    allSegments
      .slice(0, 8)
      .map((s) => s.text)
      .join(' ')
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [generatedWavUrl, setGeneratedWavUrl] = useState<string | null>(null);
  const [pendingScene, setPendingScene] = useState<DslScene | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const activeSegments = useMemo(() => {
    if (scope === 'first-minute') {
      return allSegments.filter((s) => s.startAt < 60);
    }
    return allSegments;
  }, [allSegments, scope]);

  const totalCharacters = useMemo(() => {
    if (scope === 'custom-script') return customScript.trim().length;
    return activeSegments.reduce((acc, s) => acc + s.text.length, 0);
  }, [scope, customScript, activeSegments]);

  const handleGenerate = async () => {
    setErrorMsg(null);
    const config = {
      apiKey: apiKey.trim(),
      voiceId: voiceId.trim() || DEFAULT_ELEVENLABS_VOICE_ID,
      modelId
    };
    saveElevenLabsConfig(config);

    if (!config.apiKey) {
      setErrorMsg('Pegá tu API Key de ElevenLabs (xi-api-key) arriba para poder narrar.');
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
          throw new Error('No se encontraron textos narrables en las escenas del proyecto.');
        }

        const clips: SynthesizedClip[] = [];
        for (let i = 0; i < activeSegments.length; i++) {
          setStatusText(
            `Narrando escena ${i + 1} de ${activeSegments.length} en ElevenLabs...`
          );
          const clip = await synthesizeElevenLabsSegment(
            activeSegments[i].text,
            config,
            audioCtx,
            controller.signal
          );
          clips.push(clip);
        }

        if (autoSyncTimeline) {
          const spokenDurations = clips.map((c) => c.durationSeconds);
          const retimed = retimeSceneToSpokenDurations(
            scene,
            activeSegments,
            spokenDurations
          );
          const wavUrl = assembleClipsIntoMasterWavUrl(
            clips,
            retimed.audioStartOffsets,
            retimed.totalDuration
          );
          setGeneratedWavUrl(wavUrl);
          setPendingScene(retimed.updatedScene);
          setStatusText(
            `¡${clips.length} escenas narradas y sincronizadas automáticamente!`
          );
        } else {
          const fixedOffsets = activeSegments.map((s) => s.startAt + 0.3);
          const wavUrl = assembleClipsIntoMasterWavUrl(
            clips,
            fixedOffsets,
            scene.duration
          );
          setGeneratedWavUrl(wavUrl);
          setPendingScene(undefined);
          setStatusText(`¡${clips.length} escenas narradas sobre el timeline actual!`);
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
    onApplyNarration(
      {
        src: generatedWavUrl,
        name: `Locución ElevenLabs (${voiceId.slice(0, 8)})`,
        volume: 0.95
      },
      pendingScene
    );
    onClose();
  };

  return (
    <div className="eleven-tab-container">
      <div className="inspector-grid-2">
        <div className="inspector-col">
          <label>
            <KeyRound size={12} /> ElevenLabs API Key (se guarda solo en tu navegador)
          </label>
          <input
            type="password"
            placeholder="sk_..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="inspector-col">
          <label>
            <Mic size={12} /> Voice ID (precargada libre)
          </label>
          <input
            type="text"
            placeholder={DEFAULT_ELEVENLABS_VOICE_ID}
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
          />
        </div>
      </div>

      <div className="inspector-grid-2">
        <div className="inspector-col">
          <label>Modelo de Voz</label>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value as ElevenLabsModelId)}
          >
            <option value="eleven_flash_v2_5">Flash v2.5 (Rápido • 50% menos créditos)</option>
            <option value="eleven_multilingual_v2">Multilingual v2 (Máximo realismo)</option>
            <option value="eleven_turbo_v2_5">Turbo v2.5 (Balanceado)</option>
          </select>
        </div>

        <div className="inspector-col">
          <label>Alcance a Narrar ({totalCharacters} caracteres)</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as NarrationScope)}
          >
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

      {scope === 'custom-script' ? (
        <textarea
          className="prompt-preview-textarea"
          style={{ minHeight: 96 }}
          value={customScript}
          onChange={(e) => setCustomScript(e.target.value)}
          placeholder="Escribí acá el texto que querés que narre la voz..."
        />
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
            {activeSegments.slice(0, 6).map((seg) => (
              <div key={seg.index} className="segment-mini-item">
                <code>#{seg.index + 1}</code>
                <span>{seg.text}</span>
              </div>
            ))}
            {activeSegments.length > 6 && (
              <div className="segment-mini-more">
                + {activeSegments.length - 6} escenas más listas para narrar...
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
              Generar Voz con ElevenLabs
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

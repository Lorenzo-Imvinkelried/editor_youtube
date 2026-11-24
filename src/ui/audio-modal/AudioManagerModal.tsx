/**
 * Responsabilidad Única: Modal de Audio del proyecto con dos pestañas:
 * 1) Locución Automática IA con ElevenLabs (Voice ID `UK00oAtGYBrHBUbesfMv` + auto-sync).
 * 2) Subir archivo MP3/WAV desde la PC, pegar link o generar música instrumental ambient.
 */

import React, { useState } from 'react';
import { Check, Mic, Music, Trash2, Upload, Volume2, Wand2, X } from 'lucide-react';
import { DslAudioTrack, DslScene } from '../../dsl/dslTypes';
import { generateBuiltinSynthAudioWavUrl } from '../../engine/audioController';
import { ElevenLabsNarrationTab } from './ElevenLabsNarrationTab';

interface AudioManagerModalProps {
  projectId: string;
  scene: DslScene;
  onSaveAudioAndScene: (track: DslAudioTrack | undefined, retimedScene?: DslScene) => void;
  onClose: () => void;
}

export const AudioManagerModal: React.FC<AudioManagerModalProps> = ({
  projectId,
  scene,
  onSaveAudioAndScene,
  onClose
}) => {
  const currentTrack = scene.audioTrack;
  const [activeTab, setActiveTab] = useState<'elevenlabs' | 'music-file'>('elevenlabs');
  const [audioUrl, setAudioUrl] = useState(currentTrack?.src || '');
  const [audioName, setAudioName] = useState(currentTrack?.name || '');
  const [volume, setVolume] = useState(currentTrack?.volume ?? 0.85);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioUrl(URL.createObjectURL(file));
    setAudioName(file.name);
  };

  const handleUseBuiltinSynth = () => {
    const wavUrl = generateBuiltinSynthAudioWavUrl(Math.max(10, scene.duration + 2));
    setAudioUrl(wavUrl);
    setAudioName('Base Instrumental Synth IA (WAV)');
  };

  const handleApplyManual = () => {
    if (!audioUrl.trim()) {
      onSaveAudioAndScene(undefined);
      onClose();
      return;
    }
    onSaveAudioAndScene({
      src: audioUrl.trim(),
      name: audioName.trim() || 'Pista de Audio',
      volume
    });
    onClose();
  };

  const handleRemove = () => {
    onSaveAudioAndScene(undefined);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ width: 'min(680px, 95vw)', height: 'auto', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'elevenlabs' ? 'active' : ''}`}
              onClick={() => setActiveTab('elevenlabs')}
            >
              <Mic size={14} />
              Narrador Automático (ElevenLabs)
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'music-file' ? 'active' : ''}`}
              onClick={() => setActiveTab('music-file')}
            >
              <Music size={14} />
              Subir MP3 / Música
            </button>
          </div>

          <button type="button" className="btn-icon-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {activeTab === 'elevenlabs' ? (
            <ElevenLabsNarrationTab
              projectId={projectId}
              scene={scene}
              onApplyNarration={(track, retimedScene) =>
                onSaveAudioAndScene(track, retimedScene)
              }
              onClose={onClose}
            />
          ) : (
            <>
              <div className="audio-options-grid">
                <label className="upload-drop-btn">
                  <Upload size={16} />
                  <span>Subir MP3 / WAV desde tu PC</span>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                <button
                  type="button"
                  className="upload-drop-btn synth-btn"
                  onClick={handleUseBuiltinSynth}
                >
                  <Wand2 size={16} />
                  <span>Generar Música Ambient IA (1 Click)</span>
                </button>
              </div>

              <div className="inspector-col">
                <label>O pegá un link directo a un archivo de audio (.mp3 / .wav):</label>
                <input
                  type="url"
                  placeholder="https://ejemplo.com/musica-fondo.mp3"
                  value={audioUrl}
                  onChange={(e) => {
                    setAudioUrl(e.target.value);
                    if (!audioName) setAudioName('Audio por Link');
                  }}
                />
              </div>

              {audioUrl && (
                <div className="audio-preview-card">
                  <div className="audio-preview-row">
                    <strong>🎵 {audioName || 'Audio cargado'}</strong>
                    <audio src={audioUrl} controls className="mini-audio-player" />
                  </div>

                  <div className="volume-row">
                    <Volume2 size={15} />
                    <span>Volumen: {Math.round(volume * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={volume}
                      onChange={(e) => setVolume(parseFloat(e.target.value))}
                    />
                  </div>
                </div>
              )}

              <div className="modal-footer-actions">
                {currentTrack && (
                  <button type="button" className="btn-danger-ghost" onClick={handleRemove}>
                    <Trash2 size={14} />
                    Quitar Audio
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="button" className="btn-copy-big" onClick={handleApplyManual}>
                  <Check size={15} />
                  Guardar Audio en el Video
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Responsabilidad Única: Modal de Audio multipista del proyecto con tres pestañas:
 * 1) Música Instrumental en Bucle Inteligente (WAV/MP3/M4A/OGG/FLAC con crossfade y fade-out).
 * 2) Locución Automática IA con ElevenLabs (+ auto-sync del timeline).
 * 3) Subir pista de Voz / Audio manual desde archivo o link.
 */

import React, { useState } from 'react';
import { Check, Mic, Music, Trash2, Upload, Volume2, X } from 'lucide-react';
import { DslAudioTrack, DslMusicTrack, DslScene } from '../../dsl/dslTypes';
import { ElevenLabsNarrationTab } from './ElevenLabsNarrationTab';
import { InstrumentalMusicTab } from './InstrumentalMusicTab';

export type AudioModalTab = 'instrumental-music' | 'elevenlabs' | 'voice-file';

interface AudioManagerModalProps {
  projectId: string;
  scene: DslScene;
  initialTab?: AudioModalTab;
  onSaveAudioAndScene: (track: DslAudioTrack | undefined, retimedScene?: DslScene) => void;
  onSaveMusicTrack: (track: DslMusicTrack | undefined) => void;
  onClose: () => void;
}

export const AudioManagerModal: React.FC<AudioManagerModalProps> = ({
  projectId,
  scene,
  initialTab = 'instrumental-music',
  onSaveAudioAndScene,
  onSaveMusicTrack,
  onClose
}) => {
  const currentVoice = scene.audioTrack;
  const [activeTab, setActiveTab] = useState<AudioModalTab>(initialTab);
  const [audioUrl, setAudioUrl] = useState(currentVoice?.src || '');
  const [audioName, setAudioName] = useState(currentVoice?.name || '');
  const [volume, setVolume] = useState(currentVoice?.volume ?? 0.9);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioUrl(URL.createObjectURL(file));
    setAudioName(file.name);
  };

  const handleApplyManual = () => {
    if (!audioUrl.trim()) {
      onSaveAudioAndScene(undefined);
      onClose();
      return;
    }
    onSaveAudioAndScene({
      src: audioUrl.trim(),
      name: audioName.trim() || 'Pista de Voz / Audio',
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
        style={{ width: 'min(740px, 95vw)', height: 'auto', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'instrumental-music' ? 'active' : ''}`}
              onClick={() => setActiveTab('instrumental-music')}
            >
              <Music size={14} />
              Música Instrumental {scene.musicTrack?.src ? '●' : ''}
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'elevenlabs' ? 'active' : ''}`}
              onClick={() => setActiveTab('elevenlabs')}
            >
              <Mic size={14} />
              Narrador ElevenLabs {scene.audioTrack?.src ? '●' : ''}
            </button>
            <button
              type="button"
              className={`modal-tab-btn ${activeTab === 'voice-file' ? 'active' : ''}`}
              onClick={() => setActiveTab('voice-file')}
            >
              <Upload size={14} />
              Subir Voz / Audio
            </button>
          </div>

          <button type="button" className="btn-icon-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          {activeTab === 'instrumental-music' ? (
            <InstrumentalMusicTab
              scene={scene}
              onSaveMusicTrack={onSaveMusicTrack}
              onClose={onClose}
            />
          ) : activeTab === 'elevenlabs' ? (
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
              <label className="upload-drop-btn">
                <Upload size={18} />
                <span>Subir pista de voz / locución (WAV, MP3, M4A, OGG, FLAC...)</span>
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.opus"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>

              <div className="inspector-col">
                <label>O pegá un link directo a un archivo de audio (.mp3 / .wav):</label>
                <input
                  type="url"
                  placeholder="https://ejemplo.com/narracion.mp3"
                  value={audioUrl}
                  onChange={(e) => {
                    setAudioUrl(e.target.value);
                    if (!audioName) setAudioName('Voz por Link');
                  }}
                />
              </div>

              {audioUrl && (
                <div className="audio-preview-card">
                  <div className="audio-preview-row">
                    <strong>🎙️ {audioName || 'Audio cargado'}</strong>
                    <audio src={audioUrl} controls className="mini-audio-player" />
                  </div>

                  <div className="volume-row">
                    <Volume2 size={15} />
                    <span>Volumen voz: {Math.round(volume * 100)}%</span>
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
                {currentVoice && (
                  <button type="button" className="btn-danger-ghost" onClick={handleRemove}>
                    <Trash2 size={14} />
                    Quitar Voz
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="button" className="btn-copy-big" onClick={handleApplyManual}>
                  <Check size={15} />
                  Guardar Voz en el Video
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

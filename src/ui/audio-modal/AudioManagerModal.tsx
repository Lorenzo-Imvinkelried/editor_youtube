/**
 * Responsabilidad Única: Modal para cargar o configurar el audio exclusivo del proyecto activo:
 * 1) Subir archivo MP3 / WAV / OGG / M4A desde la computadora.
 * 2) Pegar un link directo a un audio externo.
 * 3) Generar con 1 click una pista instrumental ambient integrada para probar rápido.
 */

import React, { useState } from 'react';
import { Check, Music, Trash2, Upload, Volume2, Wand2, X } from 'lucide-react';
import { DslAudioTrack } from '../../dsl/dslTypes';
import { generateBuiltinSynthAudioWavUrl } from '../../engine/audioController';

interface AudioManagerModalProps {
  currentTrack: DslAudioTrack | undefined;
  sceneDuration: number;
  onSaveAudioTrack: (track: DslAudioTrack | undefined) => void;
  onClose: () => void;
}

export const AudioManagerModal: React.FC<AudioManagerModalProps> = ({
  currentTrack,
  sceneDuration,
  onSaveAudioTrack,
  onClose
}) => {
  const [audioUrl, setAudioUrl] = useState(currentTrack?.src || '');
  const [audioName, setAudioName] = useState(currentTrack?.name || '');
  const [volume, setVolume] = useState(currentTrack?.volume ?? 0.85);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setAudioUrl(objectUrl);
    setAudioName(file.name);
  };

  const handleUseBuiltinSynth = () => {
    const wavUrl = generateBuiltinSynthAudioWavUrl(Math.max(10, sceneDuration + 2));
    setAudioUrl(wavUrl);
    setAudioName('Base Instrumental Synth IA (WAV)');
  };

  const handleApply = () => {
    if (!audioUrl.trim()) {
      onSaveAudioTrack(undefined);
      onClose();
      return;
    }

    onSaveAudioTrack({
      src: audioUrl.trim(),
      name: audioName.trim() || 'Pista de Audio',
      volume
    });
    onClose();
  };

  const handleRemove = () => {
    onSaveAudioTrack(undefined);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-compact" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-group">
            <Music size={17} className="text-sky" />
            <strong>Audio del Proyecto (Locución / Música)</strong>
          </div>
          <button type="button" className="btn-icon-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
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
            <button type="button" className="btn-copy-big" onClick={handleApply}>
              <Check size={15} />
              Guardar Audio en el Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

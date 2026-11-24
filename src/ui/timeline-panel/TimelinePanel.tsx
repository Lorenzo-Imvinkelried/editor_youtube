/**
 * Responsabilidad Única: Barra inferior minimalista con controles de reproducción (Play/Pause, Scrubber)
 * y una barra rápida de prompt en 1 línea para agregar cosas al instante sin saturar la pantalla.
 */

import React, { useState } from 'react';
import { Play, Pause, RotateCcw, Send, Wand2 } from 'lucide-react';
import { DslScene } from '../../dsl/dslTypes';

interface TimelinePanelProps {
  scene: DslScene;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSeconds: number) => void;
  onSendQuickPrompt: (promptText: string) => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  scene,
  currentTime,
  isPlaying,
  onTogglePlay,
  onSeek,
  onSendQuickPrompt
}) => {
  const [quickPrompt, setQuickPrompt] = useState('');
  const duration = Math.max(1, scene.duration);

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPrompt.trim()) return;
    onSendQuickPrompt(quickPrompt.trim());
    setQuickPrompt('');
  };

  return (
    <footer className="bottom-bar-minimal">
      <div className="playback-controls">
        <button className="btn-play" onClick={onTogglePlay}>
          {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          <span>{isPlaying ? 'Pausar' : 'Play'}</span>
        </button>
        <button className="btn-icon" onClick={() => onSeek(0)} title="Reiniciar al segundo 0">
          <RotateCcw size={14} />
        </button>
        <span className="time-readout">
          <strong>{currentTime.toFixed(1)}s</strong> / {duration.toFixed(1)}s
        </span>
      </div>

      <input
        type="range"
        className="timeline-scrubber"
        min={0}
        max={duration}
        step={0.01}
        value={currentTime}
        onChange={(e) => onSeek(parseFloat(e.target.value))}
      />

      <form className="quick-prompt-form" onSubmit={handlePromptSubmit}>
        <Wand2 size={14} className="text-sky" />
        <input
          type="text"
          placeholder='Acción rápida: ej. "Agregá título 3D HOLA arriba" o "Cohete a la derecha"...'
          value={quickPrompt}
          onChange={(e) => setQuickPrompt(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          <Send size={13} />
        </button>
      </form>
    </footer>
  );
};

/**
 * Responsabilidad Única: Barra inferior minimalista con controles de reproducción (Play/Pause, Scrubber),
 * saltos rápidos por capítulo para documentales largos (10 min) y barra rápida de prompt.
 */

import React, { useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Send, Wand2 } from 'lucide-react';
import { DslChapterMarker, DslScene } from '../../dsl/dslTypes';
import { formatTimeMmSs } from '../../shared/math';

interface TimelinePanelProps {
  scene: DslScene;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSeconds: number) => void;
  onSendQuickPrompt: (promptText: string) => void;
}

const LEGACY_TESLA_CHAPTERS: DslChapterMarker[] = [
  { label: 'C1: 1856', time: 0 },
  { label: 'C2: Budapest', time: 60 },
  { label: 'C3: Edison', time: 120 },
  { label: 'C4: Guerra AC', time: 180 },
  { label: 'C5: Niágara', time: 240 },
  { label: 'C6: Bobina/Radio', time: 300 },
  { label: 'C7: Colorado', time: 360 },
  { label: 'C8: Wardenclyffe', time: 420 },
  { label: 'C9: Turbina', time: 480 },
  { label: 'C10: Legado', time: 540 }
];

function resolveSceneChapters(scene: DslScene, duration: number): DslChapterMarker[] {
  if (scene.chapters && scene.chapters.length > 0) {
    return [...scene.chapters].sort((a, b) => a.time - b.time);
  }
  if (duration < 300) return [];

  const isLegacyTesla = scene.nodes.some(
    (node) => node.id === 'c1-b1-titulo' && node.label === 'Nikola Tesla'
  );
  if (isLegacyTesla) return LEGACY_TESLA_CHAPTERS;

  const step = Math.max(60, Math.round(duration / 10));
  const generated: DslChapterMarker[] = [];
  for (let t = 0, idx = 1; t < duration; t += step, idx++) {
    generated.push({ label: `C${idx}: ${formatTimeMmSs(t)}`, time: t });
  }
  return generated;
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
  const chapters = useMemo(() => resolveSceneChapters(scene, duration), [scene, duration]);

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
          <strong>{formatTimeMmSs(currentTime)}</strong> / {formatTimeMmSs(duration)}
        </span>
      </div>

      <div className="scrubber-with-chapters">
        {chapters.length > 0 && (
          <div className="chapters-jump-bar">
            {chapters.map((ch, idx) => {
              const nextTime = idx + 1 < chapters.length ? chapters[idx + 1].time : duration + 1;
              const isActive = currentTime >= ch.time && currentTime < nextTime;
              return (
                <button
                  key={`${ch.label}-${ch.time}`}
                  type="button"
                  className={`chapter-chip ${isActive ? 'active' : ''}`}
                  onClick={() => onSeek(ch.time)}
                  title={`Saltar al minuto ${formatTimeMmSs(ch.time)}`}
                >
                  {ch.label}
                </button>
              );
            })}
          </div>
        )}

        <input
          type="range"
          className="timeline-scrubber"
          min={0}
          max={duration}
          step={0.05}
          value={currentTime}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
        />
      </div>

      <form className="quick-prompt-form" onSubmit={handlePromptSubmit}>
        <Wand2 size={14} className="text-sky" />
        <input
          type="text"
          placeholder='Ej: "Agregá foto de Albert Einstein a la derecha"...'
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

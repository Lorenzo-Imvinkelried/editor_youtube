/**
 * Responsabilidad Única: Línea de tiempo multipista (pista de Cámara Virtual + pistas de acciones por nodo)
 * y controles de reproducción (Play, Pause, Reiniciar y Scrubber de tiempo).
 */

import React from 'react';
import { Play, Pause, RotateCcw, Camera, Layers } from 'lucide-react';
import { DslScene } from '../../dsl/dslTypes';

interface TimelinePanelProps {
  scene: DslScene;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSeconds: number) => void;
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  scene,
  currentTime,
  isPlaying,
  onTogglePlay,
  onSeek
}) => {
  const duration = Math.max(1, scene.duration);
  const playheadPercent = Math.min(100, (currentTime / duration) * 100);

  return (
    <footer className="timeline-panel">
      <div className="timeline-controls-bar">
        <div className="playback-buttons">
          <button className="btn-play" onClick={onTogglePlay}>
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
            <span>{isPlaying ? 'Pausar' : 'Reproducir'}</span>
          </button>
          <button className="btn-icon" onClick={() => onSeek(0)} title="Volver al segundo 0">
            <RotateCcw size={14} />
          </button>
          <div className="time-readout">
            <strong>{currentTime.toFixed(2)}s</strong>
            <span> / {duration.toFixed(1)}s</span>
          </div>
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
      </div>

      <div className="timeline-tracks-container">
        <div className="playhead-line" style={{ left: `calc(150px + (100% - 166px) * ${playheadPercent / 100})` }} />

        {/* Pista 1: Cámara Virtual 2.5D */}
        <div className="timeline-track-row">
          <div className="track-label">
            <Camera size={13} />
            <span>Cámara 2.5D</span>
          </div>
          <div className="track-lane">
            {scene.cameraTrack.map((kf, idx) => {
              const left = (kf.at / duration) * 100;
              const width = Math.max(3, (kf.duration / duration) * 100);
              return (
                <div
                  key={`${kf.action}-${idx}`}
                  className="timeline-clip camera-clip"
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => onSeek(kf.at)}
                  title={`${kf.action} ${kf.targetId || ''} (${kf.at}s)`}
                >
                  {kf.action === 'focusOn' ? `Foco → ${kf.targetId}` : 'Panorama'}
                </div>
              );
            })}
          </div>
        </div>

        {/* Pistas por cada Nodo del Canvas Infinito */}
        {scene.nodes.map((node) => {
          const nodeActions = scene.timeline.filter((act) => act.targetId === node.id);
          return (
            <div key={node.id} className="timeline-track-row">
              <div className="track-label">
                <Layers size={12} style={{ color: node.color }} />
                <span>{node.label}</span>
              </div>
              <div className="track-lane">
                {nodeActions.map((act) => {
                  const left = (act.at / duration) * 100;
                  const width = Math.max(3, (act.duration / duration) * 100);
                  return (
                    <div
                      key={act.id}
                      className={`timeline-clip action-${act.action}`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        borderColor: node.color
                      }}
                      onClick={() => onSeek(act.at)}
                      title={`${act.action} (${act.at}s - ${(act.at + act.duration).toFixed(1)}s)`}
                    >
                      {act.action}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </footer>
  );
};

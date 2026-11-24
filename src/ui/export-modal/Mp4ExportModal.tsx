/**
 * Responsabilidad Única: Modal de renderizado y exportación del video a archivo `.mp4`
 * mostrando el progreso en tiempo real (1920x1080 o 1080x1920 Shorts a 60 FPS + mezcla de audio).
 */

import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Film, Loader2, X } from 'lucide-react';
import { DslScene } from '../../dsl/dslTypes';
import {
  Mp4ExportProgress,
  renderAndExportProjectToMp4
} from '../../engine/mp4Exporter';

interface Mp4ExportModalProps {
  projectId: string;
  projectName: string;
  scene: DslScene;
  onClose: () => void;
}

export const Mp4ExportModal: React.FC<Mp4ExportModalProps> = ({
  projectId,
  projectName,
  scene,
  onClose
}) => {
  const [progress, setProgress] = useState<Mp4ExportProgress>({
    percent: 0,
    currentTime: 0,
    duration: scene.duration,
    statusText: 'Preparando motor 2.5D y pista de audio...'
  });
  const [isDone, setIsDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isShorts = scene.aspectRatio === '9:16';
  const resolutionLabel = isShorts ? '1080×1920 (YouTube Shorts 9:16)' : '1920×1080 (Full HD 16:9)';

  useEffect(() => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    renderAndExportProjectToMp4(
      projectId,
      scene,
      (p) => setProgress(p),
      controller.signal
    )
      .then(() => {
        setIsDone(true);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setErrorMsg(err instanceof Error ? err.message : 'Error al exportar MP4');
        }
      });

    return () => {
      controller.abort();
    };
  }, [projectId, scene]);

  return (
    <div className="modal-backdrop">
      <div className="modal-card modal-compact">
        <div className="modal-header">
          <div className="header-group">
            <Film size={17} className="text-sky" />
            <strong>Exportar Video a MP4 — {projectName}</strong>
          </div>
          <button type="button" className="btn-icon-ghost" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body export-modal-body">
          <div className="export-specs-pills">
            <span className="spec-pill">📺 {resolutionLabel}</span>
            <span className="spec-pill">⚡ 60 FPS</span>
            <span className="spec-pill">
              🎵 {scene.audioTrack ? `Audio: ${scene.audioTrack.name}` : 'Sin Audio'}
            </span>
          </div>

          {errorMsg ? (
            <div className="json-error-banner">{errorMsg}</div>
          ) : isDone ? (
            <div className="export-success-box">
              <CheckCircle2 size={38} className="text-emerald" />
              <h3>¡Video MP4 Exportado y Descargado!</h3>
              <p>
                El archivo <code>{projectId}.mp4</code> ya se guardó en tu carpeta de Descargas.
              </p>
            </div>
          ) : (
            <div className="export-progress-box">
              <div className="export-spinner-row">
                <Loader2 size={22} className="spin-icon text-sky" />
                <strong>{progress.statusText}</strong>
              </div>
              <div className="progress-bar-outer">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <span className="progress-subtext">
                Segundo {progress.currentTime.toFixed(1)}s de {progress.duration.toFixed(1)}s
              </span>
            </div>
          )}

          <div className="modal-footer-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {isDone ? 'Cerrar' : 'Cancelar Exportación'}
            </button>
            {isDone && (
              <button
                type="button"
                className="btn-copy-big"
                onClick={() => {
                  setIsDone(false);
                  setProgress({
                    percent: 0,
                    currentTime: 0,
                    duration: scene.duration,
                    statusText: 'Re-exportando...'
                  });
                  renderAndExportProjectToMp4(projectId, scene, setProgress).then(() =>
                    setIsDone(true)
                  );
                }}
              >
                <Download size={15} />
                Descargar de Nuevo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

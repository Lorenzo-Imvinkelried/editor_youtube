/**
 * Responsabilidad Única: Visor interactivo del Canvas Cuasi Infinito con Simulador de Pantalla de YouTube (16:9 y 9:16).
 * Permite previsualizar exactamente cómo se verá el video en el reproductor de YouTube mientras
 * la Cámara Virtual 2.5D recorre el lienzo infinito.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Compass, Eye, MonitorPlay, RotateCcw, Smartphone } from 'lucide-react';
import { DslScene, YouTubeAspectPreset } from '../../dsl/dslTypes';
import { CameraState } from '../../engine/cameraEvaluator';
import {
  hitTestCanvasNode,
  renderInfiniteCanvasFrame,
  ViewportTransformOverride
} from '../../engine/canvasRenderer';
import { EvaluatedCanvasNode } from '../../engine/nodeEvaluator';

interface InfiniteCanvasViewportProps {
  projectTitle: string;
  currentTime: number;
  scene: DslScene;
  evaluatedNodes: EvaluatedCanvasNode[];
  camera: CameraState;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onChangeAspectRatio: (aspectRatio: YouTubeAspectPreset) => void;
}

export const InfiniteCanvasViewport: React.FC<InfiniteCanvasViewportProps> = ({
  projectTitle,
  currentTime,
  scene,
  evaluatedNodes,
  camera,
  selectedNodeId,
  onSelectNode,
  onChangeAspectRatio
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [manualOverride, setManualOverride] = useState<ViewportTransformOverride>({
    panX: 0,
    panY: 0,
    zoomMultiplier: 1
  });
  const [dimOutsideFrame, setDimOutsideFrame] = useState<boolean>(true);
  const [showPlayerChrome, setShowPlayerChrome] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const aspectRatio: YouTubeAspectPreset = scene.aspectRatio === '9:16' ? '9:16' : '16:9';

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    renderInfiniteCanvasFrame(
      ctx,
      rect.width,
      rect.height,
      scene,
      evaluatedNodes,
      camera,
      selectedNodeId,
      manualOverride,
      {
        aspectRatio,
        dimOutsideFrame,
        showPlayerChrome,
        currentTime,
        duration: scene.duration,
        projectTitle
      }
    );
    ctx.restore();
  }, [
    scene,
    evaluatedNodes,
    camera,
    selectedNodeId,
    manualOverride,
    aspectRatio,
    dimOutsideFrame,
    showPlayerChrome,
    currentTime,
    projectTitle
  ]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const hit = hitTestCanvasNode(
      clickX,
      clickY,
      rect.width,
      rect.height,
      evaluatedNodes,
      camera,
      manualOverride,
      aspectRatio
    );

    if (hit) {
      onSelectNode(hit.id);
    }

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: manualOverride.panX,
      panY: manualOverride.panY
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setManualOverride((prev) => ({
      ...prev,
      panX: dragStartRef.current.panX + dx,
      panY: dragStartRef.current.panY + dy
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setManualOverride((prev) => ({
      ...prev,
      zoomMultiplier: Math.max(0.25, Math.min(4, prev.zoomMultiplier * factor))
    }));
  };

  const resetFreeCamera = () => {
    setManualOverride({ panX: 0, panY: 0, zoomMultiplier: 1 });
  };

  const hasManualOffset =
    manualOverride.panX !== 0 || manualOverride.panY !== 0 || manualOverride.zoomMultiplier !== 1;

  return (
    <div className="canvas-viewport-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="infinite-canvas-element"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />

      <div className="viewport-hud-top">
        <div className="hud-pill">
          <Camera size={13} />
          <span>
            Cámara: ({Math.round(camera.x)}, {Math.round(camera.y)}) • Zoom:{' '}
            {(camera.zoom * manualOverride.zoomMultiplier).toFixed(2)}x
          </span>
        </div>

        {camera.activeTargetId && (
          <div className="hud-pill accent">
            <Compass size={13} />
            <span>Foco: {camera.activeTargetId}</span>
          </div>
        )}

        <div className="youtube-controls-group">
          <button
            type="button"
            className={`yt-toggle-btn ${aspectRatio === '16:9' ? 'active' : ''}`}
            onClick={() => onChangeAspectRatio('16:9')}
            title="Pantalla YouTube Estándar 16:9 (1920x1080)"
          >
            <MonitorPlay size={13} />
            YouTube 16:9
          </button>
          <button
            type="button"
            className={`yt-toggle-btn ${aspectRatio === '9:16' ? 'active' : ''}`}
            onClick={() => onChangeAspectRatio('9:16')}
            title="Pantalla YouTube Shorts Vertical 9:16 (1080x1920)"
          >
            <Smartphone size={13} />
            Shorts 9:16
          </button>
          <button
            type="button"
            className={`yt-toggle-btn ${showPlayerChrome ? 'active-red' : ''}`}
            onClick={() => setShowPlayerChrome((p) => !p)}
            title="Mostrar/ocultar barra roja y controles del reproductor de YouTube"
          >
            ▶ HUD YouTube
          </button>
          <button
            type="button"
            className={`yt-toggle-btn ${dimOutsideFrame ? 'active' : ''}`}
            onClick={() => setDimOutsideFrame((p) => !p)}
            title="Oscurecer fuera del marco de YouTube o ver todo el canvas infinito iluminado"
          >
            <Eye size={13} />
            {dimOutsideFrame ? 'Máscara ON' : 'Ver Todo el Canvas'}
          </button>
        </div>

        {hasManualOffset && (
          <button className="hud-reset-btn" onClick={resetFreeCamera}>
            <RotateCcw size={12} />
            Volver a Cámara IA
          </button>
        )}
      </div>

      <div className="viewport-hud-bottom">
        <span>
          El recuadro muestra exactamente lo que sale en YouTube • Arrastrá para explorar el canvas infinito
        </span>
      </div>
    </div>
  );
};

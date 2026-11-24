/**
 * Responsabilidad Única: Visor central del Canvas Cuasi Infinito con Simulador de Pantalla de YouTube
 * perfectamente centrado y redimensionado automáticamente con ResizeObserver.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import { DslScene, YouTubeAspectPreset } from '../../dsl/dslTypes';
import { CameraState } from '../../engine/cameraEvaluator';
import {
  hitTestCanvasNode,
  renderInfiniteCanvasFrame,
  ViewportTransformOverride
} from '../../engine/canvasRenderer';
import { subscribeToImageLoads } from '../../engine/imageCache';
import { EvaluatedCanvasNode } from '../../engine/nodeEvaluator';

interface InfiniteCanvasViewportProps {
  projectTitle: string;
  currentTime: number;
  scene: DslScene;
  evaluatedNodes: EvaluatedCanvasNode[];
  camera: CameraState;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

export const InfiniteCanvasViewport: React.FC<InfiniteCanvasViewportProps> = ({
  projectTitle,
  currentTime,
  scene,
  evaluatedNodes,
  camera,
  selectedNodeId,
  onSelectNode
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 700 });
  const [imageLoadTick, setImageLoadTick] = useState(0);
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

  // Observar cambios de tamaño del contenedor para mantener el cuadro de YouTube 100% centrado
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    };

    updateDimensions();
    const observer = new ResizeObserver(updateDimensions);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Re-renderizar cuando termine de cargar una imagen externa por link
  useEffect(() => {
    return subscribeToImageLoads(() => setImageLoadTick((t) => t + 1));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportSize.width * dpr;
    canvas.height = viewportSize.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    renderInfiniteCanvasFrame(
      ctx,
      viewportSize.width,
      viewportSize.height,
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
    viewportSize,
    imageLoadTick,
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

    onSelectNode(hit ? hit.id : null);

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

      {/* Controles flotantes discretos abajo a la derecha sin tapar ni descentrar el cuadro */}
      <div className="viewport-corner-controls">
        <button
          type="button"
          className={`corner-pill-btn ${showPlayerChrome ? 'active' : ''}`}
          onClick={() => setShowPlayerChrome((p) => !p)}
        >
          ▶ Barra YouTube
        </button>
        <button
          type="button"
          className={`corner-pill-btn ${dimOutsideFrame ? 'active' : ''}`}
          onClick={() => setDimOutsideFrame((p) => !p)}
        >
          <Eye size={12} />
          {dimOutsideFrame ? 'Máscara Recorte' : 'Ver Lienzo Completo'}
        </button>
        {hasManualOffset && (
          <button className="corner-pill-btn warning" onClick={resetFreeCamera}>
            <RotateCcw size={12} />
            Centrar Cámara IA
          </button>
        )}
      </div>
    </div>
  );
};

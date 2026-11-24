/**
 * Responsabilidad Única: Visor interactivo del Canvas Cuasi Infinito.
 * Permite tanto seguir la Cámara Virtual definida en el DSL como explorar libremente
 * el lienzo arrastrando con el mouse y haciendo zoom con la rueda.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, Compass, RotateCcw } from 'lucide-react';
import { DslScene } from '../../dsl/dslTypes';
import { CameraState } from '../../engine/cameraEvaluator';
import {
  hitTestCanvasNode,
  renderInfiniteCanvasFrame,
  ViewportTransformOverride
} from '../../engine/canvasRenderer';
import { EvaluatedCanvasNode } from '../../engine/nodeEvaluator';

interface InfiniteCanvasViewportProps {
  scene: DslScene;
  evaluatedNodes: EvaluatedCanvasNode[];
  camera: CameraState;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

export const InfiniteCanvasViewport: React.FC<InfiniteCanvasViewportProps> = ({
  scene,
  evaluatedNodes,
  camera,
  selectedNodeId,
  onSelectNode
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [manualOverride, setManualOverride] = useState<ViewportTransformOverride>({
    panX: 0,
    panY: 0,
    zoomMultiplier: 1
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

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
      manualOverride
    );
    ctx.restore();
  }, [scene, evaluatedNodes, camera, selectedNodeId, manualOverride]);

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
      manualOverride
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
            Cámara Virtual: ({Math.round(camera.x)}, {Math.round(camera.y)}) • Zoom:{' '}
            {(camera.zoom * manualOverride.zoomMultiplier).toFixed(2)}x • Tilt: {camera.rotation.toFixed(1)}°
          </span>
        </div>
        {camera.activeTargetId && (
          <div className="hud-pill accent">
            <Compass size={13} />
            <span>Foco: {camera.activeTargetId}</span>
          </div>
        )}
        {hasManualOffset && (
          <button className="hud-reset-btn" onClick={resetFreeCamera}>
            <RotateCcw size={12} />
            Volver a Cámara IA
          </button>
        )}
      </div>

      <div className="viewport-hud-bottom">
        <span>Arrastrá para explorar el canvas infinito • Rueda para zoom • Click en un nodo para inspeccionar</span>
      </div>
    </div>
  );
};

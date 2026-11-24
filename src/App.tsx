/**
 * Responsabilidad Única: Orquestar la interfaz simplificada del editor donde el
 * Simulador de Pantalla de YouTube sobre el Canvas Infinito es el centro absoluto.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { compileUserPromptToDsl } from './ai/promptToDslEngine';
import { DslCanvasNode, DslScene, YouTubeAspectPreset } from './dsl/dslTypes';
import { resolveSceneLayout } from './dsl/layoutResolver';
import { evaluateCameraAtTime } from './engine/cameraEvaluator';
import { evaluateNodesAtTime } from './engine/nodeEvaluator';
import {
  createIsolatedProjectBundle,
  loadAllIsolatedProjects,
  saveAllIsolatedProjects,
  saveSingleIsolatedProject
} from './projects/projectRepository';
import { VideoProjectBundle } from './projects/projectTypes';
import { createId } from './shared/id';
import { AiMasterPromptModal } from './ui/ai-prompt-modal/AiMasterPromptModal';
import { InfiniteCanvasViewport } from './ui/canvas-viewport/InfiniteCanvasViewport';
import { ProjectInspectorPanel } from './ui/inspector-panel/ProjectInspectorPanel';
import { ProjectSwitcherHeader } from './ui/project-switcher/ProjectSwitcherHeader';
import { TimelinePanel } from './ui/timeline-panel/TimelinePanel';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<VideoProjectBundle[]>(() => loadAllIsolatedProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => projects[0]?.manifest.id || '');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [promptModalTab, setPromptModalTab] = useState<'copy-prompt' | 'paste-json' | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.manifest.id === activeProjectId) || projects[0],
    [projects, activeProjectId]
  );

  // Reloj determinista a 60 FPS
  useEffect(() => {
    if (!isPlaying || !activeProject) return;

    let animationFrameId: number;
    let lastTimestamp = performance.now();

    const tick = (now: number) => {
      const deltaSeconds = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      setCurrentTime((prev) => {
        const next = prev + deltaSeconds;
        return next > activeProject.scene.duration ? 0 : next;
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, activeProject]);

  const resolvedNodes = useMemo(
    () => resolveSceneLayout(activeProject.scene.nodes),
    [activeProject.scene.nodes]
  );

  const evaluatedNodes = useMemo(
    () => evaluateNodesAtTime(resolvedNodes, activeProject.scene.timeline, currentTime),
    [resolvedNodes, activeProject.scene.timeline, currentTime]
  );

  const cameraState = useMemo(
    () => evaluateCameraAtTime(activeProject.scene.cameraTrack, resolvedNodes, currentTime),
    [activeProject.scene.cameraTrack, resolvedNodes, currentTime]
  );

  const updateActiveProject = (updater: (current: VideoProjectBundle) => VideoProjectBundle) => {
    setProjects((prev) =>
      prev.map((proj) => {
        if (proj.manifest.id !== activeProject.manifest.id) return proj;
        const updated = updater(proj);
        saveSingleIsolatedProject(updated);
        return updated;
      })
    );
  };

  const handleSelectProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentTime(0);
    setSelectedNodeId(null);
  };

  const handleCreateProject = (name: string) => {
    const newBundle = createIsolatedProjectBundle(name, 'Proyecto aislado de video');
    const updatedList = [...projects, newBundle];
    setProjects(updatedList);
    saveAllIsolatedProjects(updatedList);
    setActiveProjectId(newBundle.manifest.id);
    setCurrentTime(0);
    setSelectedNodeId(null);
  };

  const handleSendQuickPrompt = (promptText: string) => {
    const compiled = compileUserPromptToDsl(promptText, activeProject.scene);
    updateActiveProject((proj) => ({
      ...proj,
      scene: compiled.updatedScene
    }));
  };

  const handleApplyDslScene = (newScene: DslScene) => {
    updateActiveProject((proj) => ({
      ...proj,
      scene: newScene
    }));
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleChangeAspectRatio = (aspectRatio: YouTubeAspectPreset) => {
    updateActiveProject((proj) => ({
      ...proj,
      manifest: {
        ...proj.manifest,
        resolution: aspectRatio === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
      },
      scene: {
        ...proj.scene,
        aspectRatio
      }
    }));
  };

  const handleUpdateNode = (updatedNode: DslCanvasNode) => {
    updateActiveProject((proj) => ({
      ...proj,
      scene: {
        ...proj.scene,
        nodes: proj.scene.nodes.map((n) => (n.id === updatedNode.id ? updatedNode : n))
      }
    }));
  };

  const handleDeleteNode = (nodeId: string) => {
    updateActiveProject((proj) => ({
      ...proj,
      scene: {
        ...proj.scene,
        nodes: proj.scene.nodes.filter((n) => n.id !== nodeId),
        timeline: proj.scene.timeline.filter((t) => t.targetId !== nodeId)
      }
    }));
    setSelectedNodeId(null);
  };

  const handleQuickAddImageByUrl = () => {
    const url = window.prompt(
      'Pegá el link directo de la imagen (Google Images, Unsplash, PNG/JPG):',
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'
    );
    if (!url || !url.trim()) return;

    const newId = createId('imagen');
    const newNode: DslCanvasNode = {
      id: newId,
      label: 'Imagen por Link',
      type: 'image',
      src: url.trim(),
      color: '#38bdf8',
      x: Math.round(cameraState.x),
      y: Math.round(cameraState.y),
      z: 0.15,
      width: 320,
      height: 240,
      initialOpacity: 1,
      initialScale: 1
    };

    updateActiveProject((proj) => ({
      ...proj,
      scene: {
        ...proj.scene,
        nodes: [...proj.scene.nodes, newNode],
        timeline: [
          ...proj.scene.timeline,
          {
            id: createId('pop'),
            at: Number(currentTime.toFixed(2)),
            duration: 0.85,
            targetId: newId,
            action: 'popIn',
            easing: 'springBouncy',
            params: { overshoot: 1.3 }
          }
        ]
      }
    }));
    setSelectedNodeId(newId);
  };

  const handleQuickAddTextNode = () => {
    const newId = createId('texto');
    const newNode: DslCanvasNode = {
      id: newId,
      label: 'NUEVO TEXTO',
      type: 'text',
      text: 'NUEVO TÍTULO YOUTUBE',
      fontFamily: 'display',
      textVariant: '3d-pop',
      fontSize: 40,
      color: '#f97316',
      accentColor: '#ffffff',
      x: Math.round(cameraState.x),
      y: Math.round(cameraState.y),
      z: 0.3,
      width: 480,
      height: 100,
      initialOpacity: 1,
      initialScale: 1
    };

    updateActiveProject((proj) => ({
      ...proj,
      scene: {
        ...proj.scene,
        nodes: [...proj.scene.nodes, newNode]
      }
    }));
    setSelectedNodeId(newId);
  };

  const handleFocusNodeWithCamera = (nodeId: string) => {
    updateActiveProject((proj) => ({
      ...proj,
      scene: {
        ...proj.scene,
        cameraTrack: [
          ...proj.scene.cameraTrack,
          {
            at: Number(currentTime.toFixed(2)),
            duration: 0.9,
            action: 'focusOn',
            targetId: nodeId,
            zoom: 1.35,
            rotation: 0,
            easing: 'easeInOutCubic'
          }
        ]
      }
    }));
  };

  const selectedNode = useMemo(
    () => resolvedNodes.find((n) => n.id === selectedNodeId) || null,
    [resolvedNodes, selectedNodeId]
  );

  return (
    <div className="editor-layout-clean">
      <ProjectSwitcherHeader
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onChangeAspectRatio={handleChangeAspectRatio}
        onOpenPromptModal={(tab) => setPromptModalTab(tab)}
        onQuickAddImageByUrl={handleQuickAddImageByUrl}
        onQuickAddTextNode={handleQuickAddTextNode}
      />

      <main className="stage-fullscreen">
        <InfiniteCanvasViewport
          projectTitle={activeProject.manifest.name}
          currentTime={currentTime}
          scene={activeProject.scene}
          evaluatedNodes={evaluatedNodes}
          camera={cameraState}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />

        <ProjectInspectorPanel
          selectedNode={selectedNode}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onFocusNodeWithCamera={handleFocusNodeWithCamera}
          onClose={() => setSelectedNodeId(null)}
        />
      </main>

      <TimelinePanel
        scene={activeProject.scene}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onSeek={(time) => {
          setIsPlaying(false);
          setCurrentTime(time);
        }}
        onSendQuickPrompt={handleSendQuickPrompt}
      />

      {promptModalTab && (
        <AiMasterPromptModal
          initialTab={promptModalTab}
          currentScene={activeProject.scene}
          onApplyDslScene={handleApplyDslScene}
          onClose={() => setPromptModalTab(null)}
        />
      )}
    </div>
  );
};

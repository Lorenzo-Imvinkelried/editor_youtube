/**
 * Responsabilidad Única: Orquestar los paneles del editor manteniendo el estado
 * del proyecto aislado activo y el reloj de reproducción a 60 FPS.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { compileUserPromptToDsl } from './ai/promptToDslEngine';
import { DslCanvasNode, DslScene } from './dsl/dslTypes';
import { resolveSceneLayout } from './dsl/layoutResolver';
import { evaluateCameraAtTime } from './engine/cameraEvaluator';
import { evaluateNodesAtTime } from './engine/nodeEvaluator';
import {
  createIsolatedProjectBundle,
  exportProjectBundleToJsonFile,
  loadAllIsolatedProjects,
  saveAllIsolatedProjects,
  saveSingleIsolatedProject
} from './projects/projectRepository';
import { VideoProjectBundle } from './projects/projectTypes';
import { AiChatPanel } from './ui/ai-chat-panel/AiChatPanel';
import { InfiniteCanvasViewport } from './ui/canvas-viewport/InfiniteCanvasViewport';
import { DslCodePanel } from './ui/dsl-code-panel/DslCodePanel';
import { ProjectInspectorPanel } from './ui/inspector-panel/ProjectInspectorPanel';
import { ProjectSwitcherHeader } from './ui/project-switcher/ProjectSwitcherHeader';
import { TimelinePanel } from './ui/timeline-panel/TimelinePanel';

export const App: React.FC = () => {
  const [projects, setProjects] = useState<VideoProjectBundle[]>(() => loadAllIsolatedProjects());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => projects[0]?.manifest.id || '');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

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

  // Resolver posiciones relativas (rightOf, below, etc.) y evaluar el frame en el segundo `currentTime`
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

  const handleCreateProject = (name: string, description: string) => {
    const newBundle = createIsolatedProjectBundle(name, description);
    const updatedList = [...projects, newBundle];
    setProjects(updatedList);
    saveAllIsolatedProjects(updatedList);
    setActiveProjectId(newBundle.manifest.id);
    setCurrentTime(0);
    setSelectedNodeId(null);
  };

  const handleSendPrompt = (promptText: string) => {
    const now = new Date().toISOString();
    const compiled = compileUserPromptToDsl(promptText, activeProject.scene);

    updateActiveProject((proj) => ({
      ...proj,
      scene: compiled.updatedScene,
      chatHistory: [
        ...proj.chatHistory,
        { id: `u-${Date.now()}`, role: 'user', timestamp: now, text: promptText },
        {
          id: `a-${Date.now() + 1}`,
          role: 'assistant',
          timestamp: now,
          text: compiled.assistantReply,
          appliedOperations: compiled.appliedOperations
        }
      ]
    }));
  };

  const handleApplyDslScene = (newScene: DslScene) => {
    updateActiveProject((proj) => ({
      ...proj,
      scene: newScene
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
            zoom: 1.4,
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
    <div className="editor-layout">
      <ProjectSwitcherHeader
        projects={projects}
        activeProject={activeProject}
        onSelectProject={handleSelectProject}
        onCreateProject={handleCreateProject}
        onExportBundle={() => exportProjectBundleToJsonFile(activeProject)}
      />

      <main className="editor-workspace">
        <div className="left-sidebar">
          <AiChatPanel
            projectId={activeProject.manifest.id}
            messages={activeProject.chatHistory}
            onSendPrompt={handleSendPrompt}
          />
          <ProjectInspectorPanel
            project={activeProject}
            selectedNode={selectedNode}
            onUpdateNode={handleUpdateNode}
            onFocusNodeWithCamera={handleFocusNodeWithCamera}
          />
        </div>

        <div className="center-stage">
          <InfiniteCanvasViewport
            scene={activeProject.scene}
            evaluatedNodes={evaluatedNodes}
            camera={cameraState}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        <div className="right-sidebar">
          <DslCodePanel
            projectId={activeProject.manifest.id}
            scene={activeProject.scene}
            onApplyDslScene={handleApplyDslScene}
          />
        </div>
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
      />
    </div>
  );
};

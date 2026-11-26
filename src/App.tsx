/**
 * Responsabilidad Única: Orquestar la interfaz simplificada del editor donde el
 * Simulador de Pantalla de YouTube sobre el Canvas Infinito es el centro absoluto,
 * sincronizando el reloj a 60 FPS con la pista de audio y el exportador MP4.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { compileUserPromptToDsl } from './ai/promptToDslEngine';
import {
  BackgroundPresetStyle,
  DslAudioTrack,
  DslCanvasNode,
  DslMusicTrack,
  DslScene,
  YouTubeAspectPreset
} from './dsl/dslTypes';
import { resolveSceneLayout } from './dsl/layoutResolver';
import { projectAudioController } from './engine/audioController';
import {
  deletePersistedAudio,
  hydrateAllProjectsAudio,
  persistAudioFromUrl
} from './engine/audioPersistenceStore';
import { isSceneLightPaper } from './engine/backgroundRenderer';
import { evaluateCameraAtTime } from './engine/cameraEvaluator';
import { evaluateNodesAtTime } from './engine/nodeEvaluator';
import { resolveSceneOverlaps } from './engine/sceneOverlapSolver';
import {
  createIsolatedProjectBundle,
  loadAllIsolatedProjects,
  saveAllIsolatedProjects,
  saveSingleIsolatedProject
} from './projects/projectRepository';
import { VideoProjectBundle } from './projects/projectTypes';
import { createId } from './shared/id';
import { AiMasterPromptModal } from './ui/ai-prompt-modal/AiMasterPromptModal';
import { AudioManagerModal, AudioModalTab } from './ui/audio-modal/AudioManagerModal';
import { InfiniteCanvasViewport } from './ui/canvas-viewport/InfiniteCanvasViewport';
import { Mp4ExportModal } from './ui/export-modal/Mp4ExportModal';
import { InternetImageSearchModal } from './ui/image-search-modal/InternetImageSearchModal';
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
  const [audioModalTab, setAudioModalTab] = useState<AudioModalTab | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isImageSearchModalOpen, setIsImageSearchModalOpen] = useState<boolean>(false);

  const activeProject = useMemo(
    () => projects.find((p) => p.manifest.id === activeProjectId) || projects[0],
    [projects, activeProjectId]
  );

  // Restaurar desde IndexedDB los audios (voz y música) guardados para que sobrevivan F5
  useEffect(() => {
    let cancelled = false;
    hydrateAllProjectsAudio(projects).then(({ bundles, changed }) => {
      if (!cancelled && changed) {
        setProjects(bundles);
        saveAllIsolatedProjects(bundles);
      }
    });
    return () => {
      cancelled = true;
    };
    // Solo al montar la aplicación
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (next > activeProject.scene.duration) {
          projectAudioController.forceSeek(0);
          return 0;
        }
        return next;
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, activeProject]);

  // Sincronizar pista de voz y pista de música instrumental del proyecto activo con el reloj
  useEffect(() => {
    projectAudioController.syncWithTimeline(
      activeProject.scene.audioTrack,
      isPlaying && !isExportModalOpen,
      currentTime,
      activeProject.scene.musicTrack
    );
  }, [
    activeProject.scene.audioTrack,
    activeProject.scene.musicTrack,
    isPlaying,
    isExportModalOpen,
    currentTime
  ]);

  const resolvedNodes = useMemo(
    () =>
      resolveSceneOverlaps(
        activeProject.scene,
        resolveSceneLayout(activeProject.scene.nodes)
      ),
    [activeProject.scene]
  );

  const evaluatedNodes = useMemo(
    () => evaluateNodesAtTime(resolvedNodes, activeProject.scene.timeline, currentTime),
    [resolvedNodes, activeProject.scene.timeline, currentTime]
  );

  const cameraState = useMemo(
    () =>
      evaluateCameraAtTime(activeProject.scene.cameraTrack, resolvedNodes, currentTime, {
        timeline: activeProject.scene.timeline,
        evaluatedNodes,
        aspectRatio: activeProject.scene.aspectRatio,
        isLightPaper: isSceneLightPaper(activeProject.scene),
        duration: activeProject.scene.duration,
        autoFillFrame: activeProject.scene.autoFillFrame
      }),
    [
      activeProject.scene,
      resolvedNodes,
      evaluatedNodes,
      currentTime
    ]
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
    projectAudioController.stopAndClear();
    setActiveProjectId(projectId);
    setCurrentTime(0);
    setSelectedNodeId(null);
  };

  const handleCreateProject = (name: string) => {
    projectAudioController.stopAndClear();
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

  const handleSaveAudioAndScene = (
    track: DslAudioTrack | undefined,
    retimedScene?: DslScene
  ) => {
    const projectId = activeProject.manifest.id;
    updateActiveProject((proj) => {
      const baseScene = retimedScene ?? proj.scene;
      return {
        ...proj,
        manifest: {
          ...proj.manifest,
          durationSeconds: baseScene.duration
        },
        scene: {
          ...baseScene,
          audioTrack: track
        }
      };
    });
    if (track?.src) {
      void persistAudioFromUrl(projectId, 'voice', track.src);
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      void deletePersistedAudio(projectId, 'voice');
    }
  };

  const handleSaveMusicTrack = (musicTrack: DslMusicTrack | undefined) => {
    const projectId = activeProject.manifest.id;
    updateActiveProject((proj) => ({
      ...proj,
      scene: {
        ...proj.scene,
        musicTrack
      }
    }));
    if (musicTrack?.src) {
      void persistAudioFromUrl(projectId, 'music', musicTrack.src);
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      void deletePersistedAudio(projectId, 'music');
    }
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

  const handleChangeBackgroundStyle = (backgroundStyle: BackgroundPresetStyle) => {
    updateActiveProject((proj) => ({
      ...proj,
      scene: {
        ...proj.scene,
        backgroundStyle,
        showGrid: false
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
    setIsImageSearchModalOpen(true);
  };

  const handleInsertInternetImage = (imageUrl: string, label: string, query?: string) => {
    const newId = createId('imagen');
    const newNode: DslCanvasNode = {
      id: newId,
      label: label || 'Fotografía de Archivo',
      type: 'image',
      src: imageUrl,
      imageQuery: query,
      color: '#8b261d',
      x: Math.round(cameraState.x),
      y: Math.round(cameraState.y - 20),
      z: 0.12,
      width: 560,
      height: 430,
      initialRotation: -1.5,
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
      label: 'TÍTULO EDITORIAL',
      type: 'text',
      text: 'TÍTULO DE ARCHIVO',
      subtitle: 'DOCUMENTO HISTÓRICO',
      fontFamily: 'serif',
      textVariant: '3d-pop',
      fontSize: 44,
      color: '#8b261d',
      accentColor: '#1e1610',
      x: Math.round(cameraState.x),
      y: Math.round(cameraState.y),
      z: 0.2,
      width: 560,
      height: 110,
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
        onChangeBackgroundStyle={handleChangeBackgroundStyle}
        onOpenPromptModal={(tab) => setPromptModalTab(tab)}
        onQuickAddImageByUrl={handleQuickAddImageByUrl}
        onQuickAddTextNode={handleQuickAddTextNode}
        onOpenAudioModal={(tab) => setAudioModalTab(tab)}
        onOpenExportMp4Modal={() => {
          setIsPlaying(false);
          setIsExportModalOpen(true);
        }}
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
          projectAudioController.forceSeek(time);
        }}
        onSendQuickPrompt={handleSendQuickPrompt}
      />

      {promptModalTab && (
        <AiMasterPromptModal
          projectId={activeProject.manifest.id}
          initialTab={promptModalTab}
          currentScene={activeProject.scene}
          onApplyDslScene={handleApplyDslScene}
          onClose={() => setPromptModalTab(null)}
        />
      )}

      {audioModalTab && (
        <AudioManagerModal
          projectId={activeProject.manifest.id}
          scene={activeProject.scene}
          initialTab={audioModalTab}
          onSaveAudioAndScene={handleSaveAudioAndScene}
          onSaveMusicTrack={handleSaveMusicTrack}
          onClose={() => setAudioModalTab(null)}
        />
      )}

      {isExportModalOpen && (
        <Mp4ExportModal
          projectId={activeProject.manifest.id}
          projectName={activeProject.manifest.name}
          scene={activeProject.scene}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {isImageSearchModalOpen && (
        <InternetImageSearchModal
          onSelectImage={handleInsertInternetImage}
          onClose={() => setIsImageSearchModalOpen(false)}
        />
      )}
    </div>
  );
};

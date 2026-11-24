/**
 * Responsabilidad Única: Barra superior minimalista y directa para:
 * - Cambiar o crear un proyecto aislado
 * - Elegir formato YouTube 16:9 o Shorts 9:16
 * - Agregar Imagen por Link, Texto o Audio (MP3/WAV)
 * - Copiar el Prompt Maestro para IA, Pegar el JSON generado y Exportar a MP4
 */

import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Download,
  ImagePlus,
  MonitorPlay,
  Music,
  Plus,
  Smartphone,
  Sparkles,
  Type
} from 'lucide-react';
import { YouTubeAspectPreset } from '../../dsl/dslTypes';
import { VideoProjectBundle } from '../../projects/projectTypes';

interface ProjectSwitcherHeaderProps {
  projects: VideoProjectBundle[];
  activeProject: VideoProjectBundle;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onChangeAspectRatio: (aspect: YouTubeAspectPreset) => void;
  onOpenPromptModal: (tab: 'copy-prompt' | 'paste-json') => void;
  onQuickAddImageByUrl: () => void;
  onQuickAddTextNode: () => void;
  onOpenAudioModal: () => void;
  onOpenExportMp4Modal: () => void;
}

export const ProjectSwitcherHeader: React.FC<ProjectSwitcherHeaderProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onChangeAspectRatio,
  onOpenPromptModal,
  onQuickAddImageByUrl,
  onQuickAddTextNode,
  onOpenAudioModal,
  onOpenExportMp4Modal
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const aspectRatio: YouTubeAspectPreset =
    activeProject.scene.aspectRatio === '9:16' ? '9:16' : '16:9';

  const hasAudio = Boolean(activeProject.scene.audioTrack?.src);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateProject(newName.trim());
    setNewName('');
    setIsCreating(false);
  };

  return (
    <header className="editor-header">
      {/* Izquierda: Selector de Proyecto Aislado */}
      <div className="header-group">
        <div className="brand-logo" title={`Carpeta aislada: ${activeProject.directoryPath}`}>
          <Sparkles size={16} />
        </div>

        <select
          className="project-select"
          value={activeProject.manifest.id}
          onChange={(e) => onSelectProject(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.manifest.id} value={p.manifest.id}>
              📁 {p.manifest.name}
            </option>
          ))}
        </select>

        {!isCreating ? (
          <button
            className="btn-secondary"
            onClick={() => setIsCreating(true)}
            title="Crear nuevo proyecto de video separado"
          >
            <Plus size={14} />
            Nuevo
          </button>
        ) : (
          <form onSubmit={handleCreateSubmit} className="inline-create-form">
            <input
              type="text"
              placeholder="Nombre del proyecto..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-primary">
              Crear
            </button>
          </form>
        )}
      </div>

      {/* Centro: Selector de Pantalla YouTube 16:9 / Shorts 9:16 */}
      <div className="youtube-format-pill">
        <button
          type="button"
          className={`format-btn ${aspectRatio === '16:9' ? 'active' : ''}`}
          onClick={() => onChangeAspectRatio('16:9')}
        >
          <MonitorPlay size={13} />
          YouTube 16:9
        </button>
        <button
          type="button"
          className={`format-btn ${aspectRatio === '9:16' ? 'active' : ''}`}
          onClick={() => onChangeAspectRatio('9:16')}
        >
          <Smartphone size={13} />
          Shorts 9:16
        </button>
      </div>

      {/* Derecha: Imagen, Texto, Audio, Prompt IA y Exportar MP4 */}
      <div className="header-group">
        <button type="button" className="btn-secondary" onClick={onQuickAddImageByUrl}>
          <ImagePlus size={14} />
          + Imagen Link
        </button>
        <button type="button" className="btn-secondary" onClick={onQuickAddTextNode}>
          <Type size={14} />
          + Texto
        </button>
        <button
          type="button"
          className={`btn-secondary ${hasAudio ? 'btn-audio-active' : ''}`}
          onClick={onOpenAudioModal}
          title={hasAudio ? `Audio activo: ${activeProject.scene.audioTrack?.name}` : 'Agregar música o locución MP3/WAV'}
        >
          <Music size={14} />
          {hasAudio ? 'Audio ON' : '+ Audio'}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => onOpenPromptModal('copy-prompt')}
        >
          <Copy size={14} />
          Prompt IA
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onOpenPromptModal('paste-json')}
        >
          <Code2 size={14} />
          Pegar JSON
        </button>

        <button
          type="button"
          className="btn-export-mp4"
          onClick={onOpenExportMp4Modal}
          title="Renderizar y descargar video en formato MP4 con audio"
        >
          <Download size={14} />
          Exportar MP4
        </button>
      </div>
    </header>
  );
};

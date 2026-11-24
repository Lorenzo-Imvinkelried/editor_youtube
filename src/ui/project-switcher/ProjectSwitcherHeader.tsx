/**
 * Responsabilidad Única: Barra superior minimalista para:
 * - Cambiar o crear un proyecto aislado
 * - Elegir el estilo de Fondo sin líneas (Azul Noche estilo Niels Bohr, Cosmos, Esmeralda, etc.)
 * - Elegir formato YouTube 16:9 o Shorts 9:16
 * - Descargar/Editar el JSON del video, buscar Imágenes, poner Audio y Exportar a MP4
 */

import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Download,
  ImagePlus,
  MonitorPlay,
  Music,
  Palette,
  Plus,
  Smartphone,
  Sparkles,
  Type
} from 'lucide-react';
import { BackgroundPresetStyle, YouTubeAspectPreset } from '../../dsl/dslTypes';
import { BACKGROUND_PRESETS } from '../../engine/backgroundRenderer';
import { VideoProjectBundle } from '../../projects/projectTypes';

interface ProjectSwitcherHeaderProps {
  projects: VideoProjectBundle[];
  activeProject: VideoProjectBundle;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string) => void;
  onChangeAspectRatio: (aspect: YouTubeAspectPreset) => void;
  onChangeBackgroundStyle: (style: BackgroundPresetStyle) => void;
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
  onChangeBackgroundStyle,
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
  const bgStyle: BackgroundPresetStyle =
    activeProject.scene.backgroundStyle || 'vintage-paper';
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
      {/* Izquierda: Selector de Proyecto Aislado + Selector de Fondo estilo Niels Bohr */}
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

        <div className="bg-selector-wrap" title="Cambiar fondo del video (sin líneas de grilla)">
          <Palette size={13} className="text-sky" />
          <select
            className="project-select bg-select"
            value={bgStyle}
            onChange={(e) => onChangeBackgroundStyle(e.target.value as BackgroundPresetStyle)}
          >
            {BACKGROUND_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                🎨 {preset.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Centro: Selector de Pantalla YouTube 16:9 / Shorts 9:16 */}
      <div className="youtube-format-pill">
        <button
          type="button"
          className={`format-btn ${aspectRatio === '16:9' ? 'active' : ''}`}
          onClick={() => onChangeAspectRatio('16:9')}
        >
          <MonitorPlay size={13} />
          16:9
        </button>
        <button
          type="button"
          className={`format-btn ${aspectRatio === '9:16' ? 'active' : ''}`}
          onClick={() => onChangeAspectRatio('9:16')}
        >
          <Smartphone size={13} />
          9:16
        </button>
      </div>

      {/* Derecha: Imagen, Texto, Audio, JSON del Video, Prompt IA y Exportar MP4 */}
      <div className="header-group">
        <button type="button" className="btn-secondary" onClick={onQuickAddImageByUrl}>
          <ImagePlus size={14} />
          + Imagen
        </button>
        <button type="button" className="btn-secondary" onClick={onQuickAddTextNode}>
          <Type size={14} />
          + Texto
        </button>
        <button
          type="button"
          className={`btn-secondary ${hasAudio ? 'btn-audio-active' : ''}`}
          onClick={onOpenAudioModal}
        >
          <Music size={14} />
          {hasAudio ? 'Audio ON' : '+ Audio'}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={() => onOpenPromptModal('paste-json')}
          title="Descargar, subir o editar todo el video en formato JSON"
        >
          <Code2 size={14} />
          JSON del Video
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
          className="btn-export-mp4"
          onClick={onOpenExportMp4Modal}
        >
          <Download size={14} />
          Exportar MP4
        </button>
      </div>
    </header>
  );
};

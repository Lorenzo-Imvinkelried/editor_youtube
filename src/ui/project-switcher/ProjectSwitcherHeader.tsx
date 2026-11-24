/**
 * Responsabilidad Única: Barra superior para cambiar entre proyectos de video aislados,
 * crear nuevos proyectos independientes y exportar el paquete de datos del proyecto activo.
 */

import React, { useState } from 'react';
import { FolderGit2, Plus, Download, Film, Sparkles } from 'lucide-react';
import { VideoProjectBundle } from '../../projects/projectTypes';

interface ProjectSwitcherHeaderProps {
  projects: VideoProjectBundle[];
  activeProject: VideoProjectBundle;
  onSelectProject: (projectId: string) => void;
  onCreateProject: (name: string, description: string) => void;
  onExportBundle: () => void;
}

export const ProjectSwitcherHeader: React.FC<ProjectSwitcherHeaderProps> = ({
  projects,
  activeProject,
  onSelectProject,
  onCreateProject,
  onExportBundle
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateProject(newName.trim(), 'Proyecto aislado generado desde el editor');
    setNewName('');
    setIsCreating(false);
  };

  return (
    <header className="editor-header">
      <div className="brand-block">
        <div className="brand-logo">
          <Sparkles size={18} />
        </div>
        <div>
          <h1 className="brand-title">InfiniteCanvas AI Studio</h1>
          <span className="brand-subtitle">Motor 2.5D • Lenguaje DSL Declarativo</span>
        </div>
      </div>

      <div className="project-selector-bar">
        <div className="isolated-badge" title="Carpeta aislada del proyecto activo">
          <FolderGit2 size={14} />
          <code>{activeProject.directoryPath}</code>
        </div>

        <select
          className="project-select"
          value={activeProject.manifest.id}
          onChange={(e) => onSelectProject(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.manifest.id} value={p.manifest.id}>
              {p.manifest.name} ({p.manifest.resolution.width}x{p.manifest.resolution.height} • {p.manifest.fps}fps)
            </option>
          ))}
        </select>

        {!isCreating ? (
          <button className="btn-secondary" onClick={() => setIsCreating(true)}>
            <Plus size={14} />
            Nuevo Proyecto Aislado
          </button>
        ) : (
          <form onSubmit={handleCreateSubmit} className="inline-create-form">
            <input
              type="text"
              placeholder="Nombre del video..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn-primary">
              Crear
            </button>
            <button type="button" className="btn-ghost" onClick={() => setIsCreating(false)}>
              Cancelar
            </button>
          </form>
        )}
      </div>

      <div className="header-actions">
        <div className="meta-pill">
          <Film size={13} />
          <span>{activeProject.scene.nodes.length} nodos</span>
        </div>
        <button className="btn-primary" onClick={onExportBundle} title="Exportar paquete aislado de este proyecto">
          <Download size={14} />
          Exportar Bundle Proyecto
        </button>
      </div>
    </header>
  );
};

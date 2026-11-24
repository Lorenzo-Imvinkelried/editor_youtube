/**
 * Responsabilidad Única: Mostrar el árbol de archivos aislados del proyecto activo
 * (`projects/<id>/...`) y permitir editar las propiedades espaciales `(x, y, z)` del nodo seleccionado.
 */

import React from 'react';
import { FolderTree, FileJson, Image, Sliders, Crosshair } from 'lucide-react';
import { DslCanvasNode } from '../../dsl/dslTypes';
import { VideoProjectBundle } from '../../projects/projectTypes';

interface ProjectInspectorPanelProps {
  project: VideoProjectBundle;
  selectedNode: DslCanvasNode | null;
  onUpdateNode: (updatedNode: DslCanvasNode) => void;
  onFocusNodeWithCamera: (nodeId: string) => void;
}

export const ProjectInspectorPanel: React.FC<ProjectInspectorPanelProps> = ({
  project,
  selectedNode,
  onUpdateNode,
  onFocusNodeWithCamera
}) => {
  return (
    <aside className="panel-card inspector-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <FolderTree size={16} className="text-emerald" />
          <h3>Aislamiento del Proyecto</h3>
        </div>
      </div>

      <div className="project-files-tree">
        <div className="tree-root">{project.directoryPath}</div>
        <div className="tree-item">
          <FileJson size={13} className="text-amber" />
          <span>project.manifest.json</span>
        </div>
        <div className="tree-item">
          <FileJson size={13} className="text-sky" />
          <span>scene.dsl.json ({project.scene.nodes.length} nodos)</span>
        </div>
        <div className="tree-item">
          <FileJson size={13} className="text-emerald" />
          <span>chat.history.json ({project.chatHistory.length} msgs)</span>
        </div>
        <div className="tree-item">
          <Image size={13} />
          <span>assets/ ({project.assets.length} archivos aislados)</span>
        </div>
      </div>

      <div className="inspector-divider" />

      <div className="panel-header">
        <div className="panel-title-group">
          <Sliders size={15} />
          <h3>Inspector de Nodo 2.5D</h3>
        </div>
      </div>

      {selectedNode ? (
        <div className="node-inspector-form">
          <div className="inspector-row">
            <label>ID Semántico (DSL)</label>
            <code>{selectedNode.id}</code>
          </div>
          <div className="inspector-row">
            <label>Etiqueta</label>
            <input
              type="text"
              value={selectedNode.label}
              onChange={(e) => onUpdateNode({ ...selectedNode, label: e.target.value })}
            />
          </div>
          <div className="inspector-grid-3">
            <div>
              <label>X (Canvas)</label>
              <input
                type="number"
                value={Math.round(selectedNode.x)}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    x: Number(e.target.value),
                    relativeTo: undefined
                  })
                }
              />
            </div>
            <div>
              <label>Y (Canvas)</label>
              <input
                type="number"
                value={Math.round(selectedNode.y)}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    y: Number(e.target.value),
                    relativeTo: undefined
                  })
                }
              />
            </div>
            <div>
              <label>Z (Parallax)</label>
              <input
                type="number"
                step="0.05"
                min="-0.5"
                max="0.8"
                value={selectedNode.z}
                onChange={(e) => onUpdateNode({ ...selectedNode, z: Number(e.target.value) })}
              />
            </div>
          </div>

          <button
            type="button"
            className="btn-secondary full-width"
            onClick={() => onFocusNodeWithCamera(selectedNode.id)}
          >
            <Crosshair size={13} />
            Enfocar Cámara en este Nodo
          </button>
        </div>
      ) : (
        <p className="inspector-empty-hint">
          Hacé click en cualquier imagen o SVG del canvas infinito para editar sus coordenadas `(x, y, z)` o enfocarlo.
        </p>
      )}
    </aside>
  );
};

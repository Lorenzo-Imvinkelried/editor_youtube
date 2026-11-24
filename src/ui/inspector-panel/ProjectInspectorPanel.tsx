/**
 * Responsabilidad Única: Mostrar el árbol de archivos aislados del proyecto activo
 * (`projects/<id>/...`) y permitir editar las propiedades espaciales `(x, y, z)`,
 * textos, fuentes (`fontFamily`) y formas (`textVariant`) del nodo seleccionado.
 */

import React from 'react';
import { FolderTree, FileJson, Image, Sliders, Crosshair, Type } from 'lucide-react';
import {
  DslCanvasNode,
  TextFontFamily,
  TextShapeVariant
} from '../../dsl/dslTypes';
import { VideoProjectBundle } from '../../projects/projectTypes';

interface ProjectInspectorPanelProps {
  project: VideoProjectBundle;
  selectedNode: DslCanvasNode | null;
  onUpdateNode: (updatedNode: DslCanvasNode) => void;
  onFocusNodeWithCamera: (nodeId: string) => void;
  onQuickAddTextNode: () => void;
}

const FONT_OPTIONS: Array<{ value: TextFontFamily; label: string }> = [
  { value: 'display', label: 'Display Impact (Titular YouTube)' },
  { value: 'sans', label: 'Sans Moderna (Inter / Limpia)' },
  { value: 'serif', label: 'Serif Editorial (Documental)' },
  { value: 'mono', label: 'Monospace (Código / Datos)' },
  { value: 'handwritten', label: 'Manuscrita (Apunte Canvas)' }
];

const VARIANT_OPTIONS: Array<{ value: TextShapeVariant; label: string }> = [
  { value: '3d-pop', label: '3D Pop Extruido (Estilo YouTube)' },
  { value: 'highlight-box', label: 'Cinta Resaltada (Estilo Vox)' },
  { value: 'neon-glow', label: 'Resplandor Neón Luminoso' },
  { value: 'curved-arc', label: 'Texto Curvo en Arco' },
  { value: 'outline-hollow', label: 'Contorno Hueco Vectorial' },
  { value: 'pill-badge', label: 'Cápsula Redondeada' }
];

export const ProjectInspectorPanel: React.FC<ProjectInspectorPanelProps> = ({
  project,
  selectedNode,
  onUpdateNode,
  onFocusNodeWithCamera,
  onQuickAddTextNode
}) => {
  return (
    <aside className="panel-card inspector-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <FolderTree size={16} className="text-emerald" />
          <h3>Aislamiento y Tipografía</h3>
        </div>
        <button
          type="button"
          className="btn-primary-xs"
          onClick={onQuickAddTextNode}
          title="Insertar un nuevo nodo de texto en el canvas infinito"
        >
          <Type size={12} />
          + Nuevo Texto
        </button>
      </div>

      <div className="project-files-tree">
        <div className="tree-root">{project.directoryPath}</div>
        <div className="tree-item">
          <FileJson size={12} className="text-amber" />
          <span>project.manifest.json ({project.scene.aspectRatio || '16:9'})</span>
        </div>
        <div className="tree-item">
          <FileJson size={12} className="text-sky" />
          <span>scene.dsl.json ({project.scene.nodes.length} nodos)</span>
        </div>
        <div className="tree-item">
          <Image size={12} />
          <span>assets/ ({project.assets.length} archivos aislados)</span>
        </div>
      </div>

      <div className="inspector-divider" />

      <div className="panel-header">
        <div className="panel-title-group">
          <Sliders size={15} />
          <h3>Inspector de Nodo ({selectedNode ? selectedNode.type.toUpperCase() : 'Ninguno'})</h3>
        </div>
      </div>

      {selectedNode ? (
        <div className="node-inspector-form">
          {selectedNode.type === 'text' && (
            <>
              <div className="inspector-col">
                <label>Texto en el Canvas</label>
                <input
                  type="text"
                  value={selectedNode.text || ''}
                  onChange={(e) =>
                    onUpdateNode({
                      ...selectedNode,
                      text: e.target.value,
                      label: `Texto: ${e.target.value.slice(0, 16)}`
                    })
                  }
                />
              </div>

              <div className="inspector-grid-2">
                <div>
                  <label>Fuente Tipográfica</label>
                  <select
                    value={selectedNode.fontFamily || 'display'}
                    onChange={(e) =>
                      onUpdateNode({
                        ...selectedNode,
                        fontFamily: e.target.value as TextFontFamily
                      })
                    }
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Forma / Estilo</label>
                  <select
                    value={selectedNode.textVariant || '3d-pop'}
                    onChange={(e) =>
                      onUpdateNode({
                        ...selectedNode,
                        textVariant: e.target.value as TextShapeVariant
                      })
                    }
                  >
                    {VARIANT_OPTIONS.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="inspector-grid-2">
                <div>
                  <label>Tamaño Fuente (px)</label>
                  <input
                    type="number"
                    min={14}
                    max={110}
                    value={selectedNode.fontSize || 36}
                    onChange={(e) =>
                      onUpdateNode({
                        ...selectedNode,
                        fontSize: Number(e.target.value)
                      })
                    }
                  />
                </div>
                <div>
                  <label>Color Principal</label>
                  <input
                    type="color"
                    value={selectedNode.color}
                    onChange={(e) =>
                      onUpdateNode({
                        ...selectedNode,
                        color: e.target.value
                      })
                    }
                  />
                </div>
              </div>
            </>
          )}

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
            Enfocar Cámara YouTube Aquí
          </button>
        </div>
      ) : (
        <p className="inspector-empty-hint">
          Hacé click en cualquier texto, imagen o SVG del canvas infinito para cambiar su fuente, forma 3D/arco/neón o posición `(x, y, z)`.
        </p>
      )}
    </aside>
  );
};

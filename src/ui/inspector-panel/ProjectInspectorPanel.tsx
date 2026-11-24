/**
 * Responsabilidad Única: Tarjeta flotante minimalista que aparece SOLO cuando el usuario
 * selecciona un elemento en el canvas (para pegar el link de una imagen de Google,
 * cambiar fuente/forma de un texto o moverlo).
 */

import React from 'react';
import { Crosshair, Link2, Trash2, X } from 'lucide-react';
import {
  DslCanvasNode,
  TextFontFamily,
  TextShapeVariant
} from '../../dsl/dslTypes';

interface ProjectInspectorPanelProps {
  selectedNode: DslCanvasNode | null;
  onUpdateNode: (updatedNode: DslCanvasNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onFocusNodeWithCamera: (nodeId: string) => void;
  onClose: () => void;
}

const FONT_OPTIONS: Array<{ value: TextFontFamily; label: string }> = [
  { value: 'display', label: 'Impact / Titular YouTube' },
  { value: 'sans', label: 'Sans Moderna' },
  { value: 'serif', label: 'Serif Editorial' },
  { value: 'mono', label: 'Código Monospace' },
  { value: 'handwritten', label: 'Manuscrita' }
];

const VARIANT_OPTIONS: Array<{ value: TextShapeVariant; label: string }> = [
  { value: '3d-pop', label: '3D Pop Extruido' },
  { value: 'highlight-box', label: 'Cinta Resaltada (Vox)' },
  { value: 'neon-glow', label: 'Resplandor Neón' },
  { value: 'curved-arc', label: 'Texto en Arco Curvo' },
  { value: 'outline-hollow', label: 'Contorno Hueco' },
  { value: 'pill-badge', label: 'Cápsula Redondeada' }
];

export const ProjectInspectorPanel: React.FC<ProjectInspectorPanelProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onFocusNodeWithCamera,
  onClose
}) => {
  if (!selectedNode) return null;

  return (
    <aside className="floating-inspector-card">
      <div className="floating-inspector-header">
        <strong>Editar {selectedNode.type === 'image' ? 'Imagen' : selectedNode.type === 'text' ? 'Texto' : 'Elemento'}</strong>
        <button type="button" className="btn-icon-ghost" onClick={onClose}>
          <X size={15} />
        </button>
      </div>

      {/* Si es IMAGEN o el usuario quiere convertir cualquier nodo en Imagen pegando un link */}
      <div className="inspector-col">
        <label>
          <Link2 size={12} /> Link de Imagen (Google Images / URL directa)
        </label>
        <input
          type="url"
          placeholder="Pegá acá el link https://... de la imagen"
          value={selectedNode.src || ''}
          onChange={(e) =>
            onUpdateNode({
              ...selectedNode,
              type: e.target.value.trim() ? 'image' : selectedNode.type,
              src: e.target.value
            })
          }
        />
      </div>

      {selectedNode.type === 'text' ? (
        <>
          <div className="inspector-col">
            <label>Texto</label>
            <input
              type="text"
              value={selectedNode.text || ''}
              onChange={(e) =>
                onUpdateNode({
                  ...selectedNode,
                  text: e.target.value,
                  label: e.target.value.slice(0, 20)
                })
              }
            />
          </div>

          <div className="inspector-grid-2">
            <div>
              <label>Fuente</label>
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
              <label>Forma</label>
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
              <label>Tamaño (px)</label>
              <input
                type="number"
                min={14}
                max={110}
                value={selectedNode.fontSize || 38}
                onChange={(e) =>
                  onUpdateNode({
                    ...selectedNode,
                    fontSize: Number(e.target.value)
                  })
                }
              />
            </div>
            <div>
              <label>Color</label>
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
      ) : (
        <div className="inspector-col">
          <label>Etiqueta / Título</label>
          <input
            type="text"
            value={selectedNode.label}
            onChange={(e) => onUpdateNode({ ...selectedNode, label: e.target.value })}
          />
        </div>
      )}

      <div className="inspector-grid-3">
        <div>
          <label>Pos X</label>
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
          <label>Pos Y</label>
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
          <label>Profundidad Z</label>
          <input
            type="number"
            step="0.05"
            value={selectedNode.z}
            onChange={(e) => onUpdateNode({ ...selectedNode, z: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="floating-inspector-actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => onFocusNodeWithCamera(selectedNode.id)}
        >
          <Crosshair size={13} />
          Enfocar Cámara
        </button>
        <button
          type="button"
          className="btn-danger-ghost"
          onClick={() => onDeleteNode(selectedNode.id)}
        >
          <Trash2 size={13} />
          Borrar
        </button>
      </div>
    </aside>
  );
};

/**
 * Responsabilidad Única: Selector interactivo de escenas/nodos específicos a narrar con la API,
 * con búsqueda rápida, atajos ("Solo Intro", "Primer minuto", "Todos", "Ninguno") y conteo de caracteres.
 */

import React, { useMemo, useState } from 'react';
import { CheckSquare, Search, Square } from 'lucide-react';
import { SceneNarrationSegment } from '../../engine/narrationExtractor';
import { formatTimeMmSs } from '../../shared/math';

interface NarrationNodePickerProps {
  segments: SceneNarrationSegment[];
  selectedIndices: Set<number>;
  onChangeSelected: (next: Set<number>) => void;
}

export const NarrationNodePicker: React.FC<NarrationNodePickerProps> = ({
  segments,
  selectedIndices,
  onChangeSelected
}) => {
  const [filterText, setFilterText] = useState('');

  const filteredSegments = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter(
      (s) =>
        s.text.toLowerCase().includes(q) ||
        (s.subtitleNodeId || '').toLowerCase().includes(q) ||
        (s.sceneTitle || '').toLowerCase().includes(q) ||
        `#${s.index + 1}`.includes(q)
    );
  }, [segments, filterText]);

  const introIndices = useMemo(() => {
    const explicitIntro = segments
      .filter((s) => (s.subtitleNodeId || '').toLowerCase().startsWith('intro-'))
      .map((s) => s.index);
    if (explicitIntro.length > 0) return explicitIntro;
    return segments.slice(0, 2).map((s) => s.index);
  }, [segments]);

  const toggleIndex = (idx: number) => {
    const next = new Set(selectedIndices);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    onChangeSelected(next);
  };

  const selectOnlyIntro = () => onChangeSelected(new Set(introIndices));
  const selectFirstMinute = () =>
    onChangeSelected(new Set(segments.filter((s) => s.startAt < 60).map((s) => s.index)));
  const selectAll = () => onChangeSelected(new Set(segments.map((s) => s.index)));
  const clearAll = () => onChangeSelected(new Set());

  const selectedCount = selectedIndices.size;
  const selectedChars = segments
    .filter((s) => selectedIndices.has(s.index))
    .reduce((acc, s) => acc + s.text.length, 0);

  return (
    <div className="node-picker-box">
      <div className="node-picker-toolbar">
        <div className="node-picker-search">
          <Search size={13} />
          <input
            type="text"
            placeholder="Filtrar por texto, título o ID (ej. intro, c1, receta)..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
        <div className="node-picker-shortcuts">
          <button type="button" className="chip-mini-btn" onClick={selectOnlyIntro}>
            Solo Intro ({introIndices.length})
          </button>
          <button type="button" className="chip-mini-btn" onClick={selectFirstMinute}>
            1er Minuto
          </button>
          <button type="button" className="chip-mini-btn" onClick={selectAll}>
            Todos
          </button>
          <button type="button" className="chip-mini-btn" onClick={clearAll}>
            Ninguno
          </button>
        </div>
      </div>

      <div className="node-picker-summary">
        <span>
          <strong>{selectedCount}</strong> de {segments.length} nodos seleccionados
        </span>
        <span>{selectedChars} caracteres</span>
      </div>

      <div className="node-picker-list">
        {filteredSegments.map((seg) => {
          const checked = selectedIndices.has(seg.index);
          return (
            <button
              key={seg.index}
              type="button"
              className={`node-picker-item ${checked ? 'selected' : ''}`}
              onClick={() => toggleIndex(seg.index)}
            >
              <span className="node-picker-check">
                {checked ? <CheckSquare size={15} /> : <Square size={15} />}
              </span>
              <span className="node-picker-meta">
                <code>#{seg.index + 1}</code>
                <span className="node-picker-time">{formatTimeMmSs(seg.startAt)}</span>
                {seg.subtitleNodeId && (
                  <span className="node-picker-id">{seg.subtitleNodeId}</span>
                )}
                {seg.sceneTitle && (
                  <strong className="node-picker-title">{seg.sceneTitle}</strong>
                )}
              </span>
              <span className="node-picker-text">{seg.text}</span>
            </button>
          );
        })}
        {filteredSegments.length === 0 && (
          <div className="segment-mini-more">No hay nodos que coincidan con "{filterText}".</div>
        )}
      </div>
    </div>
  );
};

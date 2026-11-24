/**
 * Responsabilidad Única: Editor en vivo y validador del código DSL (`scene.dsl.json`)
 * del proyecto activo, más visor de referencia rápida de la gramática para LLMs.
 */

import React, { useEffect, useState } from 'react';
import { Code2, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';
import { DSL_LANGUAGE_REFERENCE } from '../../dsl/dslReference';
import { DslScene } from '../../dsl/dslTypes';
import { validateAndParseDsl } from '../../dsl/dslValidator';

interface DslCodePanelProps {
  projectId: string;
  scene: DslScene;
  onApplyDslScene: (newScene: DslScene) => void;
}

export const DslCodePanel: React.FC<DslCodePanelProps> = ({
  projectId,
  scene,
  onApplyDslScene
}) => {
  const [rawCode, setRawCode] = useState(() => JSON.stringify(scene, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  useEffect(() => {
    setRawCode(JSON.stringify(scene, null, 2));
    setError(null);
  }, [scene, projectId]);

  const handleCodeChange = (value: string) => {
    setRawCode(value);
    const result = validateAndParseDsl(value);
    if (result.valid && result.scene) {
      setError(null);
      onApplyDslScene(result.scene);
    } else {
      setError(result.error || 'DSL inválido');
    }
  };

  return (
    <section className="panel-card dsl-panel">
      <div className="panel-header">
        <div className="panel-title-group">
          <Code2 size={16} className="text-amber" />
          <h3>Lenguaje Interno (DSL)</h3>
        </div>
        <div className="dsl-header-actions">
          <button
            type="button"
            className="btn-ghost-xs"
            onClick={() => setShowDocs((prev) => !prev)}
          >
            <BookOpen size={12} />
            {showDocs ? 'Ver JSON' : 'Gramática DSL'}
          </button>
          <span className="panel-tag">{projectId}/scene.dsl.json</span>
        </div>
      </div>

      {showDocs ? (
        <pre className="dsl-docs-box">{DSL_LANGUAGE_REFERENCE}</pre>
      ) : (
        <>
          <textarea
            className="dsl-textarea"
            value={rawCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            spellCheck={false}
          />
          <div className={`dsl-status-bar ${error ? 'is-error' : 'is-valid'}`}>
            {error ? (
              <>
                <AlertTriangle size={13} />
                <span>{error}</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} />
                <span>DSL válido y sincronizado a 60 FPS</span>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
};

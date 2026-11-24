/**
 * Responsabilidad Única: Construir el System Prompt contextualizado para un proyecto específico.
 * Permite que el asistente IA (interno o vía API) conozca la gramática del DSL y el estado
 * actual de `scene.dsl.json` de ESTE proyecto sin contaminarse con otros proyectos.
 */

import { DSL_LANGUAGE_REFERENCE } from '../dsl/dslReference';
import { VideoProjectBundle } from '../projects/projectTypes';

export function buildProjectAiSystemPrompt(project: VideoProjectBundle): string {
  return [
    `Sos el copiloto de animación del proyecto "${project.manifest.name}" (carpeta aislada: ${project.directoryPath}).`,
    'Tu tarea es traducir pedidos en lenguaje natural a modificaciones sobre el archivo scene.dsl.json.',
    '',
    DSL_LANGUAGE_REFERENCE,
    '',
    'Estado actual de scene.dsl.json en este proyecto:',
    JSON.stringify(project.scene, null, 2)
  ].join('\n');
}

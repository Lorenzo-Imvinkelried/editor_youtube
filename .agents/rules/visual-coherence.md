# Regla Obligatoria de Coherencia Visual Texto-Imagen (`visual-coherence.md`)

Cada fotografía o lámina en un video debe reforzar **exactamente lo que se está diciendo en esa escena**. Está estrictamente prohibido publicar o entregar un proyecto de video con imágenes "de relleno", metáforas forzadas o fotos que no coincidan con el texto narrado.

## 1. Principio de Correspondencia Literal
- **Si la voz habla de un ingrediente, acción o concepto concreto, la imagen DEBE mostrar exactamente ese ingrediente, acción o concepto**:
  - ✅ Voz: *"si hierves el repollo durante media hora pierdes vitamina C"* → Foto de **repollo cocinándose/cortándose**, nunca un pimiento rojo.
  - ✅ Voz: *"evita tomar té o café justo con las lentejas"* → Foto de **taza de té o café**, nunca naranjas.
  - ✅ Voz: *"añade las lentejas remojadas a la olla"* → Foto de **lentejas cocinándose en olla**, nunca una cebolla sola.
  - ✅ Voz: *"agrega el repollo en tiras los últimos cinco minutos"* → Foto de **repollo en tiras / salteándose**, nunca zanahorias.
- **PROHIBIDO usar imágenes de laboratorio, metales crudos, ampollas clínicas o artículos engañosos de Wikipedia** en videos de nutrición/cocina cotidiana (ej.: cubos de hierro electrolítico, trozos de potasio metálico, cristales de yodo, ampollas hospitalarias, hojas de arce japonés para "antocianinas", enfermedades de plantas como *Black rot* o insectos/orugas).
- **Cero SVGs personalizados**: el 100% de los nodos visuales siguen siendo `type: "image"` con fotografías reales o láminas editoriales/botánicas limpias.
- **Calidad antes que variedad artificial**: si hace falta mostrar repollo o lentejas en varias escenas, buscar fotografías distintas y auténticas de repollo/lentejas/platos reales (o del ingrediente exacto narrado), **jamás meter un ingrediente unrelated** (como pimentón, pimiento o cebolla) solo por no repetir tema.

## 2. Flujo de Auditoría Obligatoria Antes de Entregar Cualquier Video
Antes de dar por terminado un `scene.dsl.json` nuevo o editado, el agente DEBE ejecutar los 3 pasos siguientes sin excepción:

1. **Correr el auditor automático**:
   ```bash
   npm run audit:images -- projects/<project-id>/scene.dsl.json --sheets <carpeta-temporal>
   ```
   El script verifica `0` SVGs, `HTTP 200`, dimensiones válidas, banderas rojas de nombre de archivo, coherencia semántica bilingüe (ES/EN) contra el texto hablado de cada escena y genera **hojas de contacto visuales (`sheet_01.jpg`, `sheet_02.jpg`, ...)** con el texto hablado debajo de cada foto.
2. **Inspección visual real con visión multimodal (`read_file`)**:
   - El agente DEBE abrir y revisar visualmente **TODAS las hojas de contacto generadas** con `read_file`.
   - Para cada celda, comprobar con los propios ojos: *(a)* ¿la imagen muestra realmente lo que dice la narración?, *(b)* ¿se ve apetitosa, nítida, sin marcas de agua, sin texto gigante en otro idioma ni imágenes desagradables/fuera de contexto?
3. **Reemplazo y re-verificación**:
   - Toda escena marcada como `MISMATCH`, `WARN` no justificado o rechazada visualmente en las hojas de contacto debe ser reemplazada por una foto verificada (`HTTP 200`) y **re-inspeccionada visualmente** hasta lograr **100% de coherencia texto-imagen**.

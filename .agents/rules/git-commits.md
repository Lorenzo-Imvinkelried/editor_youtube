---
trigger: always_on
description: Reglas obligatorias para commits y pushes en Git (Español Imperativo + justificación en el body).
---

# Convención de Commits y Pushes (Git)

Todo commit y push realizado en este repositorio DEBE cumplir estrictamente las siguientes reglas:

## 1. Idioma y Modo Verbal (Título / Subject)
- **Idioma**: Español neutro.
- **Modo verbal**: **IMPERATIVO** (2da/3ra persona singular del imperativo: responde a *"Este commit..."*).
- **Verbos permitidos (ejemplos)**:
  - `Agrega` (NO "Agregado", "Agregando", "Añadir", "Add")
  - `Refacciona` (NO "Refactorizando", "Refactorizado", "Refactor")
  - `Corrige` (NO "Corregido", "Arreglando", "Fix")
  - `Actualiza` (NO "Actualizado", "Update")
  - `Elimina` (NO "Eliminado", "Borra", "Remove")
  - `Configura` (NO "Configurando", "Setup")
  - `Extrae` / `Separa` / `Optimiza` / `Documenta`
- **Longitud del título**: Máximo 72 caracteres, sin punto final.

## 2. Cuerpo del Commit (Body) Obligatorio — Explicar el "Porqué"
- Todo commit DEBE incluir una línea en blanco después del título y un **body explicando el PORQUÉ** del cambio (la motivación técnica o de negocio, qué problema resuelve y por qué se tomó esa decisión arquitectónica), no solo enumerar qué archivos se tocaron.

## 3. Ejemplo de Commit Válido

```text
Agrega motor de interpolación con físicas spring para acciones popIn

Se incorpora un evaluador de curvas basadas en resortes (spring) dentro del
módulo de animaciones para que los elementos del canvas infinito tengan
transiciones naturales con rebote sin depender de keyframes manuales. Esto
permite que el LLM invoque "physics: bouncy" en el DSL con una sola propiedad.
```

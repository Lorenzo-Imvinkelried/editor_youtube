/**
 * Responsabilidad Única: Generación determinista o limpia de identificadores únicos para nodos, proyectos y eventos.
 */

export function createId(prefix: string): string {
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${randomPart}`;
}

export function slugifyProjectId(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return base || `proyecto-${Date.now()}`;
}

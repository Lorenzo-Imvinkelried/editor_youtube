/**
 * Responsabilidad Única: Definir los tipos y contratos del Lenguaje Interno (DSL) del editor.
 * Cualquier IA que genere o modifique una escena debe producir estructuras que cumplan este contrato.
 */

export type EasingName =
  | 'linear'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'springBouncy'
  | 'springSmooth';

export type RelativeDirection = 'rightOf' | 'leftOf' | 'above' | 'below';

export interface RelativePlacement {
  targetId: string;
  direction: RelativeDirection;
  gap: number;
}

export type CanvasNodeType = 'image' | 'svg' | 'text' | 'badge' | 'shape';

export type BuiltinSvgIcon =
  | 'brain'
  | 'cpu'
  | 'sparkles'
  | 'rocket'
  | 'globe'
  | 'chart'
  | 'camera'
  | 'code'
  | 'star'
  | 'bolt';

/** Familias tipográficas semánticas para el DSL */
export type TextFontFamily =
  | 'display'      // Impactante / Titulares estilo YouTube (Arial Black / Montserrat / Bebas)
  | 'sans'         // Moderna y limpia (Inter / System UI)
  | 'serif'        // Editorial / Ensayo cinematográfico (Georgia / Playfair Display)
  | 'mono'         // Código / Datos técnicos (Cascadia Code / Fira Code)
  | 'handwritten'; // Apuntes manuscritos sobre el canvas (Segoe Print / Caveat / Comic Sans)

/** Formas y estilos visuales para nodos de texto */
export type TextShapeVariant =
  | '3d-pop'         // Texto con extrusión 3D sólida y contorno grueso estilo YouTube
  | 'highlight-box'  // Cinta resaltadora editorial estilo documental Vox
  | 'neon-glow'      // Texto luminoso con resplandor neón intenso
  | 'curved-arc'     // Texto dispuesto en arco circular
  | 'outline-hollow' // Texto hueco con trazo vectorial
  | 'pill-badge';    // Tarjeta o cápsula redondeada

export type YouTubeAspectPreset = '16:9' | '9:16';

export interface DslCanvasNode {
  id: string;
  label: string;
  type: CanvasNodeType;
  /** Ruta dentro de projects/<id>/assets/ o URL de imagen */
  src?: string;
  /** Ícono vectorial integrado cuando type === 'svg' */
  icon?: BuiltinSvgIcon;
  /** Contenido textual cuando type === 'text' o 'badge' */
  text?: string;
  /** Fuente tipográfica para nodos de texto */
  fontFamily?: TextFontFamily;
  /** Forma o estilo visual del texto */
  textVariant?: TextShapeVariant;
  /** Tamaño de fuente en píxeles del espacio del canvas */
  fontSize?: number;
  color: string;
  accentColor?: string;
  /** Coordenadas en el canvas cuasi infinito */
  x: number;
  y: number;
  /** Profundidad Z (-0.5 a +0.8) para efecto Parallax 2.5D al mover la cámara */
  z: number;
  width: number;
  height: number;
  /** Posicionamiento semántico opcional para evitar que el LLM pise elementos */
  relativeTo?: RelativePlacement;
  initialOpacity?: number;
  initialScale?: number;
  initialRotation?: number;
}

export type NodeActionType =
  | 'popIn'
  | 'popOut'
  | 'moveTo'
  | 'rotateTo'
  | 'scaleTo'
  | 'float'
  | 'wiggle'
  | 'pulse'
  | 'spin'
  | 'typewriter';

export interface DslTimelineAction {
  id: string;
  at: number;
  duration: number;
  targetId: string;
  action: NodeActionType;
  easing?: EasingName;
  params?: {
    x?: number;
    y?: number;
    scale?: number;
    degrees?: number;
    amplitude?: number;
    speed?: number;
    angle?: number;
    overshoot?: number;
    scaleAmount?: number;
  };
}

export type CameraActionType = 'focusOn' | 'moveTo' | 'zoomTo';

export interface DslCameraKeyframe {
  at: number;
  duration: number;
  action: CameraActionType;
  targetId?: string;
  x?: number;
  y?: number;
  zoom?: number;
  rotation?: number;
  easing?: EasingName;
}

export interface DslScene {
  version: string;
  duration: number;
  aspectRatio?: YouTubeAspectPreset;
  background: string;
  gridColor: string;
  nodes: DslCanvasNode[];
  cameraTrack: DslCameraKeyframe[];
  timeline: DslTimelineAction[];
}

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
  | 'bolt'
  | 'portrait';

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
  | 'pill-badge'     // Tarjeta o cápsula redondeada
  | 'clean-subtitle'; // Texto limpio minimalista estilo Niels Bohr (Título blanco + subtítulo color)

export type YouTubeAspectPreset = '16:9' | '9:16';

/** Estilos de fondo cinematográficos sin líneas de grilla */
export type BackgroundPresetStyle =
  | 'midnight-bohr'   // Azul noche profundo radial con partículas suaves (estilo Niels Bohr)
  | 'deep-space'      // Violeta/azul cósmico oscuro sin líneas
  | 'emerald-studio'  // Verde petróleo oscuro cinematográfico
  | 'amber-vintage'   // Marrón/ámbar oscuro documental histórico
  | 'obsidian-clean'  // Negro puro minimalista
  | 'custom-solid';   // Color personalizado elegido por el usuario

export interface DslCanvasNode {
  id: string;
  label: string;
  /** Subtítulo opcional (ej. años "1856–1943" al costado o debajo estilo Niels Bohr) */
  subtitle?: string;
  type: CanvasNodeType;
  /** Ruta o URL directa de imagen en internet (https://...) */
  src?: string;
  /** Término de búsqueda para que el motor descargue automáticamente una imagen real de internet */
  imageQuery?: string;
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
  /** Alineación del texto ('center' | 'left' | 'right') */
  textAlign?: 'center' | 'left' | 'right';
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
  | 'slideInLeft'
  | 'slideInRight'
  | 'slideInUp'
  | 'slideInDown'
  | 'flipIn3D'
  | 'unfoldWidth'
  | 'blurFadeIn'
  | 'spiralIn'
  | 'moveTo'
  | 'rotateTo'
  | 'scaleTo'
  | 'float'
  | 'orbit'
  | 'pendulum'
  | 'neonFlicker'
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
    radius?: number;
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

export interface DslAudioTrack {
  /** URL del audio (ObjectURL local, DataURL o link https://...mp3) */
  src: string;
  /** Nombre legible del archivo o pista de audio */
  name: string;
  /** Volumen de reproducción y exportación (0.0 a 1.0) */
  volume: number;
}

export interface DslScene {
  version: string;
  duration: number;
  aspectRatio?: YouTubeAspectPreset;
  /** Estilo de fondo sin líneas (por defecto 'midnight-bohr') */
  backgroundStyle?: BackgroundPresetStyle;
  /** Color central o primario de fondo */
  background: string;
  /** Color exterior del degradado radial */
  backgroundSecondary?: string;
  /** Mostrar líneas de grilla (por defecto false para estética limpia estilo Niels Bohr) */
  showGrid?: boolean;
  gridColor: string;
  audioTrack?: DslAudioTrack;
  nodes: DslCanvasNode[];
  cameraTrack: DslCameraKeyframe[];
  timeline: DslTimelineAction[];
}

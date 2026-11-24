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
  | 'editorial-paper' // Tira o recorte de papel antiguo con tinta de imprenta/máquina de escribir
  | 'vintage-stamp'   // Sello de archivo / patente clásica con doble recuadro de tinta
  | 'clean-subtitle'  // Título editorial limpio + fecha/subtítulo debajo
  | 'highlight-box'   // Cinta resaltadora ocre/papel estilo documental
  | '3d-pop'          // Titular con sombra sólida de imprenta
  | 'curved-arc'      // Texto dispuesto en arco clásico
  | 'outline-hollow'  // Texto calado en tinta
  | 'neon-glow'       // Resplandor luminoso (para temas modernos)
  | 'pill-badge';     // Etiqueta de papel/cápsula

export type YouTubeAspectPreset = '16:9' | '9:16';

/** Estilos de fondo con predominio de Arte en Papel Vintage y Documental */
export type BackgroundPresetStyle =
  | 'vintage-paper'     // Papel antiguo crema/hueso con textura de fibra, motas sepia y viñeta cálida (Por defecto)
  | 'sepia-parchment'   // Pergamino sepia cálido estilo patente de 1890
  | 'newsprint-aged'    // Papel de diario / imprenta histórica
  | 'walnut-archive'    // Mesa de archivo de madera oscura cálida (resalta fotos en papel crema)
  | 'midnight-bohr'     // Azul noche profundo radial
  | 'obsidian-clean'    // Negro obsidiana minimalista
  | 'custom-solid';     // Color personalizado

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

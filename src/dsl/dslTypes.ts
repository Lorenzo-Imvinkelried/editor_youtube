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

export type CanvasNodeType = 'image' | 'svg' | 'badge' | 'shape';

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

export interface DslCanvasNode {
  id: string;
  label: string;
  type: CanvasNodeType;
  /** Ruta dentro de projects/<id>/assets/ o URL de imagen */
  src?: string;
  /** Ícono vectorial integrado cuando type === 'svg' */
  icon?: BuiltinSvgIcon;
  /** Texto visible cuando type === 'badge' o subtítulo */
  text?: string;
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
  | 'spin';

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
  background: string;
  gridColor: string;
  nodes: DslCanvasNode[];
  cameraTrack: DslCameraKeyframe[];
  timeline: DslTimelineAction[];
}

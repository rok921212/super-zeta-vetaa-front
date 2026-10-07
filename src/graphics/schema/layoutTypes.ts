// TypeScript view of the layout document defined (and validated) by
// ./layoutSchema.js. Keep in step with that file — it is the source of truth.

export type ElementType =
  | 'rect' | 'ellipse' | 'line' | 'polygon' | 'path' | 'text' | 'image' | 'group' | 'repeater'
  | 'progress' | 'healthBar' | 'teamLogo' | 'playerAvatar' | 'flag' | 'icon' | 'video' | 'component' | 'builtin' | 'map';

export type FormatterName =
  | 'upper' | 'lower' | 'number' | 'pad2' | 'percent' | 'ordinal' | 'time' | 'healthPercent'
  | 'currency' | 'date' | 'duration' | 'abs' | 'round' | 'fixed1' | 'fixed2' | 'plusMinus';

export type Operator =
  | 'equals' | 'notEquals' | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual'
  | 'exists' | 'notExists' | 'contains';

export type AnimationPreset =
  | 'none' | 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'slideDown' | 'scale' | 'pop' | 'wipe'
  | 'bounce' | 'pulse' | 'flash';
export type Easing =
  | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'backOut' | 'anticipate'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart' | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo'
  | 'easeInCirc' | 'easeOutCirc' | 'easeInOutCirc' | 'backIn' | 'backInOut'
  | 'elasticOut' | 'bounceOut' | 'hold';
export type AnimationEvent =
  | 'kill' | 'elimination' | 'milestone' | 'recall' | 'matchStart' | 'matchEnd' | 'rankChange' | 'killsChange'
  | 'knock' | 'revive' | 'playerDeath';

export type RepeaterSource =
  | 'derived.teams' | 'derived.liveTeams' | 'derived.overallStandings' | 'derived.matchStandings'
  | 'derived.rankedStandings' | 'derived.fraggers' | 'derived.matchFraggers' | 'deadTeamList'
  | 'matches' | 'item.players' | 'matchData.teams'
  | 'live.aliveTeams' | 'live.deadTeams' | 'live.players' | 'live.alivePlayers'
  | 'feed.kills' | 'feed.eliminations' | 'feed.recalls' | 'feed.milestones' | 'feed.rankChanges' | 'feed.knocks';

export type BindableProp =
  | 'text' | 'src' | 'visible' | 'value' | 'max' | 'fill' | 'color' | 'stroke' | 'opacity'
  | 'width' | 'height' | 'x' | 'y';

export interface DataRef {
  path: string;
  format?: FormatterName;
  fallback?: string | number | boolean;
  prefix?: string;
  suffix?: string;
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { path: string; op: Operator; value?: string | number | boolean | null };

export interface GradientStop { offset: number; color: string }
export interface Gradient { type: 'linear' | 'radial'; angle?: number; stops: GradientStop[] }

/** A style value may reference a theme token / variable: { ref: 'theme.colors.primary' }. */
export type StyleValue = string | number | boolean | null | { ref: string };

export interface ElementStyle {
  fill?: StyleValue;
  stroke?: StyleValue;
  strokeWidth?: StyleValue;
  radius?: StyleValue;
  shadow?: StyleValue;
  blur?: StyleValue;
  opacity?: StyleValue;
  fontFamily?: StyleValue;
  fontSize?: StyleValue;
  fontWeight?: StyleValue;
  fontStyle?: StyleValue;
  color?: StyleValue;
  align?: StyleValue;
  valign?: StyleValue;
  letterSpacing?: StyleValue;
  lineHeight?: StyleValue;
  textTransform?: StyleValue;
  textShadow?: StyleValue;
  objectFit?: StyleValue;
  gradient?: Gradient | null;
  padding?: StyleValue;
  grayscale?: StyleValue;
  blendMode?: StyleValue;
  overflow?: StyleValue;
  whiteSpace?: StyleValue;
}

export interface AnimationStep {
  preset: AnimationPreset;
  duration?: number;
  delay?: number;
  easing?: Easing;
  repeat?: number;
  hold?: number;
}

export interface ElementAnimation {
  enter?: AnimationStep;
  exit?: AnimationStep;
  onChange?: AnimationStep;
  onEvent?: AnimationStep & { event: AnimationEvent; filter?: Condition };
}

export interface RepeaterConfig {
  source: RepeaterSource;
  limit: number;
  offset?: number;
  direction: 'row' | 'column' | 'grid';
  columns?: number;
  gap?: number;
  itemWidth?: number;
  itemHeight?: number;
  sort?: { path: string; dir: 'asc' | 'desc' };
  filter?: Condition;
}

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn' | 'hard-light'
  | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export type EffectType = 'dropShadow' | 'innerShadow' | 'outerGlow' | 'innerGlow' | 'stroke' | 'colorOverlay' | 'gradientOverlay' | 'blur';

/** One Photoshop-style layer effect. */
export interface Effect {
  type: EffectType;
  enabled?: boolean;
  color?: string;
  opacity?: number;
  x?: number;
  y?: number;
  blur?: number;
  spread?: number;
  size?: number;
  position?: 'outside' | 'inside' | 'center';
  gradient?: Gradient;
  blendMode?: BlendMode;
}

export interface ElementMask {
  shape: 'rect' | 'ellipse' | 'path';
  radius?: number;
  d?: string;
  vb?: [number, number];
  invert?: boolean;
}

export type TimelineProp =
  | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'opacity' | 'scale' | 'scaleX' | 'scaleY' | 'skewX' | 'blur' | 'grayscale' | 'brightness' | 'fill' | 'color' | 'stroke'
  | 'dx' | 'dy' | 'rotateX' | 'rotateY' | 'skewY' | 'originX' | 'originY'
  | 'wipeL' | 'wipeR' | 'wipeT' | 'wipeB' | 'saturate' | 'hueRotate' | 'contrast' | 'letterSpacing';
export type KeyframeEase = Easing | [number, number, number, number];
export type KeyframeValue = number | string | { bind: DataRef };

export interface Keyframe { t: number; value: KeyframeValue; ease?: KeyframeEase }
export interface TimelineTrack {
  prop: TimelineProp;
  keyframes: Keyframe[];
  /** After-Effects wiggle(): smooth noise added to the value — `freq` wobbles a second, up to `amp`. */
  wiggle?: { freq: number; amp: number };
}

export interface ClipTrigger {
  type: 'enter' | 'event' | 'condition' | 'loop' | 'exit';
  event?: AnimationEvent;
  filter?: Condition;
  when?: Condition;
  /** Event clips inside a repeater: only events about this row's team / player. */
  self?: boolean;
  /** Condition clips: return to the first frame when the condition turns false. */
  revert?: boolean;
  /** Exit clips: leave by itself this many ms after the layer finished appearing. */
  after?: number;
}

export interface TimelineClip {
  id: string;
  name?: string;
  trigger: ClipTrigger;
  duration: number;
  loop?: boolean | number;
  retrigger?: 'restart' | 'ignore' | 'queue';
  /** Wait this long before starting (ms). */
  delay?: number;
  /** Time-stretch: 2 = twice as fast, 0.5 = half speed. */
  speed?: number;
  /** alternate = every other loop plays backwards (ping-pong). */
  direction?: 'normal' | 'alternate';
  /** Inside a list: each row starts this many ms after the row before it. */
  stagger?: number;
  /** The Animate-panel effect that built this clip (editor/animationLibrary.ts). */
  preset?: string;
  tracks: TimelineTrack[];
}

export interface ElementTimeline { clips: TimelineClip[] }

export interface BuiltinRef {
  /** Theme folder, e.g. "Theme6". */
  theme: string;
  /** Canonical view key (lowercase registry key), e.g. "alerts". */
  view: string;
}

export interface LayoutElement {
  id: string;
  type: ElementType;
  name?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  z?: number;
  locked?: boolean;
  hidden?: boolean;
  style?: ElementStyle;
  bind?: Partial<Record<BindableProp, DataRef>>;
  visibleWhen?: Condition;
  styleWhen?: Array<{ when: Condition; style?: ElementStyle; opacity?: number }>;
  anim?: ElementAnimation;
  // type-specific
  text?: string;
  src?: string;
  fallbackSrc?: string;
  points?: Array<[number, number]>;
  d?: string;
  icon?: string;
  max?: number;
  componentId?: string;
  overrides?: Record<string, Partial<LayoutElement>>;
  repeater?: RepeaterConfig;
  children?: LayoutElement[];
  // v2: built-in graphics, freeform, masks, effects, timeline
  builtin?: BuiltinRef;
  /** `map` element settings. */
  map?: MapSettings;
  /** CSS filter chain (hue-rotate / saturate / brightness / contrast / grayscale / invert / sepia / blur). */
  filter?: string;
  /** Original drawing box of a path: the path scales with the element instead of cropping. */
  vb?: [number, number];
  effects?: Effect[];
  mask?: ElementMask;
  /** Photoshop clipping mask: clip this layer to the sibling directly below it. */
  clipToBelow?: boolean;
  /** Image crop as fractions of the source. */
  crop?: { x: number; y: number; w: number; h: number };
  timeline?: ElementTimeline;
}

export interface LayoutComponent {
  name?: string;
  elements: LayoutElement[];
}

export interface LayoutDocument {
  schemaVersion: 1;
  stage: { width: number; height: number; background: string | null };
  theme: Record<string, any>;
  variables: Record<string, any>;
  brand: Record<string, any>;
  components: Record<string, LayoutComponent>;
  elements: LayoutElement[];
  /** Design-time settings (guides, grid). Ignored by the renderer. */
  editor?: { guides?: { v: number[]; h: number[] }; grid?: { size?: number; show?: boolean; snap?: boolean } };
}

export interface ValidationResult {
  ok: boolean;
  errors: Array<{ path: string; message: string }>;
  elementCount?: number;
}

/** The desktop minimap (element type `map`). Everything is optional. */
export interface MapSettings {
  /** 'auto' = the map of the match being played. */
  mapId?: 'auto' | 'erangle' | 'miramar' | 'rondo';
  /** What stays in the middle: the whole map, the safe zone, or the observed player. */
  follow?: 'none' | 'zone' | 'observed';
  /** How far in the view is, 1 = the whole map. Used with follow 'observed'. */
  zoom?: number;
  /** Player dot size in stage pixels. */
  dotSize?: number;
  showZone?: boolean;
  showNames?: boolean;
  showDead?: boolean;
}

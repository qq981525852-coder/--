
export enum ExperienceMode {
  TREE = 'TREE',
  SCATTER = 'SCATTER',
  FOCUS = 'FOCUS'
}

export interface State {
  mode: ExperienceMode;
  handX: number;
  handY: number;
  pinchDetected: boolean;
  fistDetected: boolean;
  openHandDetected: boolean;
  controlsVisible: boolean;
}

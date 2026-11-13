/** The spectral engine is shared with the serverless API — one implementation, two runtimes. */
export * from "../../api/_lib/spectral.js";
export type {
  ClassKey,
  Measurement,
  Quality,
  Stats,
  Target,
  TargetKey,
  Transitions,
  TrendPoint,
  SurfaceClass,
  ChangeKind,
} from "../../api/_lib/spectral.js";

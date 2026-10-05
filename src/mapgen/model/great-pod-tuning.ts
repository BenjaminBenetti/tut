// ===========================================
// Great pod tuning
// ===========================================

/**
 * The knobs a great pod is laid out by (#1238), all in tiles unless
 * stated. One object, typed here and valued in
 * `mapgen/data/great-pod-tuning` (ADR 0003 §2.5).
 *
 * ```
 *   |◄──────────── discRadius = hullRadius + apron ───────────►|
 *   centre ── core ── core chamber ── membrane ── chamber ── hull ── verge ── debris
 *            coreSize/2           membraneRadius            hullRadius   apron
 * ```
 */
export interface GreatPodTuning {
  /** Radius of the hull ring from the centre. At least `membraneRadius + 3`. */
  readonly hullRadius: number;
  /** Radius of the membrane round the core chamber. At least `coreSize/2 + 2`. */
  readonly membraneRadius: number;
  /** Half the width of a mouth and of a seam run: a width of `2 × n + 1`. */
  readonly mouthHalfWidth: number;
  /** Side of the core's square. Odd. */
  readonly coreSize: number;
  /** Rings of levelled ground outside the hull. Positive. */
  readonly apron: number;
  /** Apron rings next to the hull kept free of debris. Below `apron`. */
  readonly verge: number;
  /** Debris pieces per 100 apron columns beyond the verge. In `[0, 100]`. */
  readonly debrisDensity: number;
  /** Columns between the landing's clearance and the disc's edge. Non-negative. */
  readonly landingGap: number;
  /** Most columns the centre strays sideways from the landing's middle. */
  readonly jitter: number;
  /** Columns kept between the disc and the map edge. Non-negative. */
  readonly edgeMargin: number;
  /** Brood reach of an outer chamber (hook `meta.radius`). Positive. */
  readonly chamberRadius: number;
  /** Brood reach of the core chamber (hook `meta.radius`). Positive. */
  readonly coreChamberRadius: number;
}

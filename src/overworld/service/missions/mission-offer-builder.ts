import { mapInfestationLevel } from "../../../content/model/map-infestation";
import type { MapSizeId } from "../../../content/model/map-size-id";
import type {
  DifficultyBand,
  MissionType,
} from "../../../content/model/mission-type";
import { MISSION_DIFFICULTY_RANGE } from "../../../content/model/mission-type";
import type { MissionTypeId } from "../../../content/model/mission-type-id";
import type { City, CityId } from "../../model/city";
import { MAX_INFESTATION } from "../../model/city";
import type { Mission, MissionId, MissionMapParams } from "../../model/mission";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import type {
  MissionDifficultyRule,
  TechCarcassTuning,
} from "../../model/mission-tuning";
import type { OverworldState } from "../../model/overworld-state";
import { MAX_THREAT } from "../../model/threat";
import { getRegion } from "../earth-map-query-service";

// ===========================================
// Constants
// ===========================================

/** Prefix mission ids are issued under. */
export const MISSION_ID_PREFIX = "mission";

/** Largest value drawn for a mission's map seed. */
const MAX_MAP_SEED = 0xffffffff;

// ===========================================
// Formulae
// ===========================================

/**
 * Integer difficulty for a mission of `type` at a city with `infestation`
 * while global threat is `threat`: the weighted pressure maps linearly
 * onto the type's band and is clamped into both the band and
 * `MISSION_DIFFICULTY_RANGE`. The act's band is applied after, by
 * `clampToBand`.
 */
export function difficultyFor(
  infestation: number,
  threat: number,
  type: MissionType,
  rule: MissionDifficultyRule,
): number {
  const pressure =
    rule.infestationWeight * (infestation / MAX_INFESTATION) +
    rule.threatWeight * (threat / MAX_THREAT);
  const band = type.difficultyBand;
  const raw = band.min + (band.max - band.min) * pressure;
  const low = Math.max(band.min, MISSION_DIFFICULTY_RANGE.min);
  const high = Math.min(band.max, MISSION_DIFFICULTY_RANGE.max);
  return Math.min(high, Math.max(low, Math.round(raw)));
}

/** `difficulty` moved into `band`, inclusive (arc §3). */
export function clampToBand(difficulty: number, band: DifficultyBand): number {
  return Math.min(band.max, Math.max(band.min, difficulty));
}

/** Named map size for a difficulty: small, then medium and large from the rule's thresholds. */
export function mapSizeFor(
  difficulty: number,
  rule: MissionDifficultyRule,
): MapSizeId {
  if (difficulty >= rule.largeFromDifficulty) {
    return "large";
  }
  if (difficulty >= rule.mediumFromDifficulty) {
    return "medium";
  }
  return "small";
}

// ===========================================
// Offers
// ===========================================

/**
 * The ordinary offer of type `typeId` at `city` on `state.day`, as both
 * shipped types make it. Difficulty comes from the city's infestation
 * and the threat, clamped into the act's band, and everything that
 * follows from it is derived from the clamped value:
 *
 * ```
 *   difficultyFor(city.infestation, threat) ──clampToBand(act band)──► difficulty
 *     ├─► rewards    credits = d × rewardPerDifficulty; TP = base + d × perDifficulty
 *     ├─► map size   mapSizeFor(d, tuning.difficulty[type])
 *     └─► carcass?   rng.fork(`carcass:${id}`) ──► basePoints + d × pointsPerDifficulty
 *   ids.nextId("mission") ──► id        rng.nextInt ──► map seed
 *   day + expiryDays + intelBonus[region] ──► expiresDay
 *   progress.act ──► act (frozen, ADR 0013 §2.2)
 * ```
 *
 * Draws one id and one number (the map seed) from `ctx`; the carcass
 * roll is a labelled fork, so it consumes nothing from the stream.
 */
export function buildOffer(
  state: OverworldState,
  city: City,
  typeId: MissionTypeId,
  ctx: MissionOfferContext,
): Mission {
  const difficulty = clampToBand(
    difficultyFor(
      city.infestation,
      state.threat,
      ctx.missionTypes[typeId],
      ctx.tuning.difficulty[typeId],
    ),
    ctx.act.difficultyBand,
  );
  return buildOfferAtDifficulty(state, city, typeId, difficulty, ctx);
}

/**
 * The offer of type `typeId` at `city` on `state.day` at exactly
 * `difficulty`, with everything that follows from it derived as
 * `buildOffer` derives it (rewards, map size, carcass, expiry, act).
 * `buildOffer` calls it with the clamped difficulty; a story offer calls
 * it with its own fixed difficulty, which no band clamps (arc §3).
 * Draws one id and one number (the map seed) from `ctx`, and the carcass
 * roll on a labelled fork.
 */
export function buildOfferAtDifficulty(
  state: OverworldState,
  city: City,
  typeId: MissionTypeId,
  difficulty: number,
  ctx: MissionOfferContext,
): Mission {
  const type = ctx.missionTypes[typeId];
  const rule = ctx.tuning.difficulty[typeId];
  const region = getRegion(state.map, city.regionId);
  const id = ctx.ids.nextId(MISSION_ID_PREFIX);
  const mapSeed = ctx.rng.nextInt(0, MAX_MAP_SEED);
  const intelDays = ctx.intelBonus[region.id] ?? 0;
  return {
    id,
    typeId,
    cityId: city.id,
    difficulty,
    mapParams: {
      infestation: mapInfestationLevel(city.infestation),
      biome: city.biome ?? region.biome,
      settlement: city.scale,
      size: mapSizeFor(difficulty, rule),
      seed: String(mapSeed),
      ...techCarcassFor(id, difficulty, ctx),
    },
    rewards: {
      credits: difficulty * type.rewardPerDifficulty,
      techPoints:
        type.techRewardBase + difficulty * type.techRewardPerDifficulty,
    },
    createdDay: state.day,
    expiresDay: state.day + type.expiryDays + intelDays,
    ignorePenalty: type.ignorePenalty,
    act: state.progress.act,
  };
}

/**
 * `mission` re-priced at `difficulty`: everything `buildOfferAtDifficulty`
 * derives from the difficulty is derived again — the credit and
 * tech-point rewards, the map size, and a carcass's worth when the offer
 * rolled one — and everything else is kept, the id, seed, created day,
 * expiry and whether a carcass was rolled among it. For a rule's
 * `refresh`, which re-prices an offer already on the board. Pure; draws
 * nothing. Returns `mission` itself when `difficulty` is its own.
 *
 * ```
 *   difficulty ──► rewards    credits = d × rewardPerDifficulty; TP = base + d × perDifficulty
 *              ──► map size   mapSizeFor(d, tuning.difficulty[type])
 *              ──► carcass    basePoints + d × pointsPerDifficulty, only if one was rolled
 * ```
 */
export function repriceOffer(
  mission: Mission,
  difficulty: number,
  ctx: Pick<MissionOfferContext, "tuning" | "missionTypes">,
): Mission {
  if (difficulty === mission.difficulty) {
    return mission;
  }
  const type = ctx.missionTypes[mission.typeId];
  const carcass = ctx.tuning.techCarcass;
  const { techCarcass } = mission.mapParams;
  return {
    ...mission,
    difficulty,
    mapParams: {
      ...mission.mapParams,
      size: mapSizeFor(difficulty, ctx.tuning.difficulty[mission.typeId]),
      ...(techCarcass === undefined
        ? {}
        : {
            techCarcass: {
              ...techCarcass,
              techPoints:
                carcass.basePoints + carcass.pointsPerDifficulty * difficulty,
            },
          }),
    },
    rewards: {
      credits: difficulty * type.rewardPerDifficulty,
      techPoints:
        type.techRewardBase + difficulty * type.techRewardPerDifficulty,
    },
  };
}

/** The cities that already hold an offer; a city holds at most one. */
export function citiesWithOffers(state: OverworldState): Set<CityId> {
  return new Set(state.missions.map((mission) => mission.cityId));
}

// ===========================================
// Helpers
// ===========================================

/**
 * Rolls whether the offer carries a tech carcass (#1171) on a fork
 * keyed by the mission id, so the roll neither consumes a draw from the
 * offer stream nor repeats across missions. Returns the field to
 * spread, or nothing.
 */
function techCarcassFor(
  id: MissionId,
  difficulty: number,
  ctx: MissionOfferContext,
): Pick<MissionMapParams, "techCarcass"> {
  const tuning: TechCarcassTuning = ctx.tuning.techCarcass;
  if (!ctx.rng.fork(`carcass:${id}`).chance(tuning.chance)) {
    return {};
  }
  return {
    techCarcass: {
      techPoints: tuning.basePoints + tuning.pointsPerDifficulty * difficulty,
    },
  };
}

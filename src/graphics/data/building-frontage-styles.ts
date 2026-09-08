import type {
  BuildingFrontageModule,
  BuildingFrontageStyle,
} from "../model/building-frontage-style";

/** Small porch canopy; its lamps remain above the real door opening. */
const RESIDENTIAL_ENTRANCE: BuildingFrontageModule = {
  modelId: "building.residential-entry",
  width: 1.35,
  mountHeight: 1.1,
};

/** Existing use ids select additions; unknown kinds keep their original shell. */
export const BUILDING_FRONTAGE_STYLES: Readonly<
  Record<string, BuildingFrontageStyle>
> = {
  house: { entrances: [RESIDENTIAL_ENTRANCE], domesticWindows: true },
  apartment: {
    entrances: [RESIDENTIAL_ENTRANCE],
    domesticWindows: true,
    sharedMail: true,
  },
  shop: {
    entrances: [
      { modelId: "building.shop-awning", width: 3, mountHeight: 1.21 },
      { modelId: "building.shop-awning-narrow", width: 1, mountHeight: 1.21 },
    ],
  },
  tower: {
    entrances: [
      {
        modelId: "building.workplace-entry",
        width: 2.4,
        mountHeight: 1.12,
      },
    ],
  },
};

/** Flush guard and sill planter, below the head of the existing window aperture. */
export const DOMESTIC_WINDOW_MODULE: BuildingFrontageModule = {
  modelId: "building.residential-window",
  width: 0.74,
  mountHeight: 0.4,
};

/** Shared mail goes on a solid wall bay beside the entrance, never over an opening. */
export const MAILBOX_MODULE: BuildingFrontageModule = {
  modelId: "building.mailbox-bank",
  width: 0.62,
  mountHeight: 0.42,
};

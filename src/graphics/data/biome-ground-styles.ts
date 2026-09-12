import type { BiomeId } from "../../content/model/biome-id";
import type { BiomeGroundStyle } from "../model/biome-ground-style";

/** Regional ground palettes, shared by flat ground and hillsides through the terrain shader. */
export const BIOME_GROUND_STYLES: Readonly<Record<BiomeId, BiomeGroundStyle>> =
  {
    temperate: {},
    snowy: {},
    desert: {},
    coastal: {},
    tropical: { grass: 0x426b42, dirt: 0x81503c },
    savanna: { grass: 0xb0a15a, dirt: 0x99664a, sand: 0xcbb17a },
    steppe: { grass: 0x99916b, dirt: 0x87745b },
    mediterranean: { grass: 0x85834c, dirt: 0x957052, rock: 0xa19a85 },
    taiga: { grass: 0x4b6352, dirt: 0x62523e, rock: 0x747b78 },
    tundra: { grass: 0x8b8170, rock: 0x81878a, snow: 0xdde5e8 },
    alpine: { grass: 0x72805c, rock: 0x8b9094 },
    wetland: { grass: 0x61794c, dirt: 0x514a39 },
  };

# Earth's environments

The campaign now spans **12 biomes, 17 regions and 51 cities**. Biomes change
terrain relief, ground colour, vegetation density, cover distribution, building
mix and waterways. They use the existing building and vegetation kits; Lagos,
Perth and Johannesburg retain their local place profiles.

| Environment | Battlefield character | Example locations |
|---|---|---|
| Temperate | Green hills and mixed woodland | Vancouver, London, New York |
| Snowy | Snowfields, rock and conifers | Longyearbyen |
| Desert | Sand, exposed ridges and boulder clusters | Cairo, Karachi, Alice Springs |
| Coastal | Sandy shore constraining one side of the map | Perth, Sydney, Auckland |
| Tropical rainforest | Red earth and dense broadleaf/palm clusters | Manaus, Lagos, Singapore |
| Savanna | Golden grass, dry soil, scattered trees and rocky cover | Nairobi, Johannesburg, Delhi |
| Steppe | Gentle open grassland with sparse cover | Ulaanbaatar, Tehran, Buenos Aires |
| Mediterranean scrub | Dry hills, pale stone and small pine groves | Rome, Athens, Los Angeles |
| Taiga | Dense conifer clusters on cool forest ground | Anchorage, Yellowknife, Novosibirsk |
| Tundra | Treeless ground, rock and lingering snow | Reykjavík, Tromsø |
| Alpine | High rocky relief, snow patches and sparse pines | Quito, Bogotá, Almaty |
| Wetlands | Low muddy banks and tropical planting beside a waterway | Bangkok, Iquitos |

These are representative battle environments around a location, rather than a
seasonal climate simulation. Region defaults cover broad areas; a city's local
biome takes precedence when generating a new mission. City intel and mission
briefings show the environment, and the Map Lab offers every biome by name.

New northern, Amazonian, Andean and Mediterranean regions connect to the existing
spread network. Alice Springs adds the Australian interior to Oceania. Every city
remains reachable, and each new region has routes to the existing world.

Save version 19 expands existing campaigns using frozen geography. Existing city
infestation, day, credits, roster, installations and spread cooldowns remain.
New cities begin uninfested, following the normal Earth seed rules. Existing
mission offers retain their original recipes, and an active mission retains its
frozen battlefield. Custom maps keep their own geography. The larger network
changes campaign balance: there are more locations to defend and more spread
routes; no combat or economy tuning changes accompany this content expansion.

For visual review, run `CAPTURE=1 pnpm test:e2e e2e/biome-preview.spec.ts`.
The screenshots are written to Playwright's test output directories. The normal
generation sweep covers every biome, settlement scale and map size; browser tests
also load the actual models and terrain shaders for every new environment.

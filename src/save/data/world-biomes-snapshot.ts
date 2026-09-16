import type { City } from "../../overworld/model/city";
import type { Region } from "../../overworld/model/region";

/** A city as v19 saved it: `population` arrived at v24 (#1154) and is filled by that step. */
export type V19City = Omit<City, "population">;

/** The v19 map shape: today's regions, cities without their v24 population. */
export interface WorldBiomesSnapshot {
  readonly regions: readonly Region[];
  readonly cities: readonly V19City[];
}

/** Frozen v19 geography. Never edit: old saves must migrate identically after future content updates. */
// prettier-ignore
export const WORLD_BIOMES_SNAPSHOT: WorldBiomesSnapshot = {
  regions: [
    {"id":"north-america-west","name":"North America West","biome":"coastal","cityIds":["vancouver","san-francisco","los-angeles"],"neighbourRegionIds":["boreal-north-america","north-america-east","east-asia","latin-america"],"layout":{"x":0.16316666666666665,"y":0.2757407407407407}},
    {"id":"north-america-east","name":"North America East","biome":"temperate","cityIds":["toronto","chicago","new-york"],"neighbourRegionIds":["boreal-north-america","north-america-west","latin-america","arctic-north-atlantic","western-europe"],"layout":{"x":0.2768333333333333,"y":0.2662222222222222}},
    {"id":"latin-america","name":"Latin America","biome":"temperate","cityIds":["mexico-city","bogota","sao-paulo","buenos-aires"],"neighbourRegionIds":["north-america-west","north-america-east","amazon-basin","andes-pacific","sub-saharan-africa"],"layout":{"x":0.3067986111111112,"y":0.5472361111111111}},
    {"id":"western-europe","name":"Western Europe","biome":"temperate","cityIds":["london","paris","berlin"],"neighbourRegionIds":["arctic-north-atlantic","north-america-east","sub-saharan-africa","eastern-europe","mediterranean-basin","middle-east"],"layout":{"x":0.514462962962963,"y":0.21687037037037038}},
    {"id":"eastern-europe","name":"Eastern Europe","biome":"temperate","cityIds":["stockholm","warsaw","moscow"],"neighbourRegionIds":["arctic-north-atlantic","western-europe","middle-east","north-asia"],"layout":{"x":0.5710185185185185,"y":0.19014814814814818}},
    {"id":"middle-east","name":"Middle East","biome":"desert","cityIds":["istanbul","cairo","tehran"],"neighbourRegionIds":["mediterranean-basin","western-europe","sub-saharan-africa","eastern-europe","south-asia","north-asia"],"layout":{"x":0.6033425925925926,"y":0.30233333333333334}},
    {"id":"sub-saharan-africa","name":"Sub-Saharan Africa","biome":"savanna","cityIds":["lagos","nairobi","johannesburg"],"neighbourRegionIds":["latin-america","western-europe","middle-east","south-asia"],"layout":{"x":0.5631944444444446,"y":0.5388333333333333}},
    {"id":"south-asia","name":"South Asia","biome":"savanna","cityIds":["karachi","delhi","mumbai"],"neighbourRegionIds":["middle-east","southeast-asia","sub-saharan-africa"],"layout":{"x":0.7010185185185186,"y":0.36564814814814817}},
    {"id":"north-asia","name":"North Asia","biome":"steppe","cityIds":["novosibirsk","almaty","ulaanbaatar"],"neighbourRegionIds":["eastern-europe","middle-east","east-asia"],"layout":{"x":0.7469629629629629,"y":0.2293333333333333}},
    {"id":"east-asia","name":"East Asia","biome":"temperate","cityIds":["beijing","seoul","tokyo"],"neighbourRegionIds":["north-asia","southeast-asia","oceania","north-america-west"],"layout":{"x":0.8546944444444445,"y":0.2904629629629629}},
    {"id":"southeast-asia","name":"Southeast Asia","biome":"wetland","cityIds":["bangkok","singapore","jakarta"],"neighbourRegionIds":["south-asia","east-asia","oceania"],"layout":{"x":0.7881203703703704,"y":0.4835185185185185}},
    {"id":"oceania","name":"Oceania","biome":"coastal","cityIds":["alice-springs","perth","sydney","auckland"],"neighbourRegionIds":["southeast-asia","east-asia"],"layout":{"x":0.8997986111111111,"y":0.6755138888888889}},
    {"id":"boreal-north-america","name":"Boreal North America","biome":"taiga","cityIds":["anchorage","yellowknife"],"neighbourRegionIds":["north-america-west","north-america-east"],"layout":{"x":0.13294444444444445,"y":0.1564722222222222}},
    {"id":"arctic-north-atlantic","name":"Arctic North Atlantic","biome":"tundra","cityIds":["reykjavik","tromso","longyearbyen"],"neighbourRegionIds":["north-america-east","western-europe","eastern-europe"],"layout":{"x":0.5117314814814815,"y":0.10737037037037034}},
    {"id":"amazon-basin","name":"Amazon Basin","biome":"tropical","cityIds":["manaus","iquitos"],"neighbourRegionIds":["latin-america"],"layout":{"x":0.31490277777777775,"y":0.5190833333333333}},
    {"id":"andes-pacific","name":"Andes and Pacific","biome":"alpine","cityIds":["quito","lima","santiago"],"neighbourRegionIds":["latin-america"],"layout":{"x":0.2905740740740741,"y":0.5845925925925927}},
    {"id":"mediterranean-basin","name":"Mediterranean Basin","biome":"mediterranean","cityIds":["lisbon","rome","athens"],"neighbourRegionIds":["western-europe","middle-east"],"layout":{"x":0.5250833333333333,"y":0.28037037037037044}},
  ],
  cities: [
    {"id":"vancouver","name":"Vancouver","regionId":"north-america-west","infestation":0,"scale":"city","biome":"temperate","neighbourIds":["anchorage","san-francisco","toronto"],"layout":{"x":0.15799999999999997,"y":0.2262222222222222}},
    {"id":"san-francisco","name":"San Francisco","regionId":"north-america-west","infestation":0,"scale":"city","biome":"mediterranean","neighbourIds":["vancouver","los-angeles","tokyo"],"layout":{"x":0.15994444444444444,"y":0.29016666666666663}},
    {"id":"los-angeles","name":"Los Angeles","regionId":"north-america-west","infestation":0,"scale":"city","biome":"mediterranean","neighbourIds":["san-francisco","chicago","mexico-city"],"layout":{"x":0.17155555555555557,"y":0.31083333333333335}},
    {"id":"toronto","name":"Toronto","regionId":"north-america-east","infestation":0,"scale":"city","neighbourIds":["yellowknife","chicago","new-york","vancouver"],"layout":{"x":0.2795,"y":0.2575}},
    {"id":"chicago","name":"Chicago","regionId":"north-america-east","infestation":0,"scale":"city","neighbourIds":["toronto","new-york","los-angeles","mexico-city"],"layout":{"x":0.25658333333333333,"y":0.2673333333333333}},
    {"id":"new-york","name":"New York","regionId":"north-america-east","infestation":0,"scale":"city","neighbourIds":["reykjavik","toronto","chicago","london"],"layout":{"x":0.29441666666666666,"y":0.2738333333333333}},
    {"id":"mexico-city","name":"Mexico City","regionId":"latin-america","infestation":0,"scale":"city","biome":"alpine","neighbourIds":["bogota","los-angeles","chicago"],"layout":{"x":0.2246388888888889,"y":0.3920555555555555}},
    {"id":"bogota","name":"Bogotá","regionId":"latin-america","infestation":0,"scale":"city","biome":"alpine","neighbourIds":["manaus","quito","mexico-city","sao-paulo"],"layout":{"x":0.29425,"y":0.4738333333333334}},
    {"id":"sao-paulo","name":"São Paulo","regionId":"latin-america","infestation":0,"scale":"city","biome":"tropical","neighbourIds":["iquitos","bogota","buenos-aires","lagos"],"layout":{"x":0.37047222222222226,"y":0.6308333333333334}},
    {"id":"buenos-aires","name":"Buenos Aires","regionId":"latin-america","infestation":0,"scale":"city","biome":"steppe","neighbourIds":["santiago","sao-paulo"],"layout":{"x":0.3378333333333333,"y":0.6922222222222222}},
    {"id":"london","name":"London","regionId":"western-europe","infestation":0,"scale":"city","neighbourIds":["reykjavik","paris","new-york","lagos","stockholm"],"layout":{"x":0.4996388888888889,"y":0.21383333333333335}},
    {"id":"paris","name":"Paris","regionId":"western-europe","infestation":0,"scale":"city","neighbourIds":["lisbon","london","berlin"],"layout":{"x":0.5065277777777778,"y":0.22855555555555557}},
    {"id":"berlin","name":"Berlin","regionId":"western-europe","infestation":0,"scale":"city","neighbourIds":["paris","warsaw","istanbul"],"layout":{"x":0.5372222222222223,"y":0.2082222222222222}},
    {"id":"stockholm","name":"Stockholm","regionId":"eastern-europe","infestation":0,"scale":"city","biome":"taiga","neighbourIds":["tromso","warsaw","moscow","london"],"layout":{"x":0.5501944444444444,"y":0.1703888888888889}},
    {"id":"warsaw","name":"Warsaw","regionId":"eastern-europe","infestation":0,"scale":"city","neighbourIds":["stockholm","moscow","berlin"],"layout":{"x":0.5583611111111111,"y":0.20983333333333334}},
    {"id":"moscow","name":"Moscow","regionId":"eastern-europe","infestation":0,"scale":"city","neighbourIds":["warsaw","stockholm","tehran","novosibirsk"],"layout":{"x":0.6045,"y":0.19022222222222224}},
    {"id":"istanbul","name":"Istanbul","regionId":"middle-east","infestation":0,"scale":"city","biome":"mediterranean","neighbourIds":["athens","cairo","tehran","berlin"],"layout":{"x":0.5805,"y":0.27216666666666667}},
    {"id":"cairo","name":"Cairo","regionId":"middle-east","infestation":0,"scale":"city","neighbourIds":["rome","istanbul","nairobi"],"layout":{"x":0.5867777777777778,"y":0.33311111111111114}},
    {"id":"tehran","name":"Tehran","regionId":"middle-east","infestation":0,"scale":"city","biome":"steppe","neighbourIds":["istanbul","moscow","karachi","almaty"],"layout":{"x":0.6427499999999999,"y":0.3017222222222222}},
    {"id":"lagos","name":"Lagos","regionId":"sub-saharan-africa","infestation":0,"scale":"city","biome":"tropical","neighbourIds":["nairobi","johannesburg","sao-paulo","london"],"layout":{"x":0.5093888888888889,"y":0.4637777777777778}},
    {"id":"nairobi","name":"Nairobi","regionId":"sub-saharan-africa","infestation":0,"scale":"city","neighbourIds":["lagos","johannesburg","cairo","mumbai"],"layout":{"x":0.6022777777777778,"y":0.5071666666666667}},
    {"id":"johannesburg","name":"Johannesburg","regionId":"sub-saharan-africa","infestation":0,"scale":"city","neighbourIds":["nairobi","lagos"],"layout":{"x":0.5779166666666667,"y":0.6455555555555555}},
    {"id":"karachi","name":"Karachi","regionId":"south-asia","infestation":0,"scale":"city","biome":"desert","neighbourIds":["delhi","mumbai","tehran"],"layout":{"x":0.6861388888888889,"y":0.36188888888888887}},
    {"id":"delhi","name":"Delhi","regionId":"south-asia","infestation":0,"scale":"city","neighbourIds":["karachi","mumbai","bangkok"],"layout":{"x":0.7144722222222222,"y":0.34105555555555556}},
    {"id":"mumbai","name":"Mumbai","regionId":"south-asia","infestation":0,"scale":"city","biome":"tropical","neighbourIds":["karachi","delhi","nairobi"],"layout":{"x":0.7024444444444444,"y":0.394}},
    {"id":"novosibirsk","name":"Novosibirsk","regionId":"north-asia","infestation":0,"scale":"town","biome":"taiga","neighbourIds":["almaty","ulaanbaatar","moscow"],"layout":{"x":0.7303333333333334,"y":0.19427777777777777}},
    {"id":"almaty","name":"Almaty","regionId":"north-asia","infestation":0,"scale":"town","biome":"alpine","neighbourIds":["novosibirsk","tehran"],"layout":{"x":0.7135833333333333,"y":0.2597777777777778}},
    {"id":"ulaanbaatar","name":"Ulaanbaatar","regionId":"north-asia","infestation":0,"scale":"town","neighbourIds":["novosibirsk","beijing"],"layout":{"x":0.7969722222222221,"y":0.23394444444444445}},
    {"id":"beijing","name":"Beijing","regionId":"east-asia","infestation":0,"scale":"city","neighbourIds":["seoul","ulaanbaatar","bangkok"],"layout":{"x":0.8233333333333333,"y":0.2783333333333333}},
    {"id":"seoul","name":"Seoul","regionId":"east-asia","infestation":0,"scale":"city","neighbourIds":["beijing","tokyo"],"layout":{"x":0.8527222222222223,"y":0.2912777777777778}},
    {"id":"tokyo","name":"Tokyo","regionId":"east-asia","infestation":0,"scale":"city","neighbourIds":["seoul","sydney","san-francisco"],"layout":{"x":0.8880277777777777,"y":0.30177777777777776}},
    {"id":"bangkok","name":"Bangkok","regionId":"southeast-asia","infestation":0,"scale":"city","neighbourIds":["singapore","delhi","beijing"],"layout":{"x":0.7791666666666667,"y":0.4235555555555555}},
    {"id":"singapore","name":"Singapore","regionId":"southeast-asia","infestation":0,"scale":"city","biome":"tropical","neighbourIds":["bangkok","jakarta"],"layout":{"x":0.7883888888888889,"y":0.49250000000000005}},
    {"id":"jakarta","name":"Jakarta","regionId":"southeast-asia","infestation":0,"scale":"city","biome":"tropical","neighbourIds":["singapore","perth"],"layout":{"x":0.7968055555555557,"y":0.5345}},
    {"id":"alice-springs","name":"Alice Springs","regionId":"oceania","infestation":0,"scale":"town","biome":"desert","neighbourIds":["perth","sydney"],"layout":{"x":0.8718888888888888,"y":0.6316666666666667}},
    {"id":"perth","name":"Perth","regionId":"oceania","infestation":0,"scale":"town","neighbourIds":["alice-springs","sydney","jakarta"],"layout":{"x":0.8218333333333334,"y":0.6775}},
    {"id":"sydney","name":"Sydney","regionId":"oceania","infestation":0,"scale":"city","neighbourIds":["alice-springs","perth","auckland","tokyo"],"layout":{"x":0.9200277777777779,"y":0.6881666666666667}},
    {"id":"auckland","name":"Auckland","regionId":"oceania","infestation":0,"scale":"town","neighbourIds":["sydney"],"layout":{"x":0.9854444444444445,"y":0.7047222222222221}},
    {"id":"anchorage","name":"Anchorage","regionId":"boreal-north-america","infestation":0,"scale":"town","neighbourIds":["yellowknife","vancouver"],"layout":{"x":0.0836111111111111,"y":0.15988888888888889}},
    {"id":"yellowknife","name":"Yellowknife","regionId":"boreal-north-america","infestation":0,"scale":"town","neighbourIds":["anchorage","toronto"],"layout":{"x":0.1822777777777778,"y":0.15305555555555553}},
    {"id":"reykjavik","name":"Reykjavík","regionId":"arctic-north-atlantic","infestation":0,"scale":"town","neighbourIds":["tromso","new-york","london"],"layout":{"x":0.4390555555555556,"y":0.14361111111111108}},
    {"id":"tromso","name":"Tromsø","regionId":"arctic-north-atlantic","infestation":0,"scale":"town","neighbourIds":["reykjavik","longyearbyen","stockholm"],"layout":{"x":0.5526666666666666,"y":0.11305555555555552}},
    {"id":"longyearbyen","name":"Longyearbyen","regionId":"arctic-north-atlantic","infestation":0,"scale":"rural","biome":"snowy","neighbourIds":["tromso"],"layout":{"x":0.5434722222222222,"y":0.06544444444444444}},
    {"id":"manaus","name":"Manaus","regionId":"amazon-basin","infestation":0,"scale":"city","neighbourIds":["iquitos","bogota"],"layout":{"x":0.33327777777777773,"y":0.5173333333333333}},
    {"id":"iquitos","name":"Iquitos","regionId":"amazon-basin","infestation":0,"scale":"city","biome":"wetland","neighbourIds":["manaus","sao-paulo"],"layout":{"x":0.2965277777777778,"y":0.5208333333333334}},
    {"id":"quito","name":"Quito","regionId":"andes-pacific","infestation":0,"scale":"city","neighbourIds":["lima","bogota"],"layout":{"x":0.28202777777777777,"y":0.501}},
    {"id":"lima","name":"Lima","regionId":"andes-pacific","infestation":0,"scale":"city","biome":"desert","neighbourIds":["quito","santiago"],"layout":{"x":0.286,"y":0.5669444444444445}},
    {"id":"santiago","name":"Santiago","regionId":"andes-pacific","infestation":0,"scale":"city","biome":"mediterranean","neighbourIds":["lima","buenos-aires"],"layout":{"x":0.30369444444444443,"y":0.6858333333333333}},
    {"id":"lisbon","name":"Lisbon","regionId":"mediterranean-basin","infestation":0,"scale":"city","neighbourIds":["rome","paris"],"layout":{"x":0.47461111111111115,"y":0.2848888888888889}},
    {"id":"rome","name":"Rome","regionId":"mediterranean-basin","infestation":0,"scale":"city","neighbourIds":["lisbon","athens","cairo"],"layout":{"x":0.5347222222222222,"y":0.26722222222222225}},
    {"id":"athens","name":"Athens","regionId":"mediterranean-basin","infestation":0,"scale":"city","neighbourIds":["rome","istanbul"],"layout":{"x":0.5659166666666666,"y":0.28900000000000003}},
  ],
};

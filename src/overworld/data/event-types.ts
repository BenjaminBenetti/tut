import type { EventType, EventTypeId } from "../model/event-type";

// ===========================================
// Event types (GDD §5.4)
// ===========================================
//
// M1 placeholder tuning for the four starter events. Rules of thumb:
//
//   • Credit amounts are sized against `economy/data/economy-tuning`
//     (starting bankroll 5000, full stipend 500 per day), so a choice
//     costs or pays roughly one to three days of income.
//   • Every choice is a real trade. Good events (research find) offer
//     cash now or a lasting benefit; bad events (spore shower) only offer
//     ways to soften the blow.
//   • Weights are relative draws for the generation tick (#71): with the
//     numbers below a city plea fires about a third of the time.
//   • City-attached types name the city with `CITY_NAME_TOKEN`
//     (`{city}`); presentation substitutes the real name.

/**
 * The four M1 event types, keyed by id so the compiler fails when an
 * `EventTypeId` has no definition. Pure data: the resolution service
 * (#70) interprets `effects` generically.
 */
export const EVENT_TYPES: Readonly<Record<EventTypeId, EventType>> = {
  "funding-review": {
    id: "funding-review",
    title: "Funding review",
    text: "The oversight council has opened a review of TDF's budget. How command handles the hearing sets the stipend for the coming fortnight.",
    requiresCity: false,
    weight: 3,
    choices: [
      {
        id: "request-advance",
        label: "Request an advance",
        effects: [
          { kind: "credits", amount: 1500 },
          { kind: "stipendMultiplier", factor: 0.5, days: 10 },
        ],
      },
      {
        id: "argue-expansion",
        label: "Argue for expansion",
        effects: [
          { kind: "credits", amount: -500 },
          { kind: "stipendMultiplier", factor: 1.5, days: 10 },
        ],
      },
      {
        id: "keep-heads-down",
        label: "Keep heads down",
        effects: [{ kind: "stipendMultiplier", factor: 1.1, days: 5 }],
      },
    ],
  },

  "research-find": {
    id: "research-find",
    title: "Research find",
    text: "A field team has recovered an intact hatcher carcass. R&D wants it on a slab; the defence contractors want it on a truck.",
    requiresCity: false,
    weight: 2,
    choices: [
      {
        id: "sell-specimen",
        label: "Sell it to the contractors",
        effects: [{ kind: "credits", amount: 1200 }],
      },
      {
        id: "study-specimen",
        label: "Fund an in-house study",
        effects: [
          { kind: "credits", amount: -800 },
          { kind: "threat", delta: -8 },
        ],
      },
    ],
  },

  "city-plea": {
    id: "city-plea",
    title: "Plea from {city}",
    text: "The administration of {city} is requesting TDF relief. Crawlers are in the outer districts and the local militia is out of ammunition.",
    requiresCity: true,
    weight: 4,
    choices: [
      {
        id: "send-relief",
        label: "Send relief convoys",
        effects: [
          { kind: "credits", amount: -600 },
          { kind: "cityInfestation", delta: -10 },
        ],
      },
      {
        id: "turn-away",
        label: "Turn them away",
        effects: [{ kind: "threat", delta: 3 }],
      },
    ],
  },

  "spore-shower": {
    id: "spore-shower",
    title: "Spore shower over {city}",
    text: "Eggs are falling on {city} and hatching in the open. Decontamination crews can be scrambled, at a price.",
    requiresCity: true,
    weight: 3,
    choices: [
      {
        id: "scramble-crews",
        label: "Scramble decontamination crews",
        effects: [
          { kind: "credits", amount: -400 },
          { kind: "cityInfestation", delta: 3 },
        ],
      },
      {
        id: "let-it-fall",
        label: "Let it fall",
        effects: [
          { kind: "cityInfestation", delta: 10 },
          { kind: "threat", delta: 2 },
        ],
      },
    ],
  },
};

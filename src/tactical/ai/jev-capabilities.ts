/** Repeated static facts belong in one shared definition, while identity and resources stay on each entity. */
const STATIC_FIELDS = new Set([
  "type",
  "kind",
  "movement_class",
  "max_hp",
  "armor",
  "footprint",
  "weapons",
  "equipment",
  "max_ap",
  "movement",
  "systems",
]);

/** Losslessly share identical capability records without pooling private per-unit resources. */
export function jevSharedCapabilities(
  entities: readonly Readonly<Record<string, unknown>>[],
): {
  readonly entities: readonly Readonly<Record<string, unknown>>[];
  readonly capabilities: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >;
} {
  const capabilities: Record<string, Readonly<Record<string, unknown>>> = {};
  const keys = new Map<string, string>();
  const records = entities.map((entity) => {
    const capability = Object.fromEntries(
      Object.entries(entity).filter(([key]) => STATIC_FIELDS.has(key)),
    );
    const signature = JSON.stringify(capability);
    let id = keys.get(signature);
    if (!id) {
      id = `capability-${String(keys.size + 1)}`;
      keys.set(signature, id);
      capabilities[id] = capability;
    }
    return {
      ...Object.fromEntries(
        Object.entries(entity).filter(([key]) => !STATIC_FIELDS.has(key)),
      ),
      capability_ref: id,
    };
  });
  return { entities: records, capabilities };
}

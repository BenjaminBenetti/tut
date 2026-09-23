/** Show a 17x17 crop with only walking, fog, actor, target and blocking edges; no cover/combat metadata. */
export function localMap(snapshot, goal) {
  const navigation = snapshot.state.navigation;
  const actor = snapshot.state.actor.position;
  const x0 = Math.max(0, actor.x - 8);
  const x1 = Math.min(navigation.width - 1, actor.x + 8);
  const z0 = Math.max(0, actor.z - 8);
  const z1 = Math.min(navigation.depth - 1, actor.z + 8);
  const layers = [];
  for (const layer of navigation.layers) {
    const rows = {};
    for (let z = z0; z <= z1; z++) {
      let row = "";
      for (let x = x0; x <= x1; x++) {
        const glyph =
          layer.rows?.[z]?.[x - (layer.row_start_x?.[z] ?? 0)] ?? "f";
        const marker = layer.markers.find(
          (item) => item.position.x === x && item.position.z === z,
        );
        const terrain = marker?.terrain ?? glyph;
        row +=
          actor.x === x && actor.z === z && actor.y === layer.y
            ? "@"
            : goal.position.x === x &&
                goal.position.z === z &&
                goal.position.y === layer.y
              ? "O"
              : terrain === "f"
                ? "?"
                : [".", ",", "~", "="].includes(terrain)
                  ? "."
                  : "#";
      }
      if (/[^?]/.test(row)) rows[z] = row;
    }
    if (!Object.keys(rows).length) continue;
    const walls = {};
    for (const kind of ["vertical", "horizontal"]) {
      const segments = {};
      for (let z = z0; z <= z1 + Number(kind === "horizontal"); z++) {
        const line = (layer.walls[kind]?.[z] ?? "")
          .padEnd(navigation.width + 1, " ")
          .slice(x0, x1 + 1 + Number(kind === "vertical"))
          .replace(/[sw]/gi, "#")
          .replace(/[^#]/g, " ")
          .trimEnd();
        if (line) segments[z] = line;
      }
      if (Object.keys(segments).length) walls[kind] = segments;
    }
    layers.push({ y: layer.y, rows, walls });
  }
  return {
    x_start: x0,
    legend: {
      ".": "walkable",
      "#": "blocked",
      "?": "unknown",
      "@": "actor",
      O: "objective",
    },
    coordinates:
      "Rows are z. Column index + x_start is x. y is elevation. Only nearby terrain is shown; outside the crop is omitted. Missing rows are unknown. Walk north z-1, south z+1, west x-1, east x+1.",
    wall_rules:
      "# in vertical walls at x,z blocks (x-1,z) to (x,z). # in horizontal walls at x,z blocks (x,z-1) to (x,z). Both wall maps share x_start; missing or space means no known blocking wall.",
    layers,
    connectors: navigation.connectors,
  };
}

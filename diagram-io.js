// diagram-io.js
// Pure (DOM-free) serialization for a block diagram, shared by the template
// library and the local save store. A diagram-state is the on-disk/localStorage
// shape; connections reference nodes by ARRAY INDEX so a load never depends on
// runtime-generated ids.
//
//   state = { version, nodes:[{type,x,y,value,label,direction?}],
//             connections:[{from,to,sign}] }
//
// Kept separate from canvas.js so it can be unit-tested in node without a DOM.

export const DIAGRAM_VERSION = 1;

// Live canvas nodes/connections -> portable state.
export function serializeDiagram(nodes, connections) {
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
  return {
    version: DIAGRAM_VERSION,
    nodes: nodes.map((n) => {
      const o = {
        type: n.type,
        x: Math.round(n.x),
        y: Math.round(n.y),
        value: n.value ?? "",
        label: n.label ?? "",
      };
      if (n.direction && n.direction !== "right") o.direction = n.direction;
      return o;
    }),
    connections: connections
      .filter((c) => indexOf.has(c.fromNode) && indexOf.has(c.toNode))
      .map((c) => ({
        from: indexOf.get(c.fromNode),
        to: indexOf.get(c.toNode),
        sign: c.sign ?? "",
      })),
  };
}

// Portable state -> live node/connection objects, using idGen(prefix) for ids.
// Returns plain objects (no DOM); the canvas assigns them and renders.
export function instantiateDiagram(state, idGen) {
  if (!state || !Array.isArray(state.nodes)) {
    throw new Error("invalid diagram state: missing nodes[]");
  }
  const nodes = state.nodes.map((n) => {
    const node = {
      id: idGen(n.type || "node"),
      type: n.type,
      x: n.x ?? 150,
      y: n.y ?? 150,
      value: n.value ?? "",
      label: n.label ?? "",
    };
    if (n.direction && n.direction !== "right") node.direction = n.direction;
    return node;
  });
  const connections = (state.connections || [])
    .filter((c) => nodes[c.from] && nodes[c.to])
    .map((c) => ({
      id: idGen("conn"),
      fromNode: nodes[c.from].id,
      toNode: nodes[c.to].id,
      sign: c.sign ?? "",
    }));
  return { nodes, connections };
}

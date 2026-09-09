const fs = require("node:fs");
const path = require("node:path");

const fixtureDir = path.join(__dirname, "fixtures/reroot_validation");
const families = [
  { name: "AT3G05360.1_RLP", tips: 291, outgroup: 2, depth: 10, supports: 288, stem: 0.891415 },
  { name: "AT1G73080.1_XI", tips: 206, outgroup: 49, depth: 3, supports: 203, stem: 0.325501 },
  { name: "AT5G20480.1_XII", tips: 180, outgroup: 5, depth: 5, supports: 177, stem: 0.686202 },
];

function tipNames(root) {
  const tips = [], stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.ch?.length) stack.push(...node.ch);
    else tips.push(node.name);
  }
  return tips.sort();
}

function signature(tips) { return JSON.stringify(tips); }

function readFixture(parse, family, kind) {
  return parse(fs.readFileSync(path.join(fixtureDir, `${family}.${kind}.nwk`), "utf8"));
}

function fixtureTarget(parse, family) {
  const tree = readFixture(parse, family, "input");
  const reference = readFixture(parse, family, "outgroup_ref");
  const allTips = new Set(tipNames(tree));
  const outgroup = reference.ch.map(tipNames).sort((a, b) => a.length - b.length)[0].filter(tip => allTips.has(tip));
  const want = signature(outgroup);
  const stack = [[tree, 0]];
  while (stack.length) {
    const [node, depth] = stack.pop();
    if (signature(tipNames(node)) === want) return { tree, target: node, outgroup, depth };
    for (const child of node.ch || []) stack.push([child, depth + 1]);
  }
  throw new Error(`Outgroup is not a descendant clade in ${family}`);
}

// Retain EVERY support representation for a split: both root children must
// agree. Summing length alone, or overwriting a duplicate key, hides bugs.
function edgeMap(root) {
  const tips = tipNames(root);
  const reference = tips[0];
  const map = new Map();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (node.ch) stack.push(...node.ch);
    if (node === root) continue;
    const descendants = tipNames(node);
    const set = new Set(descendants);
    const side = set.has(reference) ? tips.filter(tip => !set.has(tip)) : descendants;
    const key = signature(side);
    if (!map.has(key)) map.set(key, { length: 0, supports: [], size: Math.min(side.length, tips.length - side.length) });
    const edge = map.get(key);
    edge.length += node.bl || 0;
    // ete3 uses 1 when Newick omits support. Never reroot with ete3 here.
    edge.supports.push(node.sup ?? 1);
  }
  return map;
}

function checkReroot(source, result, outgroup) {
  const before = edgeMap(source), after = edgeMap(result);
  const sameSplits = before.size === after.size && [...before.keys()].every(key => after.has(key));
  const supports = sameSplits && [...before].every(([key, edge]) =>
    after.get(key).supports.every(support => support === edge.supports[0]));
  const lengths = sameSplits && [...before].every(([key, edge]) => Math.abs(after.get(key).length - edge.length) < 1e-9);
  const total = edges => [...edges.values()].reduce((sum, edge) => sum + edge.length, 0);
  const bifurcating = result.ch?.length === 2;
  const rootEdge = bifurcating && [...after.values()].find(edge => edge.supports.length === 2);
  return {
    tips: signature(tipNames(source)) === signature(tipNames(result)),
    topology: sameSplits,
    totalLength: Math.abs(total(before) - total(after)) < 1e-9,
    supports,
    lengths,
    rootEdge: Boolean(rootEdge) && lengths,
    outgroup: bifurcating && result.ch.some(child => signature(tipNames(child)) === signature([...outgroup].sort())),
    rootMetadata: result.sup == null && !result.name && (result.bl || 0) === 0,
  };
}

module.exports = { fixtureDir, families, readFixture, fixtureTarget, edgeMap, checkReroot, tipNames };

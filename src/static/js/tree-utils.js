import { state } from "./state.js";

export function getMotifColors(tipName) {
  const colors = [];
  for (const entry of state.motifList) {
    if (entry.tipNames.includes(tipName)) colors.push(entry.color);
  }
  return colors;
}

export function isNodeHidden(node) {
  if (!node.ch || node.ch.length === 0) return state.hiddenTips.has(node.name);
  return node.ch.every(child => isNodeHidden(child));
}

export function countLeaves(node) {
  if (isNodeHidden(node)) return 0;
  if (state.collapsedNodes.has(node.id) && node.ch) return 1;
  if (!node.ch || node.ch.length === 0) return 1;
  let total = 0;
  for (const child of node.ch) total += countLeaves(child);
  return total || 0;
}

export function countAllTips(node) {
  if (!node.ch) return 1;
  let total = 0;
  for (const child of node.ch) total += countAllTips(child);
  return total;
}

export function collectAllTipNames(node) {
  if (!node.ch || node.ch.length === 0) return [node.name];
  const names = [];
  for (const child of node.ch) names.push(...collectAllTipNames(child));
  return names;
}

export function deepCopyNode(node) {
  const copy = { ...node };
  if (node.ch) copy.ch = node.ch.map(deepCopyNode);
  return copy;
}

export function indexNodes(node, parent) {
  state.nodeById[node.id] = node;
  if (parent) state.parentMap[node.id] = parent;
  if (!node.ch || node.ch.length === 0) {
    state.tipByName[node.name] = node;
  } else {
    node.ch.forEach(child => indexNodes(child, node));
  }
}

/**
 * Reset the node/parent/tip indexes and rebuild them for `root`.
 * Every place that swaps in a new tree (load, reroot, subtree focus, undo)
 * needs the same three indexes rebuilt together, so they go through here.
 */
export function reindexTree(root) {
  state.nodeById = {};
  state.parentMap = {};
  state.tipByName = {};
  indexNodes(root);
}

export function getNodeColor(node, checkedSpecies) {
  if (node.name && node.sp && checkedSpecies.has(node.sp)) {
    return state.speciesColors[node.sp] || "#333";
  }
  return "#333";
}

export function findLCA(tipA, tipB) {
  const nodeA = state.tipByName[tipA];
  const nodeB = state.tipByName[tipB];
  if (!nodeA || !nodeB) return null;

  const ancestorsA = new Set();
  let current = nodeA;
  while (current) {
    ancestorsA.add(current.id);
    current = state.parentMap[current.id];
  }

  current = nodeB;
  while (current) {
    if (ancestorsA.has(current.id)) return current;
    current = state.parentMap[current.id];
  }
  return null;
}

export function patristicDistance(tipA, tipB) {
  const lca = findLCA(tipA, tipB);
  if (!lca) return null;

  function distToNode(tipName, targetId) {
    let current = state.tipByName[tipName];
    let dist = 0;
    while (current && current.id !== targetId) {
      dist += current.bl || 0;
      current = state.parentMap[current.id];
    }
    return dist;
  }

  return distToNode(tipA, lca.id) + distToNode(tipB, lca.id);
}

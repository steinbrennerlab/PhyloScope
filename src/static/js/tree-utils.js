import { state } from "./state.js";

export function getMotifColors(tipName) {
  return state.motifColorsByTip[tipName] || [];
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
  const cached = state.subtreeTipCount[node.id];
  if (cached != null && state.nodeById[node.id] === node) return cached;
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

export function indexNodes(node) {
  state.nodeById = {};
  state.parentMap = {};
  state.tipByName = {};
  state.subtreeTipCount = {};
  state.subtreeLeafRange = {};
  let leafIndex = 0;
  const traversal = [];
  const stack = [{ node, parent: null }];

  while (stack.length > 0) {
    const { node: current, parent: currentParent } = stack.pop();
    traversal.push(current);
    state.nodeById[current.id] = current;
    if (currentParent) state.parentMap[current.id] = currentParent;

    if (!current.ch || current.ch.length === 0) {
      state.tipByName[current.name] = current;
      state.subtreeLeafRange[current.id] = { start: leafIndex, end: leafIndex };
      leafIndex++;
      continue;
    }

    for (let i = current.ch.length - 1; i >= 0; i--) {
      stack.push({ node: current.ch[i], parent: current });
    }
  }

  for (let i = traversal.length - 1; i >= 0; i--) {
    const current = traversal[i];
    if (!current.ch || current.ch.length === 0) {
      state.subtreeTipCount[current.id] = 1;
      continue;
    }
    let tipCount = 0;
    current.ch.forEach(child => {
      tipCount += state.subtreeTipCount[child.id] || 0;
    });
    const firstRange = state.subtreeLeafRange[current.ch[0].id];
    const lastRange = state.subtreeLeafRange[current.ch[current.ch.length - 1].id];
    state.subtreeTipCount[current.id] = tipCount;
    state.subtreeLeafRange[current.id] = { start: firstRange.start, end: lastRange.end };
  }

  state.treeRevision++;
}

/** Rebuild node, parent, tip, and subtree metadata indexes for `root`. */
export function reindexTree(root) {
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

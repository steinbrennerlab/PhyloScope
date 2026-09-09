/**
 * Tree operations for PhyloScope standalone mode.
 * Ports of tree manipulation functions from app.py.
 */

import { collectAllTipNames } from "./tree-utils.js";

export const DEFAULT_SPECIES_INFER_PATTERN = "^([A-Za-z]{2}).*$";
export const DEFAULT_SPECIES_INFER_REPLACEMENT = "$1";

function compileSpeciesInferencePattern(pattern) {
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`Invalid species inference regex: ${error.message}`);
  }
}

/**
 * Assign ape/ggtree node numbers to every node of `root`.
 *
 * `ape::read.tree` numbers tips 1..Ntip in the order they appear in the Newick
 * string and internal nodes Ntip+1.. in preorder, root first. A single preorder
 * DFS in child order therefore yields both, drawn from two counters. (Our own
 * node ids come from parseNewick in postorder, so the two never coincide.)
 * Verified against ape 5.x: `(((A,B),C),(D,(E,F)));` gives tips A..F = 1..6,
 * root = 7, (A,B,C) = 8, (A,B) = 9, (D,E,F) = 10, (E,F) = 11.
 *
 * @param {object} root - Tree root node.
 * @returns {{ apeByNodeId: object, apeNodeIdByNumber: object, tipCount: number, maxNumber: number }}
 */
export function buildApeNodeNumbers(root) {
  const apeByNodeId = {};
  const apeNodeIdByNumber = {};
  if (!root) return { apeByNodeId, apeNodeIdByNumber, tipCount: 0, maxNumber: 0 };

  const tipCount = collectAllTipNames(root).length;
  let nextTip = 1;
  let nextInternal = tipCount + 1;
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    const isTip = !node.ch || node.ch.length === 0;
    const number = isTip ? nextTip++ : nextInternal++;
    apeByNodeId[node.id] = number;
    apeNodeIdByNumber[number] = node.id;
    if (node.ch) {
      for (let i = node.ch.length - 1; i >= 0; i--) stack.push(node.ch[i]);
    }
  }

  return { apeByNodeId, apeNodeIdByNumber, tipCount, maxNumber: nextInternal - 1 };
}

/**
 * Convert a tree node to Newick string (no trailing semicolon).
 */
export function nodeToNewick(node) {
  if (node.ch && node.ch.length > 0) {
    const childStrs = node.ch.map(c => nodeToNewick(c)).join(",");
    let s = `(${childStrs})`;
    if (node.sup != null) {
      s += String(node.sup);
    } else if (node.name) {
      s += quoteNewickLabel(node.name, true);
    }
    if (node.bl != null && node.bl !== 0) {
      s += `:${node.bl}`;
    }
    return s;
  }
  let s = quoteNewickLabel(node.name || "");
  if (node.bl != null && node.bl !== 0) {
    s += `:${node.bl}`;
  }
  return s;
}

function quoteNewickLabel(label, internal = false) {
  const text = String(label);
  // Quote numeric internal names to distinguish them from support values.
  return /[\s()[\],:;']/.test(text) || (internal && text !== "" && Number.isFinite(Number(text)))
    ? `'${text.replaceAll("'", "''")}'`
    : text;
}

/**
 * Find a node by its ID in the tree.
 */
export function findNodeById(node, targetId) {
  if (node.id === targetId) return node;
  if (node.ch) {
    for (const c of node.ch) {
      const result = findNodeById(c, targetId);
      if (result) return result;
    }
  }
  return null;
}

/**
 * Annotate tips with species and internal nodes with descendant species sets.
 * Modifies the tree in-place.
 */
export function annotateSpecies(node, tipToSpecies) {
  if (!node.ch || node.ch.length === 0) {
    const sp = tipToSpecies[node.name] || "unknown";
    node.sp = sp;
    return new Set([sp]);
  }
  const descSpecies = new Set();
  for (const child of node.ch) {
    for (const sp of annotateSpecies(child, tipToSpecies)) {
      descSpecies.add(sp);
    }
  }
  node.descendant_species = [...descSpecies].sort();
  return descSpecies;
}

/**
 * Build species-to-tips and tip-to-species maps from orthofinder FASTA file texts.
 * @param {object} treeData - Tree root node.
 * @param {Array<{name: string, text: string}>} orthoFiles - Array of { name, text }.
 * @returns {{ speciesToTips: object, tipToSpecies: object }}
 */
export function buildSpeciesMapFromFiles(treeData, orthoFiles) {
  const treeTips = new Set(collectAllTipNames(treeData));
  const speciesToTips = {};
  const tipToSpecies = {};

  const REF_SPECIES = {
    "Pvul218cds": "Pvul",
    "TAIR10cds": "TAIR",
    "Vung469cds": "Vung",
    "Zmarina_668_v3.1.cds_primaryTranscriptOnly": "Zmarina",
  };

  const sorted = [...orthoFiles].sort((a, b) => a.name.localeCompare(b.name));

  for (const file of sorted) {
    let fname = file.name;
    if (fname.endsWith(".fasta")) fname = fname.slice(0, -6);
    else if (fname.endsWith(".fa")) fname = fname.slice(0, -3);

    let species;
    if (fname.startsWith("new_genomes.")) {
      const parts = fname.replace("new_genomes.", "").split(".");
      species = parts[0];
    } else {
      species = REF_SPECIES[fname] || fname;
    }

    const headers = new Set();
    for (const line of file.text.split(/\r?\n/)) {
      if (line.startsWith(">")) {
        headers.add(line.substring(1).trim().split(/\s+/)[0]);
      }
    }

    const matchingTips = [...headers].filter(h => treeTips.has(h)).sort();
    if (matchingTips.length > 0) {
      speciesToTips[species] = matchingTips;
      for (const tip of matchingTips) {
        tipToSpecies[tip] = species;
      }
    }
  }

  return { speciesToTips, tipToSpecies };
}

/**
 * Build species-to-tips and tip-to-species maps by applying a regex rule to tip labels.
 * The regex is expected to match the full tip label; the replacement becomes the species label.
 * @param {object} treeData - Tree root node.
 * @param {{pattern?: string, replacement?: string}} options
 * @returns {{ speciesToTips: object, tipToSpecies: object }}
 */
export function buildSpeciesMapFromTipLabels(treeData, options = {}) {
  const pattern = options.pattern || DEFAULT_SPECIES_INFER_PATTERN;
  const replacement = options.replacement ?? DEFAULT_SPECIES_INFER_REPLACEMENT;
  const speciesRegex = compileSpeciesInferencePattern(pattern);

  const speciesToTips = {};
  const tipToSpecies = {};

  for (const tip of collectAllTipNames(treeData).sort()) {
    speciesRegex.lastIndex = 0;
    if (!speciesRegex.test(tip)) continue;

    speciesRegex.lastIndex = 0;
    const species = tip.replace(speciesRegex, replacement).trim();
    if (!species) continue;

    if (!speciesToTips[species]) speciesToTips[species] = [];
    speciesToTips[species].push(tip);
    tipToSpecies[tip] = species;
  }

  for (const tips of Object.values(speciesToTips)) {
    tips.sort();
  }

  return { speciesToTips, tipToSpecies };
}

/**
 * Find nodes whose descendants include all required species and no excluded species.
 */
export function findNodesWithSpecies(node, requiredSpecies, excludedSpecies) {
  const required = requiredSpecies instanceof Set ? requiredSpecies : new Set(requiredSpecies);
  const excluded = excludedSpecies instanceof Set ? excludedSpecies : new Set(excludedSpecies || []);
  const result = [];

  function getDescSpecies(n) {
    if (!n.ch || n.ch.length === 0) {
      return new Set([n.sp || "unknown"]);
    }
    return new Set(n.descendant_species || []);
  }

  function walk(n) {
    const ds = getDescSpecies(n);
    let hasAll = true;
    for (const sp of required) {
      if (!ds.has(sp)) { hasAll = false; break; }
    }
    if (hasAll) {
      let hasExcluded = false;
      for (const sp of excluded) {
        if (ds.has(sp)) { hasExcluded = true; break; }
      }
      if (!hasExcluded) result.push(n.id);
    }
    if (n.ch) {
      for (const c of n.ch) walk(c);
    }
  }

  walk(node);
  return result;
}

/**
 * Root on the incoming edge of the selected tip or clade, keeping that clade
 * intact. Length and support belong to undirected edges, not their endpoints.
 * Existing node IDs survive except when suppressing an obsolete degree-two root.
 * Mutates the tree and returns a new root, or null when the target is missing.
 */
export function rerootTree(treeData, targetId) {
  if (treeData.id === targetId) return treeData;

  const adjacency = new Map();
  const parents = new Map();
  const stack = [treeData];
  let target = null;
  let maxId = treeData.id;
  function neighbors(node) {
    if (!adjacency.has(node)) adjacency.set(node, []);
    return adjacency.get(node);
  }
  function connect(a, b, edge) {
    neighbors(a).push({ node: b, edge });
    neighbors(b).push({ node: a, edge });
  }
  function disconnect(a, b) {
    adjacency.set(a, neighbors(a).filter(link => link.node !== b));
    adjacency.set(b, neighbors(b).filter(link => link.node !== a));
  }
  while (stack.length) {
    const node = stack.pop();
    maxId = Math.max(maxId, node.id);
    if (node.id === targetId) target = node;
    neighbors(node);
    for (const child of node.ch || []) {
      connect(node, child, { length: child.bl || 0, support: child.sup });
      parents.set(child, node);
      stack.push(child);
    }
  }
  if (!target) return null;
  let opposite = parents.get(target);

  // Drop dangling unary root stems: they have no nonempty bipartition and
  // would otherwise turn into extra tips when their direction is reversed.
  let oldRoot = treeData;
  while (neighbors(oldRoot).length === 1) {
    if (oldRoot === target) return treeData; // The selected clade is the whole tree.
    const next = neighbors(oldRoot)[0].node;
    disconnect(oldRoot, next);
    adjacency.delete(oldRoot);
    oldRoot = next;
  }
  if (oldRoot === target && !adjacency.has(opposite)) return treeData;

  // A degree-two root represents one edge in two pieces. Suppress it before
  // selecting/splitting an edge again, including repeated re-rooting.
  if (neighbors(oldRoot).length === 2) {
    const [a, b] = neighbors(oldRoot);
    const supportA = a.edge.support;
    const supportB = b.edge.support;
    if (supportA != null && supportB != null && supportA !== supportB) {
      throw new Error("Cannot re-root: the two sides of the existing root edge have conflicting support values.");
    }
    const edge = {
      length: a.edge.length + b.edge.length,
      support: supportA ?? supportB,
    };
    disconnect(oldRoot, a.node);
    disconnect(oldRoot, b.node);
    adjacency.delete(oldRoot);
    connect(a.node, b.node, edge);
    if (opposite === oldRoot) opposite = a.node === target ? b.node : a.node;
  }

  const link = neighbors(target).find(item => item.node === opposite);
  if (!link) return treeData; // No incoming edge for a whole-tree selection.
  const root = { id: maxId + 1, bl: 0 };
  const firstHalf = link.edge.length / 2;
  disconnect(target, opposite);
  connect(root, target, { length: firstHalf, support: link.edge.support });
  connect(root, opposite, { length: link.edge.length - firstHalf, support: link.edge.support });

  // Orient each edge away from the new root. Missing support must also be
  // transferred (delete the old value), or old-root labels can leak onto edges.
  const pending = [{ node: root, parent: null, edge: null }];
  while (pending.length) {
    const { node, parent, edge } = pending.pop();
    delete node.sup;
    node.bl = edge ? edge.length : 0;
    if (edge?.support != null) node.sup = edge.support;
    const children = neighbors(node).filter(item => item.node !== parent);
    if (children.length) node.ch = children.map(item => item.node);
    else delete node.ch;
    for (const child of children) pending.push({ node: child.node, parent: node, edge: child.edge });
  }
  return root;
}

/**
 * Map 1-indexed reference residue positions to alignment column indices.
 */
export function refPosToColumns(refSeqGapped, refStart, refEnd) {
  let colStart = null;
  let colEnd = null;
  let residuePos = 0;
  for (let colIdx = 0; colIdx < refSeqGapped.length; colIdx++) {
    if (refSeqGapped[colIdx] !== "-") {
      residuePos++;
      if (residuePos === refStart && colStart === null) {
        colStart = colIdx;
      }
      if (residuePos === refEnd) {
        colEnd = colIdx + 1;
        break;
      }
    }
  }
  return [colStart, colEnd];
}

/**
 * Compute pairwise sequence identity between two gapped sequences.
 */
// BLOSUM62 positive-score pairs (similarity groups)
const BLOSUM62_SIMILAR = new Set([
  "AG","AS","DE","DN","EK","EQ","FW","FY","HN","HQ","HY",
  "IL","IM","IV","KQ","KR","LM","LV","MV","NQ","NS","ST","WY",
]);

function areSimilar(a, b) {
  if (a === b) return true;
  const pair = a < b ? a + b : b + a;
  return BLOSUM62_SIMILAR.has(pair);
}

export function computePairwiseIdentity(seq1, seq2) {
  if (seq1.length !== seq2.length) {
    return { error: "Sequences have different lengths in alignment" };
  }
  let identical = 0;
  let similar = 0;
  let aligned = 0;
  for (let i = 0; i < seq1.length; i++) {
    const a = seq1[i], b = seq2[i];
    if (a === "-" || b === "-") continue;
    aligned++;
    if (a === b) { identical++; similar++; }
    else if (areSimilar(a.toUpperCase(), b.toUpperCase())) { similar++; }
  }
  return {
    identity: aligned > 0 ? identical / aligned : 0,
    similarity: aligned > 0 ? similar / aligned : 0,
    identical_positions: identical,
    similar_positions: similar,
    aligned_length: aligned,
  };
}

/**
 * Build a FASTA string for export.
 * @param {string[]} tips - Tip names to include.
 * @param {object} proteinSeqs - Map of tip name -> gapped sequence.
 * @param {number|null} sliceStart - Start column (0-indexed), or null for full.
 * @param {number|null} sliceEnd - End column (0-indexed exclusive), or null for full.
 * @returns {string} FASTA content.
 */
export function buildExportFasta(tips, proteinSeqs, sliceStart, sliceEnd) {
  const lines = [];
  for (const tip of tips) {
    const seq = proteinSeqs[tip];
    if (!seq) continue;
    const sliced = (sliceStart != null && sliceEnd != null) ? seq.slice(sliceStart, sliceEnd) : seq;
    lines.push(`>${tip}`);
    for (let i = 0; i < sliced.length; i += 80) {
      lines.push(sliced.slice(i, i + 80));
    }
  }
  return lines.join("\n") + "\n";
}

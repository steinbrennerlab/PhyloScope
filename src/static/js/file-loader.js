/**
 * File loading infrastructure for PhyloScope standalone mode.
 * Handles folder/file picker input, detects file types, builds workspace.
 */

import { parseNewick, parseFastaText } from "./parsers.js";
import {
  annotateSpecies,
  buildSpeciesMapFromFiles,
  buildSpeciesMapFromTipLabels,
  DEFAULT_SPECIES_INFER_PATTERN,
  DEFAULT_SPECIES_INFER_REPLACEMENT,
} from "./tree-ops.js";

function isFastaFileName(name) {
  const lower = name.toLowerCase();
  return lower.endsWith(".fa") || lower.endsWith(".fasta");
}

function isJsonFileName(name) {
  return name.toLowerCase().endsWith(".json");
}

function isPreferredAlignmentFileName(name) {
  return name.toLowerCase().endsWith(".aa.fa");
}

function getFileLabel(file) {
  return String(file?.webkitRelativePath || file?.name || "").replace(/\\/g, "/");
}

function compareAlignmentFiles(a, b) {
  const aPriority = isPreferredAlignmentFileName(a.name) ? 0 : 1;
  const bPriority = isPreferredAlignmentFileName(b.name) ? 0 : 1;
  if (aPriority !== bPriority) return aPriority - bPriority;
  return a.name.localeCompare(b.name);
}

function isSameSelectedFile(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.name === b.name && (a.webkitRelativePath || "") === (b.webkitRelativePath || "");
}

function normalizeSpeciesConfig(speciesConfig = {}) {
  return {
    mode: speciesConfig.mode === "tip-labels" ? "tip-labels" : "orthofinder",
    pattern: speciesConfig.pattern || DEFAULT_SPECIES_INFER_PATTERN,
    replacement: speciesConfig.replacement ?? DEFAULT_SPECIES_INFER_REPLACEMENT,
  };
}

function buildCladeSignature(leaves) {
  return leaves.join("\u001f");
}

function normalizeLeaves(leaves) {
  if (!Array.isArray(leaves)) return [];
  return [...new Set(leaves.map(value => String(value).trim()).filter(Boolean))].sort();
}

function parseExperimentalAnalysisText(name, text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Experimental JSON parse failed for ${name}: ${error.message}`);
  }

  if (!parsed || !Array.isArray(parsed.splits)) {
    throw new Error(`Experimental JSON ${name} is missing a top-level "splits" array`);
  }

  const clades = [];
  parsed.splits.forEach((split, index) => {
    const splitId = split?.split_id || `split_${String(index + 1).padStart(4, "0")}`;
    [
      ["slow", split?.slow_leaves],
      ["fast", split?.fast_leaves],
    ].forEach(([side, leaves]) => {
      const normalizedLeaves = normalizeLeaves(leaves);
      if (normalizedLeaves.length === 0) return;
      clades.push({
        key: `${splitId}:${side}`,
        splitId,
        side,
        tipCount: normalizedLeaves.length,
        signature: buildCladeSignature(normalizedLeaves),
        leaves: normalizedLeaves,
      });
    });
  });

  if (clades.length === 0) {
    throw new Error(`Experimental JSON ${name} did not contain any usable slow/fast leaf lists`);
  }

  return {
    name,
    splitCount: parsed.splits.length,
    cladeCount: clades.length,
    clades,
  };
}

function resolveSpeciesMapping(treeData, orthoTexts, speciesConfig) {
  if (speciesConfig.mode === "tip-labels") {
    return buildSpeciesMapFromTipLabels(treeData, speciesConfig);
  }
  if (orthoTexts.length > 0) {
    return buildSpeciesMapFromFiles(treeData, orthoTexts);
  }
  return { speciesToTips: {}, tipToSpecies: {} };
}

/**
 * Detect relevant files from a FileList/array of File objects.
 * @param {File[]} files - Array of File objects from folder or file picker.
 * @returns {object} Categorized file lists.
 */
export function detectFiles(files) {
  const nwkFiles = [];
  const aaFiles = [];
  const orthoFiles = [];
  const datasetFiles = [];
  const analysisFiles = [];

  const hasRelativePaths = Array.from(files).some(
    f => f.webkitRelativePath && f.webkitRelativePath.includes("/")
  );

  for (const file of files) {
    const relPath = file.webkitRelativePath || file.name;
    const name = file.name;

    if (hasRelativePaths) {
      if (relPath.includes("orthofinder-input/") || relPath.includes("orthofinder-input\\")) {
        if (isFastaFileName(name)) {
          orthoFiles.push(file);
        }
        continue;
      }
      if ((relPath.includes("dataset/") || relPath.includes("dataset\\")) && name.endsWith(".txt")) {
        if (!name.endsWith(":Zone.Identifier")) {
          datasetFiles.push(file);
        }
        continue;
      }
    }

    if (name.endsWith(".nwk")) {
      nwkFiles.push(file);
    } else if (isFastaFileName(name)) {
      aaFiles.push(file);
      if (!hasRelativePaths) {
        orthoFiles.push(file);
      }
    } else if (isJsonFileName(name)) {
      analysisFiles.push(file);
    } else if (!hasRelativePaths && name.endsWith(".txt") && !name.endsWith(":Zone.Identifier")) {
      datasetFiles.push(file);
    }
  }

  return {
    nwkFiles: nwkFiles.sort((a, b) => a.name.localeCompare(b.name)),
    aaFiles: aaFiles.sort(compareAlignmentFiles),
    orthoFiles: orthoFiles.sort((a, b) => a.name.localeCompare(b.name)),
    datasetFiles: datasetFiles.sort((a, b) => a.name.localeCompare(b.name)),
    analysisFiles: analysisFiles.sort((a, b) => getFileLabel(a).localeCompare(getFileLabel(b))),
  };
}

/**
 * Load data from the selected files, building the full workspace.
 * @param {object} opts
 * @param {File} opts.nwkFile - The Newick tree file.
 * @param {File|null} opts.aaFile - The protein alignment file (optional).
 * @param {File[]} opts.orthoFiles - Orthofinder species FASTA files.
 * @param {File[]} opts.datasetFiles - Dataset .txt files.
 * @param {File|null} opts.experimentalFile - Experimental analysis JSON file.
 * @param {{mode?: string, pattern?: string, replacement?: string}} opts.speciesConfig
 * @returns {Promise<{ success: boolean, error?: string, result?: object }>}
 */
export async function loadFromFiles({ nwkFile, aaFile, orthoFiles, datasetFiles, experimentalFile, speciesConfig }) {
  if (!nwkFile) return { success: false, error: "No tree file (.nwk) selected." };

  const nwkText = await nwkFile.text();
  const aaText = aaFile ? await aaFile.text() : null;
  const experimentalText = experimentalFile ? await experimentalFile.text() : null;
  const experimentalName = experimentalFile ? getFileLabel(experimentalFile) : null;
  const filteredOrthoFiles = (orthoFiles || []).filter(f => !isSameSelectedFile(f, aaFile));
  const orthoTexts = filteredOrthoFiles.length > 0
    ? await Promise.all(filteredOrthoFiles.map(async f => ({ name: f.name, text: await f.text() })))
    : [];
  const datasetTexts = await Promise.all(
    (datasetFiles || []).map(async f => ({ name: f.name, text: await f.text() }))
  );

  const treeData = parseNewick(nwkText);
  const gene = nwkFile.name.replace(/\.nwk$/, "");
  const resolvedSpeciesConfig = normalizeSpeciesConfig(speciesConfig);
  let experimentalAnalysis = null;
  if (experimentalText) {
    try {
      experimentalAnalysis = parseExperimentalAnalysisText(experimentalName, experimentalText);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  let proteinSeqs = null;
  let proteinSeqsUngapped = null;
  if (aaText) {
    proteinSeqs = parseFastaText(aaText);
    proteinSeqsUngapped = {};
    for (const [k, v] of Object.entries(proteinSeqs)) {
      proteinSeqsUngapped[k] = v.replace(/-/g, "");
    }
  }

  let speciesToTips = {};
  let tipToSpecies = {};
  try {
    const mapping = resolveSpeciesMapping(treeData, orthoTexts, resolvedSpeciesConfig);
    speciesToTips = mapping.speciesToTips;
    tipToSpecies = mapping.tipToSpecies;
  } catch (error) {
    return { success: false, error: error.message };
  }
  if (Object.keys(tipToSpecies).length > 0) {
    annotateSpecies(treeData, tipToSpecies);
  }

  const hasFasta = proteinSeqs !== null;
  const tipLengths = {};
  if (proteinSeqsUngapped) {
    for (const [k, v] of Object.entries(proteinSeqsUngapped)) {
      tipLengths[k] = v.length;
    }
  }

  return {
    success: true,
    result: {
      treeData,
      gene,
      nwkName: nwkFile.name,
      aaName: aaFile ? aaFile.name : null,
      hasFasta,
      numSeqs: hasFasta ? Object.keys(proteinSeqs).length : 0,
      numSpecies: Object.keys(speciesToTips).length,
      proteinSeqs,
      proteinSeqsUngapped,
      speciesToTips,
      tipToSpecies,
      tipLengths,
      datasetFileNames: datasetTexts.map(d => d.name).sort(),
      experimentalAnalysis,
      sourceTexts: {
        nwk: nwkText,
        nwkName: nwkFile.name,
        aa: aaText,
        aaName: aaFile ? aaFile.name : null,
        speciesConfig: resolvedSpeciesConfig,
        ortho: orthoTexts,
        datasets: datasetTexts,
        experimental: experimentalText ? { name: experimentalName, text: experimentalText } : null,
      },
    },
  };
}

/**
 * Reconstruct workspace from source texts (used for session loading).
 * Same as loadFromFiles but takes raw text content instead of File objects.
 */
export function loadFromSourceTexts(sourceTexts) {
  const nwkText = sourceTexts.nwk;
  const aaText = sourceTexts.aa;
  const orthoTexts = sourceTexts.ortho || [];
  const datasetTexts = sourceTexts.datasets || [];
  const resolvedSpeciesConfig = normalizeSpeciesConfig(sourceTexts.speciesConfig);
  const experimentalSource = sourceTexts.experimental || null;

  const treeData = parseNewick(nwkText);
  const gene = (sourceTexts.nwkName || "tree.nwk").replace(/\.nwk$/, "");
  const experimentalAnalysis = experimentalSource
    ? parseExperimentalAnalysisText(experimentalSource.name || "experimental.json", experimentalSource.text || "")
    : null;

  let proteinSeqs = null;
  let proteinSeqsUngapped = null;
  if (aaText) {
    proteinSeqs = parseFastaText(aaText);
    proteinSeqsUngapped = {};
    for (const [k, v] of Object.entries(proteinSeqs)) {
      proteinSeqsUngapped[k] = v.replace(/-/g, "");
    }
  }

  let speciesToTips = {};
  let tipToSpecies = {};
  const mapping = resolveSpeciesMapping(treeData, orthoTexts, resolvedSpeciesConfig);
  speciesToTips = mapping.speciesToTips;
  tipToSpecies = mapping.tipToSpecies;
  if (Object.keys(tipToSpecies).length > 0) {
    annotateSpecies(treeData, tipToSpecies);
  }

  const hasFasta = proteinSeqs !== null;
  const tipLengths = {};
  if (proteinSeqsUngapped) {
    for (const [k, v] of Object.entries(proteinSeqsUngapped)) {
      tipLengths[k] = v.length;
    }
  }

  return {
    treeData,
    gene,
    nwkName: sourceTexts.nwkName || "tree.nwk",
    aaName: sourceTexts.aaName || null,
    hasFasta,
    numSeqs: hasFasta ? Object.keys(proteinSeqs).length : 0,
    numSpecies: Object.keys(speciesToTips).length,
    proteinSeqs,
    proteinSeqsUngapped,
    speciesToTips,
    tipToSpecies,
    tipLengths,
    experimentalAnalysis,
    datasetFileNames: datasetTexts.map(d => d.name).sort(),
    sourceTexts,
  };
}

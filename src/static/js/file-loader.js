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

function normalizeSpeciesConfig(speciesConfig = {}) {
  return {
    mode: speciesConfig.mode === "tip-labels" ? "tip-labels" : "orthofinder",
    pattern: speciesConfig.pattern || DEFAULT_SPECIES_INFER_PATTERN,
    replacement: speciesConfig.replacement ?? DEFAULT_SPECIES_INFER_REPLACEMENT,
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

  const hasRelativePaths = Array.from(files).some(
    f => f.webkitRelativePath && f.webkitRelativePath.includes("/")
  );

  for (const file of files) {
    const relPath = file.webkitRelativePath || file.name;
    const name = file.name;

    if (hasRelativePaths) {
      if (relPath.includes("orthofinder-input/") || relPath.includes("orthofinder-input\\")) {
        if (name.endsWith(".fa") || name.endsWith(".fasta")) {
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
    } else if (name.endsWith(".aa.fa")) {
      aaFiles.push(file);
    } else if (!hasRelativePaths) {
      if ((name.endsWith(".fa") || name.endsWith(".fasta")) && !name.endsWith(".aa.fa")) {
        orthoFiles.push(file);
      } else if (name.endsWith(".txt") && !name.endsWith(":Zone.Identifier")) {
        datasetFiles.push(file);
      }
    }
  }

  return {
    nwkFiles: nwkFiles.sort((a, b) => a.name.localeCompare(b.name)),
    aaFiles: aaFiles.sort((a, b) => a.name.localeCompare(b.name)),
    orthoFiles: orthoFiles.sort((a, b) => a.name.localeCompare(b.name)),
    datasetFiles: datasetFiles.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Load data from the selected files, building the full workspace.
 * @param {object} opts
 * @param {File} opts.nwkFile - The Newick tree file.
 * @param {File|null} opts.aaFile - The protein alignment file (optional).
 * @param {File[]} opts.orthoFiles - Orthofinder species FASTA files.
 * @param {File[]} opts.datasetFiles - Dataset .txt files.
 * @param {{mode?: string, pattern?: string, replacement?: string}} opts.speciesConfig
 * @returns {Promise<{ success: boolean, error?: string, result?: object }>}
 */
export async function loadFromFiles({ nwkFile, aaFile, orthoFiles, datasetFiles, speciesConfig }) {
  if (!nwkFile) return { success: false, error: "No tree file (.nwk) selected." };

  const nwkText = await nwkFile.text();
  const aaText = aaFile ? await aaFile.text() : null;
  const orthoTexts = orthoFiles
    ? await Promise.all(orthoFiles.map(async f => ({ name: f.name, text: await f.text() })))
    : [];
  const datasetTexts = await Promise.all(
    (datasetFiles || []).map(async f => ({ name: f.name, text: await f.text() }))
  );

  const treeData = parseNewick(nwkText);
  const gene = nwkFile.name.replace(/\.nwk$/, "");
  const resolvedSpeciesConfig = normalizeSpeciesConfig(speciesConfig);

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
      sourceTexts: {
        nwk: nwkText,
        nwkName: nwkFile.name,
        aa: aaText,
        aaName: aaFile ? aaFile.name : null,
        speciesConfig: resolvedSpeciesConfig,
        ortho: orthoTexts,
        datasets: datasetTexts,
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

  const treeData = parseNewick(nwkText);
  const gene = (sourceTexts.nwkName || "tree.nwk").replace(/\.nwk$/, "");

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
    datasetFileNames: datasetTexts.map(d => d.name).sort(),
    sourceTexts,
  };
}

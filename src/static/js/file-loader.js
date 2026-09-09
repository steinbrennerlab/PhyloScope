import { collectAllTipNames } from "./tree-traversal.js";
/**
 * File loading infrastructure for PhyloScope standalone mode.
 * Handles folder/file picker input, detects file types, builds workspace.
 */

import { parseDatasetText, parseNewick, parseFastaText } from "./parsers.js";
import {
  annotateSpecies,
  buildSpeciesMapFromFiles,
  buildSpeciesMapFromTipLabels,
  DEFAULT_SPECIES_INFER_PATTERN,
  DEFAULT_SPECIES_INFER_REPLACEMENT,
} from "./tree-ops.js";
import {
  normalizeExperimentalSources,
  parseExperimentalAnalysisSources,
} from "./experimental-analysis.js";

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
 * @param {File[]} opts.experimentalFiles - Experimental analysis JSON files.
 * @param {{mode?: string, pattern?: string, replacement?: string}} opts.speciesConfig
 * @returns {Promise<{ success: boolean, error?: string, result?: object }>}
 */
export async function loadFromFiles({ nwkFile, aaFile, orthoFiles, datasetFiles, experimentalFiles, speciesConfig }) {
  if (!nwkFile) return { success: false, error: "No tree file (.nwk) selected." };

  const nwkText = await nwkFile.text();
  const aaText = aaFile ? await aaFile.text() : null;
  const experimentalSources = experimentalFiles && experimentalFiles.length > 0
    ? await Promise.all(experimentalFiles.map(async file => ({
      name: getFileLabel(file),
      text: await file.text(),
    })))
    : [];
  const filteredOrthoFiles = (orthoFiles || []).filter(f => !isSameSelectedFile(f, aaFile));
  const orthoTexts = filteredOrthoFiles.length > 0
    ? await Promise.all(filteredOrthoFiles.map(async f => ({ name: f.name, text: await f.text() })))
    : [];
  const datasetTexts = await Promise.all(
    (datasetFiles || []).map(async f => ({ name: f.name, text: await f.text() }))
  );

  try {
    return { success: true, result: loadFromSourceTexts({
      nwk: nwkText, nwkName: nwkFile.name, aa: aaText, aaName: aaFile?.name || null,
      speciesConfig, ortho: orthoTexts, datasets: datasetTexts, experimental: experimentalSources,
    }) };
  } catch (error) {
    return { success: false, error: error.message };
  }
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
  const experimentalSources = normalizeExperimentalSources(sourceTexts.experimental);

  const treeData = parseNewick(nwkText);
  const gene = (sourceTexts.nwkName || "tree.nwk").replace(/\.nwk$/, "");
  const experimentalAnalysis = experimentalSources.length > 0
    ? parseExperimentalAnalysisSources(experimentalSources)
    : null;

  let proteinSeqs = null;
  let proteinSeqsUngapped = null;
  if (aaText != null) {
    proteinSeqs = parseFastaText(aaText);
    proteinSeqsUngapped = Object.create(null);
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
  const tipLengths = Object.create(null);
  if (proteinSeqsUngapped) {
    for (const [k, v] of Object.entries(proteinSeqsUngapped)) {
      tipLengths[k] = v.length;
    }
  }

  const tips = collectAllTipNames(treeData);
  const treeTips = new Set(tips);
  if (tips.length !== treeTips.size) throw new Error("Duplicate tree tip identifiers are ambiguous; use unique tip labels");
  const validationIssues = [];
  if (proteinSeqs) {
    const lengths = new Set(Object.values(proteinSeqs).map(seq => seq.length));
    if (lengths.size > 1) validationIssues.push("FASTA sequences have unequal lengths; pairwise comparison requires equal alignment lengths.");
    const missing = tips.filter(tip => !Object.hasOwn(proteinSeqs, tip));
    const extra = Object.keys(proteinSeqs).filter(tip => !treeTips.has(tip));
    if (missing.length) validationIssues.push(`${missing.length} tree tips lack FASTA sequences (examples: ${missing.slice(0, 5).join(", ")}).`);
    if (extra.length) validationIssues.push(`${extra.length} FASTA identifiers do not match tree tips (examples: ${extra.slice(0, 5).join(", ")}).`);
  }
  const datasetNames = new Set();
  for (const dataset of datasetTexts) {
    if (datasetNames.has(dataset.name)) throw new Error(`Duplicate dataset filename: ${dataset.name}`);
    datasetNames.add(dataset.name);
    const { data, error } = parseDatasetText(dataset.text, dataset.name, treeTips);
    if (error) { validationIssues.push(`${dataset.name}: ${error}`); continue; }
    if (data.unmatched_row_count) validationIssues.push(`${dataset.name}: ${data.unmatched_row_count} rows do not match tree tips and are ignored.`);
    if (data.invalid_value_count) validationIssues.push(`${dataset.name}: ${data.invalid_value_count} malformed numeric cells treated as missing. Examples: ${data.invalid_cells.map(cell => `row ${cell.row}, ${cell.column}: ${cell.value}`).join("; ")}`);
  }
  return {
    validationIssues,
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

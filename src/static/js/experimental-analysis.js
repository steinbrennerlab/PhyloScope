const CLADE_SIGNATURE_SEPARATOR = "\u001f";

function buildCladeSignature(leaves) {
  return leaves.join(CLADE_SIGNATURE_SEPARATOR);
}

function normalizeLeaves(leaves) {
  if (!Array.isArray(leaves)) return [];
  return [...new Set(leaves.map(value => String(value).trim()).filter(Boolean))].sort();
}

function collectExperimentalSplitEntries(value, entries = [], path = ["root"]) {
  if (!value || typeof value !== "object") return entries;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectExperimentalSplitEntries(item, entries, [...path, String(index)]);
    });
    return entries;
  }

  if (Array.isArray(value.slow_leaves) || Array.isArray(value.fast_leaves)) {
    entries.push({ split: value, path: path.join(".") });
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key === "slow_leaves" || key === "fast_leaves") return;
    collectExperimentalSplitEntries(child, entries, [...path, key]);
  });

  return entries;
}

function resolveExperimentalSplitId(split, index) {
  const rawId = split?.split_id ?? split?.id ?? split?.name ?? split?.label ?? split?.title;
  if (rawId != null && String(rawId).trim()) {
    return String(rawId).trim();
  }
  return `split_${String(index + 1).padStart(4, "0")}`;
}

function getExperimentalSplitNumber(splitId) {
  const match = /^split_(\d+)$/i.exec(String(splitId || "").trim());
  return match ? Number(match[1]) : null;
}

function formatExperimentalLabel(sourceName, splitId, side, includeSourceName) {
  const baseLabel = `${splitId} ${side}`;
  return includeSourceName ? `${sourceName} :: ${baseLabel}` : baseLabel;
}

export function normalizeExperimentalSources(experimental) {
  if (!experimental) return [];

  const sources = Array.isArray(experimental) ? experimental : [experimental];
  return sources
    .filter(source => source && typeof source === "object")
    .map(source => ({
      name: String(source.name || "experimental.json"),
      text: String(source.text || ""),
    }));
}

export function parseExperimentalAnalysisText(name, text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Experimental JSON parse failed for ${name}: ${error.message}`);
  }

  const splitEntries = collectExperimentalSplitEntries(parsed);
  if (splitEntries.length === 0) {
    throw new Error(`Experimental JSON ${name} did not contain any nested split objects with slow_leaves or fast_leaves`);
  }

  const clades = [];
  let splitCount = 0;
  splitEntries.forEach(({ split }, index) => {
    const splitId = resolveExperimentalSplitId(split, index);
    const splitNumber = getExperimentalSplitNumber(splitId);
    let hasUsableLeaves = false;
    [
      ["slow", split?.slow_leaves],
      ["fast", split?.fast_leaves],
    ].forEach(([side, leaves]) => {
      const normalizedLeaves = normalizeLeaves(leaves);
      if (normalizedLeaves.length === 0) return;
      hasUsableLeaves = true;
      clades.push({
        key: `${splitId}:${side}`,
        splitId,
        splitNumber,
        side,
        sideOrder: side === "slow" ? 0 : 1,
        tipCount: normalizedLeaves.length,
        signature: buildCladeSignature(normalizedLeaves),
        leaves: normalizedLeaves,
      });
    });
    if (hasUsableLeaves) splitCount++;
  });

  if (clades.length === 0) {
    throw new Error(`Experimental JSON ${name} did not contain any usable slow/fast leaf lists`);
  }

  return {
    name,
    splitCount,
    cladeCount: clades.length,
    clades,
  };
}

export function parseExperimentalAnalysisSources(experimentalSources) {
  const normalizedSources = normalizeExperimentalSources(experimentalSources);
  if (normalizedSources.length === 0) return null;

  const analyses = normalizedSources.map(source => parseExperimentalAnalysisText(source.name, source.text));
  const includeSourceName = analyses.length > 1;
  const clades = [];
  let splitCount = 0;

  analyses.forEach((analysis, sourceIndex) => {
    splitCount += analysis.splitCount;
    analysis.clades.forEach(clade => {
      clades.push({
        ...clade,
        key: `${sourceIndex}:${clade.key}`,
        sourceName: analysis.name,
        sourceIndex,
        displayLabel: formatExperimentalLabel(analysis.name, clade.splitId, clade.side, includeSourceName),
      });
    });
  });

  return {
    name: analyses.length === 1 ? analyses[0].name : `${analyses.length} experimental JSON files`,
    sourceCount: analyses.length,
    splitCount,
    cladeCount: clades.length,
    clades,
    sources: analyses.map((analysis, sourceIndex) => ({
      name: analysis.name,
      sourceIndex,
      splitCount: analysis.splitCount,
      cladeCount: analysis.cladeCount,
    })),
  };
}

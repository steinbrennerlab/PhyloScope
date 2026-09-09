// Validate imported sessions before touching the current workspace. Retain only
// topology fields from saved nodes: layout coordinates are derived by rendering.
function invalid(field) {
  throw new Error(`Invalid session: ${field}`);
}

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value;
}

function string(value, field) {
  if (typeof value !== "string") invalid(field);
  return value;
}

function number(value, field, minimum = -Infinity) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) invalid(field);
  return value;
}

function nodeId(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(field);
  return value;
}

function color(value, field) {
  if (typeof value !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) invalid(field);
  return value;
}

function array(value, field, validate) {
  if (!Array.isArray(value)) invalid(field);
  return value.map(item => validate(item, field));
}

function map(value, field, validate) {
  return Object.fromEntries(Object.entries(record(value, field)).map(([key, item]) => [key, validate(item, field)]));
}

function tree(value, field) {
  const ids = new Set();
  const seen = new Set();
  const root = {};
  const stack = [[value, root]];
  while (stack.length) {
    const [source, dest] = stack.pop();
    record(source, field);
    if (seen.has(source)) invalid(`${field} contains a cycle or shared node`);
    seen.add(source);
    dest.id = nodeId(source.id, `${field} node id`);
    if (ids.has(dest.id)) invalid(`${field} has duplicate node ids`);
    ids.add(dest.id);
    dest.bl = source.bl == null ? 0 : number(source.bl, `${field} branch length`);
    if (source.name != null) dest.name = string(source.name, `${field} label`);
    if (source.sup != null) dest.sup = number(source.sup, `${field} support`);
    if (source.ch != null) {
      if (!Array.isArray(source.ch) || source.ch.length === 0) invalid(`${field} children`);
      dest.ch = source.ch.map(() => ({}));
      source.ch.forEach((child, i) => stack.push([child, dest.ch[i]]));
    }
  }
  return root;
}

/** Used for both self-contained v2 sessions and legacy v1 display settings. */
export function validateSession(input) {
  record(input, "expected an object");
  if (input.version !== 1 && input.version !== 2) invalid("unsupported version");
  const session = { ...input };
  for (const field of ["gene", "nwkName", "aaName", "nameSearch", "selectedTip"]) {
    if (session[field] != null) string(session[field], field);
  }
  if (session.layoutMode != null && !["rectangular", "circular", "unrooted"].includes(session.layoutMode)) invalid("layoutMode");
  for (const field of ["usePhylogram", "showTipLabels", "showBootstraps", "showLengths", "fastMode", "uniformTriangles", "treeRerooted"]) {
    if (session[field] != null && typeof session[field] !== "boolean") invalid(field);
  }
  for (const field of ["labelFontSize", "tipLabelSize", "dotSize", "tipSpacing", "triangleScale", "scale", "tx", "ty"]) {
    if (session[field] != null) number(session[field], field, ["tx", "ty"].includes(field) ? -Infinity : 0);
  }
  if (session.scale === 0) invalid("scale must be positive");
  if (session.exportNodeId != null) nodeId(session.exportNodeId, "exportNodeId");
  for (const field of ["collapsedNodes", "checkedSpecies", "excludedSpecies", "hiddenTips"]) {
    if (session[field] != null) session[field] = array(session[field], field, field === "collapsedNodes" ? nodeId : string);
  }
  for (const field of ["nodeLabels", "nodeLabelIcons", "nodeLabelColors", "cladeColors", "speciesColors"]) {
    if (session[field] != null) session[field] = map(session[field], field, field.endsWith("Colors") ? color : string);
  }
  if (session.tipMarkers != null) session.tipMarkers = map(session.tipMarkers, "tipMarkers", (item, field) => {
    record(item, field);
    return {
      text: item.text == null ? "" : string(item.text, field),
      color: item.color == null ? "#333" : color(item.color, field),
      icon: item.icon == null ? "dot" : string(item.icon, field),
    };
  });
  if (session.apeNumberByNodeId != null) session.apeNumberByNodeId = map(session.apeNumberByNodeId, "apeNumberByNodeId", nodeId);
  if (session.apeTipCount != null) nodeId(session.apeTipCount, "apeTipCount");
  if (session.motifList != null) session.motifList = array(session.motifList, "motifList", (item, field) => {
    record(item, field);
    if (!["regex", "prosite"].includes(item.type)) invalid(field);
    return { pattern: string(item.pattern, field), type: item.type };
  });
  if (session.activeHeatmaps != null) session.activeHeatmaps = array(session.activeHeatmaps, "activeHeatmaps", (item, field) => {
    record(item, field);
    const heatmap = { name: string(item.name, field) };
    heatmap.visibleColumns = array(item.visibleColumns || [], field, string);
    for (const key of ["displayMin", "displayMid", "displayMax", "colorLow", "colorMid", "colorHigh"]) {
      if (item[key] != null) heatmap[key] = key.startsWith("color") ? color(item[key], field) : number(item[key], field);
    }
    return heatmap;
  });
  if (session.version === 2) {
    record(session.sourceTexts, "sourceTexts");
    string(session.sourceTexts.nwk, "sourceTexts.nwk");
    if (session.sourceTexts.aa != null) string(session.sourceTexts.aa, "sourceTexts.aa");
    for (const field of ["nwkName", "aaName"]) {
      if (session.sourceTexts[field] != null) string(session.sourceTexts[field], `sourceTexts.${field}`);
    }
    for (const field of ["ortho", "datasets"]) {
      if (session.sourceTexts[field] != null) array(session.sourceTexts[field], `sourceTexts.${field}`, (item, key) => {
        record(item, key); string(item.name, key); string(item.text, key);
        return item;
      });
    }
    session.treeData = tree(session.treeData, "treeData");
    session.fullTreeData = session.fullTreeData == null ? null : tree(session.fullTreeData, "fullTreeData");
  }
  return session;
}

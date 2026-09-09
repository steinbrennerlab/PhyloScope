export function filePath(file) {
  return String(file?.webkitRelativePath || file?.name || "").replace(/\\/g, "/");
}

function runRoot(file) {
  const folders = filePath(file).split("/").slice(0, -1);
  for (let i = folders.length - 2; i >= 0; i--) {
    if (folders[i].toLowerCase() === "runs") return folders.slice(0, i + 2).join("/") + "/";
  }
  // Choosing the run folder itself omits its parent "runs" component.
  for (let i = folders.length - 1; i >= 0; i--) {
    if (/^\d{8}_\d{4,6}$/.test(folders[i])) return folders.slice(0, i + 1).join("/") + "/";
  }
  return null;
}

export function treeImportScope(treeFile) {
  const directory = filePath(treeFile).split("/").slice(0, -1).join("/");
  return runRoot(treeFile) || (directory ? `${directory}/` : "");
}

export function belongsToTreeScope(file, treeFile) {
  const scope = treeImportScope(treeFile);
  if (!scope) return true; // Explicit flat file selections have no folder metadata.
  if (!filePath(file).startsWith(scope)) return false;
  const candidateRun = runRoot(file);
  return !candidateRun || candidateRun === runRoot(treeFile);
}

/** Keep the tree picker global; scope the companion files to its run/folder. */
export function scopeDetectedFiles(detected, treeFile, includeAllFolders = false) {
  const result = { ...detected };
  for (const key of ["aaFiles", "orthoFiles", "datasetFiles", "analysisFiles"]) {
    result[key] = (detected[key] || []).filter(file => includeAllFolders || belongsToTreeScope(file, treeFile));
  }
  const directory = filePath(treeFile).split("/").slice(0, -1).join("/");
  // Prefer the tree's adjacent alignment to per-species all_hits.aa.fa files.
  const adjacent = file => filePath(file).split("/").slice(0, -1).join("/") === directory;
  result.aaFiles.sort((a, b) => Number(adjacent(b)) - Number(adjacent(a)));
  return result;
}

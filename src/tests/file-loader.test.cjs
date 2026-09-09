const test = require("node:test");
const assert = require("node:assert/strict");
const { harness, plain } = require("./helpers.cjs");

function file(relativePath, text = "") {
  return { name: relativePath.split(/[\\/]/).at(-1), webkitRelativePath: relativePath, text: async () => text };
}

test("BAT species FASTAs are discovered at arbitrary depths and used for mapping", async () => {
  const { detectFiles, loadFromFiles } = await (await harness({ withoutDocument: true })).load("file-loader");
  for (const prefix of ["20260414_1939/", "AT2G31880.1/runs/20260414_1939/"]) {
    const tree = file(prefix + "AT2G31880.1.nwk", "(Nb1,Nt1,At1);");
    const alignment = file(prefix + "AT2G31880.1.csv.aa.fa", ">Nb1\nAC\n>Nt1\nAC\n>At1\nAC");
    const species = [
      file(prefix + "hits/orthofinder-input/Niben261_genome.annotation.proteins.fasta", ">Nb1\nAC"),
      file(prefix + "hits/orthofinder-input/Nitab-v4.5_proteins_Edwards2017.fasta", ">Nt1\nAC"),
      file(prefix + "hits/orthofinder-input/TAIR10protein.fa", ">At1\nAC"),
    ];
    const detected = detectFiles([tree, alignment, ...species]);
    assert.equal(detected.orthoFiles.length, 3);
    assert.deepEqual(plain(detected.aaFiles.map(f => f.name)), [alignment.name]);
    const result = await loadFromFiles({ nwkFile: tree, aaFile: alignment, orthoFiles: detected.orthoFiles });
    assert.equal(result.success, true);
    assert.equal(result.result.numSpecies, 3);
    assert.deepEqual(plain(result.result.tipToSpecies), {
      Nb1: "Niben261_genome.annotation.proteins", Nt1: "Nitab-v4.5_proteins_Edwards2017", At1: "TAIR10protein",
    });
  }
});

test("folder matching handles separators and case without matching similarly named folders", async () => {
  const { detectFiles } = await (await harness()).load("file-loader");
  const detected = detectFiles([
    file("run\\hits\\OrthoFinder-Input\\species.fasta"),
    file("run\\hits\\not-orthofinder-input\\alignment.fa"),
    file("run\\hits\\Dataset\\values.txt"),
  ]);
  assert.deepEqual(plain(detected.orthoFiles.map(f => f.name)), ["species.fasta"]);
  assert.deepEqual(plain(detected.aaFiles.map(f => f.name)), ["alignment.fa"]);
  assert.deepEqual(plain(detected.datasetFiles.map(f => f.name)), ["values.txt"]);
  const flat = detectFiles([{ name: "tree.nwk" }, { name: "species.fa" }]);
  assert.equal(flat.orthoFiles.length, 1);
});

test("nested tree and alignment selectors load the chosen path when filenames repeat", async () => {
  const h = await harness({ stubRenderer: true, expose: { "actions.js": ["handleFilesSelected", "updateScopedSetupFiles", "doSetupLoad"] } });
  const { handleFilesSelected, updateScopedSetupFiles, doSetupLoad } = await h.load("actions");
  const { state } = await h.load("state");
  const files = [
    file("run/first/tree.nwk", "(A,B);"), file("run/second/tree.nwk", "(C,D);"),
    file("run/first/all_hits.aa.fa", ">A\nAC\n>B\nAC"), file("run/second/all_hits.aa.fa", ">C\nGT\n>D\nGT"),
  ];
  handleFilesSelected(files);
  const treeSelect = h.document.getElementById("detected-nwk");
  const alignmentSelect = h.document.getElementById("detected-aa");
  assert.deepEqual(treeSelect.children.map(option => option.value), ["run/first/tree.nwk", "run/second/tree.nwk"]);
  assert.equal(alignmentSelect.children.at(-1).textContent, "run/first/all_hits.aa.fa");
  treeSelect.value = "run/second/tree.nwk";
  updateScopedSetupFiles({ resetAlignment: true });
  assert.equal(alignmentSelect.value, "run/second/all_hits.aa.fa");
  assert.equal(alignmentSelect.children.length, 2);
  await doSetupLoad();
  assert.equal(h.document.getElementById("setup-error").textContent, "");
  assert.equal(state.sourceTexts.nwk, "(C,D);");
  assert.equal(state.proteinSeqs.C, "GT");
});

test("companion files stay in the selected BAT run, including trees nested under hits", async () => {
  const h = await harness({ withoutDocument: true });
  const { scopeDetectedFiles, treeImportScope } = await h.load("import-scope");
  const { detectFiles, loadFromFiles, loadFromSourceTexts } = await h.load("file-loader");
  const one = "gene/runs/20260414_1939/", two = "gene/runs/20260415_1940/";
  const tree = file(one + "hits/trees/tree.nwk", "(A,B);");
  const goodSpecies = file(one + "hits/orthofinder-input/Species1.fa", ">A\nAC\n>B\nAC");
  const wrongSpecies = file(two + "hits/orthofinder-input/Species2.fa", ">A\nAC");
  const goodDataset = file(one + "dataset/values.txt", "tip\tv\nA\t1");
  const wrongDataset = file(two + "dataset/values.txt", "tip\tv\nA\t2");
  const goodAnalysis = file(one + "analysis.json", '{"slow_leaves":["A","B"]}');
  const wrongAnalysis = file(two + "analysis.json", "not valid JSON");
  const detected = detectFiles([tree, goodSpecies, wrongSpecies, goodDataset, wrongDataset, goodAnalysis, wrongAnalysis]);
  const scoped = scopeDetectedFiles(detected, tree);
  assert.equal(treeImportScope(tree), one);
  assert.equal(scoped.orthoFiles.length, 1);
  assert.equal(scoped.datasetFiles.length, 1);
  assert.equal(scoped.analysisFiles.length, 1);
  const loaded = await loadFromFiles({ nwkFile: tree, orthoFiles: detected.orthoFiles, datasetFiles: detected.datasetFiles, experimentalFiles: detected.analysisFiles });
  assert.equal(loaded.success, true, loaded.error);
  assert.equal(loaded.result.tipToSpecies.A, "Species1");
  assert.equal(loaded.result.sourceTexts.ortho.length, 1);
  assert.equal(loaded.result.sourceTexts.datasets.length, 1);
  assert.equal(loaded.result.sourceTexts.experimental.length, 1);
  assert.equal(loadFromSourceTexts(loaded.result.sourceTexts).tipToSpecies.B, "Species1");
  assert.equal(treeImportScope(file("20260414_1939/hits/tree.nwk")), "20260414_1939/");
  assert.equal(treeImportScope(file("gene\\runs\\custom-run\\hits\\tree.nwk")), "gene/runs/custom-run/");
  // Folder boundaries prevent run1 from matching run10 or other nested runs.
  const plainTree = file("project/run1/tree.nwk");
  const boundary = scopeDetectedFiles({ aaFiles: [file("project/run10/a.fa"), file("project/run1/a.fa"), file("project/run1/runs/another/a.fa")] }, plainTree);
  assert.deepEqual(plain(boundary.aaFiles.map(f => f.webkitRelativePath)), ["project/run1/a.fa"]);
});

test("cross-folder alignment requires an explicit override; missing local files do not fall back", async () => {
  const h = await harness({ withoutDocument: true });
  const { scopeDetectedFiles } = await h.load("import-scope");
  const { detectFiles, loadFromFiles } = await h.load("file-loader");
  const tree = file("gene/runs/first/tree.nwk", "(A,B);");
  const alignment = file("gene/runs/second/tree.aa.fa", ">A\nAC\n>B\nAC");
  const species = file("gene/runs/second/hits/orthofinder-input/Species.fa", ">A\nAC\n>B\nAC");
  const all = detectFiles([tree, alignment, species]);
  const scoped = scopeDetectedFiles(all, tree);
  assert.equal(scoped.aaFiles.length, 0);
  assert.equal(scoped.orthoFiles.length, 0);
  const missing = await loadFromFiles({ nwkFile: tree, orthoFiles: all.orthoFiles });
  assert.equal(missing.result.numSpecies, 0);
  const options = { nwkFile: tree, aaFile: alignment, orthoFiles: all.orthoFiles };
  assert.match((await loadFromFiles(options)).error, /outside/);
  const override = await loadFromFiles({ ...options, includeAllFolders: true });
  assert.equal(override.success, true);
  assert.equal(override.result.tipToSpecies.A, "Species");
  assert.equal(override.result.sourceTexts.importScope, "all");
  assert.equal(scopeDetectedFiles(all, tree, true).aaFiles.length, 1);
});

test("scope UI follows tree changes and honors the all-folders override", async () => {
  const h = await harness({ stubRenderer: true, expose: { "actions.js": ["handleFilesSelected", "updateScopedSetupFiles", "doSetupLoad"] } });
  const actions = await h.load("actions");
  const { state } = await h.load("state");
  const prefix = "gene/runs/";
  actions.handleFilesSelected([
    file(prefix + "one/tree.nwk", "(A,B);"), file(prefix + "two/tree.nwk", "(A,B);"),
    file(prefix + "one/tree.aa.fa", ">A\nAC\n>B\nAC"),
    file(prefix + "one/hits/species/all_hits.aa.fa", ">A\nAC"),
    file(prefix + "one/hits/orthofinder-input/Species.fa", ">A\nAC\n>B\nAC"),
  ]);
  const select = id => h.document.getElementById(id);
  assert.equal(select("detected-aa").value, prefix + "one/tree.aa.fa");
  assert.match(select("import-scope-hint").textContent, /gene\/runs\/one\//);
  select("detected-nwk").value = prefix + "two/tree.nwk";
  actions.updateScopedSetupFiles({ resetAlignment: true });
  assert.equal(select("detected-aa").value, "");
  assert.equal(state.stagedFiles.scopedDetected.orthoFiles.length, 0);
  select("import-scope").value = "all";
  actions.updateScopedSetupFiles();
  assert.equal(state.stagedFiles.scopedDetected.orthoFiles.length, 1);
  select("detected-aa").value = prefix + "one/tree.aa.fa";
  await actions.doSetupLoad();
  assert.equal(select("setup-error").textContent, "");
  assert.equal(state.sourceTexts.importScope, "all");
  assert.equal(state.numSpecies, 1);
});

test("repeated species files merge and deduplicate tips regardless of file order", async () => {
  const h = await harness({ withoutDocument: true });
  const { parseNewick } = await h.load("parsers");
  const { buildSpeciesMapFromFiles } = await h.load("tree-ops");
  const tree = parseNewick("(A,B,C);");
  const files = [
    { name: "Species.fa", path: "one/Species.fa", text: ">A\nAA\n>B\nAA\n>A\nAA" },
    { name: "Species.fasta", path: "two/Species.fasta", text: ">B\nAA\n>C\nAA\n>not_in_tree\nAA" },
  ];
  for (const input of [files, [...files].reverse()]) {
    const mapping = buildSpeciesMapFromFiles(tree, input);
    assert.deepEqual(plain(mapping.speciesToTips), { Species: ["A", "B", "C"] });
    assert.deepEqual(plain(mapping.tipToSpecies), { A: "Species", B: "Species", C: "Species" });
  }
});

test("conflicting species files report the tip, species and file paths before replacing a workspace", async () => {
  const h = await harness({ stubRenderer: true, expose: { "actions.js": ["loadSessionV2", "pushUndo", "handleFilesSelected", "doSetupLoad"] } });
  const actions = await h.load("actions");
  const { state } = await h.load("state");
  const { parseNewick } = await h.load("parsers");
  const { buildSpeciesMapFromFiles } = await h.load("tree-ops");
  const files = [
    { name: "Species1.fa", path: "one/Species1.fa", text: ">A\nAC" },
    { name: "Species2.fa", path: "two/Species2.fa", text: ">A\nAC" },
  ];
  for (const input of [files, [...files].reverse()]) {
    assert.throws(() => buildSpeciesMapFromFiles(parseNewick("(A,B);"), input), error => {
      assert.match(error.message, /Conflicting species assignments for 1 tree tip/);
      assert.match(error.message, /A: Species1 \(one\/Species1.fa\) vs Species2 \(two\/Species2.fa\)/);
      return true;
    });
  }
  const initial = { version: 2, treeData: parseNewick("(X,Y);"), sourceTexts: { nwk: "(X,Y);" } };
  await actions.loadSessionV2(initial, false);
  actions.pushUndo();
  const previousTree = state.treeData;
  const invalid = { version: 2, treeData: parseNewick("(A,B);"), sourceTexts: { nwk: "(A,B);", ortho: files } };
  await assert.rejects(() => actions.loadSessionV2(invalid, false), /Conflicting species assignments/);
  assert.equal(state.treeData, previousTree);
  assert.equal(state.undoStack.length, 1);
  actions.handleFilesSelected([file("run/tree.nwk", "(A,B);"), ...files.map(f => file("run/orthofinder-input/" + f.name, f.text))]);
  await actions.doSetupLoad();
  assert.match(h.document.getElementById("setup-error").textContent, /Conflicting species assignments/);
  assert.equal(state.treeData, previousTree);
  assert.equal(state.undoStack.length, 1);
});

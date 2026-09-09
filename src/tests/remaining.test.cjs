const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness, plain } = require("./helpers.cjs");
const { families, fixtureTarget, tipNames } = require("./reroot-helpers.cjs");

test("all three pinned families retain every unchanged edge's original length token", async () => {
  const h = await harness({ withoutDocument: true });
  const { parseNewick } = await h.load("parsers");
  const { rerootTree, exportNewickText } = await h.load("tree-ops");
  const { walkTree, deepCopyNode } = await h.load("tree-traversal");
  function tokens(root) {
    const all = tipNames(root), first = all[0], result = new Map();
    for (const node of walkTree(root)) {
      if (node === root) continue;
      const descendants = new Set(tipNames(node));
      const key = JSON.stringify(descendants.has(first) ? all.filter(tip => !descendants.has(tip)) : [...descendants].sort());
      if (!result.has(key)) result.set(key, []);
      result.get(key).push(node.blText);
    }
    return result;
  }
  for (const family of families) {
    const { tree, target } = fixtureTarget(parseNewick, family.name);
    const before = tokens(tree);
    const output = exportNewickText(rerootTree(deepCopyNode(tree), target.id));
    const after = tokens(parseNewick(output));
    let preserved = 0;
    for (const [key, values] of before) {
      if (values.length === 1 && after.get(key).length === 1) {
        assert.deepEqual(after.get(key), values, family.name);
        preserved++;
      }
    }
    assert.equal(preserved, before.size - 1, family.name);
    assert.ok(output.endsWith(";\n"));
  }
});

test("pairwise identity ignores case and similarity agrees with every NCBI matrix entry", async () => {
  const h = await harness({ withoutDocument: true });
  const { computePairwiseIdentity } = await h.load("tree-ops");
  const raw = fs.readFileSync(path.join(__dirname, "fixtures/blosum62.c"), "utf8");
  const block = raw.split("s_Blosum62PSM[25 * 25] = {")[1].split("};")[0].replace(/\/\*[\s\S]*?\*\//g, "");
  const scores = block.match(/-?\d+/g).map(Number);
  const alphabet = "ARNDCQEGHILKMFPSTWYVBJZX*";
  assert.equal(scores.length, 625);
  for (let i = 0; i < 25; i++) for (let j = 0; j < 25; j++) {
    const result = computePairwiseIdentity(alphabet[i].toLowerCase(), alphabet[j]);
    assert.equal(result.identity, Number(i === j), `${alphabet[i]}/${alphabet[j]} identity`);
    assert.equal(result.similarity, Number(scores[i * 25 + j] > 0), `${alphabet[i]}/${alphabet[j]} similarity`);
  }
  assert.equal(computePairwiseIdentity("ac", "AC").identity, 1);
  assert.equal(computePairwiseIdentity("A", "G").similarity, 0);
  assert.equal(computePairwiseIdentity("Q", "R").similarity, 1);
  assert.equal(computePairwiseIdentity("-AC-", "GacT").aligned_length, 2);
  assert.equal(computePairwiseIdentity("--", "--").identity, 0);
  assert.match(computePairwiseIdentity("A", "AA").error, /different lengths/);
});

test("PROSITE manual patterns support attached anchors, repetitions and terminal alternatives", async () => {
  const { prositeToRegex } = await (await harness({ withoutDocument: true })).load("parsers");
  const matches = (pattern, seq) => new RegExp(prositeToRegex(pattern), "i").test(seq);
  assert.ok(matches("<A-x-[ST](2)-x(0,1)-V.", "AASTV"));
  assert.ok(!matches("<A-x-[ST](2)-x(0,1)-V.", "GAASTV"));
  assert.ok(matches("[AC]-x-V-x(4)-{ED}.", "ACVAAAAK"));
  assert.ok(!matches("[AC]-x-V-x(4)-{ED}.", "ACVAAAAE"));
  assert.ok(matches("<A-x-G>", "ATG"));
  assert.ok(!matches("<A-x-G>", "ATGA"));
  assert.ok(matches("<A-x-[G>]", "AT"));
  assert.ok(matches("<A-x-[G>]", "ATG"));
  assert.ok(!matches("<A-x-[G>]", "ATK"));
  assert.ok(matches("<-A-x-G->", "ATG"));
  for (const pattern of ["", "A--G", "A-x(3,2)", "A-[G>]-A", "A-[]", "A-.*"]) {
    assert.throws(() => prositeToRegex(pattern), /PROSITE|Terminal/);
  }
});

test("large heatmap computes extrema without argument spreading and rejects partial numbers", async () => {
  const { parseDatasetText, parseNumericValue } = await (await harness()).load("parsers");
  const columns = Array.from({ length: 20 }, (_, i) => `c${i}`);
  const tips = Array.from({ length: 10000 }, (_, i) => `tip${i}`);
  const rows = tips.map((tip, i) => tip + "\t" + columns.map((_, j) => i * 20 + j - 100000).join("\t"));
  const { data, error } = parseDatasetText("taxa\t" + columns.join("\t") + "\n" + rows.join("\n"), "large.txt", new Set(tips));
  assert.equal(error, null);
  assert.equal(data.min_value, -100000);
  assert.equal(data.max_value, 99999);
  assert.equal(data.matched_row_count, 10000);
  for (const invalid of ["12oops", "Infinity", "1e999", "0x12", "", "NA"]) assert.equal(parseNumericValue(invalid), null);
  assert.equal(parseNumericValue(" -1.2e+3 "), -1200);
  const invalid = parseDatasetText("taxa\ta\tb\nc\t12oops\tNA\nz\t3\t4", "bad.txt", new Set(["c"])).data;
  assert.equal(invalid.invalid_value_count, 1);
  assert.equal(invalid.missing_value_count, 2);
  assert.equal(invalid.unmatched_row_count, 1);
  assert.equal(invalid.min_value, null);
  assert.match(parseDatasetText("taxa\ta\nc\t1\nc\t2", "x", new Set(["c"])).error, /Duplicate/);
});

test("file and session imports share validation and display escaped diagnostics", async () => {
  const h = await harness({ stubRenderer: true, expose: { "actions.js": ["showLoadedInfo"] } });
  const loader = await h.load("file-loader");
  const { parseFastaText } = await h.load("parsers");
  assert.throws(() => parseFastaText(">A\nAC\n>A description\nGT"), /Duplicate FASTA identifier: A/);
  assert.equal(parseFastaText(">__proto__\nAC")["__proto__"], "AC");
  const sources = { nwk: "(A,B);", aa: ">A\nAC\n>C\nA", nwkName: "test.nwk", aaName: "test.fa", datasets: [{ name: "<dataset>.txt", text: "tip\tx\nA\t12oops\nC\t3" }] };
  const workspace = loader.loadFromSourceTexts(sources);
  assert.equal(workspace.validationIssues.length, 5);
  assert.match(workspace.validationIssues.join("\n"), /unequal lengths/);
  const file = (name, text) => ({ name, text: async () => text });
  const loaded = await loader.loadFromFiles({ nwkFile: file(sources.nwkName, sources.nwk), aaFile: file(sources.aaName, sources.aa), datasetFiles: sources.datasets.map(d => file(d.name, d.text)) });
  assert.deepEqual(plain(loaded.result.validationIssues), plain(workspace.validationIssues));
  const { state } = await h.load("state");
  state.loaded = true; state.validationIssues = workspace.validationIssues;
  (await h.load("actions")).showLoadedInfo(2);
  const html = h.document.getElementById("loaded-info").innerHTML;
  assert.ok(html.includes("&lt;dataset&gt;"));
  assert.ok(!html.includes("<dataset>"));
  assert.throws(() => loader.loadFromSourceTexts({ nwk: "(A,A);" }), /Duplicate tree/);
});

test("Newick preserves explicit zeroes and precision through copying, reroot and session validation", async () => {
  const h = await harness({ withoutDocument: true });
  const { parseNewick } = await h.load("parsers");
  const { nodeToNewick, exportNewickText, rerootTree, findNodeById } = await h.load("tree-ops");
  const { deepCopyNode } = await h.load("tree-utils");
  const { validateSession } = await h.load("session");
  const text = "((A:0.434680,B:0.000000)80:0.891415,C:1.230000,D:2.0e-3);\n";
  const tree = parseNewick(text);
  assert.equal(exportNewickText(deepCopyNode(tree)), text);
  const rooted = rerootTree(deepCopyNode(tree), tree.ch[0].id);
  assert.equal(findNodeById(rooted, 0).blText, "0.434680");
  assert.equal(rooted.ch[0].bl, 0.891415 / 2);
  assert.equal(rooted.ch[0].blText, undefined);
  const saved = validateSession({ version: 2, sourceTexts: { nwk: text }, treeData: rooted });
  assert.equal(exportNewickText(saved.treeData), exportNewickText(rooted));
  const changed = deepCopyNode(tree); changed.ch[0].ch[0].bl = 0.5;
  assert.ok(nodeToNewick(changed).includes("A:0.5,"));
  assert.throws(() => validateSession({ version: 2, sourceTexts: { nwk: text }, treeData: changed }), /branch length token/);
});

test("10,000-level tree supports domain operations, all layouts, history and session serialization", async () => {
  const h = await harness();
  const { parseNewick } = await h.load("parsers");
  const ops = await h.load("tree-ops");
  const utils = await h.load("tree-utils");
  const { state } = await h.load("state");
  const renderer = await h.load("renderer");
  const { captureState, restoreHistoryState } = await h.load("history");
  const { stringifySession } = await h.load("json-export");
  const { validateSession } = await h.load("session");
  const depth = 10000;
  const text = "(".repeat(depth) + "A:0.0100" + Array.from({ length: depth }, (_, i) => `,T${i}:0.02):0.03`).join("") + ";\n";
  state.treeData = parseNewick(text);
  utils.reindexTree(state.treeData);
  assert.equal(utils.collectAllTipNames(state.treeData).length, depth + 1);
  assert.equal(utils.countAllTips(utils.deepCopyNode(state.treeData)), depth + 1);
  assert.equal(utils.countLeaves(state.treeData), depth + 1);
  ops.annotateSpecies(state.treeData, {});
  assert.equal(ops.findNodesWithSpecies(state.treeData, ["unknown"], []).length, 2 * depth + 1);
  assert.equal(ops.exportNewickText(state.treeData), text);
  assert.equal(ops.findNodeById(state.treeData, 0).name, "A");
  const session = JSON.parse(stringifySession({ version: 2, sourceTexts: { nwk: text }, treeData: state.treeData }));
  const restored = validateSession(session);
  assert.equal(ops.exportNewickText(restored.treeData), text);
  for (const mode of ["rectangular", "circular", "unrooted"]) for (const fast of [false, true]) {
    state.layoutMode = mode; state.fastMode = fast;
    renderer.invalidateRenderCache(); renderer.renderTree();
    const html = h.document.getElementById("tree-group").querySelector('[data-render-layer="geometry"]').innerHTML;
    assert.ok(html.length > 10000, mode);
    assert.ok(!/NaN|Infinity/.test(html), mode);
  }
  const snapshot = captureState(state);
  state.treeData = ops.rerootTree(utils.deepCopyNode(state.treeData), 0);
  assert.equal(utils.collectAllTipNames(state.treeData).length, depth + 1);
  restoreHistoryState(state, snapshot);
  assert.equal(ops.exportNewickText(state.treeData), text);
});

test("session serializer matches JSON semantics for plain records and rejects cycles", async () => {
  const { stringifySession } = await (await harness({ withoutDocument: true })).load("json-export");
  const value = { a: '"\\\n', b: [1, null, true, undefined], c: undefined, d: { z: Infinity } };
  assert.deepEqual(JSON.parse(stringifySession(value)), JSON.parse(JSON.stringify(value)));
  const shared = { a: 1 };
  assert.deepEqual(JSON.parse(stringifySession([shared, shared])), [shared, shared]);
  shared.self = shared;
  assert.throws(() => stringifySession(shared), /cyclic/);
});

test("layout coordinates preserve child order, collapse spacing and hidden-tip behavior", async () => {
  const h = await harness({ expose: { "renderer.js": ["buildLayoutMetadata"] } });
  const { parseNewick } = await h.load("parsers");
  const { layoutTree } = await h.load("tree-layout");
  const { buildLayoutMetadata } = await h.load("renderer");
  const { state } = await h.load("state");
  const { reindexTree } = await h.load("tree-utils");
  state.treeData = parseNewick("((A:1,B:2):1,C:3);");
  reindexTree(state.treeData);
  const layout = () => layoutTree(state.treeData, state, buildLayoutMetadata(state.treeData), state.subtreeTipCount);
  let root = layout();
  assert.equal(root.y, 20);
  assert.deepEqual(plain(root.layoutChildren.map(n => [n.x, n.y])), [[800, 8], [2400, 32]]);
  assert.deepEqual(plain(root.layoutChildren[0].layoutChildren.map(n => [n.name, n.x, n.y])), [["A", 1600, 0], ["B", 2400, 16]]);
  state.collapsedNodes.add(state.treeData.ch[0].id);
  root = layout();
  assert.equal(root.layoutChildren[0].tipCount, 2);
  assert.equal(root.layoutChildren[0].layoutChildren, undefined);
  assert.equal(root.layoutChildren[1].y, 16);
  state.hiddenTips.add("A"); state.hiddenTips.add("B");
  root = layout();
  assert.equal(root.layoutChildren.length, 1);
  assert.equal(root.layoutChildren[0].name, "C");
  assert.equal(root.y, 0);
  state.hiddenTips.add("C");
  assert.equal(layout(), null);
});

test("deep experimental JSON extraction and clade matching avoid recursion", async () => {
  const h = await harness({ stubRenderer: true, expose: { "actions.js": ["buildExperimentalNodeIndex"] } });
  const { parseExperimentalAnalysisText } = await h.load("experimental-analysis");
  const { parseNewick } = await h.load("parsers");
  const { state } = await h.load("state");
  const { buildExperimentalNodeIndex } = await h.load("actions");
  const analysis = parseExperimentalAnalysisText("deep.json", '{"nested":'.repeat(10000) + '{"slow_leaves":["A","B"]}' + '}'.repeat(10000));
  assert.equal(analysis.clades.length, 1);
  state.experimentalAnalysis = analysis;
  const tree = parseNewick("(".repeat(10000) + "A,B" + ")".repeat(10000) + ";");
  const matches = buildExperimentalNodeIndex(tree).get(analysis.clades[0].signature);
  assert.equal(matches.length, 10000);
  assert.equal(matches[0].nodeId, 2);
});

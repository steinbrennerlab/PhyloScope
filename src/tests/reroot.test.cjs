const test = require("node:test");
const assert = require("node:assert/strict");
const { harness, plain } = require("./helpers.cjs");
const { families, readFixture, fixtureTarget, edgeMap, checkReroot, tipNames } = require("./reroot-helpers.cjs");

function assertCorrect(source, result, outgroup) {
  const checks = checkReroot(source, result, outgroup);
  assert.deepEqual(Object.entries(checks).filter(([, passed]) => !passed), []);
}

for (const family of families) {
  test(`${family.name}: pinned supports and outgroup survive reroot, export, and session load`, async () => {
    const h = await harness({ stubRenderer: true, expose: { "actions.js": ["loadSessionV2", "rerootAt", "undo", "redo"] } });
    const { parseNewick } = await h.load("parsers");
    const { rerootTree, nodeToNewick } = await h.load("tree-ops");
    const { validateSession } = await h.load("session");
    const { state } = await h.load("state");
    const actions = await h.load("actions");
    const { tree, target, outgroup, depth } = fixtureTarget(parseNewick, family.name);
    const original = readFixture(parseNewick, family.name, "input");
    const expected = readFixture(parseNewick, family.name, "expected");
    assert.equal(tipNames(tree).length, family.tips);
    assert.equal(outgroup.length, family.outgroup);
    assert.equal(depth, family.depth);
    assert.equal([...edgeMap(tree).values()].filter(edge => edge.size > 1).length, family.supports);
    assert.equal(target.bl, family.stem);
    assert.equal(target.sup, 100);
    assertCorrect(original, expected, outgroup); // Positive control.

    const result = rerootTree(tree, target.id);
    assertCorrect(original, result, outgroup);
    assertCorrect(expected, result, outgroup);
    assert.deepEqual(plain(result.ch.map(child => tipNames(child).length)).sort((a, b) => a - b), [family.outgroup, family.tips - family.outgroup]);
    assert.equal(result.ch[0].id, target.id);
    assert.equal(result.ch[0].sup, 100);
    assert.equal(result.ch[1].sup, 100);
    assert.ok(Math.abs(result.ch[0].bl + result.ch[1].bl - family.stem) < 1e-12);
    const exported = nodeToNewick(result) + ";";
    assert.ok(exported.endsWith(");"));
    assertCorrect(original, parseNewick(exported), outgroup);

    const sourceTexts = { nwk: nodeToNewick(original) + ";", nwkName: `${family.name}.nwk` };
    const session = plain({ version: 2, sourceTexts, treeData: result, treeRerooted: true });
    assertCorrect(original, validateSession(session).treeData, outgroup);
    await actions.loadSessionV2(session, false);
    assertCorrect(original, state.treeData, outgroup);

    // Also run the real UI action: its undo snapshots must preserve supports.
    await actions.loadSessionV2({ version: 2, sourceTexts, treeData: original }, false);
    actions.rerootAt(target.id);
    assertCorrect(original, state.treeData, outgroup);
    assert.equal(state.treeRerooted, true);
    actions.undo();
    assert.equal(state.treeRerooted, false);
    assert.deepEqual(plain([...edgeMap(state.treeData)]), plain([...edgeMap(original)]));
    actions.redo();
    assert.equal(state.treeRerooted, true);
    assertCorrect(original, state.treeData, outgroup);
  });
}

test("negative control: buggy RLP passes geometry and fails only support/root checks", async () => {
  const { parseNewick } = await (await harness()).load("parsers");
  const { tree, outgroup } = fixtureTarget(parseNewick, "AT3G05360.1_RLP");
  const buggy = readFixture(parseNewick, "AT3G05360.1_RLP", "buggy");
  assert.deepEqual(checkReroot(tree, buggy, outgroup), {
    tips: true, topology: true, totalLength: true, supports: false,
    lengths: true, rootEdge: false, outgroup: false, rootMetadata: false,
  });
});

test("supports stay on edges through repeated clade and tip reroots, including absent support", async () => {
  const h = await harness();
  const { parseNewick } = await h.load("parsers");
  const { rerootTree } = await h.load("tree-ops");
  const { reindexTree } = await h.load("tree-utils");
  const { state } = await h.load("state");
  const source = "(((A:1,B:2)100:3,C:4)54:5,(D:6,E:7):8,F:9)999;";
  const original = parseNewick(source);
  let tree = parseNewick(source);
  for (const id of [2, 7, 0, 1, 7, 2]) {
    reindexTree(tree);
    const selected = state.nodeById[id];
    const outgroup = tipNames(selected);
    tree = rerootTree(tree, id);
    assertCorrect(original, tree, outgroup);
  }
});

test("conflicting support on an existing degree-two root fails without changing the tree", async () => {
  const h = await harness();
  const { parseNewick } = await h.load("parsers");
  const { rerootTree } = await h.load("tree-ops");
  const tree = parseNewick("((A:1,B:1)70:2,(C:1,D:1)90:3);");
  const before = plain(tree);
  assert.throws(() => rerootTree(tree, 0), /conflicting support/);
  assert.deepEqual(plain(tree), before);
});

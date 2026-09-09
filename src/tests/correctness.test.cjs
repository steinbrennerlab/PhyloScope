const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { harness, plain } = require("./helpers.cjs");

test("Newick preserves quoted labels, escaped quotes, comments and numeric names", async () => {
  const h = await harness();
  const { parseNewick } = await h.load("parsers");
  const { nodeToNewick } = await h.load("tree-ops");
  const { collectAllTipNames } = await h.load("tree-utils");
  const tree = parseNewick("[root] ( 'A,B':1e-3, ('O''Brien':2, A_B:3)[comment[nested]]'123':4 )123abc;");
  assert.deepEqual(plain(collectAllTipNames(tree)), ["A,B", "O'Brien", "A_B"]);
  assert.equal(tree.name, "123abc");
  assert.equal(tree.ch[1].name, "123");
  assert.equal(tree.ch[0].bl, 0.001);
  assert.deepEqual(plain(parseNewick(nodeToNewick(tree) + ";")), plain(tree));
  assert.equal(parseNewick("(A,B)98.5;").sup, 98.5);
  assert.equal(parseNewick("(,B);").ch.length, 2);
});

test("Newick rejects malformed, truncated and multiple-tree inputs", async () => {
  const { parseNewick } = await (await harness()).load("parsers");
  for (const text of ["", ";", "(A:1,B:2", "(A,B)", "(A,B));", "(A:1,B:2);(C,D);", "('A,B);", "(A:abc,B);", "(A:1x,B);", "(A:Infinity,B);", "(A:,B);", "(A,B); [unclosed", "(A B,C);", "(A;B);"]) {
    assert.throws(() => parseNewick(text), /Invalid Newick/, text);
  }
});

test("Newick assigns the same postorder IDs and reads both example trees", async () => {
  const h = await harness();
  const { parseNewick } = await h.load("parsers");
  const { collectAllTipNames } = await h.load("tree-utils");
  const small = parseNewick("((A:1,B:2):3,C:4);");
  assert.equal(small.id, 4);
  assert.equal(small.ch[0].id, 2);
  assert.equal(small.ch[0].ch[0].id, 0);
  for (const [file, count] of [["example1/Phvul.007G077500.1.nwk", 1164], ["example2/combined.aa.fasttree.nwk", 7672]]) {
    const tree = parseNewick(fs.readFileSync(path.join(__dirname, "../../example_data", file), "utf8"));
    assert.equal(collectAllTipNames(tree).length, count);
  }
});

test("Newick parser handles a deep tree without recursion", async () => {
  const { parseNewick } = await (await harness()).load("parsers");
  const depth = 10000;
  assert.equal(parseNewick("(".repeat(depth) + "A" + ",B)".repeat(depth) + ";").id, depth * 2);
});

test("rerooting at every node preserves leaves, tip IDs and pairwise distances", async () => {
  const h = await harness();
  const { parseNewick } = await h.load("parsers");
  const { rerootTree } = await h.load("tree-ops");
  const u = await h.load("tree-utils");
  const { state } = await h.load("state");
  for (const source of ["((A:1,B:2):3,(C:4,D:5):6);", "(A:2,B:4,C:6);", "((A:1,B:2):3);", "(A:1);", "A;", "((A:0,B:0):0,C:0);"]) {
    const original = parseNewick(source);
    u.reindexTree(original);
    const tips = plain(u.collectAllTipNames(original));
    const ids = tips.map(tip => state.tipByName[tip].id);
    const pairs = tips.flatMap(a => tips.map(b => [a, b, u.patristicDistance(a, b)]));
    const targets = Object.keys(state.nodeById).map(Number);
    for (const target of targets) {
      const tree = rerootTree(parseNewick(source), target);
      u.reindexTree(tree);
      assert.deepEqual(plain(u.collectAllTipNames(tree)).sort(), [...tips].sort(), `${source} at ${target}`);
      assert.deepEqual(tips.map(tip => state.tipByName[tip].id), ids);
      assert.equal(Object.keys(state.nodeById).length, new Set(Object.values(state.nodeById).map(n => n.id)).size);
      for (const [a, b, distance] of pairs) assert.ok(Math.abs(u.patristicDistance(a, b) - distance) < 1e-10);
    }
  }
});

test("repeated tip reroots preserve distances and allocate unique IDs", async () => {
  const h = await harness();
  const { parseNewick } = await h.load("parsers");
  const { rerootTree } = await h.load("tree-ops");
  const u = await h.load("tree-utils");
  const { state } = await h.load("state");
  let tree = parseNewick("((A:1,B:2):3,C:4);");
  for (const tip of ["A", "B", "C", "A"]) {
    u.reindexTree(tree);
    tree = rerootTree(tree, state.tipByName[tip].id);
    u.reindexTree(tree);
    assert.equal(u.patristicDistance("A", "B"), 3);
    assert.equal(u.patristicDistance("A", "C"), 8);
    assert.equal(u.collectAllTipNames(tree).length, 3);
  }
});

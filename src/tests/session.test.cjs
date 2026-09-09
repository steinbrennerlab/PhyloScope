const test = require("node:test");
const assert = require("node:assert/strict");
const { harness, plain } = require("./helpers.cjs");

async function setup() {
  const h = await harness({ stubRenderer: true, expose: {
    "actions.js": ["loadSessionV2", "loadSessionV1", "pushUndo", "undo", "redo"],
  } });
  const actions = await h.load("actions");
  const { state } = await h.load("state");
  const { parseNewick } = await h.load("parsers");
  const u = await h.load("tree-utils");
  function session(tree, tip) {
    return { version: 2, treeData: parseNewick(tree), sourceTexts: {
      nwk: tree, nwkName: tip + ".nwk", aa: ">" + tip + "\nAAA", aaName: tip + ".fa",
    } };
  }
  return { h, actions, state, session, u };
}

test("loading a different session clears history and transient UI/data state", async () => {
  const { h, actions, state, session, u } = await setup();
  await actions.loadSessionV2(session("(A:1,B:2);", "A"), false);
  actions.pushUndo();
  state.dotSize = 5;
  actions.undo();
  actions.pushUndo();
  state.redoStack.push(state.undoStack[0]);
  state.sharedNodes.add(2);
  state.selectedNodeTips = ["A"];
  state.nameMatches.add("A");
  h.document.getElementById("name-input").value = "A";
  await actions.loadSessionV2(session("(X:1,Y:2);", "X"), false);
  assert.equal(state.undoStack.length, 0);
  assert.equal(state.redoStack.length, 0);
  assert.equal(state.sharedNodes.size, 0);
  assert.equal(state.nameMatches.size, 0);
  assert.equal(state.selectedNodeTips.length, 0);
  assert.equal(h.document.getElementById("name-input").value, "");
  actions.undo(); actions.redo();
  assert.deepEqual(plain(u.collectAllTipNames(state.treeData)), ["X", "Y"]);
  assert.deepEqual(Object.keys(state.proteinSeqs), ["X"]);
  assert.equal(state.nwkName, "X.nwk");
  assert.equal(h.document.getElementById("undo-btn").disabled, true);
});

test("invalid sessions leave the live workspace and history intact", async () => {
  const { actions, state, session } = await setup();
  await actions.loadSessionV2(session("(A,B);", "A"), false);
  actions.pushUndo();
  const originalTree = state.treeData;
  const originalSequences = state.proteinSeqs;
  for (const mutate of [
    s => { s.layoutMode = '\"><img src=x onerror=alert(1)>'; },
    s => { s.dotSize = '3" onmouseover="alert(1)'; },
    s => { s.speciesColors = { species: 'red" onload="alert(1)' }; },
    s => { s.treeData.ch[0].id = s.treeData.id; },
    s => { s.treeData.ch[0].bl = "bad"; },
    s => { s.treeData.ch = "bad"; },
    s => { s.sourceTexts.nwk = "(broken"; },
    s => { s.activeHeatmaps = [{ name: "missing.txt" }]; },
  ]) {
    const candidate = session("(X,Y);", "X"); mutate(candidate);
    await assert.rejects(() => actions.loadSessionV2(candidate, false));
    assert.equal(state.treeData, originalTree);
    assert.equal(state.proteinSeqs, originalSequences);
    assert.equal(state.undoStack.length, 1);
    assert.equal(state.nwkName, "A.nwk");
  }
});

test("sessions retain topology IDs, annotations, species and view settings", async () => {
  const { actions, state, session, u } = await setup();
  const candidate = session("((Aa:1,Bb:2):3,Cc:4);", "Aa");
  candidate.sourceTexts.speciesConfig = { mode: "tip-labels" };
  candidate.treeData.ch[0].x = '0" onload="alert(1)';
  Object.assign(candidate, {
    nodeLabels: { 2: 'clade <A&B> "quoted"' }, nodeLabelColors: { 2: "#123456" },
    cladeColors: { 2: "#abcdef" }, tipMarkers: { Aa: { text: "marker", color: "#e22", icon: "star" } },
    collapsedNodes: [2], hiddenTips: ["Cc"], scale: 2, tx: -10, ty: 35,
    layoutMode: "circular", speciesColors: { Aa: "#aabbcc" },
  });
  await actions.loadSessionV2(candidate, false);
  assert.equal(state.treeData.ch[0].x, undefined);
  assert.equal(state.nodeLabels[2], candidate.nodeLabels[2]);
  assert.equal(state.nodeLabelColors[2], "#123456");
  assert.equal(state.tipMarkers.Aa.icon, "star");
  assert.equal(state.collapsedNodes.has(2), true);
  assert.equal(state.hiddenTips.has("Cc"), true);
  assert.equal(state.speciesColors.Aa, "#aabbcc");
  assert.equal(state.tipByName.Aa.sp, "Aa");
  assert.equal(state.scale, 2);
  assert.equal(state.tx, -10);
  assert.equal(state.layoutMode, "circular");
  assert.equal(u.patristicDistance("Aa", "Cc"), 8);
});

test("legacy v1 settings are validated before application", async () => {
  const { actions, state, session } = await setup();
  await actions.loadSessionV2(session("(A,B);", "A"), false);
  actions.loadSessionV1({ version: 1, layoutMode: "circular", nodeLabels: { 2: "legacy" } }, false);
  assert.equal(state.layoutMode, "circular");
  assert.equal(state.nodeLabels[2], "legacy");
  assert.throws(() => actions.loadSessionV1({ version: 1, scale: 0 }, false), /Invalid session/);
});

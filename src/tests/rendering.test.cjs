const test = require("node:test");
const assert = require("node:assert/strict");
const { harness } = require("./helpers.cjs");

test("labels, markers and attributes are escaped in every layout and fast mode", async () => {
  const h = await harness();
  const renderer = await h.load("renderer");
  const { state } = await h.load("state");
  const { reindexTree } = await h.load("tree-utils");
  const { escapeHtml } = await h.load("html-utils");
  const name = 'A" onmouseover="alert(1)<&';
  const label = '<script>alert(1)</script> & "clade"';
  const marker = '<img src=x onerror="alert(1)">';
  state.treeData = { id: 2, bl: 0, ch: [{ id: 0, bl: 1, name, sp: 'species" <&' }, { id: 1, bl: 2, name: "B" }] };
  state.tipMarkers[name] = { text: marker, color: "#123456", icon: "star" };
  state.nodeLabels[2] = label;
  state.nodeLabelColors[2] = "#abcdef";
  reindexTree(state.treeData);
  for (const layout of ["rectangular", "circular", "unrooted"]) {
    for (const fast of [false, true]) {
      state.layoutMode = layout; state.fastMode = fast;
      renderer.renderTree();
      const group = h.document.getElementById("tree-group");
      const html = ["geometry", "labels", "hit-targets"].map(layer => group.querySelector(`[data-render-layer="${layer}"]`).innerHTML).join("");
      assert.ok(html.includes(escapeHtml(name)), `${layout} fast=${fast}: name`);
      assert.ok(html.includes(escapeHtml(label)), `${layout} fast=${fast}: clade`);
      assert.ok(html.includes(escapeHtml(marker)), `${layout} fast=${fast}: marker`);
      assert.ok(!html.includes('<script>'));
      assert.ok(!html.includes('<img'));
      assert.ok(!html.includes(' onmouseover="'));
      assert.ok(!html.includes(' onerror="'));
    }
  }
});

test("collapsed clade labels and tip markers are escaped", async () => {
  const h = await harness();
  const renderer = await h.load("renderer");
  const { state } = await h.load("state");
  const { reindexTree } = await h.load("tree-utils");
  state.treeData = { id: 2, bl: 0, ch: [{ id: 0, bl: 1, name: 'A"' }, { id: 1, bl: 1, name: "B" }] };
  state.collapsedNodes.add(2);
  state.nodeLabels[2] = "<img src=x>";
  state.tipMarkers['A"'] = { text: "<script>bad</script>", color: "#e22", icon: "dot" };
  reindexTree(state.treeData);
  renderer.renderTree();
  const html = h.document.getElementById("tree-group").querySelector('[data-render-layer="geometry"]').innerHTML;
  assert.ok(html.includes("&lt;img src=x&gt;"));
  assert.ok(html.includes("&lt;script&gt;bad&lt;/script&gt;"));
  assert.ok(html.includes('data-tip="A&quot;"'));
});

test("loaded filenames and alignment previews render imported text literally", async () => {
  const h = await harness({ stubRenderer: true, expose: { "actions.js": ["showLoadedInfo", "updateExportPreview"] } });
  const actions = await h.load("actions");
  const { state } = await h.load("state");
  state.loaded = true; state.hasFasta = true;
  state.nwkName = '<img src=x onerror="alert(1)">.nwk';
  state.aaName = "<script>bad</script>.fa";
  actions.showLoadedInfo(2);
  const html = h.document.getElementById("loaded-info").innerHTML;
  assert.ok(html.includes("&lt;img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<img"));
  state.selectedNodeTips = ["<tip>"];
  state.proteinSeqs = { "<tip>": "<img src=x>" };
  h.document.querySelector = () => ({ value: "columns" });
  actions.updateExportPreview();
  const preview = h.document.getElementById("export-preview").innerHTML;
  assert.ok(preview.includes("&lt;tip&gt;"));
  assert.ok(preview.includes("&lt;img src=x&gt;"));
});

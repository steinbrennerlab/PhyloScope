# PhyloScope Fix Tracker

Updated 2026-09-09. This is the current review/fix list. The original standalone migration plan is retained below as historical context; the shipped build is now `docs/`.

## Remaining fixes, in priority order

### Critical / high: re-rooting is reopened

- [ ] **R1 — Critical: preserve support on its bipartition.** When an edge reverses direction, its support must move together with its length. The current implementation moves lengths but leaves support on node objects. Confirmed reproduction: `(((O1:1,O2:1)100:2,A:1)54:3,B:1,C:1);` rooted at the O1/O2 MRCA changes the outgroup support from 100 to 54 and loses the support on the next bipartition. Topology and patristic-distance tests alone do not detect this.
- [ ] **R2 — High: root on the outgroup stem, not at its MRCA.** Insert a root on the selected clade's incoming edge so the outgroup remains a complete root child. The reported tree must have basal groups of 2 and 289 tips, instead of 1, 1, and 289. The earlier fix only added edge rooting for individual tips.
- [ ] **R3 — Low, complete with R1: remove orphaned root support.** The new root has no incoming edge and must not inherit a spurious `)100;` label. Support must remain on the appropriate represented bipartition.

Acceptance checks for this repair, based on the supplied report summary:

1. Preserve the tip set, tip IDs, topology as unrooted bipartitions, and patristic distances.
2. Compare every canonical bipartition's length and support before/after. Account for the two new root edges as representations of one original edge: compare their combined length and consistent support, rather than overwriting duplicate split keys. Use a stated numeric tolerance for computed lengths.
3. Require two root children for outgroup-edge rooting, with the exact requested outgroup as one child. Check the reported 2/289 split and a small synthetic fixture.
4. Require no orphaned support label on the new root and no lost or reassigned support on reversed edges.
5. Add the exact three family trees and known-good values as regression fixtures when available. The report states 288/203/177 supports and outgroup stems 10/3/5 edges from the input roots; XII is 5 edges, XI is 3. Independently check the reported `ete3.set_outgroup()` results as a possible oracle. The full report and family fixtures have not yet been supplied in this workspace.
6. Exercise Newick export/reparse and session save/load of the re-rooted result; ensure bipartition attributes survive both. Add these checks to the automated suite before marking re-rooting complete.

### Medium: scientific calculations and large inputs

- [ ] **M1 — Pairwise identity/similarity.** Normalize residue case before identity comparison and replace the incorrect hardcoded positive-score BLOSUM62 pair list with a verified matrix/scoring rule. `ac` versus `AC` currently reports 0% identity; A/G is incorrectly positive and Q/R is missed.
- [ ] **M2 — PROSITE terminal anchors.** Recognize leading `<` and trailing `>` independently of hyphen-separated tokens. Add terminal-pattern fixtures from the PROSITE manual.
- [ ] **M3 — Large heatmaps and deep-tree operations.** Replace `Math.min(...numericValues)` / `Math.max(...numericValues)` with incremental extrema; a 10,000-tip by 20-column heatmap currently throws a RangeError. The parser now uses iterative frames, but other recursive tree operations still need deep-tree coverage and repair where necessary.

### Low / cosmetic: export fidelity

- [ ] **E1 — Preserve branch-length formatting where unchanged.** Keep source numeric tokens for unchanged lengths, including RAxML trailing zeros (`0.434680`). Define formatting for genuinely changed lengths after splitting or combining edges. The report identifies 53 of 579 reformatted lengths; that exact count is not independently verified here.
- [ ] **E2 — End exported Newick files with a newline.** Current download output ends at the semicolon.

### Follow-up improvements and verification

- [ ] **Q1 — Import validation report.** Flag duplicate FASTA identifiers, unequal alignment lengths, unmatched tips, and malformed numeric cells. Duplicate IDs currently overwrite sequences, and `12oops` is accepted as 12.
- [ ] **Q2 — Expand regression coverage and add CI.** The initial 13 tests pass, but do not establish support/bipartition preservation. Add the re-rooting acceptance checks and regressions for the remaining fixes, then automate tests and build checks in CI.
- [ ] **Q3 — Browser verification.** Exercise loading, re-rooting, undo/redo, all layouts, exports, and session replacement in a real browser. No browser was connected during the first fix pass; DOM stand-in tests are not browser interaction tests.
- [ ] **Q4 — Separate domain state from DOM/UI code.** Continue extracting session/history and scientific operations from the large `actions.js` module; importing tree utilities still indirectly accesses `document`.

## Implemented in the first pass

- [x] Strict Newick structure and branch-length validation; quoted labels, escaped quotes, comments, and quoted export round trips; iterative parsing with unchanged postorder IDs for existing examples.
- [x] HTML/SVG escaping of imported labels, annotations, filenames, and sequence previews; validation of session-supplied rendering settings.
- [x] Session replacement clears old undo/redo history and transient workspace state; malformed saved data/settings are checked before replacing the live workspace.
- [x] Individual-tip re-rooting preserves leaves, tip IDs, and distances. **Partial re-rooting fix only; R1–R3 above remain open.**
- [x] Initial 13 regression tests and rebuilt `docs/` distribution verified against source. Build now overwrites generated files without deleting the output directory, avoiding the observed Windows directory-deletion failure.

---

# Historical Plan: Standalone PhyloScope

## Summary

Convert PhyloScope to a browser-only app, but ship it as a built `src/dist/` bundle rather than raw source files. This is the safest way to support both static hosting and direct `file://` use without the current `/static/...` and ES-module assumptions.

Keep the existing renderer and most of `tree-utils.js`; move backend-only parsing, tree mutation, export, and dataset logic into a new client-side data layer.

Do not delete `src/app.py`, `src/run.sh`, or `environment.yml` until the standalone bundle reaches feature parity and the docs are updated. Use the Python app as the migration oracle during implementation.

## Key Changes

### Runtime and packaging

- Add a small dev-only build step with esbuild and a `src/package.json`.
- Source remains modular under `src/static/js/`; build output is a bundled `src/dist/index.html`, `app.bundle.js`, `style.css`, `logo.png`, `jspdf.umd.min.js`, and `svg2pdf.umd.min.js`.
- Remove absolute `/static/...` references in source templates; emitted bundle uses relative paths only.
- **Acceptance criterion:** opening `src/dist/index.html` must make zero `/api/...` requests and zero absolute `/static/...` requests.

### Client data layer

- Add `src/static/js/parsers.js` with `parseNewick`, `parseFastaText`, `parseNumericValue`, `parseDatasetText`, and `prositeToRegex`.
- Add `src/static/js/tree-ops.js` with `annotateSpecies`, `buildSpeciesMapFromFiles`, `findNodesWithSpecies`, `rerootTree`, `nodeToNewick`, `refPosToColumns`, `computePairwiseIdentity`, and `buildExportFasta`.
- Keep the canonical tree shape as the current frontend wire format: `{ id, bl, name?, sup?, sp?, ch? }`. Internal-only annotations may add `descendantSpecies`.
- Reuse existing helpers in `tree-utils.js` for indexing, copying, tip collection, and patristic distance rather than reimplementing them.

### Loading flow and UI

Replace path-entry and server-side browse UI with:

- **Primary:** folder picker using `<input type="file" webkitdirectory multiple>`.
- **Secondary fallback:** multi-file picker for users who cannot provide a recursive folder selection.
- **Optional enhancement:** drag-and-drop, but only if implemented with the browser's directory APIs; it is not required for parity.

Keep the detected-files panel, but convert tree/alignment fields from free-text inputs to selectors:

- **Tree:** required, user must choose one `.nwk` if multiple are present.
- **Alignment:** optional, default to the first `.aa.fa`, with an explicit "None" choice.

`file-loader.js` should scan files by relative path, build an in-memory workspace, and populate state with raw texts, parsed data, and lazy dataset handles.

`state.js` should remove `inputDir`, `browserCurrentDir`, and `browserParentDir`, and add:

- `loaded`, `gene`, `nwkName`, `aaName`, `numSeqs`, `numSpecies`
- `proteinSeqs`, `proteinSeqsUngapped`, `tipLengths`
- `sourceFiles` or equivalent raw-text/file-handle store
- `datasetFileObjects`, `parsedDatasets`

`init()` becomes a state/bootstrap routine with no status fetch. `checkStatus()` becomes "show setup or restore session" logic only.

### Behavior replacement

Replace every `fetch("/api/...")` flow in `actions.js` with local helpers:

- `loadTipDatalist`, `copyTipFasta`, `openExportPanel`, `searchMotif`, `highlightSharedNodes`, `comparePairwise`, `refreshDatasetList`, `loadHeatmapDataset`, `doExport`, `exportNewick`, `copyNewick`, `rerootAt`, setup load/reset.

Keep dataset loading lazy:

- Store dataset files in state.
- Parse on first use.
- Cache parsed results by dataset name.

After reroot, re-annotate species, rebuild node indexes, clear subtree/full-tree view as the current UI already expects.

Undo/redo and sessions must use the same client-owned tree state, which also fixes the current client/server drift after rerooting.

### Sessions and compatibility

Replace the current path-based session format with **version: 2** self-contained sessions.

v2 session payload must include:

- **Source texts:** selected `.nwk`, optional `.aa.fa`, all orthofinder species FASTAs needed for mapping, and all dataset `.txt` files so the restored session keeps the dataset picker functional.
- **View state:** current `treeData`, optional `fullTreeData`, collapsed nodes, labels, hidden tips, selected/export node, zoom/pan, layout toggles, checked/excluded species, motifs, active heatmaps.

This is a deliberate change from the current app: sessions should restore rerooted and subtree-focused state, not just the original input location.

Support old **version: 1** sessions as best-effort import:

- Read their UI settings.
- Prompt the user to provide the source files/folder manually.
- Apply only the settings that still map cleanly after load.

## Implementation Order

### Phase 1: Core Parsers
Create `parsers.js`: `parseNewick()`, `parseFastaText()`, `prositeToRegex()`, `parseNumericValue()`, `parseDatasetText()`. Test by comparing output against the Python app with `example_data/`.

### Phase 2: Tree Operations
Create `tree-ops.js`: `nodeToNewick()`, `findNodesWithSpecies()`, `annotateSpecies()`, `buildSpeciesMapFromFiles()`, `rerootTree()` (hardest), `refPosToColumns()`, `computePairwiseIdentity()`, `buildExportFasta()`.

### Phase 3: File Loading Infrastructure
Create `file-loader.js`: `detectFiles()`, `loadFromFiles()`. Wires together parsers and tree-ops.

### Phase 4: Replace All Fetch Calls in actions.js
Replace all `fetch("/api/...")` calls with local function calls. Work from simplest to most complex:
1. Simple reads: `refreshDatasetList`, `loadTipDatalist`, `openExportPanel`
2. Computation: `searchMotif`, `highlightSharedNodes`, `comparePairwise`
3. Export: `doExport`, `exportNewick`, `copyNewick`, `copyTipFasta`, `copyNodeFasta`
4. Reroot: `rerootAt`
5. Loading flow: `doSetupLoad`, `init`, `checkStatus`, `loadSession`

### Phase 5: Setup UI Redesign
Modify `index.html`: folder picker + multi-file fallback. Wire events in `actions.js` `bindStartupControls()`.

### Phase 6: Session Handling
Redesign `saveSession()` and `loadSession()` to use v2 self-contained format with v1 backward compat.

### Phase 7: Build Pipeline
Add `src/package.json` with esbuild. Build to `src/dist/` with bundled HTML, JS, CSS, and assets. Relative paths only.

### Phase 8: Cleanup
Update README. Keep `app.py`, `run.sh`, `environment.yml` in-repo until parity is confirmed.

## Test Plan

Parity-check the standalone app against the current FastAPI app using `example_data/`.

Verify these outputs match between old and new implementations:

- tree parse shape
- species mapping
- motif matches
- shared-node results
- reroot result
- pairwise identity
- dataset parsing summary
- FASTA export
- Newick export

Run full UI regressions:

- load data
- select node and copy/export
- reroot
- undo/redo
- subtree focus and return
- motif search
- heatmap add/remove
- session save/load
- reset and reload

Distribution smoke tests:

- open `src/dist/index.html` directly from disk
- serve `src/dist/` from a simple static server
- confirm no backend dependency in either case

## Assumptions

- A dev-time build dependency is acceptable; the no-install goal applies to end users of the shipped app, not contributors.
- Session files may become large because they are self-contained; compression and "lightweight session" variants are out of scope for this pass.
- Drag-and-drop directory loading is a nice-to-have, not the primary compatibility path.
- Backend cleanup happens only after the standalone bundle is verified; until then, the Python app remains in-repo as the reference implementation.

## End Result

A `src/dist/` folder you can open directly in a browser or host on any static server. No Python, no server, no install required. Could be zipped into a single distributable archive.

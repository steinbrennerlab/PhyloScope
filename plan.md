# PhyloScope Fix Tracker

Updated 2026-09-09. This is the current review/fix list. The original standalone migration plan is retained below as historical context; the shipped build is now `docs/`.

## Fix status, in priority order

### BAT import follow-up completed

- [x] **B1: Scope companion files to the selected tree's run.** All trees remain selectable, but alignments, species files, datasets, and experimental JSON default to that BAT run (or the tree's directory for other layouts). Scope changes refresh the pickers; missing files do not fall back to other runs. An explicit All selected folders override is available. Relative paths distinguish duplicate tree/alignment filenames.
- [x] **B2: Merge consistent species files and reject conflicting assignments.** Files for the same species contribute a deduplicated union of tips. Cross-species assignments report the tip, species, and source paths and stop file/session import before changing the current workspace. Regression coverage includes run isolation, override behavior, merging, and failure atomicity. The suite now has 37 passing tests.

### Re-rooting repair completed and verified

- [x] **R1: Preserve support on its bipartition.** Re-rooting now transfers length and support together on undirected edges, including absent support. The old node-attached support-shifting behavior is covered by the pinned negative fixture.
- [x] **R2: Root on the outgroup stem.** Tip and internal-clade selections insert a two-child root on the incoming edge, retaining the complete selected outgroup. Verified root splits: RLP 2/289, XI 49/157, XII 5/175.
- [x] **R3: Remove orphaned root support.** New roots have no label or incoming length; both root children carry the original stem support and their lengths sum to its length. Existing degree-two roots are suppressed before re-rooting; conflicting explicit support values are reported instead of silently choosing one.

Validation completed:

- Copied the supplied report, pinned family fixtures, and unchanged `validate_reroot.py` into `src/tests/fixtures/`. Source depths are RLP 10, XI 3, XII 5; internal support counts are 288/203/177.
- All three known-good outputs pass the Python checker **8/8, exit 0**.
- The known-buggy RLP output still fails **4/8, exit 1**, at checks 4, 6, 7, and 8. Its topology and branch-length checks still pass, as required for this negative control.
- All three newly generated PhyloScope outputs pass **8/8, exit 0**, preserving every bipartition's support and length and the requested outgroup.
- **19 JavaScript tests pass**, including the same bipartition checks after export/reparse, session load, and UI-action undo/redo; repeated tip/clade re-rooting; missing support; and explicit rejection of conflicting root-edge supports.
- Reproduce the independent check with `npm run test:reroot-validator` in `src/` (Python with ete3 required). No Python dependency was added to the browser app. Numeric root halves are unrounded; unchanged source formatting is now preserved (E1 below).

### Medium: scientific calculations and large inputs

- [x] **M1: Pairwise identity/similarity.** Case is normalized for identity. Similarity uses strictly positive scores from the full public-domain NCBI BLOSUM62 matrix. All 625 entries are tested against the pinned original source, including A/G = 0 and Q/R = 1.
- [x] **M2: PROSITE terminal anchors.** Attached and separate terminal anchors, repeats, classes/exclusions, and final `[G>]` alternatives are supported. Manual examples and malformed-pattern regressions pass.
- [x] **M3: Large heatmaps and deep-tree operations.** Extrema accumulate without argument spreading. Traversal, copying, annotations, lookup, normal/fast layout rendering, experimental split extraction, auto-collapse, Newick and session JSON export avoid recursion. Tests cover 200,000 cells and a 10,000-level tree across all three layouts.

### Low / cosmetic: export fidelity

- [x] **E1: Preserve branch-length formatting where unchanged.** Source numeric tokens travel with edges and survive copying and validated sessions. All three pinned families retain every unchanged edge token. Changed split/combined lengths use shortest round-trip numeric spelling without forced rounding.
- [x] **E2: End exported Newick files with a newline.** Both download and clipboard actions use the same serializer ending in `;\n`; the independent validator runner uses it too.

### Follow-up improvements and verification

- [x] **Q1: Import validation report.** The loaded-data panel reports unequal alignment lengths, unmatched/missing tips, dataset errors, and malformed numeric cells with examples. Duplicate FASTA/tree IDs reject loading; duplicate dataset identifiers/columns cannot activate. Numeric parsing requires complete finite decimals. Files and sessions share one workspace builder.
- [x] **Q2: Expand regression coverage and add CI.** 29 JavaScript tests pass, along with all positive/generated Python checks (8/8) and the required buggy negative control (4/8, exit 1). GitHub Actions runs tests, the independent validator, and distribution freshness checks on Node 22/24. Remote CI execution awaits push.
- [ ] **Q3: Browser verification — blocked by environment.** Rechecked this pass: the browser runtime returns no available browser (`[]`). Loading, rerooting, undo/redo, layouts, exports, and session replacement still need real browser interaction tests; the manual checklist is in `src/tests/README.md`.
- [x] **Q4: Separate domain state from DOM/UI code.** DOM references moved to `dom.js`; pure traversal, layout, BLOSUM62 scoring, history transitions, and JSON export have dedicated modules. The file/session workspace builder is shared. Domain modules are tested without `document`.

## Implemented in the first pass

- [x] Strict Newick structure and branch-length validation; quoted labels, escaped quotes, comments, and quoted export round trips; iterative parsing with unchanged postorder IDs for existing examples.
- [x] HTML/SVG escaping of imported labels, annotations, filenames, and sequence previews; validation of session-supplied rendering settings.
- [x] Session replacement clears old undo/redo history and transient workspace state; malformed saved data/settings are checked before replacing the live workspace.
- [x] The initial tip-only preservation fix has been superseded by the verified R1–R3 edge-rooting repair above.
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

# Bug report: outgroup rerooting corrupts bootstrap support values and leaves the root trifurcating

## Summary

The reroot step produces a tree whose topology and branch lengths are correct but
whose **bootstrap support values are shifted by one edge** along the path between
the old and new root, and whose **root is trifurcating** rather than bifurcating.
The output is silently wrong: it loads fine in iTOL and looks plausible, but nine
internal branches — including the outgroup branch itself — display the wrong
bootstrap value.

- Input:  `AT3G05360.1_RLP.nwk` (RAxML-NG bootstrap support tree, byte-identical
  to `AT3G05360.1_RLP.raxml.support`), 291 tips, unrooted/trifurcating root with
  children of 283 / 6 / 2 leaves
- Output: `AT3G05360.1_RLP_reroot.nwk`
- Intended outgroup: `Solyc04g056640.1.1`, `Vigun05g057100` — already a direct
  child of the input's trifurcating root, with branch length `0.891415` and
  support `100`

## Bug 1 (critical): support values shift one edge toward the old root

Newick writes an internal label after the node's closing paren, which makes it
*look* node-attached, but the value describes the **bipartition of the branch
below that node**. Rerooting inverts the parent/child relationship for every
node on the path from the old root to the new root, so any implementation that
carries labels along with node objects slides all of them one edge toward the
old root.

In this tree the path from the new root to the old root is 10 edges long. All 10
were relabeled; 9 ended up with an observably different value (the 10th shifted
`100 → 100` and so is invisible):

| clade size | correct support | output support |
|---|---|---|
| 2  (the outgroup itself) | 100 | **54** |
| 3  | 54  | **18** |
| 4  | 18  | **38** |
| 8  | 100 | **absent** |
| 11 | 61  | **100** |
| 16 | 100 | **61** |
| 27 | 91  | **100** |
| 29 | 100 | **91** |
| 31 | 38  | **100** |

The shift is exactly one step: each edge on the path received the support of its
neighbour toward the old root. The last edge on the path lost its label
entirely, and the orphaned `100` was emitted as a label on the root node.

This is the most serious part of the bug because nothing about the output looks
broken. The outgroup branch is reported as 54% supported when the data actually
give it 100%.

## Bug 2 (high): root is trifurcating — rooted *at* the node, not *on* the branch

The output root has three children: `(Solyc04g056640.1.1, Vigun05g057100, (rest))`
— i.e. leaf counts `[1, 1, 289]`. The tree was re-hung at the MRCA node of the
outgroup instead of at a point on the branch subtending it, so:

- the tree is still formally unrooted, and tools that require a rooted tree
  (ancestral state reconstruction, node-age code, some `treeio`/`ggtree` paths)
  will either refuse it or silently re-root it themselves;
- in iTOL the outgroup renders as two loose basal tips rather than as a basal
  clade, so it does not read as an outgroup at all.

Expected: a bifurcating root whose two children are the outgroup clade and the
ingroup clade, with the outgroup's stem length (`0.891415`) split between them.

## Bug 3 (low): spurious root label emitted

The output ends `...)54:0.891415)100;` — a bare `100` on the root node. The root
of a tree does not correspond to any bipartition, so this value is meaningless.
It is the orphaned label from Bug 1. Some parsers accept it as a root support,
some reject the file.

## Bug 4 (cosmetic): branch-length formatting and missing trailing newline

RAxML-NG writes fixed 6-decimal lengths; all 579 in the input match `%.6f`. The
output re-renders them `%g`-style, so 53 of 579 lose their trailing zeros
(`0.434680` → `0.43468`). Numerically identical, but it makes `diff` against the
input useless for spotting real changes. The output also has no trailing newline,
where the input does.

## What was NOT affected

Worth stating so the fix can be scoped narrowly — the rerooting geometry is fine,
it is only label placement and root degree that are wrong:

- tip set identical (291 tips)
- unrooted topology identical (Robinson-Foulds = 0 / 576)
- all 579 branch lengths numerically identical to 1e-6
- total tree length identical (113.187112)
- all 288 internal bipartitions present and unchanged

## Suggested fix

Key every edge by its **bipartition** before rerooting, then re-attach lengths
and supports from that map afterwards:

1. Pick a fixed reference tip. For each non-root node, the canonical key is its
   leaf set, or the complement if the leaf set contains the reference tip.
2. Build `key -> (length, support)` from the input tree.
3. Reroot on the branch subtending the outgroup (bifurcating root).
4. For every non-root node in the rerooted tree, look up its key and restore
   length and support.
5. The root edge is the one edge that appears as *both* root children, since
   their bipartitions are complements. Give each child half the length and the
   same support. Round the second half as `L - first_half` at output precision so
   the two halves still sum exactly to the source length.
6. Do not write a label or length on the root node itself.

For reference, `ete3`'s `Tree.set_outgroup()` does **not** have this bug: tested
against three families of these trees (291 / 206 / 180 tips, with the outgroup
stem sitting 10, 3 and 5 edges from the input root respectively), it misplaced
0 of 288 / 203 / 177 internal supports. So it may be usable directly, or as an oracle.

## Acceptance test

A reroot is correct if and only if all of these hold against the input tree.
Please check all of them, not just the topology — Bug 1 passes a topology check.

1. Tip sets identical.
2. Unrooted Robinson-Foulds distance = 0.
3. Total branch length preserved exactly at output precision.
4. **For every bipartition, `(branch length, support)` is identical to the
   input.** This is the check that catches Bug 1. The only permitted exception
   is the root edge, whose two halves must sum to the input length and must both
   carry the input support.
5. Root has exactly 2 children, and the smaller one's leaf set is exactly the
   requested outgroup.
6. No label or length written on the root node; file ends `);`.

Fixtures and a ready-to-run checker are in `reroot_validation/`:
`<fam>.input.nwk` (the reroot input), `<fam>.outgroup_ref.nwk` (its smaller
basal child is the outgroup to use), `<fam>.expected.nwk` (known-good output),
`AT3G05360.1_RLP.buggy.nwk` (the output this report describes), and
`validate_reroot.py`, which implements all six checks above and exits nonzero on
failure:

```
python validate_reroot.py <fam>.input.nwk <your_output>.nwk --outgroup-ref <fam>.outgroup_ref.nwk
```

Three families are included, with the outgroup stem 10, 3 and 5 edges from the
input root, since a support-shifting bug scales with that distance.

The buggy fixture scores 4/8: it **passes** tip set, unrooted topology, total
tree length and per-branch lengths, and fails only the support and root checks.
So a fix is demonstrated only if `expected.nwk` passes *and* `buggy.nwk` still
fails — if both pass, the checker isn't wired up right.

Known-good answer for this tree, for a regression test:

```
root children:        [2 leaves, 289 leaves]
outgroup clade:       (Solyc04g056640.1.1, Vigun05g057100) support 100
root edge halves:     0.445707 + 0.445708 = 0.891415
first 80 chars:       ((Solyc04g056640.1.1:0.323105,Vigun05g057100:0.327885)100:0.445707,(Solyc02g0685
supports on the 9 clades in the Bug 1 table, by clade size:
  2:100  3:54  4:18  8:100  11:61  16:100  27:91  29:100  31:38
```

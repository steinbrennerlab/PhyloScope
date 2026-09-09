# Reroot validation fixtures

Regression fixtures and a standalone checker for the outgroup-rerooting bug
described in `../reroot_bug_report.md`.

## Files

| file | what it is |
|---|---|
| `validate_reroot.py` | standalone checker; exits 0 on pass, 1 on any failure |
| `*.input.nwk` | RAxML-NG bootstrap support tree, the input to the reroot step (unrooted, trifurcating root) |
| `*.outgroup_ref.nwk` | earlier tree for the same family; its smaller basal child defines the outgroup we want |
| `*.expected.nwk` | known-good rerooted output |
| `AT3G05360.1_RLP.buggy.nwk` | the incorrect output that prompted the report — the negative fixture |

Three families are included because they exercise different reroot depths. The
outgroup stem sits 10, 3 and 5 edges from the input root for RLP, XI and XII
respectively; a support-shifting bug scales with that distance, so RLP is the
most sensitive case and XI the least.

| family | tips | outgroup | n |
|---|---|---|---|
| AT3G05360.1_RLP | 291 | Solyc04g056640.1.1, Vigun05g057100 | 2 |
| AT1G73080.1_XI | 206 | clade incl. AT1G35710, AT4G08850, GSPR1, GSPR2, GmP98R1, LNR | 49 |
| AT5G20480.1_XII | 180 | LOC_Os04g52780, AT5G46330, Vigun03g145600, Solyc02g070890.3.1, Solyc02g070910.3.1 | 5 |

## Usage

Reroot `<fam>.input.nwk` on the outgroup with the code under test, then:

```
python validate_reroot.py <fam>.input.nwk <your_output>.nwk --outgroup-ref <fam>.outgroup_ref.nwk
```

or name the outgroup directly:

```
python validate_reroot.py <fam>.input.nwk <your_output>.nwk --outgroup TIP1,TIP2
```

Requires `ete3` (used only to parse Newick and compute Robinson-Foulds, not to
reroot — so it does not assume the implementation under test uses ete3).

## Expected outcomes

```
validate_reroot.py AT3G05360.1_RLP.input.nwk AT3G05360.1_RLP.expected.nwk ...  -> PASS 8/8, exit 0
validate_reroot.py AT3G05360.1_RLP.input.nwk AT3G05360.1_RLP.buggy.nwk    ...  -> FAIL 4/8, exit 1
```

The buggy fixture fails checks 4, 6, 7 and 8 and passes 1, 2, 3 and 5. That
pass/fail split is the point of the fixture: **tip set, unrooted topology, total
tree length and per-branch lengths are all correct in the buggy file.** Any test
that only compares topology or branch lengths will call it good. The failing
checks report the outgroup branch's support as 54 where the source says 100,
plus eight more shifted values, a trifurcating root, and a stray root label.

Run both fixtures. A fix is only demonstrated if `expected` passes *and*
`buggy` still fails — if both pass, the checker is not being applied correctly.

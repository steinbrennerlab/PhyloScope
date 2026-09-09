#!/usr/bin/env python
"""Validate that a rerooted Newick tree preserves everything except root placement.

    python validate_reroot.py SOURCE.nwk REROOTED.nwk --outgroup-ref REF.nwk
    python validate_reroot.py SOURCE.nwk REROOTED.nwk --outgroup TIP1,TIP2

Exit status 0 if every check passes, 1 otherwise.

The check that matters is #4: for every bipartition, (branch length, support)
must be identical to the source. A reroot that carries support labels with node
objects instead of with bipartitions passes a topology comparison and fails
this one.
"""
import argparse
import sys

from ete3 import Tree


def canonical(leafset, allset, ref):
    """Key identifying the EDGE a node subtends, independent of root placement."""
    return frozenset(leafset) if ref not in leafset else frozenset(allset - leafset)


def edge_map(tree, allset, ref):
    """canonical key -> (summed length, support). Root children of a bifurcating
    tree share one key; their lengths sum to that single edge."""
    m = {}
    for n in tree.traverse():
        if n.is_root():
            continue
        k = canonical(set(n.get_leaf_names()), allset, ref)
        if k in m:
            m[k] = (round(m[k][0] + n.dist, 6), m[k][1])
        else:
            m[k] = (round(n.dist, 6), n.support)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("rerooted")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--outgroup", help="comma-separated tip names")
    g.add_argument("--outgroup-ref", help="tree whose smaller basal child is the outgroup")
    ap.add_argument("--tol", type=float, default=1e-9)
    a = ap.parse_args()

    src = Tree(a.source, format=0)
    rr = Tree(a.rerooted, format=0)
    raw = open(a.rerooted).read()

    A = set(src.get_leaf_names())
    B = set(rr.get_leaf_names())
    ref = sorted(A)[0]
    key = lambda n: canonical(set(n.get_leaf_names()), A, ref)

    if a.outgroup:
        want_og = set(x.strip() for x in a.outgroup.split(",") if x.strip())
    else:
        rt = Tree(a.outgroup_ref, format=0)
        want_og = set(min(rt.children, key=len).get_leaf_names())
    want_og &= A

    results = []

    def check(name, ok, detail=""):
        results.append(ok)
        print("[%s] %d. %s%s" % ("PASS" if ok else "FAIL", len(results), name,
                                 ("\n        " + str(detail)) if detail else ""))

    check("tip sets identical", A == B,
          "" if A == B else "source-only=%s rerooted-only=%s"
          % (sorted(A - B)[:8], sorted(B - A)[:8]))
    if A != B:
        print("\nRESULT: FAIL (cannot compare further with differing tip sets)")
        return 1

    rf, maxrf = src.robinson_foulds(rr, unrooted_trees=True)[:2]
    check("unrooted topology unchanged", rf == 0, "RF=%d/%d" % (rf, maxrf))

    tot_s = sum(n.dist for n in src.traverse() if not n.is_root())
    tot_r = sum(n.dist for n in rr.traverse() if not n.is_root())
    check("total branch length preserved", abs(tot_s - tot_r) < a.tol,
          "source=%.6f rerooted=%.6f delta=%.2e" % (tot_s, tot_r, tot_s - tot_r))

    # --- check 4: every bipartition keeps its length and support ---
    m = edge_map(src, A, ref)
    bifurcating = len(rr.children) == 2
    root_key = key(rr.children[0]) if bifurcating else None
    bad_sup, bad_len, unknown = [], [], []
    root_children = []
    for n in rr.traverse():
        if n.is_root():
            continue
        k = key(n)
        if k not in m:
            unknown.append(sorted(k)[:3])
            continue
        d0, s0 = m[k]
        if bifurcating and k == root_key:
            root_children.append(n)
            if n.support != s0:
                bad_sup.append("clade n=%d: source %s, rerooted %s (root edge)"
                               % (len(n), s0, n.support))
            continue
        if n.support != s0:
            bad_sup.append("clade n=%d: source %s, rerooted %s"
                           % (min(len(k), len(A) - len(k)), s0, n.support))
        if round(n.dist, 6) != d0:
            bad_len.append("clade n=%d: source %.6f, rerooted %.6f"
                           % (min(len(k), len(A) - len(k)), d0, round(n.dist, 6)))

    check("every bipartition keeps its support", not bad_sup and not unknown,
          "\n        ".join(bad_sup[:15] +
                            (["+%d more" % (len(bad_sup) - 15)] if len(bad_sup) > 15 else []) +
                            (["bipartitions absent from source: %s" % unknown[:5]] if unknown else [])))
    check("every bipartition keeps its branch length", not bad_len,
          "\n        ".join(bad_len[:10]))

    if bifurcating and len(root_children) == 2:
        s = sum(c.dist for c in root_children)
        check("root edge split sums to source length", abs(s - m[root_key][0]) < a.tol,
              "%.6f + %.6f = %.6f, source %.6f"
              % (root_children[0].dist, root_children[1].dist, s, m[root_key][0]))
    else:
        check("root edge split sums to source length", False, "root is not bifurcating")

    smaller = min(rr.children, key=len)
    ok_root = bifurcating and set(smaller.get_leaf_names()) == want_og
    check("root bifurcating with the requested outgroup as one side", ok_root,
          "root children=%s; outgroup side n=%d; symmetric difference vs requested=%s"
          % ([len(c) for c in rr.children], len(smaller),
             sorted(set(smaller.get_leaf_names()) ^ want_og)[:8]))

    tail = raw.rstrip()
    check("no label or length on the root node", tail.endswith(");"),
          "file ends: ...%s" % tail[-28:])

    n_fail = results.count(False)
    print("\nRESULT: %s (%d/%d checks passed)"
          % ("PASS" if n_fail == 0 else "FAIL", len(results) - n_fail, len(results)))
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())

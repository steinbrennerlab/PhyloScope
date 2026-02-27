"""Lightweight verification for the refactor."""

import asyncio
from pathlib import Path
from tempfile import TemporaryDirectory

from app import (
    api_pairwise,
    api_reset,
    api_status,
    export_alignment,
    export_newick,
    get_species,
    get_tree,
    load_data,
    node_tips,
    search_motif,
    state,
    tip_names,
)


SMALL_TREE = "((tipA:0.1,tipB:0.2)90:0.3,tipC:0.4);"
SMALL_FASTA = ">tipA\nMKT-AA\n>tipB\nMKTGAA\n>tipC\nMKTG-A\n"
SPECIES_A = ">tipA\nATG\n>tipB\nATG\n"
SPECIES_B = ">tipC\nATG\n"


def build_fixture(root: Path):
    (root / "test.nwk").write_text(SMALL_TREE)
    (root / "test.aa.fa").write_text(SMALL_FASTA)
    ortho_dir = root / "orthofinder-input"
    ortho_dir.mkdir()
    (ortho_dir / "speciesA.fa").write_text(SPECIES_A)
    (ortho_dir / "speciesB.fa").write_text(SPECIES_B)


def main():
    with TemporaryDirectory() as tmpdir:
        fixture_dir = Path(tmpdir)
        build_fixture(fixture_dir)

        state["loaded"] = False

        status = asyncio.run(api_status())
        assert status == {"loaded": False}

        success, error = load_data(str(fixture_dir))
        assert success is True
        assert error is None
        assert state["loaded"] is True
        assert state["has_fasta"] is True

        tree_data = asyncio.run(get_tree())
        assert "id" in tree_data

        species_data = asyncio.run(get_species())
        assert species_data["species"] == ["speciesA", "speciesB"]

        tips = asyncio.run(tip_names())["tips"]
        assert tips == ["tipA", "tipB", "tipC"]

        motif = asyncio.run(search_motif(pattern="KT", type="regex"))
        assert motif["matched_tips"] == tips

        pairwise_data = asyncio.run(api_pairwise(tip1="tipA", tip2="tipB"))
        assert pairwise_data["identity"] == 1.0
        assert pairwise_data["aligned_length"] == 5

        root_tips = asyncio.run(node_tips(node_id=tree_data["id"]))
        assert root_tips["tips"] == ["tipA", "tipB", "tipC"]

        export = asyncio.run(
            export_alignment(
                node_id=tree_data["id"],
                extra_tips=[],
                col_start=None,
                col_end=None,
                ref_seq=None,
                ref_start=None,
                ref_end=None,
            )
        )
        assert export.status_code == 200
        export_text = export.body.decode()
        assert ">tipA" in export_text

        newick = asyncio.run(export_newick(node_id=tree_data["id"]))
        assert newick.status_code == 200
        assert newick.body.decode().endswith(";")

        reset = asyncio.run(api_reset())
        assert reset == {"ok": True}

        index_html = (Path(__file__).resolve().parent / "static" / "index.html").read_text()
        assert 'type="module" src="/static/app.js"' in index_html

    print("verification passed")


if __name__ == "__main__":
    main()

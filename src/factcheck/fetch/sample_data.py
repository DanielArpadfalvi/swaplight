"""Fiktív minta adatok "mock" (API-kulcsok nélküli) futtatáshoz.

Sem a fiókok, sem a posztok, sem az "ellenőrzési" eredmények nem valósak —
ezek kizárólag a pipeline végigfuttatását demonstrálják. Éles használatnál
a fetch/instagram.py (Business Discovery API) és a analysis/ modulok
(valódi LLM-hívás) veszik át a szerepüket.
"""

from __future__ import annotations

from factcheck.models import Claim, Evidence, FactCheckResult, Post, Verdict

SAMPLE_POSTS: list[Post] = [
    Post(
        id="post_1",
        account_username="pelda_politikus_a",
        account_display_name="Példa Politikus A",
        caption=(
            "Büszkén jelentem be: a munkanélküliségi ráta ma a "
            "legalacsonyabb egész Európában, 2,1%! Ezt az eredményt "
            "senki nem tudja elvitatni. #eredmények"
        ),
        permalink="https://instagram.com/p/DEMO_POST_1/",
        posted_at="2026-07-01T10:00:00+02:00",
        like_count=15200,
        comment_count=830,
        image_description="Politikus beszédet mond egy pódiumon, mögötte infografika 2,1%-os felirattal.",
    ),
    Post(
        id="post_2",
        account_username="pelda_politikus_b",
        account_display_name="Példa Politikus B",
        caption=(
            "A minimálbér az elmúlt 4 évben 55%-kal nőtt, miközben az "
            "infláció csak 20%-kal - vagyis reálértékben is jelentősen "
            "nőtt a legkisebb keresetek vásárlóereje."
        ),
        permalink="https://instagram.com/p/DEMO_POST_2/",
        posted_at="2026-07-03T14:30:00+02:00",
        like_count=9800,
        comment_count=410,
        image_description="Grafikon a minimálbér és az infláció alakulásáról.",
    ),
    Post(
        id="post_3",
        account_username="pelda_politikus_a",
        account_display_name="Példa Politikus A",
        caption=(
            "Szomorú látni, hogy az ellenzék megint csak kritizál, "
            "ahelyett hogy dolgozna. Egyébként az egészségügyi "
            "várólistán lévők száma tavaly óta 40%-kal csökkent."
        ),
        permalink="https://instagram.com/p/DEMO_POST_3/",
        posted_at="2026-07-05T09:15:00+02:00",
        like_count=6400,
        comment_count=920,
        image_description="Politikus interjút ad egy stúdióban.",
    ),
]

# --- Mock "LLM" kimenetek: post_id -> kinyert állítások ---
MOCK_CLAIMS: dict[str, list[Claim]] = {
    "post_1": [
        Claim(
            id="post_1_c1",
            post_id="post_1",
            text="A munkanélküliségi ráta 2,1%, ami a legalacsonyabb egész Európában.",
            category="gazdaság/munkaerőpiac",
            checkable=True,
        ),
    ],
    "post_2": [
        Claim(
            id="post_2_c1",
            post_id="post_2",
            text="A minimálbér az elmúlt 4 évben 55%-kal nőtt.",
            category="gazdaság/bérek",
            checkable=True,
        ),
        Claim(
            id="post_2_c2",
            post_id="post_2",
            text="Az infláció ugyanebben az időszakban 20% volt.",
            category="gazdaság/infláció",
            checkable=True,
        ),
    ],
    "post_3": [
        Claim(
            id="post_3_c1",
            post_id="post_3",
            text="Az egészségügyi várólistán lévők száma tavaly óta 40%-kal csökkent.",
            category="egészségügy",
            checkable=True,
        ),
        Claim(
            id="post_3_c2",
            post_id="post_3",
            text="Az ellenzék csak kritizál, ahelyett hogy dolgozna.",
            category="vélemény",
            checkable=False,
        ),
    ],
}

# --- Mock "LLM" kimenetek: claim_id -> ellenőrzési eredmény ---
# A számok és "források" itt KITALÁLTAK, kizárólag demonstrációs célra.
MOCK_VERIFICATIONS: dict[str, FactCheckResult] = {
    "post_1_c1": FactCheckResult(
        claim_id="post_1_c1",
        verdict=Verdict.FALSE,
        explanation=(
            "[MINTA ADAT] A KSH friss adatai szerint a munkanélküliségi ráta "
            "3,4% volt az idézett időszakban, nem 2,1%. Emellett legalább "
            "három EU-tagállam (pl. Csehország, Málta, Németország) ennél "
            "alacsonyabb rátát jelentett az Eurostat szerint, tehát az "
            "\"egész Európában a legalacsonyabb\" állítás sem igaz."
        ),
        evidences=[
            Evidence(
                source_name="KSH - Munkaerőpiaci helyzet (minta)",
                url="https://www.ksh.hu/docs/hun/xftp/idoszaki/munkerohelyzet/demo",
                snippet="Munkanélküliségi ráta: 3,4% (minta érték).",
            ),
            Evidence(
                source_name="Eurostat - Unemployment statistics (minta)",
                url="https://ec.europa.eu/eurostat/statistics-explained/demo",
                snippet="EU-átlag és tagállami rangsor (minta adat).",
            ),
        ],
        confidence=0.55,
        needs_human_research=True,
    ),
    "post_2_c1": FactCheckResult(
        claim_id="post_2_c1",
        verdict=Verdict.TRUE,
        explanation=(
            "[MINTA ADAT] A minimálbér emelkedése a megadott időszakban "
            "nagyságrendileg megfelel a hivatkozott 55%-os számnak a "
            "kormányrendeletek alapján."
        ),
        evidences=[
            Evidence(
                source_name="Nemzeti Jogszabálytár - minimálbér rendeletek (minta)",
                url="https://njt.hu/demo",
                snippet="A minimálbér összegének alakulása 2022-2026 (minta).",
            ),
        ],
        confidence=0.8,
        needs_human_research=False,
    ),
    "post_2_c2": FactCheckResult(
        claim_id="post_2_c2",
        verdict=Verdict.MISLEADING,
        explanation=(
            "[MINTA ADAT] A kumulált infláció a KSH adatai szerint a "
            "vizsgált négy évben magasabb volt, mint 20% - egyes évek "
            "kiugróan magas inflációját a poszt nem tünteti fel, ami "
            "torzítja a reálbér-növekedésről alkotott képet."
        ),
        evidences=[
            Evidence(
                source_name="KSH - Fogyasztói árindex (minta)",
                url="https://www.ksh.hu/docs/hun/xstadat/xstadat_evkozi/demo",
                snippet="Éves inflációs adatok 2022-2026 (minta).",
            ),
        ],
        confidence=0.6,
        needs_human_research=True,
    ),
    "post_3_c1": FactCheckResult(
        claim_id="post_3_c1",
        verdict=Verdict.NEEDS_CONTEXT,
        explanation=(
            "[MINTA ADAT] Az egészségügyi várólisták csökkenéséről szóló "
            "adat forrása nem azonosítható egyértelműen, és a "
            "számítási módszertan (pl. mely szakterületek, milyen "
            "időmetszet) nélkül a szám nem értékelhető megbízhatóan. "
            "Ehhez emberi kutatóra/hivatalos adatkérésre van szükség."
        ),
        evidences=[],
        confidence=0.3,
        needs_human_research=True,
    ),
}

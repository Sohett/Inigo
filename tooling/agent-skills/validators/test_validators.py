#!/usr/bin/env python3
"""Tests E2E du gate validateur. Lance: python test_validators.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from run import validate  # noqa: E402

HERE = os.path.dirname(__file__)


def load(name):
    with open(os.path.join(HERE, name)) as f:
        return json.load(f)


def test_good_week_passes():
    rep = validate(load("sample-week-good.json"))
    assert rep["verdict"] == "pass", f"attendu pass, obtenu {rep['blocking_failures']}"
    print("OK  semaine valide -> pass")


def test_bad_week_fails_with_expected_reasons():
    rep = validate(load("sample-week-bad.json"))
    assert rep["verdict"] == "fail", "attendu fail"
    bl = set(rep["blocking_failures"])
    # le VO2 et le seuil collés (6/30 + 7/1), la course en pause, et l'explosion de charge
    for expected in ("hard_day_spacing", "health", "ramp_rate"):
        assert expected in bl, f"check '{expected}' aurait dû échouer ; obtenu {bl}"
    print(f"OK  semaine fautive -> fail ({sorted(bl)})")


def test_undercharge_is_caught():
    # une semaine trop légère doit échouer (feedback: ne jamais sous-charger)
    w = load("sample-week-good.json")
    for d in w["days"]:
        d["tss"] = int(d["tss"] * 0.5)
    rep = validate(w)
    assert "weekly_tss" in rep["blocking_failures"], "la sous-charge doit être bloquée"
    print("OK  sous-charge -> fail (weekly_tss)")


def test_ramp_rate_caught():
    w = load("sample-week-good.json")
    for d in w["days"]:
        d["tss"] = d["tss"] * 3  # explosion de charge
    rep = validate(w)
    assert "ramp_rate" in rep["blocking_failures"] or "weekly_tss" in rep["blocking_failures"]
    print("OK  ramp rate excessif -> fail")


def test_malformed_input_fails_cleanly():
    # un check qui crashe (ici phase_targets manquant) doit produire un rapport
    # `fail` propre, jamais une exception ni un faux pass.
    w = load("sample-week-good.json")
    del w["phase_targets"]
    rep = validate(w)  # ne doit pas lever
    assert rep["verdict"] == "fail", "entrée malformée doit échouer"
    assert "weekly_tss" in rep["blocking_failures"], f"attendu weekly_tss ; obtenu {rep['blocking_failures']}"
    print(f"OK  entrée malformée -> fail propre ({sorted(set(rep['blocking_failures']))})")


if __name__ == "__main__":
    fails = 0
    for fn in [test_good_week_passes, test_bad_week_fails_with_expected_reasons,
               test_undercharge_is_caught, test_ramp_rate_caught,
               test_malformed_input_fails_cleanly]:
        try:
            fn()
        except AssertionError as e:
            fails += 1
            print(f"FAIL {fn.__name__}: {e}")
    print("---")
    print("TOUS LES TESTS PASSENT" if fails == 0 else f"{fails} test(s) en échec")
    sys.exit(1 if fails else 0)

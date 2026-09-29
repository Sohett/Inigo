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


def _fixed_slots(rep):
    return next(c for c in rep["checks"] if c["id"] == "fixed_slots")


def _tuesday_strength_week():
    """La semaine valide, réordonnée pour poser le renfo le mardi (VO2 mer., seuil ven.)."""
    w = load("sample-week-good.json")
    days = w["days"]
    contents = [days[i] for i in (0, 3, 1, 2, 4, 5, 6)]
    w["days"] = [dict(c, date=d["date"]) for c, d in zip(contents, days)]
    w["constraints"] = [{"id": "c-tue", "kind": "fixed_session", "weekday": 2, "activity": "strength"}]
    return w


def test_fixed_slot_read_from_profile_tuesday_passes():
    # le cas réel (INI-34) : renfo le mardi dans le profil -> 8/8, plus aucun jeudi codé en dur
    rep = validate(_tuesday_strength_week())
    assert rep["verdict"] == "pass", f"attendu pass, obtenu {rep['blocking_failures']}"
    assert len(rep["checks"]) == 8 and all(c["status"] == "pass" for c in rep["checks"])
    print("OK  renfo mardi (profil) -> 8/8")


def test_fixed_slot_missing_on_its_weekday_fails():
    # profil = renfo mardi, mais la semaine pose le renfo le jeudi -> fail
    w = load("sample-week-good.json")
    w["constraints"] = [{"id": "c-tue", "kind": "fixed_session", "weekday": 2, "activity": "strength"}]
    rep = validate(w)
    assert "fixed_slots" in rep["blocking_failures"]
    assert "mardi" in _fixed_slots(rep)["detail"], _fixed_slots(rep)["detail"]
    print("OK  renfo absent le mardi -> fail (fixed_slots)")


def test_session_on_unavailable_day_fails_and_rest_passes():
    w = _tuesday_strength_week()
    w["constraints"].append({"id": "c-off", "kind": "unavailable",
                             "startDate": "2026-07-02", "endDate": "2026-07-02"})
    rep = validate(w)
    assert "fixed_slots" in rep["blocking_failures"], "séance un jour indisponible doit échouer"
    thursday = next(d for d in w["days"] if d["date"] == "2026-07-02")
    thursday.update(tss=0, blocks=[], duration_min=0)
    assert _fixed_slots(validate(w))["status"] == "pass", "jour indisponible au repos doit passer"
    print("OK  séance un jour indisponible -> fail ; repos -> pass")


def test_dated_exception_suspends_recurring_fixed_slot():
    # en déplacement (limited daté) le mardi : le renfo récurrent n'est pas exigé
    w = load("sample-week-good.json")
    w["constraints"] = [
        {"id": "c-tue", "kind": "fixed_session", "weekday": 2, "activity": "strength"},
        {"id": "c-trip", "kind": "limited", "startDate": "2026-06-29", "endDate": "2026-07-05",
         "note": "Alpes, vélo outdoor"},
    ]
    assert _fixed_slots(validate(w))["status"] == "pass"
    print("OK  exception datée -> créneau récurrent suspendu")


def test_dated_fixed_session_is_enforced():
    # un créneau fixe daté (ex. séance avec le coach ce lundi précis) est exigé, jamais suspendu
    w = load("sample-week-good.json")
    w["constraints"] = [{"id": "c-once", "kind": "fixed_session", "startDate": "2026-06-29",
                         "endDate": "2026-06-29", "activity": "strength"}]
    assert "fixed_slots" in validate(w)["blocking_failures"], "créneau fixe daté absent -> fail"
    print("OK  créneau fixe daté absent -> fail")


def test_missing_constraints_fails():
    # sans `constraints`, le gate ne peut pas vérifier : fail explicite, jamais un faux pass
    w = load("sample-week-good.json")
    del w["constraints"]
    rep = validate(w)
    assert "fixed_slots" in rep["blocking_failures"]
    print("OK  constraints absent -> fail (fixed_slots)")


if __name__ == "__main__":
    fails = 0
    for fn in [test_good_week_passes, test_bad_week_fails_with_expected_reasons,
               test_undercharge_is_caught, test_ramp_rate_caught,
               test_malformed_input_fails_cleanly,
               test_fixed_slot_read_from_profile_tuesday_passes,
               test_fixed_slot_missing_on_its_weekday_fails,
               test_session_on_unavailable_day_fails_and_rest_passes,
               test_dated_exception_suspends_recurring_fixed_slot,
               test_dated_fixed_session_is_enforced,
               test_missing_constraints_fails]:
        try:
            fn()
        except AssertionError as e:
            fails += 1
            print(f"FAIL {fn.__name__}: {e}")
    print("---")
    print("TOUS LES TESTS PASSENT" if fails == 0 else f"{fails} test(s) en échec")
    sys.exit(1 if fails else 0)

#!/usr/bin/env python3
"""Gate validateur déterministe pour le coach cycliste agentique.

Usage:
    python run.py <proposed-week.json> [--out <validation-report.json>]

Sortie: écrit le rapport JSON (contrat: voir SPEC.md) et
imprime "PASS" / "FAIL" sur stderr. Code retour 0 si pass, 1 si fail.

Aucune dépendance externe — stdlib uniquement. Reproductible.
"""
import json
import sys
from datetime import date

HARD = {"vo2", "threshold", "anaerobic"}


def _minutes_total(day):
    return sum(b.get("minutes", 0) for b in day.get("blocks", []))


def _minutes_z4plus(day):
    return sum(b.get("minutes", 0) for b in day.get("blocks", [])
              if b.get("pct_ftp", 0) >= 100)


# --- checks : chacun retourne (id, status, detail) ---

def check_schema(week):
    days = week.get("days", [])
    if len(days) != 7:
        return ("schema", "fail", f"{len(days)} jours, 7 attendus")
    for d in days:
        for f in ("date", "sport", "intensity", "tss", "blocks"):
            if f not in d:
                return ("schema", "fail", f"jour {d.get('date','?')}: champ '{f}' manquant")
    return ("schema", "pass", "structure valide, 7 jours")


def check_weekly_tss(week):
    lo, hi = week["phase_targets"]["weekly_tss"]
    total = sum(d.get("tss", 0) for d in week["days"])
    if total < lo:
        return ("weekly_tss", "fail", f"{total} TSS < borne basse {lo} (sous-charge)")
    if total > hi:
        return ("weekly_tss", "fail", f"{total} TSS > borne haute {hi}")
    return ("weekly_tss", "pass", f"{total} TSS dans [{lo},{hi}]")


def check_ramp_rate(week):
    ctl = week["athlete_ref"]["ctl"]
    cap = week["phase_targets"]["ctl_weekly_ramp_max"]
    start = ctl
    for d in week["days"]:
        ctl = ctl + (d.get("tss", 0) - ctl) / 42.0
    delta = ctl - start
    if delta > cap:
        return ("ramp_rate", "fail", f"ΔCTL +{delta:.1f}/sem > plafond +{cap}")
    return ("ramp_rate", "pass", f"ΔCTL +{delta:.1f}/sem ≤ +{cap}")


def check_intensity_dist(week):
    cap = week["phase_targets"]["max_z4plus_pct"]
    tot = sum(_minutes_total(d) for d in week["days"])
    z4 = sum(_minutes_z4plus(d) for d in week["days"])
    pct = (z4 / tot * 100) if tot else 0
    if pct > cap:
        return ("intensity_dist", "fail", f"Z4+ {pct:.0f}% > cible {cap}%")
    return ("intensity_dist", "pass", f"Z4+ {pct:.0f}% ≤ {cap}%")


def check_hard_day_spacing(week):
    hard_dates = [date.fromisoformat(d["date"]) for d in week["days"]
                  if d.get("intensity") in HARD and not d.get("intended_back_to_back")]
    hard_dates.sort()
    for a, b in zip(hard_dates, hard_dates[1:]):
        if (b - a).days < 2:
            return ("hard_day_spacing", "fail",
                    f"jours durs {a} et {b} à <48h sans intention")
    return ("hard_day_spacing", "pass", "≥48h entre jours durs")


def check_power_target_sanity(week):
    for d in week["days"]:
        blocks = d.get("blocks", [])
        for b in blocks:
            p = b.get("pct_ftp")
            if p is None:
                continue
            if p < 30 or p > 160:
                return ("power_target_sanity", "fail",
                        f"{d['date']}: bloc {p}%FTP hors [30,160]")
        # une séance VO2 doit contenir AU MOINS un bloc de travail >=100%
        # (l'échauffement/récup en dessous du seuil est normal et attendu).
        if d.get("intensity") == "vo2" and blocks:
            if not any((b.get("pct_ftp") or 0) >= 100 for b in blocks):
                return ("power_target_sanity", "fail",
                        f"{d['date']}: séance VO2 sans bloc de travail ≥100%FTP")
    return ("power_target_sanity", "pass", "cibles cohérentes vs FTP")


def check_fixed_slots(week):
    for d in week["days"]:
        wd = date.fromisoformat(d["date"]).weekday()  # 0=lundi ... 3=jeudi
        if wd == 3 and d.get("is_vacation_block"):
            continue
        if wd == 3 and "renfo" not in d.get("label", "").lower() \
                and d.get("intensity") not in ("strength",):
            # tolérant : on signale seulement si le créneau jeudi ne contient pas de renfo
            if not d.get("strength_present"):
                return ("fixed_slots", "fail",
                        f"jeudi {d['date']}: renfo coach absent")
        if d.get("is_vacation_block") and d.get("indoor"):
            return ("fixed_slots", "fail",
                    f"{d['date']}: séance indoor en semaine de vacances")
    return ("fixed_slots", "pass", "créneaux fixes respectés")


def check_health(week):
    for d in week["days"]:
        if d.get("sport") in ("Run", "TrailRun", "VirtualRun") \
                and week.get("health_flags", {}).get("run_paused"):
            return ("health", "fail", f"{d['date']}: course programmée alors que pause pied")
    return ("health", "pass", "aucune séance interdite par l'état santé")


CHECKS = [
    check_schema, check_weekly_tss, check_ramp_rate, check_intensity_dist,
    check_hard_day_spacing, check_power_target_sanity, check_fixed_slots,
    check_health,
]

ADVICE = {
    "weekly_tss": "Ajuste la longue du samedi ou retire/ajoute des blocs pour rentrer dans la fourchette.",
    "ramp_rate": "Réduis le TSS hebdo : la progression de CTL est trop agressive.",
    "intensity_dist": "Trop d'intensité : convertis une séance qualité en endurance.",
    "hard_day_spacing": "Espace les jours durs d'au moins 48h, ou marque intended_back_to_back si voulu.",
    "power_target_sanity": "Corrige les cibles de puissance incohérentes vs FTP.",
    "fixed_slots": "Préserve le renfo du jeudi ; pas d'indoor en semaine de vacances.",
    "health": "Retire la séance interdite par l'état santé (course en pause).",
    "schema": "Corrige la structure : 7 jours, champs requis présents.",
}


def validate(week):
    results = []
    for fn in CHECKS:
        try:
            results.append(fn(week))
        except Exception as e:  # un check qui crashe = fail explicite, jamais un faux pass
            results.append((fn.__name__, "fail", f"erreur check: {e}"))
    blocking = [r[0] for r in results if r[1] == "fail"]
    report = {
        "verdict": "fail" if blocking else "pass",
        "week": week.get("week"),
        "checks": [{"id": i, "status": s, "detail": d} for (i, s, d) in results],
        "blocking_failures": blocking,
        "advice": " ".join(ADVICE[b] for b in blocking) or None,
    }
    return report


def main():
    if len(sys.argv) < 2:
        print("usage: run.py <proposed-week.json> [--out report.json]", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    out = "runtime/validation-report.json"
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    with open(path) as f:
        week = json.load(f)
    report = validate(week)
    try:
        with open(out, "w") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
    except OSError:
        pass
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(report["verdict"].upper(), file=sys.stderr)
    sys.exit(0 if report["verdict"] == "pass" else 1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fetch team identity directories from ESPN's public teams API and commit a
snapshot to data/teams.json. Team colors and logos almost never change, so
this snapshot is refreshed rarely (re-run this script when needed).

The identity directory powers the GameDay look on pages whose feeds don't
carry logos/colors themselves (Kalshi snapshot, Polymarket events, injury
teams): logo + team-color abbreviation chip + name. Lookups always degrade
gracefully to a neutral chip + plain name when a team isn't found.
"""
import json
import os
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "data", "teams.json")

LEAGUES = [
    ("nfl", "football/nfl"),
    ("nba", "basketball/nba"),
    ("mlb", "baseball/mlb"),
    ("nhl", "hockey/nhl"),
    ("epl", "soccer/eng.1"),
]


def get(url):
    req = urllib.request.Request(url)  # no custom UA — ESPN 403s unfamiliar agents
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def pick_logo(team):
    """Prefer the scoreboard variant (designed for dark backgrounds)."""
    for l in team.get("logos", []) or []:
        rel = " ".join(l.get("rel", []))
        if "scoreboard" in rel and "dark" in rel:
            return l.get("href")
    for l in team.get("logos", []) or []:
        rel = " ".join(l.get("rel", []))
        if "scoreboard" in rel:
            return l.get("href")
    ls = team.get("logos") or []
    return ls[0].get("href") if ls else None


def main():
    out = {"source": "ESPN public teams API (site.api.espn.com); refreshed rarely — colors/logos are stable",
           "updated_at": None, "leagues": {}}
    for key, path in LEAGUES:
        d = get("https://site.api.espn.com/apis/site/v2/sports/%s/teams?limit=100" % path)
        teams = d["sports"][0]["leagues"][0]["teams"]
        rows = []
        for t in teams:
            t = t["team"]
            rows.append({
                "abbr": t.get("abbreviation"),
                "displayName": t.get("displayName"),
                "shortDisplayName": t.get("shortDisplayName"),
                "color": t.get("color"),
                "logo": pick_logo(t),
            })
        rows = [r for r in rows if r["abbr"]]
        out["leagues"][key] = rows
        print(key, len(rows), "teams")
    from datetime import datetime, timezone
    out["updated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(OUT, "w") as f:
        json.dump(out, f, indent=1)
    print("wrote", OUT)


if __name__ == "__main__":
    main()

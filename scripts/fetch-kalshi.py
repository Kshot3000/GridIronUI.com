#!/usr/bin/env python3
"""GridIronUI Kalshi snapshot fetcher.

Kalshi's public API rejects browser cross-origin requests (HTTP 403 on any
request carrying an Origin header), so this page cannot read it directly.
Instead, this script runs server-side (from the improvement loop cron) and
writes a timestamped JSON snapshot to data/kalshi-nfl.json, which js/markets.js
renders as the "Kalshi NFL" tab.

Honesty rules: the snapshot carries its own updated_at; the page labels it as
a snapshot and warns when it goes stale. Nothing here invents a price.

Usage:  python3 scripts/fetch-kalshi.py [--series KXNFLGAME] [--out data/kalshi-nfl.json]
        python3 scripts/fetch-kalshi.py --series KXMLBGAME --out data/kalshi-mlb.json
Refresh cadence: improvement-loop runs refresh this on push whenever the
snapshot is older than about two hours. (A scheduled GitHub Actions
workflow is the planned long-term fix — see the goal workspace notes.)
"""
import argparse
import json, os, sys, time, urllib.request
import urllib.error

BASE = "https://api.elections.kalshi.com/trade-api/v2"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Snapshot a Kalshi game-winner series.")
    # NFL game-winner events; Kalshi currently lists winner (moneyline) markets only
    p.add_argument("--series", default="KXNFLGAME",
                   help="Kalshi series ticker (default KXNFLGAME)")
    p.add_argument("--out", default=os.path.join(ROOT, "data", "kalshi-nfl.json"),
                   help="output snapshot path (default data/kalshi-nfl.json)")
    return p.parse_args(argv)

def get(url, retries=4):
    # GET with retries for transient Kalshi throttling (HTTP 429) and
    # server-side 5xx: exponential backoff, honoring Retry-After when the
    # API names one. Permanent failures still raise so callers decide.
    delay = 1.0
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "GridIronUI-snapshot/1.0"})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            transient = e.code == 429 or 500 <= e.code < 600
            if not transient or attempt == retries - 1:
                raise
            retry_after = e.headers.get("Retry-After") if e.headers else None
            try:
                delay = float(retry_after) if retry_after else delay
            except (TypeError, ValueError):
                pass
            time.sleep(min(delay, 30))
            delay *= 2
        except Exception:
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")

def pct(s):
    try:
        v = float(s)
        return int(round(v * 100)) if v is not None else None
    except (TypeError, ValueError):
        return None

def fetch_events(series):
    evs, cursor = [], None
    while True:
        url = BASE + "/events?status=open&limit=200&series_ticker=" + series
        if cursor:
            url += "&cursor=" + cursor
        d = get(url)
        evs.extend(d.get("events", []))
        cursor = d.get("cursor")
        if not cursor:
            break
    return evs

def fetch_markets(event_ticker):
    ms, cursor = [], None
    while True:
        url = BASE + "/markets?status=open&limit=100&event_ticker=" + event_ticker
        if cursor:
            url += "&cursor=" + cursor
        d = get(url)
        ms.extend(d.get("markets", []))
        cursor = d.get("cursor")
        if not cursor:
            break
    return ms

def team_from_title(title):
    t = (title or "").strip()
    if t.lower().endswith(" wins"):
        return t[:-5].strip(), "winner"
    return t or "Team", "other"

def main(argv=None):
    args = parse_args(argv)
    SERIES, OUT = args.series, args.out
    try:
        events = fetch_events(SERIES)
    except Exception as e:
        print("ERROR: could not list Kalshi events: %s" % e, file=sys.stderr)
        sys.exit(1)
    # Carry-forward map: if a single event's market pull keeps failing after
    # retries, reuse the previous snapshot's entry for that game (marked
    # stale) instead of silently deleting a real game from the markets page.
    prev_games = {}
    if os.path.exists(OUT):
        try:
            with open(OUT) as f:
                for g in json.load(f).get("games", []):
                    if g.get("event_ticker"):
                        prev_games[g["event_ticker"]] = g
        except Exception as e:
            print("WARN: could not read previous snapshot for carry-forward: %s" % e, file=sys.stderr)
    games = []
    for e in events:
        et = e.get("event_ticker")
        try:
            ms = fetch_markets(et)
        except Exception as ex:
            print("WARN: markets failed for %s: %s" % (et, ex), file=sys.stderr)
            prev = prev_games.get(et)
            if prev:
                carried = dict(prev)
                carried["stale"] = True
                games.append(carried)
                print("WARN: carried forward stale entry for %s from previous snapshot" % et, file=sys.stderr)
            else:
                print("WARN: no previous entry for %s; game dropped" % et, file=sys.stderr)
            continue
        markets = []
        for m in ms:
            team, kind = team_from_title(m.get("title"))
            markets.append({
                "ticker": m.get("ticker"),
                "title": m.get("title"),
                "kind": kind,
                "team": team,
                "yes_bid": pct(m.get("yes_bid_dollars")),
                "yes_ask": pct(m.get("yes_ask_dollars")),
                "last": pct(m.get("last_price_dollars")),
                "volume": m.get("volume_fp"),
                "volume_24h": m.get("volume_24h_fp"),
                "close_time": m.get("close_time"),
            })
        markets.sort(key=lambda m: (m["team"] or ""))
        games.append({
            "event_ticker": et,
            "title": e.get("title"),
            "sub_title": e.get("sub_title"),
            "markets": markets,
        })
        time.sleep(0.25)  # stay well under Kalshi's 20 reads/s tier
    snap = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Kalshi public trade-api v2 (server-side snapshot; browser CORS-blocked)",
        "series_ticker": SERIES,
        "games": games,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(snap, f, indent=1)
    os.replace(tmp, OUT)
    n_mk = sum(len(g["markets"]) for g in games)
    print("wrote %s: %d games, %d markets" % (OUT, len(games), n_mk))

if __name__ == "__main__":
    main()

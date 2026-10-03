#!/usr/bin/env python3
"""GridIronUI Kalshi snapshot fetcher.

Kalshi's public API rejects browser cross-origin requests (HTTP 403 on any
request carrying an Origin header), so this page cannot read it directly.
Instead, this script runs server-side (from the improvement loop cron) and
writes a timestamped JSON snapshot to data/kalshi-nfl.json, which js/markets.js
renders as the "Kalshi NFL" tab.

Honesty rules: the snapshot carries its own updated_at; the page labels it as
a snapshot and warns when it goes stale. Nothing here invents a price.

Price history: after every successful snapshot write, this script appends one
yes-price point per priced winner market to data/kalshi-history.json, a map
of {market_ticker: [{t: "<iso>", yes: <cents>}]}, capped at 168 points per
ticker (about a week of hourly runs). The file starts empty and only ever
accumulates real observations — carried-forward stale games add no point
(their prices weren't observed this run), and identical prices still append
(every point is one honest observation at its timestamp). The append logic
mirrors K.appendHistory in js/kalshi-logic.js (the JS module is the
node-testable spec; this function must stay in lockstep with it).

The snapshot also carries a snapshot-to-snapshot diff so the pages can show
"what moved" badges without keeping history client-side:
  prev_at   — the previous snapshot's updated_at (null on the first snapshot)
  moves     — [{event_ticker, team, delta, prev, now}] for winner markets
              whose Yes price moved >= 2 cents between snapshots
  new_games — [event_ticker] for games absent from the previous snapshot
The diff algorithm mirrors K.diffMoves in js/kalshi-logic.js (the JS module
is the node-testable spec; this function must stay in lockstep with it):
price = midpoint of yes_bid/yes_ask (JS Math.round semantics), else last;
settled games are excluded on both sides (a finished game's 99c/1c prices
are a result, not a move); |delta| < 2c is noise and earns no badge.

Usage:  python3 scripts/fetch-kalshi.py [--series KXNFLGAME] [--out data/kalshi-nfl.json]
        python3 scripts/fetch-kalshi.py --series KXMLBGAME --out data/kalshi-mlb.json
Refresh cadence: improvement-loop runs refresh this on push whenever the
snapshot is older than about two hours. (A scheduled GitHub Actions
workflow is the planned long-term fix — see the goal workspace notes.)
"""
import argparse
import json, math, os, sys, time, urllib.request
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
    p.add_argument("--history", default=None,
                   help="price-history output path (default: kalshi-history.json next to --out)")
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

def js_price(bid, ask, last):
    """Mirror of K.price in js/kalshi-logic.js: midpoint of the bid/ask book
    (integer cents) with JS Math.round semantics, else the last trade."""
    if bid is not None and ask is not None and bid >= 0 and ask >= bid:
        return int(math.floor((bid + ask) / 2.0 + 0.5))
    if last is not None:
        return int(math.floor(last + 0.5))
    return None

def settled(markets):
    """Mirror of K.settled: >=2 priced winner markets, every one at an
    extreme (<=1c or >=99c), at least one >=99c."""
    px = [js_price(m.get("yes_bid"), m.get("yes_ask"), m.get("last"))
          for m in (markets or []) if m.get("kind") != "other"]
    px = [p for p in px if p is not None]
    if len(px) < 2:
        return False
    return (max(px) >= 99 and min(px) <= 1
            and all(p <= 1 or p >= 99 for p in px))

def diff_moves(prev_games, prev_at, games, min_delta=2):
    """Mirror of K.diffMoves in js/kalshi-logic.js. Returns
    (moves, new_games): moves is [{event_ticker, team, delta, prev, now}],
    new_games is [event_ticker]. Empty baseline -> ([], []) — without a
    previous snapshot "new" is meaningless and every game would badge."""
    moves, new_games = [], []
    if not prev_at or not prev_games:
        return moves, new_games
    seen = set()
    for g in games:
        et = (g or {}).get("event_ticker")
        if not et or et in seen:
            continue
        seen.add(et)
        pg = prev_games.get(et)
        if pg is None:
            if not settled(g.get("markets")):
                new_games.append(et)
            continue
        if settled(g.get("markets")) or settled(pg.get("markets")):
            continue  # finished game — a result, not a move
        was = {}
        for m in pg.get("markets") or []:
            if m.get("kind") != "other" and m.get("team"):
                p = js_price(m.get("yes_bid"), m.get("yes_ask"), m.get("last"))
                if p is not None:
                    was[m["team"]] = p
        for m in g.get("markets") or []:
            if m.get("kind") == "other" or not m.get("team"):
                continue
            now = js_price(m.get("yes_bid"), m.get("yes_ask"), m.get("last"))
            before = was.get(m["team"])
            if now is None or before is None:
                continue
            d = now - before
            if abs(d) >= min_delta:
                moves.append({"event_ticker": et, "team": m["team"],
                              "delta": d, "prev": before, "now": now})
    return moves, new_games

HISTORY_CAP = 168  # per-ticker points kept: ~a week of hourly runs

def append_history(out_path, snap, hist_path=None):
    """Mirror of K.appendHistory in js/kalshi-logic.js (the JS module is the
    node-testable spec; this function must stay in lockstep with it).
    Appends one {t, yes} point per priced winner market to the history file
    (default kalshi-history.json next to the snapshot), trimming each series
    to the newest HISTORY_CAP points. Carried-forward stale games add no
    point; "other" markets, tickerless and unpriced markets are skipped;
    identical prices still append (every point is one honest observation).
    Atomic: writes a tmp file and renames. Returns points appended."""
    if hist_path is None:
        hist_path = os.path.join(os.path.dirname(out_path), "kalshi-history.json")
    hist = {}
    if os.path.exists(hist_path):
        try:
            with open(hist_path) as f:
                hist = json.load(f) or {}
            if not isinstance(hist, dict):
                hist = {}
        except Exception as e:
            print("WARN: could not read price history at %s; starting fresh: %s"
                  % (hist_path, e), file=sys.stderr)
            hist = {}
    t = snap.get("updated_at")
    if not t:
        return 0
    n = 0
    for g in snap.get("games", []):
        if not g or g.get("stale"):
            continue  # carried forward — no fresh observation
        for m in g.get("markets", []):
            if not m or m.get("kind") == "other" or not m.get("ticker"):
                continue
            p = js_price(m.get("yes_bid"), m.get("yes_ask"), m.get("last"))
            if p is None:
                continue
            series = hist.get(m["ticker"])
            if not isinstance(series, list):
                series = []
            series.append({"t": t, "yes": p})
            if len(series) > HISTORY_CAP:
                series = series[-HISTORY_CAP:]
            hist[m["ticker"]] = series
            n += 1
    os.makedirs(os.path.dirname(hist_path) or ".", exist_ok=True)
    tmp = hist_path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(hist, f, indent=1)
    os.replace(tmp, hist_path)
    return n

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
    # The previous snapshot also feeds the "what moved" diff (moves/new_games
    # baked into the new file); no previous file -> no baseline -> no badges.
    prev_games, prev_at = {}, None
    if os.path.exists(OUT):
        try:
            with open(OUT) as f:
                prev_snap = json.load(f)
                if isinstance(prev_snap.get("updated_at"), str) and prev_snap["updated_at"]:
                    prev_at = prev_snap["updated_at"]
                for g in prev_snap.get("games", []):
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
        # Real kickoff: every market of a game carries the same
        # occurrence_datetime — Kalshi's scheduled start (verified live
        # 2026-10-03 across NFL/MLB/NCAAF: every game, exactly one value).
        # The earliest is the game's start; None when Kalshi stamps none,
        # and the pages then show no kickoff rather than guessing one.
        # close_time is NOT this: Kalshi sets it ~2 days after kickoff
        # for the in-play trading window, so it must never be rendered
        # as the game time (it only orders the board, as a proxy).
        starts = [m.get("occurrence_datetime") for m in ms
                  if m.get("occurrence_datetime")]
        games.append({
            "event_ticker": et,
            "title": e.get("title"),
            "sub_title": e.get("sub_title"),
            "start": min(starts) if starts else None,
            "markets": markets,
        })
        time.sleep(0.25)  # stay well under Kalshi's 20 reads/s tier
    snap = {
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Kalshi public trade-api v2 (server-side snapshot; browser CORS-blocked)",
        "series_ticker": SERIES,
        "games": games,
    }
    moves, new_games = diff_moves(prev_games, prev_at, games)
    snap["prev_at"] = prev_at
    snap["moves"] = moves
    snap["new_games"] = new_games
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w") as f:
        json.dump(snap, f, indent=1)
    os.replace(tmp, OUT)
    # Accumulate price history from the snapshot that was just written.
    hist_n = append_history(OUT, snap, args.history)
    n_mk = sum(len(g["markets"]) for g in games)
    print("wrote %s: %d games, %d markets, %d moves, %d new games (prev %s)"
          % (OUT, len(games), n_mk, len(moves), len(new_games), prev_at or "none"))
    print("appended %d price-history points" % hist_n)

if __name__ == "__main__":
    main()

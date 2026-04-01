#!/usr/bin/env python3
"""Fill unresolved institution locations with a local Qwen model via Ollama.

This script:
1. Reads `papers.json`
2. Reuses any existing `locations.json`
3. Sends unresolved institution names to a local Ollama model
4. Writes simplified JSON outputs containing only country/city fields

Outputs:
  - data/locations.json
  - data/papers_enriched.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
PAPERS_PATH = ROOT / "papers.json"
LOCATIONS_PATH = ROOT / "locations.json"
ENRICHED_PATH = ROOT / "papers_enriched.json"

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def unique_nonempty(values):
    seen = []
    for value in values:
        if value and value not in seen:
            seen.append(value)
    return seen


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def extract_json_object(text: str) -> dict[str, str | None] | None:
    text = text.strip()
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def ask_qwen_for_location(institution: str, model: str) -> dict[str, str | None]:
    prompt = f"""
You map research institutions to location metadata.

Institution: {institution}

Return strict JSON with exactly these keys:
{{"country": string|null, "city": string|null}}

Rules:
- Use the most likely modern country.
- Use the most likely city if known, otherwise null.
- Do not include explanations.
- If uncertain, prefer null instead of guessing.
""".strip()

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0},
    }

    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=120) as response:
        body = json.loads(response.read().decode("utf-8"))

    parsed = extract_json_object(body.get("response", ""))
    if not parsed:
        return {"country": None, "city": None}

    country = parsed.get("country")
    city = parsed.get("city")
    return {
        "country": country if isinstance(country, str) and country.strip() else None,
        "city": city if isinstance(city, str) and city.strip() else None,
    }


def simplify_location_record(institution: str, record: dict) -> dict[str, str | None]:
    return {
        "institution": normalize(institution),
        "country": record.get("country"),
        "city": record.get("city"),
    }


def rebuild_papers(papers: list[dict], locations: dict[str, dict]) -> list[dict]:
    enriched = []
    for paper in papers:
        institution_locations = []
        for institution in paper.get("institutions", []):
            key = normalize(institution)
            record = locations.get(key, {"institution": key, "country": None, "city": None})
            institution_locations.append(
                {
                    "institution": key,
                    "country": record.get("country"),
                    "city": record.get("city"),
                }
            )

        enriched.append(
            {
                **paper,
                "institution_locations": institution_locations,
                "countries": unique_nonempty(record.get("country") for record in institution_locations),
                "cities": unique_nonempty(record.get("city") for record in institution_locations),
            }
        )
    return enriched


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="qwen3:8b")
    parser.add_argument("--max-queries", type=int, default=None, help="Limit the number of unresolved institutions sent to Qwen.")
    parser.add_argument("--sleep", type=float, default=0.0)
    parser.add_argument("--skip-qwen", action="store_true")
    args = parser.parse_args()

    papers = load_json(PAPERS_PATH, [])
    raw_locations = load_json(LOCATIONS_PATH, {})
    locations = {
        normalize(institution): simplify_location_record(institution, record)
        for institution, record in raw_locations.items()
    }

    all_institutions = sorted({normalize(inst) for paper in papers for inst in paper.get("institutions", []) if inst})
    for institution in all_institutions:
        locations.setdefault(institution, {"institution": institution, "country": None, "city": None})

    unresolved = [
        institution
        for institution, record in locations.items()
        if not record.get("country") and not record.get("city")
    ]

    queried = 0
    if not args.skip_qwen:
        for institution in unresolved:
            if args.max_queries is not None and queried >= args.max_queries:
                break
            try:
                result = ask_qwen_for_location(institution, args.model)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                print(f"qwen lookup failed for {institution}: {exc}", file=sys.stderr)
                continue

            locations[institution] = {
                "institution": institution,
                "country": result.get("country"),
                "city": result.get("city"),
            }
            queried += 1
            print(f"[{queried}] {institution} -> {result.get('country')} / {result.get('city')}")
            if args.sleep:
                time.sleep(args.sleep)

    simplified_locations = {
        institution: {
            "institution": record["institution"],
            "country": record.get("country"),
            "city": record.get("city"),
        }
        for institution, record in sorted(locations.items())
    }
    enriched = rebuild_papers(papers, simplified_locations)

    LOCATIONS_PATH.write_text(json.dumps(simplified_locations, ensure_ascii=False, indent=2))
    ENRICHED_PATH.write_text(json.dumps(enriched, ensure_ascii=False))

    remaining = sum(1 for record in simplified_locations.values() if not record.get("country") and not record.get("city"))
    print(f"institutions: {len(simplified_locations)}")
    print(f"queried: {queried}")
    print(f"remaining unresolved: {remaining}")
    print(f"wrote: {LOCATIONS_PATH}")
    print(f"wrote: {ENRICHED_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

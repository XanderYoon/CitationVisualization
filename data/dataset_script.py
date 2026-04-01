import requests
import json
import time
from collections import defaultdict
import numpy as np


BASE_URL = "https://api.openalex.org/works"

HEADERS = {
    "User-Agent": "alexander.yoon@example.com"
}


# -----------------------------
# Parse individual paper
# -----------------------------
def parse_paper(work):
    return {
        "id": work["id"],
        "title": work.get("title"),
        "year": work.get("publication_year"),
        "citations": work.get("cited_by_count", 0),
        "referenced_works": work.get("referenced_works", [])[:10],
        "authors": [
            a["author"]["display_name"]
            for a in work.get("authorships", [])
            if a.get("author")
        ],
        "institutions": [
            inst["display_name"]
            for a in work.get("authorships", [])
            for inst in a.get("institutions", [])
        ],
        "concepts": [
            c["display_name"]
            for c in work.get("concepts", [])
        ]
    }


# -----------------------------
# Fetch data (paginated)
# -----------------------------
def fetch_all_works(max_pages=20, per_page=200):
    all_works = []
    cursor = "*"

    for i in range(max_pages):
        params = {
            "filter": ",".join([
                "primary_topic.id:t11396",
                "type:article",
                "open_access.is_oa:true",
                "has_pmid:true",
                "language:en"
            ]),
            "per_page": per_page,
            "cursor": cursor
        }

        res = requests.get(BASE_URL, params=params, headers=HEADERS)

        if res.status_code != 200:
            print("ERROR:", res.status_code, res.text)
            break

        data = res.json()

        if "results" not in data:
            print("Unexpected response:", data)
            break

        works = data.get("results", [])
        all_works.extend(works)

        print(f"Page {i+1}: fetched {len(works)} papers (total={len(all_works)})")

        cursor = data.get("meta", {}).get("next_cursor")
        if not cursor:
            break

        time.sleep(1)

    return all_works


# -----------------------------
# Build graph
# -----------------------------
def build_graph(works):
    papers = {}
    edges = []

    for w in works:
        p = parse_paper(w)
        papers[p["id"]] = p

    paper_ids = set(papers.keys())

    for p in papers.values():
        for ref in p["referenced_works"]:
            if ref in paper_ids:
                edges.append({
                    "source": p["id"],
                    "target": ref
                })

    return list(papers.values()), edges


# -----------------------------
# Gini coefficient
# -----------------------------
def gini(array):
    array = np.array(array, dtype=float)

    if len(array) == 0:
        return 0

    if np.amin(array) < 0:
        array -= np.amin(array)

    array += 1e-9
    array = np.sort(array)
    n = len(array)

    return (np.sum((2 * np.arange(1, n + 1) - n - 1) * array)) / (n * np.sum(array))


# -----------------------------
# Build time series
# -----------------------------
def build_timeseries(papers):
    by_year = defaultdict(list)

    for p in papers:
        if p["year"]:
            by_year[p["year"]].append(p)

    timeseries = []

    for year, ps in sorted(by_year.items()):
        citations = [p["citations"] for p in ps]

        timeseries.append({
            "year": year,
            "num_papers": len(ps),
            "avg_citations": float(np.mean(citations)) if citations else 0,
            "gini_citations": float(gini(citations))
        })

    return timeseries


# -----------------------------
# Save data
# -----------------------------
def save_data(papers, edges, timeseries):
    with open("papers.json", "w") as f:
        json.dump(papers, f)

    with open("graph.json", "w") as f:
        json.dump({
            "nodes": papers,
            "edges": edges
        }, f)

    with open("timeseries.json", "w") as f:
        json.dump(timeseries, f)

    print("Saved all data files")


# -----------------------------
# Main pipeline
# -----------------------------
if __name__ == "__main__":
    print("Fetching data...")
    works = fetch_all_works(max_pages=12)

    print("\nBuilding graph...")
    papers, edges = build_graph(works)

    print("Building timeseries...")
    timeseries = build_timeseries(papers)

    print("\nSaving...")
    save_data(papers, edges, timeseries)

    print("\nSummary:")
    print(f"Papers: {len(papers)}")
    print(f"Edges: {len(edges)}")

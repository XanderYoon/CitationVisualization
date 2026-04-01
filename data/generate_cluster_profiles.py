#!/usr/bin/env python3
"""Generate cluster characterizations using local Ollama/Qwen.

The graph decomposes into many singleton components, so this script uses Qwen
for substantive clusters and heuristic fallback labels for tiny fragments.
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent
GRAPH_PATH = ROOT / "graph.json"
PAPERS_PATH = ROOT / "papers_enriched.json"
OUTPUT_PATH = ROOT / "cluster_profiles.json"
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


def compute_components(graph: dict) -> tuple[list[list[str]], dict[str, int]]:
    adjacency = {node["id"]: set() for node in graph["nodes"]}
    for edge in graph["edges"]:
      source = edge["source"]["id"] if isinstance(edge.get("source"), dict) else edge["source"]
      target = edge["target"]["id"] if isinstance(edge.get("target"), dict) else edge["target"]
      if source not in adjacency or target not in adjacency:
          continue
      adjacency[source].add(target)
      adjacency[target].add(source)

    components: list[list[str]] = []
    visited: set[str] = set()

    for node_id in adjacency:
        if node_id in visited:
            continue
        stack = [node_id]
        visited.add(node_id)
        component = []
        while stack:
            current = stack.pop()
            component.append(current)
            for neighbor in adjacency[current]:
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        components.append(component)

    components.sort(key=len, reverse=True)
    cluster_by_id = {}
    for index, component in enumerate(components):
        for node_id in component:
            cluster_by_id[node_id] = index
    return components, cluster_by_id


def extract_json_object(text: str) -> dict | None:
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


def ask_qwen(prompt: str, model: str) -> dict:
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.2},
    }
    request = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=240) as response:
        body = json.loads(response.read().decode("utf-8"))
    parsed = extract_json_object(body.get("response", ""))
    return parsed or {}


def top_values(counter: Counter, limit: int) -> list[str]:
    return [item for item, _ in counter.most_common(limit)]


def summarize_cluster(cluster_id: int, component: list[str], papers: list[dict], model: str) -> dict:
    concept_counter = Counter()
    country_counter = Counter()
    institution_counter = Counter()
    for paper in papers:
        concept_counter.update(normalize(concept) for concept in paper.get("concepts", [])[:20] if normalize(concept))
        country_counter.update(normalize(country) for country in paper.get("countries", []) if normalize(country))
        institution_counter.update(normalize(inst) for inst in paper.get("institutions", []) if normalize(inst))

    top_papers = sorted(papers, key=lambda paper: paper.get("citations", 0), reverse=True)[:5]
    seed = {
        "cluster_id": cluster_id,
        "size": len(component),
        "years": [min((paper.get("year", 0) for paper in papers), default=0), max((paper.get("year", 0) for paper in papers), default=0)],
        "top_concepts": top_values(concept_counter, 10),
        "top_countries": top_values(country_counter, 5),
        "top_institutions": top_values(institution_counter, 5),
        "top_papers": [
            {
                "title": normalize(paper.get("title")),
                "year": paper.get("year"),
                "citations": paper.get("citations", 0),
            }
            for paper in top_papers
        ],
    }

    prompt = f"""
You are characterizing a citation-network cluster in AI-for-healthcare research.

Cluster summary:
{json.dumps(seed, ensure_ascii=False, indent=2)}

Return strict JSON with exactly these keys:
{{
  "short_label": string,
  "label": string,
  "description": string,
  "research_focus": string,
  "methods": [string, string, string],
  "signature_terms": [string, string, string, string],
  "visual_motif": string
}}

Rules:
- Keep `short_label` to 2-4 words.
- Make `label` sound like a serious research subfield, not marketing copy.
- `description` should be one sentence, under 28 words.
- `research_focus` should describe the main clinical or analytical concern in one sentence.
- `methods` must be concise method families or modeling styles.
- `signature_terms` should be useful UI chips, not generic words like "paper" or "study".
- `visual_motif` should be a short phrase describing an evocative but academic visual metaphor.
- Ground everything in the provided evidence only.
""".strip()

    result = ask_qwen(prompt, model)
    return {
        "clusterId": cluster_id,
        "size": len(component),
        "kind": "substantive",
        "shortLabel": normalize(result.get("short_label")) or f"Cluster {cluster_id + 1}",
        "label": normalize(result.get("label")) or f"Cluster {cluster_id + 1}",
        "description": normalize(result.get("description")) or "A connected set of related papers in the citation network.",
        "researchFocus": normalize(result.get("research_focus")) or "Research focus inferred from connected paper metadata.",
        "methods": [normalize(value) for value in result.get("methods", []) if normalize(value)][:3],
        "signatureTerms": [normalize(value) for value in result.get("signature_terms", []) if normalize(value)][:4],
        "visualMotif": normalize(result.get("visual_motif")) or "Connected citation structure",
        "topConcepts": top_values(concept_counter, 8),
        "topCountries": top_values(country_counter, 5),
        "topInstitutions": top_values(institution_counter, 5),
        "topPapers": [
            {
                "title": normalize(paper.get("title")),
                "year": paper.get("year"),
                "citations": paper.get("citations", 0),
            }
            for paper in top_papers
        ],
    }


def fallback_profile(cluster_id: int, component: list[str], papers: list[dict]) -> dict:
    concept_counter = Counter()
    for paper in papers:
        concept_counter.update(normalize(concept) for concept in paper.get("concepts", [])[:12] if normalize(concept))
    top_concepts = top_values(concept_counter, 4)
    exemplar = sorted(papers, key=lambda paper: paper.get("citations", 0), reverse=True)[:2]
    size = len(component)
    if size == 1:
        kind = "singleton"
        label = f"Isolated study: {top_concepts[0] if top_concepts else 'Standalone topic'}"
        description = "A standalone paper with no citation-chain neighbors inside the current corpus graph."
    elif size == 2:
        kind = "dyad"
        label = f"Micro-cluster: {top_concepts[0] if top_concepts else 'Paired topic'}"
        description = "A two-paper fragment with a narrow local citation relationship."
    else:
        kind = "micro"
        label = f"Small cluster: {top_concepts[0] if top_concepts else 'Focused topic'}"
        description = "A compact local cluster with limited citation spread."
    return {
        "clusterId": cluster_id,
        "size": size,
        "kind": kind,
        "shortLabel": label[:36],
        "label": label,
        "description": description,
        "researchFocus": " / ".join(top_concepts[:2]) if top_concepts else "Mixed research focus",
        "methods": top_concepts[:3],
        "signatureTerms": top_concepts,
        "visualMotif": "Sparse fragment" if size <= 2 else "Compact island",
        "topConcepts": top_concepts,
        "topCountries": top_values(Counter(country for paper in papers for country in paper.get("countries", [])), 3),
        "topInstitutions": top_values(Counter(inst for paper in papers for inst in paper.get("institutions", [])), 3),
        "topPapers": [
            {
                "title": normalize(paper.get("title")),
                "year": paper.get("year"),
                "citations": paper.get("citations", 0),
            }
            for paper in exemplar
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="qwen3:8b")
    parser.add_argument("--min-llm-size", type=int, default=3)
    args = parser.parse_args()

    graph = json.loads(GRAPH_PATH.read_text())
    papers = json.loads(PAPERS_PATH.read_text())
    components, cluster_by_id = compute_components(graph)
    papers_by_cluster: dict[int, list[dict]] = {}
    for paper in papers:
        cluster_id = cluster_by_id.get(paper.get("id"))
        if cluster_id is None:
            continue
        papers_by_cluster.setdefault(cluster_id, []).append(paper)

    profiles = {}
    for cluster_id, component in enumerate(components):
        cluster_papers = papers_by_cluster.get(cluster_id, [])
        if len(component) >= args.min_llm_size:
            profile = summarize_cluster(cluster_id, component, cluster_papers, args.model)
            print(f"qwen cluster {cluster_id} size={len(component)} -> {profile['shortLabel']}")
        else:
            profile = fallback_profile(cluster_id, component, cluster_papers)
        profiles[str(cluster_id)] = profile

    OUTPUT_PATH.write_text(json.dumps(profiles, ensure_ascii=False, indent=2))
    print(f"wrote {OUTPUT_PATH}")
    print(f"clusters: {len(profiles)}")
    print(f"llm clusters: {sum(1 for p in profiles.values() if p['kind'] == 'substantive')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

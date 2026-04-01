import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {
  calculateGini,
  computeConnectedComponents,
  computeNetworkDensity,
  computePageRank,
  topInstitutions,
} from "./metrics.js";

const DATA_URLS = {
  graph: "./data/graph.json",
  papers: "./data/papers_enriched.json",
  papersFallback: "./data/papers.json",
  timeseries: "./data/timeseries.json",
};

export async function loadResearchDataset() {
  const [graph, papers, timeseries] = await Promise.all([
    d3.json(DATA_URLS.graph),
    d3.json(DATA_URLS.papers).catch(() => d3.json(DATA_URLS.papersFallback)),
    d3.json(DATA_URLS.timeseries),
  ]);

  const pagerank = computePageRank(graph.nodes, graph.edges);
  const { components, clusterByNodeId } = computeConnectedComponents(graph.nodes, graph.edges);
  const nodeById = new Map();
  const normalizedPageRankExtent = d3.extent(pagerank);
  const pagerankScale = d3.scaleLinear().domain(normalizedPageRankExtent).range([0.1, 1]).clamp(true);

  graph.nodes.forEach((node, index) => {
    node.pagerank = pagerank[index];
    node.pagerankNormalized = pagerankScale(pagerank[index]);
    node.cluster = clusterByNodeId.get(node.id) ?? components.length;
    node.degree = 0;
    nodeById.set(node.id, node);
  });

  graph.edges.forEach((edge) => {
    const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
    const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
    const source = nodeById.get(sourceId);
    const target = nodeById.get(targetId);
    if (!source || !target) {
      return;
    }
    source.degree += 1;
    target.degree += 1;
  });

  const enrichedPapers = papers
    .map((paper) => ({ ...paper, ...(nodeById.get(paper.id) || {}) }))
    .sort((a, b) => (b.citations || 0) - (a.citations || 0));

  const citations = enrichedPapers.map((paper) => paper.citations || 0);
  const pageranks = enrichedPapers.map((paper) => paper.pagerank || 0);
  const years = enrichedPapers.map((paper) => paper.year).filter(Number.isFinite);
  const topCatalystPapers = enrichedPapers.slice(0, 3);

  return {
    graph: {
      ...graph,
      nodes: graph.nodes,
      edges: graph.edges,
    },
    papers: enrichedPapers,
    timeseries,
    summary: {
      totalPapers: enrichedPapers.length,
      totalCitations: d3.sum(citations),
      totalInstitutions: new Set(enrichedPapers.flatMap((paper) => paper.institutions || [])).size,
      networkDensity: computeNetworkDensity(graph.nodes.length, graph.edges.length),
      yearExtent: d3.extent(years),
      citationExtent: d3.extent(citations),
      pagerankExtent: d3.extent(pageranks),
      citationGini: calculateGini(citations),
      pagerankGini: calculateGini(pageranks),
      components,
      topCatalystPapers,
      topInstitutionsByCitations: topInstitutions(enrichedPapers, "citations"),
      topInstitutionsByPagerank: topInstitutions(enrichedPapers, "pagerank"),
    },
  };
}

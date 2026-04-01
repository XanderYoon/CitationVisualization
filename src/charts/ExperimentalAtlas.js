import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderVizCard } from "../components/Section.js";
import { clampText, formatCompact, formatDecimal, formatInteger, formatPercent } from "../utils/format.js";
import { createResponsiveSvg, createTooltip } from "./shared.js";

const CLUSTER_COLORS = ["#2563EB", "#0F766E", "#DC6B2F", "#7C3AED", "#D94678", "#0891B2"];

export function renderExperimentalAtlas(root, dataset, store) {
  const shell = document.createElement("div");
  shell.className = "experimental-lab";
  root.append(shell);

  const atlasCard = renderVizCard(
    shell,
    "Influence atlas",
    "A cluster-aware observatory of bridge papers and structural concentration."
  );
  atlasCard.classList.add("viz-card--immersive");
  atlasCard.insertAdjacentHTML(
    "beforeend",
    `<p class="chart-note">This is the only cluster-first view in the sandbox. It compresses the most consequential citation components into a single field, emphasizing bridge links and structurally important papers.</p>`
  );
  const atlasLegend = document.createElement("div");
  atlasLegend.className = "legend-row legend-row--immersive";
  atlasCard.append(atlasLegend);
  const atlasHost = document.createElement("div");
  atlasCard.append(atlasHost);
  const atlasChart = createResponsiveSvg(atlasHost, 620);
  const atlasTooltip = createTooltip(atlasHost);

  const ribbonCard = renderVizCard(
    shell,
    "Recognition gap map",
    "A clearer comparison of popularity rank versus structural rank for the most under-recognized papers."
  );
  ribbonCard.classList.add("viz-card--soft");
  ribbonCard.insertAdjacentHTML(
    "beforeend",
    `<p class="chart-note">Each row is one paper. The left endpoint shows where it ranks by citations, the right endpoint shows where it ranks by PageRank, and the connecting band reveals the size of the mismatch.</p>`
  );
  const ribbonHost = document.createElement("div");
  ribbonCard.append(ribbonHost);
  const ribbonChart = createResponsiveSvg(ribbonHost, 420);
  const ribbonTooltip = createTooltip(ribbonHost);

  const barcodeCard = renderVizCard(
    shell,
    "Attention barcode",
    "A compressed wall of yearly attention concentration across the active publication window."
  );
  barcodeCard.classList.add("viz-card--soft");
  barcodeCard.insertAdjacentHTML(
    "beforeend",
    `<p class="chart-note">Every row is a year, every sliver a paper ordered by citations. Bright early slivers indicate a few papers consuming a large share of that year’s attention budget.</p>`
  );
  const barcodeHost = document.createElement("div");
  barcodeCard.append(barcodeHost);
  const barcodeChart = createResponsiveSvg(barcodeHost, 480);
  const barcodeTooltip = createTooltip(barcodeHost);

  const render = () => {
    const state = store.getState();
    const filteredPapers = dataset.papers.filter(
      (paper) => paper.year >= state.yearRange[0] && paper.year <= state.yearRange[1]
    );
    const sandboxData = buildSandboxData(dataset, filteredPapers, state.selectedPaper);

    atlasLegend.innerHTML = sandboxData.clusters
      .map(
        (cluster) => `
          <span class="legend-item">
            <span class="legend-swatch" style="background:${cluster.color}"></span>
            ${cluster.label}
          </span>
        `
      )
      .join("");

    drawInfluenceAtlas(atlasChart, sandboxData, atlasTooltip, store);
    drawRecognitionRibbons(ribbonChart, sandboxData, ribbonTooltip, store);
    drawAttentionBarcode(barcodeChart, sandboxData, barcodeTooltip, store);
  };

  store.subscribe(render);
  atlasHost.addEventListener("chart:resize", render);
  ribbonHost.addEventListener("chart:resize", render);
  barcodeHost.addEventListener("chart:resize", render);
}

function buildSandboxData(dataset, filteredPapers, selectedPaperId) {
  const filteredPaperIds = new Set(filteredPapers.map((paper) => paper.id));
  const filteredNodeIds = new Set(dataset.graph.nodes.filter((node) => filteredPaperIds.has(node.id)).map((node) => node.id));
  const filteredEdges = dataset.graph.edges.filter((edge) => {
    const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
    const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
    return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
  });

  const nodeById = new Map(filteredPapers.map((paper) => [paper.id, paper]));
  const citationExtent = safeExtent(filteredPapers, (paper) => paper.citations || 0);
  const pagerankExtent = safeExtent(filteredPapers, (paper) => paper.pagerank || 0);
  const degreeExtent = safeExtent(filteredPapers, (paper) => paper.degree || 0);
  const citationScale = d3.scaleSqrt().domain(citationExtent).range([0.2, 1]).clamp(true);
  const pagerankScale = d3.scaleLinear().domain(pagerankExtent).range([0.2, 1]).clamp(true);
  const degreeScale = d3.scaleLinear().domain(degreeExtent).range([0.2, 1]).clamp(true);
  const clusterProfiles = dataset.clusterProfiles || {};

  const rankedClusters = d3
    .groups(filteredPapers, (paper) => paper.cluster ?? 0)
    .map(([clusterId, papers], index) => {
      const profile = clusterProfiles[String(clusterId)] || {};
      return {
        clusterId,
        papers,
        totalPagerank: d3.sum(papers, (paper) => paper.pagerank || 0),
        totalCitations: d3.sum(papers, (paper) => paper.citations || 0),
        color: CLUSTER_COLORS[index % CLUSTER_COLORS.length],
        label: profile.shortLabel || `Cluster ${index + 1}`,
      };
    })
    .sort((a, b) => b.totalPagerank - a.totalPagerank)
    .slice(0, 5)
    .map((cluster, index) => ({ ...cluster, color: CLUSTER_COLORS[index % CLUSTER_COLORS.length] }));

  const clusterIds = new Set(rankedClusters.map((cluster) => cluster.clusterId));
  const rankedNodes = filteredPapers
    .filter((paper) => clusterIds.has(paper.cluster) || paper.id === selectedPaperId)
    .map((paper) => ({
      ...paper,
      atlasScore:
        pagerankScale(paper.pagerank || 0) * 0.5 +
        citationScale(paper.citations || 0) * 0.25 +
        degreeScale(paper.degree || 0) * 0.25,
    }))
    .sort((a, b) => b.atlasScore - a.atlasScore);

  const chosen = new Map();
  rankedClusters.forEach((cluster) => {
    rankedNodes
      .filter((paper) => paper.cluster === cluster.clusterId)
      .slice(0, 8)
      .forEach((paper) => chosen.set(paper.id, { ...paper, color: cluster.color, clusterLabel: cluster.label }));
  });
  rankedNodes.slice(0, 12).forEach((paper) => {
    if (!chosen.has(paper.id)) {
      const cluster = rankedClusters.find((entry) => entry.clusterId === paper.cluster);
      chosen.set(paper.id, {
        ...paper,
        color: cluster?.color || "#2563EB",
        clusterLabel: cluster?.label || "Satellite",
      });
    }
  });
  if (selectedPaperId && nodeById.has(selectedPaperId)) {
    const paper = nodeById.get(selectedPaperId);
    const cluster = rankedClusters.find((entry) => entry.clusterId === paper.cluster);
    chosen.set(selectedPaperId, {
      ...paper,
      atlasScore:
        pagerankScale(paper.pagerank || 0) * 0.5 +
        citationScale(paper.citations || 0) * 0.25 +
        degreeScale(paper.degree || 0) * 0.25,
      color: cluster?.color || "#111827",
      clusterLabel: cluster?.label || "Selected paper",
    });
  }

  const atlasNodes = [...chosen.values()];
  const selectedIds = new Set(atlasNodes.map((node) => node.id));
  const atlasLinks = filteredEdges
    .filter((edge) => {
      const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
      const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
      return selectedIds.has(sourceId) && selectedIds.has(targetId);
    })
    .map((edge) => {
      const sourceId = typeof edge.source === "object" ? edge.source.id : edge.source;
      const targetId = typeof edge.target === "object" ? edge.target.id : edge.target;
      const source = chosen.get(sourceId);
      const target = chosen.get(targetId);
      return {
        source,
        target,
        crossCluster: source?.cluster !== target?.cluster,
        weight: (source?.pagerank || 0) + (target?.pagerank || 0),
      };
    })
    .filter((edge) => edge.source && edge.target)
    .sort((a, b) => Number(b.crossCluster) - Number(a.crossCluster) || b.weight - a.weight)
    .slice(0, 80);

  const citationRank = new Map(
    [...filteredPapers]
      .sort((a, b) => (b.citations || 0) - (a.citations || 0))
      .map((paper, index) => [paper.id, index + 1])
  );
  const structuralRank = new Map(
    [...filteredPapers]
      .sort((a, b) => (b.pagerank || 0) - (a.pagerank || 0))
      .map((paper, index) => [paper.id, index + 1])
  );

  const hiddenConnectors = [...filteredPapers]
    .map((paper) => ({
      ...paper,
      citationNormalized: citationScale(paper.citations || 0),
      pagerankNormalizedLocal: pagerankScale(paper.pagerank || 0),
      gapScore: pagerankScale(paper.pagerank || 0) - citationScale(paper.citations || 0),
      citationRank: citationRank.get(paper.id) || filteredPapers.length,
      structuralRank: structuralRank.get(paper.id) || filteredPapers.length,
    }))
    .filter((paper) => paper.gapScore > 0)
    .sort((a, b) => b.gapScore - a.gapScore)
    .slice(0, 12);

  const activeYears = d3
    .groups(filteredPapers, (paper) => paper.year)
    .map(([year, papers]) => ({
      year: Number(year),
      papers,
      totalCitations: d3.sum(papers, (paper) => paper.citations || 0),
      gini:
        dataset.timeseries.find((row) => row.year === Number(year))?.gini_citations ??
        calculateGini(papers.map((paper) => paper.citations || 0)),
    }))
    .sort((a, b) => a.year - b.year);

  const attentionRows = activeYears.slice(-18).map((entry) => {
    const sorted = [...entry.papers].sort((a, b) => (b.citations || 0) - (a.citations || 0));
    const total = d3.sum(sorted, (paper) => paper.citations || 0) || 1;
    return {
      year: entry.year,
      gini: entry.gini,
      paperCount: sorted.length,
      cells: sorted.slice(0, 56).map((paper, index) => ({
        paper,
        order: index,
        share: (paper.citations || 0) / total,
      })),
    };
  });

  const selectedNode = selectedPaperId ? nodeById.get(selectedPaperId) : null;

  return {
    clusters: rankedClusters,
    atlasNodes,
    atlasLinks,
    hiddenConnectors,
    attentionRows,
    selectedPaperId,
    selectedNode,
  };
}

function drawInfluenceAtlas(chart, data, tooltip, store) {
  const { svg, measure } = chart;
  const { width, height } = measure();
  svg.selectAll("*").remove();

  if (!data.atlasNodes.length) {
    drawEmptyState(svg, width, height, "No papers fall inside the current year range.");
    return;
  }

  const defs = svg.append("defs");
  const backgroundGradient = defs.append("radialGradient").attr("id", "atlas-bg").attr("cx", "50%").attr("cy", "48%");
  backgroundGradient.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff");
  backgroundGradient.append("stop").attr("offset", "65%").attr("stop-color", "#eef4ff");
  backgroundGradient.append("stop").attr("offset", "100%").attr("stop-color", "#dfeafc");
  const glow = defs.append("filter").attr("id", "atlas-glow");
  glow.append("feGaussianBlur").attr("stdDeviation", 10).attr("result", "blur");
  glow.append("feMerge").call((merge) => {
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");
  });

  svg.append("rect").attr("width", width).attr("height", height).attr("rx", 24).attr("fill", "url(#atlas-bg)");

  const centerX = width / 2;
  const centerY = height / 2;
  const outerRadius = Math.min(width, height) * 0.38;
  const innerRadius = outerRadius * 0.44;
  const root = svg.append("g");
  const sectorGroup = root.append("g");
  const linkGroup = root.append("g");
  const nodeGroup = root.append("g");
  const labelGroup = root.append("g");

  data.clusters.forEach((cluster, index) => {
    const startAngle = -Math.PI / 2 + (index / data.clusters.length) * Math.PI * 2;
    const endAngle = -Math.PI / 2 + ((index + 1) / data.clusters.length) * Math.PI * 2;
    sectorGroup
      .append("path")
      .attr("d", d3.arc().innerRadius(innerRadius).outerRadius(outerRadius).startAngle(startAngle).endAngle(endAngle)())
      .attr("transform", `translate(${centerX},${centerY})`)
      .attr("fill", cluster.color)
      .attr("fill-opacity", 0.07)
      .attr("stroke", cluster.color)
      .attr("stroke-opacity", 0.18);

    const angle = (startAngle + endAngle) / 2;
    const labelRadius = outerRadius + 22;
    labelGroup
      .append("text")
      .attr("x", centerX + Math.cos(angle) * labelRadius)
      .attr("y", centerY + Math.sin(angle) * labelRadius)
      .attr("class", "experimental-label")
      .attr("text-anchor", Math.cos(angle) > 0.15 ? "start" : Math.cos(angle) < -0.15 ? "end" : "middle")
      .text(`${cluster.label} · ${formatCompact.format(cluster.totalCitations)} cites`);
  });

  const anchorByCluster = new Map(
    data.clusters.map((cluster, index) => {
      const angle = -Math.PI / 2 + ((index + 0.5) / data.clusters.length) * Math.PI * 2;
      return [
        cluster.clusterId,
        {
          x: centerX + Math.cos(angle) * (innerRadius + outerRadius) * 0.5,
          y: centerY + Math.sin(angle) * (innerRadius + outerRadius) * 0.5,
        },
      ];
    })
  );

  const nodes = data.atlasNodes.map((node) => ({
    ...node,
    x: anchorByCluster.get(node.cluster)?.x || centerX,
    y: anchorByCluster.get(node.cluster)?.y || centerY,
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const links = data.atlasLinks
    .map((link) => ({ ...link, source: nodeById.get(link.source.id), target: nodeById.get(link.target.id) }))
    .filter((link) => link.source && link.target);

  d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((node) => node.id).distance((link) => (link.crossCluster ? 140 : 80)).strength((link) => (link.crossCluster ? 0.18 : 0.09)))
    .force("x", d3.forceX((node) => anchorByCluster.get(node.cluster)?.x || centerX).strength(0.22))
    .force("y", d3.forceY((node) => anchorByCluster.get(node.cluster)?.y || centerY).strength(0.22))
    .force("charge", d3.forceManyBody().strength(-42))
    .force("collision", d3.forceCollide((node) => 8 + (node.atlasScore || 0) * 18))
    .stop()
    .tick(240);

  linkGroup
    .selectAll("path")
    .data(links)
    .join("path")
    .attr("d", (link) => buildRibbonPath(link.source, link.target))
    .attr("fill", "none")
    .attr("stroke", (link) => (link.crossCluster ? "#111827" : link.source.color))
    .attr("stroke-opacity", (link) => (link.crossCluster ? 0.16 : 0.1))
    .attr("stroke-width", (link) => (link.crossCluster ? 1.6 : 1.1));

  const haloNodes = nodeGroup.selectAll(".experimental-node").data(nodes).join("g").attr("class", "experimental-node").attr("transform", (node) => `translate(${node.x},${node.y})`);
  haloNodes.append("circle").attr("r", (node) => 10 + (node.atlasScore || 0) * 16).attr("fill", (node) => node.color).attr("fill-opacity", 0.12).attr("filter", "url(#atlas-glow)");
  haloNodes
    .append("circle")
    .attr("r", (node) => 4 + (node.atlasScore || 0) * 8)
    .attr("fill", (node) => (data.selectedPaperId === node.id ? "#111827" : node.color))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", (node) => (data.selectedPaperId === node.id ? 2.4 : 1.4))
    .style("cursor", "pointer")
    .on("mouseenter", (event, node) => {
      tooltip.show(
        `<strong>${clampText(node.title, 92)}</strong>
        Cluster: ${node.clusterLabel}<br />
        Citations: ${formatInteger.format(node.citations || 0)}<br />
        PageRank: ${formatDecimal(node.pagerank || 0, 4)}<br />
        Degree: ${formatInteger.format(node.degree || 0)}`,
        event.offsetX + 12,
        event.offsetY + 12
      );
    })
    .on("mouseleave", () => tooltip.hide())
    .on("click", (_, node) => store.setState({ selectedPaper: node.id }));

  labelGroup
    .selectAll(".experimental-node-label")
    .data(nodes.filter((node) => node.atlasScore > 0.72 || data.selectedPaperId === node.id))
    .join("text")
    .attr("class", "experimental-node-label")
    .attr("x", (node) => node.x + 12)
    .attr("y", (node) => node.y - 12)
    .text((node) => clampText(node.title, 34));

  const bridgeCount = links.filter((link) => link.crossCluster).length;
  root.append("circle").attr("cx", centerX).attr("cy", centerY).attr("r", innerRadius * 0.74).attr("fill", "rgba(255,255,255,0.86)").attr("stroke", "rgba(37,99,235,0.16)");
  root.append("text").attr("x", centerX).attr("y", centerY - 18).attr("class", "experimental-core experimental-core--eyebrow").attr("text-anchor", "middle").text("Bridge network");
  root.append("text").attr("x", centerX).attr("y", centerY + 10).attr("class", "experimental-core").attr("text-anchor", "middle").text(`${bridgeCount} cross-cluster links`);
  root
    .append("text")
    .attr("x", centerX)
    .attr("y", centerY + 34)
    .attr("class", "experimental-core experimental-core--small")
    .attr("text-anchor", "middle")
    .text(data.selectedNode ? clampText(data.selectedNode.title, 38) : "Select a paper anywhere in the platform");
}

function drawRecognitionRibbons(chart, data, tooltip, store) {
  const { svg, measure } = chart;
  const { width, height } = measure();
  svg.selectAll("*").remove();

  if (!data.hiddenConnectors.length) {
    drawEmptyState(svg, width, height, "No recognition-gap papers are available for the current selection.");
    return;
  }

  const margin = { top: 42, right: 88, bottom: 28, left: 88 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const maxRank = d3.max(data.hiddenConnectors, (paper) => Math.max(paper.citationRank, paper.structuralRank)) || 1;
  const x = d3.scaleLinear().domain([1, maxRank]).range([0, innerWidth]);
  const papers = data.hiddenConnectors.slice(0, 10);
  const y = d3.scalePoint().domain(papers.map((paper) => paper.id)).range([0, innerHeight]).padding(0.7);
  const thickness = d3.scaleLinear().domain(safeExtent(papers, (paper) => paper.gapScore)).range([8, 18]);

  group.append("text").attr("class", "axis-label").attr("x", 0).attr("y", -18).text("More cited");
  group.append("text").attr("class", "axis-label").attr("x", innerWidth).attr("y", -18).attr("text-anchor", "end").text("More structurally central");
  group.append("text").attr("class", "small-note").attr("x", 0).attr("y", -2).text("Citation rank");
  group.append("text").attr("class", "small-note").attr("x", innerWidth).attr("y", -2).attr("text-anchor", "end").text("PageRank rank");
  group.append("line").attr("x1", x(1)).attr("x2", x(1)).attr("y1", 0).attr("y2", innerHeight).attr("stroke", "#BFDBFE").attr("stroke-width", 1.5);
  group.append("line").attr("x1", x(maxRank)).attr("x2", x(maxRank)).attr("y1", 0).attr("y2", innerHeight).attr("stroke", "#A7F3D0").attr("stroke-width", 1.5);

  papers.forEach((paper) => {
    const yPos = y(paper.id) || 0;
    const x1 = x(paper.citationRank);
    const x2 = x(paper.structuralRank);
    const stroke = paper.id === data.selectedPaperId ? "#111827" : "#0F766E";

    group
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", yPos)
      .attr("y2", yPos)
      .attr("stroke", "rgba(226, 232, 240, 0.8)");

    group
      .append("path")
      .attr("d", `M${x1},${yPos} C${x1 + innerWidth * 0.18},${yPos - 18} ${x2 - innerWidth * 0.18},${yPos + 18} ${x2},${yPos}`)
      .attr("fill", "none")
      .attr("stroke", stroke)
      .attr("stroke-width", thickness(paper.gapScore))
      .attr("stroke-opacity", paper.id === data.selectedPaperId ? 0.88 : 0.42)
      .attr("stroke-linecap", "round")
      .style("cursor", "pointer")
      .on("mouseenter", (event) => {
        tooltip.show(
          `<strong>${clampText(paper.title, 88)}</strong>
          Citation rank: ${formatInteger.format(paper.citationRank)}<br />
          Structural rank: ${formatInteger.format(paper.structuralRank)}<br />
          Recognition gap: ${formatDecimal(paper.gapScore, 3)}`,
          event.offsetX + 12,
          event.offsetY + 12
        );
      })
      .on("mouseleave", () => tooltip.hide())
      .on("click", () => store.setState({ selectedPaper: paper.id }));

    group.append("circle").attr("cx", x1).attr("cy", yPos).attr("r", 5).attr("fill", "#2563EB");
    group.append("circle").attr("cx", x2).attr("cy", yPos).attr("r", 5).attr("fill", "#0F766E");
    group
      .append("text")
      .attr("x", x1 - 10)
      .attr("y", yPos + 4)
      .attr("class", "small-note")
      .attr("text-anchor", "end")
      .text(`#${paper.citationRank}`);
    group
      .append("text")
      .attr("x", x2 + 10)
      .attr("y", yPos + 4)
      .attr("class", "small-note")
      .text(`#${paper.structuralRank}`);
    group
      .append("text")
      .attr("x", innerWidth / 2)
      .attr("y", yPos + 4)
      .attr("class", "small-note")
      .attr("text-anchor", "middle")
      .text(clampText(paper.title, 46));
  });
}

function drawAttentionBarcode(chart, data, tooltip, store) {
  const { svg, measure } = chart;
  const { width, height } = measure();
  svg.selectAll("*").remove();

  if (!data.attentionRows.length) {
    drawEmptyState(svg, width, height, "No attention barcode is available for the current selection.");
    return;
  }

  const margin = { top: 26, right: 20, bottom: 20, left: 56 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const y = d3.scaleBand().domain(data.attentionRows.map((row) => row.year)).range([0, innerHeight]).padding(0.18);
  const maxColumns = d3.max(data.attentionRows, (row) => row.cells.length) || 1;
  const x = d3.scaleBand().domain(d3.range(maxColumns)).range([0, innerWidth]).paddingInner(0.04);

  data.attentionRows.forEach((row) => {
    const yPos = y(row.year) || 0;
    group
      .append("text")
      .attr("class", "small-note")
      .attr("x", -10)
      .attr("y", yPos + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text(row.year);

    group
      .append("rect")
      .attr("x", 0)
      .attr("y", yPos)
      .attr("width", innerWidth)
      .attr("height", y.bandwidth())
      .attr("rx", 10)
      .attr("fill", row.gini > 0.7 ? "rgba(219, 234, 254, 0.42)" : "rgba(239, 246, 255, 0.72)");

    group
      .selectAll(`.barcode-${row.year}`)
      .data(row.cells)
      .join("rect")
      .attr("x", (cell) => x(cell.order))
      .attr("y", yPos)
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("fill", (cell) => d3.interpolateRgbBasis(["#DBEAFE", "#60A5FA", "#1D4ED8"])(Math.min(1, cell.share * 12)))
      .attr("opacity", (cell) => 0.24 + Math.min(0.76, cell.share * 14))
      .style("cursor", "pointer")
      .on("mouseenter", (event, cell) => {
        tooltip.show(
          `<strong>${clampText(cell.paper.title, 88)}</strong>
          Year: ${row.year}<br />
          Citations: ${formatInteger.format(cell.paper.citations || 0)}<br />
          Share of yearly citations: ${formatPercent.format(cell.share)}<br />
          Yearly Gini: ${formatDecimal(row.gini, 3)}`,
          event.offsetX + 12,
          event.offsetY + 12
        );
      })
      .on("mouseleave", () => tooltip.hide())
      .on("click", (_, cell) => store.setState({ selectedPaper: cell.paper.id }));
  });
}

function buildRibbonPath(source, target) {
  const mx = (source.x + target.x) / 2;
  const my = (source.y + target.y) / 2;
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const curve = Math.hypot(dx, dy) * 0.16;
  return `M${source.x},${source.y} Q${mx + dy * 0.08},${my - dx * 0.08 - curve} ${target.x},${target.y}`;
}

function safeExtent(values, accessor) {
  const extent = d3.extent(values, accessor);
  if (!Number.isFinite(extent[0]) || !Number.isFinite(extent[1])) {
    return [0, 1];
  }
  if (extent[0] === extent[1]) {
    return [extent[0], extent[1] + 1];
  }
  return extent;
}

function drawEmptyState(svg, width, height, text) {
  svg.append("text").attr("class", "empty-state").attr("x", width / 2).attr("y", height / 2).attr("text-anchor", "middle").text(text);
}

function calculateGini(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const total = d3.sum(sorted);
  if (!sorted.length || total === 0) {
    return 0;
  }
  let cumulative = 0;
  let weighted = 0;
  sorted.forEach((value) => {
    cumulative += value;
    weighted += cumulative;
  });
  return (sorted.length + 1 - (2 * weighted) / total) / sorted.length;
}

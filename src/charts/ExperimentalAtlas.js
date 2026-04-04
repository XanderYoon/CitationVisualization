import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderVizCard } from "../components/Section.js";
import { clampText, formatInteger } from "../utils/format.js";
import { createResponsiveSvg, createTooltip } from "./shared.js";

const CLUSTER_COLORS = ["#2563EB", "#0F766E", "#DC6B2F", "#7C3AED", "#D94678", "#0891B2", "#84CC16", "#B45309"];
const TOPIC_STOPLIST = new Set([
  "computer science",
  "medicine",
  "biology",
  "mathematics",
  "statistics",
  "engineering",
  "economics",
  "psychology",
  "law",
  "political science",
  "philosophy",
  "nursing",
  "public health",
  "health care",
  "disease",
  "internal medicine",
  "endocrinology",
  "pathology",
  "environmental health",
  "cardiology",
  "medical emergency",
  "physics",
  "geography",
  "sociology",
  "business",
  "linguistics",
  "programming language",
  "operating system",
  "database",
  "computer security",
  "knowledge management",
  "economic growth",
  "population",
  "cohort",
  "risk analysis (engineering)",
  "selection (genetic algorithm)",
  "feature (linguistics)",
  "classifier (uml)",
  "identification (biology)",
  "paleontology",
  "preprocessor",
  "medline",
  "world wide web",
  "www",
  "internet",
]);
const TOPIC_LIMIT = 34;
const EDGE_LIMIT = 90;
const MIN_TOPIC_FREQUENCY = 5;
const MIN_EDGE_WEIGHT = 3;
const TOPIC_MIN_YEAR = 2000;

export function renderExperimentalAtlas(root, dataset, store) {
  const shell = document.createElement("div");
  shell.className = "experimental-lab topic-lab";
  root.append(shell);

  const atlasCard = renderVizCard(
    shell,
    "Temporal word map",
    "Concept nodes grow with cumulative frequency, link through co-occurrence, and reorganize as the field develops."
  );
  atlasCard.classList.add("viz-card--immersive");
  atlasCard.insertAdjacentHTML(
    "beforeend",
    `<p class="chart-note">Use the year slider to accumulate the field over time. Larger nodes indicate topics appearing in more papers, while denser links reveal concepts that repeatedly travel together.</p>`
  );

  const controls = document.createElement("div");
  controls.className = "topic-controls";
  atlasCard.append(controls);

  const sliderWrap = document.createElement("div");
  sliderWrap.className = "topic-slider";
  controls.append(sliderWrap);

  const sliderLabel = document.createElement("label");
  sliderLabel.className = "inline-label";
  sliderLabel.textContent = "Cumulative year";
  sliderWrap.append(sliderLabel);

  const sliderValue = document.createElement("div");
  sliderValue.className = "topic-slider__value";
  sliderWrap.append(sliderValue);

  const [, datasetMaxYear] = dataset.summary.yearExtent;
  const minYear = Math.max(TOPIC_MIN_YEAR, dataset.summary.yearExtent[0]);
  const maxYear = datasetMaxYear;
  const yearSlider = document.createElement("input");
  yearSlider.type = "range";
  yearSlider.min = String(minYear);
  yearSlider.max = String(maxYear);
  yearSlider.step = "1";
  yearSlider.value = String(store.getState().topicYear ?? maxYear);
  sliderWrap.append(yearSlider);

  const status = document.createElement("div");
  status.className = "topic-status";
  controls.append(status);

  const atlasLegend = document.createElement("div");
  atlasLegend.className = "legend-row legend-row--immersive topic-legend";
  atlasCard.append(atlasLegend);

  const atlasHost = document.createElement("div");
  atlasCard.append(atlasHost);
  const atlasChart = createResponsiveSvg(atlasHost, 640);
  const atlasTooltip = createTooltip(atlasHost);

  const trendCard = renderVizCard(
    shell,
    "Topic trend spotlight",
    "The strongest risers and decliners compared with the prior cumulative year."
  );
  trendCard.classList.add("viz-card--soft");
  trendCard.insertAdjacentHTML(
    "beforeend",
    `<p class="chart-note">This view compares cumulative counts year-over-year, making it easier to spot acceleration rather than just raw topic size.</p>`
  );
  const trendHost = document.createElement("div");
  trendHost.className = "topic-summary";
  trendCard.append(trendHost);

  const clusterCard = renderVizCard(
    shell,
    "Cluster summary",
    "A compact readout of the dominant thematic neighborhoods in the active year."
  );
  clusterCard.classList.add("viz-card--soft");
  clusterCard.insertAdjacentHTML(
    "beforeend",
    `<p class="chart-note">Clusters are computed from the visible topic co-occurrence network. Labels are generated from the most frequent terms in each community.</p>`
  );
  const clusterHost = document.createElement("div");
  clusterHost.className = "topic-summary";
  clusterCard.append(clusterHost);

  const cache = new Map();
  let hoveredTopic = null;

  function render() {
    const state = store.getState();
    const topicYear = clampYear(state.topicYear ?? maxYear, minYear, maxYear);
    if (topicYear !== state.topicYear) {
      store.setState({ topicYear });
      return;
    }

    yearSlider.value = String(topicYear);
    sliderValue.textContent = `${minYear}-${topicYear}`;

    const cacheKey = String(topicYear);
    let topicData = cache.get(cacheKey);
    if (!topicData) {
      topicData = buildTopicData(dataset.papers, topicYear, minYear);
      cache.set(cacheKey, topicData);
    }

    const selectedTopic = topicData.topicLookup.has(state.selectedTopic) ? state.selectedTopic : null;
    const activeHoveredTopic = topicData.topicLookup.has(hoveredTopic) ? hoveredTopic : null;
    if (state.selectedTopic && !selectedTopic) {
      store.setState({ selectedTopic: null });
      return;
    }

    atlasLegend.innerHTML = topicData.clusters
      .map(
        (cluster) => `
          <span class="legend-item">
            <span class="legend-swatch" style="background:${cluster.color}"></span>
            ${cluster.label}
          </span>
        `
      )
      .join("");

    status.innerHTML = `
      <span class="metric-chip"><strong>${formatInteger.format(topicData.paperCount)}</strong> papers in view</span>
      <span class="metric-chip"><strong>${formatInteger.format(topicData.nodes.length)}</strong> visible topics</span>
      <span class="metric-chip"><strong>${formatInteger.format(topicData.edges.length)}</strong> co-occurrence links</span>
      <span class="metric-chip"><strong>${activeHoveredTopic || selectedTopic || "All topics"}</strong> focus</span>
    `;

    drawTemporalWordMap(
      atlasChart,
      topicData,
      selectedTopic,
      activeHoveredTopic,
      atlasTooltip,
      store,
      (topicId) => {
        hoveredTopic = topicId;
        render();
      }
    );
    renderTrendSpotlight(trendHost, topicData, selectedTopic);
    renderClusterSummary(clusterHost, topicData, selectedTopic);
  }

  yearSlider.addEventListener("input", (event) => {
    store.setState({
      topicYear: clampYear(Number(event.target.value), minYear, maxYear),
    });
  });

  store.subscribe(render);
  atlasHost.addEventListener("chart:resize", render);
  atlasHost.addEventListener("mouseleave", () => {
    hoveredTopic = null;
    render();
  });
}

function buildTopicData(papers, topicYear, minYear) {
  const filteredPapers = papers.filter((paper) => Number.isFinite(paper.year) && paper.year >= minYear && paper.year <= topicYear);
  const priorPapers = papers.filter((paper) => Number.isFinite(paper.year) && paper.year >= minYear && paper.year <= topicYear - 1);
  const prePriorPapers = papers.filter((paper) => Number.isFinite(paper.year) && paper.year >= minYear && paper.year <= topicYear - 2);

  const currentCounts = new Map();
  const previousCounts = new Map();
  const prePreviousCounts = new Map();
  accumulateTopicCounts(filteredPapers, currentCounts);
  accumulateTopicCounts(priorPapers, previousCounts);
  accumulateTopicCounts(prePriorPapers, prePreviousCounts);

  const candidateTopics = [...currentCounts.entries()]
    .filter(([, count]) => count >= MIN_TOPIC_FREQUENCY)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOPIC_LIMIT * 2)
    .map(([topic]) => topic);

  const visibleTopics = new Set(candidateTopics);
  const topicPapers = new Map(candidateTopics.map((topic) => [topic, []]));
  const edgeWeights = new Map();

  filteredPapers.forEach((paper) => {
    const topics = extractTopics(paper).filter((topic) => visibleTopics.has(topic));
    if (!topics.length) {
      return;
    }

    topics.forEach((topic) => {
      const papersForTopic = topicPapers.get(topic);
      if (papersForTopic && papersForTopic.length < 5) {
        papersForTopic.push({
          id: paper.id,
          title: paper.title,
          year: paper.year,
        });
      }
    });

    for (let i = 0; i < topics.length; i += 1) {
      for (let j = i + 1; j < topics.length; j += 1) {
        const source = topics[i];
        const target = topics[j];
        const key = source < target ? `${source}|||${target}` : `${target}|||${source}`;
        edgeWeights.set(key, (edgeWeights.get(key) || 0) + 1);
      }
    }
  });

  const provisionalNodes = candidateTopics.map((topic) => ({
    id: topic,
    label: topic,
    frequency: currentCounts.get(topic) || 0,
    growthDelta: (currentCounts.get(topic) || 0) - (previousCounts.get(topic) || 0),
    momentum: ((currentCounts.get(topic) || 0) - (previousCounts.get(topic) || 0)) - ((previousCounts.get(topic) || 0) - (prePreviousCounts.get(topic) || 0)),
    cluster: -1,
    papers: topicPapers.get(topic) || [],
    strongestLink: null,
    strongestWeight: 0,
    degree: 0,
  }));
  const nodeById = new Map(provisionalNodes.map((node) => [node.id, node]));

  const edges = [...edgeWeights.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split("|||");
      return { source, target, weight };
    })
    .filter((edge) => edge.weight >= MIN_EDGE_WEIGHT && visibleTopics.has(edge.source) && visibleTopics.has(edge.target))
    .sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source))
    .slice(0, EDGE_LIMIT);

  edges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      return;
    }
    source.degree += 1;
    target.degree += 1;
    if (edge.weight > source.strongestWeight) {
      source.strongestWeight = edge.weight;
      source.strongestLink = edge.target;
    }
    if (edge.weight > target.strongestWeight) {
      target.strongestWeight = edge.weight;
      target.strongestLink = edge.source;
    }
  });

  const connectedTopicIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const nodes = provisionalNodes
    .filter((node) => connectedTopicIds.has(node.id))
    .sort((a, b) => b.frequency - a.frequency || b.growthDelta - a.growthDelta)
    .slice(0, TOPIC_LIMIT);
  const visibleTopicIds = new Set(nodes.map((node) => node.id));
  const filteredEdges = edges.filter((edge) => visibleTopicIds.has(edge.source) && visibleTopicIds.has(edge.target));

  nodes.forEach((node) => {
    node.degree = 0;
    node.strongestLink = null;
    node.strongestWeight = 0;
  });

  filteredEdges.forEach((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) {
      return;
    }
    source.degree += 1;
    target.degree += 1;
    if (edge.weight > source.strongestWeight) {
      source.strongestWeight = edge.weight;
      source.strongestLink = edge.target;
    }
    if (edge.weight > target.strongestWeight) {
      target.strongestWeight = edge.weight;
      target.strongestLink = edge.source;
    }
  });

  const clusters = computeTopicClusters(nodes, filteredEdges);
  const clusterByTopic = new Map();
  clusters.forEach((cluster) => {
    cluster.topicIds.forEach((topicId) => clusterByTopic.set(topicId, cluster.id));
  });

  nodes.forEach((node) => {
    node.cluster = clusterByTopic.get(node.id) ?? clusters.length;
  });

  const finalClusters = clusters.map((cluster, index) => ({
    id: cluster.id,
    color: CLUSTER_COLORS[index % CLUSTER_COLORS.length],
    label: cluster.topTerms.slice(0, 2).join(" + ") || `Topic cluster ${index + 1}`,
    topTerms: cluster.topTerms,
    topicIds: cluster.topicIds,
    totalFrequency: cluster.totalFrequency,
    size: cluster.topicIds.length,
  }));
  const finalClusterById = new Map(finalClusters.map((cluster) => [cluster.id, cluster]));

  nodes.forEach((node) => {
    node.color = finalClusterById.get(node.cluster)?.color || "#2563EB";
    node.clusterLabel = finalClusterById.get(node.cluster)?.label || "Independent topic";
  });

  return {
    year: topicYear,
    paperCount: filteredPapers.length,
    nodes,
    edges: filteredEdges,
    clusters: finalClusters.sort((a, b) => b.totalFrequency - a.totalFrequency),
    trendLeaders: buildTrendLeaders(nodes),
    topicLookup: nodeById,
  };
}

function drawTemporalWordMap(chart, data, selectedTopic, hoveredTopic, tooltip, store, setHoveredTopic) {
  const { svg, measure } = chart;
  const { width, height } = measure();
  svg.selectAll("*").remove();

  if (!data.nodes.length) {
    drawEmptyState(svg, width, height, "No visible topics appear in the current year.");
    return;
  }

  const defs = svg.append("defs");
  const backgroundGradient = defs.append("radialGradient").attr("id", "topic-map-bg").attr("cx", "50%").attr("cy", "48%");
  backgroundGradient.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff");
  backgroundGradient.append("stop").attr("offset", "68%").attr("stop-color", "#eef4ff");
  backgroundGradient.append("stop").attr("offset", "100%").attr("stop-color", "#dfeafc");

  svg.append("rect").attr("width", width).attr("height", height).attr("rx", 24).attr("fill", "url(#topic-map-bg)");

  const root = svg.append("g");
  const linkGroup = root.append("g");
  const nodeGroup = root.append("g");
  const labelGroup = root.append("g");
  const layoutPadding = {
    top: 52,
    right: 34,
    bottom: 40,
    left: 34,
  };
  const layoutWidth = width - layoutPadding.left - layoutPadding.right;
  const layoutHeight = height - layoutPadding.top - layoutPadding.bottom;
  const layoutCenterX = layoutPadding.left + layoutWidth / 2;
  const layoutCenterY = layoutPadding.top + layoutHeight / 2;

  const clusters = data.clusters.length ? data.clusters : [{ id: 0, color: "#2563EB", label: "Visible topics" }];
  const clusterAnchors = new Map(
    clusters.map((cluster, index) => {
      const angle = -Math.PI / 2 + (index / clusters.length) * Math.PI * 2;
      const radiusX = layoutWidth * 0.31;
      const radiusY = layoutHeight * 0.24;
      return [
        cluster.id,
        {
          x: layoutCenterX + Math.cos(angle) * radiusX,
          y: layoutCenterY + Math.sin(angle) * radiusY,
        },
      ];
    })
  );

  const frequencyExtent = safeExtent(data.nodes, (node) => node.frequency);
  const radius = d3.scaleSqrt().domain(frequencyExtent).range([10, 34]);
  const linkWeightExtent = safeExtent(data.edges, (edge) => edge.weight);
  const linkOpacity = d3.scaleLinear().domain(linkWeightExtent).range([0.14, 0.42]);
  const linkWidth = d3.scaleLinear().domain(linkWeightExtent).range([1, 3.8]);

  const nodes = data.nodes.map((node) => ({
    ...node,
    x: clusterAnchors.get(node.cluster)?.x || layoutCenterX,
    y: clusterAnchors.get(node.cluster)?.y || layoutCenterY,
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const links = data.edges
    .map((edge) => ({
      ...edge,
      source: nodeById.get(edge.source),
      target: nodeById.get(edge.target),
    }))
    .filter((edge) => edge.source && edge.target);

  d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((node) => node.id).distance((edge) => 185 - Math.min(72, edge.weight * 9)).strength(0.12))
    .force("charge", d3.forceManyBody().strength((node) => -180 - radius(node.frequency) * 7))
    .force("collision", d3.forceCollide((node) => radius(node.frequency) + 12))
    .force("x", d3.forceX((node) => clusterAnchors.get(node.cluster)?.x || layoutCenterX).strength(0.045))
    .force("y", d3.forceY((node) => clusterAnchors.get(node.cluster)?.y || layoutCenterY).strength(0.045))
    .stop()
    .tick(420);

  stretchNodesToViewport(nodes, radius, layoutPadding, width, height);

  nodes.forEach((node) => {
    const boundedRadius = radius(node.frequency);
    node.x = Math.max(layoutPadding.left + boundedRadius, Math.min(width - layoutPadding.right - boundedRadius, node.x));
    node.y = Math.max(layoutPadding.top + boundedRadius, Math.min(height - layoutPadding.bottom - boundedRadius, node.y));
  });

  const focusTopic = hoveredTopic || selectedTopic;
  const focusIds = new Set();
  if (focusTopic) {
    focusIds.add(focusTopic);
    links.forEach((link) => {
      if (link.source.id === focusTopic) {
        focusIds.add(link.target.id);
      }
      if (link.target.id === focusTopic) {
        focusIds.add(link.source.id);
      }
    });
  }

  linkGroup
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("x1", (link) => link.source.x)
    .attr("y1", (link) => link.source.y)
    .attr("x2", (link) => link.target.x)
    .attr("y2", (link) => link.target.y)
    .attr("stroke", (link) => {
      if (focusTopic && (link.source.id === focusTopic || link.target.id === focusTopic)) {
        return "#111827";
      }
      return link.source.color;
    })
    .attr("stroke-width", (link) => linkWidth(link.weight))
    .attr("stroke-opacity", (link) => {
      if (!focusTopic) {
        return linkOpacity(link.weight);
      }
      return link.source.id === focusTopic || link.target.id === focusTopic ? 0.62 : 0.05;
    });

  const nodeEnter = nodeGroup
    .selectAll(".topic-node")
    .data(nodes)
    .join("g")
    .attr("class", "topic-node")
    .attr("transform", (node) => `translate(${node.x},${node.y})`);

  nodeEnter
    .append("circle")
    .attr("r", (node) => radius(node.frequency) + 5)
    .attr("fill", (node) => node.color)
    .attr("fill-opacity", (node) => (focusTopic && !focusIds.has(node.id) ? 0.04 : 0.12));

  nodeEnter
    .append("circle")
    .attr("r", (node) => radius(node.frequency))
    .attr("fill", (node) => (focusTopic === node.id ? "#111827" : node.color))
    .attr("stroke", "#ffffff")
    .attr("stroke-width", (node) => (focusTopic === node.id ? 2.8 : 1.5))
    .style("cursor", "pointer")
    .attr("opacity", (node) => (focusTopic && !focusIds.has(node.id) ? 0.14 : 0.92))
    .on("mouseenter", (event, node) => {
      setHoveredTopic(node.id);
      tooltip.show(
        `<strong>${node.label}</strong>
        Papers through ${data.year}: ${formatInteger.format(node.frequency)}<br />
        Strongest linked topic: ${node.strongestLink ? `${node.strongestLink} (${formatInteger.format(node.strongestWeight)})` : "None"}<br />
        Connected topics: ${formatInteger.format(node.degree)}<br />
        Trend vs prior year: ${formatTrend(node.growthDelta)}`,
        event.offsetX + 12,
        event.offsetY + 12
      );
    })
    .on("mouseleave", () => {
      setHoveredTopic(null);
      tooltip.hide();
    })
    .on("click", (_, node) => {
      store.setState({
        selectedTopic: store.getState().selectedTopic === node.id ? null : node.id,
      });
    });

  labelGroup
    .selectAll("text")
    .data(nodes.filter((node) => shouldShowLabel(node, selectedTopic, radius)), (node) => node.id)
    .join("text")
    .attr("class", "topic-node-label")
    .attr("x", (node) => node.x)
    .attr("y", (node) => node.y + 4)
    .attr("text-anchor", "middle")
    .attr("opacity", (node) => (focusTopic && !focusIds.has(node.id) ? 0.14 : 1))
    .text((node) => node.label);
}

function renderTrendSpotlight(root, data, selectedTopic) {
  const selectedNode = selectedTopic ? data.topicLookup.get(selectedTopic) : null;
  const risers = selectedNode
    ? [selectedNode]
    : data.trendLeaders.risers;
  const decliners = selectedNode
    ? [selectedNode]
    : data.trendLeaders.decliners;

  root.innerHTML = `
    <div class="topic-summary__grid">
      <section class="topic-panel">
        <div class="topic-panel__header">
          <h4 class="topic-panel__title">${selectedNode ? "Selected topic" : "Fastest risers"}</h4>
          <span class="annotation-chip">${data.year}</span>
        </div>
        ${renderTrendList(risers, "up")}
      </section>
      <section class="topic-panel">
        <div class="topic-panel__header">
          <h4 class="topic-panel__title">${selectedNode ? "Connected context" : "Cooling topics"}</h4>
          <span class="annotation-chip">${selectedNode ? "focus" : "vs prior year"}</span>
        </div>
        ${
          selectedNode
            ? renderSelectedContext(selectedNode, data)
            : renderTrendList(decliners, "down")
        }
      </section>
    </div>
  `;
}

function renderClusterSummary(root, data, selectedTopic) {
  const selectedNode = selectedTopic ? data.topicLookup.get(selectedTopic) : null;
  const clusters = selectedTopic
    ? data.clusters.filter((cluster) => cluster.id === selectedNode?.cluster)
    : data.clusters.slice(0, 6);

  root.innerHTML = clusters.length
    ? `
      <div class="cluster-list">
        ${clusters
          .map(
            (cluster) => `
              <article class="cluster-card">
                <div class="cluster-card__header">
                  <span class="legend-item">
                    <span class="legend-swatch" style="background:${cluster.color}"></span>
                    ${cluster.label}
                  </span>
                  <strong>${formatInteger.format(cluster.totalFrequency)}</strong>
                </div>
                <p class="cluster-card__meta">${cluster.size} topics visible in ${data.year}</p>
                <p class="cluster-card__terms">${cluster.topTerms.slice(0, 4).join(" · ")}</p>
              </article>
            `
          )
          .join("")}
      </div>
    `
    : `<p class="topic-empty">No cluster summary is available for the current topic focus.</p>`;
}

function renderTrendList(items, direction) {
  if (!items.length) {
    return `<p class="topic-empty">No strong movement is visible for the current year.</p>`;
  }

  const maxDelta = Math.max(...items.map((item) => Math.abs(item.growthDelta)), 1);
  return `
    <div class="trend-list">
      ${items
        .map(
          (item) => `
            <div class="trend-item">
              <div class="trend-item__copy">
                <strong>${item.label}</strong>
                <span>${formatInteger.format(item.frequency)} cumulative papers</span>
              </div>
              <div class="trend-item__bar">
                <span class="trend-item__fill trend-item__fill--${direction}" style="width:${Math.max(
                  12,
                  Math.round((Math.abs(item.growthDelta) / maxDelta) * 100)
                )}%"></span>
              </div>
              <div class="trend-item__delta">${direction === "down" ? "" : "+"}${formatInteger.format(item.growthDelta)}</div>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderSelectedContext(node, data) {
  const neighbors = data.edges
    .filter((edge) => edge.source === node.id || edge.target === node.id)
    .map((edge) => ({
      label: edge.source === node.id ? edge.target : edge.source,
      weight: edge.weight,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  if (!neighbors.length) {
    return `<p class="topic-empty">This topic is currently visible as a relatively isolated concept.</p>`;
  }

  return `
    <div class="neighbor-list">
      ${neighbors
        .map(
          (neighbor) => `
            <div class="neighbor-item">
              <strong>${neighbor.label}</strong>
              <span>${formatInteger.format(neighbor.weight)} shared papers</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function accumulateTopicCounts(papers, target) {
  papers.forEach((paper) => {
    extractTopics(paper).forEach((topic) => {
      target.set(topic, (target.get(topic) || 0) + 1);
    });
  });
}

function extractTopics(paper) {
  const concepts = Array.isArray(paper.concepts) ? paper.concepts : [];
  const uniqueTopics = new Set();
  concepts.forEach((concept) => {
    const topic = normalizeTopic(concept);
    if (topic) {
      uniqueTopics.add(topic);
    }
  });
  return [...uniqueTopics];
}

function normalizeTopic(value) {
  if (typeof value !== "string") {
    return null;
  }
  const topic = value.trim();
  if (!topic) {
    return null;
  }
  const normalized = topic.toLowerCase();
  const collapsed = normalized.replace(/[-_/]+/g, " ");
  if (TOPIC_STOPLIST.has(normalized)) {
    return null;
  }
  if (normalized.length < 4) {
    return null;
  }
  if (
    /(diabetes|disease|analytics|informatics)/.test(collapsed)
  ) {
    return null;
  }
  return topic;
}

function computeTopicClusters(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set();
  const clusters = [];

  nodes.forEach((node) => {
    if (visited.has(node.id)) {
      return;
    }
    const queue = [node.id];
    const topicIds = [];
    visited.add(node.id);
    while (queue.length) {
      const current = queue.shift();
      topicIds.push(current);
      adjacency.get(current)?.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      });
    }

    const topicNodes = topicIds
      .map((topicId) => nodeById.get(topicId))
      .filter(Boolean)
      .sort((a, b) => b.frequency - a.frequency);
    clusters.push({
      id: clusters.length,
      topicIds,
      topTerms: topicNodes.slice(0, 4).map((topicNode) => topicNode.label),
      totalFrequency: d3.sum(topicNodes, (topicNode) => topicNode.frequency),
    });
  });

  return clusters.sort((a, b) => b.totalFrequency - a.totalFrequency);
}

function buildTrendLeaders(nodes) {
  const positive = nodes.filter((node) => node.momentum > 0).sort((a, b) => b.momentum - a.momentum || b.growthDelta - a.growthDelta);
  const nonPositive = nodes
    .filter((node) => node.momentum <= 0)
    .sort((a, b) => a.momentum - b.momentum || a.growthDelta - b.growthDelta);

  return {
    risers: positive.slice(0, 6),
    decliners: nonPositive.slice(0, 6),
  };
}

function shouldShowLabel(node, selectedTopic, radius) {
  if (selectedTopic) {
    return true;
  }
  return true;
}

function stretchNodesToViewport(nodes, radius, layoutPadding, width, height) {
  if (!nodes.length) {
    return;
  }

  const xExtent = d3.extent(nodes, (node) => node.x);
  const yExtent = d3.extent(nodes, (node) => node.y);
  const maxRadius = d3.max(nodes, (node) => radius(node.frequency)) || 0;
  const usableWidth = width - layoutPadding.left - layoutPadding.right - maxRadius * 2;
  const usableHeight = height - layoutPadding.top - layoutPadding.bottom - maxRadius * 2;

  if ((xExtent[1] || 0) - (xExtent[0] || 0) > 1) {
    const xScale = d3
      .scaleLinear()
      .domain(xExtent)
      .range([layoutPadding.left + maxRadius, layoutPadding.left + maxRadius + usableWidth]);
    nodes.forEach((node) => {
      node.x = xScale(node.x);
    });
  }

  if ((yExtent[1] || 0) - (yExtent[0] || 0) > 1) {
    const yScale = d3
      .scaleLinear()
      .domain(yExtent)
      .range([layoutPadding.top + maxRadius, layoutPadding.top + maxRadius + usableHeight]);
    nodes.forEach((node) => {
      node.y = yScale(node.y);
    });
  }
}

function clampYear(year, minYear, maxYear) {
  return Math.max(minYear, Math.min(maxYear, Number.isFinite(year) ? year : maxYear));
}

function safeExtent(values, accessor) {
  if (!values.length) {
    return [0, 1];
  }
  const extent = d3.extent(values, accessor);
  if (!Number.isFinite(extent[0]) || !Number.isFinite(extent[1])) {
    return [0, 1];
  }
  if (extent[0] === extent[1]) {
    return [extent[0], extent[1] + 1];
  }
  return extent;
}

function formatTrend(delta) {
  if (delta > 0) {
    return `+${formatInteger.format(delta)} papers`;
  }
  if (delta < 0) {
    return `${formatInteger.format(delta)} papers`;
  }
  return "Flat";
}

function drawEmptyState(svg, width, height, text) {
  svg.append("text").attr("class", "empty-state").attr("x", width / 2).attr("y", height / 2).attr("text-anchor", "middle").text(text);
}

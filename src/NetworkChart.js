import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderVizCard } from "../components/Section.js";
import { clampText, formatDecimal, formatInteger } from "../utils/format.js";
import { createTooltip } from "./shared.js";

const palette = ["#2563EB", "#0F766E", "#DC2626", "#D97706", "#7C3AED", "#0891B2", "#65A30D", "#BE185D"];

export function renderNetworkChart(root, dataset, store) {
  const card = renderVizCard(
    root,
    "Force-directed citation graph",
    "Hover for focus mode. Click a node to select it, click again to deselect, and expand the highlight by hop distance."
  );
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent =
    "Each circle is a paper. Larger circles have higher PageRank. Colors separate connected components, and darker links reveal where citation relationships are actually observed in the corpus.";
  card.append(note);
  const legend = document.createElement("div");
  legend.className = "legend-row";
  legend.style.marginTop = "8px";
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:#2563EB"></span> Largest Cluster</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#0F766E"></span> Second Largest</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#DC2626"></span> Third Largest</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#111827"></span> Selected Paper</span>
  `;
  card.append(legend);
  const meta = document.createElement("div");
  meta.className = "network-meta";
  card.append(meta);
  const selectionBar = document.createElement("div");
  selectionBar.className = "network-selection-bar";
  selectionBar.innerHTML = `
    <div class="network-selection-bar__header">
      <span class="rank-pill network-selection-bar__pill"><strong>Selected node</strong> <span data-role="selected-title"></span></span>
      <button type="button" class="toggle" data-action="clear-selection">Deselect</button>
    </div>
    <label class="network-selection-bar__controls">
      <span>Highlight distance: <strong data-role="distance-value">1</strong> <span data-role="distance-label">hop</span></span>
      <input type="range" min="1" max="5" step="1" value="1" data-role="distance-slider" />
    </label>
  `;
  card.append(selectionBar);
  const bridgeSummary = document.createElement("div");
  bridgeSummary.className = "rank-summary";
  card.append(bridgeSummary);

  const host = document.createElement("div");
  host.className = "canvas-host";
  card.append(host);

  const canvas = document.createElement("canvas");
  host.append(canvas);
  const tooltip = createTooltip(host);
  const selectedTitle = selectionBar.querySelector('[data-role="selected-title"]');
  const distanceValue = selectionBar.querySelector('[data-role="distance-value"]');
  const distanceLabel = selectionBar.querySelector('[data-role="distance-label"]');
  const distanceSlider = selectionBar.querySelector('[data-role="distance-slider"]');

  const color = (cluster) => palette[cluster % palette.length];
  const neighborMap = buildNeighborMap(dataset.graph.edges);

  const nodes = dataset.graph.nodes.map((node) => ({ ...node }));
  const links = dataset.graph.edges
    .map((edge) => ({
      source: typeof edge.source === "object" ? edge.source.id : edge.source,
      target: typeof edge.target === "object" ? edge.target.id : edge.target,
    }))
    .filter((edge) => nodes.find((node) => node.id === edge.source) && nodes.find((node) => node.id === edge.target));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(26)
        .strength(0.25)
    )
    .force("charge", d3.forceManyBody().strength(-12))
    .force("center", d3.forceCenter())
    .force("collision", d3.forceCollide().radius((d) => 3 + d.pagerankNormalized * 7))
    .alphaDecay(0.05);

  let transform = d3.zoomIdentity;
  let hoveredNode = null;
  const bridgePapers = [...nodes]
    .sort((a, b) => (b.degree || 0) * (b.pagerank || 0) - (a.degree || 0) * (a.pagerank || 0))
    .slice(0, 3);

  const resize = () => {
    const width = Math.max(host.clientWidth, 320);
    const height = canvas.clientHeight || 680;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    simulation.force("center", d3.forceCenter(width / 2, height / 2));
    simulation.alpha(0.6).restart();
    draw();
  };

  const draw = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(transform.x, transform.y);
    context.scale(transform.k, transform.k);

    const state = store.getState();
    const activeId = state.selectedPaper;
    const selectedDistance = Math.max(1, state.selectedPaperDistance || 1);
    const focusRootId = hoveredNode?.id || activeId;
    const focusIds = focusRootId ? collectNeighborIds(neighborMap, focusRootId, hoveredNode ? 1 : selectedDistance) : null;
    const selectedNode = activeId ? nodeById.get(activeId) : null;

    context.strokeStyle = "rgba(55, 65, 81, 0.34)";
    context.lineWidth = 1.15 / transform.k;
    links.forEach((link) => {
      const source = nodeById.get(link.source.id || link.source);
      const target = nodeById.get(link.target.id || link.target);
      if (!source || !target) {
        return;
      }
      const faded = focusIds && !(focusIds.has(source.id) && focusIds.has(target.id));
      context.beginPath();
      context.globalAlpha = faded ? 0.14 : 0.72;
      context.moveTo(source.x, source.y);
      context.lineTo(target.x, target.y);
      context.stroke();
    });

    nodes.forEach((node) => {
      const faded = focusIds && !focusIds.has(node.id);
      const radius = 2.5 + node.pagerankNormalized * 8;
      context.beginPath();
      context.globalAlpha = faded ? 0.16 : 0.9;
      context.fillStyle = activeId === node.id ? "#111827" : color(node.cluster);
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fill();
      if (hoveredNode?.id === node.id || activeId === node.id) {
        context.lineWidth = 2 / transform.k;
        context.strokeStyle = "#111827";
        context.stroke();
      }
    });

    context.restore();
    meta.innerHTML = `
      <span>Nodes: ${formatInteger.format(nodes.length)}</span>
      <span>Edges: ${formatInteger.format(links.length)}</span>
      <span>Clusters: ${formatInteger.format(dataset.summary.components.length)}</span>
    `;
    selectionBar.classList.toggle("is-visible", Boolean(selectedNode));
    if (selectedNode) {
      selectedTitle.textContent = clampText(selectedNode.title, 42);
      distanceValue.textContent = String(selectedDistance);
      distanceLabel.textContent = selectedDistance === 1 ? "hop" : "hops";
      if (document.activeElement !== distanceSlider) {
        distanceSlider.value = String(selectedDistance);
      }
    }
    bridgeSummary.innerHTML = bridgePapers
      .map(
        (paper) =>
          `<span class="rank-pill"><strong>Bridge candidate</strong> ${clampText(paper.title, 28)}</span>`
      )
      .join("");
  };

  selectionBar.addEventListener("input", (event) => {
    const slider = event.target.closest('[data-role="distance-slider"]');
    if (!slider) {
      return;
    }
    store.setState({ selectedPaperDistance: Number(slider.value) });
  });

  selectionBar.addEventListener("click", (event) => {
    const clear = event.target.closest('[data-action="clear-selection"]');
    if (!clear) {
      return;
    }
    store.setState({ selectedPaper: null, activeCluster: null, selectedPaperDistance: 1 });
  });

  simulation.on("tick", draw);

  d3.select(canvas).call(
    d3
      .zoom()
      .scaleExtent([0.5, 6])
      .on("zoom", (event) => {
        transform = event.transform;
        draw();
      })
  );

  canvas.addEventListener("mousemove", (event) => {
    hoveredNode = findNodeAtPoint(event, nodes, transform);
    if (hoveredNode) {
      tooltip.show(
        `<strong>${clampText(hoveredNode.title, 88)}</strong>
         Citations: ${formatInteger.format(hoveredNode.citations || 0)}<br />
         PageRank: ${formatDecimal(hoveredNode.pagerank || 0, 4)}<br />
         Degree: ${formatInteger.format(hoveredNode.degree || 0)}<br />
         Cluster: ${hoveredNode.cluster + 1}`,
        event.offsetX + 14,
        event.offsetY + 14
      );
    } else {
      tooltip.hide();
    }
    draw();
  });

  canvas.addEventListener("mouseleave", () => {
    hoveredNode = null;
    tooltip.hide();
    draw();
  });

  canvas.addEventListener("click", (event) => {
    const node = findNodeAtPoint(event, nodes, transform);
    const current = store.getState().selectedPaper;
    if (!node) {
      store.setState({ selectedPaper: null, activeCluster: null, selectedPaperDistance: 1 });
      return;
    }
    if (current === node.id) {
      store.setState({ selectedPaper: null, activeCluster: null, selectedPaperDistance: 1 });
      return;
    }
    store.setState({ selectedPaper: node.id, activeCluster: node.cluster ?? null, selectedPaperDistance: 1 });
  });

  store.subscribe(() => draw());
  new ResizeObserver(resize).observe(host);
  resize();
}

function findNodeAtPoint(event, nodes, transform) {
  const x = (event.offsetX - transform.x) / transform.k;
  const y = (event.offsetY - transform.y) / transform.k;
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    const radius = 4 + node.pagerankNormalized * 8;
    if (Math.hypot(node.x - x, node.y - y) <= radius) {
      return node;
    }
  }
  return null;
}

function buildNeighborMap(edges) {
  const map = new Map();
  edges.forEach((edge) => {
    const source = typeof edge.source === "object" ? edge.source.id : edge.source;
    const target = typeof edge.target === "object" ? edge.target.id : edge.target;
    if (!map.has(source)) {
      map.set(source, new Set());
    }
    if (!map.has(target)) {
      map.set(target, new Set());
    }
    map.get(source).add(target);
    map.get(target).add(source);
  });
  return map;
}

function collectNeighborIds(neighborMap, startId, maxDistance) {
  const visited = new Set([startId]);
  const queue = [{ id: startId, distance: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.distance >= maxDistance) {
      continue;
    }
    for (const neighbor of neighborMap.get(current.id) || []) {
      if (visited.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      queue.push({ id: neighbor, distance: current.distance + 1 });
    }
  }
  return visited;
}

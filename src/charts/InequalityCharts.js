import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderVizCard } from "../components/Section.js";
import { buildLorenzPoints, calculateGini } from "../utils/metrics.js";
import { formatDecimal, formatPercent } from "../utils/format.js";
import { createResponsiveSvg } from "./shared.js";

export function renderInequalityCharts(root, dataset, store) {
  const controls = document.createElement("div");
  controls.className = "toggle-row";
  controls.style.marginBottom = "8px";
  controls.innerHTML = `
    <button class="toggle is-active" data-metric="citations">Citations</button>
    <button class="toggle" data-metric="pagerank">PageRank</button>
  `;
  root.append(controls);

  const grid = document.createElement("div");
  grid.className = "dual-grid";
  root.append(grid);

  const histogramCard = renderVizCard(grid, "Distribution of influence", "Log-scaled bins reveal the long tail.");
  const lorenzCard = renderVizCard(grid, "Lorenz curve", "The farther from the diagonal, the more unequal the distribution.");

  const giniWidget = document.createElement("p");
  giniWidget.className = "viz-card__meta viz-card__meta--stacked";
  lorenzCard.querySelector(".viz-card__header > div").append(giniWidget);

  const histogramHost = document.createElement("div");
  const histogramNote = document.createElement("p");
  histogramNote.className = "chart-note";
  histogramNote.textContent =
    "Each bar counts how many papers fall into a log-scaled influence bucket. The compression on the x-axis makes the long tail visible.";
  histogramCard.append(histogramNote);
  histogramCard.append(histogramHost);
  const lorenzHost = document.createElement("div");
  const lorenzNote = document.createElement("p");
  lorenzNote.className = "chart-note";
  lorenzNote.textContent =
    "The diagonal represents perfectly equal distribution. The blue curve shows the observed share of citations or PageRank captured by cumulative slices of papers.";
  lorenzCard.append(lorenzNote);
  lorenzCard.append(lorenzHost);

  const histogramSvg = createResponsiveSvg(histogramHost, 340);
  const lorenzSvg = createResponsiveSvg(lorenzHost, 340);
  const margin = { top: 16, right: 24, bottom: 48, left: 56 };

  controls.addEventListener("click", (event) => {
    const button = event.target.closest(".toggle");
    if (!button) {
      return;
    }
    controls.querySelectorAll(".toggle").forEach((toggle) => toggle.classList.remove("is-active"));
    button.classList.add("is-active");
    store.setState({ metricView: button.dataset.metric });
  });

  const render = () => {
    const state = store.getState();
    const filtered = dataset.papers.filter(
      (paper) => paper.year >= state.yearRange[0] && paper.year <= state.yearRange[1]
    );
    const values = filtered.map((paper) => paper[state.metricView] || 0).filter((value) => value >= 0);

    renderHistogram(histogramSvg, values, margin, state.metricView);
    renderLorenz(lorenzSvg, values, margin);
    const gini = calculateGini(values);
    giniWidget.textContent = `Current Gini (${state.metricView}): ${formatDecimal(gini)} | Top 10% share: ${formatPercent.format(
      topShare(values, 0.1)
    )}`;
  };

  store.subscribe(render);
  histogramHost.addEventListener("chart:resize", render);
  lorenzHost.addEventListener("chart:resize", render);
}

function renderHistogram(chart, values, margin, metricView) {
  const { svg, measure } = chart;
  const { width, height } = measure();
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  svg.selectAll("*").remove();

  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const sanitized = values.filter((value) => value > 0);
  const x = d3.scaleLog().domain(d3.extent(sanitized.length ? sanitized : [1, 10])).nice().range([0, innerWidth]);
  const bins = d3.bin().domain(x.domain()).thresholds(x.ticks(18))(sanitized);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(bins, (bin) => bin.length) || 1])
    .nice()
    .range([innerHeight, 0]);

  group
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6, "~s"));
  group.append("g").call(d3.axisLeft(y));

  group
    .selectAll("rect")
    .data(bins)
    .join("rect")
    .attr("x", (bin) => x(Math.max(bin.x0 || 1, x.domain()[0])))
    .attr("y", (bin) => y(bin.length))
    .attr("width", (bin) =>
      Math.max(0, x(Math.max(bin.x1 || x.domain()[0], x.domain()[0])) - x(Math.max(bin.x0 || x.domain()[0], x.domain()[0])) - 1)
    )
    .attr("height", (bin) => innerHeight - y(bin.length))
    .attr("fill", "#2563EB")
    .attr("opacity", 0.8);

  group
    .append("text")
    .attr("class", "axis-label")
    .attr("x", innerWidth / 2)
    .attr("y", innerHeight + 40)
    .attr("text-anchor", "middle")
    .text(`${metricView} (log scale)`);

  if (sanitized.length) {
    const median = d3.median(sanitized);
    const q90 = d3.quantile(sanitized.slice().sort((a, b) => a - b), 0.9);

    [median, q90].forEach((value, index) => {
      group
        .append("line")
        .attr("x1", x(value))
        .attr("x2", x(value))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", index === 0 ? "#0f766e" : "#dc2626")
        .attr("stroke-dasharray", "4 4");

      group
        .append("text")
        .attr("class", "annotation-label")
        .attr("x", Math.min(innerWidth - 4, x(value) + 6))
        .attr("y", 14 + index * 14)
        .text(index === 0 ? "Median" : "90th pct");
    });
  }
}

function renderLorenz(chart, values, margin) {
  const { svg, measure } = chart;
  const { width, height } = measure();
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  svg.selectAll("*").remove();
  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const points = buildLorenzPoints(values);

  const x = d3.scaleLinear().domain([0, 1]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  group
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(5, "%"));
  group.append("g").call(d3.axisLeft(y).ticks(5, "%"));

  group
    .append("line")
    .attr("x1", 0)
    .attr("x2", innerWidth)
    .attr("y1", innerHeight)
    .attr("y2", 0)
    .attr("stroke", "#9CA3AF")
    .attr("stroke-dasharray", "4 4");

  const line = d3
    .line()
    .x((d) => x(d.sharePopulation))
    .y((d) => y(d.shareValue));

  group
    .append("path")
    .datum([...points, { sharePopulation: 1, shareValue: 0 }])
    .attr("fill", "rgba(37,99,235,0.08)")
    .attr(
      "d",
      d3
        .area()
        .x((d) => x(d.sharePopulation))
        .y0((d) => y(d.sharePopulation))
        .y1((d) => y(d.shareValue))
    );

  group
    .append("path")
    .datum(points)
    .attr("fill", "none")
    .attr("stroke", "#2563EB")
    .attr("stroke-width", 2.5)
    .attr("d", line);

  const topDecilePoint = points[Math.max(0, points.length - Math.max(1, Math.round(points.length * 0.1)))];
  if (topDecilePoint) {
    group
      .append("circle")
      .attr("cx", x(topDecilePoint.sharePopulation))
      .attr("cy", y(topDecilePoint.shareValue))
      .attr("r", 4)
      .attr("fill", "#2563EB");
  }
}

function topShare(values, topFraction) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => b - a);
  const cutoff = Math.max(1, Math.round(sorted.length * topFraction));
  const topTotal = sorted.slice(0, cutoff).reduce((sum, value) => sum + value, 0);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return total === 0 ? 0 : topTotal / total;
}

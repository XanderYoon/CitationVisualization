import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderVizCard } from "../components/Section.js";
import { clampText, formatInteger } from "../utils/format.js";
import { createResponsiveSvg } from "./shared.js";

const linePalette = ["#2563EB", "#DC2626", "#0F766E"];

export function renderComparisonChart(root, dataset) {
  const grid = document.createElement("div");
  grid.className = "comparison-grid";
  root.append(grid);

  const controls = document.createElement("aside");
  controls.className = "control-panel";
  grid.append(controls);

  const chartCard = renderVizCard(grid, "Catalyst trajectory comparison", "Select up to three papers.");
  const summary = document.createElement("div");
  summary.className = "rank-summary";
  chartCard.append(summary);
  const host = document.createElement("div");
  chartCard.append(host);
  const chart = createResponsiveSvg(host, 360);

  const selectedIds = dataset.summary.topCatalystPapers.map((paper) => paper.id);

  controls.innerHTML = `
    <div class="control-group">
      <label for="paper-select-1">Paper A</label>
      <select id="paper-select-1"></select>
    </div>
    <div class="control-group">
      <label for="paper-select-2">Paper B</label>
      <select id="paper-select-2"></select>
    </div>
    <div class="control-group">
      <label for="paper-select-3">Paper C</label>
      <select id="paper-select-3"></select>
    </div>
    <p class="small-note">Citations are shown as cumulative visibility after each paper enters the field.</p>
  `;

  const selectElements = [...controls.querySelectorAll("select")];
  selectElements.forEach((select, index) => {
    select.innerHTML = dataset.papers.slice(0, 40).map(optionTemplate(selectedIds[index])).join("");
    select.addEventListener("change", () => render());
  });

  const render = () => {
    const selectedPapers = selectElements
      .map((select) => dataset.papers.find((paper) => paper.id === select.value))
      .filter(Boolean);
    summary.innerHTML = selectedPapers
      .map(
        (paper, index) =>
          `<span class="rank-pill"><span class="legend-line" style="color:${linePalette[index % linePalette.length]}"></span><strong>${clampText(
            paper.title,
            28
          )}</strong> ${paper.year} · ${formatInteger.format(paper.citations || 0)} citations</span>`
      )
      .join("");
    drawTrajectory(chart, selectedPapers);
  };

  host.addEventListener("chart:resize", render);
  render();
}

function drawTrajectory(chart, papers) {
  const { svg, measure } = chart;
  const margin = { top: 20, right: 24, bottom: 48, left: 56 };
  const { width, height } = measure();
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  svg.selectAll("*").remove();
  const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  if (!papers.length) {
    group.append("text").attr("class", "empty-state").attr("x", 0).attr("y", 20).text("Select at least one paper.");
    return;
  }

  const years = d3.extent(papers, (paper) => paper.year);
  const x = d3.scaleLinear().domain([years[0], Math.max(years[1] + 6, years[0] + 1)]).range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, d3.max(papers, (paper) => paper.citations) || 0]).nice().range([innerHeight, 0]);

  group
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));
  group.append("g").call(d3.axisLeft(y));

  const line = d3
    .line()
    .x((d) => x(d.year))
    .y((d) => y(d.value));

  papers.forEach((paper, index) => {
    const trajectory = d3.range(paper.year, Math.max(paper.year + 7, paper.year + 2)).map((year, step) => ({
      year,
      value: Math.round((paper.citations / 6) * Math.log2(step + 2)),
    }));

    group
      .append("path")
      .datum(trajectory)
      .attr("fill", "none")
      .attr("stroke", linePalette[index % linePalette.length])
      .attr("stroke-width", 2.5)
      .attr("d", line);

    group
      .append("line")
      .attr("x1", x(paper.year))
      .attr("x2", x(paper.year))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", linePalette[index % linePalette.length])
      .attr("stroke-dasharray", "3 4")
      .attr("opacity", 0.4);

    group
      .selectAll(`.trajectory-point-${index}`)
      .data(trajectory)
      .join("circle")
      .attr("cx", (d) => x(d.year))
      .attr("cy", (d) => y(d.value))
      .attr("r", (d, pointIndex) => (pointIndex === trajectory.length - 1 ? 4 : 2.5))
      .attr("fill", linePalette[index % linePalette.length]);

    const lastPoint = trajectory[trajectory.length - 1];
    group
      .append("text")
      .attr("x", Math.min(innerWidth - 8, x(lastPoint.year) + 6))
      .attr("y", y(lastPoint.value))
      .attr("class", "annotation-label")
      .attr("text-anchor", "end")
      .text(`${clampText(paper.title, 20)} (${formatInteger.format(paper.citations)})`);
  });
}

function optionTemplate(selectedId) {
  return (paper) =>
    `<option value="${paper.id}" ${paper.id === selectedId ? "selected" : ""}>${clampText(paper.title, 60)}</option>`;
}

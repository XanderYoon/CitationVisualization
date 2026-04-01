import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { renderVizCard } from "../components/Section.js";
import { clampText, formatDecimal, formatInteger } from "../utils/format.js";
import { createResponsiveSvg, createTooltip } from "./shared.js";

export function renderScatterPlot(root, dataset, store) {
  const card = renderVizCard(root, "Citations vs. PageRank", "Selected nodes in the network remain highlighted here.");
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent =
    "Points farther right are more cited. Points higher up are more structurally central. Papers above the main cloud tend to matter more to knowledge flow than raw citation counts alone would suggest.";
  card.append(note);
  const legend = document.createElement("div");
  legend.className = "legend-row";
  legend.innerHTML = `
    <span class="legend-item"><span class="legend-swatch" style="background:#2563EB"></span> Typical papers</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#111827"></span> Network-selected paper</span>
    <span class="legend-item"><span class="legend-swatch" style="background:#0F766E"></span> Structurally under-recognized</span>
  `;
  card.append(legend);

  const host = document.createElement("div");
  card.append(host);
  const chart = createResponsiveSvg(host, 420);
  const tooltip = createTooltip(host);
  const margin = { top: 20, right: 24, bottom: 48, left: 60 };

  const render = () => {
    const { svg, measure } = chart;
    const { width, height } = measure();
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    svg.selectAll("*").remove();
    const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const state = store.getState();
    const filtered = dataset.papers.filter(
      (paper) => paper.year >= state.yearRange[0] && paper.year <= state.yearRange[1]
    );
    const citationValues = filtered.map((paper) => Math.max(1, paper.citations || 1)).sort((a, b) => a - b);
    const pagerankValues = filtered.map((paper) => paper.pagerank || 0).sort((a, b) => a - b);
    const citationMedian = d3.median(citationValues) || 1;
    const pagerankMedian = d3.median(pagerankValues) || 0;
    const hiddenPaper = filtered
      .filter((paper) => (paper.citations || 0) <= citationMedian && (paper.pagerank || 0) >= pagerankMedian)
      .sort((a, b) => (b.pagerank || 0) - (a.pagerank || 0))[0];

    const x = d3
      .scaleLog()
      .domain([1, Math.max(2, d3.max(filtered, (paper) => paper.citations || 1))])
      .range([0, innerWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(filtered, (paper) => paper.pagerank || 0) || 0])
      .nice()
      .range([innerHeight, 0]);

    group
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(6, "~s"));
    group.append("g").call(d3.axisLeft(y).ticks(6));

    group
      .append("line")
      .attr("x1", x(citationMedian))
      .attr("x2", x(citationMedian))
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .attr("stroke", "#cbd5e1")
      .attr("stroke-dasharray", "4 4");

    group
      .append("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", y(pagerankMedian))
      .attr("y2", y(pagerankMedian))
      .attr("stroke", "#cbd5e1")
      .attr("stroke-dasharray", "4 4");

    group
      .selectAll("circle")
      .data(filtered)
      .join("circle")
      .attr("cx", (paper) => x(Math.max(1, paper.citations || 1)))
      .attr("cy", (paper) => y(paper.pagerank || 0))
      .attr("r", (paper) => (state.selectedPaper === paper.id ? 6 : 3.5))
      .attr("fill", (paper) => {
        if (state.selectedPaper === paper.id) {
          return "#111827";
        }
        if (hiddenPaper?.id === paper.id) {
          return "#0F766E";
        }
        return "#2563EB";
      })
      .attr("fill-opacity", 0.72)
      .on("mouseenter", (event, paper) => {
        tooltip.show(
          `<strong>${clampText(paper.title, 88)}</strong>
          Citations: ${formatInteger.format(paper.citations || 0)}<br />
          PageRank: ${formatDecimal(paper.pagerank || 0, 4)}`,
          event.offsetX + 12,
          event.offsetY + 12
        );
      })
      .on("mouseleave", () => tooltip.hide())
      .on("click", (_, paper) => store.setState({ selectedPaper: paper.id }));

    if (hiddenPaper) {
      group
        .append("text")
        .attr("class", "annotation-label")
        .attr("x", Math.min(innerWidth - 8, x(Math.max(1, hiddenPaper.citations || 1)) + 10))
        .attr("y", y(hiddenPaper.pagerank || 0) - 10)
        .text(`Hidden connector: ${clampText(hiddenPaper.title, 34)}`);
    }

    if (state.selectedPaper) {
      const selectedPaper = filtered.find((paper) => paper.id === state.selectedPaper);
      if (selectedPaper) {
        group
          .append("text")
          .attr("class", "annotation-label")
          .attr("x", x(Math.max(1, selectedPaper.citations || 1)) + 8)
          .attr("y", y(selectedPaper.pagerank || 0) - 8)
          .text(clampText(selectedPaper.title, 48));
      }
    }

    group
      .append("text")
      .attr("class", "axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 40)
      .attr("text-anchor", "middle")
      .text("Citations (log scale)");

    group
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -44)
      .attr("text-anchor", "middle")
      .text("PageRank");
  };

  store.subscribe(render);
  host.addEventListener("chart:resize", render);
}

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { createResponsiveSvg } from "./shared.js";

export function renderGrowthChart(root, dataset, store) {
  const banner = document.createElement("div");
  banner.className = "metric-banner";
  root.append(banner);

  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent =
    "The solid blue line tracks annual paper volume. The dashed gray line tracks average citations per paper in the same year. The shaded window is the active year filter used by the rest of the interface.";
  root.append(note);

  const host = document.createElement("div");
  root.append(host);
  const { svg, measure } = createResponsiveSvg(host, 420);

  const margin = { top: 24, right: 24, bottom: 48, left: 56 };
  const focusGroup = svg.append("g");
  const milestones = [
    { year: 2012, label: "Representation learning" },
    { year: 2015, label: "Deep Learning surge" },
    { year: 2020, label: "Pandemic acceleration" },
  ];

  const render = () => {
    const { width, height } = measure();
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    focusGroup.attr("transform", `translate(${margin.left},${margin.top})`);
    focusGroup.selectAll("*").remove();

    const state = store.getState();
    const filteredSeries = dataset.timeseries.filter(
      (entry) => entry.year >= state.yearRange[0] && entry.year <= state.yearRange[1]
    );
    const peakPapers = filteredSeries.reduce(
      (best, entry) => (entry.num_papers > (best?.num_papers ?? -1) ? entry : best),
      null
    );
    const peakCitations = filteredSeries.reduce(
      (best, entry) => (entry.avg_citations > (best?.avg_citations ?? -1) ? entry : best),
      null
    );

    banner.innerHTML = `
      <span class="metric-chip"><strong>Active range</strong> ${state.yearRange[0]}-${state.yearRange[1]}</span>
      <span class="metric-chip"><strong>Peak papers</strong> ${peakPapers?.year ?? "n/a"} (${peakPapers?.num_papers ?? 0})</span>
      <span class="metric-chip"><strong>Peak avg citations</strong> ${peakCitations?.year ?? "n/a"} (${Math.round(
        peakCitations?.avg_citations ?? 0
      )})</span>
    `;

    const x = d3
      .scaleLinear()
      .domain(dataset.summary.yearExtent)
      .range([0, innerWidth]);
    const y = d3
      .scaleLinear()
      .domain([0, d3.max(dataset.timeseries, (d) => Math.max(d.num_papers, d.avg_citations)) || 0])
      .nice()
      .range([innerHeight, 0]);

    const papersLine = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.num_papers));

    const citationsLine = d3
      .line()
      .x((d) => x(d.year))
      .y((d) => y(d.avg_citations));

    focusGroup
      .append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("d")));

    focusGroup.append("g").call(d3.axisLeft(y));

    focusGroup
      .append("path")
      .datum(dataset.timeseries)
      .attr("fill", "rgba(37,99,235,0.08)")
      .attr(
        "d",
        d3
          .area()
          .x((d) => x(d.year))
          .y0(innerHeight)
          .y1((d) => y(d.num_papers))
      );

    focusGroup
      .append("path")
      .datum(dataset.timeseries)
      .attr("fill", "none")
      .attr("stroke", "#2563EB")
      .attr("stroke-width", 2.5)
      .attr("d", papersLine);

    focusGroup
      .append("path")
      .datum(dataset.timeseries)
      .attr("fill", "none")
      .attr("stroke", "#6B7280")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5 5")
      .attr("d", citationsLine);

    focusGroup
      .append("circle")
      .attr("cx", 6)
      .attr("cy", 8)
      .attr("r", 4)
      .attr("fill", "#2563EB");

    focusGroup
      .append("text")
      .attr("class", "annotation-label")
      .attr("x", 16)
      .attr("y", 12)
      .text("Papers");

    focusGroup
      .append("line")
      .attr("x1", 72)
      .attr("x2", 96)
      .attr("y1", 8)
      .attr("y2", 8)
      .attr("stroke", "#6B7280")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5 5");

    focusGroup
      .append("text")
      .attr("class", "annotation-label")
      .attr("x", 102)
      .attr("y", 12)
      .text("Average citations");

    milestones.forEach((milestone, index) => {
      focusGroup
        .append("line")
        .attr("x1", x(milestone.year))
        .attr("x2", x(milestone.year))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", index === 1 ? "#1d4ed8" : "#94a3b8")
        .attr("stroke-dasharray", "4 4");

      focusGroup
        .append("text")
        .attr("class", "annotation-label")
        .attr("x", x(milestone.year) + 8)
        .attr("y", 18 + index * 14)
        .text(milestone.label);
    });

    if (peakPapers) {
      focusGroup
        .append("circle")
        .attr("cx", x(peakPapers.year))
        .attr("cy", y(peakPapers.num_papers))
        .attr("r", 4.5)
        .attr("fill", "#2563EB");

      focusGroup
        .append("text")
        .attr("class", "annotation-label")
        .attr("x", Math.min(innerWidth - 8, x(peakPapers.year) + 8))
        .attr("y", y(peakPapers.num_papers) - 10)
        .attr("text-anchor", "start")
        .text(`Peak output: ${peakPapers.year}`);
    }

    focusGroup
      .append("rect")
      .attr("x", x(state.yearRange[0]))
      .attr("width", Math.max(2, x(state.yearRange[1]) - x(state.yearRange[0])))
      .attr("y", 0)
      .attr("height", innerHeight)
      .attr("fill", "rgba(37,99,235,0.08)");

    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .on("end", (event) => {
        if (!event.sourceEvent) {
          return;
        }
        const { selection } = event;
        if (!selection) {
          store.setState({ yearRange: dataset.summary.yearExtent });
          return;
        }
        const years = selection.map(x.invert).map(Math.round);
        const nextRange = [Math.max(dataset.summary.yearExtent[0], years[0]), Math.min(dataset.summary.yearExtent[1], years[1])];
        store.setState({ yearRange: nextRange });
      });

    const brushGroup = focusGroup.append("g").call(brush);
    brushGroup.call(brush.move, state.yearRange.map(x));

    focusGroup
      .append("text")
      .attr("class", "axis-label")
      .attr("x", innerWidth / 2)
      .attr("y", innerHeight + 40)
      .attr("text-anchor", "middle")
      .text("Publication year");

    focusGroup
      .append("text")
      .attr("class", "axis-label")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -42)
      .attr("text-anchor", "middle")
      .text("Papers / average citations");
  };

  store.subscribe(render);
  host.addEventListener("chart:resize", render);
}

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import * as topojson from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";
import { renderVizCard } from "../components/Section.js";
import { clampText, formatDecimal, formatInteger } from "../utils/format.js";
import { aggregateCountries, topInstitutions } from "../utils/metrics.js";
import { createResponsiveSvg, createTooltip } from "./shared.js";

export function renderInstitutionChart(root, dataset, store) {
  let selectedCountry = null;
  let previousSelectedCountry = null;
  const controls = document.createElement("div");
  controls.className = "toggle-row";
  controls.style.marginBottom = "8px";
  controls.innerHTML = `
    <button class="toggle is-active" data-metric="citations">Top 10 by citations</button>
    <button class="toggle" data-metric="pagerank">Top 10 by PageRank</button>
  `;
  root.append(controls);

  const layout = document.createElement("div");
  layout.className = "geography-layout";
  root.append(layout);

  const card = renderVizCard(root, "Institutional concentration", "The bar chart aggregates paper-level influence by affiliation.");
  layout.append(card);
  const note = document.createElement("p");
  note.className = "chart-note";
  note.textContent =
    "Each bar sums all affiliated papers for an institution in the active year window. Switching metrics changes whether the ranking follows visible citation totals or network-central contribution.";
  card.append(note);
  const host = document.createElement("div");
  card.append(host);
  const chart = createResponsiveSvg(host, 420);
  const tooltip = createTooltip(host);
  const margin = { top: 16, right: 24, bottom: 24, left: 240 };
  const geoCard = renderVizCard(
    root,
    "World heatmap",
    "Countries are aggregated from the enriched paper metadata and shaded by the selected metric."
  );
  layout.append(geoCard);
  const geoNote = document.createElement("p");
  geoNote.className = "chart-note";
  geoNote.textContent =
    "The map uses the enriched country and city metadata attached to each paper. Click a country to zoom in and inspect publication activity by city.";
  geoCard.append(geoNote);
  const geoSummary = document.createElement("div");
  geoSummary.className = "rank-summary";
  geoCard.append(geoSummary);
  const geoHost = document.createElement("div");
  geoCard.append(geoHost);
  const geoChart = createResponsiveSvg(geoHost, 460);
  const geoTooltip = createTooltip(geoHost);
  const worldPromise = loadWorldGeometry();
  const summary = document.createElement("div");
  summary.className = "rank-summary";
  card.append(summary);

  controls.addEventListener("click", (event) => {
    const button = event.target.closest(".toggle");
    if (!button) {
      return;
    }
    controls.querySelectorAll(".toggle").forEach((toggle) => toggle.classList.remove("is-active"));
    button.classList.add("is-active");
    store.setState({ institutionMetric: button.dataset.metric });
  });

  const render = () => {
    const state = store.getState();
    const metric = state.institutionMetric || "citations";
    const filtered = dataset.papers.filter(
      (paper) => paper.year >= state.yearRange[0] && paper.year <= state.yearRange[1]
    );
    const institutions = topInstitutions(filtered, metric, 10);
    const countries = aggregateCountries(filtered, metric);
    const leader = institutions[0];
    const selectedCountryEntry = selectedCountry
      ? countries.find((entry) => normalizeCountryName(entry.country) === selectedCountry) || null
      : null;
    summary.innerHTML = leader
      ? `<span class="rank-pill"><strong>Leading institution</strong> ${clampText(leader.institution, 36)}</span>
         <span class="rank-pill"><strong>Metric</strong> ${
           metric === "citations" ? formatInteger.format(leader.citations) : formatDecimal(leader.pagerank, 4)
         }</span>
         <span class="rank-pill"><strong>Countries represented</strong> ${countries.length}</span>`
      : "";
    geoSummary.innerHTML = selectedCountryEntry
      ? `<button class="toggle is-active" type="button" data-action="clear-country">Back to world</button>
         <span class="rank-pill"><strong>Selected country</strong> ${selectedCountryEntry.country}</span>
         <span class="rank-pill"><strong>City records</strong> ${selectedCountryEntry.cityBreakdown.length}</span>`
      : `<span class="rank-pill"><strong>Interaction</strong> Click a country to inspect city-level publication counts</span>`;

    const clearButton = geoSummary.querySelector('[data-action="clear-country"]');
    if (clearButton) {
      clearButton.addEventListener("click", () => {
        previousSelectedCountry = selectedCountry;
        selectedCountry = null;
        render();
      });
    }

    const { svg, measure } = chart;
    const { width, height } = measure();
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    svg.selectAll("*").remove();
    const group = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const y = d3
      .scaleBand()
      .domain(institutions.map((entry) => entry.institution))
      .range([0, innerHeight])
      .padding(0.16);
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(institutions, (entry) => entry[metric]) || 0])
      .nice()
      .range([0, innerWidth]);

    group.append("g").call(d3.axisLeft(y).tickFormat((value) => clampText(value, 34)));
    group.append("g").call(d3.axisTop(x).ticks(5, metric === "citations" ? "~s" : ".2"));

    group
      .selectAll("rect")
      .data(institutions)
      .join("rect")
      .attr("x", 0)
      .attr("y", (entry) => y(entry.institution))
      .attr("height", y.bandwidth())
      .attr("width", (entry) => x(entry[metric]))
      .attr("rx", 10)
      .attr("fill", "#2563EB")
      .on("mouseenter", (event, entry) => {
        tooltip.show(
          `<strong>${entry.institution}</strong>
          Citations: ${formatInteger.format(entry.citations)}<br />
          PageRank: ${formatDecimal(entry.pagerank, 4)}<br />
          Papers: ${formatInteger.format(entry.papers)}`,
          event.offsetX + 12,
          event.offsetY + 12
        );
      })
      .on("mouseleave", () => tooltip.hide());

    group
      .selectAll(".bar-label")
      .data(institutions)
      .join("text")
      .attr("class", "annotation-label")
      .attr("x", (entry) => x(entry[metric]) + 8)
      .attr("y", (entry) => (y(entry.institution) || 0) + y.bandwidth() / 2 + 4)
      .text((entry) =>
        metric === "citations" ? formatInteger.format(entry.citations) : formatDecimal(entry.pagerank, 4)
      );

    drawGeography(geoChart, countries, metric, worldPromise, geoTooltip, {
      selectedCountry,
      previousSelectedCountry,
      onSelectCountry(countryName) {
        previousSelectedCountry = selectedCountry;
        selectedCountry = countryName;
        render();
      },
    });
  };

  store.subscribe(render);
  host.addEventListener("chart:resize", render);
  geoHost.addEventListener("chart:resize", render);
}

async function drawGeography(chart, countries, metric, worldPromise, tooltip, interaction) {
  const { svg, measure } = chart;
  const { width, height } = measure();
  svg.selectAll("*").remove();
  const world = await worldPromise;
  if (!world) {
    drawBubbleGeography(svg, width, height, countries, metric, tooltip, interaction);
    return;
  }

  const group = svg.append("g");
  const worldFeatureCollection = {
    type: "FeatureCollection",
    features: world.features,
  };
  const projection = d3.geoNaturalEarth1().fitExtent(
    [
      [12, 12],
      [width - 12, height - 12],
    ],
    worldFeatureCollection
  );
  const path = d3.geoPath(projection);
  const valuesByCountry = new Map(countries.map((entry) => [normalizeCountryName(entry.country), entry]));
  const featureByCountry = new Map(
    world.features.map((feature) => [normalizeCountryName(feature.properties.name), feature])
  );
  const color = d3
    .scaleSequential()
    .domain([0, d3.max(countries, (entry) => entry[metric]) || 1])
    .interpolator(d3.interpolateBlues);
  const selectedFeature = interaction.selectedCountry ? featureByCountry.get(interaction.selectedCountry) : null;
  const previousFeature = interaction.previousSelectedCountry
    ? featureByCountry.get(interaction.previousSelectedCountry)
    : null;
  const zoomTransform = selectedFeature ? computeFeatureTransform(path, selectedFeature, width, height) : null;
  const startTransform = previousFeature ? computeFeatureTransform(path, previousFeature, width, height) : null;

  if (startTransform) {
    group.attr(
      "transform",
      `translate(${startTransform.translateX},${startTransform.translateY}) scale(${startTransform.scale})`
    );
  }

  group
    .selectAll("path")
    .data(world.features)
    .join("path")
    .attr("d", path)
    .attr("fill", (feature) => {
      if (interaction.selectedCountry) {
        return normalizeCountryName(feature.properties.name) === interaction.selectedCountry ? "#DBEAFE" : "#F8FAFC";
      }
      const entry = valuesByCountry.get(normalizeCountryName(feature.properties.name));
      return entry ? color(entry[metric]) : "#EEF2F7";
    })
    .attr("stroke", (feature) =>
      normalizeCountryName(feature.properties.name) === interaction.selectedCountry ? "#1D4ED8" : "#CBD5E1"
    )
    .attr("stroke-width", (feature) =>
      normalizeCountryName(feature.properties.name) === interaction.selectedCountry ? 1.6 : 0.8
    )
    .on("mouseenter", (event, feature) => {
      const entry = valuesByCountry.get(normalizeCountryName(feature.properties.name));
      if (!entry) {
        return;
      }
      tooltip.show(
        `<strong>${entry.country}</strong>
        ${metric === "citations" ? "Citations" : "PageRank"}: ${
          metric === "citations" ? formatInteger.format(entry.citations) : formatDecimal(entry.pagerank, 4)
        }<br />
        Papers: ${formatInteger.format(entry.papers)}<br />
        Top cities: ${(entry.topCities && entry.topCities.length ? entry.topCities.join(", ") : "No city metadata")}`,
        event.offsetX + 12,
        event.offsetY + 12
      );
    })
    .on("mouseleave", () => tooltip.hide())
    .on("click", (_, feature) => {
      const countryName = normalizeCountryName(feature.properties.name);
      if (!valuesByCountry.has(countryName)) {
        return;
      }
      interaction.onSelectCountry(countryName);
    });

  group
    .append("path")
    .datum(world.borders)
    .attr("fill", "none")
    .attr("stroke", interaction.selectedCountry ? "rgba(148, 163, 184, 0.92)" : "rgba(203, 213, 225, 0.96)")
    .attr("stroke-width", interaction.selectedCountry ? 0.7 : 0.9)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("d", path);

  group
    .transition()
    .duration(700)
    .ease(d3.easeCubicInOut)
    .attr(
      "transform",
      zoomTransform
        ? `translate(${zoomTransform.translateX},${zoomTransform.translateY}) scale(${zoomTransform.scale})`
        : "translate(0,0) scale(1)"
    );

  if (interaction.selectedCountry) {
    const selectedCountryEntry = valuesByCountry.get(interaction.selectedCountry);
    if (selectedCountryEntry) {
      drawCityOverlay(group, projection, selectedCountryEntry, tooltip, metric, zoomTransform?.scale || 1);
    }
  }
}

let worldGeometryPromise;

function loadWorldGeometry() {
  if (!worldGeometryPromise) {
    worldGeometryPromise = d3
      .json("./node_modules/world-atlas/countries-110m.json")
      .then((topology) => {
        if (!topology?.objects?.countries) {
          return null;
        }
        return {
          features: topojson.feature(topology, topology.objects.countries).features,
          borders: topojson.mesh(topology, topology.objects.countries, (a, b) => a !== b),
        };
      })
      .catch(() => null);
  }
  return worldGeometryPromise;
}

function normalizeCountryName(name) {
  const aliases = {
    "united states": "united states of america",
    usa: "united states of america",
    us: "united states of america",
    "united kingdom of great britain and northern ireland": "united kingdom",
    uk: "united kingdom",
    "republic of korea": "south korea",
    korea: "south korea",
    macedonia: "north macedonia",
  };
  const normalized = String(name || "").trim().toLowerCase();
  return aliases[normalized] || normalized;
}

function drawBubbleGeography(svg, width, height, countries, metric, tooltip, interaction) {
  const projection = d3
    .geoNaturalEarth1()
    .fitExtent(
      [
        [20, 20],
        [width - 20, height - 20],
      ],
      { type: "Sphere" }
    );
  const path = d3.geoPath(projection);
  const group = svg.append("g");
  const graticule = d3.geoGraticule10();

  group
    .append("path")
    .datum({ type: "Sphere" })
    .attr("d", path)
    .attr("fill", "#F8FAFC")
    .attr("stroke", "#CBD5E1")
    .attr("stroke-width", 1);

  group
    .append("path")
    .datum(graticule)
    .attr("d", path)
    .attr("fill", "none")
    .attr("stroke", "#E5E7EB")
    .attr("stroke-width", 0.8);

  const plotted = countries
    .map((entry) => {
      const coordinates = COUNTRY_CENTROIDS[normalizeCountryName(entry.country)];
      if (!coordinates) {
        return null;
      }
      const [x, y] = projection(coordinates);
      return { ...entry, x, y };
    })
    .filter(Boolean);

  const radius = d3
    .scaleSqrt()
    .domain([0, d3.max(plotted, (entry) => entry[metric]) || 1])
    .range([4, 28]);
  const color = d3
    .scaleSequential()
    .domain([0, d3.max(plotted, (entry) => entry[metric]) || 1])
    .interpolator(d3.interpolateBlues);

  group
    .selectAll("circle")
    .data(plotted)
    .join("circle")
    .attr("cx", (entry) => entry.x)
    .attr("cy", (entry) => entry.y)
    .attr("r", (entry) => radius(entry[metric]))
    .attr("fill", (entry) => color(entry[metric]))
    .attr("fill-opacity", 0.82)
    .attr("stroke", "#1E3A8A")
    .attr("stroke-width", 0.8)
    .on("mouseenter", (event, entry) => {
      tooltip.show(
        `<strong>${entry.country}</strong>
        ${metric === "citations" ? "Citations" : "PageRank"}: ${
          metric === "citations" ? formatInteger.format(entry.citations) : formatDecimal(entry.pagerank, 4)
        }<br />
        Papers: ${formatInteger.format(entry.papers)}<br />
        Top cities: ${(entry.topCities && entry.topCities.length ? entry.topCities.join(", ") : "No city metadata")}`,
        event.offsetX + 12,
        event.offsetY + 12
      );
    })
    .on("mouseleave", () => tooltip.hide())
    .on("click", (_, entry) => interaction.onSelectCountry(normalizeCountryName(entry.country)));

  group
    .selectAll(".geo-label")
    .data(plotted.slice(0, 8))
    .join("text")
    .attr("class", "annotation-label")
    .attr("x", (entry) => entry.x)
    .attr("y", (entry) => entry.y - radius(entry[metric]) - 6)
    .attr("text-anchor", "middle")
    .text((entry) => clampText(entry.country, 18));

  if (interaction.selectedCountry) {
    const selectedCountryEntry = countries.find((entry) => normalizeCountryName(entry.country) === interaction.selectedCountry);
    if (selectedCountryEntry) {
      drawCityBubbleFallback(svg, width, height, selectedCountryEntry, tooltip, metric);
    }
  }
}

function drawCityOverlay(group, projection, countryEntry, tooltip, metric, zoomScale) {
  const overlayGroup = group.append("g").attr("opacity", 0);
  const cities = (countryEntry.cityBreakdown || [])
    .map((entry) => {
      const coordinates = CITY_COORDINATES[normalizeCityName(entry.city)];
      if (!coordinates) {
        return null;
      }
      const [x, y] = projection(coordinates);
      return { ...entry, x, y };
    })
    .filter(Boolean)
    .slice(0, 20);

  const radius = d3
    .scaleSqrt()
    .domain([0, d3.max(cities, (entry) => entry.papers) || 1])
    .range([4 / zoomScale, 18 / zoomScale]);

  const labelCities = filterOverlappingCityLabels(
    cities.slice(0, 10).map((entry, index) => {
      const horizontalDirection = index % 2 === 0 ? 1 : -1;
      const verticalOffset = ((index % 4) - 1.5) * (18 / zoomScale);
      return {
        ...entry,
        labelX: entry.x + horizontalDirection * (18 / zoomScale + radius(entry.papers)),
        labelY: entry.y + verticalOffset,
        textAnchor: horizontalDirection > 0 ? "start" : "end",
      };
    }),
    Math.max(9, 12 / zoomScale)
  );

  overlayGroup
    .selectAll(".city-bubble")
    .data(cities)
    .join("circle")
    .attr("class", "city-bubble")
    .attr("cx", (entry) => entry.x)
    .attr("cy", (entry) => entry.y)
    .attr("r", (entry) => radius(entry.papers))
    .attr("fill", (entry) => (entry.papers >= labelCities[0]?.papers ? "#0F766E" : "#2563EB"))
    .attr("fill-opacity", 0.9)
    .attr("stroke", "#FFFFFF")
    .attr("stroke-width", 1.5 / zoomScale)
    .attr("filter", "drop-shadow(0 1px 2px rgba(17,24,39,0.18))")
    .on("mouseenter", (event, entry) => {
      tooltip.show(
        `<strong>${entry.city}</strong>
        Country: ${countryEntry.country}<br />
        Papers: ${formatInteger.format(entry.papers)}<br />
        View: ${metric === "citations" ? "Country colored by citations" : "Country colored by PageRank"}`,
        event.offsetX + 12,
        event.offsetY + 12
      );
    })
    .on("mouseleave", () => tooltip.hide());

  overlayGroup
    .selectAll(".city-leader")
    .data(labelCities)
    .join("line")
    .attr("class", "city-leader")
    .attr("x1", (entry) => entry.x)
    .attr("y1", (entry) => entry.y)
    .attr("x2", (entry) => entry.labelX)
    .attr("y2", (entry) => entry.labelY)
    .attr("stroke", "#94A3B8")
    .attr("stroke-width", 1 / zoomScale)
    .attr("stroke-dasharray", `${2 / zoomScale} ${2 / zoomScale}`);

  overlayGroup
    .selectAll(".city-label")
    .data(labelCities)
    .join("text")
    .attr("class", "annotation-label city-label")
    .attr("x", (entry) => entry.labelX)
    .attr("y", (entry) => entry.labelY)
    .attr("text-anchor", (entry) => entry.textAnchor)
    .style("font-size", `${Math.max(9, 12 / zoomScale)}px`)
    .style("font-weight", "600")
    .style("paint-order", "stroke")
    .style("stroke", "rgba(255,255,255,0.96)")
    .style("stroke-width", `${Math.max(2, 3 / zoomScale)}px`)
    .style("stroke-linejoin", "round")
    .style("fill", "#0F172A")
    .text((entry) => `${clampText(entry.city, 16)} (${entry.papers})`);

  overlayGroup.transition().delay(220).duration(380).ease(d3.easeCubicOut).attr("opacity", 1);
}

function drawCityBubbleFallback(svg, width, height, countryEntry, tooltip, metric) {
  const projection = d3
    .geoNaturalEarth1()
    .fitExtent(
      [
        [20, 20],
        [width - 20, height - 20],
      ],
      { type: "Sphere" }
    );
  const group = svg.append("g");
  const countryCoord = COUNTRY_CENTROIDS[normalizeCountryName(countryEntry.country)];
  if (!countryCoord) {
    return;
  }
  const [cx, cy] = projection(countryCoord);
  group
    .append("circle")
    .attr("cx", cx)
    .attr("cy", cy)
    .attr("r", 42)
    .attr("fill", "rgba(37,99,235,0.08)")
    .attr("stroke", "#2563EB")
    .attr("stroke-dasharray", "4 4");

  const cities = (countryEntry.cityBreakdown || [])
    .map((entry) => {
      const coords = CITY_COORDINATES[normalizeCityName(entry.city)];
      if (!coords) {
        return null;
      }
      const [x, y] = projection(coords);
      return { ...entry, x, y };
    })
    .filter(Boolean)
    .slice(0, 20);

  const radius = d3.scaleSqrt().domain([0, d3.max(cities, (entry) => entry.papers) || 1]).range([3, 16]);
  const labelCities = filterOverlappingCityLabels(
    cities.slice(0, 8).map((entry, index) => ({
      ...entry,
      labelX: entry.x + (index % 2 === 0 ? 18 : -18),
      labelY: entry.y + ((index % 4) - 1.5) * 14,
      textAnchor: index % 2 === 0 ? "start" : "end",
    })),
    11
  );
  group
    .selectAll(".city-bubble-fallback")
    .data(cities)
    .join("circle")
    .attr("cx", (entry) => entry.x)
    .attr("cy", (entry) => entry.y)
    .attr("r", (entry) => radius(entry.papers))
    .attr("fill", "#0F766E")
    .attr("fill-opacity", 0.9)
    .attr("stroke", "#FFFFFF")
    .attr("stroke-width", 1.25)
    .on("mouseenter", (event, entry) => {
      tooltip.show(
        `<strong>${entry.city}</strong>
        Country: ${countryEntry.country}<br />
        Papers: ${formatInteger.format(entry.papers)}<br />
        View: ${metric === "citations" ? "Country colored by citations" : "Country colored by PageRank"}`,
        event.offsetX + 12,
        event.offsetY + 12
      );
    })
    .on("mouseleave", () => tooltip.hide());

  group
    .selectAll(".city-leader-fallback")
    .data(labelCities)
    .join("line")
    .attr("x1", (entry) => entry.x)
    .attr("y1", (entry) => entry.y)
    .attr("x2", (entry) => entry.labelX)
    .attr("y2", (entry) => entry.labelY)
    .attr("stroke", "#94A3B8")
    .attr("stroke-dasharray", "2 2");

  group
    .selectAll(".city-label-fallback")
    .data(labelCities)
    .join("text")
    .attr("class", "annotation-label")
    .attr("x", (entry) => entry.labelX)
    .attr("y", (entry) => entry.labelY)
    .attr("text-anchor", (entry) => entry.textAnchor)
    .style("font-size", "11px")
    .style("font-weight", "600")
    .style("paint-order", "stroke")
    .style("stroke", "rgba(255,255,255,0.96)")
    .style("stroke-width", "3px")
    .style("stroke-linejoin", "round")
    .style("fill", "#0F172A")
    .text((entry) => `${clampText(entry.city, 16)} (${entry.papers})`);
}

function computeFeatureTransform(path, feature, width, height) {
  const [[x0, y0], [x1, y1]] = path.bounds(feature);
  const featureWidth = Math.max(1, x1 - x0);
  const featureHeight = Math.max(1, y1 - y0);
  const scale = Math.min(8, 0.72 / Math.max(featureWidth / width, featureHeight / height));
  return {
    scale,
    translateX: width / 2 - scale * (x0 + x1) / 2,
    translateY: height / 2 - scale * (y0 + y1) / 2,
  };
}

function filterOverlappingCityLabels(labels, fontSize = 11) {
  const placed = [];
  return [...labels]
    .sort((a, b) => b.papers - a.papers)
    .filter((entry) => {
      const text = `${clampText(entry.city, 16)} (${entry.papers})`;
      const width = estimateLabelWidth(text, fontSize);
      const height = fontSize + 4;
      const box = {
        left: entry.textAnchor === "end" ? entry.labelX - width : entry.labelX,
        right: entry.textAnchor === "end" ? entry.labelX : entry.labelX + width,
        top: entry.labelY - height,
        bottom: entry.labelY + 2,
      };
      const overlaps = placed.some(
        (candidate) =>
          box.left < candidate.right &&
          box.right > candidate.left &&
          box.top < candidate.bottom &&
          box.bottom > candidate.top
      );
      if (overlaps) {
        return false;
      }
      placed.push(box);
      return true;
    });
}

function estimateLabelWidth(text, fontSize) {
  return text.length * fontSize * 0.58;
}

function normalizeCityName(name) {
  return String(name || "").trim().toLowerCase();
}

const COUNTRY_CENTROIDS = {
  afghanistan: [67.7, 33.9],
  algeria: [2.6, 28],
  angola: [17.9, -11.2],
  argentina: [-64, -34],
  australia: [134, -25],
  austria: [14.5, 47.5],
  azerbaijan: [47.5, 40.3],
  bahrain: [50.55, 26.07],
  bangladesh: [90.35, 23.68],
  belgium: [4.47, 50.5],
  "bosnia and herzegovina": [17.8, 44.2],
  botswana: [24.7, -22.3],
  brazil: [-52.9, -14.2],
  brunei: [114.7, 4.5],
  bulgaria: [25.5, 42.7],
  cambodia: [104.9, 12.6],
  canada: [-106.3, 56.1],
  chile: [-71.5, -35.7],
  china: [104.2, 35.9],
  colombia: [-74.3, 4.6],
  croatia: [16.4, 45.1],
  cyprus: [33.4, 35.1],
  "czech republic": [15.5, 49.8],
  czechia: [15.5, 49.8],
  denmark: [9.5, 56.3],
  "dominican republic": [-70.2, 18.7],
  ecuador: [-78.2, -1.8],
  egypt: [30.8, 26.8],
  estonia: [25.0, 58.7],
  ethiopia: [40.5, 9.1],
  finland: [25.7, 61.9],
  france: [2.2, 46.2],
  georgia: [43.4, 42.3],
  germany: [10.4, 51.2],
  ghana: [-1.2, 7.9],
  greece: [21.8, 39.1],
  "hong kong": [114.2, 22.3],
  hungary: [19.5, 47.2],
  iceland: [-19, 64.9],
  india: [78.9, 22.6],
  indonesia: [113.9, -0.8],
  iran: [53.7, 32.4],
  iraq: [43.7, 33.2],
  ireland: [-8.2, 53.1],
  israel: [34.8, 31.0],
  italy: [12.6, 41.9],
  japan: [138.3, 36.2],
  jordan: [36.2, 31.2],
  kazakhstan: [66.9, 48],
  kenya: [37.9, 0.2],
  kosovo: [21.2, 42.6],
  kuwait: [47.5, 29.3],
  kyrgyzstan: [74.8, 41.2],
  latvia: [24.6, 56.9],
  lebanon: [35.9, 33.8],
  libya: [17.2, 26.3],
  luxembourg: [6.1, 49.8],
  malawi: [34.3, -13.3],
  malaysia: [102, 4.2],
  maldives: [73.2, 3.2],
  malta: [14.4, 35.9],
  mexico: [-102.6, 23.6],
  monaco: [7.4, 43.7],
  mongolia: [103.8, 46.8],
  morocco: [-7.1, 31.8],
  nepal: [84.1, 28.4],
  netherlands: [5.3, 52.1],
  "new zealand": [174.9, -40.9],
  nigeria: [8.7, 9.1],
  "north korea": [127.5, 40.3],
  "north macedonia": [21.7, 41.6],
  norway: [8.5, 60.5],
  oman: [55.9, 21.5],
  pakistan: [69.3, 30.4],
  palestine: [35.2, 31.9],
  panama: [-80, 8.5],
  peru: [-75, -9.2],
  philippines: [121.8, 12.9],
  poland: [19.1, 51.9],
  portugal: [-8.2, 39.4],
  qatar: [51.2, 25.3],
  romania: [24.9, 45.9],
  russia: [105.3, 61.5],
  rwanda: [29.9, -1.9],
  "saint helena": [-5.7, -15.9],
  "saudi arabia": [45.1, 23.9],
  serbia: [21, 44],
  singapore: [103.8, 1.35],
  slovakia: [19.7, 48.7],
  slovenia: [14.9, 46.1],
  somalia: [46.2, 5.2],
  "south africa": [22.9, -30.6],
  "south korea": [127.8, 36.5],
  spain: [-3.7, 40.4],
  "sri lanka": [80.7, 7.9],
  sudan: [30.2, 12.9],
  sweden: [18.6, 60.1],
  switzerland: [8.2, 46.8],
  taiwan: [121, 23.7],
  thailand: [101, 15.8],
  tunisia: [9.5, 34],
  turkey: [35.2, 39.0],
  uganda: [32.3, 1.4],
  ukraine: [31.2, 48.4],
  "united arab emirates": [54.3, 23.4],
  "united kingdom": [-3.4, 55.4],
  "united states of america": [-98.6, 39.8],
  uruguay: [-55.8, -32.5],
  uzbekistan: [64.6, 41.4],
  vietnam: [108.3, 14.1],
  yemen: [48.5, 15.6],
  zambia: [27.8, -13.1],
  zimbabwe: [29.2, -19],
};

const CITY_COORDINATES = {
  beijing: [116.4074, 39.9042],
  riyadh: [46.6753, 24.7136],
  tehran: [51.389, 35.6892],
  seoul: [126.978, 37.5665],
  shanghai: [121.4737, 31.2304],
  london: [-0.1276, 51.5072],
  chennai: [80.2707, 13.0827],
  dhaka: [90.4125, 23.8103],
  sydney: [151.2093, -33.8688],
  cambridge: [0.1218, 52.2053],
  tokyo: [139.6917, 35.6895],
  hyderabad: [78.4867, 17.385],
  chengdu: [104.0665, 30.5728],
  wuhan: [114.3055, 30.5928],
  "new york": [-74.006, 40.7128],
  madrid: [-3.7038, 40.4168],
  taipei: [121.5654, 25.033],
  lahore: [74.3587, 31.5204],
  cairo: [31.2357, 30.0444],
  jeddah: [39.1925, 21.4858],
  islamabad: [73.0479, 33.6844],
  boston: [-71.0589, 42.3601],
  toronto: [-79.3832, 43.6532],
  nanjing: [118.7969, 32.0603],
  "kuala lumpur": [101.6869, 3.139],
  pune: [73.8567, 18.5204],
  baltimore: [-76.6122, 39.2904],
  "al-khobar": [50.1971, 26.2172],
  taif: [40.4158, 21.2703],
  guangzhou: [113.2644, 23.1291],
  coimbatore: [76.9558, 11.0168],
  "xi'an": [108.9398, 34.3416],
  shenyang: [123.4315, 41.8057],
  chongqing: [106.5516, 29.563],
  bhopal: [77.4126, 23.2599],
  dubai: [55.2708, 25.2048],
  daegu: [128.6014, 35.8714],
  bangkok: [100.5018, 13.7563],
  delhi: [77.1025, 28.7041],
  mumbai: [72.8777, 19.076],
  karachi: [67.0099, 24.8615],
  singapore: [103.8198, 1.3521],
  melbourne: [144.9631, -37.8136],
  brisbane: [153.0251, -27.4698],
  seattle: [-122.3321, 47.6062],
  paris: [2.3522, 48.8566],
  berlin: [13.405, 52.52],
  rome: [12.4964, 41.9028],
  lisbon: [-9.1393, 38.7223],
  athens: [23.7275, 37.9838],
  oslo: [10.7522, 59.9139],
  stockholm: [18.0686, 59.3293],
  copenhagen: [12.5683, 55.6761],
  vienna: [16.3738, 48.2082],
  amsterdam: [4.9041, 52.3676],
  zurich: [8.5417, 47.3769],
  barcelona: [2.1734, 41.3851],
  edinburgh: [-3.1883, 55.9533],
  ottawa: [-75.6972, 45.4215],
  vancouver: [-123.1207, 49.2827],
  sejong: [127.289, 36.48],
  busan: [129.0756, 35.1796],
  wenzhou: [120.6994, 27.9949],
  shenzhen: [114.0579, 22.5431],
  hangzhou: [120.1551, 30.2741],
};

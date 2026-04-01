import { renderSection, renderVizCard } from "./components/Section.js";
import { createStore } from "./state/store.js";
import { loadResearchDataset } from "./utils/DataService.js";
import { renderHeroStats } from "./charts/HeroStats.js";
import { renderGrowthChart } from "./charts/GrowthChart.js";
import { renderInequalityCharts } from "./charts/InequalityCharts.js";
import { renderNetworkChart } from "./charts/NetworkChart.js";
import { renderComparisonChart } from "./charts/ComparisonChart.js";
import { renderScatterPlot } from "./charts/ScatterPlot.js";
import { renderInstitutionChart } from "./charts/InstitutionChart.js";

export async function initializeApp(root) {
  root.innerHTML = `<div class="loading-state">Preparing network metrics and rendering the corpus...</div>`;

  try {
    const dataset = await loadResearchDataset();
    const store = createStore({
      selectedPaper: null,
      yearRange: dataset.summary.yearExtent,
      metricView: "citations",
      activeCluster: null,
      selectedInstitutions: [],
      institutionMetric: "citations",
    });

    root.innerHTML = `
      <div class="app-layout">
        <nav class="section-nav" aria-label="Visualization navigation">
          <p class="section-nav__label">Navigate</p>
          <a href="#framing" class="section-nav__link">Framing</a>
          <a href="#growth" class="section-nav__link">Growth</a>
          <a href="#inequality" class="section-nav__link">Inequality</a>
          <a href="#network" class="section-nav__link">Network</a>
          <a href="#catalysts" class="section-nav__link">Catalysts</a>
          <a href="#metrics" class="section-nav__link">Metrics</a>
          <a href="#institutions" class="section-nav__link">Institutions</a>
        </nav>
        <div class="app-sections"></div>
      </div>
    `;

    const sectionsRoot = root.querySelector(".app-sections");

    const intro = renderSection(sectionsRoot, {
      id: "framing",
      title: "Framing the problem",
      context:
        "These headline measures establish the size of the corpus, the thinness of its citation structure, and the small set of actors carrying most of the visible load.",
      insight:
        "A large literature can still be structurally narrow. The cards below frame that tension before the charts separate growth from true influence.",
    });
    renderHeroStats(intro.viz, dataset, store);

    const growth = renderSection(sectionsRoot, {
      id: "growth",
      title: "Growth of the field",
      context:
        "Publication volume accelerates sharply after 2015. Brushing the timeline narrows every downstream view to the selected years, making it easier to compare expansion with attention per paper.",
      insight:
        "Expansion after 2015 is unmistakable, but attention does not scale with output. Use the brush to isolate periods where paper volume rises faster than citations per paper.",
    });
    renderVizCard(growth.viz, "Annual growth trajectory", "Brush across the timeline to filter the platform by year.");
    renderGrowthChart(growth.viz.lastElementChild, dataset, store);

    const inequality = renderSection(sectionsRoot, {
      id: "inequality",
      title: "Inequality of influence",
      context:
        "Citation counts and network centrality produce different rankings but similar concentration patterns. The histogram exposes the tail; the Lorenz curve and Gini readout quantify how extreme that skew becomes.",
      insight:
        "The distribution is not just skewed; it is structurally lopsided. A small slice of papers captures a disproportionate share of attention under either metric.",
    });
    renderInequalityCharts(inequality.viz, dataset, store);

    const network = renderSection(sectionsRoot, {
      id: "network",
      title: "The citation network",
      context:
        "The graph treats the literature as a structure rather than a leaderboard. Node size follows PageRank, color separates connected components, and focus mode reveals the neighborhood around bridging works.",
      insight:
        "Clusters reveal subfields, but the most consequential papers are often the connectors between them. Hover and click to see how individual papers hold the graph together.",
    });
    renderNetworkChart(network.viz, dataset, store);

    const caseStudies = renderSection(sectionsRoot, {
      id: "catalysts",
      title: "Catalyst papers",
      context:
        "Some papers alter the pace of the literature around them. Compare up to three works to see how their citation trajectories separate once they enter the field.",
      insight:
        "Catalyst papers do not simply accumulate citations; they separate early and stay ahead. The comparison view makes those breakaway trajectories legible.",
    });
    renderComparisonChart(caseStudies.viz, dataset, store);

    const critique = renderSection(sectionsRoot, {
      id: "metrics",
      title: "Metrics critique",
      context:
        "Popularity and structural necessity are not equivalent. This scatter plot places raw citations against PageRank so papers with modest visibility but high connective value become easier to spot.",
      insight:
        "The most visible paper is not always the most necessary paper. The chart below isolates works whose structural role exceeds the attention they receive.",
    });
    renderScatterPlot(critique.viz, dataset, store);

    const geography = renderSection(sectionsRoot, {
      id: "institutions",
      title: "Institutions",
      context:
        "Institutional output clusters around a limited set of hubs. Switching between citation totals and aggregate PageRank reveals where visibility and structural leverage diverge.",
      insight:
        "Institutional concentration is visible both in rankings and on the map. The key question is whether the same hubs dominate popularity and structural centrality.",
    });
    renderInstitutionChart(geography.viz, dataset, store);
  } catch (error) {
    root.innerHTML = `<div class="loading-state">Failed to initialize the app: ${error.message}</div>`;
    throw error;
  }
}

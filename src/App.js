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
import { renderExperimentalAtlas } from "./charts/ExperimentalAtlas.js";
import { renderDataTransparency } from "./components/DataTransparency.js";

export async function initializeApp(root) {
  root.innerHTML = `<div class="loading-state">Preparing network metrics and rendering the corpus...</div>`;

  try {
    const dataset = await loadResearchDataset();
    const store = createStore({
      selectedPaper: null,
      selectedPaperDistance: 1,
      yearRange: dataset.summary.yearExtent,
      topicYear: dataset.summary.yearExtent[1],
      selectedTopic: null,
      metricView: "citations",
      activeCluster: null,
      selectedInstitutions: [],
      institutionMetric: "citations",
    });

    root.innerHTML = `
      <div class="app-layout">
        <nav class="section-nav" aria-label="Visualization navigation">
          <p class="section-nav__label">Navigate</p>
          <a href="#framing" class="section-nav__link">Overview</a>
          <a href="#growth" class="section-nav__link">Growth</a>
          <a href="#inequality" class="section-nav__link">Inequality</a>
          <a href="#network" class="section-nav__link">Network</a>
          <a href="#catalysts" class="section-nav__link">Breakout Papers</a>
          <a href="#metrics" class="section-nav__link">Citations vs Centrality</a>
          <a href="#institutions" class="section-nav__link">Institutions</a>
          <a href="#beyond" class="section-nav__link">Topics</a>
          <a href="#transparency" class="section-nav__link">Data</a>
        </nav>
        <div class="app-sections"></div>
      </div>
    `;

    const sectionsRoot = root.querySelector(".app-sections");

    const intro = renderSection(sectionsRoot, {
      id: "framing",
      title: "At a glance",
      context:
        "This overview introduces the scale of the literature and how unevenly attention is distributed.",
      insight:
        "A large field can still be dominated by a relatively small number of influential papers and institutions.",
    });
    renderHeroStats(intro.viz, dataset, store);

    const growth = renderSection(sectionsRoot, {
      id: "growth",
      title: "Field growth",
      context:
        "Publication volume rises sharply after 2015. Use the timeline to focus on specific years.",
      insight:
        "Output grows quickly, but attention per paper does not increase at the same rate.",
    });
    renderVizCard(growth.viz, "Annual growth trajectory", "Brush across the timeline to filter the platform by year.");
    renderGrowthChart(growth.viz.lastElementChild, dataset, store);

    const inequality = renderSection(sectionsRoot, {
      id: "inequality",
      title: "Citation inequality",
      context:
        "This section compares citation counts and PageRank to show how unevenly influence is distributed.",
      insight:
        "A small number of papers accounts for a large share of attention.",
    });
    renderInequalityCharts(inequality.viz, dataset, store);

    const network = renderSection(sectionsRoot, {
      id: "network",
      title: "Network structure",
      context:
        "This graph shows how papers connect through citations rather than as a simple ranking.",
      insight:
        "Some papers matter because they connect clusters, not just because they are highly cited.",
    });
    renderNetworkChart(network.viz, dataset, store);

    const caseStudies = renderSection(sectionsRoot, {
      id: "catalysts",
      title: "Breakout papers",
      context:
        "Compare selected papers to see how their citation trajectories separate over time.",
      insight:
        "Some papers pull ahead early and continue shaping the pace of the field.",
    });
    renderComparisonChart(caseStudies.viz, dataset, store);

    const critique = renderSection(sectionsRoot, {
      id: "metrics",
      title: "Citations vs centrality",
      context:
        "Citation count and structural importance are related, but they are not the same.",
      insight:
        "Highly cited papers are not always the most important papers in the network.",
    });
    renderScatterPlot(critique.viz, dataset, store);

    const geography = renderSection(sectionsRoot, {
      id: "institutions",
      title: "Institutional concentration",
      context:
        "This section compares institutions by citation totals and aggregate PageRank.",
      insight:
        "A small number of institutions dominates visibility and structural influence in the field.",
    });
    renderInstitutionChart(geography.viz, dataset, store);

    const sandbox = renderSection(sectionsRoot, {
      id: "beyond",
      title: "Topic evolution",
      context:
        "This section shifts from papers to themes, showing how topics accumulate and change over time.",
      insight:
        "Some themes become central quickly, while others remain more peripheral.",
    });
    renderExperimentalAtlas(sandbox.viz, dataset, store);

    renderDataTransparency(sectionsRoot, dataset, store);
  } catch (error) {
    root.innerHTML = `<div class="loading-state">Failed to initialize the app: ${error.message}</div>`;
    throw error;
  }
}

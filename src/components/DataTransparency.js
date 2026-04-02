import { formatInteger } from "../utils/format.js";

function metricLabel(metric) {
  if (metric === "pagerank") {
    return "PageRank";
  }
  return "Citations";
}

export function renderDataTransparency(root, dataset, store) {
  const section = document.createElement("section");
  section.id = "transparency";
  section.className = "section transparency-panel";
  section.innerHTML = `
    <div class="transparency-panel__header">
      <p class="eyebrow">Data Transparency</p>
      <h2 class="transparency-panel__title">Source, scope, and active filters</h2>
      <p class="transparency-panel__context">
        This dashboard combines a citation graph, paper-level metadata, and yearly aggregates generated from a single
        OpenAlex retrieval pipeline. The panel below makes the collection rules and current interactive filters explicit.
      </p>
    </div>
    <div class="transparency-panel__grid section__viz">
      <article class="transparency-card">
        <h3 class="transparency-card__title">Data source</h3>
        <p class="transparency-card__body">
          Source: OpenAlex Works API. The local dataset is materialized into <code>graph.json</code>,
          <code>papers_enriched.json</code>, <code>timeseries.json</code>, and <code>cluster_profiles.json</code>.
        </p>
      </article>
      <article class="transparency-card">
        <h3 class="transparency-card__title">Collection filters</h3>
        <ul class="transparency-list">
          <li>Primary topic filter: <code>t11396</code> (healthcare-focused corpus in the project pipeline)</li>
          <li>Work type: <code>article</code></li>
          <li>Access filter: <code>open_access.is_oa:true</code></li>
          <li>Identifier filter: <code>has_pmid:true</code></li>
          <li>Language filter: <code>language:en</code></li>
        </ul>
      </article>
      <article class="transparency-card transparency-card--live">
        <h3 class="transparency-card__title">Active dashboard filters</h3>
        <div class="transparency-live" data-transparency-live></div>
      </article>
    </div>
  `;

  const liveRoot = section.querySelector("[data-transparency-live]");
  const paperById = new Map(dataset.papers.map((paper) => [paper.id, paper]));

  function renderLiveState(state) {
    const selectedPaper = state.selectedPaper ? paperById.get(state.selectedPaper) : null;
    const clusterLabel =
      state.activeCluster === null || state.activeCluster === undefined ? "All clusters" : `Cluster ${state.activeCluster}`;
    const selectedInstitutions = state.selectedInstitutions?.length
      ? state.selectedInstitutions.join(", ")
      : "All institutions";

    liveRoot.innerHTML = `
      <div class="transparency-live__item">
        <span class="transparency-live__label">Year range</span>
        <strong>${state.yearRange[0]}-${state.yearRange[1]}</strong>
      </div>
      <div class="transparency-live__item">
        <span class="transparency-live__label">Inequality metric</span>
        <strong>${metricLabel(state.metricView)}</strong>
      </div>
      <div class="transparency-live__item">
        <span class="transparency-live__label">Institution ranking</span>
        <strong>${metricLabel(state.institutionMetric)}</strong>
      </div>
      <div class="transparency-live__item">
        <span class="transparency-live__label">Cluster focus</span>
        <strong>${clusterLabel}</strong>
      </div>
      <div class="transparency-live__item">
        <span class="transparency-live__label">Selected paper</span>
        <strong>${selectedPaper ? selectedPaper.title : "None"}</strong>
      </div>
      <div class="transparency-live__item">
        <span class="transparency-live__label">Network focus depth</span>
        <strong>${state.selectedPaperDistance || 1} hop</strong>
      </div>
      <div class="transparency-live__item transparency-live__item--wide">
        <span class="transparency-live__label">Institution filter</span>
        <strong>${selectedInstitutions}</strong>
      </div>
      <div class="transparency-live__item transparency-live__item--wide">
        <span class="transparency-live__label">Corpus in view</span>
        <strong>${formatInteger.format(
          dataset.papers.filter((paper) => paper.year >= state.yearRange[0] && paper.year <= state.yearRange[1]).length,
        )} papers across ${state.yearRange[0]}-${state.yearRange[1]}</strong>
      </div>
    `;
  }

  store.subscribe(renderLiveState);
  root.append(section);
}

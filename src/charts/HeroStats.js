import { formatCompact, formatDecimal, formatInteger, formatPercent } from "../utils/format.js";

export function renderHeroStats(root, dataset) {
  const stats = [
    {
      label: "Total Papers",
      value: formatInteger.format(dataset.summary.totalPapers),
      caption: `Published between ${dataset.summary.yearExtent[0]} and ${dataset.summary.yearExtent[1]}.`,
      eyebrow: "Corpus scale",
    },
    {
      label: "Total Citations",
      value: formatCompact.format(dataset.summary.totalCitations),
      caption: "Aggregate observed citation volume across the corpus.",
      eyebrow: "Attention stock",
    },
    {
      label: "Institutions",
      value: formatInteger.format(dataset.summary.totalInstitutions),
      caption: "Distinct institutional affiliations contributing to the network.",
      eyebrow: "Global footprint",
    },
    {
      label: "Network Density",
      value: formatDecimal(dataset.summary.networkDensity, 4),
      caption: `${formatPercent.format(dataset.summary.citationGini)} citation inequality across all papers.`,
      eyebrow: "Structural sparsity",
    },
  ];

  const grid = document.createElement("div");
  grid.className = "stats-grid";
  grid.innerHTML = stats
    .map(
      (stat) => `
      <article class="stat-card">
        <p class="stat-card__label">${stat.label}</p>
        <p class="stat-card__value">${stat.value}</p>
        <p class="stat-card__caption">${stat.caption}</p>
        <span class="stat-card__eyebrow">${stat.eyebrow}</span>
      </article>
    `
    )
    .join("");

  root.append(grid);
}

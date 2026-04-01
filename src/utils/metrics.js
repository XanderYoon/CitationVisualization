export function computeNetworkDensity(nodeCount, edgeCount) {
  if (nodeCount <= 1) {
    return 0;
  }
  return edgeCount / (nodeCount * (nodeCount - 1));
}

export function calculateGini(values) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }
  let cumulative = 0;
  let weighted = 0;
  sorted.forEach((value, index) => {
    cumulative += value;
    weighted += cumulative;
    if (index === sorted.length - 1) {
      weighted += 0;
    }
  });
  return (sorted.length + 1 - (2 * weighted) / total) / sorted.length;
}

export function buildLorenzPoints(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  if (!sorted.length || total === 0) {
    return [
      { sharePopulation: 0, shareValue: 0 },
      { sharePopulation: 1, shareValue: 1 },
    ];
  }
  let cumulative = 0;
  const points = [{ sharePopulation: 0, shareValue: 0 }];
  sorted.forEach((value, index) => {
    cumulative += value;
    points.push({
      sharePopulation: (index + 1) / sorted.length,
      shareValue: cumulative / total,
    });
  });
  return points;
}

export function computePageRank(nodes, edges, iterations = 30, damping = 0.85) {
  const ids = nodes.map((node) => node.id);
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const outgoing = new Array(nodes.length).fill(0);
  const incoming = new Array(nodes.length).fill(null).map(() => []);

  edges.forEach(({ source, target }) => {
    const sourceIndex = indexById.get(typeof source === "object" ? source.id : source);
    const targetIndex = indexById.get(typeof target === "object" ? target.id : target);
    if (sourceIndex === undefined || targetIndex === undefined) {
      return;
    }
    outgoing[sourceIndex] += 1;
    incoming[targetIndex].push(sourceIndex);
  });

  let rank = new Array(nodes.length).fill(1 / Math.max(nodes.length, 1));
  const teleport = (1 - damping) / Math.max(nodes.length, 1);

  for (let step = 0; step < iterations; step += 1) {
    const next = new Array(nodes.length).fill(teleport);
    let danglingMass = 0;

    for (let i = 0; i < nodes.length; i += 1) {
      if (outgoing[i] === 0) {
        danglingMass += rank[i];
      }
    }

    for (let i = 0; i < nodes.length; i += 1) {
      const incomingNodes = incoming[i];
      let value = 0;
      for (const incomingIndex of incomingNodes) {
        value += rank[incomingIndex] / outgoing[incomingIndex];
      }
      next[i] += damping * value;
      next[i] += damping * danglingMass / Math.max(nodes.length, 1);
    }
    rank = next;
  }

  return rank;
}

export function computeConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));
  edges.forEach(({ source, target }) => {
    const sourceId = typeof source === "object" ? source.id : source;
    const targetId = typeof target === "object" ? target.id : target;
    if (!adjacency.has(sourceId) || !adjacency.has(targetId)) {
      return;
    }
    adjacency.get(sourceId).add(targetId);
    adjacency.get(targetId).add(sourceId);
  });

  const visited = new Set();
  const components = [];

  for (const node of nodes) {
    if (visited.has(node.id)) {
      continue;
    }
    const stack = [node.id];
    const component = [];
    visited.add(node.id);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  components.sort((a, b) => b.length - a.length);
  const clusterByNodeId = new Map();
  components.forEach((component, index) => {
    component.forEach((id) => clusterByNodeId.set(id, index));
  });

  return { components, clusterByNodeId };
}

export function cumulativeCitationSeries(papers) {
  const years = [...new Set(papers.map((paper) => paper.year).filter(Number.isFinite))].sort((a, b) => a - b);
  return papers.map((paper) => {
    const series = years.map((year) => ({
      year,
      value: year < paper.year ? 0 : paper.citations,
    }));
    return {
      paper,
      series,
    };
  });
}

export function topInstitutions(papers, metric, limit = 10) {
  const aggregation = new Map();
  for (const paper of papers) {
    for (const institution of paper.institutions || []) {
      const entry = aggregation.get(institution) || { institution, citations: 0, pagerank: 0, papers: 0 };
      entry.citations += paper.citations || 0;
      entry.pagerank += paper.pagerank || 0;
      entry.papers += 1;
      aggregation.set(institution, entry);
    }
  }
  return [...aggregation.values()]
    .sort((a, b) => b[metric] - a[metric])
    .slice(0, limit);
}

const countryPatterns = [
  { pattern: /australia|sydney|queensland|victoria|melbourne|uts\b/i, country: "Australia" },
  { pattern: /china|xiamen|zhejiang|sun yat-sen|beihang|shenzhen/i, country: "China" },
  { pattern: /india|rishikesh|mysore|vellore|saud|ambedkar|patil|shivaji|chitkara/i, country: "India" },
  { pattern: /university of toronto|york university|toronto metropolitan|krembil|fields institute/i, country: "Canada" },
  { pattern: /harvard|mit|johns hopkins|brown university|ucla|northwestern|emory|university of chicago|university of pennsylvania|texas tech|nih|national institutes of health|boston children's|henry ford|purdue|albany state|state university of new york|dayton|louisville|georgia|houston/i, country: "United States of America" },
  { pattern: /edinburgh|aston|teesside|surrey|warwick|west of england|bristol|birmingham city/i, country: "United Kingdom" },
  { pattern: /seoul|dongguk|sejong|myongji|jeonbuk/i, country: "South Korea" },
  { pattern: /king saud|king faisal|king abdullah|taibah|al baha|imam mohammad/i, country: "Saudi Arabia" },
  { pattern: /ethiopia|addis ababa|dilla|arba minch/i, country: "Ethiopia" },
  { pattern: /khulna|rajshahi|north south university|dhaka|bangladesh/i, country: "Bangladesh" },
  { pattern: /ku leuven|leuven/i, country: "Belgium" },
  { pattern: /lisbon|coimbra|instituto universit.rio|medicina molecular/i, country: "Portugal" },
  { pattern: /pavia|maugeri|fondazione bruno kessler/i, country: "Italy" },
  { pattern: /fujita/i, country: "Japan" },
  { pattern: /athens/i, country: "Greece" },
  { pattern: /cyprus|paphos/i, country: "Cyprus" },
  { pattern: /düsseldorf|hannover/i, country: "Germany" },
  { pattern: /primorska|maribor/i, country: "Slovenia" },
  { pattern: /bitola/i, country: "North Macedonia" },
  { pattern: /antalya/i, country: "Turkey" },
  { pattern: /mardan|kohat/i, country: "Pakistan" },
  { pattern: /auckland|manukau/i, country: "New Zealand" },
  { pattern: /ibm research - tokyo/i, country: "Japan" },
];

export function inferCountryFromInstitution(institution) {
  if (!institution) {
    return null;
  }
  const matched = countryPatterns.find((entry) => entry.pattern.test(institution));
  return matched ? matched.country : null;
}

export function aggregateCountries(papers, metric) {
  const aggregation = new Map();
  for (const paper of papers) {
    const countries = collectPaperCountries(paper);
    const cityMap = collectPaperCitiesByCountry(paper, countries);

    countries.forEach((country) => {
      const entry = aggregation.get(country) || {
        country,
        citations: 0,
        pagerank: 0,
        papers: 0,
        institutions: 0,
        cities: new Map(),
      };
      entry.citations += paper.citations || 0;
      entry.pagerank += paper.pagerank || 0;
      entry.papers += 1;
      entry.institutions += (paper.institutions || []).length;

      const cities = cityMap.get(country) || [];
      cities.forEach((city) => {
        entry.cities.set(city, (entry.cities.get(city) || 0) + 1);
      });

      aggregation.set(country, entry);
    });
  }
  return [...aggregation.values()]
    .map((entry) => ({
      ...entry,
      cityBreakdown: [...entry.cities.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([city, papers]) => ({ city, papers })),
      topCities: [...entry.cities.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([city]) => city),
    }))
    .sort((a, b) => b[metric] - a[metric]);
}

function collectPaperCountries(paper) {
  const explicitCountries = (paper.countries || []).filter(Boolean);
  if (explicitCountries.length) {
    return [...new Set(explicitCountries.map(normalizeCountryLabel))];
  }

  const inferredCountries = (paper.institution_locations || [])
    .map((location) => location.country)
    .filter(Boolean)
    .map(normalizeCountryLabel);

  if (inferredCountries.length) {
    return [...new Set(inferredCountries)];
  }

  return [...new Set((paper.institutions || []).map(inferCountryFromInstitution).filter(Boolean).map(normalizeCountryLabel))];
}

function collectPaperCitiesByCountry(paper, countries) {
  const map = new Map(countries.map((country) => [country, []]));
  const locations = paper.institution_locations || [];

  locations.forEach((location) => {
    const country = normalizeCountryLabel(location.country);
    const city = normalizeCityLabel(location.city);
    if (!country || !city || !map.has(country)) {
      return;
    }
    map.get(country).push(city);
  });

  if (![...map.values()].some((cities) => cities.length)) {
    const explicitCities = (paper.cities || []).map(normalizeCityLabel).filter(Boolean);
    if (countries.length === 1 && explicitCities.length) {
      map.set(countries[0], explicitCities);
    }
  }

  return map;
}

function normalizeCountryLabel(country) {
  if (!country) {
    return null;
  }
  const normalized = String(country).trim();
  const aliases = {
    "United States": "United States of America",
    USA: "United States of America",
    US: "United States of America",
    "U.S.": "United States of America",
    "U.S.A.": "United States of America",
    "United Kingdom of Great Britain and Northern Ireland": "United Kingdom",
    UK: "United Kingdom",
    "Republic of Korea": "South Korea",
  };
  return aliases[normalized] || normalized;
}

function normalizeCityLabel(city) {
  if (!city) {
    return null;
  }
  const normalized = String(city).trim();
  const invalid = new Set(["United States", "United Kingdom", "India", "China"]);
  return invalid.has(normalized) ? null : normalized;
}

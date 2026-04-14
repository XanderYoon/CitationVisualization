# Citation Visualization for AI in Healthcare

An interactive data visualization dashboard that explores how influence is distributed across AI in healthcare research.

This project goes beyond simple citation counts by incorporating network-based importance (PageRank) to identify papers and institutions that are not only highly cited, but also structurally central to the field.

---

## Overview

Scientific influence is often measured using citation counts, but citations alone do not fully capture how knowledge flows through a field.

This dashboard analyzes:
- how research output has grown over time
- how unevenly influence is distributed
- how papers connect through citation networks
- how structural importance differs from raw citation counts
- how institutions shape the field

---

## Key Features

- 📈 **Field Growth Analysis**  
  Visualizes the rapid expansion of AI in healthcare literature over time.

- ⚖️ **Citation Inequality**  
  Highlights how a small subset of papers dominates overall attention.

- 🕸️ **Citation Network Visualization**  
  Interactive graph showing how papers are connected through citations.

- 🔍 **Citations vs. Centrality**  
  Compares citation counts with PageRank to identify structurally important papers.

- 🏛️ **Institutional Analysis**  
  Examines how influence is concentrated across institutions.

- 🧠 **Topic Evolution**  
  Explores how research themes emerge and evolve over time.

- 📊 **Interactive Filtering**  
  Filter by year range and explore subsets of the dataset dynamically.

---

## Tech Stack

- **JavaScript (ES6 modules)**
- **D3.js** for data visualization
- **HTML + CSS** for layout and styling
- **Python HTTP server** for local development

---

## Data Source

- OpenAlex Works API
- Processed into:
  - `graph.json`
  - `papers_enriched.json`
  - `timeseries.json`
  - `cluster_profiles.json`

---

## Running the Project Locally

Clone the repository:

```bash
git clone https://github.com/XanderYoon/CitationVisualization.git
cd CitationVisualization

## Run

```bash
npm start
```

Open:

```text
http://localhost:8000
```

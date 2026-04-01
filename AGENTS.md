# 📄 AGENTS.md — AI Knowledge Visualization System

You are an expert Data Visualization Engineer. Your mission is to build a high-fidelity, interactive research platform that reveals how scientific influence is structured, concentrated, and often mismeasured.

---

## 🏛️ 1. Aesthetic & Style Guide (Academic Minimalist)

The UI must feel like a premium research tool: **Clean, high-contrast, and focused on data.**

### 🎨 1.1 Color Palette (Low Saturation / Light Mode)
| Element | Hex Code | Purpose |
| :--- | :--- | :--- |
| **Base Background** | `#F9FAFB` | Main page background (off-white) |
| **Surface** | `#FFFFFF` | Cards and visualization containers |
| **Primary Text** | `#111827` | Headers and body copy |
| **Secondary Text** | `#6B7280` | Labels, axis titles, captions |
| **Border / Grid** | `#E5E7EB` | Subtle dividers and chart axes |
| **Accent Primary** | `#2563EB` | Research hubs / High-impact nodes |
| **Accent Muted** | `#DBEAFE` | Hover states and background fills |

### 🖋️ 1.2 Typography & Layout
* **Font:** `Inter` (Sans-serif). Weights: `400` (Body), `500` (Medium/UI), `600` (Headers).
* **Grid:** 8px system. Max-width `1200px`.
* **Structure:** Every section follows: `[Title] -> [Context] -> [Visualization] -> [Insight Box]`.

---

## 🧭 2. Narrative Flow & Visualization Specs

### 🏁 Phase 0: Landing Page — Framing the Problem
* **Visual:** Hero Stat Cards (Big Numbers).
* **Data:** Total Papers, Total Citations, Total Institutions, Network Density.
* **Insight:** "Scientific progress is not evenly distributed—a small number of works dominate the narrative."

### 📈 Phase 1: Growth of the Field
* **Visual:** Line Chart (Papers/Citations per Year).
* **Interaction:** Brush/Zoom to focus on specific eras.
* **Annotation:** Mark the "Deep Learning Surge" post-2015.
* **Insight:** "Growth does not imply equal contribution; newer papers compete for a finite 'attention budget'."

### ⚖️ Phase 2: Inequality of Influence
* **Visual:** Dual-view (Histogram of citations + Lorenz Curve).
* **Metric:** Real-time Gini Coefficient calculation.
* **Interaction:** Toggle between "Citations" and "PageRank/Centrality".
* **Insight:** "Scientific attention follows a power-law; many papers are effectively invisible in the network."

### 🕸️ Phase 3: The Citation Network (Core)
* **Visual:** Force-Directed Graph (D3).
* **Encoding:** Node Size (PageRank), Color (Cluster/Subfield), Edge (Subtle links).
* **Interaction:** Zoom/Pan, Hover (Node details), Click (Isolate subgraph/neighbors).
* **Insight:** "Knowledge is structured into clusters; 'Bridge Papers' prevent the network from fragmenting."

### 🧪 Phase 4: Case Studies — Catalyst Papers
* **Visual:** Multi-Line Comparison Chart (Citation growth trajectories).
* **Selection:** Allow user to select 2-3 "Catalyst" papers (e.g., Attention Is All You Need).
* **Insight:** "Certain papers trigger 'explosions' in cluster growth, acting as foundational seeds for subfields."

### 📊 Phase 5: Metrics Critique (The Reveal)
* **Visual:** Scatter Plot (`x: Citations`, `y: PageRank/Centrality`).
* **Interaction:** Hover to show specific paper metrics.
* **Insight:** "Citation counts measure popularity; PageRank measures structural necessity. Some 'hidden' papers are more critical than famous ones."

### 🌍 Phase 6: Institutions & Geography
* **Visual:** World Heatmap OR Ordered Horizontal Bar Chart.
* **Interaction:** Hover for institutional stats.
* **Insight:** "Knowledge production is geographically concentrated in a few global elite hubs."

---

## 🏗️ 3. System Architecture & Data Contracts

### 3.1 Stack & Pattern
* **Engine:** D3.js (v7+).
* **Pattern:** Modular Visualization Architecture (`createChart({container, data, state})`).
* **State:** `{ selectedPaper, yearRange, metricView, activeCluster, selectedInstitutions }`.

### 3.2 Data Schema
* **`graph.json`**: `{ nodes: [{id, citations, pagerank, cluster}], edges: [{source, target}] }`
* **`papers.json`**: Detailed metadata (Title, Authors, Abstract, Institution).
* **`timeseries.json`**: Yearly aggregates (Count, Gini, Avg Citations).

### 3.3 Project Structure

```
/project-root
│
├── data/
│   ├── graph.json        # citation network
│   ├── papers.json       # metadata per paper
│   └── timeseries.json   # yearly aggregates
│
├── viz_descriptions.md   # narrative + visualization spec
├── AGENTS.md             # (this file)
│
├── src/
│   ├── components/
│   ├── charts/
│   ├── utils/
│   └── state/
│
├── index.html
├── main.js
└── styles.css
``` 

---

## 🛠️ 4. Implementation Checkbox List

### 🟦 1. Infrastructure & Setup
- [x] Initialize project file structure and D3 base canvas.
- [x] Implement responsive SVG container logic.
- [x] Create landing page.
- [x] Define global CSS variable system (Academic Light Mode).

### 🟦 2. Phase 0 & 1 (Intro & Growth)
- [x] Build Hero Stat Cards component.
- [x] Implement Line Chart with brush/zoom interaction.
- [x] Add vertical annotations for key historical AI milestones.

### 🟦 3. Phase 2 (Inequality)
- [x] Build Histogram with log-scale X-axis.
- [x] Implement Lorenz Curve drawing logic based on citation arrays.
- [x] Create Gini Coefficient calculator and display widget.

### 🟦 4. Phase 3 (The Network)
- [x] Implement Force-Directed Simulation with collision detection.
- [x] Apply categorical colors to nodes based on `cluster` ID.
- [x] Add "Focus Mode": fade non-connected nodes on hover/click.
- [x] Implement smooth Zoom & Pan behaviors.

### 🟦 5. Phase 4 & 5 (Case Studies & Critique)
- [x] Create comparison chart for paper citation timelines.
- [x] Build Scatter Plot comparing Citations vs. PageRank.
- [x] Implement "Cross-Highlighting": selecting a node in the graph highlights it in the scatter plot.

### 🟦 6. Phase 6 (Geography)
- [x] Implement Institutional Bar Chart / Map.
- [x] Add sorting logic (Top 10 by Citations vs. Top 10 by PageRank).

### 🟦 7. Final Polish
- [x] Create "Insight Boxes" with the specified `border-left` blue styling.
- [x] Audit all typography for consistency with the Academic Style Guide.
- [ ] Final performance check: Ensure smooth 60fps graph interactions.

---

## 🧠 Final Principle
> **Design like Apple. Explain like a Professor. Visualize like a Scientist.**

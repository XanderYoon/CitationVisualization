import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

export function createResponsiveSvg(host, minHeight = 360) {
  host.classList.add("chart-host");
  const svg = d3.select(host).append("svg");

  const measure = () => {
    const width = Math.max(host.clientWidth, 320);
    const height = Math.max(minHeight, Math.round(width * 0.45));
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    return { width, height };
  };

  const resizeObserver = new ResizeObserver(() => {
    const size = measure();
    host.dispatchEvent(new CustomEvent("chart:resize", { detail: size }));
  });

  resizeObserver.observe(host);
  return { svg, measure };
}

export function createTooltip(host) {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip";
  host.append(tooltip);
  return {
    show(html, x, y) {
      tooltip.innerHTML = html;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
      tooltip.classList.add("is-visible");
    },
    hide() {
      tooltip.classList.remove("is-visible");
    },
  };
}

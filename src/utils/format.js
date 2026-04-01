export const formatInteger = new Intl.NumberFormat("en-US");
export const formatCompact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const formatPercent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatDecimal(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0.000";
}

export function clampText(text, max = 72) {
  if (!text) {
    return "Untitled paper";
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

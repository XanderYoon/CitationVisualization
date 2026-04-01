export function renderSection(root, { id, title, context, insight }) {
  const section = document.createElement("section");
  section.className = "section";
  if (id) {
    section.id = id;
  }
  section.innerHTML = `
    <div class="section__head">
      <h2 class="section__title">${title}</h2>
      <p class="section__context">${context}</p>
      ${insight ? `<p class="section__insight">${insight}</p>` : ""}
    </div>
    <div class="section__viz"></div>
  `;
  root.append(section);
  return {
    section,
    viz: section.querySelector(".section__viz"),
  };
}

export function renderVizCard(root, title, meta = "") {
  const card = document.createElement("article");
  card.className = "viz-card";
  card.innerHTML = `
    <div class="viz-card__header">
      <div>
        <h3 class="viz-card__title">${title}</h3>
        ${meta ? `<p class="viz-card__meta">${meta}</p>` : ""}
      </div>
    </div>
  `;
  root.append(card);
  return card;
}

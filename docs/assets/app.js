const state = {
  items: [],
  categories: [],
  activeTag: "",
  search: "",
  category: "",
  sort: "name-asc",
  zoom: 1
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  categoryFilter: document.getElementById("categoryFilter"),
  sortFilter: document.getElementById("sortFilter"),
  stats: document.getElementById("stats"),
  tagCloud: document.getElementById("tagCloud"),
  workflowGrid: document.getElementById("workflowGrid"),
  cardTemplate: document.getElementById("cardTemplate"),
  lightbox: document.getElementById("lightbox"),
  lightboxTitle: document.getElementById("lightboxTitle"),
  lightboxImage: document.getElementById("lightboxImage"),
  lightboxStage: document.getElementById("lightboxStage"),
  zoomInButton: document.getElementById("zoomInButton"),
  zoomOutButton: document.getElementById("zoomOutButton"),
  zoomResetButton: document.getElementById("zoomResetButton"),
  closeLightboxButton: document.getElementById("closeLightboxButton")
};

bootstrap().catch((error) => {
  elements.workflowGrid.innerHTML = `<p>Unable to load catalog: ${error.message}</p>`;
});

async function bootstrap() {
  const response = await fetch("./data/workflows.json");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const catalog = await response.json();
  state.items = catalog.items;
  state.categories = catalog.categories;

  populateCategories();
  renderStats(catalog);
  renderTagCloud();
  renderSuggestions();
  renderGrid();
  wireEvents();
}

function wireEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderSuggestions();
    renderGrid();
  });

  elements.searchInput.addEventListener("focus", () => {
    renderSuggestions();
  });

  elements.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    renderGrid();
  });

  elements.sortFilter.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderGrid();
  });

  elements.zoomInButton.addEventListener("click", () => {
    setZoom(state.zoom + 0.2);
  });

  elements.zoomOutButton.addEventListener("click", () => {
    setZoom(state.zoom - 0.2);
  });

  elements.zoomResetButton.addEventListener("click", () => {
    setZoom(1);
    centerLightboxImage();
  });

  elements.closeLightboxButton.addEventListener("click", closeLightbox);

  elements.lightboxStage.addEventListener(
    "wheel",
    (event) => {
      if (elements.lightbox.hidden) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.15 : -0.15;
      setZoom(state.zoom + delta);
    },
    { passive: false }
  );

  document.addEventListener("click", (event) => {
    if (
      event.target !== elements.searchInput &&
      !elements.searchSuggestions.contains(event.target)
    ) {
      hideSuggestions();
    }

    if (event.target.dataset.closeLightbox === "true") {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLightbox();
      hideSuggestions();
    }
  });
}

function populateCategories() {
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.categoryFilter.append(option);
  }
}

function renderStats(catalog) {
  elements.stats.innerHTML = "";
  const stats = [
    `${catalog.totals.workflows} workflows`,
    `${catalog.totals.categories} categories`,
    `${catalog.totals.skipped || 0} skipped`,
    `${countUniqueTags(catalog.items)} searchable tags`
  ];

  for (const text of stats) {
    const node = document.createElement("span");
    node.className = "stat";
    node.textContent = text;
    elements.stats.append(node);
  }
}

function renderTagCloud() {
  const tagCounts = new Map();

  for (const item of state.items) {
    for (const tag of item.tags.slice(0, 8)) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const tags = Array.from(tagCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 24);

  elements.tagCloud.innerHTML = "";
  for (const [tag, count] of tags) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tag${state.activeTag === tag ? " is-active" : ""}`;
    button.textContent = `${tag} (${count})`;
    button.addEventListener("click", () => {
      state.activeTag = state.activeTag === tag ? "" : tag;
      renderTagCloud();
      renderSuggestions();
      renderGrid();
    });
    elements.tagCloud.append(button);
  }
}

function renderSuggestions() {
  const query = state.search.trim();
  if (!query) {
    hideSuggestions();
    return;
  }

  const suggestions = buildSuggestions(query).slice(0, 6);
  if (suggestions.length === 0) {
    hideSuggestions();
    return;
  }

  elements.searchSuggestions.innerHTML = "";
  suggestions.forEach((suggestion) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion";
    button.textContent = suggestion;
    button.addEventListener("click", () => {
      elements.searchInput.value = suggestion;
      state.search = suggestion.toLowerCase();
      hideSuggestions();
      renderGrid();
    });
    elements.searchSuggestions.append(button);
  });
  elements.searchSuggestions.hidden = false;
}

function buildSuggestions(query) {
  const needle = query.toLowerCase();
  const seen = new Set();
  const suggestions = [];

  for (const item of state.items) {
    const candidates = [item.name, item.category, ...(item.tags || [])];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const normalized = candidate.toLowerCase();
      if (!normalized.includes(needle) || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      suggestions.push(candidate);
    }
  }

  return suggestions.sort((left, right) => {
    const leftStarts = left.toLowerCase().startsWith(needle) ? 0 : 1;
    const rightStarts = right.toLowerCase().startsWith(needle) ? 0 : 1;
    return leftStarts - rightStarts || left.length - right.length || left.localeCompare(right);
  });
}

function hideSuggestions() {
  elements.searchSuggestions.hidden = true;
  elements.searchSuggestions.innerHTML = "";
}

function renderGrid() {
  const filteredItems = state.items.filter(matchesFilters).sort(compareItems);
  elements.workflowGrid.innerHTML = "";

  if (filteredItems.length === 0) {
    elements.workflowGrid.innerHTML = "<p>No workflows matched the current filters.</p>";
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of filteredItems) {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const preview = card.querySelector(".preview");
    preview.src = item.previewPath;
    preview.alt = `${item.name} preview`;
    preview.addEventListener("error", () => {
      preview.src = buildPlaceholderPreview(item);
    });
    preview.addEventListener("click", () => {
      openLightbox(item, preview.currentSrc || preview.src);
    });
    card.querySelector(".category").textContent = item.category;
    card.querySelector("h2").textContent = item.name;
    card.querySelector(".summary").textContent = item.summary || "No summary available.";
    card.querySelector(".meta").textContent = `${item.nodeCount} nodes / ${item.edgeCount} connections`;
    card.querySelector(".diagram-link").href = item.diagramPath;
    card.querySelector(".source-link").href = item.sourcePath;

    const tagWrap = card.querySelector(".tags");
    item.tags.slice(0, 6).forEach((tag) => {
      const chip = document.createElement("span");
      chip.textContent = tag;
      tagWrap.append(chip);
    });

    fragment.append(card);
  }

  elements.workflowGrid.append(fragment);
}

function matchesFilters(item) {
  if (state.category && item.category !== state.category) {
    return false;
  }

  if (state.activeTag && !item.tags.includes(state.activeTag)) {
    return false;
  }

  if (!state.search) {
    return true;
  }

  const haystack = [item.name, item.category, item.summary, ...(item.tags || [])]
    .join(" ")
    .toLowerCase();

  return haystack.includes(state.search);
}

function countUniqueTags(items) {
  return new Set(items.flatMap((item) => item.tags)).size;
}

function compareItems(left, right) {
  switch (state.sort) {
    case "name-desc":
      return right.name.localeCompare(left.name);
    case "nodes-desc":
      return right.nodeCount - left.nodeCount || left.name.localeCompare(right.name);
    case "nodes-asc":
      return left.nodeCount - right.nodeCount || left.name.localeCompare(right.name);
    case "edges-desc":
      return right.edgeCount - left.edgeCount || left.name.localeCompare(right.name);
    case "edges-asc":
      return left.edgeCount - right.edgeCount || left.name.localeCompare(right.name);
    case "category-asc":
      return left.category.localeCompare(right.category) || left.name.localeCompare(right.name);
    case "name-asc":
    default:
      return left.name.localeCompare(right.name);
  }
}

function buildPlaceholderPreview(item) {
  const title = escapeXml(item.name);
  const subtitle = escapeXml(`${item.nodeCount} nodes / ${item.edgeCount} connections`);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff8ef" />
          <stop offset="100%" stop-color="#eed9be" />
        </linearGradient>
      </defs>
      <rect width="960" height="600" rx="36" fill="url(#bg)" />
      <rect x="46" y="54" width="868" height="492" rx="28" fill="#fffdf8" stroke="#d9cbb8" />
      <text x="88" y="148" fill="#c45c2e" font-family="Georgia, serif" font-size="28" letter-spacing="4">MERMAID PREVIEW PENDING</text>
      <text x="88" y="234" fill="#1e1f1c" font-family="Georgia, serif" font-size="42">${title}</text>
      <text x="88" y="292" fill="#665f55" font-family="Georgia, serif" font-size="24">${subtitle}</text>
      <text x="88" y="380" fill="#665f55" font-family="Georgia, serif" font-size="22">Run npm run build to generate PNG workflow previews.</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function openLightbox(item, imageSource) {
  state.zoom = 1;
  elements.lightboxTitle.textContent = item.name;
  elements.lightboxImage.src = imageSource;
  elements.lightboxImage.alt = `${item.name} full preview`;
  elements.lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  setZoom(1);
  requestAnimationFrame(centerLightboxImage);
}

function closeLightbox() {
  if (elements.lightbox.hidden) {
    return;
  }
  elements.lightbox.hidden = true;
  elements.lightboxImage.removeAttribute("src");
  document.body.style.overflow = "";
}

function setZoom(nextZoom) {
  state.zoom = Math.min(4, Math.max(0.5, Number(nextZoom.toFixed(2))));
  elements.lightboxImage.style.transform = `scale(${state.zoom})`;
}

function centerLightboxImage() {
  elements.lightboxStage.scrollTop = 0;
  elements.lightboxStage.scrollLeft = 0;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

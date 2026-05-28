const PAGE_SIZE = 12;

const state = {
  items: [],
  categories: [],
  activeTag: "",
  search: "",
  categories_selected: [],
  sort: "name-asc",
  zoom: 1,
  page: 1,
  lightboxNaturalWidth: 0,
  lightboxNaturalHeight: 0
};

const elements = {
  searchInput: document.getElementById("searchInput"),
  searchSuggestions: document.getElementById("searchSuggestions"),
  sortFilter: document.getElementById("sortFilter"),
  stats: document.getElementById("stats"),
  tagCloud: document.getElementById("tagCloud"),
  workflowGrid: document.getElementById("workflowGrid"),
  pagination: document.getElementById("pagination"),
  cardTemplate: document.getElementById("cardTemplate"),
  lightbox: document.getElementById("lightbox"),
  lightboxTitle: document.getElementById("lightboxTitle"),
  lightboxImage: document.getElementById("lightboxImage"),
  lightboxCanvas: document.getElementById("lightboxCanvas"),
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
  renderCategoryFilter();
  renderStats(catalog);
  renderTagCloud();
  renderSuggestions();
  renderGrid();
  wireEvents();
}

function wireEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    resetPagination();
    renderSuggestions();
    renderGrid();
  });

  elements.searchInput.addEventListener("focus", () => {
    renderSuggestions();
  });

  // Custom category filter
  const categoryTrigger = document.getElementById("categoryFilterTrigger");
  const categoryMenu = document.getElementById("categoryFilterMenu");
  const categoryContainer = document.getElementById("categoryFilterContainer");

  const toggleCategoryMenu = () => {
    const isOpen = !categoryMenu.hidden;
    categoryMenu.hidden = isOpen;
    categoryTrigger.setAttribute("aria-expanded", String(!isOpen));
  };

  categoryTrigger.addEventListener("click", toggleCategoryMenu);
  categoryTrigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleCategoryMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!categoryContainer.contains(event.target)) {
      categoryMenu.hidden = true;
      categoryTrigger.setAttribute("aria-expanded", "false");
    }
  });

  const onCategoryOptionSelect = (event) => {
    const option = event.target.closest(".option");
    if (!option || !categoryMenu.contains(option)) {
      return;
    }

    const value = option.dataset.value;
    if (value === "") {
      state.categories_selected = [];
    } else {
      const index = state.categories_selected.indexOf(value);
      if (index > -1) {
        state.categories_selected.splice(index, 1);
      } else {
        state.categories_selected.push(value);
      }
    }
    renderCategoryFilter();
    resetPagination();
    renderGrid();
  };

  categoryMenu.addEventListener("click", (event) => {
    const option = event.target.closest(".option");
    if (!option) {
      return;
    }

    onCategoryOptionSelect(event);
    });


  elements.sortFilter.addEventListener("change", (event) => {
    state.sort = event.target.value;
    resetPagination();
    renderGrid();
  });

  elements.zoomInButton.addEventListener("click", () => {
    setZoom(state.zoom + 0.25);
  });

  elements.zoomOutButton.addEventListener("click", () => {
    setZoom(state.zoom - 0.25);
  });

  elements.zoomResetButton.addEventListener("click", () => {
    setZoom(1);
    centerLightboxImage();
  });

  elements.closeLightboxButton.addEventListener("click", closeLightbox);

  elements.lightboxStage.addEventListener(
    "wheel",
    (event) => {
      if (elements.lightbox.hidden || !event.ctrlKey) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.15 : -0.15;
      setZoom(state.zoom + delta);
    },
    { passive: false }
  );

  elements.lightboxImage.addEventListener("load", () => {
    state.lightboxNaturalWidth = elements.lightboxImage.naturalWidth || 0;
    state.lightboxNaturalHeight = elements.lightboxImage.naturalHeight || 0;
    syncLightboxCanvas();
  });

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

  window.addEventListener("resize", () => {
    if (!elements.lightbox.hidden) {
      syncLightboxCanvas();
    }
  });
}

function populateCategories() {
  const categoryMenu = document.getElementById("categoryFilterMenu");

  for (const category of state.categories) {
    const option = document.createElement("div");

    option.className = "option";
    option.dataset.value = category;

    option.innerHTML = `
      <label class="option-label">
        <input type="checkbox" class="option-checkbox" />
        <span>${category}</span>
      </label>
    `;

    categoryMenu.append(option);
  }
}

function renderCategoryFilter() {
  const selectedChips = document.getElementById("selectedChips");
  const placeholder = document.getElementById("categoryFilterPlaceholder");
  const categoryMenu = document.getElementById("categoryFilterMenu");

  selectedChips.innerHTML = "";
  for (const category of state.categories_selected) {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.innerHTML = `
      <span>${category}</span>
      <button type="button" class="chip-close" data-category="${category}" aria-label="Remove ${category}">×</button>
    `;
    chip.querySelector(".chip-close").addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = state.categories_selected.indexOf(category);
      if (idx > -1) {
        state.categories_selected.splice(idx, 1);
      }
      renderCategoryFilter();
      resetPagination();
      renderGrid();
    });
    selectedChips.append(chip);
  }

  placeholder.hidden = state.categories_selected.length > 0;

  // Update checkmarks in dropdown
for (const option of categoryMenu.querySelectorAll(".option")) {
  const isSelected = state.categories_selected.includes(option.dataset.value);

  option.classList.toggle("is-selected", isSelected);

  const checkbox = option.querySelector(".option-checkbox");

  if (checkbox) {
    checkbox.checked = isSelected;
  }
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
      resetPagination();
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
      resetPagination();
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
  const filteredItems = getFilteredItems();
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(start, start + PAGE_SIZE);

  elements.workflowGrid.innerHTML = "";

  if (pageItems.length === 0) {
    elements.workflowGrid.innerHTML = "<p>No workflows matched the current filters.</p>";
    elements.pagination.innerHTML = "";
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of pageItems) {
    const card = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    const preview = card.querySelector(".preview");
    const previewButton = card.querySelector(".preview-button");
    preview.src = item.previewPath;
    preview.alt = `${item.name} preview`;
    preview.addEventListener("error", () => {
      preview.src = buildPlaceholderPreview(item);
    });
    previewButton.addEventListener("click", () => {
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
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  elements.pagination.innerHTML = "";
  if (totalPages <= 1) {
    return;
  }

  const controls = buildPaginationList(totalPages, state.page);
  controls.forEach((entry) => {
    if (entry === "...") {
      const gap = document.createElement("span");
      gap.className = "stat";
      gap.textContent = "...";
      elements.pagination.append(gap);
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-button${entry === state.page ? " is-active" : ""}`;
    button.textContent = String(entry);
    button.addEventListener("click", () => {
      state.page = entry;
      renderGrid();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    elements.pagination.append(button);
  });
}

function buildPaginationList(totalPages, currentPage) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const filtered = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);

  const result = [];
  for (let index = 0; index < filtered.length; index += 1) {
    const page = filtered[index];
    const previous = filtered[index - 1];
    if (index > 0 && page - previous > 1) {
      result.push("...");
    }
    result.push(page);
  }
  return result;
}

function getFilteredItems() {
  return state.items.filter(matchesFilters).sort(compareItems);
}

function matchesFilters(item) {
  if (state.categories_selected.length > 0 && !state.categories_selected.includes(item.category)) {
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
  state.lightboxNaturalWidth = 0;
  state.lightboxNaturalHeight = 0;
  elements.lightboxTitle.textContent = item.name;
  elements.lightboxImage.src = imageSource;
  elements.lightboxImage.alt = `${item.name} full preview`;
  elements.lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  centerLightboxImage();
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
  state.zoom = Math.min(5, Math.max(0.5, Number(nextZoom.toFixed(2))));
  syncLightboxCanvas();
}

function syncLightboxCanvas() {
  if (!state.lightboxNaturalWidth || !state.lightboxNaturalHeight) {
    return;
  }

  const stageWidth = Math.max(320, elements.lightboxStage.clientWidth - 48);
  const stageHeight = Math.max(240, elements.lightboxStage.clientHeight - 48);
  const fitScale = Math.min(
    stageWidth / state.lightboxNaturalWidth,
    stageHeight / state.lightboxNaturalHeight
  );
  const renderedWidth = Math.max(240, Math.round(state.lightboxNaturalWidth * fitScale * state.zoom));
  const renderedHeight = Math.max(160, Math.round(state.lightboxNaturalHeight * fitScale * state.zoom));

  elements.lightboxCanvas.style.width = `${Math.max(renderedWidth, stageWidth)}px`;
  elements.lightboxCanvas.style.height = `${Math.max(renderedHeight, stageHeight)}px`;
  elements.lightboxImage.style.width = `${renderedWidth}px`;
  elements.lightboxImage.style.height = `${renderedHeight}px`;
}

function centerLightboxImage() {
  elements.lightboxStage.scrollTop = 0;
  elements.lightboxStage.scrollLeft = 0;
}

function resetPagination() {
  state.page = 1;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ============================================================
   Cloudflare Worker Configuration
   Paste your class-hosted Cloudflare Worker URL below.
   The Worker securely holds your OpenAI API key on the server.
   ============================================================ */
const WORKER_URL = "https://openaiapi.anthonyvo567.workers.dev/";

/* LocalStorage keys for saving user state across page reloads */
const STORAGE_KEY_SELECTED = "loreal_selected_product_ids";
const STORAGE_KEY_RTL = "loreal_rtl_enabled";

/* Friendly category labels for display */
const CATEGORY_LABELS = {
  cleanser: "Cleanser",
  moisturizer: "Moisturizer & Treatment",
  haircare: "Haircare",
  makeup: "Makeup",
  "hair color": "Hair Color",
  "hair styling": "Hair Styling",
  "men's grooming": "Men's Grooming",
  suncare: "Suncare",
  fragrance: "Fragrance",
};

/* System prompt guiding the AI to stay product-aware, beauty-focused, and cite current info */
const SYSTEM_PROMPT = `You are a knowledgeable, friendly L'Oréal skincare, haircare, makeup, suncare, grooming, and fragrance advisor.
When given selected products, build a clear, personalized step-by-step routine explaining:
1. Recommended order of application (e.g., Morning / Evening or Step 1, Step 2, Step 3).
2. How each selected product fits into the routine based on its ingredients and description.
3. Practical application tips or layering notes.

For follow-up questions:
- Remember the user's selected products and prior messages in the conversation.
- Only answer questions related to the generated routine, L'Oréal brands/products, or beauty topics (skincare, haircare, makeup, hair color, styling, men's grooming, suncare, and fragrance).
- If the user asks about an unrelated topic, politely guide them back to their routine and beauty questions.
- When you include current product updates or web search findings, include clear source links or citations.`;

/* DOM references */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const resultsCount = document.getElementById("resultsCount");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearSelectedBtn = document.getElementById("clearSelectedBtn");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const chatWindow = document.getElementById("chatWindow");
const rtlToggleBtn = document.getElementById("rtlToggle");
const rtlToggleLabel = document.getElementById("rtlToggleLabel");

/* Modal DOM references */
const productModal = document.getElementById("productModal");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const modalImage = document.getElementById("modalImage");
const modalMeta = document.getElementById("modalMeta");
const modalTitle = document.getElementById("modalTitle");
const modalDescription = document.getElementById("modalDescription");
const modalSelectBtn = document.getElementById("modalSelectBtn");

/* Application state */
let allProducts = [];
let selectedProductIds = loadSavedSelection();
let conversationHistory = [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
];
let activeModalProductId = null;
let lastFocusedElement = null;
let isWaitingForAI = false;

/* ============================================================
   Initialization
   ============================================================ */
initApp();

async function initApp() {
  /* Restore RTL preference if saved */
  applySavedRtlPreference();

  /* Show initial welcome message in the chat window */
  appendChatMessage(
    "assistant",
    "Select products from the catalog above and click **Generate Routine** to get your personalized step-by-step regimen, or ask me any skincare, haircare, makeup, or fragrance question."
  );

  /* Load products from products.json */
  allProducts = await loadProducts();
  renderFilteredProducts();
  renderSelectedProducts();
}

/* ============================================================
   Product Loading, Filtering, and Search
   ============================================================ */
async function loadProducts() {
  try {
    const response = await fetch("products.json");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return Array.isArray(data.products) ? data.products : [];
  } catch (error) {
    console.error("Failed to load products.json:", error);
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Unable to load products right now. Please refresh the page.
      </div>
    `;
    return [];
  }
}

/* Combine category dropdown + real-time keyword search */
function renderFilteredProducts() {
  const selectedCategory = categoryFilter.value;
  const searchQuery = productSearch.value.trim().toLowerCase();

  const matchingProducts = allProducts.filter((product) => {
    const matchesCategory =
      selectedCategory === "all" || product.category === selectedCategory;

    const searchableText =
      `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    const matchesSearch =
      searchQuery === "" || searchableText.includes(searchQuery);

    return matchesCategory && matchesSearch;
  });

  resultsCount.textContent = `Showing ${matchingProducts.length} of ${allProducts.length} products`;
  displayProducts(matchingProducts);
}

/* Build product cards safely and attach selection + details handlers */
function displayProducts(products) {
  productsContainer.innerHTML = "";

  if (products.length === 0) {
    const emptyBox = document.createElement("div");
    emptyBox.className = "placeholder-message";

    const msg = document.createElement("p");
    msg.textContent = "No products matched your current category or search.";
    emptyBox.appendChild(msg);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "reset-filter-btn";
    resetBtn.textContent = "Reset Filters";
    resetBtn.addEventListener("click", () => {
      categoryFilter.value = "all";
      productSearch.value = "";
      renderFilteredProducts();
    });
    emptyBox.appendChild(resetBtn);

    productsContainer.appendChild(emptyBox);
    return;
  }

  products.forEach((product) => {
    const isSelected = selectedProductIds.includes(product.id);

    const card = document.createElement("article");
    card.className = `product-card${isSelected ? " selected" : ""}`;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", String(isSelected));
    card.setAttribute(
      "aria-label",
      `${product.name} by ${product.brand}. ${isSelected ? "Selected" : "Click to select"}.`
    );

    /* Top row: image + metadata/title */
    const topRow = document.createElement("div");
    topRow.className = "product-card-top";

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "product-thumb-wrap";

    const img = document.createElement("img");
    img.src = product.image;
    img.alt = product.name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      thumbWrap.classList.add("img-error");
    });

    const fallback = document.createElement("div");
    fallback.className = "product-thumb-fallback";
    fallback.innerHTML = `<i class="fa-regular fa-image" aria-hidden="true"></i><span>${escapeHtml(product.brand)}</span>`;

    thumbWrap.appendChild(img);
    thumbWrap.appendChild(fallback);

    const info = document.createElement("div");
    info.className = "product-info";

    const meta = document.createElement("p");
    meta.className = "product-meta";
    const categoryLabel = CATEGORY_LABELS[product.category] || product.category;
    meta.textContent = `${product.brand} · ${categoryLabel}`;

    const title = document.createElement("h3");
    title.textContent = product.name;

    info.appendChild(meta);
    info.appendChild(title);

    topRow.appendChild(thumbWrap);
    topRow.appendChild(info);

    /* Bottom row: Details modal trigger + selection state */
    const footer = document.createElement("div");
    footer.className = "product-card-footer";

    const detailsBtn = document.createElement("button");
    detailsBtn.type = "button";
    detailsBtn.className = "details-btn";
    detailsBtn.innerHTML = `<i class="fa-regular fa-circle-question" aria-hidden="true"></i> <span>Details</span>`;
    detailsBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      openProductModal(product.id, detailsBtn);
    });

    const indicator = document.createElement("span");
    indicator.className = "selection-indicator";
    indicator.innerHTML = isSelected
      ? `<i class="fa-solid fa-circle-check" aria-hidden="true"></i> <span>Selected</span>`
      : `<i class="fa-regular fa-circle" aria-hidden="true"></i> <span>Select</span>`;

    footer.appendChild(detailsBtn);
    footer.appendChild(indicator);

    card.appendChild(topRow);
    card.appendChild(footer);

    /* Toggle selection on click or keyboard Enter/Space */
    card.addEventListener("click", () => toggleProductSelection(product.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleProductSelection(product.id);
      }
    });

    productsContainer.appendChild(card);
  });
}

/* ============================================================
   Product Selection & localStorage Persistence
   ============================================================ */
function loadSavedSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SELECTED);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSelection() {
  try {
    localStorage.setItem(
      STORAGE_KEY_SELECTED,
      JSON.stringify(selectedProductIds)
    );
  } catch (error) {
    console.warn("Unable to save selection to localStorage:", error);
  }
}

function toggleProductSelection(productId) {
  if (selectedProductIds.includes(productId)) {
    selectedProductIds = selectedProductIds.filter((id) => id !== productId);
  } else {
    selectedProductIds = [...selectedProductIds, productId];
  }

  saveSelection();
  renderFilteredProducts();
  renderSelectedProducts();

  /* Keep modal button label in sync if modal is open for this product */
  if (activeModalProductId === productId) {
    updateModalSelectButton(productId);
  }
}

function clearAllSelections() {
  selectedProductIds = [];
  saveSelection();
  renderFilteredProducts();
  renderSelectedProducts();
}

function renderSelectedProducts() {
  selectedProductsList.innerHTML = "";

  const selectedItems = allProducts.filter((product) =>
    selectedProductIds.includes(product.id)
  );

  selectedCount.textContent = String(selectedItems.length);
  clearSelectedBtn.hidden = selectedItems.length === 0;

  if (selectedItems.length === 0) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "selected-empty";
    emptyMsg.textContent =
      "No products selected yet. Click any product card above to add it.";
    selectedProductsList.appendChild(emptyMsg);
    return;
  }

  selectedItems.forEach((product) => {
    const chip = document.createElement("div");
    chip.className = "selected-item-chip";

    const labelWrap = document.createElement("span");
    const nameEl = document.createElement("strong");
    nameEl.textContent = product.name;
    const brandEl = document.createElement("span");
    brandEl.className = "selected-item-brand";
    brandEl.textContent = ` · ${product.brand}`;

    labelWrap.appendChild(nameEl);
    labelWrap.appendChild(brandEl);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "remove-selected-btn";
    removeBtn.setAttribute("aria-label", `Remove ${product.name}`);
    removeBtn.innerHTML = `<i class="fa-solid fa-xmark" aria-hidden="true"></i>`;
    removeBtn.addEventListener("click", () => toggleProductSelection(product.id));

    chip.appendChild(labelWrap);
    chip.appendChild(removeBtn);
    selectedProductsList.appendChild(chip);
  });
}

/* ============================================================
   Accessible Product Description Modal
   ============================================================ */
function openProductModal(productId, triggerElement) {
  const product = allProducts.find((item) => item.id === productId);
  if (!product) return;

  activeModalProductId = productId;
  lastFocusedElement = triggerElement || document.activeElement;

  modalImage.src = product.image;
  modalImage.alt = product.name;
  const categoryLabel = CATEGORY_LABELS[product.category] || product.category;
  modalMeta.textContent = `${product.brand} · ${categoryLabel}`;
  modalTitle.textContent = product.name;
  modalDescription.textContent = product.description;

  updateModalSelectButton(productId);

  productModal.hidden = false;
  modalCloseBtn.focus();
}

function updateModalSelectButton(productId) {
  const isSelected = selectedProductIds.includes(productId);
  modalSelectBtn.textContent = isSelected
    ? "Remove from Routine"
    : "Add to Routine";
}

function closeProductModal() {
  productModal.hidden = true;
  activeModalProductId = null;
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

modalSelectBtn.addEventListener("click", () => {
  if (activeModalProductId !== null) {
    toggleProductSelection(activeModalProductId);
  }
});

modalCloseBtn.addEventListener("click", closeProductModal);
productModal.addEventListener("click", (event) => {
  if (event.target === productModal) {
    closeProductModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !productModal.hidden) {
    closeProductModal();
  }
});

/* ============================================================
   Cloudflare Worker AI Calls (Routine Generation + Follow-up Chat)
   ============================================================ */
async function sendToWorker(messages) {
  const endpoint = WORKER_URL.trim();

  if (!endpoint) {
    throw new Error("WORKER_NOT_CONFIGURED");
  }

  /* Send the full conversation history to the Cloudflare Worker */
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Worker responded with status ${response.status}`);
  }

  const data = await response.json();
  return extractAssistantResponse(data);
}

/* Support both standard OpenAI Chat Completions and Web Search / Responses API formats */
function extractAssistantResponse(data) {
  let content = "";
  const citations = [];

  if (data?.choices?.[0]?.message) {
    const msg = data.choices[0].message;
    content = msg.content || "";

    if (Array.isArray(msg.annotations)) {
      msg.annotations.forEach((item) => {
        const citation = item.url_citation || item;
        if (citation?.url) {
          citations.push({
            title: citation.title || citation.url,
            url: citation.url,
          });
        }
      });
    }
  } else if (typeof data?.output_text === "string") {
    content = data.output_text;
  } else if (Array.isArray(data?.output)) {
    data.output.forEach((block) => {
      if (block.type === "message" && Array.isArray(block.content)) {
        block.content.forEach((part) => {
          if (part.text) {
            content += (content ? "\n" : "") + part.text;
          }
          if (Array.isArray(part.annotations)) {
            part.annotations.forEach((ann) => {
              if (ann.url) {
                citations.push({
                  title: ann.title || ann.url,
                  url: ann.url,
                });
              }
            });
          }
        });
      }
    });
  } else if (typeof data?.reply === "string") {
    content = data.reply;
  }

  if (Array.isArray(data?.citations)) {
    data.citations.forEach((c) => {
      if (typeof c === "string") {
        citations.push({ title: c, url: c });
      } else if (c?.url) {
        citations.push({ title: c.title || c.url, url: c.url });
      }
    });
  }

  /* Deduplicate citations by URL */
  const uniqueCitations = [];
  const seenUrls = new Set();
  citations.forEach((c) => {
    if (!seenUrls.has(c.url)) {
      seenUrls.add(c.url);
      uniqueCitations.push(c);
    }
  });

  if (!content) {
    throw new Error("Empty AI response received from Cloudflare Worker.");
  }

  return { content, citations: uniqueCitations };
}

/* Generate Routine button handler */
generateRoutineBtn.addEventListener("click", async () => {
  if (isWaitingForAI) return;

  const selectedProducts = allProducts
    .filter((product) => selectedProductIds.includes(product.id))
    .map(({ name, brand, category, description }) => ({
      name,
      brand,
      category,
      description,
    }));

  if (selectedProducts.length === 0) {
    appendChatMessage(
      "system-note",
      "Please select at least one product from the catalog above before clicking Generate Routine."
    );
    return;
  }

  const userPrompt = `Please build a personalized step-by-step routine using these selected L'Oréal products:\n${JSON.stringify(
    selectedProducts,
    null,
    2
  )}`;

  appendChatMessage(
    "user",
    `Generate a routine using my ${selectedProducts.length} selected product${
      selectedProducts.length > 1 ? "s" : ""
    }: ${selectedProducts.map((p) => p.name).join(", ")}.`
  );

  conversationHistory.push({
    role: "user",
    content: userPrompt,
  });

  await runAIRequest();
});

/* Chat form submission handler for follow-up questions */
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isWaitingForAI) return;

  const message = userInput.value.trim();
  if (!message) return;

  userInput.value = "";
  appendChatMessage("user", message);

  conversationHistory.push({
    role: "user",
    content: message,
  });

  await runAIRequest();
});

async function runAIRequest() {
  setLoadingState(true);
  const loadingBubble = appendChatMessage(
    "assistant",
    "Thinking through your routine…"
  );

  try {
    const { content, citations } = await sendToWorker(conversationHistory);
    loadingBubble.remove();

    conversationHistory.push({
      role: "assistant",
      content,
    });

    appendChatMessage("assistant", content, citations);
  } catch (error) {
    loadingBubble.remove();
    /* Remove the failed user prompt from history so conversation stays clean */
    conversationHistory.pop();

    if (error.message === "WORKER_NOT_CONFIGURED") {
      appendChatMessage(
        "system-note",
        "Your Cloudflare Worker URL is not connected yet. Set `WORKER_URL` at the top of `script.js` to your Cloudflare Worker endpoint to generate routines and chat."
      );
    } else {
      console.error("Worker request error:", error);
      appendChatMessage(
        "system-note",
        "Something went wrong while reaching the advisor service. Please check your Cloudflare Worker endpoint and try again."
      );
    }
  } finally {
    setLoadingState(false);
  }
}

function setLoadingState(loading) {
  isWaitingForAI = loading;
  generateRoutineBtn.disabled = loading;
  sendBtn.disabled = loading;
  userInput.disabled = loading;
}

/* ============================================================
   Safe Chat Message Formatting (Supports Lists, Bold, Headings & Links)
   ============================================================ */
function appendChatMessage(type, text, citations = []) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${type}`;

  const roleLabel = document.createElement("div");
  roleLabel.className = "chat-role-label";
  roleLabel.textContent =
    type === "user"
      ? "You"
      : type === "system-note"
      ? "Notice"
      : "L'Oréal Advisor";

  const contentDiv = document.createElement("div");
  contentDiv.className = "chat-content";
  renderFormattedText(contentDiv, text);

  wrapper.appendChild(roleLabel);
  wrapper.appendChild(contentDiv);

  if (citations.length > 0) {
    const citationsBox = document.createElement("div");
    citationsBox.className = "chat-citations";

    const citationsTitle = document.createElement("div");
    citationsTitle.className = "chat-citations-title";
    citationsTitle.textContent = "Sources & Links";
    citationsBox.appendChild(citationsTitle);

    const list = document.createElement("ul");
    citations.forEach((citation) => {
      if (!isSafeHttpUrl(citation.url)) return;
      const li = document.createElement("li");
      const link = document.createElement("a");
      link.href = citation.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = citation.title || citation.url;
      li.appendChild(link);
      list.appendChild(li);
    });

    if (list.children.length > 0) {
      citationsBox.appendChild(list);
      wrapper.appendChild(citationsBox);
    }
  }

  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return wrapper;
}

/* Parse basic markdown safely using DOM nodes (no raw HTML injection) */
function renderFormattedText(container, text) {
  const lines = String(text).split(/\r?\n/);
  let currentList = null;

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      currentList = null;
      return;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
    const headingMatch = line.match(/^#{1,4}\s+(.*)$/);

    if (bulletMatch || numberedMatch) {
      const listTag = numberedMatch ? "ol" : "ul";
      if (!currentList || currentList.tagName.toLowerCase() !== listTag) {
        currentList = document.createElement(listTag);
        container.appendChild(currentList);
      }
      const li = document.createElement("li");
      appendInlineFormatting(li, (bulletMatch || numberedMatch)[1]);
      currentList.appendChild(li);
      return;
    }

    currentList = null;

    if (headingMatch) {
      const heading = document.createElement("h4");
      appendInlineFormatting(heading, headingMatch[1]);
      container.appendChild(heading);
      return;
    }

    const p = document.createElement("p");
    appendInlineFormatting(p, line);
    container.appendChild(p);
  });
}

/* Render **bold**, `code`, and [link](https://...) or bare https:// URLs safely */
function appendInlineFormatting(parent, text) {
  const tokenRegex =
    /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s)]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(
        document.createTextNode(text.slice(lastIndex, match.index))
      );
    }

    const token = match[0];

    if (token.startsWith("**") && token.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      parent.appendChild(strong);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.appendChild(code);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (linkMatch && isSafeHttpUrl(linkMatch[2])) {
        const a = document.createElement("a");
        a.href = linkMatch[2];
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = linkMatch[1];
        parent.appendChild(a);
      } else {
        parent.appendChild(document.createTextNode(token));
      }
    } else if (isSafeHttpUrl(token)) {
      const a = document.createElement("a");
      a.href = token;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = token;
      parent.appendChild(a);
    } else {
      parent.appendChild(document.createTextNode(token));
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* ============================================================
   RTL Language Layout Toggle
   ============================================================ */
function applySavedRtlPreference() {
  const isRtl = localStorage.getItem(STORAGE_KEY_RTL) === "true";
  setRtlMode(isRtl);
}

function setRtlMode(enabled) {
  document.documentElement.dir = enabled ? "rtl" : "ltr";
  rtlToggleBtn.setAttribute("aria-pressed", String(enabled));
  rtlToggleLabel.textContent = enabled ? "LTR Mode" : "RTL Mode";
  try {
    localStorage.setItem(STORAGE_KEY_RTL, String(enabled));
  } catch {
    /* ignore storage errors */
  }
}

rtlToggleBtn.addEventListener("click", () => {
  const currentlyRtl = document.documentElement.dir === "rtl";
  setRtlMode(!currentlyRtl);
});

/* ============================================================
   Catalog Filter Event Listeners
   ============================================================ */
categoryFilter.addEventListener("change", renderFilteredProducts);
productSearch.addEventListener("input", renderFilteredProducts);
clearSelectedBtn.addEventListener("click", clearAllSelections);

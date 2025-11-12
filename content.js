(function () {
  const PANEL_ID = "menuFiltroCampañas";
  const OPEN_BUTTON_ID = "btnAbrirFiltro";
  const DETAIL_PATTERNS = ["/phonesApp", "/macros/"];
  const STORAGE_KEYS = {
    scrollY: "lastScrollY",
    panelOpen: "filtroMenuAbierto",
    detailMode: "modoDetalleActivo",
    filters: "estadoFiltroCampanias",
  };

  const SEVERITIES = [
    { key: "red", label: "Crítico", accent: "rojo" },
    { key: "orange", label: "Alerta", accent: "naranja" },
    { key: "green", label: "OK", accent: "verde" },
    { key: "none", label: "Sin dato", accent: "gris" },
  ];

  const state = {
    isActive: false,
    isMounted: false,
    panel: null,
    openButton: null,
    panelOpen: false,
    modoDetalleActivo: false,
    controls: Object.create(null),
    severityButtons: new Map(),
    severitySelections: new Set(),
    summary: Object.create(null),
    observers: {
      dom: null,
      detalle: null,
    },
    debounceTimer: null,
    globalListenersReady: false,
  };

  function init() {
    registerGlobalListeners();
    syncDetalleFromSession();

    chrome.storage.local.get(["isActive"], (data) => {
      const active = data.isActive !== false;
      if (active) {
        activate();
      }
    });
  }

  function activate() {
    state.isActive = true;
    ensureOpenButton();
    ensurePanel();
    ensureObservers();
    applyFilters();
  }

  function deactivate() {
    if (!state.isActive && !state.isMounted) return;
    state.isActive = false;
    disconnectObservers();
    closePanel();
    destroyPanel();
    destroyOpenButton();
  }

  function ensureOpenButton() {
    if (state.openButton) return;
    const btn = document.createElement("button");
    btn.id = OPEN_BUTTON_ID;
    btn.type = "button";
    btn.className = "btn-abrir mfc-fab";
    btn.title = "Abrir filtro de campañas";
    btn.setAttribute("aria-expanded", "false");
    btn.style.backgroundImage = `url(${chrome.runtime.getURL("lupa.png")})`;
    btn.addEventListener("click", openPanel);
    document.body.appendChild(btn);
    state.openButton = btn;
    if (state.panelOpen) {
      btn.classList.add("is-hidden");
    }
  }

  function destroyOpenButton() {
    if (!state.openButton) return;
    state.openButton.removeEventListener("click", openPanel);
    state.openButton.remove();
    state.openButton = null;
  }

  function ensurePanel() {
    if (state.panel) {
      restoreOpenState();
      return;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "menu-filtro-campanias mfc-panel is-closed";
    panel.setAttribute("role", "complementary");
    panel.setAttribute("aria-label", "Filtro de campañas");
    panel.innerHTML = `
      <div class="mfc-panel__wrapper">
        <header class="mfc-panel__header">
          <div class="mfc-panel__titles">
            <span class="mfc-panel__eyebrow">Monitor de campañas</span>
            <h3 class="mfc-panel__title">Filtro de Campañas</h3>
          </div>
          <button type="button" id="mfcCloseButton" class="mfc-icon-button mfc-close" aria-label="Cerrar panel"></button>
        </header>
        <section class="mfc-summary" aria-live="polite" aria-atomic="true">
          <div class="mfc-summary__item">
            <span class="mfc-summary__label">Campañas visibles</span>
            <span class="mfc-summary__value" id="mfcSummaryCampaigns">0</span>
            <span class="mfc-summary__meta" id="mfcSummaryCampaignsMeta">de 0</span>
          </div>
          <div class="mfc-summary__item">
            <span class="mfc-summary__label">Monitoreos visibles</span>
            <span class="mfc-summary__value" id="mfcSummaryRows">0</span>
            <span class="mfc-summary__meta" id="mfcSummaryRowsMeta">de 0</span>
          </div>
          <div class="mfc-summary__item mfc-summary__item--accent">
            <span class="mfc-summary__label">Críticos</span>
            <span class="mfc-summary__value" id="mfcSummaryCritical">0</span>
            <span class="mfc-summary__meta" id="mfcSummaryFallen">Caídos: 0</span>
          </div>
        </section>
        <section class="mfc-section">
          <h4 class="mfc-section__title">Búsqueda</h4>
          <div class="mfc-field">
            <label class="mfc-field__label" for="mfcSearchCampaign">Campaña</label>
            <input id="mfcSearchCampaign" class="mfc-input" type="text" placeholder="Nombre o código de campaña">
          </div>
          <div class="mfc-field">
            <label class="mfc-field__label" for="mfcSearchMacro">Macro / tarea</label>
            <input id="mfcSearchMacro" class="mfc-input" type="text" placeholder="Texto u ID de macro">
          </div>
          <div class="mfc-field">
            <label class="mfc-field__label" for="mfcSearchKeyword">Palabra clave en filas</label>
            <input id="mfcSearchKeyword" class="mfc-input" type="text" placeholder="Buscar en cualquier columna">
          </div>
          <div class="mfc-field">
            <label class="mfc-field__label" for="mfcSearchIMEI">Últimos dígitos IMEI</label>
            <input id="mfcSearchIMEI" class="mfc-input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="15" placeholder="Ej: 1234">
          </div>
        </section>
        <section class="mfc-section">
          <h4 class="mfc-section__title">Estado</h4>
          <div class="mfc-chip-group" id="mfcSeverityGroup" role="group" aria-label="Estado de monitoreo"></div>
          <label class="mfc-checkbox">
            <input type="checkbox" id="mfcOnlyFallen">
            <span>Solo caídos</span>
          </label>
        </section>
        <section class="mfc-section">
          <h4 class="mfc-section__title">Último evento</h4>
          <div class="mfc-range">
            <input type="range" min="0" max="720" step="5" value="0" id="mfcLastEventRange">
            <div class="mfc-range__values">
              <span>0</span>
              <span id="mfcLastEventLabel">Todos</span>
              <span>720+</span>
            </div>
          </div>
        </section>
        <footer class="mfc-footer">
          <button type="button" id="mfcResetButton" class="mfc-button">Limpiar filtros</button>
        </footer>
      </div>
    `;

    document.body.appendChild(panel);
    state.panel = panel;
    state.isMounted = true;

    cacheControls();
    buildSeverityChips();
    attachControlListeners();
    restoreState();
    restoreOpenState();
  }

  function cacheControls() {
    if (!state.panel) return;
    state.controls = {
      searchCampaign: state.panel.querySelector("#mfcSearchCampaign"),
      searchMacro: state.panel.querySelector("#mfcSearchMacro"),
      searchKeyword: state.panel.querySelector("#mfcSearchKeyword"),
      searchIMEI: state.panel.querySelector("#mfcSearchIMEI"),
      onlyFallen: state.panel.querySelector("#mfcOnlyFallen"),
      lastEventRange: state.panel.querySelector("#mfcLastEventRange"),
      lastEventLabel: state.panel.querySelector("#mfcLastEventLabel"),
      resetButton: state.panel.querySelector("#mfcResetButton"),
      closeButton: state.panel.querySelector("#mfcCloseButton"),
    };

    state.summary = {
      campaignsValue: state.panel.querySelector("#mfcSummaryCampaigns"),
      campaignsMeta: state.panel.querySelector("#mfcSummaryCampaignsMeta"),
      rowsValue: state.panel.querySelector("#mfcSummaryRows"),
      rowsMeta: state.panel.querySelector("#mfcSummaryRowsMeta"),
      criticalValue: state.panel.querySelector("#mfcSummaryCritical"),
      fallenMeta: state.panel.querySelector("#mfcSummaryFallen"),
    };
  }

  function buildSeverityChips() {
    const container = state.panel?.querySelector("#mfcSeverityGroup");
    if (!container) return;
    container.innerHTML = "";
    state.severityButtons.clear();

    SEVERITIES.forEach((option) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `mfc-chip mfc-chip--${option.accent}`;
      btn.dataset.key = option.key;
      btn.innerHTML = `<span class="mfc-chip__dot"></span>${option.label}`;
      btn.addEventListener("click", () => toggleSeverity(option.key));
      container.appendChild(btn);
      state.severityButtons.set(option.key, btn);
    });
  }

  function attachControlListeners() {
    const { searchCampaign, searchMacro, searchKeyword, searchIMEI, onlyFallen, lastEventRange, resetButton, closeButton } = state.controls;
    if (!searchCampaign) return;

    [searchCampaign, searchMacro, searchKeyword].forEach((input) => {
      input.addEventListener("input", () => scheduleFilters());
    });

    searchIMEI.addEventListener("input", () => {
      const sanitized = searchIMEI.value.replace(/\D/g, "");
      searchIMEI.value = sanitized.slice(0, 15);
      scheduleFilters();
    });

    onlyFallen.addEventListener("change", () => scheduleFilters());

    lastEventRange.addEventListener("input", () => {
      updateRangeLabel();
    });
    lastEventRange.addEventListener("change", () => scheduleFilters());

    resetButton.addEventListener("click", resetFilters);
    closeButton.addEventListener("click", closePanel);
  }

  function toggleSeverity(key) {
    const btn = state.severityButtons.get(key);
    if (!btn) return;
    if (state.severitySelections.has(key)) {
      state.severitySelections.delete(key);
      btn.classList.remove("is-active");
    } else {
      state.severitySelections.add(key);
      btn.classList.add("is-active");
    }
    scheduleFilters();
  }

  function resetFilters() {
    if (!state.controls.searchCampaign) return;
    state.controls.searchCampaign.value = "";
    state.controls.searchMacro.value = "";
    state.controls.searchKeyword.value = "";
    state.controls.searchIMEI.value = "";
    state.controls.onlyFallen.checked = false;
    state.controls.lastEventRange.value = "0";
    updateRangeLabel();

    state.severitySelections.clear();
    state.severityButtons.forEach((btn) => btn.classList.remove("is-active"));
    scheduleFilters({ immediate: true });
  }

  function updateRangeLabel() {
    if (!state.controls.lastEventRange || !state.controls.lastEventLabel) return;
    const value = Number(state.controls.lastEventRange.value);
    state.controls.lastEventLabel.textContent = value > 0 ? `≥ ${value} min` : "Todos";
  }

  function scheduleFilters(options = {}) {
    if (!state.isActive) return;
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    const delay = options.immediate ? 0 : 150;
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      applyFilters();
    }, delay);
  }

  function ensureObservers() {
    if (!state.observers.dom) {
      state.observers.dom = new MutationObserver(() => {
        if (!state.isActive) return;
        if (state.modoDetalleActivo || isDetalleVisible()) return;
        if (state.debounceTimer) clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(() => {
          state.debounceTimer = null;
          applyFilters();
        }, 200);
      });
      state.observers.dom.observe(document.body, { childList: true, subtree: true });
    }

    if (!state.observers.detalle) {
      state.observers.detalle = new MutationObserver(() => {
        if (!isDetalleVisible() && state.modoDetalleActivo) {
          setModoDetalle(false);
          scheduleFilters({ immediate: true });
        }
      });
      state.observers.detalle.observe(document.body, { childList: true, subtree: true });
    }
  }

  function disconnectObservers() {
    if (state.observers.dom) {
      state.observers.dom.disconnect();
      state.observers.dom = null;
    }
    if (state.observers.detalle) {
      state.observers.detalle.disconnect();
      state.observers.detalle = null;
    }
  }

  function collectFilters() {
    const normalize = (value) => normalizeText(value || "");
    const searchCampaign = normalize(state.controls.searchCampaign?.value);
    const searchMacro = normalize(state.controls.searchMacro?.value);
    const keyword = normalize(state.controls.searchKeyword?.value);

    const rawIMEI = (state.controls.searchIMEI?.value || "").trim();
    const digits = rawIMEI.replace(/\D/g, "");
    const imeiKey = digits ? digits.slice(-4) : "";

    const onlyFallen = Boolean(state.controls.onlyFallen?.checked);
    const minLastEvent = Number(state.controls.lastEventRange?.value || 0);

    return {
      searchCampaign,
      searchMacro,
      keyword,
      imeiKey,
      selectedSeverities: new Set(state.severitySelections),
      onlyFallen,
      minLastEvent,
    };
  }

  function applyFilters() {
    if (!state.isActive || !state.panel) return;
    if (state.modoDetalleActivo || isDetalleVisible()) return;

    const filters = collectFilters();
    const stats = {
      campaignsTotal: 0,
      campaignsVisible: 0,
      rowsTotal: 0,
      rowsVisible: 0,
      criticalVisible: 0,
      fallenVisible: 0,
    };

    document.querySelectorAll("table").forEach((table) => {
      if (table.closest(".modal, .popup, .detalle")) return;

      const rows = Array.from(table.querySelectorAll("tr")).filter(
        (row) => row.querySelectorAll("td").length > 0
      );
      if (!rows.length) return;

      stats.campaignsTotal += 1;
      stats.rowsTotal += rows.length;

      const campaignBlock = table.closest("div") || table;
      const h2 = campaignBlock.querySelector ? campaignBlock.querySelector("h2") : null;
      const campaignName = normalizeText(h2 ? h2.innerText : "");

      const matchesCampaign = !filters.searchCampaign || campaignName.includes(filters.searchCampaign);

      let visibleRows = 0;

      rows.forEach((row) => {
        const { color, caido, ultimoEventoMin, metricCell, lastEventCell } = updateRowMetadata(row);

        row.querySelectorAll("td").forEach((td) => {
          td.classList.remove("resaltar-rojo", "resaltar-naranja", "resaltar-caido", "resaltar-verde");
        });

        if (!matchesCampaign) {
          row.style.display = "none";
          return;
        }

        const matchesSeverity =
          !filters.selectedSeverities.size || filters.selectedSeverities.has(color || "none");
        const matchesCaidos = !filters.onlyFallen || caido;
        const matchesLastEvent =
          filters.minLastEvent <= 0 || (ultimoEventoMin >= filters.minLastEvent && ultimoEventoMin !== -1);
        const matchesMacro =
          !filters.searchMacro || rowMatchesMacro(row, filters.searchMacro);
        const matchesKeyword =
          !filters.keyword || normalizeText(row.innerText).includes(filters.keyword);
        const matchesIMEI =
          !filters.imeiKey || rowMatchesIMEI(row, filters.imeiKey);

        const showRow =
          matchesSeverity &&
          matchesCaidos &&
          matchesLastEvent &&
          matchesMacro &&
          matchesKeyword &&
          matchesIMEI;

        if (showRow) {
          row.style.display = "";
          visibleRows += 1;
          stats.rowsVisible += 1;
          if (color === "red") stats.criticalVisible += 1;
          if (caido) stats.fallenVisible += 1;

          if (color === "red" && metricCell) metricCell.classList.add("resaltar-rojo");
          if (color === "orange" && metricCell) metricCell.classList.add("resaltar-naranja");
          if (color === "green" && metricCell) metricCell.classList.add("resaltar-verde");
          if (caido && lastEventCell) lastEventCell.classList.add("resaltar-caido");
        } else {
          row.style.display = "none";
        }
      });

      const showCampaign = matchesCampaign && visibleRows > 0;
      campaignBlock.style.display = showCampaign ? "" : "none";
      if (showCampaign) {
        stats.campaignsVisible += 1;
      }
    });

    updateSummary(stats);
    guardarEstado();
    restaurarScroll();
  }

  function updateRowMetadata(row) {
    const tds = row.querySelectorAll("td");
    if (!tds.length) {
      row.dataset.color = "none";
      row.dataset.caido = "false";
      row.dataset.ultimoEventoMin = "";
      return {
        color: "none",
        caido: false,
        ultimoEventoMin: -1,
        metricCell: null,
        lastEventCell: null,
      };
    }

    const metricCell = tds[tds.length - 2] || null;
    const lastEventCell = tds.length >= 5 ? tds[4] : null;

    let color = "none";
    if (metricCell) {
      const status = metricCell.querySelector("b.error, b.warning, b.orange, b.success");
      if (status) {
        const cls = (status.className || "").toLowerCase();
        if (cls.includes("error")) color = "red";
        else if (cls.includes("warning") || cls.includes("orange")) color = "orange";
        else if (cls.includes("success")) color = "green";
      } else if (metricCell.innerText) {
        const pctMatch = metricCell.innerText.match(/(\d+)\s*%/);
        if (pctMatch) {
          const pct = parseInt(pctMatch[1], 10);
          if (pct >= 80) color = "red";
          else if (pct >= 50) color = "orange";
        }
      }
    }

    const repCell = tds[3];
    const repMatch = repCell ? String(repCell.innerText || "").match(/\d+/) : null;
    const repetition = repMatch ? parseInt(repMatch[0], 10) : 1;
    const ultimoEventoMin = parseTiempoToMinutos(lastEventCell ? lastEventCell.innerText : "");
    const threshold = getThresholdMinutes(repetition);
    const caido = ultimoEventoMin !== -1 && ultimoEventoMin >= threshold;

    row.dataset.color = color;
    row.dataset.caido = caido ? "true" : "false";
    row.dataset.ultimoEventoMin = ultimoEventoMin >= 0 ? String(ultimoEventoMin) : "";

    return { color, caido, ultimoEventoMin, metricCell, lastEventCell };
  }

  function updateSummary(stats) {
    if (!state.summary.campaignsValue) return;
    state.summary.campaignsValue.textContent = String(stats.campaignsVisible);
    state.summary.campaignsMeta.textContent = `de ${stats.campaignsTotal}`;
    state.summary.rowsValue.textContent = String(stats.rowsVisible);
    state.summary.rowsMeta.textContent = `de ${stats.rowsTotal}`;
    state.summary.criticalValue.textContent = String(stats.criticalVisible);
    state.summary.fallenMeta.textContent = `Caídos: ${stats.fallenVisible}`;
  }

  function guardarEstado() {
    if (!state.controls.searchCampaign) return;
    const payload = {
      searchCamp: state.controls.searchCampaign.value,
      searchMacro: state.controls.searchMacro.value,
      searchKeyword: state.controls.searchKeyword.value,
      searchIMEI: state.controls.searchIMEI.value,
      onlyFallen: state.controls.onlyFallen.checked,
      lastEvent: Number(state.controls.lastEventRange.value || 0),
      severities: Array.from(state.severitySelections),
    };
    try {
      sessionStorage.setItem(STORAGE_KEYS.filters, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  function restoreState() {
    if (!state.controls.searchCampaign) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.filters);
      if (!raw) {
        updateRangeLabel();
        applyFilters();
        return;
      }
      const data = JSON.parse(raw);
      state.controls.searchCampaign.value = data.searchCamp || "";
      state.controls.searchMacro.value = data.searchMacro || "";
      state.controls.searchKeyword.value = data.searchKeyword || "";
      state.controls.searchIMEI.value = data.searchIMEI || "";
      state.controls.onlyFallen.checked = Boolean(data.onlyFallen);
      state.controls.lastEventRange.value = String(data.lastEvent || 0);
      updateRangeLabel();

      state.severitySelections.clear();
      state.severityButtons.forEach((btn) => btn.classList.remove("is-active"));
      if (Array.isArray(data.severities)) {
        data.severities.forEach((key) => {
          if (state.severityButtons.has(key)) {
            state.severitySelections.add(key);
            state.severityButtons.get(key).classList.add("is-active");
          }
        });
      }
    } catch {
      state.severitySelections.clear();
      state.severityButtons.forEach((btn) => btn.classList.remove("is-active"));
    }
    applyFilters();
  }

  function restoreOpenState() {
    let stored = null;
    try {
      stored = sessionStorage.getItem(STORAGE_KEYS.panelOpen);
    } catch {
      stored = null;
    }
    if (stored === "1" || stored === null) {
      openPanel();
    } else {
      closePanel();
    }
  }

  function openPanel() {
    if (!state.panel) return;
    state.panel.classList.add("is-open");
    state.panel.classList.remove("is-closed");
    state.panelOpen = true;
    try {
      sessionStorage.setItem(STORAGE_KEYS.panelOpen, "1");
    } catch {
      // ignore
    }
    if (state.openButton) {
      state.openButton.classList.add("is-hidden");
      state.openButton.setAttribute("aria-expanded", "true");
    }
  }

  function closePanel() {
    if (!state.panel) return;
    state.panel.classList.remove("is-open");
    state.panel.classList.add("is-closed");
    state.panelOpen = false;
    try {
      sessionStorage.setItem(STORAGE_KEYS.panelOpen, "0");
    } catch {
      // ignore
    }
    if (state.openButton) {
      state.openButton.classList.remove("is-hidden");
      state.openButton.setAttribute("aria-expanded", "false");
    }
  }

  function destroyPanel() {
    if (!state.panel) return;
    state.panel.remove();
    state.panel = null;
    state.controls = Object.create(null);
    state.summary = Object.create(null);
    state.severityButtons.clear();
    state.isMounted = false;
    state.panelOpen = false;
  }

  function registerGlobalListeners() {
    if (state.globalListenersReady) return;
    state.globalListenersReady = true;

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("load", restaurarScroll);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("keydown", handleKeyDown, true);
  }

  function handleBeforeUnload() {
    try {
      sessionStorage.setItem(STORAGE_KEYS.scrollY, String(window.scrollY));
    } catch {
      // ignore
    }
  }

  function restaurarScroll() {
    if (state.modoDetalleActivo || isDetalleVisible()) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.scrollY);
      const y = parseInt(raw, 10);
      if (!isNaN(y)) {
        setTimeout(() => window.scrollTo(0, y), 200);
        setTimeout(() => window.scrollTo(0, y), 800);
      }
    } catch {
      // ignore
    }
  }

  function handleDocumentClick(event) {
    const target = event.target;
    if (!target) return;

    if (state.panelOpen && state.panel) {
      if (
        !state.panel.contains(target) &&
        !(state.openButton && state.openButton.contains(target))
      ) {
        closePanel();
      }
    }

    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href") || "";
    const onclick = anchor.getAttribute("onclick") || "";
    const opensDetalle = DETAIL_PATTERNS.some(
      (pattern) => href.includes(pattern) || onclick.includes(pattern)
    );
    if (opensDetalle) {
      setModoDetalle(true);
      closePanel();
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && state.panelOpen) {
      closePanel();
    }
  }

  function setModoDetalle(value) {
    state.modoDetalleActivo = Boolean(value);
    try {
      if (state.modoDetalleActivo) {
        sessionStorage.setItem(STORAGE_KEYS.detailMode, "1");
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.detailMode);
      }
    } catch {
      // ignore
    }
  }

  function syncDetalleFromSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.detailMode);
      state.modoDetalleActivo = raw === "1";
    } catch {
      state.modoDetalleActivo = false;
    }
  }

  function isDetalleVisible() {
    return Boolean(document.querySelector(".modal, .popup, .detalle"));
  }

  function rowMatchesMacro(row, normalizedMacro) {
    const anchors = Array.from(row.querySelectorAll("a"));
    if (
      anchors.some((anchor) => {
        const text = normalizeText(anchor.innerText || "");
        const href = normalizeText(anchor.getAttribute("href") || "");
        const onclick = normalizeText(anchor.getAttribute("onclick") || "");
        return (
          text.includes(normalizedMacro) ||
          href.includes(normalizedMacro) ||
          onclick.includes(normalizedMacro)
        );
      })
    ) {
      return true;
    }
    return normalizeText(row.innerText || "").includes(normalizedMacro);
  }

  function rowMatchesIMEI(row, imeiKey) {
    if (!imeiKey) return true;
    const anchor =
      row.querySelector("td a[href*='phonesApp']") ||
      row.querySelector("td a") ||
      null;
    let value = "";
    if (anchor && anchor.innerText) {
      value = anchor.innerText.trim();
    } else {
      const firstCell = row.querySelector("td");
      value = firstCell ? firstCell.innerText.trim() : "";
    }
    if (!value) return false;
    const digits = value.replace(/\D/g, "");
    if (!digits) return false;
    return digits.slice(-imeiKey.length) === imeiKey;
  }

  function normalizeText(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parseTiempoToMinutos(txt) {
    const low = String(txt || "").toUpperCase().trim();
    if (!low) return -1;
    if (low.includes("99 D") && low.includes("99 H") && low.includes("99 M")) return -1;
    let d = 0,
      h = 0,
      m = 0;
    const md = low.match(/(\d+)\s*D/);
    const mh = low.match(/(\d+)\s*H/);
    const mm = low.match(/(\d+)\s*M/);
    if (md) d = parseInt(md[1], 10);
    if (mh) h = parseInt(mh[1], 10);
    if (mm) m = parseInt(mm[1], 10);
    return d * 1440 + h * 60 + m;
  }

  function getThresholdMinutes(rep) {
    const value = Number(rep) || 1;
    if (value <= 1) return Math.max(15, value * 5);
    if (value <= 5) return value * 10;
    if (value <= 30) return value * 6;
    if (value <= 120) return value * 3;
    return value * 2;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.action === "applyToggle") {
      if (msg.value) {
        activate();
      } else {
        deactivate();
      }
      if (typeof sendResponse === "function") {
        sendResponse({ status: "ok" });
      }
    }
  });

  init();
})();

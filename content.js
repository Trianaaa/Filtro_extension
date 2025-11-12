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
    isApplyingFilters: false, // Flag para evitar bucles infinitos
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
    // Aplicar filtros después de que el panel esté completamente inicializado
    setTimeout(() => {
      if (state.isActive && state.panel && state.controls.searchCampaign) {
        applyFilters();
      }
    }, 200);
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
            <label class="mfc-field__label" for="mfcSearchMacro">Macros</label>
            <input id="mfcSearchMacro" class="mfc-input" type="text" placeholder="Número o nombre de macro">
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
          <button type="button" id="mfcResetButton" class="mfc-button"><span>Limpiar filtros</span></button>
        </footer>
      </div>
    `;

    document.body.appendChild(panel);
    state.panel = panel;
    state.isMounted = true;

    // Cachear controles inmediatamente
    cacheControls();
    
    // Verificar que los controles se encontraron
    if (!state.controls.searchCampaign) {
      console.error("[Filtro Campañas] Error: No se encontraron los controles del panel");
      // Intentar nuevamente después de un pequeño delay
      setTimeout(() => {
        cacheControls();
        if (state.controls.searchCampaign) {
          buildSeverityChips();
          attachControlListeners();
          restoreState();
          restoreOpenState();
        }
      }, 100);
    } else {
      buildSeverityChips();
      attachControlListeners();
      restoreState();
      restoreOpenState();
    }
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
      btn.innerHTML = `<span class="mfc-chip__dot"></span><span>${option.label}</span>`;
      btn.addEventListener("click", () => toggleSeverity(option.key));
      container.appendChild(btn);
      state.severityButtons.set(option.key, btn);
    });
  }

  function attachControlListeners() {
    const { searchCampaign, searchMacro, searchKeyword, searchIMEI, onlyFallen, lastEventRange, resetButton, closeButton } = state.controls;
    if (!searchCampaign || !state.isActive) {
      console.warn("[Filtro Campañas] No se pueden adjuntar listeners: controles no disponibles");
      return;
    }

    try {
      // Inputs de búsqueda
      if (searchCampaign) {
        searchCampaign.addEventListener("input", () => {
          scheduleFilters();
        }, { passive: true });
      }

      if (searchMacro) {
        searchMacro.addEventListener("input", () => {
          scheduleFilters();
        }, { passive: true });
      }

      if (searchKeyword) {
        searchKeyword.addEventListener("input", () => {
          scheduleFilters();
        }, { passive: true });
      }

      if (searchIMEI) {
        searchIMEI.addEventListener("input", () => {
          const sanitized = searchIMEI.value.replace(/\D/g, "");
          searchIMEI.value = sanitized.slice(0, 15);
          scheduleFilters();
        }, { passive: true });
      }

      if (onlyFallen) {
        onlyFallen.addEventListener("change", () => {
          scheduleFilters();
        }, { passive: true });
      }

      if (lastEventRange) {
        lastEventRange.addEventListener("input", () => {
          updateRangeLabel();
        }, { passive: true });
        lastEventRange.addEventListener("change", () => {
          scheduleFilters();
        }, { passive: true });
      }

      if (resetButton) {
        resetButton.addEventListener("click", (e) => {
          e.preventDefault();
          resetFilters();
        });
      }
      
      if (closeButton) {
        closeButton.addEventListener("click", (e) => {
          e.preventDefault();
          closePanel();
        });
      }
    } catch (error) {
      console.error("[Filtro Campañas] Error adjuntando listeners:", error);
    }
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
    if (!state.isActive || !state.panel) return;
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
      state.debounceTimer = null;
    }
    const delay = options.immediate ? 0 : 150;
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      if (state.isActive && state.panel) {
        applyFilters();
      }
    }, delay);
  }

  function ensureObservers() {
    if (!state.observers.dom) {
      state.observers.dom = new MutationObserver((mutations) => {
        // No hacer nada si estamos aplicando filtros para evitar bucles
        if (state.isApplyingFilters) return;
        if (!state.isActive || !state.panel) return;
        if (state.modoDetalleActivo || isDetalleVisible()) return;
        
        // Solo reaccionar a cambios relevantes, ignorar cambios en el panel mismo
        const hasRelevantChanges = mutations.some((mutation) => {
          if (!mutation.target) return false;
          // Ignorar cambios dentro del panel
          if (mutation.target.closest && mutation.target.closest(".mfc-panel")) return false;
          // Ignorar cambios en modales/popups
          if (mutation.target.closest && mutation.target.closest(".modal, .popup, .detalle")) return false;
          // Ignorar cambios que sean solo de atributos de estilo (display, etc.)
          if (mutation.type === "attributes" && mutation.attributeName === "style") return false;
          // Solo procesar si hay nodos agregados que sean tablas o contengan tablas
          if (mutation.addedNodes && mutation.addedNodes.length > 0) {
            return Array.from(mutation.addedNodes).some((node) => {
              if (node.nodeType !== 1) return false; // Solo elementos
              if (node.tagName === "TABLE") return true;
              if (node.querySelector && node.querySelector("table")) return true;
              // Verificar si es un contenedor que podría tener tablas
              if (node.classList && node.classList.length > 0) {
                // Permitir que se procese si parece ser un contenedor de contenido
                return true;
              }
              return false;
            });
          }
          return false;
        });
        
        if (!hasRelevantChanges) return;
        
        if (state.debounceTimer) clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(() => {
          state.debounceTimer = null;
          if (state.isActive && state.panel && !state.isApplyingFilters) {
            applyFilters();
          }
        }, 500); // Aumentar el delay para evitar ejecuciones muy frecuentes
      });
      // Observar solo cambios en childList, no en atributos para mejor rendimiento
      state.observers.dom.observe(document.body, { 
        childList: true, 
        subtree: true,
        // No observar cambios en atributos para evitar bucles infinitos
        attributes: false,
        characterData: false,
        attributeOldValue: false,
        characterDataOldValue: false
      });
    }

    if (!state.observers.detalle) {
      state.observers.detalle = new MutationObserver(() => {
        if (!isDetalleVisible() && state.modoDetalleActivo) {
          setModoDetalle(false);
          scheduleFilters({ immediate: true });
        }
      });
      state.observers.detalle.observe(document.body, { 
        childList: true, 
        subtree: true,
        attributes: false,
        characterData: false
      });
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
    if (!state.controls || !state.isActive) {
      return {
        searchCampaign: "",
        searchMacro: "",
        keyword: "",
        imeiKey: "",
        selectedSeverities: new Set(),
        onlyFallen: false,
        minLastEvent: 0,
      };
    }

    const normalize = (value) => {
      const normalized = normalizeText(value || "");
      return normalized; // Ya está normalizado con trim y espacios
    };
    const searchCampaign = normalize(state.controls.searchCampaign?.value || "");
    const searchMacro = normalize(state.controls.searchMacro?.value || "");
    const keyword = normalize(state.controls.searchKeyword?.value || "");

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
    if (state.isApplyingFilters) return; // Evitar ejecuciones simultáneas

    // Marcar que estamos aplicando filtros
    state.isApplyingFilters = true;

    try {
      const filters = collectFilters();
      const stats = {
        campaignsTotal: 0,
        campaignsVisible: 0,
        rowsTotal: 0,
        rowsVisible: 0,
        criticalVisible: 0,
        fallenVisible: 0,
      };

      const tables = document.querySelectorAll("table");
      if (!tables.length) {
        updateSummary(stats);
        state.isApplyingFilters = false;
        return;
      }

      tables.forEach((table) => {
        if (!table || table.closest(".modal, .popup, .detalle, .mfc-panel")) return;

        const rows = Array.from(table.querySelectorAll("tr")).filter(
          (row) => row && row.querySelectorAll("td").length > 0
        );
        if (!rows.length) return;

        stats.campaignsTotal += 1;
        stats.rowsTotal += rows.length;

        const campaignBlock = table.closest("div") || table.parentElement || table;
        if (!campaignBlock) return;
        
        const h2 = campaignBlock.querySelector ? campaignBlock.querySelector("h2") : null;
        const campaignName = normalizeText(h2 ? h2.innerText || h2.textContent : "");
        
        // Obtener el texto completo del bloque de campaña para buscar macros
        const campaignBlockText = normalizeText(campaignBlock.innerText || campaignBlock.textContent || "");
        
        // Buscar enlaces de macros en el bloque de campaña
        // Buscar todos los enlaces que podrían ser macros (incluyendo los de la tabla)
        const macroAnchors = campaignBlock.querySelectorAll ? 
          Array.from(campaignBlock.querySelectorAll("a")) : [];

        const matchesCampaign = !filters.searchCampaign || campaignName.includes(filters.searchCampaign);

        let visibleRows = 0;

        rows.forEach((row) => {
          if (!row) return;
          
          const { color, caido, ultimoEventoMin, metricCell, lastEventCell } = updateRowMetadata(row);

          const tds = row.querySelectorAll("td");
          tds.forEach((td) => {
            if (td) {
              td.classList.remove("resaltar-rojo", "resaltar-naranja", "resaltar-caido", "resaltar-verde");
            }
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
          
          // Verificar si la macro coincide (el término ya está normalizado en collectFilters)
          // Buscar en los enlaces de macros del bloque de campaña Y en las filas
          const matchesMacro = !filters.searchMacro || 
            macroAnchors.some((a) => {
              const txt = normalizeText(a.innerText || "");
              const hrefOrOnclick = normalizeText(
                a.getAttribute("href") || a.getAttribute("onclick") || ""
              );
              return txt.includes(filters.searchMacro) || hrefOrOnclick.includes(filters.searchMacro);
            }) ||
            campaignBlockText.includes(filters.searchMacro) ||
            rowMatchesMacro(row, filters.searchMacro);
            
          const matchesKeyword =
            !filters.keyword || normalizeText(row.innerText || row.textContent || "").includes(filters.keyword);
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

            // Aplicar resaltados directamente a las celdas
            if (color === "red" && metricCell) {
              metricCell.classList.add("resaltar-rojo");
            }
            if (color === "orange" && metricCell) {
              metricCell.classList.add("resaltar-naranja");
            }
            if (color === "green" && metricCell) {
              metricCell.classList.add("resaltar-verde");
            }
            if (caido && lastEventCell) {
              lastEventCell.classList.add("resaltar-caido");
            }
          } else {
            row.style.display = "none";
          }
        });

        const showCampaign = matchesCampaign && visibleRows > 0;
        if (campaignBlock.style) {
          campaignBlock.style.display = showCampaign ? "" : "none";
        }
        if (showCampaign) {
          stats.campaignsVisible += 1;
        }
      });

      updateSummary(stats);
      guardarEstado();
      // No restaurar scroll automáticamente - permite al usuario hacer scroll libremente
    } catch (error) {
      console.error("[Filtro Campañas] Error aplicando filtros:", error);
    } finally {
      // Siempre desmarcar el flag, incluso si hay un error
      state.isApplyingFilters = false;
    }
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
    
    // Buscar la celda de último evento de manera más robusta
    // Primero intentar el índice fijo (más común: índice 4)
    let lastEventCell = tds.length >= 5 ? tds[4] : null;
    
    // Verificar si la celda encontrada tiene contenido válido de tiempo
    const isValidTimeCell = (cell) => {
      if (!cell || !cell.innerText) return false;
      const text = cell.innerText.trim().toUpperCase();
      if (!text) return false;
      // Buscar patrones de tiempo como "45 M", "1 H", "0 D 1 H 45 M", etc.
      // O simplemente números que podrían ser minutos
      return text.match(/\d+\s*[DHM]/) !== null || 
             text.match(/\d+\s*(D|H|M)/) !== null ||
             (text.match(/^\d+$/) !== null && parseInt(text, 10) < 10000);
    };
    
    // Si no se encontró una celda válida en el índice 4, buscar en todas las celdas
    if (!isValidTimeCell(lastEventCell)) {
      // Buscar en todas las celdas por contenido de tiempo (incluyendo todas las posiciones)
      let bestMatch = null;
      let bestParsedTime = -1;
      
      for (let i = 0; i < tds.length; i++) {
        // Saltar la celda de métrica (penúltima)
        if (i === tds.length - 2) continue;
        
        const cell = tds[i];
        if (!cell || !cell.innerText) continue;
        
        // Intentar parsear el tiempo de esta celda
        const parsedTime = parseTiempoToMinutos(cell.innerText);
        if (parsedTime >= 0) {
          // Si encontramos un tiempo válido, usar esta celda
          // Preferir celdas que tengan formato de tiempo explícito (D, H, M)
          const cellText = cell.innerText.trim().toUpperCase();
          const hasTimeFormat = cellText.match(/\d+\s*[DHM]/) !== null;
          
          if (!bestMatch || (hasTimeFormat && bestParsedTime < parsedTime)) {
            bestMatch = cell;
            bestParsedTime = parsedTime;
          }
        }
      }
      
      if (bestMatch) {
        lastEventCell = bestMatch;
      }
    }
    
    // Si aún no se encontró, intentar las últimas columnas (excluyendo la métrica)
    if (!lastEventCell || !lastEventCell.innerText || !lastEventCell.innerText.trim()) {
      // Buscar en las últimas 3 columnas (excepto la métrica)
      for (let i = Math.max(0, tds.length - 4); i < tds.length; i++) {
        if (i === tds.length - 2) continue; // Saltar la celda de métrica
        const cell = tds[i];
        if (cell && cell.innerText && cell.innerText.trim()) {
          // Si la celda tiene contenido, intentar usarla
          const parsedTime = parseTiempoToMinutos(cell.innerText);
          // Incluso si no se puede parsear, si tiene contenido y está en las últimas columnas, podría ser la celda de tiempo
          if (parsedTime >= 0 || (i >= tds.length - 3 && cell.innerText.trim())) {
            lastEventCell = cell;
            break;
          }
        }
      }
    }

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

    // Buscar la celda de repetición de manera más robusta
    let repCell = tds[3] || null;
    // Si no se encontró en el índice 3, buscar en todas las celdas
    if (!repCell || !repCell.innerText || !repCell.innerText.trim()) {
      for (let i = 0; i < Math.min(tds.length, 5); i++) {
        const cell = tds[i];
        if (cell && cell.innerText && cell.innerText.match(/^\d+$/)) {
          repCell = cell;
          break;
        }
      }
    }
    
    const repMatch = repCell ? String(repCell.innerText || "").match(/\d+/) : null;
    const repetition = repMatch ? parseInt(repMatch[0], 10) : 1;
    
    // Intentar parsear el tiempo de la celda de último evento
    let ultimoEventoMin = -1;
    if (lastEventCell && lastEventCell.innerText) {
      const cellText = lastEventCell.innerText.trim();
      ultimoEventoMin = parseTiempoToMinutos(cellText);
      
      // Si no se pudo parsear, intentar parsear de nuevo limpiando el texto
      // Esto ayuda con formatos como "0 D - 0 H - 6 M" que tienen guiones
      if (ultimoEventoMin === -1 && cellText) {
        // Limpiar el texto: remover guiones y espacios extra, pero mantener D, H, M
        const cleanedText = cellText.replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();
        ultimoEventoMin = parseTiempoToMinutos(cleanedText);
      }
      
      // Si aún no se pudo parsear, buscar cualquier patrón de tiempo en todas las celdas
      if (ultimoEventoMin === -1) {
        for (let i = 0; i < tds.length; i++) {
          if (i === tds.length - 2) continue; // Saltar la celda de métrica
          const cell = tds[i];
          if (cell && cell.innerText) {
            const testText = cell.innerText.trim();
            const testTime = parseTiempoToMinutos(testText);
            if (testTime >= 0) {
              ultimoEventoMin = testTime;
              lastEventCell = cell; // Actualizar la celda de último evento
              break;
            }
          }
        }
      }
    }
    
    const threshold = getThresholdMinutes(repetition);
    
    // Determinar si está caído
    // REGLA PRINCIPAL: Si lleva más de 30 minutos sin medir, se considera caído
    // Esto es independiente del threshold basado en la repetición
    let caido = false;
    
    if (ultimoEventoMin !== -1) {
      // Si se puede parsear el tiempo, verificar si es >= 30 minutos
      if (ultimoEventoMin >= 30) {
        caido = true;
      }
      // También verificar si supera el threshold tradicional (por compatibilidad)
      else if (ultimoEventoMin >= threshold) {
        caido = true;
      }
    }
    // Si no se pudo parsear el tiempo pero hay indicadores claros de error/caído:
    else if (lastEventCell) {
      const cellText = lastEventCell.innerText ? lastEventCell.innerText.trim() : "";
      if (cellText && (color === "red" || cellText.toLowerCase().includes("error") || cellText.toLowerCase().includes("caido"))) {
        // Si hay indicadores de error pero no se pudo parsear el tiempo,
        // considerar como potencialmente caído si el color es rojo
        if (color === "red") {
          caido = true;
        }
      }
    }

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
    if (!state.controls.searchCampaign || !state.isActive) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.filters);
      if (!raw) {
        if (state.controls.lastEventRange && state.controls.lastEventLabel) {
          updateRangeLabel();
        }
        if (state.isActive && state.panel) {
          applyFilters();
        }
        return;
      }
      const data = JSON.parse(raw);
      if (state.controls.searchCampaign) state.controls.searchCampaign.value = data.searchCamp || "";
      if (state.controls.searchMacro) state.controls.searchMacro.value = data.searchMacro || "";
      if (state.controls.searchKeyword) state.controls.searchKeyword.value = data.searchKeyword || "";
      if (state.controls.searchIMEI) state.controls.searchIMEI.value = data.searchIMEI || "";
      if (state.controls.onlyFallen) state.controls.onlyFallen.checked = Boolean(data.onlyFallen);
      if (state.controls.lastEventRange) state.controls.lastEventRange.value = String(data.lastEvent || 0);
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
    if (state.isActive && state.panel) {
      applyFilters();
    }
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
    // Removido el listener de 'load' que restauraba scroll para evitar bloqueos
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
    // No restaurar scroll automáticamente para evitar bloqueos
    // El usuario puede hacer scroll manualmente
    return;
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
    if (!normalizedMacro || !row) {
      return true;
    }

    const anchors = Array.from(row.querySelectorAll("a"));

    // Buscar en los enlaces (como la versión original)
    if (
      anchors.some((anchor) => {
        if (!anchor) return false;
        
        const text = normalizeText(anchor.innerText || anchor.textContent || "");
        const href = normalizeText(anchor.getAttribute("href") || "");
        const onclick = anchor.getAttribute("onclick") || "";
        
        // Normalizar el onclick
        let normalizedOnclick = normalizeText(onclick);
        
        // Si el onclick contiene una URL (como modal('https://...')), extraerla y normalizarla
        if (onclick) {
          // Extraer URL de onclick que tenga formato modal('URL') o similar
          const urlInQuotesPattern = /['"](https?:\/\/[^'"]+)['"]/g;
          const urlMatches = onclick.match(urlInQuotesPattern);
          if (urlMatches) {
            urlMatches.forEach(quotedUrl => {
              // Remover las comillas y normalizar la URL
              const cleanUrl = quotedUrl.replace(/['"]/g, "");
              if (cleanUrl && cleanUrl.startsWith("http")) {
                const normalizedUrl = normalizeText(cleanUrl);
                // Agregar la URL normalizada al onclick normalizado para buscar en ella
                normalizedOnclick += " " + normalizedUrl;
              }
            });
          }
          
          // También buscar URLs directamente (sin comillas) en el onclick
          const directUrlPattern = /(https?:\/\/[^\s'")]+)/gi;
          const directMatches = onclick.match(directUrlPattern);
          if (directMatches) {
            directMatches.forEach(url => {
              if (url) {
                const normalizedUrl = normalizeText(url);
                normalizedOnclick += " " + normalizedUrl;
              }
            });
          }
        }

        return (
          text.includes(normalizedMacro) ||
          href.includes(normalizedMacro) ||
          normalizedOnclick.includes(normalizedMacro)
        );
      })
    ) {
      return true;
    }

    // Si no se encontró en los enlaces, buscar en el texto completo de la fila
    // Esto incluye nombres de macros que están fuera de los enlaces
    return normalizeText(row.innerText || row.textContent || "").includes(normalizedMacro);
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
    if (!str || typeof str !== "string") return "";
    return String(str)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
      .replace(/[_\-\.,;:]+/g, " ") // Normalizar guiones, guiones bajos y puntuación a espacios
      .replace(/\s+/g, " ") // Normalizar espacios múltiples a uno solo
      .trim(); // Eliminar espacios al inicio y al final después de todas las transformaciones
  }

  function parseTiempoToMinutos(txt) {
    if (!txt || typeof txt !== "string") return -1;
    const low = String(txt).toUpperCase().trim();
    if (!low) return -1;
    
    // Si contiene "99 D", "99 H", "99 M" (formato de error o desconocido)
    if (low.includes("99 D") && low.includes("99 H") && low.includes("99 M")) return -1;
    
    // Buscar patrones de tiempo más flexibles
    // El formato puede ser "0 D - 0 H - 6 M" o "0 D 0 H 6 M" o variaciones
    let d = 0, h = 0, m = 0;
    
    // Buscar días: puede ser "1D", "1 D", "1 D -", "1 D -", etc.
    // El regex busca un número seguido de espacios opcionales y luego "D"
    const md = low.match(/(\d+)\s*D/);
    if (md) d = parseInt(md[1], 10);
    
    // Buscar horas: puede ser "1H", "1 H", "1 H -", "1 H -", etc.
    // El regex busca un número seguido de espacios opcionales y luego "H"
    const mh = low.match(/(\d+)\s*H/);
    if (mh) h = parseInt(mh[1], 10);
    
    // Buscar minutos: puede ser "45M", "45 M", "45 M", etc.
    // El regex busca un número seguido de espacios opcionales y luego "M"
    const mm = low.match(/(\d+)\s*M/);
    if (mm) m = parseInt(mm[1], 10);
    
    // Si no se encontró ningún patrón, intentar buscar solo números
    // Por ejemplo, si el texto es solo "45", podría ser minutos
    if (d === 0 && h === 0 && m === 0) {
      const onlyNumber = low.match(/^\s*(\d+)\s*$/);
      if (onlyNumber) {
        // Si es un número pequeño (< 1000), asumir que son minutos
        const num = parseInt(onlyNumber[1], 10);
        if (num < 1000) {
          m = num;
        }
      }
    }
    
    // Calcular total en minutos
    const totalMinutes = d * 1440 + h * 60 + m;
    
    // Debug: Si el tiempo parseado es 0 pero el texto no está vacío, podría haber un problema
    // Pero no retornamos -1 si es 0 válido (0 D 0 H 0 M = 0 minutos)
    // Solo retornamos -1 si no se pudo parsear nada
    
    // Si encontramos al menos un patrón (D, H, o M), retornar el total
    // Incluso si es 0, es un tiempo válido
    if (md || mh || mm || (d === 0 && h === 0 && m === 0 && low.match(/\d+/))) {
      return totalMinutes;
    }
    
    // Si no se encontró ningún tiempo válido, retornar -1
    return -1;
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

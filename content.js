(function () {
  chrome.storage.local.get("isActive", (data) => {
    if (data.isActive === false) return;
    if (document.getElementById("menuFiltroCampañas")) return;

    // === BANDERA PARA DETECTAR MODO DETALLE (IMEI / MACRO) ===
    let modoDetalleActivo = false;

    // === GUARDAR Y RESTAURAR POSICIÓN DE SCROLL POR PESTAÑA ===
    window.addEventListener("beforeunload", () => {
      try {
        sessionStorage.setItem("lastScrollY", String(window.scrollY));
      } catch {}
    });

    function restaurarScroll() {
      if (modoDetalleActivo || sessionStorage.getItem("modoDetalleActivo") === "1") return;
      try {
        const y = parseInt(sessionStorage.getItem("lastScrollY"), 10);
        if (!isNaN(y)) {
          setTimeout(() => window.scrollTo(0, y), 200);
          setTimeout(() => window.scrollTo(0, y), 800);
        }
      } catch {}
    }
    window.addEventListener("load", restaurarScroll);

    // === PANEL DE FILTRO ===
    let panel = document.createElement("div");
    panel.id = "menuFiltroCampañas";
    panel.classList.add("menu-filtro-campanias");

    let titulo = document.createElement("h3");
    titulo.innerText = "Filtro de Campañas";
    titulo.classList.add("titulo");
    panel.appendChild(titulo);

    let inputCamp = document.createElement("input");
    inputCamp.type = "text";
    inputCamp.placeholder = "Buscar campaña (texto o número)...";
    inputCamp.classList.add("buscador");
    panel.appendChild(inputCamp);

    let inputMacro = document.createElement("input");
    inputMacro.type = "text";
    inputMacro.placeholder = "Buscar macro (texto o número)...";
    inputMacro.classList.add("buscador");
    panel.appendChild(inputMacro);

    let inputIMEI = document.createElement("input");
    inputIMEI.type = "text";
    inputIMEI.placeholder = "Buscar IMEI (últimos 4 dígitos)...";
    inputIMEI.classList.add("buscador");
    panel.appendChild(inputIMEI);

    const filtros = [
      { id: "chkRojo", label: " Rojo (Crítico)", clase: "label-rojo" },
      { id: "chkNaranja", label: " Naranja (Alerta)", clase: "label-naranja" },
      { id: "chkCaidos", label: " Solo caídos", clase: "label-caidos" },
    ];

    const checkboxes = {};
    filtros.forEach((f) => {
      let wrapper = document.createElement("div");
      wrapper.classList.add("filtro-item");
      let chk = document.createElement("input");
      chk.type = "checkbox";
      chk.id = f.id;
      let lbl = document.createElement("label");
      lbl.innerText = f.label;
      lbl.htmlFor = f.id;
      lbl.classList.add(f.clase);
      wrapper.appendChild(chk);
      wrapper.appendChild(lbl);
      panel.appendChild(wrapper);
      checkboxes[f.id] = chk;
    });

    document.body.appendChild(panel);

    let btnAbrir = document.createElement("button");
    btnAbrir.id = "btnAbrirFiltro";
    btnAbrir.classList.add("btn-abrir");
    btnAbrir.style.backgroundImage = `url(${chrome.runtime.getURL("lupa.png")})`;
    btnAbrir.style.backgroundSize = "20px 20px";
    document.body.appendChild(btnAbrir);

    let panelOpen = false;
    function openPanel() {
      panel.style.transform = "translateX(0)";
      btnAbrir.style.display = "none";
      try {
        sessionStorage.setItem("filtroMenuAbierto", "1");
      } catch {}
      panelOpen = true;
    }
    function closePanel() {
      panel.style.transform = "translateX(-100%)";
      btnAbrir.style.display = "block";
      try {
        sessionStorage.removeItem("filtroMenuAbierto");
      } catch {}
      panelOpen = false;
    }

    btnAbrir.onclick = openPanel;

    try {
      const val = sessionStorage.getItem("filtroMenuAbierto");
      if (val) openPanel();
      else closePanel();
    } catch {
      closePanel();
    }

    // cerrar al hacer click fuera del panel
    document.addEventListener(
      "click",
      function (e) {
        if (!panelOpen) return;
        if (e.target.closest("#menuFiltroCampañas")) return;
        if (e.target.closest("#btnAbrirFiltro")) return;
        closePanel();
      },
      true
    );

    // === DETECTAR APERTURA DE DETALLE (IMEI / MACRO) ===
    document.addEventListener(
      "click",
      function (e) {
        const a = e.target.closest("a");
        if (!a) return;
        const href = (a.getAttribute && a.getAttribute("href")) || "";
        const onclick = (a.getAttribute && a.getAttribute("onclick")) || "";
        if (
          href.includes("/phonesApp") ||
          href.includes("/macros/") ||
          onclick.includes("/macros/") ||
          onclick.includes("phonesApp")
        ) {
          modoDetalleActivo = true;
          try {
            sessionStorage.setItem("modoDetalleActivo", "1");
          } catch {}
          closePanel();
        }
      },
      true
    );

    function normalizeText(str) {
      return String(str || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    }

    function parseTiempoToMinutos(txt) {
      const low = String(txt || "").toUpperCase().trim();
      if (low.includes("99 D") && low.includes("99 H") && low.includes("99 M"))
        return -1;
      let d = 0, h = 0, m = 0;
      const md = low.match(/(\d+)\s*D/);
      const mh = low.match(/(\d+)\s*H/);
      const mm = low.match(/(\d+)\s*M/);
      if (md) d = parseInt(md[1], 10);
      if (mh) h = parseInt(mh[1], 10);
      if (mm) m = parseInt(mm[1], 10);
      return d * 1440 + h * 60 + m;
    }

    function getThresholdMinutes(rep) {
      rep = Number(rep) || 1;
      if (rep <= 1) return Math.max(15, rep * 5);
      if (rep <= 5) return rep * 10;
      if (rep <= 30) return rep * 6;
      if (rep <= 120) return rep * 3;
      return rep * 2;
    }

    function detectarCaidos() {
      document.querySelectorAll("table").forEach((table) => {
        if (table.closest(".modal, .popup, .detalle")) return;
        Array.from(table.querySelectorAll("tr"))
          .filter((r) => r.querySelectorAll("td").length > 0)
          .forEach((tr) => {
            try {
              const tds = tr.querySelectorAll("td");
              if (tds.length < 5) {
                tr.dataset.caido = "false";
                return;
              }
              const repMatch = String(tds[3].innerText || "").match(/\d+/);
              const repeticion = repMatch ? parseInt(repMatch[0], 10) : 1;
              const minutosPasados = parseTiempoToMinutos(tds[4].innerText || "");
              if (minutosPasados === -1) {
                tr.dataset.caido = "false";
                return;
              }
              const threshold = getThresholdMinutes(repeticion);
              tr.dataset.caido = minutosPasados >= threshold ? "true" : "false";
            } catch {
              tr.dataset.caido = "false";
            }
          });
      });
    }

    function actualizarDatosDeColor() {
      document.querySelectorAll("table").forEach((table) => {
        if (table.closest(".modal, .popup, .detalle")) return;
        Array.from(table.querySelectorAll("tr"))
          .filter((r) => r.querySelectorAll("td").length > 0)
          .forEach((row) => {
            const tds = row.querySelectorAll("td");
            row.dataset.color = "";
            let porEl = null;
            try {
              porEl = tds[tds.length - 2].querySelector(
                "b.error, b.warning, b.orange, b.success"
              );
            } catch {
              porEl = null;
            }
            if (porEl) {
              const cls = (porEl.className || "").toLowerCase();
              if (cls.includes("error")) row.dataset.color = "red";
              else if (cls.includes("orange") || cls.includes("warning"))
                row.dataset.color = "orange";
              else if (cls.includes("success")) row.dataset.color = "green";
            } else {
              const pctMatch =
                (tds[tds.length - 2] &&
                  tds[tds.length - 2].innerText &&
                  tds[tds.length - 2].innerText.match(/(\d+)\s*%/)) || null;
              if (pctMatch) {
                const p = parseInt(pctMatch[1], 10);
                if (p >= 80) row.dataset.color = "red";
                else if (p >= 50) row.dataset.color = "orange";
              }
            }
          });
      });
    }

    function filtrar() {
      // 🚫 Evitar ejecutar filtro si estás en modo detalle
      if (modoDetalleActivo || sessionStorage.getItem("modoDetalleActivo") === "1") return;
      if (document.querySelector(".modal, .popup, .detalle")) return;

      detectarCaidos();
      actualizarDatosDeColor();

      const wantRojo = checkboxes.chkRojo.checked;
      const wantNaranja = checkboxes.chkNaranja.checked;
      const wantCaidos = checkboxes.chkCaidos.checked;

      const searchCamp = normalizeText(inputCamp.value || "");
      const searchMacro = normalizeText(inputMacro.value || "");
      const rawIMEI = (inputIMEI.value || "").trim();
      const imeiDigits = rawIMEI.replace(/\D/g, "");
      const imeiKey = imeiDigits ? imeiDigits.slice(-4) : "";
      const anyFilter = wantRojo || wantNaranja || wantCaidos;

      document.querySelectorAll("table").forEach((table) => {
        if (table.closest(".modal, .popup, .detalle")) return;

        const campaignBlock = table.closest("div") || table;
        const h2 = campaignBlock.querySelector ? campaignBlock.querySelector("h2") : null;
        const campaignName = normalizeText(h2 ? h2.innerText : "");
        const campaignBlockText = normalizeText(campaignBlock.innerText || "");
        const rows = Array.from(table.querySelectorAll("tr")).filter(
          (r) => r.querySelectorAll("td").length > 0
        );

        if (rows.length === 0) {
          campaignBlock.style.display = "none";
          return;
        }

        const matchesCampaign = !searchCamp || campaignName.includes(searchCamp);

        const macroAnchors = Array.from(campaignBlock.querySelectorAll("a")).filter(
          (a) =>
            ((a.getAttribute && (a.getAttribute("href") || "")).includes("/macros/")) ||
            ((a.getAttribute && (a.getAttribute("onclick") || "")).includes("/macros/"))
        );
        const matchesMacro =
          !searchMacro ||
          macroAnchors.some((a) => {
            const txt = normalizeText(a.innerText || "");
            const hrefOrOnclick = normalizeText(
              a.getAttribute("href") || a.getAttribute("onclick") || ""
            );
            return txt.includes(searchMacro) || hrefOrOnclick.includes(searchMacro);
          }) ||
          campaignBlockText.includes(searchMacro);

        let imeiMatch = true;
        if (imeiKey) {
          imeiMatch = rows.some((r) => {
            const link =
              r.querySelector("td a[href*='phonesApp']") || r.querySelector("td a");
            const imeiText = link
              ? link.innerText.trim()
              : r.querySelector("td")
              ? r.querySelector("td").innerText.trim()
              : "";
            if (!imeiText) return false;
            return imeiText.slice(-imeiKey.length) === imeiKey;
          });
        }

        let campaignHasFilterMatch = true;
        if (anyFilter) {
          campaignHasFilterMatch = rows.some(
            (r) =>
              (wantRojo && r.dataset.color === "red") ||
              (wantNaranja && r.dataset.color === "orange") ||
              (wantCaidos && r.dataset.caido === "true")
          );
        }

        const showCampaign =
          matchesCampaign && matchesMacro && imeiMatch && campaignHasFilterMatch;
        campaignBlock.style.display = showCampaign ? "" : "none";

        rows.forEach((r) => {
          const showRow = showCampaign;
          r.style.display = showRow ? "" : "none";

          r.querySelectorAll("td").forEach((td) =>
            td.classList.remove(
              "resaltar-rojo",
              "resaltar-naranja",
              "resaltar-caido"
            )
          );

          if (!showRow) return;

          const tds = r.querySelectorAll("td");
          const metricCell = tds[tds.length - 2];
          const ultimoEventoCell = tds.length >= 5 ? tds[4] : null;

          if (anyFilter) {
            if (wantRojo && r.dataset.color === "red" && metricCell)
              metricCell.classList.add("resaltar-rojo");
            if (wantNaranja && r.dataset.color === "orange" && metricCell)
              metricCell.classList.add("resaltar-naranja");
            if (wantCaidos && r.dataset.caido === "true" && ultimoEventoCell)
              ultimoEventoCell.classList.add("resaltar-caido");
          } else {
            if (r.dataset.color === "red" && metricCell)
              metricCell.classList.add("resaltar-rojo");
            else if (r.dataset.color === "orange" && metricCell)
              metricCell.classList.add("resaltar-naranja");
            if (r.dataset.caido === "true" && ultimoEventoCell)
              ultimoEventoCell.classList.add("resaltar-caido");
          }
        });
      });

      guardarEstado();
      restaurarScroll();
    }

    function guardarEstado() {
      const estado = {
        searchCamp: inputCamp.value,
        searchMacro: inputMacro.value,
        searchIMEI: inputIMEI.value,
        filtros: {},
      };
      for (let id in checkboxes) estado.filtros[id] = !!checkboxes[id].checked;
      try {
        sessionStorage.setItem("estadoFiltroCampanias", JSON.stringify(estado));
      } catch {}
    }

    function restaurarEstado() {
      try {
        const raw = sessionStorage.getItem("estadoFiltroCampanias");
        if (raw) {
          const data = JSON.parse(raw);
          inputCamp.value = data.searchCamp || "";
          inputMacro.value = data.searchMacro || "";
          inputIMEI.value = data.searchIMEI || "";
          for (let id in checkboxes)
            checkboxes[id].checked = !!(data.filtros && data.filtros[id]);
        }
      } catch {}
      filtrar();
    }

    [inputCamp, inputMacro, inputIMEI].forEach((inp) => {
      inp.addEventListener("input", () => {
        clearTimeout(inp._deb);
        inp._deb = setTimeout(filtrar, 150);
      });
    });
    Object.values(checkboxes).forEach((c) => c.addEventListener("change", filtrar));

    // === OBSERVADOR PRINCIPAL DE CAMBIOS EN EL DOM ===
    const observer = new MutationObserver(() => {
      if (
        modoDetalleActivo ||
        sessionStorage.getItem("modoDetalleActivo") === "1" ||
        document.querySelector(".modal, .popup, .detalle")
      )
        return;
      clearTimeout(observer._deb);
      observer._deb = setTimeout(() => {
        detectarCaidos();
        actualizarDatosDeColor();
        filtrar();
      }, 200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // === DETECTAR CIERRE DE DETALLE Y REACTIVAR FILTRO ===
    const restablecerDetalle = new MutationObserver(() => {
      const modalAbierto = document.querySelector(".modal, .popup, .detalle");
      if (!modalAbierto && modoDetalleActivo) {
        modoDetalleActivo = false;
        try {
          sessionStorage.removeItem("modoDetalleActivo");
        } catch {}
      }
    });
    restablecerDetalle.observe(document.body, { childList: true, subtree: true });

    detectarCaidos();
    actualizarDatosDeColor();
    restaurarEstado();
  });
})();

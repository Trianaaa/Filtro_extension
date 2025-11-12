document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggleExtension");
  const statusText = document.getElementById("statusText");
  const statusHint = document.getElementById("statusHint");
  const statusChip = document.getElementById("statusChip");
  const openMonitor = document.getElementById("openMonitor");
  const body = document.body;

  let isUpdating = false;

  function applyState(active) {
    toggle.checked = active;
    body.dataset.state = active ? "active" : "inactive";

    statusText.textContent = active
      ? "El panel lateral está activo."
      : "La extensión está en pausa.";

    statusHint.textContent = active
      ? "La lupa flotante te permite volver a abrir el panel en el sitio."
      : "Enciende la extensión para volver a ver el panel de filtro en el sitio.";

    // Actualizar el chip con el icono y texto
    if (active) {
      statusChip.innerHTML = `<span><i class="ti ti-check"></i> Activa</span>`;
      statusChip.classList.add("popup__chip--active");
      statusChip.classList.remove("popup__chip--inactive");
    } else {
      statusChip.innerHTML = `<span>Pausada</span>`;
      statusChip.classList.remove("popup__chip--active");
      statusChip.classList.add("popup__chip--inactive");
    }
  }

  function setLoading(loading) {
    isUpdating = loading;
    toggle.disabled = loading;
    statusChip.classList.toggle("is-loading", loading);
  }

  chrome.storage.local.get("isActive", (data) => {
    const active = data.isActive !== false;
    applyState(active);
  });

  toggle.addEventListener("change", () => {
    if (isUpdating) return;
    const newValue = toggle.checked;
    setLoading(true);

    chrome.runtime.sendMessage({ action: "toggle", value: newValue }, (response) => {
      const hasError =
        chrome.runtime.lastError || (response && response.status === "error");

      if (hasError) {
        applyState(!newValue);
        statusHint.textContent = "No pudimos actualizar el estado. Intenta nuevamente.";
      } else {
        chrome.storage.local.set({ isActive: newValue });
        applyState(newValue);
      }

      setLoading(false);
    });
  });

  openMonitor.addEventListener("click", () => {
    chrome.tabs.create({
      url: "https://mantenedornuevo.movizzon.com/appMonitors",
    });
  });
});

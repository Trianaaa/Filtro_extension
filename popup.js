document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggleExtension");
  const statusText = document.getElementById("statusText");
  const openMonitor = document.getElementById("openMonitor");
  const body = document.body;

  let isUpdating = false;

  function applyState(active) {
    toggle.checked = active;
    body.dataset.state = active ? "active" : "inactive";
    statusText.textContent = active ? "Activa" : "Pausada";
  }

  function setLoading(loading) {
    isUpdating = loading;
    toggle.disabled = loading;
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

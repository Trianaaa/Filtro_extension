document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("toggleExtension");
  const statusText = document.getElementById("statusText");

  chrome.storage.local.get("isActive", (data) => {
    const active = data.isActive ?? true;
    toggle.checked = active;
    statusText.textContent = active ? "Extensión activa" : "Extensión desactivada";
  });

  toggle.addEventListener("change", () => {
    const newValue = toggle.checked;
    chrome.runtime.sendMessage({ action: "toggle", value: newValue }, () => {
      chrome.storage.local.set({ isActive: newValue }); // 🔹 aseguramos que quede guardado
      statusText.textContent = newValue ? "Extensión activa" : "Extensión desactivada";
    });
  });
});

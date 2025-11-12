// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("isActive", (data) => {
    if (data.isActive === undefined) {
      chrome.storage.local.set({ isActive: true });
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    chrome.storage.local.get("isActive", (data) => {
      if (data.isActive) {
        // Inyectar estilos y script
        chrome.scripting.insertCSS({
          target: { tabId },
          files: ["styles.css"]
        });
        chrome.scripting.executeScript({
          target: { tabId },
          files: ["filtro.js"]
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "toggle") {
    chrome.storage.local.set({ isActive: msg.value });

    chrome.tabs.query({ url: "https://mantenedor.movizzon.com/appMonitors*" }, (tabs) => {
      tabs.forEach(tab => {
        if (!msg.value) {
          // Apagar → eliminar panel y lupa
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const panel = document.getElementById("menuFiltroCampañas");
              const btnAbrir = document.getElementById("btnAbrirFiltro");
              if (panel) panel.remove();
              if (btnAbrir) btnAbrir.remove();
            }
          });
        } else {
          // Encender → recargar para inyectar
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => location.reload()
          });
        }
      });
    });

    sendResponse({ status: "ok" });
  }
});

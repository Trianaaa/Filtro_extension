const TARGET_PATTERNS = [
  "https://mantenedornuevo.movizzon.com/appMonitors*",
  "https://mantenedor.movizzon.com/appMonitors*"
];

function isTargetUrl(url) {
  return typeof url === "string" && TARGET_PATTERNS.some((pattern) => {
    const base = pattern.replace("*", "");
    return url.startsWith(base);
  });
}

async function ensureDefaultState() {
  const data = await chrome.storage.local.get("isActive");
  if (typeof data.isActive === "undefined") {
    await chrome.storage.local.set({ isActive: true });
  }
}

async function enableFilterOnTab(tabId) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["styles.css"]
    });
  } catch (error) {
    if (chrome.runtime.lastError) {
      console.warn("[Filtro Campañas] No se pudo insertar CSS:", chrome.runtime.lastError.message);
    } else {
      console.warn("[Filtro Campañas] No se pudo insertar CSS:", error);
    }
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (error) {
    if (chrome.runtime.lastError) {
      console.warn("[Filtro Campañas] No se pudo inyectar content script:", chrome.runtime.lastError.message);
    } else {
      console.warn("[Filtro Campañas] No se pudo inyectar content script:", error);
    }
  }
}

async function removePanelFromTab(tabId) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const panel = document.getElementById("menuFiltroCampañas");
        const btnAbrir = document.getElementById("btnAbrirFiltro");
        if (panel) panel.remove();
        if (btnAbrir) btnAbrir.remove();
      }
    });
  } catch (error) {
    if (chrome.runtime.lastError) {
      console.warn("[Filtro Campañas] No se pudo eliminar el panel:", chrome.runtime.lastError.message);
    } else {
      console.warn("[Filtro Campañas] No se pudo eliminar el panel:", error);
    }
  }
}

async function updateTabsWithToggle(isActive) {
  const tabs = await chrome.tabs.query({ url: TARGET_PATTERNS });
  for (const tab of tabs) {
    if (typeof tab.id !== "number") continue;

    let delivered = false;
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "applyToggle", value: isActive });
      delivered = true;
    } catch (error) {
      delivered = false;
      if (chrome.runtime.lastError) {
        console.debug("[Filtro Campañas] No se pudo enviar mensaje al tab:", chrome.runtime.lastError.message);
      } else {
        console.debug("[Filtro Campañas] No se pudo enviar mensaje al tab:", error);
      }
    }

    if (isActive) {
      if (!delivered) {
        await enableFilterOnTab(tab.id);
        try {
          await chrome.tabs.sendMessage(tab.id, { action: "applyToggle", value: true });
        } catch {
          // Si sigue fallando, dejamos que el content script tome control en próximo load.
        }
      }
    } else if (!delivered) {
      await removePanelFromTab(tab.id);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultState().catch((error) => {
    console.error("[Filtro Campañas] Error inicializando estado:", error);
  });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !isTargetUrl(tab.url)) return;
  const data = await chrome.storage.local.get("isActive");
  const isActive = data.isActive !== false;

  if (isActive) {
    await enableFilterOnTab(tabId);
    try {
      await chrome.tabs.sendMessage(tabId, { action: "applyToggle", value: true });
    } catch {
      // Ignoramos: el script se encargará en la próxima inyección.
    }
  } else {
    try {
      await chrome.tabs.sendMessage(tabId, { action: "applyToggle", value: false });
    } catch {
      await removePanelFromTab(tabId);
    }
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.action === "toggle") {
    (async () => {
      await chrome.storage.local.set({ isActive: msg.value });
      await updateTabsWithToggle(Boolean(msg.value));
      sendResponse({ status: "ok" });
    })().catch((error) => {
      console.error("[Filtro Campañas] Error aplicando toggle:", error);
      sendResponse({ status: "error", message: error?.message || "unknown" });
    });
    return true;
  }
  return false;
});

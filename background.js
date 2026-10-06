/**
 * Universal Adaptive Media Maximizer - Background Service Worker
 * Bridges extension icon clicks and global command shortcuts to the content script.
 */

async function toggleMaximizerInTab(tabId) {
  try {
    // Attempt sending toggle message to content script
    // Top frame only: it picks the target and forwards to an iframe when needed.
    await chrome.tabs.sendMessage(tabId, { action: "TOGGLE_MAXIMIZER" }, { frameId: 0 });
  } catch (err) {
    // Tab was open before extension installed/reloaded, or content script not yet present.
    // Dynamically inject stylesheet and content script as fallback.
    try {
      await chrome.scripting.insertCSS({
        target: { tabId, allFrames: true },
        files: ["styles.css"]
      });
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content.js"]
      });
      await chrome.tabs.sendMessage(tabId, { action: "TOGGLE_MAXIMIZER" }, { frameId: 0 });
    } catch (fallbackErr) {
      console.warn("Universal Adaptive Media Maximizer: unable to inject script into tab", tabId, fallbackErr);
    }
  }
}

// Extension icon clicked in toolbar
if (typeof chrome !== 'undefined' && chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab?.id) {
      await toggleMaximizerInTab(tab.id);
    }
  });
}

// Keyboard shortcut (Alt+Shift+F)
if (typeof chrome !== 'undefined' && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === "toggle-maximizer") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) {
        await toggleMaximizerInTab(activeTab.id);
      }
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { toggleMaximizerInTab };
}


/**
 * Universal Adaptive Media Maximizer - Background Service Worker
 * Bridges extension icon clicks, context menu items and global command shortcuts to the content script.
 */

const RECORD_MENU_ID = "record-clip";
const RANGE_MENU_ID = "download-range";

async function sendToTab(tabId, message, frameId = 0) {
  try {
    await chrome.tabs.sendMessage(tabId, message, { frameId });
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
      await chrome.tabs.sendMessage(tabId, message, { frameId });
    } catch (fallbackErr) {
      console.warn("Universal Adaptive Media Maximizer: unable to inject script into tab", tabId, fallbackErr);
    }
  }
}

async function toggleMaximizerInTab(tabId) {
  // Top frame only: it picks the target and forwards to an iframe when needed.
  await sendToTab(tabId, { action: "TOGGLE_MAXIMIZER" });
}

// Right-clicking a <video> targets that frame and that video; the icon menu lets the
// top frame pick the media the same way the maximizer does.
async function recordClipInTab(tabId, info = {}, action = "RECORD_CLIP") {
  const frameId = info.mediaType === "video" ? (info.frameId ?? 0) : 0;
  await sendToTab(tabId, { action, srcUrl: info.srcUrl }, frameId);
}

// Recording progress from a content script, shown on that tab's toolbar icon.
function showRecordProgress(tabId, text) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#DC2626" });
  chrome.action.setBadgeText({ tabId, text });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((request, sender) => {
    if (request.action === "RECORD_PROGRESS" && sender.tab?.id) {
      showRecordProgress(sender.tab.id, request.text);
    }
  });
}

// Extension icon clicked in toolbar
if (typeof chrome !== 'undefined' && chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (tab?.id) {
      await toggleMaximizerInTab(tab.id);
    }
  });
}

// Context menu: toolbar icon right-click menu + right-click on a video
if (typeof chrome !== 'undefined' && chrome.contextMenus) {
  chrome.runtime?.onInstalled?.addListener(() => {
    chrome.contextMenus.create({
      id: RECORD_MENU_ID,
      title: "Record 15 sec of the video (MP4)",
      contexts: ["action", "video"]
    });
    chrome.contextMenus.create({
      id: RANGE_MENU_ID,
      title: "Download video (choose start and end)…",
      contexts: ["action", "video"]
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    if (info.menuItemId === RECORD_MENU_ID) await recordClipInTab(tab.id, info);
    if (info.menuItemId === RANGE_MENU_ID) await recordClipInTab(tab.id, info, "OPEN_RANGE_PANEL");
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
  module.exports = { toggleMaximizerInTab, recordClipInTab, showRecordProgress };
}

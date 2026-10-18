import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Background Service Worker', () => {
  let toggleMaximizerInTab;

  beforeEach(async () => {
    vi.resetModules();
    globalThis.chrome = {
      tabs: {
        sendMessage: vi.fn(),
        query: vi.fn()
      },
      scripting: {
        insertCSS: vi.fn().mockResolvedValue(undefined),
        executeScript: vi.fn().mockResolvedValue(undefined)
      },
      action: {
        onClicked: {
          addListener: vi.fn()
        }
      },
      commands: {
        onCommand: {
          addListener: vi.fn()
        }
      }
    };

    const mod = await import('../background.js');
    toggleMaximizerInTab = mod.toggleMaximizerInTab;
  });

  it('sends TOGGLE_MAXIMIZER message to tab when content script is active', async () => {
    chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true, active: true });

    await toggleMaximizerInTab(123);

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, { action: 'TOGGLE_MAXIMIZER' }, { frameId: 0 });
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
  });

  it('injects styles.css and content.js as fallback if message sending fails', async () => {
    // First message fails (tab was open before extension installed)
    chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection'));
    // Second message after injection succeeds
    chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true, active: true });

    await toggleMaximizerInTab(456);

    expect(chrome.scripting.insertCSS).toHaveBeenCalledWith({
      target: { tabId: 456, allFrames: true },
      files: ['styles.css']
    });
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 456, allFrames: true },
      files: ['content.js']
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('sends RECORD_CLIP to the frame of a right-clicked video', async () => {
    const { recordClipInTab } = await import('../background.js');
    chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true });

    await recordClipInTab(7, { mediaType: 'video', frameId: 3, srcUrl: 'https://example.com/v.mp4' });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7, { action: 'RECORD_CLIP', srcUrl: 'https://example.com/v.mp4' }, { frameId: 3 }
    );
  });

  it('sends RECORD_CLIP to the top frame from the toolbar icon menu', async () => {
    const { recordClipInTab } = await import('../background.js');
    chrome.tabs.sendMessage.mockResolvedValueOnce({ success: true });

    await recordClipInTab(7, { menuItemId: 'record-clip' });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { action: 'RECORD_CLIP', srcUrl: undefined }, { frameId: 0 });
  });
});

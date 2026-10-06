# Universal Adaptive Media Maximizer

A browser extension and Tampermonkey userscript that expands any `<video>` or `<canvas>` element into a **windowed fullscreen** theater view.

Unlike native full-screen mode (which hijacks your operating system screen and hides taskbars, docks, and second monitors), this tool maximizes the media player to 100% of the browser tab viewport while keeping your desktop workflow undisturbed.

---

## Key Features

- **Windowed Fullscreen**: Stretches video or canvas across the entire tab viewport (`100vw` × `100vh`).
- **SPA & Virtual DOM Safe**: Does NOT relocate DOM nodes (`document.body.appendChild(...)`), preventing React/Vue/Angular unmounting, re-buffering, and state resets.
- **CSS Stacking Context Neutralization**: Disables `position: fixed/sticky`, `transform` (incl. `translate`/`rotate`/`scale`), `opacity`, `isolation`, `mix-blend-mode`, `filter`, `perspective`, `contain`, `content-visibility`, `clip-path`, and `backdrop-filter` on ancestor nodes that would trap the maximized element (previously caused a black screen on canvas apps).
- **Canvas Aware**: Maximizes the player box around a canvas so stacked layers and HUD overlays stay aligned, letterboxes with `object-fit: contain`, and fires `resize` so engines re-render at full size.
- **Iframe Embeds**: Games/players inside iframes are maximized by expanding the iframe, then the frame's own content script fills it with its media.
- **Smart Media Target Detection**: Automatically targets currently playing video or WebGL canvas elements (ignoring tracking pixels and background banners).
- **Non-Destructive Player Preservation**: Keeps native video player controls, subtitles, play/pause overlays, and captions completely accessible.
- **Precision Speed Controller**: Floating overlay supporting 0.25x to 4.00x playback speeds with pitch preservation and instant reset.
- **Auto-Hiding Overlay**: The speed panel hides completely after 3 seconds without mouse movement and reappears instantly when the cursor moves.
- **Event Isolation**: Clicks, drags, and slider adjustments inside the speed panel never trigger video pause or underlying page interactions.

---

## Keyboard Shortcuts

| Platform | Shortcut | Action |
|----------|----------|--------|
| **macOS** | `⌘ + ⌥ + F` (Cmd + Option + F) | Toggle windowed fullscreen |
| **macOS** | `⌥ + ⇧ + F` (Option + Shift + F) | Toggle windowed fullscreen |
| **macOS** | `⌘ + ⇧ + F` (Cmd + Shift + F) | Toggle windowed fullscreen |
| **macOS** | `⌃ + ⌘ + F` (Ctrl + Cmd + F) | Toggle windowed fullscreen |
| **Windows / Linux** | `Alt + Shift + F` | Toggle windowed fullscreen |
| **Windows / Linux** | `Ctrl + Alt + F` | Toggle windowed fullscreen |
| **All Platforms** | `Escape` | Restore normal view |

---

## 1. Chrome Extension Installation (Manifest V3)

### Quick Start (Developer Mode)
1. Open Google Chrome (or any Chromium browser: Brave, Edge, Opera, Vivaldi).
2. Navigate to `chrome://extensions`.
3. Toggle the **Developer mode** switch in the top right corner.
4. Click **Load unpacked** in the top left.
5. Select this folder:
   ```
   /Users/matt/git/myExtensionsForChrome
   ```
6. The extension is now active! Pin the icon to your toolbar for quick access.

### Extension File Structure
```
myExtensionsForChrome/
├── manifest.json                  # Manifest V3 configuration with commands and permissions
├── background.js                 # Service worker handling toolbar clicks and shortcut commands
├── content.js                    # Content script executing media detection and windowed isolation
├── styles.css                    # Stacking context isolation and polished UI styling
├── icons/                        # Generated PNG icons
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── generate_icons.py             # Pure Python PNG icon generator
├── universal-media-maximizer.user.js # Tampermonkey userscript (generated: npm run build:userscript)
├── CHROMEWEBSTORE.md             # Chrome Web Store submission metadata and compliance
└── README.md
```

---

## 2. Tampermonkey / Userscript Installation

For users who prefer running a single userscript without loading an unpacked extension:

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Create a new script in your userscript manager dashboard.
3. Paste the contents of [`universal-media-maximizer.user.js`](./universal-media-maximizer.user.js) and save (`Ctrl + S` or `Cmd + S`).
4. Alternatively, drag and drop `universal-media-maximizer.user.js` into your browser.

The Tampermonkey version includes:
- Embedded CSS styles (no external dependencies).
- `GM_registerMenuCommand` integration (access directly from the extension popup menu).
- The exact same keyboard shortcuts (`Alt+Shift+F`, `Ctrl+Alt+F`, `Esc`).

---

## Architecture & How It Works

### The SPA DOM Trap Problem
Traditional video maximizer scripts often detach the `<video>` element and append it to `document.body`. On modern single-page applications built with React, Vue, or Angular:
- Moving the element destroys its internal DOM reference.
- The framework triggers an unmount lifecycle hook, breaking state, dropping websocket streams, and restarting playback from 0:00.

### The Solution: Ancestor Isolation
1. **Walk Ancestors Up**: The script identifies the player wrapper and tags each parent node up to `<html>` with `.uvm-ancestor`.
2. **Neutralize Stacking Contexts**: `.uvm-ancestor` resets CSS properties that create local stacking contexts (`transform`, `perspective`, `filter`, `contain`).
3. **Selective Hiding**: Sibling nodes under `.uvm-ancestor` are hidden with `display: none !important`, while the player (`.uvm-maximized`) and extension UI (`.uvm-ui`) are preserved. The page background turns black; there is no overlay element, so nothing can cover a trapped target.
4. **Clean Restoration**: Exiting fullscreen cleanly strips `.uvm-ancestor` and `.uvm-maximized` without touching framework state or triggering re-renders.

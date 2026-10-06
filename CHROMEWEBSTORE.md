# Chrome Web Store Listing — Universal Adaptive Media Maximizer

> Last Updated: 2026-09-28

## Store Listing

**Extension Name** [REQUIRED]
Universal Adaptive Media Maximizer

**Short Description** [REQUIRED]
Flawlessly expands video/canvas to windowed fullscreen, bypassing SPA DOM traps with speed controls.

**Detailed Description** [REQUIRED]
Universal Adaptive Media Maximizer expands any video, game canvas, or embedded media stream to fit your browser window with a single click or keyboard shortcut.

Designed for multi-monitor setups, ultrawide displays, and single-page web applications (SPAs), it gives you a distraction-free windowed theater experience without taking over your entire OS monitor.

KEY FEATURES
- Windowed Fullscreen: Maximize video or canvas within your browser tab while keeping your OS taskbar, menu bar, and other browser windows visible.
- SPA DOM Trapping Bypass: Seamlessly handles React, Vue, and Angular player components without triggering virtual DOM unmounting or player state loss.
- Intelligent Media Detection: Automatically identifies and targets active playing video or WebGL canvas elements.
- Precision Speed Controller: Floating speed slider supporting 0.25x to 4.00x playback rates with pitch preservation and instant reset.
- Non-Intrusive Overlay: Speed controller automatically dims when your mouse is idle so it never blocks video content.
- Native Player Preservation: Keeps custom player controls, captions, and interactive overlays completely intact.

HOW TO USE IT
1. Navigate to any webpage with a video or canvas element (YouTube, Vimeo, Twitch, social feeds, or web games).
2. Press ⌘⌥F, ⌥⇧F, or ⌘⇧F on macOS (Alt+Shift+F on Windows/Linux), or click the extension icon in your toolbar.
3. Adjust playback speed with the top-right slider.
4. Press Escape, click the extension icon, or press your toggle shortcut again to restore standard view.

PRIVACY & PERMISSIONS
This extension runs 100% locally on your machine. It does not track your browsing history, collect personal information, or transmit any data across the network.

SUPPORT & FEEDBACK
Encounter an issue or have a feature request? Open an issue on our GitHub repository.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Expands web media elements to windowed browser fullscreen with playback speed controls.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Extension Icon 48 | 48×48 PNG | ✅ Ready | `icons/icon-48.png` |
| Extension Icon 16 | 16×16 PNG | ✅ Ready | `icons/icon-16.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
- Screenshot 1: Windowed fullscreen active on a video page showing the maximized player and floating speed control slider.
- Screenshot 2: Side-by-side comparison between regular page view and the windowed fullscreen mode.
- Screenshot 3: Close-up of the speed panel overlay and toast notification.

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `activeTab` | permissions | Enables toggling windowed fullscreen on the user's active tab when clicking the toolbar icon or pressing the command shortcut without requiring background access to other tabs. |
| `scripting` | permissions | Allows injecting content scripts and styling dynamically into pages that were already open before the extension was installed or reloaded. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

The extension operates completely client-side in the user's browser tab. It does not collect, record, process, or transmit any personal data, browsing activity, or media content.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/matt/myExtensionsForChrome/blob/main/PRIVACY.md

---

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
Matt

**Contact Email** [REQUIRED]
developer@example.com

**Support URL / Email** [RECOMMENDED]
https://github.com/matt/myExtensionsForChrome/issues

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-09-28 | Initial release: Stacking-context isolation, SPA DOM trap bypass, speed controls, Tampermonkey userscript variant. | Draft |

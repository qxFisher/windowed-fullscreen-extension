/**
 * Universal Adaptive Media Maximizer - Content Script
 * Seamlessly isolates & maximizes video/canvas elements to windowed fullscreen.
 */

(() => {
  // Prevent duplicate instances if injected multiple times
  if (window.__UVM_INITIALIZED__) return;
  window.__UVM_INITIALIZED__ = true;

  class MediaMaximizer {
    constructor() {
      this.isActive = false;
      this.target = null;
      this.videoEl = null;
      this.prevBodyOverflow = '';
      this.idleTimer = null;
      this.toastTimer = null;
      // Keep slider synchronized if player changes speed internally
      this.rateChangeHandler = () => {
        if (this.videoEl && this.slider) {
          const currentRate = this.videoEl.playbackRate || 1.0;
          this.slider.value = currentRate;
          this.speedVal.textContent = parseFloat(currentRate).toFixed(2) + 'x';
        }
      };
      this.media = null;
      this.quiet = false;

      this.initUI();
      this.bindEvents();
    }

    initUI() {
      // Toast Notification
      this.toast = document.createElement('div');
      this.toast.id = 'uvm-toast';
      this.toast.className = 'uvm-ui';

      // Speed Panel Overlay
      this.speedPanel = document.createElement('div');
      this.speedPanel.id = 'uvm-speed-panel';
      this.speedPanel.className = 'uvm-ui';
      this.speedPanel.innerHTML = `
        <span>⚡ <strong id="uvm-speed-val">1.00x</strong></span>
        <input type="range" id="uvm-speed-slider" min="0.25" max="4.00" step="0.05" value="1.00">
        <button class="uvm-btn" id="uvm-speed-reset">Reset</button>
      `;

      // Prevent interactions inside speed panel from bubbling to video player controls
      ['click', 'mousedown', 'pointerdown', 'keydown'].forEach(evt => {
        this.speedPanel.addEventListener(evt, e => e.stopPropagation());
      });

      const root = document.body || document.documentElement;
      root.appendChild(this.toast);
      root.appendChild(this.speedPanel);

      this.slider = this.speedPanel.querySelector('#uvm-speed-slider');
      this.speedVal = this.speedPanel.querySelector('#uvm-speed-val');

      this.slider.addEventListener('input', (e) => this.setSpeed(e.target.value));
      this.speedPanel.querySelector('#uvm-speed-reset').addEventListener('click', () => this.setSpeed(1.0));
    }

    showToast(msg) {
      this.toast.textContent = msg;
      this.toast.style.opacity = '1';
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toast.style.opacity = '0';
      }, 1200);
    }

    setSpeed(rate) {
      if (!this.videoEl) return;
      const num = parseFloat(rate);
      try {
        this.videoEl.preservesPitch = true;
        this.videoEl.playbackRate = num;
      } catch (err) {
        console.warn('Unable to set playback rate:', err);
      }
      this.slider.value = num;
      this.speedVal.textContent = num.toFixed(2) + 'x';
    }

    resetIdleTimer() {
      this.speedPanel.classList.remove('uvm-idle');
      clearTimeout(this.idleTimer);
      if (this.isActive) {
        this.idleTimer = setTimeout(() => {
          if (this.isActive) {
            this.speedPanel.classList.add('uvm-idle');
          }
        }, 3000);
      }
    }

    clearIdleTimer() {
      clearTimeout(this.idleTimer);
      this.speedPanel.classList.remove('uvm-idle');
    }

    findTarget() {
      // Iframes are candidates too: a game or player embedded from another origin is only
      // reachable by maximizing the frame, then asking the frame to maximize its own media.
      const elements = Array.from(document.querySelectorAll('video, canvas, embed, object, iframe'));
      if (elements.length === 0) return null;

      // 1. Prioritize any video currently playing and visible
      const playingVideo = elements.find(el =>
        el.tagName === 'VIDEO' &&
        !el.paused &&
        !el.ended &&
        el.readyState > 2 &&
        el.offsetWidth > 50 &&
        el.offsetHeight > 50
      );

      let best = playingVideo || null;

      // 2. Otherwise pick the largest media element by area (ignore tracking pixels < 2500px)
      if (!best) {
        let maxArea = 2500;
        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
          const area = rect.width * rect.height;
          if (area > maxArea) {
            maxArea = area;
            best = el;
          }
        });
      }

      if (!best) return null;

      // 3. Detect known video player container wrappers
      const wrapper = best.closest(
        '.html5-video-player, #movie_player, .video-player, .vp-video-wrapper, .video-js, [class*="video-player"], [class*="media-player"]'
      );

      return {
        target: wrapper || this.findPlayerBox(best),
        media: best,
        videoEl: best.tagName === 'VIDEO' ? best : null
      };
    }

    // Walk up while the parent is the same box as the media element. That box is the
    // player: it holds stacked canvas layers and HUD/control overlays that must survive.
    findPlayerBox(el) {
      if (el.tagName === 'IFRAME') return el;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return el;

      const sameBox = (r) => Math.abs(r.width - rect.width) <= 4 && Math.abs(r.height - rect.height) <= 4;
      let box = el;
      let parent = el.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        if (!sameBox(parent.getBoundingClientRect())) break;
        box = parent;
        parent = parent.parentElement;
      }
      return box;
    }

    // Media inside the maximized box that matches the main media's size (e.g. stacked
    // canvas layers) is stretched with it; small extras like minimaps are left alone.
    markFillElements(media) {
      if (this.target === media) return;
      const rect = media.getBoundingClientRect();
      const sameBox = (r) => Math.abs(r.width - rect.width) <= 4 && Math.abs(r.height - rect.height) <= 4;
      this.target.querySelectorAll('video, canvas').forEach(el => {
        if (el !== media && !sameBox(el.getBoundingClientRect())) return;
        el.classList.add('uvm-fill');
        for (let p = el.parentElement; p && p !== this.target; p = p.parentElement) {
          p.classList.add('uvm-fill-path');
        }
      });
    }

    // Many canvas engines only re-layout on window resize; nudge them after the box changes.
    notifyResize() {
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    }

    postToFrame(iframe, type) {
      try {
        iframe.contentWindow?.postMessage({ __uvm: type }, '*');
      } catch (err) {
        // Frame detached; nothing to forward to.
      }
    }

    toggle() {
      if (this.isActive) return this.restore();

      const found = this.findTarget();
      if (!found) return this.quiet || this.showToast('⚠️ No active media found');

      this.target = found.target;
      this.setVideoEl(found.videoEl);
      this.media = found.media;
      this.isActive = true;

      // Highlight animation
      this.target.classList.remove('uvm-highlighted');
      void this.target.offsetWidth;
      this.target.classList.add('uvm-highlighted');

      this.tagAncestors();
      document.documentElement.classList.add('uvm-active');

      // Responsive sites (YouTube below ~1000px) move the player to another container
      // on resize; re-tag so the new parents aren't hidden by the sibling rule.
      // A container anywhere above the player may move, so check the whole chain.
      this.domObserver = new MutationObserver(() => this.repairLayout());
      this.domObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });

      // Maximize the target
      this.target.classList.add('uvm-maximized');
      this.markFillElements(found.media);

      // Preserve existing body overflow
      this.prevBodyOverflow = document.body ? document.body.style.overflow : '';
      if (document.body) {
        document.body.style.setProperty('overflow', 'hidden', 'important');
      }

      if (this.videoEl) {
        this.setSpeed(this.videoEl.playbackRate || 1.0);
        this.speedPanel.classList.add('visible');
        this.resetIdleTimer();
      }

      if (this.target.tagName === 'IFRAME') {
        this.postToFrame(this.target, 'maximize');
      }
      this.notifyResize();

      if (!this.quiet) this.showToast('Windowed Fullscreen: ON');
    }

    setVideoEl(videoEl) {
      this.videoEl?.removeEventListener('ratechange', this.rateChangeHandler);
      this.videoEl = videoEl;
      this.videoEl?.addEventListener('ratechange', this.rateChangeHandler);
    }

    // Every element from el up to (not including) stop carries cls.
    chainHasClass(el, stop, cls) {
      for (let p = el; p && p !== stop; p = p.parentElement) {
        if (!p.classList.contains(cls)) return false;
      }
      return true;
    }

    repairLayout() {
      if (!this.target?.isConnected) return this.restore();

      if (!this.chainHasClass(this.target.parentElement, document.documentElement, 'uvm-ancestor')) {
        this.tagAncestors();
      }

      if (this.media && this.media !== this.target) {
        // The player may swap in a new <video> or rebuild its wrappers on resize.
        if (!this.target.contains(this.media)) {
          const replacement = this.target.querySelector(this.media.tagName);
          if (!replacement) return;
          this.setVideoEl(replacement.tagName === 'VIDEO' ? replacement : null);
          this.media = replacement;
        }
        const filled = this.media.classList.contains('uvm-fill') &&
          this.chainHasClass(this.media.parentElement, this.target, 'uvm-fill-path');
        if (!filled) {
          this.target.querySelectorAll('.uvm-fill, .uvm-fill-path').forEach(el => el.classList.remove('uvm-fill', 'uvm-fill-path'));
          this.markFillElements(this.media);
        }
      }
    }

    // Tag ancestors exclusively (target itself receives .uvm-maximized, NOT .uvm-ancestor)
    tagAncestors() {
      document.querySelectorAll('.uvm-ancestor').forEach(el => el.classList.remove('uvm-ancestor'));
      let curr = this.target.parentElement;
      while (curr && curr !== document.documentElement) {
        curr.classList.add('uvm-ancestor');
        curr = curr.parentElement;
      }
    }

    restore() {
      if (!this.isActive) return;

      this.domObserver?.disconnect();
      this.domObserver = null;

      // Clean up ancestor tags and active state
      document.querySelectorAll('.uvm-ancestor').forEach(el => el.classList.remove('uvm-ancestor'));
      document.documentElement.classList.remove('uvm-active');

      if (this.target) {
        this.target.classList.remove('uvm-maximized', 'uvm-highlighted');
        this.target.querySelectorAll('.uvm-fill, .uvm-fill-path').forEach(el => el.classList.remove('uvm-fill', 'uvm-fill-path'));
        if (this.target.tagName === 'IFRAME') {
          this.postToFrame(this.target, 'restore');
        }
      }

      if (document.body) {
        if (this.prevBodyOverflow) {
          document.body.style.overflow = this.prevBodyOverflow;
        } else {
          document.body.style.removeProperty('overflow');
        }
      }

      this.setVideoEl(null);

      this.speedPanel.classList.remove('visible');
      this.clearIdleTimer();

      this.isActive = false;
      this.target = null;
      this.videoEl = null;
      this.media = null;
      this.notifyResize();

      if (!this.quiet) this.showToast('Windowed Fullscreen: OFF');
    }

    // In a subframe, the decision belongs to the top frame: it maximizes this frame's
    // <iframe> and then sends 'maximize' down so we fill the frame with our own media.
    requestToggle() {
      if (this.isActive || window === window.top) return this.toggle();
      window.top.postMessage({ __uvm: 'toggle' }, '*');
    }

    bindEvents() {
      // Keyboard shortcuts
      document.addEventListener('keydown', (e) => {
        // Normalize KeyF check across OS layouts (Option/Alt on macOS generates 'ƒ' or 'Ï')
        const isKeyF = e.code === 'KeyF' ||
                       (e.key && e.key.toLowerCase() === 'f') ||
                       e.key === 'ƒ' ||
                       e.key === 'Ï';

        // macOS combinations:
        // - Cmd + Option + F (⌘ + ⌥ + F)
        // - Cmd + Shift + F (⌘ + ⇧ + F)
        // - Ctrl + Cmd + F (⌃ + ⌘ + F)
        const isMacShortcut = (e.metaKey && e.altKey && isKeyF) ||
                              (e.metaKey && e.shiftKey && isKeyF) ||
                              (e.ctrlKey && e.metaKey && isKeyF);

        // Cross-platform / Windows / Linux combinations:
        // - Alt + Shift + F (Option + Shift + F)
        // - Ctrl + Alt + F (Control + Option + F)
        const isStandardShortcut = (e.altKey && e.shiftKey && isKeyF) ||
                                   (e.ctrlKey && e.altKey && isKeyF);

        if (isMacShortcut || isStandardShortcut) {
          e.preventDefault();
          this.requestToggle();
        }

        // Exit on Escape (a maximized subframe asks the top frame to restore everything)
        if (e.key === 'Escape' && this.isActive) {
          e.preventDefault();
          if (window === window.top) this.restore();
          else window.top.postMessage({ __uvm: 'toggle' }, '*');
        }
      });

      // Cross-frame protocol: subframes ask top to toggle; parents tell children to fill.
      window.addEventListener('message', (e) => {
        const type = e.data?.__uvm;
        if (!type) return;
        if (type === 'toggle' && window === window.top) {
          this.toggle();
        } else if (e.source === window.parent && window !== window.top) {
          this.quiet = true;
          if (type === 'maximize' && !this.isActive) this.toggle();
          if (type === 'restore') this.restore();
          this.quiet = false;
        }
      });

      // Mousemove resets the speed panel idle timer
      document.addEventListener('mousemove', () => {
        if (this.isActive) this.resetIdleTimer();
      }, { passive: true });

      // Extension message bridge
      if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
          if (request.action === 'TOGGLE_MAXIMIZER' && window === window.top) {
            this.toggle();
            sendResponse?.({ success: true, active: this.isActive });
          }
        });
      }
    }
  }

  // Initialize
  if (typeof window !== 'undefined') {
    window.__UVM_INSTANCE__ = new MediaMaximizer();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MediaMaximizer };
  }
})();


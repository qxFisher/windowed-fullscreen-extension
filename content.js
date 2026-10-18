/**
 * Universal Adaptive Media Maximizer - Content Script
 * Seamlessly isolates & maximizes video/canvas elements to windowed fullscreen.
 */

(() => {
  // Prevent duplicate instances if injected multiple times
  if (window.__UVM_INITIALIZED__) return;
  window.__UVM_INITIALIZED__ = true;

  const RECORD_SECONDS = 15;
  // Tried in order. AAC audio plays in the most players but its encoder is missing on some
  // machines, so H.264 + Opus comes next. MP4 needs Chrome 126+; older browsers get WebM.
  const RECORD_MIME_TYPES = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1,opus',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm'
  ];
  const RECORD_TICK_MS = 250;

  // 75 -> "1:15", 3725 -> "1:02:05"
  const formatTime = (seconds) => {
    const t = Math.max(0, Math.floor(seconds));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = String(t % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  };

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
      this.recorder = null;
      this.recordTimer = null;
      this.rangeMedia = null;

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
        <button class="uvm-btn" id="uvm-record-btn" title="Record ${RECORD_SECONDS} sec of the video (MP4)">⏺ ${RECORD_SECONDS}s</button>
        <button class="uvm-btn" id="uvm-range-btn" title="Download the whole video or a part of it (MP4)">⬇</button>
      `;

      // Download panel: start/end sliders over the video's timeline
      this.rangePanel = document.createElement('div');
      this.rangePanel.id = 'uvm-range-panel';
      this.rangePanel.className = 'uvm-ui';
      this.rangePanel.innerHTML = `
        <div class="uvm-range-row">
          <strong>⬇ Download video</strong>
          <span id="uvm-range-len"></span>
          <button class="uvm-btn" id="uvm-range-close" title="Close (a running download continues)">✕</button>
        </div>
        <label class="uvm-range-row">Start <input type="range" id="uvm-range-start" min="0" step="0.1" value="0"> <span id="uvm-range-start-val">0:00</span></label>
        <label class="uvm-range-row">End <input type="range" id="uvm-range-end" min="0" step="0.1" value="0"> <span id="uvm-range-end-val">0:00</span></label>
        <div class="uvm-range-row">
          <span id="uvm-range-status"></span>
          <button class="uvm-btn" id="uvm-range-full">Whole video</button>
          <button class="uvm-btn" id="uvm-range-go">⬇ Download</button>
        </div>
      `;

      // Prevent interactions inside our panels from bubbling to video player controls
      [this.speedPanel, this.rangePanel].forEach(panel => {
        ['click', 'mousedown', 'pointerdown', 'keydown'].forEach(evt => {
          panel.addEventListener(evt, e => e.stopPropagation());
        });
      });

      const root = document.body || document.documentElement;
      root.appendChild(this.toast);
      root.appendChild(this.speedPanel);
      root.appendChild(this.rangePanel);

      this.slider = this.speedPanel.querySelector('#uvm-speed-slider');
      this.speedVal = this.speedPanel.querySelector('#uvm-speed-val');

      this.slider.addEventListener('input', (e) => this.setSpeed(e.target.value));
      this.speedPanel.querySelector('#uvm-speed-reset').addEventListener('click', () => this.setSpeed(1.0));
      this.recordBtn = this.speedPanel.querySelector('#uvm-record-btn');
      this.recordBtn.addEventListener('click', () => this.recordClip());
      this.speedPanel.querySelector('#uvm-range-btn').addEventListener('click', () => this.openRangePanel());

      const $ = (id) => this.rangePanel.querySelector(id);
      this.rangeStart = $('#uvm-range-start');
      this.rangeEnd = $('#uvm-range-end');
      this.rangeStartVal = $('#uvm-range-start-val');
      this.rangeEndVal = $('#uvm-range-end-val');
      this.rangeLen = $('#uvm-range-len');
      this.rangeStatus = $('#uvm-range-status');
      this.rangeGo = $('#uvm-range-go');

      const onSlide = (moved) => this.setRange(parseFloat(this.rangeStart.value), parseFloat(this.rangeEnd.value), moved);
      this.rangeStart.addEventListener('input', () => onSlide('start'));
      this.rangeEnd.addEventListener('input', () => onSlide('end'));
      // Releasing a handle previews that moment in the video.
      [this.rangeStart, this.rangeEnd].forEach(slider => slider.addEventListener('change', () => {
        if (this.rangeMedia && !this.recorder) this.rangeMedia.currentTime = parseFloat(slider.value);
      }));
      $('#uvm-range-full').addEventListener('click', () => this.setRange(0, parseFloat(this.rangeEnd.max)));
      $('#uvm-range-close').addEventListener('click', () => this.closeRangePanel());
      this.rangeGo.addEventListener('click', () => this.recordRange());
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

    // A right-clicked video wins; otherwise the maximized media, otherwise the same pick
    // the maximizer would make. An iframe result means the media lives in that frame.
    findRecordTarget(srcUrl) {
      if (srcUrl) {
        const clicked = Array.from(document.querySelectorAll('video')).find(v => v.currentSrc === srcUrl || v.src === srcUrl);
        if (clicked) return clicked;
      }
      if (this.isActive && this.media) return this.media;
      return this.findTarget()?.media || null;
    }

    // Records RECORD_SECONDS of the media's own frames (no screen-share prompt) and saves it.
    recordClip(srcUrl) {
      if (this.recorder || this.recordStarting) return this.showToast('⏺ Already recording');

      const media = this.findRecordTarget(srcUrl);
      if (!media) return this.showToast('⚠️ No active media found');
      if (media.tagName === 'IFRAME') return this.postToFrame(media, 'record');
      if (media.tagName === 'VIDEO' && (media.paused || media.ended)) {
        return this.showToast('⚠️ Press play first, then record');
      }
      this.startRecording(media, { seconds: RECORD_SECONDS });
    }

    // Opens the start/end sliders for downloading the whole video or a part of it.
    openRangePanel(srcUrl) {
      const media = this.findRecordTarget(srcUrl);
      if (!media) return this.showToast('⚠️ No active media found');
      if (media.tagName === 'IFRAME') return this.postToFrame(media, 'range');
      if (media.tagName !== 'VIDEO') return this.showToast(`⚠️ Only videos have a timeline; use ⏺ ${RECORD_SECONDS}s instead`);
      if (!Number.isFinite(media.duration) || media.duration <= 0) {
        return this.showToast(`⚠️ Live streams have no fixed length; use ⏺ ${RECORD_SECONDS}s instead`);
      }

      if (!this.recorder) {
        this.rangeMedia = media;
        const duration = Math.floor(media.duration * 10) / 10;
        [this.rangeStart, this.rangeEnd].forEach(slider => { slider.max = duration; });
        this.setRange(0, duration);
      }
      this.rangePanel.classList.add('visible');
    }

    closeRangePanel() {
      this.rangePanel.classList.remove('visible');
    }

    // Keeps start < end (at least 1s apart) and the labels in sync with the sliders.
    setRange(start, end, moved) {
      const max = parseFloat(this.rangeEnd.max) || 0;
      start = Math.min(Math.max(0, start), max);
      end = Math.min(Math.max(0, end), max);
      if (end - start < 1) {
        if (moved === 'end') start = Math.max(0, end - 1);
        else end = Math.min(max, start + 1);
      }
      this.rangeStart.value = start;
      this.rangeEnd.value = end;
      this.rangeStartVal.textContent = formatTime(start);
      this.rangeEndVal.textContent = formatTime(end);
      this.rangeLen.textContent = `${formatTime(end - start)} selected`;
    }

    async recordRange() {
      if (this.recordStarting) return;
      if (this.recorder) return this.stopRecording?.();
      const media = this.rangeMedia;
      if (!media?.isConnected) {
        this.closeRangePanel();
        return this.showToast('⚠️ The video is gone; open the download panel again');
      }
      const start = parseFloat(this.rangeStart.value);
      const end = Math.min(parseFloat(this.rangeEnd.value), media.duration);

      this.rangeStatus.textContent = 'Seeking to start…';
      if (Math.abs(media.currentTime - start) > 0.25) {
        await new Promise(resolve => {
          media.addEventListener('seeked', resolve, { once: true });
          setTimeout(resolve, 5000);
          media.currentTime = start;
        });
      }
      try {
        await media.play();
      } catch (err) {
        this.rangeStatus.textContent = '';
        return this.showToast('⚠️ Press play first, then download');
      }
      this.startRecording(media, { start, end });
    }

    // Chrome keeps adding tracks to a <video>'s captured stream for a moment after
    // captureStream() returns (seen on YouTube). Resolves once the track set has been quiet
    // for 300ms, or after 1.5s at most.
    settleStream(stream) {
      if (!stream.addEventListener) return Promise.resolve();
      return new Promise(resolve => {
        let quiet;
        const done = () => {
          clearTimeout(quiet);
          clearTimeout(cap);
          stream.removeEventListener('addtrack', bump);
          stream.removeEventListener('removetrack', bump);
          resolve();
        };
        const bump = () => {
          clearTimeout(quiet);
          quiet = setTimeout(done, 300);
        };
        const cap = setTimeout(done, 1500);
        stream.addEventListener('addtrack', bump);
        stream.addEventListener('removetrack', bump);
        bump();
      });
    }

    // Shared recorder. { seconds } records that much playback; { start, end } records
    // until the video reaches `end`. Pausing the video pauses the recording either way.
    async startRecording(media, { seconds, start, end }) {
      if (this.recorder || this.recordStarting) return this.showToast('⏺ Already recording');
      if (typeof media.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
        return this.showToast('⚠️ This media cannot be recorded');
      }
      const isVideo = media.tagName === 'VIDEO';
      const isRange = end != null;

      // Timestamped events, printed if the recording comes out empty.
      const t0 = performance.now();
      const trace = [];
      const log = (msg) => trace.push(`${Math.round(performance.now() - t0)}ms ${msg}`);
      const describeTracks = (s) => s.getTracks().map(t => `${t.kind}:${t.readyState}${t.muted ? ':muted' : ''}`).join(',');
      const watchTrack = (t) => t.addEventListener?.('ended', () => log(`${t.kind} track ended`));

      // Never stop the captured tracks: for a <video> playing a MediaStream (webcam, WebRTC,
      // canvas streams) captureStream() hands back the page's own tracks.
      let stream;
      try {
        // Cross-origin video and tainted canvases refuse capture.
        stream = media.captureStream();
      } catch (err) {
        console.warn('Universal Adaptive Media Maximizer: unable to record media', err);
        this.rangeStatus.textContent = '';
        return this.showToast('⚠️ This media is protected and cannot be recorded');
      }
      log(`captured ${describeTracks(stream)}`);
      stream.getTracks().forEach(watchTrack);
      stream.addEventListener?.('addtrack', (e) => { log(`addtrack ${e.track.kind}`); watchTrack(e.track); });
      stream.addEventListener?.('removetrack', (e) => log(`removetrack ${e.track.kind}`));

      this.recordStarting = true;
      await this.settleStream(stream);
      this.recordStarting = false;
      log(`settled ${describeTracks(stream)}`);
      if (!stream.getTracks().some(t => t.readyState === 'live')) {
        console.warn(`Universal Adaptive Media Maximizer: no live tracks to record ${JSON.stringify(trace)}`);
        this.rangeStatus.textContent = '';
        return this.showToast('⚠️ This media is protected and cannot be recorded');
      }

      const candidates = RECORD_MIME_TYPES.filter(t => MediaRecorder.isTypeSupported(t));
      const chunks = [];
      // A looping video could wrap back to 0 before the end check sees it.
      const wasLooping = isVideo && media.loop;
      let recorder = null;
      let recordedMs = 0;
      let failure = '';
      const decodedFrames = () => media.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
      const framesAtStart = isVideo ? decodedFrames() : 0;
      // Set when we end the recording (time up, video ended, Stop & save), so a recorder
      // that stops on its own can be told apart from one we stopped.
      let stopRequested = false;
      const stop = () => {
        stopRequested = true;
        return recorder.state !== 'inactive' && recorder.stop();
      };
      const onPause = () => recorder.state === 'recording' && recorder.pause();
      const onPlay = () => recorder.state === 'paused' && recorder.resume();
      const progress = () => isRange
        ? Math.min(1, Math.max(0, (media.currentTime - start) / (end - start)))
        : recordedMs / (seconds * 1000);
      const showStatus = () => {
        const paused = recorder.state === 'paused';
        const percent = Math.floor(progress() * 100);
        this.setBadge(`${percent}%`);
        if (isRange) {
          this.rangeStatus.textContent = `${paused ? '⏸ Paused' : '⏺ Recording'} ${formatTime(media.currentTime - start)} / ${formatTime(end - start)} (${percent}%)`;
        } else {
          const left = Math.ceil(seconds - recordedMs / 1000);
          this.showToast(paused ? `⏸ Recording paused (${left}s left)` : `⏺ Recording… ${left}s`);
        }
      };

      const finish = () => {
        clearInterval(this.recordTimer);
        this.recordTimer = null;
        this.recorder = null;
        this.stopRecording = null;
        this.setBadge('');
        this.recordBtn.classList.remove('uvm-recording');
        this.rangePanel.classList.remove('uvm-recording');
        this.rangeGo.textContent = '⬇ Download';
        this.rangeStatus.textContent = '';
        if (isRange && wasLooping) media.loop = true;
        if (isVideo) {
          media.removeEventListener('pause', onPause);
          media.removeEventListener('play', onPlay);
          media.removeEventListener('ended', stop);
        }

        if (!chunks.length) {
          const newFrames = isVideo ? decodedFrames() - framesAtStart : null;
          // A string, not an object: DevTools and log scrapers show objects as "Object".
          console.warn(`Universal Adaptive Media Maximizer: nothing was recorded ${JSON.stringify({
            failure,
            mimeType: recorder.mimeType,
            tracks: describeTracks(stream),
            newFrames,
            trace
          })}`);
          const reason = failure || (newFrames === 0 ? 'the video showed no new frames' : '');
          return this.showToast(`⚠️ Nothing was recorded${reason ? ` (${reason})` : ''}`);
        }
        const type = recorder.mimeType || 'video/webm';
        const label = isRange ? `${formatTime(start)}–${formatTime(media.currentTime)}` : `${seconds}s`;
        this.saveClip(new Blob(chunks, { type }), type.startsWith('video/mp4') ? 'mp4' : 'webm', label);
      };

      // isTypeSupported() can approve a format whose encoder then refuses to start (AAC on
      // some Windows machines). The page's world sees an EncodingError, but in a content
      // script the recorder just stops a few ms in with no error event. Either way, a
      // recorder that ends before producing any data hands over to the next format.
      const begin = () => {
        while (candidates.length) {
          const mimeType = candidates.shift();
          try {
            const next = new MediaRecorder(stream, { mimeType });
            next.ondataavailable = (e) => {
              if (chunks.length < 3) log(`data ${e.data.size}`);
              if (e.data.size) chunks.push(e.data);
            };
            next.onerror = (e) => {
              failure = e.error?.name || 'recorder error';
              log(`error ${failure}`);
              console.warn(`Universal Adaptive Media Maximizer: recording as ${mimeType} failed`, e.error || e);
              if (next.state !== 'inactive') next.stop();
            };
            next.onstop = () => {
              log('stop');
              if (!chunks.length && !stopRequested) {
                failure = failure || `encoder refused ${mimeType}`;
                if (begin()) return;
              }
              finish();
            };
            // Timeslice: data arrives every second, so a recorder that fails midway still
            // leaves a partial clip instead of nothing.
            next.start(1000);
            log(`start ${mimeType}`);
            recorder = this.recorder = next;
            return true;
          } catch (err) {
            failure = err.name || 'recorder error';
            console.warn(`Universal Adaptive Media Maximizer: cannot record as ${mimeType}`, err);
          }
        }
        return false;
      };

      if (!begin()) {
        this.rangeStatus.textContent = '';
        return this.showToast('⚠️ This media cannot be recorded in this browser');
      }
      this.stopRecording = stop;

      if (isVideo) {
        media.addEventListener('pause', onPause);
        media.addEventListener('play', onPlay);
        media.addEventListener('ended', stop);
      }
      if (isRange) {
        if (wasLooping) media.loop = false;
        this.rangePanel.classList.add('uvm-recording');
        this.rangeGo.textContent = '■ Stop & save';
      } else {
        this.recordBtn.classList.add('uvm-recording');
      }
      showStatus();
      // Only time spent actually recording counts toward the clip length.
      this.recordTimer = setInterval(() => {
        if (recorder.state === 'recording') recordedMs += RECORD_TICK_MS;
        if (isRange ? media.currentTime >= end : recordedMs >= seconds * 1000) return stop();
        showStatus();
      }, RECORD_TICK_MS);
    }

    // Progress on the toolbar icon, so a long download can be followed from other tabs.
    setBadge(text) {
      try {
        chrome.runtime?.sendMessage?.({ action: 'RECORD_PROGRESS', text })?.catch?.(() => {});
      } catch (err) {
        // Userscript, or the extension was reloaded under this page: no badge then.
      }
    }

    saveClip(blob, ext, label) {
      const title = (document.title || '').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'video';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const url = URL.createObjectURL(blob);
      // Detached link: the click can't bubble into SPA routers or player handlers.
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title} ${label.replace(/[:–]/g, m => (m === ':' ? '.' : '-'))} ${stamp}.${ext}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      this.showToast(ext === 'mp4'
        ? `✅ Saved ${label} clip (MP4)`
        : `✅ Saved ${label} clip as WebM (this browser cannot record MP4)`);
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
          if (type === 'record') return this.recordClip();
          if (type === 'range') return this.openRangePanel();
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
          // The background already picked the frame (top, or the right-clicked video's frame).
          if (request.action === 'RECORD_CLIP') {
            this.recordClip(request.srcUrl);
            sendResponse?.({ success: true });
          }
          if (request.action === 'OPEN_RANGE_PANEL') {
            this.openRangePanel(request.srcUrl);
            sendResponse?.({ success: true });
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


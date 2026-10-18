import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('MediaMaximizer Content Script', () => {
  let MediaMaximizer;
  let maximizer;

  beforeEach(async () => {
    // Reset DOM
    document.documentElement.className = '';
    document.body.className = '';
    document.body.innerHTML = '';
    document.body.style.overflow = '';
    delete window.__UVM_INITIALIZED__;
    delete window.__UVM_INSTANCE__;

    // Mock chrome APIs
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn()
        }
      }
    };

    // Re-import module
    vi.resetModules();
    const mod = await import('../content.js');
    MediaMaximizer = mod.MediaMaximizer;
    maximizer = window.__UVM_INSTANCE__;
  });

  afterEach(() => {
    if (maximizer?.isActive) {
      maximizer.restore();
    }
    vi.clearAllTimers();
  });

  it('initializes UI elements and appends them to DOM', () => {
    expect(document.getElementById('uvm-toast')).toBeTruthy();
    expect(document.getElementById('uvm-speed-panel')).toBeTruthy();
    expect(document.getElementById('uvm-speed-slider')).toBeTruthy();
    expect(document.getElementById('uvm-speed-val')).toBeTruthy();
    expect(document.getElementById('uvm-speed-reset')).toBeTruthy();
  });

  it('prioritizes currently playing video over paused video', () => {
    const pausedVideo = document.createElement('video');
    Object.defineProperty(pausedVideo, 'paused', { value: true, configurable: true });
    Object.defineProperty(pausedVideo, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(pausedVideo, 'offsetHeight', { value: 360, configurable: true });
    document.body.appendChild(pausedVideo);

    const playingVideo = document.createElement('video');
    Object.defineProperty(playingVideo, 'paused', { value: false, configurable: true });
    Object.defineProperty(playingVideo, 'ended', { value: false, configurable: true });
    Object.defineProperty(playingVideo, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(playingVideo, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(playingVideo, 'offsetHeight', { value: 360, configurable: true });
    document.body.appendChild(playingVideo);

    const found = maximizer.findTarget();
    expect(found).toBeTruthy();
    expect(found.target).toBe(playingVideo);
    expect(found.videoEl).toBe(playingVideo);
  });

  it('detects video player wrapper container if present', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'html5-video-player';
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 800, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 450, configurable: true });
    wrapper.appendChild(video);
    document.body.appendChild(wrapper);

    const found = maximizer.findTarget();
    expect(found.target).toBe(wrapper);
    expect(found.videoEl).toBe(video);
  });

  it('falls back to largest canvas if no active video exists', () => {
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
    document.body.appendChild(canvas);

    const found = maximizer.findTarget();
    expect(found.target).toBe(canvas);
    expect(found.videoEl).toBeNull();
  });

  it('toggles windowed fullscreen on and off', () => {
    const container = document.createElement('div');
    container.className = 'section-container';
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
    container.appendChild(video);
    document.body.appendChild(container);

    // Toggle ON
    maximizer.toggle();
    expect(maximizer.isActive).toBe(true);
    expect(video.classList.contains('uvm-maximized')).toBe(true);
    expect(container.classList.contains('uvm-ancestor')).toBe(true);
    expect(document.documentElement.classList.contains('uvm-active')).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(maximizer.speedPanel.classList.contains('visible')).toBe(true);

    // Toggle OFF
    maximizer.toggle();
    expect(maximizer.isActive).toBe(false);
    expect(video.classList.contains('uvm-maximized')).toBe(false);
    expect(container.classList.contains('uvm-ancestor')).toBe(false);
    expect(document.documentElement.classList.contains('uvm-active')).toBe(false);
    expect(document.body.style.overflow).not.toBe('hidden');
    expect(maximizer.speedPanel.classList.contains('visible')).toBe(false);
  });

  it('maximizes the same-size container so stacked canvas layers stay together', () => {
    const box = document.createElement('div');
    const base = document.createElement('canvas');
    const layer = document.createElement('canvas');
    const minimap = document.createElement('canvas');
    const rect = (w, h) => () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h });
    box.getBoundingClientRect = rect(800, 600);
    base.getBoundingClientRect = rect(800, 600);
    layer.getBoundingClientRect = rect(800, 600);
    minimap.getBoundingClientRect = rect(100, 100);
    box.append(base, layer, minimap);
    document.body.appendChild(box);

    maximizer.toggle();
    expect(box.classList.contains('uvm-maximized')).toBe(true);
    expect(base.classList.contains('uvm-fill')).toBe(true);
    expect(layer.classList.contains('uvm-fill')).toBe(true);
    expect(minimap.classList.contains('uvm-fill')).toBe(false);

    maximizer.restore();
    expect(document.querySelectorAll('.uvm-fill').length).toBe(0);
  });

  it('stretches wrappers between the player and its video (YouTube layout)', () => {
    const player = document.createElement('div');
    player.className = 'html5-video-player';
    const container = document.createElement('div');
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 854, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 480, configurable: true });
    container.appendChild(video);
    player.appendChild(container);
    document.body.appendChild(player);

    maximizer.toggle();
    expect(player.classList.contains('uvm-maximized')).toBe(true);
    expect(video.classList.contains('uvm-fill')).toBe(true);
    expect(container.classList.contains('uvm-fill-path')).toBe(true);

    maximizer.restore();
    expect(container.classList.contains('uvm-fill-path')).toBe(false);
    expect(video.classList.contains('uvm-fill')).toBe(false);
  });

  it('re-tags ancestors when the page moves the player to another container', async () => {
    const oldHome = document.createElement('div');
    const newHome = document.createElement('div');
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
    oldHome.appendChild(video);
    document.body.append(oldHome, newHome);

    maximizer.toggle();
    expect(oldHome.classList.contains('uvm-ancestor')).toBe(true);

    newHome.appendChild(video);
    await new Promise(r => setTimeout(r, 0));
    expect(newHome.classList.contains('uvm-ancestor')).toBe(true);
    expect(oldHome.classList.contains('uvm-ancestor')).toBe(false);
    expect(maximizer.isActive).toBe(true);
  });

  it('re-tags ancestors when a container above the player moves (YouTube resize)', async () => {
    const columns = document.createElement('div');
    const fullBleed = document.createElement('div');
    const ytdPlayer = document.createElement('div');
    const player = document.createElement('div');
    player.className = 'html5-video-player';
    const container = document.createElement('div');
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
    container.appendChild(video);
    player.appendChild(container);
    ytdPlayer.appendChild(player);
    columns.appendChild(ytdPlayer);
    document.body.append(fullBleed, columns);

    maximizer.toggle();
    expect(columns.classList.contains('uvm-ancestor')).toBe(true);

    // Player's direct parent keeps its tag; only the chain above it changes
    fullBleed.appendChild(ytdPlayer);
    await new Promise(r => setTimeout(r, 0));
    expect(fullBleed.classList.contains('uvm-ancestor')).toBe(true);
    expect(columns.classList.contains('uvm-ancestor')).toBe(false);

    // Player rebuilds the wrapper around the video
    const newContainer = document.createElement('div');
    newContainer.appendChild(video);
    player.replaceChildren(newContainer);
    await new Promise(r => setTimeout(r, 0));
    expect(newContainer.classList.contains('uvm-fill-path')).toBe(true);
    expect(video.classList.contains('uvm-fill')).toBe(true);
  });

  it('maximizes a large iframe and tells it to maximize its own media', () => {
    const iframe = document.createElement('iframe');
    iframe.getBoundingClientRect = () => ({ width: 960, height: 540, top: 0, left: 0, right: 960, bottom: 540 });
    document.body.appendChild(iframe);
    const post = vi.spyOn(iframe.contentWindow, 'postMessage');

    maximizer.toggle();
    expect(iframe.classList.contains('uvm-maximized')).toBe(true);
    expect(post).toHaveBeenCalledWith({ __uvm: 'maximize' }, '*');

    maximizer.restore();
    expect(post).toHaveBeenCalledWith({ __uvm: 'restore' }, '*');
  });

  it('adjusts playback speed and synchronizes controls', () => {
    const video = document.createElement('video');
    video.playbackRate = 1.0;
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
    document.body.appendChild(video);

    maximizer.toggle();

    // Set speed to 2.25x
    maximizer.setSpeed(2.25);
    expect(video.playbackRate).toBe(2.25);
    expect(maximizer.slider.value).toBe('2.25');
    expect(maximizer.speedVal.textContent).toBe('2.25x');

    // Click Reset button
    const resetBtn = document.getElementById('uvm-speed-reset');
    resetBtn.click();
    expect(video.playbackRate).toBe(1.0);
    expect(maximizer.slider.value).toBe('1');
    expect(maximizer.speedVal.textContent).toBe('1.00x');
  });

  it('hides the speed panel after 3s idle and shows it again on mouse move', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
    document.body.appendChild(video);

    maximizer.toggle();
    expect(maximizer.speedPanel.classList.contains('uvm-idle')).toBe(false);

    vi.advanceTimersByTime(3000);
    expect(maximizer.speedPanel.classList.contains('uvm-idle')).toBe(true);

    document.dispatchEvent(new MouseEvent('mousemove'));
    expect(maximizer.speedPanel.classList.contains('uvm-idle')).toBe(false);
    vi.useRealTimers();
  });

  it('handles keyboard shortcuts (Alt+Shift+F and Escape)', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
    document.body.appendChild(video);

    // Alt + Shift + F triggers toggle
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'f',
      code: 'KeyF',
      altKey: true,
      shiftKey: true,
      bubbles: true
    }));
    expect(maximizer.isActive).toBe(true);

    // Escape restores normal view
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true
    }));
    expect(maximizer.isActive).toBe(false);
  });

  it('supports macOS keyboard combinations (Cmd+Option+F, Cmd+Shift+F, Ctrl+Cmd+F, and Option special characters)', () => {
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false, configurable: true });
    Object.defineProperty(video, 'ended', { value: false, configurable: true });
    Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
    Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
    document.body.appendChild(video);

    // 1. macOS Command + Option + F (⌘ + ⌥ + F)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      metaKey: true,
      altKey: true,
      code: 'KeyF',
      bubbles: true
    }));
    expect(maximizer.isActive).toBe(true);

    maximizer.restore();
    expect(maximizer.isActive).toBe(false);

    // 2. macOS Command + Shift + F (⌘ + ⇧ + F)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      metaKey: true,
      shiftKey: true,
      code: 'KeyF',
      bubbles: true
    }));
    expect(maximizer.isActive).toBe(true);

    maximizer.restore();
    expect(maximizer.isActive).toBe(false);

    // 3. macOS Control + Command + F (⌃ + ⌘ + F)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      ctrlKey: true,
      metaKey: true,
      code: 'KeyF',
      bubbles: true
    }));
    expect(maximizer.isActive).toBe(true);

    maximizer.restore();
    expect(maximizer.isActive).toBe(false);

    // 4. macOS Option layout character substitution (e.g. Option produces 'ƒ' symbol)
    document.dispatchEvent(new KeyboardEvent('keydown', {
      altKey: true,
      shiftKey: true,
      key: 'Ï',
      code: 'KeyF',
      bubbles: true
    }));
    expect(maximizer.isActive).toBe(true);
  });

  describe('15 second clip recording', () => {
    let track;
    let clickSpy;
    let downloads;

    class FakeRecorder {
      static isTypeSupported = (type) => type.startsWith('video/mp4');
      constructor(stream, opts) {
        this.stream = stream;
        this.mimeType = opts?.mimeType || '';
        this.state = 'inactive';
        FakeRecorder.last = this;
      }
      start() { this.state = 'recording'; }
      pause() { this.state = 'paused'; }
      resume() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new Blob(['frames']) });
        this.onstop();
      }
    }

    const makePlayingVideo = () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'paused', { value: false, configurable: true });
      Object.defineProperty(video, 'ended', { value: false, configurable: true });
      Object.defineProperty(video, 'readyState', { value: 4, configurable: true });
      Object.defineProperty(video, 'offsetWidth', { value: 640, configurable: true });
      Object.defineProperty(video, 'offsetHeight', { value: 360, configurable: true });
      video.captureStream = vi.fn(() => {
        video.lastStream = Object.assign(new EventTarget(), { getTracks: () => [track] });
        return video.lastStream;
      });
      document.body.appendChild(video);
      return video;
    };

    // The recorder starts once the captured stream's tracks have been quiet for 300ms.
    const settle = () => vi.advanceTimersByTimeAsync(300);

    beforeEach(() => {
      vi.useFakeTimers();
      FakeRecorder.last = null;
      globalThis.MediaRecorder = FakeRecorder;
      track = Object.assign(new EventTarget(), { kind: 'video', readyState: 'live', muted: false, stop: vi.fn() });
      downloads = [];
      URL.createObjectURL = vi.fn(() => 'blob:clip');
      URL.revokeObjectURL = vi.fn();
      clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        downloads.push(this.download);
      });
    });

    afterEach(() => {
      clickSpy.mockRestore();
      delete globalThis.MediaRecorder;
      vi.useRealTimers();
    });

    it('records the playing video for 15 seconds and saves it as mp4', async () => {
      const video = makePlayingVideo();

      maximizer.recordClip();
      await settle();
      expect(video.captureStream).toHaveBeenCalled();
      expect(FakeRecorder.last.mimeType).toMatch(/^video\/mp4/);
      expect(FakeRecorder.last.state).toBe('recording');
      expect(document.getElementById('uvm-record-btn').classList.contains('uvm-recording')).toBe(true);

      vi.advanceTimersByTime(14000);
      expect(downloads).toHaveLength(0);

      vi.advanceTimersByTime(1000);
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatch(/\.mp4$/);
      // The tracks may be the page's own (srcObject video); stopping them would kill its stream.
      expect(track.stop).not.toHaveBeenCalled();
      expect(maximizer.recorder).toBeNull();
      expect(document.getElementById('uvm-record-btn').classList.contains('uvm-recording')).toBe(false);
    });

    it('waits for Chrome to finish adding tracks to the captured stream before recording', async () => {
      const video = makePlayingVideo();

      maximizer.recordClip();
      await vi.advanceTimersByTimeAsync(200);
      const added = new Event('addtrack');
      added.track = track;
      video.lastStream.dispatchEvent(added);

      await vi.advanceTimersByTimeAsync(250);
      expect(FakeRecorder.last).toBeNull();
      expect(maximizer.recordClip()).toBeUndefined();
      expect(document.getElementById('uvm-toast').textContent).toBe('⏺ Already recording');

      await vi.advanceTimersByTimeAsync(50);
      expect(FakeRecorder.last.state).toBe('recording');
    });

    it('pauses the recording and countdown while the video is paused', async () => {
      const video = makePlayingVideo();

      maximizer.recordClip();
      await settle();
      vi.advanceTimersByTime(5000);
      video.dispatchEvent(new Event('pause'));
      expect(FakeRecorder.last.state).toBe('paused');

      vi.advanceTimersByTime(30000);
      expect(downloads).toHaveLength(0);

      video.dispatchEvent(new Event('play'));
      expect(FakeRecorder.last.state).toBe('recording');
      vi.advanceTimersByTime(10000);
      expect(downloads).toHaveLength(1);
    });

    it('refuses to record a paused video', () => {
      const video = makePlayingVideo();
      Object.defineProperty(video, 'paused', { value: true, configurable: true });

      maximizer.recordClip();
      expect(video.captureStream).not.toHaveBeenCalled();
      expect(document.getElementById('uvm-toast').textContent).toContain('Press play');
    });

    it('reports protected media that refuses capture', () => {
      const video = makePlayingVideo();
      video.captureStream = vi.fn(() => { throw new DOMException('cross-origin', 'SecurityError'); });
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      maximizer.recordClip();
      expect(maximizer.recorder).toBeNull();
      expect(document.getElementById('uvm-toast').textContent).toContain('protected');
    });

    // Chrome fires error, then stop, when an encoder refuses its configuration.
    const failEncoder = (rec) => {
      rec.stop = function () { this.state = 'inactive'; this.onstop(); };
      rec.onerror({ error: new DOMException('The given encoder configuration is not supported by the encoder.', 'EncodingError') });
    };

    it('falls back to the next format when the encoder rejects one (AAC on some Windows machines)', async () => {
      makePlayingVideo();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const startSpy = vi.spyOn(FakeRecorder.prototype, 'start');

      maximizer.recordClip();
      await settle();
      expect(startSpy).toHaveBeenCalledWith(1000);
      const aac = FakeRecorder.last;
      expect(aac.mimeType).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');

      failEncoder(aac);
      expect(FakeRecorder.last).not.toBe(aac);
      expect(FakeRecorder.last.mimeType).toBe('video/mp4;codecs=avc1,mp4a.40.2');

      failEncoder(FakeRecorder.last);
      expect(FakeRecorder.last.mimeType).toBe('video/mp4;codecs=avc1,opus');
      expect(maximizer.recorder).toBe(FakeRecorder.last);

      vi.advanceTimersByTime(15000);
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatch(/\.mp4$/);
      startSpy.mockRestore();
    });

    it('also falls back when the recorder stops by itself without an error (content-script world)', async () => {
      makePlayingVideo();
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      maximizer.recordClip();
      await settle();
      const aac = FakeRecorder.last;
      // Seen in Chrome's isolated world: "data 0", "stop", and no error event.
      aac.state = 'inactive';
      aac.ondataavailable({ data: new Blob([]) });
      aac.onstop();

      expect(FakeRecorder.last).not.toBe(aac);
      expect(FakeRecorder.last.state).toBe('recording');
      vi.advanceTimersByTime(15000);
      expect(downloads).toHaveLength(1);
    });

    it('explains a recording that produced no data once every format has failed', async () => {
      makePlayingVideo();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const supported = vi.spyOn(FakeRecorder, 'isTypeSupported').mockImplementation(t => t === 'video/mp4');

      maximizer.recordClip();
      await settle();
      failEncoder(FakeRecorder.last);
      // The trace is a plain string so it survives console scraping ("Object" otherwise).
      const report = warn.mock.calls.map(args => args[0]).find(msg => msg.includes('nothing was recorded'));
      expect(report).toMatch(/"trace":\[".*captured video:live.*start video\/mp4.*error EncodingError.*stop"\]/);

      expect(downloads).toHaveLength(0);
      expect(maximizer.recorder).toBeNull();
      expect(document.getElementById('uvm-toast').textContent).toBe('⚠️ Nothing was recorded (EncodingError)');
      supported.mockRestore();
    });

    describe('download range panel', () => {
      const makeSeekableVideo = (duration) => {
        const video = makePlayingVideo();
        let time = 0;
        Object.defineProperty(video, 'duration', { value: duration, configurable: true });
        Object.defineProperty(video, 'currentTime', {
          configurable: true,
          get: () => time,
          set: (t) => { time = t; video.dispatchEvent(new Event('seeked')); }
        });
        video.play = vi.fn().mockResolvedValue(undefined);
        return video;
      };
      const panel = () => document.getElementById('uvm-range-panel');
      const slider = (which) => document.getElementById(`uvm-range-${which}`);

      it('opens with the whole video selected', () => {
        makeSeekableVideo(125);

        maximizer.openRangePanel();

        expect(panel().classList.contains('visible')).toBe(true);
        expect(parseFloat(slider('start').value)).toBe(0);
        expect(parseFloat(slider('end').value)).toBe(125);
        expect(document.getElementById('uvm-range-end-val').textContent).toBe('2:05');
        expect(document.getElementById('uvm-range-len').textContent).toBe('2:05 selected');
      });

      it('keeps the start at least one second before the end', () => {
        makeSeekableVideo(60);
        maximizer.openRangePanel();

        maximizer.setRange(50, 40, 'start');
        expect(parseFloat(slider('start').value)).toBe(50);
        expect(parseFloat(slider('end').value)).toBe(51);

        maximizer.setRange(20, 10, 'end');
        expect(parseFloat(slider('start').value)).toBe(9);
        expect(parseFloat(slider('end').value)).toBe(10);
      });

      it('refuses live streams, which have no fixed length', () => {
        makeSeekableVideo(Infinity);

        maximizer.openRangePanel();

        expect(panel().classList.contains('visible')).toBe(false);
        expect(document.getElementById('uvm-toast').textContent).toContain('Live streams');
      });

      it('seeks to the start, records until the end, then saves the range', async () => {
        const video = makeSeekableVideo(300);
        maximizer.openRangePanel();
        maximizer.setRange(30, 90);

        await maximizer.recordRange();
        await settle();

        expect(video.currentTime).toBe(30);
        expect(video.play).toHaveBeenCalled();
        expect(panel().classList.contains('uvm-recording')).toBe(true);
        expect(document.getElementById('uvm-range-go').textContent).toBe('■ Stop & save');

        video.currentTime = 60;
        vi.advanceTimersByTime(250);
        expect(document.getElementById('uvm-range-status').textContent).toBe('⏺ Recording 0:30 / 1:00 (50%)');
        expect(downloads).toHaveLength(0);

        video.currentTime = 90;
        vi.advanceTimersByTime(250);
        expect(downloads).toHaveLength(1);
        expect(downloads[0]).toMatch(/ 0\.30-1\.30 .*\.mp4$/);
        expect(panel().classList.contains('uvm-recording')).toBe(false);
        expect(document.getElementById('uvm-toast').textContent).toBe('✅ Saved 0:30–1:30 clip (MP4)');
      });

      it('stops early and saves what was recorded when Stop & save is pressed', async () => {
        const video = makeSeekableVideo(300);
        maximizer.openRangePanel();

        await maximizer.recordRange();
        await settle();
        video.currentTime = 42;
        await maximizer.recordRange();

        expect(downloads).toHaveLength(1);
        expect(downloads[0]).toMatch(/ 0\.00-0\.42 /);
      });

      it('does not retry another format when the user stops before the first data arrives', async () => {
        makeSeekableVideo(300);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        maximizer.openRangePanel();

        await maximizer.recordRange();
        await settle();
        const first = FakeRecorder.last;
        first.stop = function () { this.state = 'inactive'; this.onstop(); };
        await maximizer.recordRange();

        expect(FakeRecorder.last).toBe(first);
        expect(maximizer.recorder).toBeNull();
        expect(document.getElementById('uvm-toast').textContent).toContain('Nothing was recorded');
      });
    });

    it('does not get stuck when the recorder fails to start', async () => {
      makePlayingVideo();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const startSpy = vi.spyOn(FakeRecorder.prototype, 'start').mockImplementation(() => {
        throw new DOMException('There was an error starting the MediaRecorder.', 'NotSupportedError');
      });

      maximizer.recordClip();
      await settle();
      expect(maximizer.recorder).toBeNull();
      expect(document.getElementById('uvm-record-btn').classList.contains('uvm-recording')).toBe(false);
      expect(document.getElementById('uvm-toast').textContent).toContain('cannot be recorded');

      startSpy.mockRestore();
      maximizer.recordClip();
      await settle();
      expect(FakeRecorder.last.state).toBe('recording');
    });
  });
});

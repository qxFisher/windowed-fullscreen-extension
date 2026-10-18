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
      video.captureStream = vi.fn(() => ({ getTracks: () => [track] }));
      document.body.appendChild(video);
      return video;
    };

    beforeEach(() => {
      vi.useFakeTimers();
      FakeRecorder.last = null;
      globalThis.MediaRecorder = FakeRecorder;
      track = { readyState: 'live', stop: vi.fn() };
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

    it('records the playing video for 15 seconds and saves it as mp4', () => {
      const video = makePlayingVideo();

      maximizer.recordClip();
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

    it('pauses the recording and countdown while the video is paused', () => {
      const video = makePlayingVideo();

      maximizer.recordClip();
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

    it('does not get stuck when the recorder fails to start', () => {
      makePlayingVideo();
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const startSpy = vi.spyOn(FakeRecorder.prototype, 'start').mockImplementationOnce(() => {
        throw new DOMException('There was an error starting the MediaRecorder.', 'NotSupportedError');
      });

      maximizer.recordClip();
      expect(maximizer.recorder).toBeNull();
      expect(document.getElementById('uvm-record-btn').classList.contains('uvm-recording')).toBe(false);

      maximizer.recordClip();
      expect(FakeRecorder.last.state).toBe('recording');
      startSpy.mockRestore();
    });
  });
});

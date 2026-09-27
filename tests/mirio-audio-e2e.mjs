// Focused real-WebAudio regression checks, without loading the 3D world.
// Serve the repository, then run:
//   BASE_URL=http://127.0.0.1:8766/ node tests/mirio-audio-e2e.mjs
// PLAYWRIGHT may point at an installed Playwright module outside this repo.
// BROWSER=webkit also exercises Safari's MP3 decoder and audio graph.
import assert from 'node:assert/strict';

const engines = await import(process.env.PLAYWRIGHT ?? 'playwright');
const engineName = process.env.BROWSER ?? 'chromium';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8766/';
const browser = await engines[engineName].launch({
  ...(engineName === 'chromium' ? { args: ['--autoplay-policy=no-user-gesture-required'] } : {}),
});
const results = [];
async function check(name, run) {
  try {
    await run();
    results.push(true);
    console.log(`ok   ${name}`);
  } catch (error) {
    results.push(false);
    console.error(`FAIL ${name}\n     ${error.message.split('\n')[0]}`);
  }
}

try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Keep a same-origin document for module imports and persistent storage,
  // while avoiding the game's rendering loop and external Three.js request.
  await page.route('**/audio-test.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><button id="unlock">Enable audio</button>',
  }));
  await page.goto(new URL('audio-test.html', BASE).href);
  await page.evaluate(async () => {
    const { Sound } = await import('./js/audio.js');
    window.SoundForTest = Sound;
    window.sound = new Sound();
    document.getElementById('unlock').onclick = () => window.sound.unlock();
  });
  await page.click('#unlock');
  await page.evaluate(() => window.sound.ready);

  await check('all eleven local MP3 effects decode with useful samples', async () => {
    const samples = await page.evaluate(() => Array.from(window.sound.samples, ([name, buffer]) => ({
      name, duration: buffer.duration, samples: buffer.length,
      audible: buffer.getChannelData(0).some(value => Math.abs(value) > 0.001),
    })));
    assert.equal(samples.length, 11);
    for (const sample of samples) {
      assert.ok(sample.duration > 0 && sample.duration < 3, `${sample.name}: unexpected duration`);
      assert.ok(sample.samples > 1000 && sample.audible, `${sample.name}: empty/silent decode`);
    }
  });

  await check('mute and independent mixer preferences persist and clamp safely', async () => {
    const saved = await page.evaluate(() => {
      const s = window.sound;
      s.setMusicVolume(0.43); s.setEffectsVolume(0.71); s.setVolume(0.65); s.setMuted(true);
      const copy = new window.SoundForTest();
      s.setVolume(2); s.setEffectsVolume(-2); s.setMusicVolume(NaN);
      const clamped = [s.volume, s.effectsVolume, s.musicVolume];
      s.setVolume(0.8); s.setEffectsVolume(0.85); s.setMusicVolume(0.6); s.setMuted(false);
      return { saved: [copy.volume, copy.musicVolume, copy.effectsVolume, copy.muted], clamped };
    });
    assert.deepEqual(saved.saved, [0.65, 0.43, 0.71, true]);
    assert.deepEqual(saved.clamped, [1, 0, 0.43]);
  });

  await check('pause stops the scheduler, engine and voices; resume starts cleanly', async () => {
    await page.evaluate(() => {
      const s = window.sound;
      s.startMusic(); s.play('star'); s.engine({ speed: 25, gas: 1 });
    });
    await page.waitForFunction(() => window.sound.step > 0);
    await page.evaluate(() => window.sound.setPaused(true));
    await page.waitForFunction(() => window.sound.ctx.state === 'suspended');
    const paused = await page.evaluate(() => ({
      timer: Boolean(window.sound.timer), voices: window.sound.voices.size, motor: window.sound.motor,
    }));
    assert.deepEqual(paused, { timer: false, voices: 0, motor: null });
    // Resume is bound to a gesture too, for browsers with strict autoplay.
    await page.evaluate(() => { document.getElementById('unlock').onclick = () => window.sound.setPaused(false); });
    await page.click('#unlock');
    await page.waitForFunction(() => window.sound.ctx.state === 'running' && Boolean(window.sound.timer));
    await page.evaluate(() => window.sound.stopMusic());
    assert.deepEqual(await page.evaluate(() => ({ music: window.sound.musicOn, timer: Boolean(window.sound.timer), voices: window.sound.voices.size })),
      { music: false, timer: false, voices: 0 });
  });

  await check('all five arrangements and every cue render finite, audible audio with headroom', async () => {
    const render = await page.evaluate(async () => {
      const s = new window.SoundForTest();
      s.muted = false;
      const ctx = new OfflineAudioContext(2, 22050 * 18, 22050);
      let time = 0;
      // Offline scheduling has a stationary clock. Advance only the clock
      // seen by Sound, queue everything, then let the native graph render it.
      Object.defineProperty(ctx, 'currentTime', { get: () => time, configurable: true });
      Object.defineProperty(ctx, 'state', { get: () => 'running', configurable: true });
      s.ctx = ctx; s.buildMixer(); s.noiseBuffer = s.makeNoise(); s.samples = window.sound.samples;
      s.musicOn = true; s.nextNote = 0.02;
      const scenes = ['explore', 'moon', 'boss', 'race', 'victory'];
      const cues = ['jump', 'jump2', 'triple', 'skid', 'poundStart', 'pound', 'hurt', 'roar', 'bossJump', 'slam',
        'bossHit', 'go', 'boost', 'bump', 'bossDown', 'spin', 'bit', 'land', 'board', 'beep', 'liftoff', 'flag',
        'splash', 'arrive', 'respawn', 'star', 'trailStart', 'ring', 'trailWin', 'trailFail', 'click'];
      const heard = new Set();
      let nextCue = 0;
      for (let frame = 0; frame < 340; frame++) {
        time = frame * 0.05;
        s.setScene(scenes[Math.min(4, Math.floor(time / 3.4))]);
        s.schedule();
        heard.add(s.scene);
        if (nextCue < cues.length && time >= nextCue * 0.5) s.play(cues[nextCue++]);
        // Live source.onended releases the polyphony budget as time passes.
        // Offline rendering hasn't begun yet, so emulate only that budget.
        s.voices.clear();
      }
      delete ctx.currentTime; delete ctx.state;
      const audio = await ctx.startRendering();
      let peak = 0, energy = 0, invalid = 0;
      for (let ch = 0; ch < audio.numberOfChannels; ch++) {
        for (const value of audio.getChannelData(ch)) {
          if (!Number.isFinite(value)) invalid++;
          peak = Math.max(peak, Math.abs(value));
          energy += value * value;
        }
      }
      return { scenes: [...heard], cues: nextCue, invalid, peak, rms: Math.sqrt(energy / (audio.length * 2)), cache: s.instruments.size };
    });
    assert.deepEqual(render.scenes, ['explore', 'moon', 'boss', 'race', 'victory']);
    assert.equal(render.cues, 31);
    assert.equal(render.invalid, 0);
    assert.ok(render.peak < 0.99, `clipping peak ${render.peak}`);
    assert.ok(render.rms > 0.008, `unexpectedly quiet mix ${render.rms}`);
    assert.ok(render.cache <= 24, `unbounded instrument cache ${render.cache}`);
    console.log(`     peak ${render.peak.toFixed(3)}, RMS ${render.rms.toFixed(3)}, ${render.cache} cached instruments`);
  });

  await check('offline samples and blocked storage preserve synthesized gameplay cues', async () => {
    const result = await page.evaluate(async () => {
      const storage = Object.getOwnPropertyDescriptor(window, 'localStorage');
      const originalFetch = window.fetch;
      try {
        Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
        const s = new window.SoundForTest();
        s.setMuted(false); s.setVolume(0.8); s.setMusicVolume(0.6);
        s.ctx = new OfflineAudioContext(1, 22050, 22050); s.buildMixer(); s.noiseBuffer = s.makeNoise();
        window.fetch = () => Promise.reject(new Error('Offline'));
        await s.loadSamples();
        s.play('jump'); s.play('bit'); s.play('land');
        const voices = s.voices.size;
        const audio = await s.ctx.startRendering();
        return { samples: s.samples.size, voices, audible: audio.getChannelData(0).some(value => Math.abs(value) > 0.001) };
      } finally {
        Object.defineProperty(window, 'localStorage', storage);
        window.fetch = originalFetch;
      }
    });
    assert.equal(result.samples, 0);
    assert.ok(result.voices >= 4);
    assert.ok(result.audible);
  });

  await check('teardown releases all voices and reports no browser errors', async () => {
    const clean = await page.evaluate(() => {
      window.sound.play('star'); window.sound.engine({ speed: 18, gas: 0.5 });
      window.sound.dispose();
      return { ctx: window.sound.ctx, voices: window.sound.voices.size, timer: Boolean(window.sound.timer), motor: window.sound.motor };
    });
    assert.deepEqual(clean, { ctx: null, voices: 0, timer: false, motor: null });
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} ${engineName} audio checks passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;

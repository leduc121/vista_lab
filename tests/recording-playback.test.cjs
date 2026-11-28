const test = require('node:test');
const assert = require('node:assert/strict');
const { RecordingPlayback } = require('../renderer/recording-playback');

test('simulation replay pauses, cancels on selection, honors speed, and stops at the last frame', () => {
  let nextTimer = 1;
  const callbacks = new Map();
  const delays = [];
  const cleared = [];
  const frames = [];
  const stopped = [];
  const playback = new RecordingPlayback({
    onFrame: (index) => frames.push(index),
    onStop: () => stopped.push(true),
    setIntervalFn: (callback, delay) => { const id = nextTimer++; callbacks.set(id, callback); delays.push(delay); return id; },
    clearIntervalFn: (id) => { cleared.push(id); callbacks.delete(id); }
  });

  playback.configure(3);
  assert.equal(playback.toggle(1), true);
  const firstTimer = playback.timer;
  const firstCallback = callbacks.get(firstTimer);
  firstCallback();
  assert.equal(playback.index, 1);
  playback.pause();
  assert.equal(playback.playing, false);
  firstCallback();
  assert.equal(playback.index, 1, 'a canceled timer cannot advance a replay');

  playback.toggle(1);
  playback.setSpeed(2);
  assert.equal(delays.at(-1), 50);
  callbacks.get(playback.timer)();
  assert.equal(playback.index, 2);
  assert.equal(playback.playing, false, 'playback ends at the last frame');

  playback.configure(4, 0);
  playback.toggle(0.5);
  const beforeSelection = playback.timer;
  playback.configure(2, 0);
  callbacks.get(beforeSelection)?.();
  assert.equal(playback.index, 0, 'changing recording cancels the previous replay');
  assert.ok(cleared.includes(beforeSelection));
  assert.ok(stopped.length >= 3);
  assert.throws(() => playback.toggle(3), /speed is not supported/i);
});

class RecordingPlayback {
  constructor({ onFrame = () => {}, onStop = () => {}, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
    this.onFrame = onFrame;
    this.onStop = onStop;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.timer = null;
    this.playing = false;
    this.frameCount = 0;
    this.index = 0;
    this.speed = 1;
  }

  configure(frameCount, index = 0) {
    this.cancel();
    this.frameCount = Number.isInteger(frameCount) && frameCount > 0 ? frameCount : 0;
    this.index = Math.max(0, Math.min(this.frameCount - 1, Number.isInteger(index) ? index : 0));
  }

  toggle(speed = this.speed) {
    if (this.playing) { this.pause(); return false; }
    if (this.frameCount < 2) return false;
    this.speed = this.validSpeed(speed);
    this.playing = true;
    this.schedule();
    return true;
  }

  pause() {
    if (this.timer !== null) this.clearIntervalFn(this.timer);
    this.timer = null;
    const wasPlaying = this.playing;
    this.playing = false;
    if (wasPlaying) this.onStop();
  }

  cancel() { this.pause(); }

  seek(index) {
    this.index = Math.max(0, Math.min(this.frameCount - 1, Number.isInteger(index) ? index : 0));
    this.onFrame(this.index);
  }

  setSpeed(speed) {
    this.speed = this.validSpeed(speed);
    if (this.playing) {
      if (this.timer !== null) this.clearIntervalFn(this.timer);
      this.timer = null;
      this.schedule();
    }
  }

  validSpeed(speed) {
    if (![0.25, 0.5, 1, 2].includes(Number(speed))) throw new Error('Replay speed is not supported.');
    return Number(speed);
  }

  schedule() {
    this.timer = this.setIntervalFn(() => {
      if (!this.playing) return;
      if (this.index >= this.frameCount - 1) { this.pause(); return; }
      this.index += 1;
      this.onFrame(this.index);
      if (this.index >= this.frameCount - 1) this.pause();
    }, 100 / this.speed);
  }
}

module.exports = { RecordingPlayback };

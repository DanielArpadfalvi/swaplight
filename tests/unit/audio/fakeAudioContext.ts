// Minimal AudioContext stand-in: records node creation, ignores all automation.

function param(value = 0): Record<string, unknown> {
  const p: Record<string, unknown> = { value };
  for (const m of [
    'setValueAtTime',
    'linearRampToValueAtTime',
    'exponentialRampToValueAtTime',
    'setTargetAtTime',
    'cancelScheduledValues',
  ]) {
    p[m] = (v: number) => {
      if (m === 'setValueAtTime' && Number.isNaN(v)) throw new Error('NaN param');
      return p;
    };
  }
  return p;
}

function node(): Record<string, unknown> {
  const n: Record<string, unknown> = {
    connect: (dest: unknown) => dest,
    disconnect: () => {},
    start: () => {},
    stop: () => {},
    gain: param(1),
    frequency: param(440),
    detune: param(0),
    Q: param(1),
    delayTime: param(0),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    type: 'sine',
    buffer: null,
    onended: null,
  };
  return n;
}

export class FakeAudioContext {
  currentTime = 0;
  sampleRate = 8000;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = node();
  created = 0;

  private make(): Record<string, unknown> {
    this.created++;
    return node();
  }
  createGain = () => this.make();
  createOscillator = () => this.make();
  createBiquadFilter = () => this.make();
  createBufferSource = () => this.make();
  createDelay = () => this.make();
  createDynamicsCompressor = () => this.make();
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  resume = async () => {
    this.state = 'running';
  };
  suspend = async () => {
    this.state = 'suspended';
  };
  close = async () => {
    this.state = 'closed';
  };
}

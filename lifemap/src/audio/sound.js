import * as Tone from "tone";

// Ambient layer: reverb pad + chimes. Off by default per CLAUDE.md.
let started = false;
let enabled = false;
let synth, chime, loop;

async function ensureStarted() {
  if (started) return;
  await Tone.start();
  const reverb = new Tone.Reverb({ decay: 12, wet: 0.7 }).toDestination();
  synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sine" },
    envelope: { attack: 3.5, decay: 2, sustain: 0.4, release: 8 },
    volume: -26,
  }).connect(reverb);
  chime = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.005, decay: 1.6, sustain: 0, release: 2 },
    volume: -18,
  }).connect(reverb);
  const chords = [
    ["C3", "G3", "D4"],
    ["A2", "E3", "B3"],
    ["F2", "C3", "G3"],
  ];
  let i = 0;
  loop = new Tone.Loop((time) => {
    synth.triggerAttackRelease(chords[i++ % chords.length], "6n", time);
  }, "9s");
  Tone.getTransport().start();
  started = true;
}

export async function setSoundEnabled(on) {
  enabled = on;
  if (on) {
    await ensureStarted();
    loop.start(0);
  } else if (started) {
    loop.stop();
  }
}

export function playChime(kind = "add") {
  if (!enabled || !started) return;
  const note = kind === "resolve" ? "E5" : kind === "select" ? "B4" : "G5";
  chime.triggerAttackRelease(note, "8n");
}

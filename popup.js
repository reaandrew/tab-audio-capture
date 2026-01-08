import { pipeline } from './transformers.min.js';

const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const transcript = document.getElementById('transcript');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

const errCountEl = document.getElementById('errCount');
const ermCountEl = document.getElementById('ermCount');
const uhCountEl = document.getElementById('uhCount');
const totalCountEl = document.getElementById('totalCount');

// Data
const HISTORY_LENGTH = 60;
const dataHistory = {
  err: new Array(HISTORY_LENGTH).fill(0),
  erm: new Array(HISTORY_LENGTH).fill(0),
  uh: new Array(HISTORY_LENGTH).fill(0)
};

let counts = { err: 0, erm: 0, uh: 0 };
let currentSecondCounts = { err: 0, erm: 0, uh: 0 };
let isRunning = false;
let chartInterval = null;

// Audio/Whisper state
let transcriber = null;
let mediaStream = null;
let audioContext = null;
let processor = null;
let audioChunks = [];

const colors = {
  err: '#ff6b6b',
  erm: '#ffd93d',
  uh: '#6bcb77'
};

function drawChart() {
  const width = canvas.width;
  const height = canvas.height;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#1a3a1a';
  ctx.lineWidth = 1;

  for (let i = 1; i < 5; i++) {
    const y = (height / 5) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (let i = 1; i < 12; i++) {
    const x = (width / 12) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  let maxVal = 1;
  for (const key of ['err', 'erm', 'uh']) {
    const max = Math.max(...dataHistory[key]);
    if (max > maxVal) maxVal = max;
  }
  maxVal = Math.ceil(maxVal * 1.2);

  const stepX = width / (HISTORY_LENGTH - 1);

  for (const [key, color] of Object.entries(colors)) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < HISTORY_LENGTH; i++) {
      const x = i * stepX;
      const y = height - (dataHistory[key][i] / maxVal) * (height - 10);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }

  ctx.fillStyle = '#444';
  ctx.font = '9px monospace';
  ctx.fillText(maxVal.toString(), 2, 10);
  ctx.fillText('0', 2, height - 2);
}

function updateChart() {
  for (const key of ['err', 'erm', 'uh']) {
    dataHistory[key].shift();
    dataHistory[key].push(currentSecondCounts[key]);
    currentSecondCounts[key] = 0;
  }
  drawChart();
}

function updateStats() {
  errCountEl.textContent = counts.err;
  ermCountEl.textContent = counts.erm;
  uhCountEl.textContent = counts.uh;
  totalCountEl.textContent = counts.err + counts.erm + counts.uh;
}

function checkForFillerWords(text) {
  const lower = text.toLowerCase();

  const patterns = {
    err: /\b(err+|er)\b/g,
    erm: /\b(erm+|um+|umm+|hm+|hmm+|mm+)\b/g,
    uh: /\b(uh+|ah+|uhh+|oh)\b/g
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const matches = lower.match(pattern);
    if (matches) {
      counts[key] += matches.length;
      currentSecondCounts[key] += matches.length;
    }
  }

  updateStats();
}

// Load Whisper model
async function loadModel() {
  if (transcriber) return transcriber;

  statusEl.textContent = 'Loading Whisper model...';
  statusEl.classList.add('loading');
  progressBar.classList.add('visible');

  try {
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny.en',
      {
        dtype: 'q8',
        device: 'webgpu',
        progress_callback: (progress) => {
          if (progress.progress) {
            progressFill.style.width = `${progress.progress}%`;
          }
        }
      }
    );
  } catch (err) {
    console.log('WebGPU not available, falling back to WASM');
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny.en',
      {
        dtype: 'q8',
        progress_callback: (progress) => {
          if (progress.progress) {
            progressFill.style.width = `${progress.progress}%`;
          }
        }
      }
    );
  }

  progressBar.classList.remove('visible');
  statusEl.classList.remove('loading');
  return transcriber;
}

// Process audio chunk with Whisper
async function processAudioChunk(audioData) {
  if (!transcriber || audioData.length < 1600) return;

  try {
    const result = await transcriber(audioData, {
      language: 'en',
      task: 'transcribe'
    });

    if (result && result.text) {
      const text = result.text.trim();
      if (text && text !== '[BLANK_AUDIO]') {
        transcript.textContent = text.slice(-100);
        checkForFillerWords(text);
      }
    }
  } catch (err) {
    console.error('Transcription error:', err);
  }
}

async function start() {
  startBtn.disabled = true;
  statusEl.textContent = 'Starting...';

  try {
    // Load model first
    await loadModel();

    statusEl.textContent = 'Select a tab to capture...';

    // Get display media - this shows the picker
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
      preferCurrentTab: false
    });

    // Stop video track - we only need audio
    mediaStream.getVideoTracks().forEach(track => track.stop());

    // Check we have audio
    if (mediaStream.getAudioTracks().length === 0) {
      throw new Error('No audio track - make sure to check "Share audio"');
    }

    // Set up audio processing
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    processor = audioContext.createScriptProcessor(4096, 1, 1);
    audioChunks = [];

    let chunkDuration = 0;
    const TARGET_DURATION = 3;

    processor.onaudioprocess = (e) => {
      if (!isRunning) return;

      const inputData = e.inputBuffer.getChannelData(0);
      audioChunks.push(new Float32Array(inputData));
      chunkDuration += e.inputBuffer.duration;

      if (chunkDuration >= TARGET_DURATION) {
        const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        audioChunks = [];
        chunkDuration = 0;

        processAudioChunk(combined);
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    isRunning = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'Listening...';
    statusEl.classList.add('active');

    chartInterval = setInterval(updateChart, 1000);

  } catch (err) {
    console.error('Start error:', err);
    statusEl.textContent = `Error: ${err.message}`;
    statusEl.className = 'status';
    startBtn.disabled = false;
  }
}

function stop() {
  isRunning = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = 'Stopped';
  statusEl.className = 'status';

  if (processor) {
    processor.disconnect();
    processor = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  if (chartInterval) {
    clearInterval(chartInterval);
    chartInterval = null;
  }

  audioChunks = [];
}

function reset() {
  counts = { err: 0, erm: 0, uh: 0 };
  currentSecondCounts = { err: 0, erm: 0, uh: 0 };

  for (const key of ['err', 'erm', 'uh']) {
    dataHistory[key] = new Array(HISTORY_LENGTH).fill(0);
  }

  updateStats();
  drawChart();
  transcript.textContent = 'Transcript will appear here...';
}

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
resetBtn.addEventListener('click', reset);

drawChart();

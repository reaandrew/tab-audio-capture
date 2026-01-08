import { pipeline } from './transformers.min.js';

let transcriber = null;
let mediaStream = null;
let audioContext = null;
let processor = null;
let isProcessing = false;
let audioChunks = [];

// Load Whisper model
async function loadModel(progressCallback) {
  if (transcriber) return transcriber;

  try {
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny.en',
      {
        dtype: 'q8',
        device: 'webgpu',
        progress_callback: progressCallback
      }
    );
    return transcriber;
  } catch (err) {
    console.log('WebGPU not available, falling back to WASM');
    transcriber = await pipeline(
      'automatic-speech-recognition',
      'onnx-community/whisper-tiny.en',
      {
        dtype: 'q8',
        progress_callback: progressCallback
      }
    );
    return transcriber;
  }
}

// Process audio with Whisper
async function processAudioChunk(audioData) {
  if (!transcriber || audioData.length < 1600) return null;

  try {
    const result = await transcriber(audioData, {
      language: 'en',
      task: 'transcribe'
    });

    if (result && result.text) {
      const text = result.text.trim();
      if (text && text !== '[BLANK_AUDIO]') {
        return text;
      }
    }
  } catch (err) {
    console.error('Transcription error:', err);
  }
  return null;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.action === 'startProcessing') {
    startProcessing(message.streamId).then(sendResponse);
    return true;
  } else if (message.action === 'stopProcessing') {
    stopProcessing().then(sendResponse);
    return true;
  }
});

async function startProcessing(streamId) {
  try {
    // Send loading status
    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: 'loading',
      message: 'Loading Whisper model...'
    });

    // Load model first
    try {
      await loadModel((progress) => {
        if (progress.progress) {
          chrome.runtime.sendMessage({
            action: 'loadProgress',
            progress: progress.progress
          });
        }
      });
    } catch (modelErr) {
      console.error('Model load error:', modelErr);
      chrome.runtime.sendMessage({
        action: 'statusUpdate',
        status: 'error',
        message: `Model error: ${modelErr.message}`
      });
      throw modelErr;
    }

    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: 'ready',
      message: 'Model loaded, starting capture...'
    });

    // Get tab audio stream
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    // Play audio back so user can still hear it
    const audio = new Audio();
    audio.srcObject = mediaStream;
    audio.play();

    // Set up audio processing
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);

    processor = audioContext.createScriptProcessor(4096, 1, 1);
    audioChunks = [];

    let chunkDuration = 0;
    const TARGET_DURATION = 3; // Process every 3 seconds

    processor.onaudioprocess = async (e) => {
      if (!isProcessing) return;

      const inputData = e.inputBuffer.getChannelData(0);
      audioChunks.push(new Float32Array(inputData));
      chunkDuration += e.inputBuffer.duration;

      if (chunkDuration >= TARGET_DURATION) {
        // Combine chunks
        const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunks) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }

        // Reset for next batch
        audioChunks = [];
        chunkDuration = 0;

        // Process and send result
        const text = await processAudioChunk(combined);
        if (text) {
          chrome.runtime.sendMessage({
            action: 'transcription',
            text: text
          });
        }
      }
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    isProcessing = true;

    chrome.runtime.sendMessage({
      action: 'statusUpdate',
      status: 'listening',
      message: 'Listening to tab audio...'
    });

    return { success: true };
  } catch (err) {
    console.error('Start processing error:', err);
    return { success: false, error: err.message };
  }
}

async function stopProcessing() {
  isProcessing = false;

  if (processor) {
    processor.disconnect();
    processor = null;
  }

  if (audioContext) {
    await audioContext.close();
    audioContext = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  audioChunks = [];

  return { success: true };
}

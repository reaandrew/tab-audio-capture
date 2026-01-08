let isCapturing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    startCapture().then(sendResponse);
    return true;
  } else if (message.action === 'stopCapture') {
    stopCapture().then(sendResponse);
    return true;
  } else if (message.action === 'getStatus') {
    sendResponse({ isCapturing });
    return true;
  }
});

async function startCapture() {
  try {
    // Stop any existing capture first
    if (isCapturing) {
      await stopCapture();
    }

    // Close existing offscreen document to release any streams
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
    }

    // Create fresh offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DISPLAY_MEDIA'],
      justification: 'Processing tab audio with Whisper for filler word detection'
    });

    // Tell offscreen document to start capturing (it will use getDisplayMedia)
    const response = await chrome.runtime.sendMessage({
      action: 'startProcessing',
      target: 'offscreen'
    });

    if (response.success) {
      isCapturing = true;
    }

    return response;
  } catch (err) {
    console.error('Start capture error:', err);
    return { success: false, error: err.message };
  }
}

async function stopCapture() {
  try {
    // Tell offscreen to stop processing
    try {
      await chrome.runtime.sendMessage({
        action: 'stopProcessing',
        target: 'offscreen'
      });
    } catch (e) {
      // Offscreen might not exist
    }

    // Close offscreen document to fully release stream
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      await chrome.offscreen.closeDocument();
    }

    isCapturing = false;
    return { success: true };
  } catch (err) {
    console.error('Stop capture error:', err);
    return { success: false, error: err.message };
  }
}

// Type augmentation for HTMLVideoElement to include captureStream
declare global {
  interface HTMLVideoElement {
    captureStream(): MediaStream
    // For Firefox compatibility
    mozCaptureStream(): MediaStream
  }
}

// Capture video stream with cross-browser support
export const captureVideoStream = (video: HTMLVideoElement): MediaStream => {
  let stream: MediaStream

  // Try regular captureStream first
  if (typeof video.captureStream === 'function') {
    stream = video.captureStream()
  }
  // Then try Firefox's mozCaptureStream
  else if (typeof video.mozCaptureStream === 'function') {
    stream = video.mozCaptureStream()
  }
  // If neither is available, throw an error
  else {
    throw new Error('Video capture not supported in this browser')
  }

  return stream
}

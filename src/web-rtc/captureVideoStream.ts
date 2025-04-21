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
  // Try regular captureStream first
  if (typeof video.captureStream === 'function') {
    return video.captureStream()
  }
  // Then try Firefox's mozCaptureStream
  if (typeof video.mozCaptureStream === 'function') {
    return video.mozCaptureStream()
  }
  // If neither is available, throw an error
  throw new Error('Video capture not supported in this browser')
}

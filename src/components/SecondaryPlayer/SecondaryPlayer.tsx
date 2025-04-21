import { useCallback } from 'react'

import { useVideo } from './useVideo'

export function SecondaryPlayer() {
  const { videoRef, status, updateStatus, togglePause, isPaused } = useVideo()

  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      updateStatus(
        `Video error occurred. Check console for details: ${e}`,
        true,
      )
    },
    [updateStatus],
  )

  const handleVideoPlay = useCallback(() => {
    updateStatus('Video playing')
  }, [updateStatus])

  return (
    <div className="video-container secondary">
      <h1>Video Streaming Receiver (via WebRTC)</h1>
      <div className="web-rtc-status">Status: {status.message}</div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls
        muted
        loop
        onError={handleVideoError}
        onPlay={handleVideoPlay}
        aria-label="Received video stream from primary window"
      />

      <button
        type="button"
        onClick={togglePause}
        className="video-play-pause-button"
      >
        {isPaused ? 'play' : 'pause'}
      </button>

      <p>
        This window is receiving a WebRTC video stream from the main window.
      </p>
    </div>
  )
}

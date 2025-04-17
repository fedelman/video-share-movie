import { useCallback, useState } from 'react'

import { useWebRTC } from './useWebRTC'

export function SecondaryPlayer() {
  const { videoRef, status, updateStatus, togglePlayOnSecondary } = useWebRTC()

  const [isPlaying, setIsPlaying] = useState(true)

  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      updateStatus('Video error occurred. Check console for details.')
      console.error('Video error: ', e)
    },
    [updateStatus],
  )

  const handleVideoPlay = useCallback(() => {
    updateStatus('Video playing')
  }, [updateStatus])

  return (
    <div className="video-container secondary">
      <h1>Video Streaming Receiver (WebRTC)</h1>
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
        onClick={() => setIsPlaying(togglePlayOnSecondary())}
        className="video-play-pause-button"
      >
        {isPlaying ? 'pause' : 'play'}
      </button>

      <p>
        This window is receiving a WebRTC video stream from the main window.
      </p>
    </div>
  )
}

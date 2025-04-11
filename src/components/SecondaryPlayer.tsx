import { useCallback, useState } from 'react'
import { useDualScreen } from '../dual-screen/dual-screen-provider'

const SecondaryPlayer = () => {
  const {
    secondary: {
      connectionStatus,
      videoRef,
      updateConnectionStatus,
      togglePlayOnSecondary,
    },
  } = useDualScreen()

  const [isPlaying, setIsPlaying] = useState(true)

  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      updateConnectionStatus('Video error occurred. Check console for details.')
      console.error('Video error: ', e)
    },
    [updateConnectionStatus],
  )

  const handleVideoPlay = useCallback(() => {
    updateConnectionStatus('Video playing')
  }, [updateConnectionStatus])

  return (
    <div className="video-container secondary">
      <h1>Video Streaming Receiver (WebRTC)</h1>
      <div className="connection-status">Status: {connectionStatus}</div>
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

export default SecondaryPlayer

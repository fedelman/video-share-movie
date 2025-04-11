import { useDualScreen } from '../dual-screen/dual-screen-provider'

const SecondaryPlayer = () => {
  const {
    connectionStatus,
    videoRef,
    videoUrl,
    handleVideoError,
    handleVideoPlay,
    handleTestPlayback,
  } = useDualScreen()

  return (
    <div className="video-container secondary">
      <h1>Video Streaming Receiver (WebRTC)</h1>
      <div className="connection-status">Status: {connectionStatus}</div>
      <video
        ref={videoRef}
        src={videoUrl || undefined}
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
        onClick={handleTestPlayback}
        className="video-play-pause-button"
      >
        Manual Play/Pause
      </button>

      <p>
        This window is receiving a WebRTC video stream from the main window.
      </p>
    </div>
  )
}

export default SecondaryPlayer

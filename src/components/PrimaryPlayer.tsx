import { useDualScreen } from '../dual-screen/dual-screen-provider'

const PrimaryPlayer = () => {
  const {
    connectionStatus,
    videoRef,
    isSecondWindowOpen,
    isPaused,
    openSecondWindow,
    closeSecondWindow,
    togglePause,
  } = useDualScreen()

  return (
    <div className="video-container primary">
      <h1>Video Sharing with WebRTC</h1>
      <video
        ref={videoRef}
        controls
        src="/winter.mp4"
        playsInline
        muted
        loop
        aria-label="Primary video player"
      />

      <div className="controls">
        <button
          type="button"
          onClick={openSecondWindow}
          disabled={isSecondWindowOpen}
        >
          Open Secondary Window
        </button>

        <button
          type="button"
          onClick={closeSecondWindow}
          disabled={!isSecondWindowOpen}
        >
          Close Secondary Window
        </button>

        <button type="button" onClick={togglePause}>
          {isPaused ? 'Play' : 'Pause'}
        </button>
      </div>

      {connectionStatus && (
        <div className="connection-status">Status: {connectionStatus}</div>
      )}
    </div>
  )
}

export default PrimaryPlayer

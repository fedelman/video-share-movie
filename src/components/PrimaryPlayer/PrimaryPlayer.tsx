import { useEffect } from 'react'

import { useDualScreen } from '../../dual-screen/dual-screen-provider'

import { useWebRTC } from './useWebRTC'

export function PrimaryPlayer() {
  const {
    videoRef,
    status,
    isSecondWindowOpen,
    openSecondWindow,
    closeSecondWindow,
    isPaused,
    togglePause,
  } = useWebRTC()

  const { isPrimaryScreen } = useDualScreen()

  // handler to ask the user for confirmation before leaving / reloading the primary screen when the secondary screen is open
  useEffect(() => {
    // handler to ask the user for confirmation before leaving / reloading the primary screen
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isPrimaryScreen && isSecondWindowOpen) {
        event.preventDefault()
        event.returnValue = true
      }
    }
    // handler to close the secondary screen when the user has confirmed to leave / reload the primary screen
    function handlePageHide() {
      if (isPrimaryScreen && isSecondWindowOpen) {
        closeSecondWindow()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [closeSecondWindow, isPrimaryScreen, isSecondWindowOpen])

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

      {status.message && (
        <div className="web-rtc-status">Status: {status.message}</div>
      )}
    </div>
  )
}

export default PrimaryPlayer

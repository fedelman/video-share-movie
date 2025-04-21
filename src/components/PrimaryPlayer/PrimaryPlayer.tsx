import { useEffect } from 'react'

import { useDualScreen } from '../../dual-screen/dual-screen-provider'

import { useVideo } from './useVideo'

export function PrimaryPlayer() {
  const {
    videoRef,
    status,
    isSecondaryOpen,
    openSecondary,
    closeSecondary,
    isPaused,
    togglePause,
  } = useVideo()

  const { isPrimaryScreen } = useDualScreen()

  // handler to ask the user for confirmation before leaving / reloading the primary screen when the secondary screen is open
  useEffect(() => {
    // handler to ask the user for confirmation before leaving / reloading the primary screen
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isPrimaryScreen && isSecondaryOpen) {
        event.preventDefault()
        event.returnValue = true
      }
    }
    // handler to close the secondary screen when the user has confirmed to leave / reload the primary screen
    function handlePageHide() {
      if (isPrimaryScreen && isSecondaryOpen) {
        closeSecondary()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [closeSecondary, isPrimaryScreen, isSecondaryOpen])

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
          onClick={openSecondary}
          disabled={isSecondaryOpen}
        >
          Open Secondary Window
        </button>

        <button
          type="button"
          onClick={closeSecondary}
          disabled={!isSecondaryOpen}
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

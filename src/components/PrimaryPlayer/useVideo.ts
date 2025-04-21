import { useCallback, useEffect, useRef, useState } from 'react'

import { PeerRole, WebRTConnectionService } from '../../web-rtc'
import { useStatus } from '../../useStatus'

export const useVideo = () => {
  const { status, updateStatus } = useStatus()

  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPaused, setIsPaused] = useState(false)

  const secondaryRef = useRef<Window | null>(null)
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false)
  const secondaryCheckIntervalRef = useRef<number | null>(null)

  const webRTCServiceRef = useRef<WebRTConnectionService | null>(null)

  // Clean up resources
  const cleanup = useCallback(() => {
    // Clear the window check interval
    if (secondaryCheckIntervalRef.current) {
      clearInterval(secondaryCheckIntervalRef.current)
      secondaryCheckIntervalRef.current = null
    }
    // Clean up WebRTC service
    if (webRTCServiceRef.current) {
      webRTCServiceRef.current.cleanup()
      webRTCServiceRef.current = null
    }
    updateStatus('')
  }, [updateStatus])

  // Handle messages from secondary window
  const handleMessage = useCallback(
    (message: unknown) => {
      if (typeof message !== 'string') {
        return
      }
      if (message === 'windowClosed') {
        setIsSecondaryOpen(false)
        cleanup()
      } else if (message === 'windowReloading') {
        // Secondary window is reloading - don't destroy connection yet
        updateStatus('Secondary window is reloading...')
      } else if (message === 'windowReloaded' || message === 'windowReady') {
        // When secondary window is ready after reload or initial load, start WebRTC setup
        updateStatus('Secondary window is ready, setting up connection...')
        // Create offer to start the connection
        if (videoRef.current) {
          webRTCServiceRef.current?.createOffer(videoRef.current)
        }
      } else if (message === 'play') {
        if (videoRef.current) {
          videoRef.current.play()
          setIsPaused(false)
        }
      } else if (message === 'pause') {
        if (videoRef.current) {
          videoRef.current.pause()
          setIsPaused(true)
        }
      }
    },
    [cleanup, updateStatus],
  )
  // Setup WebRTC service
  const setupWebRTCService = useCallback(() => {
    if (!webRTCServiceRef.current) {
      webRTCServiceRef.current = new WebRTConnectionService(
        PeerRole.PRIMARY,
        secondaryRef.current,
        videoRef.current,
        updateStatus,
        handleMessage,
      )
    }
  }, [handleMessage, updateStatus])

  // Open a secondary window to display the video
  const openSecondary = useCallback(async () => {
    if (secondaryRef.current && !secondaryRef.current.closed) {
      secondaryRef.current.focus()
      return
    }
    try {
      // Clean up any existing connection first
      cleanup()

      updateStatus('Opening second window...')

      // Open a new window with the same app but with secondary parameter
      const secondaryUrl = `${window.location.origin}${window.location.pathname}?secondary=true`
      const newWindow = window.open(
        secondaryUrl,
        '_blank',
        'width=1024,height=768',
      )
      if (!newWindow) {
        alert('Please allow pop-ups for this website')
        updateStatus('')
        return
      }
      secondaryRef.current = newWindow
      setIsSecondaryOpen(true)
      updateStatus('Waiting for second window to load...')

      // Set up WebRTC service
      setupWebRTCService()

      // Setup message listener function
      const messageListener = (event: MessageEvent) => {
        // Only process messages from our secondary window
        if (event.source === secondaryRef.current && webRTCServiceRef.current) {
          webRTCServiceRef.current.handleMessage(event)
        }
      }

      // Add message listener
      window.addEventListener('message', messageListener)

      // Check if the window is closed periodically
      const checkWindowLoaded = setInterval(() => {
        if (newWindow.closed) {
          clearInterval(checkWindowLoaded)
          setIsSecondaryOpen(false)
          window.removeEventListener('message', messageListener)
          cleanup()
        }
      }, 500)
      // Store the interval ID to clear it if needed
      secondaryCheckIntervalRef.current = checkWindowLoaded
    } catch (error) {
      updateStatus(
        `Error opening second window: ${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }
  }, [cleanup, setupWebRTCService, updateStatus])

  // Close the second window
  const closeSecondary = useCallback(() => {
    if (secondaryRef.current && !secondaryRef.current.closed) {
      secondaryRef.current.close()
      secondaryRef.current = null
      setIsSecondaryOpen(false)
      cleanup()
    }
  }, [cleanup])

  // Toggle video pause
  const togglePause = useCallback(() => {
    if (!videoRef.current) return

    if (videoRef.current.paused) {
      videoRef.current.play()
      setIsPaused(false)

      // Notify secondary window
      if (webRTCServiceRef.current) {
        webRTCServiceRef.current.sendMessage('play')
      }
    } else {
      videoRef.current.pause()
      setIsPaused(true)

      // Notify secondary window
      if (webRTCServiceRef.current) {
        webRTCServiceRef.current.sendMessage('pause')
      }
    }
  }, [])

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      closeSecondary()
    }
  }, [closeSecondary])

  return {
    status,
    updateStatus,
    isSecondaryOpen,
    openSecondary,
    closeSecondary,
    videoRef,
    isPaused,
    togglePause,
  }
}

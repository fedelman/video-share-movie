import { useCallback, useEffect, useRef, useState } from 'react'

import { PeerRole, WebRTCService } from '../../webrtc'

export const useWebRTC = () => {
  const [connectionStatus, setConnectionStatus] = useState('')
  const updateConnectionStatus = useCallback(
    (status: string, isError = false) => {
      if (isError) {
        console.error('Connection Status:', status)
      } else {
        console.log('Connection Status:', status)
      }
      setConnectionStatus(status)
    },
    [],
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPaused, setIsPaused] = useState(false)

  const secondWindowRef = useRef<Window | null>(null)
  const [isSecondWindowOpen, setIsSecondWindowOpen] = useState(false)
  const secondWindowCheckIntervalRef = useRef<number | null>(null)

  const webRTCServiceRef = useRef<WebRTCService | null>(null)

  // Clean up resources
  const cleanup = useCallback(() => {
    // Clear the window check interval
    if (secondWindowCheckIntervalRef.current) {
      clearInterval(secondWindowCheckIntervalRef.current)
      secondWindowCheckIntervalRef.current = null
    }
    // Clean up WebRTC service
    if (webRTCServiceRef.current) {
      webRTCServiceRef.current.cleanup()
    }
    updateConnectionStatus('')
  }, [updateConnectionStatus])

  // Handle messages from secondary window
  const handleMessage = useCallback(
    (message: unknown) => {
      if (typeof message !== 'string') {
        return
      }
      if (message === 'windowClosed') {
        setIsSecondWindowOpen(false)
        cleanup()
      } else if (message === 'windowReloading') {
        // Secondary window is reloading - don't destroy connection yet
        updateConnectionStatus('Secondary window is reloading...')
      } else if (message === 'windowReloaded' || message === 'windowReady') {
        // When secondary window is ready after reload or initial load, start WebRTC setup
        updateConnectionStatus(
          'Secondary window is ready, setting up connection...',
        )
        if (webRTCServiceRef.current && videoRef.current) {
          webRTCServiceRef.current.createOffer(videoRef.current)
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
    [cleanup, updateConnectionStatus],
  )
  // Setup WebRTC service
  const setupWebRTCService = useCallback(() => {
    if (!webRTCServiceRef.current) {
      webRTCServiceRef.current = new WebRTCService(
        PeerRole.PRIMARY,
        secondWindowRef.current,
        videoRef.current,
        updateConnectionStatus,
        handleMessage,
      )
    }
  }, [handleMessage, updateConnectionStatus])

  // Open a new window to display the video
  const openSecondWindow = useCallback(async () => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.focus()
      return
    }
    try {
      updateConnectionStatus('Opening second window...')

      // Open a new window with the same app but with secondary parameter
      const secondaryUrl = `${window.location.origin}${window.location.pathname}?secondary=true`
      const newWindow = window.open(
        secondaryUrl,
        '_blank',
        'width=1024,height=768',
      )
      if (!newWindow) {
        alert('Please allow pop-ups for this website')
        updateConnectionStatus('')
        return
      }
      secondWindowRef.current = newWindow
      setIsSecondWindowOpen(true)
      updateConnectionStatus('Waiting for second window to load...')

      // Set up WebRTC service
      setupWebRTCService()

      // Setup message listener function
      const messageListener = (event: MessageEvent) => {
        // Only process messages from our secondary window
        if (
          event.source === secondWindowRef.current &&
          webRTCServiceRef.current
        ) {
          webRTCServiceRef.current.handleMessage(event)
        }
      }

      // Add message listener
      window.addEventListener('message', messageListener)

      // Check if the window is closed periodically
      const checkWindowLoaded = setInterval(() => {
        if (newWindow.closed) {
          clearInterval(checkWindowLoaded)
          setIsSecondWindowOpen(false)
          window.removeEventListener('message', messageListener)
          cleanup()
        }
      }, 500)
      // Store the interval ID to clear it if needed
      secondWindowCheckIntervalRef.current = checkWindowLoaded
    } catch (error) {
      updateConnectionStatus(
        `Error opening second window: ${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }
  }, [cleanup, setupWebRTCService, updateConnectionStatus])

  // Close the second window
  const closeSecondWindow = useCallback(() => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.close()
      secondWindowRef.current = null
      setIsSecondWindowOpen(false)
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
      closeSecondWindow()
    }
  }, [closeSecondWindow])

  return {
    videoRef,
    connectionStatus,
    updateConnectionStatus,
    isSecondWindowOpen,
    openSecondWindow,
    closeSecondWindow,
    isPaused,
    togglePause,
  }
}

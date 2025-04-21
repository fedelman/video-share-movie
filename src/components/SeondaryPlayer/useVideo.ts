import { useCallback, useEffect, useRef } from 'react'

import { PeerRole, WebRTConnectionService } from '../../web-rtc'
import { useStatus } from '../../useStatus'

export function useVideo() {
  const { status, updateStatus } = useStatus()

  const videoRef = useRef<HTMLVideoElement>(null)
  const isPlayingRef = useRef<boolean>(true)

  // Reference to our WebRTCService
  const webRTCServiceRef = useRef<WebRTConnectionService | null>(null)

  const togglePlayOnSecondary = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        isPlayingRef.current = true
        if (window.opener && webRTCServiceRef.current) {
          webRTCServiceRef.current.sendMessage('play')
        }
      } else {
        videoRef.current.pause()
        isPlayingRef.current = false
        if (window.opener && webRTCServiceRef.current) {
          webRTCServiceRef.current.sendMessage('pause')
        }
      }
    }
    return isPlayingRef.current
  }, [])

  const handleMessage = useCallback((message: unknown) => {
    if (typeof message !== 'string') {
      return
    }
    if (message === 'play' && videoRef.current) {
      videoRef.current.play()
      isPlayingRef.current = true
    } else if (message === 'pause' && videoRef.current) {
      videoRef.current.pause()
      isPlayingRef.current = false
    }
  }, [])

  // Set up WebRTC service
  const setupWebRTCService = useCallback(() => {
    // Clean up existing service if present
    if (webRTCServiceRef.current) {
      webRTCServiceRef.current.cleanup()
      webRTCServiceRef.current = null
    }

    if (!window.opener || !videoRef.current) {
      updateStatus(
        'Error: Unable to establish connection with primary window',
        true,
      )
      return
    }

    webRTCServiceRef.current = new WebRTConnectionService(
      PeerRole.SECONDARY,
      window.opener,
      videoRef.current,
      updateStatus,
      handleMessage,
    )
  }, [handleMessage, updateStatus])

  // Set up message listener for secondary window
  useEffect(() => {
    updateStatus('Waiting for connection from primary window...')

    // Setup WebRTC service
    setupWebRTCService()

    const handleBeforeUnload = () => {
      // Notify primary we're reloading, not closing
      if (webRTCServiceRef.current) {
        webRTCServiceRef.current.sendMessage('windowReloading')
      }
    }
    // Send message to opener when this window is closed or reloaded
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Handle messages from the primary window
    const messageListener = (event: MessageEvent) => {
      if (event.source === window.opener && webRTCServiceRef.current) {
        webRTCServiceRef.current.handleMessage(event)
      }
    }
    window.addEventListener('message', messageListener)

    // Signal to the opener that this window is ready to receive connections
    const signalReady = () => {
      if (window.opener && webRTCServiceRef.current) {
        // Check if this is a page reload using sessionStorage
        const isReload = sessionStorage.getItem('wasLoaded') === 'true'
        if (isReload) {
          // This is a reload, send special message
          webRTCServiceRef.current.sendMessage('windowReloaded')
        } else {
          // First load
          sessionStorage.setItem('wasLoaded', 'true')
          webRTCServiceRef.current.sendMessage('windowReady')
        }
        updateStatus('Ready signal sent, waiting for video...')
      } else {
        updateStatus('Error: No opener window found', true)
      }
    }

    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 500)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('message', messageListener)

      if (webRTCServiceRef.current) {
        webRTCServiceRef.current.cleanup()
        webRTCServiceRef.current = null
      }
    }
  }, [setupWebRTCService, updateStatus])

  return {
    status,
    togglePlayOnSecondary,
    updateStatus,
    videoRef,
  }
}

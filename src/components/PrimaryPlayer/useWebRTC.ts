import { useCallback, useRef, useState } from 'react'

import { captureVideoStream } from './captureVideoStream'

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
  const streamRef = useRef<MediaStream>(null)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(
    null,
  )

  const [isSecondWindowOpen, setIsSecondWindowOpen] = useState(false)
  const secondWindowRef = useRef<Window | null>(null)
  const [isPaused, setIsPaused] = useState(false)

  // Clean up resources
  const cleanup = useCallback(() => {
    // Close the WebRTC peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    // Stop all tracks in the stream
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks()
      for (const track of tracks) {
        track.stop()
      }
      streamRef.current = null
    }
    // Remove message event listener
    if (messageListenerRef.current) {
      window.removeEventListener('message', messageListenerRef.current)
      messageListenerRef.current = null
    }
    updateConnectionStatus('')
  }, [updateConnectionStatus])

  // Start WebRTC connection
  const startWebRTCConnection = useCallback(async () => {
    try {
      console.log('Starting WebRTC connection setup...')
      updateConnectionStatus('Setting up WebRTC connection...')

      // Ensure the video element is ready before capturing the stream
      if (!videoRef.current) {
        console.error('Video element not available')
        updateConnectionStatus('Error: Video element not available')
        return
      }
      // Make sure the video is loaded and can be played
      const video = videoRef.current
      if (video.readyState < 2) {
        // HAVE_CURRENT_DATA
        updateConnectionStatus('Waiting for video to load...')
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay)
            resolve()
          }
          video.addEventListener('canplay', onCanPlay)
        })
      }

      updateConnectionStatus('Capturing video stream...')

      // Ensure video is playing before trying to capture stream
      try {
        if (video.paused) {
          // Force the video to play with a user interaction or muted
          await video.play()
        }
        // Capture the video stream
        const stream = captureVideoStream(video)
        console.log('Captured stream with tracks:', stream.getTracks().length)

        // Store the stream reference for cleanup
        streamRef.current = stream

        if (stream.getTracks().length === 0) {
          console.error('No tracks in captured stream')
          updateConnectionStatus('Error: No video tracks available')
          return
        }
        // Create a peer connection
        const peerConnection = new RTCPeerConnection({
          // actually not needed for local secondary window
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        })
        peerConnectionRef.current = peerConnection

        // Monitor connection state changes
        peerConnection.onconnectionstatechange = () => {
          const isError =
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'disconnected'
          updateConnectionStatus(
            `WebRTC connection: ${peerConnection.connectionState}`,
            isError,
          )
        }
        // Monitor ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
          if (
            peerConnection.iceConnectionState === 'failed' ||
            peerConnection.iceConnectionState === 'disconnected'
          ) {
            console.error(
              `ICE connection state changed: ${peerConnection.iceConnectionState}`,
            )
          } else {
            console.log(
              `ICE connection state changed: ${peerConnection.iceConnectionState}`,
            )
          }
        }
        // Add stream tracks to the peer connection
        for (const track of stream.getTracks()) {
          peerConnection.addTrack(track, stream)
          console.log(`Added track: ${track.kind} to peer connection`)
        }
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          console.log(
            'Generated ICE candidate:',
            event.candidate
              ? event.candidate.candidate
              : 'null (gathering complete)',
          )
          if (secondWindowRef.current) {
            // For ICE candidates, we can safely send the serializable candidate data
            secondWindowRef.current.postMessage(
              {
                type: 'ice-candidate',
                candidate: event.candidate
                  ? {
                      sdpMid: event.candidate.sdpMid,
                      sdpMLineIndex: event.candidate.sdpMLineIndex,
                      candidate: event.candidate.candidate,
                    }
                  : null,
              },
              '*',
            )
          }
        }
        // Create and send offer
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        console.log('Created and set local description (offer):', offer.type)

        // Send offer to secondary window
        if (secondWindowRef.current) {
          secondWindowRef.current.postMessage(
            {
              type: 'webrtc-offer',
              offer: peerConnection.localDescription?.toJSON(),
            },
            '*',
          )
          updateConnectionStatus('WebRTC offer sent, waiting for answer...')
        }
      } catch (error) {
        updateConnectionStatus(
          `WebRTC setup error: ${error instanceof Error ? error.message : String(error)}`,
          true,
        )
      }
    } catch (error) {
      updateConnectionStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }
  }, [updateConnectionStatus])

  // Handle ICE candidate from secondary window
  const handleIceCandidate = useCallback(
    (candidate: RTCIceCandidateInit | null) => {
      try {
        if (!peerConnectionRef.current) {
          console.error('No peer connection available')
          return
        }
        if (candidate) {
          peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(candidate),
          )
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error)
      }
    },
    [],
  )

  // Handle WebRTC answer from secondary window
  const handleWebRTCAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit) => {
      try {
        console.log('Received WebRTC answer from secondary window')

        if (!peerConnectionRef.current) {
          console.error('No peer connection available')
          return
        }
        console.log('Setting remote description from answer')
        await peerConnectionRef.current.setRemoteDescription(
          new RTCSessionDescription(answer),
        )
        updateConnectionStatus('WebRTC connection established')
      } catch (error) {
        updateConnectionStatus(
          `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
          true,
        )
      }
    },
    [updateConnectionStatus],
  )

  // Close the second window
  const closeSecondWindow = useCallback(() => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.close()
      secondWindowRef.current = null
      setIsSecondWindowOpen(false)
      cleanup()
    }
  }, [cleanup])

  // Set up message listener for communication with the second window
  const messageListener = useCallback(
    (event: MessageEvent) => {
      // Only process messages from our secondary window
      if (event.source !== secondWindowRef.current) return

      console.log('Received message from secondary window:', event.data)

      if (event.data === 'windowClosed') {
        setIsSecondWindowOpen(false)
        cleanup()
      } else if (event.data === 'windowReady') {
        // Once the secondary window signals it's ready, start WebRTC setup
        startWebRTCConnection()
      } else if (event.data === 'play') {
        if (videoRef.current) {
          videoRef.current.play()
          setIsPaused(false)
        }
      } else if (event.data === 'pause') {
        if (videoRef.current) {
          videoRef.current.pause()
          setIsPaused(true)
        }
      } else if (event.data?.type === 'webrtc-answer') {
        // Handle the WebRTC answer from the secondary window
        handleWebRTCAnswer(event.data.answer)
      } else if (event.data?.type === 'ice-candidate') {
        // Handle ICE candidate from secondary window
        handleIceCandidate(event.data.candidate)
      }
    },
    [cleanup, handleIceCandidate, handleWebRTCAnswer, startWebRTCConnection],
  )
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
        'width=800,height=600',
      )
      if (!newWindow) {
        alert('Please allow pop-ups for this website')
        updateConnectionStatus('')
        return
      }
      secondWindowRef.current = newWindow
      setIsSecondWindowOpen(true)
      updateConnectionStatus('Waiting for second window to load...')

      // Store the listener reference so we can remove it later
      messageListenerRef.current = messageListener
      window.addEventListener('message', messageListener)

      // Check if the window is closed periodically
      const checkWindowLoaded = setInterval(() => {
        if (newWindow.closed) {
          clearInterval(checkWindowLoaded)
          setIsSecondWindowOpen(false)
          cleanup()
        }
      }, 500)
    } catch (error) {
      updateConnectionStatus(
        `Error opening second window: ${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }
  }, [cleanup, messageListener, updateConnectionStatus])

  // Toggle video pause
  const togglePause = useCallback(() => {
    if (!videoRef.current) return

    if (videoRef.current.paused) {
      videoRef.current.play()
      setIsPaused(false)

      // Notify secondary window
      if (secondWindowRef.current && !secondWindowRef.current.closed) {
        secondWindowRef.current.postMessage('play', '*')
      }
    } else {
      videoRef.current.pause()
      setIsPaused(true)

      // Notify secondary window
      if (secondWindowRef.current && !secondWindowRef.current.closed) {
        secondWindowRef.current.postMessage('pause', '*')
      }
    }
  }, [])

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

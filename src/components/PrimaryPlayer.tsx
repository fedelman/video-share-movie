import { useState, useRef, useEffect, useCallback } from 'react'

// Type augmentation for HTMLVideoElement to include captureStream
declare global {
  interface HTMLVideoElement {
    captureStream(): MediaStream
    // For Firefox compatibility
    mozCaptureStream(): MediaStream
  }
}

const PrimaryPlayer = () => {
  const [isSecondWindowOpen, setIsSecondWindowOpen] = useState(false)
  const secondWindowRef = useRef<Window | null>(null)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const [connectionStatus, updateConnectionStatus] = useState('')
  const [isPaused, setIsPaused] = useState(false)
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(
    null,
  )

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const setConnectionStatus = useCallback((status: string) => {
    console.log('Updating connection status:', status)
    updateConnectionStatus(status)
  }, [])

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

    setConnectionStatus('')
  }, [setConnectionStatus])

  // Close the second window
  const closeSecondWindow = useCallback(() => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.close()
      secondWindowRef.current = null
      setIsSecondWindowOpen(false)
      cleanup()
    }
  }, [cleanup])

  // Capture video stream with cross-browser support
  const captureVideoStream = (video: HTMLVideoElement): MediaStream => {
    let stream: MediaStream

    // Try regular captureStream first
    if (typeof video.captureStream === 'function') {
      stream = video.captureStream()
    }
    // Then try Firefox's mozCaptureStream
    else if (typeof video.mozCaptureStream === 'function') {
      stream = video.mozCaptureStream()
    }
    // If neither is available, throw an error
    else {
      throw new Error('Video capture not supported in this browser')
    }

    // Store the stream reference for cleanup
    streamRef.current = stream

    return stream
  }

  // Open a new window to display the video
  const openSecondWindow = async () => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.focus()
      return
    }

    try {
      setConnectionStatus('Opening second window...')

      // Open a new window with the same app but with secondary parameter
      const secondaryUrl = `${window.location.origin}${window.location.pathname}?secondary=true`
      const newWindow = window.open(
        secondaryUrl,
        '_blank',
        'width=800,height=600',
      )

      if (!newWindow) {
        alert('Please allow pop-ups for this website')
        setConnectionStatus('')
        return
      }

      secondWindowRef.current = newWindow
      setIsSecondWindowOpen(true)
      setConnectionStatus('Waiting for second window to load...')

      // Set up message listener for communication with the second window
      const messageListener = (event: MessageEvent) => {
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
      }

      // Store the listener reference so we can remove it later
      messageListenerRef.current = messageListener
      window.addEventListener('message', messageListener)

      // Check if the window is closed periodically
      const checkWindowLoaded = setInterval(() => {
        if (newWindow.closed) {
          clearInterval(checkWindowLoaded)
          setIsSecondWindowOpen(false)
          cleanup()
          return
        }
      }, 500)
    } catch (error) {
      console.error('Error opening second window:', error)
      setConnectionStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // Handle WebRTC answer from secondary window
  const handleWebRTCAnswer = async (answer: RTCSessionDescriptionInit) => {
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
      setConnectionStatus('WebRTC connection established')

      // Add a timeout to check if connection was successful
      setTimeout(() => {
        if (peerConnectionRef.current?.connectionState !== 'connected') {
          console.log(
            'WebRTC connection not established after timeout, trying fallback',
          )

          // Try fallback if connection failed
          if (videoRef.current?.src && secondWindowRef.current) {
            console.log('Sending fallback video URL:', videoRef.current.src)
            secondWindowRef.current.postMessage(
              {
                type: 'fallbackVideo',
                sourceUrl: videoRef.current.src,
              },
              '*',
            )
          }
        }
      }, 5000) // 5 second timeout
    } catch (error) {
      console.error('Error setting remote description:', error)
      setConnectionStatus(
        `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
      )

      // Try fallback on error
      if (videoRef.current?.src && secondWindowRef.current) {
        console.log('Error in WebRTC, sending fallback video URL')
        secondWindowRef.current.postMessage(
          {
            type: 'fallbackVideo',
            sourceUrl: videoRef.current.src,
          },
          '*',
        )
      }
    }
  }

  // Handle ICE candidate from secondary window
  const handleIceCandidate = (candidate: RTCIceCandidateInit | null) => {
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
  }

  // Start WebRTC connection
  const startWebRTCConnection = async () => {
    try {
      console.log('Starting WebRTC connection setup...')
      setConnectionStatus('Setting up WebRTC connection...')

      // Ensure the video element is ready before capturing the stream
      if (!videoRef.current) {
        console.error('Video element not available')
        setConnectionStatus('Error: Video element not available')
        return
      }

      // Make sure the video is loaded and can be played
      const video = videoRef.current
      if (video.readyState < 2) {
        // HAVE_CURRENT_DATA
        setConnectionStatus('Waiting for video to load...')
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay)
            resolve()
          }
          video.addEventListener('canplay', onCanPlay)
        })
      }

      setConnectionStatus('Capturing video stream...')

      // Ensure video is playing before trying to capture stream
      try {
        if (video.paused) {
          // Force the video to play with a user interaction or muted
          await video.play()
        }

        // Capture the video stream
        const stream = captureVideoStream(video)
        console.log('Captured stream with tracks:', stream.getTracks().length)

        if (stream.getTracks().length === 0) {
          console.error('No tracks in captured stream')
          setConnectionStatus('Error: No video tracks available')
          return
        }

        // Create a peer connection
        const peerConnection = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        })
        peerConnectionRef.current = peerConnection

        // Monitor connection state changes
        peerConnection.onconnectionstatechange = () => {
          console.log(
            `Connection state changed: ${peerConnection.connectionState}`,
          )
          setConnectionStatus(
            `WebRTC connection: ${peerConnection.connectionState}`,
          )

          if (
            peerConnection.connectionState === 'failed' ||
            peerConnection.connectionState === 'disconnected'
          ) {
            console.error('WebRTC connection failed or disconnected')

            // If there's a src attribute on the video, try to use it as fallback
            if (videoRef.current?.src && secondWindowRef.current) {
              console.log('Attempting fallback to direct video URL')
              secondWindowRef.current.postMessage(
                {
                  type: 'fallbackVideo',
                  sourceUrl: videoRef.current.src,
                },
                '*',
              )
            }
          }
        }

        // Monitor ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
          console.log(
            `ICE connection state changed: ${peerConnection.iceConnectionState}`,
          )
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
          // Convert the SessionDescription to a plain object before sending
          const plainOffer = {
            type: peerConnection.localDescription?.type,
            sdp: peerConnection.localDescription?.sdp,
          }

          secondWindowRef.current.postMessage(
            {
              type: 'webrtc-offer',
              offer: plainOffer,
            },
            '*',
          )

          setConnectionStatus('WebRTC offer sent, waiting for answer...')
        }
      } catch (error) {
        console.error('Error setting up WebRTC:', error)
        setConnectionStatus(
          `WebRTC setup error: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    } catch (error) {
      console.error('Error in WebRTC setup:', error)
      setConnectionStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // Toggle video pause
  const togglePause = () => {
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
  }

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      closeSecondWindow()
    }
  }, [closeSecondWindow])

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

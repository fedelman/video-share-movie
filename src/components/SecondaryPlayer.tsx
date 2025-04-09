import { useRef, useEffect, useState, useCallback } from 'react'

const SecondaryPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  const [connectionStatus, updateConnectionStatus] = useState('Initializing...')

  // Keep track of pending ICE candidates until peer connection is ready
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])

  const setConnectionStatus = useCallback((status: string) => {
    console.log('Updating connection status:', status)
    updateConnectionStatus(status)
  }, [])

  useEffect(() => {
    console.log('Secondary player initializing...')
    setConnectionStatus('Waiting for connection from primary window...')

    // Create and initialize WebRTC peer connection
    const createPeerConnection = () => {
      try {
        console.log('Creating new peer connection in secondary window')
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
        }

        // Monitor ICE connection state
        peerConnection.oniceconnectionstatechange = () => {
          console.log(
            `ICE connection state changed: ${peerConnection.iceConnectionState}`,
          )
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          console.log(
            'Generated ICE candidate:',
            event.candidate
              ? event.candidate.candidate
              : 'null (gathering complete)',
          )
          if (window.opener) {
            window.opener.postMessage(
              {
                type: 'ice-candidate',
                candidate: event.candidate,
              },
              '*',
            )
          }
        }

        // Handle incoming tracks
        peerConnection.ontrack = (event) => {
          console.log('Received remote track:', event.track.kind)
          console.log(
            'Stream has tracks:',
            event.streams?.[0]?.getTracks().length || 0,
          )

          if (videoRef.current && event.streams && event.streams[0]) {
            console.log('Setting video srcObject with remote stream')
            streamRef.current = event.streams[0]
            videoRef.current.srcObject = event.streams[0]
            setConnectionStatus('WebRTC stream connected, playing video...')

            videoRef.current.play().catch((err) => {
              console.error('Error playing video:', err)
              setConnectionStatus(`Error playing: ${err.message}`)
            })
          } else {
            console.error('Missing video element or streams in ontrack event')
            setConnectionStatus('Error: Failed to set video source')
          }
        }

        return peerConnection
      } catch (error) {
        console.error('Error creating peer connection:', error)
        setConnectionStatus(
          `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
        )
        return null
      }
    }

    // Handle WebRTC offer from primary window
    const handleWebRTCOffer = async (offer: RTCSessionDescriptionInit) => {
      try {
        console.log('Received WebRTC offer, processing...')

        // Create peer connection if it doesn't exist
        if (!peerConnectionRef.current) {
          console.log('No peer connection exists, creating one')
          const peerConnection = createPeerConnection()
          if (!peerConnection) {
            throw new Error('Failed to create peer connection')
          }
        } else {
          console.log('Using existing peer connection')
        }

        const peerConnection = peerConnectionRef.current
        if (!peerConnection) {
          throw new Error('Peer connection is null')
        }

        // Set remote description from offer
        console.log('Setting remote description from offer')
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer),
        )
        setConnectionStatus('Received WebRTC offer, creating answer...')

        // Create answer
        console.log('Creating answer')
        const answer = await peerConnection.createAnswer()
        console.log('Setting local description with answer')
        await peerConnection.setLocalDescription(answer)

        // Process any pending ICE candidates that arrived before the peer connection was ready
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log(
            `Processing ${pendingIceCandidatesRef.current.length} pending ICE candidates`,
          )
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await peerConnection.addIceCandidate(
                new RTCIceCandidate(candidate),
              )
              console.log('Added pending ICE candidate successfully')
            } catch (err) {
              console.error('Error adding pending ICE candidate:', err)
            }
          }
          // Clear the pending candidates after processing
          pendingIceCandidatesRef.current = []
        }

        // Send answer back to primary window
        if (window.opener) {
          console.log('Sending answer to primary window')
          // Convert the SessionDescription to a plain object before sending
          const plainAnswer = {
            type: peerConnection.localDescription?.type,
            sdp: peerConnection.localDescription?.sdp,
          }

          window.opener.postMessage(
            {
              type: 'webrtc-answer',
              answer: plainAnswer,
            },
            '*',
          )

          setConnectionStatus('WebRTC answer sent, connecting...')
        } else {
          console.error('Cannot send answer - no opener window')
        }
      } catch (error) {
        console.error('Error handling WebRTC offer:', error)
        setConnectionStatus(
          `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    // Handle messages from the primary window
    const handleMessage = async (event: MessageEvent) => {
      // Make sure the message is from our opener
      if (event.source !== window.opener) return

      console.log(
        'Received message from primary window:',
        typeof event.data,
        event.data?.type || event.data,
      )

      if (event.data === 'play') {
        if (videoRef.current?.paused) {
          videoRef.current.play().catch((err) => {
            console.error('Error playing video:', err)
            setConnectionStatus(`Manual play error: ${err.message}`)
          })
        }
      } else if (event.data === 'pause') {
        if (videoRef.current?.paused === false) {
          videoRef.current.pause()
        }
      } else if (typeof event.data === 'object') {
        if (event.data.type === 'webrtc-offer') {
          // Handle WebRTC offer
          handleWebRTCOffer(event.data.offer)
        } else if (event.data.type === 'ice-candidate') {
          // Handle incoming ICE candidate
          console.log(
            'Received ICE candidate from primary window:',
            event.data.candidate
              ? 'candidate data'
              : 'null (gathering complete)',
          )

          if (peerConnectionRef.current) {
            try {
              if (event.data.candidate) {
                console.log('Adding ICE candidate to peer connection')
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(event.data.candidate),
                )
                console.log('Successfully added ICE candidate')
              } else {
                console.log('End of ICE candidates reached')
              }
            } catch (err) {
              console.error('Error adding ICE candidate:', err)
              setConnectionStatus(
                `ICE candidate error: ${err instanceof Error ? err.message : String(err)}`,
              )
            }
          } else {
            console.log(
              'Peer connection not ready, storing ICE candidate for later',
            )
            if (event.data.candidate) {
              pendingIceCandidatesRef.current.push(event.data.candidate)
            }
          }
        } else if (event.data.type === 'fallbackVideo') {
          // Use the original video URL as fallback if WebRTC fails
          console.log('Using fallback direct video URL:', event.data.sourceUrl)
          setConnectionStatus('Using fallback: direct video URL')

          // Clear any previous stream
          if (videoRef.current) {
            if (videoRef.current.srcObject) {
              videoRef.current.srcObject = null
            }

            // Set the video source URL
            setVideoUrl(event.data.sourceUrl)

            // Try to play the video
            videoRef.current.oncanplay = () => {
              console.log('Fallback video can play, attempting playback')
              videoRef.current?.play().catch((err: Error) => {
                console.error('Error playing fallback video:', err)
                setConnectionStatus(`Fallback video error: ${err.message}`)
              })
            }

            videoRef.current.onerror = (err) => {
              console.error('Error loading fallback video:', err)
              setConnectionStatus('Fallback video load error')
            }
          } else {
            console.error('No video element available for fallback')
          }
        }
      }
    }
    window.addEventListener('message', handleMessage)

    // Clean up all resources
    const cleanupResources = () => {
      // Close peer connection
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }

      // Stop any tracks in our stream
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks()
        for (const track of tracks) {
          track.stop()
        }
        streamRef.current = null
      }
    }

    const handleBeforeUnload = () => {
      window.opener?.postMessage('windowClosed', '*')
    }

    // Send message to opener when this window is closed
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Signal to the opener that this window is ready to receive connections
    const signalReady = () => {
      if (window.opener) {
        console.log('Signaling ready to parent window')
        window.opener.postMessage('windowReady', '*')
        setConnectionStatus('Ready signal sent, waiting for video...')
      } else {
        console.error('No opener window found')
        setConnectionStatus('Error: No opener window found')
      }
    }

    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 500)

    // Clean up on component unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('message', handleMessage)

      cleanupResources()
    }
  }, [setConnectionStatus])

  // Handle video error
  const handleVideoError = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      console.error('Video error:', e)
      setConnectionStatus('Video error occurred. Check console for details.')
    },
    [setConnectionStatus],
  )

  // Handle video success
  const handleVideoPlay = useCallback(() => {
    setConnectionStatus('Video playing')
  }, [setConnectionStatus])

  const handleTestPlayback = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current?.paused) {
        videoRef.current.play().catch((err) => {
          console.error('Error playing video:', err)
          setConnectionStatus(`Manual play error: ${err.message}`)
        })
      } else {
        videoRef.current.pause()
      }
    }
  }, [setConnectionStatus])

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

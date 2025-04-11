import { useCallback, useEffect, useRef, useState } from 'react'

export const useWebRTC = () => {
  const [connectionStatus, setConnectionStatus] = useState('')
  const updateConnectionStatus = useCallback((status: string) => {
    console.log('Connection Status:', status)
    setConnectionStatus(status)
  }, [])

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(
    null,
  )

  const togglePlayOnSecondary = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current?.paused) {
        videoRef.current.play().catch((err) => {
          console.error('Error playing video:', err)
          updateConnectionStatus(`Manual play error: ${err.message}`)
        })
        return true
      }
      videoRef.current.pause()
    }
    return false
  }, [updateConnectionStatus])

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

  // Handle WebRTC offer from primary window
  const handleWebRTCOffer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      try {
        console.log('Received WebRTC offer, processing...')

        // Create peer connection if it doesn't exist
        if (!peerConnectionRef.current) {
          console.log('No peer connection exists, creating one')
          const peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          })
          peerConnectionRef.current = peerConnection

          // Monitor connection state changes
          peerConnection.onconnectionstatechange = () => {
            console.log(
              `Connection state changed: ${peerConnection.connectionState}`,
            )
            updateConnectionStatus(
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
              updateConnectionStatus(
                'WebRTC stream connected, playing video...',
              )

              videoRef.current.play().catch((err) => {
                console.error('Error playing video:', err)
                updateConnectionStatus(`Error playing: ${err.message}`)
              })
            } else {
              console.error('Missing video element or streams in ontrack event')
              updateConnectionStatus('Error: Failed to set video source')
            }
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
        updateConnectionStatus('Received WebRTC offer, creating answer...')

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

          updateConnectionStatus('WebRTC answer sent, connecting...')
        } else {
          console.error('Cannot send answer - no opener window')
        }
      } catch (error) {
        console.error('Error handling WebRTC offer:', error)
        updateConnectionStatus(
          `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [updateConnectionStatus],
  )

  // Set up message listener for secondary window
  useEffect(() => {
    console.log('Secondary player initializing...')
    updateConnectionStatus('Waiting for connection from primary window...')

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
            updateConnectionStatus(`Manual play error: ${err.message}`)
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
              updateConnectionStatus(
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
        }
      }
    }

    window.addEventListener('message', handleMessage)

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
        updateConnectionStatus('Ready signal sent, waiting for video...')
      } else {
        console.error('No opener window found')
        updateConnectionStatus('Error: No opener window found')
      }
    }

    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 500)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('message', handleMessage)
      cleanup()
    }
  }, [cleanup, handleWebRTCOffer, updateConnectionStatus])

  return {
    connectionStatus,
    togglePlayOnSecondary,
    updateConnectionStatus,
    videoRef,
  }
}

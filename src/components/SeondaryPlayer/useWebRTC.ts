import { useCallback, useEffect, useRef, useState } from 'react'

export function useWebRTC() {
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
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])

  const togglePlayOnSecondary = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current?.paused) {
        videoRef.current.play().catch((err) => {
          updateConnectionStatus(`Error playing video: ${err.message}`, true)
        })
        return true
      }
      videoRef.current.pause()
    }
    return false
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
            // actually not needed for local secondary window
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          })
          peerConnectionRef.current = peerConnection

          // Monitor connection state changes
          peerConnection.onconnectionstatechange = () => {
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
                updateConnectionStatus(
                  `Error playing video: ${err.message}`,
                  true,
                )
              })
            } else {
              updateConnectionStatus('Error: Failed to set video source', true)
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
        updateConnectionStatus(
          `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
          true,
        )
      }
    },
    [updateConnectionStatus],
  )
  // Handle messages from the primary window
  const messageListener = useCallback(
    async (event: MessageEvent) => {
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
            updateConnectionStatus(`Error playing video: ${err.message}`, true)
          })
        }
      } else if (event.data === 'pause') {
        if (videoRef.current?.paused === false) {
          videoRef.current.pause()
        }
      } else if (typeof event.data === 'object') {
        if (event.data.type === 'webrtc-offer') {
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
              updateConnectionStatus(
                `ICE candidate error: ${err instanceof Error ? err.message : String(err)}`,
                true,
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
    },
    [handleWebRTCOffer, updateConnectionStatus],
  )
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
    updateConnectionStatus('')
  }, [updateConnectionStatus])

  // Set up message listener for secondary window
  useEffect(() => {
    updateConnectionStatus('Waiting for connection from primary window...')

    const handleBeforeUnload = () => {
      window.opener?.postMessage('windowClosed', '*')
    }
    // Send message to opener when this window is closed
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Handle messages from the primary window
    window.addEventListener('message', messageListener)
    // Signal to the opener that this window is ready to receive connections
    const signalReady = () => {
      if (window.opener) {
        window.opener.postMessage('windowReady', '*')
        updateConnectionStatus('Ready signal sent, waiting for video...')
      } else {
        updateConnectionStatus('Error: No opener window found', true)
      }
    }
    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 500)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('message', messageListener)
      cleanup()
    }
  }, [cleanup, messageListener, updateConnectionStatus])

  return {
    connectionStatus,
    togglePlayOnSecondary,
    updateConnectionStatus,
    videoRef,
  }
}

import { useCallback, useEffect, useRef, useState } from 'react'

export function useWebRTC() {
  const [connectionStatus, setConnectionStatus] = useState(
    'Waiting for connection...',
  )
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
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const isPlayingRef = useRef<boolean>(true)

  const togglePlayOnSecondary = useCallback(() => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        isPlayingRef.current = true
        if (window.opener) {
          window.opener.postMessage('play', '*')
        }
      } else {
        videoRef.current.pause()
        isPlayingRef.current = false
        if (window.opener) {
          window.opener.postMessage('pause', '*')
        }
      }
    }
    return isPlayingRef.current
  }, [])

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
      updateConnectionStatus('Connection closed')
    }
  }, [updateConnectionStatus])

  // Set up a peer connection when receiving an offer
  const setupPeerConnection = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      cleanup()

      updateConnectionStatus('Setting up WebRTC connection...')

      try {
        // Create a new RTCPeerConnection
        const peerConnection = new RTCPeerConnection({
          // actually not needed for local communication
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
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate && window.opener) {
            window.opener.postMessage(
              {
                type: 'ice-candidate',
                candidate: event.candidate
                  ? {
                      candidate: event.candidate.candidate,
                      sdpMid: event.candidate.sdpMid,
                      sdpMLineIndex: event.candidate.sdpMLineIndex,
                    }
                  : null,
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
            videoRef.current.srcObject = event.streams[0]
            updateConnectionStatus('Video stream received')
          }
        }
        // Set the remote description from the offer
        await peerConnection.setRemoteDescription(offer)

        // Create an answer
        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)

        // Send the answer back to the primary window
        if (window.opener) {
          window.opener.postMessage(
            {
              type: 'webrtc-answer',
              answer,
            },
            '*',
          )
        }

        updateConnectionStatus(
          'WebRTC connection established, waiting for video...',
        )
      } catch (error) {
        updateConnectionStatus(`WebRTC setup error: ${error}`, true)
      }
    },
    [cleanup, updateConnectionStatus],
  )

  const messageListener = useCallback(
    (event: MessageEvent) => {
      if (event.source !== window.opener) return

      console.log('Received message from primary window:', event.data)

      if (event.data?.type === 'webrtc-offer') {
        // Handle WebRTC offer from primary window
        setupPeerConnection(event.data.offer)
      } else if (event.data?.type === 'ice-candidate') {
        // Handle ICE candidate from primary window
        if (peerConnectionRef.current) {
          peerConnectionRef.current
            .addIceCandidate(event.data.candidate)
            .catch((error) => {
              console.error('Error adding ICE candidate:', error)
            })
        }
      }
    },
    [setupPeerConnection],
  )

  // Set up message listener for secondary window
  useEffect(() => {
    updateConnectionStatus('Waiting for connection from primary window...')

    const handleBeforeUnload = () => {
      // Notify primary we're reloading, not closing
      window.opener?.postMessage('windowReloading', '*')
    }
    // Send message to opener when this window is closed or reloaded
    window.addEventListener('beforeunload', handleBeforeUnload)

    // Handle messages from the primary window
    window.addEventListener('message', messageListener)
    // Signal to the opener that this window is ready to receive connections
    const signalReady = () => {
      if (window.opener) {
        // Check if this is a page reload using sessionStorage
        const isReload = sessionStorage.getItem('wasLoaded') === 'true'
        if (isReload) {
          // This is a reload, send special message
          window.opener.postMessage('windowReloaded', '*')
        } else {
          // First load
          sessionStorage.setItem('wasLoaded', 'true')
          window.opener.postMessage('windowReady', '*')
        }
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

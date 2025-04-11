import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  useEffect,
} from 'react'
import { captureVideoStream } from '../components/captureVideoStream'

export const DualScreen = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
} as const

export const SECONDARY_SEARCH_PARAM_NAME = 'secondary'

export type DualScreenType = (typeof DualScreen)[keyof typeof DualScreen]

interface DualScreenContextProps {
  isPrimaryScreen: boolean
  isSecondaryScreen: boolean
  primary: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    connectionStatus: string
    isSecondWindowOpen: boolean
    openSecondWindow: () => Promise<void>
    closeSecondWindow: () => void
    isPaused: boolean
    togglePause: () => void
  }
  secondary: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    connectionStatus: string
    togglePlayOnSecondary: () => boolean
    updateConnectionStatus: (status: string) => void
  }
}

const DualScreenContext = createContext<DualScreenContextProps>({
  isPrimaryScreen: true,
  isSecondaryScreen: false,
  primary: {
    videoRef: { current: null },
    connectionStatus: '',
    isSecondWindowOpen: false,
    openSecondWindow: async () => {},
    closeSecondWindow: () => {},
    isPaused: false,
    togglePause: () => {},
  },
  secondary: {
    videoRef: { current: null },
    connectionStatus: '',
    togglePlayOnSecondary: () => false,
    updateConnectionStatus: () => undefined,
  },
})

export function DualScreenProvider({ children }: PropsWithChildren) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream>(null)

  const [connectionStatus, setConnectionStatus] = useState('')
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(
    null,
  )

  const [isSecondWindowOpen, setIsSecondWindowOpen] = useState(false)
  const secondWindowRef = useRef<Window | null>(null)

  const [isPaused, setIsPaused] = useState(false)

  const updateConnectionStatus = useCallback((status: string) => {
    console.log('Connection Status:', status)
    setConnectionStatus(status)
  }, [])

  const url = new URL(window.location.href)
  const searchParams = new URLSearchParams(url.search)
  const secondaryParam = searchParams.get(SECONDARY_SEARCH_PARAM_NAME)

  const isPrimaryScreen = useMemo(
    () => secondaryParam !== 'true',
    [secondaryParam],
  )

  const isSecondaryScreen = useMemo(
    () => secondaryParam === 'true',
    [secondaryParam],
  )

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
        console.error('Error setting remote description:', error)
        updateConnectionStatus(
          `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    [updateConnectionStatus],
  )

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

          updateConnectionStatus('WebRTC offer sent, waiting for answer...')
        }
      } catch (error) {
        console.error('Error setting up WebRTC:', error)
        updateConnectionStatus(
          `WebRTC setup error: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    } catch (error) {
      console.error('Error in WebRTC setup:', error)
      updateConnectionStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
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
        }
      }, 500)
    } catch (error) {
      console.error('Error opening second window:', error)
      updateConnectionStatus(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }, [
    cleanup,
    handleIceCandidate,
    handleWebRTCAnswer,
    startWebRTCConnection,
    updateConnectionStatus,
  ])

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

  // Close the second window
  const closeSecondWindow = useCallback(() => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.close()
      secondWindowRef.current = null
      setIsSecondWindowOpen(false)
      cleanup()
    }
  }, [cleanup])

  // Set up message listener for secondary window
  useEffect(() => {
    if (isSecondaryScreen) {
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
    }
  }, [cleanup, handleWebRTCOffer, isSecondaryScreen, updateConnectionStatus])

  // handler to ask the user for confirmation before leaving / reloading the primary screen when the secondary screen is open
  useEffect(() => {
    // handler to ask the user for confirmation before leaving / reloading the primary screen
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (isPrimaryScreen && isSecondWindowOpen) {
        event.preventDefault()
        event.returnValue = true
      }
    }
    // handler to close the secondary screen when the user has confirmed to leave / reload the primary screen
    function handlePageHide() {
      if (isPrimaryScreen && isSecondWindowOpen) {
        closeSecondWindow()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [closeSecondWindow, isPrimaryScreen, isSecondWindowOpen])

  return (
    <DualScreenContext
      value={{
        isPrimaryScreen,
        isSecondaryScreen,
        primary: {
          videoRef,
          connectionStatus,
          isSecondWindowOpen,
          openSecondWindow,
          closeSecondWindow,
          isPaused,
          togglePause,
        },
        secondary: {
          videoRef,
          connectionStatus,
          updateConnectionStatus,
          togglePlayOnSecondary,
        },
      }}
    >
      {children}
    </DualScreenContext>
  )
}

export const useDualScreen = () => {
  return useContext(DualScreenContext)
}

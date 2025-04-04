import { useState, useRef, useEffect, useCallback } from 'react'

// Type augmentation for HTMLVideoElement to include captureStream
declare global {
  interface HTMLVideoElement {
    captureStream(): MediaStream;
    // For Firefox compatibility
    mozCaptureStream(): MediaStream;
  }
}

const PrimaryPlayer = () => {
  const [isSecondWindowOpen, setIsSecondWindowOpen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const secondWindowRef = useRef<Window | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // Clean up WebRTC connection
  const cleanupConnection = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.close()
      channelRef.current = null
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    // Stop all tracks in the stream
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      for (const track of tracks) {
        track.stop();
      }
      streamRef.current = null;
    }

    // Clear pending candidates
    pendingCandidatesRef.current = []

    // Remove message event listener
    if (messageListenerRef.current) {
      window.removeEventListener('message', messageListenerRef.current)
      messageListenerRef.current = null
    }

    setConnectionStatus('')
  }, [])

  // Close the second window
  const closeSecondWindow = useCallback(() => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.close()
      secondWindowRef.current = null
      setIsSecondWindowOpen(false)
      cleanupConnection()
    }
  }, [cleanupConnection])

  // Initialize PeerConnection when the second window is opened
  const createPeerConnection = async () => {
    // Clean up any existing connection first
    cleanupConnection()
    
    try {
      setConnectionStatus('Creating peer connection...')

      // Create a peer connection with more STUN/TURN servers for better NAT traversal
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
      })
      
      peerConnectionRef.current = peerConnection
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        console.log('ICE candidate (primary):', event.candidate)
        
        if (event.candidate && secondWindowRef.current) {
          // Send the ICE candidate to the second window
          secondWindowRef.current.postMessage({
            type: 'ice-candidate',
            candidate: {
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              sdpMid: event.candidate.sdpMid,
              candidate: event.candidate.candidate
            }
          }, '*')
        }
      }
      
      peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState
        console.log('ICE connection state (primary):', state)
        
        setConnectionStatus(`Connection state: ${state}`)
        
        if (state === 'connected' || state === 'completed') {
          setConnectionStatus('Connected! Streaming video...')
        } else if (state === 'failed') {
          setConnectionStatus('Connection failed. Try refreshing both windows.')
          console.error('ICE connection failed')
        } else if (state === 'disconnected') {
          setConnectionStatus('Connection disconnected. Attempting to reconnect...')
        }
      }

      // Log additional connection state information
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState)
      }

      peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState)
      }
      
      // Create data channel for commands
      const dataChannel = peerConnection.createDataChannel('commands')
      channelRef.current = dataChannel
      
      dataChannel.onopen = () => {
        console.log('Data channel opened (primary)')
        setConnectionStatus('Data channel opened, can control playback')
      }
      
      dataChannel.onerror = (error) => {
        console.error('Data channel error (primary):', error)
        setConnectionStatus('Data channel error')
      }

      dataChannel.onclose = () => {
        console.log('Data channel closed')
        setConnectionStatus('Data channel closed')
      }
      
      // Create offer with explicit video codec preferences for better compatibility
      const offerOptions: RTCOfferOptions = {
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      }
      
      const offer = await peerConnection.createOffer(offerOptions)
      
      // Prefer VP8 codec in the SDP for better compatibility
      let modifiedSdp = offer.sdp;
      if (modifiedSdp) {
        // Add VP8 as first codec
        modifiedSdp = modifiedSdp.replace(/m=video .*\r\n/g, (line) => {
          return `${line}a=rtpmap:96 VP8/90000\r\na=rtcp-fb:96 nack\r\na=rtcp-fb:96 nack pli\r\na=rtcp-fb:96 ccm fir\r\n`;
        });
        
        // Modify the offer with our preferred codec
        offer.sdp = modifiedSdp;
      }
      
      await peerConnection.setLocalDescription(offer)
      
      // Convert the offer to a plain object to avoid cloning issues
      const plainOffer = {
        type: peerConnection.localDescription?.type,
        sdp: peerConnection.localDescription?.sdp
      }
      
      return plainOffer
    } catch (error) {
      console.error('Error creating peer connection:', error)
      setConnectionStatus(`Error creating connection: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  // Handle the answer from the second window
  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (peerConnectionRef.current) {
      try {
        setConnectionStatus('Setting remote description...')
        await peerConnectionRef.current.setRemoteDescription(answer)
        console.log('Remote description set successfully')
        
        // Add any queued ICE candidates
        await Promise.all(pendingCandidatesRef.current.map(async (candidate) => {
          if (peerConnectionRef.current) {
            try {
              await peerConnectionRef.current.addIceCandidate(candidate)
              console.log('Added queued ICE candidate')
            } catch (error) {
              console.error('Error adding queued ICE candidate:', error)
            }
          }
        }))
        
        // Clear the queue
        pendingCandidatesRef.current = []
        
        setConnectionStatus('Establishing connection...')
      } catch (error) {
        console.error('Error setting remote description:', error)
        setConnectionStatus(`Error with remote description: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // Handle incoming ICE candidates from the second window
  const handleIceCandidate = async (candidateData: RTCIceCandidateInit) => {
    try {
      const candidate = new RTCIceCandidate(candidateData)
      
      if (peerConnectionRef.current?.remoteDescription) {
        // If we already have a remote description, add the candidate immediately
        await peerConnectionRef.current.addIceCandidate(candidate)
        console.log('Added ICE candidate')
      } else {
        // Otherwise, queue the candidate to be added later
        pendingCandidatesRef.current.push(candidate)
        console.log('Queued ICE candidate')
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error)
    }
  }

  // Capture video stream with cross-browser support
  const captureVideoStream = (video: HTMLVideoElement): MediaStream => {
    let stream: MediaStream;
    
    // Try regular captureStream first
    if (typeof video.captureStream === 'function') {
      stream = video.captureStream();
    }
    // Then try Firefox's mozCaptureStream
    else if (typeof video.mozCaptureStream === 'function') {
      stream = video.mozCaptureStream();
    }
    // If neither is available, throw an error
    else {
      throw new Error('Video capture not supported in this browser');
    }
    
    // Store the stream reference for cleanup
    streamRef.current = stream;
    
    return stream;
  }

  // Open a new window and establish WebRTC connection
  const openSecondWindow = async () => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.focus()
      return
    }

    try {
      setConnectionStatus('Opening second window...')
      
      // Open a new window with the same app but with secondary parameter
      const secondaryUrl = `${window.location.origin}${window.location.pathname}?secondary=true`
      const newWindow = window.open(secondaryUrl, '_blank', 'width=800,height=600')
      
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
          cleanupConnection()
        } else if (event.data === 'windowReady') {
          // Once the secondary window signals it's ready, set up WebRTC
          setupWebRTC(secondWindowRef.current as Window)
        } else if (event.data.type === 'answer') {
          handleAnswer(event.data.answer)
        } else if (event.data.type === 'ice-candidate') {
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
          cleanupConnection()
          return
        }
      }, 500)
    } catch (error) {
      console.error('Error opening second window:', error)
      setConnectionStatus(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  // Set up WebRTC after window is loaded
  const setupWebRTC = async (targetWindow: Window) => {
    try {
      console.log('Setting up WebRTC connection...')
      setConnectionStatus('Setting up WebRTC connection...')
      
      // Create and send the offer
      const offer = await createPeerConnection()
      console.log('Created offer:', offer)
      
      // Ensure the video element is ready before capturing the stream
      if (!videoRef.current) {
        console.error('Video element not available')
        setConnectionStatus('Error: Video element not available')
        return
      }
      
      // Make sure the video is loaded and can be played
      const video = videoRef.current;
      if (video.readyState < 2) { // HAVE_CURRENT_DATA
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
        
        // Capture the video stream with cross-browser support
        const stream = captureVideoStream(video);
        console.log('Captured stream with tracks:', stream.getTracks().length)
        
        if (stream.getTracks().length === 0) {
          console.error('No tracks in captured stream')
          setConnectionStatus('Error: No video tracks available')
          return
        }
        
        // Log track information
        const tracks = stream.getTracks()
        for (const track of tracks) {
          console.log(`Track ${track.id} info:`, {
            kind: track.kind,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          });
        }
        
        // Add tracks to the peer connection
        if (peerConnectionRef.current) {
          for (const track of stream.getTracks()) {
            peerConnectionRef.current.addTrack(track, stream)
            console.log('Added track to peer connection:', track.kind)
          }
          
          // Send the offer to the secondary window
          targetWindow.postMessage({ type: 'offer', offer }, '*')
          setConnectionStatus('Sent offer, waiting for answer...')
        }
      } catch (error) {
        console.error('Error capturing stream:', error)
        setConnectionStatus(`Error capturing video: ${error instanceof Error ? error.message : String(error)}`)
      }
    } catch (error) {
      console.error('Error setting up WebRTC:', error)
      setConnectionStatus(`Error setting up WebRTC: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Toggle pause/play in the second window
  const togglePause = () => {
    if (channelRef.current && channelRef.current.readyState === 'open') {
      if (isPaused) {
        channelRef.current.send('play')
      } else {
        channelRef.current.send('pause')
      }
      setIsPaused(!isPaused)
    } else {
      console.warn('Data channel not open, cannot send pause/play command')
      setConnectionStatus('Cannot control playback: connection not established')
    }
  }

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      closeSecondWindow()
      cleanupConnection()
    }
  }, [closeSecondWindow, cleanupConnection])

  return (
    <>
      <div className="video-container">
        <video 
          ref={videoRef} 
          src="/winter.mp4" 
          autoPlay 
          loop 
          muted 
          controls
        />
      </div>
      
      <div className="controls">
        <button type="button" onClick={openSecondWindow} disabled={isSecondWindowOpen}>
          {isSecondWindowOpen ? 'Second Window Open' : 'Open Second Window'}
        </button>
        
        {isSecondWindowOpen && (
          <>
            <button type="button" onClick={togglePause}>
              {isPaused ? 'Resume in Second Window' : 'Pause in Second Window'}
            </button>
            <button type="button" onClick={closeSecondWindow}>Close Second Window</button>
          </>
        )}
      </div>
      
      {connectionStatus && (
        <div className="connection-status">
          Primary Status: {connectionStatus}
        </div>
      )}
    </>
  )
}

export default PrimaryPlayer 
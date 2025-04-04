import { useState, useRef, useEffect, useCallback } from 'react'

// Type augmentation for HTMLVideoElement to include captureStream
declare global {
  interface HTMLVideoElement {
    captureStream(): MediaStream;
  }
}

const PrimaryPlayer = () => {
  const [isSecondWindowOpen, setIsSecondWindowOpen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const secondWindowRef = useRef<Window | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(null)

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

    // Remove message event listener
    if (messageListenerRef.current) {
      window.removeEventListener('message', messageListenerRef.current)
      messageListenerRef.current = null
    }
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
    
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    
    peerConnectionRef.current = peerConnection
    
    // Add ICE candidate event handlers for debugging
    peerConnection.onicecandidate = (event) => {
      console.log('ICE candidate:', event.candidate)
    }
    
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', peerConnection.iceConnectionState)
    }
    
    // Create data channel for commands
    const dataChannel = peerConnection.createDataChannel('commands')
    channelRef.current = dataChannel
    
    dataChannel.onopen = () => console.log('Data channel opened')
    dataChannel.onerror = (error) => console.error('Data channel error:', error)
    
    // Create offer
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    
    // Convert the offer to a plain object to avoid cloning issues
    const plainOffer = {
      type: peerConnection.localDescription?.type,
      sdp: peerConnection.localDescription?.sdp
    }
    
    return plainOffer
  }

  // Handle the answer from the second window
  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (peerConnectionRef.current) {
      try {
        await peerConnectionRef.current.setRemoteDescription(answer)
        console.log('Remote description set successfully')
      } catch (error) {
        console.error('Error setting remote description:', error)
      }
    }
  }

  // Open a new window and establish WebRTC connection
  const openSecondWindow = async () => {
    if (secondWindowRef.current && !secondWindowRef.current.closed) {
      secondWindowRef.current.focus()
      return
    }

    // Open a new window with the same app but with secondary parameter
    const secondaryUrl = `${window.location.origin}${window.location.pathname}?secondary=true`
    const newWindow = window.open(secondaryUrl, '_blank', 'width=800,height=600')
    
    if (!newWindow) {
      alert('Please allow pop-ups for this website')
      return
    }
    
    secondWindowRef.current = newWindow
    setIsSecondWindowOpen(true)
    
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
      }
    }
    
    // Store the listener reference so we can remove it later
    messageListenerRef.current = messageListener
    window.addEventListener('message', messageListener)
    
    // Wait for the secondary window to load
    const checkWindowLoaded = setInterval(() => {
      if (newWindow.closed) {
        clearInterval(checkWindowLoaded)
        setIsSecondWindowOpen(false)
        cleanupConnection()
        return
      }
    }, 500)
  }
  
  // Set up WebRTC after window is loaded
  const setupWebRTC = async (targetWindow: Window) => {
    try {
      console.log('Setting up WebRTC connection...')
      
      // Create and send the offer
      const offer = await createPeerConnection()
      console.log('Created offer:', offer)
      
      // Ensure the video element is ready before capturing the stream
      if (!videoRef.current) {
        console.error('Video element not available')
        return
      }
      
      // Make sure the video is loaded and can be played
      const video = videoRef.current;
      if (video.readyState < 2) { // HAVE_CURRENT_DATA
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            video.removeEventListener('canplay', onCanPlay)
            resolve()
          }
          video.addEventListener('canplay', onCanPlay)
        })
      }
      
      // Capture the video stream
      const stream = video.captureStream()
      console.log('Captured stream with tracks:', stream.getTracks().length)
      
      // Add tracks to the peer connection
      if (peerConnectionRef.current) {
        for (const track of stream.getTracks()) {
          peerConnectionRef.current.addTrack(track, stream)
          console.log('Added track to peer connection:', track.kind)
        }
        
        // Send the offer to the secondary window
        targetWindow.postMessage({ type: 'offer', offer }, '*')
      }
    } catch (error) {
      console.error('Error setting up WebRTC:', error)
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
    </>
  )
}

export default PrimaryPlayer 
import { useRef, useEffect, useState } from 'react'

const SecondaryPlayer = () => {
  const [connectionStatus, setConnectionStatus] = useState('Initializing...')
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)

  useEffect(() => {
    console.log('Secondary player initializing...')
    setConnectionStatus('Waiting for connection from primary window...')

    // Signal to the opener that this window is ready to receive connections
    const signalReady = () => {
      if (window.opener) {
        console.log('Signaling ready to parent window')
        window.opener.postMessage('windowReady', '*')
        setConnectionStatus('Ready signal sent, waiting for offer...')
      } else {
        console.error('No opener window found')
        setConnectionStatus('Error: No opener window found')
      }
    }

    // Send message to opener when this window is closed
    window.addEventListener('beforeunload', () => {
      if (window.opener) {
        window.opener.postMessage('windowClosed', '*')
      }
    })

    // Set up the WebRTC receiver
    const setupReceiver = () => {
      // Handle messages from the primary window
      window.addEventListener('message', async (event) => {
        // Make sure the message is from our opener
        if (event.source !== window.opener) return
        
        console.log('Received message from primary window:', event.data)

        if (event.data.type === 'offer') {
          try {
            console.log('Received offer, setting up peer connection')
            setConnectionStatus('Offer received, setting up connection...')
            
            // Create a new peer connection
            const peerConnection = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            })
            
            peerConnectionRef.current = peerConnection
            
            // Debug events
            peerConnection.onicecandidate = (event) => {
              console.log('ICE candidate (secondary):', event.candidate)
            }
            
            peerConnection.oniceconnectionstatechange = () => {
              const state = peerConnection.iceConnectionState
              console.log('ICE connection state (secondary):', state)
              setConnectionStatus(`ICE connection: ${state}`)
              
              if (state === 'connected' || state === 'completed') {
                setConnectionStatus('Connected! Streaming video...')
              } else if (state === 'failed') {
                setConnectionStatus('Connection failed. Try refreshing the page.')
              }
            }
            
            // Set up data channel for commands
            peerConnection.ondatachannel = (event) => {
              const dataChannel = event.channel
              console.log('Data channel received:', dataChannel.label)
              
              dataChannel.onopen = () => {
                console.log('Data channel opened (secondary)')
              }
              
              dataChannel.onmessage = (e) => {
                console.log('Command received:', e.data)
                if (e.data === 'pause' && videoRef.current) {
                  videoRef.current.pause()
                } else if (e.data === 'play' && videoRef.current) {
                  videoRef.current.play()
                }
              }
              
              dataChannel.onerror = (error) => {
                console.error('Data channel error (secondary):', error)
                setConnectionStatus('Data channel error. Check console for details.')
              }
            }
            
            // Set up video stream handling
            peerConnection.ontrack = (event) => {
              console.log('Track received:', event.track.kind)
              if (videoRef.current && event.streams && event.streams[0]) {
                console.log('Setting video source to received stream')
                videoRef.current.srcObject = event.streams[0]
                
                // Attempt to play the video
                videoRef.current.play().catch(err => {
                  console.error('Error playing video:', err)
                  setConnectionStatus(`Error playing video: ${err.message}`)
                })
              } else {
                console.error('Video element or stream not available')
                setConnectionStatus('Error: Video element or stream not available')
              }
            }
            
            // Accept the offer and create an answer
            await peerConnection.setRemoteDescription(event.data.offer)
            console.log('Remote description set')
            
            const answer = await peerConnection.createAnswer()
            await peerConnection.setLocalDescription(answer)
            console.log('Created and set local answer')
            
            // Convert the RTCSessionDescription to a plain object before sending
            // This avoids the DataCloneError when using postMessage
            const plainAnswer = {
              type: peerConnection.localDescription?.type,
              sdp: peerConnection.localDescription?.sdp
            }
            
            // Send the answer back to the primary window
            window.opener.postMessage({
              type: 'answer',
              answer: plainAnswer
            }, '*')
            console.log('Sent answer to primary window')
            setConnectionStatus('Answer sent, establishing connection...')
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            console.error('Error setting up WebRTC receiver:', error)
            setConnectionStatus(`Error setting up connection: ${errorMessage}`)
          }
        }
      })
    }
    
    // Set everything up
    setupReceiver()
    
    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 1000)
    
    // Clean up on component unmount
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
    }
  }, [])

  return (
    <div className="video-container secondary">
      <h1>Video Streaming Receiver</h1>
      <div className="connection-status">
        Status: {connectionStatus}
      </div>
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline
        controls
        aria-label="Received video stream from primary window"
      >
        <track kind="captions" src={undefined} label="English" />
      </video>
      <p>This window is receiving a video stream from the main window.</p>
    </div>
  )
}

export default SecondaryPlayer 
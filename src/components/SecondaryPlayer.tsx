import { useRef, useEffect, useState } from 'react'

const SecondaryPlayer = () => {
  const [connectionStatus, setConnectionStatus] = useState('Initializing...')
  const videoRef = useRef<HTMLVideoElement>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidate[]>([])

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

    // Handle an ICE candidate from the primary window
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
          console.log('Queued ICE candidate for later')
        }
      } catch (error) {
        console.error('Error handling ICE candidate:', error)
      }
    }

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
            
            // Create a new peer connection with better STUN/TURN servers
            const peerConnection = new RTCPeerConnection({
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
              ],
              iceCandidatePoolSize: 10
            })
            
            peerConnectionRef.current = peerConnection
            
            // Debug events
            peerConnection.onicecandidate = (event) => {
              console.log('ICE candidate (secondary):', event.candidate)
              
              if (event.candidate && window.opener) {
                // Send the ICE candidate back to the primary window
                window.opener.postMessage({
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
              console.log('ICE connection state (secondary):', state)
              setConnectionStatus(`ICE connection: ${state}`)
              
              if (state === 'connected' || state === 'completed') {
                setConnectionStatus('Connected! Receiving video stream...')
              } else if (state === 'failed') {
                setConnectionStatus('Connection failed. Try refreshing the page.')
                console.error('ICE connection failed')
              } else if (state === 'disconnected') {
                setConnectionStatus('Connection disconnected. Attempting to reconnect...')
              }
            }

            // Log additional connection state information
            peerConnection.onconnectionstatechange = () => {
              console.log('Connection state:', peerConnection.connectionState)
              
              if (peerConnection.connectionState === 'failed') {
                setConnectionStatus('Connection failed. Please refresh both windows.')
              }
            }

            peerConnection.onsignalingstatechange = () => {
              console.log('Signaling state:', peerConnection.signalingState)
            }
            
            // Set up data channel for commands
            peerConnection.ondatachannel = (event) => {
              const dataChannel = event.channel
              console.log('Data channel received:', dataChannel.label)
              
              dataChannel.onopen = () => {
                console.log('Data channel opened (secondary)')
                setConnectionStatus('Control channel opened')
              }
              
              dataChannel.onmessage = (e) => {
                console.log('Command received:', e.data)
                if (e.data === 'pause' && videoRef.current) {
                  videoRef.current.pause()
                } else if (e.data === 'play' && videoRef.current) {
                  videoRef.current.play().catch(error => {
                    console.error('Error playing video:', error)
                  })
                }
              }
              
              dataChannel.onerror = (error) => {
                console.error('Data channel error (secondary):', error)
                setConnectionStatus('Data channel error. Check console for details.')
              }

              dataChannel.onclose = () => {
                console.log('Data channel closed')
                setConnectionStatus('Control channel closed')
              }
            }
            
            // Set up video stream handling
            peerConnection.ontrack = (event) => {
              console.log('Track received:', event.track.kind, event.track)
              if (videoRef.current && event.streams && event.streams[0]) {
                const stream = event.streams[0]
                console.log('Setting video source to received stream with tracks:', 
                  stream.getTracks().map(t => t.kind).join(', '))
                
                // Make sure we're using the latest stream
                videoRef.current.srcObject = null
                videoRef.current.srcObject = stream
                
                // Listen for the loadedmetadata event to make sure the video is ready
                videoRef.current.onloadedmetadata = () => {
                  console.log('Video metadata loaded, attempting to play')
                  
                  // Attempt to play the video
                  videoRef.current?.play().catch(err => {
                    console.error('Error playing video:', err)
                    setConnectionStatus(`Error playing video: ${err.message}`)
                  })
                }
                
                // Also check if the tracks are actually flowing data
                const tracks = stream.getTracks()
                for (const track of tracks) {
                  if (track.muted) {
                    console.warn('Track is muted:', track.kind)
                  }
                  track.onmute = () => console.warn('Track muted:', track.kind)
                  track.onunmute = () => console.log('Track unmuted:', track.kind)
                  track.onended = () => console.warn('Track ended:', track.kind)
                }
              } else {
                console.error('Video element or stream not available')
                setConnectionStatus('Error: Video element or stream not available')
              }
            }
            
            setConnectionStatus('Setting up connection...')
            
            // Accept the offer and create an answer
            await peerConnection.setRemoteDescription(event.data.offer)
            console.log('Remote description set')
            
            // Add any pending ICE candidates
            for (const candidate of pendingCandidatesRef.current) {
              try {
                await peerConnection.addIceCandidate(candidate)
                console.log('Added pending ICE candidate')
              } catch (error) {
                console.error('Error adding pending ICE candidate:', error)
              }
            }
            
            // Clear the queue
            pendingCandidatesRef.current = []
            
            // Create and send answer
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
        } else if (event.data.type === 'ice-candidate') {
          // Handle incoming ICE candidates
          await handleIceCandidate(event.data.candidate)
        }
      })
    }
    
    // Set everything up
    setupReceiver()
    
    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 500)
    
    // Clean up on component unmount
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
      }
    }
  }, [])

  const handleTestPlayback = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().catch(err => {
          console.error('Error playing video:', err)
          setConnectionStatus(`Manual play error: ${err.message}`)
        })
      } else {
        videoRef.current.pause()
      }
    }
  }

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
        muted
        aria-label="Received video stream from primary window"
      >
        <track kind="captions" src="" label="English" />
      </video>
      
      {/* Add a manual play button for debugging */}
      <button type="button" onClick={handleTestPlayback} className="test-button">
        Manual Play/Pause
      </button>
      
      <p>This window is receiving a video stream from the main window.</p>
    </div>
  )
}

export default SecondaryPlayer 
import { useRef, useEffect, useState } from 'react'

const SecondaryPlayer = () => {
  const [connectionStatus, setConnectionStatus] = useState('Initializing...')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const oldUrlsRef = useRef<string[]>([])

  useEffect(() => {
    console.log('Secondary player initializing...')
    setConnectionStatus('Waiting for connection from primary window...')

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

    // Send message to opener when this window is closed
    window.addEventListener('beforeunload', () => {
      window.opener?.postMessage('windowClosed', '*')
      
      // Clean up any blob URLs to avoid memory leaks
      for (const url of oldUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
    })

    // Handle messages from the primary window
    const handleMessage = (event: MessageEvent) => {
      // Make sure the message is from our opener
      if (event.source !== window.opener) return
      
      console.log('Received message from primary window:', typeof event.data)
      
      if (event.data === 'play') {
        if (videoRef.current?.paused) {
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err)
            setConnectionStatus(`Manual play error: ${err.message}`)
          })
        }
      } else if (event.data === 'pause') {
        if (videoRef.current?.paused === false) {
          videoRef.current.pause()
        }
      } else if (typeof event.data === 'object' && event.data.type === 'videoChunk') {
        // Received a new video blob URL
        const { url, autoPlay } = event.data
        
        console.log('Received video chunk URL', `${url.substring(0, 30)}...`)
        setConnectionStatus('Received video chunk')
        
        // Set the new video URL
        setVideoUrl(url)
        
        // Store this URL so we can revoke it later
        oldUrlsRef.current.push(url)
        
        // Clean up old URLs if we have too many (keep last 10)
        if (oldUrlsRef.current.length > 10) {
          const urlToRevoke = oldUrlsRef.current.shift()
          if (urlToRevoke) {
            URL.revokeObjectURL(urlToRevoke)
          }
        }
        
        // Play the video if needed
        if (autoPlay && videoRef.current) {
          videoRef.current.play().catch(err => {
            console.error('Error auto-playing video:', err)
          })
        }
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 500)
    
    // Clean up on component unmount
    return () => {
      window.removeEventListener('message', handleMessage)
      
      // Clean up any blob URLs to avoid memory leaks
      for (const url of oldUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
    }
  }, [])

  // Handle video error
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video error:', e)
    setConnectionStatus('Video error occurred. Check console for details.')
  }

  // Handle video success
  const handleVideoPlay = () => {
    setConnectionStatus('Video playing')
  }

  const handleTestPlayback = () => {
    if (videoRef.current) {
      if (videoRef.current?.paused) {
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
        src={videoUrl || undefined}
        autoPlay 
        playsInline
        controls
        muted
        onError={handleVideoError}
        onPlay={handleVideoPlay}
        aria-label="Received video stream from primary window"
      />
      
      {/* Add a manual play button for debugging */}
      <button type="button" onClick={handleTestPlayback} className="test-button">
        Manual Play/Pause
      </button>
      
      <p>This window is receiving a video stream from the main window.</p>
    </div>
  )
}

export default SecondaryPlayer

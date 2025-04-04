import { useRef, useEffect, useState } from 'react'

const SecondaryPlayer = () => {
  const [connectionStatus, setConnectionStatus] = useState('Initializing...')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  
  // Keep track of any URLs to clean up
  const urlsToCleanupRef = useRef<string[]>([])

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
      
      // Clean up any blob URLs and streams
      cleanupResources();
    })

    // Clean up all resources
    const cleanupResources = () => {
      // Revoke any blob URLs we created
      for (const url of urlsToCleanupRef.current) {
        URL.revokeObjectURL(url);
      }
      urlsToCleanupRef.current = [];

      // Stop any tracks in our stream
      if (streamRef.current) {
        const tracks = streamRef.current.getTracks();
        for (const track of tracks) {
          track.stop();
        }
        streamRef.current = null;
      }
    };

    // Handle messages from the primary window
    const handleMessage = (event: MessageEvent) => {
      // Make sure the message is from our opener
      if (event.source !== window.opener) return
      
      console.log('Received message from primary window:', typeof event.data, event.data?.type || event.data)
      
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
      } else if (typeof event.data === 'object') {
        if (event.data.type === 'videoSource') {
          // Store URL for cleanup
          urlsToCleanupRef.current.push(event.data.url);
          setVideoUrl(event.data.url);
          setConnectionStatus('Received video source, waiting for streams...');
        } 
        else if (event.data.type === 'streamReady') {
          setConnectionStatus(`Stream ready with ${event.data.tracks} tracks`);
        }
        else if (event.data.type === 'streamData') {
          // Handle received media stream
          if (event.data.stream && videoRef.current) {
            try {
              // Save the stream for cleanup
              streamRef.current = event.data.stream;
              
              // Set the stream as the video source
              videoRef.current.srcObject = event.data.stream;
              videoRef.current.play().catch(err => {
                console.error('Error playing stream:', err);
                setConnectionStatus(`Stream playback error: ${err.message}`);
              });
              
              setConnectionStatus('Received media stream, playing...');
            } catch (err) {
              console.error('Error setting stream:', err);
              setConnectionStatus(`Error setting stream: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }
        else if (event.data.type === 'fallbackVideo') {
          // Use the original video URL as fallback
          setConnectionStatus('Using fallback: direct video URL');
          setVideoUrl(event.data.sourceUrl);
          
          // Try to play the video
          if (videoRef.current) {
            videoRef.current.oncanplay = () => {
              videoRef.current?.play().catch((err: Error) => {
                console.error('Error playing fallback video:', err);
              });
            };
          }
        }
      }
    }
    
    window.addEventListener('message', handleMessage)
    
    // Signal ready to the parent window after a short delay to ensure everything is loaded
    setTimeout(signalReady, 500)
    
    // Clean up on component unmount
    return () => {
      window.removeEventListener('message', handleMessage)
      cleanupResources();
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

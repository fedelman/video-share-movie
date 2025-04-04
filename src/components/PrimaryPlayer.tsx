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
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Clean up resources
  const cleanup = useCallback(() => {
    // Stop all tracks in the stream
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      for (const track of tracks) {
        track.stop();
      }
      streamRef.current = null;
    }

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
      cleanup()
    }
  }, [cleanup])

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

  // Open a new window to display the video
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
          cleanup()
        } else if (event.data === 'windowReady') {
          // Once the secondary window signals it's ready, start video streaming
          startStreaming()
        } else if (event.data === 'play') {
          if (videoRef.current) {
            videoRef.current.play();
            setIsPaused(false);
          }
        } else if (event.data === 'pause') {
          if (videoRef.current) {
            videoRef.current.pause();
            setIsPaused(true);
          }
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
          return
        }
      }, 500)
    } catch (error) {
      console.error('Error opening second window:', error)
      setConnectionStatus(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  
  // Start streaming the video to the second window
  const startStreaming = async () => {
    try {
      console.log('Starting video streaming...')
      setConnectionStatus('Setting up video streaming...')
      
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
        
        // Create a video source that will be served to the secondary window
        const mediaSource = new MediaSource();
        const videoUrl = URL.createObjectURL(mediaSource);
        
        // Tell the second window about the source object URL
        if (secondWindowRef.current) {
          secondWindowRef.current.postMessage({
            type: 'videoSource',
            url: videoUrl
          }, '*');
          
          setConnectionStatus('Video source created, waiting for streams to start...');
          
          // Setup direct stream transmission
          // Since MediaSource API is complex for live streaming,
          // let's use a simpler approach: clone and directly inject the video element
          
          // Get the original video element's dimensions
          const { videoWidth, videoHeight } = video;
          
          // Create a canvas to render video frames
          const canvas = document.createElement('canvas');
          canvas.width = videoWidth || 640;
          canvas.height = videoHeight || 480;
          const ctx = canvas.getContext('2d');
          
          // Create a direct stream from the canvas
          const canvasStream = canvas.captureStream(30); // 30fps
          
          // Send the stream tracks to the second window
          if (canvasStream.getTracks().length > 0) {
            // Let the secondary window know we have the stream ready
            secondWindowRef.current.postMessage({
              type: 'streamReady',
              tracks: canvasStream.getTracks().length
            }, '*');
            
            // Animation function to continuously draw the video to canvas
            const drawVideoFrame = () => {
              if (!secondWindowRef.current || secondWindowRef.current.closed) {
                return; // Stop if window closed
              }
              
              if (video.readyState >= 2 && ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              }
              
              requestAnimationFrame(drawVideoFrame);
            };
            
            // Start drawing frames
            drawVideoFrame();
            
            // Send the canvas stream directly
            const streamData = {
              type: 'streamData',
              stream: canvasStream // This will be cloned properly by the browser
            };
            
            try {
              // Transfer the stream to the secondary window
              // Note: This works in same-origin contexts and requires browser support
              secondWindowRef.current.postMessage(streamData, '*', [canvasStream]);
              setConnectionStatus('Stream sent to second window!');
            } catch (err) {
              console.error('Error transferring stream:', err);
              
              // Fall back to simpler approach - send the video source URL
              secondWindowRef.current.postMessage({
                type: 'fallbackVideo',
                sourceUrl: video.src
              }, '*');
              
              setConnectionStatus('Using fallback mode: sending video URL');
            }
          }
          
          // Toggle pause/play in the second window based on the primary video state
          video.onpause = () => {
            if (secondWindowRef.current) {
              secondWindowRef.current.postMessage('pause', '*');
              setIsPaused(true);
            }
          };
          
          video.onplay = () => {
            if (secondWindowRef.current) {
              secondWindowRef.current.postMessage('play', '*');
              setIsPaused(false);
            }
          };
        }
      } catch (error) {
        console.error('Error capturing stream:', error)
        setConnectionStatus(`Error capturing video: ${error instanceof Error ? error.message : String(error)}`)
      }
    } catch (error) {
      console.error('Error setting up streaming:', error)
      setConnectionStatus(`Error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Toggle pause/play in the second window
  const togglePause = () => {
    if (secondWindowRef.current) {
      if (isPaused) {
        secondWindowRef.current.postMessage('play', '*');
        if (videoRef.current) videoRef.current.play();
      } else {
        secondWindowRef.current.postMessage('pause', '*');
        if (videoRef.current) videoRef.current.pause();
      }
      setIsPaused(!isPaused);
    } else {
      console.warn('Second window not available')
      setConnectionStatus('Cannot control playback: second window not open')
    }
  }

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      closeSecondWindow()
      cleanup()
    }
  }, [closeSecondWindow, cleanup])

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
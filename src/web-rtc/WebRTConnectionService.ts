import { captureVideoStream } from './captureVideoStream'

export type WebRTConnectionStatusCallback = (
  status: string,
  isError?: boolean,
) => void

export type MessageCallback = (message: unknown) => void

export const PeerRole = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
} as const

export type PeerRole = (typeof PeerRole)[keyof typeof PeerRole]

export class WebRTConnectionService {
  private role: PeerRole
  private peerConnection: RTCPeerConnection | null = null
  private remoteWindow: Window
  private statusCallback: WebRTConnectionStatusCallback
  private onMessageReceived: MessageCallback

  private videoElement: HTMLVideoElement
  private stream: MediaStream | null = null

  constructor(
    role: PeerRole,
    remoteWindow: Window | null,
    videoElement: HTMLVideoElement | null,
    statusCallback: WebRTConnectionStatusCallback,
    onMessageReceived: MessageCallback,
  ) {
    this.role = role
    if (!remoteWindow) {
      throw new Error('Remote window is required for a WebRTC connection.')
    }
    this.remoteWindow = remoteWindow
    if (!videoElement) {
      throw new Error('Video element is required for a WebRTC connection.')
    }
    this.videoElement = videoElement
    this.statusCallback = statusCallback
    this.onMessageReceived = onMessageReceived
  }

  public cleanup(): void {
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop()
      }
      this.stream = null
    }
    if (this.videoElement?.srcObject) {
      this.videoElement.srcObject = null
    }
    this.statusCallback('')
  }
  /**
   * Send a message to the remote window
   */
  public sendMessage(message: unknown): void {
    if (this.remoteWindow && !this.remoteWindow.closed) {
      this.remoteWindow.postMessage(message, '*')
    }
  }
  /**
   * Handle incoming WebRTC related messages
   */
  public handleMessage(event: MessageEvent): void {
    const data = event.data
    if (data?.type === 'webrtc-offer') {
      this.handleOffer(data.offer)
    } else if (data?.type === 'webrtc-answer') {
      this.handleAnswer(data.answer)
    } else if (data?.type === 'ice-candidate') {
      this.handleIceCandidate(data.candidate)
    } else {
      // Pass other messages to the callback
      this.onMessageReceived(data)
    }
  }
  /**
   * Creates and sends an offer (primary role)
   */
  public async createOffer(videoElement: HTMLVideoElement): Promise<void> {
    try {
      this.statusCallback('Setting up WebRTC connection...')
      this.videoElement = videoElement

      if (videoElement.readyState < 2) {
        this.statusCallback('Waiting for video to load...')
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            videoElement.removeEventListener('canplay', onCanPlay)
            resolve()
          }
          videoElement.addEventListener('canplay', onCanPlay)
        })
      }
      // Ensure video is playing
      this.statusCallback('Capturing video stream...')
      if (videoElement.paused) {
        await videoElement.play()
      }
      // Capture the video stream
      this.stream = captureVideoStream(videoElement)
      if (this.stream.getTracks().length === 0) {
        this.statusCallback('Error: No video tracks available', true)
        return
      }
      // Initialize RTCPeerConnection
      this.initializePeerConnection()

      // Add tracks from the stream
      if (this.peerConnection && this.stream) {
        for (const track of this.stream.getTracks()) {
          this.peerConnection.addTrack(track, this.stream)
        }
      }
      // Create offer
      if (!this.peerConnection) {
        this.statusCallback('Error: Peer connection not initialized', true)
        return
      }
      const offer = await this.peerConnection.createOffer()
      await this.peerConnection.setLocalDescription(offer)

      // Send offer to secondary window
      if (this.remoteWindow && this.peerConnection.localDescription) {
        this.sendMessage({
          type: 'webrtc-offer',
          offer: this.peerConnection.localDescription.toJSON(),
        })
        this.statusCallback('WebRTC offer sent, waiting for answer...')
      }
    } catch (error) {
      this.statusCallback(
        `WebRTC setup error: ${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }
  }
  /**
   * Handle an offer received from the primary (secondary role)
   */
  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      this.statusCallback('Setting up WebRTC connection...')

      // Initialize RTCPeerConnection
      this.initializePeerConnection()

      if (!this.peerConnection) {
        this.statusCallback('Error: Peer connection not initialized', true)
        return
      }
      // Set the remote description (the offer)
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer),
      )
      // Create an answer
      const answer = await this.peerConnection.createAnswer()
      await this.peerConnection.setLocalDescription(answer)

      // Set up track handling
      this.setupVideoTrackHandlingOnSecondary()

      // Send the answer back
      this.sendMessage({
        type: 'webrtc-answer',
        answer,
      })
      this.statusCallback('WebRTC connection established, waiting for video...')
    } catch (error) {
      this.statusCallback(`WebRTC setup error: ${error}`, true)
    }
  }
  /**
   * Handle an answer received from the secondary (primary role)
   */
  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      if (!this.peerConnection) {
        this.statusCallback('No peer connection available', true)
        return
      }
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(answer),
      )
      this.statusCallback('WebRTC connection established')
    } catch (error) {
      this.statusCallback(
        `WebRTC error: ${error instanceof Error ? error.message : String(error)}`,
        true,
      )
    }
  }
  /**
   * Handle ICE candidate from the remote peer
   */
  private async handleIceCandidate(
    candidate: RTCIceCandidateInit | null,
  ): Promise<void> {
    try {
      if (!this.peerConnection) {
        this.statusCallback(
          'Error adding ICE candidate. No peer connection set up.',
          true,
        )
        return
      }
      if (candidate) {
        await this.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate),
        )
      }
    } catch (error) {
      this.statusCallback(`Error adding ICE candidate: ${error}`, true)
    }
  }

  private initializePeerConnection(): void {
    // Cleanup existing connection if any
    if (this.peerConnection) {
      this.peerConnection.close()
    }
    // Create new connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    // Set up common event handlers
    this.peerConnection.onconnectionstatechange = () => {
      const isError =
        this.peerConnection?.connectionState === 'failed' ||
        this.peerConnection?.connectionState === 'disconnected'
      this.statusCallback(
        `WebRTC connection state is "${this.peerConnection?.connectionState}"`,
        isError,
      )
    }
    this.peerConnection.oniceconnectionstatechange = () => {
      const isError =
        this.peerConnection?.iceConnectionState === 'failed' ||
        this.peerConnection?.iceConnectionState === 'disconnected'
      this.statusCallback(
        `ICE connection state is "${this.peerConnection?.iceConnectionState}"`,
        isError,
      )
    }
    this.peerConnection.onicecandidate = (event) => {
      this.sendMessage({
        type: 'ice-candidate',
        candidate: event.candidate
          ? {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            }
          : null,
      })
    }
    this.setupVideoTrackHandlingOnSecondary()
  }
  /**
   * Set up track event handling for the video element
   */
  private setupVideoTrackHandlingOnSecondary(): void {
    if (!this.peerConnection) return
    // Only handle tracks in SECONDARY role
    if (this.role === PeerRole.PRIMARY) return

    this.peerConnection.ontrack = (event) => {
      this.statusCallback(`New track of type "${event.track.kind}" received.`)
      if (event.streams?.[0]) {
        if (this.videoElement) {
          this.stream = event.streams[0]
          this.videoElement.srcObject = this.stream
        } else {
          this.statusCallback(
            'Video track received but no video element is set',
            true,
          )
        }
      }
    }
  }

  public getPeerConnection(): RTCPeerConnection | null {
    return this.peerConnection
  }

  public getRole(): PeerRole {
    return this.role
  }
}

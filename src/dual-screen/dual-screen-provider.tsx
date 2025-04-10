import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'

export const DualScreen = {
  PRIMARY: 'PRIMARY',
  SECONDARY: 'SECONDARY',
} as const

export const SECONDARY_SEARCH_PARAM_NAME = 'secondary'

export type DualScreenType = (typeof DualScreen)[keyof typeof DualScreen]

interface DualScreenContextProps {
  isPrimaryScreen: boolean
  isSecondaryScreen: boolean
  connectionStatus: string
  videoRef: React.RefObject<HTMLVideoElement | null>
  streamRef: React.RefObject<MediaStream | null>
  updateConnectionStatus: (status: string) => void
}

const DualScreenContext = createContext<DualScreenContextProps>({
  isPrimaryScreen: true,
  isSecondaryScreen: false,
  connectionStatus: '',
  videoRef: {
    current: null,
  },
  streamRef: {
    current: null,
  },
  updateConnectionStatus: () => {},
})

export function DualScreenProvider({ children }: PropsWithChildren) {
  const [connectionStatus, setConnectionStatus] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream>(null)

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

  return (
    <DualScreenContext
      value={{
        isPrimaryScreen,
        isSecondaryScreen,
        connectionStatus,
        videoRef,
        streamRef,
        updateConnectionStatus,
      }}
    >
      {children}
    </DualScreenContext>
  )
}

export const useDualScreen = () => {
  return useContext(DualScreenContext)
}

import {
  createContext,
  useContext,
  useMemo,
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
}

const DualScreenContext = createContext<DualScreenContextProps>({
  isPrimaryScreen: true,
  isSecondaryScreen: false,
})

export function DualScreenProvider({ children }: PropsWithChildren) {
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
      }}
    >
      {children}
    </DualScreenContext>
  )
}

export function useDualScreen() {
  return useContext(DualScreenContext)
}

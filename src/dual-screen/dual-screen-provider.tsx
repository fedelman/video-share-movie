import { useMemo, type PropsWithChildren } from 'react'
import { DualScreenContext } from './dual-screen-context'
import { SECONDARY_SEARCH_PARAM_NAME } from './useDualScreen'

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

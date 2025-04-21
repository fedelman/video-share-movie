import { useContext } from 'react'
import { DualScreenContext } from './dual-screen-context'

export const SECONDARY_SEARCH_PARAM_NAME = 'secondary'

export function useDualScreen() {
  return useContext(DualScreenContext)
}

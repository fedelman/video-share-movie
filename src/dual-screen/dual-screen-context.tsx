import { createContext } from 'react'

interface DualScreenContextProps {
  isPrimaryScreen: boolean
  isSecondaryScreen: boolean
}

export const DualScreenContext = createContext<DualScreenContextProps>({
  isPrimaryScreen: true,
  isSecondaryScreen: false,
})

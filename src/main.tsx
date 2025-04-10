import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { DualScreenProvider } from './dual-screen/dual-screen-provider.tsx'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <DualScreenProvider>
      <App />
    </DualScreenProvider>
  </StrictMode>,
)

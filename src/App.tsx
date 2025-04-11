import './App.css'
import { PrimaryPlayer } from './components/PrimaryPlayer'
import { SecondaryPlayer } from './components/SeondaryPlayer'
import { useDualScreen } from './dual-screen'

function App() {
  const { isSecondaryScreen } = useDualScreen()
  return (
    <div className="app">
      {isSecondaryScreen ? <SecondaryPlayer /> : <PrimaryPlayer />}
    </div>
  )
}

export default App

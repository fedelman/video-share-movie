import './App.css'
import PrimaryPlayer from './components/PrimaryPlayer'
import SecondaryPlayer from './components/SecondaryPlayer'
import { useDualScreen } from './dual-screen/dual-screen-provider'

function App() {
  const { isSecondaryScreen } = useDualScreen()
  return (
    <div className="app">
      {isSecondaryScreen ? <SecondaryPlayer /> : <PrimaryPlayer />}
    </div>
  )
}

export default App

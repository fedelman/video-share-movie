import './App.css'
import PrimaryPlayer from './components/PrimaryPlayer'
import SecondaryPlayer from './components/SecondaryPlayer'

// Type augmentation moved to PrimaryPlayer component

function App() {
  // Check if this is the secondary window
  const isSecondaryWindow = new URLSearchParams(window.location.search).get('secondary') === 'true'

  return (
    <div className="app">
      {isSecondaryWindow ? (
        <SecondaryPlayer />
      ) : (
        <PrimaryPlayer />
      )}
    </div>
  )
}

export default App

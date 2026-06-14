import CelestialToolbar from './components/toolbar/CelestialToolbar';
import Canvas3D from './components/canvas/Canvas3D';
import CameraControls from './components/canvas/CameraControls';
import ControlPanel from './components/controls/ControlPanel';
import HistoryPanel from './components/history/HistoryPanel';
import ScoreModal from './components/controls/ScoreModal';
import ErrorBoundary from './components/ErrorBoundary';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import './App.css';

function App() {
  useKeyboardShortcuts();

  return (
    <ErrorBoundary>
      <div className="app">
        <div className="app-panel-left">
          <CelestialToolbar />
        </div>
        <div className="app-panel-center">
          <Canvas3D />
          <CameraControls />
        </div>
        <div className="app-panel-right">
          <ControlPanel />
          <HistoryPanel />
        </div>
        <ScoreModal />
      </div>
    </ErrorBoundary>
  );
}

export default App;

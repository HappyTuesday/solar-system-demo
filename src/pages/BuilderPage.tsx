import { useEffect } from 'react';
import { useBuildStore } from '../stores/buildStore';
import { REAL_DATA } from '../engine/constants';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import CelestialToolbar from '../components/builder/CelestialToolbar';
import BuilderCanvas from '../components/builder/BuilderCanvas';
import CoordinateDisplay from '../components/builder/CoordinateDisplay';
import CloseApproachOverlay from '../components/builder/CloseApproachOverlay';
import ControlPanel from '../components/builder/ControlPanel';
import ScoreModal from '../components/builder/ScoreModal';
import './BuilderPage.css';

function BuilderPage() {
  useKeyboardShortcuts();

  useEffect(() => {
    const store = useBuildStore.getState();
    if (store.bodies.length === 0) {
      store.placeBody('sun', [0, 0, 0], [0, 0, 0], REAL_DATA.sun.mass);
      store.startBuild();
    }
  }, []);

  return (
    <div className="builder-page">
      <div className="builder-canvas-wrapper">
        <BuilderCanvas />
      </div>
      <CelestialToolbar />
      <ControlPanel />
      <CoordinateDisplay />
      <CloseApproachOverlay />
      <ScoreModal />
    </div>
  );
}

export default BuilderPage;

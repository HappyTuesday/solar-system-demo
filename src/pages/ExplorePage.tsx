import ExploreCanvas from '../components/explore/ExploreCanvas';
import Dashboard from '../components/explore/Dashboard';
import HUD from '../components/explore/HUD';
import PhaseGuide from '../components/explore/PhaseGuide';
import CrashOverlay from '../components/explore/CrashOverlay';
import './ExplorePage.css';

function ExplorePage() {
  return (
    <div className="explore-page">
      <div className="explore-canvas-area">
        <ExploreCanvas />
      </div>
      <HUD />
      <Dashboard />
      <PhaseGuide />
      <CrashOverlay />
    </div>
  );
}

export default ExplorePage;

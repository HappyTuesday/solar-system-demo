import ExploreCanvas from '../components/explore/ExploreCanvas';
import Dashboard from '../components/explore/Dashboard';
import HUD from '../components/explore/HUD';
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
      <CrashOverlay />
    </div>
  );
}

export default ExplorePage;

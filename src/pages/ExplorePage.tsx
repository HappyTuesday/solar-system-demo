import ExploreCanvas from '../components/explore/ExploreCanvas';
import Dashboard from '../components/explore/Dashboard';
import CrashOverlay from '../components/explore/CrashOverlay';
import './ExplorePage.css';

function ExplorePage() {
  return (
    <div className="explore-page">
      <div className="explore-canvas-area">
        <ExploreCanvas />
      </div>
      <Dashboard />
      <CrashOverlay />
    </div>
  );
}

export default ExplorePage;

import ExploreCanvas from '../components/explore/ExploreCanvas';
import BodyInfoPanel from '../components/explore/BodyInfoPanel';
import TimeSlider from '../components/explore/TimeSlider';
import './ExplorePage.css';

function ExplorePage() {
  return (
    <div className="explore-page">
      <div className="explore-canvas-area">
        <ExploreCanvas />
        <BodyInfoPanel />
      </div>
      <TimeSlider />
    </div>
  );
}

export default ExplorePage;

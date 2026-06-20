import EarthMoonCanvas from '../components/earthmoon/EarthMoonCanvas';
import MoonPhase from '../components/earthmoon/MoonPhase';
import EclipsePanel from '../components/earthmoon/EclipsePanel';
import TimeSlider from '../components/earthmoon/TimeSlider';
import './EarthMoonPage.css';

function EarthMoonPage() {
  return (
    <div className="earthmoon-page">
      <div className="earthmoon-canvas-area">
        <EarthMoonCanvas />
        <MoonPhase />
        <EclipsePanel />
      </div>
      <TimeSlider />
    </div>
  );
}

export default EarthMoonPage;

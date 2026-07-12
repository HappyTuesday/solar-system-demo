import EarthMoonCanvas from '../components/earthmoon/EarthMoonCanvas';
import MoonPhase from '../components/earthmoon/MoonPhase';
import EclipsePanel from '../components/earthmoon/EclipsePanel';
import TimeSlider from '../components/earthmoon/TimeSlider';
import MissionGuide from '../components/earthmoon/MissionGuide';
import './EarthMoonPage.css';

function EarthMoonPage() {
  return (
    <div className="earthmoon-page">
      <div className="earthmoon-canvas-area">
        <EarthMoonCanvas />
        <MissionGuide />
        <MoonPhase />
        <EclipsePanel />
        <div className="earthmoon-light-note"><span>☀</span> 太阳光从这里照过来</div>
      </div>
      <TimeSlider />
    </div>
  );
}

export default EarthMoonPage;

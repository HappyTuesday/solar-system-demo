import { Routes, Route } from 'react-router-dom';
import TopNav from './components/layout/TopNav';
import HomePage from './pages/HomePage';
import BuilderPage from './pages/BuilderPage';
import ExplorePage from './pages/ExplorePage';
import EarthMoonPage from './pages/EarthMoonPage';
import AboutPage from './pages/AboutPage';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import './App.css';

function App() {
  return (
    <ErrorBoundary>
      <TopNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/builder" element={<BuilderPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/earth-moon" element={<EarthMoonPage />} />
        <Route path="/about" element={<AboutPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;

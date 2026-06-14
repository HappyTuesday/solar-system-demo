import { useRef, useEffect } from 'react';
import {
  rotateCameraHorizontal,
  rotateCameraVertical,
  resetCamera,
  CAMERA_ROTATE_STEP,
} from '../../rendering/setup';
import { getSharedCamera } from '../../rendering/cameraRef';
import './CameraControls.css';

export default function CameraControls() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRotate = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      const camera = getSharedCamera();
      if (!camera) return;
      const step = CAMERA_ROTATE_STEP * 0.5;
      switch (direction) {
        case 'up': rotateCameraVertical(camera, -step); break;
        case 'down': rotateCameraVertical(camera, step); break;
        case 'left': rotateCameraHorizontal(camera, -step); break;
        case 'right': rotateCameraHorizontal(camera, step); break;
      }
    }, 50);
  };

  const stopRotate = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleReset = () => {
    const camera = getSharedCamera();
    if (camera) resetCamera(camera);
  };

  return (
    <div className="camera-controls">
      <button
        className="camera-btn up"
        onMouseDown={() => startRotate('up')}
        onMouseUp={stopRotate}
        onMouseLeave={stopRotate}
      >↑</button>
      <button
        className="camera-btn left"
        onMouseDown={() => startRotate('left')}
        onMouseUp={stopRotate}
        onMouseLeave={stopRotate}
      >←</button>
      <button className="camera-btn reset" onClick={handleReset}>↻</button>
      <button
        className="camera-btn right"
        onMouseDown={() => startRotate('right')}
        onMouseUp={stopRotate}
        onMouseLeave={stopRotate}
      >→</button>
      <button
        className="camera-btn down"
        onMouseDown={() => startRotate('down')}
        onMouseUp={stopRotate}
        onMouseLeave={stopRotate}
      >↓</button>
    </div>
  );
}

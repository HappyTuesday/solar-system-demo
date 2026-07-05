import { useMemo } from 'react';
import { computeFlightParameterRows } from '../../engine/flightParameters';
import { useSpaceshipStore } from '../../stores/spaceshipStore';
import './FlightParametersPanel.css';

function FlightParametersPanel() {
  const position = useSpaceshipStore(s => s.position);
  const velocity = useSpaceshipStore(s => s.velocity);
  const simulatedTime = useSpaceshipStore(s => s.simulatedTime);
  const thrustMagnitude = useSpaceshipStore(s => s.thrustMagnitude);
  const exploded = useSpaceshipStore(s => s.exploded);
  const targetBodyId = useSpaceshipStore(s => s.targetBodyId);
  const navigationPlan = useSpaceshipStore(s => s.navigationPlan);

  const destinationId = targetBodyId ?? navigationPlan?.destinationId ?? '';

  const rows = useMemo(() => {
    if (!destinationId) return [];
    return computeFlightParameterRows({
      shipPosition: position,
      shipVelocity: velocity,
      destinationId,
      simulatedTime,
      thrustMagnitude,
    });
  }, [destinationId, position, velocity, simulatedTime, thrustMagnitude]);

  if (exploded || !destinationId) return null;

  return (
    <aside className="flight-parameters-panel" aria-label="详细轨道参数">
      <div className="flight-parameters-title">详细轨道参数</div>
      <div className="flight-parameters-rows">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flight-parameters-row${row.warn ? ' warn' : ''}${row.highlight ? ' highlight' : ''}`}
          >
            <span className="flight-parameters-key">{row.label}</span>
            <span className="flight-parameters-val">{row.value}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default FlightParametersPanel;

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const SCRIPT = readFileSync(new URL('../../../scripts/flyToMars.ts', import.meta.url), 'utf-8');

describe('flyToMars script structure', () => {
  test('keeps global state focused on physical bodies, ship, time, time scale, and mission phase', () => {
    expect(SCRIPT).toMatch(/let\s+bodies\s*:/);
    expect(SCRIPT).toMatch(/let\s+ship\s*:/);
    expect(SCRIPT).toMatch(/let\s+t\s*=/);
    expect(SCRIPT).toMatch(/let\s+timeScale\s*=/);
    expect(SCRIPT).toMatch(/let\s+missionPhase\s*:/);

    expect(SCRIPT).not.toMatch(/let\s+departed\b/);
    expect(SCRIPT).not.toMatch(/let\s+thrustOn\b/);
    expect(SCRIPT).not.toMatch(/let\s+thrustMag\b/);
    expect(SCRIPT).not.toMatch(/let\s+lastPhase\b/);
  });

  test('generates fresh guidance inside the loop after physics simulation', () => {
    expect(SCRIPT).toMatch(/type\s+GuidanceAction\s*=/);
    expect(SCRIPT).toMatch(/function\s+createGuidance\(/);

    const loopIndex = SCRIPT.indexOf('for (let iter = 0; iter < maxIter; iter++)');
    expect(loopIndex).toBeGreaterThan(-1);

    const loopBody = SCRIPT.slice(loopIndex);
    const physicsIndex = loopBody.indexOf('simulatePhysicsStep');
    const guidanceIndex = loopBody.indexOf('createGuidance');
    const operationIndex = loopBody.indexOf('executeGuidance');

    expect(physicsIndex).toBeGreaterThan(-1);
    expect(guidanceIndex).toBeGreaterThan(physicsIndex);
    expect(operationIndex).toBeGreaterThan(guidanceIndex);
  });

  test('writes detailed per-loop flight parameter log entries', () => {
    expect(SCRIPT).toContain('[STATE]');
    expect(SCRIPT).toContain('[BODIES]');
    expect(SCRIPT).toContain('[GUIDANCE]');
    expect(SCRIPT).toContain('[ACTION]');
  });

  test('requires a bound Mars orbit before declaring arrival', () => {
    expect(SCRIPT).toMatch(/marsRelativeEnergy/);
    expect(SCRIPT).toMatch(/isStableMarsOrbit\(/);

    const arrivalIndex = SCRIPT.indexOf("action: 'arrived'");
    expect(arrivalIndex).toBeGreaterThan(-1);

    const beforeArrival = SCRIPT.slice(Math.max(0, arrivalIndex - 500), arrivalIndex);
    expect(beforeArrival).toContain('isStableMarsOrbit(current)');
    expect(beforeArrival).not.toContain('current.distMars <= marsApproachAU && closeToMarsOrbit');
  });

  test('uses current-state far Mars approach modes instead of a single flipping speed threshold', () => {
    expect(SCRIPT).toMatch(/type\s+FarMarsApproachMode\s*=/);
    expect(SCRIPT).toMatch(/function\s+chooseFarMarsApproachMode\(/);
    expect(SCRIPT).toMatch(/marsClosingSpeedKmps/);
    expect(SCRIPT).toMatch(/远距离接近速度已受控/);

    expect(SCRIPT).not.toContain('farApproachBrake = farMarsApproach && current.marsRelativeSpeed * AU_TO_KM > 1.2');
  });

  test('chooses Mars approach coast time scale from estimated time to Hill boundary', () => {
    expect(SCRIPT).toMatch(/function\s+secondsToMarsHillBoundary\(/);
    expect(SCRIPT).toMatch(/secondsToHillBoundary/);
    expect(SCRIPT).toMatch(/30\s*\*\s*86400/);
    expect(SCRIPT).toMatch(/marsHillRadius\s*\*\s*1\.2/);
  });

  test('repairs bound Mars orbit by waiting for the correct apsis before circularization burns', () => {
    expect(SCRIPT).toMatch(/function\s+isNearMarsPeriapsis\(/);
    expect(SCRIPT).toMatch(/function\s+isNearMarsApoapsis\(/);
    expect(SCRIPT).toMatch(/function\s+createBoundMarsOrbitGuidance\(/);
    expect(SCRIPT).toContain('滑行到近火点');
    expect(SCRIPT).toContain('滑行到远火点');
  });
});

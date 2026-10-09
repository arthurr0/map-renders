import { Spherical, Vector3 } from 'three';
import type { CameraState } from '../../core/types';

export function interpolateCamera(a: CameraState, b: CameraState, t: number): CameraState {
  const ta = new Vector3(...a.target);
  const tb = new Vector3(...b.target);
  const sa = new Spherical().setFromVector3(new Vector3(...a.position).sub(ta));
  const sb = new Spherical().setFromVector3(new Vector3(...b.position).sub(tb));
  let dTheta = sb.theta - sa.theta;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;
  const radius = Math.exp(
    Math.log(Math.max(1e-4, sa.radius)) * (1 - t) + Math.log(Math.max(1e-4, sb.radius)) * t,
  );
  const s = new Spherical(radius, sa.phi + (sb.phi - sa.phi) * t, sa.theta + dTheta * t);
  const target = ta.clone().lerp(tb, t);
  const pos = new Vector3().setFromSpherical(s).add(target);
  const zoom = Math.exp(Math.log(a.zoom) * (1 - t) + Math.log(b.zoom) * t);
  return {
    projection: b.projection,
    position: [pos.x, pos.y, pos.z],
    target: [target.x, target.y, target.z],
    fov: a.fov + (b.fov - a.fov) * t,
    zoom,
  };
}

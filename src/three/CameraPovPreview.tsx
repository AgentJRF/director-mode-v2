import * as THREE from 'three';
import { EffectComposer, DepthOfField } from '@react-three/postprocessing';
import { StudioCanvas, LiveCameraRig } from './previewScene';
import { useStore, PIVOT, S } from '../store';
import { clamp, evalChannel } from '../lib/eval';

// Same aperture-driven DoF as the full "Camera" view, so the split POV shows matching bokeh.
function PovDoF() {
  useStore(s => s.rev);
  const cam = S().renderCamera(); // match DoF/bokeh to the on-air camera (multi-camera cuts)
  const ap = evalChannel(cam, 'aperture', S().project.timeline.playhead) as number;
  const fp = cam.optics.focusPoint;
  const bokeh = clamp((1 / ap) * 10, 1, 8);
  const range = clamp(ap * 0.4, 0.5, 8);
  const target = fp ? new THREE.Vector3(fp[0], fp[1], fp[2]) : new THREE.Vector3(PIVOT.x, PIVOT.y, PIVOT.z);
  return (
    <EffectComposer>
      <DepthOfField target={target} worldFocusRange={range} bokehScale={bokeh} height={720} />
    </EffectComposer>
  );
}

// Live camera POV for the split view (right pane): renders the studio scene from the active camera's
// current pose/focal, tracking gizmo edits and playback, WITH the same DoF/bokeh as the Camera view.
export default function CameraPovPreview() {
  return <StudioCanvas><LiveCameraRig /><PovDoF /></StudioCanvas>;
}

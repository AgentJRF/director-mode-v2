import { useStore, S } from '../store';
import { selectLight } from '../lib/lights';
import { evalLight } from '../lib/lightEval';
import { lightHideKey } from '../lib/lightRig';

// Clickable markers for every positional light that isn't the selected one (that one shows the gizmo).
// Ambient/hemisphere have no position, so they're skipped. Click selects → LightInspector + gizmo.
export default function LightMarkers() {
  useStore(s => s.rev);
  const st = S(); const t = st.project.timeline.playhead;
  const activeId = st.ui.inspect === 'light' ? st.project.activeLightId : '';
  return (
    <>
      {st.project.lights.map(l => {
        if (l.kind === 'ambient' || l.kind === 'hemisphere' || l.kind === 'env') return null;
        if (l.id === activeId) return null;
        if (st.ui.hidden[lightHideKey(l.id)]) return null;
        const p = evalLight(l, t).position;
        return (
          <mesh key={l.id} position={p} userData={{ gizmo: { kind: 'light-marker', id: l.id } }}
            onPointerDown={e => { e.stopPropagation(); selectLight(l.id); }}>
            <sphereGeometry args={[0.085, 16, 16]} />
            <meshBasicMaterial color={l.color} />
          </mesh>
        );
      })}
    </>
  );
}
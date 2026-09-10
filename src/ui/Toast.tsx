import { useProgress } from '@react-three/drei';
import { S } from '../store';
import { useRev } from './bits';

export function Toast() {
  useRev();
  const msg = S().ui.toast;
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

export function Loading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div id="loading"><div className="ld-inner"><div className="ld-spin" /><div>Loading asset… {Math.round(progress)}%</div></div></div>
  );
}

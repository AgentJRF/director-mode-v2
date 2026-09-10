import { useThree } from '@react-three/fiber';
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';
import { S, upsertKeyOn } from '../../store';
import { keysOf, handleOffset, evaluate, poiPoint, round } from '../../lib/eval';
import type { Vec3 } from '../../types';
import { quadrantFor, subRectFor, ndcInSub, orthoCams, orthoState, planeAndAxesFor, type ViewId, type OrthoId, type SubRect } from './views';
import { layoutGizmosForView } from './gizmoLayout';
import { R3, viewMarquee } from '../shared';

type Kind = 'key' | 'in' | 'out' | 'camera' | 'camera-axis' | 'camera-plane' | 'camera-rot' | 'poi' | 'poi-axis' | 'poi-plane';
type GizmoTag = { id?: string; kind: Kind; axis?: number };
type DragState = { id?: string; kind: Kind; axis?: number; viewId: ViewId; startAngle?: number; startQuat?: THREE.Quaternion; axisDir?: THREE.Vector3; u?: THREE.Vector3; v?: THREE.Vector3; group?: { id: string; orig: Vec3 }[]; anchor?: Vec3 };

const d2r = THREE.MathUtils.degToRad, r2d = THREE.MathUtils.radToDeg;
const unitVec = (a: number) => new THREE.Vector3(a === 0 ? 1 : 0, a === 1 ? 1 : 0, a === 2 ? 1 : 0);

// The three gizmo axis directions, honoring the object/world switch (world = axes; local = the
// camera's own axes) — must match the gizmo's on-screen orientation (baseQuat in SceneGizmos).
function gizmoAxisDirs(): [THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  if (S().ui.gizmoSpace === 'world') return [unitVec(0), unitVec(1), unitVec(2)];
  const p = evaluate(S().active(), S().project.timeline.playhead);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(p.rotation[0]), d2r(p.rotation[1]), d2r(p.rotation[2]), 'YXZ'));
  return [unitVec(0).applyQuaternion(q), unitVec(1).applyQuaternion(q), unitVec(2).applyQuaternion(q)];
}
// two orthonormal vectors spanning the plane perpendicular to `n`
function perpBasis(n: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(ref, n).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  return [u, v];
}

// Single input owner for quad multiview: resolves the quadrant + its camera for every pointer
// event, picks gizmo handles in screen space, and drags them on the correct per-view plane.
// Replaces SceneGizmos' single-view drag while multiview is active.
export default function useMultiviewInput(sceneCamRef: RefObject<THREE.PerspectiveCamera | null>) {
  const { gl, scene } = useThree();

  useEffect(() => {
    const dom = gl.domElement;
    const rc = new THREE.Raycaster();
    let drag: DragState | null = null;
    let pan: { id: OrthoId; lastX: number; lastY: number } | null = null;
    let marq: { sx: number; sy: number; viewId: ViewId } | null = null; // wrap-relative marquee start
    const wrapOrigin = () => { const w = (R3.wrap ?? dom).getBoundingClientRect(); return { left: w.left, top: w.top }; };

    const active = () => S().ui.viewMode === 'scene' && S().ui.multiview;
    const camFor = (v: ViewId): THREE.Camera | null => (v === 'persp' ? sceneCamRef.current : orthoCams[v as OrthoId]);
    // scalar offset along world axis `ax` (through `ref`) of the point closest to the current ray
    // scalar offset along unit direction `U` (through `ref`) of the point on that line closest to the ray
    const axisScalarDir = (ref: Vec3, U: THREE.Vector3): number => {
      const w0 = new THREE.Vector3(...ref).sub(rc.ray.origin);
      const bb = U.dot(rc.ray.direction), cc2 = rc.ray.direction.dot(rc.ray.direction);
      const denom = cc2 - bb * bb;
      return Math.abs(denom) < 1e-6 ? 0 : (bb * rc.ray.direction.dot(w0) - cc2 * U.dot(w0)) / denom;
    };
    const gizmos = (): THREE.Object3D[] => { const o: THREE.Object3D[] = []; scene.traverse(n => { if ((n.userData as { gizmo?: GizmoTag }).gizmo) o.push(n); }); return o; };

    // screen-space pick: nearest tagged gizmo within a px threshold, projected with the view camera
    const pick = (cam: THREE.Camera, sub: SubRect, cx: number, cy: number): GizmoTag | null => {
      let best: GizmoTag | null = null, bestD = 15;
      const wp = new THREE.Vector3();
      for (const m of gizmos()) {
        m.getWorldPosition(wp); const n = wp.clone().project(cam);
        if (n.z > 1) continue;
        const sx = sub.left + (n.x * 0.5 + 0.5) * sub.w, sy = sub.top + (-n.y * 0.5 + 0.5) * sub.h;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bestD) { bestD = d; best = (m.userData as { gizmo: GizmoTag }).gizmo; }
      }
      return best;
    };

    const down = (e: PointerEvent) => {
      if (!active()) return;
      const rect = dom.getBoundingClientRect();
      const { viewId, sub } = quadrantFor(e.clientX, e.clientY, rect);
      const cam = camFor(viewId); if (!cam) return;
      // Target tool: click an object in this quadrant to aim the camera at it (object target).
      if (S().ui.tool === 'target') {
        rc.setFromCamera(ndcInSub(e.clientX, e.clientY, sub), cam);
        for (const h of rc.intersectObjects(scene.children, true)) {
          let o: THREE.Object3D | null = h.object;
          while (o) { const oid = (o.userData as { objectId?: string }).objectId; if (oid) { S().setTarget({ type: 'object', objectId: oid }); S().setTool('camera'); return; } o = o.parent; }
        }
        return; // clicked empty in target mode → no-op
      }
      layoutGizmosForView(cam, sub.h); // match the on-screen (screen-fixed) gizmo size before hit-testing
      const hit = pick(cam, sub, e.clientX, e.clientY);
      if (hit) {
        if (hit.kind === 'key' && e.shiftKey && hit.id) { S().toggleSelectKey(hit.id); return; } // Shift+click: add/remove
        drag = { ...hit, viewId };
        // rotation ring: fix the grabbed axis (object/world) + capture start angle and orientation
        if (hit.kind === 'camera-rot' && !S().active().target) {
          const c = S().active(); const t = S().project.timeline.playhead; const pz = evaluate(c, t);
          rc.setFromCamera(ndcInSub(e.clientX, e.clientY, sub), cam);
          const axisDir = gizmoAxisDirs()[hit.axis ?? 0]; const [u, v] = perpBasis(axisDir);
          const ref = new THREE.Vector3(...pz.position);
          const pp = new THREE.Vector3(); let startAngle = 0;
          if (rc.ray.intersectPlane(new THREE.Plane(axisDir, -axisDir.dot(ref)), pp)) {
            const rel = pp.sub(ref); startAngle = Math.atan2(rel.dot(v), rel.dot(u));
          }
          drag.axisDir = axisDir; drag.u = u; drag.v = v; drag.startAngle = startAngle;
          drag.startQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(pz.rotation[0]), d2r(pz.rotation[1]), d2r(pz.rotation[2]), 'YXZ'));
        }
        if (hit.kind === 'key' && hit.id) {
          // grabbing an unselected key selects it alone; a selected one keeps the group and drags it together
          if (!S().ui.selectedKeyIds.includes(hit.id)) S().selectKey(hit.id);
          const sel = S().ui.selectedKeyIds; const c0 = S().active();
          drag.group = c0.keyframes.filter(kf => kf.channel === 'position' && sel.includes(kf.id) && Array.isArray(kf.value)).map(kf => ({ id: kf.id, orig: (kf.value as Vec3).slice() as Vec3 }));
          const kk = c0.keyframes.find(kf => kf.id === hit.id); if (kk && Array.isArray(kk.value)) drag.anchor = (kk.value as Vec3).slice() as Vec3;
        } else {
          S().selectKey(hit.id ?? null);
        }
        S().setGizmoDragging(true);
        try { dom.setPointerCapture(e.pointerId); } catch { /* best effort */ }
      } else if (S().ui.tool === 'select') {
        // Select tool: empty drag = marquee (rubber-band position keys in this quadrant)
        const o = wrapOrigin(); marq = { sx: e.clientX - o.left, sy: e.clientY - o.top, viewId };
        viewMarquee.rect = { x: marq.sx, y: marq.sy, w: 0, h: 0 }; S().bump();
        try { dom.setPointerCapture(e.pointerId); } catch { /* best effort */ }
      } else if (viewId !== 'persp') {
        pan = { id: viewId as OrthoId, lastX: e.clientX, lastY: e.clientY };
      }
    };

    const move = (e: PointerEvent) => {
      if (drag) { applyDrag(e); return; }
      if (marq) {
        const o = wrapOrigin(); const px = e.clientX - o.left, py = e.clientY - o.top;
        viewMarquee.rect = { x: Math.min(marq.sx, px), y: Math.min(marq.sy, py), w: Math.abs(px - marq.sx), h: Math.abs(py - marq.sy) };
        S().bump(); return;
      }
      if (pan) {
        const st = orthoState[pan.id]; const cam = orthoCams[pan.id];
        const worldPerPx = (cam.top - cam.bottom) / subRectFor(pan.id, dom.getBoundingClientRect()).h;
        const dx = (e.clientX - pan.lastX) * worldPerPx, dy = (e.clientY - pan.lastY) * worldPerPx;
        pan.lastX = e.clientX; pan.lastY = e.clientY;
        // pan opposite to cursor, in the view's in-plane axes
        if (pan.id === 'top') { st.center.x -= dx; st.center.z -= dy; }
        else if (pan.id === 'front') { st.center.x -= dx; st.center.y += dy; }
        else { st.center.z += dx; st.center.y += dy; }
        S().bump();
      }
    };

    const applyDrag = (e: PointerEvent) => {
      const c = S().active();
      const d = drag!; const rect = dom.getBoundingClientRect();
      const sub = subRectFor(d.viewId, rect); const cam = camFor(d.viewId); if (!cam) return;
      rc.setFromCamera(ndcInSub(e.clientX, e.clientY, sub), cam);
      const p = new THREE.Vector3();

      // camera body: translate the camera pose at the playhead (upsert a key if animated)
      if (d.kind === 'camera') {
        const t = S().project.timeline.playhead;
        const ref = evaluate(c, t).position;
        const np = [...ref] as Vec3;
        if (d.viewId === 'persp') {
          if (e.shiftKey) {
            const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
            if (!rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, new THREE.Vector3(...ref)), p)) return;
            np[1] = round(p.y, 3);
          } else {
            if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ref[1]), p)) return;
            np[0] = round(p.x, 3); np[2] = round(p.z, 3);
          }
        } else {
          const { plane, axes } = planeAndAxesFor(d.viewId as OrthoId, ref);
          if (!rc.ray.intersectPlane(plane, p)) return;
          const world = [p.x, p.y, p.z]; axes.forEach(a => { np[a] = round(world[a], 3); });
        }
        if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', np, t, 'manual'); else c.transform.position = np;
        S().bump();
        return;
      }

      // camera axis arrow: translate the camera along one gizmo axis (world or the camera's local axis)
      if (d.kind === 'camera-axis') {
        const t = S().project.timeline.playhead;
        const ref = evaluate(c, t).position; const dir = gizmoAxisDirs()[d.axis ?? 0];
        const s = axisScalarDir(ref, dir);
        const np: Vec3 = [round(ref[0] + dir.x * s, 3), round(ref[1] + dir.y * s, 3), round(ref[2] + dir.z * s, 3)];
        if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', np, t, 'manual'); else c.transform.position = np;
        S().bump();
        return;
      }

      // point of interest: move the look-at point at the playhead
      if (d.kind === 'poi') {
        const t = S().project.timeline.playhead;
        if (c.target?.type === 'object') return; // aim locked by an object target
        if (!c.target || c.target.type !== 'point') S().setTarget({ type: 'point', point: [...poiPoint(c, t)] as Vec3 });
        const cc = S().active(); const ref = poiPoint(cc, t); const np = [...ref] as Vec3;
        if (d.viewId === 'persp') {
          if (e.shiftKey) {
            const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
            if (!rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, new THREE.Vector3(...ref)), p)) return;
            np[1] = round(p.y, 3);
          } else {
            if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ref[1]), p)) return;
            np[0] = round(p.x, 3); np[2] = round(p.z, 3);
          }
        } else {
          const { plane, axes } = planeAndAxesFor(d.viewId as OrthoId, ref);
          if (!rc.ray.intersectPlane(plane, p)) return;
          const world = [p.x, p.y, p.z]; axes.forEach(a => { np[a] = round(world[a], 3); });
        }
        if (keysOf(cc, 'poi').length) upsertKeyOn(cc, 'poi', np, t, 'manual'); else if (cc.target?.type === 'point') cc.target.point = np;
        S().bump();
        return;
      }

      // camera plane slider: drag within the plane whose normal is gizmo axis `d.axis` (world or local)
      if (d.kind === 'camera-plane') {
        const t = S().project.timeline.playhead;
        const ref = evaluate(c, t).position; const dirs = gizmoAxisDirs(); const N = d.axis ?? 0;
        const nrm = dirs[N], u = dirs[(N + 1) % 3], vv = dirs[(N + 2) % 3];
        const refV = new THREE.Vector3(...ref);
        if (!rc.ray.intersectPlane(new THREE.Plane(nrm, -nrm.dot(refV)), p)) return;
        const rel = p.clone().sub(refV); const du = rel.dot(u), dv = rel.dot(vv);
        const np: Vec3 = [
          round(ref[0] + u.x * du + vv.x * dv, 3),
          round(ref[1] + u.y * du + vv.y * dv, 3),
          round(ref[2] + u.z * du + vv.z * dv, 3),
        ];
        if (keysOf(c, 'position').length) upsertKeyOn(c, 'position', np, t, 'manual'); else c.transform.position = np;
        S().bump(); return;
      }

      // rotation ring: rotate the (free) camera around the grabbed gizmo axis by the drag-angle delta
      if (d.kind === 'camera-rot') {
        if (c.target || !d.axisDir) return; // rotation owned by the target, or missing start data
        const t = S().project.timeline.playhead; const ref = new THREE.Vector3(...evaluate(c, t).position);
        if (!rc.ray.intersectPlane(new THREE.Plane(d.axisDir, -d.axisDir.dot(ref)), p)) return;
        const rel = p.clone().sub(ref);
        const delta = Math.atan2(rel.dot(d.v!), rel.dot(d.u!)) - (d.startAngle ?? 0);
        const q = new THREE.Quaternion().setFromAxisAngle(d.axisDir, delta).multiply(d.startQuat ?? new THREE.Quaternion());
        const eu = new THREE.Euler().setFromQuaternion(q, 'YXZ');
        const rot: Vec3 = [r2d(eu.x), r2d(eu.y), r2d(eu.z)];
        if (keysOf(c, 'rotation').length) upsertKeyOn(c, 'rotation', rot, t, 'manual'); else c.transform.rotation = rot;
        S().bump(); return;
      }

      const k = c.keyframes.find(x => x.id === d.id); if (!k || !Array.isArray(k.value)) return;
      const kv = k.value as Vec3;
      const pk = keysOf(c, 'position'); const idx = pk.findIndex(x => x.id === k.id);
      const curOff = d.kind === 'key' ? ([0, 0, 0] as Vec3) : handleOffset(pk, idx, d.kind as 'in' | 'out');

      const which = d.kind as 'in' | 'out';
      const group = d.group ?? [{ id: k.id, orig: kv }]; const anchor = d.anchor ?? kv; // group drag moves all selected keys
      if (d.viewId === 'persp') {
        if (e.shiftKey) {
          const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); fwd.normalize();
          const a0 = d.kind === 'key' ? new THREE.Vector3(...kv) : new THREE.Vector3(kv[0] + curOff[0], kv[1] + curOff[1], kv[2] + curOff[2]);
          if (!rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, a0), p)) return;
          if (d.kind === 'key') { const dy = round(p.y, 3) - anchor[1]; for (const it of group) S().setKeyValueComp(it.id, 1, round(it.orig[1] + dy, 3)); }
          else S().setKeyTangent(k.id, which, [curOff[0], round(p.y - kv[1], 3), curOff[2]]);
        } else {
          if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -kv[1]), p)) return;
          if (d.kind === 'key') { const dx = round(p.x, 3) - anchor[0], dz = round(p.z, 3) - anchor[2]; for (const it of group) { S().setKeyValueComp(it.id, 0, round(it.orig[0] + dx, 3)); S().setKeyValueComp(it.id, 2, round(it.orig[2] + dz, 3)); } }
          else S().setKeyTangent(k.id, which, [round(p.x - kv[0], 3), curOff[1], round(p.z - kv[2], 3)]);
        }
        return;
      }
      // orthographic view: plane + the two in-plane axes it edits
      const { plane, axes } = planeAndAxesFor(d.viewId as OrthoId, kv);
      if (!rc.ray.intersectPlane(plane, p)) return;
      const world = [p.x, p.y, p.z];
      if (d.kind === 'key') { const dd = axes.map(a => round(world[a], 3) - anchor[a]); for (const it of group) axes.forEach((a, ai) => S().setKeyValueComp(it.id, a, round(it.orig[a] + dd[ai], 3))); }
      else { const off = curOff.slice() as Vec3; axes.forEach(a => { off[a] = round(world[a] - kv[a], 3); }); S().setKeyTangent(k.id, which, off); }
    };

    const up = () => {
      if (marq) {
        const rect = viewMarquee.rect; const viewId = marq.viewId; marq = null; viewMarquee.rect = null;
        if (rect && (rect.w > 3 || rect.h > 3)) {
          const cam = camFor(viewId); const o = wrapOrigin(); const sub = subRectFor(viewId, dom.getBoundingClientRect());
          const sl = sub.left - o.left, stp = sub.top - o.top; // sub-rect in wrap-relative px
          const c = S().active(); const ids: string[] = []; const v = new THREE.Vector3();
          if (cam) for (const k of c.keyframes) {
            if (k.channel !== 'position' || !Array.isArray(k.value)) continue;
            v.set(...(k.value as Vec3)).project(cam); if (v.z > 1) continue;
            const sx = sl + (v.x * 0.5 + 0.5) * sub.w, sy = stp + (-v.y * 0.5 + 0.5) * sub.h;
            if (sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h) ids.push(k.id);
          }
          S().setSelectedKeys(ids);
        }
        S().bump();
      }
      if (drag) { drag = null; S().setGizmoDragging(false); } pan = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!active()) return;
      const rect = dom.getBoundingClientRect();
      const { viewId } = quadrantFor(e.clientX, e.clientY, rect);
      if (viewId === 'persp') return; // perspective zoom handled elsewhere
      e.preventDefault();
      const st = orthoState[viewId as OrthoId];
      st.halfHeight = Math.min(60, Math.max(0.4, st.halfHeight * (1 + e.deltaY * 0.0012)));
      S().bump();
    };

    dom.addEventListener('pointerdown', down); dom.addEventListener('pointermove', move);
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', wheel, { passive: false });
    return () => {
      dom.removeEventListener('pointerdown', down); dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerup', up); dom.removeEventListener('pointercancel', up);
      dom.removeEventListener('wheel', wheel);
    };
  }, [gl, scene, sceneCamRef]);
}

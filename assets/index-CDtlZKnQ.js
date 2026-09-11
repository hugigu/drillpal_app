(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const CORE_VERSION = "0.1.0";
const FIBA$1 = {
  WIDTH: 15,
  HALF_LENGTH: 14,
  FULL_LENGTH: 28,
  LANE_W: 4.9,
  LANE_L: 5.8,
  FT_CIRCLE_R: 1.8,
  THREE_PT_R: 6.75,
  THREE_PT_CORNER_DX: 6.6,
  HOOP_DIST: 1.575,
  RIM_R: 0.225,
  BACKBOARD_W: 1.8,
  RESTRICTED_AREA_R: 1.25,
  CENTER_CIRCLE_R: 1.8
};
const COURT_PAD = 28;
const courtLengthM = (mode) => mode === "full" ? FIBA$1.FULL_LENGTH : FIBA$1.HALF_LENGTH;
function courtLayout(canvasW, canvasH, mode) {
  const availW = canvasW - COURT_PAD * 2;
  const availH = canvasH - COURT_PAD * 2;
  const horizontal = mode === "full" ? availW >= availH : false;
  const lengthM = courtLengthM(mode);
  const aspect = horizontal ? lengthM / FIBA$1.WIDTH : FIBA$1.WIDTH / lengthM;
  let w = availW, h = w / aspect;
  if (h > availH) {
    h = availH;
    w = h * aspect;
  }
  const box = { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
  const scale = horizontal ? w / lengthM : w / FIBA$1.WIDTH;
  return { mode, horizontal, box, scale, canvasW, canvasH };
}
function toScreen(l, p) {
  return l.horizontal ? { x: l.box.x + p.v * l.scale, y: l.box.y + p.u * l.scale } : { x: l.box.x + p.u * l.scale, y: l.box.y + p.v * l.scale };
}
function fromScreen(l, p) {
  return l.horizontal ? { u: (p.y - l.box.y) / l.scale, v: (p.x - l.box.x) / l.scale } : { u: (p.x - l.box.x) / l.scale, v: (p.y - l.box.y) / l.scale };
}
function solveLegacyBox(tokens) {
  const axis = (fk, hk) => {
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const a = tokens[i], b = tokens[j];
        if (typeof a?.[hk] !== "number" || typeof b?.[hk] !== "number") continue;
        const df = a[fk] - b[fk];
        if (Math.abs(df) < 1e-9) continue;
        const size = (a[hk] - b[hk]) / df;
        if (!Number.isFinite(size) || size <= 0) continue;
        return { size, origin: a[hk] - a[fk] * size };
      }
    }
    return null;
  };
  const X = axis("fx", "homeX"), Y = axis("fy", "homeY");
  if (!X || !Y) return null;
  return { x: X.origin, y: Y.origin, w: X.size, h: Y.size };
}
function solveFromOneToken(t, aspect, ink) {
  const out = [];
  if (typeof t?.homeX !== "number" || typeof t?.homeY !== "number") return out;
  if (Math.abs(t.fy) > 1e-9) {
    const h = (t.homeY - COURT_PAD) / t.fy, w = h * aspect;
    out.push({ x: t.homeX - t.fx * w, y: COURT_PAD, w, h });
  }
  if (Math.abs(t.fx) > 1e-9) {
    const w = (t.homeX - COURT_PAD) / t.fx, h = w / aspect;
    out.push({ x: COURT_PAD, y: t.homeY - t.fy * h, w, h });
  }
  const EPS = 0.5;
  return out.filter(
    (b) => b.w > 0 && b.h > 0 && b.x >= COURT_PAD - EPS && b.y >= COURT_PAD - EPS && ink.every((p) => p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2)
  );
}
function recoverLegacyBox(tokens, mode, ink = []) {
  const exact = solveLegacyBox(tokens);
  if (exact) return { box: exact, method: "two-token" };
  if (tokens.length === 0) return null;
  const aspects = mode === "full" ? [FIBA$1.FULL_LENGTH / FIBA$1.WIDTH, FIBA$1.WIDTH / FIBA$1.FULL_LENGTH] : [FIBA$1.WIDTH / FIBA$1.HALF_LENGTH];
  const found = [];
  for (const t of tokens) {
    for (const aspect of aspects) found.push(...solveFromOneToken(t, aspect, ink));
    if (found.length) break;
  }
  const unique = found.filter((b, i) => found.findIndex((o) => Math.abs(o.x - b.x) < 0.5 && Math.abs(o.y - b.y) < 0.5 && Math.abs(o.w - b.w) < 0.5 && Math.abs(o.h - b.h) < 0.5) === i);
  return unique.length === 1 ? { box: unique[0], method: "one-token" } : null;
}
function legacyBoxToLayout(box, mode, horizontalOverride) {
  const horizontal = mode === "full" && (horizontalOverride ?? box.w > box.h);
  const lengthM = courtLengthM(mode);
  const scale = horizontal ? box.w / lengthM : box.w / FIBA$1.WIDTH;
  return {
    mode,
    horizontal,
    box,
    scale,
    canvasW: box.x * 2 + box.w,
    canvasH: box.y * 2 + box.h
  };
}
function fractionToCourt(fx, fy, mode, horizontal) {
  const lengthM = courtLengthM(mode);
  return horizontal ? { u: fy * FIBA$1.WIDTH, v: fx * lengthM } : { u: fx * FIBA$1.WIDTH, v: fy * lengthM };
}
const clamp$5 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function dist(a, b) {
  return Math.hypot(a.u - b.u, a.v - b.v);
}
function pathLength(points2) {
  let d = 0;
  for (let i = 1; i < points2.length; i++) d += dist(points2[i - 1], points2[i]);
  return d;
}
function splitPointsAtFraction(points2, frac) {
  if (points2.length === 1 || frac <= 0) return { before: [points2[0]], after: points2.slice() };
  const total = pathLength(points2);
  if (frac >= 1 || total === 0) return { before: points2.slice(), after: [points2[points2.length - 1]] };
  const target = frac * total;
  let acc = 0;
  const before = [points2[0]];
  for (let i = 1; i < points2.length; i++) {
    const segLen = dist(points2[i - 1], points2[i]);
    if (acc + segLen >= target) {
      const t = segLen === 0 ? 0 : (target - acc) / segLen;
      const splitPt = {
        u: points2[i - 1].u + (points2[i].u - points2[i - 1].u) * t,
        v: points2[i - 1].v + (points2[i].v - points2[i - 1].v) * t
      };
      before.push(splitPt);
      return { before, after: [splitPt, ...points2.slice(i)] };
    }
    before.push(points2[i]);
    acc += segLen;
  }
  return { before: points2.slice(), after: [points2[points2.length - 1]] };
}
function chaikinSmooth(points2, iterations) {
  if (points2.length < 3) return points2.slice();
  let pts = points2.slice();
  for (let iter = 0; iter < iterations; iter++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      out.push({ u: p0.u * 0.75 + p1.u * 0.25, v: p0.v * 0.75 + p1.v * 0.25 });
      out.push({ u: p0.u * 0.25 + p1.u * 0.75, v: p0.v * 0.25 + p1.v * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}
function maxDeviationFromStraight(points2) {
  const a = points2[0], b = points2[points2.length - 1];
  const abu = b.u - a.u, abv = b.v - a.v, abLenSq = abu * abu + abv * abv || 1;
  let max = 0;
  for (const p of points2) {
    const t = ((p.u - a.u) * abu + (p.v - a.v) * abv) / abLenSq;
    max = Math.max(max, dist(p, { u: a.u + abu * t, v: a.v + abv * t }));
  }
  return max;
}
function peakDeviationPoint(points2) {
  const a = points2[0], b = points2[points2.length - 1];
  const abu = b.u - a.u, abv = b.v - a.v, abLenSq = abu * abu + abv * abv || 1;
  let best = a, bestDist = -1, bestT = 0.5;
  for (const p of points2) {
    const t = ((p.u - a.u) * abu + (p.v - a.v) * abv) / abLenSq;
    const d = dist(p, { u: a.u + abu * t, v: a.v + abv * t });
    if (d > bestDist) {
      bestDist = d;
      best = p;
      bestT = t;
    }
  }
  return { point: best, t: clamp$5(bestT, 0.12, 0.88) };
}
function fitSoftArc(points2, samples = 32) {
  const p0 = points2[0], p2 = points2[points2.length - 1];
  const { point: peak, t } = peakDeviationPoint(points2);
  const denom = 2 * t * (1 - t) || 1e-6;
  const cu = (peak.u - (1 - t) * (1 - t) * p0.u - t * t * p2.u) / denom;
  const cv = (peak.v - (1 - t) * (1 - t) * p0.v - t * t * p2.v) / denom;
  const out = [];
  for (let i = 0; i <= samples; i++) {
    const s = i / samples, mt = 1 - s;
    out.push({
      u: mt * mt * p0.u + 2 * s * mt * cu + s * s * p2.u,
      v: mt * mt * p0.v + 2 * s * mt * cv + s * s * p2.v
    });
  }
  return out;
}
function pointAtFraction(points2, frac) {
  if (points2.length === 1) return points2[0];
  const total = pathLength(points2);
  if (total === 0) return points2[0];
  const target = frac * total;
  let acc = 0;
  for (let i = 1; i < points2.length; i++) {
    const seg = dist(points2[i - 1], points2[i]);
    if (acc + seg >= target) {
      const t = seg === 0 ? 0 : (target - acc) / seg;
      return {
        u: points2[i - 1].u + (points2[i].u - points2[i - 1].u) * t,
        v: points2[i - 1].v + (points2[i].v - points2[i - 1].v) * t
      };
    }
    acc += seg;
  }
  return points2[points2.length - 1];
}
function distToSeg(p, a, b) {
  const l2 = dist(a, b) ** 2;
  if (l2 === 0) return dist(p, a);
  let t = ((p.u - a.u) * (b.u - a.u) + (p.v - a.v) * (b.v - a.v)) / l2;
  t = clamp$5(t, 0, 1);
  return dist(p, { u: a.u + t * (b.u - a.u), v: a.v + t * (b.v - a.v) });
}
function closeToPolyline(pt, points2, radius) {
  for (let i = 1; i < points2.length; i++) {
    if (distToSeg(pt, points2[i - 1], points2[i]) < radius) return true;
  }
  return false;
}
function remapPoint(pt, origA, origB, newA, newB) {
  const ov = { u: origB.u - origA.u, v: origB.v - origA.v };
  const nv = { u: newB.u - newA.u, v: newB.v - newA.v };
  const oLen = Math.hypot(ov.u, ov.v) || 1;
  const nLen = Math.hypot(nv.u, nv.v) || 1;
  const rot = Math.atan2(nv.v, nv.u) - Math.atan2(ov.v, ov.u);
  const scale = nLen / oLen;
  const rel = { u: pt.u - origA.u, v: pt.v - origA.v };
  const rotated = {
    u: rel.u * Math.cos(rot) - rel.v * Math.sin(rot),
    v: rel.u * Math.sin(rot) + rel.v * Math.cos(rot)
  };
  return { u: newA.u + rotated.u * scale, v: newA.v + rotated.v * scale };
}
function hoopPoints(mode) {
  if (mode === "full") {
    return [
      { u: FIBA$1.WIDTH / 2, v: FIBA$1.HOOP_DIST },
      { u: FIBA$1.WIDTH / 2, v: FIBA$1.FULL_LENGTH - FIBA$1.HOOP_DIST }
    ];
  }
  return [{ u: FIBA$1.WIDTH / 2, v: FIBA$1.HALF_LENGTH - FIBA$1.HOOP_DIST }];
}
function nearestHoop(mode, pt) {
  const hs = hoopPoints(mode);
  let best = hs[0], bestD = Infinity;
  for (const h of hs) {
    const d = dist(h, pt);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}
function nearHoop(mode, pt, radiusM2 = 1.5) {
  return hoopPoints(mode).some((h) => dist(pt, h) < radiusM2);
}
const VERSION = 1;
const num = (v, fallback = 0) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
const point = (p, l) => l ? fromScreen(l, { x: num(p?.x), y: num(p?.y) }) : { u: num(p?.u), v: num(p?.v) };
const points = (arr, l) => Array.isArray(arr) ? arr.map((p) => point(p, l)) : [];
const segment = (s, l) => ({
  id: num(s.id),
  startT: num(s.startT),
  endT: num(s.endT),
  points: points(s.points, l)
});
const transfer = (t, l) => ({
  id: num(t.id),
  startT: num(t.startT),
  endT: num(t.endT),
  fromId: num(t.fromId),
  toId: t.toId == null ? null : num(t.toId),
  points: points(t.points, l)
});
const annotation = (a, l) => ({
  id: num(a.id),
  t: num(a.t),
  points: points(a.points, l),
  life: num(a.life, 1400)
});
const roleChange = (r) => ({
  t: num(r.t),
  kind: r.kind === "defense" ? "defense" : "offense"
});
const token = (t, l) => ({
  id: num(t.id),
  kind: t.kind === "defense" ? "defense" : "offense",
  label: String(t.label ?? ""),
  // Legacy home is a FRACTION of the court box, so it converts without needing
  // the solved box at all — only pixel stroke data does.
  home: l ? fractionToCourt(num(t.fx), num(t.fy), l.mode, l.horizontal) : { u: num(t.home?.u), v: num(t.home?.v) },
  segments: (Array.isArray(t.segments) ? t.segments : []).map((x) => segment(x, l)),
  roleChanges: (Array.isArray(t.roleChanges) ? t.roleChanges : []).map(roleChange)
});
const ball = (b, l) => ({
  id: num(b.id),
  initialHolderId: num(b.initialHolderId),
  transfers: (Array.isArray(b.transfers) ? b.transfers : []).map((x) => transfer(x, l))
});
const cone = (c, l) => ({
  id: num(c.id),
  at: l ? fractionToCourt(num(c.fx), num(c.fy), l.mode, l.horizontal) : { u: num(c.at?.u), v: num(c.at?.v) }
});
const segMap = (raw, l) => {
  const out = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    out[Number(k)] = (Array.isArray(v) ? v : []).map((x) => segment(x, l));
  }
  return out;
};
const trMap = (raw, l) => {
  const out = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    out[Number(k)] = (Array.isArray(v) ? v : []).map((x) => transfer(x, l));
  }
  return out;
};
function maxId(tokens, balls, cones, notes, fork) {
  let m = 0;
  const bump = (n) => {
    if (n > m) m = n;
  };
  for (const t of tokens) {
    bump(t.id);
    for (const s of t.segments) bump(s.id);
  }
  for (const b of balls) {
    bump(b.id);
    for (const tr of b.transfers) bump(tr.id);
  }
  for (const c of cones) bump(c.id);
  for (const a of notes) bump(a.id);
  for (const br of fork?.branches ?? []) {
    bump(br.id);
    for (const segs of Object.values(br.tokens)) for (const s of segs) bump(s.id);
    for (const trs of Object.values(br.balls)) for (const tr of trs) bump(tr.id);
    for (const a of br.notes) bump(a.id);
  }
  return m;
}
function normalizeFork(raw, tokens, balls, liveNotes, l) {
  const at = raw.forkAt;
  if (at == null || !Array.isArray(raw.branches) || raw.branches.length === 0) {
    return { fork: null, tokens, balls, annotations: liveNotes };
  }
  const activeBranchId = num(raw.activeBranchId);
  const prefixTokens = [];
  const activeTokenTails = {};
  for (const t of tokens) {
    prefixTokens.push({ ...t, segments: t.segments.filter((s) => s.startT < at) });
    activeTokenTails[t.id] = t.segments.filter((s) => s.startT >= at);
  }
  const prefixBalls = [];
  const activeBallTails = {};
  for (const b of balls) {
    prefixBalls.push({ ...b, transfers: b.transfers.filter((tr) => tr.startT < at) });
    activeBallTails[b.id] = b.transfers.filter((tr) => tr.startT >= at);
  }
  const branches = raw.branches.map((b) => {
    const id = num(b.id);
    const isActive = id === activeBranchId;
    return {
      id,
      name: String(b.name ?? ""),
      // The active branch's stored entry is stale by construction; its real
      // content is the tail we just peeled off the live arrays.
      tokens: isActive ? activeTokenTails : segMap(b.tokens, l),
      balls: isActive ? activeBallTails : trMap(b.balls, l),
      // Notes are a full-timeline layer per branch, never split at the fork.
      notes: isActive ? liveNotes : (Array.isArray(b.notes) ? b.notes : []).map((x) => annotation(x, l))
    };
  });
  return {
    fork: { at: num(at), activeBranchId, branches },
    tokens: prefixTokens,
    balls: prefixBalls,
    // While forked, the document's own note track is the pre-fork snapshot.
    annotations: (Array.isArray(raw.preforkNotes) ? raw.preforkNotes : []).map((x) => annotation(x, l))
  };
}
function collectPixelPoints(r) {
  const out = [];
  const take = (a) => {
    if (Array.isArray(a)) out.push(...a);
  };
  for (const t of r.tokens ?? []) for (const s of t.segments ?? []) take(s.points);
  for (const b of r.balls ?? []) for (const tr of b.transfers ?? []) take(tr.points);
  take(r.annotations ? r.annotations.flatMap((a) => a.points ?? []) : []);
  take(r.preforkNotes ? r.preforkNotes.flatMap((a) => a.points ?? []) : []);
  for (const br of r.branches ?? []) {
    for (const segs of Object.values(br.tokens ?? {})) for (const s of segs) take(s.points);
    for (const trs of Object.values(br.balls ?? {})) for (const tr of trs) take(tr.points);
    take(br.notes ? br.notes.flatMap((a) => a.points ?? []) : []);
  }
  return out;
}
function deserialize(raw, opts) {
  return deserializeWithReport(raw, opts).doc;
}
function deserializeWithReport(raw, opts) {
  const r = raw ?? {};
  const isV1 = r.version === VERSION;
  const mode = r.courtMode === "full" ? "full" : "half";
  const warnings = [];
  let layout = null;
  let layoutRecovered = true;
  let recoveryMethod = null;
  if (!isV1) {
    const stamped = r.layout;
    const isStamped = !!stamped && typeof stamped.w === "number" && stamped.w > 0 && typeof stamped.h === "number" && stamped.h > 0;
    const ink = isStamped ? [] : collectPixelPoints(r);
    const rec = isStamped ? null : recoverLegacyBox(Array.isArray(r.tokens) ? r.tokens : [], mode, ink);
    if (isStamped) {
      layout = legacyBoxToLayout(
        { x: num(stamped.x), y: num(stamped.y), w: num(stamped.w), h: num(stamped.h) },
        mode,
        typeof stamped.horizontal === "boolean" ? stamped.horizontal : void 0
      );
      recoveryMethod = "stamped";
    } else if (rec) {
      layout = legacyBoxToLayout(rec.box, mode);
      recoveryMethod = rec.method;
    } else {
      layoutRecovered = false;
      layout = opts?.fallbackLayout ?? courtLayout(1024, 768, mode);
      if (ink.length > 0) {
        warnings.push(
          "Could not recover the capture-time court box: this play has no token to anchor pixel coordinates to. Ink was converted against " + (opts?.fallbackLayout ? "the supplied fallback layout" : "a default 1024x768 layout") + " and may be misplaced."
        );
      }
    }
  }
  const tokens = (Array.isArray(r.tokens) ? r.tokens : []).map((x) => token(x, layout));
  const balls = (Array.isArray(r.balls) ? r.balls : []).map((x) => ball(x, layout));
  const cones = (Array.isArray(r.cones) ? r.cones : []).map((x) => cone(x, layout));
  const liveNotes = (Array.isArray(r.annotations) ? r.annotations : []).map((x) => annotation(x, layout));
  const normalized = isV1 ? {
    fork: r.fork == null ? null : {
      at: num(r.fork.at),
      activeBranchId: num(r.fork.activeBranchId),
      branches: (Array.isArray(r.fork.branches) ? r.fork.branches : []).map((b) => ({
        id: num(b.id),
        name: String(b.name ?? ""),
        tokens: segMap(b.tokens, null),
        balls: trMap(b.balls, null),
        notes: (Array.isArray(b.notes) ? b.notes : []).map((x) => annotation(x, null))
      }))
    },
    tokens,
    balls,
    annotations: liveNotes
  } : normalizeFork(r, tokens, balls, liveNotes, layout);
  const explicitNext = isV1 ? num(r.nextId, 0) : 0;
  const derivedNext = maxId(normalized.tokens, normalized.balls, cones, normalized.annotations, normalized.fork) + 1;
  return {
    doc: {
      version: VERSION,
      // Plays saved before full-court existed have no courtMode.
      courtMode: mode,
      tokens: normalized.tokens,
      balls: normalized.balls,
      cones,
      annotations: normalized.annotations,
      fork: normalized.fork,
      nextId: Math.max(explicitNext, derivedNext)
    },
    report: { from: isV1 ? "v1" : "legacy", layoutRecovered, recoveryMethod, warnings }
  };
}
function serialize(doc) {
  return JSON.parse(JSON.stringify(doc));
}
function blankPlay(courtMode = "half") {
  return {
    version: VERSION,
    courtMode,
    tokens: [],
    balls: [],
    cones: [],
    annotations: [],
    fork: null,
    nextId: 1
  };
}
function resolveBranch(doc, branchId) {
  const { fork } = doc;
  if (!fork) {
    return { tokens: doc.tokens, balls: doc.balls, cones: doc.cones, annotations: doc.annotations };
  }
  const id = branchId ?? fork.activeBranchId;
  const branch = fork.branches.find((b) => b.id === id);
  if (!branch) {
    return { tokens: doc.tokens, balls: doc.balls, cones: doc.cones, annotations: doc.annotations };
  }
  const byStart = (a, b) => a.startT - b.startT;
  return {
    tokens: doc.tokens.map((t) => ({
      ...t,
      segments: [...t.segments, ...branch.tokens[t.id] ?? []].sort(byStart)
    })),
    balls: doc.balls.map((b) => ({
      ...b,
      transfers: [...b.transfers, ...branch.balls[b.id] ?? []].sort(byStart)
    })),
    cones: doc.cones,
    annotations: branch.notes
  };
}
const REFERENCE_PX_PER_M = 768.21 / 15;
const PHYSICAL = {
  /** Player marker radii. A 0.29m radius reads as a ~0.6m disc, about right for a player's footprint. */
  OFFENSE_R_M: 15 / REFERENCE_PX_PER_M,
  DEFENSE_R_M: 13 / REFERENCE_PX_PER_M,
  BALL_R_M: 8 / REFERENCE_PX_PER_M,
  CONE_R_M: 10 / REFERENCE_PX_PER_M,
  /** Dribble squiggle. Amplitude and wavelength are distances along the floor. */
  WAVIFY_AMPLITUDE_M: 6 / REFERENCE_PX_PER_M,
  WAVIFY_WAVELENGTH_M: 26 / REFERENCE_PX_PER_M,
  /** Arc-length between wave samples. Physical so a stroke's wave count is scale-invariant. */
  WAVIFY_STEP_M: 4 / REFERENCE_PX_PER_M
};
const CHROME = {
  STROKE_W_PX: 3,
  STROKE_ACTIVE_W_PX: 4.5,
  /** The dashed ring drawn around a token while arranging. Interface chrome —
   *  a selection indicator, not part of the play — so it stays px like the
   *  hit radii below. Added in slice 3 by the same rule that added
   *  PASS_STRAIGHT_THRESHOLD_PX in slice 2. */
  ARRANGE_RING_R_PX: 21,
  HIT_TOKEN_PX: 24,
  HIT_TOKEN_REPEAT_PX: 44,
  HIT_BALL_PX: 16,
  HIT_CONE_PX: 20,
  HIT_STROKE_PX: 16,
  /**
   * Drawn-deviation, in px, above which a pass keeps its arc instead of
   * flattening to straight (prototype's PASS_STRAIGHT_THRESHOLD). Same judgment
   * call as TAP_MAX_PATH_PX: it measures how much the hand wandered while
   * drawing, which is a property of the hand, not the court — so it stays px and
   * renderPointsForTransfer divides it by the layout scale to compare.
   */
  PASS_STRAIGHT_THRESHOLD_PX: 18
};
const MOVE_SMOOTH_ITERATIONS = 3;
const TIMING = {
  /** How long a note stays on the timeline before it has fully faded. */
  NOTE_LIFE_MS: 1400
};
const px = (meters, scale) => meters * scale;
const clamp$4 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function tokenById$1(resolved, id) {
  return resolved.tokens.find((t) => t.id === id);
}
function tokenPosAt(token2, t) {
  let pos = { u: token2.home.u, v: token2.home.v };
  for (const seg of token2.segments) {
    if (t < seg.startT) break;
    if (t >= seg.endT) {
      pos = seg.points[seg.points.length - 1] ?? pos;
      continue;
    }
    const frac = (t - seg.startT) / (seg.endT - seg.startT);
    pos = pointAtFraction(seg.points, frac);
  }
  return pos;
}
function holderTravelDir(token2, t) {
  const eps = 30;
  const p0 = tokenPosAt(token2, t);
  const pf = tokenPosAt(token2, t + eps);
  let du = pf.u - p0.u, dv = pf.v - p0.v;
  if (du === 0 && dv === 0) {
    let last = null;
    for (const seg of token2.segments) if (seg.endT <= t) last = seg;
    if (last) {
      const pts = last.points, end = pts[pts.length - 1];
      if (end) {
        for (let i = pts.length - 2; i >= 0; i--) {
          const pi = pts[i];
          if (pi.u !== end.u || pi.v !== end.v) {
            du = end.u - pi.u;
            dv = end.v - pi.v;
            break;
          }
        }
      }
    }
  }
  return du || dv ? { u: du, v: dv } : null;
}
function kindAt(token2, t) {
  let kind = token2.kind;
  for (const rc of token2.roleChanges) {
    if (t < rc.t) break;
    kind = rc.kind;
  }
  return kind;
}
function holderAt(ball2, t) {
  for (const tr of ball2.transfers) {
    if (t >= tr.startT && t < tr.endT) return null;
  }
  let holder = ball2.initialHolderId;
  for (const tr of ball2.transfers) {
    if (t >= tr.endT) holder = tr.toId;
    else break;
  }
  return holder;
}
function ballsHeldBy(balls, tokenId, t, exclude) {
  let n = 0;
  for (const b of balls) {
    if (b !== exclude && holderAt(b, t) === tokenId) n++;
  }
  return n;
}
function transferRenderPoints(tr, resolved) {
  if (tr.toId == null) return tr.points;
  const fromTok = tokenById$1(resolved, tr.fromId);
  const toTok = tokenById$1(resolved, tr.toId);
  if (!fromTok || !toTok) return tr.points;
  const from = tokenPosAt(fromTok, tr.startT);
  const to = tokenPosAt(toTok, tr.endT);
  const p0 = tr.points[0], p1 = tr.points[tr.points.length - 1];
  return tr.points.map((pt) => remapPoint(pt, p0, p1, from, to));
}
function renderPointsForTransfer(tr, resolved, scale) {
  const points2 = transferRenderPoints(tr, resolved);
  if (tr.toId == null) return [points2[0], points2[points2.length - 1]];
  const keepArc = maxDeviationFromStraight(tr.points) >= CHROME.PASS_STRAIGHT_THRESHOLD_PX / scale;
  return keepArc ? fitSoftArc(points2) : [points2[0], points2[points2.length - 1]];
}
function ballPosAt(resolved, courtMode, scale, ball2, t, angleOffset = 0) {
  for (const tr of ball2.transfers) {
    if (t >= tr.startT && t < tr.endT) {
      const frac = (t - tr.startT) / (tr.endT - tr.startT);
      const pos = pointAtFraction(renderPointsForTransfer(tr, resolved, scale), frac);
      return { pos, holderId: null, inFlight: true };
    }
  }
  const holderId = holderAt(ball2, t);
  if (holderId == null) {
    const last = ball2.transfers[ball2.transfers.length - 1];
    const restPt = last ? last.points[last.points.length - 1] : { u: FIBA$1.WIDTH / 2, v: courtLengthM(courtMode) / 2 };
    return { pos: restPt, holderId: null, inFlight: false };
  }
  const holder = tokenById$1(resolved, holderId);
  if (!holder) {
    return { pos: { u: FIBA$1.WIDTH / 2, v: courtLengthM(courtMode) / 2 }, holderId, inFlight: false };
  }
  const hp = tokenPosAt(holder, t);
  const dir = holderTravelDir(holder, t);
  let du, dv;
  if (dir) {
    du = dir.u;
    dv = dir.v;
  } else {
    const hoop = nearestHoop(courtMode, hp);
    du = hoop.u - hp.u;
    dv = hoop.v - hp.v;
  }
  if (angleOffset) {
    const c = Math.cos(angleOffset), s = Math.sin(angleOffset);
    const ndu = du * c - dv * s, ndv = du * s + dv * c;
    du = ndu;
    dv = ndv;
  }
  const dlen = Math.hypot(du, dv) || 1;
  const tokenR = kindAt(holder, t) === "offense" ? PHYSICAL.OFFENSE_R_M : PHYSICAL.DEFENSE_R_M;
  const off = tokenR + PHYSICAL.BALL_R_M - PHYSICAL.BALL_R_M * 2 / 3;
  return {
    pos: { u: hp.u + du / dlen * off, v: hp.v + dv / dlen * off },
    holderId,
    inFlight: false
  };
}
function possessionSignature(balls) {
  let s = "";
  for (const b of balls) {
    s += b.id + ":" + b.initialHolderId + "|";
    for (const tr of b.transfers) s += tr.startT + "," + tr.endT + "," + tr.fromId + "," + tr.toId + ";";
    s += "/";
  }
  return s;
}
function computeHolderRuns(token2, seg, balls) {
  const pts = seg.points;
  const n = pts.length;
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  const total = cum[n - 1] ?? 0;
  const span = seg.endT - seg.startT;
  const timeAt = (i) => {
    if (i === 0) return seg.startT;
    const frac = total === 0 ? 1 : cum[i] / total;
    return seg.startT + frac * span;
  };
  const runs = [];
  let current = {
    dribbling: ballsHeldBy(balls, token2.id, seg.startT) > 0,
    points: [pts[0]],
    startTime: seg.startT,
    endTime: seg.endT,
    distStart: 0
  };
  for (let i = 1; i < n; i++) {
    const dribbling = ballsHeldBy(balls, token2.id, timeAt(i)) > 0;
    current.points.push(pts[i]);
    if (dribbling !== current.dribbling) {
      current.endTime = timeAt(i);
      runs.push(current);
      current = { dribbling, points: [pts[i]], startTime: timeAt(i), endTime: seg.endT, distStart: cum[i] };
    }
  }
  current.endTime = seg.endT;
  runs.push(current);
  return runs;
}
function computeWavify(points2, amplitude = PHYSICAL.WAVIFY_AMPLITUDE_M, wavelength = PHYSICAL.WAVIFY_WAVELENGTH_M, distanceOffset = 0, step = PHYSICAL.WAVIFY_STEP_M, reflected = false) {
  const n = points2.length;
  if (n < 2) return points2.slice();
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(points2[i - 1], points2[i]);
  const total = cum[n - 1];
  if (total < step) return points2.slice();
  const posAt = (target, cur) => {
    const tt = target < 0 ? 0 : target > total ? total : target;
    while (cur.i < n - 1 && cum[cur.i] < tt) cur.i++;
    const a = points2[cur.i - 1], b = points2[cur.i];
    const segLen = cum[cur.i] - cum[cur.i - 1];
    const f = segLen === 0 ? 0 : (tt - cum[cur.i - 1]) / segLen;
    return { u: a.u + (b.u - a.u) * f, v: a.v + (b.v - a.v) * f };
  };
  const half = Math.min(wavelength / 2, total / 2);
  const cCur = { i: 1 }, backCur = { i: 1 }, fwdCur = { i: 1 };
  const out = [];
  const twoPiOverWl = Math.PI * 2 / wavelength;
  const hand = reflected ? -1 : 1;
  for (let d = 0; d <= total + 1e-6; d += step) {
    const dd = d > total ? total : d;
    const c = posAt(dd, cCur);
    const back = posAt(dd - half, backCur), fwd = posAt(dd + half, fwdCur);
    const tu = fwd.u - back.u, tv = fwd.v - back.v;
    const tl = Math.hypot(tu, tv) || 1;
    const nu = hand * -tv / tl, nv = hand * tu / tl;
    const s = Math.sin((distanceOffset + dd) * twoPiOverWl) * amplitude;
    out.push({ u: c.u + nu * s, v: c.v + nv * s });
    if (dd === total) break;
  }
  return out;
}
const STROKE_FADE_MS = 2200;
const STROKE_FADE_FLOOR = 0.18;
const DECLUTTER_FADE_MS = 900;
const DECLUTTER_FUTURE_HORIZON_MS = 1500;
function fadeAlpha(strokeT, currentTime, declutter) {
  const age = currentTime - strokeT;
  if (age <= 0) return 1;
  if (declutter) return clamp$4(1 - age / DECLUTTER_FADE_MS, 0, 1);
  const f = clamp$4(age / STROKE_FADE_MS, 0, 1);
  return 1 - f * (1 - STROKE_FADE_FLOOR);
}
function beyondFutureHorizon(startT, currentTime, declutter) {
  return declutter && startT - currentTime > DECLUTTER_FUTURE_HORIZON_MS;
}
function futureStrokeAlpha(startT, currentTime, declutter) {
  if (!declutter) return 0.45;
  const f = clamp$4((startT - currentTime) / DECLUTTER_FUTURE_HORIZON_MS, 0, 1);
  return 0.42 - f * (0.42 - 0.14);
}
function strokePhase(startT, endT, currentTime) {
  if (currentTime < startT) return "future";
  if (currentTime > endT) return "past";
  return "active";
}
function durationFor(resolved) {
  let maxT = 0;
  for (const tk of resolved.tokens) for (const s of tk.segments) maxT = Math.max(maxT, s.endT);
  for (const b of resolved.balls) for (const tr of b.transfers) maxT = Math.max(maxT, tr.endT);
  for (const a of resolved.annotations) maxT = Math.max(maxT, a.t + a.life);
  return Math.max(8e3, Math.ceil((maxT + 1500) / 1e3) * 1e3);
}
const radiusM = (radiusPx, layout) => radiusPx / layout.scale;
function hitToken$1(resolved, layout, t, pt, radiusPx = CHROME.HIT_TOKEN_PX) {
  const tap = fromScreen(layout, pt);
  const r = radiusM(radiusPx, layout);
  let best = null, bestD = Infinity;
  for (const tk of resolved.tokens) {
    const d = dist(tap, tokenPosAt(tk, t));
    if (d < r && d < bestD) {
      best = tk;
      bestD = d;
    }
  }
  return best;
}
function hitTokenForRepeatTap$1(resolved, layout, t, pt, recentTapTokenId, radiusPx = CHROME.HIT_TOKEN_PX, repeatRadiusPx = CHROME.HIT_TOKEN_REPEAT_PX) {
  if (recentTapTokenId != null) {
    const recent = tokenById$1(resolved, recentTapTokenId);
    if (recent) {
      const tap = fromScreen(layout, pt);
      if (dist(tap, tokenPosAt(recent, t)) < radiusM(repeatRadiusPx, layout)) return recent;
    }
  }
  return hitToken$1(resolved, layout, t, pt, radiusPx);
}
function hitBall$1(resolved, layout, courtMode, t, pt, radiusPx = CHROME.HIT_BALL_PX) {
  const tap = fromScreen(layout, pt);
  const r = radiusM(radiusPx, layout);
  let best = null, bestD = Infinity;
  for (const ball2 of resolved.balls) {
    const d = dist(tap, ballPosAt(resolved, courtMode, layout.scale, ball2, t).pos);
    if (d < r && d < bestD) {
      best = ball2;
      bestD = d;
    }
  }
  return best;
}
function hitCone$1(resolved, layout, pt, radiusPx = CHROME.HIT_CONE_PX) {
  const tap = fromScreen(layout, pt);
  const r = radiusM(radiusPx, layout);
  let best = null, bestD = Infinity;
  for (const cone2 of resolved.cones) {
    const d = dist(tap, cone2.at);
    if (d < r && d < bestD) {
      best = cone2;
      bestD = d;
    }
  }
  return best;
}
function hitAnyStroke$1(resolved, layout, courtMode, pt, radiusPx = CHROME.HIT_STROKE_PX) {
  const tap = fromScreen(layout, pt);
  const r = radiusM(radiusPx, layout);
  for (const token2 of resolved.tokens) {
    for (const seg of token2.segments) {
      if (closeToPolyline(tap, seg.points, r)) return { type: "move", owner: token2, seg };
    }
  }
  for (const ball2 of resolved.balls) {
    for (const tr of ball2.transfers) {
      if (closeToPolyline(tap, renderPointsForTransfer(tr, resolved, layout.scale), r)) {
        return { type: "transfer", ball: ball2, seg: tr };
      }
    }
  }
  for (const a of resolved.annotations) {
    if (closeToPolyline(tap, a.points, r)) return { type: "note", seg: a };
  }
  return null;
}
const clamp$3 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function takeId(doc) {
  return [doc.nextId, { ...doc, nextId: doc.nextId + 1 }];
}
function clampToDuration(doc, currentTime, branchId) {
  return clamp$3(currentTime, 0, durationFor(resolveBranch(doc, branchId)));
}
function nextPlayerNumber(tokens) {
  let max = 0;
  for (const t of tokens) {
    const n = parseInt(t.label, 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return max + 1;
}
function stampToken$1(doc, args) {
  const [id, doc1] = takeId(doc);
  const token2 = {
    id,
    kind: args.kind,
    label: String(nextPlayerNumber(doc.tokens)),
    home: args.home,
    segments: [],
    roleChanges: []
  };
  return { doc: { ...doc1, tokens: [...doc1.tokens, token2] } };
}
function ballReferencesToken(doc, ball2, tokenId) {
  if (ball2.initialHolderId === tokenId) return true;
  const refs = (trs) => trs.some((tr) => tr.fromId === tokenId || tr.toId === tokenId);
  if (refs(ball2.transfers)) return true;
  for (const br of doc.fork?.branches ?? []) {
    if (refs(br.balls[ball2.id] ?? [])) return true;
  }
  return false;
}
function withoutKeyEverywhere(fork, key, id) {
  if (!fork) return fork;
  return {
    ...fork,
    branches: fork.branches.map((b) => {
      if (!(id in b[key])) return b;
      const map = { ...b[key] };
      delete map[id];
      return { ...b, [key]: map };
    })
  };
}
function removeToken$1(doc, args) {
  const goneBallIds = new Set(
    doc.balls.filter((b) => ballReferencesToken(doc, b, args.tokenId)).map((b) => b.id)
  );
  let fork = withoutKeyEverywhere(doc.fork, "tokens", args.tokenId);
  for (const id of goneBallIds) fork = withoutKeyEverywhere(fork, "balls", id);
  const next = {
    ...doc,
    tokens: doc.tokens.filter((t) => t.id !== args.tokenId),
    balls: doc.balls.filter((b) => !goneBallIds.has(b.id)),
    fork
  };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function removeCone$1(doc, args) {
  return { doc: { ...doc, cones: doc.cones.filter((c) => c.id !== args.coneId) } };
}
function flipRoleAt$1(doc, args) {
  const tokens = doc.tokens.map((tok) => {
    if (tok.id !== args.tokenId) return tok;
    const next = kindAt(tok, args.t) === "offense" ? "defense" : "offense";
    return { ...tok, roleChanges: [...tok.roleChanges.filter((rc) => rc.t < args.t), { t: args.t, kind: next }] };
  });
  return { doc: { ...doc, tokens } };
}
function setTokenKind(doc, args) {
  return {
    doc: {
      ...doc,
      tokens: doc.tokens.map((t) => t.id === args.tokenId ? { ...t, kind: args.kind } : t)
    }
  };
}
function moveTokenHome(doc, args) {
  return {
    doc: {
      ...doc,
      tokens: doc.tokens.map((t) => t.id === args.tokenId ? { ...t, home: args.home } : t)
    }
  };
}
function addBall(doc, args) {
  const [id, doc1] = takeId(doc);
  return { doc: { ...doc1, balls: [...doc1.balls, { id, initialHolderId: args.holderId, transfers: [] }] } };
}
function setBallHolder(doc, args) {
  return {
    doc: {
      ...doc,
      balls: doc.balls.map((b) => b.id === args.ballId ? { ...b, initialHolderId: args.holderId } : b)
    }
  };
}
function removeBall(doc, args) {
  const next = {
    ...doc,
    balls: doc.balls.filter((b) => b.id !== args.ballId),
    fork: withoutKeyEverywhere(doc.fork, "balls", args.ballId)
  };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function addCone(doc, args) {
  const [id, doc1] = takeId(doc);
  return { doc: { ...doc1, cones: [...doc1.cones, { id, at: args.at }] } };
}
function moveCone(doc, args) {
  return {
    doc: {
      ...doc,
      cones: doc.cones.map((c) => c.id === args.coneId ? { ...c, at: args.at } : c)
    }
  };
}
function clearStrokes(doc, args) {
  const next = {
    ...doc,
    tokens: doc.tokens.map((t) => t.segments.length ? { ...t, segments: [] } : t),
    balls: doc.balls.map((b) => b.transfers.length ? { ...b, transfers: [] } : b),
    fork: null
  };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function clearNotes(doc, args) {
  let next;
  if (doc.fork) {
    next = {
      ...doc,
      fork: {
        ...doc.fork,
        branches: doc.fork.branches.map((b) => b.id === doc.fork.activeBranchId ? { ...b, notes: [] } : b)
      }
    };
  } else {
    next = { ...doc, annotations: [] };
  }
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function clearAll(doc, args) {
  const next = clearNotes(clearStrokes(doc, args).doc, args).doc;
  return { doc: { ...next, annotations: [] }, time: clampToDuration(next, args.currentTime) };
}
function setCourtMode$1(doc, args) {
  if (doc.courtMode === args.mode) return { doc };
  return { doc: { ...blankPlay(args.mode), nextId: doc.nextId }, time: 0 };
}
function createFork$1(doc, args) {
  if (doc.fork) return { doc };
  const at = args.t;
  const [idA, doc1] = takeId(doc);
  const [idB, doc2] = takeId(doc1);
  const branchA = {
    id: idA,
    name: "A",
    tokens: Object.fromEntries(doc2.tokens.map((t) => [t.id, t.segments.filter((s) => s.startT >= at)])),
    balls: Object.fromEntries(doc2.balls.map((b) => [b.id, b.transfers.filter((tr) => tr.startT >= at)])),
    notes: doc2.annotations
  };
  const branchB = {
    id: idB,
    name: "B",
    tokens: Object.fromEntries(doc2.tokens.map((t) => [t.id, []])),
    balls: Object.fromEntries(doc2.balls.map((b) => [b.id, []])),
    notes: []
  };
  const next = {
    ...doc2,
    tokens: doc2.tokens.map((t) => ({ ...t, segments: t.segments.filter((s) => s.startT < at) })),
    balls: doc2.balls.map((b) => ({ ...b, transfers: b.transfers.filter((tr) => tr.startT < at) })),
    fork: { at, activeBranchId: idA, branches: [branchA, branchB] }
  };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function switchBranch$1(doc, args) {
  if (!doc.fork || args.branchId === doc.fork.activeBranchId) return { doc };
  if (!doc.fork.branches.some((b) => b.id === args.branchId)) return { doc };
  const next = { ...doc, fork: { ...doc.fork, activeBranchId: args.branchId } };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function nextBranchName(branches) {
  const used = new Set(branches.map((b) => b.name));
  let code = "A".charCodeAt(0);
  while (used.has(String.fromCharCode(code))) code++;
  return String.fromCharCode(code);
}
function addBranch$1(doc, args) {
  if (!doc.fork) return { doc };
  const [id, doc1] = takeId(doc);
  const fork = doc1.fork;
  const branch = {
    id,
    name: nextBranchName(fork.branches),
    tokens: Object.fromEntries(doc1.tokens.map((t) => [t.id, []])),
    balls: Object.fromEntries(doc1.balls.map((b) => [b.id, []])),
    notes: []
  };
  const next = { ...doc1, fork: { ...fork, activeBranchId: branch.id, branches: [...fork.branches, branch] } };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function removeFork$1(doc, args) {
  if (!doc.fork) return { doc };
  const next = { ...doc, fork: null };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function collapseForkKeeping(doc, args) {
  if (!doc.fork) return { doc };
  const branch = doc.fork.branches.find((b) => b.id === args.branchId);
  if (!branch) return { doc };
  const byStart = (a, b) => a.startT - b.startT;
  const next = {
    ...doc,
    tokens: doc.tokens.map((t) => ({ ...t, segments: [...t.segments, ...branch.tokens[t.id] ?? []].sort(byStart) })),
    balls: doc.balls.map((b) => ({ ...b, transfers: [...b.transfers, ...branch.balls[b.id] ?? []].sort(byStart) })),
    annotations: branch.notes,
    fork: null
  };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function deleteBranch$1(doc, args) {
  if (!doc.fork) return { doc };
  const fork = doc.fork;
  if (!fork.branches.some((b) => b.id === args.branchId)) return { doc };
  if (fork.branches.length <= 2) {
    const survivor = fork.branches.find((b) => b.id !== args.branchId);
    return collapseForkKeeping(doc, { branchId: survivor.id, currentTime: args.currentTime });
  }
  const branches = fork.branches.filter((b) => b.id !== args.branchId);
  const activeBranchId = args.branchId === fork.activeBranchId ? branches[0].id : fork.activeBranchId;
  const next = { ...doc, fork: { ...fork, branches, activeBranchId } };
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function activeBranch(doc) {
  if (!doc.fork) return null;
  return doc.fork.branches.find((b) => b.id === doc.fork.activeBranchId) ?? null;
}
function withBranch(doc, branchId, update) {
  if (!doc.fork) return doc;
  return {
    ...doc,
    fork: { ...doc.fork, branches: doc.fork.branches.map((b) => b.id === branchId ? update(b) : b) }
  };
}
const byStartT = (a, b) => a.startT - b.startT;
function truncateFuture(segments, startT) {
  return segments.flatMap((ex) => {
    if (ex.endT <= startT) return [ex];
    if (ex.startT >= startT) return [];
    const frac = (startT - ex.startT) / (ex.endT - ex.startT);
    const { before } = splitPointsAtFraction(ex.points, frac);
    return [{ ...ex, endT: startT, points: before }];
  });
}
function commitStroke(doc, outcome, args) {
  const branch = activeBranch(doc);
  let next;
  switch (outcome.kind) {
    case "none":
    case "armRoleFlip":
    case "rejected":
      return { doc };
    case "flipRole":
      return flipRoleAt$1(doc, { tokenId: outcome.tokenId, t: outcome.t });
    case "deleteStroke":
      next = removeHitStroke(doc, outcome.hit);
      break;
    case "move": {
      const [id, doc1] = takeId(doc);
      const seg = { id, startT: outcome.startT, endT: outcome.endT, points: outcome.points };
      next = {
        ...doc1,
        tokens: doc1.tokens.map((t) => t.id === outcome.tokenId ? { ...t, segments: truncateFuture(t.segments, outcome.startT) } : t)
      };
      if (branch) {
        next = withBranch(next, branch.id, (b) => ({
          ...b,
          tokens: {
            ...b.tokens,
            [outcome.tokenId]: [...truncateFuture(b.tokens[outcome.tokenId] ?? [], outcome.startT), seg].sort(byStartT)
          }
        }));
      } else {
        next = {
          ...next,
          tokens: next.tokens.map((t) => t.id === outcome.tokenId ? { ...t, segments: [...t.segments, seg].sort(byStartT) } : t)
        };
      }
      break;
    }
    case "transfer": {
      const [id, doc1] = takeId(doc);
      const tr = {
        id,
        startT: outcome.startT,
        endT: outcome.endT,
        fromId: outcome.fromId,
        toId: outcome.toId,
        points: outcome.points
      };
      const keep = (trs) => trs.filter((ex) => ex.startT < outcome.startT);
      next = {
        ...doc1,
        balls: doc1.balls.map((b) => b.id === outcome.ballId ? { ...b, transfers: keep(b.transfers) } : b)
      };
      if (branch) {
        next = withBranch(next, branch.id, (b) => ({
          ...b,
          balls: { ...b.balls, [outcome.ballId]: [...keep(b.balls[outcome.ballId] ?? []), tr].sort(byStartT) }
        }));
      } else {
        next = {
          ...next,
          balls: next.balls.map((b) => b.id === outcome.ballId ? { ...b, transfers: [...b.transfers, tr].sort(byStartT) } : b)
        };
      }
      break;
    }
    case "note": {
      const [id, doc1] = takeId(doc);
      const note = { id, t: outcome.t, points: outcome.points, life: TIMING.NOTE_LIFE_MS };
      next = branch ? withBranch(doc1, branch.id, (b) => ({ ...b, notes: [...b.notes, note] })) : { ...doc1, annotations: [...doc1.annotations, note] };
      break;
    }
  }
  return { doc: next, time: clampToDuration(next, args.currentTime) };
}
function removeHitStroke(doc, hit) {
  const branch = activeBranch(doc);
  if (hit.type === "move") {
    const segId = hit.seg.id, tokenId = hit.owner.id;
    const next = {
      ...doc,
      tokens: doc.tokens.map((t) => t.id === tokenId ? { ...t, segments: t.segments.filter((s) => s.id !== segId) } : t)
    };
    return branch ? withBranch(next, branch.id, (b) => ({
      ...b,
      tokens: { ...b.tokens, [tokenId]: (b.tokens[tokenId] ?? []).filter((s) => s.id !== segId) }
    })) : next;
  }
  if (hit.type === "transfer") {
    const trId = hit.seg.id, ballId = hit.ball.id;
    const next = {
      ...doc,
      balls: doc.balls.map((b) => b.id === ballId ? { ...b, transfers: b.transfers.filter((tr) => tr.id !== trId) } : b)
    };
    return branch ? withBranch(next, branch.id, (b) => ({
      ...b,
      balls: { ...b.balls, [ballId]: (b.balls[ballId] ?? []).filter((tr) => tr.id !== trId) }
    })) : next;
  }
  const noteId = hit.seg.id;
  return branch ? withBranch(doc, branch.id, (b) => ({ ...b, notes: b.notes.filter((a) => a.id !== noteId) })) : { ...doc, annotations: doc.annotations.filter((a) => a.id !== noteId) };
}
function historyInit(initial) {
  return { items: [initial], index: 0 };
}
function historyPush(h, item) {
  const items = [...h.items.slice(0, h.index + 1), item];
  return { items, index: items.length - 1 };
}
function historyReplace(h, item) {
  const items = h.items.slice(0, h.index);
  items.push(item);
  return { items, index: items.length - 1 };
}
function historyUndo(h) {
  return h.index <= 0 ? h : { ...h, index: h.index - 1 };
}
function historyRedo(h) {
  return h.index >= h.items.length - 1 ? h : { ...h, index: h.index + 1 };
}
function historyCurrent(h) {
  return h.items[h.index];
}
function canUndo(h) {
  return h.index > 0;
}
function canRedo(h) {
  return h.index < h.items.length - 1;
}
function createMemoScope() {
  return {
    smoothCache: /* @__PURE__ */ new WeakMap(),
    wavifyCache: /* @__PURE__ */ new WeakMap(),
    holderRunsCache: /* @__PURE__ */ new WeakMap()
  };
}
const clamp$2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function drawAnnotations(ctx2, layout, palette, resolved, t) {
  for (const a of resolved.annotations) {
    const age = t - a.t;
    if (age < 0 || age > a.life) continue;
    const fadeStart = a.life - 400;
    const alpha = age > fadeStart ? clamp$2(1 - (age - fadeStart) / 400, 0, 1) : 1;
    ctx2.save();
    ctx2.globalAlpha = alpha;
    ctx2.strokeStyle = palette.ink;
    ctx2.lineWidth = 3.2;
    ctx2.lineJoin = "round";
    ctx2.lineCap = "round";
    ctx2.beginPath();
    a.points.forEach((p, i) => {
      const sp = toScreen(layout, p);
      i ? ctx2.lineTo(sp.x, sp.y) : ctx2.moveTo(sp.x, sp.y);
    });
    ctx2.stroke();
    ctx2.restore();
  }
}
function drawCourt(ctx2, layout, palette) {
  const { x, y, w, h } = layout.box;
  const scale = layout.scale;
  const full = layout.mode === "full";
  ctx2.save();
  ctx2.fillStyle = palette.court;
  ctx2.fillRect(x, y, w, h);
  ctx2.strokeStyle = palette.courtLine;
  ctx2.lineWidth = 2;
  ctx2.strokeRect(x, y, w, h);
  if (full) {
    const midX = x + w / 2, midY = y + h / 2;
    ctx2.beginPath();
    ctx2.arc(midX, midY, FIBA$1.CENTER_CIRCLE_R * scale, 0, Math.PI * 2);
    ctx2.stroke();
    ctx2.beginPath();
    if (layout.horizontal) {
      ctx2.moveTo(midX, y);
      ctx2.lineTo(midX, y + h);
    } else {
      ctx2.moveTo(x, midY);
      ctx2.lineTo(x + w, midY);
    }
    ctx2.stroke();
    if (layout.horizontal) {
      ctx2.save();
      ctx2.translate(x, midY);
      ctx2.rotate(Math.PI / 2);
      drawEndMarkings(ctx2, layout);
      ctx2.restore();
      ctx2.save();
      ctx2.translate(x + w, midY);
      ctx2.rotate(-Math.PI / 2);
      drawEndMarkings(ctx2, layout);
      ctx2.restore();
    } else {
      ctx2.save();
      ctx2.translate(midX, y + h);
      drawEndMarkings(ctx2, layout);
      ctx2.restore();
      ctx2.save();
      ctx2.translate(midX, y);
      ctx2.rotate(Math.PI);
      drawEndMarkings(ctx2, layout);
      ctx2.restore();
    }
  } else {
    const cx = x + w / 2;
    ctx2.beginPath();
    ctx2.arc(cx, y, FIBA$1.CENTER_CIRCLE_R * scale, 0, Math.PI);
    ctx2.stroke();
    ctx2.save();
    ctx2.translate(cx, y + h);
    drawEndMarkings(ctx2, layout);
    ctx2.restore();
  }
  ctx2.restore();
}
function drawEndMarkings(ctx2, layout) {
  const scale = layout.scale;
  const hy = -1.575 * scale;
  const laneW = FIBA$1.LANE_W * scale, laneL = FIBA$1.LANE_L * scale;
  ctx2.strokeRect(-laneW / 2, -laneL, laneW, laneL);
  ctx2.beginPath();
  ctx2.arc(0, -laneL, FIBA$1.FT_CIRCLE_R * scale, Math.PI, Math.PI * 2);
  ctx2.stroke();
  ctx2.beginPath();
  ctx2.arc(0, hy, FIBA$1.RESTRICTED_AREA_R * scale, Math.PI, Math.PI * 2);
  ctx2.stroke();
  const bbY = -1.2 * scale;
  const bbHalf = FIBA$1.BACKBOARD_W / 2 * scale;
  ctx2.beginPath();
  ctx2.moveTo(-bbHalf, bbY);
  ctx2.lineTo(bbHalf, bbY);
  ctx2.stroke();
  ctx2.beginPath();
  ctx2.arc(0, hy, FIBA$1.RIM_R * scale, 0, Math.PI * 2);
  ctx2.stroke();
  const cornerDX = FIBA$1.THREE_PT_CORNER_DX * scale;
  const cornerDY = Math.sqrt(FIBA$1.THREE_PT_R ** 2 - FIBA$1.THREE_PT_CORNER_DX ** 2) * scale;
  const angleLeft = Math.atan2(-cornerDY, -cornerDX);
  const angleRight = Math.atan2(-cornerDY, cornerDX);
  ctx2.beginPath();
  ctx2.moveTo(-cornerDX, 0);
  ctx2.lineTo(-cornerDX, hy - cornerDY);
  ctx2.arc(0, hy, FIBA$1.THREE_PT_R * scale, angleLeft, angleRight);
  ctx2.lineTo(cornerDX, 0);
  ctx2.stroke();
}
function drawToken(ctx2, layout, palette, token2, t, view2) {
  const p = tokenPosAt(token2, t);
  const sp = toScreen(layout, p);
  const offense = kindAt(token2, t) === "offense";
  const r = px(offense ? PHYSICAL.OFFENSE_R_M : PHYSICAL.DEFENSE_R_M, layout.scale);
  ctx2.save();
  if (view2.arranging) {
    ctx2.globalAlpha = 0.9;
    ctx2.strokeStyle = palette.accent;
    ctx2.lineWidth = 2;
    ctx2.setLineDash([3, 4]);
    ctx2.beginPath();
    ctx2.arc(sp.x, sp.y, CHROME.ARRANGE_RING_R_PX, 0, Math.PI * 2);
    ctx2.stroke();
    ctx2.setLineDash([]);
  }
  ctx2.fillStyle = offense ? palette.off : palette.def;
  ctx2.beginPath();
  ctx2.arc(sp.x, sp.y, r, 0, Math.PI * 2);
  ctx2.fill();
  if (view2.numbersEnabled) {
    ctx2.fillStyle = "#fff";
    ctx2.font = "700 12px -apple-system, sans-serif";
    ctx2.textAlign = "center";
    ctx2.textBaseline = "middle";
    ctx2.fillText(token2.label, sp.x, sp.y + 1);
  }
  ctx2.restore();
}
function drawBall(ctx2, layout, palette, courtMode, resolved, t) {
  const heldBy = /* @__PURE__ */ new Map();
  for (const ball2 of resolved.balls) {
    const holderId = holderAt(ball2, t);
    if (holderId == null) continue;
    if (!heldBy.has(holderId)) heldBy.set(holderId, []);
    heldBy.get(holderId).push(ball2);
  }
  const r = px(PHYSICAL.BALL_R_M, layout.scale);
  ctx2.save();
  ctx2.fillStyle = palette.ball;
  for (const ball2 of resolved.balls) {
    const holderId = holderAt(ball2, t);
    let angleOffset = 0;
    const siblings = holderId != null ? heldBy.get(holderId) : null;
    if (siblings && siblings.length > 1) {
      angleOffset = (siblings.indexOf(ball2) - (siblings.length - 1) / 2) * 0.6;
    }
    const { pos } = ballPosAt(resolved, courtMode, layout.scale, ball2, t, angleOffset);
    const sp = toScreen(layout, pos);
    ctx2.beginPath();
    ctx2.arc(sp.x, sp.y, r, 0, Math.PI * 2);
    ctx2.fill();
  }
  ctx2.restore();
}
function coneTrianglePath$1(ctx2, x, y, r) {
  ctx2.beginPath();
  ctx2.moveTo(x, y - r);
  ctx2.lineTo(x - r * 0.9, y + r * 0.75);
  ctx2.lineTo(x + r * 0.9, y + r * 0.75);
  ctx2.closePath();
}
function drawCones(ctx2, layout, palette, resolved) {
  const r = px(PHYSICAL.CONE_R_M, layout.scale);
  ctx2.save();
  ctx2.fillStyle = palette.cone;
  for (const cone2 of resolved.cones) {
    const sp = toScreen(layout, cone2.at);
    coneTrianglePath$1(ctx2, sp.x, sp.y, r);
    ctx2.fill();
  }
  ctx2.restore();
}
const clamp$1 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function hexToRgb(hex) {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num2 = parseInt(h, 16);
  return { r: num2 >> 16 & 255, g: num2 >> 8 & 255, b: num2 & 255 };
}
function smoothedMovePoints(memo, points2) {
  const hit = memo.smoothCache.get(points2);
  if (hit && hit.len === points2.length) return hit.out;
  const out = chaikinSmooth(points2, MOVE_SMOOTH_ITERATIONS);
  memo.smoothCache.set(points2, { len: points2.length, out });
  return out;
}
function wavify(memo, points2, amplitude, wavelength, distanceOffset, reflected) {
  const off = Math.round(distanceOffset * 2) / 2;
  const hit = memo.wavifyCache.get(points2);
  if (hit && hit.len === points2.length && hit.amp === amplitude && hit.wl === wavelength && hit.off === off && hit.reflected === reflected) {
    return hit.out;
  }
  const out = computeWavify(points2, amplitude, wavelength, off, PHYSICAL.WAVIFY_STEP_M, reflected);
  memo.wavifyCache.set(points2, { len: points2.length, amp: amplitude, wl: wavelength, off, reflected, out });
  return out;
}
function splitByHolder(memo, token2, seg, balls, possessionSig) {
  const cached = memo.holderRunsCache.get(seg.points);
  if (cached && cached.len === seg.points.length && cached.sig === possessionSig && cached.tokenId === token2.id && cached.startT === seg.startT && cached.endT === seg.endT) {
    return cached.runs;
  }
  const runs = computeHolderRuns(token2, seg, balls);
  memo.holderRunsCache.set(seg.points, {
    len: seg.points.length,
    sig: possessionSig,
    tokenId: token2.id,
    startT: seg.startT,
    endT: seg.endT,
    runs
  });
  return runs;
}
function strokeFadedMoveRun(ctx2, layout, pts, startTime, endTime, currentTime, declutter, colorHex, lineWidth) {
  const n = pts.length;
  if (n < 2) return;
  ctx2.save();
  ctx2.strokeStyle = colorHex;
  ctx2.lineWidth = lineWidth;
  ctx2.lineJoin = "round";
  ctx2.lineCap = "round";
  const span = endTime - startTime;
  if (n === 2 || span <= 0) {
    ctx2.globalAlpha = fadeAlpha(endTime, currentTime, declutter);
    const a = toScreen(layout, pts[0]), b = toScreen(layout, pts[n - 1]);
    ctx2.beginPath();
    ctx2.moveTo(a.x, a.y);
    ctx2.lineTo(b.x, b.y);
    ctx2.stroke();
    ctx2.restore();
    return;
  }
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  const total = cum[n - 1];
  if (total === 0) {
    ctx2.restore();
    return;
  }
  const SLICES = Math.min(14, Math.max(3, Math.round(n / 8)));
  const strokeSub = (arr, sliceIdx2) => {
    if (arr.length < 2) return;
    ctx2.globalAlpha = fadeAlpha(startTime + (sliceIdx2 + 0.5) / SLICES * span, currentTime, declutter);
    ctx2.beginPath();
    const p0 = toScreen(layout, arr[0]);
    ctx2.moveTo(p0.x, p0.y);
    for (let k = 1; k < arr.length; k++) {
      const pk = toScreen(layout, arr[k]);
      ctx2.lineTo(pk.x, pk.y);
    }
    ctx2.stroke();
  };
  let sliceIdx = 0;
  let sub = [pts[0]];
  for (let i = 1; i < n; i++) {
    sub.push(pts[i]);
    while (sliceIdx < SLICES - 1 && cum[i] >= (sliceIdx + 1) / SLICES * total) {
      strokeSub(sub, sliceIdx);
      sub = [pts[i]];
      sliceIdx++;
    }
  }
  strokeSub(sub, sliceIdx);
  ctx2.restore();
}
function fadeGradientStroke(ctx2, layout, points2, startTime, endTime, currentTime, declutter, colorHex) {
  const { r, g, b } = hexToRgb(colorHex);
  const a = toScreen(layout, points2[0]), z = toScreen(layout, points2[points2.length - 1]);
  if (points2.length < 2 || a.x === z.x && a.y === z.y) {
    return `rgba(${r},${g},${b},${fadeAlpha(endTime, currentTime, declutter)})`;
  }
  const grad = ctx2.createLinearGradient(a.x, a.y, z.x, z.y);
  const STOPS = 6;
  for (let i = 0; i <= STOPS; i++) {
    const frac = i / STOPS;
    const t = startTime + frac * (endTime - startTime);
    grad.addColorStop(frac, `rgba(${r},${g},${b},${fadeAlpha(t, currentTime, declutter)})`);
  }
  return grad;
}
function drawFutureStroke(ctx2, layout, palette, points2, alpha) {
  ctx2.save();
  ctx2.globalAlpha = alpha;
  ctx2.strokeStyle = palette.future;
  ctx2.lineWidth = CHROME.STROKE_W_PX;
  ctx2.lineJoin = "round";
  ctx2.lineCap = "round";
  ctx2.beginPath();
  points2.forEach((p, i) => {
    const sp = toScreen(layout, p);
    i ? ctx2.lineTo(sp.x, sp.y) : ctx2.moveTo(sp.x, sp.y);
  });
  ctx2.stroke();
  ctx2.restore();
}
function renderTokenSegRun(ctx2, layout, memo, token2, miniSeg, opts, currentTime, declutter, balls, possessionSig) {
  const lineWidth = opts.lineWidth, color = opts.color, distanceOffset = opts.distanceOffset ?? 0;
  const runs = splitByHolder(memo, token2, miniSeg, balls, possessionSig);
  ctx2.save();
  ctx2.globalAlpha = 1;
  ctx2.lineWidth = lineWidth;
  ctx2.lineJoin = "round";
  ctx2.lineCap = "round";
  for (const run of runs) {
    const pts = run.dribbling ? wavify(
      memo,
      run.points,
      PHYSICAL.WAVIFY_AMPLITUDE_M,
      PHYSICAL.WAVIFY_WAVELENGTH_M,
      distanceOffset + (run.distStart || 0),
      layout.horizontal
    ) : run.points;
    strokeFadedMoveRun(ctx2, layout, pts, run.startTime, run.endTime, currentTime, declutter, color, lineWidth);
  }
  ctx2.restore();
}
function drawTokenPath(ctx2, layout, palette, memo, token2, t, declutter, balls, possessionSig) {
  for (const seg of token2.segments) {
    const color = palette.accent;
    const phase = strokePhase(seg.startT, seg.endT, t);
    const points2 = smoothedMovePoints(memo, seg.points);
    if (phase === "future") {
      if (!beyondFutureHorizon(seg.startT, t, declutter)) {
        drawFutureStroke(ctx2, layout, palette, points2, futureStrokeAlpha(seg.startT, t, declutter));
      }
      continue;
    }
    if (phase === "past") {
      renderTokenSegRun(
        ctx2,
        layout,
        memo,
        token2,
        { startT: seg.startT, endT: seg.endT, points: points2 },
        { lineWidth: CHROME.STROKE_W_PX, color },
        t,
        declutter,
        balls,
        possessionSig
      );
      continue;
    }
    const frac = clamp$1((t - seg.startT) / (seg.endT - seg.startT), 0, 1);
    const { before, after } = splitPointsAtFraction(points2, frac);
    const aheadHasLine = after.length > 1;
    const afterOffset = pathLength(before);
    if (before.length > 1) {
      renderTokenSegRun(
        ctx2,
        layout,
        memo,
        token2,
        { startT: seg.startT, endT: t, points: before },
        { lineWidth: CHROME.STROKE_W_PX, color },
        t,
        declutter,
        balls,
        possessionSig
      );
    }
    if (aheadHasLine) {
      renderTokenSegRun(
        ctx2,
        layout,
        memo,
        token2,
        { startT: t, endT: seg.endT, points: after },
        { lineWidth: CHROME.STROKE_ACTIVE_W_PX, color, distanceOffset: afterOffset },
        t,
        declutter,
        balls,
        possessionSig
      );
    }
  }
}
function drawArrowAtAngle(ctx2, tip, ang, color) {
  const len = 9;
  ctx2.fillStyle = color;
  ctx2.beginPath();
  ctx2.moveTo(tip.x, tip.y);
  ctx2.lineTo(tip.x - len * Math.cos(ang - 0.42), tip.y - len * Math.sin(ang - 0.42));
  ctx2.lineTo(tip.x - len * Math.cos(ang + 0.42), tip.y - len * Math.sin(ang + 0.42));
  ctx2.closePath();
  ctx2.fill();
}
function drawArrow(ctx2, layout, a, b, color) {
  const sa = toScreen(layout, a), sb = toScreen(layout, b);
  drawArrowAtAngle(ctx2, sb, Math.atan2(sb.y - sa.y, sb.x - sa.x), color);
}
function drawShotMark(ctx2, layout, pt, color) {
  const sp = toScreen(layout, pt);
  ctx2.strokeStyle = color;
  ctx2.lineWidth = 2;
  ctx2.beginPath();
  ctx2.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
  ctx2.stroke();
}
function renderTransferRun(ctx2, layout, miniSeg, opts, t, declutter) {
  const pts = miniSeg.points;
  ctx2.save();
  ctx2.globalAlpha = 1;
  ctx2.lineWidth = opts.lineWidth;
  ctx2.lineJoin = "round";
  ctx2.lineCap = "round";
  ctx2.setLineDash([2, 9]);
  ctx2.strokeStyle = fadeGradientStroke(ctx2, layout, pts, miniSeg.startT, miniSeg.endT, t, declutter, opts.color);
  ctx2.beginPath();
  pts.forEach((p, i) => {
    const sp = toScreen(layout, p);
    i ? ctx2.lineTo(sp.x, sp.y) : ctx2.moveTo(sp.x, sp.y);
  });
  ctx2.stroke();
  ctx2.setLineDash([]);
  if (opts.terminal) {
    const a = pts[pts.length - 2] ?? pts[0];
    const b = pts[pts.length - 1];
    ctx2.globalAlpha = fadeAlpha(miniSeg.endT, t, declutter);
    if (opts.isShot) drawShotMark(ctx2, layout, b, opts.color);
    else drawArrow(ctx2, layout, a, b, opts.color);
  }
  ctx2.restore();
}
function drawBallTransfers(ctx2, layout, palette, resolved, t, declutter) {
  for (const ball2 of resolved.balls) {
    for (const tr of ball2.transfers) {
      const isShot = tr.toId == null;
      const color = isShot ? palette.shot : palette.pass;
      const phase = strokePhase(tr.startT, tr.endT, t);
      const points2 = renderPointsForTransfer(tr, resolved, layout.scale);
      if (phase === "future") {
        if (beyondFutureHorizon(tr.startT, t, declutter)) continue;
        ctx2.save();
        ctx2.globalAlpha = futureStrokeAlpha(tr.startT, t, declutter);
        ctx2.strokeStyle = palette.future;
        ctx2.lineWidth = CHROME.STROKE_W_PX;
        ctx2.lineJoin = "round";
        ctx2.lineCap = "round";
        ctx2.setLineDash([2, 9]);
        ctx2.beginPath();
        points2.forEach((p, i) => {
          const sp = toScreen(layout, p);
          i ? ctx2.lineTo(sp.x, sp.y) : ctx2.moveTo(sp.x, sp.y);
        });
        ctx2.stroke();
        ctx2.setLineDash([]);
        ctx2.restore();
        continue;
      }
      if (phase === "past") {
        renderTransferRun(
          ctx2,
          layout,
          { startT: tr.startT, endT: tr.endT, points: points2 },
          { lineWidth: CHROME.STROKE_W_PX, color, terminal: true, isShot },
          t,
          declutter
        );
        continue;
      }
      const frac = clamp$1((t - tr.startT) / (tr.endT - tr.startT), 0, 1);
      const { before, after } = splitPointsAtFraction(points2, frac);
      const aheadHasLine = after.length > 1;
      if (before.length > 1) {
        renderTransferRun(
          ctx2,
          layout,
          { startT: tr.startT, endT: t, points: before },
          { lineWidth: CHROME.STROKE_W_PX, color, terminal: !aheadHasLine, isShot },
          t,
          declutter
        );
      }
      if (aheadHasLine) {
        renderTransferRun(
          ctx2,
          layout,
          { startT: t, endT: tr.endT, points: after },
          { lineWidth: CHROME.STROKE_ACTIVE_W_PX, color, terminal: true, isShot },
          t,
          declutter
        );
      }
    }
  }
}
function renderFrame(ctx2, doc, t, opts) {
  renderScene(ctx2, doc, t, opts);
  renderEntities(ctx2, doc, t, opts);
}
function renderScene(ctx2, doc, t, opts) {
  const { layout, palette, view: view2, memo } = opts;
  const resolved = resolveBranch(doc, view2.branchId ?? void 0);
  const possessionSig = possessionSignature(resolved.balls);
  const declutter = view2.declutterEnabled;
  drawCourt(ctx2, layout, palette);
  drawCones(ctx2, layout, palette, resolved);
  for (const token2 of resolved.tokens) {
    drawTokenPath(ctx2, layout, palette, memo, token2, t, declutter, resolved.balls, possessionSig);
  }
  drawBallTransfers(ctx2, layout, palette, resolved, t, declutter);
  drawAnnotations(ctx2, layout, palette, resolved, t);
}
function renderEntities(ctx2, doc, t, opts) {
  const { layout, palette, view: view2 } = opts;
  const resolved = resolveBranch(doc, view2.branchId ?? void 0);
  for (const token2 of resolved.tokens) drawToken(ctx2, layout, palette, token2, t, view2);
  drawBall(ctx2, layout, palette, doc.courtMode, resolved, t);
}
class Store {
  doc;
  currentTime;
  history;
  lastCoalesce;
  onChange;
  constructor(doc, opts) {
    this.doc = doc;
    this.currentTime = opts?.currentTime ?? 0;
    this.history = historyInit(doc);
    this.onChange = opts?.onChange;
  }
  get canUndo() {
    return canUndo(this.history);
  }
  get canRedo() {
    return canRedo(this.history);
  }
  /**
   * Applies a pure edit op and folds its result in: updates `doc` (and
   * `currentTime`, if the op returned one), pushes a history entry, and fires
   * `onChange`. An op whose precondition failed returns the SAME `doc`
   * reference unchanged (see edit.ts) — that no-op is detected by identity and
   * skips the history push and onChange entirely, matching every prototype
   * call site's existing guard-before-call pattern.
   */
  commit(op, args, opts) {
    const { doc, time } = op(this.doc, args);
    if (doc === this.doc) {
      if (time !== void 0) this.currentTime = time;
      return;
    }
    const coalescing = opts?.coalesce !== void 0 && opts.coalesce === this.lastCoalesce;
    this.lastCoalesce = opts?.coalesce;
    this.doc = doc;
    if (time !== void 0) this.currentTime = time;
    this.history = coalescing ? historyReplace(this.history, doc) : historyPush(this.history, doc);
    this.onChange?.();
  }
  /**
   * Replace the document outright and start history over — loading a saved
   * play, recalling a formation, clearing to a blank court. Deliberately NOT
   * an undoable step: the app has always treated "open a different play" as a
   * new session rather than an edit, and an undo that silently reopened the
   * previous play would be worse than no undo at all.
   */
  reset(doc, opts) {
    this.lastCoalesce = void 0;
    this.doc = doc;
    this.currentTime = opts?.currentTime ?? 0;
    this.history = historyInit(doc);
    this.onChange?.();
  }
  /** Undo/redo restore document content only — the prototype's own
   *  restoreSnapshot never touches currentTime either, so the playhead stays
   *  put across an undo. */
  undo() {
    this.lastCoalesce = void 0;
    if (!canUndo(this.history)) return;
    this.history = historyUndo(this.history);
    this.doc = historyCurrent(this.history);
    this.onChange?.();
  }
  redo() {
    this.lastCoalesce = void 0;
    if (!canRedo(this.history)) return;
    this.history = historyRedo(this.history);
    this.doc = historyCurrent(this.history);
    this.onChange?.();
  }
}
const BUILD = "2026-09-11 18:19Z c3230ee";
const canvas = document.getElementById("court");
const ctx = canvas.getContext("2d");
const BALL_R = 8, CONE_R = 10;
const MAX_BALLS_PER_PLAYER = 2;
let _cssVarCache = /* @__PURE__ */ Object.create(null);
function getCssVar(name) {
  let v = _cssVarCache[name];
  if (v === void 0) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    _cssVarCache[name] = v;
  }
  return v;
}
function refreshPalette() {
  _cssVarCache = /* @__PURE__ */ Object.create(null);
  render();
}
if (window.matchMedia) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSchemeChange = () => refreshPalette();
  if (mq.addEventListener) mq.addEventListener("change", onSchemeChange);
  else if (mq.addListener) mq.addListener(onSchemeChange);
}
const store = new Store(blankPlay(), {
  onChange: () => {
    render();
    updateDataPanel();
    refreshForkUI();
    updateUndoRedoButtons();
  }
});
let _viewDoc = null;
let _viewCache = null;
function view() {
  if (_viewDoc !== store.doc) {
    _viewDoc = store.doc;
    _viewCache = resolveBranch(store.doc);
  }
  return _viewCache;
}
const state = {
  get tokens() {
    return view().tokens;
  },
  get balls() {
    return view().balls;
  },
  get cones() {
    return view().cones;
  },
  get annotations() {
    return view().annotations;
  },
  get courtMode() {
    return store.doc.courtMode;
  },
  get forkAt() {
    return store.doc.fork ? store.doc.fork.at : null;
  },
  get branches() {
    return store.doc.fork ? store.doc.fork.branches : [];
  },
  get activeBranchId() {
    return store.doc.fork ? store.doc.fork.activeBranchId : null;
  },
  // ── session only: never in the document, never in undo history ──
  currentTime: 0,
  playing: false,
  arranging: false,
  ghostsEnabled: true,
  numbersEnabled: false,
  // pure DISPLAY toggle — every token is numbered regardless
  declutterEnabled: false
  // render-only: future lines past a short horizon don't draw, past lines fade fully out
};
function totalDuration() {
  return durationFor(view());
}
let activeStroke = null;
let activeDrag = null;
let activeBallDrag = null;
let activeConeDrag = null;
let arrangeMode = "player";
let lastPlayTs = null;
let idSeq = 1;
function snapshotDocument() {
  return serialize(store.doc);
}
function restoreSnapshot(snap) {
  store.reset(deserialize(snap, { fallbackLayout: currentLayout() }), { currentTime: state.currentTime });
  idSeq = Math.max(idSeq, store.doc.nextId);
  resize();
  refreshCourtUI();
}
function undo() {
  store.undo();
}
function redo() {
  store.redo();
}
function updateUndoRedoButtons() {
  document.getElementById("btnUndo").disabled = !store.canUndo;
  document.getElementById("btnRedo").disabled = !store.canRedo;
}
const FIBA = {
  WIDTH: 15,
  HALF_LENGTH: 14,
  FULL_LENGTH: 28
};
let court = { x: 0, y: 0, w: 0, h: 0 };
let fullCourtHorizontal = false;
function courtAspect() {
  if (state.courtMode !== "full") return FIBA.WIDTH / FIBA.HALF_LENGTH;
  return fullCourtHorizontal ? FIBA.FULL_LENGTH / FIBA.WIDTH : FIBA.WIDTH / FIBA.FULL_LENGTH;
}
function courtScale() {
  return court.w / (state.courtMode === "full" && fullCourtHorizontal ? FIBA.FULL_LENGTH : FIBA.WIDTH);
}
let canvasCssW = 0, canvasCssH = 0, canvasLeft = 0, canvasTop = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  canvasCssW = rect.width;
  canvasCssH = rect.height;
  canvasLeft = rect.left;
  canvasTop = rect.top;
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 28;
  const availW = rect.width - pad * 2;
  const availH = rect.height - pad * 2;
  fullCourtHorizontal = availW >= availH;
  const aspect = courtAspect();
  let w = availW, h = w / aspect;
  if (h > availH) {
    h = availH;
    w = h * aspect;
  }
  const blockX = (rect.width - w) / 2;
  const blockTop = (rect.height - h) / 2;
  court = { x: blockX, y: blockTop, w, h };
  court.x - 24;
  court.y + 34;
  court.x - 24;
  court.y + 78;
  render();
}
function stampToken(kind, pt) {
  store.doc;
  store.commit(stampToken$1, { kind, home: clampCourt(toCourt(pt)) });
  idSeq = Math.max(idSeq, store.doc.nextId);
  const added = store.doc.tokens[store.doc.tokens.length - 1];
  return added;
}
function removeToken(token2) {
  store.commit(removeToken$1, { tokenId: token2.id, currentTime: state.currentTime });
  state.currentTime = store.currentTime;
  toast("removed", getCssVar("--def"));
}
const removeTokenState = removeToken;
function removeCone(cone2) {
  store.commit(removeCone$1, { coneId: cone2.id });
  toast("removed", getCssVar("--def"));
}
const FORMATIONS_KEY = "drillpal.formations";
function readSavedFormations() {
  try {
    return JSON.parse(localStorage.getItem(FORMATIONS_KEY)) || {};
  } catch {
    return {};
  }
}
function writeSavedFormations(formations) {
  localStorage.setItem(FORMATIONS_KEY, JSON.stringify(formations));
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function libRowsHtml(names) {
  if (!names.length) return '<div class="m-empty">None saved yet</div>';
  return names.map((n) => {
    const e = escapeHtml(n);
    return `<button class="mi lib-row" data-name="${e}"><span class="row-name">${e}</span><span class="row-x" data-del role="button" aria-label="Delete ${e}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></span></button>`;
  }).join("");
}
function renderLibraryMenu() {
  document.getElementById("libPlays").innerHTML = libRowsHtml(Object.keys(readSavedPlays()).sort());
  document.getElementById("libFormations").innerHTML = libRowsHtml(Object.keys(readSavedFormations()).sort());
}
function refreshFormationsSelect() {
  renderLibraryMenu();
}
function saveFormation(name) {
  const formations = readSavedFormations();
  formations[name] = {
    // Court points, not the old fx/fy fractions: a formation is a roster with
    // positions, and those are court-relative now like everything else.
    tokens: state.tokens.map((t) => ({ id: t.id, kind: t.kind, label: t.label, home: t.home })),
    balls: state.balls.map((b) => ({ id: b.id, initialHolderId: b.initialHolderId })),
    cones: state.cones.map((c) => ({ at: c.at }))
  };
  writeSavedFormations(formations);
  refreshFormationsSelect();
}
function formationPoint(spec) {
  if (spec.home) return spec.home;
  if (spec.at) return spec.at;
  return fractionToCourt(
    spec.fx,
    spec.fy,
    state.courtMode,
    state.courtMode === "full" && fullCourtHorizontal
  );
}
function hasDrawnContent() {
  return state.tokens.some((t) => t.segments.length > 0) || state.balls.some((b) => b.transfers.length > 0) || state.annotations.length > 0;
}
function loadSavedFormation(name) {
  const f = readSavedFormations()[name];
  if (!f) return;
  const idMap = /* @__PURE__ */ new Map();
  let next = blankPlay(state.courtMode);
  let nextIdSeq = Math.max(idSeq, next.nextId);
  const mint = () => nextIdSeq++;
  const tokens = f.tokens.map((spec) => {
    const id = mint();
    idMap.set(spec.id, id);
    return { id, kind: spec.kind, label: spec.label, home: formationPoint(spec), segments: [], roleChanges: [] };
  });
  const balls = f.balls.map((spec) => ({ spec, holderId: idMap.get(spec.initialHolderId) })).filter(({ holderId }) => holderId != null).map(({ holderId }) => ({ id: mint(), initialHolderId: holderId, transfers: [] }));
  const cones = f.cones.map((spec) => ({ id: mint(), at: formationPoint(spec) }));
  next = { ...next, tokens, balls, cones, nextId: nextIdSeq };
  idSeq = nextIdSeq;
  store.reset(next, { currentTime: 0 });
  state.currentTime = 0;
  setArranging(false);
  render();
  updateDataPanel();
  refreshForkUI();
}
const PLAYS_KEY_LEGACY = "drillpal.plays";
const PLAYS_KEY = "drillpal.plays.v1";
function readJsonKey(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}
function readSavedPlays() {
  return { ...readJsonKey(PLAYS_KEY_LEGACY), ...readJsonKey(PLAYS_KEY) };
}
function writeSavedPlays(plays) {
  const own = readJsonKey(PLAYS_KEY);
  const legacy = readJsonKey(PLAYS_KEY_LEGACY);
  const next = {};
  for (const [name, value] of Object.entries(plays)) {
    if (name in own || !(name in legacy)) next[name] = value;
  }
  localStorage.setItem(PLAYS_KEY, JSON.stringify(next));
}
function refreshPlaysSelect() {
  renderLibraryMenu();
}
function savePlay(name) {
  const plays = readSavedPlays();
  plays[name] = { savedAt: Date.now(), doc: snapshotDocument() };
  writeSavedPlays(plays);
  refreshPlaysSelect();
}
function loadSavedPlay(name) {
  const entry = readSavedPlays()[name];
  if (!entry) return;
  restoreSnapshot(entry.doc);
  state.currentTime = 0;
  setArranging(false);
  render();
  updateDataPanel();
  refreshForkUI();
}
function tokenById(id) {
  return state.tokens.find((t) => t.id === id) || null;
}
function branchById(id) {
  return state.branches.find((b) => b.id === id) || null;
}
function createFork() {
  store.commit(createFork$1, { t: state.currentTime, currentTime: state.currentTime });
  idSeq = Math.max(idSeq, store.doc.nextId);
  state.currentTime = store.currentTime;
}
function switchBranch(newId) {
  store.commit(switchBranch$1, { branchId: newId, currentTime: state.currentTime });
  state.currentTime = store.currentTime;
}
function addBranch() {
  if (state.forkAt == null) return null;
  store.commit(addBranch$1, { currentTime: state.currentTime });
  idSeq = Math.max(idSeq, store.doc.nextId);
  state.currentTime = store.currentTime;
  return branchById(state.activeBranchId);
}
function removeFork() {
  store.commit(removeFork$1, { currentTime: state.currentTime });
  state.currentTime = store.currentTime;
}
function deleteBranch(branchId) {
  store.commit(deleteBranch$1, { branchId, currentTime: state.currentTime });
  state.currentTime = store.currentTime;
}
function flipRoleAt(token2, t) {
  const next = kindAt(token2, t) === "offense" ? "defense" : "offense";
  store.commit(flipRoleAt$1, { tokenId: token2.id, t });
  toast("now " + (next === "offense" ? "blue" : "red"), getCssVar(next === "offense" ? "--off" : "--def"));
}
const liveToken = (t) => t ? state.tokens.find((x) => x.id === t.id) || null : null;
const liveBall = (b) => b ? state.balls.find((x) => x.id === b.id) || null : null;
const liveCone = (c) => c ? state.cones.find((x) => x.id === c.id) || null : null;
function hitToken(pt, radiusPx) {
  const { resolved, layout } = liveView();
  return liveToken(hitToken$1(resolved, layout, state.currentTime, pt, radiusPx));
}
function hitTokenForRepeatTap(pt, recentTap) {
  const { resolved, layout } = liveView();
  return liveToken(hitTokenForRepeatTap$1(
    resolved,
    layout,
    state.currentTime,
    pt,
    recentTap ? recentTap.tokenId : null
  ));
}
function hitBall(pt, radiusPx) {
  const { resolved, layout } = liveView();
  return liveBall(hitBall$1(resolved, layout, state.courtMode, state.currentTime, pt, radiusPx));
}
function hitCone(pt, radiusPx) {
  const { resolved, layout } = liveView();
  return liveCone(hitCone$1(resolved, layout, pt, radiusPx));
}
function hitAnyStroke(pt, radiusPx) {
  const { resolved, layout } = liveView();
  const hit = hitAnyStroke$1(resolved, layout, state.courtMode, pt, radiusPx);
  if (!hit) return null;
  if (hit.type === "move") return { type: "move", owner: liveToken(hit.owner), seg: hit.seg };
  if (hit.type === "transfer") return { type: "transfer", ball: liveBall(hit.ball), seg: hit.seg };
  return hit;
}
function screenDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clampCourt(p) {
  return {
    u: clamp(p.u, 0, FIBA$1.WIDTH),
    v: clamp(p.v, 0, courtLengthM(state.courtMode))
  };
}
function localPoint(e) {
  return { x: e.clientX - canvasLeft, y: e.clientY - canvasTop };
}
function pressureWidth(e) {
  let p = e.pressure;
  if (!p || p === 0) p = 0.5;
  return 2.2 + p * 5.5;
}
let penEverSeen = false;
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "pen") penEverSeen = true;
  if (e.pointerType === "touch" && penEverSeen) return;
  if (state.playing) togglePlay(false);
  canvas.setPointerCapture(e.pointerId);
  const pt = localPoint(e);
  if (state.arranging) {
    if (arrangeMode === "remove") {
      const token3 = hitToken(pt);
      if (token3) {
        removeToken(token3);
        return;
      }
      const cone2 = hitCone(pt);
      if (cone2) removeCone(cone2);
      return;
    }
    const existingBall = hitBall(pt);
    if (existingBall) {
      activeBallDrag = { pointerId: e.pointerId, ball: existingBall, isNew: false, pt };
      return;
    }
    const existingCone = hitCone(pt);
    if (existingCone) {
      activeConeDrag = { pointerId: e.pointerId, cone: existingCone, isNew: false, pt };
      return;
    }
    const token22 = hitTokenForRepeatTap(pt, lastArrangeTap);
    if (token22) {
      activeDrag = { pointerId: e.pointerId, token: token22, moved: false, startPt: pt };
      return;
    }
    const newToken = stampToken("offense", pt);
    activeDrag = { pointerId: e.pointerId, token: newToken, moved: true };
    render();
    return;
  }
  let mode = "note", token2 = null, fromId = null, ball2 = null;
  const hitB = hitBall(pt);
  if (hitB) {
    const holderId = holderAt(hitB, state.currentTime);
    if (holderId != null) {
      mode = "transfer";
      fromId = holderId;
      ball2 = hitB;
    }
  } else {
    const t = hitTokenForRepeatTap(pt, lastTimelineTap);
    if (t) {
      mode = "move";
      token2 = t;
    }
  }
  if (mode !== "note" && state.forkAt != null && state.currentTime < state.forkAt) {
    toast("prefix locked — remove fork to edit", getCssVar("--def"));
    return;
  }
  activeStroke = {
    pointerId: e.pointerId,
    mode,
    token: token2,
    fromId,
    ball: ball2,
    points: [pt],
    widths: [pressureWidth(e)],
    startWall: performance.now(),
    startT: state.currentTime,
    lastEventTs: e.timeStamp
    // high-water mark for de-duping re-delivered coalesced samples (see pointermove)
  };
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType === "pen") penEverSeen = true;
  if (activeDrag && e.pointerId === activeDrag.pointerId) {
    const pt = localPoint(e);
    if (!activeDrag.moved && screenDist(pt, activeDrag.startPt) > 6) activeDrag.moved = true;
    if (activeDrag.moved) {
      store.commit(
        moveTokenHome,
        { tokenId: activeDrag.token.id, home: clampCourt(toCourt(pt)) },
        { coalesce: "drag:" + activeDrag.token.id }
      );
    }
    return;
  }
  if (activeBallDrag && e.pointerId === activeBallDrag.pointerId) {
    activeBallDrag.pt = localPoint(e);
    render();
    return;
  }
  if (activeConeDrag && e.pointerId === activeConeDrag.pointerId) {
    activeConeDrag.pt = localPoint(e);
    render();
    return;
  }
  if (!activeStroke || e.pointerId !== activeStroke.pointerId) return;
  const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  let appended = 0;
  for (const ev of events) {
    if (ev.timeStamp <= activeStroke.lastEventTs) continue;
    activeStroke.lastEventTs = ev.timeStamp;
    const p = localPoint(ev);
    const prev = activeStroke.points[activeStroke.points.length - 1];
    if (prev && p.x === prev.x && p.y === prev.y) continue;
    activeStroke.points.push(p);
    activeStroke.widths.push(pressureWidth(ev));
    appended++;
  }
  if (!appended && e.timeStamp > activeStroke.lastEventTs) {
    activeStroke.lastEventTs = e.timeStamp;
    const p = localPoint(e);
    const prev = activeStroke.points[activeStroke.points.length - 1];
    if (!prev || p.x !== prev.x || p.y !== prev.y) {
      activeStroke.points.push(p);
      activeStroke.widths.push(pressureWidth(e));
    }
  }
  render();
});
canvas.addEventListener("pointerup", finishPointer);
canvas.addEventListener("pointercancel", finishPointer);
let lastArrangeTap = null;
let lastTimelineTap = null;
function finishPointer(e) {
  if (activeDrag && e.pointerId === activeDrag.pointerId) {
    const drag = activeDrag;
    activeDrag = null;
    let changed = drag.moved;
    if (drag.moved) {
      lastArrangeTap = null;
    } else {
      lastArrangeTap = { tokenId: drag.token.id, time: performance.now() };
      if (drag.token.kind === "offense") switchRole(drag.token);
      else removeTokenState(drag.token);
      changed = true;
    }
    if (!changed) render();
    return;
  }
  if (activeBallDrag && e.pointerId === activeBallDrag.pointerId) {
    const drag = activeBallDrag;
    activeBallDrag = null;
    const target = hitToken(drag.pt);
    let changed = false;
    if (target) {
      const heldCount = ballsHeldBy(state.balls, target.id, state.currentTime, drag.ball);
      if (heldCount >= MAX_BALLS_PER_PLAYER) {
        toast("already holding " + MAX_BALLS_PER_PLAYER, getCssVar("--def"));
      } else if (drag.isNew) {
        store.commit(addBall, { holderId: target.id });
        idSeq = Math.max(idSeq, store.doc.nextId);
        toast("has the ball", getCssVar("--ball"));
        changed = true;
      } else {
        store.commit(setBallHolder, { ballId: drag.ball.id, holderId: target.id });
        toast("reassigned", getCssVar("--ball"));
        changed = true;
      }
    } else if (!drag.isNew) {
      store.commit(removeBall, { ballId: drag.ball.id, currentTime: state.currentTime });
      state.currentTime = store.currentTime;
      toast("removed", getCssVar("--def"));
      changed = true;
    }
    if (!changed) render();
    return;
  }
  if (activeConeDrag && e.pointerId === activeConeDrag.pointerId) {
    const drag = activeConeDrag;
    activeConeDrag = null;
    const inCourt = drag.pt.x >= court.x && drag.pt.x <= court.x + court.w && drag.pt.y >= court.y && drag.pt.y <= court.y + court.h;
    let changed = false;
    if (inCourt) {
      const at = clampCourt(toCourt(drag.pt));
      if (drag.isNew) {
        store.commit(addCone, { at });
        idSeq = Math.max(idSeq, store.doc.nextId);
      } else {
        store.commit(moveCone, { coneId: drag.cone.id, at });
      }
      changed = true;
    } else if (!drag.isNew) {
      store.commit(removeCone$1, { coneId: drag.cone.id });
      toast("removed", getCssVar("--def"));
      changed = true;
    }
    if (!changed) render();
    return;
  }
  finishStroke(e);
}
function switchRole(token2) {
  const newKind = token2.kind === "offense" ? "defense" : "offense";
  store.commit(setTokenKind, { tokenId: token2.id, kind: newKind });
  toast("now " + (newKind === "offense" ? "blue" : "red"), getCssVar(newKind === "offense" ? "--off" : "--def"));
}
const PASS_DURATION_MS = 400;
function finishStroke(e) {
  if (!activeStroke || e.pointerId !== activeStroke.pointerId) return;
  const s = activeStroke;
  activeStroke = null;
  const len = pathLength(s.points);
  const tapPoint = s.points[s.points.length - 1];
  if (len >= 8) lastTimelineTap = null;
  if (len < 8) {
    if (s.token) {
      const isDoubleTap = lastTimelineTap && lastTimelineTap.tokenId === s.token.id;
      lastTimelineTap = isDoubleTap ? null : { tokenId: s.token.id, time: performance.now() };
      if (isDoubleTap) {
        flipRoleAt(s.token, state.currentTime);
      }
      return;
    }
    const hit = hitAnyStroke(tapPoint);
    if (hit) {
      if (hit.type !== "note" && state.forkAt != null && hit.seg.startT < state.forkAt) {
        toast("prefix locked — remove fork to edit", getCssVar("--def"));
        return;
      }
      store.commit(opCommitStroke, { outcome: { kind: "deleteStroke", hit }, currentTime: state.currentTime });
      state.currentTime = store.currentTime;
      toast("deleted", getCssVar("--def"));
    }
    return;
  }
  const wallMs = performance.now() - s.startWall;
  const durMs = clamp(wallMs, 280, 4200);
  const strokeLayout = currentLayout();
  const inkPoints = () => s.points.map((pt) => fromScreen(strokeLayout, pt));
  if (s.mode === "move") {
    store.commit(opCommitStroke, {
      outcome: { kind: "move", tokenId: s.token.id, startT: s.startT, endT: s.startT + durMs, points: inkPoints() },
      currentTime: state.currentTime
    });
    state.currentTime = store.currentTime;
    toast("move", getCssVar("--accent"));
  } else if (s.mode === "transfer") {
    const endPt = s.points[s.points.length - 1];
    const target = hitToken(endPt, 30);
    if (!target && !nearHoop(state.courtMode, toCourt(endPt))) {
      toast("no target", getCssVar("--def"));
      render();
      return;
    }
    const toId = target ? target.id : null;
    const transferDurMs = toId != null ? PASS_DURATION_MS : durMs;
    store.commit(opCommitStroke, {
      outcome: {
        kind: "transfer",
        ballId: s.ball.id,
        fromId: s.fromId,
        toId,
        startT: s.startT,
        endT: s.startT + transferDurMs,
        points: inkPoints()
      },
      currentTime: state.currentTime
    });
    state.currentTime = store.currentTime;
    toast(toId ? "pass" : "shot", getCssVar(toId ? "--pass" : "--shot"));
  } else {
    store.commit(opCommitStroke, {
      outcome: { kind: "note", t: s.startT, points: inkPoints() },
      currentTime: state.currentTime
    });
    state.currentTime = store.currentTime;
    toast("note", getCssVar("--ink"));
  }
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
const coreMemo = createMemoScope();
function currentLayout() {
  return {
    mode: state.courtMode,
    horizontal: state.courtMode === "full" && fullCourtHorizontal,
    box: { x: court.x, y: court.y, w: court.w, h: court.h },
    scale: courtScale(),
    canvasW: canvasCssW,
    canvasH: canvasCssH
  };
}
function toCourt(pt) {
  return fromScreen(currentLayout(), pt);
}
function liveView() {
  return { layout: currentLayout(), doc: store.doc, resolved: view() };
}
const opCommitStroke = (doc, args) => commitStroke(doc, args.outcome, { currentTime: args.currentTime });
function currentPalette() {
  return {
    court: getCssVar("--court"),
    courtLine: getCssVar("--court-line"),
    accent: getCssVar("--accent"),
    future: getCssVar("--future"),
    ink: getCssVar("--ink"),
    off: getCssVar("--off"),
    def: getCssVar("--def"),
    ball: getCssVar("--ball"),
    pass: getCssVar("--pass"),
    shot: getCssVar("--shot"),
    cone: getCssVar("--cone")
  };
}
function render() {
  const layout = currentLayout();
  if (!(court.w > 0 && court.h > 0)) return;
  const doc = store.doc;
  const opts = {
    layout,
    palette: currentPalette(),
    view: {
      numbersEnabled: state.numbersEnabled,
      declutterEnabled: state.declutterEnabled,
      arranging: state.arranging,
      branchId: null
      // live state already holds the active branch's timeline
    },
    memo: coreMemo
  };
  ctx.clearRect(0, 0, canvasCssW, canvasCssH);
  renderScene(ctx, doc, state.currentTime, opts);
  if (activeStroke) {
    drawLiveStroke();
    if (state.ghostsEnabled) drawGhosts();
  }
  renderEntities(ctx, doc, state.currentTime, opts);
  drawActiveBallDrag();
  drawActiveConeDrag();
  drawTransport();
}
function drawGhosts() {
  const s = activeStroke;
  const ghostT = clamp(s.startT + (performance.now() - s.startWall), 0, totalDuration());
  const excludeId = s.token ? s.token.id : s.fromId;
  const { layout, resolved } = liveView();
  ctx.save();
  ctx.globalAlpha = 0.35;
  for (const token2 of state.tokens) {
    if (token2.id === excludeId) continue;
    const moving = token2.segments.some((seg) => ghostT >= seg.startT && ghostT < seg.endT);
    if (!moving) continue;
    const p = toScreen(layout, tokenPosAt(token2, ghostT));
    if (kindAt(token2, ghostT) === "offense") {
      ctx.fillStyle = getCssVar("--off");
      ctx.beginPath();
      ctx.arc(p.x, p.y, PHYSICAL.OFFENSE_R_M * layout.scale, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = getCssVar("--def");
      ctx.beginPath();
      ctx.arc(p.x, p.y, PHYSICAL.DEFENSE_R_M * layout.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const ball2 of state.balls) {
    if (ball2 === s.ball) continue;
    const bp = ballPosAt(resolved, state.courtMode, layout.scale, ball2, ghostT);
    if (bp.inFlight) {
      const sp = toScreen(layout, bp.pos);
      ctx.fillStyle = getCssVar("--ball");
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, PHYSICAL.BALL_R_M * layout.scale, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
function drawLiveStroke() {
  const s = activeStroke;
  const color = s.mode === "note" ? getCssVar("--ink") : s.mode === "transfer" ? getCssVar("--pass") : getCssVar("--accent");
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineWidth = s.widths[i];
    ctx.beginPath();
    ctx.moveTo(s.points[i - 1].x, s.points[i - 1].y);
    ctx.lineTo(s.points[i].x, s.points[i].y);
    ctx.stroke();
  }
  ctx.restore();
}
function drawActiveBallDrag() {
  if (!activeBallDrag) return;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = getCssVar("--ball");
  ctx.beginPath();
  ctx.arc(activeBallDrag.pt.x, activeBallDrag.pt.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function coneTrianglePath(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x - r * 0.9, y + r * 0.75);
  ctx.lineTo(x + r * 0.9, y + r * 0.75);
  ctx.closePath();
}
function drawActiveConeDrag() {
  if (!activeConeDrag) return;
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = getCssVar("--cone");
  coneTrianglePath(activeConeDrag.pt.x, activeConeDrag.pt.y, CONE_R);
  ctx.fill();
  ctx.restore();
}
let _lastTimeStr = "", _lastTotalStr = "";
function drawTransport() {
  const timeStr = (state.currentTime / 1e3).toFixed(1) + "s";
  if (timeStr !== _lastTimeStr) {
    document.getElementById("timeOut").textContent = timeStr;
    _lastTimeStr = timeStr;
  }
  const totalStr = (totalDuration() / 1e3).toFixed(1) + "s";
  if (totalStr !== _lastTotalStr) {
    document.getElementById("totalOut").textContent = totalStr;
    _lastTotalStr = totalStr;
  }
  const pct = state.currentTime / totalDuration() * 100;
  document.getElementById("scrubFill").style.width = pct + "%";
  document.getElementById("scrubThumb").style.left = pct + "%";
  const forkMark = document.getElementById("forkMark");
  if (state.forkAt != null) {
    forkMark.style.display = "";
    forkMark.style.left = state.forkAt / totalDuration() * 100 + "%";
  } else {
    forkMark.style.display = "none";
  }
}
const scrubEl = document.getElementById("scrub");
let scrubbing = false;
const FORK_SNAP_PX = 10;
function seekFromClientX(clientX) {
  const r = scrubEl.getBoundingClientRect();
  const frac = clamp((clientX - r.left) / r.width, 0, 1);
  let t = frac * totalDuration();
  if (state.forkAt != null) {
    const forkPx = state.forkAt / totalDuration() * r.width;
    const targetPx = frac * r.width;
    if (Math.abs(targetPx - forkPx) <= FORK_SNAP_PX) t = state.forkAt;
  }
  state.currentTime = t;
  render();
}
scrubEl.addEventListener("pointerdown", (e) => {
  scrubbing = true;
  scrubEl.setPointerCapture(e.pointerId);
  togglePlay(false);
  seekFromClientX(e.clientX);
});
scrubEl.addEventListener("pointermove", (e) => {
  if (scrubbing) seekFromClientX(e.clientX);
});
scrubEl.addEventListener("pointerup", () => {
  scrubbing = false;
});
function togglePlay(force) {
  state.playing = force !== void 0 ? force : !state.playing;
  document.getElementById("playIcon").innerHTML = state.playing ? '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>' : '<path d="M8 5v14l11-7z"/>';
  document.getElementById("btnPlay").setAttribute("aria-label", state.playing ? "Pause" : "Play");
  lastPlayTs = null;
  if (state.playing) requestAnimationFrame(playTick);
}
function playTick(ts) {
  if (!state.playing) return;
  if (lastPlayTs == null) lastPlayTs = ts;
  const dt = ts - lastPlayTs;
  lastPlayTs = ts;
  state.currentTime += dt;
  if (state.currentTime > totalDuration()) state.currentTime = 0;
  render();
  requestAnimationFrame(playTick);
}
document.getElementById("btnPlay").addEventListener("click", () => togglePlay());
let toastTimer = null;
function toast(text, bg) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.style.background = bg || getCssVar("--ink");
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 900);
}
const round2 = (n) => Math.round(n * 100) / 100;
function buildDebugView() {
  const labelOf = (id) => {
    const t = tokenById(id);
    return t ? t.label : null;
  };
  return {
    court: state.courtMode,
    // "half" | "full"
    formation: state.tokens.map((t) => ({
      id: t.id,
      kind: t.kind,
      label: t.label,
      home: { u: round2(t.home.u), v: round2(t.home.v) },
      roleChanges: t.roleChanges.map((rc) => ({ atMs: Math.round(rc.t), kind: rc.kind }))
    })),
    moves: state.tokens.flatMap((t) => t.segments.map((s) => ({
      token: t.label,
      startMs: Math.round(s.startT),
      endMs: Math.round(s.endT),
      path: s.points.filter((_, i) => i % 4 === 0).map((p) => [round2(p.u), round2(p.v)])
    }))),
    balls: state.balls.map((ball2) => ({
      id: ball2.id,
      initialHolder: labelOf(ball2.initialHolderId),
      transfers: ball2.transfers.map((tr) => ({
        from: labelOf(tr.fromId),
        to: tr.toId == null ? "shot" : labelOf(tr.toId),
        startMs: Math.round(tr.startT),
        endMs: Math.round(tr.endT),
        path: tr.points.filter((_, i) => i % 4 === 0).map((p) => [round2(p.u), round2(p.v)])
      }))
    })),
    notes: state.annotations.map((a) => ({
      atMs: Math.round(a.t),
      lifeMs: a.life,
      path: a.points.filter((_, i) => i % 4 === 0).map((p) => [round2(p.u), round2(p.v)])
    })),
    cones: state.cones.map((c) => ({ id: c.id, u: round2(c.at.u), v: round2(c.at.v) })),
    durationMs: totalDuration()
  };
}
function updateDataPanel() {
  document.getElementById("dataOut").textContent = JSON.stringify(buildDebugView(), null, 2);
}
document.getElementById("btnData").addEventListener("click", () => {
  updateDataPanel();
  document.getElementById("dataPanel").classList.add("open");
});
document.getElementById("btnCloseData").addEventListener("click", () => {
  document.getElementById("dataPanel").classList.remove("open");
});
document.getElementById("btnCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.getElementById("dataOut").textContent);
    toast("copied", getCssVar("--accent"));
  } catch {
  }
});
document.getElementById("btnCopyDebug").addEventListener("click", async () => {
  const blob = JSON.stringify({ build: BUILD, ua: navigator.userAgent, snapshot: snapshotDocument() }, null, 2);
  try {
    await navigator.clipboard.writeText(blob);
    toast("debug copied", getCssVar("--accent"));
  } catch {
    document.getElementById("dataOut").textContent = blob;
    toast("shown below — select + copy", getCssVar("--def"));
  }
});
document.getElementById("btnGhosts").addEventListener("click", () => {
  state.ghostsEnabled = !state.ghostsEnabled;
  document.getElementById("btnGhosts").setAttribute("aria-checked", String(state.ghostsEnabled));
});
document.getElementById("btnNumbers").addEventListener("click", () => {
  state.numbersEnabled = !state.numbersEnabled;
  document.getElementById("btnNumbers").setAttribute("aria-checked", String(state.numbersEnabled));
  render();
});
document.getElementById("btnDeclutter").addEventListener("click", () => {
  state.declutterEnabled = !state.declutterEnabled;
  document.getElementById("btnDeclutter").setAttribute("aria-checked", String(state.declutterEnabled));
  render();
});
document.getElementById("btnSaveFormation").addEventListener("click", () => {
  const raw = prompt("Save formation as:");
  const name = raw == null ? "" : raw.trim();
  if (!name) return;
  if (readSavedFormations()[name] && !confirm(`Overwrite "${name}"?`)) return;
  saveFormation(name);
  toast(`saved "${name}"`, getCssVar("--accent"));
});
document.getElementById("btnSavePlay").addEventListener("click", () => {
  const raw = prompt("Save play as:");
  const name = raw == null ? "" : raw.trim();
  if (!name) return;
  if (readSavedPlays()[name] && !confirm(`Overwrite "${name}"?`)) return;
  savePlay(name);
  toast(`saved play "${name}"`, getCssVar("--accent"));
});
function wireLibSection(containerId, kind) {
  document.getElementById(containerId).addEventListener("click", (e) => {
    const row = e.target.closest(".lib-row");
    if (!row) return;
    e.stopPropagation();
    const name = row.dataset.name;
    if (e.target.closest("[data-del]")) {
      if (!confirm(`Delete "${name}"?`)) return;
      if (kind === "play") {
        const o = readSavedPlays();
        delete o[name];
        writeSavedPlays(o);
      } else {
        const o = readSavedFormations();
        delete o[name];
        writeSavedFormations(o);
      }
      renderLibraryMenu();
      toast(`deleted ${kind} "${name}"`, getCssVar("--def"));
      return;
    }
    const what = kind === "play" ? "play" : "drawing";
    if (hasDrawnContent() && !confirm(`Load "${name}"? This discards the current ${what}.`)) return;
    if (kind === "play") loadSavedPlay(name);
    else loadSavedFormation(name);
    closeAllMenus();
    toast(`loaded ${kind} "${name}"`, getCssVar("--accent"));
  });
}
wireLibSection("libPlays", "play");
wireLibSection("libFormations", "formation");
renderLibraryMenu();
function refreshForkUI() {
  const forked = state.forkAt != null;
  document.getElementById("app").classList.toggle("forked", forked);
  if (forked) {
    const sel = document.getElementById("selBranch");
    sel.innerHTML = state.branches.map((b) => `<option value="${b.id}"${b.id === state.activeBranchId ? " selected" : ""}>${escapeHtml(b.name)}</option>`).join("");
  }
}
document.getElementById("btnFork").addEventListener("click", () => {
  if (state.arranging) {
    toast("finish arranging first", getCssVar("--def"));
    return;
  }
  if (state.currentTime <= 0) {
    toast("scrub to a decision point first", getCssVar("--def"));
    return;
  }
  createFork();
  refreshForkUI();
  toast("forked — drawing branch A", getCssVar("--accent"));
});
document.getElementById("selBranch").addEventListener("change", (e) => {
  switchBranch(Number(e.target.value));
  refreshForkUI();
});
document.getElementById("btnAddBranch").addEventListener("click", () => {
  const branch = addBranch();
  refreshForkUI();
  if (branch) toast(`added branch ${branch.name} — drawing it now`, getCssVar("--accent"));
});
document.getElementById("btnDeleteBranch").addEventListener("click", () => {
  const id = Number(document.getElementById("selBranch").value);
  const branch = branchById(id);
  if (!branch) return;
  const collapsing = state.branches.length <= 2;
  const msg = collapsing ? `Delete branch ${branch.name}? Only one branch would be left, so the fork itself will be removed and the other branch kept as the normal timeline.` : `Delete branch ${branch.name}? Its drawing will be discarded.`;
  if (!confirm(msg)) return;
  deleteBranch(id);
  refreshForkUI();
  toast(collapsing ? "fork collapsed" : `deleted branch ${branch.name}`, getCssVar("--def"));
});
document.getElementById("btnRemoveFork").addEventListener("click", () => {
  if (!confirm("Remove fork? All branches will be discarded.")) return;
  removeFork();
  refreshForkUI();
  toast("fork removed", getCssVar("--def"));
});
refreshForkUI();
function newBlankPlay({ arrange = true } = {}) {
  store.reset(blankPlay(state.courtMode), { currentTime: 0 });
  state.currentTime = 0;
  resize();
  refreshForkUI();
  if (arrange) setArranging(true);
}
document.getElementById("btnBlank").addEventListener("click", () => newBlankPlay());
function refreshCourtUI() {
  document.getElementById("btnCourtHalf").setAttribute("aria-pressed", String(state.courtMode !== "full"));
  document.getElementById("btnCourtFull").setAttribute("aria-pressed", String(state.courtMode === "full"));
}
function setCourtMode(mode) {
  if (mode === state.courtMode) return;
  const nonEmpty = state.tokens.length > 0 || state.cones.length > 0 || hasDrawnContent();
  if (nonEmpty && !confirm(
    `Switch to ${mode === "full" ? "full" : "half"} court? This starts a new blank play on that court — the current players and lines are cleared.`
  )) return;
  store.commit(setCourtMode$1, { mode });
  state.currentTime = 0;
  resize();
  refreshForkUI();
  refreshCourtUI();
  toast(`${mode === "full" ? "full" : "half"} court`, getCssVar("--accent"));
}
document.getElementById("btnCourtHalf").addEventListener("click", () => setCourtMode("half"));
document.getElementById("btnCourtFull").addEventListener("click", () => setCourtMode("full"));
document.getElementById("btnClear").addEventListener("click", () => {
  store.commit(clearStrokes, { currentTime: state.currentTime });
  state.currentTime = store.currentTime;
});
document.getElementById("btnClearNotes").addEventListener("click", () => {
  store.commit(clearNotes, { currentTime: state.currentTime });
  state.currentTime = store.currentTime;
});
document.getElementById("btnClearAll").addEventListener("click", () => {
  store.commit(clearAll, { currentTime: state.currentTime });
  state.currentTime = 0;
});
document.getElementById("btnUndo").addEventListener("click", undo);
document.getElementById("btnRedo").addEventListener("click", redo);
window.addEventListener("keydown", (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
  e.preventDefault();
  if (e.shiftKey) redo();
  else undo();
});
function setArrangeMode(mode) {
  arrangeMode = mode;
  document.getElementById("btnAddPlayer").setAttribute("aria-pressed", String(mode === "player"));
  document.getElementById("btnRemove").setAttribute("aria-pressed", String(mode === "remove"));
}
function setArranging(on) {
  state.arranging = on;
  const btn = document.getElementById("btnArrange");
  btn.textContent = on ? "Done" : "Arrange";
  btn.classList.toggle("b--primary", on);
  document.getElementById("app").classList.toggle("arranging", on);
  if (on) setArrangeMode("player");
  if (on) {
    state.currentTime = 0;
    togglePlay(false);
  }
  resize();
}
document.getElementById("btnArrange").addEventListener("click", () => setArranging(!state.arranging));
document.getElementById("btnAddPlayer").addEventListener("click", () => setArrangeMode("player"));
document.getElementById("btnRemove").addEventListener("click", () => setArrangeMode("remove"));
function wireSource(elId, kind) {
  const el = document.getElementById(elId);
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const pt = localPoint(e);
    if (kind === "ball") activeBallDrag = { pointerId: e.pointerId, ball: null, isNew: true, pt };
    else activeConeDrag = { pointerId: e.pointerId, cone: null, isNew: true, pt };
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {
    }
    render();
  });
  el.addEventListener("pointermove", (e) => {
    const drag = kind === "ball" ? activeBallDrag : activeConeDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.pt = localPoint(e);
    render();
  });
  const end = (e) => {
    const drag = kind === "ball" ? activeBallDrag : activeConeDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    finishPointer(e);
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
wireSource("srcBall", "ball");
wireSource("srcCone", "cone");
const MENUS = [
  ["btnClearMenu", "menuClear"],
  ["btnLibrary", "menuLibrary"],
  ["btnMore", "menuMore"],
  ["btnForkMenu", "menuFork"]
];
function closeAllMenus(except) {
  for (const [trigId, menuId] of MENUS) {
    if (menuId === except) continue;
    document.getElementById(menuId).classList.remove("show");
    document.getElementById(trigId).classList.remove("menu-open");
  }
}
for (const [trigId, menuId] of MENUS) {
  const trig = document.getElementById(trigId);
  const menu = document.getElementById(menuId);
  trig.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !menu.classList.contains("show");
    closeAllMenus(willOpen ? menuId : null);
    if (willOpen && menuId === "menuLibrary") renderLibraryMenu();
    menu.classList.toggle("show", willOpen);
    trig.classList.toggle("menu-open", willOpen);
  });
  menu.addEventListener("click", (e) => {
    if (e.target.closest(".mi--switch")) {
      e.stopPropagation();
      return;
    }
    if (e.target.closest("#libPlays, #libFormations")) {
      e.stopPropagation();
      return;
    }
    if (e.target.closest(".mi")) closeAllMenus();
  });
}
document.addEventListener("click", () => closeAllMenus());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllMenus();
});
document.getElementById("buildStamp").textContent = "build " + BUILD + " · core " + CORE_VERSION;
console.log("DrillPal build " + BUILD + " · core " + CORE_VERSION);
{
  window.__drillpal = {
    state,
    resize,
    render,
    snapshotDocument,
    restoreSnapshot,
    get court() {
      return court;
    },
    get fullCourtHorizontal() {
      return fullCourtHorizontal;
    },
    // Slice 2 characterization only: pin the court box to a fixture's
    // capture-time box (recovered from its tokens or its layout stamp) and
    // recompute the token homes from fx/fy, so tokenPosAt/ballPosAt see the
    // SAME box the stroke pixels were drawn in — otherwise the capture would
    // just be measuring live bug #1 (layout-change ink desync). Does NOT call
    // resize(), which would recompute the box from the live canvas.
    setLayout(box, horizontal) {
      court = { x: box.x, y: box.y, w: box.w, h: box.h };
      fullCourtHorizontal = !!horizontal;
    },
    // Slice 3 parity harness: the canvas + context it captures pixels from,
    // the palette lookup the core takes as an explicit Palette, and branch
    // switching (the ViewOptions axis with no prototype equivalent until now).
    canvas,
    ctx,
    getCssVar,
    refreshPalette,
    switchBranch,
    // The long list of geometry/timeline/hit-test functions that used to be
    // re-exported here was this file's own pixel-native duplicates of the
    // core. Slice 4.5b-1 deleted them; anything that needs them should import
    // from src/core directly, which is what the characterization suite does.
    courtScale,
    courtAspect,
    hitToken,
    hitTokenForRepeatTap,
    hitBall,
    hitCone,
    hitAnyStroke,
    tokenById,
    currentLayout,
    get doc() {
      return store.doc;
    },
    store,
    // Slice 3 parity gate: the extracted core's own render path, so the
    // harness can render Side B (renderFrame) next to Side A — which since
    // 4.5a is the FROZEN build in src/parity/frozen-oracle/, not this file.
    core: { deserialize, legacyBoxToLayout, resolveBranch, renderFrame, createMemoScope }
  };
}
new ResizeObserver(resize).observe(canvas);
resize();
document.getElementById("btnBlank").click();

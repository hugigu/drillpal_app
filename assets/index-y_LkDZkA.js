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
  const box2 = { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h };
  const scale = horizontal ? w / lengthM : w / FIBA$1.WIDTH;
  return { mode, horizontal, box: box2, scale, canvasW, canvasH };
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
function legacyBoxToLayout(box2, mode, horizontalOverride) {
  const horizontal = mode === "full" && (horizontalOverride ?? box2.w > box2.h);
  const lengthM = courtLengthM(mode);
  const scale = horizontal ? box2.w / lengthM : box2.w / FIBA$1.WIDTH;
  return {
    mode,
    horizontal,
    box: box2,
    scale,
    canvasW: box2.x * 2 + box2.w,
    canvasH: box2.y * 2 + box2.h
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
const readColor = (raw) => {
  if (raw.color === "red" || raw.color === "blue") return raw.color;
  return raw.kind === "defense" ? "red" : "blue";
};
const colorChange = (r) => ({
  t: num(r.t),
  color: readColor(r)
});
const token = (t, l) => ({
  id: num(t.id),
  color: readColor(t),
  label: String(t.label ?? ""),
  // Legacy home is a FRACTION of the court box, so it converts without needing
  // the solved box at all — only pixel stroke data does.
  home: l ? fractionToCourt(num(t.fx), num(t.fy), l.mode, l.horizontal) : { u: num(t.home?.u), v: num(t.home?.v) },
  segments: (Array.isArray(t.segments) ? t.segments : []).map((x) => segment(x, l)),
  colorChanges: (Array.isArray(t.colorChanges) ? t.colorChanges : Array.isArray(t.roleChanges) ? t.roleChanges : []).map(colorChange)
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
  /** Player marker radius, same for every colour — a 0.27m radius reads as a
   *  ~0.55m disc, about right for a player's footprint. No offense/defense
   *  size distinction (2026-09-11): tokens are colours, not roles, so nothing
   *  about a token's meaning should scale it differently from any other. */
  TOKEN_R_M: 14 / REFERENCE_PX_PER_M,
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
  STROKE_ACTIVE_W_PX: 3.5,
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
    let last2 = null;
    for (const seg of token2.segments) if (seg.endT <= t) last2 = seg;
    if (last2) {
      const pts = last2.points, end = pts[pts.length - 1];
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
function colorAt(token2, t) {
  let color = token2.color;
  for (const rc of token2.colorChanges) {
    if (t < rc.t) break;
    color = rc.color;
  }
  return color;
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
    const last2 = ball2.transfers[ball2.transfers.length - 1];
    const restPt = last2 ? last2.points[last2.points.length - 1] : { u: FIBA$1.WIDTH / 2, v: courtLengthM(courtMode) / 2 };
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
  const off = PHYSICAL.TOKEN_R_M + PHYSICAL.BALL_R_M - PHYSICAL.BALL_R_M * 2 / 3;
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
  const sampleAt = (dd) => {
    const c = posAt(dd, cCur);
    const back = posAt(dd - half, backCur), fwd = posAt(dd + half, fwdCur);
    const tu = fwd.u - back.u, tv = fwd.v - back.v;
    const tl = Math.hypot(tu, tv) || 1;
    const nu = hand * -tv / tl, nv = hand * tu / tl;
    const s = Math.sin((distanceOffset + dd) * twoPiOverWl) * amplitude;
    out.push({ u: c.u + nu * s, v: c.v + nv * s });
  };
  if (distanceOffset === 0) {
    for (let d = 0; d <= total + 1e-6; d += step) {
      const dd = d > total ? total : d;
      sampleAt(dd);
      if (dd === total) break;
    }
    return out;
  }
  sampleAt(0);
  const firstAbsGrid = Math.ceil((distanceOffset - 1e-6) / step) * step;
  for (let abs = firstAbsGrid; abs <= distanceOffset + total + 1e-6; abs += step) {
    const dd = Math.min(abs, distanceOffset + total) - distanceOffset;
    if (dd > 1e-6 && dd < total - 1e-6) sampleAt(dd);
  }
  sampleAt(total);
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
function contentEnd(resolved) {
  let maxT = 0;
  for (const tk of resolved.tokens) for (const s of tk.segments) maxT = Math.max(maxT, s.endT);
  for (const b of resolved.balls) for (const tr of b.transfers) maxT = Math.max(maxT, tr.endT);
  for (const a of resolved.annotations) maxT = Math.max(maxT, a.t + a.life);
  return maxT;
}
function durationFor(resolved) {
  return Math.max(8e3, Math.ceil((contentEnd(resolved) + 1500) / 1e3) * 1e3);
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
    color: args.color,
    label: String(nextPlayerNumber(doc.tokens)),
    home: args.home,
    segments: [],
    colorChanges: []
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
function flipColorAt$1(doc, args) {
  const tokens = doc.tokens.map((tok) => {
    if (tok.id !== args.tokenId) return tok;
    const next = colorAt(tok, args.t) === "blue" ? "red" : "blue";
    return { ...tok, colorChanges: [...tok.colorChanges.filter((rc) => rc.t < args.t), { t: args.t, color: next }] };
  });
  return { doc: { ...doc, tokens } };
}
function setTokenColor(doc, args) {
  return {
    doc: {
      ...doc,
      tokens: doc.tokens.map((t) => t.id === args.tokenId ? { ...t, color: args.color } : t)
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
    case "armColorFlip":
    case "rejected":
      return { doc };
    case "flipColor":
      return flipColorAt$1(doc, { tokenId: outcome.tokenId, t: outcome.t });
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
  const r = px(PHYSICAL.TOKEN_R_M, layout.scale);
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
  ctx2.fillStyle = colorAt(token2, t) === "blue" ? palette.blue : palette.red;
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
const ACTIVE_TAIL_EASE_MS = 500;
const ACTIVE_TAIL_FLOOR = 0.5;
function activeTailAlpha(strokeT, endTime) {
  const remaining = endTime - strokeT;
  if (remaining >= ACTIVE_TAIL_EASE_MS) return 1;
  const f = clamp$1(remaining / ACTIVE_TAIL_EASE_MS, 0, 1);
  return ACTIVE_TAIL_FLOOR + f * (1 - ACTIVE_TAIL_FLOOR);
}
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
  const hit = memo.wavifyCache.get(points2);
  if (hit && hit.len === points2.length && hit.amp === amplitude && hit.wl === wavelength && hit.off === distanceOffset && hit.reflected === reflected) {
    return hit.out;
  }
  const out = computeWavify(points2, amplitude, wavelength, distanceOffset, PHYSICAL.WAVIFY_STEP_M, reflected);
  memo.wavifyCache.set(points2, { len: points2.length, amp: amplitude, wl: wavelength, off: distanceOffset, reflected, out });
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
function strokeFadedMoveRun(ctx2, layout, pts, startTime, endTime, currentTime, declutter, colorHex, lineWidth, tailEase = false) {
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
    const strokeT = startTime + (sliceIdx2 + 0.5) / SLICES * span;
    ctx2.globalAlpha = fadeAlpha(strokeT, currentTime, declutter) * (tailEase ? activeTailAlpha(strokeT, endTime) : 1);
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
    strokeFadedMoveRun(
      ctx2,
      layout,
      pts,
      run.startTime,
      run.endTime,
      currentTime,
      declutter,
      color,
      lineWidth,
      opts.tailEase
    );
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
        { lineWidth: CHROME.STROKE_ACTIVE_W_PX, color, distanceOffset: afterOffset, tailEase: true },
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
  if (!view2.linesHidden) {
    for (const token2 of resolved.tokens) {
      drawTokenPath(ctx2, layout, palette, memo, token2, t, declutter, resolved.balls, possessionSig);
    }
    drawBallTransfers(ctx2, layout, palette, resolved, t, declutter);
  }
  if (!view2.notesHidden) drawAnnotations(ctx2, layout, palette, resolved, t);
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
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateGet = (obj, member, getter) => {
  __accessCheck(obj, member, "read from private field");
  return getter ? getter.call(obj) : member.get(obj);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateSet = (obj, member, value, setter) => {
  __accessCheck(obj, member, "write to private field");
  member.set(obj, value);
  return value;
};
var __privateWrapper = (obj, member, setter, getter) => ({
  set _(value) {
    __privateSet(obj, member, value);
  },
  get _() {
    return __privateGet(obj, member, getter);
  }
});
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};
var bytes = new Uint8Array(8);
var view$1 = new DataView(bytes.buffer);
var u8 = (value) => {
  return [(value % 256 + 256) % 256];
};
var u16 = (value) => {
  view$1.setUint16(0, value, false);
  return [bytes[0], bytes[1]];
};
var i16 = (value) => {
  view$1.setInt16(0, value, false);
  return [bytes[0], bytes[1]];
};
var u24 = (value) => {
  view$1.setUint32(0, value, false);
  return [bytes[1], bytes[2], bytes[3]];
};
var u32 = (value) => {
  view$1.setUint32(0, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var i32 = (value) => {
  view$1.setInt32(0, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var u64 = (value) => {
  view$1.setUint32(0, Math.floor(value / 2 ** 32), false);
  view$1.setUint32(4, value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
};
var fixed_8_8 = (value) => {
  view$1.setInt16(0, 2 ** 8 * value, false);
  return [bytes[0], bytes[1]];
};
var fixed_16_16 = (value) => {
  view$1.setInt32(0, 2 ** 16 * value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var fixed_2_30 = (value) => {
  view$1.setInt32(0, 2 ** 30 * value, false);
  return [bytes[0], bytes[1], bytes[2], bytes[3]];
};
var ascii = (text, nullTerminated = false) => {
  let bytes2 = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
  if (nullTerminated)
    bytes2.push(0);
  return bytes2;
};
var last = (arr) => {
  return arr && arr[arr.length - 1];
};
var lastPresentedSample = (samples) => {
  let result = void 0;
  for (let sample of samples) {
    if (!result || sample.presentationTimestamp > result.presentationTimestamp) {
      result = sample;
    }
  }
  return result;
};
var intoTimescale = (timeInSeconds, timescale, round = true) => {
  let value = timeInSeconds * timescale;
  return round ? Math.round(value) : value;
};
var rotationMatrix = (rotationInDegrees) => {
  let theta = rotationInDegrees * (Math.PI / 180);
  let cosTheta = Math.cos(theta);
  let sinTheta = Math.sin(theta);
  return [
    cosTheta,
    sinTheta,
    0,
    -sinTheta,
    cosTheta,
    0,
    0,
    0,
    1
  ];
};
var IDENTITY_MATRIX = rotationMatrix(0);
var matrixToBytes = (matrix) => {
  return [
    fixed_16_16(matrix[0]),
    fixed_16_16(matrix[1]),
    fixed_2_30(matrix[2]),
    fixed_16_16(matrix[3]),
    fixed_16_16(matrix[4]),
    fixed_2_30(matrix[5]),
    fixed_16_16(matrix[6]),
    fixed_16_16(matrix[7]),
    fixed_2_30(matrix[8])
  ];
};
var deepClone = (x) => {
  if (!x)
    return x;
  if (typeof x !== "object")
    return x;
  if (Array.isArray(x))
    return x.map(deepClone);
  return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, deepClone(value)]));
};
var isU32 = (value) => {
  return value >= 0 && value < 2 ** 32;
};
var box = (type, contents, children) => ({
  type,
  contents: contents && new Uint8Array(contents.flat(10)),
  children
});
var fullBox = (type, version, flags, contents, children) => box(
  type,
  [u8(version), u24(flags), contents ?? []],
  children
);
var ftyp = (details) => {
  let minorVersion = 512;
  if (details.fragmented)
    return box("ftyp", [
      ascii("iso5"),
      // Major brand
      u32(minorVersion),
      // Minor version
      // Compatible brands
      ascii("iso5"),
      ascii("iso6"),
      ascii("mp41")
    ]);
  return box("ftyp", [
    ascii("isom"),
    // Major brand
    u32(minorVersion),
    // Minor version
    // Compatible brands
    ascii("isom"),
    details.holdsAvc ? ascii("avc1") : [],
    ascii("mp41")
  ]);
};
var mdat = (reserveLargeSize) => ({ type: "mdat", largeSize: reserveLargeSize });
var free = (size) => ({ type: "free", size });
var moov = (tracks, creationTime, fragmented = false) => box("moov", null, [
  mvhd(creationTime, tracks),
  ...tracks.map((x) => trak(x, creationTime)),
  fragmented ? mvex(tracks) : null
]);
var mvhd = (creationTime, tracks) => {
  let duration = intoTimescale(Math.max(
    0,
    ...tracks.filter((x) => x.samples.length > 0).map((x) => {
      const lastSample = lastPresentedSample(x.samples);
      return lastSample.presentationTimestamp + lastSample.duration;
    })
  ), GLOBAL_TIMESCALE);
  let nextTrackId = Math.max(...tracks.map((x) => x.id)) + 1;
  let needsU64 = !isU32(creationTime) || !isU32(duration);
  let u32OrU64 = needsU64 ? u64 : u32;
  return fullBox("mvhd", +needsU64, 0, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(GLOBAL_TIMESCALE),
    // Timescale
    u32OrU64(duration),
    // Duration
    fixed_16_16(1),
    // Preferred rate
    fixed_8_8(1),
    // Preferred volume
    Array(10).fill(0),
    // Reserved
    matrixToBytes(IDENTITY_MATRIX),
    // Matrix
    Array(24).fill(0),
    // Pre-defined
    u32(nextTrackId)
    // Next track ID
  ]);
};
var trak = (track, creationTime) => box("trak", null, [
  tkhd(track, creationTime),
  mdia(track, creationTime)
]);
var tkhd = (track, creationTime) => {
  let lastSample = lastPresentedSample(track.samples);
  let durationInGlobalTimescale = intoTimescale(
    lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
    GLOBAL_TIMESCALE
  );
  let needsU64 = !isU32(creationTime) || !isU32(durationInGlobalTimescale);
  let u32OrU64 = needsU64 ? u64 : u32;
  let matrix;
  if (track.info.type === "video") {
    matrix = typeof track.info.rotation === "number" ? rotationMatrix(track.info.rotation) : track.info.rotation;
  } else {
    matrix = IDENTITY_MATRIX;
  }
  return fullBox("tkhd", +needsU64, 3, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(track.id),
    // Track ID
    u32(0),
    // Reserved
    u32OrU64(durationInGlobalTimescale),
    // Duration
    Array(8).fill(0),
    // Reserved
    u16(0),
    // Layer
    u16(0),
    // Alternate group
    fixed_8_8(track.info.type === "audio" ? 1 : 0),
    // Volume
    u16(0),
    // Reserved
    matrixToBytes(matrix),
    // Matrix
    fixed_16_16(track.info.type === "video" ? track.info.width : 0),
    // Track width
    fixed_16_16(track.info.type === "video" ? track.info.height : 0)
    // Track height
  ]);
};
var mdia = (track, creationTime) => box("mdia", null, [
  mdhd(track, creationTime),
  hdlr(track.info.type === "video" ? "vide" : "soun"),
  minf(track)
]);
var mdhd = (track, creationTime) => {
  let lastSample = lastPresentedSample(track.samples);
  let localDuration = intoTimescale(
    lastSample ? lastSample.presentationTimestamp + lastSample.duration : 0,
    track.timescale
  );
  let needsU64 = !isU32(creationTime) || !isU32(localDuration);
  let u32OrU64 = needsU64 ? u64 : u32;
  return fullBox("mdhd", +needsU64, 0, [
    u32OrU64(creationTime),
    // Creation time
    u32OrU64(creationTime),
    // Modification time
    u32(track.timescale),
    // Timescale
    u32OrU64(localDuration),
    // Duration
    u16(21956),
    // Language ("und", undetermined)
    u16(0)
    // Quality
  ]);
};
var hdlr = (componentSubtype) => fullBox("hdlr", 0, 0, [
  ascii("mhlr"),
  // Component type
  ascii(componentSubtype),
  // Component subtype
  u32(0),
  // Component manufacturer
  u32(0),
  // Component flags
  u32(0),
  // Component flags mask
  ascii("mp4-muxer-hdlr", true)
  // Component name
]);
var minf = (track) => box("minf", null, [
  track.info.type === "video" ? vmhd() : smhd(),
  dinf(),
  stbl(track)
]);
var vmhd = () => fullBox("vmhd", 0, 1, [
  u16(0),
  // Graphics mode
  u16(0),
  // Opcolor R
  u16(0),
  // Opcolor G
  u16(0)
  // Opcolor B
]);
var smhd = () => fullBox("smhd", 0, 0, [
  u16(0),
  // Balance
  u16(0)
  // Reserved
]);
var dinf = () => box("dinf", null, [
  dref()
]);
var dref = () => fullBox("dref", 0, 0, [
  u32(1)
  // Entry count
], [
  url()
]);
var url = () => fullBox("url ", 0, 1);
var stbl = (track) => {
  const needsCtts = track.compositionTimeOffsetTable.length > 1 || track.compositionTimeOffsetTable.some((x) => x.sampleCompositionTimeOffset !== 0);
  return box("stbl", null, [
    stsd(track),
    stts(track),
    stss(track),
    stsc(track),
    stsz(track),
    stco(track),
    needsCtts ? ctts(track) : null
  ]);
};
var stsd = (track) => fullBox("stsd", 0, 0, [
  u32(1)
  // Entry count
], [
  track.info.type === "video" ? videoSampleDescription(
    VIDEO_CODEC_TO_BOX_NAME[track.info.codec],
    track
  ) : soundSampleDescription(
    AUDIO_CODEC_TO_BOX_NAME[track.info.codec],
    track
  )
]);
var videoSampleDescription = (compressionType, track) => box(compressionType, [
  Array(6).fill(0),
  // Reserved
  u16(1),
  // Data reference index
  u16(0),
  // Pre-defined
  u16(0),
  // Reserved
  Array(12).fill(0),
  // Pre-defined
  u16(track.info.width),
  // Width
  u16(track.info.height),
  // Height
  u32(4718592),
  // Horizontal resolution
  u32(4718592),
  // Vertical resolution
  u32(0),
  // Reserved
  u16(1),
  // Frame count
  Array(32).fill(0),
  // Compressor name
  u16(24),
  // Depth
  i16(65535)
  // Pre-defined
], [
  VIDEO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track),
  track.info.decoderConfig.colorSpace ? colr(track) : null
]);
var COLOR_PRIMARIES_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "bt470bg": 5,
  // ITU-R BT.470BG
  "smpte170m": 6
  // ITU-R BT.601 525 - SMPTE 170M
};
var TRANSFER_CHARACTERISTICS_MAP = {
  "bt709": 1,
  // ITU-R BT.709
  "smpte170m": 6,
  // SMPTE 170M
  "iec61966-2-1": 13
  // IEC 61966-2-1
};
var MATRIX_COEFFICIENTS_MAP = {
  "rgb": 0,
  // Identity
  "bt709": 1,
  // ITU-R BT.709
  "bt470bg": 5,
  // ITU-R BT.470BG
  "smpte170m": 6
  // SMPTE 170M
};
var colr = (track) => box("colr", [
  ascii("nclx"),
  // Colour type
  u16(COLOR_PRIMARIES_MAP[track.info.decoderConfig.colorSpace.primaries]),
  // Colour primaries
  u16(TRANSFER_CHARACTERISTICS_MAP[track.info.decoderConfig.colorSpace.transfer]),
  // Transfer characteristics
  u16(MATRIX_COEFFICIENTS_MAP[track.info.decoderConfig.colorSpace.matrix]),
  // Matrix coefficients
  u8((track.info.decoderConfig.colorSpace.fullRange ? 1 : 0) << 7)
  // Full range flag
]);
var avcC = (track) => track.info.decoderConfig && box("avcC", [
  // For AVC, description is an AVCDecoderConfigurationRecord, so nothing else to do here
  ...new Uint8Array(track.info.decoderConfig.description)
]);
var hvcC = (track) => track.info.decoderConfig && box("hvcC", [
  // For HEVC, description is a HEVCDecoderConfigurationRecord, so nothing else to do here
  ...new Uint8Array(track.info.decoderConfig.description)
]);
var vpcC = (track) => {
  if (!track.info.decoderConfig) {
    return null;
  }
  let decoderConfig = track.info.decoderConfig;
  if (!decoderConfig.colorSpace) {
    throw new Error(`'colorSpace' is required in the decoder config for VP9.`);
  }
  let parts = decoderConfig.codec.split(".");
  let profile = Number(parts[1]);
  let level = Number(parts[2]);
  let bitDepth = Number(parts[3]);
  let chromaSubsampling = 0;
  let thirdByte = (bitDepth << 4) + (chromaSubsampling << 1) + Number(decoderConfig.colorSpace.fullRange);
  let colourPrimaries = 2;
  let transferCharacteristics = 2;
  let matrixCoefficients = 2;
  return fullBox("vpcC", 1, 0, [
    u8(profile),
    // Profile
    u8(level),
    // Level
    u8(thirdByte),
    // Bit depth, chroma subsampling, full range
    u8(colourPrimaries),
    // Colour primaries
    u8(transferCharacteristics),
    // Transfer characteristics
    u8(matrixCoefficients),
    // Matrix coefficients
    u16(0)
    // Codec initialization data size
  ]);
};
var av1C = () => {
  let marker = 1;
  let version = 1;
  let firstByte = (marker << 7) + version;
  return box("av1C", [
    firstByte,
    0,
    0,
    0
  ]);
};
var soundSampleDescription = (compressionType, track) => box(compressionType, [
  Array(6).fill(0),
  // Reserved
  u16(1),
  // Data reference index
  u16(0),
  // Version
  u16(0),
  // Revision level
  u32(0),
  // Vendor
  u16(track.info.numberOfChannels),
  // Number of channels
  u16(16),
  // Sample size (bits)
  u16(0),
  // Compression ID
  u16(0),
  // Packet size
  fixed_16_16(track.info.sampleRate)
  // Sample rate
], [
  AUDIO_CODEC_TO_CONFIGURATION_BOX[track.info.codec](track)
]);
var esds = (track) => {
  let description = new Uint8Array(track.info.decoderConfig.description);
  return fullBox("esds", 0, 0, [
    // https://stackoverflow.com/a/54803118
    u32(58753152),
    // TAG(3) = Object Descriptor ([2])
    u8(32 + description.byteLength),
    // length of this OD (which includes the next 2 tags)
    u16(1),
    // ES_ID = 1
    u8(0),
    // flags etc = 0
    u32(75530368),
    // TAG(4) = ES Descriptor ([2]) embedded in above OD
    u8(18 + description.byteLength),
    // length of this ESD
    u8(64),
    // MPEG-4 Audio
    u8(21),
    // stream type(6bits)=5 audio, flags(2bits)=1
    u24(0),
    // 24bit buffer size
    u32(130071),
    // max bitrate
    u32(130071),
    // avg bitrate
    u32(92307584),
    // TAG(5) = ASC ([2],[3]) embedded in above OD
    u8(description.byteLength),
    // length
    ...description,
    u32(109084800),
    // TAG(6)
    u8(1),
    // length
    u8(2)
    // data
  ]);
};
var dOps = (track) => {
  let preskip = 3840;
  let gain = 0;
  const description = track.info.decoderConfig?.description;
  if (description) {
    if (description.byteLength < 18) {
      throw new TypeError("Invalid decoder description provided for Opus; must be at least 18 bytes long.");
    }
    const view2 = ArrayBuffer.isView(description) ? new DataView(description.buffer, description.byteOffset, description.byteLength) : new DataView(description);
    preskip = view2.getUint16(10, true);
    gain = view2.getInt16(14, true);
  }
  return box("dOps", [
    u8(0),
    // Version
    u8(track.info.numberOfChannels),
    // OutputChannelCount
    u16(preskip),
    u32(track.info.sampleRate),
    // InputSampleRate
    fixed_8_8(gain),
    // OutputGain
    u8(0)
    // ChannelMappingFamily
  ]);
};
var stts = (track) => {
  return fullBox("stts", 0, 0, [
    u32(track.timeToSampleTable.length),
    // Number of entries
    track.timeToSampleTable.map((x) => [
      // Time-to-sample table
      u32(x.sampleCount),
      // Sample count
      u32(x.sampleDelta)
      // Sample duration
    ])
  ]);
};
var stss = (track) => {
  if (track.samples.every((x) => x.type === "key"))
    return null;
  let keySamples = [...track.samples.entries()].filter(([, sample]) => sample.type === "key");
  return fullBox("stss", 0, 0, [
    u32(keySamples.length),
    // Number of entries
    keySamples.map(([index]) => u32(index + 1))
    // Sync sample table
  ]);
};
var stsc = (track) => {
  return fullBox("stsc", 0, 0, [
    u32(track.compactlyCodedChunkTable.length),
    // Number of entries
    track.compactlyCodedChunkTable.map((x) => [
      // Sample-to-chunk table
      u32(x.firstChunk),
      // First chunk
      u32(x.samplesPerChunk),
      // Samples per chunk
      u32(1)
      // Sample description index
    ])
  ]);
};
var stsz = (track) => fullBox("stsz", 0, 0, [
  u32(0),
  // Sample size (0 means non-constant size)
  u32(track.samples.length),
  // Number of entries
  track.samples.map((x) => u32(x.size))
  // Sample size table
]);
var stco = (track) => {
  if (track.finalizedChunks.length > 0 && last(track.finalizedChunks).offset >= 2 ** 32) {
    return fullBox("co64", 0, 0, [
      u32(track.finalizedChunks.length),
      // Number of entries
      track.finalizedChunks.map((x) => u64(x.offset))
      // Chunk offset table
    ]);
  }
  return fullBox("stco", 0, 0, [
    u32(track.finalizedChunks.length),
    // Number of entries
    track.finalizedChunks.map((x) => u32(x.offset))
    // Chunk offset table
  ]);
};
var ctts = (track) => {
  return fullBox("ctts", 0, 0, [
    u32(track.compositionTimeOffsetTable.length),
    // Number of entries
    track.compositionTimeOffsetTable.map((x) => [
      // Time-to-sample table
      u32(x.sampleCount),
      // Sample count
      u32(x.sampleCompositionTimeOffset)
      // Sample offset
    ])
  ]);
};
var mvex = (tracks) => {
  return box("mvex", null, tracks.map(trex));
};
var trex = (track) => {
  return fullBox("trex", 0, 0, [
    u32(track.id),
    // Track ID
    u32(1),
    // Default sample description index
    u32(0),
    // Default sample duration
    u32(0),
    // Default sample size
    u32(0)
    // Default sample flags
  ]);
};
var moof = (sequenceNumber, tracks) => {
  return box("moof", null, [
    mfhd(sequenceNumber),
    ...tracks.map(traf)
  ]);
};
var mfhd = (sequenceNumber) => {
  return fullBox("mfhd", 0, 0, [
    u32(sequenceNumber)
    // Sequence number
  ]);
};
var fragmentSampleFlags = (sample) => {
  let byte1 = 0;
  let byte2 = 0;
  let byte3 = 0;
  let byte4 = 0;
  let sampleIsDifferenceSample = sample.type === "delta";
  byte2 |= +sampleIsDifferenceSample;
  if (sampleIsDifferenceSample) {
    byte1 |= 1;
  } else {
    byte1 |= 2;
  }
  return byte1 << 24 | byte2 << 16 | byte3 << 8 | byte4;
};
var traf = (track) => {
  return box("traf", null, [
    tfhd(track),
    tfdt(track),
    trun(track)
  ]);
};
var tfhd = (track) => {
  let tfFlags = 0;
  tfFlags |= 8;
  tfFlags |= 16;
  tfFlags |= 32;
  tfFlags |= 131072;
  let referenceSample = track.currentChunk.samples[1] ?? track.currentChunk.samples[0];
  let referenceSampleInfo = {
    duration: referenceSample.timescaleUnitsToNextSample,
    size: referenceSample.size,
    flags: fragmentSampleFlags(referenceSample)
  };
  return fullBox("tfhd", 0, tfFlags, [
    u32(track.id),
    // Track ID
    u32(referenceSampleInfo.duration),
    // Default sample duration
    u32(referenceSampleInfo.size),
    // Default sample size
    u32(referenceSampleInfo.flags)
    // Default sample flags
  ]);
};
var tfdt = (track) => {
  return fullBox("tfdt", 1, 0, [
    u64(intoTimescale(track.currentChunk.startTimestamp, track.timescale))
    // Base Media Decode Time
  ]);
};
var trun = (track) => {
  let allSampleDurations = track.currentChunk.samples.map((x) => x.timescaleUnitsToNextSample);
  let allSampleSizes = track.currentChunk.samples.map((x) => x.size);
  let allSampleFlags = track.currentChunk.samples.map(fragmentSampleFlags);
  let allSampleCompositionTimeOffsets = track.currentChunk.samples.map((x) => intoTimescale(x.presentationTimestamp - x.decodeTimestamp, track.timescale));
  let uniqueSampleDurations = new Set(allSampleDurations);
  let uniqueSampleSizes = new Set(allSampleSizes);
  let uniqueSampleFlags = new Set(allSampleFlags);
  let uniqueSampleCompositionTimeOffsets = new Set(allSampleCompositionTimeOffsets);
  let firstSampleFlagsPresent = uniqueSampleFlags.size === 2 && allSampleFlags[0] !== allSampleFlags[1];
  let sampleDurationPresent = uniqueSampleDurations.size > 1;
  let sampleSizePresent = uniqueSampleSizes.size > 1;
  let sampleFlagsPresent = !firstSampleFlagsPresent && uniqueSampleFlags.size > 1;
  let sampleCompositionTimeOffsetsPresent = uniqueSampleCompositionTimeOffsets.size > 1 || [...uniqueSampleCompositionTimeOffsets].some((x) => x !== 0);
  let flags = 0;
  flags |= 1;
  flags |= 4 * +firstSampleFlagsPresent;
  flags |= 256 * +sampleDurationPresent;
  flags |= 512 * +sampleSizePresent;
  flags |= 1024 * +sampleFlagsPresent;
  flags |= 2048 * +sampleCompositionTimeOffsetsPresent;
  return fullBox("trun", 1, flags, [
    u32(track.currentChunk.samples.length),
    // Sample count
    u32(track.currentChunk.offset - track.currentChunk.moofOffset || 0),
    // Data offset
    firstSampleFlagsPresent ? u32(allSampleFlags[0]) : [],
    track.currentChunk.samples.map((_, i) => [
      sampleDurationPresent ? u32(allSampleDurations[i]) : [],
      // Sample duration
      sampleSizePresent ? u32(allSampleSizes[i]) : [],
      // Sample size
      sampleFlagsPresent ? u32(allSampleFlags[i]) : [],
      // Sample flags
      // Sample composition time offsets
      sampleCompositionTimeOffsetsPresent ? i32(allSampleCompositionTimeOffsets[i]) : []
    ])
  ]);
};
var mfra = (tracks) => {
  return box("mfra", null, [
    ...tracks.map(tfra),
    mfro()
  ]);
};
var tfra = (track, trackIndex) => {
  let version = 1;
  return fullBox("tfra", version, 0, [
    u32(track.id),
    // Track ID
    u32(63),
    // This specifies that traf number, trun number and sample number are 32-bit ints
    u32(track.finalizedChunks.length),
    // Number of entries
    track.finalizedChunks.map((chunk) => [
      u64(intoTimescale(chunk.startTimestamp, track.timescale)),
      // Time
      u64(chunk.moofOffset),
      // moof offset
      u32(trackIndex + 1),
      // traf number
      u32(1),
      // trun number
      u32(1)
      // Sample number
    ])
  ]);
};
var mfro = () => {
  return fullBox("mfro", 0, 0, [
    // This value needs to be overwritten manually from the outside, where the actual size of the enclosing mfra box
    // is known
    u32(0)
    // Size
  ]);
};
var VIDEO_CODEC_TO_BOX_NAME = {
  "avc": "avc1",
  "hevc": "hvc1",
  "vp9": "vp09",
  "av1": "av01"
};
var VIDEO_CODEC_TO_CONFIGURATION_BOX = {
  "avc": avcC,
  "hevc": hvcC,
  "vp9": vpcC,
  "av1": av1C
};
var AUDIO_CODEC_TO_BOX_NAME = {
  "aac": "mp4a",
  "opus": "Opus"
};
var AUDIO_CODEC_TO_CONFIGURATION_BOX = {
  "aac": esds,
  "opus": dOps
};
var Target = class {
};
var ArrayBufferTarget = class extends Target {
  constructor() {
    super(...arguments);
    this.buffer = null;
  }
};
var StreamTarget = class extends Target {
  constructor(options) {
    super();
    this.options = options;
    if (typeof options !== "object") {
      throw new TypeError("StreamTarget requires an options object to be passed to its constructor.");
    }
    if (options.onData) {
      if (typeof options.onData !== "function") {
        throw new TypeError("options.onData, when provided, must be a function.");
      }
      if (options.onData.length < 2) {
        throw new TypeError(
          "options.onData, when provided, must be a function that takes in at least two arguments (data and position). Ignoring the position argument, which specifies the byte offset at which the data is to be written, can lead to broken outputs."
        );
      }
    }
    if (options.chunked !== void 0 && typeof options.chunked !== "boolean") {
      throw new TypeError("options.chunked, when provided, must be a boolean.");
    }
    if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize < 1024)) {
      throw new TypeError("options.chunkSize, when provided, must be an integer and not smaller than 1024.");
    }
  }
};
var FileSystemWritableFileStreamTarget = class extends Target {
  constructor(stream, options) {
    super();
    this.stream = stream;
    this.options = options;
    if (!(stream instanceof FileSystemWritableFileStream)) {
      throw new TypeError("FileSystemWritableFileStreamTarget requires a FileSystemWritableFileStream instance.");
    }
    if (options !== void 0 && typeof options !== "object") {
      throw new TypeError("FileSystemWritableFileStreamTarget's options, when provided, must be an object.");
    }
    if (options) {
      if (options.chunkSize !== void 0 && (!Number.isInteger(options.chunkSize) || options.chunkSize <= 0)) {
        throw new TypeError("options.chunkSize, when provided, must be a positive integer");
      }
    }
  }
};
var _helper, _helperView;
var Writer = class {
  constructor() {
    this.pos = 0;
    __privateAdd(this, _helper, new Uint8Array(8));
    __privateAdd(this, _helperView, new DataView(__privateGet(this, _helper).buffer));
    this.offsets = /* @__PURE__ */ new WeakMap();
  }
  /** Sets the current position for future writes to a new one. */
  seek(newPos) {
    this.pos = newPos;
  }
  writeU32(value) {
    __privateGet(this, _helperView).setUint32(0, value, false);
    this.write(__privateGet(this, _helper).subarray(0, 4));
  }
  writeU64(value) {
    __privateGet(this, _helperView).setUint32(0, Math.floor(value / 2 ** 32), false);
    __privateGet(this, _helperView).setUint32(4, value, false);
    this.write(__privateGet(this, _helper).subarray(0, 8));
  }
  writeAscii(text) {
    for (let i = 0; i < text.length; i++) {
      __privateGet(this, _helperView).setUint8(i % 8, text.charCodeAt(i));
      if (i % 8 === 7)
        this.write(__privateGet(this, _helper));
    }
    if (text.length % 8 !== 0) {
      this.write(__privateGet(this, _helper).subarray(0, text.length % 8));
    }
  }
  writeBox(box2) {
    this.offsets.set(box2, this.pos);
    if (box2.contents && !box2.children) {
      this.writeBoxHeader(box2, box2.size ?? box2.contents.byteLength + 8);
      this.write(box2.contents);
    } else {
      let startPos = this.pos;
      this.writeBoxHeader(box2, 0);
      if (box2.contents)
        this.write(box2.contents);
      if (box2.children) {
        for (let child of box2.children)
          if (child)
            this.writeBox(child);
      }
      let endPos = this.pos;
      let size = box2.size ?? endPos - startPos;
      this.seek(startPos);
      this.writeBoxHeader(box2, size);
      this.seek(endPos);
    }
  }
  writeBoxHeader(box2, size) {
    this.writeU32(box2.largeSize ? 1 : size);
    this.writeAscii(box2.type);
    if (box2.largeSize)
      this.writeU64(size);
  }
  measureBoxHeader(box2) {
    return 8 + (box2.largeSize ? 8 : 0);
  }
  patchBox(box2) {
    let endPos = this.pos;
    this.seek(this.offsets.get(box2));
    this.writeBox(box2);
    this.seek(endPos);
  }
  measureBox(box2) {
    if (box2.contents && !box2.children) {
      let headerSize = this.measureBoxHeader(box2);
      return headerSize + box2.contents.byteLength;
    } else {
      let result = this.measureBoxHeader(box2);
      if (box2.contents)
        result += box2.contents.byteLength;
      if (box2.children) {
        for (let child of box2.children)
          if (child)
            result += this.measureBox(child);
      }
      return result;
    }
  }
};
_helper = /* @__PURE__ */ new WeakMap();
_helperView = /* @__PURE__ */ new WeakMap();
var _target, _buffer, _bytes, _maxPos, _ensureSize, ensureSize_fn;
var ArrayBufferTargetWriter = class extends Writer {
  constructor(target) {
    super();
    __privateAdd(this, _ensureSize);
    __privateAdd(this, _target, void 0);
    __privateAdd(this, _buffer, new ArrayBuffer(2 ** 16));
    __privateAdd(this, _bytes, new Uint8Array(__privateGet(this, _buffer)));
    __privateAdd(this, _maxPos, 0);
    __privateSet(this, _target, target);
  }
  write(data) {
    __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos + data.byteLength);
    __privateGet(this, _bytes).set(data, this.pos);
    this.pos += data.byteLength;
    __privateSet(this, _maxPos, Math.max(__privateGet(this, _maxPos), this.pos));
  }
  finalize() {
    __privateMethod(this, _ensureSize, ensureSize_fn).call(this, this.pos);
    __privateGet(this, _target).buffer = __privateGet(this, _buffer).slice(0, Math.max(__privateGet(this, _maxPos), this.pos));
  }
};
_target = /* @__PURE__ */ new WeakMap();
_buffer = /* @__PURE__ */ new WeakMap();
_bytes = /* @__PURE__ */ new WeakMap();
_maxPos = /* @__PURE__ */ new WeakMap();
_ensureSize = /* @__PURE__ */ new WeakSet();
ensureSize_fn = function(size) {
  let newLength = __privateGet(this, _buffer).byteLength;
  while (newLength < size)
    newLength *= 2;
  if (newLength === __privateGet(this, _buffer).byteLength)
    return;
  let newBuffer = new ArrayBuffer(newLength);
  let newBytes = new Uint8Array(newBuffer);
  newBytes.set(__privateGet(this, _bytes), 0);
  __privateSet(this, _buffer, newBuffer);
  __privateSet(this, _bytes, newBytes);
};
var DEFAULT_CHUNK_SIZE = 2 ** 24;
var MAX_CHUNKS_AT_ONCE = 2;
var _target2, _sections, _chunked, _chunkSize, _chunks, _writeDataIntoChunks, writeDataIntoChunks_fn, _insertSectionIntoChunk, insertSectionIntoChunk_fn, _createChunk, createChunk_fn, _flushChunks, flushChunks_fn;
var StreamTargetWriter = class extends Writer {
  constructor(target) {
    super();
    __privateAdd(this, _writeDataIntoChunks);
    __privateAdd(this, _insertSectionIntoChunk);
    __privateAdd(this, _createChunk);
    __privateAdd(this, _flushChunks);
    __privateAdd(this, _target2, void 0);
    __privateAdd(this, _sections, []);
    __privateAdd(this, _chunked, void 0);
    __privateAdd(this, _chunkSize, void 0);
    __privateAdd(this, _chunks, []);
    __privateSet(this, _target2, target);
    __privateSet(this, _chunked, target.options?.chunked ?? false);
    __privateSet(this, _chunkSize, target.options?.chunkSize ?? DEFAULT_CHUNK_SIZE);
  }
  write(data) {
    __privateGet(this, _sections).push({
      data: data.slice(),
      start: this.pos
    });
    this.pos += data.byteLength;
  }
  flush() {
    if (__privateGet(this, _sections).length === 0)
      return;
    let chunks = [];
    let sorted = [...__privateGet(this, _sections)].sort((a, b) => a.start - b.start);
    chunks.push({
      start: sorted[0].start,
      size: sorted[0].data.byteLength
    });
    for (let i = 1; i < sorted.length; i++) {
      let lastChunk = chunks[chunks.length - 1];
      let section = sorted[i];
      if (section.start <= lastChunk.start + lastChunk.size) {
        lastChunk.size = Math.max(lastChunk.size, section.start + section.data.byteLength - lastChunk.start);
      } else {
        chunks.push({
          start: section.start,
          size: section.data.byteLength
        });
      }
    }
    for (let chunk of chunks) {
      chunk.data = new Uint8Array(chunk.size);
      for (let section of __privateGet(this, _sections)) {
        if (chunk.start <= section.start && section.start < chunk.start + chunk.size) {
          chunk.data.set(section.data, section.start - chunk.start);
        }
      }
      if (__privateGet(this, _chunked)) {
        __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, chunk.data, chunk.start);
        __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
      } else {
        __privateGet(this, _target2).options.onData?.(chunk.data, chunk.start);
      }
    }
    __privateGet(this, _sections).length = 0;
  }
  finalize() {
    if (__privateGet(this, _chunked)) {
      __privateMethod(this, _flushChunks, flushChunks_fn).call(this, true);
    }
  }
};
_target2 = /* @__PURE__ */ new WeakMap();
_sections = /* @__PURE__ */ new WeakMap();
_chunked = /* @__PURE__ */ new WeakMap();
_chunkSize = /* @__PURE__ */ new WeakMap();
_chunks = /* @__PURE__ */ new WeakMap();
_writeDataIntoChunks = /* @__PURE__ */ new WeakSet();
writeDataIntoChunks_fn = function(data, position) {
  let chunkIndex = __privateGet(this, _chunks).findIndex((x) => x.start <= position && position < x.start + __privateGet(this, _chunkSize));
  if (chunkIndex === -1)
    chunkIndex = __privateMethod(this, _createChunk, createChunk_fn).call(this, position);
  let chunk = __privateGet(this, _chunks)[chunkIndex];
  let relativePosition = position - chunk.start;
  let toWrite = data.subarray(0, Math.min(__privateGet(this, _chunkSize) - relativePosition, data.byteLength));
  chunk.data.set(toWrite, relativePosition);
  let section = {
    start: relativePosition,
    end: relativePosition + toWrite.byteLength
  };
  __privateMethod(this, _insertSectionIntoChunk, insertSectionIntoChunk_fn).call(this, chunk, section);
  if (chunk.written[0].start === 0 && chunk.written[0].end === __privateGet(this, _chunkSize)) {
    chunk.shouldFlush = true;
  }
  if (__privateGet(this, _chunks).length > MAX_CHUNKS_AT_ONCE) {
    for (let i = 0; i < __privateGet(this, _chunks).length - 1; i++) {
      __privateGet(this, _chunks)[i].shouldFlush = true;
    }
    __privateMethod(this, _flushChunks, flushChunks_fn).call(this);
  }
  if (toWrite.byteLength < data.byteLength) {
    __privateMethod(this, _writeDataIntoChunks, writeDataIntoChunks_fn).call(this, data.subarray(toWrite.byteLength), position + toWrite.byteLength);
  }
};
_insertSectionIntoChunk = /* @__PURE__ */ new WeakSet();
insertSectionIntoChunk_fn = function(chunk, section) {
  let low = 0;
  let high = chunk.written.length - 1;
  let index = -1;
  while (low <= high) {
    let mid = Math.floor(low + (high - low + 1) / 2);
    if (chunk.written[mid].start <= section.start) {
      low = mid + 1;
      index = mid;
    } else {
      high = mid - 1;
    }
  }
  chunk.written.splice(index + 1, 0, section);
  if (index === -1 || chunk.written[index].end < section.start)
    index++;
  while (index < chunk.written.length - 1 && chunk.written[index].end >= chunk.written[index + 1].start) {
    chunk.written[index].end = Math.max(chunk.written[index].end, chunk.written[index + 1].end);
    chunk.written.splice(index + 1, 1);
  }
};
_createChunk = /* @__PURE__ */ new WeakSet();
createChunk_fn = function(includesPosition) {
  let start = Math.floor(includesPosition / __privateGet(this, _chunkSize)) * __privateGet(this, _chunkSize);
  let chunk = {
    start,
    data: new Uint8Array(__privateGet(this, _chunkSize)),
    written: [],
    shouldFlush: false
  };
  __privateGet(this, _chunks).push(chunk);
  __privateGet(this, _chunks).sort((a, b) => a.start - b.start);
  return __privateGet(this, _chunks).indexOf(chunk);
};
_flushChunks = /* @__PURE__ */ new WeakSet();
flushChunks_fn = function(force = false) {
  for (let i = 0; i < __privateGet(this, _chunks).length; i++) {
    let chunk = __privateGet(this, _chunks)[i];
    if (!chunk.shouldFlush && !force)
      continue;
    for (let section of chunk.written) {
      __privateGet(this, _target2).options.onData?.(
        chunk.data.subarray(section.start, section.end),
        chunk.start + section.start
      );
    }
    __privateGet(this, _chunks).splice(i--, 1);
  }
};
var FileSystemWritableFileStreamTargetWriter = class extends StreamTargetWriter {
  constructor(target) {
    super(new StreamTarget({
      onData: (data, position) => target.stream.write({
        type: "write",
        data,
        position
      }),
      chunked: true,
      chunkSize: target.options?.chunkSize
    }));
  }
};
var GLOBAL_TIMESCALE = 1e3;
var SUPPORTED_VIDEO_CODECS = ["avc", "hevc", "vp9", "av1"];
var SUPPORTED_AUDIO_CODECS = ["aac", "opus"];
var TIMESTAMP_OFFSET = 2082844800;
var FIRST_TIMESTAMP_BEHAVIORS = ["strict", "offset", "cross-track-offset"];
var _options, _writer, _ftypSize, _mdat, _videoTrack, _audioTrack, _creationTime, _finalizedChunks, _nextFragmentNumber, _videoSampleQueue, _audioSampleQueue, _finalized, _validateOptions, validateOptions_fn, _writeHeader, writeHeader_fn, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn, _prepareTracks, prepareTracks_fn, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn, _createSampleForTrack, createSampleForTrack_fn, _addSampleToTrack, addSampleToTrack_fn, _validateTimestamp, validateTimestamp_fn, _finalizeCurrentChunk, finalizeCurrentChunk_fn, _finalizeFragment, finalizeFragment_fn, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn, _ensureNotFinalized, ensureNotFinalized_fn;
var Muxer = class {
  constructor(options) {
    __privateAdd(this, _validateOptions);
    __privateAdd(this, _writeHeader);
    __privateAdd(this, _computeMoovSizeUpperBound);
    __privateAdd(this, _prepareTracks);
    __privateAdd(this, _generateMpeg4AudioSpecificConfig);
    __privateAdd(this, _createSampleForTrack);
    __privateAdd(this, _addSampleToTrack);
    __privateAdd(this, _validateTimestamp);
    __privateAdd(this, _finalizeCurrentChunk);
    __privateAdd(this, _finalizeFragment);
    __privateAdd(this, _maybeFlushStreamingTargetWriter);
    __privateAdd(this, _ensureNotFinalized);
    __privateAdd(this, _options, void 0);
    __privateAdd(this, _writer, void 0);
    __privateAdd(this, _ftypSize, void 0);
    __privateAdd(this, _mdat, void 0);
    __privateAdd(this, _videoTrack, null);
    __privateAdd(this, _audioTrack, null);
    __privateAdd(this, _creationTime, Math.floor(Date.now() / 1e3) + TIMESTAMP_OFFSET);
    __privateAdd(this, _finalizedChunks, []);
    __privateAdd(this, _nextFragmentNumber, 1);
    __privateAdd(this, _videoSampleQueue, []);
    __privateAdd(this, _audioSampleQueue, []);
    __privateAdd(this, _finalized, false);
    __privateMethod(this, _validateOptions, validateOptions_fn).call(this, options);
    options.video = deepClone(options.video);
    options.audio = deepClone(options.audio);
    options.fastStart = deepClone(options.fastStart);
    this.target = options.target;
    __privateSet(this, _options, {
      firstTimestampBehavior: "strict",
      ...options
    });
    if (options.target instanceof ArrayBufferTarget) {
      __privateSet(this, _writer, new ArrayBufferTargetWriter(options.target));
    } else if (options.target instanceof StreamTarget) {
      __privateSet(this, _writer, new StreamTargetWriter(options.target));
    } else if (options.target instanceof FileSystemWritableFileStreamTarget) {
      __privateSet(this, _writer, new FileSystemWritableFileStreamTargetWriter(options.target));
    } else {
      throw new Error(`Invalid target: ${options.target}`);
    }
    __privateMethod(this, _prepareTracks, prepareTracks_fn).call(this);
    __privateMethod(this, _writeHeader, writeHeader_fn).call(this);
  }
  addVideoChunk(sample, meta, timestamp, compositionTimeOffset) {
    if (!(sample instanceof EncodedVideoChunk)) {
      throw new TypeError("addVideoChunk's first argument (sample) must be of type EncodedVideoChunk.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addVideoChunk's second argument (meta), when provided, must be an object.");
    }
    if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
      throw new TypeError(
        "addVideoChunk's third argument (timestamp), when provided, must be a non-negative real number."
      );
    }
    if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
      throw new TypeError(
        "addVideoChunk's fourth argument (compositionTimeOffset), when provided, must be a real number."
      );
    }
    let data = new Uint8Array(sample.byteLength);
    sample.copyTo(data);
    this.addVideoChunkRaw(
      data,
      sample.type,
      timestamp ?? sample.timestamp,
      sample.duration,
      meta,
      compositionTimeOffset
    );
  }
  addVideoChunkRaw(data, type, timestamp, duration, meta, compositionTimeOffset) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("addVideoChunkRaw's first argument (data) must be an instance of Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError("addVideoChunkRaw's second argument (type) must be either 'key' or 'delta'.");
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("addVideoChunkRaw's third argument (timestamp) must be a non-negative real number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("addVideoChunkRaw's fourth argument (duration) must be a non-negative real number.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addVideoChunkRaw's fifth argument (meta), when provided, must be an object.");
    }
    if (compositionTimeOffset !== void 0 && !Number.isFinite(compositionTimeOffset)) {
      throw new TypeError(
        "addVideoChunkRaw's sixth argument (compositionTimeOffset), when provided, must be a real number."
      );
    }
    __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
    if (!__privateGet(this, _options).video)
      throw new Error("No video track declared.");
    if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _videoTrack).samples.length === __privateGet(this, _options).fastStart.expectedVideoChunks) {
      throw new Error(`Cannot add more video chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedVideoChunks}).`);
    }
    let videoSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _videoTrack), data, type, timestamp, duration, meta, compositionTimeOffset);
    if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _audioTrack)) {
      while (__privateGet(this, _audioSampleQueue).length > 0 && __privateGet(this, _audioSampleQueue)[0].decodeTimestamp <= videoSample.decodeTimestamp) {
        let audioSample = __privateGet(this, _audioSampleQueue).shift();
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      }
      if (videoSample.decodeTimestamp <= __privateGet(this, _audioTrack).lastDecodeTimestamp) {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      } else {
        __privateGet(this, _videoSampleQueue).push(videoSample);
      }
    } else {
      __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
    }
  }
  addAudioChunk(sample, meta, timestamp) {
    if (!(sample instanceof EncodedAudioChunk)) {
      throw new TypeError("addAudioChunk's first argument (sample) must be of type EncodedAudioChunk.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addAudioChunk's second argument (meta), when provided, must be an object.");
    }
    if (timestamp !== void 0 && (!Number.isFinite(timestamp) || timestamp < 0)) {
      throw new TypeError(
        "addAudioChunk's third argument (timestamp), when provided, must be a non-negative real number."
      );
    }
    let data = new Uint8Array(sample.byteLength);
    sample.copyTo(data);
    this.addAudioChunkRaw(data, sample.type, timestamp ?? sample.timestamp, sample.duration, meta);
  }
  addAudioChunkRaw(data, type, timestamp, duration, meta) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("addAudioChunkRaw's first argument (data) must be an instance of Uint8Array.");
    }
    if (type !== "key" && type !== "delta") {
      throw new TypeError("addAudioChunkRaw's second argument (type) must be either 'key' or 'delta'.");
    }
    if (!Number.isFinite(timestamp) || timestamp < 0) {
      throw new TypeError("addAudioChunkRaw's third argument (timestamp) must be a non-negative real number.");
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("addAudioChunkRaw's fourth argument (duration) must be a non-negative real number.");
    }
    if (meta && typeof meta !== "object") {
      throw new TypeError("addAudioChunkRaw's fifth argument (meta), when provided, must be an object.");
    }
    __privateMethod(this, _ensureNotFinalized, ensureNotFinalized_fn).call(this);
    if (!__privateGet(this, _options).audio)
      throw new Error("No audio track declared.");
    if (typeof __privateGet(this, _options).fastStart === "object" && __privateGet(this, _audioTrack).samples.length === __privateGet(this, _options).fastStart.expectedAudioChunks) {
      throw new Error(`Cannot add more audio chunks than specified in 'fastStart' (${__privateGet(this, _options).fastStart.expectedAudioChunks}).`);
    }
    let audioSample = __privateMethod(this, _createSampleForTrack, createSampleForTrack_fn).call(this, __privateGet(this, _audioTrack), data, type, timestamp, duration, meta);
    if (__privateGet(this, _options).fastStart === "fragmented" && __privateGet(this, _videoTrack)) {
      while (__privateGet(this, _videoSampleQueue).length > 0 && __privateGet(this, _videoSampleQueue)[0].decodeTimestamp <= audioSample.decodeTimestamp) {
        let videoSample = __privateGet(this, _videoSampleQueue).shift();
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      }
      if (audioSample.decodeTimestamp <= __privateGet(this, _videoTrack).lastDecodeTimestamp) {
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      } else {
        __privateGet(this, _audioSampleQueue).push(audioSample);
      }
    } else {
      __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
    }
  }
  /** Finalizes the file, making it ready for use. Must be called after all video and audio chunks have been added. */
  finalize() {
    if (__privateGet(this, _finalized)) {
      throw new Error("Cannot finalize a muxer more than once.");
    }
    if (__privateGet(this, _options).fastStart === "fragmented") {
      for (let videoSample of __privateGet(this, _videoSampleQueue))
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _videoTrack), videoSample);
      for (let audioSample of __privateGet(this, _audioSampleQueue))
        __privateMethod(this, _addSampleToTrack, addSampleToTrack_fn).call(this, __privateGet(this, _audioTrack), audioSample);
      __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this, false);
    } else {
      if (__privateGet(this, _videoTrack))
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _videoTrack));
      if (__privateGet(this, _audioTrack))
        __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, __privateGet(this, _audioTrack));
    }
    let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter(Boolean);
    if (__privateGet(this, _options).fastStart === "in-memory") {
      let mdatSize;
      for (let i = 0; i < 2; i++) {
        let movieBox2 = moov(tracks, __privateGet(this, _creationTime));
        let movieBoxSize = __privateGet(this, _writer).measureBox(movieBox2);
        mdatSize = __privateGet(this, _writer).measureBox(__privateGet(this, _mdat));
        let currentChunkPos = __privateGet(this, _writer).pos + movieBoxSize + mdatSize;
        for (let chunk of __privateGet(this, _finalizedChunks)) {
          chunk.offset = currentChunkPos;
          for (let { data } of chunk.samples) {
            currentChunkPos += data.byteLength;
            mdatSize += data.byteLength;
          }
        }
        if (currentChunkPos < 2 ** 32)
          break;
        if (mdatSize >= 2 ** 32)
          __privateGet(this, _mdat).largeSize = true;
      }
      let movieBox = moov(tracks, __privateGet(this, _creationTime));
      __privateGet(this, _writer).writeBox(movieBox);
      __privateGet(this, _mdat).size = mdatSize;
      __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
      for (let chunk of __privateGet(this, _finalizedChunks)) {
        for (let sample of chunk.samples) {
          __privateGet(this, _writer).write(sample.data);
          sample.data = null;
        }
      }
    } else if (__privateGet(this, _options).fastStart === "fragmented") {
      let startPos = __privateGet(this, _writer).pos;
      let mfraBox = mfra(tracks);
      __privateGet(this, _writer).writeBox(mfraBox);
      let mfraBoxSize = __privateGet(this, _writer).pos - startPos;
      __privateGet(this, _writer).seek(__privateGet(this, _writer).pos - 4);
      __privateGet(this, _writer).writeU32(mfraBoxSize);
    } else {
      let mdatPos = __privateGet(this, _writer).offsets.get(__privateGet(this, _mdat));
      let mdatSize = __privateGet(this, _writer).pos - mdatPos;
      __privateGet(this, _mdat).size = mdatSize;
      __privateGet(this, _mdat).largeSize = mdatSize >= 2 ** 32;
      __privateGet(this, _writer).patchBox(__privateGet(this, _mdat));
      let movieBox = moov(tracks, __privateGet(this, _creationTime));
      if (typeof __privateGet(this, _options).fastStart === "object") {
        __privateGet(this, _writer).seek(__privateGet(this, _ftypSize));
        __privateGet(this, _writer).writeBox(movieBox);
        let remainingBytes = mdatPos - __privateGet(this, _writer).pos;
        __privateGet(this, _writer).writeBox(free(remainingBytes));
      } else {
        __privateGet(this, _writer).writeBox(movieBox);
      }
    }
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
    __privateGet(this, _writer).finalize();
    __privateSet(this, _finalized, true);
  }
};
_options = /* @__PURE__ */ new WeakMap();
_writer = /* @__PURE__ */ new WeakMap();
_ftypSize = /* @__PURE__ */ new WeakMap();
_mdat = /* @__PURE__ */ new WeakMap();
_videoTrack = /* @__PURE__ */ new WeakMap();
_audioTrack = /* @__PURE__ */ new WeakMap();
_creationTime = /* @__PURE__ */ new WeakMap();
_finalizedChunks = /* @__PURE__ */ new WeakMap();
_nextFragmentNumber = /* @__PURE__ */ new WeakMap();
_videoSampleQueue = /* @__PURE__ */ new WeakMap();
_audioSampleQueue = /* @__PURE__ */ new WeakMap();
_finalized = /* @__PURE__ */ new WeakMap();
_validateOptions = /* @__PURE__ */ new WeakSet();
validateOptions_fn = function(options) {
  if (typeof options !== "object") {
    throw new TypeError("The muxer requires an options object to be passed to its constructor.");
  }
  if (!(options.target instanceof Target)) {
    throw new TypeError("The target must be provided and an instance of Target.");
  }
  if (options.video) {
    if (!SUPPORTED_VIDEO_CODECS.includes(options.video.codec)) {
      throw new TypeError(`Unsupported video codec: ${options.video.codec}`);
    }
    if (!Number.isInteger(options.video.width) || options.video.width <= 0) {
      throw new TypeError(`Invalid video width: ${options.video.width}. Must be a positive integer.`);
    }
    if (!Number.isInteger(options.video.height) || options.video.height <= 0) {
      throw new TypeError(`Invalid video height: ${options.video.height}. Must be a positive integer.`);
    }
    const videoRotation = options.video.rotation;
    if (typeof videoRotation === "number" && ![0, 90, 180, 270].includes(videoRotation)) {
      throw new TypeError(`Invalid video rotation: ${videoRotation}. Has to be 0, 90, 180 or 270.`);
    } else if (Array.isArray(videoRotation) && (videoRotation.length !== 9 || videoRotation.some((value) => typeof value !== "number"))) {
      throw new TypeError(`Invalid video transformation matrix: ${videoRotation.join()}`);
    }
    if (options.video.frameRate !== void 0 && (!Number.isInteger(options.video.frameRate) || options.video.frameRate <= 0)) {
      throw new TypeError(
        `Invalid video frame rate: ${options.video.frameRate}. Must be a positive integer.`
      );
    }
  }
  if (options.audio) {
    if (!SUPPORTED_AUDIO_CODECS.includes(options.audio.codec)) {
      throw new TypeError(`Unsupported audio codec: ${options.audio.codec}`);
    }
    if (!Number.isInteger(options.audio.numberOfChannels) || options.audio.numberOfChannels <= 0) {
      throw new TypeError(
        `Invalid number of audio channels: ${options.audio.numberOfChannels}. Must be a positive integer.`
      );
    }
    if (!Number.isInteger(options.audio.sampleRate) || options.audio.sampleRate <= 0) {
      throw new TypeError(
        `Invalid audio sample rate: ${options.audio.sampleRate}. Must be a positive integer.`
      );
    }
  }
  if (options.firstTimestampBehavior && !FIRST_TIMESTAMP_BEHAVIORS.includes(options.firstTimestampBehavior)) {
    throw new TypeError(`Invalid first timestamp behavior: ${options.firstTimestampBehavior}`);
  }
  if (typeof options.fastStart === "object") {
    if (options.video) {
      if (options.fastStart.expectedVideoChunks === void 0) {
        throw new TypeError(`'fastStart' is an object but is missing property 'expectedVideoChunks'.`);
      } else if (!Number.isInteger(options.fastStart.expectedVideoChunks) || options.fastStart.expectedVideoChunks < 0) {
        throw new TypeError(`'expectedVideoChunks' must be a non-negative integer.`);
      }
    }
    if (options.audio) {
      if (options.fastStart.expectedAudioChunks === void 0) {
        throw new TypeError(`'fastStart' is an object but is missing property 'expectedAudioChunks'.`);
      } else if (!Number.isInteger(options.fastStart.expectedAudioChunks) || options.fastStart.expectedAudioChunks < 0) {
        throw new TypeError(`'expectedAudioChunks' must be a non-negative integer.`);
      }
    }
  } else if (![false, "in-memory", "fragmented"].includes(options.fastStart)) {
    throw new TypeError(`'fastStart' option must be false, 'in-memory', 'fragmented' or an object.`);
  }
  if (options.minFragmentDuration !== void 0 && (!Number.isFinite(options.minFragmentDuration) || options.minFragmentDuration < 0)) {
    throw new TypeError(`'minFragmentDuration' must be a non-negative number.`);
  }
};
_writeHeader = /* @__PURE__ */ new WeakSet();
writeHeader_fn = function() {
  __privateGet(this, _writer).writeBox(ftyp({
    holdsAvc: __privateGet(this, _options).video?.codec === "avc",
    fragmented: __privateGet(this, _options).fastStart === "fragmented"
  }));
  __privateSet(this, _ftypSize, __privateGet(this, _writer).pos);
  if (__privateGet(this, _options).fastStart === "in-memory") {
    __privateSet(this, _mdat, mdat(false));
  } else if (__privateGet(this, _options).fastStart === "fragmented") ;
  else {
    if (typeof __privateGet(this, _options).fastStart === "object") {
      let moovSizeUpperBound = __privateMethod(this, _computeMoovSizeUpperBound, computeMoovSizeUpperBound_fn).call(this);
      __privateGet(this, _writer).seek(__privateGet(this, _writer).pos + moovSizeUpperBound);
    }
    __privateSet(this, _mdat, mdat(true));
    __privateGet(this, _writer).writeBox(__privateGet(this, _mdat));
  }
  __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
};
_computeMoovSizeUpperBound = /* @__PURE__ */ new WeakSet();
computeMoovSizeUpperBound_fn = function() {
  if (typeof __privateGet(this, _options).fastStart !== "object")
    return;
  let upperBound = 0;
  let sampleCounts = [
    __privateGet(this, _options).fastStart.expectedVideoChunks,
    __privateGet(this, _options).fastStart.expectedAudioChunks
  ];
  for (let n of sampleCounts) {
    if (!n)
      continue;
    upperBound += (4 + 4) * Math.ceil(2 / 3 * n);
    upperBound += 4 * n;
    upperBound += (4 + 4 + 4) * Math.ceil(2 / 3 * n);
    upperBound += 4 * n;
    upperBound += 8 * n;
  }
  upperBound += 4096;
  return upperBound;
};
_prepareTracks = /* @__PURE__ */ new WeakSet();
prepareTracks_fn = function() {
  if (__privateGet(this, _options).video) {
    __privateSet(this, _videoTrack, {
      id: 1,
      info: {
        type: "video",
        codec: __privateGet(this, _options).video.codec,
        width: __privateGet(this, _options).video.width,
        height: __privateGet(this, _options).video.height,
        rotation: __privateGet(this, _options).video.rotation ?? 0,
        decoderConfig: null
      },
      // The fallback contains many common frame rates as factors
      timescale: __privateGet(this, _options).video.frameRate ?? 57600,
      samples: [],
      finalizedChunks: [],
      currentChunk: null,
      firstDecodeTimestamp: void 0,
      lastDecodeTimestamp: -1,
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      compactlyCodedChunkTable: []
    });
  }
  if (__privateGet(this, _options).audio) {
    __privateSet(this, _audioTrack, {
      id: __privateGet(this, _options).video ? 2 : 1,
      info: {
        type: "audio",
        codec: __privateGet(this, _options).audio.codec,
        numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
        sampleRate: __privateGet(this, _options).audio.sampleRate,
        decoderConfig: null
      },
      timescale: __privateGet(this, _options).audio.sampleRate,
      samples: [],
      finalizedChunks: [],
      currentChunk: null,
      firstDecodeTimestamp: void 0,
      lastDecodeTimestamp: -1,
      timeToSampleTable: [],
      compositionTimeOffsetTable: [],
      lastTimescaleUnits: null,
      lastSample: null,
      compactlyCodedChunkTable: []
    });
    if (__privateGet(this, _options).audio.codec === "aac") {
      let guessedCodecPrivate = __privateMethod(this, _generateMpeg4AudioSpecificConfig, generateMpeg4AudioSpecificConfig_fn).call(
        this,
        2,
        // Object type for AAC-LC, since it's the most common
        __privateGet(this, _options).audio.sampleRate,
        __privateGet(this, _options).audio.numberOfChannels
      );
      __privateGet(this, _audioTrack).info.decoderConfig = {
        codec: __privateGet(this, _options).audio.codec,
        description: guessedCodecPrivate,
        numberOfChannels: __privateGet(this, _options).audio.numberOfChannels,
        sampleRate: __privateGet(this, _options).audio.sampleRate
      };
    }
  }
};
_generateMpeg4AudioSpecificConfig = /* @__PURE__ */ new WeakSet();
generateMpeg4AudioSpecificConfig_fn = function(objectType, sampleRate, numberOfChannels) {
  let frequencyIndices = [96e3, 88200, 64e3, 48e3, 44100, 32e3, 24e3, 22050, 16e3, 12e3, 11025, 8e3, 7350];
  let frequencyIndex = frequencyIndices.indexOf(sampleRate);
  let channelConfig = numberOfChannels;
  let configBits = "";
  configBits += objectType.toString(2).padStart(5, "0");
  configBits += frequencyIndex.toString(2).padStart(4, "0");
  if (frequencyIndex === 15)
    configBits += sampleRate.toString(2).padStart(24, "0");
  configBits += channelConfig.toString(2).padStart(4, "0");
  let paddingLength = Math.ceil(configBits.length / 8) * 8;
  configBits = configBits.padEnd(paddingLength, "0");
  let configBytes = new Uint8Array(configBits.length / 8);
  for (let i = 0; i < configBits.length; i += 8) {
    configBytes[i / 8] = parseInt(configBits.slice(i, i + 8), 2);
  }
  return configBytes;
};
_createSampleForTrack = /* @__PURE__ */ new WeakSet();
createSampleForTrack_fn = function(track, data, type, timestamp, duration, meta, compositionTimeOffset) {
  let presentationTimestampInSeconds = timestamp / 1e6;
  let decodeTimestampInSeconds = (timestamp - (compositionTimeOffset ?? 0)) / 1e6;
  let durationInSeconds = duration / 1e6;
  let adjusted = __privateMethod(this, _validateTimestamp, validateTimestamp_fn).call(this, presentationTimestampInSeconds, decodeTimestampInSeconds, track);
  presentationTimestampInSeconds = adjusted.presentationTimestamp;
  decodeTimestampInSeconds = adjusted.decodeTimestamp;
  if (meta?.decoderConfig) {
    if (track.info.decoderConfig === null) {
      track.info.decoderConfig = meta.decoderConfig;
    } else {
      Object.assign(track.info.decoderConfig, meta.decoderConfig);
    }
  }
  let sample = {
    presentationTimestamp: presentationTimestampInSeconds,
    decodeTimestamp: decodeTimestampInSeconds,
    duration: durationInSeconds,
    data,
    size: data.byteLength,
    type,
    // Will be refined once the next sample comes in
    timescaleUnitsToNextSample: intoTimescale(durationInSeconds, track.timescale)
  };
  return sample;
};
_addSampleToTrack = /* @__PURE__ */ new WeakSet();
addSampleToTrack_fn = function(track, sample) {
  if (__privateGet(this, _options).fastStart !== "fragmented") {
    track.samples.push(sample);
  }
  const sampleCompositionTimeOffset = intoTimescale(sample.presentationTimestamp - sample.decodeTimestamp, track.timescale);
  if (track.lastTimescaleUnits !== null) {
    let timescaleUnits = intoTimescale(sample.decodeTimestamp, track.timescale, false);
    let delta = Math.round(timescaleUnits - track.lastTimescaleUnits);
    track.lastTimescaleUnits += delta;
    track.lastSample.timescaleUnitsToNextSample = delta;
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      let lastTableEntry = last(track.timeToSampleTable);
      if (lastTableEntry.sampleCount === 1) {
        lastTableEntry.sampleDelta = delta;
        lastTableEntry.sampleCount++;
      } else if (lastTableEntry.sampleDelta === delta) {
        lastTableEntry.sampleCount++;
      } else {
        lastTableEntry.sampleCount--;
        track.timeToSampleTable.push({
          sampleCount: 2,
          sampleDelta: delta
        });
      }
      const lastCompositionTimeOffsetTableEntry = last(track.compositionTimeOffsetTable);
      if (lastCompositionTimeOffsetTableEntry.sampleCompositionTimeOffset === sampleCompositionTimeOffset) {
        lastCompositionTimeOffsetTableEntry.sampleCount++;
      } else {
        track.compositionTimeOffsetTable.push({
          sampleCount: 1,
          sampleCompositionTimeOffset
        });
      }
    }
  } else {
    track.lastTimescaleUnits = 0;
    if (__privateGet(this, _options).fastStart !== "fragmented") {
      track.timeToSampleTable.push({
        sampleCount: 1,
        sampleDelta: intoTimescale(sample.duration, track.timescale)
      });
      track.compositionTimeOffsetTable.push({
        sampleCount: 1,
        sampleCompositionTimeOffset
      });
    }
  }
  track.lastSample = sample;
  let beginNewChunk = false;
  if (!track.currentChunk) {
    beginNewChunk = true;
  } else {
    let currentChunkDuration = sample.presentationTimestamp - track.currentChunk.startTimestamp;
    if (__privateGet(this, _options).fastStart === "fragmented") {
      let mostImportantTrack = __privateGet(this, _videoTrack) ?? __privateGet(this, _audioTrack);
      const chunkDuration = __privateGet(this, _options).minFragmentDuration ?? 1;
      if (track === mostImportantTrack && sample.type === "key" && currentChunkDuration >= chunkDuration) {
        beginNewChunk = true;
        __privateMethod(this, _finalizeFragment, finalizeFragment_fn).call(this);
      }
    } else {
      beginNewChunk = currentChunkDuration >= 0.5;
    }
  }
  if (beginNewChunk) {
    if (track.currentChunk) {
      __privateMethod(this, _finalizeCurrentChunk, finalizeCurrentChunk_fn).call(this, track);
    }
    track.currentChunk = {
      startTimestamp: sample.presentationTimestamp,
      samples: []
    };
  }
  track.currentChunk.samples.push(sample);
};
_validateTimestamp = /* @__PURE__ */ new WeakSet();
validateTimestamp_fn = function(presentationTimestamp, decodeTimestamp, track) {
  const strictTimestampBehavior = __privateGet(this, _options).firstTimestampBehavior === "strict";
  const noLastDecodeTimestamp = track.lastDecodeTimestamp === -1;
  const timestampNonZero = decodeTimestamp !== 0;
  if (strictTimestampBehavior && noLastDecodeTimestamp && timestampNonZero) {
    throw new Error(
      `The first chunk for your media track must have a timestamp of 0 (received DTS=${decodeTimestamp}).Non-zero first timestamps are often caused by directly piping frames or audio data from a MediaStreamTrack into the encoder. Their timestamps are typically relative to the age of thedocument, which is probably what you want.

If you want to offset all timestamps of a track such that the first one is zero, set firstTimestampBehavior: 'offset' in the options.
`
    );
  } else if (__privateGet(this, _options).firstTimestampBehavior === "offset" || __privateGet(this, _options).firstTimestampBehavior === "cross-track-offset") {
    if (track.firstDecodeTimestamp === void 0) {
      track.firstDecodeTimestamp = decodeTimestamp;
    }
    let baseDecodeTimestamp;
    if (__privateGet(this, _options).firstTimestampBehavior === "offset") {
      baseDecodeTimestamp = track.firstDecodeTimestamp;
    } else {
      baseDecodeTimestamp = Math.min(
        __privateGet(this, _videoTrack)?.firstDecodeTimestamp ?? Infinity,
        __privateGet(this, _audioTrack)?.firstDecodeTimestamp ?? Infinity
      );
    }
    decodeTimestamp -= baseDecodeTimestamp;
    presentationTimestamp -= baseDecodeTimestamp;
  }
  if (decodeTimestamp < track.lastDecodeTimestamp) {
    throw new Error(
      `Timestamps must be monotonically increasing (DTS went from ${track.lastDecodeTimestamp * 1e6} to ${decodeTimestamp * 1e6}).`
    );
  }
  track.lastDecodeTimestamp = decodeTimestamp;
  return { presentationTimestamp, decodeTimestamp };
};
_finalizeCurrentChunk = /* @__PURE__ */ new WeakSet();
finalizeCurrentChunk_fn = function(track) {
  if (__privateGet(this, _options).fastStart === "fragmented") {
    throw new Error("Can't finalize individual chunks if 'fastStart' is set to 'fragmented'.");
  }
  if (!track.currentChunk)
    return;
  track.finalizedChunks.push(track.currentChunk);
  __privateGet(this, _finalizedChunks).push(track.currentChunk);
  if (track.compactlyCodedChunkTable.length === 0 || last(track.compactlyCodedChunkTable).samplesPerChunk !== track.currentChunk.samples.length) {
    track.compactlyCodedChunkTable.push({
      firstChunk: track.finalizedChunks.length,
      // 1-indexed
      samplesPerChunk: track.currentChunk.samples.length
    });
  }
  if (__privateGet(this, _options).fastStart === "in-memory") {
    track.currentChunk.offset = 0;
    return;
  }
  track.currentChunk.offset = __privateGet(this, _writer).pos;
  for (let sample of track.currentChunk.samples) {
    __privateGet(this, _writer).write(sample.data);
    sample.data = null;
  }
  __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
};
_finalizeFragment = /* @__PURE__ */ new WeakSet();
finalizeFragment_fn = function(flushStreamingWriter = true) {
  if (__privateGet(this, _options).fastStart !== "fragmented") {
    throw new Error("Can't finalize a fragment unless 'fastStart' is set to 'fragmented'.");
  }
  let tracks = [__privateGet(this, _videoTrack), __privateGet(this, _audioTrack)].filter((track) => track && track.currentChunk);
  if (tracks.length === 0)
    return;
  let fragmentNumber = __privateWrapper(this, _nextFragmentNumber)._++;
  if (fragmentNumber === 1) {
    let movieBox = moov(tracks, __privateGet(this, _creationTime), true);
    __privateGet(this, _writer).writeBox(movieBox);
  }
  let moofOffset = __privateGet(this, _writer).pos;
  let moofBox = moof(fragmentNumber, tracks);
  __privateGet(this, _writer).writeBox(moofBox);
  {
    let mdatBox = mdat(false);
    let totalTrackSampleSize = 0;
    for (let track of tracks) {
      for (let sample of track.currentChunk.samples) {
        totalTrackSampleSize += sample.size;
      }
    }
    let mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
    if (mdatSize >= 2 ** 32) {
      mdatBox.largeSize = true;
      mdatSize = __privateGet(this, _writer).measureBox(mdatBox) + totalTrackSampleSize;
    }
    mdatBox.size = mdatSize;
    __privateGet(this, _writer).writeBox(mdatBox);
  }
  for (let track of tracks) {
    track.currentChunk.offset = __privateGet(this, _writer).pos;
    track.currentChunk.moofOffset = moofOffset;
    for (let sample of track.currentChunk.samples) {
      __privateGet(this, _writer).write(sample.data);
      sample.data = null;
    }
  }
  let endPos = __privateGet(this, _writer).pos;
  __privateGet(this, _writer).seek(__privateGet(this, _writer).offsets.get(moofBox));
  let newMoofBox = moof(fragmentNumber, tracks);
  __privateGet(this, _writer).writeBox(newMoofBox);
  __privateGet(this, _writer).seek(endPos);
  for (let track of tracks) {
    track.finalizedChunks.push(track.currentChunk);
    __privateGet(this, _finalizedChunks).push(track.currentChunk);
    track.currentChunk = null;
  }
  if (flushStreamingWriter) {
    __privateMethod(this, _maybeFlushStreamingTargetWriter, maybeFlushStreamingTargetWriter_fn).call(this);
  }
};
_maybeFlushStreamingTargetWriter = /* @__PURE__ */ new WeakSet();
maybeFlushStreamingTargetWriter_fn = function() {
  if (__privateGet(this, _writer) instanceof StreamTargetWriter) {
    __privateGet(this, _writer).flush();
  }
};
_ensureNotFinalized = /* @__PURE__ */ new WeakSet();
ensureNotFinalized_fn = function() {
  if (__privateGet(this, _finalized)) {
    throw new Error("Cannot add new video or audio chunks after the file has been finalized.");
  }
};
async function renderClip(ctx2, doc, frames, opts) {
  const { layout, palette, onFrame } = opts;
  const memo = opts.memo ?? createMemoScope();
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    ctx2.globalAlpha = 1;
    ctx2.fillStyle = palette.court;
    ctx2.fillRect(0, 0, layout.canvasW, layout.canvasH);
    renderFrame(ctx2, doc, frame.docTime, { layout, palette, view: frame.view, memo });
    await onFrame(frame, i);
  }
}
const EXPORT_LONG_EDGE_PX = 1440;
function exportLayout(mode, opts = {}) {
  const longEdgePx = opts.longEdgePx ?? EXPORT_LONG_EDGE_PX;
  const horizontal = mode === "full";
  const lengthM = courtLengthM(mode);
  const longM = horizontal ? lengthM : FIBA$1.WIDTH;
  const scale = Math.max(2, Math.round(longEdgePx / longM / 2) * 2);
  const canvasW = (horizontal ? lengthM : FIBA$1.WIDTH) * scale;
  const canvasH = (horizontal ? FIBA$1.WIDTH : lengthM) * scale;
  return {
    mode,
    horizontal,
    scale,
    canvasW,
    canvasH,
    box: { x: 0, y: 0, w: canvasW, h: canvasH }
  };
}
const EXPORT_FPS = 30;
const EXPORT_TAIL_HOLD_MS = 500;
function planFrames(traj, opts = {}) {
  const fps = opts.fps ?? EXPORT_FPS;
  if (!(fps > 0) || !Number.isFinite(fps)) throw new Error(`planFrames: fps must be positive, got ${fps}`);
  const first = traj[0];
  if (first === void 0) throw new Error("planFrames: cannot resample an empty trajectory");
  for (let i2 = 1; i2 < traj.length; i2++) {
    const prev = traj[i2 - 1].wallT, cur = traj[i2].wallT;
    if (cur < prev) {
      throw new Error(`planFrames: wallT must be monotonic (sample ${i2}: ${cur} < ${prev})`);
    }
  }
  const origin = first.wallT;
  const at = traj.map((s) => s.wallT - origin);
  const span = at[at.length - 1];
  const frameMs = 1e3 / fps;
  const count = Math.max(1, Math.ceil(span / frameMs));
  const frames = [];
  let i = 0;
  for (let n = 0; n < count; n++) {
    const wallT = n * frameMs;
    while (i + 1 < traj.length && at[i + 1] <= wallT) i++;
    const a = traj[i];
    const b = traj[i + 1];
    const docTime = b === void 0 ? a.docTime : a.docTime + (b.docTime - a.docTime) * ((wallT - at[i]) / (at[i + 1] - at[i]));
    const timestampUs = Math.round(n * 1e6 / fps);
    frames.push({
      timestampUs,
      durationUs: Math.round((n + 1) * 1e6 / fps) - timestampUs,
      docTime,
      view: a.view
    });
  }
  return frames;
}
function syntheticTrajectory(resolved, view2, opts = {}) {
  const hold = opts.tailHoldMs ?? EXPORT_TAIL_HOLD_MS;
  const end = contentEnd(resolved);
  const v = view2.arranging ? { ...view2, arranging: false } : view2;
  const traj = [{ wallT: 0, docTime: 0, view: v }];
  if (end > 0) traj.push({ wallT: end, docTime: end, view: v });
  if (hold > 0) traj.push({ wallT: end + hold, docTime: end, view: v });
  return traj;
}
const CODEC_PREFERENCE = [
  "avc1.640028",
  // High, level 4.0
  "avc1.4d0028",
  // Main, level 4.0
  "avc1.42e028",
  // Constrained Baseline, level 4.0
  "avc1.42001f"
  // Baseline, level 3.1 — small clips only
];
const BITS_PER_PIXEL = 0.08;
const KEYFRAME_INTERVAL_S = 2;
const keyFrameEvery = (fps) => Math.max(1, Math.round(fps * KEYFRAME_INTERVAL_S));
function bitrateFor(layout, fps) {
  const raw = layout.canvasW * layout.canvasH * fps * BITS_PER_PIXEL;
  return Math.max(1e6, Math.round(raw));
}
async function pickCodec(base, probe) {
  for (const codec of CODEC_PREFERENCE) {
    try {
      const support = await probe({ ...base, codec, avc: { format: "avc" } });
      if (support.supported) return codec;
    } catch {
    }
  }
  throw new Error(
    `No supported H.264 configuration for ${base.width}x${base.height} (tried ${CODEC_PREFERENCE.join(", ")})`
  );
}
function hasVideoExport() {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined" && typeof OffscreenCanvas !== "undefined";
}
const MAX_QUEUE = 8;
const YIELD_EVERY = 8;
const nextMacrotask = () => new Promise((resolve) => {
  setTimeout(resolve, 0);
});
async function exportPlayToMp4(doc, opts) {
  if (!hasVideoExport()) throw new Error("Video export needs WebCodecs, which this browser does not have");
  const fps = opts.fps ?? EXPORT_FPS;
  const resolved = resolveBranch(doc, opts.view.branchId ?? void 0);
  const frames = planFrames(
    syntheticTrajectory(resolved, opts.view, { tailHoldMs: opts.tailHoldMs ?? EXPORT_TAIL_HOLD_MS }),
    { fps }
  );
  const layout = opts.longEdgePx === void 0 ? exportLayout(doc.courtMode) : exportLayout(doc.courtMode, { longEdgePx: opts.longEdgePx });
  const canvas2 = new OffscreenCanvas(layout.canvasW, layout.canvasH);
  const offCtx = canvas2.getContext("2d", { alpha: false });
  if (offCtx === null) throw new Error("Could not get a 2D context for the export canvas");
  const ctx2 = offCtx;
  const base = {
    width: layout.canvasW,
    height: layout.canvasH,
    framerate: fps,
    bitrate: bitrateFor(layout, fps)
  };
  const codec = await pickCodec(base, (c) => VideoEncoder.isConfigSupported(c));
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: layout.canvasW, height: layout.canvasH, frameRate: fps },
    // The moov atom goes at the FRONT, so a player can start without first
    // seeking to the end of the file — which matters for anything streamed.
    fastStart: "in-memory"
  });
  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    }
  });
  encoder.configure({ ...base, codec, avc: { format: "avc" } });
  const keyEvery = keyFrameEvery(fps);
  try {
    await renderClip(ctx2, doc, frames, {
      layout,
      palette: opts.palette,
      onFrame: async (frame, i) => {
        if (encoderError !== null) throw encoderError;
        opts.signal?.throwIfAborted();
        const vf = new VideoFrame(canvas2, {
          timestamp: frame.timestampUs,
          duration: frame.durationUs
        });
        try {
          encoder.encode(vf, { keyFrame: i % keyEvery === 0 });
        } finally {
          vf.close();
        }
        opts.onProgress?.(i + 1, frames.length);
        while (encoder.encodeQueueSize > MAX_QUEUE) {
          if (encoderError !== null) throw encoderError;
          await nextMacrotask();
        }
        if (i % YIELD_EVERY === YIELD_EVERY - 1) await nextMacrotask();
      }
    });
    await encoder.flush();
    if (encoderError !== null) throw encoderError;
    muxer.finalize();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
const BUILD = "2026-09-12 00:34Z 3b5c1b4";
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
  declutterEnabled: false,
  // render-only: future lines past a short horizon don't draw, past lines fade fully out
  notesHidden: false,
  linesHidden: false
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
function stampToken(color, pt) {
  store.doc;
  store.commit(stampToken$1, { color, home: clampCourt(toCourt(pt)) });
  idSeq = Math.max(idSeq, store.doc.nextId);
  const added = store.doc.tokens[store.doc.tokens.length - 1];
  return added;
}
function removeToken(token2) {
  store.commit(removeToken$1, { tokenId: token2.id, currentTime: state.currentTime });
  state.currentTime = store.currentTime;
  toast("removed", getCssVar("--red"));
}
const removeTokenState = removeToken;
function removeCone(cone2) {
  store.commit(removeCone$1, { coneId: cone2.id });
  toast("removed", getCssVar("--red"));
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
    tokens: state.tokens.map((t) => ({ id: t.id, color: t.color, label: t.label, home: t.home })),
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
    const color = spec.color === "red" || spec.color === "blue" ? spec.color : spec.kind === "defense" ? "red" : "blue";
    return { id, color, label: spec.label, home: formationPoint(spec), segments: [], colorChanges: [] };
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
function flipColorAt(token2, t) {
  const next = colorAt(token2, t) === "blue" ? "red" : "blue";
  store.commit(flipColorAt$1, { tokenId: token2.id, t });
  toast("now " + next, getCssVar(next === "blue" ? "--blue" : "--red"));
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
    const newToken = stampToken("blue", pt);
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
    toast("prefix locked — remove fork to edit", getCssVar("--red"));
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
      if (drag.token.color === "blue") switchColor(drag.token);
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
        toast("already holding " + MAX_BALLS_PER_PLAYER, getCssVar("--red"));
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
      toast("removed", getCssVar("--red"));
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
      toast("removed", getCssVar("--red"));
      changed = true;
    }
    if (!changed) render();
    return;
  }
  finishStroke(e);
}
function switchColor(token2) {
  const newColor = token2.color === "blue" ? "red" : "blue";
  store.commit(setTokenColor, { tokenId: token2.id, color: newColor });
  toast("now " + newColor, getCssVar(newColor === "blue" ? "--blue" : "--red"));
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
        flipColorAt(s.token, state.currentTime);
      }
      return;
    }
    const hit = hitAnyStroke(tapPoint);
    if (hit) {
      if (hit.type !== "note" && state.forkAt != null && hit.seg.startT < state.forkAt) {
        toast("prefix locked — remove fork to edit", getCssVar("--red"));
        return;
      }
      store.commit(opCommitStroke, { outcome: { kind: "deleteStroke", hit }, currentTime: state.currentTime });
      state.currentTime = store.currentTime;
      toast("deleted", getCssVar("--red"));
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
      toast("no target", getCssVar("--red"));
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
    blue: getCssVar("--blue"),
    red: getCssVar("--red"),
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
      notesHidden: state.notesHidden,
      linesHidden: state.linesHidden,
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
    ctx.fillStyle = getCssVar(colorAt(token2, ghostT) === "blue" ? "--blue" : "--red");
    ctx.beginPath();
    ctx.arc(p.x, p.y, PHYSICAL.TOKEN_R_M * layout.scale, 0, Math.PI * 2);
    ctx.fill();
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
      color: t.color,
      label: t.label,
      home: { u: round2(t.home.u), v: round2(t.home.v) },
      colorChanges: t.colorChanges.map((rc) => ({ atMs: Math.round(rc.t), color: rc.color }))
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
    toast("shown below — select + copy", getCssVar("--red"));
  }
});
let exportAbort = null;
function setExportProgress(done, total) {
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById("exportFill").style.width = pct + "%";
  document.getElementById("exportPct").textContent = pct + "%";
}
function showExportOverlay(on) {
  document.getElementById("exportOverlay").classList.toggle("open", on);
  if (on) setExportProgress(0, 1);
}
function exportFilename() {
  const d = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `drillpal-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.mp4`;
}
function saveBlob(blob, filename) {
  const url2 = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url2;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url2), 6e4);
}
async function runExport() {
  if (exportAbort) return;
  const doc = store.doc;
  const resolved = resolveBranch(doc, void 0);
  if (contentEnd(resolved) <= 0) {
    toast("nothing to export yet", getCssVar("--red"));
    return;
  }
  exportAbort = new AbortController();
  showExportOverlay(true);
  try {
    const blob = await exportPlayToMp4(doc, {
      palette: currentPalette(),
      view: {
        numbersEnabled: state.numbersEnabled,
        declutterEnabled: state.declutterEnabled,
        notesHidden: state.notesHidden,
        linesHidden: state.linesHidden,
        // Forced off inside syntheticTrajectory too; passed honestly here so
        // this call site never becomes the place that decides it.
        arranging: state.arranging,
        branchId: null
      },
      onProgress: setExportProgress,
      signal: exportAbort.signal
    });
    saveBlob(blob, exportFilename());
    toast("video saved", getCssVar("--accent"));
  } catch (err) {
    if (exportAbort.signal.aborted) toast("export cancelled", getCssVar("--ink"));
    else {
      console.error("export failed", err);
      toast("export failed — see console", getCssVar("--red"));
    }
  } finally {
    exportAbort = null;
    showExportOverlay(false);
  }
}
document.getElementById("btnExportVideo").addEventListener("click", runExport);
document.getElementById("btnExportCancel").addEventListener("click", () => {
  exportAbort?.abort();
});
if (!hasVideoExport()) document.getElementById("btnExportVideo").remove();
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
document.getElementById("btnHideLines").addEventListener("click", () => {
  state.linesHidden = !state.linesHidden;
  document.getElementById("btnHideLines").setAttribute("aria-checked", String(state.linesHidden));
  render();
});
document.getElementById("btnHideNotes").addEventListener("click", () => {
  state.notesHidden = !state.notesHidden;
  document.getElementById("btnHideNotes").setAttribute("aria-checked", String(state.notesHidden));
  render();
});
document.getElementById("btnDeleteNotes").addEventListener("click", (e) => {
  e.stopPropagation();
  store.commit(clearNotes, { currentTime: state.currentTime });
  state.currentTime = store.currentTime;
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
      toast(`deleted ${kind} "${name}"`, getCssVar("--red"));
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
    toast("finish arranging first", getCssVar("--red"));
    return;
  }
  if (state.currentTime <= 0) {
    toast("scrub to a decision point first", getCssVar("--red"));
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
  toast(collapsing ? "fork collapsed" : `deleted branch ${branch.name}`, getCssVar("--red"));
});
document.getElementById("btnRemoveFork").addEventListener("click", () => {
  if (!confirm("Remove fork? All branches will be discarded.")) return;
  removeFork();
  refreshForkUI();
  toast("fork removed", getCssVar("--red"));
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
    setLayout(box2, horizontal) {
      court = { x: box2.x, y: box2.y, w: box2.w, h: box2.h };
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
    core: { deserialize, legacyBoxToLayout, resolveBranch, renderFrame, createMemoScope },
    // Slice 5a: the export path, reachable before it has any UI, so
    // src/parity/export.spec.ts can produce a REAL mp4 from the REAL built
    // bundle rather than from a harness that imports the core its own way.
    exportVideo: { exportPlayToMp4, hasVideoExport, exportLayout, currentPalette }
  };
}
new ResizeObserver(resize).observe(canvas);
resize();
document.getElementById("btnBlank").click();

// script.name=Realistic River Network
// script.description=Hydrology based river network: tributaries merge and all drain into the big lake, width grows downstream
// script.param.cellSize.type=integer
// script.param.cellSize.description=Hydrology grid cell size in blocks (6 good, use 8 for very large maps)
// script.param.cellSize.default=6
// script.param.maxHeads.type=integer
// script.param.maxHeads.description=Max number of river sources (more = denser network)
// script.param.maxHeads.default=12
// script.param.minCatchment.type=float
// script.param.minCatchment.description=Min catchment area (blocks squared) for a stream to exist
// script.param.minCatchment.default=150000
// script.param.minLakeArea.type=float
// script.param.minLakeArea.description=Water bodies smaller than this (blocks squared) are not river destinations
// script.param.minLakeArea.default=30000
// script.param.widthMin.type=float
// script.param.widthMin.description=Width of the smallest stream (blocks)
// script.param.widthMin.default=3
// script.param.widthMax.type=float
// script.param.widthMax.description=Max width of the biggest river (blocks)
// script.param.widthMax.default=26
// script.param.depthMin.type=float
// script.param.depthMin.default=2
// script.param.depthMax.type=float
// script.param.depthMax.default=5
// script.param.bank.type=float
// script.param.bank.description=Minimum bank slope width (blocks)
// script.param.bank.default=4
// script.param.meander.type=float
// script.param.meander.description=Meander strength (0 = straight, 1 = lots)
// script.param.meander.default=0.7
// script.param.maxCut.type=float
// script.param.maxCut.description=Max blocks the river bed may be cut below terrain to stay downhill
// script.param.maxCut.default=8
// script.param.edgeOutlet.type=boolean
// script.param.edgeOutlet.description=Terrain outside the lake basin drains off the map edge (recommended)
// script.param.edgeOutlet.default=true
// script.param.paintBanks.type=boolean
// script.param.paintBanks.description=Paint sand/gravel on the banks
// script.param.paintBanks.default=true
// script.param.seed.type=integer
// script.param.seed.default=1
// script.param.regionSize.type=integer
// script.param.regionSize.description=Only carve inside this square (0 = whole map). Hydrology always uses the whole map.
// script.param.regionSize.default=0
// script.param.regionCenterX.type=integer
// script.param.regionCenterX.default=0
// script.param.regionCenterY.type=integer
// script.param.regionCenterY.default=0

function p(name, def) {
    if (typeof params !== 'undefined' && params !== null) {
        var v = params[name];
        if (v !== undefined && v !== null && String(v) !== '') return v;
    }
    return def;
}

var cs          = Math.max(2, Math.round(Number(p('cellSize', 6))));
var maxHeads    = Math.round(Number(p('maxHeads', 12)));
var minCatch    = Number(p('minCatchment', 150000));
var minLakeArea = Number(p('minLakeArea', 30000));
var widthMin    = Number(p('widthMin', 3));
var widthMax    = Number(p('widthMax', 26));
var depthMin    = Number(p('depthMin', 2));
var depthMax    = Number(p('depthMax', 5));
var bankMin     = Number(p('bank', 4));
var meander     = Number(p('meander', 0.7));
var maxCut      = Number(p('maxCut', 8));
var edgeOutlet  = String(p('edgeOutlet', 'true')) === 'true';
var paintBanks  = String(p('paintBanks', 'true')) === 'true';
var seed        = Number(p('seed', 1));
var regionSize  = Number(p('regionSize', 0));
var regionCX    = Number(p('regionCenterX', 0));
var regionCY    = Number(p('regionCenterY', 0));
var cs2 = cs * cs;

// ---------- terrains ----------
var Terrain = Java.type('org.pepsoft.worldpainter.Terrain');
function resolve(label, names) {
    for (var i = 0; i < names.length; i++) {
        try { return Terrain.valueOf(names[i]); } catch (e) {}
    }
    throw new Error('Terrain not found for ' + label + ' (tried ' + names.join(', ') + ')');
}
var T = {
    GRAVEL: resolve('GRAVEL', ['GRAVEL']),
    SAND:   resolve('SAND', ['SAND']),
    CLAY:   resolve('CLAY', ['CLAY', 'GRAVEL']),
    COARSE: resolve('COARSE', ['COARSE_DIRT', 'PERMADIRT', 'DIRT']),
    STONE:  resolve('STONE', ['STONE']),
    COBBLE: resolve('COBBLE', ['COBBLESTONE', 'STONE'])
};

// ---------- helpers ----------
function hash(ix, iy, s) {
    var v = Math.sin(ix * 127.1 + iy * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
}
function vnoise(x, y, scale, s) {
    var fx = x / scale, fy = y / scale;
    var ix = Math.floor(fx), iy = Math.floor(fy);
    var tx = fx - ix, ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    var a = hash(ix, iy, s), b = hash(ix + 1, iy, s);
    var c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function pick(opts, r) {
    var tot = 0, i;
    for (i = 0; i < opts.length; i++) tot += opts[i][1];
    var t = r * tot, acc = 0;
    for (i = 0; i < opts.length; i++) {
        acc += opts[i][1];
        if (t < acc) return opts[i][0];
    }
    return opts[opts.length - 1][0];
}
function key(x, y) { return (x + 200000) * 400003 + (y + 200000); }
var FMIN = java.lang.Float.MIN_VALUE;
function hAt(x, y) {
    var h = dimension.getHeightAt(x, y);
    if (!(h > -1e6) || h === FMIN) return NaN;
    return h;
}

// ---------- grid ----------
var TILE = 128;
var tiles = dimension.getTiles().toArray();
var txmin = 1e9, txmax = -1e9, tymin = 1e9, tymax = -1e9;
for (var ti = 0; ti < tiles.length; ti++) {
    var tx = tiles[ti].getX(), ty = tiles[ti].getY();
    if (tx < txmin) txmin = tx; if (tx > txmax) txmax = tx;
    if (ty < tymin) tymin = ty; if (ty > tymax) tymax = ty;
}
var gx0 = txmin * TILE, gy0 = tymin * TILE;
var W = Math.ceil((txmax - txmin + 1) * TILE / cs);
var H = Math.ceil((tymax - tymin + 1) * TILE / cs);
var N = W * H;
print('Hydrology grid: ' + W + ' x ' + H + ' cells (' + cs + ' blocks per cell)');
if (N > 6000000) throw new Error('Grid too large (' + N + ' cells). Increase cellSize.');

var FA = Java.type('float[]'), IA = Java.type('int[]'), BA = Java.type('byte[]'), DA = Java.type('double[]');
var Tsm = new FA(N), wl = new FA(N), acc = new FA(N), S = new FA(N), Smin = new FA(N), outLvl = new FA(N);
var F = new DA(N);
var down = new IA(N), order = new IA(N), nin = new IA(N), comp = new IA(N);
var st = new BA(N), vis = new BA(N), lakeRaw = new BA(N), toLake = new BA(N);

var DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
var j, i, k, d, o, c;

print('Sampling terrain ...');
var qo = Math.max(1, Math.floor(cs / 3));
for (j = 0; j < H; j++) {
    if (java.lang.Thread.interrupted()) throw new Error('Interrupted');
    for (i = 0; i < W; i++) {
        k = j * W + i;
        down[k] = -1;
        acc[k] = 1;
        var cx = Math.floor(gx0 + (i + 0.5) * cs), cy = Math.floor(gy0 + (j + 0.5) * cs);
        var h0 = hAt(cx, cy);
        if (isNaN(h0)) { st[k] = 1; continue; }
        var sum = h0, cnt = 1, mn = h0;
        var hs = [hAt(cx + qo, cy), hAt(cx - qo, cy), hAt(cx, cy + qo), hAt(cx, cy - qo)];
        for (var z = 0; z < 4; z++) {
            if (!isNaN(hs[z])) { sum += hs[z]; cnt++; if (hs[z] < mn) mn = hs[z]; }
        }
        Tsm[k] = 0.5 * (sum / cnt) + 0.5 * mn;
        var w0 = dimension.getWaterLevelAt(cx, cy);
        if (w0 > h0) { lakeRaw[k] = 1; wl[k] = w0; }
    }
    if (j % 200 === 0) print('  row ' + j + ' / ' + H);
}

// ---------- lakes (water bodies big enough to be a destination) ----------
var stack = new IA(N);
var nc = 0, sinkLakes = 0;
for (k = 0; k < N; k++) {
    if (!lakeRaw[k] || comp[k] !== 0) continue;
    nc++;
    var sp = 0, members = 0;
    stack[sp++] = k; comp[k] = nc;
    var lst = [];
    while (sp > 0) {
        var cur = stack[--sp];
        members++;
        lst.push(cur);
        var cci = cur % W, ccj = (cur - cci) / W;
        for (var dd = 0; dd < 8; dd += 2) {
            var ni = cci + DX[dd], nj = ccj + DY[dd];
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
            var nk = nj * W + ni;
            if (lakeRaw[nk] && comp[nk] === 0) { comp[nk] = nc; stack[sp++] = nk; }
        }
    }
    if (members * cs2 >= minLakeArea) {
        sinkLakes++;
        for (var li = 0; li < lst.length; li++) st[lst[li]] = 2;
        print('Lake ' + sinkLakes + ': about ' + Math.round(members * cs2) + ' blocks2, level ' + Math.round(wl[k]));
    }
}
if (sinkLakes === 0) throw new Error('No water body larger than minLakeArea found. Lower minLakeArea.');

// ---------- priority flood (fills pits, routes everything to a sink) ----------
var hk = new DA(N + 2), hv = new IA(N + 2), hn = 0, popK = 0;
function hpush(kk, v) {
    var ii = ++hn;
    while (ii > 1) {
        var pa = ii >> 1;
        if (hk[pa] <= kk) break;
        hk[ii] = hk[pa]; hv[ii] = hv[pa]; ii = pa;
    }
    hk[ii] = kk; hv[ii] = v;
}
function hpop() {
    var v = hv[1]; popK = hk[1];
    var kk = hk[hn], vv = hv[hn]; hn--;
    if (hn > 0) {
        var ii = 1;
        while (true) {
            var cc = ii << 1;
            if (cc > hn) break;
            if (cc < hn && hk[cc + 1] < hk[cc]) cc++;
            if (hk[cc] >= kk) break;
            hk[ii] = hk[cc]; hv[ii] = hv[cc]; ii = cc;
        }
        hk[ii] = kk; hv[ii] = vv;
    }
    return v;
}

var edgeSeed = new BA(N);
for (j = 0; j < H; j++) {
    for (i = 0; i < W; i++) {
        k = j * W + i;
        if (st[k] === 1) continue;
        var shore = false;
        for (d = 0; d < 8; d++) {
            var ni2 = i + DX[d], nj2 = j + DY[d];
            if (ni2 < 0 || nj2 < 0 || ni2 >= W || nj2 >= H) { shore = true; break; }
            var s2 = st[nj2 * W + ni2];
            if (s2 !== 2 && st[k] === 2) { shore = true; break; }
            if (s2 === 1 && st[k] === 0) { shore = true; break; }
        }
        if (st[k] === 2) {
            vis[k] = 1;
            if (shore) { F[k] = wl[k]; hpush(wl[k], k); }
        } else if (edgeOutlet && shore) {
            vis[k] = 1; edgeSeed[k] = 1;
            F[k] = Tsm[k]; hpush(Tsm[k], k);
        }
    }
}
var EPS = 0.0005, oc = 0;
print('Routing water ...');
while (hn > 0) {
    c = hpop();
    var fc = popK;
    order[oc++] = c;
    var ci = c % W, cj = (c - ci) / W;
    for (d = 0; d < 8; d++) {
        var xi = ci + DX[d], xj = cj + DY[d];
        if (xi < 0 || xj < 0 || xi >= W || xj >= H) continue;
        var xk = xj * W + xi;
        if (vis[xk] || st[xk] === 1) continue;
        vis[xk] = 1;
        var fh = Tsm[xk], low = fc + EPS;
        F[xk] = fh > low ? fh : low;
        down[xk] = c;
        hpush(F[xk], xk);
    }
}

// flow accumulation: upstream cells first (reverse pop order)
for (o = oc - 1; o >= 0; o--) {
    c = order[o];
    if (st[c] === 2) continue;
    d = down[c];
    if (d >= 0) acc[d] += acc[c];
}
// where does each cell end up? (lake or map edge) and at which water level
for (o = 0; o < oc; o++) {
    c = order[o]; d = down[c];
    if (d < 0) {
        if (st[c] === 2) { toLake[c] = 1; outLvl[c] = wl[c]; }
        else { toLake[c] = 0; outLvl[c] = -1e9; }
    } else { toLake[c] = toLake[d]; outLvl[c] = outLvl[d]; }
}

// ---------- choose stream threshold ----------
var thr = minCatch;
function river(cell) {
    return st[cell] === 0 && vis[cell] === 1 && toLake[cell] === 1 && acc[cell] * cs2 >= thr;
}
function countHeads() {
    var z;
    for (z = 0; z < N; z++) nin[z] = 0;
    for (z = 0; z < N; z++) {
        if (river(z)) { var dz = down[z]; if (dz >= 0 && river(dz)) nin[dz]++; }
    }
    var h = 0;
    for (z = 0; z < N; z++) if (river(z) && nin[z] === 0) h++;
    return h;
}
var heads = countHeads(), guard = 0;
while (heads > maxHeads && guard < 40) { thr *= 1.3; heads = countHeads(); guard++; }
print('Stream threshold: ' + Math.round(thr) + ' blocks2 catchment | river sources: ' + heads);
if (heads === 0) throw new Error('No rivers found. Lower minCatchment or raise maxHeads.');

// ---------- river surface levels (never rising downstream) ----------
for (k = 0; k < N; k++) Smin[k] = 1e9;
for (o = oc - 1; o >= 0; o--) {
    c = order[o];
    if (!river(c)) continue;
    var base = Tsm[c] - 1;
    var s = base;
    if (Smin[c] < s) s = Smin[c];
    if (s < outLvl[c]) s = outLvl[c];
    if (s < base - maxCut) s = base - maxCut;
    S[c] = s;
    d = down[c];
    if (d >= 0 && Smin[d] > s) Smin[d] = s;
}

// ---------- paths: heads and confluences split the network into segments ----------
var paths = [];
for (c = 0; c < N; c++) {
    if (!river(c) || nin[c] === 1) continue;
    var pts = [c], cur2 = c;
    for (var g = 0; g < 100000; g++) {
        var dn = down[cur2];
        if (dn < 0) break;
        pts.push(dn);
        if (st[dn] === 2) break;
        if (!river(dn)) break;
        if (nin[dn] !== 1) break;
        cur2 = dn;
    }
    if (pts.length >= 2) paths.push(pts);
}
print('Segments to carve: ' + paths.length);

// ---------- region ----------
var rx1 = -1e9, rx2 = 1e9, ry1 = -1e9, ry2 = 1e9;
if (regionSize > 0) {
    rx1 = regionCX - regionSize / 2; rx2 = regionCX + regionSize / 2;
    ry1 = regionCY - regionSize / 2; ry2 = regionCY + regionSize / 2;
    print('Carving region: x ' + rx1 + '..' + rx2 + ', y ' + ry1 + '..' + ry2);
}

function widthOf(A) {
    var w = widthMin * Math.pow(Math.max(A, thr) / thr, 0.45);
    return Math.min(w, widthMax);
}

var KEYS = ['X', 'Y', 'S', 'R', 'D', 'T'];
function chaikin(A) {
    var n = A.X.length, O = {}, a, b, q, m;
    for (m = 0; m < KEYS.length; m++) O[KEYS[m]] = [A[KEYS[m]][0]];
    for (q = 0; q < n - 1; q++) {
        for (m = 0; m < KEYS.length; m++) {
            a = A[KEYS[m]][q]; b = A[KEYS[m]][q + 1];
            O[KEYS[m]].push(0.75 * a + 0.25 * b);
            O[KEYS[m]].push(0.25 * a + 0.75 * b);
        }
    }
    for (m = 0; m < KEYS.length; m++) O[KEYS[m]].push(A[KEYS[m]][n - 1]);
    return O;
}

var totalBlocks = 0, totalLen = 0, carved = 0;

function carvePath(pts, pi) {
    var n = pts.length, q, kk, cci, ccj;
    var X = [], Y = [], Sv = [], Rr = [], Gd = [];
    for (q = 0; q < n; q++) {
        kk = pts[q]; cci = kk % W; ccj = (kk - cci) / W;
        X.push(gx0 + (cci + 0.5) * cs);
        Y.push(gy0 + (ccj + 0.5) * cs);
        if (st[kk] === 2) { Sv.push(wl[kk]); Rr.push(Rr[q - 1] * 1.35); }
        else { Sv.push(S[kk]); Rr.push(0.5 * widthOf(acc[kk] * cs2)); }
    }
    var cum = [0];
    for (q = 0; q < n - 1; q++) {
        var sx = X[q + 1] - X[q], sy = Y[q + 1] - Y[q];
        var sl = Math.sqrt(sx * sx + sy * sy);
        Gd.push(Math.max(0, (Sv[q] - Sv[q + 1]) / Math.max(1, sl)));
        cum.push(cum[q] + sl);
    }
    Gd.push(Gd[n - 2]);

    // light smoothing of the staircase, then meander offsets (zero at both ends)
    var X2 = X.slice(0), Y2 = Y.slice(0);
    for (q = 1; q < n - 1; q++) {
        X2[q] = 0.25 * X[q - 1] + 0.5 * X[q] + 0.25 * X[q + 1];
        Y2[q] = 0.25 * Y[q - 1] + 0.5 * Y[q] + 0.25 * Y[q + 1];
    }
    var meanR = 0;
    for (q = 0; q < n; q++) meanR += Rr[q];
    meanR /= n;
    var wlen = 40 + 16 * meanR;
    var X3 = X2.slice(0), Y3 = Y2.slice(0);
    for (q = 1; q < n - 1; q++) {
        var tx = X2[q + 1] - X2[q - 1], ty = Y2[q + 1] - Y2[q - 1];
        var tl = Math.sqrt(tx * tx + ty * ty);
        if (tl < 0.001) continue;
        var nx = -ty / tl, ny = tx / tl;
        var nv = (vnoise(cum[q], pi * 31.7, wlen, seed + 300) - 0.5) * 2;
        var flat = 1 / (1 + Gd[q] * 20);
        var amp = meander * (2 + 2 * Rr[q]) * (0.3 + 0.7 * flat);
        var taper = Math.min(1, Math.min(q, n - 1 - q) / 2);
        X3[q] = X2[q] + nx * nv * amp * taper;
        Y3[q] = Y2[q] + ny * nv * amp * taper;
    }

    var A = { X: X3, Y: Y3, S: Sv, R: Rr, D: [], T: [] };
    for (q = 0; q < n; q++) {
        var dv = depthMin + 0.12 * 2 * Rr[q];
        dv *= 0.85 + 0.3 * vnoise(cum[q], pi * 7.7, 30, seed + 400);
        A.D.push(Math.min(depthMax, Math.max(depthMin, dv)));
        A.T.push(Gd[q] > 0.25 ? 1 : 0);
    }
    A = chaikin(A);
    A = chaikin(A);
    var m = A.X.length;

    // rasterise: for every block remember the segment whose channel is closest
    var best = {}, bxs = [], bys = [], bsc = [], bD = [], bS = [], bR = [], bDp = [], bT = [];
    var seg, x, y;
    for (seg = 0; seg < m - 1; seg++) {
        var ax = A.X[seg], ay = A.Y[seg], bx = A.X[seg + 1], by = A.Y[seg + 1];
        var dxs = bx - ax, dys = by - ay, l2 = dxs * dxs + dys * dys;
        var rmax = Math.max(A.R[seg], A.R[seg + 1]);
        var reach = rmax + bankMin + 1.2 * rmax + 1;
        var xa = Math.max(Math.floor(Math.min(ax, bx) - reach), Math.ceil(rx1));
        var xb = Math.min(Math.ceil(Math.max(ax, bx) + reach), Math.floor(rx2) - 1);
        var ya = Math.max(Math.floor(Math.min(ay, by) - reach), Math.ceil(ry1));
        var yb = Math.min(Math.ceil(Math.max(ay, by) + reach), Math.floor(ry2) - 1);
        for (x = xa; x <= xb; x++) {
            for (y = ya; y <= yb; y++) {
                var t = l2 > 0 ? ((x + 0.5 - ax) * dxs + (y + 0.5 - ay) * dys) / l2 : 0;
                if (t < 0) t = 0; else if (t > 1) t = 1;
                var ex = x + 0.5 - (ax + t * dxs), ey = y + 0.5 - (ay + t * dys);
                var D = Math.sqrt(ex * ex + ey * ey);
                var r = A.R[seg] + t * (A.R[seg + 1] - A.R[seg]);
                if (D > r + bankMin + 1.2 * r) continue;
                var score = D - r;
                var kk2 = key(x, y);
                var bi = best[kk2];
                if (bi === undefined) {
                    best[kk2] = bxs.length;
                    bxs.push(x); bys.push(y); bsc.push(score); bD.push(D); bR.push(r);
                    bS.push(A.S[seg] + t * (A.S[seg + 1] - A.S[seg]));
                    bDp.push(A.D[seg] + t * (A.D[seg + 1] - A.D[seg]));
                    bT.push(A.T[seg] + t * (A.T[seg + 1] - A.T[seg]));
                } else if (score < bsc[bi]) {
                    bsc[bi] = score; bD[bi] = D; bR[bi] = r;
                    bS[bi] = A.S[seg] + t * (A.S[seg + 1] - A.S[seg]);
                    bDp[bi] = A.D[seg] + t * (A.D[seg + 1] - A.D[seg]);
                    bT[bi] = A.T[seg] + t * (A.T[seg + 1] - A.T[seg]);
                }
            }
        }
    }

    // apply to the world
    for (var e = 0; e < bxs.length; e++) {
        var X0 = bxs[e], Y0 = bys[e], De = bD[e], re = bR[e], Se = bS[e];
        var hE = hAt(X0, Y0);
        if (isNaN(hE)) continue;
        var wn = hash(X0, Y0, seed + 55);
        var bankW = bankMin + 1.2 * re;
        if (De <= re) {
            var u = De / re;
            var prof = 1 - u * u;
            var bed = Se - 1 - (bDp[e] - 1) * prof;
            var newH = Math.min(hE, bed);
            dimension.setHeightAt(X0, Y0, newH);
            var lvl = Math.floor(Se);
            var cw = dimension.getWaterLevelAt(X0, Y0);
            if (cw > newH && cw > lvl) lvl = cw;
            dimension.setWaterLevelAt(X0, Y0, lvl);
            dimension.setTerrainAt(X0, Y0, bT[e] > 0.5
                ? pick([[T.STONE, 35], [T.COBBLE, 30], [T.GRAVEL, 35]], wn)
                : pick([[T.GRAVEL, 55], [T.SAND, 30], [T.CLAY, 15]], wn));
            totalBlocks++;
        } else {
            if (dimension.getWaterLevelAt(X0, Y0) > hE) continue;      // already lake water
            var tb = (De - re) / bankW;
            var smo = tb * tb * (3 - 2 * tb);
            var tgt = Se + 1, nh = hE;
            if (hE > tgt) nh = tgt + (hE - tgt) * smo;
            else if (tgt - hE <= 2.5) nh = hE + (tgt - hE) * (1 - smo);
            if (Math.abs(nh - hE) > 0.01) dimension.setHeightAt(X0, Y0, nh);
            if (paintBanks && De <= re + 2 && wn < 0.75) {
                dimension.setTerrainAt(X0, Y0, pick([[T.GRAVEL, 40], [T.SAND, 30], [T.COARSE, 30]], wn));
            }
            totalBlocks++;
        }
    }
    totalLen += cum[n - 1];
    carved++;
}

for (var pi2 = 0; pi2 < paths.length; pi2++) {
    if (java.lang.Thread.interrupted()) { print('Interrupted.'); break; }
    carvePath(paths[pi2], pi2);
    if (pi2 % 5 === 0) print('Segment ' + (pi2 + 1) + ' / ' + paths.length);
}
print('Done. Segments carved: ' + carved + ' | total river length: ' + Math.round(totalLen) +
      ' blocks | blocks modified: ' + totalBlocks);

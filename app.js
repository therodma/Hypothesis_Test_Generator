// ─── State ────────────────────────────────────────────────────────────────────
let parsedData = [];
let columns = [];
let activeChart = null;

// ─── Mode Switcher ────────────────────────────────────────────────────────────
function switchMode(n) {
  document.getElementById('mode1').style.display = n === 1 ? '' : 'none';
  document.getElementById('mode2').style.display = n === 2 ? '' : 'none';
  document.getElementById('btn-mode1').classList.toggle('active', n === 1);
  document.getElementById('btn-mode2').classList.toggle('active', n === 2);
}

// ─── Dataset Loading ──────────────────────────────────────────────────────────
function loadDataset(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    Papa.parse(file, {
      header: true, dynamicTyping: true, skipEmptyLines: true,
      complete: r => initDataset(r.data)
    });
  } else {
    const reader = new FileReader();
    reader.onload = e => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      initDataset(XLSX.utils.sheet_to_json(ws, { defval: '' }));
    };
    reader.readAsArrayBuffer(file);
  }
}

function initDataset(data) {
  parsedData = data;
  columns = Object.keys(data[0] || {});
  renderPreview();
  document.getElementById('test-config').style.display = '';
  document.getElementById('test-select').value = '';
  document.getElementById('test-params').innerHTML = '';
  document.getElementById('manual-results').style.display = 'none';
}

function renderPreview() {
  const preview = parsedData.slice(0, 5);
  let html = '<table><thead><tr>' + columns.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  preview.forEach(row => {
    html += '<tr>' + columns.map(c => `<td>${row[c]}</td>`).join('') + '</tr>';
  });
  html += `</tbody></table><p class="hint" style="margin-top:0.5rem">Showing 5 of ${parsedData.length} rows · ${columns.length} columns</p>`;
  document.getElementById('dataset-preview').innerHTML = html;
}

// ─── Math Helpers ─────────────────────────────────────────────────────────────
function getNumericCol(col) {
  return parsedData.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

function std(arr) { return Math.sqrt(variance(arr)); }

function tPValue(t, df, tail) {
  const p = jStat.studentt.cdf(-Math.abs(t), df);
  if (tail === 'two') return 2 * p;
  if (tail === 'left') return jStat.studentt.cdf(t, df);
  return 1 - jStat.studentt.cdf(t, df);
}

function zPVal(z, tail) {
  const p = jStat.normal.cdf(-Math.abs(z), 0, 1);
  if (tail === 'two') return 2 * p;
  if (tail === 'left') return jStat.normal.cdf(z, 0, 1);
  return 1 - jStat.normal.cdf(z, 0, 1);
}

// Rank array (handles ties with average ranks)
function rank(arr) {
  const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) ranks[sorted[k].i] = avgRank;
    i = j;
  }
  return ranks;
}

// Spearman rank correlation
function spearmanR(x, y) {
  const rx = rank(x), ry = rank(y);
  return pearsonR(rx, ry);
}

// Pearson r
function pearsonR(x, y) {
  const mx = mean(x), my = mean(y);
  const num = x.reduce((s, xi, i) => s + (xi - mx) * (y[i] - my), 0);
  const den = Math.sqrt(x.reduce((s, xi) => s + (xi - mx) ** 2, 0) * y.reduce((s, yi) => s + (yi - my) ** 2, 0));
  return den === 0 ? 0 : num / den;
}

// Kendall's tau-b
function kendallTau(x, y) {
  const n = x.length;
  let C = 0, D = 0, tx = 0, ty = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j], dy = y[i] - y[j];
      if (dx === 0 && dy === 0) continue;
      if (dx === 0) { tx++; continue; }
      if (dy === 0) { ty++; continue; }
      dx * dy > 0 ? C++ : D++;
    }
  }
  const pairs = n * (n - 1) / 2;
  return (C - D) / Math.sqrt((pairs - tx) * (pairs - ty));
}

// Cohen's d (two groups)
function cohensD(x1, x2) {
  const pooled = Math.sqrt(((x1.length - 1) * variance(x1) + (x2.length - 1) * variance(x2)) / (x1.length + x2.length - 2));
  return pooled === 0 ? 0 : (mean(x1) - mean(x2)) / pooled;
}

// Cohen's d (one sample)
function cohensDOne(x, mu0) {
  return (mean(x) - mu0) / std(x);
}

// Eta-squared from SS_between and SS_total
function etaSquared(ssBetween, ssTotal) {
  return ssTotal === 0 ? 0 : ssBetween / ssTotal;
}

function effectLabel(d) {
  const a = Math.abs(d);
  if (a < 0.2) return 'negligible';
  if (a < 0.5) return 'small';
  if (a < 0.8) return 'medium';
  return 'large';
}

// ─── Test Config UI ───────────────────────────────────────────────────────────
function colSelect(id, label) {
  return `<label>${label}<select id="${id}">${columns.map(c => `<option>${c}</option>`).join('')}</select></label>`;
}

function tailSelect() {
  return `<label>Tail<select id="tail">
    <option value="two">Two-tailed</option>
    <option value="left">Left-tailed</option>
    <option value="right">Right-tailed</option>
  </select></label>`;
}

function alphaInput() {
  return `<label>Significance Level (α)<input type="number" id="alpha" value="0.05" min="0.001" max="0.5" step="0.01"/></label>`;
}

function renderTestConfig() {
  const test = document.getElementById('test-select').value;
  const p = document.getElementById('test-params');
  const g = (...items) => `<div class="params-grid">${items.join('')}</div>`;

  const mu0 = `<label>Hypothesized Mean (μ₀)<input type="number" id="mu0" value="0"/></label>`;
  const sigma = `<label>Known Population σ<input type="number" id="sigma" value="1" min="0.0001" step="0.01"/></label>`;
  const p0 = `<label>Hypothesized Proportion (p₀)<input type="number" id="p0" value="0.5" min="0.001" max="0.999" step="0.01"/></label>`;

  const configs = {
    'one-sample-t':   g(colSelect('col1','Column'), mu0, tailSelect(), alphaInput()),
    'two-sample-t':   g(colSelect('col1','Group 1 Column'), colSelect('col2','Group 2 Column'), tailSelect(), alphaInput()),
    'paired-t':       g(colSelect('col1','Before Column'), colSelect('col2','After Column'), tailSelect(), alphaInput()),
    'one-sample-z':   g(colSelect('col1','Column'), mu0, sigma, tailSelect(), alphaInput()),
    'z-prop':         g(colSelect('col1','Binary Column (0/1 or yes/no)'), p0, tailSelect(), alphaInput()),
    'z-prop-two':     g(colSelect('col1','Group 1 Binary Column'), colSelect('col2','Group 2 Binary Column'), tailSelect(), alphaInput()),
    'f-test':         g(colSelect('col1','Column 1'), colSelect('col2','Column 2'), tailSelect(), alphaInput()),
    'one-way-anova':  g(colSelect('col-group','Group Column (categorical)'), colSelect('col-val','Value Column (numeric)'), alphaInput()),
    'two-way-anova':  g(colSelect('col-a','Factor A Column'), colSelect('col-b','Factor B Column'), colSelect('col-val','Response Column'), alphaInput()),
    'chi-square-indep': g(colSelect('col1','Variable 1'), colSelect('col2','Variable 2'), alphaInput()),
    'chi-square-gof': `<div class="params-grid">${colSelect('col1','Observed Counts Column')}${alphaInput()}</div>
      <label style="margin-top:0.75rem">Expected Proportions (comma-separated, must sum to 1)<input type="text" id="expected-props" placeholder="e.g. 0.25,0.25,0.25,0.25"/></label>`,
    'pearson':        g(colSelect('col1','X Column'), colSelect('col2','Y Column'), tailSelect(), alphaInput()),
    'spearman':       g(colSelect('col1','X Column'), colSelect('col2','Y Column'), tailSelect(), alphaInput()),
    'kendall':        g(colSelect('col1','X Column'), colSelect('col2','Y Column'), tailSelect(), alphaInput()),
    'mann-whitney':   g(colSelect('col1','Group 1 Column'), colSelect('col2','Group 2 Column'), tailSelect(), alphaInput()),
    'kruskal-wallis': g(colSelect('col-group','Group Column (categorical)'), colSelect('col-val','Value Column (numeric)'), alphaInput()),
    'binomial':       g(colSelect('col1','Binary Column (0/1 or yes/no)'), p0, tailSelect(), alphaInput()),
    'levene':         g(colSelect('col-group','Group Column (categorical)'), colSelect('col-val','Value Column (numeric)'), alphaInput()),
    'shapiro-wilk':   g(colSelect('col1','Column (3–50 values)'), alphaInput()),
  };

  p.innerHTML = configs[test] || '';
}

// ─── Run Dispatcher ───────────────────────────────────────────────────────────
function runManualTest() {
  const test = document.getElementById('test-select').value;
  const alpha = parseFloat(document.getElementById('alpha')?.value || 0.05);
  if (!test) return alert('Please select a test.');
  let result;
  try {
    const map = {
      'one-sample-t':     oneSampleT,
      'two-sample-t':     twoSampleT,
      'paired-t':         pairedT,
      'one-sample-z':     oneSampleZ,
      'z-prop':           zPropOne,
      'z-prop-two':       zPropTwo,
      'f-test':           fTest,
      'one-way-anova':    oneWayAnova,
      'two-way-anova':    twoWayAnova,
      'chi-square-indep': chiSquareIndep,
      'chi-square-gof':   chiSquareGof,
      'pearson':          pearsonTest,
      'spearman':         spearmanTest,
      'kendall':          kendallTest,
      'mann-whitney':     mannWhitney,
      'kruskal-wallis':   kruskalWallis,
      'binomial':         binomialTest,
      'levene':           leveneTest,
      'shapiro-wilk':     shapiroWilk,
    };
    if (!map[test]) throw new Error('Test not implemented.');
    result = map[test](alpha);
  } catch (e) {
    showManualResult(`<div class="error-msg">${e.message}</div>`);
    return;
  }
  showManualResult(renderResult(result, alpha));
}

// ─── T-Tests ──────────────────────────────────────────────────────────────────
function oneSampleT() {
  const x = getNumericCol(document.getElementById('col1').value);
  const mu0 = parseFloat(document.getElementById('mu0').value);
  const tail = document.getElementById('tail').value;
  if (x.length < 2) throw new Error('Need at least 2 values.');
  const m = mean(x), s = std(x), n = x.length;
  const t = (m - mu0) / (s / Math.sqrt(n));
  const p = tPValue(t, n - 1, tail);
  const d = cohensDOne(x, mu0);
  return { pValue: p, effectSize: { label: "Cohen's d", value: d },
    stats: { Test: 'One-Sample T-Test', n, 'Sample Mean': m, 'Std Dev': s, 't-statistic': t, df: n - 1, 'p-value': p, "Cohen's d": d } };
}

function twoSampleT() {
  const x1 = getNumericCol(document.getElementById('col1').value);
  const x2 = getNumericCol(document.getElementById('col2').value);
  const tail = document.getElementById('tail').value;
  if (x1.length < 2 || x2.length < 2) throw new Error('Each group needs at least 2 values.');
  const m1 = mean(x1), m2 = mean(x2), s1 = std(x1), s2 = std(x2), n1 = x1.length, n2 = x2.length;
  const se = Math.sqrt(s1 ** 2 / n1 + s2 ** 2 / n2);
  const t = (m1 - m2) / se;
  const df = (s1**2/n1 + s2**2/n2)**2 / ((s1**2/n1)**2/(n1-1) + (s2**2/n2)**2/(n2-1));
  const p = tPValue(t, df, tail);
  const d = cohensD(x1, x2);
  return { pValue: p, effectSize: { label: "Cohen's d", value: d },
    stats: { Test: 'Two-Sample T-Test', n1, n2, 'Mean₁': m1, 'Mean₂': m2, 't-statistic': t, df, 'p-value': p, "Cohen's d": d } };
}

function pairedT() {
  const a = getNumericCol(document.getElementById('col1').value);
  const b = getNumericCol(document.getElementById('col2').value);
  const tail = document.getElementById('tail').value;
  const n = Math.min(a.length, b.length);
  if (n < 2) throw new Error('Need at least 2 paired values.');
  const diffs = Array.from({ length: n }, (_, i) => a[i] - b[i]);
  const m = mean(diffs), s = std(diffs);
  const t = m / (s / Math.sqrt(n));
  const p = tPValue(t, n - 1, tail);
  const d = m / s;
  return { pValue: p, effectSize: { label: "Cohen's d", value: d },
    stats: { Test: 'Paired T-Test', 'n pairs': n, 'Mean Diff': m, 'Std Diff': s, 't-statistic': t, df: n - 1, 'p-value': p, "Cohen's d": d } };
}

// ─── Z-Tests ──────────────────────────────────────────────────────────────────
function oneSampleZ() {
  const x = getNumericCol(document.getElementById('col1').value);
  const mu0 = parseFloat(document.getElementById('mu0').value);
  const sigma = parseFloat(document.getElementById('sigma').value);
  const tail = document.getElementById('tail').value;
  if (x.length < 2) throw new Error('Need at least 2 values.');
  const m = mean(x), n = x.length;
  const z = (m - mu0) / (sigma / Math.sqrt(n));
  const p = zPVal(z, tail);
  const d = (m - mu0) / sigma;
  return { pValue: p, effectSize: { label: "Cohen's d", value: d },
    stats: { Test: 'One-Sample Z-Test', n, 'Sample Mean': m, 'σ (known)': sigma, 'z-statistic': z, 'p-value': p, "Cohen's d": d } };
}

function toBinary(col) {
  return parsedData.map(r => {
    const v = String(r[col]).toLowerCase();
    return v === '1' || v === 'yes' || v === 'true' ? 1 : v === '0' || v === 'no' || v === 'false' ? 0 : NaN;
  }).filter(v => !isNaN(v));
}

function zPropOne() {
  const vals = toBinary(document.getElementById('col1').value);
  const p0 = parseFloat(document.getElementById('p0').value);
  const tail = document.getElementById('tail').value;
  if (vals.length < 10) throw new Error('Need at least 10 binary values.');
  const n = vals.length, pHat = mean(vals);
  const z = (pHat - p0) / Math.sqrt(p0 * (1 - p0) / n);
  const p = zPVal(z, tail);
  return { pValue: p, effectSize: null,
    stats: { Test: 'Z-Test for Proportion (One-Sample)', n, 'p̂': pHat, p0, 'z-statistic': z, 'p-value': p } };
}

function zPropTwo() {
  const v1 = toBinary(document.getElementById('col1').value);
  const v2 = toBinary(document.getElementById('col2').value);
  const tail = document.getElementById('tail').value;
  if (v1.length < 5 || v2.length < 5) throw new Error('Need at least 5 binary values per group.');
  const n1 = v1.length, n2 = v2.length;
  const p1 = mean(v1), p2 = mean(v2);
  const pPool = (v1.reduce((a,b)=>a+b,0) + v2.reduce((a,b)=>a+b,0)) / (n1 + n2);
  const z = (p1 - p2) / Math.sqrt(pPool * (1 - pPool) * (1/n1 + 1/n2));
  const p = zPVal(z, tail);
  return { pValue: p, effectSize: null,
    stats: { Test: 'Z-Test for Proportion (Two-Sample)', n1, n2, 'p̂₁': p1, 'p̂₂': p2, 'Pooled p': pPool, 'z-statistic': z, 'p-value': p } };
}

// ─── F-Test ───────────────────────────────────────────────────────────────────
function fTest() {
  const x1 = getNumericCol(document.getElementById('col1').value);
  const x2 = getNumericCol(document.getElementById('col2').value);
  const tail = document.getElementById('tail').value;
  if (x1.length < 2 || x2.length < 2) throw new Error('Need at least 2 values per group.');
  const v1 = variance(x1), v2 = variance(x2);
  const df1 = x1.length - 1, df2 = x2.length - 1;
  const F = v1 / v2;
  let p = 1 - jStat.centralF.cdf(F, df1, df2);
  if (tail === 'two') p = 2 * Math.min(p, 1 - p);
  else if (tail === 'left') p = 1 - p;
  return { pValue: p, effectSize: null,
    stats: { Test: 'F-Test (Variance Ratio)', 'Var₁': v1, 'Var₂': v2, 'F-statistic': F, df1, df2, 'p-value': p } };
}

// ─── ANOVA ────────────────────────────────────────────────────────────────────
function getGroups(groupCol, valCol) {
  const groups = {};
  parsedData.forEach(r => {
    const g = r[groupCol], v = parseFloat(r[valCol]);
    if (!isNaN(v)) { groups[g] = groups[g] || []; groups[g].push(v); }
  });
  return groups;
}

function oneWayAnova() {
  const groups = getGroups(document.getElementById('col-group').value, document.getElementById('col-val').value);
  const groupArrays = Object.values(groups);
  const groupNames = Object.keys(groups);
  if (groupArrays.length < 2) throw new Error('Need at least 2 groups.');
  const allVals = groupArrays.flat();
  const grandMean = mean(allVals);
  const N = allVals.length, k = groupArrays.length;
  const ssBetween = groupArrays.reduce((s, g) => s + g.length * (mean(g) - grandMean) ** 2, 0);
  const ssWithin = groupArrays.reduce((s, g) => s + g.reduce((a, v) => a + (v - mean(g)) ** 2, 0), 0);
  const ssTotal = ssBetween + ssWithin;
  const dfB = k - 1, dfW = N - k;
  const F = (ssBetween / dfB) / (ssWithin / dfW);
  const p = 1 - jStat.centralF.cdf(F, dfB, dfW);
  const eta2 = etaSquared(ssBetween, ssTotal);

  // Tukey HSD
  const mse = ssWithin / dfW;
  const tukey = [];
  for (let i = 0; i < groupArrays.length; i++) {
    for (let j = i + 1; j < groupArrays.length; j++) {
      const diff = Math.abs(mean(groupArrays[i]) - mean(groupArrays[j]));
      const se = Math.sqrt(mse / 2 * (1/groupArrays[i].length + 1/groupArrays[j].length));
      const q = diff / se;
      tukey.push(`${groupNames[i]} vs ${groupNames[j]}: q = ${q.toFixed(3)}`);
    }
  }

  return { pValue: p, effectSize: { label: 'η²', value: eta2 },
    stats: { Test: 'One-Way ANOVA', Groups: k, N, 'SS Between': ssBetween, 'SS Within': ssWithin, 'F-statistic': F, 'df Between': dfB, 'df Within': dfW, 'p-value': p, 'η²': eta2 },
    extra: tukey.length ? `<div class="extra-block"><strong>Tukey HSD (q statistics):</strong><br>${tukey.join('<br>')}</div>` : '' };
}

function twoWayAnova() {
  const colA = document.getElementById('col-a').value;
  const colB = document.getElementById('col-b').value;
  const colV = document.getElementById('col-val').value;
  const levelsA = [...new Set(parsedData.map(r => r[colA]))];
  const levelsB = [...new Set(parsedData.map(r => r[colB]))];
  const cells = {};
  levelsA.forEach(a => levelsB.forEach(b => { cells[`${a}|${b}`] = []; }));
  parsedData.forEach(r => {
    const v = parseFloat(r[colV]);
    if (!isNaN(v)) cells[`${r[colA]}|${r[colB]}`]?.push(v);
  });
  const allVals = Object.values(cells).flat();
  const N = allVals.length;
  const grandMean = mean(allVals);
  const a = levelsA.length, b = levelsB.length;

  const meanA = levelsA.map(lv => mean(parsedData.filter(r => r[colA] === lv).map(r => parseFloat(r[colV])).filter(v => !isNaN(v))));
  const meanB = levelsB.map(lv => mean(parsedData.filter(r => r[colB] === lv).map(r => parseFloat(r[colV])).filter(v => !isNaN(v))));

  const n = N / (a * b);
  const ssA = n * b * meanA.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  const ssB = n * a * meanB.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  const ssTotal = allVals.reduce((s, v) => s + (v - grandMean) ** 2, 0);
  const ssError = Object.values(cells).reduce((s, g) => g.length ? s + g.reduce((a, v) => a + (v - mean(g)) ** 2, 0) : s, 0);
  const ssAB = ssTotal - ssA - ssB - ssError;
  const dfA = a - 1, dfB2 = b - 1, dfAB = dfA * dfB2, dfE = N - a * b;
  const FA = (ssA/dfA) / (ssError/dfE);
  const FB = (ssB/dfB2) / (ssError/dfE);
  const FAB = (ssAB/dfAB) / (ssError/dfE);
  const pA = 1 - jStat.centralF.cdf(FA, dfA, dfE);
  const pB = 1 - jStat.centralF.cdf(FB, dfB2, dfE);
  const pAB = 1 - jStat.centralF.cdf(FAB, dfAB, dfE);
  const eta2 = etaSquared(ssA + ssB + ssAB, ssTotal);

  return { pValue: Math.min(pA, pB, pAB), effectSize: { label: 'η²', value: eta2 },
    stats: { Test: 'Two-Way ANOVA', N, [`F(${colA})`]: FA, [`p(${colA})`]: pA, [`F(${colB})`]: FB, [`p(${colB})`]: pB, 'F(Interaction)': FAB, 'p(Interaction)': pAB, 'η²': eta2 } };
}

// ─── Chi-Square ───────────────────────────────────────────────────────────────
function chiSquareIndep() {
  const c1 = document.getElementById('col1').value;
  const c2 = document.getElementById('col2').value;
  const cats1 = [...new Set(parsedData.map(r => r[c1]))];
  const cats2 = [...new Set(parsedData.map(r => r[c2]))];
  const obs = {};
  cats1.forEach(a => { obs[a] = {}; cats2.forEach(b => obs[a][b] = 0); });
  parsedData.forEach(r => { if (obs[r[c1]]) obs[r[c1]][r[c2]] = (obs[r[c1]][r[c2]] || 0) + 1; });
  const rowT = cats1.map(a => cats2.reduce((s, b) => s + obs[a][b], 0));
  const colT = cats2.map(b => cats1.reduce((s, a) => s + obs[a][b], 0));
  const N = parsedData.length;
  let chi2 = 0;
  cats1.forEach((a, i) => cats2.forEach((b, j) => {
    const E = rowT[i] * colT[j] / N;
    if (E > 0) chi2 += (obs[a][b] - E) ** 2 / E;
  }));
  const df = (cats1.length - 1) * (cats2.length - 1);
  const p = 1 - jStat.chisquare.cdf(chi2, df);
  const cramersV = Math.sqrt(chi2 / (N * Math.min(cats1.length - 1, cats2.length - 1)));
  return { pValue: p, effectSize: { label: "Cramér's V", value: cramersV },
    stats: { Test: 'Chi-Square: Independence', 'χ²': chi2, df, N, 'p-value': p, "Cramér's V": cramersV } };
}

function chiSquareGof() {
  const obs = getNumericCol(document.getElementById('col1').value);
  const propsRaw = document.getElementById('expected-props').value.trim();
  if (!propsRaw) throw new Error('Enter expected proportions.');
  const props = propsRaw.split(',').map(Number);
  if (props.length !== obs.length) throw new Error(`Expected ${obs.length} proportions, got ${props.length}.`);
  const total = obs.reduce((a, b) => a + b, 0);
  const exp = props.map(p => p * total);
  let chi2 = 0;
  obs.forEach((o, i) => { if (exp[i] > 0) chi2 += (o - exp[i]) ** 2 / exp[i]; });
  const df = obs.length - 1;
  const p = 1 - jStat.chisquare.cdf(chi2, df);
  return { pValue: p, effectSize: null,
    stats: { Test: 'Chi-Square: Goodness of Fit', 'χ²': chi2, df, 'p-value': p } };
}

// ─── Correlation ──────────────────────────────────────────────────────────────
function corrTest(label, rFn) {
  const x = getNumericCol(document.getElementById('col1').value);
  const y = getNumericCol(document.getElementById('col2').value);
  const tail = document.getElementById('tail').value;
  const n = Math.min(x.length, y.length);
  if (n < 4) throw new Error('Need at least 4 paired values.');
  const xs = x.slice(0, n), ys = y.slice(0, n);
  const r = rFn(xs, ys);
  const t = r * Math.sqrt((n - 2) / (1 - r ** 2));
  const p = tPValue(t, n - 2, tail);
  return { pValue: p, effectSize: { label: 'r', value: r },
    stats: { Test: label, n, r, 't-statistic': t, df: n - 2, 'p-value': p } };
}

function pearsonTest()  { return corrTest('Pearson Correlation', pearsonR); }
function spearmanTest() { return corrTest('Spearman Correlation', spearmanR); }
function kendallTest() {
  const x = getNumericCol(document.getElementById('col1').value);
  const y = getNumericCol(document.getElementById('col2').value);
  const tail = document.getElementById('tail').value;
  const n = Math.min(x.length, y.length);
  if (n < 4) throw new Error('Need at least 4 paired values.');
  const tau = kendallTau(x.slice(0, n), y.slice(0, n));
  const z = (3 * tau * Math.sqrt(n * (n - 1))) / Math.sqrt(2 * (2 * n + 5));
  const p = zPVal(z, tail);
  return { pValue: p, effectSize: { label: 'τ', value: tau },
    stats: { Test: "Kendall's Tau", n, 'τ (tau)': tau, 'z-statistic': z, 'p-value': p } };
}

// ─── Non-Parametric ───────────────────────────────────────────────────────────
function mannWhitney() {
  const x1 = getNumericCol(document.getElementById('col1').value);
  const x2 = getNumericCol(document.getElementById('col2').value);
  const tail = document.getElementById('tail').value;
  if (x1.length < 2 || x2.length < 2) throw new Error('Need at least 2 values per group.');
  const n1 = x1.length, n2 = x2.length;
  let U1 = 0;
  x1.forEach(a => x2.forEach(b => { if (a > b) U1++; else if (a === b) U1 += 0.5; }));
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const mu = n1 * n2 / 2;
  const sigma = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
  const z = (U - mu) / sigma;
  const p = zPVal(z, tail);
  const r = Math.abs(z) / Math.sqrt(n1 + n2);
  return { pValue: p, effectSize: { label: 'r (rank-biserial)', value: r },
    stats: { Test: 'Mann-Whitney U', n1, n2, U1, U2, 'U (min)': U, 'z-statistic': z, 'p-value': p, 'r': r } };
}

function kruskalWallis() {
  const groups = getGroups(document.getElementById('col-group').value, document.getElementById('col-val').value);
  const groupArrays = Object.values(groups);
  if (groupArrays.length < 2) throw new Error('Need at least 2 groups.');
  const allVals = groupArrays.flat();
  const N = allVals.length;
  const allRanks = rank(allVals);
  let offset = 0;
  const rankSums = groupArrays.map(g => {
    const rs = allRanks.slice(offset, offset + g.length).reduce((a, b) => a + b, 0);
    offset += g.length;
    return { n: g.length, rs };
  });
  const H = (12 / (N * (N + 1))) * rankSums.reduce((s, { n, rs }) => s + rs ** 2 / n, 0) - 3 * (N + 1);
  const df = groupArrays.length - 1;
  const p = 1 - jStat.chisquare.cdf(H, df);
  const eta2 = (H - df + 1) / (N - df);
  return { pValue: p, effectSize: { label: 'η²', value: Math.max(0, eta2) },
    stats: { Test: 'Kruskal-Wallis', Groups: groupArrays.length, N, 'H-statistic': H, df, 'p-value': p, 'η²': Math.max(0, eta2) } };
}

function binomialTest() {
  const vals = toBinary(document.getElementById('col1').value);
  const p0 = parseFloat(document.getElementById('p0').value);
  const tail = document.getElementById('tail').value;
  if (vals.length < 1) throw new Error('No binary values found.');
  const n = vals.length, k = vals.reduce((a, b) => a + b, 0);
  const pHat = k / n;
  // Normal approximation for large n, exact for small
  let p;
  if (n <= 100) {
    const cdf = x => jStat.binomial.cdf(x, n, p0);
    if (tail === 'two') {
      const pLeft = cdf(k);
      const pRight = 1 - cdf(k - 1);
      p = 2 * Math.min(pLeft, pRight);
    } else if (tail === 'left') {
      p = cdf(k);
    } else {
      p = 1 - cdf(k - 1);
    }
  } else {
    const z = (k - n * p0) / Math.sqrt(n * p0 * (1 - p0));
    p = zPVal(z, tail);
  }
  return { pValue: p, effectSize: null,
    stats: { Test: 'Binomial Test', n, 'Successes (k)': k, 'p̂': pHat, p0, 'p-value': p } };
}

// ─── Variance / Normality ─────────────────────────────────────────────────────
function leveneTest() {
  const groups = getGroups(document.getElementById('col-group').value, document.getElementById('col-val').value);
  const groupArrays = Object.values(groups);
  if (groupArrays.length < 2) throw new Error('Need at least 2 groups.');
  const zGroups = groupArrays.map(g => { const m = mean(g); return g.map(v => Math.abs(v - m)); });
  const allZ = zGroups.flat();
  const N = allZ.length, k = zGroups.length;
  const grandMean = mean(allZ);
  const ssBetween = zGroups.reduce((s, g) => s + g.length * (mean(g) - grandMean) ** 2, 0);
  const ssWithin = zGroups.reduce((s, g) => s + g.reduce((a, v) => a + (v - mean(g)) ** 2, 0), 0);
  const dfB = k - 1, dfW = N - k;
  const W = (ssBetween / dfB) / (ssWithin / dfW);
  const p = 1 - jStat.centralF.cdf(W, dfB, dfW);
  return { pValue: p, effectSize: null,
    stats: { Test: "Levene's Test", Groups: k, N, 'W-statistic': W, 'df Between': dfB, 'df Within': dfW, 'p-value': p } };
}

function shapiroWilk() {
  const x = getNumericCol(document.getElementById('col1').value).sort((a, b) => a - b);
  const n = x.length;
  if (n < 3 || n > 50) throw new Error('Shapiro-Wilk requires 3–50 values.');
  // Approximation via log-transform of W
  const m = mean(x);
  const ss = x.reduce((s, v) => s + (v - m) ** 2, 0);
  // Simplified a-coefficients approximation (Royston 1992 polynomial)
  const u = 1 / Math.sqrt(n);
  const m5 = [-2.706056, 4.434685, -2.071190, -0.147981, 0.221157, 0.0];
  const a_n = m5.reduce((s, c, i) => s + c * u ** (5 - i), 0);
  const half = Math.floor(n / 2);
  let bSum = 0;
  for (let i = 0; i < half; i++) {
    const ai = i === 0 ? a_n : (n % 2 === 1 && i === half - 1) ? 0 : (1 / (2 * Math.sqrt(n)));
    bSum += ai * (x[n - 1 - i] - x[i]);
  }
  const W = Math.min(1, bSum ** 2 / ss);
  // p-value via normal approximation of ln(1-W)
  const mu_w = 0.0038915 * (Math.log(n)) ** 3 - 0.083751 * (Math.log(n)) ** 2 - 0.31082 * Math.log(n) - 1.5861;
  const sigma_w = Math.exp(0.0030302 * (Math.log(n)) ** 2 - 0.082676 * Math.log(n) - 0.4803);
  const z = (Math.log(1 - W) - mu_w) / sigma_w;
  const p = 1 - jStat.normal.cdf(z, 0, 1);
  return { pValue: p, effectSize: null,
    stats: { Test: 'Shapiro-Wilk', n, 'W-statistic': W, 'z (approx)': z, 'p-value': p } };
}

// ─── Result Rendering ─────────────────────────────────────────────────────────
function renderResult(r, alpha) {
  const rows = Object.entries(r.stats).map(([k, v]) =>
    `<div class="stat-row"><span>${k}</span><span><strong>${typeof v === 'number' ? v.toFixed(4) : v}</strong></span></div>`
  ).join('');

  const alphaLevels = [0.01, 0.05, 0.10];
  const alphaRows = alphaLevels.map(a => {
    const reject = r.pValue < a;
    return `<tr>
      <td>α = ${a}</td>
      <td class="${reject ? 'sig' : 'nonsig'}">${reject ? 'Reject H₀' : 'Fail to Reject H₀'}</td>
      <td>${reject ? '✓ Significant' : '✗ Not Significant'}</td>
    </tr>`;
  }).join('');

  const alphaTable = `
    <div class="alpha-table-wrap">
      <table class="alpha-table">
        <thead><tr><th>Level</th><th>Decision</th><th>Significance</th></tr></thead>
        <tbody>${alphaRows}</tbody>
      </table>
    </div>`;

  const effectBadge = r.effectSize ? (() => {
    const { label, value } = r.effectSize;
    const lbl = effectLabel(value);
    return `<div class="effect-badge effect-${lbl}">
      ${label} = ${value.toFixed(4)} <span class="effect-label">${lbl} effect</span>
    </div>`;
  })() : '';

  const extra = r.extra || '';

  return `<div class="result-block">${rows}</div>${alphaTable}${effectBadge}${extra}`;
}

function showManualResult(html) {
  document.getElementById('manual-results-content').innerHTML = html;
  document.getElementById('manual-results').style.display = '';
}

// ─── Mode 2: File Extraction ──────────────────────────────────────────────────
async function loadProblemFile(input) {
  const file = input.files[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  const box = document.getElementById('extracted-text-box');
  const ta = document.getElementById('extracted-text');
  ta.value = 'Extracting text…';
  box.style.display = '';
  try {
    if (ext === 'txt')                          ta.value = await file.text();
    else if (ext === 'pdf')                     ta.value = await extractPDF(file);
    else if (ext === 'docx')                    ta.value = await extractDOCX(file);
    else if (['png','jpg','jpeg'].includes(ext)) ta.value = await extractImage(file);
  } catch (e) {
    ta.value = `Error extracting text: ${e.message}`;
  }
}

async function extractPDF(file) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(s => s.str).join(' ') + '\n';
  }
  return text.trim();
}

async function extractDOCX(file) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.trim();
}

async function extractImage(file) {
  const { data: { text } } = await Tesseract.recognize(file, 'eng');
  return text.trim();
}

// ─── Mode 2: Gemini API ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert statistics tutor. When given a hypothesis testing problem, you must:

1. Identify the correct test from this list: one-sample t-test, two-sample t-test, paired t-test, one-sample z-test, z-test for proportion (one-sample), z-test for proportion (two-sample), F-test (variance ratio), one-way ANOVA, two-way ANOVA, chi-square goodness of fit, chi-square test of independence, Pearson correlation, Spearman correlation, Kendall's tau, Mann-Whitney U, Kruskal-Wallis, binomial test, Levene's test, Shapiro-Wilk.
2. State H₀ and H₁ clearly.
3. List every given value extracted from the problem.
4. Show every calculation step with formulas and substituted numbers.
5. Compute the test statistic and p-value.
6. Interpret the p-value at α = 0.01, 0.05, and 0.10.
7. Report effect size (Cohen's d for t/z tests, η² for ANOVA/Kruskal-Wallis, Cramér's V for chi-square, r for correlation/Mann-Whitney) if calculable.
8. State the conclusion in plain English.

After your full explanation, output a JSON block (and nothing after it) in this exact format:
\`\`\`json
{
  "test": "<test name>",
  "h0": "<null hypothesis>",
  "h1": "<alternative hypothesis>",
  "given": { "<key>": <value> },
  "testStatistic": { "label": "<t/z/F/χ²/H/W/U/r/τ>", "value": <number> },
  "df": <number or null>,
  "pValue": <number>,
  "effectSize": { "label": "<label>", "value": <number> } or null,
  "alphaDecisions": { "0.01": "<Reject H₀|Fail to Reject H₀>", "0.05": "<...>", "0.10": "<...>" },
  "conclusion": "<plain English conclusion>"
}
\`\`\``;

async function solveProblem() {
  const text = document.getElementById('extracted-text')?.value?.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  if (!text) return alert('Please upload a problem file first.');
  if (!apiKey) return alert('Please enter your Gemini API key.');

  const resultsCard = document.getElementById('solver-results');
  const content = document.getElementById('solver-results-content');
  resultsCard.style.display = '';
  content.innerHTML = '<div class="loading"><div class="spinner"></div> Solving with Gemini…</div>';

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text }] }]
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('No response from Gemini.');
    content.innerHTML = renderSolverOutput(raw);
  } catch (e) {
    content.innerHTML = `<div class="error-msg">Error: ${e.message}</div>`;
  }
}

// ─── Mode 2: Response Renderer ────────────────────────────────────────────────
function renderSolverOutput(raw) {
  // Split prose from JSON block
  const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
  const prose = jsonMatch ? raw.slice(0, raw.indexOf('```json')).trim() : raw.trim();
  const proseHtml = `<div class="solver-prose">${formatProse(prose)}</div>`;

  if (!jsonMatch) return proseHtml;

  let structured;
  try { structured = JSON.parse(jsonMatch[1]); } catch { return proseHtml; }

  const { test, h0, h1, given, testStatistic, df, pValue, effectSize, alphaDecisions, conclusion } = structured;

  const givenRows = Object.entries(given || {}).map(([k, v]) =>
    `<div class="stat-row"><span>${k}</span><span><strong>${typeof v === 'number' ? v : v}</strong></span></div>`
  ).join('');

  const alphaRows = Object.entries(alphaDecisions || {}).map(([a, dec]) => {
    const reject = dec.toLowerCase().includes('reject h') && !dec.toLowerCase().includes('fail');
    return `<tr>
      <td>α = ${a}</td>
      <td class="${reject ? 'sig' : 'nonsig'}">${dec}</td>
      <td>${reject ? '✓ Significant' : '✗ Not Significant'}</td>
    </tr>`;
  }).join('');

  const effectBadge = effectSize ? (() => {
    const lbl = effectLabel(effectSize.value);
    return `<div class="effect-badge effect-${lbl}">
      ${effectSize.label} = ${Number(effectSize.value).toFixed(4)} <span class="effect-label">${lbl} effect</span>
    </div>`;
  })() : '';

  const statVal = testStatistic ? `${testStatistic.label} = ${Number(testStatistic.value).toFixed(4)}` : '';
  const dfStr = df != null ? ` · df = ${df}` : '';
  const pStr = pValue != null ? `p = ${Number(pValue).toFixed(4)}` : '';

  return `
    ${proseHtml}
    <div class="solver-structured">
      <div class="struct-header">
        <span class="test-badge">${test || 'Result'}</span>
        <span class="stat-summary">${statVal}${dfStr} · ${pStr}</span>
      </div>
      <div class="hyp-row"><span class="hyp-label">H₀</span><span>${h0 || ''}</span></div>
      <div class="hyp-row"><span class="hyp-label">H₁</span><span>${h1 || ''}</span></div>
      ${givenRows ? `<div class="result-block" style="margin-top:0.75rem">${givenRows}</div>` : ''}
      <div class="alpha-table-wrap">
        <table class="alpha-table">
          <thead><tr><th>Level</th><th>Decision</th><th>Significance</th></tr></thead>
          <tbody>${alphaRows}</tbody>
        </table>
      </div>
      ${effectBadge}
      <div class="conclusion-box">${conclusion || ''}</div>
    </div>`;
}

function formatProse(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^#{1,3}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^(\d+\.\s.+)$/gm, '<div class="step-item">$1</div>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

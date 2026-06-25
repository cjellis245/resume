/* Live Analytics dashboard — front-end for /api/stats
 * Renders KPIs, two trend charts, an animated world map with pings,
 * tech-breakdown bars, content tables, and an animated event-log feed.
 * Polls /api/stats every 60s. New events in the feed get a NEW flash.
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const REFRESH_MS = 60_000;
  // Country-name fixups so KQL output matches TopoJSON labels.
  const COUNTRY_FIX = {
    'United States': 'United States of America',
    'Russia': 'Russian Federation',
    'South Korea': 'Korea, Republic of',
    'North Korea': 'Korea, Democratic People\'s Republic of',
    'Vietnam': 'Viet Nam',
    'Czechia': 'Czech Republic',
    'UK': 'United Kingdom',
  };
  const fixCountry = (c) => COUNTRY_FIX[c] || c;
  const BROWSER_ICONS = { Chrome:'🟢', Edge:'🟦', Firefox:'🦊', Safari:'🧭', Opera:'🔴', Samsung:'📱' };
  const OS_ICONS = { Windows:'🪟', Mac:'🍎', iOS:'📱', Android:'🤖', Linux:'🐧' };
  const DEV_ICONS = { PC:'🖥️', Mobile:'📱', Tablet:'💊', Browser:'🌐' };
  // --------- main load ---------
  let countdown = REFRESH_MS / 1000;
  let countdownTimer;
  function startCountdown() {
    clearInterval(countdownTimer);
    countdown = REFRESH_MS / 1000;
    $('countdown').textContent = countdown;
    countdownTimer = setInterval(() => {
      countdown--;
      if (countdown <= 0) countdown = REFRESH_MS / 1000;
      $('countdown').textContent = countdown;
    }, 1000);
  }
  async function load() {
    let data;
    try {
      const r = await fetch('/api/stats', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
    } catch (e) {
      console.error('stats fetch failed', e);
      return;
    }
    renderKpis(data);
    renderHourly(data.hourly || []);
    renderDaily(data.daily || []);
    renderBars('bars-browsers', data.browsers, BROWSER_ICONS);
    renderBars('bars-os', data.os, OS_ICONS);
    renderBars('bars-deviceTypes', data.deviceTypes, DEV_ICONS);
    renderBars('bars-devices', data.devices);
    renderBars('bars-screens', data.screenSizes);
    renderBars('bars-langs', data.languages);
    fillTable('tbl-pages', data.topPages, r => [r.url || '(unknown)', r.n]);
    fillTable('tbl-refs',  data.topReferrers, r => [r.ref || '(direct)', r.n]);
    fillTable('tbl-cities', data.topCities, r => [r.city || '(unknown)', r.n]);
    fillTable('tbl-slow',  data.slowestPages, r => [r.url, r.avgMs + ' ms']);
    renderFeed(data.timeline || []);
    if (window.d3 && window.topojson) drawMap(data.geo || []);
    startCountdown();
  }
  // --------- KPIs ---------
  const prev = {};
  function setKpi(id, value) {
    const el = $(id);
    if (!el) return;
    if (prev[id] !== undefined && prev[id] !== value) {
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
    }
    el.textContent = value;
    prev[id] = value;
  }
  function fmt(n) { return Number(n || 0).toLocaleString(); }
  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    if (sec < 60) return sec + 's';
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}m ${s}s`;
  }
  function renderKpis(d) {
    setKpi('kpi-views', fmt(d.totalPageViews));
    setKpi('kpi-users', fmt(d.uniqueUsers));
    setKpi('kpi-sessions', fmt(d.sessions));
    setKpi('kpi-session-dur', fmtDuration(d.avgSessionSec));
    setKpi('kpi-bounce', ((d.bounceRate || 0) * 100).toFixed(1) + '%');
    setKpi('kpi-load', (d.avgLoadSpeed || 0).toFixed(2) + 's');
    setKpi('kpi-errors', fmt(d.jsErrors));
    setKpi('kpi-newret', `${fmt(d.newUsers)} / ${fmt(d.returningUsers)}`);
  }
  // --------- Charts ---------
  function lineChart(canvasId, points, labelFn) {
    if (!window.Chart) return;
    const ctx = $(canvasId).getContext('2d');
    if (window['_c_' + canvasId]) window['_c_' + canvasId].destroy();
    const grad = ctx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, 'rgba(88,166,255,.4)');
    grad.addColorStop(1, 'rgba(88,166,255,0)');
    window['_c_' + canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: points.map(p => labelFn(p.t)),
        datasets: [{
          data: points.map(p => p.n),
          borderColor: '#58a6ff', backgroundColor: grad,
          fill: true, tension: .35, pointRadius: 0, borderWidth: 2,
        }],
      },
      options: {
        animation: { duration: 800 },
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: '#11161d', borderColor: '#30363d', borderWidth: 1, padding: 10,
        }},
        scales: {
          x: { grid: { color: 'rgba(88,166,255,.06)' }, ticks: { color: '#8b949e', maxTicksLimit: 8 } },
          y: { grid: { color: 'rgba(88,166,255,.06)' }, ticks: { color: '#8b949e', beginAtZero: true } },
        },
      },
    });
  }
  function renderHourly(points) {
    lineChart('chart-hourly', points, t => new Date(t).getHours() + ':00');
  }
  function renderDaily(points) {
    lineChart('chart-daily', points, t => {
      const d = new Date(t);
      return (d.getMonth() + 1) + '/' + d.getDate();
    });
  }
  // --------- Bars ---------
  function renderBars(elId, rows, icons = {}) {
    const el = $(elId);
    if (!el) return;
    rows = rows || [];
    if (!rows.length) { el.innerHTML = '<div class="muted">No data yet</div>'; return; }
    const max = Math.max(1, ...rows.map(r => r.n));
    el.innerHTML = rows.map(r => {
      const ico = Object.entries(icons).find(([k]) => (r.name || '').includes(k))?.[1] || '';
      const pct = (r.n / max * 100).toFixed(1);
      return `
        <div class="bar-row">
          <div class="bar-name"><span class="ico">${ico}</span>${escapeHtml(r.name || '')}</div>
          <div class="bar-count">${r.n}</div>
          <div class="bar-track"><div class="bar-fill" style="width:0%"></div></div>
        </div>`;
    }).join('');
    // animate fill on next frame
    requestAnimationFrame(() => {
      el.querySelectorAll('.bar-fill').forEach((bar, i) => {
        const pct = (rows[i].n / max * 100).toFixed(1);
        bar.style.width = pct + '%';
      });
    });
  }
  // --------- Tables ---------
  function fillTable(id, rows, fn) {
    const el = $(id);
    if (!el) return;
    rows = rows || [];
    el.innerHTML = rows.length
      ? rows.map(r => {
          const [a, b] = fn(r);
          return `<tr><td class="url">${escapeHtml(String(a))}</td><td>${escapeHtml(String(b))}</td></tr>`;
        }).join('')
      : `<tr><td colspan="2" class="muted">No data yet</td></tr>`;
  }
  // --------- Feed (animated, NEW flash) ---------
  const seenEvents = new Set();
  let firstFeedLoad = true;
  function renderFeed(rows) {
    const el = $('feed');
    if (!el) return;
    if (!rows.length) {
      if (firstFeedLoad) el.innerHTML = '<li class="muted" style="padding:14px">Waiting for events…</li>';
      firstFeedLoad = false;
      return;
    }
    const newKeys = new Set();
    const html = rows.map(r => {
      const key = `${r.t}|${r.text}`;
      newKeys.add(key);
      const isNew = !firstFeedLoad && !seenEvents.has(key);
      const kind = (r.kind || 'view').toLowerCase();
      const ico = kind === 'error' ? '✖' : kind === 'event' ? '◆' : '›';
      const ts = new Date(r.t).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      return `<li class="feed-item ${kind}${isNew ? ' new' : ''}">
        <span class="kind">${ico}</span>
        <span class="ts">${ts}</span>
        <span class="text">${escapeHtml(r.text || '')}</span>
      </li>`;
    }).join('');
    el.innerHTML = html;
    seenEvents.clear();
    newKeys.forEach(k => seenEvents.add(k));
    firstFeedLoad = false;
  }
  // --------- World map (D3 + TopoJSON, animated pings) ---------
  let worldCache;
  async function drawMap(geo) {
    const el = $('map');
    el.innerHTML = '';
    const w = el.clientWidth, h = el.clientHeight || 460;
    const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${w} ${h}`);
    if (!worldCache) {
      worldCache = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
        .then(r => r.json());
    }
    const countries = topojson.feature(worldCache, worldCache.objects.countries).features;
    const counts = new Map(geo.map(g => [fixCountry(g.country), g.n]));
    const max = Math.max(1, ...geo.map(g => g.n));
    const color = d3.scaleSequential(d3.interpolate('#161b22', '#58a6ff')).domain([0, max]);
    const proj = d3.geoNaturalEarth1().fitSize([w, h], { type: 'Sphere' });
    const path = d3.geoPath(proj);
    // tooltip
    const tip = document.createElement('div');
    tip.className = 'map-tip';
    el.appendChild(tip);
    svg.append('g').selectAll('path').data(countries).enter().append('path')
      .attr('class', 'country').attr('d', path)
      .attr('fill', d => { const n = counts.get(d.properties.name) || 0; return n ? color(n) : '#161b22'; })
      .attr('stroke', '#0d1117').attr('stroke-width', 0.5)
      .on('mousemove', function (evt, d) {
        const n = counts.get(d.properties.name) || 0;
        tip.textContent = `${d.properties.name}: ${n} view${n === 1 ? '' : 's'}`;
        const rect = el.getBoundingClientRect();
        tip.style.left = (evt.clientX - rect.left) + 'px';
        tip.style.top  = (evt.clientY - rect.top)  + 'px';
        tip.style.opacity = 1;
      })
      .on('mouseleave', () => { tip.style.opacity = 0; });
    // animated pings on top countries
    const pings = svg.append('g');
    geo.slice(0, 8).forEach((g, i) => {
      const feat = countries.find(c => c.properties.name === fixCountry(g.country));
      if (!feat) return;
      const [x, y] = path.centroid(feat);
      if (isNaN(x)) return;
      pings.append('circle').attr('class', 'ping-core').attr('cx', x).attr('cy', y).attr('r', 2.5);
      const ring = pings.append('circle').attr('class', 'ping').attr('cx', x).attr('cy', y).attr('r', 1);
      ring.node().style.animationDelay = (i * 0.25) + 's';
    });
  }
  // --------- util ---------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  load();
  setInterval(load, REFRESH_MS);
})();

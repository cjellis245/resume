(async function () {
  const $ = (id) => document.getElementById(id);

  async function load() {
    let data;
    try {
      const r = await fetch('/api/stats');
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
    } catch (e) {
      console.error('stats fetch failed', e);
      return;
    }

    // 1. Baseline stats
    if ($('total')) $('total').textContent = (data.totalPageViews || 0).toLocaleString();

    // 2. Performance & Health Metrics
    if ($('errors')) $('errors').textContent = data.jsErrors || 0;
    if ($('speed')) $('speed').textContent = (data.avgLoadSpeed || 0).toFixed(2) + 's';
    if ($('apdex')) {
      const score = data.apdexScore || 0;
      const label = score < 0.85 ? 'Fair' : (score < 0.94 ? 'Good' : 'Excellent');
      $('apdex').textContent = `${score.toFixed(2)} (${label})`;
    }

    // 3. Browser Bars
    const barContainer = $('browser-bars');
    if (barContainer && data.browsers) {
      const maxCount = Math.max(...data.browsers.map(b => b.count), 1);
      barContainer.innerHTML = data.browsers.map(b => `
        <div class="bar-container">
            <div class="bar-label"><span>${b.browser}</span><span style="color: #8b949e;">${b.count} hits</span></div>
            <div class="bar-track"><div class="bar-fill" style="width: ${(b.count / maxCount) * 100}%"></div></div>
        </div>`).join('');
    }

    // 4. Terminal Ticker
    const ticker = $('ticker');
    if (ticker && data.timeline) {
      ticker.innerHTML = data.timeline.map(event => {
        const dateObj = new Date(event.eventTime);
        const time = !isNaN(dateObj) ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Unknown';
        const styledText = (event.logText || '').replace(/\*(.*?)\*/g, '<em>$1</em>');
        return `<div class="terminal-line"><span class="terminal-time">[${time}]</span><span class="terminal-text">${styledText}</span></div>`;
      }).join('');
    }

    // 5. Tables
    const fillTable = (id, rows, keyCol, label) => {
      const t = $(id);
      if(!t) return;
      t.innerHTML = rows.length
        ? rows.map(r => `<tr><td>${escapeHtml(r[keyCol] || '(direct)')}</td><td class="num">${r.n}</td></tr>`).join('')
        : `<tr><td colspan="2" style="color:#6e7681">No ${label} yet</td></tr>`;
    };
    fillTable('pages', data.topPages || [], 'url', 'pages');
    fillTable('refs',  data.topReferrers || [], 'ref', 'referrers');

    // 6. Chart
    if (window.Chart && data.hourly) {
      const ctx = $('spark')?.getContext('2d');
      if (ctx) {
        if (window._chart) window._chart.destroy();
        window._chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: data.hourly.map(p => new Date(p.t).getHours() + ':00'),
            datasets: [{ data: data.hourly.map(p => p.n), borderColor: '#58a6ff', backgroundColor: 'rgba(88,166,255,.15)', fill: true, tension: .3, pointRadius: 0 }]
          },
          options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#8b949e' } }, y: { ticks: { color: '#8b949e' }, beginAtZero: true } } }
        });
      }
    }

    // 7. MAP RENDER (Fixed: Isolated and Awaited)
    try {
        if (window.d3 && window.topojson && data.geo) {
            await drawMap(data.geo);
        }
    } catch (err) {
        console.error("Map rendering failed:", err);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  async function drawMap(geo) {
    const el = document.getElementById('map');
    if (!el) return;
    el.innerHTML = '';
    const w = el.clientWidth, h = 360;
    const svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
    
    // Fetch world data only once or cache it to improve speed
    const world = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json());
    const countries = topojson.feature(world, world.objects.countries).features;
    const counts = new Map(geo.map(g => [g.country, g.n]));
    const max = Math.max(1, ...geo.map(g => g.n));
    const color = d3.scaleSequential(d3.interpolateBlues).domain([0, max]);
    const proj = d3.geoNaturalEarth1().fitSize([w, h], { type: 'Sphere' });
    const path = d3.geoPath(proj);
    
    svg.selectAll('path').data(countries).enter().append('path')
      .attr('d', path)
      .attr('fill', d => { const n = counts.get(d.properties.name) || 0; return n ? color(n) : '#21262d'; })
      .attr('stroke', '#0d1117').attr('stroke-width', 0.4)
      .append('title').text(d => `${d.properties.name}: ${counts.get(d.properties.name) || 0}`);
  }

  load();
  // Set to 5 seconds for "real-time" feel
  setInterval(load, 5000); 
})();

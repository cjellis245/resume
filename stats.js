// Public stats dashboard. Fetches /api/stats every 60s and renders.
(async function () {
  const $ = (id) => document.getElementById(id);
  async function load() {
    let data;
    try {
      const r = await fetch('/api/stats');
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
    } catch (e) {
      $('total').textContent = '—';
      console.error('stats fetch failed', e);
      return;
    }
    $('total').textContent = (data.total || 0).toLocaleString();
    // Tables
    const fillTable = (id, rows, keyCol, label) => {
      const t = $(id);
      t.innerHTML = rows.length
        ? rows.map(r => `<tr><td>${escapeHtml(r[keyCol] || '(direct)')}</td><td class="num">${r.n}</td></tr>`).join('')
        : `<tr><td colspan="2" style="color:#6e7681">No ${label} yet</td></tr>`;
    };
    fillTable('pages', data.topPages || [], 'url', 'pages');
    fillTable('refs',  data.topReferrers || [], 'ref', 'referrers');
    // Hourly trend (Chart.js)
    if (window.Chart && data.hourly) {
      const ctx = $('spark').getContext('2d');
      if (window._chart) window._chart.destroy();
      window._chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.hourly.map(p => new Date(p.t).getHours() + ':00'),
          datasets: [{ data: data.hourly.map(p => p.n), borderColor: '#58a6ff',
            backgroundColor: 'rgba(88,166,255,.15)', fill: true, tension: .3, pointRadius: 0 }]
        },
        options: { plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: '#8b949e' } }, y: { ticks: { color: '#8b949e' }, beginAtZero: true } } }
      });
    }
    // World map (D3 + TopoJSON)
    if (window.d3 && window.topojson && data.geo) {
      drawMap(data.geo);
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  async function drawMap(geo) {
    const el = document.getElementById('map');
    el.innerHTML = '';
    const w = el.clientWidth, h = 360;
    const svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
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
  setInterval(load, 60_000);
})();

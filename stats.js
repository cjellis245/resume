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

    // 1. Existing baseline stats
    $('total').textContent = (data.totalPageViews || 0).toLocaleString();

    // 2. NEW: Render Code Health & Performance Metrics
    if ($('errors')) $('errors').textContent = data.jsErrors || 0;
    if ($('speed')) $('speed').textContent = (data.avgLoadSpeed ? data.avgLoadSpeed.toFixed(2) : '0') + 's';
    if ($('apdex')) {
      const score = data.apdexScore || 0;
      let label = score < 0.85 ? 'Fair' : (score < 0.94 ? 'Good' : 'Excellent');
      $('apdex').textContent = `${score.toFixed(2)} (${label})`;
    }

    // 3. NEW: Browser Environment Bars
    const barContainer = $('browser-bars');
    if (barContainer && data.browsers) {
      const maxCount = Math.max(...data.browsers.map(b => b.count), 1);
      barContainer.innerHTML = data.browsers.map(b => `
        <div class="bar-container">
            <div class="bar-label"><span>${b.browser}</span><span style="color: #8b949e;">${b.count} hits</span></div>
            <div class="bar-track"><div class="bar-fill" style="width: ${(b.count / maxCount) * 100}%"></div></div>
        </div>`).join('');
    }

    // 4. NEW: Futuristic Terminal Ticker
    const ticker = $('ticker');
    if (ticker && data.timeline) {
      ticker.innerHTML = data.timeline.map(event => {
        const time = new Date(event.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const styledText = event.logText.replace(/\*(.*?)\*/g, '<em>$1</em>');
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

    // 6. Hourly trend (Chart.js)
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

    // 7. World map
    if (window.d3 && window.topojson && data.geo) {
      drawMap(data.geo);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  async function drawMap(geo) {
    // (Keep your existing drawMap logic here exactly as it was)
    // ...
  }

  load();
  setInterval(load, 60_000);
})();

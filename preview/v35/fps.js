(async function () {
  DS.game.act('kickoff');
  await new Promise(function (r) { setTimeout(r, 2500); });
  var n = 0, t0 = performance.now();
  await new Promise(function (res) {
    function tick() { n++; if (performance.now() - t0 < 2000) { requestAnimationFrame(tick); } else { res(); } }
    requestAnimationFrame(tick);
  });
  var fps = n / ((performance.now() - t0) / 1000);
  return JSON.stringify({ fps: Math.round(fps * 10) / 10, clock: Math.round(DS.Match.clock * 10) / 10, errs: window.__DS_ERRS });
})()

(async function () {
  var log = [];
  function click(sel, act) {
    var el = act ? document.querySelector('[data-act="' + act + '"]') : document.querySelector(sel);
    if (el) { el.click(); return true; }
    return false;
  }
  DS.game.act('kickoff');
  await new Promise(function (r) { setTimeout(r, 2600); });
  DS.Match.setSpeed(3);
  var t0 = Date.now(), halfDone = false, started = false;
  while (Date.now() - t0 < 105000) {
    await new Promise(function (r) { setTimeout(r, 700); });
    if (!started && DS.Match.running) { started = true; }
    /* 하프타임 추천서 / 결과서가 뜨면 진행 버튼을 누른다 */
    if (click(null, 'advstart')) { log.push('advstart ' + Math.round(DS.Match.clock)); continue; }
    if (!halfDone && DS.Match.halftime) { halfDone = true; log.push('halftime ' + Math.round(DS.Match.clock)); }
    if (DS.Match.phase === 'ended') { break; }
  }
  var out = {
    started: started, phase: DS.Match.phase, clock: Math.round(DS.Match.clock * 10) / 10,
    score: [DS.Match.homeScore, DS.Match.awayScore],
    half: halfDone, log: log,
    errs: (window.__DS_ERRS || []).slice(0, 5)
  };
  try { out.v35 = DS.Match.v35(); } catch (e) { out.v35 = null; }
  return JSON.stringify(out);
})()

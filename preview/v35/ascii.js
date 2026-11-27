(function () {
  var P = DS.PIXEL;
  var dir = (window.__DIR || 'down');
  var pose = (window.__POSE || 'idle');
  var f = (window.__F || 0);
  var lk = window.__LOOK || { kit: 'home', hair: 'spiky', hairColor: '#23262e', skin: 1, acc: 'none' };
  var cv = P.render(lk, dir, pose, f, 0.4);
  var c2 = cv.getContext('2d');
  var im = c2.getImageData(0, 0, cv.width, cv.height).data;
  var map = {}, letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', n = 0, legend = {}, out = [];
  for (var y = 0; y < cv.height; y++) {
    var row = '';
    for (var x = 0; x < cv.width; x++) {
      var i = (y * cv.width + x) * 4;
      if (!im[i + 3]) { row += '.'; continue; }
      var k = im[i] + ',' + im[i + 1] + ',' + im[i + 2];
      if (!(k in map)) { map[k] = letters[n]; legend[letters[n]] = k; n++; }
      row += map[k];
    }
    out.push(row);
  }
  var leg = []; for (var kk in legend) leg.push(kk + '=' + legend[kk]);
  return out.join('\n') + '\n---\n' + leg.join('  ');
})()

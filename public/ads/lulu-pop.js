/* KDP LuluStream popunder - max 3 opens per visitor per 24h, 60s gap */
(function () {
  'use strict';
  if (window.__kdpLuluPop) return;
  window.__kdpLuluPop = true;

  var URL = 'https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b';
  var KEY = 'kdp_lulu_pop';
  var MAX = 3;
  var DAY = 24 * 60 * 60 * 1000;
  var GAP = 60 * 1000;
  var memState = { n: 0, t: 0, last: 0 };

  function load() {
    var s = null;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) s = JSON.parse(raw);
    } catch (e) { s = null; }
    if (!s || typeof s.n !== 'number' || typeof s.t !== 'number') s = memState;
    var now = new Date().getTime();
    if (!s.t || now - s.t > DAY) s = { n: 0, t: now, last: 0 };
    if (typeof s.last !== 'number') s.last = 0;
    return s;
  }

  function save(s) {
    memState = s;
    try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  function onTap() {
    var s = load();
    var now = new Date().getTime();
    if (s.n >= MAX) return;
    if (s.last && now - s.last < GAP) return;
    var w = null;
    try { w = window.open(URL, '_blank'); } catch (e) { w = null; }
    if (w) {
      s.n = s.n + 1;
      s.last = now;
      save(s);
    }
  }

  try {
    document.addEventListener('click', onTap, true);
    document.addEventListener('touchend', onTap, true);
  } catch (e) {}
})();

/* KDP LuluStream popunder - up to 3 per video (keyed by Lulu code), 30s gap, safety cap 30 per 24h per browser */
(function () {
  'use strict';
  if (window.__kdpLuluPop) return;
  window.__kdpLuluPop = true;

  var URL = 'https://fozekikikiminu.com/api/v1/direct/587547ff73c844b39ab9f02d1285154b';
  var KEY = 'kdp_lulu_pop_v3';
  var CAP = 30;
  var PER_VIDEO = 3;
  var DAY = 24 * 60 * 60 * 1000;
  var GAP = 30 * 1000;
  var MAX_CODES = 200;
  var memState = { t: 0, n: 0, last: 0, done: {} };

  function codeFrom(str) {
    if (!str) return '';
    var m = /\/(?:e|d|v|embed|f)\/([A-Za-z0-9_-]{6,})/.exec(String(str));
    return m ? m[1] : '';
  }

  function videoCode() {
    var c = '';
    try { c = codeFrom(window.location.pathname); } catch (e) {}
    if (!c) { try { c = codeFrom(window.location.href); } catch (e) {} }
    if (!c) { try { c = codeFrom(document.referrer); } catch (e) {} }
    if (!c) {
      try {
        var f = document.querySelector('iframe[src*="/e/"]');
        if (f) c = codeFrom(f.getAttribute('src'));
      } catch (e) {}
    }
    if (!c) {
      try { c = 'p:' + window.location.host + window.location.pathname; } catch (e) { c = 'unknown'; }
    }
    return c;
  }

  function load() {
    var s = null;
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) s = JSON.parse(raw);
    } catch (e) { s = null; }
    if (!s || typeof s.t !== 'number' || typeof s.n !== 'number') s = memState;
    if (!s.done || typeof s.done !== 'object') s.done = {};
    if (typeof s.last !== 'number') s.last = 0;
    var now = new Date().getTime();
    if (!s.t || now - s.t > DAY) {
      s.t = now;
      s.n = 0;
    }
    var k;
    for (k in s.done) {
      if (!Object.prototype.hasOwnProperty.call(s.done, k)) continue;
      var e = s.done[k];
      if (!e || typeof e.c !== 'number' || typeof e.t !== 'number' || now - e.t > DAY) delete s.done[k];
    }
    return s;
  }

  function trim(s) {
    var keys = [];
    var k;
    for (k in s.done) {
      if (Object.prototype.hasOwnProperty.call(s.done, k)) keys.push(k);
    }
    if (keys.length <= MAX_CODES) return;
    keys.sort(function (a, b) { return s.done[a].t - s.done[b].t; });
    for (var i = 0; i < keys.length - MAX_CODES; i++) delete s.done[keys[i]];
  }

  function save(s) {
    trim(s);
    memState = s;
    try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }

  var CODE = videoCode();

  function onTap() {
    var s = load();
    var now = new Date().getTime();
    var v = s.done[CODE];
    if (v && v.c >= PER_VIDEO) return;
    if (s.n >= CAP) return;
    if (s.last && now - s.last < GAP) return;
    var w = null;
    try { w = window.open(URL, '_blank'); } catch (e) { w = null; }
    if (w) {
      try { w.opener = null; } catch (e) {}
      s.n = s.n + 1;
      s.last = now;
      if (!v) v = { c: 0, t: now };
      v.c = v.c + 1;
      s.done[CODE] = v;
      save(s);
      if (v.c >= PER_VIDEO) try {
        document.removeEventListener('click', onTap, true);
        document.removeEventListener('touchend', onTap, true);
      } catch (e) {}
    }
  }

  try {
    document.addEventListener('click', onTap, true);
    document.addEventListener('touchend', onTap, true);
  } catch (e) {}
})();

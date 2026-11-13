/* 이동 경로 구간 계산. 그래프는 이 구간 목록을 그대로 점선으로 그려요.
   (시작점-끝점 한 줄이 아니라, 기록된 모든 좌표를 방문 순서대로 잇는 n개의 구간) */
(function (root) {
  'use strict';
  var GD = root.GD = root.GD || {}; GD.viz = GD.viz || {};
  GD.viz.trajectory = {
    /* xs: 방문한 x 좌표 배열, f: 함수 → [{index, from:{x,y}, to:{x,y}}] */
    segments: function (xs, f) {
      var out = [];
      for (var i = 0; i < xs.length - 1; i++) {
        out.push({ index: i, from: { x: xs[i], y: f(xs[i]) }, to: { x: xs[i + 1], y: f(xs[i + 1]) } });
      }
      return out;
    },
    /* 구간 목록이 실제 방문 좌표와 정확히 이어지는지 확인(검증용) */
    isContinuous: function (segs, xs) {
      if (segs.length !== Math.max(0, xs.length - 1)) return false;
      return segs.every(function (s, i) { return s.from.x === xs[i] && s.to.x === xs[i + 1] && (i === 0 || segs[i - 1].to.x === s.from.x); });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);

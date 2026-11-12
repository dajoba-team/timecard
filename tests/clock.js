// 시험용 시계 고정: 예시 데이터(writes.json)가 2026년 11월 기준이라, 날짜가 들어간 시험은 시계를 그날로 맞춰요.
// 사용: require('./clock')('2026-11-11T11:00:00+09:00')   (*.test.js가 아니라 run-all이 따로 실행하지 않음)
module.exports = iso => {
  const RealDate = Date, off = new RealDate(iso) - RealDate.now();
  global.Date = class extends RealDate {
    constructor(...a){ if (a.length) super(...a); else super(RealDate.now() + off); }
    static now(){ return RealDate.now() + off; }
  };
};

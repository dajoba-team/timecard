// 매일 자동 백업 규칙 (Edge Function과 시험이 함께 씀. Deno·Node 모두에서 돌아가는 순수 JS)
//
// - 한국시간 새벽 4시가 지나면 하루 한 번, tc_docs의 모든 기록을 파일 하나(.json)로 만들어
//   비공개 Storage 버킷 tc-backups 에 {날짜}.json 으로 저장해요. 90일 지난 파일은 지워요.
// - 파일 모양은 사장님 화면 '전체 백업'(public/index.html BACT.bkAll)과 같아요 (format 1).
//   그래서 scripts/import.mjs로 그대로 되살릴 수 있어요. 업무 지시·보고는 extra에 따로 넣어요.
// - 사진 파일은 넣지 않아요 (기록에는 사진 번호만).

export const BACKUP_BUCKET = "tc-backups";
export const BACKUP_KEEP_DAYS = 90;
export const BACKUP_HOUR = 4;   // 한국시간 새벽 4시 이후 첫 실행 (5분마다 도는 예약 작업이 부름)
const KST = 9 * 3600 * 1000;

export const kstHour = ms => new Date(ms + KST).getUTCHours();
export const kstDay = ms => new Date(ms + KST).toISOString().slice(0, 10);
export const backupName = ds => `${ds}.json`;

// rows: [{ collection, id, data }] (지운 문서 제외) → 앱 '전체 백업'과 같은 모양
export function buildBackup(rows, now, storeName) {
  const by = new Map();
  for (const r of rows) { if (!by.has(r.collection)) by.set(r.collection, []); by.get(r.collection).push(r); }
  const list = c => (by.get(c) || []).map(r => ({ id: r.id, ...r.data }));
  const monthly = re => {
    const out = {};
    for (const [c, rs] of by) { const m = re.exec(c); if (m) out[m[1]] = rs.map(r => ({ id: r.id, ...r.data })).sort((a, b) => (a.id < b.id ? -1 : 1)); }
    return out;
  };
  const config = (by.get("config") || []).find(r => r.id === "main")?.data || {};
  const sign = (by.get("config") || []).find(r => r.id === "sign")?.data;
  const staff = list("staff").sort((a, b) => (a.order || 0) - (b.order || 0));
  const punches = monthly(/^months\/(\d{4}-\d{2})\/punches$/);
  const contracts = list("contracts");
  const reports = Object.fromEntries((by.get("reports") || []).map(r => [r.id, r.data]));
  const tasks = list("tasks"), taskReads = list("task_reads"), taskReports = monthly(/^months\/(\d{4}-\d{2})\/task_reports$/);
  return {
    app: "가게 타임카드 백업", format: 1, exportedAt: new Date(now).toISOString(), store: storeName || config.storeName || "우리 가게",
    auto: true,
    config, ownerSign: (sign && sign.data) || "", staff, punches, contracts, reports,
    extra: { tasks, task_reads: taskReads, task_reports: taskReports, ot: list("ot"), awards: list("awards"), praise: list("praise"), award_reacts: list("award_reacts"), badges: list("badges"), thanks: list("thanks") },
    counts: {
      staff: staff.length, punches: Object.values(punches).reduce((t, a) => t + a.length, 0), months: Object.keys(punches).length, contracts: contracts.length,
      tasks: tasks.length, task_reports: Object.values(taskReports).reduce((t, a) => t + a.length, 0),
    },
    note: "매일 자동 백업. 사진 파일은 포함되지 않았어요 (기록의 inPhoto/outPhoto, 보고의 photos는 사진 번호).",
  };
}

// 보관 기간이 지난 파일 이름 (이름이 날짜.json인 것만)
export function oldBackupNames(names, now, keepDays = BACKUP_KEEP_DAYS) {
  const cut = kstDay(now - keepDays * 86400000);
  return names.filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) < cut);
}

// 슬랙 알림 (Supabase Edge Function: tc-notyet-check) — 장부와 같은 프로젝트, 타임카드 자원은 tc 접두어
//   미출근 · 출근 · 퇴근 · 업무 보고 도착 · 업무 마감 지남 (이름은 처음 만든 '미출근 확인' 그대로 둠: 예약 작업이 이 이름을 부름)
//
// - 5분마다 pg_cron이 부름 (supabase/002_notyet_alert.sql). 헤더 x-cron-secret = TC_CRON_SECRET
// - 앱이 출퇴근을 찍거나 업무 보고를 보낼 때 { kick: true }로 바로 한 번 더 부름 (5분 기다리지 않게). 하는 일은 예약 실행과 같음
// - 앱의 '시험 알림 보내기'는 로그인한 사장님 토큰으로 { test: true }를 보냄 (타임카드 권한 있는 계정만)
// - 가게 설정(config/main)의 slack.on이 꺼져 있으면 아무것도 안 보냄. slack.ev로 종류별 켜기·끄기 (없으면 모두 켜짐)
// - 같은 알림은 한 번만: months/{YYYY-MM}/alerts/{표시 id} 를 먼저 만들고 보냄
//     미출근 {직원}_{날짜} / 출근 in_{직원}_{날짜} / 퇴근 out_{직원}_{날짜} / 보고 rep_{보고id}_{회차} / 마감 due_{업무}_{날짜}
// - 출근·퇴근·보고는 최근 1시간 안의 것만 (태블릿 인터넷이 1시간 넘게 끊겼다가 보낸 기록은 알리지 않음)
// - 판단 규칙은 rules.mjs (tests/notyet.test.js, tests/slack-events.test.js가 앱 규칙과 같은지 확인)
// - 매일 자동 백업도 여기서 해요 (backup.mjs): 한국시간 새벽 4시 이후 첫 실행 때 하루 한 번, 비공개 버킷 tc-backups/{날짜}.json,
//   90일 지난 파일은 지움. 슬랙을 꺼 둬도 돌아요. 사장님 화면: { backupNow: true } 지금 백업, { backupUrl: 날짜 } 내려받기 주소(1분)
// - 결과는 status/alert 문서에 남겨서 앱 화면에 보여 줌
//
// 필요한 secret (supabase secrets set ...):
//   TC_SLACK_WEBHOOK_URL  슬랙 Incoming Webhook 주소
//   TC_CRON_SECRET        pg_cron이 보내는 임의의 긴 문자열 (Vault의 tc_cron_secret과 같은 값)
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY는 Supabase가 자동으로 넣어 줌
//
// 배포: npx supabase functions deploy tc-notyet-check --no-verify-jwt --project-ref <프로젝트ref>
//       (인증은 아래 코드에서 직접 확인해요)

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { kstDate, notyetList, notyetMessage, punchEvents, punchMessage, reportEvents, reportMessage, dueEvents, dueMessage, otEvents, otMessage } from "./rules.mjs";
import { BACKUP_BUCKET, BACKUP_HOUR, BACKUP_KEEP_DAYS, backupName, buildBackup, kstDay, kstHour, oldBackupNames } from "./backup.mjs";
import { sendPush } from "./webpush.mjs";
import { pushCfg, pushPayload, preShiftEvents, warnPushEvents } from "./pushrules.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const DOCS = "tc_docs";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const getDoc = async (collection: string, id: string) => {
  const { data, error } = await sb.from(DOCS).select("data").eq("collection", collection).eq("id", id)
    .is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.data : null;
};
const listDocs = async (collection: string, idLike?: string) => {
  let q = sb.from(DOCS).select("id,data").eq("collection", collection).is("deleted_at", null);
  if (idLike) q = q.like("id", idLike);
  const { data, error } = await q.limit(1000);
  if (error) throw new Error(error.message);
  return data as { id: string; data: Record<string, unknown> }[];
};
const setDoc = async (collection: string, id: string, data: unknown) => {
  const { error } = await sb.from(DOCS).upsert({ collection, id, data, deleted_at: null }, { onConflict: "collection,id" });
  if (error) throw new Error(error.message);
};
const logStatus = (s: Record<string, unknown>) => setDoc("status", "alert", { at: Date.now(), ...s }).catch(e => console.error("status", e));

async function sendSlack(text: string) {
  const url = Deno.env.get("TC_SLACK_WEBHOOK_URL");
  if (!url) throw new Error("슬랙 주소(TC_SLACK_WEBHOOK_URL)가 설정되지 않았어요");
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  if (!r.ok) throw new Error(`슬랙이 거절했어요 (${r.status} ${(await r.text()).slice(0, 100)})`);
}

// ===== 매일 자동 백업 (backup.mjs) =====
// 비공개 버킷 tc-backups 는 서버(service_role)만 열 수 있어요. 처음 한 번 이 함수가 버킷을 만들어요 (SQL 필요 없음).
// 사장님 화면은 backups/{날짜} 문서로 목록을 보고, 내려받을 때 { backupUrl: 날짜 }로 1분짜리 주소를 받아요.
const allRows = async () => {
  const out: { collection: string; id: string; data: Record<string, unknown> }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(DOCS).select("collection,id,data").is("deleted_at", null)
      .order("collection").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as typeof out));
    if (!data || data.length < 1000) return out;
  }
};
async function ensureBucket() {
  const { error } = await sb.storage.getBucket(BACKUP_BUCKET);
  if (!error) return;
  const { error: e2 } = await sb.storage.createBucket(BACKUP_BUCKET, { public: false, fileSizeLimit: 52428800, allowedMimeTypes: ["application/json"] });
  if (e2 && !/exist/i.test(e2.message)) throw new Error("백업 보관함을 만들지 못했어요: " + e2.message);
}
async function cleanOldBackups(now: number) {
  const names: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BACKUP_BUCKET).list("", { limit: 1000, offset });
    if (error) throw new Error(error.message);
    names.push(...(data || []).map((o: { name: string }) => o.name));
    if (!data || data.length < 1000) break;
  }
  const old = oldBackupNames(names, now);
  if (old.length) {
    const { error } = await sb.storage.from(BACKUP_BUCKET).remove(old);
    if (error) throw new Error(error.message);
    const ids = old.map(n => n.slice(0, 10));
    await sb.from(DOCS).delete().eq("collection", "backups").in("id", ids);
  }
  return old.length;
}
// force: 사장님 화면 '지금 백업하기' (시각·하루 한 번 확인 없이, 오늘 파일을 새로 씀)
async function runBackup(now: number, store: string, force = false) {
  const ds = kstDay(now);
  if (!force) {
    if (kstHour(now) < BACKUP_HOUR) return null;
    const { error } = await sb.from(DOCS).insert({ collection: "backups", id: ds, data: { at: now, running: true } });
    if (error) { if (error.code === "23505") return null; throw new Error(error.message); }   // 오늘 이미 함
  }
  try {
    const b = buildBackup(await allRows(), now, store);
    const text = JSON.stringify(b);
    await ensureBucket();
    const { error } = await sb.storage.from(BACKUP_BUCKET).upload(backupName(ds), text, { contentType: "application/json", upsert: true });
    if (error) throw new Error("백업 파일을 저장하지 못했어요: " + error.message);
    const removed = await cleanOldBackups(now);
    const info = { at: now, ok: true, date: ds, size: text.length, counts: b.counts, removed, manual: force, keepDays: BACKUP_KEEP_DAYS };
    await setDoc("backups", ds, info);
    await setDoc("status", "autobackup", info);
    return info;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (!force) await sb.from(DOCS).delete().eq("collection", "backups").eq("id", ds);   // 5분 뒤 다시 시도
    await setDoc("status", "autobackup", { at: now, ok: false, date: ds, err }).catch(() => {});
    console.error("backup", err);
    return { ok: false, err };
  }
}
async function backupLink(ds: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return { error: "날짜가 올바르지 않아요" };
  const { data, error } = await sb.storage.from(BACKUP_BUCKET).createSignedUrl(backupName(ds), 60, { download: `타임카드_자동백업_${ds}.json` });
  if (error || !data) return { error: "백업 파일을 찾지 못했어요" };
  return { url: data.signedUrl };
}

// ===== 직원 휴대폰 알림 (v46, webpush.mjs · pushrules.mjs) =====
// 슬랙을 꺼 둬도 돌아요. 가게 설정 push.on으로 켜기·끄기. 직원 휴대폰 구독은 push_subs/{직원}_{기기}
// secret: TC_VAPID_PUBLIC (앱 VAPID_PUBLIC과 같은 값), TC_VAPID_PRIVATE (JWK JSON)
const vapidKeys = () => {
  const pub = Deno.env.get("TC_VAPID_PUBLIC"), priv = Deno.env.get("TC_VAPID_PRIVATE");
  return pub && priv ? { publicKey: pub, privateJwk: JSON.parse(priv) } : null;
};
type Sub = { id: string; data: { staffId: string; sub: { endpoint: string; keys: { p256dh: string; auth: string } } } };
async function pushTo(subs: Sub[], staffId: string, payload: Record<string, unknown>, vapid: NonNullable<ReturnType<typeof vapidKeys>>) {
  let sent = 0;
  for (const s of subs.filter(x => x.data.staffId === staffId && x.data.sub?.endpoint)) {
    try {
      const r = await sendPush(s.data.sub, payload, vapid);
      if (r.ok) sent++;
      else if (r.gone) await sb.from(DOCS).update({ deleted_at: new Date().toISOString() }).eq("collection", "push_subs").eq("id", s.id);   // 알림을 끈 휴대폰
      else console.warn("push", r.status, s.id);
    } catch (e) { console.warn("push", s.id, e instanceof Error ? e.message : e); }
  }
  return sent;
}
async function runPush(config: Record<string, unknown>, now: number) {
  if (!pushCfg(config).on) return { skipped: "off" };
  const vapid = vapidKeys();
  if (!vapid) return { skipped: "no-keys" };
  const strikes = Object.fromEntries((await listDocs("strikes")).map(d => [d.id, d.data]));
  if (!Object.keys(strikes).length) return { sent: 0 };
  const subs = await listDocs("push_subs") as unknown as Sub[];
  if (!subs.length) return { sent: 0, subs: 0 };
  const ds = kstDate(now), ym = ds.slice(0, 7), alertsCol = `months/${ym}/alerts`;
  const staff = (await listDocs("staff")).map(d => ({ id: d.id, ...d.data }));
  const punches = Object.fromEntries((await listDocs(`months/${ym}/punches`, `%\\_${ds}`)).map(d => [d.id, d.data]));
  const evs = [...warnPushEvents({ config, strikes, staff, now }), ...preShiftEvents({ config, strikes, staff, punches, now })]
    .filter(e => subs.some(s => s.data.staffId === e.st.id));   // 알림을 켠 직원에게만
  let sent = 0;
  for (const ev of evs) {
    const { error } = await sb.from(DOCS).insert({ collection: alertsCol, id: ev.key, data: { at: now, kind: ev.kind, ch: "push", level: ev.level, staffId: ev.st.id } });
    if (error) { if (error.code === "23505") continue; throw new Error(error.message); }   // 이미 보냄
    sent += await pushTo(subs, ev.st.id, pushPayload(ev, config), vapid);
  }
  return { sent, events: evs.length };
}

async function authorized(req: Request) {
  const secret = Deno.env.get("TC_CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") === secret) return "cron";
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  const apps = data?.user?.app_metadata?.apps;
  return !error && data.user && Array.isArray(apps) && apps.includes("timecard") ? "user" : null;   // 장부 전용 계정은 거절
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const who = await authorized(req);
  if (!who) return json({ error: "unauthorized" }, 401);
  let body: { test?: boolean; backupUrl?: string; backupNow?: boolean; pushTest?: string } = {};
  try { body = await req.json(); } catch { /* 빈 본문 */ }
  // 직원 휴대폰 '시험 알림' (직원 휴대폰·사장님 화면에서, 로그인한 타임카드 계정만)
  if (body.pushTest) {
    if (who !== "user") return json({ error: "unauthorized" }, 401);
    const vapid = vapidKeys();
    if (!vapid) return json({ error: "알림 열쇠(TC_VAPID_*)가 설정되지 않았어요" }, 500);
    const subs = await listDocs("push_subs") as unknown as Sub[];
    const sid = String(body.pushTest), mine = subs.filter(s => s.data.staffId === sid);
    const sent = await pushTo(mine, sid, { title: "🔔 Thử thông báo · 시험 알림", body: "Thông báo đã sẵn sàng!\n알림이 잘 와요!", tag: "tc-test", url: "/" }, vapid);
    return json({ ok: sent > 0, sent, subs: mine.length });
  }
  // 백업 내려받기·지금 백업은 사장님 화면에서만 (예약 작업 비밀값으로는 안 됨)
  if ((body.backupUrl || body.backupNow) && who !== "user") return json({ error: "사장님 계정으로만 할 수 있어요" }, 403);
  if (body.backupUrl) { const r = await backupLink(String(body.backupUrl)); return json(r, r.error ? 404 : 200); }

  const now = Date.now();
  try {
    const config = (await getDoc("config", "main")) || {};
    const store = config.storeName || "우리 가게";

    if (body.test) {
      await sendSlack(`*[${store}] 슬랙 알림 시험*\n미출근·출근·퇴근·업무 보고 알림이 이 채널로 와요. 이 메시지가 휴대폰 알림으로 떴다면 준비 끝이에요.`);
      await logStatus({ ok: true, kind: "test", text: "시험 알림" });
      return json({ ok: true, sent: "test" });
    }
    if (body.backupNow) { const r = await runBackup(now, store, true); return json(r, r && r.ok ? 200 : 500); }
    // 매일 자동 백업: 슬랙을 꺼 둬도 돌아요. 실패해도 알림은 계속 보냄
    const backup = await runBackup(now, store).catch(e => ({ ok: false, err: e instanceof Error ? e.message : String(e) }));
    // 직원 휴대폰 알림 (지각 경고·출근 전): 슬랙을 꺼 둬도 돌아요. 실패해도 슬랙 알림은 계속
    const push = await runPush(config, now).catch(e => { console.error("push", e); return { ok: false, err: e instanceof Error ? e.message : String(e) }; });
    if (!config.slack || !config.slack.on) return json({ ok: true, skipped: "off", backup, push });
    // 알림 종류별 켜기·끄기 (사장님 화면 현황 → 슬랙 알림). 없으면 모두 켜짐
    const ev = { notyet: true, in: true, out: true, report: true, due: true, ot: true, ...(config.slack.ev || {}) };

    const ds = kstDate(now), ym = ds.slice(0, 7);
    const yds = kstDate(now - 86400000), yym = yds.slice(0, 7);   // 어제 (자정 넘은 퇴근)
    const staff = (await listDocs("staff")).map(d => ({ id: d.id, ...d.data }));
    const punches = Object.fromEntries((await listDocs(`months/${ym}/punches`, `%\\_${ds}`)).map(d => [d.id, d.data]));
    const result: Record<string, unknown> = { ok: true, backup, push };
    const sentText: string[] = [];

    // 중복 방지: 표시를 먼저 '추가'로 만들어서, 이미 있으면(다른 실행이 보냈으면) 건너뜀.
    // 못 보냈으면 표시를 지워서 다음 실행(5분 뒤)에 다시 시도
    const alertsCol = `months/${ym}/alerts`;
    const claim = async (id: string, kind: string) => {
      const { error } = await sb.from(DOCS).insert({ collection: alertsCol, id, data: { at: now, kind, ch: "slack" } });
      if (!error) return true;
      if (error.code === "23505") return false;   // 이미 보냄
      throw new Error(error.message);
    };
    const sendOnce = async <T extends { key: string }>(items: T[], kind: string, message: (fresh: T[]) => string, label: (fresh: T[]) => string) => {
      const fresh: T[] = [];
      for (const it of items) if (await claim(it.key, kind)) fresh.push(it);
      if (!fresh.length) return 0;
      try { await sendSlack(message(fresh)); }
      catch (e) { await sb.from(DOCS).delete().eq("collection", alertsCol).in("id", fresh.map(f => f.key)); throw e; }
      sentText.push(label(fresh));
      return fresh.length;
    };

    // 1. 미출근 (표시 id는 예전과 같이 {직원}_{날짜})
    if (ev.notyet) {
      const due = notyetList({ config, staff, punches, now }).map(i => ({ ...i, key: `${i.st.id}_${ds}` }));
      result.notyet = await sendOnce(due, "notyet", f => notyetMessage(store, f, now), f => `${f.map(x => x.st.name).join(", ")} 미출근`);
    }
    // 2. 출근·퇴근 (최근 1시간 안에 찍힌 것, 직원·날짜·출근/퇴근마다 한 번)
    if (ev.in || ev.out) {
      const yPunches = yds === ds ? {} : Object.fromEntries((await listDocs(`months/${yym}/punches`, `%\\_${yds}`)).map(d => [d.id, d.data]));
      const evs = punchEvents({ staff, punches: { ...yPunches, ...punches }, now }).filter(e => ev[e.kind as "in" | "out"]);
      result.punch = await sendOnce(evs, "punch", f => punchMessage(store, f), f => f.map(x => `${x.st.name} ${x.kind === "in" ? "출근" : "퇴근"}`).join(", "));
    }
    // 3·4. 업무 보고 도착 / 마감 지남
    if (ev.report || ev.due) {
      const reports = Object.fromEntries((await listDocs(`months/${ym}/task_reports`)).map(d => [d.id, d.data]));
      const tasks = Object.fromEntries((await listDocs("tasks")).map(d => [d.id, d.data]));
      if (ev.report) result.report = await sendOnce(reportEvents({ reports, now }), "report", f => reportMessage(store, f, { tasks, staff }), f => `업무 보고 ${f.length}건`);
      if (ev.due) result.due = await sendOnce(dueEvents({ tasks, staff, reports, now }), "due", f => dueMessage(store, f), f => `마감 지남: ${f.map(x => x.t.title).join(", ")}`);
    }

    // 5. 추가근무 요청·보고 (오늘·어제 날짜 문서: ot/{직원}_{날짜})
    if (ev.ot) {
      const ots = Object.fromEntries([...(await listDocs("ot", `%\\_${ds}`)), ...(yds === ds ? [] : await listDocs("ot", `%\\_${yds}`))].map(d => [d.id, d.data]));
      result.ot = await sendOnce(otEvents({ ots, now }), "ot", f => otMessage(store, f, { staff }), f => `추가근무 ${f.length}건`);
    }

    if (sentText.length) await logStatus({ ok: true, kind: "events", text: sentText.join(" / ") });
    return json(result);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(err);
    await logStatus({ ok: false, kind: body.test ? "test" : "events", err });
    return json({ ok: false, error: err }, 500);
  }
});

// 미출근 슬랙 알림 (Supabase Edge Function: tc-notyet-check) — 장부와 같은 프로젝트, 타임카드 자원은 tc 접두어
//
// - 5분마다 pg_cron이 부름 (supabase/002_notyet_alert.sql). 헤더 x-cron-secret = TC_CRON_SECRET
// - 앱의 '시험 알림 보내기'는 로그인한 사장님 토큰으로 { test: true }를 보냄 (타임카드 권한 있는 계정만)
// - 가게 설정(config/main)의 slack.on이 꺼져 있으면 아무것도 안 보냄
// - 직원·날짜당 한 번만: months/{YYYY-MM}/alerts/{직원id}_{날짜} 표시를 먼저 만들고 보냄
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
import { kstDate, notyetList, notyetMessage } from "./rules.mjs";

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
  let body: { test?: boolean } = {};
  try { body = await req.json(); } catch { /* 빈 본문 */ }

  const now = Date.now();
  try {
    const config = (await getDoc("config", "main")) || {};
    const store = config.storeName || "우리 가게";

    if (body.test) {
      await sendSlack(`*[${store}] 슬랙 알림 시험*\n미출근 알림이 이 채널로 와요. 이 메시지가 휴대폰 알림으로 떴다면 준비 끝이에요.`);
      await logStatus({ ok: true, kind: "test", text: "시험 알림" });
      return json({ ok: true, sent: "test" });
    }
    if (!config.slack || !config.slack.on) return json({ ok: true, skipped: "off" });

    const ds = kstDate(now), ym = ds.slice(0, 7);
    const staff = (await listDocs("staff")).map(d => ({ id: d.id, ...d.data }));
    const punches = Object.fromEntries((await listDocs(`months/${ym}/punches`, `%\\_${ds}`)).map(d => [d.id, d.data]));
    const due = notyetList({ config, staff, punches, now });
    if (!due.length) return json({ ok: true, notyet: 0 });

    // 중복 방지: 표시를 먼저 '추가'로 만들어서, 이미 있으면(다른 실행이 보냈으면) 건너뜀
    const alertsCol = `months/${ym}/alerts`;
    const fresh = [];
    for (const item of due) {
      const id = `${item.st.id}_${ds}`;
      const { error } = await sb.from(DOCS).insert({ collection: alertsCol, id, data: { at: now, kind: "notyet", ch: "slack" } });
      if (!error) fresh.push({ ...item, markId: id });
      else if (error.code !== "23505") throw new Error(error.message);   // 23505 = 이미 보냄
    }
    if (!fresh.length) return json({ ok: true, notyet: due.length, sent: 0 });

    try {
      await sendSlack(notyetMessage(store, fresh, now));
    } catch (e) {
      // 못 보냈으면 표시를 지워서 다음 실행(5분 뒤)에 다시 시도
      await sb.from(DOCS).delete().eq("collection", alertsCol).in("id", fresh.map(f => f.markId));
      throw e;
    }
    await logStatus({ ok: true, kind: "notyet", text: `${fresh.map(f => f.st.name).join(", ")} 미출근` });
    return json({ ok: true, notyet: due.length, sent: fresh.length });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(err);
    await logStatus({ ok: false, kind: body.test ? "test" : "notyet", err });
    return json({ ok: false, error: err }, 500);
  }
});

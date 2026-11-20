// 직원 휴대폰 1회용 연결 (Supabase Edge Function: tc-phone-join, v39)
//
// 가게 태블릿(사장님 계정으로 로그인됨)이 직원 번호를 확인한 뒤 '그 직원 전용·한 번만·10분' 연결 코드를 받아 QR로 보여 줘요.
// 직원 휴대폰이 QR을 열면 이 코드를 '직원용 공용 계정' 로그인으로 바꿔 줘요. 사장님 비밀번호는 아무에게도 알려 주지 않아요.
//
// 직원용 공용 계정: app_metadata { apps:['timecard'], tc_role:'phone' } — 타임카드만 (장부 권한 없음), 앱은 사장님 화면을 막음.
//   비밀번호는 서버가 아무도 모르게 만들고 저장하지 않아요. 로그인은 매번 1회용 링크 토큰(generateLink)으로만.
//   [모든 직원 휴대폰 연결 끊기] = 이 계정을 지움 → 연결된 휴대폰이 모두 로그아웃, 다음 연결 때 새로 만듦.
//
// 요청 (POST JSON)
//   { action:'issue', staffId }   사장님(공용 계정 아님) 토큰 필요 → { code, exp }
//   { action:'redeem', code }     로그인 없이 → { token_hash, staffId }   (휴대폰이 auth.verifyOtp로 로그인)
//   { action:'revoke' }           사장님 토큰 → 공용 계정 지우기 + 연결 기록·코드 지우기
//   { action:'status' }           사장님 토큰 → { exists, createdAt, links }
// 저장: tc_docs collection 'phone_join' (id = 코드의 SHA-256, data { staffId, exp, used, at, usedAt }),
//       tc_docs config/phone_account { userId, createdAt }
// 배포: npx.cmd supabase@2.58.5 functions deploy tc-phone-join --no-verify-jwt --use-api --project-ref mtnuwdcxjxpnrpggbfwc

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const DOCS = "tc_docs", COL = "phone_join";
export const CODE_TTL = 10 * 60 * 1000;
export const PHONE_EMAIL = "tc-phone@staff.timecard.dajoba.kr";   // 메일이 가는 주소 아님 (만들 때 바로 확인 처리)
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const b64url = (buf: Uint8Array) => btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randCode = () => b64url(crypto.getRandomValues(new Uint8Array(18)));
async function sha(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function callerOwner(req: Request) {   // 타임카드 권한이 있고 공용 계정이 아닌 사람 = 사장님
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  const u = data?.user, apps = u?.app_metadata?.apps;
  if (error || !u || !Array.isArray(apps) || !apps.includes("timecard") || u.app_metadata?.tc_role === "phone") return null;
  return u;
}
async function getDoc(collection: string, id: string) {
  const { data, error } = await sb.from(DOCS).select("data").eq("collection", collection).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? data.data : null;
}
async function putDoc(collection: string, id: string, data: unknown) {
  const { error } = await sb.from(DOCS).upsert({ collection, id, data, deleted_at: null });
  if (error) throw new Error(error.message);
}
async function delDocs(collection: string, id?: string) {
  let q = sb.from(DOCS).delete().eq("collection", collection);
  if (id) q = q.eq("id", id);
  const { error } = await q;
  if (error) throw new Error(error.message);
}
// 직원용 공용 계정 (없으면 만들기)
async function phoneUser(create: boolean) {
  const acc = await getDoc("config", "phone_account") as { userId?: string; createdAt?: number } | null;
  if (acc?.userId) {
    const { data } = await sb.auth.admin.getUserById(acc.userId);
    if (data?.user) return { user: data.user, createdAt: acc.createdAt };
  }
  if (!create) return null;
  const { data, error } = await sb.auth.admin.createUser({
    email: PHONE_EMAIL, email_confirm: true, password: randCode() + randCode(),   // 아무도 모르는 비밀번호 (저장 안 함)
    app_metadata: { apps: ["timecard"], tc_role: "phone" },
  });
  if (error || !data?.user) throw new Error("공용 계정을 만들지 못했어요: " + (error?.message || ""));
  const createdAt = Date.now();
  await putDoc("config", "phone_account", { userId: data.user.id, createdAt });
  return { user: data.user, createdAt };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: { action?: string; staffId?: string; code?: string } = {};
  try { body = await req.json(); } catch { /* 빈 본문 */ }
  try {
    if (body.action === "redeem") {
      const code = String(body.code || "");
      if (!/^[\w-]{16,64}$/.test(code)) return json({ error: "연결 코드가 올바르지 않아요" }, 400);
      const id = await sha(code), d = await getDoc(COL, id) as { staffId: string; exp: number; used?: boolean } | null;
      if (!d) return json({ error: "연결 코드를 찾을 수 없어요. 태블릿에서 QR을 다시 띄워 주세요." }, 404);
      if (d.used) return json({ error: "이미 쓴 연결 코드예요. 태블릿에서 QR을 다시 띄워 주세요." }, 410);
      if (Date.now() > d.exp) return json({ error: "연결 코드 시간이 지났어요 (10분). 태블릿에서 QR을 다시 띄워 주세요." }, 410);
      await putDoc(COL, id, { ...d, used: true, usedAt: Date.now() });   // 한 번만
      const pu = await phoneUser(false);
      if (!pu) return json({ error: "직원용 계정이 없어요. 태블릿에서 QR을 다시 띄워 주세요." }, 409);
      const { data, error } = await sb.auth.admin.generateLink({ type: "magiclink", email: pu.user.email || PHONE_EMAIL });
      const token_hash = data?.properties?.hashed_token;
      if (error || !token_hash) throw new Error("로그인 토큰을 만들지 못했어요: " + (error?.message || ""));
      return json({ token_hash, staffId: d.staffId });
    }

    const owner = await callerOwner(req);
    if (!owner) return json({ error: "unauthorized" }, 401);

    if (body.action === "issue") {
      const staffId = String(body.staffId || "");
      const st = staffId && await getDoc("staff", staffId) as { active?: boolean } | null;
      if (!st || st.active === false) return json({ error: "직원을 찾을 수 없어요" }, 404);
      await phoneUser(true);
      // 지난 코드 정리 (시간 지났거나 쓴 것)
      const { data: rows } = await sb.from(DOCS).select("id,data").eq("collection", COL);
      for (const r of rows || []) if (r.data?.used || Date.now() > (r.data?.exp || 0)) await delDocs(COL, r.id);
      const code = randCode(), exp = Date.now() + CODE_TTL;
      await putDoc(COL, await sha(code), { staffId, exp, used: false, at: Date.now() });
      return json({ code, exp });
    }
    if (body.action === "revoke") {
      const pu = await phoneUser(false);
      if (pu) { const { error } = await sb.auth.admin.deleteUser(pu.user.id); if (error) throw new Error(error.message); }
      await delDocs("config", "phone_account"); await delDocs(COL); await delDocs("phone_links");
      return json({ ok: true, removed: !!pu });
    }
    if (body.action === "status") {
      const pu = await phoneUser(false);
      return json({ exists: !!pu, createdAt: pu?.createdAt || null });
    }
    return json({ error: "action이 필요해요 (issue / redeem / revoke / status)" }, 400);
  } catch (e) {
    console.error("phone-join", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// 자동 번역 (Supabase Edge Function: tc-translate) — 한국어 ↔ 베트남어, Claude API
//
// 사장님이 쓴 공지·지시·메모를 베트남어로, 직원이 쓴 메모를 한국어로 옮겨요.
// 앱은 저장할 때 한 번 번역해서 함께 저장해요 (볼 때마다 번역하지 않음 → 빠르고 비용이 거의 안 듦).
//
// 요청 (POST JSON, 로그인한 타임카드 계정 토큰): { texts: string[], to: 'vi' | 'ko' }
// 응답: { translations: string[] }  (texts와 같은 순서·같은 개수)
//
// 필요한 secret (대표님이 터미널에서 직접 넣어요. 채팅·메일로 보내지 말 것):
//   npx.cmd supabase@2.58.5 secrets set ANTHROPIC_API_KEY=<키> --project-ref mtnuwdcxjxpnrpggbfwc
// 배포: npx.cmd supabase@2.58.5 functions deploy tc-translate --no-verify-jwt --use-api --project-ref mtnuwdcxjxpnrpggbfwc
//   (로그인 확인은 아래 authorized()가 직접 해요)
//
// 모델: claude-opus-5-5, effort low (짧은 번역이라 생각을 적게). 안전 필터가 거절하면
// 서버 쪽 대체 모델(fallbacks: "default")이 같은 요청을 이어서 처리해요.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk@1.5.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const MAX_TEXTS = 20, MAX_CHARS = 4000;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
const claude = apiKey ? new Anthropic({ apiKey }) : null;

const LANG = { vi: "Vietnamese (tiếng Việt)", ko: "Korean (한국어)" } as const;
const system = (to: "vi" | "ko") => [
  `You translate short workplace messages for a small Korean restaurant whose staff are mostly Vietnamese.`,
  `Translate each input text into ${LANG[to]}.`,
  to === "vi"
    ? `The reader is a Vietnamese employee. Use natural, polite, everyday Vietnamese (gọi người đọc là "bạn"), clear enough for someone who reads quickly on a phone or tablet.`
    : `The reader is the Korean owner (사장님). Use natural, polite Korean (해요체).`,
  `Keep people's names, numbers, times (e.g. 15:00), money amounts, emoji, bullet marks and line breaks exactly as they are.`,
  `If a text is already in the target language, return it unchanged. Translate only; do not add explanations.`,
].join("\n");

async function authorized(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data, error } = await sb.auth.getUser(token);
  const apps = data?.user?.app_metadata?.apps;
  return !error && !!data.user && Array.isArray(apps) && apps.includes("timecard");   // 장부 전용 계정은 거절
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!await authorized(req)) return json({ error: "unauthorized" }, 401);
  if (!claude) return json({ error: "자동 번역이 아직 설정되지 않았어요 (ANTHROPIC_API_KEY)" }, 503);

  let body: { texts?: unknown; to?: unknown } = {};
  try { body = await req.json(); } catch { /* 빈 본문 */ }
  const to = body.to === "ko" ? "ko" : body.to === "vi" ? "vi" : null;
  const texts = Array.isArray(body.texts) ? body.texts.map(t => String(t ?? "")) : null;
  if (!to || !texts || !texts.length || texts.length > MAX_TEXTS || texts.some(t => t.length > MAX_CHARS)) {
    return json({ error: `texts(1~${MAX_TEXTS}개, 각 ${MAX_CHARS}자 이하)와 to('vi' 또는 'ko')가 필요해요` }, 400);
  }
  // 빈 칸은 그대로 돌려줌 (번역 요청에서 뺌)
  const idx = texts.map((t, i) => (t.trim() ? i : -1)).filter(i => i >= 0);
  if (!idx.length) return json({ translations: texts });

  try {
    const response = await claude.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: system(to),
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: { translations: { type: "array", items: { type: "string" } } },
            required: ["translations"],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: "user",
        content: `Translate each item of this JSON array. Return {"translations": [...]} with exactly ${idx.length} items in the same order.\n\n${JSON.stringify(idx.map(i => texts[i]))}`,
      }],
    });
    if (response.stop_reason === "refusal") return json({ error: "번역이 거절됐어요. 문장을 바꿔 다시 해 주세요." }, 422);
    if (response.stop_reason === "max_tokens") return json({ error: "글이 너무 길어 번역하지 못했어요" }, 422);
    const text = response.content.find(b => b.type === "text");
    const parsed = text && text.type === "text" ? JSON.parse(text.text) : null;
    const out: unknown = parsed?.translations;
    if (!Array.isArray(out) || out.length !== idx.length) throw new Error("번역 결과 개수가 맞지 않아요");
    const translations = texts.slice();
    idx.forEach((i, k) => { translations[i] = String(out[k] ?? ""); });
    return json({ translations });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "Claude API 키가 맞지 않아요" }, 503);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "잠시 뒤 다시 해 주세요 (요청이 많아요)" }, 429);
    if (e instanceof Anthropic.APIError) { console.error("claude", e.status, e.message); return json({ error: `번역 서버 오류 (${e.status ?? ""})` }, 502); }
    console.error("translate", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

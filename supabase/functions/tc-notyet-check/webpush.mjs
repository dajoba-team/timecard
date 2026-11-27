// 웹 푸시 보내기 (직원 휴대폰 알림, v46) — 외부 라이브러리 없이 WebCrypto만 씀 (Deno·Node 모두 돌아감)
//
// 표준: RFC 8291 (메시지 암호화, aes128gcm) + RFC 8292 (VAPID 서명)
//   - 앱(public/index.html)이 직원 휴대폰에서 받은 구독 정보 { endpoint, keys:{ p256dh, auth } }를 push_subs/에 저장
//   - 서버가 알림 내용을 그 휴대폰만 풀 수 있게 암호화해서 endpoint(구글·애플 푸시 서버)로 보냄
// 필요한 secret: TC_VAPID_PUBLIC (공개키, 앱에도 같은 값), TC_VAPID_PRIVATE (비밀키 JWK, 서버에만)
// tests/webpush.test.js가 휴대폰 쪽 풀기 과정까지 흉내 내서 확인해요.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

export const b64u = bytes => {
  let s = "";
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export const unb64u = s => {
  const t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const concat = (...arrs) => {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
};
const hmac = async (key, data) => new Uint8Array(await subtle.sign("HMAC", await subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), data));

// ----- 메시지 암호화 (RFC 8291) -----
// uaPublic: 휴대폰 공개키(65바이트), authSecret: 16바이트. salt·서버 임시키는 시험에서만 넘김
export async function encryptPayload(plaintext, uaPublic, authSecret, { salt, asKeys } = {}) {
  salt = salt || globalThis.crypto.getRandomValues(new Uint8Array(16));
  const as = asKeys || await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await subtle.exportKey("raw", as.publicKey));
  const uaKey = await subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const data = concat(typeof plaintext === "string" ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));   // 마지막 묶음 표시 2
  const key = await subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, data));
  const rs = new Uint8Array([0, 0, 16, 0]);   // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

// ----- VAPID 서명 (RFC 8292) -----
// privateJwk: { kty:'EC', crv:'P-256', d, x, y }, publicB64u: 65바이트 공개키 (앱과 같은 값)
export async function vapidHeader(endpoint, privateJwk, publicB64u, { subject = "https://timecard.dajoba.kr", now = Date.now() } = {}) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await subtle.importKey("jwk", { ...privateJwk, key_ops: ["sign"], ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${body}`)));   // WebCrypto는 r||s 64바이트 = JWS 형식 그대로
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicB64u}`;
}

// 한 휴대폰에 보내기. 반환: { ok, status, gone } — gone이면 구독이 끝난 휴대폰(지워도 됨)
export async function sendPush(sub, payload, vapid, { fetchFn = fetch, ttl = 6 * 3600, urgency = "high" } = {}) {
  const body = await encryptPayload(JSON.stringify(payload), unb64u(sub.keys.p256dh), unb64u(sub.keys.auth));
  const r = await fetchFn(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(sub.endpoint, vapid.privateJwk, vapid.publicKey),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: urgency,
    },
    body,
  });
  return { ok: r.status >= 200 && r.status < 300, status: r.status, gone: r.status === 404 || r.status === 410 };
}

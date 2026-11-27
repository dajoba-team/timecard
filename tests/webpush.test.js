// 웹 푸시 암호화·서명 (v46): 서버(webpush.mjs)가 만든 알림을 휴대폰 쪽 방법(표준 HKDF, Node crypto)으로 풀어 보고,
// VAPID 서명이 공개키로 확인되는지, 끝난 구독(410)을 알아보는지 확인
const assert = require('assert');
const nodeCrypto = require('crypto');
const { subtle } = globalThis.crypto;
(async () => {
  const W = await import('../supabase/functions/tc-notyet-check/webpush.mjs');
  // ----- 휴대폰(받는 쪽) 키 -----
  const ua = await subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const auth = nodeCrypto.randomBytes(16);
  const msg = JSON.stringify({ title:'⚠️ Cảnh báo đi muộn · 지각 경고', body:'지각 1회 — 한 번 더 하면 2회예요' });
  const body = await W.encryptPayload(msg, uaPublic, new Uint8Array(auth));
  // ----- 휴대폰이 푸는 방법 (RFC 8291, Node 표준 HKDF로 따로 계산) -----
  const salt = body.slice(0, 16), rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0), idlen = body[20], asPublic = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  assert.strictEqual(rs, 4096); assert.strictEqual(idlen, 65); assert.strictEqual(asPublic[0], 4, '서버 임시 공개키 (비압축)');
  const asKey = await subtle.importKey('raw', asPublic, { name:'ECDH', namedCurve:'P-256' }, false, []);
  const ecdh = Buffer.from(await subtle.deriveBits({ name:'ECDH', public:asKey }, ua.privateKey, 256));
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), Buffer.from(uaPublic), Buffer.from(asPublic)]);
  const ikm = Buffer.from(nodeCrypto.hkdfSync('sha256', ecdh, auth, keyInfo, 32));
  const cek = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, Buffer.from(salt), Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, Buffer.from(salt), Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(Buffer.from(ct.slice(-16)));
  const plain = Buffer.concat([d.update(Buffer.from(ct.slice(0, -16))), d.final()]);
  assert.strictEqual(plain[plain.length - 1], 2, '마지막 묶음 표시');
  assert.strictEqual(plain.slice(0, -1).toString('utf8'), msg, '휴대폰이 원래 내용으로 풀 수 있음 (한글·베트남어)');
  console.log('암호화 통과');

  // ----- VAPID 서명 -----
  const v = await subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', v.privateKey), pub = W.b64u(await subtle.exportKey('raw', v.publicKey));
  const now = Date.UTC(2026, 10, 28, 1, 0, 0);
  const h = await W.vapidHeader('https://fcm.googleapis.com/fcm/send/abc', { kty:jwk.kty, crv:jwk.crv, d:jwk.d, x:jwk.x, y:jwk.y }, pub, { now });
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m && m[4] === pub, '헤더 형식·공개키');
  const claims = JSON.parse(Buffer.from(W.unb64u(m[2])).toString());
  assert.deepStrictEqual(claims, { aud:'https://fcm.googleapis.com', exp:Math.floor(now / 1000) + 43200, sub:'https://timecard.dajoba.kr' }, '받는 곳·만료·연락처 (개인 메일 안 넣음)');
  assert.strictEqual(JSON.parse(Buffer.from(W.unb64u(m[1])).toString()).alg, 'ES256');
  const ok = await subtle.verify({ name:'ECDSA', hash:'SHA-256' }, v.publicKey, W.unb64u(m[3]), new TextEncoder().encode(m[1] + '.' + m[2]));
  assert.ok(ok, '공개키로 서명 확인');
  console.log('VAPID 통과');

  // ----- 보내기: 헤더, 끝난 구독 -----
  const sub = { endpoint:'https://web.push.apple.com/QGx', keys:{ p256dh:W.b64u(uaPublic), auth:W.b64u(auth) } };
  let seen = null;
  let r = await W.sendPush(sub, { title:'t', body:'b' }, { privateJwk:jwk, publicKey:pub }, { fetchFn: async (url, o) => { seen = { url, o }; return { status:201 }; } });
  assert.ok(r.ok && !r.gone && seen.url === sub.endpoint && seen.o.headers['Content-Encoding'] === 'aes128gcm' && seen.o.headers.TTL && seen.o.headers.Authorization.startsWith('vapid t='), '보내기 요청');
  assert.ok(seen.o.headers.Authorization.includes('.') && JSON.parse(Buffer.from(W.unb64u(seen.o.headers.Authorization.split('.')[1])).toString()).aud === 'https://web.push.apple.com', '애플 푸시 서버 주소로 서명');
  r = await W.sendPush(sub, { title:'t' }, { privateJwk:jwk, publicKey:pub }, { fetchFn: async () => ({ status:410 }) });
  assert.ok(!r.ok && r.gone, '410 = 끝난 구독');
  console.log('보내기 통과');
  process.exit(0);
})().catch(e => { console.error('Error', e); process.exit(1); });

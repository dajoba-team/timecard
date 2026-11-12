// ============================================================
// 가게 타임카드 - 서버 저장 어댑터 (Supabase)
// ------------------------------------------------------------
// claude.ai 아티팩트에서 쓰던 window.claude.use('db' | 'assets' | 'downloads' | 'mcp')를
// 같은 모양(window.tcStore.use)으로 Supabase에 연결한다. index.html은 이름만 바꿔 그대로 쓴다.
//
//   db        → public.tc_docs 테이블 (collection, id, data jsonb) + Realtime 실시간 반영
//   assets    → Storage 'tc-photos' 버킷 (출퇴근 사진)
//   downloads → 브라우저 파일 저장
//   mcp       → 아직 없음 (메일 기능 준비 중) → null
//
// 스키마: supabase/schema.sql (장부와 같은 Supabase 프로젝트, 타임카드 자원은 모두 tc 접두어)
// ============================================================
(() => {
  // ===== 설정 (Supabase 대시보드 → Project Settings → API Keys) =====
  // 장부(jangbu-web)와 같은 프로젝트. publishable key는 공개돼도 되는 키 (RLS + 타임카드 권한으로 보호). secret 키는 절대 넣지 말 것
  const SUPABASE_URL = "https://mtnuwdcxjxpnrpggbfwc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_mx_XoyLrOcMaHTuZqfN5vA_yL5Nb1eO";

  const DOCS = "tc_docs";                    // 문서 테이블
  const APP = "timecard";                    // 계정 app_metadata.apps에 있어야 쓸 수 있음
  const PHOTO_BUCKET = "tc-photos";
  const PHOTO_URL_TTL = 7 * 24 * 3600;        // 사진 임시 URL 유효기간(초)
  const PHOTO_BUDGET_BYTES = 5 * 1024 ** 3;   // '사진 저장 공간' 화면에 보여 줄 기준 용량 (버킷 자체 제한 아님)
  const PHOTO_BUDGET_FILES = 100000;
  const PAGE = 1000;                          // 1회 최대 조회 행 수
  const RESYNC_MS = 5 * 60 * 1000;            // 실시간 연결이 끊겼을 때를 대비한 주기적 다시 불러오기

  const sb = (SUPABASE_URL && SUPABASE_KEY && window.supabase)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

  // ===== 화면 오버레이 (로그인 / 설정 안내) =====
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const overlay = html => {
    let el = document.getElementById("st-overlay");
    if (!el) {
      el = document.createElement("div");
      el.id = "st-overlay";
      el.style.cssText = "position:fixed;inset:0;z-index:10000;background:#F0F2F5;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'IBM Plex Sans KR',-apple-system,sans-serif;color:#151B24";
      document.body.appendChild(el);
    }
    el.innerHTML = '<div style="width:100%;max-width:360px;background:#fff;border:1px solid #DADFE7;border-radius:16px;padding:28px 24px;box-shadow:0 4px 24px rgba(0,0,0,.06)">' + html + "</div>";
    return el;
  };
  const closeOverlay = () => { const el = document.getElementById("st-overlay"); if (el) el.remove(); };
  const btnCss = "width:100%;padding:14px;border:none;border-radius:12px;background:#2A3FC7;color:#fff;font-size:15px;font-weight:700;cursor:pointer";
  const inpCss = "width:100%;box-sizing:border-box;padding:12px 14px;border:1px solid #DADFE7;border-radius:10px;font-size:15px;margin-bottom:10px;outline:none";

  let loginP = null, userEmail = "";
  // 같은 프로젝트의 장부 계정이 타임카드에 들어오지 않게: app_metadata.apps에 "timecard"가 있어야 함
  const hasApp = user => {
    const apps = user && user.app_metadata && user.app_metadata.apps;
    return Array.isArray(apps) && apps.includes(APP);
  };
  const denyNoApp = async user => {
    const el = overlay(
      '<div style="font-size:18px;font-weight:700;margin-bottom:8px">타임카드 권한이 없는 계정이에요</div>' +
      '<div style="font-size:13px;color:#5E6774;line-height:1.6;margin-bottom:16px">' + esc((user && user.email) || "") + ' 계정은 타임카드를 쓸 수 있게 설정되지 않았어요. 관리자에게 권한을 요청하거나 다른 계정으로 로그인해 주세요.<br><span style="color:#94a3b8">권한을 받은 뒤에는 로그아웃 후 다시 로그인해야 반영돼요.</span></div>' +
      '<button id="st-out" style="' + btnCss + '">로그아웃</button>'
    );
    el.querySelector("#st-out").onclick = async () => { await sb.auth.signOut().catch(() => {}); location.reload(); };
    await new Promise(() => {}); // 권한 없으면 진행하지 않음
  };
  const ensureLogin = () => {
    if (loginP) return loginP;
    loginP = (async () => {
      if (!sb) {
        overlay('<div style="font-size:18px;font-weight:700;margin-bottom:8px">서버 설정 필요</div><div style="font-size:13px;color:#5E6774;line-height:1.6">storage.js 맨 위의 SUPABASE_URL, SUPABASE_KEY를 넣어야 해요.</div>');
        await new Promise(() => {}); // 설정 전에는 진행하지 않음
      }
      const { data } = await sb.auth.getSession();
      if (data && data.session) {
        if (!hasApp(data.session.user)) await denyNoApp(data.session.user);
        userEmail = data.session.user.email || "";
        return;
      }
      await new Promise(resolve => {
        const el = overlay(
          '<div style="font-size:20px;font-weight:700;margin-bottom:4px">가게 타임카드</div>' +
          '<div style="font-size:13px;color:#5E6774;margin-bottom:20px">사장님 계정으로 로그인해 주세요. 가게 태블릿은 한 번만 로그인하면 계속 유지돼요.</div>' +
          '<form id="st-login"><input id="st-email" type="email" autocomplete="username" placeholder="이메일" style="' + inpCss + '">' +
          '<input id="st-pw" type="password" autocomplete="current-password" placeholder="비밀번호" style="' + inpCss + '">' +
          '<div id="st-msg" style="font-size:12px;color:#C4302A;min-height:18px;margin-bottom:6px"></div>' +
          '<button type="submit" style="' + btnCss + '">로그인</button></form>'
        );
        el.querySelector("#st-login").onsubmit = async ev => {
          ev.preventDefault();
          const msg = el.querySelector("#st-msg");
          msg.textContent = "로그인 중…";
          const { data: signed, error } = await sb.auth.signInWithPassword({
            email: el.querySelector("#st-email").value.trim(),
            password: el.querySelector("#st-pw").value,
          });
          if (error) { msg.textContent = "로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요."; return; }
          if (!hasApp(signed && signed.user)) { denyNoApp(signed && signed.user); return; }
          userEmail = (signed && signed.user && signed.user.email) || "";
          closeOverlay();
          resolve();
        };
      });
    })();
    return loginP;
  };
  // 로그인이 풀린 경우(다른 기기에서 비밀번호 변경 등): 다시 로그인 화면
  let reloginBusy = false;
  const relogin = async () => {
    if (reloginBusy) return;
    reloginBusy = true;
    try {
      const { data } = await sb.auth.getSession();
      if (data && data.session) return;
      loginP = null;
      await ensureLogin();
      resyncAll();
    } finally { reloginBusy = false; }
  };

  // ===== 오류 → 앱이 알아듣는 code =====
  // index.html의 write()/uploadPhoto()가 보는 값: unavailable, quota_exceeded, invalid_argument, not_found / store_unavailable, quota_or_state, not_granted
  const toErr = (e, kind = "db") => {
    const msg = String((e && (e.message || e.error)) || e || "");
    const status = Number((e && (e.status || e.statusCode)) || 0);
    const pg = e && e.code;
    let code;
    if (/fetch|network|timeout|load failed/i.test(msg) || status >= 500) code = kind === "db" ? "unavailable" : "store_unavailable";
    else if (status === 401 || /jwt|unauthorized|refresh token/i.test(msg)) { code = kind === "db" ? "invalid_argument" : "not_granted"; relogin(); }
    else if (pg === "42501" || status === 403 || /row-level security|permission/i.test(msg)) code = kind === "db" ? "invalid_argument" : "not_granted";
    else if (pg === "P0002" || /not_found/.test(msg)) code = "not_found";
    else if (status === 413 || /quota|too large|exceeded/i.test(msg)) code = kind === "db" ? "quota_exceeded" : "quota_or_state";
    else code = kind === "db" ? "unknown" : "store_unavailable";
    const err = new Error(msg || code);
    err.code = code;
    err.cause = e;
    return err;
  };
  const check = ({ data, error }) => { if (error) throw toErr(error); return data; };
  const guard = async fn => { try { return await fn(); } catch (e) { throw e && typeof e.code === "string" && e instanceof Error ? e : toErr(e); } };

  // ===== db: 컬렉션/문서 =====
  const clean = v => JSON.parse(JSON.stringify(v ?? {}));  // undefined 필드 제거, 앱 상태와 분리
  const splitPath = path => {
    const s = String(path).replace(/^\/+|\/+$/g, "");
    const i = s.lastIndexOf("/");
    if (i < 1 || i === s.length - 1) throw Object.assign(new Error("잘못된 문서 경로: " + path), { code: "invalid_argument" });
    return [s.slice(0, i), s.slice(i + 1)];
  };
  const tsOf = row => Date.parse(row.updated_at) || 0;

  // 화면이 듣고 있는 컬렉션별 상태: rows(id → {data|null(삭제), at}), subs(구독자), buffer(불러오는 중 도착한 실시간 변경)
  const cols = new Map();
  const colState = c => {
    let st = cols.get(c);
    if (!st) { st = { c, rows: new Map(), subs: new Set(), ready: false, buffer: null, loading: null, retry: null }; cols.set(c, st); }
    return st;
  };
  // 더 새로운 것만 반영 (실시간 이벤트와 다시 불러오기 결과가 엇갈려 도착해도 옛 값으로 되돌아가지 않게)
  const applyRow = (st, row) => {
    const at = tsOf(row), cur = st.rows.get(row.id);
    if (cur && cur.at > at) return false;
    st.rows.set(row.id, { data: row.deleted_at ? null : row.data, at });
    return true;
  };
  const docSnap = (id, data) => ({
    id, exists: data != null,
    data: () => (data == null ? undefined : clean(data)),
    metadata: { fromCache: false },
  });
  const colSnap = st => {
    const docs = [...st.rows.entries()].filter(([, v]) => v.data != null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, v]) => docSnap(id, v.data));
    return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false } };
  };
  const emit = (st, onlyId) => {
    if (!st.ready) return;
    let cs = null;
    for (const s of st.subs) {
      try {
        if (s.id == null) s.next(cs || (cs = colSnap(st)));
        else if (onlyId == null || onlyId === s.id) { const v = st.rows.get(s.id); s.next(docSnap(s.id, v ? v.data : null)); }
      } catch (e) { console.error("[storage] listener error", e); }
    }
  };
  const fetchLive = async (c, limit) => {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const to = limit ? Math.min(from + PAGE, limit) - 1 : from + PAGE - 1;
      const rows = check(await sb.from(DOCS).select("collection,id,data,updated_at,deleted_at")
        .eq("collection", c).is("deleted_at", null).order("id").range(from, to));
      out.push(...rows);
      if (rows.length < to - from + 1 || (limit && out.length >= limit)) return out;
    }
  };
  const loadCol = st => {
    if (st.loading) return st.loading;
    clearTimeout(st.retry);
    st.buffer = [];
    st.loading = (async () => {
      try {
        const rows = await fetchLive(st.c);
        const fresh = { ...st, rows: new Map() };
        rows.forEach(r => applyRow(fresh, r));
        st.rows = fresh.rows;
        // 불러오는 동안 도착한 실시간 변경·방금 쓴 값을 다시 얹음 (더 새로운 것만 반영됨)
        (st.buffer || []).forEach(r => applyRow(st, r));
        st.buffer = null;
        overlayPending(st);
        st.ready = true;
        emit(st);
      } catch (e) {
        st.buffer = null;
        console.warn("[storage] load failed", st.c, e);
        if (!st.ready) for (const s of st.subs) { try { s.error && s.error(e); } catch {} }
        // 서버에 닿지 않으면 빈 화면으로 두지 않고 계속 다시 시도
        st.retry = setTimeout(() => { if (st.subs.size) loadCol(st); }, 5000);
      } finally { st.loading = null; }
    })();
    return st.loading;
  };
  const resyncAll = () => { flush(); for (const st of cols.values()) if (st.subs.size) loadCol(st); };
  const listen = (c, id, next, error) => {
    const st = colState(c);
    const sub = { id, next, error };
    st.subs.add(sub);
    if (st.ready) emit(st, id ?? undefined);
    else loadCol(st);
    return () => { st.subs.delete(sub); if (!st.subs.size) { clearTimeout(st.retry); cols.delete(c); } };
  };
  // ===== 쓰기 + 전송 대기 목록 =====
  // 인터넷이 끊겨 서버에 못 보낸 쓰기(set/update/delete)는 기기(localStorage)에 순서대로 보관하고,
  // 화면에는 바로 반영한 뒤 연결되면 차례로 다시 보낸다. (태블릿 출퇴근이 와이파이 끊김으로 사라지지 않게)
  const COLS = "collection,id,data,updated_at,deleted_at";
  const PENDING_KEY = "tc_pending_v1";
  const LOCAL = Number.MAX_SAFE_INTEGER;   // 아직 서버에 안 간 값 표시 (서버 값으로 덮이지 않게)
  const hasLS = () => { try { return typeof localStorage !== "undefined" && !!localStorage; } catch { return false; } };
  let pendOps = (() => {
    if (!hasLS()) return [];
    try { const p = JSON.parse(localStorage.getItem(PENDING_KEY)); return Array.isArray(p) ? p : []; } catch { return []; }
  })();
  const notifyPend = () => { try { window.dispatchEvent(new CustomEvent("tc-pending", { detail: pendOps.length })); } catch {} };
  const savePend = () => {   // 실패하면 throw (보관 못 하면 쓰기 실패로 알려야 함)
    if (!hasLS()) throw new Error("no localStorage");
    if (pendOps.length) localStorage.setItem(PENDING_KEY, JSON.stringify(pendOps));
    else localStorage.removeItem(PENDING_KEY);
    notifyPend();
  };
  const savePendSafe = () => { try { savePend(); } catch (e) { console.error("[storage] pending save failed", e); } };

  const rawWrite = async op => {
    if (op.op === "set") return [check(await sb.from(DOCS).upsert({ collection: op.c, id: op.id, data: op.data, deleted_at: null }, { onConflict: "collection,id" }).select(COLS).single())];
    if (op.op === "update") return [check(await sb.rpc("tc_doc_update", { p_collection: op.c, p_id: op.id, p_patch: op.patch }))];
    return check(await sb.from(DOCS).update({ deleted_at: new Date().toISOString() })
      .eq("collection", op.c).eq("id", op.id).is("deleted_at", null).select(COLS));
  };
  // 대기 중인 쓰기를 화면 상태에 얹기 (여러 번 해도 결과 같음)
  const overlayPending = st => {
    for (const op of pendOps) {
      if (op.c !== st.c) continue;
      if (op.op === "set") st.rows.set(op.id, { data: op.data, at: LOCAL });
      else if (op.op === "update") { const cur = st.rows.get(op.id); if (cur && cur.data) st.rows.set(op.id, { data: { ...cur.data, ...op.patch }, at: LOCAL }); }
      else st.rows.set(op.id, { data: null, at: LOCAL });
    }
  };
  // 서버가 돌려준 행으로 확정 (대기 표시를 걷어내고 남은 대기분은 다시 얹음)
  const settle = (op, rows) => {
    const st = cols.get(op.c);
    if (!st) return;
    if (st.buffer) rows.forEach(r => st.buffer.push(r));
    if (rows.length) rows.forEach(r => st.rows.set(r.id, { data: r.deleted_at ? null : r.data, at: tsOf(r) }));
    else st.rows.delete(op.id);
    overlayPending(st);
    emit(st, op.id);
  };
  let flushing = null;
  const flush = () => {
    if (!sb || flushing || !pendOps.length) return flushing;
    flushing = (async () => {
      try {
        while (pendOps.length) {
          const op = pendOps[0];
          let rows;
          try { rows = await rawWrite(op); }
          catch (e) {
            const err = e && e.cause ? e : toErr(e);
            // 문서가 없어 못 고치는 경우·계속 거절되는 경우만 버림. 인터넷·로그인 문제는 남겨 두고 나중에 다시
            const drop = err.code === "not_found" || (err.code === "unknown" && ++op.tries >= 5);
            if (!drop) { savePendSafe(); break; }
            console.error("[storage] 보낼 수 없는 대기 기록을 버림", op, err);
            pendOps.shift(); savePendSafe();
            const st = cols.get(op.c); if (st) loadCol(st);
            continue;
          }
          pendOps.shift(); savePendSafe();
          settle(op, rows);
        }
      } finally { flushing = null; }
    })();
    return flushing;
  };
  const write = op => guard(async () => {
    if (!pendOps.length) {   // 대기 중인 게 있으면 순서를 지키려고 뒤에 줄 세움
      try { settle(op, await rawWrite(op)); return; }
      catch (e) { const err = e && e.cause ? e : toErr(e); if (err.code !== "unavailable") throw err; }
    }
    pendOps.push({ ...op, tries: 0 });
    try { savePend(); }
    catch { pendOps.pop(); throw Object.assign(new Error("인터넷이 끊겼고 기기에 보관하지도 못했어요"), { code: "unavailable" }); }
    const st = cols.get(op.c);
    if (st) { overlayPending(st); emit(st, op.id); }
    setTimeout(flush, 0);
  });

  const docRef = (c, id) => ({
    id, path: c + "/" + id,
    get: () => guard(async () => {
      const row = check(await sb.from(DOCS).select("data").eq("collection", c).eq("id", id).is("deleted_at", null).maybeSingle());
      return docSnap(id, row ? row.data : null);
    }),
    set: data => write({ op: "set", c, id, data: clean(data) }),
    update: patch => write({ op: "update", c, id, patch: clean(patch) }),
    delete: () => write({ op: "delete", c, id }),
    onSnapshot: (next, error) => listen(c, id, next, error),
  });
  const colRef = (c, limit) => ({
    path: c,
    doc: id => docRef(c, String(id)),
    limit: n => colRef(c, n),
    get: () => guard(async () => {
      const rows = await fetchLive(c, limit);
      const docs = rows.map(r => docSnap(r.id, r.data));
      return { docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false } };
    }),
    onSnapshot: (next, error) => listen(c, null, next, error),
  });
  const db = {
    collection: path => colRef(String(path).replace(/^\/+|\/+$/g, "")),
    doc: path => { const [c, id] = splitPath(path); return docRef(c, id); },
  };

  // ===== 실시간 반영 =====
  let channel = null;
  const startRealtime = () => {
    if (channel) return;
    channel = sb.channel("tc-docs-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: DOCS }, payload => {
        const row = payload.new;
        if (!row || !row.collection) return;
        const st = cols.get(row.collection);
        if (!st) return;
        if (st.buffer) st.buffer.push(row);
        else if (applyRow(st, row)) emit(st, row.id);
      })
      // 연결(재연결) 될 때마다 다시 불러와서, 끊겨 있던 동안의 변경도 놓치지 않게
      .subscribe(status => { if (status === "SUBSCRIBED") resyncAll(); });
    setInterval(resyncAll, RESYNC_MS);
    setInterval(flush, 30000);   // 대기 중인 기록이 있으면 30초마다 다시 보내기
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") resyncAll(); });
    window.addEventListener("online", resyncAll);
    sb.auth.onAuthStateChange(ev => { if (ev === "SIGNED_OUT") relogin(); });
  };

  // ===== assets: 출퇴근 사진 =====
  const photoPath = id => id + ".jpg";
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(16) + Math.random().toString(16).slice(2)).replace(/-/g, "");
  const assets = {
    upload: async (blob, opt = {}) => {
      const id = newId();
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(photoPath(id), blob, { contentType: opt.type || "image/jpeg", upsert: false });
      if (error) throw toErr(error, "assets");
      return { id };
    },
    list: async () => {
      const assetsOut = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await sb.storage.from(PHOTO_BUCKET).list("", { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw toErr(error, "assets");
        data.filter(o => o.id && o.name.endsWith(".jpg")).forEach(o => assetsOut.push({
          id: o.name.replace(/\.jpg$/, ""),
          contentType: (o.metadata && o.metadata.mimetype) || "image/jpeg",
          size: (o.metadata && o.metadata.size) || 0,
          createdAt: o.created_at,
        }));
        if (data.length < PAGE) break;
      }
      const bytes = assetsOut.reduce((t, a) => t + a.size, 0);
      return { usage: { bytes, files: assetsOut.length, maxBytes: PHOTO_BUDGET_BYTES, maxFiles: PHOTO_BUDGET_FILES }, assets: assetsOut };
    },
    delete: async id => {
      const { error } = await sb.storage.from(PHOTO_BUCKET).remove([photoPath(id)]);
      if (error) throw toErr(error, "assets");
      photoCache.delete(id);
    },
  };

  // 비공개 버킷이라 <img>에는 임시 URL을 넣는다.
  // photoUrl(id): 받아 둔 URL이 있으면 바로 돌려주고, 없으면 null을 돌려준 뒤 받아서 화면의 <img data-photo="id">에 넣는다.
  const photoCache = new Map();   // id → { url, exp }
  const photoQueue = new Set();
  let photoTimer = null;
  const fillPhotos = ids => {
    document.querySelectorAll("img[data-photo]").forEach(img => {
      const id = img.getAttribute("data-photo"), c = photoCache.get(id);
      if (ids.has(id) && c && img.getAttribute("src") !== c.url) img.setAttribute("src", c.url);
    });
  };
  const flushPhotos = async () => {
    photoTimer = null;
    const ids = [...photoQueue];
    photoQueue.clear();
    if (!ids.length || !sb) return;
    try {
      const { data, error } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(ids.map(photoPath), PHOTO_URL_TTL);
      if (error) throw error;
      const exp = Date.now() + (PHOTO_URL_TTL - 3600) * 1000;
      const done = new Set();
      data.forEach((d, i) => {
        if (d.signedUrl) { photoCache.set(ids[i], { url: d.signedUrl, exp }); done.add(ids[i]); }
        else {   // 지워진 사진: 깨진 그림 표시(onerror)로 넘어가게
          document.querySelectorAll('img[data-photo="' + ids[i] + '"]').forEach(img => img.dispatchEvent(new Event("error")));
        }
      });
      fillPhotos(done);
    } catch (e) { console.warn("[storage] photo url failed", e); }
  };
  const photoUrl = id => {
    if (!id || !/^[\w-]+$/.test(id)) return null;
    const c = photoCache.get(id);
    if (c && c.exp > Date.now()) return c.url;
    photoQueue.add(id);
    if (!photoTimer) photoTimer = setTimeout(flushPhotos, 30);
    return null;
  };

  // ===== downloads: 파일 저장 =====
  const MIME = { json: "application/json", csv: "text/csv", html: "text/html", txt: "text/plain" };
  const downloads = {
    save: async ({ filename, data }) => {
      const ext = String(filename).split(".").pop().toLowerCase();
      const blob = data instanceof Blob ? data : new Blob([data], { type: (MIME[ext] || "application/octet-stream") + ";charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { status: "saved" };
    },
  };

  window.tcStore = {
    use: async name => {
      if (name === "db") { await ensureLogin(); startRealtime(); setTimeout(flush, 0); return db; }
      if (name === "assets") { await ensureLogin(); return assets; }
      if (name === "downloads") return downloads;
      return null;   // mcp(메일): 아직 없음
    },
    photoUrl,
    // Edge Function 호출 (로그인한 사장님 토큰이 자동으로 붙음). 실패하면 서버가 준 오류 문구로 throw
    invoke: async (name, body) => {
      await ensureLogin();
      const { data, error } = await sb.functions.invoke(name, { body: body || {} });
      if (error) {
        let msg = error.message;
        try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch {}
        throw Object.assign(new Error(msg), { code: /fetch|network/i.test(msg) ? "unavailable" : "function_error" });
      }
      return data;
    },
    userEmail: () => userEmail,
    pendingCount: () => pendOps.length,
    // 로그아웃: 보내지 못한 기록도 이 기기에서 지움 (앱이 먼저 경고함)
    logout: async () => {
      pendOps = [];
      try { if (hasLS()) localStorage.removeItem(PENDING_KEY); } catch {}
      if (sb) await sb.auth.signOut().catch(() => {});
      location.reload();
    },
  };
})();

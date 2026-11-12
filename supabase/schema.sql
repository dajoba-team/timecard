
-- 가게 타임카드 스키마 (Supabase) — 장부(jangbu-web)와 같은 프로젝트에 함께 설치
-- Supabase 대시보드 → SQL Editor에 전체를 붙여넣고 Run.
-- 여러 번 실행해도 안전하도록 작성됨 (if not exists / or replace).
--
-- 이름 규칙: 타임카드가 만드는 모든 자원은 tc_ 로 시작 (Storage 버킷은 tc-photos, 서버 함수는 tc-notyet-check)
--            장부의 companies / transactions / settings / audit_log / signatures 와 섞이지 않게,
--            장부 자원은 만들거나 바꾸지 않음.
--
-- 접근 권한: 로그인한 계정 중 app_metadata.apps 에 "timecard"가 있는 계정만 타임카드 데이터를 볼 수 있음.
--            (장부용으로만 만든 계정은 타임카드의 급여·주민번호를 볼 수 없게)
--            권한 주기: 이 파일 맨 아래 [계정에 타임카드 권한 주기] 참고
--
-- 저장 구조: claude.ai 아티팩트 저장소의 "컬렉션/문서" 구조를 그대로 옮김.
--   경로 'staff/s123'                         → collection='staff',                 id='s123'
--   경로 'months/2026-11/punches/s1_2026-11-12' → collection='months/2026-11/punches', id='s1_2026-11-12'
-- 문서 내용은 data(jsonb)에 그대로 들어감. 필드 설명은 docs/DATA_MODEL.md 참고.

-- ============================================================
-- 0. 권한 확인 함수: 지금 로그인한 계정이 타임카드를 쓸 수 있는지
-- ============================================================
create or replace function public.tc_allowed() returns boolean
language sql stable set search_path = public as $$
  select coalesce((auth.jwt() -> 'app_metadata' -> 'apps') ? 'timecard', false)
$$;

-- ============================================================
-- 1. 문서 저장소
-- ============================================================
create table if not exists public.tc_docs (
  collection  text not null,
  id          text not null,
  data        jsonb not null default '{}',
  inserted_at timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,                   -- null이 아니면 삭제된 문서 (소프트 삭제)
  primary key (collection, id)
);

create index if not exists tc_docs_live_idx on public.tc_docs (collection) where deleted_at is null;

-- ============================================================
-- 2. 변경 이력 (누가 언제 무엇을 바꿨는지, 실수 복구용)
-- ============================================================
create table if not exists public.tc_audit_log (
  id         bigserial primary key,
  collection text not null,
  doc_id     text not null,
  action     text not null,                  -- INSERT / UPDATE
  old_data   jsonb,
  new_data   jsonb,
  deleted    boolean not null default false, -- 이 변경으로 삭제 처리됐는지
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists tc_audit_log_doc_idx on public.tc_audit_log (collection, doc_id);

-- updated_at 자동 갱신 (BEFORE UPDATE) — 장부의 touch_updated_at과 따로 둠
create or replace function public.tc_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- 이력 기록 (AFTER: upsert 시 실제로 일어난 동작만 기록됨)
-- config/sign(사장님 서명 이미지)은 용량 때문에 내용 대신 표시만 남김
create or replace function public.tc_write_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  big boolean := (new.collection = 'config' and new.id = 'sign');
begin
  insert into public.tc_audit_log (collection, doc_id, action, old_data, new_data, deleted)
  values (new.collection, new.id, tg_op,
          case when tg_op = 'UPDATE' then (case when big then '{"_":"omitted"}'::jsonb else old.data end) end,
          case when big then '{"_":"omitted"}'::jsonb else new.data end,
          new.deleted_at is not null and (tg_op = 'INSERT' or old.deleted_at is null));
  return null;
end $$;

drop trigger if exists tc_docs_touch on public.tc_docs;
drop trigger if exists tc_docs_audit on public.tc_docs;
create trigger tc_docs_touch before update on public.tc_docs
  for each row execute function public.tc_touch_updated_at();
create trigger tc_docs_audit after insert or update on public.tc_docs
  for each row execute function public.tc_write_audit();

-- ============================================================
-- 3. 부분 수정 (앱의 doc.update): 있는 문서에 필드만 덮어쓰기, 한 번에 처리
--    (태블릿 퇴근 기록과 사장님 수정이 동시에 일어나도 서로 덮어쓰지 않게)
--    security invoker라 보안 정책(RLS)이 그대로 적용됨
-- ============================================================
create or replace function public.tc_doc_update(p_collection text, p_id text, p_patch jsonb)
returns public.tc_docs
language plpgsql security invoker set search_path = public as $$
declare
  r public.tc_docs;
begin
  update public.tc_docs set data = data || p_patch
   where collection = p_collection and id = p_id and deleted_at is null
  returning * into r;
  if not found then
    raise exception 'not_found: %/%', p_collection, p_id using errcode = 'P0002';
  end if;
  return r;
end $$;

revoke all on function public.tc_doc_update(text, text, jsonb) from public, anon;
grant execute on function public.tc_doc_update(text, text, jsonb) to authenticated;

-- ============================================================
-- 4. 보안 정책 (RLS): 타임카드 권한이 있는 계정만 읽기/쓰기, 실제 삭제(DELETE)는 불가
--    회원가입은 대시보드에서 막혀 있어야 함 (장부와 같은 설정)
-- ============================================================
alter table public.tc_docs      enable row level security;
alter table public.tc_audit_log enable row level security;

drop policy if exists tc_docs_select on public.tc_docs;
drop policy if exists tc_docs_insert on public.tc_docs;
drop policy if exists tc_docs_update on public.tc_docs;
create policy tc_docs_select on public.tc_docs for select to authenticated using (public.tc_allowed());
create policy tc_docs_insert on public.tc_docs for insert to authenticated with check (public.tc_allowed());
create policy tc_docs_update on public.tc_docs for update to authenticated using (public.tc_allowed()) with check (public.tc_allowed());

drop policy if exists tc_audit_log_select on public.tc_audit_log;
create policy tc_audit_log_select on public.tc_audit_log for select to authenticated using (public.tc_allowed());

-- ============================================================
-- 5. 실시간 반영 (태블릿에서 찍은 출퇴근이 사장님 휴대폰에 바로 보이게)
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tc_docs') then
    alter publication supabase_realtime add table public.tc_docs;
  end if;
end $$;

-- ============================================================
-- 6. 출퇴근 사진 저장소 (비공개 버킷 tc-photos)
--    파일 이름: {사진id}.jpg, 기록에는 사진 id만 남는다.
--    '3개월 지난 사진 지우기' 기능 때문에 삭제 권한을 준다 (출퇴근 기록은 그대로 남음).
--    장부의 signatures 버킷 정책과 이름이 겹치지 않게 tc_photos_* 로 만든다.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tc-photos', 'tc-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists tc_photos_select on storage.objects;
drop policy if exists tc_photos_insert on storage.objects;
drop policy if exists tc_photos_delete on storage.objects;
create policy tc_photos_select on storage.objects for select to authenticated using (bucket_id = 'tc-photos' and public.tc_allowed());
create policy tc_photos_insert on storage.objects for insert to authenticated with check (bucket_id = 'tc-photos' and public.tc_allowed());
create policy tc_photos_delete on storage.objects for delete to authenticated using (bucket_id = 'tc-photos' and public.tc_allowed());

-- ============================================================
-- [계정에 타임카드 권한 주기] 이메일만 바꿔서 따로 실행
--   - 장부에서 쓰던 사장님 계정을 그대로 써도 되고, 새 계정을 만들어도 됨 (Authentication → Users → Add user)
--   - 권한을 준 뒤에는 그 기기에서 한 번 로그아웃 후 다시 로그인해야 반영됨
-- ============================================================
-- update auth.users
--    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--        || jsonb_build_object('apps', (
--             select coalesce(jsonb_agg(distinct a), '[]'::jsonb)
--               from jsonb_array_elements_text(coalesce(raw_app_meta_data -> 'apps', '[]'::jsonb) || '["timecard"]'::jsonb) a))
--  where email = '사장님@example.com';
--
-- 확인: select email, raw_app_meta_data -> 'apps' from auth.users;
-- 권한 빼기:
-- update auth.users
--    set raw_app_meta_data = jsonb_set(raw_app_meta_data, '{apps}',
--        coalesce((select jsonb_agg(a) from jsonb_array_elements_text(raw_app_meta_data -> 'apps') a where a <> 'timecard'), '[]'::jsonb))
--  where email = '사장님@example.com';

-- 미출근 슬랙 알림: 5분마다 Edge Function 'tc-notyet-check'를 부르는 예약 작업 (장부와 같은 프로젝트, 이름은 모두 tc 접두어)
-- schema.sql을 실행한 프로젝트에서, Edge Function을 배포하고 secret을 넣은 뒤 실행. 여러 번 실행해도 안전.
--
-- 순서
--   1) Edge Function 배포 + secret 설정 (docs/HOW_TO_UPDATE.md '미출근 슬랙 알림' 참고)
--   2) 아래 [한 번만] 두 줄의 값을 바꿔서 실행 (Vault에 주소와 비밀값 저장)
--   3) 이 파일의 나머지를 실행

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- [한 번만] 값 바꿔서 주석 풀고 실행. tc_cron_secret은 Edge Function secret TC_CRON_SECRET과 똑같은 값이어야 해요.
-- select vault.create_secret('https://mtnuwdcxjxpnrpggbfwc.supabase.co', 'tc_project_url');   -- 장부와 같은 프로젝트 주소
-- select vault.create_secret('여기에-긴-임의-문자열', 'tc_cron_secret');

-- 이미 있으면 지우고 다시 등록
select cron.unschedule(jobid) from cron.job where jobname = 'tc-notyet-check';

select cron.schedule(
  'tc-notyet-check',
  '*/5 * * * *',   -- 5분마다 (알림은 직원·날짜당 한 번만 감)
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'tc_project_url') || '/functions/v1/tc-notyet-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'tc_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- 확인용
--   select * from cron.job where jobname = 'tc-notyet-check';
--   select * from cron.job_run_details order by start_time desc limit 10;
--   select * from net._http_response order by created desc limit 10;

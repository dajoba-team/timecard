# 고치고 다시 올리는 방법

프로그램은 `public/index.html`(화면·계산)과 `public/storage.js`(저장·로그인) 두 파일이에요.
GitHub에 올리면 Netlify가 `public/` 폴더를 자동으로 배포하고, 태블릿과 휴대폰은 새로고침하면 바로 반영돼요. 데이터는 Supabase에 그대로 남아요.

## 고치는 순서

1. `public/index.html` 또는 `public/storage.js` 수정
2. `npm test` 로 시험 (모두 통과해야 함)
3. 로컬에서 확인: `python3 -m http.server 4173 -d public` → http://localhost:4173
4. `docs/CHANGELOG.md`에 바뀐 것 적기, `package.json`의 `version` 올리기
5. 커밋 → GitHub `main`에 올리기 → Netlify 자동 배포

DB 구조를 바꿀 때는 `supabase/` 아래에 `002_무엇.sql`처럼 새 파일을 만들어 SQL Editor에서 실행하고, `schema.sql`에도 같은 내용을 반영해요 (새 프로젝트를 만들 때 한 번에 되도록).

## 처음 설치 (장부 Supabase 프로젝트에 추가)

타임카드는 **장부(jangbu-web)와 같은 Supabase 프로젝트**를 써요. 타임카드 자원은 모두 `tc` 접두어라 장부 자원(`companies`, `transactions`, `settings`, `audit_log`, `signatures` 버킷, `touch_updated_at`, `write_audit`)과 겹치지 않고, 장부 쪽은 바꾸지 않아요.

1. 장부 프로젝트 → SQL Editor에 `supabase/schema.sql` 전체를 붙여넣고 Run.
2. 타임카드를 쓸 계정에 권한 주기: `schema.sql` 맨 아래 **[계정에 타임카드 권한 주기]** 문장의 이메일을 바꿔 실행해요. 장부에서 쓰던 사장님 계정을 그대로 써도 되고, Users → Add user로 새로 만들어도 돼요 (회원가입은 장부 설정 그대로 막혀 있어야 해요).
3. `public/storage.js` 맨 위 `SUPABASE_URL`, `SUPABASE_KEY`는 이미 장부 프로젝트 값으로 들어가 있어요 (Publishable key라 공개돼도 괜찮아요. Secret key는 절대 넣지 않기).
4. Authentication → URL Configuration → **Redirect URLs**에 타임카드 Netlify 주소를 추가해요. (Site URL은 장부 주소 그대로 두기)
5. Netlify에서 GitHub 저장소를 연결해요 (빌드 명령 없음, 배포 폴더 `public` — `netlify.toml`에 있어요).

**주의 (같은 프로젝트라서)**
- Supabase의 백업 복원은 프로젝트 **통째로** 되돌려요. 타임카드만 되돌리려고 복원하면 장부도 같이 되돌아가요. 타임카드 실수는 `tc_audit_log`나 앱의 전체 백업 파일로 해당 데이터만 고쳐요.
- 장부의 보안 정책은 "로그인한 계정이면 누구나"라서, **타임카드 전용으로 새로 만든 계정은 장부 데이터를 읽을 수 있어요.** 사장님 한 계정으로 둘 다 쓰면 문제없고, 직원 등 다른 사람에게 타임카드 계정을 줄 일이 생기면 장부 정책에도 권한 확인을 넣어야 해요.

## 미출근 슬랙 알림 설치

서버(Supabase)가 5분마다 확인해서, 출근 시각 + 지각 봐주는 분이 지나도 출근 기록이 없는 직원을 슬랙으로 알려요. 직원·날짜당 한 번만 보내요.

1. 슬랙에서 알림 받을 채널을 만들고 **Incoming Webhook** 주소를 받아요 (슬랙 앱 관리 → Incoming WebHooks → 채널 선택).
2. 긴 임의 문자열을 하나 만들어요 (예: `openssl rand -hex 24`). 이게 `TC_CRON_SECRET`이에요.
3. Edge Function 배포와 secret 설정 (Supabase CLI, 프로젝트 ref는 대시보드 주소에 있음):
   ```bash
   npx supabase login
   npx supabase secrets set TC_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... TC_CRON_SECRET=<2번 값> --project-ref mtnuwdcxjxpnrpggbfwc
   npx supabase functions deploy tc-notyet-check --no-verify-jwt --project-ref mtnuwdcxjxpnrpggbfwc
   ```
   `--no-verify-jwt`는 예약 작업이 부를 수 있게 하려는 거예요. 대신 함수 안에서 `TC_CRON_SECRET` 또는 로그인한 계정(타임카드 권한 필요) 토큰을 직접 확인해요. secret 이름도 장부와 섞이지 않게 `TC_`로 시작해요.
4. SQL Editor에서 `supabase/002_notyet_alert.sql`의 [한 번만] 두 줄을 값을 바꿔 실행한 뒤, 파일 전체를 실행해요.
5. 앱 → 사장님 화면 → 현황 → '시험 알림 보내기'로 슬랙에 오는지 확인 → '슬랙 알림 켜기'.

**판단 규칙**은 `supabase/functions/tc-notyet-check/rules.mjs`에 있고, 앱의 `dayCalc`와 같은 규칙이에요. 근무 계산 규칙을 바꾸면 두 곳을 같이 고치고 `npm test`를 돌리세요 (`tests/notyet.test.js`가 두 규칙이 같은 답을 내는지 하루 전체를 7분 간격으로 비교해요).

**문제 확인:** 앱 현황의 슬랙 칸에 마지막 결과가 보여요. 더 자세히는 Supabase → Edge Functions → tc-notyet-check → Logs, 또는 SQL `select * from cron.job_run_details order by start_time desc limit 10;`

## 코드 구조

### storage.js

claude.ai 아티팩트 시절 `window.claude.use(...)`와 같은 모양으로 `window.tcStore.use(...)`를 만들어 줘요.

| 이름 | 하는 일 |
|---|---|
| `use('db')` | 로그인 확인 후 `collection(path).doc(id).get/set/update/delete/onSnapshot`, `doc(path)`, `collection(path).limit(n).get()` |
| `use('assets')` | 사진 `upload / list / delete` (Storage `tc-photos` 버킷) |
| `use('downloads')` | 파일 저장 `save({ filename, data })` |
| `use('mcp')` | 메일: 아직 없음 → `null` (앱은 "메일 보내기는 아직 준비 중이에요"로 안내) |
| `photoUrl(id)` | 사진 임시 URL (없으면 받아서 `<img data-photo>`에 넣어 줌) |
| `userEmail()` | 로그인한 계정 이메일 |
| `pendingCount()` | 전송 대기 중인 기록 수 (바뀌면 `tc-pending` 이벤트) |
| `logout()` | 대기 목록 지우고 로그아웃 후 새로고침 |
| `invoke(name, body)` | Edge Function 호출 (예: 슬랙 시험 알림) |

**전송 대기 목록:** set/update/delete가 인터넷 문제로 실패하면 오류를 내지 않고 `localStorage`의 `tc_pending_v1`에 순서대로 보관해요. 화면에는 바로 반영하고, 연결되면(online 이벤트, 30초마다, 다시 불러올 때) 앞에서부터 차례로 보내요. 대기 중일 때 새로 쓰는 것도 순서를 지키려고 뒤에 줄을 서요. 없는 문서를 고치는 기록처럼 보낼 수 없는 것만 버리고 콘솔에 남겨요. 사진은 크기 때문에 대기 목록에 넣지 않아요 (사진 없이 기록되고 '사진 없음'으로 표시).

실시간 반영은 Supabase Realtime으로 해요. 연결이 다시 될 때, 화면이 다시 켜질 때, 5분마다 한 번씩 서버에서 다시 불러와서 놓친 변경을 채워요.

### index.html 안의 `<script>`

| 부분 | 하는 일 |
|---|---|
| 상태 (`DEFAULT_CONFIG`, `S`, `cfg()`) | 설정 기본값과 화면 상태 |
| 근무 계산 (`dayCalc`, `dayCost`, `weekHoliday`, `monthSummary`, `costSeries`) | 지각·결근·추가근무·급여 계산 |
| 알림·메일 (`notify`, `sendMail`, `mailPunch`, `checkNotyetMail`) | 화면 알림, 메일 (메일은 준비 중) |
| 사진 인증 (`startCam`, `stampPhoto`, `uploadPhoto`, `photoSrcAttr`) | 카메라, 시각 새기기, 업로드, 사진 보여 주기 |
| 화면 (`kioskView`, `nowView`, `recordsView`, `timecardView`, `payrollView`, `contractView`, `staffView`) | 탭별 화면 |
| 전자 근로계약서 (`contractBody`, `kioskContract`, `CACT`) | 계약서 문구, 서명판, 버전 관리 |
| 세무사 전달 (`reportRows`, `reportText`, `sendReport`, `autoReport`, `RACT`) | 급여 내역 정리·발송 |
| 백업 (`readAllPunches`, `BACT`) | 전체 백업·엑셀 |
| 동작 (`ACT`) | 버튼(`data-act`)마다 실행할 일 |
| 시작 (`boot`) | 저장소 연결, 실시간 구독, 1초·30초 타이머 |

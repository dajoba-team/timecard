# 저장소 구조 (Supabase `tc_docs` 테이블)

문서(doc)는 `컬렉션/문서id` 형태의 경로로 저장돼요. 타임카드 권한이 있는 계정만 볼 수 있어요 (RLS + `tc_allowed()`: 계정 `app_metadata.apps`에 `"timecard"`).
장부와 같은 Supabase 프로젝트의 `public.tc_docs` 테이블 한 곳에 들어가요. 경로의 마지막 `/` 앞이 `collection`, 뒤가 `id`, 문서 내용은 `data`(jsonb)예요.

| 컬럼 | 뜻 |
|---|---|
| `collection` | 예: `staff`, `config`, `months/2026-11/punches` |
| `id` | 예: `s123`, `main`, `s123_2026-11-12` |
| `data` | 문서 내용 (아래 표의 필드) |
| `updated_at` | 마지막 수정 시각 (실시간 반영 순서 판단에도 씀) |
| `deleted_at` | 지운 문서 표시 (소프트 삭제, 실제로 지우지 않음) |

- 모든 추가·수정은 `tc_audit_log`에 변경 전/후 내용이 남아요 (`config/sign` 서명 이미지는 내용 생략).
- SQL로 보기 예: `select id, data->>'name' from docs where collection = 'staff' and deleted_at is null;`
- 실수 복구: `tc_audit_log`에서 `old_data`를 찾아 앱에서 다시 입력하거나 SQL로 되돌리기.

| 경로 | 내용 |
|---|---|
| `config/main` | 가게 설정 (아래 표) |
| `config/sign` | 사장님 서명 `{ data: PNG 데이터URL, at }` |
| `staff/{staffId}` | 직원 정보 |
| `months/{YYYY-MM}/punches/{staffId}_{YYYY-MM-DD}` | 하루 출퇴근 기록 (직원·날짜당 1개) |
| `months/{YYYY-MM}/mails/{staffId}_{YYYY-MM-DD}` | 미출근 메일 중복 방지 표시 |
| `contracts/{staffId}_v{n}` | 근로계약서 (버전별) |
| `reports/{YYYY-MM}` | 세무사 전달 내역 (고친 금액·보낸 기록) |
| `status/mail` | 마지막 메일 발송 결과 |
| `status/backup` | 마지막 백업 시각 |
| `status/alert` | 마지막 슬랙 알림 결과 `{ at, ok, kind(test/notyet), text, err }` (서버가 씀) |
| `months/{YYYY-MM}/alerts/{staffId}_{YYYY-MM-DD}` | 슬랙 미출근 알림 중복 방지 표시 (서버가 씀, 직원·날짜당 1개) |
| `tasks/{taskId}` | 업무 지시·공지 (아래 표, v19) |
| `task_reads/{taskId}_{staffId}` | 공지 읽음 `{ taskId, staffId, at, where('tablet'/'phone') }` |
| `months/{YYYY-MM}/task_reports/{taskId}_{staffId}_{YYYY-MM-DD}` | 업무 사진 보고 (아래 표, 직원·업무·날짜당 1개) |
| `awards/{YYYY-MM}` | 이달의 우수직원 확정 `{ staffId, name, rate(달성률 0~1), points(총점), att(업무태도 가중치, v30), final(최종 점수, v30), amount(포상금), note, decidedAt, noticeId(축하 공고 tasks id), paidAt }` (v24) |
| `praise/{id}` | 사장님 칭찬 점수 `{ staffId, ym, pts, note, noteVi(자동 번역, v26), at }` (보너스, 달성률에는 안 들어감) |
| `badges/{staffId}` | 동기부여 (v32): `{ got:{ 배지id: 받은 시각 }, best:{ streak(연속 정시 최고), points(한 달 최고 점수) }, months:{ 'YYYY-MM':{ ontime, late, absent, work, reports, missions, total, end, early(지난달 일찍 온 분 합계, v33), earlyTop(그달 합계 1등, v33) } } }` — 직원 화면을 열 때 앱이 바뀐 것만 저장. 배지는 한 번 받으면 지우지 않음 |
| `thanks/{YYYY-MM-DD}_{보낸 staffId}` | 동료 고마워요 (v32, 하루 한 번) `{ date, from, to, text(40자), textKo 또는 textVi(번역), at }` — 점수에는 안 들어감 |
| `ot/{staffId}_{YYYY-MM-DD}` | 추가근무 요청·승인 (직원·날짜당 1개, v27) `{ staffId, date, kind('pre' 먼저 요청 / 'post' 먼저 하고 보고), status('pending' / 'approved' / 'rejected'), reqMin(요청·보고한 분), okMin(승인된 분 — 먼저 받은 승인 포함), until(요청한 퇴근 시각), reason('busy' 손님 많음 / 'close' 마감 청소 / 'prep' 재료 손질 / 'cover' 동료 대신 / 'etc'), note, noteKo(번역), ownerNote, ownerNoteVi(번역), at, decidedAt, via('tablet'/'phone'/'owner'), pre(먼저 요청이 보고로 바뀌면 처음 요청) }`. 급여 계산: 승인제를 켠 날부터 정해진 시간을 넘긴 근무는 `okMin`까지만 추가근무, 나머지는 확인 대기(보고 결정 전) 또는 불인정(사장님이 '먼저 하고 보고'를 결정한 뒤) — 출퇴근 기록 자체는 바꾸지 않음 |
| `award_reacts/{YYYY-MM}_{staffId}` | 우수직원 축하 공고 반응 `{ ym, staffId, react('yes' 인정 / 'no' 인정 못 함 / 'thanks' 뽑힌 본인 소감), text(80자까지), textKo 또는 textVi(자동 번역), at }` — 한 사람당 한 달 한 개 (v26) |
| `backups/{YYYY-MM-DD}` | 자동 백업 목록 `{ at, ok, date, size, counts, removed, manual, keepDays }` (서버가 씀, v20) |
| `status/autobackup` | 마지막 자동 백업 결과 `{ at, ok, date, size, counts, err }` (서버가 씀) |

전체 백업·자동 백업의 `extra`에는 업무 지시·보고(`tasks`, `task_reads`, `task_reports`)와 v27부터 `ot`, `awards`, `praise`, `award_reacts`, v32부터 `badges`, `thanks`가 들어가요 (`scripts/lib.mjs`가 되살림).

자동 백업 파일은 `tc_docs`가 아니라 Storage **`tc-backups` 버킷(비공개, 서버만 열 수 있음)**에 `{YYYY-MM-DD}.json`으로 있어요. 90일 지나면 서버가 지워요. 모양은 '전체 백업'과 같아요 (`supabase/functions/tc-notyet-check/backup.mjs`).

사진은 `tc_docs`가 아니라 Storage **`tc-photos` 버킷(비공개)**에 있고, 기록에는 사진 번호(id)만 남아요. 화면에서는 7일짜리 임시 URL로 불러와요.
사진 번호 앞머리로 폴더가 나뉘어요 (`public/storage.js`의 `FOLDERS`):

| 앞머리 | 폴더 | 내용 | 지우기 |
|---|---|---|---|
| (없음) | 맨 위 `{id}.jpg` | 출퇴근 얼굴 사진 | 사장님이 '3개월 지난 사진 지우기' |
| `w_` | `work/` | 업무 보고 사진 | **60일 지나면 자동** (앱이 하루 한 번, 사장님 화면·태블릿·직원 휴대폰 중 먼저 연 기기가) |
| `r_` | `taskref/` | 지시·공지 참고 사진 (리뷰 캡처 등) | 지시를 지울 때 |
아티팩트 시절 사진은 옮기지 않았어요. 그때 기록의 사진 번호는 남아 있지만 사진은 '사진 없음(깨진 그림)'으로 보여요.

## tasks/{taskId} (업무 지시·공지, v19)

| 필드 | 뜻 |
|---|---|
| `kind` | `task`(사진 보고 업무) / `notice`(공지만) |
| `title`, `body` | 제목, 내용 |
| `refPhotos` | 참고 사진 번호들 (`r_…`, 4장까지) |
| `target` | 담당 `{mode:'all'(전체) / 'pos'(담당별) / 'staff'(직원 고르기), pos, ids[]}` |
| `repeat`, `days` | `once`(만든 날 하루) / `daily`(매일) / `days`(요일, `days`에 0=일요일…) — 사진 보고 업무만 |
| `due`, `minPhotos` | 마감 시각 `HH:MM`, 필요한 사진 수 |
| `active`, `start`, `createdAt` | 켜짐 여부(멈추기), 시작 날짜, 만든 시각 |
| `pinned` | 공지만: `true`면 가게 태블릿·직원 휴대폰 첫 화면에 고정 (공고, v21) |
| `updatedAt`, `repostAt` | 고친 시각 / '고쳐서 다시 올리기' 시각 (v36). `repostAt`보다 먼저 읽은 기록은 안 읽음으로 셈, 목록·첫 화면 순서도 이 시각 |
| `titleVi`, `bodyVi` | 베트남어 제목·내용 (v22). 직원 화면을 Tiếng Việt로 보면 베트남어가 먼저, 한국어가 아래 작게. v26부터 비워 두고 저장하면 자동 번역(`tc-translate`)으로 채움 |
| `award` | 우수직원 축하 공고만: 그달 `YYYY-MM` (이 공고 아래에 인정/인정 못 함 반응이 붙음, v24) |

## months/{ym}/task_reports/{taskId}_{staffId}_{date} (업무 사진 보고)

| 필드 | 뜻 |
|---|---|
| `taskId`, `staffId`, `date` | 업무, 직원, 날짜 |
| `photos`, `note` | 보낸 사진 번호들(`w_…`), 직원 한마디 |
| `noteKo` | 직원 한마디를 한국어로 자동 번역한 것 (한마디에 한글이 없을 때만, v26) |
| `sentAt`, `round`, `via` | 보낸 시각, 회차(다시 보내면 +1), `phone` |
| `oldPhoto` | 찍은 지 10분 넘은 사진(앨범 사진)이 섞였으면 `true` |
| `status` | `sent`(확인 대기) / `ok`(확인 완료) / `redo`(다시 요청) — '아직'·'마감 지남'은 저장하지 않고 화면에서 계산 |
| `ownerNote`, `checkedAt` | 사장님 '다시 해 주세요' 메모, 확인한 시각 |
| `ownerNoteVi` | 사장님 메모의 베트남어 자동 번역 (v26) |

## config/main

| 필드 | 뜻 | 기본값 |
|---|---|---|
| `storeName` | 가게 이름 | 우리 가게 |
| `ownerPin` | 사장님 화면 관리 번호 | 0000 |
| `masterPin` | 출퇴근 마스터 번호 (비면 안 씀) | '' |
| `graceMin` | 지각 봐주는 분 | 5 |
| `evalStart` | 출퇴근 평가 시작일 `YYYY-MM-DD` — 이 날 전은 지각·조퇴·결근·점수·배지에서 뺌, 일한 시간은 그대로 (v34, 비우면 처음부터) | 2026-11-17 |
| `otUnit` | 추가근무 인정 단위(분) | 10 |
| `earlyClamp` | 일찍 와도 정해진 시각부터 계산 | true |
| `otPremium` | 추가근무 1.5배 (5인 이상) | false |
| `weeklyHoliday` | 주휴수당 계산 | true |
| `rates` | 4대보험 근로자 부담 요율 `{np, hi, ltc, ei}` (%) | 4.75 / 3.595 / 13.14 / 0.9 |
| `mail` | 메일 알림 `{on, to, ev:{in, late, notyet, out}}` | 꺼짐 |
| `photo` | 사진 인증 `{on}` | 꺼짐 |
| `biz` | 사업주 정보 `{name, ceo, addr, phone}` | 빈 값 |
| `contract` | 계약서 `{on, autoOwnerSign, payDay, payMethod, special}` | 꺼짐 |
| `tax` | 세무사 전달 `{email, auto}` | 빈 값 / 꺼짐 |
| `award` | 이달의 우수직원 `{amount, months}` — 기본 포상금(확정할 때 그달 금액을 바꿀 수 있음, v24), `months`: 선발을 진행하는 달 `{ 'YYYY-MM': true }` (v29, 없으면 그달은 안 함. 확정한 달은 늘 진행), `att`: 업무태도 가중치 `{ 'YYYY-MM': { 직원id: { mode('stars' 별점 자동 / 'manual' 직접), h(위생·청결), k(친절), t(팀워크), r(책임감) 별 1~5, w(직접 가중치 0.8 / 0.9 / 1 / 1.1 / 1.2 / 1.3) } } }` (v35, v37 깎기). 별점이면 ★1 ×0.7 ~ ★3 ×1.0 ~ ★5 ×1.3 (별 하나에 ±0.15), 직접이면 w. v30 숫자는 직접으로, v32 별점만 있던 것은 별점으로 읽음. 최종 점수 = 달성률 × 100 × 가중치 |
| `team` | 팀 목표 `{on, kind('ontime' 정시 출근률 자동 / 'custom' 직접), target(정시 출근률 %), title, titleVi, goal(목표 수), unit, current(지금까지), period('month' / 'week' / 'range'), from, to, reward, rewardVi, setAt}` — 태블릿 첫 화면·직원 휴대폰에 (v32, v37 종류·기간) | 꺼짐 / 90 | 50,000 / 없음 |
| `ot` | 추가근무 승인제 `{on, since}` — 켜면 `since`(켠 날)부터 승인한 추가근무만 급여에 (v27) | 꺼짐 |
| `slack` | 슬랙 알림 `{on, ev:{notyet, in, out, report, due, ot}}` (슬랙 주소는 서버 secret에만 있음, ev가 없으면 모두 켜짐) | 꺼짐 |
| `geo` | 위치 확인 `{on, lat, lng, acc, radius, setAt}` — 가게 좌표와 '가게 밖' 기준 거리(m) (v12) | 꺼짐 / 200m |

## staff/{staffId}

| 필드 | 뜻 |
|---|---|
| `name`, `position` | 이름, 담당 |
| `pin` | 개인 번호 4자리 (관리 번호·마스터 번호와 겹치면 저장 안 됨) |
| `payType` | `hour`(시급제) / `month`(월급제) |
| `wage` | 시급 |
| `monthly` | 월급(세전) — 월급제일 때, 근무한 날짜 비율로 계산 |
| `hireDate`, `endDate` | 입사일, 퇴사일 |
| `birth`, `rrn` | 생년월일, 주민등록번호(선택, 화면에선 가림) |
| `deduct` | `none` / `biz`(3.3%) / `ins`(4대보험) — `ins`면 세무사 내역에서 4대보험 가입자 |
| `sched[7]` | 요일별 근무표 `{on, start, end, brk}` (0 = 일요일). `on:false` = 정기 휴무 |
| `active`, `sample`, `order` | 근무 중 여부, 예시 데이터 여부, 정렬 순서 |
| `geoExempt` | 외근 직원 — 가게 밖에서 찍어도 '가게 밖'으로 보지 않음 (v13) |
| `phonePunch` | 휴대폰 출퇴근 허용 — 직원 휴대폰 화면에 출근·퇴근 단추 (v19) |

## months/{ym}/punches/{staffId}_{date}

| 필드 | 뜻 |
|---|---|
| `staffId`, `name`, `date` | 직원, 이름(당시), 날짜 |
| `kind` | `work` / `leave`(휴무 처리) |
| `in`, `out` | 출근·퇴근 시각 (밀리초). 퇴근 전이면 `out: null` |
| `sched` | 그날의 정해진 근무 (기록 당시 근무표를 복사해 둠, 없으면 null) |
| `lateMin` | 지각 분 |
| `edited`, `note` | 사장님 수정 여부, 메모 |
| `inPhoto`, `outPhoto` | 사진 번호 (찍지 못했으면 null) |
| `inPhotoNote`, `outPhotoNote` | 사진 없음·확인 필요 사유 |
| `inGeo`, `outGeo` | 위치 `{lat, lng, acc, dist, out}` 또는 `{err}` (위치 확인을 켰을 때만). 외근 직원은 `out:false, ex:true, far` (v12·v13) |
| `inBy`, `outBy` | `master`면 사장님 마스터 번호로 대리 입력 |
| `inVia`, `outVia` | `phone`이면 직원 휴대폰 화면에서 기록 (v19). 없으면 가게 태블릿 |

## contracts/{staffId}_v{n}

| 필드 | 뜻 |
|---|---|
| `ver`, `prev` | 버전 번호, 이전 계약서 id (변경 계약이면) |
| `tpl` | 계약서 양식 번호 (1 = 처음 표준 양식, 2 = 가게 종이 양식). 없고 서명돼 있으면 1, 서명 전 초안은 2로 보이고 서명할 때 고정 (v14) |
| `terms` | 계약 조건 `{startDate, endDate, place, job, sched, holiday, payType, wage, monthly, bonus, extraPay, payDay, payMethod, ins, special}` |
| `emp` | 근로자가 적은 `{addr, phone, email}` |
| `empSign`, `empSignedAt` | 근로자 서명(PNG 데이터URL), 시각 |
| `ownerSign`, `ownerSignedAt`, `biz` | 사업주 서명, 시각, 서명 당시 사업주 정보 |
| `hash` | 서명 완료 시 내용의 SHA-256 앞 32자리 (문서 지문) |

서명이 끝난 계약서는 고치지 않고, 내용을 바꾸면 새 버전(`v{n+1}`)을 만들어요.

## reports/{ym}

`{ amounts:{staffId: 금액}, rrn:{staffId: true/false}, note, sentAt, sentTo, auto, err, triedOn }`
— `amounts`에는 계산값과 다르게 고친 금액만 들어가요.

## 기기에만 남는 값 (브라우저 localStorage, 앞에 `tc.`)

`mode`(출퇴근/직원 휴대폰/사장님 화면), `lang`(`ko` / `vi` 직원 화면 언어), `device`(`kiosk` 가게 태블릿 / `phone` 직원 휴대폰), `phoneStaff`(이 휴대폰에 연결된 직원), `tab`, `sound`, `ownerDevice`(이 기기 기억하기), `notified`, `mailed`(오늘 띄운 알림), `workClean`(업무 사진 정리한 날)

storage.js가 쓰는 값: `tc_pending_v1`(서버에 아직 못 보낸 쓰기 목록), `sb-…-auth-token`(Supabase 로그인 정보)

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

사진은 `tc_docs`가 아니라 Storage **`tc-photos` 버킷(비공개)**에 `{사진id}.jpg`로 있고, 기록에는 사진 번호(id)만 남아요. 화면에서는 7일짜리 임시 URL로 불러와요.
아티팩트 시절 사진은 옮기지 않았어요. 그때 기록의 사진 번호는 남아 있지만 사진은 '사진 없음(깨진 그림)'으로 보여요.

## config/main

| 필드 | 뜻 | 기본값 |
|---|---|---|
| `storeName` | 가게 이름 | 우리 가게 |
| `ownerPin` | 사장님 화면 관리 번호 | 0000 |
| `masterPin` | 출퇴근 마스터 번호 (비면 안 씀) | '' |
| `graceMin` | 지각 봐주는 분 | 5 |
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
| `slack` | 슬랙 미출근 알림 `{on}` (슬랙 주소는 서버 secret에만 있음) | 꺼짐 |
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

`mode`(출퇴근/사장님 화면), `tab`, `sound`, `ownerDevice`(이 기기 기억하기), `notified`, `mailed`(오늘 띄운 알림)

storage.js가 쓰는 값: `tc_pending_v1`(서버에 아직 못 보낸 쓰기 목록), `sb-…-auth-token`(Supabase 로그인 정보)

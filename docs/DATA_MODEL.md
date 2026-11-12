# 저장소 구조 (claude.ai 아티팩트 `db`)

문서(doc)는 `컬렉션/문서id` 형태의 경로로 저장돼요. 모두 사장님 계정 전용이에요.

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

사진은 `db`가 아니라 아티팩트 **파일 보관함(assets)**에 있고, 기록에는 사진 번호(id)만 남아요. 화면에서는 `/_blob/{id}`로 불러와요.

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
| `inBy`, `outBy` | `master`면 사장님 마스터 번호로 대리 입력 |

## contracts/{staffId}_v{n}

| 필드 | 뜻 |
|---|---|
| `ver`, `prev` | 버전 번호, 이전 계약서 id (변경 계약이면) |
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

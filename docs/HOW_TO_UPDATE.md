# 고치고 다시 올리는 방법

프로그램은 `src/timecard.html` 파일 하나예요. 고친 뒤 claude.ai 아티팩트에 **같은 주소로** 다시 올리면 태블릿과 휴대폰에 바로 반영돼요. 데이터는 그대로 남아요.

## Claude(Claude Code)에게 맡길 때

이 폴더를 열고 이렇게 말하면 돼요.

> `src/timecard.html`을 고쳐서 https://claude.ai/artifact/6n5eNiJTa4CfLhzssb7V6m 에 같은 주소로 다시 올려 줘. 권한 설정은 `artifact.json`에 있어.

- Claude는 올라가 있는 최신 버전을 먼저 읽어서(`Artifact read`) 이 파일과 다른지 확인한 뒤 고쳐야 해요.
- 다시 올릴 때 권한(capabilities)을 바꾸지 않으면 그대로 유지돼요. 바꿀 때는 `artifact.json`의 4가지를 **모두** 적어야 해요.

## 직접 고칠 때 순서

1. `src/timecard.html` 수정
2. `npm test` 로 시험 (모두 통과해야 함)
3. Claude에게 위 주소로 다시 올려 달라고 하기
4. `docs/CHANGELOG.md`에 바뀐 것 적기, `artifact.json`의 `publishedVersion` 올리기

## 코드 구조 (timecard.html 안의 `<script>`)

| 부분 | 하는 일 |
|---|---|
| 상태 (`DEFAULT_CONFIG`, `S`, `cfg()`) | 설정 기본값과 화면 상태 |
| 근무 계산 (`dayCalc`, `dayCost`, `weekHoliday`, `monthSummary`, `costSeries`) | 지각·결근·추가근무·급여 계산 |
| 알림·메일 (`notify`, `sendMail`, `mailPunch`, `checkNotyetMail`) | 화면 알림, Gmail 알림 |
| 사진 인증 (`startCam`, `stampPhoto`, `uploadPhoto`) | 카메라, 시각 새기기, 업로드 |
| 화면 (`kioskView`, `nowView`, `recordsView`, `timecardView`, `payrollView`, `contractView`, `staffView`) | 탭별 화면 |
| 전자 근로계약서 (`contractBody`, `kioskContract`, `CACT`) | 계약서 문구, 서명판, 버전 관리 |
| 세무사 전달 (`reportRows`, `reportText`, `sendReport`, `autoReport`, `RACT`) | 급여 내역 정리·발송 |
| 백업 (`readAllPunches`, `BACT`) | 전체 백업·엑셀 |
| 동작 (`ACT`) | 버튼(`data-act`)마다 실행할 일 |
| 시작 (`boot`) | 저장소 연결, 실시간 구독, 1초·30초 타이머 |

claude.ai 기능은 `window.claude.use('db' | 'assets' | 'downloads' | 'mcp')`로 불러와요.

# 경사하강법 시뮬레이터

학습률(α)을 바꿔 가며 공의 움직임을 관찰하는 교육용 웹사이트예요.
서버·데이터베이스·로그인 없이 **브라우저에서만** 동작하는 정적 사이트라서 GitHub Pages로 바로 배포할 수 있어요.

| 모드 | 하는 일 |
|---|---|
| 게임모드 | 축구공 애니메이션, 퀘스트·XP·보상, 결과별 특수효과(거북이·번개·핑퐁·폭발) |
| 연구자모드 | 실험 후 **이동 경로 점선**, Loss 변화 그래프, **학습률 비교 실험실**, 관찰 가이드 |
| 실험도전모드 | 준비된 함수 6개 중 선택, 시작 위치별 목표, 도전 과제, 함수별 개인 기록과 기록 비교 |

## 바로 열어 보기

- `index.html`을 더블클릭해도 열려요(`file://` 지원).
- 로컬 서버로 보려면: `python3 -m http.server 8000` 후 `http://localhost:8000` 접속.

## GitHub Pages 배포

1. 이 폴더의 파일 전체를 GitHub 저장소 루트에 올려요(`index.html`이 루트에 있어야 해요).
2. 저장소 **Settings → Pages → Build and deployment**에서 *Deploy from a branch*를 고르고, 브랜치 `main`, 폴더 `/ (root)`를 선택해요.
3. 잠시 뒤 `https://<사용자이름>.github.io/<저장소이름>/` 에서 열려요.

모드 주소는 `#`을 쓰기 때문에 새로고침이나 직접 접속도 그대로 동작해요.

| 주소 | 화면 |
|---|---|
| `/#/` | 첫 화면 |
| `/#/game` | 게임모드 |
| `/#/research` | 연구자모드 |
| `/#/challenge` | 실험도전모드 함수 목록 |
| `/#/challenge/F04` | 특정 함수(F01~F06)의 실험실 |

`.nojekyll` 파일이 들어 있어서 GitHub가 폴더를 따로 가공하지 않아요.

## 데이터는 어디에 저장되나요?

- 실험 기록과 게임 진행 상황은 **이 브라우저의 LocalStorage**에만 저장돼요.
- 서버로 보내지 않고, 다른 사람의 기록과 합치지 않아요. 통계 수집 기능도 없어요.
- 브라우저 데이터를 지우거나 다른 기기를 쓰면 기록이 보이지 않아요. 보관하고 싶다면 각 화면의 **CSV 내려받기**를 쓰세요.
- LocalStorage를 쓸 수 없는 환경(시크릿 모드 등)에서는 화면을 닫기 전까지만 유지된다고 안내해요.

## 폴더 구조

```
index.html
.nojekyll
assets/
├─ css/
│  ├─ tokens.css          디자인 토큰(색·글꼴·간격)
│  ├─ base.css            기본 규칙
│  ├─ style.css           공통 화면·연구자·도전 모드 스타일
│  └─ game.css            게임모드 스타일(이전 디자인 보존, .game-view 아래로 한정)
└─ js/
   ├─ core/               ★ 세 모드가 함께 쓰는 계산 엔진
   │  ├─ functionRegistry.js   함수 목록(설정 데이터)·극값 계산
   │  ├─ gradientDescent.js    x(n+1) = x(n) − α·f′(x(n))
   │  └─ resultAnalyzer.js     결과 유형 판정
   ├─ modes/              gameMode / researchMode / challengeMode / gameEffects
   ├─ visualization/      functionGraph(곡선·공·점선 경로) / lossChart / trajectory / gameGraphFrame
   ├─ storage/            localRecords(LocalStorage) / csvExport
   ├─ ui/                 common / labControls / home
   └─ main.js             주소(#/…)에 따른 모드 전환
tests/core.test.js        계산 엔진 검증(Node)
```

스크립트는 일반 `<script>` 태그로 불러오기 때문에 빌드 도구가 필요 없어요.

## 함수 추가하기

`assets/js/core/functionRegistry.js`의 `FUNCTION_DEFS`에 항목 하나만 추가하면, 세 모드의 함수 선택·그래프·기록에 그대로 나타나요.
화면 코드는 고치지 않아도 돼요.

```js
{
  id: 'F07', name: '새 함수', expr: 'f(x) = x² + 1', dexpr: 'f′(x) = 2x',
  f: x => x * x + 1, df: x => 2 * x, d2f: () => 2,        // 함수값·도함수·이계도함수
  view: { xMin: -5, xMax: 5 },                              // 그래프 기본 범위
  start: { default: 4, options: [-4, 4], min: -5, max: 5 },
  alpha: { min: 0.05, max: 1.5, step: 0.05, default: 0.5 },
  iterations: { min: 1, max: 20, default: 10 },
  tolX: 1e-5,                                               // 성공 판정 오차
  compareAlphas: [0.2, 0.5, 0.8, 1.0, 1.2],
  feature: '…', goal: '…', probe: '…',
  guide: [['조건', '관찰되는 현상', '해석']]
}
```

극솟값·극댓값과 시작 위치별 목표는 도함수의 부호 변화에서 자동으로 계산해요.
추가한 뒤 `node tests/core.test.js`로 도함수가 맞는지 확인하세요.

## 검증

```
node tests/core.test.js
```

도함수(수치 미분 대조), 기존 게임 계산과의 동일성(F01 300개 조건), 극값·목표 정의, 결과 유형 판정을 확인해요.

## 알려 둘 점

- 글꼴(Jua, Noto Sans KR)은 Google Fonts에서 불러와요. 연결이 없으면 기기 기본 한글 글꼴로 대체돼서 화면은 그대로 동작해요.
- 게임모드의 효과·이모지는 이전 버전의 모습을 그대로 유지해요. 기기에 따라 이모지 모양이 조금 다를 수 있어요.
- 기기의 "동작 줄이기" 설정을 켜면 번쩍이는 효과와 부드러운 이동 대신 단계별 점프로 보여 줘요.
- 이번 범위에서 제외한 기능: 실시간 계산식 표시, 기울기/접선 시각화, 삼차함수, 임의 함수 입력, 참여자 통계, 로그인, 서버.

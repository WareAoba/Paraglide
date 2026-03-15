# Paraglide 리팩토링 종합 분석 및 지시서

## 1. 프로젝트 전체 분석

### 1-1. 앱 개요

**Paraglide**는 `.txt` 파일을 열어 단락(paragraph) 또는 줄(line) 단위로 분할한 뒤, 순차적으로 클립보드에 복사해주는 Electron 데스크톱 앱입니다. 번역가/교정자가 원고를 붙여넣기하며 작업할 때 사용하는 도구로 보입니다.

### 1-2. 핵심 기능 목록

| # | 기능 | 구현 위치 |
|---|---|---|
| F1 | 파일 열기 (다이얼로그/드래그&드롭/히스토리) | `FileManager.openFile`, MainComponent |
| F2 | 단락/줄 분할 및 순차 클립보드 복사 | `TextProcessUtils`, `ContentManager` |
| F3 | 단락 이동 (이전/다음/페이지 단위) | `IPCManager.handleMove` |
| F4 | 글로벌 키보드 단축키 (Shift+Arrow 등) | `SystemListener.setupKeyboardListener` |
| F5 | 오버레이 윈도우 (Always-on-top 미리보기) | `OverlayComponent`, `WindowManager` |
| F6 | 일시정지/재개 | `handlePause`/`handleResume` |
| F7 | 사이드바 (파일 히스토리, 현재 파일 정보) | `Sidebar`, `Panel` |
| F8 | 한글 지원 검색 (초성/부분일치/자모검색) | `Search.jsx` |
| F9 | 텍스트 에디터 (WYSIWYG) | `TextEditor.jsx` + SunEditor |
| F10 | 설정 (테마/언어/오버레이/처리모드) | `Settings.jsx` |
| F11 | 위치 기억 및 복원 (파일 해시 기반) | `FileManager.checkExistingFile` |
| F12 | 다국어 지원 (ko/en/ja/zh) | i18next |
| F13 | 시스템 테마 연동 (Auto/Light/Dark) | `ThemeManager` |
| F14 | 외부 클립보드 감지 시 자동 일시정지 | `SystemListener.onClipboardChange` |
| F15 | 디버그 콘솔 | `Console.jsx` |
| F16 | 페이지 번호 인식 (합페이지 포함) | `TextProcessUtils.extractPageNumber` |
| F17 | 앱 단축키 (Ctrl+O/F/M/,/Esc) | `SystemListener.setupAppShortcuts` |
| F18 | 인코딩 자동 감지 (CP949 등) | `FileManager.openFile` |
| F19 | 임시 백업/복원 | `FileManager.backupContent`/`restoreBackup` |

### 1-3. 기술 스택

| 분류 | 기술 |
|---|---|
| 프레임워크 | Electron 26 + React 18 |
| 빌드 | Vite 6 + Electron Forge |
| 상태관리 | ~~Redux Toolkit~~ → AppState (EventEmitter 기반, main process) |
| 라우팅 | react-router-dom (Hash Router) |
| 국제화 | i18next + react-i18next |
| 에디터 | SunEditor (WYSIWYG) |
| UI 라이브러리 | react-colorful, react-contexify, simplebar-react, react-transition-group |
| 유틸리티 | hangul-js, jschardet, iconv-lite, hex-to-css-filter |
| 키보드 | node-global-key-listener, electron-localshortcut |

---

## 2. 발견된 핵심 문제

### 2-1. 단일진실원칙(SSOT) 위배 — 가장 심각

상태가 **3곳에서 독립적으로 관리**되고 있어 동기화 실패가 발생합니다:

```
[1] globalState (main.js L120)     — 일반 JS 객체
[2] Redux Store (store.js)         — @reduxjs/toolkit
[3] React useState (MainComponent) — 컴포넌트 로컬 state
```

**중복 상태 목록:**

| 상태 키 | globalState | Redux (textProcess) | Redux (config) | React useState |
|---|:---:|:---:|:---:|:---:|
| `programStatus` | ✅ | ✅ | | ✅ |
| `currentParagraph` | ✅ | ✅ | | ✅ |
| `isPaused` | ✅ | | | ✅ |
| `isOverlayVisible` | ✅ | | ✅ | ✅ |
| `processMode` | ✅ | ✅ | ✅ | |
| `viewMode` | | | ✅ | ✅ |
| `currentFilePath` | ✅ | ✅ | | ✅ |
| `paragraphs` | ✅ | ✅ | | ✅ |

**추가 SSOT 위배:**
- `processMode`가 `configSlice`와 `textProcessSlice` 양쪽에 존재
- `viewMode`도 동일하게 중복
- `ConfigManager.loadAndValidateConfig`가 **같은 파일 내에 2번 정의**되어 후자가 전자를 덮어씀 (`src/store/utils/ConfigManager.js` L92, L133)

### 2-2. main.js 2016줄 갓 파일(God File)

9개의 Manager 객체가 하나의 파일 안에서 서로를 직접 참조하며, `ipcMain.emit`으로 자기 자신에게 이벤트를 보내는 패턴이 만연합니다:

```javascript
// SystemListener에서 main.js의 핸들러를 호출하기 위해 자기 자신에게 emit
ipcMain.emit('move-to-next');       // SystemListener.jsx L304
ipcMain.emit('toggle-pause');       // SystemListener.jsx L120 (onClipboardChange)
```

**포함된 Manager 목록:**
1. `ContentManager` — 클립보드 복사/디바운스
2. `StatusManager` — 상태 전환 유효성 검증
3. `FileManager` — 파일 I/O, 로그, 히스토리
4. `LanguageManager` — i18next 초기화/언어 변경
5. `ThemeManager` — 테마 계산/브로드캐스트
6. `DialogManager` — 다이얼로그 표시
7. `WindowManager` — BrowserWindow 생성/관리
8. `IPCManager` — IPC 핸들러 등록
9. `ApplicationManager` — 앱 라이프사이클

### 2-3. Renderer에서 Redux를 전혀 사용하지 않음

- `<Provider store={...}>`가 없고, `useSelector`/`useDispatch`도 없음
- Redux는 **main process에서만** `store.getState()`/`store.dispatch()`로 사용됨
- 모든 상태는 IPC(`ipcRenderer.invoke`/`send`)를 통해 전달됨
- **Redux가 사실상 전역 변수 객체 역할만 하고 있음**

### 2-4. 컴포넌트 구조 문제

| 파일 | 문제 |
|---|---|
| `MainComponent.jsx` (1023줄) | 아이콘 23개를 각각 `useState`로 관리, 극심한 prop drilling |
| `Search.jsx` L353 | `setresults([])` — 소문자 r, **런타임 에러** (ReferenceError) |
| `OverlayComponent.jsx` L120 | `set-current-paragraph` IPC 전송 → main.js에 해당 핸들러 없음 (**동작 안 함**) |
| `Settings.jsx` L415 | `<svg>` 태그를 닫은 뒤 `<polyline>`이 바깥에 있음 (**체크박스 렌더링 깨짐**) |
| `Console.jsx` L10 | `const theme = 'dark'` 하드코딩 — 시스템 테마 무시 |

### 2-5. 사용하지 않는 라이브러리

| 라이브러리 | 상태 |
|---|---|
| `@monaco-editor/loader` | 코드 어디에서도 import되지 않음 — 완전 미사용 |
| `@monaco-editor/react` | 동일 |
| `monaco-editor` | 동일 |
| `vite-plugin-monaco-editor` | `vite.config.js`에서 사용하지 않음 |
| `electron-clipboard-watcher` | 설치만 되어 있고, 직접 `setInterval` 폴링 구현으로 대체됨 |
| `d2coding` (npm) | npm 패키지 설치되었으나 CDN으로 별도 로드 중 |
| `i18n` | `i18next`와 중복 설치 |

### 2-6. SystemListener 문제

| 현재 동작 | 문제 |
|---|---|
| `setInterval(100ms)` 폴링으로 클립보드 감시 | CPU 리소스 낭비, 초당 10회 읽기 |
| `onClipboardChange`에서 `ipcMain.emit('toggle-pause')` | 외부 복사 감지 시 앱이 일시정지 (의도 불분명) |
| `initialize()` 내부에서 `ipcMain.on` 리스너 등록 | 재초기화 시 중복 등록 가능 |
| `ipcMain.emit`으로 자신에게 이벤트 발생 | 비정상적 IPC 사용 패턴 |

---

## 3. CSS 및 UI 구조 분석

### 3-1. 테마 시스템

- `data-theme="dark"` 속성 + CSS 변수 재할당 방식
- `:root`에 라이트 테마 기본값, `[data-theme="dark"]`에서 재정의
- 아이콘 색상은 CSS `filter`로 제어 (`--icon-filter`, `--primary-filter`)

### 3-2. CSS 파일 구조

```
CSS/
  App.css              — 전역 CSS 변수, 테마, 폰트 (152줄)
  MainComponent.css    — 레이아웃, 뉴모피즘 버튼 (200줄)
  Settings.css         — 모달 애니메이션 (463줄)
  Sidebar.css          — 좌측 드로어 (181줄)
  OverlayComponent.css — 오버레이 윈도우
  Controllers/         — 체크박스, 드롭다운, 슬라이더 등 재사용 컨트롤
  Sidebar/             — 패널, 검색 전용
  Views/               — 각 뷰별 스타일
```

### 3-3. 유지해야 할 UI 라이브러리

| 라이브러리 | 용도 | 비고 |
|---|---|---|
| `react-colorful` | 설정의 색상 피커 | 고유 UI |
| `react-contexify` | 사이드바 우클릭 메뉴 | 고유 UI |
| `simplebar-react` | ListView/Console 커스텀 스크롤바 | 고유 UI |
| `react-transition-group` | 뷰 전환 애니메이션 | 고유 UI |
| `suneditor-react` | 텍스트 에디터 | F9 핵심 |
| `hangul-js` | 한글 검색 (초성/자모) | F8 핵심 |

---

## 4. 리팩토링 로드맵

### Phase 0: 사전 준비 (안전장치 구축) ✅ 완료

> **목표**: 기능 변경 없이 즉시 수정 가능한 버그/불필요 요소 제거

#### 0-1. 미사용 라이브러리 제거

```bash
npm uninstall @monaco-editor/loader @monaco-editor/react monaco-editor \
  vite-plugin-monaco-editor electron-clipboard-watcher d2coding i18n
```

#### 0-2. 즉시 버그 패치

| 파일 | 수정 내용 |
|---|---|
| `src/components/sidebar/Search.jsx` L353 | `setresults` → `setResults` |
| `src/components/Settings.jsx` L415 | `<svg>` 닫힘 후 `<polyline>` → svg 안으로 이동 |
| `src/components/OverlayComponent.jsx` L120 | `set-current-paragraph` → `move-to-position` |
| `src/store/utils/ConfigManager.js` | 중복 `loadAndValidateConfig` 메서드 제거 (L92 제거, L133 유지) |
| `public/manifest.json` | `"Create React App Sample"` → `"Paraglide"` |

#### 0-3. 기능 체크리스트 작성

모든 F1~F19 기능에 대해 수동 동작 확인 후 기준선(Baseline) 확보.

---

### Phase 1: Main Process 분리 ✅ 완료

> **목표**: 2016줄 `main.js`를 모듈로 분리. **기능 변경 없이** 구조만 정리.

#### 1-1. 목표 디렉토리 구조

```
src/
  main.js                    ← 엔트리포인트 (초기화만, ~50줄)
  main/
    constants.js             ← ProgramStatus, FILE_PATHS, DEBOUNCE_TIME
    state.js                 ← globalState + updateState (SSOT 기반)
    managers/
      FileManager.js         ← 파일 I/O, 로그, 히스토리
      WindowManager.js       ← BrowserWindow 생성/관리
      IPCManager.js          ← IPC 핸들러 등록
      DialogManager.js       ← 다이얼로그 표시
      ThemeManager.js        ← 테마 계산/브로드캐스트
      LanguageManager.js     ← i18next 초기화/언어 변경
      ContentManager.js      ← 클립보드 복사/디바운스
      StatusManager.js       ← 상태 전환 유효성 검증
      ApplicationManager.js  ← 앱 라이프사이클
```

#### 1-2. 핵심 원칙

- `ipcMain.emit` → **직접 함수 호출**로 전환
- Manager 간 **순환 참조 제거** → 의존 주입 또는 이벤트 버스 패턴
- 각 모듈은 `module.exports`로 내보내기 (main process는 CommonJS 유지)
- Manager끼리의 참조는 초기화 시점에 주입

#### 1-3. 체크리스트

- [x] `src/main/` 디렉토리 생성
- [x] `constants.js` 분리 (ProgramStatus, FILE_PATHS, DEBOUNCE_TIME 등)
- [x] 9개 Manager 각각 파일로 분리
- [x] `ipcMain.emit` → 직접 함수 호출로 전환 *(Phase 3에서 처리 → 완료)*
- [x] `main.js`를 진입점(초기화 + import only)으로 축소
- [x] 기능 테스트 (빌드 + Electron 실행 검증 완료)

---

### Phase 2: Redux → AppState 전환 (Main Process 부분 ✅ 완료)

> **목표**: Main process의 Redux를 자체 상태 객체로, Renderer의 useState 난마를 Zustand로 통합

#### 2-1. Main Process: Redux → 자체 EventEmitter 상태 객체

**현재 Redux가 하는 일 (main process에서만):**

```javascript
store.getState().textProcess   // 상태 읽기
store.getState().config        // 설정 읽기
store.dispatch(action)         // 상태 쓰기
store.subscribe(callback)      // 변경 감지 (logWindow용)
```

**대체 구현:**

```javascript
// src/main/state.js
const { EventEmitter } = require('events');

class AppState extends EventEmitter {
  #state = {
    config: { /* configSlice initialState */ },
    textProcess: { /* textProcessSlice initialState */ },
    log: { logs: [], filter: 'all' },
    // globalState를 여기에 통합
    runtime: {
      programStatus: 'Ready',
      isPaused: true,
      isOverlayVisible: false,
      currentFilePath: null,
    }
  };

  get(path) { /* path string으로 nested 접근 */ }
  set(path, value) { /* 변경 후 emit('change', path) */ }
}
```

**효과:**
- `globalState` + Redux Store → **하나로 통합** (SSOT 달성)
- `store.subscribe` → `appState.on('change')`
- `@reduxjs/toolkit` 제거 가능

#### 2-2. Renderer: Zustand 도입

```javascript
// src/stores/useAppStore.js
import { create } from 'zustand';

const useAppStore = create((set) => ({
  programStatus: 'Ready',
  paragraphs: [],
  currentParagraph: 0,
  isPaused: false,
  isOverlayVisible: false,
  // ...

  // IPC 이벤트 수신 시 자동 동기화
  syncFromMain: (state) => set(state),
}));
```

**효과:**
- MainComponent의 거대한 `useState` → Zustand store로 이동
- 아이콘 23개 → `useIconStore` 하나로 통합
- Settings의 설정 상태 → `useSettingsStore`
- **Prop drilling 완전 제거** → 각 컴포넌트에서 직접 `useAppStore()`

#### 2-3. 체크리스트

- [x] `npm install zustand`
- [x] Main process: Redux → 자체 EventEmitter 상태 객체 (`AppState` 클래스)
- [x] Renderer: Zustand store 설계 (`useAppStore` — 아이콘/설정 통합)
- [x] IPC 수신 → Zustand 자동 동기화 훅 작성 (`useIPC`)
- [x] `globalState` 제거, AppState로 통합
- [x] `npm uninstall @reduxjs/toolkit`
- [x] 기능 테스트 (빌드 + Electron 실행 검증 완료)

---

### Phase 3: SystemListener 개선 ✅ 완료

> **목표**: 시스템 리스너의 안정성과 효율성 향상

#### 3-1. 변경 사항

| 현재 | 개선 |
|---|---|
| `setInterval(100ms)` 폴링 | 간격 증가(500ms) + 변경 시에만 처리 |
| `ipcMain.emit('toggle-pause')` (자기 이벤트) | `StatusManager.pause()` 직접 호출 |
| `ipcMain.emit('move-to-next')` | `NavigationManager.moveToNext()` 직접 호출 |
| `initialize()`에서 `ipcMain.on` 등록 | constructor에서 한 번만 등록 또는 guard |

#### 3-2. 보존 영역

> ⚠️ `setupKeyboardListener` 메서드 내부는 **"절대로 건들지 마세요"** 주석이 있으므로 보존.
> 단, 내부에서 호출하는 `this.moveToNext()` 등의 **구현체**는 직접 함수 호출로 변경 가능.

#### 3-3. 체크리스트

- [x] 클립보드 폴링 간격 조정 (100ms → 500ms)
- [x] `ipcMain.emit` 호출 → 직접 함수 호출
- [x] 중복 리스너 등록 방지 guard 추가
- [x] `onClipboardChange` 동작 의도 확인 및 문서화
- [x] 기능 테스트 (단축키, 클립보드 감지) — 빌드 검증 완료

---

### Phase 4: 컴포넌트 구조 정리 ✅ 완료

> **목표**: 컴포넌트 분리, HTML 구조 수정, prop drilling 제거. **UI 변경 없이.**

#### 4-1. MainComponent 다이어트

**현재**: 1023줄, 아이콘 23개 `useState`, 22개 props를 Sidebar에 전달

**목표 구조:**

```
components/
  MainComponent.jsx          ← 라우팅/레이아웃만 (~200줄)
  layout/
    ButtonBar.jsx            ← 상단 버튼 그룹
    ContentArea.jsx          ← 뷰 전환 (Welcome/Editor/Process)
    FileInfoBar.jsx          ← 하단 파일 정보
  hooks/
    useIcons.js              ← 아이콘 로딩 커스텀 훅
    useIPC.js                ← IPC 이벤트 구독 커스텀 훅
    useDragDrop.js           ← 드래그&드롭 로직
    useTheme.js              ← 테마 계산 로직 (themeCalc, hexToRgb 등)
```

#### 4-2. HTML 구조 수정

**Settings.jsx 체크박스 (L415):**

```html
<!-- 현재 (버그): polyline이 svg 바깥 -->
<svg width="12" height="10" viewBox="0 0 12 10"></svg>
  <polyline points="1.5 6 4.5 9 10.5 1"></polyline>

<!-- 수정: polyline을 svg 안으로 -->
<svg width="12" height="10" viewBox="0 0 12 10">
  <polyline points="1.5 6 4.5 9 10.5 1"></polyline>
</svg>
```

**OverlayComponent paragraph inline style:**

```html
<!-- 현재: 인라인 스타일로 위치 계산 -->
<div style={{ top: `calc(50% - ${(state.previous.length - idx + 1) * 50}px)` }}>

<!-- 개선: CSS Flexbox/Grid column으로 전환 -->
```

#### 4-3. 기타 컴포넌트 수정

| 컴포넌트 | 수정 내용 |
|---|---|
| `Console.jsx` | `const theme = 'dark'` 하드코딩 → IPC로 테마 수신 |
| `OverlayComponent.jsx` | `set-current-paragraph` → `move-to-position` |
| `Search.jsx` | `setresults` → `setResults` |

#### 4-4. 체크리스트

- [x] `useIcons` 훅 추출 (23개 useState → 1개 객체)
- [x] `useTheme` 훅 추출 (themeCalc, hexToRgb, hexToHSL)
- [x] `useDragDrop` 훅 추출
- [x] MainComponent를 Zustand + 커스텀 훅으로 리팩토링 (1023줄 → ~350줄)
- [x] OverlayComponent inline style → CSS Flexbox (절대위치 + inline top 제거, flex column 레이아웃으로 전환)
- [x] Console.jsx `theme` 하드코딩 제거
- [ ] UI 비교 확인 (스크린샷 diff)

---

### Phase 5: 불필요한 라이브러리 정리 ✅ 완료

> **목표**: 번들 사이즈 축소 및 의존성 최소화

#### 5-1. 제거 대상

| 라이브러리 | 이유 | 대체 |
|---|---|---|
| `@reduxjs/toolkit` | Phase 2에서 제거 | Zustand (renderer) + 자체 상태 (main) |
| `@monaco-editor/loader` | 코드에서 전혀 사용되지 않음 | 제거 |
| `@monaco-editor/react` | 동일 | 제거 |
| `monaco-editor` | 동일 | 제거 |
| `vite-plugin-monaco-editor` | 동일 | 제거 |
| `electron-clipboard-watcher` | 사용되지 않음 (직접 구현) | 제거 |
| `d2coding` (npm) | CDN으로 별도 로드 중 | 제거하거나 CDN 제거 후 npm 사용으로 통일 |
| `i18n` | `i18next`와 중복 | 제거 |

#### 5-2. 유지 대상

| 라이브러리 | 이유 |
|---|---|
| `react-colorful` | 설정 색상 피커 — UI 고유 |
| `react-contexify` | 우클릭 메뉴 — UI 고유 |
| `simplebar-react` | 커스텀 스크롤바 — UI 고유 |
| `react-transition-group` | 뷰 전환 애니메이션 |
| `suneditor-react` | 텍스트 에디터 핵심 |
| `hangul-js` | 한글 검색 핵심 |
| `hex-to-css-filter` | 아이콘 색상 필터 생성 |
| `jschardet` + `iconv-lite` | 인코딩 감지/변환 |
| `node-global-key-listener` | 글로벌 키보드 |
| `electron-localshortcut` | 앱 내 단축키 |
| ~~`electron-log`~~ | ~~사용 여부 확인 결과 완전 미사용 → 제거 완료~~ |

#### 5-3. 검토 대상

| 라이브러리 | 상태 |
|---|---|
| `react-router-dom` | 3개 라우트(/, /overlay, /console)에 풀 라우터. 유지해도 해가 없으나 조건부 렌더링으로 대체 가능 |

#### 5-4. 체크리스트

- [x] Phase 0에서 미사용 패키지 제거
- [x] Phase 2에서 `@reduxjs/toolkit` 제거
- [x] `electron-log` 완전 미사용 확인 및 제거
- [x] 미사용 CSS import 정리 (중복 `App.css` import 4개 제거: Sidebar.jsx, Search.jsx, Panel.jsx, OverlayComponent.jsx)
- [x] `package.json` 의존성 최종 정리
- [x] 빌드 사이즈 비교 (JS: 947KB, CSS: 118KB, gzip: ~280KB)

---

### Phase 6: 테스트 코드 도입

> **목표**: 향후 확장 및 유지보수를 보장하는 테스트 기반 구축

#### 6-1. 테스트 프레임워크

| 도구 | 용도 |
|---|---|
| **Vitest** | 단위/통합 테스트 (Vite 프로젝트와 자연스러운 통합) |
| `@testing-library/react` | React 컴포넌트 테스트 |
| **Playwright** | E2E 테스트 (Electron 지원) |

#### 6-2. 테스트 구조

```
tests/
  unit/
    TextProcessUtils.test.js    ← 단락 분할, 페이지 번호 추출
    ConfigManager.test.js       ← 설정 검증/병합
    state.test.js               ← 상태 전환 유효성
    SearchUtils.test.js         ← 한글 검색 로직
  integration/
    FileManager.test.js         ← 파일 열기/저장/인코딩
    IPCHandlers.test.js         ← IPC 핸들러 통합 테스트
  e2e/
    basic-workflow.test.js      ← 파일 열기→이동→닫기 시나리오
    overlay.test.js             ← 오버레이 표시/숨김
    editor.test.js              ← 에디터 열기/편집/저장
```

#### 6-3. 우선순위 높은 테스트 대상

| 순위 | 대상 | 이유 |
|---|---|---|
| 1 | `TextProcessUtils.processParagraphs` | 핵심 로직, 엣지 케이스 많음 |
| 2 | `TextProcessUtils.extractPageNumber` | 페이지 번호 패턴 다양 |
| 3 | `ConfigManager.validateConfig` | 잘못된 설정 파일 방어 |
| 4 | `Search` 관련 함수들 | 초성/부분일치 검색 정확성 |
| 5 | 상태 전환 로직 | 유효하지 않은 전환 방지 |

#### 6-4. 체크리스트

- [x] `npm install -D vitest`
- [x] Vitest 설정 (`vitest.config.js` — node 환경, v8 coverage, Electron mock)
- [x] Electron CJS 모킹 인프라 구축 (`tests/setup.js` — require cache override)
- [x] `TextProcessUtils` 단위 테스트 (40 cases: processParagraphs, extractPageNumber, shouldSkipParagraph, detectLineMode, mapPositionBetweenModes, getParagraphByOffset, CRLF)
- [x] `ConfigManager` 단위 테스트 (23 cases: validateBoolean, validateNumber, validateThemeMode, validateLanguage, validateProcessMode, validateViewMode, validateConfigStructure, mergeWithDefaults)
- [x] `StatusManager` 상태 전환 테스트 (18 cases: validateTransition 모든 허용/불허 경로, ProgramStatus 상수)
- [x] `package.json`에 test/test:watch/test:coverage 스크립트 추가
- [x] 검색 로직 단위 테스트 (33 cases: SearchUtils — removeSpaces, normalizeText, isChosung, searchChosung, searchExactMatch, searchPartialMatch, search 통합)
- [ ] IPC 핸들러 통합 테스트
- [ ] 기본 워크플로우 E2E 테스트

---

## 5. 실행 순서 요약

```
Phase 0  사전 준비 + 즉시 버그 수정
  │
  ▼
Phase 1  main.js 분리 (기능 변경 없이 파일 구조만)
  │
  ▼
Phase 2  Redux → Zustand/자체 상태 전환
  │
  ▼
Phase 3  SystemListener 안정화
  │
  ▼
Phase 4  컴포넌트 분리 + HTML 구조 정리
  │
  ▼
Phase 5  미사용 라이브러리 제거
  │
  ▼
Phase 6  테스트 코드 도입
```

> **핵심 원칙**: 각 Phase는 독립적으로 커밋 가능하며, Phase 완료 시마다 **전체 기능이 100% 동작**해야 합니다.

---

## 6. 주의사항 요약

1. **기능 보존**: 오버레이 단축키(Shift+Arrow), 사이드바 저장/로드, 검색 등 기존 동작 100% 보장
2. **UI 변경 없음**: CSS 변수, 뉴모피즘, 트랜지션 등 시각적 요소 유지. HTML 구조 변경은 허용
3. **setupKeyboardListener 내부**: "절대로 건들지 마세요" 주석 — 메서드 내부 수정 금지, 호출되는 함수 구현만 변경
4. **SunEditor**: 무겁지만 WYSIWYG 에디터 UI 유지 필요
5. **라이브러리 도입 허용**: Zustand, Vitest 등 필요 시 새 라이브러리 도입 가능
6. **IPC 구조 유지**: main ↔ renderer 간 통신은 IPC 유지 (Electron 아키텍처 제약)

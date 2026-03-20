# Paraglide Connector — Photoshop UXP Plugin

Photoshop에서 Paraglide와 자동으로 연동하는 UXP 플러그인입니다.

## 기능

- **자동 텍스트 삽입**: 텍스트 레이어 생성 시 현재 단락 텍스트를 자동 삽입
- **자동 단락 이동**: 삽입 완료 후 다음 단락으로 자동 이동
- **연결 상태 패널**: Paraglide 연결 상태 및 현재 단락 미리보기

## 설치 방식

이 플러그인은 두 가지 방식으로 사용할 수 있습니다.

### 1. 개발용 직접 설치

개발 중에는 UXP Developer Tool 또는 이 폴더의 `build.ps1`을 사용해 로컬 개발 경로에 설치하는 방식이 가장 단순합니다.

#### 방법 A. UXP Developer Tool 사용

1. Adobe UXP Developer Tool 설치
2. Creative Cloud Desktop에서 UXP 개발자 모드 활성화
3. "Add Plugin" → 이 디렉토리의 `manifest.json` 선택
4. "Load" 클릭

#### 방법 B. 로컬 개발 경로에 직접 복사

1. Creative Cloud Desktop에서 UXP 개발자 모드 활성화
2. PowerShell에서 이 디렉토리로 이동
3. `./build.ps1` 실행
4. 플러그인 파일이 `%APPDATA%\Adobe\UXP\Develop\com.paraglide.connector`에 복사됨
5. Photoshop 재시작

### 2. 배포용 CCX 패키징

반복 사용이나 외부 배포 목적이면 `.ccx`로 패키징해 설치하는 방식이 맞습니다.

1. Adobe UXP Developer Tool 실행
2. 이 플러그인 폴더를 추가한 뒤 "Package" 실행
3. 출력된 `.ccx` 파일 생성 확인
4. 생성된 `.ccx`를 Creative Cloud Desktop 또는 배포 절차를 통해 설치

참고:

- `.ccx`는 설치 패키지이며, 단순히 파일만 만들어 두는 것으로는 자동 등록되지 않습니다.
- 설치가 완료되면 UXP Developer Tool로 매번 수동 Load 할 필요는 없습니다.
- 정식 설치된 CCX는 일반적으로 개발자 모드가 필요하지 않지만, 로컬 개발 설치는 개발자 모드가 필요합니다.

## 파일 배치

### 개발용 직접 설치 경로

- `%APPDATA%\Adobe\UXP\Develop\com.paraglide.connector`

이 경로에는 최소한 아래 파일들이 있어야 합니다.

- `manifest.json`
- `index.html`
- `plugin.js`
- `icons/`

### CCX 패키징 대상

- 이 폴더 전체가 패키징 대상입니다.
- 기준 폴더: `plugins/photoshop`
- `manifest.json`을 기준으로 필요한 리소스가 함께 포함되어야 합니다.

CCX 설치 후 실제 설치 위치는 Adobe가 관리하므로, 일반적으로 사용자가 수동으로 배치할 필요는 없습니다.

## Photoshop 설정

### 개발용 직접 설치 시

1. Creative Cloud Desktop 실행
2. 설정에서 UXP 개발자 모드 활성화
3. Photoshop 재시작

### CCX 설치 시

1. 별도의 개발자 모드는 보통 필요 없음
2. Photoshop에서 플러그인 설치 상태 확인
3. 메뉴에서 `Plugins → Paraglide` 열기

## 사용법

1. Paraglide를 실행하고, 설정에서 "플러그인 서버"를 활성화
2. Photoshop에서 Paraglide 패널 열기 (`Plugins → Paraglide`)
3. 연결 상태가 "Connected"로 표시되면 준비 완료
4. 텍스트 도구(T)로 텍스트 레이어를 생성하면 자동으로 텍스트가 삽입됨

## 요구사항

- Adobe Photoshop 2023 (v24.2.0) 이상
- Paraglide v0.4.0 이상
- 플러그인 서버 활성화 상태

## 호환성 메모

- 대상 호스트는 Photoshop(`PS`)만 지원합니다.
- 현재 매니페스트는 `manifestVersion: 5`, `apiVersion: 2`를 사용합니다.
- `loadEvent: startup`으로 설정되어 있어 설치 후 Photoshop 시작 시 플러그인 런타임이 자동 로드됩니다.
- 자동 로드는 런타임 기준이며, 패널 표시 자체는 사용자가 메뉴에서 열어야 할 수 있습니다.

## 프로토콜

Paraglide와 WebSocket (`ws://localhost:27182`)으로 통신합니다.

### 수신 이벤트

- `paragraphChanged`: 현재 단락이 변경됨
- `connected`: 연결 성공 + 초기 데이터

### 송신 요청

- `getCurrentParagraph`: 현재 단락 텍스트 요청
- `moveNext`: 다음 단락 이동
- `movePrev`: 이전 단락 이동
- `getStatus`: 전체 상태 조회

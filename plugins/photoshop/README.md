# Paraglide Connector — Photoshop UXP Plugin

Photoshop에서 Paraglide와 자동으로 연동하는 UXP 플러그인입니다.

## 기능

- **자동 텍스트 삽입**: 텍스트 레이어 생성 시 현재 단락 텍스트를 자동 삽입
- **자동 단락 이동**: 삽입 완료 후 다음 단락으로 자동 이동
- **연결 상태 패널**: Paraglide 연결 상태 및 현재 단락 미리보기

## 설치

### 개발 모드 (권장)
1. Adobe UXP Developer Tool 설치
2. "Add Plugin" → 이 디렉토리의 `manifest.json` 선택
3. "Load" 클릭

### 배포
1. UXP Developer Tool에서 "Package" 실행
2. `.ccx` 파일 생성됨
3. Creative Cloud 또는 수동 설치

## 사용법

1. Paraglide를 실행하고, 설정에서 "플러그인 서버"를 활성화
2. Photoshop에서 Paraglide 패널 열기 (Window → Paraglide)
3. 연결 상태가 "Connected"로 표시되면 준비 완료
4. 텍스트 도구(T)로 텍스트 레이어를 생성하면 자동으로 텍스트가 삽입됨

## 요구사항

- Adobe Photoshop 2023 (v24.0) 이상
- Paraglide v0.4.0 이상
- 플러그인 서버 활성화 상태

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

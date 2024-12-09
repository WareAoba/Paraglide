<img width="1093" alt="LogoDarkReady" src="https://github.com/user-attachments/assets/d9c3df89-3937-4ba7-b278-c76bb44f14e9#gh-dark-mode-only">
<img width="1093" alt="LogoLightReady" src="https://github.com/user-attachments/assets/7c2e239b-3684-436e-a23c-5ebf85db1ab9#gh-light-mode-only">

### [English](https://github.com/WareAoba/Paraglide/blob/main/README-EN.md)

# Paraglide - 텍스트 단락 처리기

.TXT 파일을 로드하여 **각 단락별로 순차적으로** 복사하고, Ctrl[Cmd] + V를 감지하면 **다음 단락으로 이동하여 복사**하는 기능을 자동화한 프로그램입니다.


## 미리보기

![Welcome](https://github.com/user-attachments/assets/26e3d119-6da2-4861-a337-dda5eeb73665)
![Comparison](https://github.com/user-attachments/assets/7a51a03d-a1bb-4598-aefa-8fd1ec112a88)
![Paste](https://github.com/user-attachments/assets/2d0b1ec6-81f7-4e3c-a32d-c3207a16cba8)
![Shortcut](https://github.com/user-attachments/assets/c40498b3-9945-4137-a20e-fec5a4978d1e)
![Sidebar](https://github.com/user-attachments/assets/2d5b2dab-b787-4ad0-b3da-d9ba4a2a7f2b)

## 핵심 기능

 1. .TXT 파일을 로드, 단락을 나누어 **이전/현재/다음** 단락을 표시.
 2. 키보드 입력을 모니터링. 특정 키 조합에 따라 **대응하는 기능**을 수행.
     - **붙여넣기(Ctrl + V, Cmd + V)** : 다음 단락 복사
     - **쉬프트(Shift) + 좌우 화살표(←→)** : 이전/다음 단락으로 이동
       - **쉬프트(Shift) + 알트(Alt, Opt) + 좌우 화살표(←→)** : 이전/다음 페이지로 이동
     - **쉬프트(Shift) + 상하 화살표(↑↓)** : 프로그램 일시정지/재개
       - **쉬프트(Shift) + 알트(Alt, Opt) + 상 화살표(↑)** : 오버레이 토글
 3. .TXT 파일의 스타일에 따라 **단락** 혹은 **줄** 단위로 처리 가능.
 4. 오버레이 창을 통해 현재 **작업중인 단락**을 표시 및 **이전/다음 단락 이동**. 
 5. 로그를 저장해 이전 작업한 파일을 로드할 시 **마지막 위치 복원**
 6. 이전 작업했던 파일을 앱 내에서 **빠르게 로드하여 작업**.


## 개발 의도

 [식붕이툴](https://github.com/JOWONRO/SB2Tool)에서 영감을 받아 제작했습니다.

 기존 식붕이툴의 가장 큰 단점이었던 **윈도우 전용 프로그램**이라는 점을 해결하고자
 코딩은 할 줄 모르지만 GPT 들고 신나게 만들어봤습니다.

 **자바스크립트**(NPM, React, Electron)로 작성되어
 기존의 윈도우 전용이 아닌, **범용**으로 사용할 수 있다는 점이
 가장 큰 장점입니다.

## 프로젝트 구조
```
📦 Paraglide
├── 📂 public                              # 정적 리소스
│   ├── 📂 icons                           # 앱 아이콘
│   └── 📂 UI_icons                        # UI 아이콘
│
├── 📂 src                                 # 소스 코드
│   ├── 📂 components                      # React 컴포넌트
│   │   ├── 📂 Views                       # 메인 컴포넌트 뷰 모드
│   │   │   ├── 📜 Console.js              # 터미널 콘솔
│   │   │   ├── 📜 DragDropOverlay.js      # 드래그 드랍 오버레이
│   │   │   ├── 📜 ListView.js             # 리스트뷰
│   │   │   ├── 📜 Overview.js             # 오버뷰
│   │   │   └── 📜 Search.js               # 검색 오버레이
│   │   │
│   │   ├── 📜 MainComponent.js            # 메인 컴포넌트
│   │   ├── 📜 OverlayComponent.js         # 오버레이 컴포넌트
│   │   ├── 📜 Settings.js                 # 설정 컴포넌트
│   │   └── 📜 Sidebar.js                  # 사이드바 컴포넌트
│   │
│   ├── 📂 CSS                             # 스타일시트
│   │   ├── 📂 Controllers                 # 설정 컨트롤러 전역 스타일
│   │   ├── 📂 Views                       # 메인 컴포넌트 뷰 모드
│   │   │   
│   │   ├── 📜 App.css                     # 전역 스타일
│   │   ├── 📜 MainComponent.css           # 메인 컴포넌트 스타일
│   │   ├── 📜 OverlayComponent.css        # 오버레이 스타일
│   │   ├── 📜 Settings.css                # 설정 스타일
│   │   └── 📜 Sidebar.js                  # 사이드바 스타일
│   │
│   ├── 📂 store                           # Redux 스토어
│   │   ├── 📂 slices                      # Redux 리듀서
│   │   ├── 📂 utils                       # Redux 프로세서
│   │   └── 📜 store.js                    # Redux store 진입점
│   │ 
│   ├── 📜 App.js                          # React 진입점
│   ├── 📜 index.js                        # 앱 진입점
│   ├── 📜 main.js                         # Electron 메인 프로세스
│   └── 📜 SystemListener.js               # 시스템 이벤트 처리
│
├── 📜 forge.config.js                     # Electron Forge 설정 파일
├── 📜 LICENSE                             # 라이선스 파일
├── 📜 package.json                        # 프로젝트 설정
├── 📜 README.md                           # 프로젝트 문서
└── 📜 README-EN.md                        # 프로젝트 문서(영어)
```

## 지원 환경

 - **Windows** - *x64*
 - **macOS** - *arm64*(M1 이상)

 **추후 지원 예정**: macOS(intel), Linux

## 기여

 ***여러분의 기여가 프로그램의 질을 높입니다!***

 능력자분들의 많은 도움이 절실합니다.
 단순 훈수도 좋아요, 개선의 여지가 필요한 부분은
 주저없이 말씀해주시면 감사하겠습니다!

## 릴리즈 버전 설치 / 실행

 [Release 페이지](https://github.com/WareAoba/Paraglide/releases)에서 파일을 다운로드해주세요.

 - **Windows**:
   - **Paraglide-win32-x64-setup.exe** 파일 설치
   - 프로그램 그룹에 자동 등록

 - **macOS**:
   - **Paraglide-darwin-arm64.dmg** 마운트
   - **Paraglide.app**을 **~/Application**에 복사
   - 환경 설정에서 **손쉬운 사용**과 **입력 모니터링** 권한 설정(안내 메세지를 따라해주시기 바랍니다.)



## 개발 버전 실행 / 빌드 및 컴파일

***(Node.js 필요)***

**개발 버전 실행**:

 1. 먼저 Clone해줍니다.
 
   ```bash
   git clone https://github.com/WareAoba/Paraglide
   ```

 2. 개발용 브랜치 **development**로 교체합니다.

   ```bash
   git checkout -b development
   ```

 3. 프로젝트 루트 디렉토리에 NPM을 설치해주세요.
 
   ```bash
   npm install
   ```

 4. 다음 명령어로 실행합니다.
 
   ```bash
   npm run dev
   ```

 **빌드 및 컴파일**

 - 다음 명령어를 입력합니다.(**개발용 브랜치는 컴파일 확인이 안 돼있을 가능성이 있습니다.**)

  ```bash
  npm run package
  ```


## 최근 추가 기능  
### 최신 릴리즈: 0.3.0beta

1. **UI 대개편** : 머테리얼 + 뉴모피즘을 섞은 디자인으로 개편했습니다. 추가로, 다양한 UI 애니메이션도 추가했습니다.
2. **검색 기능 추가** : 한국어 ☆완★벽☆지★원☆
   - 초성 검색 / 부분일치 검색 / 완전일치 검색 지원
   - 각 검색 타입에 따라 하이라이트 색상이 달라집니다.
   - 키보드를 통해 포인터를 이동해가며 선택 가능.

3. **다양한 단축키 추가** Ctrl(Cmd) 키와 조합하여 다음 단축키를 사용 가능합니다.
   - **O** : 파일 열기
   - **F** : 검색창(파일을 불러온 상태에서만 열립니다.)
   - **,** : 설정창
4. **테마 선택 가능** : 설정에서 **자동, 라이트, 다크** 중 하나를 선택할 수 있습니다.
5. **내부 로직 개선** : 다양한 내부 변화가 있었습니다.
6. 콘솔창 추가 : 프로그램 내부 메세지를 확인 가능합니다.\

## 추가할 기능
 
 1. **Photoshop 모드** : 포토샵 API를 이용하여 텍스트레이어 생성 시 자동으로 입력
 2. 오버레이 창에서 단락 클릭으로 점프하는 기능
 3. **유저 가이드** : 나중에 프로그램 상세 설명서를 하나 작성하고 싶네요.
 4. **다국어 지원** : 영어와 일본어 우선 지원 예정.


## 수정할 사항
 1. 오버레이 레이아웃이 좀 잘못돼있습니다. 모든 단락들이 같은 간격으로 벌어져야 하는데, 이전-현재, 현재-다음만 유난히 넓음. 어떻게 고쳐야 할지 감도 안 잡히는 상황.
 2. 로직 수정 중 예끼치 못한 버그가 발생했을 수 있습니다.
    많은 제보 바랍니다!


## 라이센스

**직접 판매를 제외한 모든 이용**이 가능합니다.

해당 프로그램의 대부분의 코드는 **Github Copilot Chat**으로 작성되었습니다.

해당 프로그램과 코드는 **MIT License**를 통해 배포됩니다.



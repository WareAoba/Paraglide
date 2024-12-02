<img width="1093" alt="LogoDarkReady" src="https://github.com/user-attachments/assets/d9c3df89-3937-4ba7-b278-c76bb44f14e9#gh-dark-mode-only">
<img width="1093" alt="LogoLightReady" src="https://github.com/user-attachments/assets/7c2e239b-3684-436e-a23c-5ebf85db1ab9#gh-light-mode-only">

# Paraglide - 텍스트 단락 처리기

.TXT 파일을 로드하여 **각 단락별로 순차적으로** 복사하고, Ctrl[Cmd] + V를 감지하면 **다음 단락으로 이동하여 복사**하는 기능을 자동화한 프로그램입니다.


## 미리보기

 ![Welcome](https://github.com/user-attachments/assets/1a591599-6d0c-4af7-a50b-317eae89adc1)
 ![Comparison](https://github.com/user-attachments/assets/bd0683c2-08a6-47f6-970e-52179b2a7995)
 ![Paste](https://github.com/user-attachments/assets/c59d59a8-f582-4b82-8e9b-85334cffd50f)
 ![AltArrow](https://github.com/user-attachments/assets/c5e3e283-add9-4c46-888e-bba88b496c63)
 ![Sidebar](https://github.com/user-attachments/assets/ec5bdcc4-33a4-4fce-92ea-3a89fa289701)

## 핵심 기능

 1. .TXT 파일을 로드, 단락을 나누어 **이전/현재/다음** 단락을 표시.
 
 2. 키보드 입력을 모니터링. 특정 키 조합에 따라 **대응하는 기능**을 수행.
     - **붙여넣기(Ctrl + V, Cmd + V)** : 다음 단락 복사
     - **알트(Alt, Opt) + 좌우 화살표(←→)** : 이전/다음 단락으로 이동
     - **알트(Alt, Opt) + 상하 화살표(↑↓)** : 프로그램 일시정지/재개
 3. 오버레이 창을 통해 현재 **작업중인 단락**을 표시 및 **이전/다음 단락 이동**. 
 4. 로그를 저장해 이전 작업한 파일을 로드할 시 **마지막 위치 복원**
 5. 이전 작업했던 파일을 앱 내에서 **빠르게 로드하여 작업**.


## 개발 의도

 [식붕이툴](https://github.com/JOWONRO/SB2Tool)에서 영감을 받아 제작했습니다.

 기존 식붕이툴의 가장 큰 단점이었던 **윈도우 전용 프로그램**이라는 점을 해결하고자
 코딩은 할 줄 모르지만 GPT 들고 신나게 만들어봤습니다.

 **자바스크립트**(NPM, React, Electron)로 작성되어
 기존의 윈도우 전용이 아닌, **범용**으로 사용할 수 있다는 점이
 가장 큰 장점입니다.

 아직 베타 버전도 완성되지 않았지만, 개발 속도를 보아
 이번 달 내로 Release가 가능할 것 같습니다.

## 프로젝트 구조
```
📦 Paraglide
├── 📂 public                         # 정적 리소스
│   ├── 📂 icons                      # 앱 아이콘
│   │   ├── 📂 mac                    # macOS용 아이콘
│   │   └── 📂 win                    # Windows용 아이콘
│   ├── 📜 index.html                 # 메인 HTML
│   ├── 📜 manifest.json              # 앱 매니페스트
│   └── 📂 UI_icons                   # UI 아이콘
│
├── 📂 src                            # 소스 코드
│   ├── 📂 components                 # React 컴포넌트
│   │   ├── 📜 MainComponent.js       # 메인 컴포넌트
│   │   ├── 📜 OverlayComponent.js    # 오버레이 컴포넌트
│   │   ├── 📜 Settings.js            # 설정 컴포넌트
│   │   └── 📜 Sidebar.js             # 사이드바 컴포넌트
│   │
│   ├── 📂 CSS                        # 스타일시트
│   │   ├── 📜 App.css                # 앱 스타일
│   │   ├── 📜 MainComponent.css      # 메인 컴포넌트 스타일
│   │   ├── 📜 OverlayComponent.css   # 오버레이 스타일
│   │   ├── 📜 Settings.css           # 설정 스타일
│   │   └── 📜 Sidebar.js             # 사이드바 스타일
│   │
│   ├── 📜 App.js                     # React 진입점
│   ├── 📜 index.css                  # 글로벌 스타일
│   ├── 📜 index.js                   # 앱 진입점
│   ├── 📜 main.js                    # Electron 메인 프로세스
│   └── 📜 SystemListener.js          # 시스템 이벤트 처리
│
├── 📜 LICENSE                        # 라이선스 파일
├── 📜 package.json                   # 프로젝트 설정
├── 📜 README.md                      # 프로젝트 문서
└── 📜 README-KR.md                   # 프로젝트 문서(한글)
```

## 지원 환경

 - **Windows**(*x64*)
 - **macOS**(*arm64*, M1 이상)

 **추후 지원 예정**: macOS(x86), Linux

## 기여

 ***여러분의 기여가 프로그램의 질을 높입니다!***

 능력자분들의 많은 도움이 절실합니다.
 단순 훈수도 좋아요, 개선의 여지가 필요한 부분은
 주저없이 말씀해주시면 감사하겠습니다!

## 릴리즈 버전 설치 / 실행

 [Release 페이지](https://github.com/WareAoba/Paraglide/releases)에서 파일을 다운로드해주세요.

 - **Windows**:
   - **Paraglide-win32-x64-0.1.0-beta.zip** 압축 해제.
   - **Paraglide.exe** 실행.

 - **macOS**:
   - **Paraglide-0.1.0-beta-arm64.dmg** 마운트.
   - **Paraglide.app**을 **~/Application**에 복사.
   - 환경 설정에서 **손쉬운 사용**과 **입력 모니터링** 권한 설정(안내 메세지를 따라해주시기 바랍니다.).



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
  npm run make
  ```

 (Windows는 Branch를 **-win32**로 변경해야 가능)


## 최근 추가 기능
 
 1. ***Beta Release***
 2. 각종 버그를 수정했습니다.
 3. macOS 권한 체크 최종 수정 완료.
 4. [Dev] Redux 도입.
 5. [Dev] **Line 모드** : 단락 단위가 아닌, 한 줄 단위로 처리할 수 있는 모드를 추가했습니다.
 6. [Dev] **List View** : 기존의 이전/현재/단락이 아닌, 스크롤로 모든 단락을 볼 수 있는 모드를 추가했습니다.
 7. [Dev] **드래그&드랍** : 파일을 드래그&드랍하여 불러올 수 있습니다.
 8. [Dev] **UI 대거 수정** : 이미지는 추후 업로드하도록 하겠습니다.
 9. [Dev] 페이지 번호 인식 로직이 작동하지 않던 걸 수정. 합페의 경우도 추가했습니다.

## 추가할 기능
 
 1. **검색 기능** : 텍스트/단락 등을 검색하고 원하는 단락으로 점프할 수 있는 기능
 2. 오버레이 창에서 단락 클릭으로 점프하는 기능
 3. 다양한 애니메이션 : 제일 난감한 부분. 좀 많이 뜯어고쳐야 할 것 같습니다...
 4. **UI 아이콘** 추가 : 일시정지/재개 버튼부터 시작해서, 앞으로 추가하게 될 버튼에까지?
 5. **유저 가이드** : 나중에 프로그램 상세 설명서를 하나 작성하고 싶네요.
 6. **프로그램 내에서 파일 수정 기능** : 그냥 간단하게 파일명이나 단락내용 정도...?
 7. **다국어 지원** : 영어와 일본어 우선 지원 예정.


## 수정할 사항
 1. 오버레이 레이아웃이 좀 잘못돼있습니다. 모든 단락들이 같은 간격으로 벌어져야 하는데, 이전-현재, 현재-다음만 유난히 넓음. 어떻게 고쳐야 할지 감도 안 잡히는 상황.
 2. UI 속성을 CSS로 모두 이관하는 작업중이라 UI가 지금은 개판입니다. 언제 다 고쳐질진 몰?루...
 3. 새로 추가한 Sidebar의 디자인이 아주 구립니다. 추후 개선 예정.
 4. 현재 프로그램 용량이 매우 큽니다. 차차 줄여나갈 예정.


## 라이센스

해당 프로그램의 대부분의 코드는 **Github Copilot Chat**으로 작성되었습니다.

해당 프로그램과 코드는 **MIT License**를 통해 배포됩니다.



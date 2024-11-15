<img width="1265" alt="GithubLogoDark" src="https://github.com/user-attachments/assets/3d1abc21-04f5-41a2-bd34-dffc3d0c7a55#gh-dark-mode-only">
<img width="1265" alt="GithubLogoLight" src="https://github.com/user-attachments/assets/e208528d-be48-410b-ba17-7be99ca22889#gh-light-mode-only">

# Paraglide - 텍스트 단락 처리기

.TXT 파일을 로드하여 **각 단락별로 순차적으로** 복사하고, Ctrl[Cmd] + C를 감지하면 **다음 단락으로 이동하여 복사**하는 기능을 자동화한 프로그램입니다.


## 핵심 기능

 1. .TXT 파일을 로드, 단락을 나누어 **이전/현재/다음** 단락을 표시.
 
 2. 키보드 입력을 모니터링. 특정 키 조합에 따라 **대응하는 기능**을 수행.
     - **붙여넣기(Ctrl + C, Cmd + C)** : 다음 단락 복사
     - **알트(Alt, Opt) + 좌우 화살표(←→)** : 이전/다음 단락으로 이동
     - **알트(Alt, Opt) + 상하 화살표(↑↓)** : 프로그램 일시정지/재개
 3. 오버레이 창을 통해 현재 **작업중인 단락**을 표시 및 **이전/다음 단락 이동**. 
 4. 로그를 저장해 이전 작업한 파일을 로드할 시 **마지막 위치 복원**


## 개발 의도

[식붕이툴](https://github.com/JOWONRO/SB2Tool)에서 영감을 받아 제작했습니다.

기존 식붕이툴의 가장 큰 단점이었던 **윈도우 전용 프로그램**이라는 점을 해결하고자
코딩은 할 줄 모르지만 GPT 들고 신나게 만들어봤습니다.

**자바스크립트**(npm, react, electron)로 작성되어
기존의 윈도우 전용이 아닌, **범용**으로 사용할 수 있다는 점이
가장 큰 장점입니다.

아직 베타 버전도 완성되지 않았지만, 개발 속도를 보아
이번 달 내로 Release가 가능할 것 같습니다.




## 기여

***여러분의 기여가 프로그램의 질을 높입니다!***

능력자분들의 많은 도움이 절실합니다.
단순 훈수도 좋아요, 개선의 여지가 필요한 부분은
주저없이 말씀해주시면 감사하겠습니다!

## 실행

 1. 먼저 Clone해줍니다.
 
    `git clone https://github.com/WareAoba/Paraglide`

 2. 프로그램 루트 디렉토리에 NPM을 설치해주세요.
 
    `npm install`

 3. 다음 명령어로 실행합니다.
 
    `npm run dev`

컴파일된 프로그램은 추후 업로드하도록 하겠습니다.

## 라이센스

해당 프로그램의 대부분의 코드는 **Github Copilot Chat**으로 작성되었습니다.

해당 프로그램과 코드는 **MIT License**를 통해 배포됩니다.

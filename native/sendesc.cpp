// sendesc.cpp — Paraglide 네이티브 키 전송 데몬
//
// 동작 모드:
//   데몬 (기본): stdin에서 명령을 읽고, stdout으로 응답. 프로세스 1회 기동.
//     명령: "esc\n"  → Photoshop 포커스 + Space + Esc (재시도 포함) → "ok\n"
//           "quit\n" → 프로세스 종료
//
// 빌드: cl /O2 /MT sendesc.cpp /link user32.lib /OUT:sendesc.exe

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>

// ── 키 전송 ──

static void sendKey(WORD vk) {
    INPUT inputs[2] = {};
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = vk;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = vk;
    inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(2, inputs, sizeof(INPUT));
}

// ── Photoshop 창 찾기 ──

static HWND g_psWnd = NULL;

static BOOL CALLBACK enumCallback(HWND hwnd, LPARAM) {
    char cls[128], title[256];
    GetClassNameA(hwnd, cls, sizeof(cls));
    GetWindowTextA(hwnd, title, sizeof(title));

    // Photoshop 메인 창: 클래스명 "Photoshop" 또는 타이틀에 "Photoshop" 포함
    if (strcmp(cls, "Photoshop") == 0 ||
        (strstr(title, "Photoshop") && IsWindowVisible(hwnd))) {
        g_psWnd = hwnd;
        return FALSE; // 찾았으면 중단
    }
    return TRUE;
}

static HWND findPhotoshop() {
    g_psWnd = NULL;
    EnumWindows(enumCallback, 0);
    return g_psWnd;
}

// ── Photoshop에 포커스 + Space + Esc 전송 (재시도 포함) ──

static bool sendEscToPhotoshop() {
    HWND psWnd = findPhotoshop();
    if (!psWnd) return false;

    for (int attempt = 0; attempt < 3; attempt++) {
        // PS가 이미 포그라운드인지 확인 — 맞으면 SetForegroundWindow 생략
        // (불필요한 호출은 포커스 플리커를 유발하여 텍스트 입력 캐럿을 파괴)
        HWND fg = GetForegroundWindow();
        if (fg != psWnd) {
            SetForegroundWindow(psWnd);
            Sleep(30);
            fg = GetForegroundWindow();
            if (fg != psWnd) {
                // Alt 키 트릭으로 재시도
                sendKey(VK_MENU);
                Sleep(10);
                SetForegroundWindow(psWnd);
                Sleep(30);
            }
        }

        // Space (빈 레이어 커밋 유도) — 두 번 보내서 확률 높임
        sendKey(VK_SPACE);
        Sleep(50);
        sendKey(VK_SPACE);
        Sleep(100);  // PS가 Space를 처리할 시간 확보 (30ms→100ms)

        // Esc (편집 종료)
        sendKey(VK_ESCAPE);
        Sleep(50);

        // 성공 판정: Photoshop이 여전히 포그라운드이면 OK
        if (GetForegroundWindow() == psWnd) {
            return true;
        }

        // 재시도 전 대기
        Sleep(100);
        psWnd = findPhotoshop();
        if (!psWnd) return false;
    }

    return true; // 최선을 다함
}

// ── 메인: 데몬 모드 ──

int main() {
    // 줄 버퍼링 해제 (즉시 응답)
    setvbuf(stdout, NULL, _IONBF, 0);
    setvbuf(stdin, NULL, _IONBF, 0);

    char buf[256];
    while (fgets(buf, sizeof(buf), stdin)) {
        // 개행 제거
        buf[strcspn(buf, "\r\n")] = 0;

        if (strcmp(buf, "esc") == 0) {
            bool ok = sendEscToPhotoshop();
            printf(ok ? "ok\n" : "fail\n");
            fflush(stdout);
        } else if (strcmp(buf, "quit") == 0) {
            printf("bye\n");
            fflush(stdout);
            break;
        } else if (strcmp(buf, "ping") == 0) {
            printf("pong\n");
            fflush(stdout);
        }
    }

    return 0;
}

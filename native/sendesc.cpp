// sendesc.cpp — Paraglide 네이티브 키 전송 데몬
//
// 동작 모드:
//   데몬 (기본): stdin에서 명령을 읽고, stdout으로 응답. 프로세스 1회 기동.
//     명령: "esc\n"         → Photoshop 포커스 + Ctrl+Enter (텍스트 커밋) → "ok\n"
//           "pastecommit\n" → Photoshop 포커스 + Ctrl+A → Ctrl+V → Ctrl+Enter → "ok\n"
//           "quit\n"        → 프로세스 종료
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

// ── Photoshop에 포커스 + Ctrl+Enter 전송 (텍스트 편집 커밋, 재시도 포함) ──

static void sendCtrlEnter() {
    INPUT inputs[4] = {};
    // Ctrl down
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = VK_CONTROL;
    // Enter down
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = VK_RETURN;
    // Enter up
    inputs[2].type = INPUT_KEYBOARD;
    inputs[2].ki.wVk = VK_RETURN;
    inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;
    // Ctrl up
    inputs[3].type = INPUT_KEYBOARD;
    inputs[3].ki.wVk = VK_CONTROL;
    inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(4, inputs, sizeof(INPUT));
}

static void sendCtrlA() {
    INPUT inputs[4] = {};
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = VK_CONTROL;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 'A';
    inputs[2].type = INPUT_KEYBOARD;
    inputs[2].ki.wVk = 'A';
    inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;
    inputs[3].type = INPUT_KEYBOARD;
    inputs[3].ki.wVk = VK_CONTROL;
    inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(4, inputs, sizeof(INPUT));
}

static void sendCtrlV() {
    INPUT inputs[4] = {};
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = VK_CONTROL;
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 'V';
    inputs[2].type = INPUT_KEYBOARD;
    inputs[2].ki.wVk = 'V';
    inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;
    inputs[3].type = INPUT_KEYBOARD;
    inputs[3].ki.wVk = VK_CONTROL;
    inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;
    SendInput(4, inputs, sizeof(INPUT));
}

static bool sendEscToPhotoshop() {
    HWND psWnd = findPhotoshop();
    if (!psWnd) return false;

    for (int attempt = 0; attempt < 3; attempt++) {
        // PS가 이미 포그라운드인지 확인 — 맞으면 SetForegroundWindow 생략
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

        // Ctrl+Enter (텍스트 편집 커밋)
        sendCtrlEnter();
        Sleep(100);

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

// ── Photoshop에 포커스 + Ctrl+A → Ctrl+V → Ctrl+Enter (붙여넣기 후 커밋) ──

static bool pasteCommitToPhotoshop() {
    HWND psWnd = findPhotoshop();
    if (!psWnd) return false;

    // PS 포커스
    HWND fg = GetForegroundWindow();
    if (fg != psWnd) {
        SetForegroundWindow(psWnd);
        Sleep(30);
        fg = GetForegroundWindow();
        if (fg != psWnd) {
            sendKey(VK_MENU);
            Sleep(10);
            SetForegroundWindow(psWnd);
            Sleep(30);
        }
    }

    // Ctrl+A (텍스트 전체 선택)
    sendCtrlA();
    Sleep(30);

    // Ctrl+V (클립보드 붙여넣기 — Character 패널 스타일 자동 적용)
    sendCtrlV();
    Sleep(100);

    // Ctrl+Enter (텍스트 편집 커밋)
    sendCtrlEnter();
    Sleep(100);

    return GetForegroundWindow() == psWnd;
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
        } else if (strcmp(buf, "pastecommit") == 0) {
            bool ok = pasteCommitToPhotoshop();
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

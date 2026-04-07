// platform_win.cpp — Windows 구현: 클립보드 모니터링 + 키 주입
//
// 클립보드 모니터링:
//   메시지 전용 윈도우(HWND_MESSAGE) + AddClipboardFormatListener
//   → WM_CLIPBOARDUPDATE 이벤트 기반 (폴링 없음)
//   → 배경 스레드에서 메시지 펌프 실행
//
// 키 주입:
//   SendInput으로 V 키 down/up 직접 전송
//   → PowerShell 서브프로세스 불필요 (메모리 60~80MB 절감)

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <thread>
#include <atomic>
#include "platform.h"

namespace paraglide {

// ─── 상태 ───
static HWND g_msgWindow = nullptr;
static HANDLE g_stopEvent = nullptr;
static std::thread g_monitorThread;
static std::atomic<bool> g_running{false};
static ClipboardChangeCallback g_callback;
static std::atomic<int> g_internalPending{0};

static const wchar_t* WND_CLASS_NAME = L"ParaglideClipboardMonitor";

// ─── 메시지 처리 ───
static LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_CLIPBOARDUPDATE) {
        // 내부 쓰기 카운터 > 0 이면 내부 변경으로 판정, 카운터 차감
        if (g_internalPending.load(std::memory_order_acquire) > 0) {
            g_internalPending.fetch_sub(1, std::memory_order_release);
        } else if (g_callback) {
            // 외부 변경 → JS 콜백 호출
            g_callback();
        }
        return 0;
    }
    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

// ─── 모니터 스레드 본체 ───
static void monitorThreadFunc() {
    HINSTANCE hInst = GetModuleHandleW(nullptr);

    // 윈도우 클래스 등록
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(WNDCLASSEXW);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInst;
    wc.lpszClassName = WND_CLASS_NAME;
    RegisterClassExW(&wc);

    // 메시지 전용 윈도우 생성 (화면에 표시되지 않음)
    g_msgWindow = CreateWindowExW(
        0, WND_CLASS_NAME, nullptr, 0,
        0, 0, 0, 0,
        HWND_MESSAGE, nullptr, hInst, nullptr
    );

    if (!g_msgWindow) {
        g_running.store(false);
        return;
    }

    // OS 클립보드 변경 알림 등록
    AddClipboardFormatListener(g_msgWindow);

    // 메시지 펌프: g_stopEvent 또는 윈도우 메시지 대기
    while (true) {
        DWORD result = MsgWaitForMultipleObjects(
            1, &g_stopEvent, FALSE, INFINITE, QS_ALLINPUT
        );

        if (result == WAIT_OBJECT_0) {
            // g_stopEvent 시그널 → 종료
            break;
        }

        if (result == WAIT_OBJECT_0 + 1) {
            // 윈도우 메시지 도착
            MSG msg;
            while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
    }

    // 정리
    RemoveClipboardFormatListener(g_msgWindow);
    DestroyWindow(g_msgWindow);
    UnregisterClassW(WND_CLASS_NAME, hInst);
    g_msgWindow = nullptr;
}

// ═══════════════ 공개 API ═══════════════

bool initialize() {
    return true;
}

void shutdown() {
    stopClipboardMonitor();
}

bool startClipboardMonitor(ClipboardChangeCallback callback) {
    if (g_running.load()) return false;

    g_callback = callback;
    g_internalPending.store(0);

    // 중지 이벤트 생성 (수동 리셋)
    g_stopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!g_stopEvent) return false;

    g_running.store(true);
    g_monitorThread = std::thread(monitorThreadFunc);
    return true;
}

void stopClipboardMonitor() {
    if (!g_running.load()) return;
    g_running.store(false);

    // 모니터 스레드 깨우기
    if (g_stopEvent) {
        SetEvent(g_stopEvent);
    }

    if (g_monitorThread.joinable()) {
        g_monitorThread.join();
    }

    if (g_stopEvent) {
        CloseHandle(g_stopEvent);
        g_stopEvent = nullptr;
    }

    g_callback = nullptr;
}

bool simulatePasteKey() {
    // V 키 down/up — 물리적 Ctrl 키가 눌린 상태에서 Ctrl+V로 인식됨
    INPUT inputs[2] = {};
    inputs[0].type = INPUT_KEYBOARD;
    inputs[0].ki.wVk = 0x56;  // VK_V
    inputs[1].type = INPUT_KEYBOARD;
    inputs[1].ki.wVk = 0x56;
    inputs[1].ki.dwFlags = KEYEVENTF_KEYUP;
    UINT sent = SendInput(2, inputs, sizeof(INPUT));
    return sent == 2;
}

void markInternalChange() {
    g_internalPending.fetch_add(1, std::memory_order_release);
}

} // namespace paraglide

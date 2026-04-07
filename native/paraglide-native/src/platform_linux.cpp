// platform_linux.cpp — Linux 구현: 클립보드 모니터링 + 키 주입
//
// 클립보드 모니터링:
//   XFixes 확장의 XFixesSelectionNotify 이벤트 사용
//   → X11 CLIPBOARD selection 변경 시 이벤트 수신 (폴링 없음)
//   → select() 기반 I/O 멀티플렉싱으로 즉시 깨우기 + 정상 종료
//
// 키 주입:
//   XTest 확장의 XTestFakeKeyEvent로 V 키 전송
//   → xdotool 서브프로세스 불필요

#include "platform.h"

#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/keysym.h>
#include <X11/extensions/Xfixes.h>
#include <X11/extensions/XTest.h>

#include <thread>
#include <atomic>
#include <unistd.h>
#include <sys/select.h>
#include <cstring>
#include <algorithm>

namespace paraglide {

// ─── 상태 ───
static Display* g_display = nullptr;
static int g_xfixesEventBase = 0;
static int g_pipeFd[2] = {-1, -1};
static std::thread g_monitorThread;
static std::atomic<bool> g_running{false};
static ClipboardChangeCallback g_callback;
static std::atomic<int> g_internalPending{0};

// ─── 모니터 스레드 본체 ───
static void monitorThreadFunc() {
    // 스레드 전용 X11 디스플레이 연결
    Display* display = XOpenDisplay(nullptr);
    if (!display) {
        g_running.store(false);
        return;
    }

    // XFixes 확장 확인
    int eventBase, errorBase;
    if (!XFixesQueryExtension(display, &eventBase, &errorBase)) {
        XCloseDisplay(display);
        g_running.store(false);
        return;
    }
    g_xfixesEventBase = eventBase;

    // CLIPBOARD selection 변경 이벤트 구독
    Window root = DefaultRootWindow(display);
    Atom clipboardAtom = XInternAtom(display, "CLIPBOARD", False);
    XFixesSelectSelectionInput(display, root, clipboardAtom,
        XFixesSetSelectionOwnerNotifyMask);

    int xfd = ConnectionNumber(display);
    int maxfd = std::max(xfd, g_pipeFd[0]) + 1;

    while (g_running.load(std::memory_order_acquire)) {
        fd_set fds;
        FD_ZERO(&fds);
        FD_SET(xfd, &fds);
        FD_SET(g_pipeFd[0], &fds);

        // 500ms 폴백 타임아웃 (안전장치)
        struct timeval tv;
        tv.tv_sec = 0;
        tv.tv_usec = 500000;

        int ret = select(maxfd, &fds, nullptr, nullptr, &tv);
        if (ret < 0) break;  // select 오류

        // 종료 시그널 확인
        if (ret > 0 && FD_ISSET(g_pipeFd[0], &fds)) {
            break;
        }

        // X11 이벤트 처리
        if (ret > 0 && FD_ISSET(xfd, &fds)) {
            while (XPending(display) > 0) {
                XEvent event;
                XNextEvent(display, &event);

                if (event.type == eventBase + XFixesSelectionNotify) {
                    if (g_internalPending.load(std::memory_order_acquire) > 0) {
                        g_internalPending.fetch_sub(1, std::memory_order_release);
                    } else if (g_callback) {
                        g_callback();
                    }
                }
            }
        }
    }

    XCloseDisplay(display);
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

    // 종료 시그널용 파이프 생성
    if (pipe(g_pipeFd) != 0) return false;

    g_callback = callback;
    g_internalPending.store(0);
    g_running.store(true, std::memory_order_release);
    g_monitorThread = std::thread(monitorThreadFunc);
    return true;
}

void stopClipboardMonitor() {
    if (!g_running.load()) return;
    g_running.store(false, std::memory_order_release);

    // 파이프에 바이트 써서 select() 깨우기
    if (g_pipeFd[1] >= 0) {
        char c = 'q';
        ssize_t unused = write(g_pipeFd[1], &c, 1);
        (void)unused;
    }

    if (g_monitorThread.joinable()) {
        g_monitorThread.join();
    }

    // 파이프 정리
    if (g_pipeFd[0] >= 0) { close(g_pipeFd[0]); g_pipeFd[0] = -1; }
    if (g_pipeFd[1] >= 0) { close(g_pipeFd[1]); g_pipeFd[1] = -1; }

    g_callback = nullptr;
}

bool simulatePasteKey() {
    Display* display = XOpenDisplay(nullptr);
    if (!display) return false;

    // XTest 확장 확인
    int eventBase, errorBase, major, minor;
    if (!XTestQueryExtension(display, &eventBase, &errorBase, &major, &minor)) {
        XCloseDisplay(display);
        return false;
    }

    unsigned int keycode = XKeysymToKeycode(display, XK_v);
    if (keycode == 0) {
        XCloseDisplay(display);
        return false;
    }

    XTestFakeKeyEvent(display, keycode, True, 0);   // V key down
    XTestFakeKeyEvent(display, keycode, False, 0);   // V key up
    XFlush(display);

    XCloseDisplay(display);
    return true;
}

void markInternalChange() {
    g_internalPending.fetch_add(1, std::memory_order_release);
}

} // namespace paraglide

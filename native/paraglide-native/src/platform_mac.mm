// platform_mac.mm — macOS 구현: 클립보드 모니터링 + 키 주입
//
// 클립보드 모니터링:
//   NSPasteboard.changeCount 폴링 (100ms 간격)
//   → 정수 비교만 수행하므로 CPU 비용 거의 0 (clipboard.readText()와 차원이 다름)
//   → macOS는 진정한 클립보드 이벤트 API가 없어 유일한 공식 방법
//
// 키 주입:
//   CGEventCreateKeyboardEvent로 V 키 직접 전송
//   → osascript 서브프로세스 불필요

#include "platform.h"

#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

#include <thread>
#include <atomic>

namespace paraglide {

// ─── 상태 ───
static std::thread g_monitorThread;
static std::atomic<bool> g_running{false};
static ClipboardChangeCallback g_callback;
static std::atomic<int> g_internalPending{0};
static std::atomic<NSInteger> g_lastChangeCount{0};

// ─── 모니터 스레드 본체 ───
static void monitorThreadFunc() {
    // 초기 changeCount 기록
    @autoreleasepool {
        g_lastChangeCount.store([[NSPasteboard generalPasteboard] changeCount]);
    }

    while (g_running.load(std::memory_order_acquire)) {
        @autoreleasepool {
            NSInteger current = [[NSPasteboard generalPasteboard] changeCount];
            NSInteger last = g_lastChangeCount.load(std::memory_order_acquire);

            if (current != last) {
                g_lastChangeCount.store(current, std::memory_order_release);

                if (g_internalPending.load(std::memory_order_acquire) > 0) {
                    g_internalPending.fetch_sub(1, std::memory_order_release);
                } else if (g_callback) {
                    g_callback();
                }
            }
        }

        // 100ms 간격 — changeCount는 정수 조회라 부하 무시 가능
        // (기존 500ms clipboard.readText() 대비 5배 빠른 감지, 부하는 수백 배 가벼움)
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
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
    g_running.store(true, std::memory_order_release);
    g_monitorThread = std::thread(monitorThreadFunc);
    return true;
}

void stopClipboardMonitor() {
    if (!g_running.load()) return;
    g_running.store(false, std::memory_order_release);

    if (g_monitorThread.joinable()) {
        g_monitorThread.join();
    }

    g_callback = nullptr;
}

bool simulatePasteKey() {
    // macOS V 키 = keycode 9
    CGEventRef vDown = CGEventCreateKeyboardEvent(nullptr, (CGKeyCode)9, true);
    CGEventRef vUp = CGEventCreateKeyboardEvent(nullptr, (CGKeyCode)9, false);

    if (!vDown || !vUp) {
        if (vDown) CFRelease(vDown);
        if (vUp) CFRelease(vUp);
        return false;
    }

    CGEventPost(kCGHIDEventTap, vDown);
    CGEventPost(kCGHIDEventTap, vUp);
    CFRelease(vDown);
    CFRelease(vUp);
    return true;
}

void markInternalChange() {
    g_internalPending.fetch_add(1, std::memory_order_release);
}

} // namespace paraglide

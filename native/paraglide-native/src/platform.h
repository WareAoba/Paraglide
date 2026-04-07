// platform.h — 크로스플랫폼 인터페이스: 클립보드 모니터링 + 키 주입
#pragma once

#include <functional>

namespace paraglide {

// 외부 클립보드 변경 시 호출되는 콜백 (배경 스레드에서 호출)
using ClipboardChangeCallback = std::function<void()>;

// 플랫폼별 리소스 초기화
bool initialize();

// 리소스 정리
void shutdown();

// 클립보드 변경 모니터링 시작 (OS 이벤트 기반)
// callback: 외부 변경 시 호출 (내부 변경은 자동 필터링)
bool startClipboardMonitor(ClipboardChangeCallback callback);

// 클립보드 모니터링 중지
void stopClipboardMonitor();

// V 키 전송 (물리적 Ctrl/Cmd 유지 상태에서 붙여넣기 시뮬레이션)
bool simulatePasteKey();

// 내부 클립보드 쓰기를 예고 (다음 OS 이벤트를 무시하도록 카운터 증가)
void markInternalChange();

} // namespace paraglide

// addon.cpp — N-API 바인딩: JS ↔ 네이티브 브릿지
#include <napi.h>
#include "platform.h"

namespace {

Napi::ThreadSafeFunction g_tsfn;
bool g_initialized = false;
bool g_monitoring = false;

} // anonymous namespace

// ─── initialize() → bool ───
Napi::Value Initialize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (g_initialized) return Napi::Boolean::New(env, true);
    g_initialized = paraglide::initialize();
    return Napi::Boolean::New(env, g_initialized);
}

// ─── shutdown() ───
Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    if (g_monitoring) {
        paraglide::stopClipboardMonitor();
        g_tsfn.Release();
        g_monitoring = false;
    }
    if (g_initialized) {
        paraglide::shutdown();
        g_initialized = false;
    }
    return info.Env().Undefined();
}

// ─── startClipboardMonitor(callback) → bool ───
Napi::Value StartClipboardMonitor(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!g_initialized) {
        Napi::Error::New(env, "Not initialized — call initialize() first")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (g_monitoring) return Napi::Boolean::New(env, true);

    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Function expected as first argument")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // ThreadSafeFunction: 배경 스레드 → JS 메인 루프 콜백 브릿지
    g_tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "ParaglideClipboardMonitor",
        0,   // max queue size (0 = unlimited)
        1    // initial thread count
    );

    g_monitoring = true;

    bool ok = paraglide::startClipboardMonitor([]() {
        if (g_monitoring) {
            g_tsfn.NonBlockingCall();
        }
    });

    if (!ok) {
        g_tsfn.Release();
        g_monitoring = false;
    }

    return Napi::Boolean::New(env, ok);
}

// ─── stopClipboardMonitor() ───
Napi::Value StopClipboardMonitor(const Napi::CallbackInfo& info) {
    if (g_monitoring) {
        paraglide::stopClipboardMonitor();
        g_tsfn.Release();
        g_monitoring = false;
    }
    return info.Env().Undefined();
}

// ─── simulatePasteKey() → bool ───
Napi::Value SimulatePasteKey(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), paraglide::simulatePasteKey());
}

// ─── markInternalChange() ───
Napi::Value MarkInternalChange(const Napi::CallbackInfo& info) {
    paraglide::markInternalChange();
    return info.Env().Undefined();
}

// ─── 모듈 초기화 ───
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("initialize",
        Napi::Function::New(env, Initialize));
    exports.Set("shutdown",
        Napi::Function::New(env, Shutdown));
    exports.Set("startClipboardMonitor",
        Napi::Function::New(env, StartClipboardMonitor));
    exports.Set("stopClipboardMonitor",
        Napi::Function::New(env, StopClipboardMonitor));
    exports.Set("simulatePasteKey",
        Napi::Function::New(env, SimulatePasteKey));
    exports.Set("markInternalChange",
        Napi::Function::New(env, MarkInternalChange));
    return exports;
}

NODE_API_MODULE(paraglide_native, Init)

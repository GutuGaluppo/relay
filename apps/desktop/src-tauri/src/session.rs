//! Detects the "intentional moments" Relay cares about — screen unlock and wake
//! from sleep — and forwards them to the frontend as events.
//!
//! Wake detection is platform-neutral: the monitor loop ticks every few seconds,
//! so a large gap in wall-clock time means the machine was asleep.
//! Unlock detection polls the macOS session dictionary.

use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter};

const TICK: Duration = Duration::from_secs(3);
const SLEEP_GAP: Duration = Duration::from_secs(30);

pub fn spawn_monitor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last_tick = SystemTime::now();
        let mut was_locked = is_screen_locked();
        loop {
            std::thread::sleep(TICK);
            let now = SystemTime::now();
            let gap = now.duration_since(last_tick).unwrap_or_default();
            last_tick = now;
            if gap > SLEEP_GAP {
                let _ = app.emit("relay://resumed", gap.as_secs());
            }

            let locked = is_screen_locked();
            if was_locked && !locked {
                let _ = app.emit("relay://unlocked", ());
            }
            was_locked = locked;
        }
    });
}

#[cfg(target_os = "macos")]
fn is_screen_locked() -> bool {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::CFString;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGSessionCopyCurrentDictionary() -> CFDictionaryRef;
    }

    unsafe {
        let raw = CGSessionCopyCurrentDictionary();
        if raw.is_null() {
            return false;
        }
        let dict: CFDictionary<CFString, CFType> = CFDictionary::wrap_under_create_rule(raw);
        dict.find(CFString::from_static_string("CGSSessionScreenIsLocked"))
            .and_then(|v| v.downcast::<CFBoolean>())
            .map(bool::from)
            .unwrap_or(false)
    }
}

#[cfg(not(target_os = "macos"))]
fn is_screen_locked() -> bool {
    // TODO(windows): use WTSRegisterSessionNotification for WTS_SESSION_UNLOCK.
    false
}

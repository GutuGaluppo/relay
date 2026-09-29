use tauri::{AppHandle, LogicalSize, Manager, Size, WebviewWindow};

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// While the window is hidden Relay lives only in the menu bar (no Dock icon).
pub fn set_background(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    let _ = app;
}

fn set_foreground(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
    let _ = app;
}

pub fn show_main(app: &AppHandle) {
    set_foreground(app);
    if let Some(w) = main_window(app) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub fn hide_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.set_always_on_top(false);
        #[cfg(target_os = "macos")]
        let _ = w.set_simple_fullscreen(false);
        let _ = w.hide();
    }
    set_background(app);
}

#[tauri::command]
pub fn show_main_window(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
pub fn hide_main_window(app: AppHandle) {
    hide_main(&app);
}

#[tauri::command]
pub fn launched_at_login() -> bool {
    std::env::args().any(|a| a == crate::AUTOSTART_ARG)
}

/// Window presentation for each moment:
/// - `overlay`: prominent, covers the screen (login/unlock reminder)
/// - `compact`: small, floats above other apps without taking over (later reminders)
/// - `normal`: the regular app window
#[tauri::command]
pub fn set_window_mode(app: AppHandle, mode: String, focus: bool) -> Result<(), String> {
    let w = main_window(&app).ok_or("main window missing")?;
    let err = |e: tauri::Error| e.to_string();

    #[cfg(target_os = "macos")]
    w.set_simple_fullscreen(mode == "overlay").map_err(err)?;
    #[cfg(not(target_os = "macos"))]
    {
        if mode == "overlay" {
            w.maximize().map_err(err)?;
        } else {
            w.unmaximize().map_err(err)?;
        }
    }

    match mode.as_str() {
        "overlay" => {
            w.set_always_on_top(true).map_err(err)?;
        }
        "compact" => {
            w.set_always_on_top(true).map_err(err)?;
            w.set_size(Size::Logical(LogicalSize::new(560.0, 300.0))).map_err(err)?;
            w.center().map_err(err)?;
        }
        _ => {
            w.set_always_on_top(false).map_err(err)?;
            w.set_size(Size::Logical(LogicalSize::new(720.0, 560.0))).map_err(err)?;
        }
    }

    if focus {
        show_main(&app);
    } else {
        // Visible without stealing keyboard focus from the user's current app.
        w.show().map_err(err)?;
    }
    Ok(())
}

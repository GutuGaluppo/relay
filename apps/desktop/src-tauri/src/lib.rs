mod session;
mod tray;
mod window;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

/// Launch argument used by the login item, so the app can start hidden.
pub const AUTOSTART_ARG: &str = "--autostart";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // A second launch (e.g. from Finder) just brings the existing instance forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            window::set_window_mode,
            window::hide_main_window,
            window::show_main_window,
            window::launched_at_login,
            tray::set_tray_pending,
        ])
        .setup(|app| {
            tray::create(app.handle())?;
            session::spawn_monitor(app.handle().clone());
            let started_by_login = std::env::args().any(|a| a == AUTOSTART_ARG);
            if !started_by_login {
                window::show_main(app.handle());
            } else {
                window::set_background(app.handle());
            }
            Ok(())
        })
        .on_window_event(|win, event| {
            // Closing the window keeps Relay running in the menu bar / tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if win.label() == "main" {
                    api.prevent_close();
                    window::hide_main(win.app_handle());
                    let _ = win.emit("relay://window-hidden", ());
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Relay")
        .run(|app, event| {
            // macOS: clicking the Dock icon reopens the window.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                window::show_main(app);
            }
            let _ = (app, event);
        });
}

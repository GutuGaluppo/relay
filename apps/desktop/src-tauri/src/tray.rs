use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter,
};

use crate::window;

const TRAY_ID: &str = "relay-tray";

#[cfg(target_os = "macos")]
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray/macos-template@2x.png");
#[cfg(target_os = "macos")]
const TRAY_ICON_PENDING: &[u8] = include_bytes!("../icons/tray/macos-template-pending@2x.png");
#[cfg(not(target_os = "macos"))]
const TRAY_ICON: &[u8] = include_bytes!("../icons/tray/windows-32.png");
#[cfg(not(target_os = "macos"))]
const TRAY_ICON_PENDING: &[u8] = include_bytes!("../icons/tray/windows-pending-32.png");

pub fn create(app: &AppHandle) -> tauri::Result<TrayIcon> {
    let open = MenuItem::with_id(app, "open", "Abrir Relay", true, None::<&str>)?;
    let pending = MenuItem::with_id(app, "pending", "Lembretes pendentes", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Ajustes…", true, Some("CmdOrCtrl+,"))?;
    let quit = MenuItem::with_id(app, "quit", "Sair do Relay", true, Some("CmdOrCtrl+Q"))?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &pending, &settings, &sep, &quit])?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(TRAY_ICON)?)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Relay")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => navigate(app, "home"),
            "pending" => navigate(app, "pending"),
            "settings" => navigate(app, "settings"),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)
}

/// Ask the frontend to show a view; the frontend decides window mode.
fn navigate(app: &AppHandle, route: &str) {
    window::show_main(app);
    let _ = app.emit_to("main", "relay://navigate", route);
}

/// Swap the tray glyph to show that something is waiting (no counts, no colour).
#[tauri::command]
pub fn set_tray_pending(app: AppHandle, pending: bool) -> Result<(), String> {
    let tray = app.tray_by_id(TRAY_ID).ok_or("tray missing")?;
    let bytes = if pending { TRAY_ICON_PENDING } else { TRAY_ICON };
    let image = Image::from_bytes(bytes).map_err(|e| e.to_string())?;
    tray.set_icon(Some(image)).map_err(|e| e.to_string())?;
    tray.set_icon_as_template(cfg!(target_os = "macos"))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use archivo_vivo_core::{SearchHit, Store};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

#[derive(Clone)]
struct AppState(Arc<Mutex<Store>>);
impl AppState {
    fn new(store: Store) -> Self {
        Self(Arc::new(Mutex::new(store)))
    }
}

async fn execute<T, F>(state: AppState, operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut Store) -> Result<T, rusqlite::Error> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = state
            .0
            .lock()
            .map_err(|_| "Índice no disponible".to_owned())?;
        operation(&mut store).map_err(|_| "No se pudo completar la operación del índice".to_owned())
    })
    .await
    .map_err(|_| "No se pudo ejecutar el trabajo local".to_owned())?
}

#[tauri::command]
async fn demo_load(state: State<'_, AppState>) -> Result<usize, String> {
    execute(state.inner().clone(), |s| s.seed_demo()).await
}
#[tauri::command]
async fn search(state: State<'_, AppState>, query: String) -> Result<Vec<SearchHit>, String> {
    if query.len() > 512 {
        return Err("La consulta no puede superar 512 bytes UTF-8".to_owned());
    }
    execute(state.inner().clone(), move |s| s.search(&query)).await
}
#[tauri::command]
async fn document_get(state: State<'_, AppState>, id: i64) -> Result<Option<SearchHit>, String> {
    execute(state.inner().clone(), move |s| s.document(id)).await
}
#[derive(Serialize)]
struct IndexStatus {
    files: i64,
    mode: &'static str,
}
#[tauri::command]
async fn index_status(state: State<'_, AppState>) -> Result<IndexStatus, String> {
    let files = execute(state.inner().clone(), |s| s.count()).await?;
    Ok(IndexStatus {
        files,
        mode: "demo",
    })
}
#[tauri::command]
async fn index_clear(state: State<'_, AppState>) -> Result<(), String> {
    execute(state.inner().clone(), |s| s.clear()).await
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data)?;
            app.manage(AppState::new(Store::open(data.join("archivo-vivo.db"))?));
            let show = tauri::menu::MenuItem::with_id(
                app,
                "show",
                "Abrir Archivo Vivo",
                true,
                None::<&str>,
            )?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            let mut tray = tauri::tray::TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Archivo Vivo · local")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            demo_load,
            search,
            document_get,
            index_status,
            index_clear
        ])
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar Archivo Vivo");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn demo_status_and_clear_use_the_same_store() {
        tauri::async_runtime::block_on(async {
            let state = AppState::new(Store::memory().unwrap());
            assert_eq!(execute(state.clone(), |s| s.seed_demo()).await.unwrap(), 3);
            assert_eq!(execute(state.clone(), |s| s.count()).await.unwrap(), 3);
            execute(state.clone(), |s| s.clear()).await.unwrap();
            assert_eq!(execute(state, |s| s.count()).await.unwrap(), 0);
        });
    }
}

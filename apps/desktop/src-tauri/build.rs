fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "demo_load",
            "search",
            "document_get",
            "index_status",
            "index_clear",
        ]),
    ))
    .expect("No se pudo generar el manifiesto Tauri");
}

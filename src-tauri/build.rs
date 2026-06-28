fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::default()
            .config_path("../tauri.conf.json"),
    )
    .expect("failed to build tauri app");
}

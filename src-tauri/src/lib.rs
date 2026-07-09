// Module declarations for the Plotline backend engine.
// All modules are strictly separated per the architecture contract.

pub mod commands;
pub mod config;
pub mod engine;
pub mod error;
pub mod openrouter;
pub mod run_manager;
pub mod substitution;
pub mod workflow;

// Re-export the run function for main.rs
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running Plotline");
}

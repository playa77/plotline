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

/// Builds and returns the Tauri application with all plugins and commands registered.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::run_workflow,
            commands::rerun_from_step,
            commands::save_output,
            commands::get_run_status,
            commands::list_workflows,
            commands::list_runs,
            commands::read_file_content,
            commands::set_api_key,
            commands::get_api_key,
            commands::has_api_key,
            commands::set_project_root,
            commands::get_project_root,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Plotline");
}

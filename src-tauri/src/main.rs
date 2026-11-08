// Empêche une console supplémentaire de s'ouvrir sous Windows en release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    boing_lib::run()
}

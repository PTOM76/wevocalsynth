//! WeVocalSynth の DSP エンジン。
//!
//! ピッチ変更と時間伸縮（WSOLA、Phase Vocoder など）、フォルマント補正は wevocal-lib に移した
//! （WeVocal Studio と同じ処理を使うため）。ここには Synth だけの処理（かな、声部の分離）と wasm の公開関数を置く。
//!
//! wasm ビルドは wasm-bindgen を使わず小さな C ABI だけを公開し、Web Worker 内で
//! 素の `WebAssembly.instantiate` で読み込めるようにしている。

mod ffi;
pub mod kana;
pub mod voices;

#[cfg(test)]
mod tests;

// wevocal-lib の処理を今までどおり crate::formant、crate::process_with_progress などで使えるようにする
pub use wevocal_lib::{curve, f0, fft, formant, hpss, psola, pv, segment, sms, sola, sola2, tempo};
pub use wevocal_lib::{process, process_with_progress, resample, resample_with, Algorithm, Formant, TimeMap};
pub use wevocal_lib::{wsola, wsola2, wsola2_map, wsola_map, wsola_with_progress};

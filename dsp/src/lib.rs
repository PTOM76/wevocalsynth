//! WeVocalSynth の DSP エンジン。
//!
//! 時間伸縮: WSOLA（Waveform Similarity Overlap-Add）または位相ロック付き
//! Phase Vocoder（`pv`）を呼び出しごとに選択する。
//! ピッチ変更: ピッチ比の分だけ伸縮してから、帯域制限付きリサンプルで目的の長さに戻す。
//! そのため長さはピッチ変更の影響を受けない。必要ならリサンプル前にフォルマント補正（`formant`）を行う。
//!
//! wasm ビルドは wasm-bindgen を使わず小さな C ABI だけを公開し、Web Worker 内で
//! 素の `WebAssembly.instantiate` で読み込めるようにしている。

pub mod curve;
pub mod f0;
mod ffi;
mod fft;
pub mod formant;
mod pipeline;
pub mod psola;
pub mod pv;
mod resample;
pub mod sola;
pub mod spec;
pub mod tempo;
mod timemap;
mod wsola;

#[cfg(test)]
mod tests;

pub use pipeline::{process, process_with_progress, Algorithm, Formant};
pub use resample::{resample, resample_with};
pub use timemap::TimeMap;
pub use wsola::{wsola, wsola_map, wsola_with_progress};

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
mod ffi;
// FFT とリサンプルは wevocal-lib（WeVocalExtractor と共有）のものを使う。`crate::fft` などのパスは今までどおり
use wevocal_lib::fft;
pub mod formant;
pub mod hpss;
mod pipeline;
pub mod psola;
pub mod pv;
pub mod segment;
pub mod sms;
pub mod sola;
pub mod sola2;
pub mod voices;
mod timemap;
mod wsola;

#[cfg(test)]
mod tests;

pub use pipeline::{process, process_with_progress, Algorithm, Formant};
// `resample` はモジュールと関数の両方を指す（`crate::resample::...` も `crate::resample(...)` も使える）
pub use timemap::TimeMap;
pub use wevocal_lib::{resample, resample_with};
// F0 推定（YIN）とテンポ解析は WeVocalLib に移した（ほかのソフトでも使えるように）。今までどおり crate::f0 / crate::tempo で使える
pub use wevocal_lib::{f0, tempo};
pub use wsola::{wsola, wsola2, wsola2_map, wsola_map, wsola_with_progress};

//! テスト共通の信号生成・計測ヘルパ。

mod analysis;
mod consonant;
mod curve;
mod formant;
mod stretch;

use crate::{fft, process_with_progress, Algorithm, Formant};

pub fn sine(freq: f32, sr: f32, secs: f32) -> Vec<f32> {
    (0..(sr * secs) as usize)
        .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr).sin() * 0.5)
        .collect()
}

/// 中央部分の正方向ゼロクロス数から周波数を推定する。
pub fn freq(x: &[f32], sr: f32) -> f32 {
    let m = &x[x.len() / 4..x.len() * 3 / 4];
    let crossings = m.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count();
    crossings as f32 / (m.len() as f32 / sr)
}

pub const ALGOS: [Algorithm; 10] = [
    Algorithm::Wsola,
    Algorithm::PhaseVocoder,
    Algorithm::Psola,
    Algorithm::Sola,
    Algorithm::Psola2,
    Algorithm::Wsola2,
    Algorithm::PhaseVocoder2,
    Algorithm::Hpss,
    Algorithm::Sola2,
    Algorithm::Sola3,
];

pub fn run(x: &[&[f32]], sr: f32, semi: f64, alpha: f64, algo: Algorithm) -> Vec<Vec<f32>> {
    process_with_progress(x, sr, semi, alpha, algo, Formant::Follow, &mut |_| {})
}

/// 150Hz のパルス列を `formant` Hz の2次共振器に通した母音もどき。
pub fn vowel(sr: f32, secs: f32, f0: f32, formant: f32) -> Vec<f32> {
    let period = (sr / f0) as usize;
    let r = (-std::f32::consts::PI * 120.0 / sr).exp();
    let a1 = 2.0 * r * (2.0 * std::f32::consts::PI * formant / sr).cos();
    let a2 = -r * r;
    let (mut y1, mut y2) = (0.0f32, 0.0f32);
    (0..(sr * secs) as usize)
        .map(|i| {
            let x = if i % period == 0 { 1.0 } else { 0.0 };
            let y = x + a1 * y1 + a2 * y2;
            y2 = y1;
            y1 = y;
            y * 0.05
        })
        .collect()
}

/// 中央 4096 サンプルの、4kHz 未満の振幅重み付きスペクトル重心。
pub fn centroid(x: &[f32], sr: f32) -> f32 {
    let n = 4096;
    let mid = x.len() / 2 - n / 2;
    let fft = fft::Fft::new(n);
    let mut re: Vec<f32> = (0..n)
        .map(|i| {
            x[mid + i] * (0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos())
        })
        .collect();
    let mut im = vec![0.0f32; n];
    fft.run(&mut re, &mut im, false);
    let max_bin = (4000.0 / sr * n as f32) as usize;
    let (mut num, mut den) = (0.0f32, 0.0f32);
    for b in 1..max_bin {
        let m = (re[b] * re[b] + im[b] * im[b]).sqrt();
        num += m * b as f32 * sr / n as f32;
        den += m;
    }
    num / den
}

//! 往復の劣化（可逆性）のテスト。+n 半音のあと -n 半音、×a のあと ×1/a で、どれだけ元の音に戻るかを方式ごとに測る。
//! 位相がずれても音は同じなので、波形ではなく振幅スペクトルの差（対数、dB）で比べる。

use super::consonant::syllables;
use super::stretch::vibrato_vowel;
use super::*;

/// 対数振幅スペクトルの平均の差（dB。5kHz 未満、元の音の強い所だけ。0 に近いほど元に戻っている）
fn spectral_distance(a: &[f32], b: &[f32], sr: f32) -> f32 {
    let (n, hop) = (2048, 512);
    let fft = fft::Fft::new(n);
    let window: Vec<f32> = (0..n).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos()).collect();
    let spec = |x: &[f32], s: usize| {
        let mut re: Vec<f32> = (0..n).map(|i| x.get(s + i).copied().unwrap_or(0.0) * window[i]).collect();
        let mut im = vec![0.0f32; n];
        fft.run(&mut re, &mut im, false);
        (0..n / 2).map(|k| (re[k] * re[k] + im[k] * im[k]).sqrt()).collect::<Vec<f32>>()
    };
    let bins = (5000.0 / sr * n as f32) as usize;
    let len = a.len().min(b.len());
    let (mut total, mut count) = (0.0f32, 0usize);
    // 端は処理の扱いで崩れやすいので、前後 0.1 秒を除く
    let edge = (sr * 0.1) as usize;
    // 時刻が少しずれても同じ音とみなすため、±50ms のうち最も近い所と比べる（SOLA 系は全体が少しずれる。`consonant.rs` の measure 参照）
    let shift = (sr * 0.05) as usize;
    let step = hop / 4;
    let mut s = edge.max(shift);
    while s + n + edge + shift < len {
        let sa = spec(a, s);
        let peak = sa[..bins].iter().cloned().fold(0.0f32, f32::max);
        let mut best = (f32::MAX, 0usize);
        let mut t = s - shift;
        while t <= s + shift {
            let sb = spec(b, t);
            let (mut d, mut c) = (0.0f32, 0usize);
            for k in 1..bins {
                // 元の音の強い所（最大から -40dB 以内）だけ比べる
                if sa[k] > peak * 0.01 {
                    d += (20.0 * (sa[k].max(1e-9) / sb[k].max(1e-9)).log10()).abs();
                    c += 1;
                }
            }
            if c > 0 && d / (c as f32) < best.0 {
                best = (d / c as f32, c);
            }
            t += step;
        }
        if best.1 > 0 {
            total += best.0 * best.1 as f32;
            count += best.1;
        }
        s += hop;
    }
    total / count.max(1) as f32
}

/// 方式ごとの往復の劣化を出す。`cargo test --release roundtrip -- --nocapture`
#[test]
fn roundtrip() {
    let sr = 48000.0;
    let signals = [("vowel", vibrato_vowel(sr, 2.0, 220.0)), ("syllables", syllables(sr, 8))];
    for (name, x) in &signals {
        println!("== {name}");
        for algo in ALGOS {
            let pitch = run(&[&run(&[x], sr, 3.0, 1.0, algo)[0]], sr, -3.0, 1.0, algo);
            let time = run(&[&run(&[x], sr, 0.0, 2.0, algo)[0]], sr, 0.0, 0.5, algo);
            // 同じ往復を 3 回くり返す（重ねて加工したときの劣化のたまり方）
            let mut y = x.clone();
            for _ in 0..3 {
                y = run(&[&run(&[&y], sr, 3.0, 1.0, algo)[0]], sr, -3.0, 1.0, algo).remove(0);
            }
            println!(
                "{algo:?}: pitch ±3 {:.2}dB, time x2/x0.5 {:.2}dB, pitch ±3 x3 {:.2}dB",
                spectral_distance(x, &pitch[0], sr),
                spectral_distance(x, &time[0], sr),
                spectral_distance(x, &y, sr),
            );
        }
    }
}

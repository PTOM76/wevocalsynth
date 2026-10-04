//! 往復の劣化（可逆性）のテスト。+n 半音のあと -n 半音、×a のあと ×1/a で、どれだけ元の音に戻るかを方式ごとに測る。
//! 位相がずれても音は同じなので、波形ではなく振幅スペクトルの差（対数、dB）で比べる。

use super::consonant::syllables;
use super::stretch::vibrato_vowel;
use super::*;

/// 対数振幅スペクトルの平均の差（dB。5kHz 未満、元の音の強い所だけ。0 に近いほど元に戻っている）。
/// 雑音は鳴らし直すと bin ごとの強さがでたらめに変わるので、前後 2 bin と前後 1 フレームでならしてから比べる
/// （ならさないと、同じ強さの別の雑音どうしでも 4dB ほどの差になる）
pub(super) fn spectral_distance(a: &[f32], b: &[f32], sr: f32) -> f32 {
    let (n, hop) = (2048usize, 512usize);
    let step = hop / 4;
    let fft = fft::Fft::new(n);
    let window: Vec<f32> = (0..n).map(|i| 0.5 - 0.5 * (2.0 * std::f32::consts::PI * i as f32 / n as f32).cos()).collect();
    let bins = (5000.0 / sr * n as f32) as usize;
    // `step` ごとのパワースペクトル（`bins` まで）
    let powers = |x: &[f32]| -> Vec<Vec<f32>> {
        (0..x.len().saturating_sub(n) / step + 1)
            .map(|j| {
                let s = j * step;
                let mut re: Vec<f32> = (0..n).map(|i| x.get(s + i).copied().unwrap_or(0.0) * window[i]).collect();
                let mut im = vec![0.0f32; n];
                fft.run(&mut re, &mut im, false);
                (0..bins + 3).map(|k| re[k] * re[k] + im[k] * im[k]).collect()
            })
            .collect()
    };
    // `j` 番目を中心に、前後 1 フレーム（hop）と前後 2 bin でならした振幅
    let smooth = |p: &[Vec<f32>], j: usize| -> Vec<f32> {
        let d = hop / step;
        let rows = [j.saturating_sub(d), j, (j + d).min(p.len() - 1)];
        (0..bins)
            .map(|k| {
                let mut sum = 0.0f32;
                for &r in &rows {
                    for q in k.saturating_sub(2)..=k + 2 {
                        sum += p[r][q];
                    }
                }
                sum.sqrt()
            })
            .collect()
    };
    let (pa, pb) = (powers(a), powers(b));
    let frames = pa.len().min(pb.len());
    // 端は処理の扱いで崩れやすいので前後 0.1 秒を除き、時刻が少しずれても同じ音とみなすため、±50ms のうち最も近い所と比べる
    // （SOLA 系は全体が少しずれる。`consonant.rs` の measure 参照）
    let edge = ((sr * 0.1) as usize / step).max(1);
    let shift = (sr * 0.05) as usize / step;
    let (mut total, mut count) = (0.0f32, 0usize);
    let mut j = edge.max(shift);
    while j + edge + shift < frames {
        let sa = smooth(&pa, j);
        let peak = sa.iter().cloned().fold(0.0f32, f32::max);
        let mut best = (f32::MAX, 0usize);
        for t in j - shift..=j + shift {
            let sb = smooth(&pb, t);
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
        }
        if best.1 > 0 {
            total += best.0 * best.1 as f32;
            count += best.1;
        }
        j += hop / step;
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

/// SMS の分けて鳴らし直すだけ（ほぼ等倍）の誤差。`cargo test --release sms_identity -- --ignored --nocapture`
#[test]
#[ignore]
fn sms_identity() {
    let sr = 48000.0;
    let steady: Vec<f32> = (0..(sr * 2.0) as usize).map(|i| (1..=6).map(|h| (2.0 * std::f32::consts::PI * 220.0 * h as f32 * i as f32 / sr).sin() / h as f32).sum::<f32>() * 0.3).collect();
    let white: Vec<f32> = super::consonant::noise((sr * 2.0) as usize, 3).iter().map(|v| v * 0.1).collect();
    let white2: Vec<f32> = super::consonant::noise((sr * 2.0) as usize, 11).iter().map(|v| v * 0.1).collect();
    let louder: Vec<f32> = white2.iter().map(|v| v * 1.12).collect();
    println!("white vs other white: {:.2}dB, vs +1dB: {:.2}dB", spectral_distance(&white, &white2, sr), spectral_distance(&white, &louder, sr));
    for (name, x) in [("white", white), ("steady", steady), ("vowel", vibrato_vowel(sr, 2.0, 220.0)), ("syllables", syllables(sr, 8))] {
        let y = &crate::sms::stretch(&[&x], 1.0001, sr, &mut |_| {})[0];
        let z = &run(&[&x], sr, 0.0, 1.0001, Algorithm::Sola2)[0];
        println!("{name}: sms {:.2}dB, sola2 {:.2}dB", spectral_distance(&x, y, sr), spectral_distance(&x, z, sr));
    }
}
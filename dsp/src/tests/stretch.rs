//! 時間伸縮・ピッチ変更のテスト。

use super::*;
use crate::process;

#[test]
fn stretch_keeps_pitch() {
    let sr = 44100.0;
    let x = sine(220.0, sr, 1.0);
    for algo in ALGOS {
        for alpha in [0.5, 2.0, 4.0] {
            let y = run(&[&x], sr, 0.0, alpha, algo);
            assert_eq!(y[0].len(), (x.len() as f64 * alpha).round() as usize);
            let f = freq(&y[0], sr);
            assert!((f - 220.0).abs() < 4.0, "{algo:?} alpha {alpha}: {f}Hz");
        }
    }
}

#[test]
fn pitch_keeps_length() {
    let sr = 48000.0;
    let x = sine(220.0, sr, 1.0);
    for algo in ALGOS {
        for (semi, expect) in [(12.0, 440.0), (-12.0, 110.0), (5.0, 293.66)] {
            let y = run(&[&x], sr, semi, 1.0, algo);
            assert_eq!(y[0].len(), x.len());
            let f = freq(&y[0], sr);
            assert!(
                (f - expect).abs() < expect * 0.02,
                "{algo:?} semi {semi}: {f}Hz"
            );
        }
    }
}

/// 伸長で末尾がギザギザにならないこと: 定常音の振幅包絡が
/// 最後のフレーム付近まで平坦に保たれること。
#[test]
fn stretch_tail_is_steady() {
    let sr = 48000.0;
    let x = sine(220.0, sr, 0.3);
    for (algo, alpha) in ALGOS
        .into_iter()
        .flat_map(|a| [2.0, 4.0, 8.0].map(|x| (a, x)))
    {
        let y = &run(&[&x], sr, 0.0, alpha, algo)[0];
        // 末尾30%（最後のブロックを除く）の10msブロックごとのピーク値。
        let block = (sr * 0.01) as usize;
        let start = y.len() * 7 / 10;
        let peaks: Vec<f32> = y[start..y.len() - block]
            .chunks(block)
            .map(|b| b.iter().fold(0.0f32, |m, v| m.max(v.abs())))
            .collect();
        let min = peaks.iter().cloned().fold(f32::MAX, f32::min);
        assert!(
            min > 0.4,
            "{algo:?} alpha {alpha}: tail level dips to {min} ({peaks:?})"
        );
    }
}

/// `cargo test --release -- --ignored --nocapture` で3分のステレオ音声の処理時間を計測する。
#[test]
#[ignore]
fn bench_three_minutes() {
    let sr = 48000.0;
    let x = sine(220.0, sr, 180.0);
    for algo in ALGOS {
        for (semi, alpha) in [(0.0, 2.0), (5.0, 1.0), (5.0, 2.0)] {
            let t = std::time::Instant::now();
            run(&[&x, &x], sr, semi, alpha, algo);
            println!("{algo:?} semi {semi} x{alpha}: {:?}", t.elapsed());
        }
    }
}

#[test]
fn combined_and_stereo() {
    let sr = 44100.0;
    let l = sine(220.0, sr, 0.5);
    let r = sine(330.0, sr, 0.5);
    let y = process(&[&l, &r], sr, 5.0, 2.0);
    assert_eq!(y.len(), 2);
    assert_eq!(y[0].len(), l.len() * 2);
    assert!(y.iter().flatten().all(|v| v.is_finite()));
}

/// ビブラート付きの母音もどき（倍音 + 5Hz・±3% のビブラート）
fn vibrato_vowel(sr: f32, secs: f32, f0: f32) -> Vec<f32> {
    let mut phase = 0.0f32;
    (0..(sr * secs) as usize)
        .map(|i| {
            let t = i as f32 / sr;
            let f = f0 * (1.0 + 0.03 * (2.0 * std::f32::consts::PI * 5.0 * t).sin());
            phase += 2.0 * std::f32::consts::PI * f / sr;
            (1..=6).map(|h| (phase * h as f32).sin() / h as f32).sum::<f32>() * 0.3
        })
        .collect()
}

/// 周期性: 40ms ごとの区間で、1周期ずらした波形との正規化相関の最大値を平均する（1 に近いほど周期がきれい）
fn periodicity(y: &[f32], sr: f32, f0: f32) -> f32 {
    let win = (sr * 0.04) as usize;
    let (lo, hi) = ((sr / (f0 * 1.1)) as usize, (sr / (f0 * 0.9)) as usize);
    let mut total = 0.0;
    let mut count = 0;
    let mut s = win;
    while s + win + hi < y.len() - win {
        let a = &y[s..s + win];
        let best = (lo..=hi)
            .map(|lag| {
                let b = &y[s + lag..s + lag + win];
                let (mut ab, mut aa, mut bb) = (0.0f32, 0.0f32, 0.0f32);
                for i in 0..win {
                    ab += a[i] * b[i];
                    aa += a[i] * a[i];
                    bb += b[i] * b[i];
                }
                ab / (aa * bb).sqrt().max(1e-9)
            })
            .fold(f32::MIN, f32::max);
        total += best;
        count += 1;
        s += win;
    }
    total / count as f32
}

/// ボーカルを大きく伸ばしたときの周期のきれいさを方式ごとに比べる。PSOLA は WSOLA 以上であること
#[test]
fn vocal_stretch_periodicity() {
    let sr = 48000.0;
    let x = vibrato_vowel(sr, 1.0, 180.0);
    let mut scores = Vec::new();
    for algo in ALGOS {
        let y = &run(&[&x], sr, 0.0, 4.0, algo)[0];
        let p = periodicity(y, sr, 180.0);
        println!("{algo:?}: periodicity {p:.4}");
        scores.push((algo, p));
    }
    let score = |a: Algorithm| scores.iter().find(|(x, _)| *x == a).unwrap().1;
    assert!(score(Algorithm::Psola) >= score(Algorithm::Wsola) - 0.005, "{scores:?}");
    assert!(score(Algorithm::Psola) > 0.95, "{scores:?}");
    // 改良版（v2）は従来版より悪くならないこと
    assert!(score(Algorithm::Psola2) >= score(Algorithm::Psola) - 0.005, "{scores:?}");
    assert!(score(Algorithm::Wsola2) >= score(Algorithm::Wsola) - 0.005, "{scores:?}");
}

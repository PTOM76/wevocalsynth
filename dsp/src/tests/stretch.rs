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

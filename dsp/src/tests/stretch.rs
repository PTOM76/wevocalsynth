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
/// 処理の段階ごとの時間（3 分・48kHz・ステレオ）。どこが重いかを見て、高速化する所を決めるため
/// `cargo test --release -- --ignored --nocapture bench_stages`
fn bench_stages() {
    let sr = 48000.0;
    let x = sine(220.0, sr, 180.0);
    let time = |name: &str, f: &mut dyn FnMut()| {
        let t = std::time::Instant::now();
        f();
        println!("{name}: {:?}", t.elapsed());
    };
    let ratio = 2f64.powf(5.0 / 12.0);
    let stretched = Algorithm::Sola.stretch(&[&x, &x], ratio, sr, &mut |_| {});
    time("stretch SOLA x1.33", &mut || {
        Algorithm::Sola.stretch(&[&x, &x], ratio, sr, &mut |_| {});
    });
    time("stretch PhaseVocoder x1.33", &mut || {
        Algorithm::PhaseVocoder.stretch(&[&x, &x], ratio, sr, &mut |_| {});
    });
    time("formant correct (2ch)", &mut || {
        for c in &stretched {
            crate::formant::correct(c, ratio, sr, &mut |_| {});
        }
    });
    time("resample (2ch)", &mut || {
        for c in &stretched {
            crate::resample(c, ratio, x.len());
        }
    });
    // Phase Vocoder と同じ大きさ（2048）の FFT を、3 分ステレオの PV が回す回数（約 2 × 2 × 長さ / 512 / 2）だけ回す
    let n = 2048;
    let fft = crate::fft::Fft::new(n);
    let count = 2 * (x.len() as f64 * ratio / 512.0) as usize;
    let (mut re, mut im) = (vec![0.1f32; n], vec![0.0f32; n]);
    time(&format!("fft {n} x {count}"), &mut || {
        for _ in 0..count {
            fft.run(&mut re, &mut im, false);
        }
    });
}

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

/// 打楽器の立ち上がり: 短い減衰音の連続を 2 倍に伸ばし、立ち上がりのまわりのエネルギーの集中度を比べる。
/// 立ち上がり保持の Phase Vocoder v2 は、従来の Phase Vocoder よりはっきり鋭いこと
#[test]
fn transient_sharpness() {
    let sr = 48000.0;
    let n = (sr * 2.0) as usize;
    let x: Vec<f32> = (0..n)
        .map(|i| {
            let t = (i % (sr as usize / 4)) as f32 / sr;
            // 4 回/秒の、2kHz の短い減衰音
            (2.0 * std::f32::consts::PI * 2000.0 * t).sin() * (-t * 300.0).exp() * 0.8
        })
        .collect();
    // 伸ばした後の立ち上がりは 0.5 秒ごと（Phase Vocoder は窓の分だけ前後に広がるので、位置は決め打ちしない）。
    // 各立ち上がりの ±60ms で、いちばん強い 5ms にエネルギーがどれだけ集まっているか（集中度。高いほど鋭い）
    let concentration = |y: &[f32]| {
        let (span, w) = ((sr * 0.06) as usize, (sr * 0.005) as usize);
        let mut total = 0.0;
        let mut count = 0;
        let mut onset = (sr * 0.5) as usize;
        while onset + span < y.len() {
            let seg: Vec<f32> = y[onset - span..onset + span].iter().map(|v| v * v).collect();
            let all = seg.iter().sum::<f32>().max(1e-9);
            let best = seg.windows(w).map(|s| s.iter().sum::<f32>()).fold(0.0f32, f32::max);
            total += best / all;
            count += 1;
            onset += (sr * 0.5) as usize;
        }
        total / count as f32
    };
    let pv = concentration(&run(&[&x], sr, 0.0, 2.0, Algorithm::PhaseVocoder)[0]);
    let pv2 = concentration(&run(&[&x], sr, 0.0, 2.0, Algorithm::PhaseVocoder2)[0]);
    let hpss = concentration(&run(&[&x], sr, 0.0, 2.0, Algorithm::Hpss)[0]);
    println!("concentration: PhaseVocoder {pv:.4} / PhaseVocoder2 {pv2:.4} / Hpss {hpss:.4}");
    // 2026-10-02 時点: Phase Vocoder 0.41 / v2 0.95
    assert!(pv2 > pv + 0.3, "pv {pv} pv2 {pv2}");
    assert!(hpss > pv + 0.2, "pv {pv} hpss {hpss}");
}

/// 立ち上がりの時刻: 続けて鳴る短い音（8 回/秒）を 1.5 倍に伸ばし、各音のピークが元の対応どおりの時刻（入力の時刻 × 1.5）から
/// ずれないこと。ずれが溜まっていかないこと（以前の Phase Vocoder v2 は、ずれを後から取り戻す形で、続くドラムがだんだんずれた）
#[test]
fn transient_timing() {
    let sr = 48000.0;
    let period = sr as usize / 8;
    let x: Vec<f32> = (0..(sr * 3.0) as usize)
        .map(|i| {
            let t = (i % period) as f32 / sr;
            (2.0 * std::f32::consts::PI * 2000.0 * t).sin() * (-t * 300.0).exp() * 0.8
        })
        .collect();
    let alpha = 1.5;
    // 方式ごとの（最大のずれ、ずれのばらつき = 最大 - 最小）
    let mut results = Vec::new();
    for algo in ALGOS {
        let y = &run(&[&x], sr, 0.0, alpha, algo)[0];
        let (mut worst, mut lo, mut hi) = (0.0f32, f32::MAX, f32::MIN);
        // 先頭と末尾の音は端の扱いで崩れやすいので除く
        for j in 1..(x.len() / period) - 1 {
            let expect = (j * period) as f64 * alpha;
            let span = (period as f64 * alpha * 0.4) as usize;
            let (a, b) = (expect as usize - span, (expect as usize + span).min(y.len()));
            let peak = (a..b).max_by(|&p, &q| y[p].abs().total_cmp(&y[q].abs())).unwrap();
            // 減衰音のピークは立ち上がりの少し後（2kHz の 1/4 周期ほど）
            let err = (peak as f64 - expect) as f32 / sr * 1000.0;
            worst = worst.max(err.abs());
            lo = lo.min(err);
            hi = hi.max(err);
        }
        println!("{algo:?}: worst {worst:.1}ms, spread {:.1}ms", hi - lo);
        results.push((algo, worst, hi - lo));
    }
    // Phase Vocoder は立ち上がりがにじんでピークの位置が定まらない。v2・HPSS は元の時刻からずれず、ばらつきも小さいこと
    // （2026-10-02 時点: v2 は最大 0.1ms、HPSS は最大 2.2ms）
    for &(algo, worst, spread) in &results {
        if matches!(algo, Algorithm::PhaseVocoder2 | Algorithm::Hpss) {
            assert!(worst < 5.0 && spread < 5.0, "{algo:?}: worst {worst} spread {spread}");
        }
    }
}

/// HPSS の分離: 伸びる成分と打つ成分を足すと元に戻ること。持続音は伸びる成分、短い減衰音は打つ成分に多く入ること
#[test]
fn hpss_separation() {
    let sr = 48000.0;
    let n = sr as usize;
    let tone: Vec<f32> = (0..n).map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sr).sin() * 0.5).collect();
    let click: Vec<f32> = (0..n)
        .map(|i| {
            let t = (i % (sr as usize / 4)) as f32 / sr;
            if t < 0.002 { (1.0 - t / 0.002) * 0.8 * if i % 2 == 0 { 1.0 } else { -1.0 } } else { 0.0 }
        })
        .collect();
    let mix: Vec<f32> = tone.iter().zip(&click).map(|(a, b)| a + b).collect();
    let (h, p) = crate::hpss::separate(&[&mix], sr, &mut |_| {});
    let err = mix.iter().zip(h[0].iter().zip(&p[0])).map(|(x, (a, b))| (x - a - b).abs()).fold(0.0f32, f32::max);
    let energy = |y: &[f32], r: &[f32]| y.iter().zip(r).map(|(a, b)| a * b).sum::<f32>();
    // 持続音との相関は伸びる成分、クリックとの相関は打つ成分のほうが大きい
    let (th, tp) = (energy(&h[0], &tone), energy(&p[0], &tone));
    let (ch, cp) = (energy(&h[0], &click), energy(&p[0], &click));
    println!("hpss: max err {err:.5}, tone H/P {th:.1}/{tp:.1}, click H/P {ch:.2}/{cp:.2}");
    assert!(err < 1e-3, "{err}");
    assert!(th > tp * 10.0 && cp > ch, "tone {th}/{tp} click {ch}/{cp}");
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

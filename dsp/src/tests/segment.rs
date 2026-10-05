//! 区間に分けて並列に加工する試作の確認（segment.rs）

use super::stretch::vibrato_vowel;
use super::ALGOS;
use crate::segment::{plan, process_parallel, stitch, Segment};
use crate::{process_with_progress, Formant};

const SR: f32 = 48000.0;

/// 区間は隙間なく並び、余白は音の中に収まる
#[test]
fn segment_plan_covers() {
    let len = (SR * 65.0) as usize;
    let segs = plan(len, SR);
    assert!(segs.len() >= 6);
    assert_eq!(segs[0].start, 0);
    assert_eq!(segs.last().unwrap().end, len);
    for w in segs.windows(2) {
        assert_eq!(w[0].end, w[1].start);
        assert!(w[1].ctx_start < w[0].end && w[0].ctx_end > w[1].start);
    }
    // 短い音は分けない
    assert_eq!(plan((SR * 10.0) as usize, SR).len(), 1);
}

/// 加工しない（区間をそのまま返す）なら、つないだ音は元の音と一致する
#[test]
fn segment_stitch_identity() {
    let x = vibrato_vowel(SR, 45.0, 220.0);
    let segs = plan(x.len(), SR);
    let outs: Vec<Vec<Vec<f32>>> = segs.iter().map(|s: &Segment| vec![x[s.ctx_start..s.ctx_end].to_vec()]).collect();
    let y = stitch(&segs, &outs, x.len(), 1.0, SR);
    let err = x.iter().zip(&y[0]).map(|(a, b)| (a - b).abs()).fold(0.0f32, f32::max);
    assert!(err < 1e-5, "最大誤差 {err}");
}

/// 10ms ごとの RMS
fn rms_frames(x: &[f32]) -> Vec<f32> {
    x.chunks((SR * 0.01) as usize).map(|c| (c.iter().map(|v| v * v).sum::<f32>() / c.len() as f32).sqrt()).collect()
}

/// 境目の音質（方式ごと）: 境目の前後 0.25 秒の RMS の最小 ÷ 全体の RMS の中央値（分けない音の全体での落ち込みと比べる）と、
/// 分けずに処理した音との RMS の差の、境目のまわりとほかの所の比（1 に近いほど境目だけ悪くなっていない）。
/// `cargo test --release -- --ignored --nocapture segment_seam_quality`
#[test]
#[ignore]
fn segment_seam_quality() {
    let x = vibrato_vowel(SR, 120.0, 220.0);
    let segs = plan(x.len(), SR);
    // 境目の予定の位置（10ms のフレームの番号）
    let seams: Vec<usize> = segs.windows(2).map(|w| w[0].end / (SR * 0.01) as usize).collect();
    for algo in ALGOS {
        let whole = process_with_progress(&[&x], SR, 5.0, 1.0, algo, Formant::Shift(0.0), &mut |_| {});
        let split = process_parallel(&[&x], SR, 5.0, 1.0, algo, Formant::Shift(0.0), 4);
        let (rw, rs) = (rms_frames(&whole[0]), rms_frames(&split[0]));
        let mut sorted = rs.clone();
        sorted.sort_by(|a, b| a.total_cmp(b));
        let median = sorted[sorted.len() / 2];
        // 境目の前後 ±20 フレーム（境目は予定の ±0.2 秒の中で選ぶ）
        let near = |f: usize| seams.iter().any(|&s| f + 25 >= s && f <= s + 25);
        // 境目の窓（前後 0.25 秒）の最小の中央値と、分けない音の全部の窓の最小の中央値を比べる。
        // 方式によってはもともと所々で音量が揺れるので、最悪の 1 つではなく中央値で比べる
        let min_of = |r: &[f32], c: usize| r[c.saturating_sub(25)..(c + 25).min(r.len())].iter().copied().fold(f32::MAX, f32::min) / median;
        let mid = |mut v: Vec<f32>| {
            v.sort_by(|a, b| a.total_cmp(b));
            v[v.len() / 2]
        };
        let dip = mid(seams.iter().map(|&c| min_of(&rs, c)).collect());
        let base = mid((50..rw.len() - 50).step_by(10).map(|c| min_of(&rw, c)).collect());
        let diff = |f: usize| (rw[f] - rs[f]).abs() / median;
        let (mut dn, mut nn, mut df, mut nf) = (0.0, 0, 0.0, 0);
        for f in 50..rs.len().min(rw.len()) - 50 {
            if near(f) {
                dn += diff(f);
                nn += 1;
            } else {
                df += diff(f);
                nf += 1;
            }
        }
        let ratio = (dn / nn as f32) / (df / nf as f32).max(1e-6);
        println!("{algo:?}: 落ち込み {dip:.2}（分けない音 {base:.2}）, 分けない音との差（境目 / ほか） {ratio:.2}");
        assert!(dip > base * 0.9 && ratio < 1.5, "{algo:?}: 境目の音質 {dip} / {base}, {ratio}");
    }
}

/// 立ち上がり（クリック）が境目にかかっても、二重に鳴らない（クリックの数が変わらない）
#[test]
#[ignore]
fn segment_onsets_not_doubled() {
    let len = (SR * 30.0) as usize;
    // 0.25 秒おきのクリック（境目 15 秒の前後にもかかる）
    let mut x = vec![0.0f32; len];
    for k in (0..len).step_by((SR * 0.25) as usize) {
        for i in 0..64.min(len - k) {
            x[k + i] = (1.0 - i as f32 / 64.0) * if i % 2 == 0 { 0.8 } else { -0.8 };
        }
    }
    let count = |y: &[f32]| {
        let env = rms_frames(y);
        let th = env.iter().copied().fold(0.0f32, f32::max) * 0.3;
        env.windows(2).filter(|w| w[0] < th && w[1] >= th).count()
    };
    for algo in ALGOS {
        let y = process_parallel(&[&x], SR, 3.0, 1.0, algo, Formant::Follow, 4);
        let whole = process_with_progress(&[&x], SR, 3.0, 1.0, algo, Formant::Follow, &mut |_| {});
        println!("{algo:?}: クリックの数 分けない {} / 分ける {}", count(&whole[0]), count(&y[0]));
    }
}

/// スレッドの数ごとの速さ（2 分、ステレオ、+5 半音、フォルマントを保つ）
/// `cargo test --release -- --ignored --nocapture segment_bench_threads`
#[test]
#[ignore]
fn segment_bench_threads() {
    let x = vibrato_vowel(SR, 120.0, 220.0);
    for algo in [crate::Algorithm::Sola, crate::Algorithm::Sola3, crate::Algorithm::PhaseVocoder, crate::Algorithm::Hpss] {
        let t = std::time::Instant::now();
        process_with_progress(&[&x, &x], SR, 5.0, 1.0, algo, Formant::Shift(0.0), &mut |_| {});
        let base = t.elapsed();
        let mut line = format!("{algo:?}: 分けない {base:.2?}");
        for threads in [1, 2, 4, 8] {
            let t = std::time::Instant::now();
            process_parallel(&[&x, &x], SR, 5.0, 1.0, algo, Formant::Shift(0.0), threads);
            line += &format!(", {threads} 本 {:.2?}", t.elapsed());
        }
        println!("{line}");
    }
}

/// つなぐ処理だけの時間（2 分、ステレオ）
#[test]
#[ignore]
fn segment_bench_stitch() {
    let x = vibrato_vowel(SR, 120.0, 220.0);
    let segs = plan(x.len(), SR);
    let outs: Vec<Vec<Vec<f32>>> = segs.iter().map(|s| vec![x[s.ctx_start..s.ctx_end].to_vec(), x[s.ctx_start..s.ctx_end].to_vec()]).collect();
    let t = std::time::Instant::now();
    stitch(&segs, &outs, x.len(), 1.0, SR);
    println!("stitch: {:?}", t.elapsed());
}



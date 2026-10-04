//! 声の子音（破裂音）のテスト。母音・閉鎖（無音）・破裂（短い雑音）・息（弱い雑音）を繰り返す音を伸ばし、
//! 破裂が二重にならないか・鈍らないか・ずれないかを方式ごとに測る。

use super::*;

/// 決まった並びの雑音（-1〜1）
pub(super) fn noise(n: usize, seed: u32) -> Vec<f32> {
    let mut s = seed;
    (0..n)
        .map(|_| {
            s = s.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            (s >> 8) as f32 / (1u32 << 23) as f32 - 1.0
        })
        .collect()
}

/// 1 音節の長さ（秒）と、音節の頭から破裂までの時刻（秒）
const SYLLABLE: f32 = 0.25;
const BURST_AT: f32 = 0.22;

/// 「た」の繰り返しもどき。母音 180ms（倍音つき 180Hz）→ 閉鎖 40ms → 破裂 6ms → 息 4ms → 次の母音
pub(super) fn syllables(sr: f32, count: usize) -> Vec<f32> {
    let n = (sr * SYLLABLE) as usize;
    let mut y = vec![0.0f32; n * count];
    let nz = noise(y.len(), 7);
    let mut phase = 0.0f32;
    for (i, v) in y.iter_mut().enumerate() {
        let t = (i % n) as f32 / sr;
        phase += 2.0 * std::f32::consts::PI * 180.0 / sr;
        *v = if t < 0.18 {
            // 母音（両端 10ms で出入り）
            let env = (t / 0.01).min(1.0) * ((0.18 - t) / 0.01).min(1.0);
            (1..=6).map(|h| (phase * h as f32).sin() / h as f32).sum::<f32>() * 0.25 * env
        } else if t < BURST_AT {
            0.0
        } else if t < BURST_AT + 0.006 {
            nz[i] * 0.6 * (-(t - BURST_AT) * 600.0).exp()
        } else if t < BURST_AT + 0.03 {
            nz[i] * 0.06
        } else {
            0.0
        };
    }
    y
}

/// 1ms ごとの高い音の振幅（隣のサンプルとの差の RMS）。差をとると低い母音は小さくなり、破裂（雑音）が目立つ
fn envelope(y: &[f32], sr: f32) -> Vec<f32> {
    let w = (sr * 0.001) as usize;
    let d: Vec<f32> = y.windows(2).map(|p| p[1] - p[0]).collect();
    d.chunks(w).map(|c| (c.iter().map(|v| v * v).sum::<f32>() / c.len() as f32).sqrt()).collect()
}

/// 破裂ごとの（ピークの数、立ち上がり 10→90% の時間 ms、時刻のずれ ms）を平均する。
/// ずれは入力の時刻 × 倍率との差。SOLA 系は最後のブロックが入力の最後に来るよう全体を少し縮めて対応させるので（`TimeMap::frame_pos`）、
/// 後ろの音節ほど遅れる（×2 の 1.7 秒で約 +15ms、WSOLA は ×3 の 4 秒で約 +80ms。母音も同じだけずれる）。遅れても拾えるよう、後ろを広く見る
pub(super) fn measure(y: &[f32], sr: f32, alpha: f64, count: usize) -> (f32, f32, f32) {
    let env = envelope(y, sr);
    let (mut peaks, mut rise, mut err) = (0.0f32, 0.0f32, 0.0f32);
    let mut n = 0;
    // 先頭と末尾の音節は端の扱いで崩れやすいので除く
    for k in 1..count - 1 {
        let expect = ((k as f32 * SYLLABLE + BURST_AT) as f64 * alpha * 1000.0) as i64;
        // 破裂の前の閉鎖（伸ばすと長くなる）から、後ろの息まで
        let (a, b) = ((expect - 20).max(0) as usize, ((expect + 100) as usize).min(env.len()));
        let seg = &env[a..b];
        let max = seg.iter().cloned().fold(0.0f32, f32::max);
        let top = seg.iter().position(|&v| v == max).unwrap();
        // 強い所（最大の半分以上）のかたまりの数。間に 3ms 以上の弱い所があれば別のかたまり
        let (mut blobs, mut gap, mut inside) = (0, 3, false);
        for &v in seg {
            if v >= max * 0.5 {
                if !inside && gap >= 3 {
                    blobs += 1;
                }
                inside = true;
                gap = 0;
            } else {
                inside = false;
                gap += 1;
            }
        }
        // 最大の所から前へ、10% を下回るまでと 90% を下回るまで
        let back = |th: f32| (0..=top).rev().find(|&j| seg[j] < max * th).unwrap_or(0);
        rise += (back(0.9) - back(0.1)) as f32;
        peaks += blobs as f32;
        err += (a + back(0.1)) as f32 - expect as f32;
        n += 1;
    }
    (peaks / n as f32, rise / n as f32, err / n as f32)
}

/// 方式ごとの測定値を出す。`cargo test --release consonant -- --nocapture`
#[test]
fn consonant_bursts() {
    let sr = 48000.0;
    let count = 8;
    let x = syllables(sr, count);
    let (p0, r0, _) = measure(&x, sr, 1.0, count);
    println!("input: peaks {p0:.2}, rise {r0:.1}ms");
    for alpha in [2.0, 3.0] {
        for algo in [Algorithm::Sola, Algorithm::Sola2, Algorithm::Sola3, Algorithm::Wsola2, Algorithm::Psola2] {
            let y = &run(&[&x], sr, 0.0, alpha, algo)[0];
            let (p, r, e) = measure(y, sr, alpha, count);
            println!("x{alpha} {algo:?}: peaks {p:.2}, rise {r:.1}ms, offset {e:.1}ms");
            // v2 以降の方式は立ち上がりを 1 回だけ等速で読むので、二重にならず鈍らないこと
            // （前は SOLAv2 が ×3 で peaks 2.83（2026-10-03 に対応）、WSOLAv2 が 1.83、PSOLAv2 が 2.17 だった（2026-10-04 に対応））
            if matches!(algo, Algorithm::Sola2 | Algorithm::Sola3 | Algorithm::Wsola2 | Algorithm::Psola2) {
                assert!(p <= 1.2 && r <= 1.5, "x{alpha} {algo:?}: peaks {p} rise {r}");
            }
        }
    }
}

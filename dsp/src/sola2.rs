//! SOLA の改良版（SOLAv2）。声のある所は、切り貼りの単位を声の 1 周期にし、隣の周期と混ぜて少しずつ移り変わらせる。
//!
//! SOLA は約50msのブロックを繰り返すので、ブロックの中の立ち上がりや揺れがまとめて二重になり、
//! 大きく伸ばすとガサガサする。ここでは声のある所のブロックを 1 周期にし、つなぎ方は SOLA と同じく
//! 短いクロスフェードと2乗誤差での位置合わせにする。声のない所は `UNVOICED_SEC` の固定長。
//! 数周期をまとめて繰り返すと、その長さの周期で低いうなりが出る（2 周期で試して悪化した）ため 1 周期にしている。

use crate::{f0, TimeMap};
use std::f64::consts::PI;

/// 声のない所のブロックの長さ（秒）
const UNVOICED_SEC: f64 = 0.012;
/// クロスフェードの最大の長さ（秒）。ブロックの半分も超えない
const FADE_SEC: f64 = 0.005;
/// 声のない所の探索幅（秒）
const UNVOICED_TOLERANCE_SEC: f64 = 0.006;

/// 全チャンネルを `alpha` 倍に時間伸縮する（出力長 = 入力長 × alpha）。
pub fn stretch(channels: &[&[f32]], alpha: f64, sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    if (alpha - 1.0).abs() < 1e-9 {
        return channels.iter().map(|c| c.to_vec()).collect();
    }
    let out_len = (len as f64 * alpha).round() as usize;
    stretch_map(channels, &TimeMap::linear(len, out_len), sample_rate, progress)
}

/// 任意の時間対応 `map` で全チャンネルを伸縮する。全チャンネルで同じ区切り位置を使う。
pub fn stretch_map(channels: &[&[f32]], map: &TimeMap, sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    let out_len = map.out_len;
    if len == 0 || out_len == 0 {
        return vec![Vec::new(); channels.len()];
    }
    let sr = sample_rate as f64;
    let mono: Vec<f32> = (0..len).map(|i| channels.iter().map(|c| c[i]).sum::<f32>() / channels.len() as f32).collect();
    let f0s = f0::estimate(&mono, sample_rate, &mut |p| progress(p * 0.4));
    let f0_hop = sr * f0::HOP_SEC as f64;
    // 入力位置の周期（サンプル）。声がなければ None
    let period_at = |i: i64| {
        let f = f0s.get(((i.max(0) as f64 / f0_hop).round() as usize).min(f0s.len().saturating_sub(1))).copied().unwrap_or(0.0);
        (f > 0.0).then(|| sr / f as f64)
    };
    let max_fade = (sr * FADE_SEC) as usize;
    let max_block = (sr * 0.05) as usize + max_fade;
    let typical = (sr * UNVOICED_SEC) as usize + max_fade;
    let last_pos = len.saturating_sub(typical) as i64;
    let pad = max_block + 8;
    let mut padded = vec![0.0f32; pad + len + pad];
    padded[pad..pad + len].copy_from_slice(&mono);
    // 位置 `p` から `n` サンプル（範囲外は 0）
    let seg = |p: i64, n: usize| -> &[f32] {
        let s = (p.clamp(-(pad as i64) + 1, (len + 1) as i64) + pad as i64) as usize;
        &padded[s..s + n]
    };
    let sq_err = |a: i64, b: i64, n: usize| -> f32 { seg(a, n).iter().zip(seg(b, n)).map(|(x, y)| (x - y) * (x - y)).sum() };
    let at = |c: &[f32], p: i64| if p >= 0 && (p as usize) < len { c[p as usize] } else { 0.0 };

    let mut out = vec![vec![0.0f32; out_len + max_block]; channels.len()];
    let mut wsum = vec![0.0f32; out_len + max_block];
    let ramp = |j: usize, f: usize| (0.5 - 0.5 * (PI * (j as f64 + 0.5) / f as f64).cos()) as f32;
    let (mut out_pos, mut prev_end): (usize, i64) = (0, 0);
    let mut prev_fade = 0usize;
    let (mut prev_nominal, mut reversed) = (0i64, false);
    while out_pos < out_len {
        progress(0.4 + 0.6 * out_pos as f64 / out_len as f64);
        // 末尾で行き過ぎないよう、最後のブロックが入力の最後に来る対応にする（`TimeMap::frame_pos` 参照）
        let nominal = map.frame_pos(out_pos, len, typical).round() as i64;
        // ブロックの長さと探索幅: 声があれば 1 周期と ±半周期、なければ固定長
        let period = period_at(nominal);
        let voiced = period.is_some();
        let (hop, delta) = match period {
            Some(t) => (t.round() as usize, (t / 2.0).ceil() as i64),
            None => ((sr * UNVOICED_SEC) as usize, (sr * UNVOICED_TOLERANCE_SEC) as i64),
        };
        let hop = hop.clamp(16, max_block - max_fade);
        let fade = max_fade.min(hop / 2).max(4);
        // 声のない所で同じ断片を繰り返す（入力の進みがブロックより短い）ときは、1 回おきに逆向きに読む。
        // 同じ雑音を同じ向きで繰り返すと、ブロックの長さの周期で音程のある雑音になるため（Moulines & Charpentier 1990）
        let repeating = !voiced && out_pos > 0 && ((nominal - prev_nominal) as f64) < hop as f64 * 0.9;
        reversed = repeating && !reversed;
        prev_nominal = nominal;
        // 前のブロックの続き（前のブロックの終わりのクロスフェード区間）と最も似ている位置。
        // 声のない所を繰り返すときは雑音なので位置合わせはしない
        let pos = if out_pos == 0 {
            0
        } else if repeating {
            nominal.clamp(0, last_pos)
        } else {
            let natural = prev_end;
            let f = prev_fade.min(fade).max(4);
            let mut best = (nominal, f32::MAX);
            for off in -delta..=delta {
                let cand = (nominal + off).clamp(0, last_pos);
                let e = sq_err(natural, cand, f);
                if e < best.1 {
                    best = (cand, e);
                }
            }
            best.0
        };
        // 声のある所は、隣の周期（予定位置の側）と、予定位置までの近さに応じて混ぜる。
        // 同じ周期を何度か繰り返してから次の周期へ飛ぶと、その飛び目が周期数個おきのブツブツになるため（波形補間の考え方）
        let (pos_b, g) = match (voiced && out_pos > 0).then_some(hop as i64) {
            Some(t) => {
                let frac = ((nominal - pos) as f64 / t as f64).clamp(-1.0, 1.0);
                let guess = pos + if frac >= 0.0 { t } else { -t };
                // 隣の周期が入力に収まらない（先頭・末尾）ときは混ぜない。切り詰めた位置と混ぜると打ち消し合う
                if guess - t / 4 < 0 || guess + t / 4 > last_pos {
                    (pos, 0.0)
                } else {
                    // 隣の周期の位置は、今の周期の波形全体と最も似ている所にそろえる（ずれたまま混ぜると音がこもる）
                    let mut best = (guess, f32::MAX);
                    for cand in guess - t / 4..=guess + t / 4 {
                        let e = sq_err(pos, cand, hop);
                        if e < best.1 {
                            best = (cand, e);
                        }
                    }
                    (best.0, frac.abs() as f32)
                }
            }
            None => (pos, 0.0),
        };
        // 1ブロック = 前の重なり（fade）+ 本体（hop - fade）+ 次の重なり（fade）
        let n = hop + fade;
        for i in 0..n {
            let o = out_pos + i;
            if o >= wsum.len() {
                break;
            }
            let w = if i < prev_fade.min(fade) && out_pos > 0 {
                ramp(i, prev_fade.min(fade))
            } else if i >= hop {
                1.0 - ramp(i - hop, fade)
            } else {
                1.0
            };
            let src = if reversed { pos + (n - 1 - i) as i64 } else { pos + i as i64 };
            let src_b = pos_b + i as i64;
            wsum[o] += w;
            for (oc, c) in out.iter_mut().zip(channels) {
                oc[o] += w * ((1.0 - g) * at(c, src) + g * at(c, src_b));
            }
        }
        prev_end = pos + hop as i64;
        prev_fade = fade;
        out_pos += hop;
    }
    for o in out.iter_mut() {
        o.truncate(out_len);
        for (s, &w) in o.iter_mut().zip(&wsum) {
            *s = if w > 1e-3 { *s / w } else { 0.0 };
        }
    }
    out
}

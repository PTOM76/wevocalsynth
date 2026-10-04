//! 正弦波モデル（SMS、Spectral Modeling Synthesis の正弦波の部分）による時間伸縮。できるだけ可逆な方式。
//!
//! 音を、ゆっくり変わる正弦波の集まり（周波数・振幅の軌跡）に分け、出力の時刻に対応する入力の時刻の値で鳴らし直す。
//! 倍音に限らない正弦波の集まりなので、和音や楽器にも使える。鳴らし直した音をもう一度分けると、ほぼ同じ正弦波が得られるので、
//! 伸縮を往復させたり重ねたりしても、誤差がたまりにくい（最初に分けたときの誤差が残るだけ）。
//! 位相は鳴らし直すときに周波数を積み上げて作るので、波形は元と同じにはならないが、聞こえ方（振幅スペクトル）は保たれる。
//! 雑音（息、子音）は正弦波で表しにくいので、まだ扱いが粗い（`docs/ALGORITHM.md` の SMS）。

use crate::{fft::Fft, TimeMap};
use std::collections::HashMap;
use std::f64::consts::PI;

/// 分析の窓（サンプル数は 48kHz で 2048 ほど。低い音の倍音を分けられる長さ）と、分析の間隔
const FRAME_SEC: f64 = 0.043;
const HOP_SEC: f64 = 0.005;
/// 鳴らし直す間隔（出力のサンプル）。この間は周波数と振幅を直線でつなぐ
const SYNTH_HOP: usize = 128;
/// 正弦波とみなす山の下限（そのフレームの最大から何 dB 下まで）
const FLOOR_DB: f32 = 70.0;
/// 1 フレームに使う山の数の上限
const MAX_PEAKS: usize = 300;
/// 前のフレームの山とつなぐ周波数の差の上限（Hz と、周波数に対する割合の大きい方）
const LINK_HZ: f64 = 20.0;
const LINK_RATIO: f64 = 0.03;

/// 1 つの山（正弦波）。`track` は時間方向につないだ番号
#[derive(Clone, Copy)]
struct Peak {
    hz: f64,
    amp: f64,
    track: u32,
}

/// 全チャンネルを `alpha` 倍に時間伸縮する（出力長 = 入力長 × alpha）。
pub fn stretch(channels: &[&[f32]], alpha: f64, sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<Vec<f32>> {
    let len = channels.first().map_or(0, |c| c.len());
    if (alpha - 1.0).abs() < 1e-9 {
        return channels.iter().map(|c| c.to_vec()).collect();
    }
    let out_len = (len as f64 * alpha).round() as usize;
    stretch_map(channels, &TimeMap::linear(len, out_len), sample_rate, progress)
}

/// 任意の時間対応 `map` で全チャンネルを伸縮する。チャンネルごとに分けて鳴らし直す。
pub fn stretch_map(channels: &[&[f32]], map: &TimeMap, sample_rate: f32, progress: &mut dyn FnMut(f64)) -> Vec<Vec<f32>> {
    let n = channels.len().max(1) as f64;
    channels
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let frames = analyze(c, sample_rate as f64);
            progress((i as f64 + 0.5) / n);
            synthesize(&frames, c.len(), map, sample_rate as f64)
        })
        .collect()
}

/// 分析: 一定の間隔のフレームごとに山を拾い、前のフレームの山とつなぐ
fn analyze(x: &[f32], sr: f64) -> Vec<Vec<Peak>> {
    let n = ((sr * FRAME_SEC) as usize).next_power_of_two();
    let hop = ((sr * HOP_SEC) as usize).max(1);
    let fft = Fft::new(n);
    let window: Vec<f32> = (0..n).map(|i| (0.5 - 0.5 * (2.0 * PI * i as f64 / n as f64).cos()) as f32).collect();
    let wsum: f32 = window.iter().sum();
    let floor = 10f32.powf(-FLOOR_DB / 20.0);
    let (mut re, mut im) = (vec![0.0f32; n], vec![0.0f32; n]);
    let mut mag = vec![0.0f32; n / 2 + 1];
    let mut frames: Vec<Vec<Peak>> = Vec::new();
    let mut next_track = 0u32;
    let count = x.len() / hop + 1;
    for k in 0..count {
        // フレームの中心が k * hop に来るように切り出す
        let start = (k * hop) as i64 - (n / 2) as i64;
        for i in 0..n {
            let s = start + i as i64;
            re[i] = if s >= 0 && (s as usize) < x.len() { x[s as usize] * window[i] } else { 0.0 };
            im[i] = 0.0;
        }
        fft.run(&mut re, &mut im, false);
        for (b, m) in mag.iter_mut().enumerate() {
            *m = (re[b] * re[b] + im[b] * im[b]).sqrt();
        }
        let top = mag.iter().cloned().fold(0.0f32, f32::max);
        let mut peaks: Vec<Peak> = Vec::new();
        if top > 1e-7 {
            for b in 1..mag.len() - 1 {
                let c = mag[b];
                if c > mag[b - 1] && c >= mag[b + 1] && c > top * floor {
                    // 対数振幅の放物線で、山の本当の位置と高さを求める
                    let (l, m, r) = (mag[b - 1].max(1e-12).ln(), c.ln(), mag[b + 1].max(1e-12).ln());
                    let d = l - 2.0 * m + r;
                    let p = if d.abs() > 1e-12 { (0.5 * (l - r) / d).clamp(-0.5, 0.5) } else { 0.0 };
                    let height = (m - 0.25 * (l - r) * p).exp();
                    peaks.push(Peak { hz: (b as f64 + p as f64) * sr / n as f64, amp: (2.0 * height / wsum) as f64, track: 0 });
                }
            }
            if peaks.len() > MAX_PEAKS {
                peaks.sort_by(|a, b| b.amp.total_cmp(&a.amp));
                peaks.truncate(MAX_PEAKS);
                peaks.sort_by(|a, b| a.hz.total_cmp(&b.hz));
            }
        }
        // 前のフレームの山のうち、周波数が近く、まだつないでいないものとつなぐ（大きい山から順に）
        let prev = frames.last().map(|f| f.as_slice()).unwrap_or(&[]);
        let mut used = vec![false; prev.len()];
        let mut order: Vec<usize> = (0..peaks.len()).collect();
        order.sort_by(|&a, &b| peaks[b].amp.total_cmp(&peaks[a].amp));
        for i in order {
            let hz = peaks[i].hz;
            let limit = LINK_HZ.max(hz * LINK_RATIO);
            let best = prev
                .iter()
                .enumerate()
                .filter(|(j, p)| !used[*j] && (p.hz - hz).abs() < limit)
                .min_by(|a, b| (a.1.hz - hz).abs().total_cmp(&(b.1.hz - hz).abs()));
            peaks[i].track = match best {
                Some((j, p)) => {
                    used[j] = true;
                    p.track
                }
                None => {
                    next_track += 1;
                    next_track
                }
            };
        }
        frames.push(peaks);
    }
    frames
}

/// 入力のフレーム位置 `f`（小数）での山。隣のフレームに同じ軌跡があれば、周波数と振幅を直線で補間する
fn peaks_at(frames: &[Vec<Peak>], f: f64) -> Vec<Peak> {
    let a = (f.floor().max(0.0) as usize).min(frames.len() - 1);
    let b = (a + 1).min(frames.len() - 1);
    let g = (f - a as f64).clamp(0.0, 1.0);
    frames[a]
        .iter()
        .map(|p| match frames[b].iter().find(|q| q.track == p.track) {
            Some(q) => Peak { hz: p.hz + (q.hz - p.hz) * g, amp: p.amp + (q.amp - p.amp) * g, track: p.track },
            // 次のフレームで途切れる軌跡は、だんだん小さくする
            None => Peak { amp: p.amp * (1.0 - g), ..*p },
        })
        .collect()
}

/// 鳴らし直し: 出力の `SYNTH_HOP` ごとに、対応する入力の時刻の山を求め、その間を直線でつないで正弦波を足す。
/// 位相は軌跡ごとに周波数を積み上げる（途切れずにつながる）
fn synthesize(frames: &[Vec<Peak>], len: usize, map: &TimeMap, sr: f64) -> Vec<f32> {
    let out_len = map.out_len;
    let mut out = vec![0.0f32; out_len];
    if frames.is_empty() || len == 0 {
        return out;
    }
    let hop = ((sr * HOP_SEC) as usize).max(1) as f64;
    let at = |o: usize| peaks_at(frames, map.input_at(o as f64).clamp(0.0, (len - 1) as f64) / hop);
    let mut phases: HashMap<u32, f64> = HashMap::new();
    let mut cur = at(0);
    let mut o = 0usize;
    while o < out_len {
        let end = (o + SYNTH_HOP).min(out_len);
        let next = at(end);
        let steps = (end - o) as f64;
        let mut seen: HashMap<u32, f64> = HashMap::new();
        for p in &cur {
            // 次の時刻での同じ軌跡（なければ同じ周波数で小さくしていく）
            let q = next.iter().find(|q| q.track == p.track).copied().unwrap_or(Peak { amp: 0.0, ..*p });
            let mut ph = phases.get(&p.track).copied().unwrap_or(0.0);
            for (i, s) in out[o..end].iter_mut().enumerate() {
                let g = i as f64 / steps;
                let hz = p.hz + (q.hz - p.hz) * g;
                let amp = p.amp + (q.amp - p.amp) * g;
                ph += 2.0 * PI * hz / sr;
                *s += (amp * ph.sin()) as f32;
            }
            seen.insert(p.track, ph % (2.0 * PI));
        }
        // 次の区間で新しく始まる軌跡は、0 から大きくする
        for q in &next {
            if !cur.iter().any(|p| p.track == q.track) {
                let mut ph = 0.0f64;
                for (i, s) in out[o..end].iter_mut().enumerate() {
                    let amp = q.amp * i as f64 / steps;
                    ph += 2.0 * PI * q.hz / sr;
                    *s += (amp * ph.sin()) as f32;
                }
                seen.insert(q.track, ph % (2.0 * PI));
            }
        }
        phases = seen;
        cur = next;
        o = end;
    }
    out
}

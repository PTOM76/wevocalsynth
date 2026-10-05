//! 和音を 2 つの声に分ける（試作。memo/harmony-split.md）。
//!
//! フレームごとに、倍音の振幅の重み付きの和（顕著さ）が最大の F0 を 1 つ目の声とし、その倍音を
//! スペクトルの滑らかさで抑えてから差し引き、残りからもう 1 つ選ぶ（Klapuri 2003 / 2006）。
//! 2 つの声を高さか音量で出力 A・B に振り分け、倍音の見込みの比のマスクで分ける。
//! 元の位相のまま戻し、マスクの和は 1 なので、A + B は元の音と一致する。

use wevocal_lib::stft::Stft;

const N_FFT: usize = 4096;
const HOP: usize = 512;
/// 候補の F0 の範囲（Hz）と間隔（セント）
const F0_MIN: f32 = 70.0;
const F0_MAX: f32 = 1000.0;
const STEP_CENT: f32 = 10.0;
/// 倍音を見る上限（Hz）と、1 つの声の倍音の数の上限
const HARM_MAX_HZ: f32 = 6000.0;
const MAX_HARM: usize = 40;
/// 2 つ目の声とみなす顕著さの下限（1 つ目に対する割合）
const SECOND_RATIO: f32 = 0.25;
/// 音量で振り分けるとき、大きさをならすフレーム数（前後）
const SMOOTH: usize = 8;

/// 振り分けの基準
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum SplitBy {
    /// A が高い方
    Pitch,
    /// A が大きい方
    Volume,
}

/// 1 フレームの 1 つの声
#[derive(Clone, Debug)]
pub struct Voice {
    pub f0: f32,
    /// 倍音ごとの振幅（1 倍音から）
    pub amps: Vec<f32>,
}

impl Voice {
    fn energy(&self) -> f32 {
        self.amps.iter().map(|a| a * a).sum()
    }
}

/// フレームごとの声（0〜2 個）を推定する
pub fn analyze(x: &[f32], sr: f32, progress: &mut dyn FnMut(f64)) -> Vec<Vec<Voice>> {
    let mut st = Stft::new(N_FFT, HOP);
    let b = st.bins();
    let (mut re, mut im) = (vec![0.0; b], vec![0.0; b]);
    let frames = frame_count(x.len());
    let cands = candidates();
    let mut out = Vec::with_capacity(frames);
    for f in 0..frames {
        st.forward(x, f, &mut re, &mut im);
        let mut mag: Vec<f32> = re.iter().zip(&im).map(|(r, i)| (r * r + i * i).sqrt()).collect();
        out.push(frame_voices(&mut mag, sr, &cands));
        if f % 64 == 0 {
            progress(f as f64 / frames as f64);
        }
    }
    out
}

/// `x` を 2 つの声に分ける（A, B）。`x` が複数チャンネルでも、推定はチャンネルを混ぜた音で行う
pub fn split(channels: &[&[f32]], sr: f32, by: SplitBy, progress: &mut dyn FnMut(f64)) -> (Vec<Vec<f32>>, Vec<Vec<f32>>) {
    let len = channels.first().map_or(0, |c| c.len());
    // 端のフレームも窓が重なりきるように、前後を N_FFT だけ延ばす
    let pad = |c: &[f32]| {
        let mut v = vec![0.0; len + 2 * N_FFT];
        v[N_FFT..N_FFT + len].copy_from_slice(c);
        v
    };
    let padded: Vec<Vec<f32>> = channels.iter().map(|c| pad(c)).collect();
    let mut mono = vec![0.0; len + 2 * N_FFT];
    for c in &padded {
        for (m, s) in mono.iter_mut().zip(c) {
            *m += s / channels.len() as f32;
        }
    }
    // 進み具合は、推定が前半、マスクで分けるのが後半（チャンネルごと）
    let voices = analyze(&mono, sr, &mut |p| progress(p * 0.5));
    let assigned = assign(&voices, by);
    let mut st = Stft::new(N_FFT, HOP);
    let b = st.bins();
    let bin_hz = sr / N_FFT as f32;
    let (mut re, mut im) = (vec![0.0; b], vec![0.0; b]);
    let (mut ra, mut ia, mut rb, mut ib) = (vec![0.0; b], vec![0.0; b], vec![0.0; b], vec![0.0; b]);
    let mut outs = (Vec::new(), Vec::new());
    let nch = padded.len() as f64;
    for (ci, c) in padded.iter().enumerate() {
        let (mut ya, mut yb, mut w) = (vec![0.0; c.len()], vec![0.0; c.len()], vec![0.0; c.len()]);
        for (f, (va, vb)) in assigned.iter().enumerate() {
            st.forward(c, f, &mut re, &mut im);
            let mask = mask_a(va.as_ref(), vb.as_ref(), b, bin_hz);
            for k in 0..b {
                ra[k] = re[k] * mask[k];
                ia[k] = im[k] * mask[k];
                rb[k] = re[k] - ra[k];
                ib[k] = im[k] - ia[k];
            }
            st.inverse_add(&ra, &ia, f, &mut ya, Some(&mut w));
            st.inverse_add(&rb, &ib, f, &mut yb, None);
            if f % 64 == 0 {
                progress(0.5 + 0.5 * (ci as f64 + f as f64 / assigned.len() as f64) / nch);
            }
        }
        let norm = |y: &[f32]| (0..len).map(|i| y[N_FFT + i] / w[N_FFT + i].max(1e-6)).collect::<Vec<f32>>();
        outs.0.push(norm(&ya));
        outs.1.push(norm(&yb));
    }
    progress(1.0);
    outs
}

fn frame_count(len: usize) -> usize {
    if len < N_FFT { 0 } else { (len - N_FFT) / HOP + 1 }
}

fn candidates() -> Vec<f32> {
    let n = (1200.0 * (F0_MAX / F0_MIN).log2() / STEP_CENT) as usize;
    (0..=n).map(|i| F0_MIN * 2f32.powf(i as f32 * STEP_CENT / 1200.0)).collect()
}

/// 周波数 `hz` のまわり ±1 ビンの最大の振幅
fn peak(mag: &[f32], hz: f32, bin_hz: f32) -> f32 {
    let k = (hz / bin_hz).round() as usize;
    if k + 1 >= mag.len() {
        return 0.0;
    }
    mag[k.saturating_sub(1)].max(mag[k]).max(mag[k + 1])
}

fn harm_count(f0: f32) -> usize {
    ((HARM_MAX_HZ / f0) as usize).clamp(1, MAX_HARM)
}

/// 倍音の振幅の重み付きの和（Klapuri 2006 の重み）
fn salience(mag: &[f32], f0: f32, bin_hz: f32) -> f32 {
    (1..=harm_count(f0)).map(|h| (f0 + 27.0) / (h as f32 * f0 + 320.0) * peak(mag, h as f32 * f0, bin_hz)).sum()
}

/// 倍音の山の位置から F0 を細かく求める（振幅で重みを付けた、山の周波数 ÷ 倍音の番号の平均）
fn refine(mag: &[f32], f0: f32, bin_hz: f32) -> f32 {
    let (mut sum, mut wsum) = (0.0, 0.0);
    for h in 1..=harm_count(f0).min(8) {
        let k = (h as f32 * f0 / bin_hz).round() as usize;
        if k < 2 || k + 2 >= mag.len() {
            continue;
        }
        let k = (k - 1..=k + 1).max_by(|&a, &b| mag[a].total_cmp(&mag[b])).unwrap();
        let (l, c, r) = (mag[k - 1], mag[k], mag[k + 1]);
        let d = if l - 2.0 * c + r < 0.0 { 0.5 * (l - r) / (l - 2.0 * c + r) } else { 0.0 };
        sum += c * (k as f32 + d) * bin_hz / h as f32;
        wsum += c;
    }
    if wsum > 0.0 { sum / wsum } else { f0 }
}

/// 窓（Hann）のスペクトルの主な山の形。中心からのずれ `d`（ビン）で、中心を 1 とする
fn lobe(d: f32) -> f32 {
    if d.abs() >= 2.0 { 0.0 } else { 0.5 * (1.0 + (std::f32::consts::PI * d / 2.0).cos()) }
}

/// 顕著さが最大の候補。`avoid` の F0 から `AVOID_CENT` 以内は選ばない
fn best(mag: &[f32], cands: &[f32], bin_hz: f32, avoid: Option<f32>) -> (f32, f32) {
    let ok = |f: f32| avoid.map_or(true, |a| (1200.0 * (f / a).log2()).abs() > AVOID_CENT);
    cands.iter().filter(|&&f| ok(f)).map(|&f| (f, salience(mag, f, bin_hz))).fold((0.0, 0.0), |a, c| if c.1 > a.1 { c } else { a })
}

/// 2 つ目の声に選ばない、1 つ目の F0 のまわり（セント）
const AVOID_CENT: f32 = 60.0;

/// 白色化（Klapuri 2006）: 周波数に比例した幅でならした大きさで割り、フォルマントによる偏りを減らす
fn whiten(mag: &[f32]) -> Vec<f32> {
    let mut acc = vec![0.0f32; mag.len() + 1];
    for (i, m) in mag.iter().enumerate() {
        acc[i + 1] = acc[i] + m;
    }
    (0..mag.len())
        .map(|k| {
            let w = (k / 6).max(8);
            let (lo, hi) = (k.saturating_sub(w), (k + w + 1).min(mag.len()));
            let mean = (acc[hi] - acc[lo]) / (hi - lo) as f32;
            mag[k] / (mean + 1e-9).powf(0.67)
        })
        .collect()
}

/// 倍音の振幅（スペクトルの滑らかさ: 前後の倍音との平均より大きい倍音は、ほかの声と重なったものとみなして抑える）
fn harmonic_amps(mag: &[f32], f0: f32, bin_hz: f32) -> Vec<f32> {
    let raw: Vec<f32> = (1..=harm_count(f0)).map(|h| peak(mag, h as f32 * f0, bin_hz)).collect();
    (0..raw.len())
        .map(|h| {
            let lo = h.saturating_sub(1);
            let hi = (h + 1).min(raw.len() - 1);
            let mean = raw[lo..=hi].iter().sum::<f32>() / (hi - lo + 1) as f32;
            raw[h].min(mean)
        })
        .collect()
}

fn subtract(mag: &mut [f32], f0: f32, amps: &[f32], bin_hz: f32) {
    for (h, a) in amps.iter().enumerate() {
        let c = (h + 1) as f32 * f0 / bin_hz;
        for k in (c - 2.0).max(0.0).ceil() as usize..=((c + 2.0) as usize).min(mag.len() - 1) {
            mag[k] = (mag[k] - a * lobe(k as f32 - c)).max(0.0);
        }
    }
}

/// 1 フレームの声を最大 2 つ選ぶ。選ぶのは白色化したスペクトルで、振幅は元のスペクトルから求める。`mag` は差し引いた残りになる
fn frame_voices(mag: &mut [f32], sr: f32, cands: &[f32]) -> Vec<Voice> {
    let bin_hz = sr / N_FFT as f32;
    let orig = mag.to_vec();
    let mut white = whiten(mag);
    let floor = white.iter().fold(0.0f32, |a, &m| a.max(m)) * 1e-3;
    let mut voices: Vec<Voice> = Vec::new();
    let mut first = 0.0;
    for i in 0..2 {
        let (f0, s) = best(&white, cands, bin_hz, voices.first().map(|v| v.f0));
        if s <= floor || (i == 1 && s < first * SECOND_RATIO) {
            break;
        }
        if i == 0 {
            first = s;
        }
        let f0 = refine(mag, f0, bin_hz);
        let wamps = harmonic_amps(&white, f0, bin_hz);
        subtract(&mut white, f0, &wamps, bin_hz);
        let amps = harmonic_amps(mag, f0, bin_hz);
        subtract(mag, f0, &amps, bin_hz);
        voices.push(Voice { f0, amps });
    }
    if voices.len() == 2 {
        resolve_overlap(&mut voices, &orig, bin_hz);
    }
    voices
}

/// 重なった倍音を分ける。2 つの声の振幅を元のスペクトルから求め直し、もう一方の声の倍音と
/// `OVERLAP_BIN` 以内で重なる倍音は、同じ声の重ならない前後の倍音から直線で補った値にする（5 度、8 度で効く）
fn resolve_overlap(voices: &mut [Voice], orig: &[f32], bin_hz: f32) {
    let f = [voices[0].f0, voices[1].f0];
    for i in 0..2 {
        let other = f[1 - i];
        let n = voices[i].amps.len();
        let raw: Vec<f32> = (1..=n).map(|h| peak(orig, h as f32 * f[i], bin_hz)).collect();
        let overlapped: Vec<bool> = (1..=n)
            .map(|h| {
                let hz = h as f32 * f[i];
                let m = (hz / other).round().max(1.0);
                (hz - m * other).abs() / bin_hz < OVERLAP_BIN
            })
            .collect();
        let near = |h: usize, step: isize| {
            let mut j = h as isize + step;
            while j >= 0 && (j as usize) < n {
                if !overlapped[j as usize] {
                    return Some((j as usize, raw[j as usize]));
                }
                j += step;
            }
            None
        };
        voices[i].amps = (0..n)
            .map(|h| {
                if !overlapped[h] {
                    return raw[h];
                }
                let guess = match (near(h, -1), near(h, 1)) {
                    (Some((a, x)), Some((b, y))) => x + (y - x) * (h - a) as f32 / (b - a) as f32,
                    (Some((_, x)), None) | (None, Some((_, x))) => x,
                    // すべて重なる（8 度の高い方）: 今までどおり滑らかさで抑えた値
                    (None, None) => voices[i].amps[h],
                };
                guess.min(raw[h])
            })
            .collect();
    }
}

/// 重なったとみなす倍音どうしの距離（ビン）
const OVERLAP_BIN: f32 = 1.5;

/// 各フレームの声を A・B に振り分ける
fn assign(frames: &[Vec<Voice>], by: SplitBy) -> Vec<(Option<Voice>, Option<Voice>)> {
    // 前のフレームの F0 に近い方へつなぐ（2 つの軌跡）
    let mut tracks: Vec<[Option<Voice>; 2]> = Vec::with_capacity(frames.len());
    let mut last = [0.0f32; 2];
    for v in frames {
        let dist = |f: f32, l: f32| if l > 0.0 { (f / l).log2().abs() } else { 0.5 };
        let mut slot: [Option<Voice>; 2] = [None, None];
        match v.len() {
            0 => {}
            1 => {
                let i = if dist(v[0].f0, last[0]) <= dist(v[0].f0, last[1]) { 0 } else { 1 };
                slot[i] = Some(v[0].clone());
            }
            _ => {
                let keep = dist(v[0].f0, last[0]) + dist(v[1].f0, last[1]);
                let swap = dist(v[0].f0, last[1]) + dist(v[1].f0, last[0]);
                let (a, b) = if keep <= swap { (0, 1) } else { (1, 0) };
                slot = [Some(v[a].clone()), Some(v[b].clone())];
            }
        }
        for i in 0..2 {
            if let Some(s) = &slot[i] {
                last[i] = s.f0;
            }
        }
        tracks.push(slot);
    }
    let energy: Vec<[f32; 2]> = tracks.iter().map(|t| [0, 1].map(|i| t[i].as_ref().map_or(0.0, |v| v.energy()))).collect();
    (0..tracks.len())
        .map(|f| {
            let [s0, s1] = tracks[f].clone();
            let first_is_a = match by {
                SplitBy::Pitch => match (&s0, &s1) {
                    (Some(a), Some(b)) => a.f0 >= b.f0,
                    _ => last_pitch_order(&tracks, f),
                },
                SplitBy::Volume => {
                    let r = f.saturating_sub(SMOOTH)..(f + SMOOTH + 1).min(tracks.len());
                    let e0: f32 = energy[r.clone()].iter().map(|e| e[0]).sum();
                    let e1: f32 = energy[r].iter().map(|e| e[1]).sum();
                    e0 >= e1
                }
            };
            if first_is_a { (s0, s1) } else { (s1, s0) }
        })
        .collect()
}

/// 1 声のフレームで、軌跡 0 を高い方とみなすか（最も近い 2 声のフレームの上下に合わせる）
fn last_pitch_order(tracks: &[[Option<Voice>; 2]], f: usize) -> bool {
    let both = |t: &[Option<Voice>; 2]| match t {
        [Some(a), Some(b)] => Some(a.f0 >= b.f0),
        _ => None,
    };
    (1..tracks.len())
        .find_map(|d| f.checked_sub(d).and_then(|i| both(&tracks[i])).or_else(|| tracks.get(f + d).and_then(both)))
        .unwrap_or(true)
}

/// ビンごとの A の割合
fn mask_a(a: Option<&Voice>, b: Option<&Voice>, bins: usize, bin_hz: f32) -> Vec<f32> {
    let model = |v: Option<&Voice>| {
        let mut e = vec![0.0f32; bins];
        if let Some(v) = v {
            for (h, amp) in v.amps.iter().enumerate() {
                let c = (h + 1) as f32 * v.f0 / bin_hz;
                for k in (c - 2.0).max(0.0).ceil() as usize..=((c + 2.0) as usize).min(bins - 1) {
                    e[k] += amp * lobe(k as f32 - c);
                }
            }
        }
        e
    };
    let (ea, eb) = (model(a), model(b));
    let (pa, pb) = (a.map_or(0.0, |v| v.energy()), b.map_or(0.0, |v| v.energy()));
    // 倍音から離れたビンは、両声の大きさの比で分ける
    let share = if pa + pb > 0.0 { pa / (pa + pb) } else { 0.5 };
    let delta = ea.iter().chain(&eb).fold(0.0f32, |m, &e| m.max(e * e)) * 1e-3 + 1e-12;
    (0..bins).map(|k| (ea[k] * ea[k] + share * delta) / (ea[k] * ea[k] + eb[k] * eb[k] + delta)).collect()
}

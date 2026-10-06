//! 声の素材から一音を作る（試験的。memo/kana-voice.md）。今は母音だけ。
//!
//! 素材の母音から、F0 とその揺れ、響き（LPC の包絡）、かすれ（周期的でない成分の割合）を測り（`analyze_vowel`）、
//! 指定の高さと長さで作り直す（`synth_vowel`）。声帯の音は F0 の倍音の和と雑音で作り、響きの全極フィルターを掛ける。
//! 素材の波形を伸ばすのではなく作り直すので、高さを変えても響き（母音らしさ）は変わらない。

use wevocal_lib::f0;
use wevocal_lib::lpc;
use wevocal_lib::window::hann;

/// プリエンファシスの係数（分析の前に高域を持ち上げ、合成のあとで戻す）
const PRE: f32 = 0.97;
/// 分析のフレーム長（秒）
const FRAME_SEC: f32 = 0.03;
/// かすれの雑音の割合の範囲（測った値をこの範囲に収める）
const NOISE_MIN: f32 = 0.02;
const NOISE_MAX: f32 = 0.5;
/// LPC を安定させるラグ窓の幅（Hz）と、雑音の床（自己相関の 0 番目に足す割合）
const LAG_WINDOW_HZ: f64 = 50.0;
const NOISE_FLOOR: f64 = 1e-4;
/// 作った音の両端のフェード（秒）
const FADE_SEC: f32 = 0.01;

/// 素材の母音から測ったもの
#[derive(Clone, Debug)]
pub struct VowelModel {
    /// 分析したサンプルレート（合成もこのサンプルレートで行う）
    pub sample_rate: f32,
    /// F0 の中央値（Hz）
    pub f0: f32,
    /// F0 の揺れ（中央値からのずれ、セント。f0::HOP_SEC ごと）。作るときに繰り返し使う
    pub wobble: Vec<f32>,
    /// 響き（LPC 係数。プリエンファシスした信号のもの）
    pub lpc: Vec<f32>,
    /// かすれ（雑音の割合、0〜1）
    pub noise: f32,
    /// 素材の母音の大きさ（RMS）
    pub rms: f32,
}

/// LPC の次数（サンプルレートの kHz ＋ 4。高いサンプルレートでは上限を設ける）
fn order_for(sample_rate: f32) -> usize {
    ((sample_rate / 1000.0) as usize + 4).min(48)
}

/// 素材の母音（モノラル）を分析する。声のあるフレームがなければ None
pub fn analyze_vowel(x: &[f32], sample_rate: f32) -> Option<VowelModel> {
    let f0s = f0::estimate(x, sample_rate, &mut |_| {});
    let voiced: Vec<(usize, f32)> = f0s.iter().copied().enumerate().filter(|&(_, hz)| hz > 0.0).collect();
    if voiced.is_empty() {
        return None;
    }
    let mut sorted: Vec<f32> = voiced.iter().map(|&(_, hz)| hz).collect();
    sorted.sort_by(|a, b| a.total_cmp(b));
    let median = sorted[sorted.len() / 2];
    let wobble = voiced.iter().map(|&(_, hz)| 1200.0 * (hz / median).log2()).collect();

    // 声のあるフレームの自己相関を平均し、1 つの LPC にする（フレームごとの揺れをならす）
    let order = order_for(sample_rate);
    let n = (FRAME_SEC * sample_rate) as usize;
    let window = hann(n);
    let hop = f0::HOP_SEC * sample_rate;
    let mut acc = vec![0.0f64; order + 1];
    let mut periodic = 0.0f64;
    let mut frames = 0usize;
    let mut frame = vec![0.0f32; n];
    for &(k, hz) in &voiced {
        let start = (k as f32 * hop) as i64 - (n / 2) as i64;
        if start < 1 || start as usize + n > x.len() {
            continue;
        }
        let s = start as usize;
        for i in 0..n {
            frame[i] = (x[s + i] - PRE * x[s + i - 1]) * window[i];
        }
        let r0: f64 = frame.iter().map(|&v| v as f64 * v as f64).sum();
        if r0 < 1e-8 {
            continue;
        }
        for (lag, v) in acc.iter_mut().enumerate() {
            *v += frame[lag..].iter().zip(&frame).map(|(&a, &b)| a as f64 * b as f64).sum::<f64>() / r0;
        }
        // 周期の位置の自己相関（元の信号）で、周期的な成分の割合を見る
        let period = (sample_rate / hz).round() as usize;
        if period < n {
            let seg = &x[s..s + n];
            let e: f64 = seg.iter().map(|&v| v as f64 * v as f64).sum();
            let c: f64 = seg[period..].iter().zip(seg).map(|(&a, &b)| a as f64 * b as f64).sum();
            if e > 0.0 {
                periodic += (c / e * n as f64 / (n - period) as f64).clamp(0.0, 1.0);
            }
        }
        frames += 1;
    }
    if frames == 0 {
        return None;
    }
    // 平均した自己相関から、Levinson-Durbin で係数を求める（lpc::lpc と同じ計算を、自己相関から行う）。
    // 雑音の少ない音を高い次数で解くと不安定になるので、ラグ窓で山の幅を少し広げ、0 番目を少し大きくする（雑音の床）
    let r: Vec<f64> = acc
        .iter()
        .enumerate()
        .map(|(k, &v)| {
            let lag = std::f64::consts::TAU * LAG_WINDOW_HZ * k as f64 / sample_rate as f64;
            v / frames as f64 * (-0.5 * lag * lag).exp() * if k == 0 { 1.0 + NOISE_FLOOR } else { 1.0 }
        })
        .collect();
    let a = levinson(&r)?;
    let rms = (x.iter().map(|&v| v as f64 * v as f64).sum::<f64>() / x.len() as f64).sqrt() as f32;
    let noise = (1.0 - (periodic / frames as f64) as f32).clamp(NOISE_MIN, NOISE_MAX);
    Some(VowelModel { sample_rate, f0: median, wobble, lpc: a, noise, rms })
}

/// 自己相関 r[0..=order] から LPC 係数を求める
fn levinson(r: &[f64]) -> Option<Vec<f32>> {
    // lpc::lpc は信号から自己相関を作るので、自己相関から始める版をここに置く
    let order = r.len() - 1;
    let mut a = vec![0.0f64; order + 1];
    a[0] = 1.0;
    let mut err = r[0];
    if err <= 0.0 {
        return None;
    }
    for i in 1..=order {
        let acc: f64 = (1..i).map(|j| a[j] * r[i - j]).sum();
        let k = -(r[i] + acc) / err;
        let prev = a.clone();
        for j in 1..i {
            a[j] = prev[j] + k * prev[i - j];
        }
        a[i] = k;
        err *= 1.0 - k * k;
        if err <= 0.0 {
            return None;
        }
    }
    Some(a.iter().map(|&v| v as f32).collect())
}

/// 母音を、高さ `f0`（Hz）と長さ `dur`（秒）で作る。サンプルレートは素材のもの
pub fn synth_vowel(m: &VowelModel, f0: f32, dur: f32) -> Vec<f32> {
    let sr = m.sample_rate;
    let len = (dur * sr) as usize;
    if len == 0 {
        return Vec::new();
    }
    let hop = f0::HOP_SEC * sr;
    let nyquist = sr / 2.0;
    // 声帯の音: F0 の倍音の和（帯域を限るので折り返さない）と、かすれの雑音。素材の揺れを繰り返して使う
    let mut src = vec![0.0f32; len];
    let mut phase = 0.0f64;
    let mut seed = 0x1234_5678u32;
    for (i, v) in src.iter_mut().enumerate() {
        let w = if m.wobble.is_empty() { 0.0 } else { m.wobble[(i as f32 / hop) as usize % m.wobble.len()] };
        let hz = f0 * 2f32.powf(w / 1200.0);
        phase += std::f64::consts::TAU * hz as f64 / sr as f64;
        let harmonics = (nyquist / hz) as usize;
        let mut s = 0.0f32;
        for k in 1..=harmonics {
            s += (phase * k as f64).cos() as f32;
        }
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        let noise = (seed >> 9) as f32 / (1u32 << 23) as f32 - 0.5;
        // 倍音の和は大きさが倍音の数に比例するので、数でならしてから雑音と混ぜる
        *v = (1.0 - m.noise) * s / (harmonics as f32).sqrt() + m.noise * noise * 2.0;
    }
    // 響き（全極フィルター）を掛け、プリエンファシスを戻す
    let mut out = vec![0.0f32; len];
    lpc::synthesize(&m.lpc, &src, &mut vec![0.0; m.lpc.len() - 1], &mut out);
    let mut prev = 0.0f32;
    for v in out.iter_mut() {
        *v += PRE * prev;
        prev = *v;
    }
    // 大きさを素材にそろえ、両端をフェードする
    let rms = (out.iter().map(|&v| v as f64 * v as f64).sum::<f64>() / len as f64).sqrt() as f32;
    let gain = if rms > 0.0 { m.rms / rms } else { 0.0 };
    let fade = ((FADE_SEC * sr) as usize).min(len / 2).max(1);
    for (i, v) in out.iter_mut().enumerate() {
        let edge = (i.min(len - 1 - i) as f32 / fade as f32).min(1.0);
        *v *= gain * edge;
    }
    out
}

/// 日本語の母音。並びは あ、い、う、え、お
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Vowel {
    A,
    I,
    U,
    E,
    O,
}
pub const VOWELS: [Vowel; 5] = [Vowel::A, Vowel::I, Vowel::U, Vowel::E, Vowel::O];

/// 日本語の母音の F1〜F3（Hz）の目安。男声と女声で母音ごとに比が違う（一律の倍率ではない）ので、表を分けて持つ。
/// F1、F2 は川端豪「音声の基礎」（関西学院大学の講義資料）の表。F3 はその資料にないので、男声は一般的な目安、女声はその 1.15 倍（推定）
fn standard_formants(v: Vowel, female: bool) -> [f32; 3] {
    let [f1, f2, f3] = match (v, female) {
        (Vowel::A, false) => [700.0, 1400.0, 2500.0],
        (Vowel::I, false) => [300.0, 2500.0, 3000.0],
        (Vowel::U, false) => [300.0, 1000.0, 2400.0],
        (Vowel::E, false) => [500.0, 1600.0, 2500.0],
        (Vowel::O, false) => [500.0, 1000.0, 2500.0],
        (Vowel::A, true) => [900.0, 1800.0, 2500.0],
        (Vowel::I, true) => [400.0, 2700.0, 3000.0],
        (Vowel::U, true) => [400.0, 1200.0, 2400.0],
        (Vowel::E, true) => [500.0, 2200.0, 2500.0],
        (Vowel::O, true) => [500.0, 1200.0, 2500.0],
    };
    [f1, f2, if female { f3 * 1.15 } else { f3 }]
}

/// 男声と女声の表を `w`（0 が男声、1 が女声）で混ぜた F1〜F3（周波数なので対数で混ぜる）
fn mixed_formants(v: Vowel, w: f32) -> [f32; 3] {
    let (m, f) = (standard_formants(v, false), standard_formants(v, true));
    [0, 1, 2].map(|i| m[i].powf(1.0 - w) * f[i].powf(w))
}

/// 測った F1〜F3（母音 `v`）が、男声と女声の表のどちらに近いか（0 が男声、1 が女声。対数の距離の比）
fn female_weight(measured: &[f32], v: Vowel) -> f32 {
    let dist = |t: [f32; 3]| (0..3).map(|i| (measured[i] / t[i]).ln().abs()).sum::<f32>();
    let (dm, df) = (dist(standard_formants(v, false)), dist(standard_formants(v, true)));
    if dm + df > 0.0 { dm / (dm + df) } else { 0.5 }
}


/// 響きを動かす STFT の長さとホップ（サンプル。44.1kHz で約 23ms と 6ms。長いと声帯の細かな揺れがぼやけ、声質が変わる）
const MORPH_FFT: usize = 1024;
const MORPH_HOP: usize = 256;
/// 包絡の比で掛ける大きさの上限（dB。極端に強めたり弱めたりしない）と、ならすフレームの数（前後それぞれ）
const MORPH_MAX_DB: f32 = 30.0;
const MORPH_SMOOTH: usize = 2;

/// 響きを見るサンプルレート（Hz）と LPC の次数。F3 くらいまで（約 5.5kHz）を細かく見る（Analyzer のフォルマント推定と同じ考え方）
const ENV_RATE: f32 = 11025.0;
const ENV_ORDER: usize = 14;
/// 響きを動かす上限（Hz）。これより上はそのまま残し、MORPH_TOP_HZ〜ENV_RATE / 2 でなめらかにつなぐ
const MORPH_TOP_HZ: f32 = 4500.0;

/// 間引いた音 `y` の、時刻 `center`（秒）を中心にしたフレームの LPC 係数と包絡（プリエンファシスあり。包絡は 0〜ENV_RATE / 2 を `bins` 点）。無音なら None
fn frame_envelope(y: &[f32], center: f32, n: usize, window: &[f32], bins: usize) -> Option<(Vec<f32>, Vec<f32>)> {
    let start = (center * ENV_RATE) as i64 - (n / 2) as i64;
    let at = |j: i64| if j >= 0 && (j as usize) < y.len() { y[j as usize] } else { 0.0 };
    let frame: Vec<f32> = (0..n).map(|i| (at(start + i as i64) - PRE * at(start + i as i64 - 1)) * window[i]).collect();
    let (a, _) = lpc::lpc(&frame, ENV_ORDER)?;
    let env = lpc::envelope(&a, bins);
    Some((a, env))
}

/// 複素数（多項式の根を求めるためだけのもの）
#[derive(Clone, Copy)]
struct C(f64, f64);
impl C {
    fn mul(self, o: C) -> C {
        C(self.0 * o.0 - self.1 * o.1, self.0 * o.1 + self.1 * o.0)
    }
    fn sub(self, o: C) -> C {
        C(self.0 - o.0, self.1 - o.1)
    }
    fn div(self, o: C) -> C {
        let d = o.0 * o.0 + o.1 * o.1 + 1e-300;
        C((self.0 * o.0 + self.1 * o.1) / d, (self.1 * o.0 - self.0 * o.1) / d)
    }
    fn abs(self) -> f64 {
        self.0.hypot(self.1)
    }
    fn arg(self) -> f64 {
        self.1.atan2(self.0)
    }
}

/// A(z) = a[0] + a[1] z^-1 + … の極（z^order A(z) の根）。Durand-Kerner 法ですべての根を同時に求める
fn poles(a: &[f32]) -> Vec<C> {
    let n = a.len() - 1;
    // 最高次の係数を 1 にした多項式 z^n + c[1] z^(n-1) + … + c[n]
    let c: Vec<f64> = a.iter().map(|&v| v as f64 / a[0] as f64).collect();
    let eval = |z: C| c.iter().fold(C(0.0, 0.0), |acc, &k| C(acc.mul(z).0 + k, acc.mul(z).1));
    // 初期値は単位円の少し内側に、等しくない角度で並べる
    let mut r: Vec<C> = (0..n).map(|i| {
        let t = 0.4 + std::f64::consts::TAU * i as f64 / n as f64;
        C(0.9 * t.cos(), 0.9 * t.sin())
    }).collect();
    for _ in 0..200 {
        let mut moved = 0.0f64;
        for i in 0..n {
            let mut den = C(1.0, 0.0);
            for j in 0..n {
                if i != j {
                    den = den.mul(r[i].sub(r[j]));
                }
            }
            let step = eval(r[i]).div(den);
            r[i] = r[i].sub(step);
            moved = moved.max(step.abs());
        }
        if moved < 1e-12 {
            break;
        }
    }
    r
}

/// 極から A(z) の係数を作り直す（共役の対がそろっているので、係数は実数）
fn from_poles(p: &[C]) -> Vec<f32> {
    let mut c = vec![C(1.0, 0.0)];
    for &z in p {
        // (1 - z w^-1) を掛ける
        let mut next = vec![C(0.0, 0.0); c.len() + 1];
        for (i, &v) in c.iter().enumerate() {
            next[i] = C(next[i].0 + v.0, next[i].1 + v.1);
            let t = v.mul(z);
            next[i + 1] = next[i + 1].sub(t);
        }
        c = next;
    }
    c.iter().map(|v| v.0 as f32).collect()
}

/// F1〜F3 とみなす極の条件: 周波数の範囲（Hz）と、帯域幅の上限（Hz）
const FORMANT_POLE_MIN_HZ: f32 = 150.0;
const FORMANT_POLE_MAX_HZ: f32 = 5000.0;
const FORMANT_POLE_MAX_BW: f32 = 600.0;
/// 極を鋭くしすぎない帯域幅の下限（Hz。実際の声のフォルマントの帯域幅はおよそ 60〜150Hz）。鋭すぎる山を谷の位置へ動かすと、比が極端に大きくなるため
const MIN_POLE_BW: f32 = 80.0;

/// フレームの LPC の極のうち、F1〜F3 にあたるもの（低い方から 3 つ）だけを動かした係数。
/// それぞれ `src`（素材の F1〜F3 の中央値）からのずれの比を保って、`tgt`（目標の F1〜F3）へ置く。ほかの極は動かさない。
/// 極の帯域幅は MIN_POLE_BW より狭くしない。F1〜F3 が 3 つ見つからなければ None
fn shift_formants(a: &[f32], rate: f32, src: &[f32], tgt: &[f32]) -> Option<Vec<f32>> {
    let to_hz = rate as f64 / std::f64::consts::TAU;
    let min_r = (-std::f64::consts::PI * MIN_POLE_BW as f64 / rate as f64).exp();
    let mut p = poles(a);
    // 上半分（虚部が正）の極のうち、F1〜F3 の条件に合うもの
    let mut cand: Vec<usize> = (0..p.len())
        .filter(|&i| {
            let z = p[i];
            let hz = (z.arg() * to_hz) as f32;
            let bw = (-(z.abs().ln()) * rate as f64 / std::f64::consts::PI) as f32;
            z.1 > 1e-9 && hz > FORMANT_POLE_MIN_HZ && hz < FORMANT_POLE_MAX_HZ && bw < FORMANT_POLE_MAX_BW
        })
        .collect();
    cand.sort_by(|&i, &j| p[i].arg().total_cmp(&p[j].arg()));
    if cand.len() < 3 {
        return None;
    }
    for (k, &i) in cand.iter().take(3).enumerate() {
        let z = p[i];
        let hz = (z.arg() * to_hz) as f32;
        let new_hz = tgt[k] * (hz / src[k]);
        let ang = (new_hz as f64 / to_hz).min(std::f64::consts::PI - 1e-3);
        let m = z.abs().min(min_r);
        p[i] = C(m * ang.cos(), m * ang.sin());
        // 共役の極（下半分）も同じに動かす。いちばん近いものを探す
        if let Some(j) = (0..p.len()).filter(|&j| p[j].1 < -1e-9).min_by(|&j, &l| {
            let d = |q: C| (q.0 - z.0).hypot(q.1 + z.1);
            d(p[j]).total_cmp(&d(p[l]))
        }) {
            p[j] = C(m * ang.cos(), -m * ang.sin());
        }
    }
    Some(from_poles(&p))
}

/// 包絡の山（低い方から 3 つ、Hz）。200Hz〜4500Hz の間で探す
fn peaks(env: &[f32], sample_rate: f32) -> Vec<f32> {
    let hz = |g: usize| g as f32 / (env.len() - 1) as f32 * sample_rate / 2.0;
    (1..env.len() - 1).filter(|&g| env[g] > env[g - 1] && env[g] >= env[g + 1] && hz(g) > 200.0 && hz(g) < 4500.0).map(hz).take(3).collect()
}

/// 掛ける大きさ（dB、周波数の順）から、全体の傾き（周波数に対する一次の直線）を引く。
/// 極を動かすと包絡全体の傾きも変わり、声の明るさや息の多さ（声質）まで変わってしまうので、山の位置の変化だけを残す
fn remove_tilt(db: &[f32]) -> Vec<f32> {
    let n = db.len() as f32;
    let mx = (n - 1.0) / 2.0;
    let my = db.iter().sum::<f32>() / n;
    let (mut sxy, mut sxx) = (0.0f32, 0.0f32);
    for (i, &y) in db.iter().enumerate() {
        let dx = i as f32 - mx;
        sxy += dx * (y - my);
        sxx += dx * dx;
    }
    let slope = if sxx > 0.0 { sxy / sxx } else { 0.0 };
    db.iter().enumerate().map(|(i, &y)| y - (my + slope * (i as f32 - mx))).collect()
}

/// 素材の母音 `from` を、母音 `to` に作り替える（声帯の音はそのまま、響きの山の位置だけを動かす）。
/// 素材のフレームごとの LPC の極のうち F1〜F3 にあたるものを、目標の F1〜F3 へ動かし（そのフレームのずれの比と、極の鋭さは保つ）、
/// 元の包絡との比（±MORPH_MAX_DB、前後のフレームでならす）を掛ける。
/// 目標の F1〜F3 は、男声と女声の表を素材の声に合わせて混ぜた値に、残りの個人差の倍率を掛けたもの
pub fn morph_vowel(x: &[f32], sample_rate: f32, from: Vowel, to: Vowel) -> Vec<f32> {
    let mut st = wevocal_lib::stft::Stft::new(MORPH_FFT, MORPH_HOP);
    let bins = st.bins();
    let frames = x.len() / MORPH_HOP + 1;
    // 響きは間引いた音で見る（フレームの長さは同じ時間）
    let ratio = (sample_rate / ENV_RATE) as f64;
    let y = if ratio > 1.0 { wevocal_lib::resample(x, ratio, (x.len() as f64 / ratio) as usize) } else { x.to_vec() };
    let env_rate = if ratio > 1.0 { ENV_RATE } else { sample_rate };
    let n_low = ((MORPH_FFT as f32 * env_rate / sample_rate) as usize).max(64);
    let env_bins = 257;
    let window_low = hann(n_low);
    let envs: Vec<Option<(Vec<f32>, Vec<f32>)>> = (0..frames)
        .map(|k| frame_envelope(&y, (k * MORPH_HOP + MORPH_FFT / 2) as f32 / sample_rate, n_low, &window_low, env_bins))
        .collect();
    // 素材の F1〜F3（声のあるフレームの中央値）
    let found: Vec<Vec<f32>> = envs.iter().flatten().map(|(_, e)| peaks(e, env_rate)).filter(|p| p.len() == 3).collect();
    if found.is_empty() {
        return x.to_vec();
    }
    let src: Vec<f32> = (0..3)
        .map(|i| {
            let mut v: Vec<f32> = found.iter().map(|p| p[i]).collect();
            v.sort_by(|a, b| a.total_cmp(b));
            v[v.len() / 2]
        })
        .collect();
    // 男声と女声の表を、元にした母音の測った値に近いほうへ混ぜ、残りの個人差を倍率で掛ける
    let w = female_weight(&src, from);
    let std_from = mixed_formants(from, w);
    let scale = (0..3).map(|i| src[i] / std_from[i]).sum::<f32>() / 3.0;
    let tgt: Vec<f32> = mixed_formants(to, w).iter().map(|f| f * scale).collect();
    let nyq = sample_rate / 2.0;
    let bin_hz = nyq / (bins - 1) as f32;
    let env_nyq = env_rate / 2.0;
    // 包絡の値（周波数 Hz を、間引いた音の包絡の点に直して一次補間）
    let env_at = |env: &[f32], hz: f32| {
        let p = (hz / env_nyq * (env.len() - 1) as f32).clamp(0.0, (env.len() - 1) as f32);
        let (i0, g) = (p.floor() as usize, p.fract());
        env[i0] + (env[(i0 + 1).min(env.len() - 1)] - env[i0]) * g
    };
    // フレームごとの、目標の包絡 ÷ 元の包絡（dB、±MORPH_MAX_DB）。F1〜F3 が見つからないフレームは動かさない
    let raw: Vec<Option<Vec<f32>>> = envs
        .iter()
        .map(|e| {
            let (a, env) = e.as_ref()?;
            let target = lpc::envelope(&shift_formants(a, env_rate, &src, &tgt)?, env.len());
            let db: Vec<f32> = env.iter().zip(&target).map(|(e, t)| 10.0 * (t / e.max(1e-12)).log10()).collect();
            Some(remove_tilt(&db).into_iter().map(|g| g.clamp(-MORPH_MAX_DB, MORPH_MAX_DB)).collect())
        })
        .collect();
    // 前後のフレームと平均して、フレームごとの揺れをならす（F1〜F3 が見つからないフレームは数に入れない）
    let gains: Vec<Option<Vec<f32>>> = (0..raw.len())
        .map(|k| {
            raw[k].as_ref()?;
            let near: Vec<&Vec<f32>> = (k.saturating_sub(MORPH_SMOOTH)..=(k + MORPH_SMOOTH).min(raw.len() - 1)).filter_map(|j| raw[j].as_ref()).collect();
            let len = raw[k].as_ref().unwrap().len();
            Some((0..len).map(|i| near.iter().map(|g| g[i]).sum::<f32>() / near.len() as f32).collect())
        })
        .collect();
    let mut out = vec![0.0f32; x.len() + MORPH_FFT];
    let mut wsum = vec![0.0f32; x.len() + MORPH_FFT];
    let (mut re, mut im) = (vec![0.0f32; bins], vec![0.0f32; bins]);
    for k in 0..envs.len() {
        st.forward(x, k, &mut re, &mut im);
        if let Some(gains) = &gains[k] {
            for b in 0..bins {
                let hz = b as f32 * bin_hz;
                if hz >= env_nyq {
                    continue;
                }
                // 目標の包絡 ÷ 元の包絡 の大きさ（dB をならしたもの）を掛ける。上のほうはなめらかに 1 に戻す
                let gain = 10f32.powf(env_at(gains, hz) / 20.0);
                let blend = ((env_nyq - hz) / (env_nyq - MORPH_TOP_HZ)).clamp(0.0, 1.0);
                let g = 1.0 + (gain - 1.0) * blend;
                re[b] *= g;
                im[b] *= g;
            }
        }
        st.inverse_add(&re, &im, k, &mut out, Some(&mut wsum));
    }
    out.truncate(x.len());
    for (v, w) in out.iter_mut().zip(&wsum) {
        if *w > 1e-6 {
            *v /= w;
        }
    }
    // 大きさを素材にそろえる
    let rms = |v: &[f32]| (v.iter().map(|&s| s as f64 * s as f64).sum::<f64>() / v.len().max(1) as f64).sqrt() as f32;
    let g = rms(x) / rms(&out).max(1e-9);
    out.iter_mut().for_each(|v| *v *= g);
    out
}

/// 試し: 素材の母音（`from`）から、あいうえおの 5 つを作って並べる（間に 0.2 秒の無音）。声帯の音は素材のまま、響きだけを動かす
pub fn morph_demo(x: &[f32], sample_rate: f32, from: Vowel) -> Vec<f32> {
    let gap = vec![0.0f32; (0.2 * sample_rate) as usize];
    let mut out = Vec::new();
    for to in VOWELS {
        out.extend(if to == from { x.to_vec() } else { morph_vowel(x, sample_rate, from, to) });
        out.extend_from_slice(&gap);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use wevocal_lib::resample;

    /// F0 `f0` の倍音を、3 つの共振（フォルマント）に通した母音
    fn vowel(sr: f32, f0: f32, sec: f32, formants: &[(f32, f32)]) -> Vec<f32> {
        let len = (sr * sec) as usize;
        let mut x: Vec<f32> = (0..len)
            .map(|i| {
                let t = i as f32 / sr;
                (1..((sr / 2.0 / f0) as usize)).map(|k| (std::f32::consts::TAU * f0 * k as f32 * t).cos()).sum::<f32>() * 0.01
            })
            .collect();
        for &(f, bw) in formants {
            let r = (-std::f32::consts::PI * bw / sr).exp();
            let c = 2.0 * r * (std::f32::consts::TAU * f / sr).cos();
            let (mut y1, mut y2) = (0.0f32, 0.0f32);
            for v in x.iter_mut() {
                let y = *v + c * y1 - r * r * y2;
                y2 = y1;
                y1 = y;
                *v = y;
            }
        }
        let peak = x.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        x.iter().map(|v| v / peak * 0.5).collect()
    }

    /// LPC の包絡の山（低い方から 3 つ、Hz）。11025Hz に間引いて次数 13 で見る（Analyzer のフォルマント推定と同じ考え方）
    fn formants_of(x: &[f32], sr: f32) -> Vec<f32> {
        let ratio = (sr / 11025.0) as f64;
        let y = resample(x, ratio, (x.len() as f64 / ratio) as usize);
        let mid = y.len() / 2;
        let w = hann(300);
        let frame: Vec<f32> = (0..300).map(|i| (y[mid + i] - PRE * y[mid + i - 1]) * w[i]).collect();
        let (a, _) = lpc::lpc(&frame, 13).unwrap();
        let env = lpc::envelope(&a, 512);
        (1..511).filter(|&g| env[g] > env[g - 1] && env[g] >= env[g + 1]).map(|g| g as f32 / 511.0 * 11025.0 / 2.0).filter(|&hz| hz > 150.0).take(3).collect()
    }

    /// 素材の母音（F0 150Hz）を分析し、別の高さ（220Hz）で作り直しても、フォルマントの位置が近いこと
    #[test]
    fn keeps_formants_at_new_pitch() {
        let sr = 44100.0;
        let target = [(700.0f32, 80.0f32), (1200.0, 90.0), (2600.0, 120.0)];
        let x = vowel(sr, 150.0, 0.6, &target);
        let m = analyze_vowel(&x, sr).expect("voiced");
        assert!((m.f0 - 150.0).abs() < 5.0, "f0 {}", m.f0);
        let y = synth_vowel(&m, 220.0, 0.5);
        let got = formants_of(&y, sr);
        assert_eq!(got.len(), 3, "got {got:?}");
        for (g, (want, _)) in got.iter().zip(target) {
            assert!((g - want).abs() < want * 0.12, "got {got:?}");
        }
        // 大きさは素材とそろう
        let rms = (y.iter().map(|&v| v * v).sum::<f32>() / y.len() as f32).sqrt();
        assert!((rms / m.rms - 1.0).abs() < 0.2, "rms {rms} vs {}", m.rms);
    }

    /// 標準の「あ」のフォルマントの合成の母音から「い」を作ると、フォルマントが「い」の位置に近づくこと
    #[test]
    fn morphs_a_to_i() {
        let sr = 44100.0;
        let x = vowel(sr, 140.0, 0.8, &[(800.0, 80.0), (1200.0, 90.0), (2500.0, 120.0)]);
        let y = morph_vowel(&x, sr, Vowel::A, Vowel::I);
        let got = formants_of(&y, sr);
        assert!(got.len() >= 2, "got {got:?}");
        // F1 は下がり（800 → 300 付近）、F2 は上がる（1200 → 2300 付近）
        assert!(got[0] < 500.0, "F1 {got:?}");
        assert!(got.iter().any(|&f| (f - 2300.0).abs() < 350.0), "F2 {got:?}");
    }

    /// 診断（手動）: 実際の声のサンプルで、極の計算が正しいか、掛ける大きさがどうなっているかを出す
    /// cargo test --release --manifest-path dsp/Cargo.toml diagnose_morph -- --ignored --nocapture
    #[test]
    #[ignore]
    fn diagnose_morph() {
        let path = std::env::var("KANA_WAV").unwrap_or_else(|_| "../sample/HIKAKIN Bad Apple!! BPM138_raw.wav".into());
        let b = std::fs::read(&path).expect("wav");
        let (mut p, mut ch, mut sr, mut data) = (12usize, 1usize, 44100.0f32, &b[0..0]);
        while p + 8 <= b.len() {
            let id = &b[p..p + 4];
            let sz = u32::from_le_bytes(b[p + 4..p + 8].try_into().unwrap()) as usize;
            if id == b"fmt " {
                ch = u16::from_le_bytes([b[p + 10], b[p + 11]]) as usize;
                sr = u32::from_le_bytes(b[p + 12..p + 16].try_into().unwrap()) as f32;
            }
            if id == b"data" {
                data = &b[p + 8..(p + 8 + sz).min(b.len())];
            }
            p += 8 + sz + (sz & 1);
        }
        let x: Vec<f32> = data.chunks_exact(2 * ch).map(|f| (0..ch).map(|c| i16::from_le_bytes([f[2 * c], f[2 * c + 1]]) as f32 / 32768.0).sum::<f32>() / ch as f32).collect();
        let ratio = (sr / ENV_RATE) as f64;
        let y = resample(&x, ratio, (x.len() as f64 / ratio) as usize);
        let n = 512;
        let w = hann(n);
        let (mut bad, mut total, mut worst) = (0, 0, 0.0f32);
        let mut prev: Option<Vec<f32>> = None;
        let mut jumps = Vec::new();
        let mut maxgain = Vec::new();
        for k in 0..(y.len() / 128) {
            let Some((a, env)) = frame_envelope(&y, k as f32 * 128.0 / ENV_RATE, n, &w, 257) else { continue };
            total += 1;
            let back = from_poles(&poles(&a));
            let err = a.iter().zip(&back).map(|(p, q)| (p - q).abs()).fold(0.0f32, f32::max);
            worst = worst.max(err);
            if err > 1e-2 {
                bad += 1;
            }
            // 「あ」→「い」へ動かしたときの包絡の比（dB。頭打ちにする前）
            let Some(moved) = shift_formants(&a, ENV_RATE, &[800.0, 1200.0, 2500.0], &[300.0, 2300.0, 3000.0]) else { continue };
            let tgt = lpc::envelope(&moved, 257);
            let g: Vec<f32> = env.iter().zip(&tgt).map(|(e, t)| 10.0 * (t / e.max(1e-12)).log10()).collect();
            maxgain.push(g.iter().fold(0.0f32, |m, v| m.max(v.abs())));
            if let Some(pg) = &prev {
                jumps.push(g.iter().zip(pg).map(|(a, b)| (a - b).abs()).fold(0.0f32, f32::max));
            }
            prev = Some(g);
        }
        let med = |v: &mut Vec<f32>| {
            v.sort_by(|a, b| a.total_cmp(b));
            (v[v.len() / 2], v[v.len() * 9 / 10], v[v.len() - 1])
        };
        eprintln!("frames {total}, root reconstruction bad {bad} (worst {worst:.3e})");
        eprintln!("max |gain| dB median/p90/max {:?}", med(&mut maxgain));
        eprintln!("frame-to-frame gain jump dB median/p90/max {:?}", med(&mut jumps));
    }

    /// 女声の「あ」の値なら女声の表に寄り、「え」の目標の F2 が男声の表（1600Hz）より女声の表（2200Hz）に近くなること
    #[test]
    fn female_voice_uses_female_table() {
        let w = female_weight(&[880.0, 1750.0, 2850.0], Vowel::A);
        assert!(w > 0.7, "w {w}");
        let e = mixed_formants(Vowel::E, w);
        assert!(e[1] > 2000.0, "F2 {}", e[1]);
        assert!(female_weight(&[690.0, 1420.0, 2480.0], Vowel::A) < 0.3);
    }

    #[test]
    fn silence_has_no_model() {
        assert!(analyze_vowel(&vec![0.0; 44100], 44100.0).is_none());
    }
}

//! wasm 向け C ABI。wasm-bindgen を使わず、Worker から素の `WebAssembly.instantiate` で呼べる関数だけを公開する。

use crate::{curve, f0, formant, process_with_progress, segment, tempo, voices, Algorithm, Formant};
use std::cell::RefCell;

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "env")]
extern "C" {
    /// ホスト（Worker）が `env.report_progress` として提供する。
    fn report_progress(p: f64);
}

fn host_progress(p: f64) {
    #[cfg(target_arch = "wasm32")]
    unsafe {
        report_progress(p)
    };
    #[cfg(not(target_arch = "wasm32"))]
    let _ = p;
}

thread_local! {
    static OUTPUT: RefCell<Vec<f32>> = const { RefCell::new(Vec::new()) };
}

/// フォルマント補正で速い対数・指数の近似を使うか（0 なら標準の関数）。Worker が処理の前に設定の値を入れる
#[no_mangle]
pub extern "C" fn set_fast_math(on: u32) {
    formant::set_fast_math(on != 0);
}

/// wasm メモリ上に f32 を `len` 個確保し、そのポインタを返す。
#[no_mangle]
pub extern "C" fn alloc_f32(len: usize) -> *mut f32 {
    let mut v = vec![0.0f32; len];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// `alloc_f32` で確保したメモリを解放する。
///
/// # Safety
/// `ptr`/`len` は1回の `alloc_f32` 呼び出しで得たものであること。
#[no_mangle]
pub unsafe extern "C" fn free_f32(ptr: *mut f32, len: usize) {
    drop(Vec::from_raw_parts(ptr, len, len));
}

/// プレーナー形式の音声（`frames` サンプルのブロックが `channels` 個）を処理し、
/// 出力フレーム数を返す。結果（プレーナー形式）は `output_ptr` で取得する。
///
/// # Safety
/// `input` は `frames * channels` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn process_planar(
    input: *const f32,
    frames: usize,
    channels: usize,
    sample_rate: f32,
    semitones: f64,
    stretch: f64,
    algorithm: u32,
    preserve_formant: u32,
    formant_semitones: f64,
) -> usize {
    let all = std::slice::from_raw_parts(input, frames * channels);
    let chans: Vec<&[f32]> = all.chunks(frames.max(1)).take(channels).collect();
    let out = process_with_progress(
        &chans,
        sample_rate,
        semitones,
        stretch,
        Algorithm::from_id(algorithm),
        if preserve_formant != 0 {
            Formant::Shift(formant_semitones)
        } else {
            Formant::Follow
        },
        &mut host_progress,
    );
    let out_frames = out.first().map_or(0, |c| c.len());
    OUTPUT.with(|o| {
        let mut o = o.borrow_mut();
        o.clear();
        for c in &out {
            o.extend_from_slice(c);
        }
    });
    out_frames
}

/// ピッチカーブ編集: `ratios`（`ratio_count` 個、`hop` サンプル間隔のピッチ比）に従って
/// プレーナー形式の音声を処理し、出力フレーム数（= `frames`）を返す。結果は `output_ptr` で取得する。
///
/// # Safety
/// `input` は `frames * channels` 個、`ratios` は `ratio_count` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn process_curve_planar(
    input: *const f32,
    frames: usize,
    channels: usize,
    sample_rate: f32,
    ratios: *const f32,
    ratio_count: usize,
    hop: f64,
    algorithm: u32,
    preserve_formant: u32,
    formant_semitones: f64,
) -> usize {
    let all = std::slice::from_raw_parts(input, frames * channels);
    let chans: Vec<&[f32]> = all.chunks(frames.max(1)).take(channels).collect();
    let ratios = std::slice::from_raw_parts(ratios, ratio_count);
    let formant = if preserve_formant != 0 {
        Formant::Shift(formant_semitones)
    } else {
        Formant::Follow
    };
    let out = curve::process(
        &chans,
        sample_rate,
        ratios,
        hop,
        Algorithm::from_id(algorithm),
        formant,
        &mut host_progress,
    );
    let out_frames = out.first().map_or(0, |c| c.len());
    OUTPUT.with(|o| {
        let mut o = o.borrow_mut();
        o.clear();
        for c in &out {
            o.extend_from_slice(c);
        }
    });
    out_frames
}

/// プレーナー形式の音声のフォルマントだけを、フレームごとの量（`shifts[k]` 半音、時刻 k × `hop` サンプル）だけずらす。
/// ピッチと長さは変えない。出力フレーム数（= `frames`）を返し、結果は `output_ptr` で取得する。
///
/// # Safety
/// `input` は `frames * channels` 個、`shifts` は `shift_count` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn formant_curve_planar(
    input: *const f32,
    frames: usize,
    channels: usize,
    sample_rate: f32,
    shifts: *const f32,
    shift_count: usize,
    hop: f64,
) -> usize {
    let all = std::slice::from_raw_parts(input, frames * channels);
    let shifts = std::slice::from_raw_parts(shifts, shift_count);
    // フレームの間は直線でつなぐ。包絡を E(c·f) にするので、st 半音上げるなら c = 2^(-st/12)
    let c_at = |i: usize| {
        if shifts.is_empty() || hop <= 0.0 {
            return 1.0;
        }
        let f = i as f64 / hop;
        let k = (f.floor() as usize).min(shifts.len() - 1);
        let k2 = (k + 1).min(shifts.len() - 1);
        let st = shifts[k] as f64 + (shifts[k2] as f64 - shifts[k] as f64) * (f - k as f64).clamp(0.0, 1.0);
        2f64.powf(-st / 12.0)
    };
    let count = channels.max(1) as f64;
    let mut out = Vec::with_capacity(frames * channels);
    for (ci, x) in all.chunks(frames.max(1)).take(channels).enumerate() {
        let y = formant::correct_varying(x, &c_at, sample_rate, &mut |p| host_progress((ci as f64 + p) / count));
        out.extend_from_slice(&y[..frames.min(y.len())]);
    }
    OUTPUT.with(|o| *o.borrow_mut() = out);
    frames
}

/// モノラル音声 `input`（`frames` サンプル）の F0 を `f0::HOP_SEC` 間隔で、設定（`f0::Params` の各値）に従って推定し、
/// 値の個数を返す。結果（Hz、無声は 0）は `output_ptr` で取得する。
///
/// # Safety
/// `input` は `frames` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn analyze_f0(
    input: *const f32,
    frames: usize,
    sample_rate: f32,
    min_hz: f32,
    max_hz: f32,
    voiced_limit: f32,
    silence_rms: f32,
) -> usize {
    let x = std::slice::from_raw_parts(input, frames);
    let params = f0::Params { min_hz, max_hz, voiced_limit, silence_rms };
    let out = f0::estimate_with(x, sample_rate, &params, &mut host_progress);
    let n = out.len();
    OUTPUT.with(|o| *o.borrow_mut() = out);
    n
}

/// モノラル音声のテンポを解析し、結果の値の個数を返す。結果は `output_ptr` で取得する:
/// [候補1の BPM, 強さ, 1拍目の位置（秒）, 候補2の BPM, …]（強い順）
///
/// # Safety
/// `input` は `frames` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn analyze_tempo(input: *const f32, frames: usize, sample_rate: f32) -> usize {
    let x = std::slice::from_raw_parts(input, frames);
    let env = tempo::onset_envelope(x, sample_rate, &mut host_progress);
    let out: Vec<f32> = tempo::estimate(&env, &mut host_progress)
        .iter()
        .flat_map(|c| [c.bpm as f32, c.strength as f32, c.offset as f32])
        .collect();
    let n = out.len();
    OUTPUT.with(|o| *o.borrow_mut() = out);
    n
}

/// 和音を 2 つの声に分け（試作。`by` は 0 = 高さ、1 = 音量）、フレーム数（= `frames`）を返す。
/// 結果は `output_ptr` で、A の全チャンネル、B の全チャンネルの順のプレーナー形式
///
/// # Safety
/// `input` は `frames * channels` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn split_voices_planar(input: *const f32, frames: usize, channels: usize, sample_rate: f32, by: u32) -> usize {
    let all = std::slice::from_raw_parts(input, frames * channels);
    let chans: Vec<&[f32]> = all.chunks(frames.max(1)).take(channels).collect();
    let by = if by == 1 { voices::SplitBy::Volume } else { voices::SplitBy::Pitch };
    let (a, b) = voices::split(&chans, sample_rate, by, &mut host_progress);
    OUTPUT.with(|o| {
        let mut o = o.borrow_mut();
        o.clear();
        for c in a.iter().chain(&b) {
            o.extend_from_slice(c);
        }
    });
    frames
}

/// 区間に分けて並列に加工するときの区間の数（`segment::plan`。試験的）
#[no_mangle]
pub extern "C" fn segment_count(frames: usize, sample_rate: f32) -> usize {
    segment::plan(frames, sample_rate).len()
}

/// 区間 `k` の境界（`field`: 0 = start、1 = end、2 = ctx_start、3 = ctx_end。入力のサンプル位置）
#[no_mangle]
pub extern "C" fn segment_bound(frames: usize, sample_rate: f32, k: usize, field: u32) -> usize {
    let s = segment::plan(frames, sample_rate)[k];
    [s.start, s.end, s.ctx_start, s.ctx_end][field.min(3) as usize]
}

/// 区間ごとに加工した音（区間の順、その中はチャンネルの順。各区間の長さは余白を含む範囲 × `stretch`）をつなぎ、
/// 出力のフレーム数を返す。結果（プレーナー形式）は `output_ptr` で取得する
///
/// # Safety
/// `input` は、区間ごとの長さの和 × `channels` 個の有効な f32 を指していること。
#[no_mangle]
pub unsafe extern "C" fn stitch_planar(input: *const f32, frames: usize, channels: usize, sample_rate: f32, stretch: f64) -> usize {
    let segs = segment::plan(frames, sample_rate);
    let lens: Vec<usize> = segs.iter().map(|s| ((s.ctx_end - s.ctx_start) as f64 * stretch).round() as usize).collect();
    let all = std::slice::from_raw_parts(input, lens.iter().sum::<usize>() * channels);
    let mut at = 0;
    let outs: Vec<Vec<Vec<f32>>> = lens
        .iter()
        .map(|&n| {
            (0..channels)
                .map(|_| {
                    let c = all[at..at + n].to_vec();
                    at += n;
                    c
                })
                .collect()
        })
        .collect();
    let out = segment::stitch(&segs, &outs, frames, stretch, sample_rate);
    let out_frames = out.first().map_or(0, |c| c.len());
    OUTPUT.with(|o| {
        let mut o = o.borrow_mut();
        o.clear();
        for c in &out {
            o.extend_from_slice(c);
        }
    });
    out_frames
}


#[no_mangle]
pub extern "C" fn output_ptr() -> *const f32 {
    OUTPUT.with(|o| o.borrow().as_ptr())
}

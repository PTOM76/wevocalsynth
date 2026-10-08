import { nearestBeat } from '../audio/tempoMap'
import { CURVE_HOP_SEC, type CurvePoint } from '../hooks/useLaneCurve'
import { FORMANT_SCALE, GAIN_SCALE, curveValueAt, drawCurveLane, type CurveScale } from './waveform/curveLane'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Slider, Stack, Typography } from '@mui/material'
import { canvasPixelRatio, localPoint, usePalette } from 'pevenmui'
import { useLaneDivider } from './waveform/useLaneDivider'
import { useLanePen } from './waveform/useLanePen'
import { usePitchGrab } from './waveform/usePitchGrab'
import type { NoteGhost } from './waveform/useNoteDrag'
import type { Marker } from '../project/projectFile'
import { useEdgeScroll, useRangeEdges, useTouchGestures, type EdgeDrag, type useWaveformView, Minimap } from 'wevocal-lib/react'
import type { Clip, Range } from '../audio/types'
import { clipDuration } from '../audio/types'
import { F0_HOP_SEC } from '../dsp/engine'
import type { Spectrogram } from '../audio/spectrogram'
import {
  RULER_HEIGHT,
  laneHeights,
  prepareCanvas,
  drawBeatGrid,
  drawPitchLane,
  drawPlayhead,
  drawRuler,
  drawSelection, drawSelectionHandles,
  drawSpectrogram,
  spectrogramLayer,
  drawWave,
  drawGhostWave,
  drawLaneFocus,
  gainTop,
  formantTop,
  type Lane,
  pitchRange,
  type BeatGrid,
  type DrawContext,
  waveColors,
} from './waveform/draw'
import { computePeaks } from 'wevocal-lib'
import { useLang, useT } from '../i18n/i18n'
import { countRender } from '../debug/debugStats'
import { useAppSettings } from '../settings/settings'

export { hzToMidi } from './waveform/draw'

const DRAG_THRESHOLD_PX = 3
/** 拍の線へ吸着する距離（px） */
const SNAP_PX = 6
/** 長押しでメニューを出すまでの時間（ミリ秒）と、その間に動いてよい距離（px） */
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP_PX = 8
/** スマホの新しい画面で、範囲の端のつまみを指でつかめる距離（px） */
const HANDLE_GRAB_PX = 22

/** ピッチ帯に描く点。`midi` が null なら消しゴム */
export interface DrawPoint {
  k: number
  midi: number | null
}

interface Props {
  clip: Clip
  position: number
  /** 再生中か。再生中は `livePosition` で毎フレーム再生位置の線を描く */
  playing?: boolean
  livePosition?: () => number
  /** 選択範囲（複数可、開始位置順） */
  selections: Range[]
  onSeek: (t: number) => void
  /** ドラッグで範囲を選ぶ。Ctrl/⌘ を押しながらなら既存の範囲に追加する */
  onSelectionsChange: (rs: Range[]) => void
  /** Shift+右端ドラッグで、範囲 `range` を長さ `duration`（秒）に伸縮する */
  onStretchRange: (range: Range, duration: number) => void
  /** 音符ブロックの移動・伸縮: 区間ごとに長さを変える */
  onRetime: (parts: { start: number; end: number; dur: number }[]) => void
  /** マーカー（選択範囲の端・再生位置が吸着する）と、目盛りの上のダブルクリックでの名前の変更 */
  markers?: Marker[]
  /** 波形の縦の拡大率と、Alt+ホイールでの変更（1: 拡大 / -1: 縮小） */
  waveScale?: number
  onWaveScale?: (dir: 1 | -1) => void
  onRenameMarker?: (id: string) => void
  /** 目盛りの上でマーカーをドラッグして動かす */
  onMoveMarker?: (id: string, time: number) => void
  /** 右クリック、またはタッチの長押し（画面上の位置） */
  onContextMenu: (x: number, y: number, ruler?: { time: number; markerId: string | null }) => void
  /** 表示範囲（拡大縮小・スクロール）。ツールバーと共有するため画面側で持つ */
  viewCtl: ReturnType<typeof useWaveformView>
  /** F0（Hz、`F0_HOP_SEC` 間隔、無声は 0）。解析中は null */
  pitch: Float32Array | null
  showPitch: boolean
  /** 選択範囲の両端に指でつかむつまみを出す（スマホの新しい画面） */
  touchHandles?: boolean
  /** 指でなぞるとスクロール、長押しで範囲選択（オフならなぞって範囲選択） */
  touchPan?: boolean
  /** 描いた目標ピッチ（`pitch` と同じ長さ、0 は未編集） */
  target: Float32Array | null
  penMode: boolean
  /** フレーム `from.k` から `to.k` までを描く（`midi` が null なら消す） */
  onDraw: (from: DrawPoint, to: DrawPoint) => void
  /** 掴むモード（ピッチの線を掴んで上下に動かす）と、動かした結果の目標ピッチ（`pitch` と同じ長さ、0 は未編集） */
  grabMode: boolean
  onGrabPitch: (hz: Float32Array) => void
  /** スペクトログラム。解析中は null */
  spectrogram: Spectrogram | null
  showSpectrogram: boolean
  /** ピッチ帯の割合（%）。境目のドラッグで変わる */
  pitchPercent: number
  onPitchPercentChange: (percent: number) => void
  /** 拍の目安線（null なら描かない） */
  beatGrid: BeatGrid | null
  /** 後ろに薄く重ねる、ほかのトラックの音（トラックの右クリックメニューで選ぶ） */
  ghosts?: Clip[]
  /** 波形の帯を出すか（偽ならピッチだけ） */
  showWave: boolean
  /** 音量・フォルマントの帯を出すか、描いた曲線（dB・半音、`CURVE_HOP_SEC` 間隔）と、ペンで描く */
  showGain: boolean
  gainCurve: Float32Array | null
  onDrawGain: (from: CurvePoint, to: CurvePoint) => void
  showFormant: boolean
  formantCurve: Float32Array | null
  onDrawFormant: (from: CurvePoint, to: CurvePoint) => void
  /** フォーカスしている帯（ツールバーとショートカットが効く）。押した帯にフォーカスを移す */
  focusLane: Lane
  onFocusLane: (lane: Lane) => void
}

/** 曲線の帯（音量・フォルマント）のペン。Shift で 1 刻みに吸着、Alt で元に戻す */
const curveLane = (enabled: boolean, top: number, height: number, scale: CurveScale, draw: (from: CurvePoint, to: CurvePoint) => void) => ({
  enabled,
  top,
  height,
  hopSec: CURVE_HOP_SEC,
  pointAt: (k: number, y: number, e: React.PointerEvent): CurvePoint => {
    if (e.altKey) return { k, v: null }
    const v = curveValueAt(scale, y, height)
    return { k, v: e.shiftKey ? Math.round(v) : v }
  },
  draw,
})

/**
 * 波形と帯（スペクトログラム・ピッチ・音量・フォルマント）の Canvas。渡すものが変わったときだけ描き直す（memo）。
 * 関数は作り直さずに渡すこと（App は useStableFn で包んでいる）
 */
export default memo(Waveform)

function Waveform(props: Props) {
  countRender('Waveform')
  const { clip, position, playing, livePosition, pitch, showPitch, target, penMode, spectrogram, showSpectrogram, beatGrid } = props
  // 表示の設定は App を通さずに読む
  const { settings } = useAppSettings()
  // ピッチの線と音符は、どちらか一方は表示する
  const pitchLine = settings.showPitchLine || !settings.showNotes
  // ドラッグ中の選択範囲は、ここだけで持って描き、離したときに `onSelectionsChange` で渡す
  // （動かすたびに渡すと、画面全体（App）が描き直されて重かった）
  const [draftSelections, setDraftSelections] = useState<Range[] | null>(null)
  const draftRef = useRef<Range[] | null>(null)
  const selections = draftSelections ?? props.selections
  const changeSelections = (rs: Range[]) => {
    // ドラッグ中も渡す設定なら、そのまま渡す（ステータスバーの数値なども動くが、画面全体が描き直されるので重い）
    if (settings.liveSelection) return props.onSelectionsChange(rs)
    draftRef.current = rs
    setDraftSelections(rs)
  }
  /** ドラッグ中の選択範囲を確定して渡す */
  const commitSelections = () => {
    const rs = draftRef.current
    if (!rs) return
    draftRef.current = null
    setDraftSelections(null)
    props.onSelectionsChange(rs)
  }
  const { pal, dark, font } = usePalette()
  const colors = useMemo(() => waveColors(pal, dark), [pal, dark])
  const t = useT()
  // 言語が変わったら Canvas の文字（「解析中…」）も描き直す
  const lang = useLang()
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 再生位置の線だけを描く、上に重ねた Canvas（再生中に波形全体を描き直さないため）
  const overlayRef = useRef<HTMLCanvasElement>(null)
  // base: ドラッグ開始時に残す範囲（追加選択なら既存の範囲、通常は空）
  const dragRef = useRef<{ x0: number; t0: number; dragging: boolean; base: Range[]; edge?: EdgeDrag } | null>(null)
  // 上の時間目盛りの上では、範囲選択ではなく再生位置を動かす（押したまま動かすと付いてくる）
  const scrubRef = useRef(false)
  const onRuler = (e: React.PointerEvent) => localPoint(canvasRef.current!, e.clientX, e.clientY).y < RULER_HEIGHT
  // マウスが何の上にあるか（カーソルの形にだけ使う）。状態にするとマウスを動かすたびに描き直しになるので、
  // ref に持って Canvas の style.cursor を直接書き換える（`updateCursor`）
  const hoverRef = useRef({ ruler: false, marker: false, divider: false, grab: false, noteEdge: false, edge: false })
  // 目盛りの上で掴んだマーカー（動かさずに離したらクリック扱いで再生位置を移す）
  const markerDragRef = useRef<{ id: string; x0: number; moved: boolean } | null>(null)
  // 音符ブロックを横にドラッグしている間の行き先
  const [noteGhost, setNoteGhost] = useState<NoteGhost | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  // 描いた曲線（ピッチ・音量）は配列の中身だけが変わるので、描き直しのきっかけに使うカウンタ
  const [drawVersion, setDrawVersion] = useState(0)
  const width = size.width
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  // 新しいスマホの画面で、波形を押してから離すまで: なぞったらスクロール（moved）、長押ししたら範囲選択（selecting）
  const panRef = useRef<{ x0: number; start0: number; dur: number; moved: boolean; selecting: boolean } | null>(null)
  const duration = clipDuration(clip)
  const { view, scrollTo, zoomed, wheel } = props.viewCtl
  const waveScale = props.waveScale ?? 1

  // 置き場所の大きさに合わせて Canvas を伸び縮みさせる（高さも画面に合わせる）
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    // 大きさが実際に変わったときだけ更新する（同じ値でも新しいオブジェクトを渡すと描き直しが走るため）
    const ro = new ResizeObserver(([e]) => {
      const width = Math.floor(e.contentRect.width)
      const height = Math.floor(e.contentRect.height)
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ページ自体がスクロール・拡大しないよう、ホイールは non-passive で登録する
  const wheelRef = useRef(wheel)
  wheelRef.current = wheel
  const waveScaleRef = useRef(props.onWaveScale)
  waveScaleRef.current = props.onWaveScale
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Alt+ホイールは波形の縦の拡大縮小
      if (e.altKey && waveScaleRef.current) return waveScaleRef.current(e.deltaY < 0 ? 1 : -1)
      wheelRef.current(e, canvas.getBoundingClientRect())
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const peaks = useMemo(() => (width > 0 ? computePeaks(clip, width, view) : null), [clip, width, view])
  const ghosts = props.ghosts
  const ghostPeaks = useMemo(() => (width > 0 && ghosts?.length ? ghosts.map((g) => computePeaks(g, width, view)) : []), [ghosts, width, view])
  const range = useMemo(() => (pitch ? pitchRange(pitch) : null), [pitch])
  const showWave = props.showWave
  const showGain = props.showGain
  const showFormant = props.showFormant
  const overlay = settings.overlayPitch && showWave && showPitch
  const { waveH, specH, pitchH, gainH, formantH, height } = laneHeights(
    size.height,
    { wave: showWave, spec: showSpectrogram, pitch: showPitch && !overlay, gain: showGain, formant: showFormant },
    props.pitchPercent,
  )
  // 下の帯（ピッチ・音量・フォルマント）と上の帯（波形・スペクトログラム）の境目のドラッグは、両方あるときだけ
  const upperH = waveH + specH
  const lowerH = pitchH + gainH + formantH
  // ピッチを描き、操作する場所。重ねるときは波形の帯
  const pitchY = overlay ? RULER_HEIGHT : RULER_HEIGHT + upperH
  const pitchLaneH = overlay ? waveH : pitchH
  const divider = useLaneDivider(canvasRef, { waveH: upperH, pitchH: lowerH }, lowerH > 0 && upperH > 0, props.onPitchPercentChange)
  const specLayer = useMemo(
    () => (showSpectrogram && spectrogram && width > 0 && specH > 0 ? spectrogramLayer(spectrogram, width, specH, view) : null),
    [showSpectrogram, spectrogram, width, specH, view],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !peaks) return
    const dpr = canvasPixelRatio()
    const g = prepareCanvas(canvas, width * dpr, height * dpr)!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, width, height)
    g.font = `11px ${font}`
    g.textBaseline = 'middle'
    const c: DrawContext = { g, width, view, colors, pal, dark, waveH, specH, pitchH, gainH, formantH, pitchY, pitchLaneH }

    drawRuler(c)
    // スペクトログラムは波形の代わりに表示する。選択範囲は波形などに隠れないよう、最後に重ねる
    if (showWave) {
      // ほかのトラックは後ろに薄く重ねる
      for (const gp of ghostPeaks) drawGhostWave(c, gp, waveScale)
      drawWave(c, peaks, waveScale, overlay)
    }
    // スペクトログラムは波形を置き換えず、自分の帯に描く
    if (showSpectrogram) drawSpectrogram(c, spectrogram, specLayer)
    if (showPitch) drawPitchLane(c, pitch, range, target, settings.showNotes, pitchLine)
    if (showGain) drawCurveLane(c, gainTop(c), gainH, GAIN_SCALE, props.gainCurve, CURVE_HOP_SEC)
    if (showFormant) drawCurveLane(c, formantTop(c), formantH, FORMANT_SCALE, props.formantCurve, CURVE_HOP_SEC)
    if (beatGrid) drawBeatGrid(c, beatGrid, height)
    // 帯が2本以上あるときだけ、どれにフォーカスしているかを示す
    if ([showWave, showSpectrogram, showPitch, showGain, showFormant].filter(Boolean).length > 1) drawLaneFocus(c, props.focusLane)
    // 選択範囲は上に重ねた Canvas に描く（範囲をドラッグしている間、波形などを描き直さないため）
  }, [waveScale, showWave, showGain, props.gainCurve, gainH, showFormant, props.formantCurve, formantH, props.focusLane, beatGrid, lang, peaks, ghostPeaks, width, height, waveH, specH, pitchH, view, colors, pal, dark, font, showSpectrogram, spectrogram, specLayer, showPitch, settings.showNotes, pitchLine, pitch, range, target, drawVersion, pitchY, pitchLaneH, overlay])

  // 選択範囲と再生位置の線（上に重ねた Canvas。再生中は毎フレーム、範囲のドラッグ中は動かすたびに、こちらだけを描き直す）
  useEffect(() => {
    const canvas = overlayRef.current
    if (!canvas || width <= 0) return
    const dpr = canvasPixelRatio()
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
    }
    const g = canvas.getContext('2d')!
    const c: DrawContext = { g, width, view, colors, pal, dark, waveH, specH, pitchH, gainH, formantH }
    const draw = (t: number) => {
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, width, height)
      for (const r of selections) drawSelection(c, r, height)
      if (props.touchHandles) for (const r of selections) drawSelectionHandles(c, r, height)
      // マーカー: 縦の点線と、目盛りの上に名前
      g.font = `11px ${font}`
      for (const m of props.markers ?? []) {
        const x = Math.round(((m.time - view.start) / view.dur) * width) + 0.5
        if (x < -100 || x > width) continue
        g.strokeStyle = pal.warning.main
        g.setLineDash([3, 3])
        g.beginPath()
        g.moveTo(x, RULER_HEIGHT)
        g.lineTo(x, height)
        g.stroke()
        g.setLineDash([])
        // テンポを持つマーカーは、名前の後ろにテンポを出す
        const label = m.tempo ? `${m.name} ♩${Math.round(m.tempo.bpm * 100) / 100} ${m.tempo.beatsPerBar}/4` : m.name
        const w = g.measureText(label).width + 8
        g.fillStyle = pal.warning.main
        g.fillRect(x, 0, w, RULER_HEIGHT - 2)
        g.fillStyle = pal.warning.contrastText
        g.textBaseline = 'middle'
        g.fillText(label, x + 4, (RULER_HEIGHT - 2) / 2)
      }
      if (noteGhost && range) {
        // ドラッグ中の音符ブロックの行き先
        const per = pitchLaneH / (range.hi - range.lo)
        const y = pitchY + ((range.hi - noteGhost.note - 0.5) / (range.hi - range.lo)) * pitchLaneH
        const x0 = ((noteGhost.start - view.start) / view.dur) * width
        const x1 = ((noteGhost.end - view.start) / view.dur) * width
        g.strokeStyle = pal.text.primary
        g.lineWidth = 2
        g.strokeRect(x0, y, Math.max(1, x1 - x0), Math.max(4, per))
        g.lineWidth = 1
      }
      drawPlayhead(c, t, height)
    }
    draw(position)
    // 再生中は React の再描画（position は間引いて更新）を待たず、毎フレーム今の位置で描く
    if (!playing || !livePosition) return
    let raf = 0
    const tick = () => {
      draw(livePosition())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [position, playing, livePosition, width, height, view, colors, pal, dark, waveH, specH, pitchH, gainH, formantH, selections, noteGhost, range, pitchY, pitchLaneH, props.markers, font, props.touchHandles])

  const timeAt = (clientX: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const t = view.start + ((clientX - rect.left) / rect.width) * view.dur
    return Math.max(0, Math.min(duration, t))
  }

  /** 目盛りの上の、その位置にあるマーカー（名札の幅を含む） */
  const markerAt = (clientX: number) => {
    const t = timeAt(clientX)
    const px = view.dur / width
    return [...(props.markers ?? [])].reverse().find((m) => t >= m.time - 4 * px && t <= m.time + 60 * px) ?? null
  }

  // 拍の線を出しているときは、選択範囲の端・再生位置を近くの拍に吸着させる（Alt を押している間はしない）
  const altRef = useRef(false)
  // `exclude` は吸着先にしないマーカー（ドラッグ中のマーカー自身）
  const snapTime = (clientX: number, exclude?: string) => {
    const t = timeAt(clientX)
    if (altRef.current) return t
    // マーカーは拍より優先して吸着する
    const near = (props.markers ?? []).reduce<number | null>(
      (b, m) => (m.id === exclude ? b : b === null || Math.abs(m.time - t) < Math.abs(b - t) ? m.time : b),
      null,
    )
    if (near !== null && (Math.abs(near - t) / view.dur) * width <= SNAP_PX) return near
    if (!beatGrid) return t
    // ドラッグ中のマーカーがテンポを持つなら、その区間は除く（自分の拍の線に吸い付いて動かせなくなる）
    const self = exclude ? props.markers?.find((m) => m.id === exclude) : undefined
    const segs = self?.tempo ? beatGrid.segments.filter((s) => s.start !== self.time) : beatGrid.segments
    const b = nearestBeat(segs, t)
    const px = (Math.abs(b - t) / view.dur) * width
    return px <= SNAP_PX ? Math.max(0, Math.min(duration, b)) : t
  }

  // スマホのタッチ操作（ピンチで横の拡大縮小、目盛りの長押しで横移動）
  // 目盛りのドラッグで端に来たら表示範囲を流す（端で止まって先へ進めなくならないように）
  const edgeScroll = useEdgeScroll({ canvasRef, view, duration, setRange: props.viewCtl.setRange, seek: props.onSeek })
  const scrubTo = (x: number) => {
    props.onSeek(snapTime(x))
    edgeScroll.update(x)
  }
  const touch = useTouchGestures({ canvasRef, view, setRange: props.viewCtl.setRange, seekAt: scrubTo })
  // タッチし始めたときの選択範囲。ピンチになったら、1本目の指で始まりかけた選択を取り消してここに戻す
  const selectionsAtTouch = useRef<Range[]>(selections)

  const { edgeAt, dragEdge } = useRangeEdges(canvasRef, view, selections, snapTime, changeSelections)

  // ペンで描ける帯（ピッチ: Shift で半音に吸着、Alt で消す / 音量・フォルマント: Shift で 1 刻みに吸着、Alt で元に戻す）
  const pen = useLanePen(canvasRef, penMode, timeAt, [
    {
      enabled: showPitch && !!range,
      top: pitchY,
      height: pitchLaneH,
      hopSec: F0_HOP_SEC,
      pointAt: (k: number, y: number, e: React.PointerEvent): DrawPoint => {
        if (e.altKey || !range) return { k, midi: null }
        const m = range.hi - (y / pitchLaneH) * (range.hi - range.lo)
        return { k, midi: e.shiftKey ? Math.round(m) : m }
      },
      draw: props.onDraw,
    },
    curveLane(showGain, gainTop({ waveH, specH, pitchH }), gainH, GAIN_SCALE, props.onDrawGain),
    curveLane(showFormant, formantTop({ waveH, specH, pitchH, gainH }), formantH, FORMANT_SCALE, props.onDrawFormant),
  ], () => setDrawVersion((v) => v + 1))
  // 掴むモード: ピッチの線を掴んで上下に動かす
  const grab = usePitchGrab(
    canvasRef,
    props.grabMode,
    { enabled: showPitch, top: pitchY, height: pitchLaneH, range, notes: !!settings.showNotes, line: pitchLine },
    pitch,
    target,
    selections,
    timeAt,
    props.onGrabPitch,
    {
      duration,
      secPerPx: () => view.dur / Math.max(1, width),
      onGhost: setNoteGhost,
      onRetime: props.onRetime,
    },
  )
  /** マウスの下にあるものと今のモードから、カーソルの形を決めて Canvas に入れる */
  const updateCursor = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const h = hoverRef.current
    // マーカーの掴み・ドラッグ中は手の形を優先する
    if (markerDragRef.current?.moved || h.marker) {
      canvas.style.cursor = markerDragRef.current?.moved ? 'grabbing' : 'grab'
      return
    }
    canvas.style.cursor = h.ruler
      ? 'pointer'
      : h.divider
        ? 'row-resize'
        : grab.grabbing()
          ? 'grabbing'
          : h.noteEdge
            ? 'ew-resize'
            : h.grab
            ? 'grab'
            : penMode && (showPitch || showGain || showFormant)
              ? 'crosshair'
              : h.edge
                ? 'ew-resize'
                : 'text'
  }
  // モードや帯の表示が変わったときもカーソルを合わせ直す
  useEffect(updateCursor)

  const cancelLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer)
    longPressRef.current = null
  }

  return (
    <Stack sx={{ width: '100%', height: '100%', minHeight: 0, userSelect: 'none' }}>
      {/* Canvas はこの箱の大きさいっぱいに描く */}
      {/* 長押しで、iPhone の文字の選択や吹き出しが出ないようにする（長押しは範囲選択やメニューに使う） */}
      <Box ref={boxRef} sx={{ flex: 1, minHeight: 0, touchAction: 'none', overflow: 'hidden', position: 'relative', WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}>
      <canvas
        ref={overlayRef}
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height, pointerEvents: 'none' }}
      />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t('wave.aria')}
        style={{
          width: '100%',
          height,
          display: 'block',
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          // 新しいスマホの画面: 指の長押しはブラウザも右クリックとして送ってくるが、範囲選択に使うのでメニューは出さない
          // （出すとメニューが指の操作を奪い、選択が続かない。メニューは編集の列の「その他」）
          if (props.touchPan && (panRef.current || longPressRef.current || dragRef.current)) return
          // 目盛りの上なら、その位置（マーカーの追加など）も渡す
          const ruler = localPoint(e.currentTarget, e.clientX, e.clientY).y <= RULER_HEIGHT
          props.onContextMenu(e.clientX, e.clientY, ruler ? { time: snapTime(e.clientX), markerId: markerAt(e.clientX)?.id ?? null } : undefined)
        }}
        onDoubleClick={(e) => {
          // 目盛りの上のマーカーの名前をダブルクリックで変える
          if (localPoint(e.currentTarget, e.clientX, e.clientY).y > RULER_HEIGHT || !props.onRenameMarker) return
          const m = markerAt(e.clientX)
          if (m) props.onRenameMarker(m.id)
        }}
        onPointerDown={(e) => {
          // 押した帯にフォーカスを移す（時間目盛りの上は変えない）
          const ly = localPoint(e.currentTarget, e.clientX, e.clientY).y - RULER_HEIGHT
          if (ly >= 0) props.onFocusLane(ly < waveH ? (overlay && (penMode || props.grabMode) ? 'pitch' : 'wave') : ly < upperH ? 'spec' : ly < upperH + pitchH ? 'pitch' : ly < upperH + pitchH + gainH ? 'gain' : 'formant')
          // 右クリックは範囲選択を始めない（コンテキストメニューに任せる）
          if (e.button === 2) return
          altRef.current = e.altKey
          e.currentTarget.setPointerCapture(e.pointerId)
          if (e.pointerType === 'touch' && !dragRef.current && !pen.drawing()) selectionsAtTouch.current = selections
          if (touch.down(e)) {
            // 2本目の指が触れたらピンチ。進行中の選択・長押し・再生位置のドラッグはやめる
            cancelLongPress()
            if (dragRef.current?.dragging) {
              draftRef.current = null
              setDraftSelections(null)
              props.onSelectionsChange(selectionsAtTouch.current)
            }
            dragRef.current = null
            panRef.current = null
            pen.end()
            scrubRef.current = false
            return
          }
          if (divider.start(e)) return
          if (onRuler(e)) {
            // タッチはタップ・ドラッグ・長押し（横移動）を見分けてから動かす
            if (e.pointerType === 'touch') return touch.rulerDown(e)
            const m = props.onMoveMarker ? markerAt(e.clientX) : null
            if (m) {
              markerDragRef.current = { id: m.id, x0: e.clientX, moved: false }
              return
            }
            scrubRef.current = true
            props.onSeek(snapTime(e.clientX))
            return
          }
          // 新しいスマホの画面: なぞるとスクロール、長押しで範囲選択（memo/mobile-ui.md の 4.4）。長押しのメニューは編集の列の「⋯」へ
          if (e.pointerType === 'touch' && props.touchPan) {
            const { clientX: x, clientY: y } = e
            const timer = window.setTimeout(() => {
              longPressRef.current = null
              const p = panRef.current
              if (!p || p.moved) return
              p.selecting = true
              navigator.vibrate?.(10)
            }, LONG_PRESS_MS)
            longPressRef.current = { timer, x, y }
          } else if (e.pointerType === 'touch') {
            // 以前の画面: タッチの長押しは右クリックの代わり（離すか動かすと取り消す）
            const { clientX: x, clientY: y } = e
            const timer = window.setTimeout(() => {
              longPressRef.current = null
              dragRef.current = null
              props.onContextMenu(x, y)
            }, LONG_PRESS_MS)
            longPressRef.current = { timer, x, y }
          }
          if (pen.down(e)) return
          if (grab.down(e)) {
            cancelLongPress()
            updateCursor()
            return
          }
          const t0 = snapTime(e.clientX)
          // スマホの新しい画面では、指でつかめるよう端のつまみを広く取る
          const hit = edgeAt(e.clientX, e.pointerType === 'touch' && props.touchHandles ? HANDLE_GRAB_PX : undefined)
          if (hit) {
            const orig = selections[hit.index]
            const stretch = e.shiftKey && hit.side === 'end'
            dragRef.current = { x0: e.clientX, t0, dragging: true, base: selections, edge: { ...hit, stretch, orig, last: orig } }
            return
          }
          const add = e.ctrlKey || e.metaKey
          dragRef.current = { x0: e.clientX, t0, dragging: false, base: add ? selections : [] }
          if (e.pointerType === 'touch' && props.touchPan) panRef.current = { x0: e.clientX, start0: view.start, dur: view.dur, moved: false, selecting: false }
        }}
        onPointerMove={(e) => {
          altRef.current = e.altKey
          const lp = longPressRef.current
          if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LONG_PRESS_SLOP_PX) cancelLongPress()
          if (touch.move(e)) return
          if (divider.dragging()) return divider.move(e)
          const md = markerDragRef.current
          if (md) {
            if (!md.moved && Math.abs(e.clientX - md.x0) < DRAG_THRESHOLD_PX) return
            md.moved = true
            props.onMoveMarker?.(md.id, snapTime(e.clientX, md.id))
            return updateCursor()
          }
          if (scrubRef.current) return scrubTo(e.clientX)
          if (pen.move(e)) return
          if (grab.move(e)) return
          const d = dragRef.current
          if (!d) {
            hoverRef.current = {
              ruler: onRuler(e),
              marker: !!props.onMoveMarker && onRuler(e) && !!markerAt(e.clientX),
              divider: divider.hit(e),
              grab: grab.hover(e),
              noteEdge: grab.hoverEdge(e),
              edge: !penMode && !props.grabMode && !!edgeAt(e.clientX),
            }
            updateCursor()
            return
          }
          if (d.edge) return dragEdge(d.edge, e.clientX)
          // 新しいスマホの画面: 長押しする前になぞったら、表示範囲を指に付けて動かす（範囲は選ばない）
          const pan = panRef.current
          if (pan && !pan.selecting) {
            if (!pan.moved && Math.abs(e.clientX - pan.x0) < DRAG_THRESHOLD_PX) return
            pan.moved = true
            cancelLongPress()
            const w = canvasRef.current!.getBoundingClientRect().width
            props.viewCtl.setRange(pan.start0 - ((e.clientX - pan.x0) / w) * pan.dur, pan.dur)
            return
          }
          if (!d.dragging && Math.abs(e.clientX - d.x0) < DRAG_THRESHOLD_PX) return
          d.dragging = true
          const t = snapTime(e.clientX)
          changeSelections([...d.base, { start: Math.min(d.t0, t), end: Math.max(d.t0, t) }])
        }}
        onPointerCancel={(e) => {
          cancelLongPress()
          panRef.current = null
          markerDragRef.current = null
          edgeScroll.stop()
          commitSelections()
          touch.up(e)
        }}
        onPointerUp={(e) => {
          cancelLongPress()
          edgeScroll.stop()
          // ドラッグ中の範囲を先に確定する（このあとの伸縮は確定した範囲をもとに選び直す）
          commitSelections()
          if (touch.up(e)) return
          if (divider.dragging()) return divider.end()
          const md = markerDragRef.current
          if (md) {
            markerDragRef.current = null
            // 動かさずに離したら、目盛りのクリックと同じく再生位置を移す
            if (!md.moved) props.onSeek(snapTime(e.clientX))
            return updateCursor()
          }
          if (scrubRef.current) {
            scrubRef.current = false
            return
          }
          if (pen.end()) return
          if (grab.end()) return updateCursor()
          const d = dragRef.current
          dragRef.current = null
          const pan = panRef.current
          panRef.current = null
          // 新しいスマホの画面: なぞってスクロールしただけなら何もしない。動かさずに離したら（タップ）範囲を解除して再生位置へ
          if (pan && !pan.selecting) {
            if (!pan.moved) {
              props.onSelectionsChange([])
              props.onSeek(snapTime(e.clientX))
            }
            return
          }
          const edge = d?.edge
          if (edge?.stretch && edge.last.end !== edge.orig.end) {
            props.onStretchRange(edge.orig, edge.last.end - edge.last.start)
          } else if (d && !d.dragging) {
            props.onSeek(snapTime(e.clientX))
          }
        }}
      />
      </Box>
      {/* 表示範囲の横スクロールバー */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1 }}>
        {settings.minimap ? (
          <Minimap clip={clip} colors={colors} duration={duration} view={view} selections={props.selections} scrollTo={scrollTo} label={t('wave.scroll')} position={position} playing={!!playing} livePosition={livePosition} showPlayhead={settings.minimapPlayhead} />
        ) : (
        <Slider
          size="small"
          aria-label={t('wave.scroll')}
          disabled={!zoomed}
          value={view.start}
          min={0}
          max={Math.max(0, duration - view.dur)}
          step={view.dur / 100}
          onChange={(_, v) => scrollTo(v as number)}
        />
        )}
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
          {view.dur.toFixed(view.dur < 1 ? 3 : 1)}s
        </Typography>
      </Stack>
    </Stack>
  )
}

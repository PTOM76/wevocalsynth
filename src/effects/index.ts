// エフェクトの表と、表の順に掛ける関数（書き出し、再生）
import type { Clip } from '../audio/types'
import { eqEffect, type TrackEq } from './eq/eq'
import { faderEffect, type TrackFader } from './fader/fader'
import type { Effect, LiveEffect } from './types'

/** トラックごとのエフェクトの値 */
export interface EffectValues {
  eq: TrackEq
  fader: TrackFader
}
type EffectId = keyof EffectValues

/** エフェクトの表。掛ける順に並べる（EQ → フェーダー）。足すときは effects/ にフォルダーを作り、ここに足す */
export const EFFECTS: { [K in EffectId]: Effect<EffectValues[K]> } = { eq: eqEffect, fader: faderEffect }
const ORDER = Object.keys(EFFECTS) as EffectId[]

export const DEFAULT_EFFECTS = Object.fromEntries(ORDER.map((id) => [id, EFFECTS[id].initial])) as unknown as EffectValues

const effect = <K extends EffectId>(id: K) => EFFECTS[id] as Effect<EffectValues[K]>

/** どのエフェクトも何もしない値か */
export const isNeutralEffects = (v: EffectValues) => ORDER.every((id) => effect(id).isNeutral(v[id] as never))

/** 表の順に音声へ掛ける（書き出し）。何もしないエフェクトは飛ばす */
export async function renderEffects(clip: Clip, v: EffectValues): Promise<Clip> {
  let out = clip
  for (const id of ORDER) if (!effect(id).isNeutral(v[id] as never)) out = await effect(id).render(out, v[id] as never)
  return out
}

/** 再生のノードを表の順につなぐ。値を変えたら update、止めたら dispose */
export function createLiveEffects(ctx: BaseAudioContext, v: EffectValues) {
  const chain = ORDER.map((id) => effect(id).live(ctx, v[id] as never) as LiveEffect<unknown>)
  for (let i = 1; i < chain.length; i++) chain[i - 1].output.connect(chain[i].input)
  return {
    input: chain[0].input,
    output: chain[chain.length - 1].output,
    update: (next: EffectValues) => chain.forEach((n, i) => n.update(next[ORDER[i]])),
    dispose: () => chain.forEach((n) => n.dispose()),
  }
}

export type LiveEffects = ReturnType<typeof createLiveEffects>
export type { Effect, LiveEffect }

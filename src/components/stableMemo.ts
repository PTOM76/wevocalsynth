// 関数の props が作り直されても描き直さない memo
import { createElement, isValidElement, memo, useRef, type ComponentType, type ReactElement } from 'react'

/**
 * 関数の props が毎回作り直されても描き直さない memo。
 * 関数は「最新の関数を呼ぶ、変わらない関数」に置き換えてから比べる（入れ子のオブジェクト・配列・要素の中も同じ）。
 * 子の useEffect の依存に関数を入れても、関数が変わったことでは動き直さない点に注意
 */

type Path = string
type Latest = { current: unknown }

const isPlain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype

/** `latest` の `path` にある値を読む（呼ばれたときの最新の props から辿る） */
function read(latest: Latest, path: string[]): unknown {
  let v = latest.current
  for (const k of path) {
    if (v == null) return undefined
    v = isValidElement(v) ? (v.props as Record<string, unknown>)[k] : (v as Record<string, unknown>)[k]
  }
  return v
}

/** 関数を、変わらない関数に置き換えた値を作る */
function transform(v: unknown, path: string[], latest: Latest, proxies: Map<Path, unknown>): unknown {
  if (typeof v === 'function') {
    const key = path.join('\u0000')
    let p = proxies.get(key)
    if (!p) {
      p = (...args: unknown[]) => (read(latest, path) as ((...a: unknown[]) => unknown) | undefined)?.(...args)
      proxies.set(key, p)
    }
    return p
  }
  if (Array.isArray(v)) return v.map((x, i) => transform(x, [...path, String(i)], latest, proxies))
  if (isValidElement(v)) {
    const props = transform(v.props, path, latest, proxies) as Record<string, unknown>
    return createElement(v.type, v.key == null ? props : { ...props, key: v.key })
  }
  if (isPlain(v)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v)) out[k] = transform(v[k], [...path, k], latest, proxies)
    return out
  }
  return v
}

/** 置き換えたあとの値が同じか（オブジェクト・配列・要素は中身で比べる） */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]))
  if (isValidElement(a) && isValidElement(b)) return a.type === b.type && a.key === b.key && same(a.props, b.props)
  if (isPlain(a) && isPlain(b)) {
    const ka = Object.keys(a)
    return ka.length === Object.keys(b).length && ka.every((k) => k in b && same(a[k], b[k]))
  }
  return false
}

export function stableMemo<P extends object>(Component: ComponentType<P>) {
  const Inner = memo(Component, (a, b) => same(a, b)) as unknown as ComponentType<P>
  function Stable(props: P): ReactElement {
    const latest = useRef<unknown>(props)
    latest.current = props
    const proxies = useRef(new Map<Path, unknown>())
    return createElement(Inner, transform(props, [], latest, proxies.current) as P)
  }
  Stable.displayName = `stableMemo(${Component.displayName ?? Component.name})`
  return Stable
}

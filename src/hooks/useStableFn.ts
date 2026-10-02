import { useCallback, useRef } from 'react'

/**
 * 呼ぶと常に最新の `fn` を呼ぶ、作り直されない関数を返す。
 * 描画のたびに作り直される関数を `memo` した部品に渡すと、毎回描き直しになるので、これで包んで渡す
 */
export function useStableFn<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: A) => ref.current(...args), [])
}

import { useEffect, useLayoutEffect } from 'react'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure the store
// subscription callback always has the selector from the latest render commit
// available, otherwise a store update may happen between render and the effect,
// which may cause missed updates; we also must ensure the store subscription
// is created synchronously, otherwise a store update may occur before the
// subscription is created and an inconsistent state may be observed

// Matches logic in React's `shared/ExecutionEnvironment` file
export const canUseDOM = !!(
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.document.createElement !== 'undefined'
)
// 是否可以使用dom // +++

// 可以使用dom则使用useLayoutEffect，不可以使用的话则使用useEffect // +++
export const useIsomorphicLayoutEffect = canUseDOM ? useLayoutEffect : useEffect

import { createContext } from 'react'
import type { Action, AnyAction, Store } from 'redux'
import type { Subscription } from '../utils/Subscription'

export interface ReactReduxContextValue<
  SS = any,
  A extends Action = AnyAction
> {
  store: Store<SS, A>
  subscription: Subscription
  getServerState?: () => SS
}

// react redux context
export const ReactReduxContext =
  /*#__PURE__*/ createContext<ReactReduxContextValue>(null as any) // 直接就是一个createContext api执行后的结果 // +++

export type ReactReduxContextInstance = typeof ReactReduxContext

if (process.env.NODE_ENV !== 'production') {
  ReactReduxContext.displayName = 'ReactRedux'
}

export default ReactReduxContext

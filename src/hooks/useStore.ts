import { useContext, Context } from 'react'
import { Action as BasicAction, AnyAction, Store } from 'redux'
import {
  ReactReduxContext,
  ReactReduxContextValue,
} from '../components/Context'
import { useReduxContext as useDefaultReduxContext } from './useReduxContext'

/**
 * Hook factory, which creates a `useStore` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useStore` hook bound to the specified context.
 */
export function createStoreHook<
  S = unknown,
  A extends BasicAction = AnyAction
  // @ts-ignore
>(context?: Context<ReactReduxContextValue<S, A>> = ReactReduxContext) { // 要注意context的默认为ReactReduxContext！！！ // +++
  // src/hooks/useReduxContext.ts下的useReduxContext
  const useReduxContext =
    // @ts-ignore
    context === ReactReduxContext // 相等的
      ? useDefaultReduxContext // +++
      : () => useContext(context)

  // 返回一个函数 // +++
  return function useStore<
    State = S,
    Action extends BasicAction = A
    // @ts-ignore
  >() {
    // 执行这个hook
    const { store } = useReduxContext()!
    // Provider函数式组件中在Context.Provider传递的value对象
    // store、subscription等属性
    // 解构出来 // +++
    // +++

    // @ts-ignore
    return store as Store<State, Action>
    // 返回store对象 // +++
  }
}

/**
 * A hook to access the redux store.
 *
 * @returns {any} the redux store
 *
 * @example
 *
 * import React from 'react'
 * import { useStore } from 'react-redux'
 *
 * export const ExampleComponent = () => {
 *   const store = useStore()
 *   return <div>{store.getState()}</div>
 * }
 */
export const useStore = /*#__PURE__*/ createStoreHook() // 创建store hook
// undefined -> ReactReduxContext作为参数context啦 ~

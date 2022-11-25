import React, { Context, ReactNode, useMemo } from 'react'
import { ReactReduxContext, ReactReduxContextValue } from './Context'
import { createSubscription } from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import { Action, AnyAction, Store } from 'redux'

export interface ProviderProps<A extends Action = AnyAction, S = unknown> {
  /**
   * The single Redux store in your application.
   */
  store: Store<S, A>

  /**
   * An optional server state snapshot. Will be used during initial hydration render if available, to ensure that the UI output is consistent with the HTML generated on the server.
   */
  serverState?: S

  /**
   * Optional context to be used internally in react-redux. Use React.createContext() to create a context to be used.
   * If this is used, you'll need to customize `connect` by supplying the same context provided to the Provider.
   * Initial value doesn't matter, as it is overwritten with the internal state of Provider.
   */
  context?: Context<ReactReduxContextValue<S, A>>
  children: ReactNode
}

// Provider函数式组件 // +++
function Provider<A extends Action = AnyAction, S = unknown>({ // props对象中的store、context、children、serverState属性 // +++
  store,
  context,
  children,
  serverState,
}: ProviderProps<A, S>) {

  // 使用useMemo hook
  const contextValue = useMemo(() => {
    // 创建一个关于这个store的订阅对象
    // src/utils/Subscription.ts
    const subscription = createSubscription(store) // 第二个参数没有默认值的 // +++

    // 返回一个对象 // +++
    return {
      store, // store对象
      subscription, // 订阅对象
      getServerState: serverState ? () => serverState : undefined,
    }
  }, [store, serverState]) // 监视store以及serverState的值变化

  // 还是使用useMemo hook
  const previousState = useMemo(() => store.getState() /** 直接store获取状态 // +++ */, [store]) // 监视store值的变化

  // Isomorphic:  同构的
  // src/utils/useIsomorphicLayoutEffect.ts - // 可以使用dom则使用useLayoutEffect，不可以使用的话则使用useEffect // +++
  useIsomorphicLayoutEffect(() => {
    // 拿到上面的订阅对象
    const { subscription } = contextValue
    // 对订阅对象添加onStateChange属性为订阅对象的【通知嵌套订阅】函数 // +++
    subscription.onStateChange = subscription.notifyNestedSubs
    // 执行订阅对象的尝试订阅函数 // +++
    subscription.trySubscribe()

    // 再次获取状态与之前状态进行对比
    if (previousState !== store.getState()) {
      // 不一样直接执行【通知嵌套订阅】函数
      subscription.notifyNestedSubs()
    }
    return () => {
      // 尝试取消订阅
      subscription.tryUnsubscribe()
      // onStateChange属性置为undefined
      subscription.onStateChange = undefined
    }
  }, [contextValue, previousState])

  // 当前props对象中是否有context属性也就是在使用当前Provider函数式组件<Provider store={store}>时有没有传递这个属性
  const Context = context || ReactReduxContext // 没有则使用内部提供的一个react redux context

  // 结合下面来看很显然这个Context的值必然是createContext api执行后的结果
  // 因为下面使用了Context.Provider组件 // +++

  // @ts-ignore 'AnyAction' is assignable to the constraint of type 'A', but 'A' could be instantiated with a different subtype
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
  // 提供的value就是上面计算出来的contextValue值对象，然后对children进行包裹 // +++
}

/* 
Provider函数式组件中的useLayoutEffect
src/hooks/useSelector.ts下的useSelector hook中使用的useSyncExternalStoreWithSelector中的useSyncExternalStore中内部使用的useEffect会去
  执行subscription.addNestedSub函数，同时传入的listener参数就是handleStoreChange -> forceStoreRerender函数（内部会去SyncLane然后scheduleUpdateOnFiber执行的）

useLayoutEffect的cb是先执行的 // 要注意！！！
  subscription.onStateChange = subscription.notifyNestedSubs
  subscription.trySubscribe()
    store.subscribe(handleChangeWrapper)

useEffect的cb相对后执行的
  subscription.addNestedSub


最终产生的效果是store中的nextListeners数组[handleChangeWrapper]
subscription中的listeners对象形成first -> handleStoreChange <- last

// ===

src/hooks/useDispatch.ts下的useDispatch hook返回的dispatch执行
  // 其实就是benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/applyMiddleware.ts下的dispatch变量指向的函数 // +++

整体引发的更新流程大致为：
  benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/applyMiddleware.ts下的dispatch指向的函数 -> 
  benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/createStore.ts下的dispatch函数 -> 
  root reducer执行产生值交给current state - 然后一一执行listener - 这里也就是handleChangeWrapper函数 -> 
  onStateChange函数的执行 -> notifyNestedSubs函数的执行 -> 执行listeners对象的notify函数 -> 一一执行listener - 这里也就是handleStoreChange -> forceStoreRerender函数 -> 
  SyncLane - scheduleUpdateOnFiber -> ensureRootIsScheduled

注意以下问题：
benxiaohaiw/react-source-analysis-v18.2.0/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.new.js下的ensureRootIsScheduled函数
  existingCallbackPriority === newCallbackPriority - return // 重点要注意！！！

https://github.com/benxiaohaiw/react-source-analysis-v18.2.0/commit/0f91a672c2e598823800cff71e357f1b62dff866#diff-cfa128bca4d5b386950dc89bf856c5b071a8a081cf7edce12802a415eef1e72d
  handleStoreChange
    checkIfSnapshotChanged // 检查是否变化了 // +++ 重点 // +++
      forceStoreRerender

*/

export default Provider

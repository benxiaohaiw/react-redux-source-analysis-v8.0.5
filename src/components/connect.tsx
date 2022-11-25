/* eslint-disable valid-jsdoc, @typescript-eslint/no-unused-vars */
import hoistStatics from 'hoist-non-react-statics'
import React, { ComponentType, useContext, useMemo, useRef } from 'react'
import { isValidElementType, isContextConsumer } from 'react-is'

import type { Store } from 'redux'

import type {
  ConnectedComponent,
  InferableComponentEnhancer,
  InferableComponentEnhancerWithProps,
  ResolveThunks,
  DispatchProp,
  ConnectPropsMaybeWithoutContext,
} from '../types'

import defaultSelectorFactory, {
  MapStateToPropsParam,
  MapDispatchToPropsParam,
  MergeProps,
  MapDispatchToPropsNonObject,
  SelectorFactoryOptions,
} from '../connect/selectorFactory'
import { mapDispatchToPropsFactory } from '../connect/mapDispatchToProps'
import { mapStateToPropsFactory } from '../connect/mapStateToProps'
import { mergePropsFactory } from '../connect/mergeProps'

import { createSubscription, Subscription } from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import shallowEqual from '../utils/shallowEqual'
import warning from '../utils/warning'

import {
  ReactReduxContext,
  ReactReduxContextValue,
  ReactReduxContextInstance,
} from './Context'

import type { uSES } from '../utils/useSyncExternalStore'
import { notInitialized } from '../utils/useSyncExternalStore'

let useSyncExternalStore = notInitialized as uSES

// 初始化useSyncExternalStore // 将在src/index.ts中进行初始化 // +++
// 实际上就是react hooks中的useSyncExternalStore hook
export const initializeConnect = (fn: uSES) => {
  useSyncExternalStore = fn
}

// Define some constant arrays just to avoid re-creating these
const EMPTY_ARRAY: [unknown, number] = [null, 0]
const NO_SUBSCRIPTION_ARRAY = [null, null]

// Attempts to stringify whatever not-really-a-component value we were given
// for logging in an error message
const stringifyComponent = (Comp: unknown) => {
  try {
    return JSON.stringify(Comp)
  } catch (err) {
    return String(Comp)
  }
}

type EffectFunc = (...args: any[]) => void | ReturnType<React.EffectCallback>

// This is "just" a `useLayoutEffect`, but with two modifications:
// - we need to fall back to `useEffect` in SSR to avoid annoying warnings
// - we extract this to a separate function to avoid closing over values
//   and causing memory leaks
function useIsomorphicLayoutEffectWithArgs(
  effectFunc: EffectFunc,
  effectArgs: any[],
  dependencies?: React.DependencyList
) {
  useIsomorphicLayoutEffect(() => effectFunc(...effectArgs), dependencies)
}

// Effect callback, extracted: assign the latest props values to refs for later usage
function captureWrapperProps(
  lastWrapperProps: React.MutableRefObject<unknown>,
  lastChildProps: React.MutableRefObject<unknown>,
  renderIsScheduled: React.MutableRefObject<boolean>,
  wrapperProps: unknown,
  // actualChildProps: unknown,
  childPropsFromStoreUpdate: React.MutableRefObject<unknown>,
  notifyNestedSubs: () => void
) {
  // We want to capture the wrapper props and child props we used for later comparisons
  lastWrapperProps.current = wrapperProps
  renderIsScheduled.current = false

  // If the render was from a store update, clear out that reference and cascade the subscriber update
  if (childPropsFromStoreUpdate.current) {
    childPropsFromStoreUpdate.current = null
    notifyNestedSubs()
  }
}

// Effect callback, extracted: subscribe to the Redux store or nearest connected ancestor,
// check for updates after dispatched actions, and trigger re-renders.
function subscribeUpdates(
  shouldHandleStateChanges: boolean,
  store: Store,
  subscription: Subscription,
  childPropsSelector: (state: unknown, props: unknown) => unknown,
  lastWrapperProps: React.MutableRefObject<unknown>,
  lastChildProps: React.MutableRefObject<unknown>,
  renderIsScheduled: React.MutableRefObject<boolean>,
  isMounted: React.MutableRefObject<boolean>,
  childPropsFromStoreUpdate: React.MutableRefObject<unknown>,
  notifyNestedSubs: () => void,
  // forceComponentUpdateDispatch: React.Dispatch<any>,
  additionalSubscribeListener: () => void // handleStoreChange
) {
  // 如果我们没有订阅商店，这里无事可做
  // If we're not subscribed to the store, nothing to do here
  if (!shouldHandleStateChanges) return () => {} // 返回空函数

  // Capture values for checking if and when this component unmounts
  let didUnsubscribe = false // 已经取消订阅 - 默认没有
  let lastThrownError: Error | null = null // 上一次抛出的错误

  // 每次商店订阅更新传播到此组件时，我们都会运行此回调 // +++
  // We'll run this callback every time a store subscription update propagates to this component
  const checkForUpdates = () => {
    // 已经取消订阅了 或 不是已挂载 - 直接return
    if (didUnsubscribe || !isMounted.current) {
      // Don't run stale listeners.
      // Redux doesn't guarantee unsubscriptions happen until next dispatch.
      return
    }

    // TODO We're currently calling getState ourselves here, rather than letting `uSES` do it
    const latestStoreState = store.getState() // 再次获取最新的状态 // +++

    let newChildProps, error
    try {
      // Actually run the selector with the most recent store state and wrapper props
      // to determine what the child props should be
      newChildProps = childPropsSelector(
        latestStoreState, // 最新的状态 // +++
        lastWrapperProps.current // 属性 // +++
      ) // src/connect/selectorFactory.ts下的pureFinalPropsSelectorFactory函数所返回的pureFinalPropsSelector函数执行
      // 还是经过用户写的mapStateToProps + mapDispatchToProps => mergeProps -> 最终处理后的属性对象
    } catch (e) {
      error = e
      lastThrownError = e as Error | null
    }

    if (!error) {
      lastThrownError = null
    }

    // 如果 child props 没有改变，这里无事可做 - 级联订阅更新 // +++
    // If the child props haven't changed, nothing to do here - cascade the subscription update
    if (newChildProps === lastChildProps.current) { // 新的和上一次的相等
      // 没有渲染是已调度的
      if (!renderIsScheduled.current) {
        notifyNestedSubs() // 通知嵌套订阅 // +++
      }
    } else {
      // Save references to the new child props.  Note that we track the "child props from store update"
      // as a ref instead of a useState/useReducer because we need a way to determine if that value has
      // been processed.  If this went into useState/useReducer, we couldn't clear out the value without
      // forcing another re-render, which we don't want.
      // 更新 // +++
      lastChildProps.current = newChildProps
      // 更新 // +++
      childPropsFromStoreUpdate.current = newChildProps
      // 标记
      renderIsScheduled.current = true // 标记 // +++

      // TODO This is hacky and not how `uSES` is meant to be used
      // Trigger the React `useSyncExternalStore` subscriber
      additionalSubscribeListener() // +++ - handleStoreChange
      /* 
      https://github.com/benxiaohaiw/react-source-analysis-v18.2.0/commit/0f91a672c2e598823800cff71e357f1b62dff866#diff-cfa128bca4d5b386950dc89bf856c5b071a8a081cf7edce12802a415eef1e72d
        handleStoreChange
          checkIfSnapshotChanged // 检查是否变化了 // +++ 重点 // +++
            forceStoreRerender
      */
    }
  }

  // 实际上订阅最近的已连接祖先（或商店）
  // Actually subscribe to the nearest connected ancestor (or store)
  subscription.onStateChange = checkForUpdates // 添加onStateChange属性为上面的checkForUpdates函数 // +++

  // 执行【尝试订阅】函数 // +++
  subscription.trySubscribe()
  /* 
  当前会造成以下影响：
  在Provider函数式组件中创建的subscription对象将作为这个subscription对象的【父级】
  所以在执行这里subscription对象的trySubscribe函数时就会走
    parentSub.addNestedSub(handleChangeWrapper)
    listeners = createListenerCollection()
  */

  // 在第一次渲染后从store中提取数据，以防store自我们开始以来发生了更改。
  // Pull data from the store after first render in case the store has
  // changed since we began.
  checkForUpdates()

  // 取消订阅包裹函数
  const unsubscribeWrapper = () => {
    didUnsubscribe = true
    subscription.tryUnsubscribe()
    subscription.onStateChange = null

    if (lastThrownError) {
      // It's possible that we caught an error due to a bad mapState function, but the
      // parent re-rendered without this component and we're about to unmount.
      // This shouldn't happen as long as we do top-down subscriptions correctly, but
      // if we ever do those wrong, this throw will surface the error in our tests.
      // In that case, throw the error from here so it doesn't get lost.
      throw lastThrownError
    }
  }

  // 返回【取消订阅包裹函数】 // +++
  return unsubscribeWrapper
}

// Reducer initial state creation for our update reducer
const initStateUpdates = () => EMPTY_ARRAY

export interface ConnectProps {
  /** A custom Context instance that the component can use to access the store from an alternate Provider using that same Context instance */
  context?: ReactReduxContextInstance
  /** A Redux store instance to be used for subscriptions instead of the store from a Provider */
  store?: Store
}

interface InternalConnectProps extends ConnectProps {
  reactReduxForwardedRef?: React.ForwardedRef<unknown>
}

function strictEqual(a: unknown, b: unknown) {
  return a === b
}

/**
 * Infers the type of props that a connector will inject into a component.
 */
export type ConnectedProps<TConnector> =
  TConnector extends InferableComponentEnhancerWithProps<
    infer TInjectedProps,
    any
  >
    ? unknown extends TInjectedProps
      ? TConnector extends InferableComponentEnhancer<infer TInjectedProps>
        ? TInjectedProps
        : never
      : TInjectedProps
    : never

export interface ConnectOptions<
  State = unknown,
  TStateProps = {},
  TOwnProps = {},
  TMergedProps = {}
> {
  forwardRef?: boolean
  context?: typeof ReactReduxContext
  areStatesEqual?: (
    nextState: State,
    prevState: State,
    nextOwnProps: TOwnProps,
    prevOwnProps: TOwnProps
  ) => boolean

  areOwnPropsEqual?: (
    nextOwnProps: TOwnProps,
    prevOwnProps: TOwnProps
  ) => boolean

  areStatePropsEqual?: (
    nextStateProps: TStateProps,
    prevStateProps: TStateProps
  ) => boolean
  areMergedPropsEqual?: (
    nextMergedProps: TMergedProps,
    prevMergedProps: TMergedProps
  ) => boolean
}

/**
 * Connects a React component to a Redux store.
 *
 * - Without arguments, just wraps the component, without changing the behavior / props
 *
 * - If 2 params are passed (3rd param, mergeProps, is skipped), default behavior
 * is to override ownProps (as stated in the docs), so what remains is everything that's
 * not a state or dispatch prop
 *
 * - When 3rd param is passed, we don't know if ownProps propagate and whether they
 * should be valid component props, because it depends on mergeProps implementation.
 * As such, it is the user's responsibility to extend ownProps interface from state or
 * dispatch props or both when applicable
 *
 * @param mapStateToProps
 * @param mapDispatchToProps
 * @param mergeProps
 * @param options
 */
export interface Connect<DefaultState = unknown> {
  // tslint:disable:no-unnecessary-generics
  (): InferableComponentEnhancer<DispatchProp>

  /** mapState only */
  <TStateProps = {}, no_dispatch = {}, TOwnProps = {}, State = DefaultState>(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>
  ): InferableComponentEnhancerWithProps<TStateProps & DispatchProp, TOwnProps>

  /** mapDispatch only (as a function) */
  <no_state = {}, TDispatchProps = {}, TOwnProps = {}>(
    mapStateToProps: null | undefined,
    mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<TDispatchProps, TOwnProps>

  /** mapDispatch only (as an object) */
  <no_state = {}, TDispatchProps = {}, TOwnProps = {}>(
    mapStateToProps: null | undefined,
    mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<
    ResolveThunks<TDispatchProps>,
    TOwnProps
  >

  /** mapState and mapDispatch (as a function)*/
  <TStateProps = {}, TDispatchProps = {}, TOwnProps = {}, State = DefaultState>(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<
    TStateProps & TDispatchProps,
    TOwnProps
  >

  /** mapState and mapDispatch (nullish) */
  <TStateProps = {}, TDispatchProps = {}, TOwnProps = {}, State = DefaultState>(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: null | undefined
  ): InferableComponentEnhancerWithProps<TStateProps, TOwnProps>

  /** mapState and mapDispatch (as an object) */
  <TStateProps = {}, TDispatchProps = {}, TOwnProps = {}, State = DefaultState>(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<
    TStateProps & ResolveThunks<TDispatchProps>,
    TOwnProps
  >

  /** mergeProps only */
  <no_state = {}, no_dispatch = {}, TOwnProps = {}, TMergedProps = {}>(
    mapStateToProps: null | undefined,
    mapDispatchToProps: null | undefined,
    mergeProps: MergeProps<undefined, DispatchProp, TOwnProps, TMergedProps>
  ): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>

  /** mapState and mergeProps */
  <
    TStateProps = {},
    no_dispatch = {},
    TOwnProps = {},
    TMergedProps = {},
    State = DefaultState
  >(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: null | undefined,
    mergeProps: MergeProps<TStateProps, DispatchProp, TOwnProps, TMergedProps>
  ): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>

  /** mapDispatch (as a object) and mergeProps */
  <no_state = {}, TDispatchProps = {}, TOwnProps = {}, TMergedProps = {}>(
    mapStateToProps: null | undefined,
    mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
    mergeProps: MergeProps<undefined, TDispatchProps, TOwnProps, TMergedProps>
  ): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>

  /** mapState and options */
  <TStateProps = {}, no_dispatch = {}, TOwnProps = {}, State = DefaultState>(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: null | undefined,
    mergeProps: null | undefined,
    options: ConnectOptions<State, TStateProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<DispatchProp & TStateProps, TOwnProps>

  /** mapDispatch (as a function) and options */
  <TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
    mapStateToProps: null | undefined,
    mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>,
    mergeProps: null | undefined,
    options: ConnectOptions<{}, TStateProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<TDispatchProps, TOwnProps>

  /** mapDispatch (as an object) and options*/
  <TStateProps = {}, TDispatchProps = {}, TOwnProps = {}>(
    mapStateToProps: null | undefined,
    mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
    mergeProps: null | undefined,
    options: ConnectOptions<{}, TStateProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<
    ResolveThunks<TDispatchProps>,
    TOwnProps
  >

  /** mapState,  mapDispatch (as a function), and options */
  <TStateProps = {}, TDispatchProps = {}, TOwnProps = {}, State = DefaultState>(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: MapDispatchToPropsNonObject<TDispatchProps, TOwnProps>,
    mergeProps: null | undefined,
    options: ConnectOptions<State, TStateProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<
    TStateProps & TDispatchProps,
    TOwnProps
  >

  /** mapState,  mapDispatch (as an object), and options */
  <TStateProps = {}, TDispatchProps = {}, TOwnProps = {}, State = DefaultState>(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
    mergeProps: null | undefined,
    options: ConnectOptions<State, TStateProps, TOwnProps>
  ): InferableComponentEnhancerWithProps<
    TStateProps & ResolveThunks<TDispatchProps>,
    TOwnProps
  >

  /** mapState, mapDispatch, mergeProps, and options */
  <
    TStateProps = {},
    TDispatchProps = {},
    TOwnProps = {},
    TMergedProps = {},
    State = DefaultState
  >(
    mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>,
    mapDispatchToProps: MapDispatchToPropsParam<TDispatchProps, TOwnProps>,
    mergeProps: MergeProps<
      TStateProps,
      TDispatchProps,
      TOwnProps,
      TMergedProps
    >,
    options?: ConnectOptions<State, TStateProps, TOwnProps, TMergedProps>
  ): InferableComponentEnhancerWithProps<TMergedProps, TOwnProps>
  // tslint:enable:no-unnecessary-generics
}

let hasWarnedAboutDeprecatedPureOption = false

/**
 * Connects a React component to a Redux store.
 *
 * - Without arguments, just wraps the component, without changing the behavior / props
 *
 * - If 2 params are passed (3rd param, mergeProps, is skipped), default behavior
 * is to override ownProps (as stated in the docs), so what remains is everything that's
 * not a state or dispatch prop
 *
 * - When 3rd param is passed, we don't know if ownProps propagate and whether they
 * should be valid component props, because it depends on mergeProps implementation.
 * As such, it is the user's responsibility to extend ownProps interface from state or
 * dispatch props or both when applicable
 *
 * @param mapStateToProps A function that extracts values from state
 * @param mapDispatchToProps Setup for dispatching actions
 * @param mergeProps Optional callback to merge state and dispatch props together
 * @param options Options for configuring the connection
 *
 */
function connect<
  TStateProps = {},
  TDispatchProps = {},
  TOwnProps = {},
  TMergedProps = {},
  State = unknown
>(
  mapStateToProps?: MapStateToPropsParam<TStateProps, TOwnProps, State>, // 函数
  mapDispatchToProps?: MapDispatchToPropsParam<TDispatchProps, TOwnProps>, // 函数
  mergeProps?: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>, // 函数
  {
    // The `pure` option has been removed, so TS doesn't like us destructuring this to check its existence.
    // @ts-ignore
    pure,
    // 下面都是有默认参数的 // +++
    areStatesEqual = strictEqual, // 严格相等
    areOwnPropsEqual = shallowEqual, // 浅相等
    areStatePropsEqual = shallowEqual, // 浅相等
    areMergedPropsEqual = shallowEqual, // 浅相等

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false, // 默认为false // +++

    // the context consumer to use
    context = ReactReduxContext, // 要注意context的默认为ReactReduxContext！！！ // ++++++
  }: ConnectOptions<unknown, unknown, unknown, unknown> = {} // 默认是一个空对象
): unknown {
  if (process.env.NODE_ENV !== 'production') {
    if (pure !== undefined && !hasWarnedAboutDeprecatedPureOption) {
      hasWarnedAboutDeprecatedPureOption = true
      warning(
        'The `pure` option has been removed. `connect` is now always a "pure/memoized" component'
      )
    }
  }

  // 那么这里应该是src/components/Context.ts下的ReactReduxContext
  const Context = context

  // +++
  const initMapStateToProps = mapStateToPropsFactory(mapStateToProps)
  // +++
  const initMapDispatchToProps = mapDispatchToPropsFactory(mapDispatchToProps)
  // +++
  const initMergeProps = mergePropsFactory(mergeProps)

  /* 
  https://react-redux.js.org/api/connect#connect-parameters

  mapStateToProps?: (state, ownProps?) => Object
  mapDispatchToProps?: Object | (dispatch, ownProps?) => Object
  mergeProps?: (stateProps, dispatchProps, ownProps) => Object
  */

  // 由mapStateToProps是否有决定shouldHandleStateChanges的布尔值 // +++
  const shouldHandleStateChanges = Boolean(mapStateToProps)

  // 包裹函数 // +++
  const wrapWithConnect = <TProps,>(
    // 被包裹的组件 // +++
    WrappedComponent: ComponentType<TProps>
  ) => {
    type WrappedComponentProps = TProps &
      ConnectPropsMaybeWithoutContext<TProps>

    if (
      process.env.NODE_ENV !== 'production' &&
      !isValidElementType(WrappedComponent)
    ) {
      throw new Error(
        `You must pass a component to the function returned by connect. Instead received ${stringifyComponent(
          WrappedComponent
        )}`
      )
    }

    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = `Connect(${wrappedComponentName})`

    // 准备【选择器工厂参数】 // +++
    const selectorFactoryOptions: SelectorFactoryOptions<
      any,
      any,
      any,
      any,
      State
    > = {
      shouldHandleStateChanges,
      displayName,
      wrappedComponentName,
      WrappedComponent,
      // @ts-ignore
      initMapStateToProps,
      // @ts-ignore
      initMapDispatchToProps,
      initMergeProps,
      areStatesEqual,
      areStatePropsEqual,
      areOwnPropsEqual,
      areMergedPropsEqual,
    }
    // 就是一个对象 // +++

    // 这是一个函数式组件 - 其实它就可以说是connect()()执行后的最终组件（不包括下面被memo函数包裹以及下面的forwardRef函数包裹产生的组件了，去掉这两层啦 ~） // +++
    function ConnectFunction<TOwnProps>(
      props: InternalConnectProps & TOwnProps
    ) {

      // +++
      // 是props对象中的context属性, props中的reactReduxForwardedRef属性, 剩余的属性为wrapperProps // +++
      const [propsContext, reactReduxForwardedRef, wrapperProps] =
        useMemo(() => {
          // Distinguish between actual "data" props that were passed to the wrapper component,
          // and values needed to control behavior (forwarded refs, alternate context instances).
          // To maintain the wrapperProps object reference, memoize this destructuring.
          const { reactReduxForwardedRef, ...wrapperProps } = props
          return [props.context, reactReduxForwardedRef, wrapperProps]
          // 注意这里的props.context - 应该是一个undefined // +++
        }, [props])

      // 也就是src/components/Context.ts下的ReactReduxContext // +++
      const ContextToUse: ReactReduxContextInstance = useMemo(() => {
        // Users may optionally pass in a custom context instance to use instead of our ReactReduxContext.
        // Memoize the check that determines which context instance we should use.
        return propsContext && // undefined // +++
          propsContext.Consumer &&
          // @ts-ignore
          isContextConsumer(<propsContext.Consumer />)
          ? propsContext
          : Context // 也就是上面的src/components/Context.ts下的ReactReduxContext // +++
      }, [propsContext, Context])

      // Retrieve the store and ancestor subscription via context, if available
      const contextValue = useContext(ContextToUse) // +++
      // 这里使用useContext hook对src/components/Context.ts下的ReactReduxContext作为参数 // +++
      // 返回由该XxxContext.Provider提供的value值 // +++

      // The store _must_ exist as either a prop or in context.
      // We'll check to see if it _looks_ like a Redux store first.
      // This allows us to pass through a `store` prop that is just a plain value.
      const didStoreComeFromProps = // false // +++
        Boolean(props.store) &&
        Boolean(props.store!.getState) &&
        Boolean(props.store!.dispatch)
      const didStoreComeFromContext = // true // +++
        Boolean(contextValue) && Boolean(contextValue!.store)

      if (
        process.env.NODE_ENV !== 'production' &&
        !didStoreComeFromProps &&
        !didStoreComeFromContext
      ) {
        throw new Error(
          `Could not find "store" in the context of ` +
            `"${displayName}". Either wrap the root component in a <Provider>, ` +
            `or pass a custom React context provider to <Provider> and the corresponding ` +
            `React context consumer to ${displayName} in connect options.`
        )
      }

      // Based on the previous check, one of these must be true
      const store: Store = didStoreComeFromProps // false
        ? props.store!
        : contextValue!.store // 也就是benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/applyMiddleware.ts下的最终返回的对象啦 ~ // +++

      const getServerState = didStoreComeFromContext // true
        ? contextValue.getServerState // +++ src/components/Provider.tsx下的contextValue对象的getServerState属性 // +++
        : store.getState

      // 子属性选择器 - 是一个函数 - 其实就是src/connect/selectorFactory.ts下的pureFinalPropsSelectorFactory函数所返回的pureFinalPropsSelector函数
      const childPropsSelector = useMemo(() => {
        // The child props selector needs the store reference as an input.
        // Re-create this selector whenever the store changes.
        return defaultSelectorFactory(store.dispatch /** store.dispatch */, selectorFactoryOptions /** 上面准备好的一个对象 */) // src/connect/selectorFactory.ts下的finalPropsSelectorFactory函数 // +++
      }, [store])

      // 创建了一个新的订阅对象 // ===
      const [subscription, notifyNestedSubs] = useMemo(() => {
        if (!shouldHandleStateChanges) return NO_SUBSCRIPTION_ARRAY

        // This Subscription's source should match where store came from: props vs. context. A component
        // connected to the store via props shouldn't use subscription from context, or vice versa.
        const subscription = createSubscription(
          store,
          didStoreComeFromProps /** false */ ? undefined : contextValue!.subscription // 【父订阅对象】 // +++ 注意这里是【父订阅对象】 // +++
        )
        // 这里又创建一个订阅对象 // +++
        /* 
        因为有【父订阅对象】所以在执行这个subscription的trySubscribe时会产生下面的逻辑 // +++
          parentSub.addNestedSub(handleChangeWrapper)
          listeners = createListenerCollection()
        */

        // `notifyNestedSubs` is duplicated to handle the case where the component is unmounted in
        // the middle of the notification loop, where `subscription` will then be null. This can
        // probably be avoided if Subscription's listeners logic is changed to not call listeners
        // that have been unsubscribed in the  middle of the notification loop.
        const notifyNestedSubs =
          subscription.notifyNestedSubs.bind(subscription)
        
        /* 
        notifyNestedSubs中的逻辑 // +++
          listeners.notify()
        */

        return [subscription, notifyNestedSubs]
      }, [store, didStoreComeFromProps, contextValue])

      // Determine what {store, subscription} value should be put into nested context, if necessary,
      // and memoize that value to avoid unnecessary context updates.
      const overriddenContextValue = useMemo(() => {
        if (didStoreComeFromProps) { // false // +++
          // This component is directly subscribed to a store from props.
          // We don't want descendants reading from this store - pass down whatever
          // the existing context value is from the nearest connected ancestor.
          return contextValue!
        }

        // Otherwise, put this component's subscription instance into context, so that
        // connected descendants won't update until after this component is done
        return {
          ...contextValue,
          subscription, // 重写这个subscription对象为这里创建的【新的对象】 // +++
        } as ReactReduxContextValue
      }, [didStoreComeFromProps /** false */, contextValue /** 由Provider组件提供的对象 */, subscription /** 上面创建的订阅对象 */])
      // 重写contextValue - 其实就是重写subscription对象为这里创建的新的对象 // +++

      // useRef的应用 // +++
      // Set up refs to coordinate values between the subscription effect and the render logic
      const lastChildProps = useRef<unknown>()
      const lastWrapperProps = useRef(wrapperProps)
      const childPropsFromStoreUpdate = useRef<unknown>()
      const renderIsScheduled = useRef(false)
      const isProcessingDispatch = useRef(false)
      const isMounted = useRef(false)

      const latestSubscriptionCallbackError = useRef<Error>()

      // // 可以使用dom则使用useLayoutEffect，不可以使用的话则使用useEffect // +++
      useIsomorphicLayoutEffect(() => {
        isMounted.current = true
        return () => {
          isMounted.current = false
        }
      }, [])

      // 实际的子属性选择器
      const actualChildPropsSelector = useMemo(() => {
        // 选择器函数 // +++
        const selector = () => {
          // Tricky logic here:
          // - This render may have been triggered by a Redux store update that produced new child props
          // - However, we may have gotten new wrapper props after that
          // If we have new child props, and the same wrapper props, we know we should use the new child props as-is.
          // But, if we have new wrapper props, those might change the child props, so we have to recalculate things.
          // So, we'll use the child props from store update only if the wrapper props are the same as last time.
          if (
            childPropsFromStoreUpdate.current &&
            wrapperProps === lastWrapperProps.current
          ) {
            return childPropsFromStoreUpdate.current
          }

          // TODO We're reading the store directly in render() here. Bad idea?
          // This will likely cause Bad Things (TM) to happen in Concurrent Mode.
          // Note that we do this because on renders _not_ caused by store updates, we need the latest store state
          // to determine what the child props should be.
          return childPropsSelector(store.getState(), wrapperProps) // src/connect/selectorFactory.ts下的pureFinalPropsSelectorFactory函数所返回的pureFinalPropsSelector函数执行
          // 参数为store获取状态, 除了reactReduxForwardedRef之外的其余属性组成的对象
          // 还是经过用户写的mapStateToProps + mapDispatchToProps => mergeProps -> 最终处理后的属性对象
        }
        // 返回这个函数 // +++
        return selector
      }, [store, wrapperProps /** props对象中除了context, reactReduxForwardedRef之外的其余属性组成的对象 */])

      // We need this to execute synchronously every time we re-render. However, React warns
      // about useLayoutEffect in SSR, so we try to detect environment and fall back to
      // just useEffect instead to avoid the warning, since neither will run anyway.

      // 对应react的订阅 // +++
      const subscribeForReact = useMemo(() => {

        // 准备subscribe函数
        const subscribe = (reactListener: () => void) => { // 接收的参数其实就是handleStoreChange
          /* 
          https://github.com/benxiaohaiw/react-source-analysis-v18.2.0/commit/0f91a672c2e598823800cff71e357f1b62dff866#diff-cfa128bca4d5b386950dc89bf856c5b071a8a081cf7edce12802a415eef1e72d
            handleStoreChange
              checkIfSnapshotChanged // 检查是否变化了 // +++ 重点 // +++
                forceStoreRerender
          */
          
          if (!subscription) {
            return () => {}
          }

          // 执行【订阅更新函数】 // +++
          return subscribeUpdates(
            shouldHandleStateChanges,
            store,
            subscription,
            // @ts-ignore
            childPropsSelector,
            lastWrapperProps,
            lastChildProps,
            renderIsScheduled,
            isMounted,
            childPropsFromStoreUpdate,
            notifyNestedSubs,
            reactListener // 这个参数将作为执行该函数的最后一个参数 // +++
          )
        }

        // 返回这个subscribe函数
        return subscribe
      }, [subscription])

      useIsomorphicLayoutEffectWithArgs(captureWrapperProps, [
        lastWrapperProps,
        lastChildProps,
        renderIsScheduled,
        wrapperProps,
        childPropsFromStoreUpdate,
        notifyNestedSubs,
      ])

      // 实际的子属性
      let actualChildProps: Record<string, unknown>

      try {

        // +++
        // +++ 实际的子属性 - 【也就是得到的最终的属性对象（由mapStateToProps + mapDispatchToProps => mergeProps -> 最终处理后的属性对象 - 下面直接将它作为属性全部传递给【被包裹组件】） // ===】
        // 使用useSyncExternalStore hook // +++
        actualChildProps = useSyncExternalStore( // ++++++
          // TODO We're passing through a big wrapper that does a bunch of extra side effects besides subscribing
          subscribeForReact, // ++++++ 【订阅函数】 // +++
          // +++

          // TODO This is incredibly hacky. We've already processed the store update and calculated new child props,
          // TODO and we're just passing that through so it triggers a re-render for us rather than relying on `uSES`.
          actualChildPropsSelector, // ++++++ 【获取快照函数】 // +++
          // +++

          getServerState
            ? () => childPropsSelector(getServerState(), wrapperProps)
            : actualChildPropsSelector
        )
        // +++
        // ++++++

      } catch (err) {
        if (latestSubscriptionCallbackError.current) {
          ;(
            err as Error
          ).message += `\nThe error may be correlated with this previous error:\n${latestSubscriptionCallbackError.current.stack}\n\n`
        }

        throw err
      }

      useIsomorphicLayoutEffect(() => {
        latestSubscriptionCallbackError.current = undefined
        childPropsFromStoreUpdate.current = undefined
        lastChildProps.current = actualChildProps
      })

      // Now that all that's done, we can finally try to actually render the child component.
      // We memoize the elements for the rendered child component as an optimization.
      const renderedWrappedComponent = useMemo(() => {
        return (
          // @ts-ignore
          <WrappedComponent // 我们的参数 - 也就是被包裹的组件 // +++
            {...actualChildProps} // 【这里把实际的子属性作为props全部传递进去】 // ++++++
            ref={reactReduxForwardedRef} // ref
          />
        )
      }, [reactReduxForwardedRef, WrappedComponent, actualChildProps])
      // 要渲染的包裹组件 // ++++++

      // If React sees the exact same element reference as last time, it bails out of re-rendering
      // that child, same as if it was wrapped in React.memo() or returned false from shouldComponentUpdate.
      const renderedChild = useMemo(() => {
        // true
        if (shouldHandleStateChanges) {
          // If this component is subscribed to store updates, we need to pass its own
          // subscription instance down to our descendants. That means rendering the same
          // Context instance, and putting a different value into the context.
          return (
            // 提供overriddenContextValue给上面的渲染的包裹组件
            // 再次使用src/components/Context.ts下的ReactReduxContext的Provider组件进而提供value值为重写后的contextValue - 其实也就是把subscription对象重写为当前这里所创建的新的subscription对象啦 ~ // +++
            <ContextToUse.Provider value={overriddenContextValue}>
              {renderedWrappedComponent /** ++++++====== */}
            </ContextToUse.Provider>
          )
        }

        // 直接就是返回上面的要渲染的包裹组件
        return renderedWrappedComponent
      }, [ContextToUse, renderedWrappedComponent, overriddenContextValue])

      // 返回渲染的孩子 // ++++++
      return renderedChild
    }

    // 使用memo函数进行包裹这个ConnectFunction函数式组件
    const _Connect = React.memo(ConnectFunction) // 产生一个Memo组件

    type ConnectedWrapperComponent = typeof _Connect & {
      WrappedComponent: typeof WrappedComponent
    }

    // Add a hacky cast to get the right output type
    const Connect = _Connect as unknown as ConnectedComponent<
      typeof WrappedComponent,
      WrappedComponentProps
    >
    // Connect为_Connect // +++

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = ConnectFunction.displayName = displayName

    // 是否有forwardRef
    if (forwardRef) {

      // 使用forwardRef函数包裹这个forwardConnectRef函数式组件 // +++
      // 产生一个ForwardRef组件 // ++++++
      const _forwarded = React.forwardRef(function forwardConnectRef(
        props, // +++
        ref
      ) {
        // @ts-ignore
        return <Connect {...props} reactReduxForwardedRef={ref} /> // 返回的是Connect // +++
        // ref到这里就变为了reactReduxForwardedRef属性啦 ~
      })

      const forwarded = _forwarded as ConnectedWrapperComponent
      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent

      // 这个函数执行的结果还是返回的是forwarded值 // +++
      return hoistStatics(forwarded, WrappedComponent)
    }

    // https://github.com/mridgway/hoist-non-react-statics
    return hoistStatics(Connect, WrappedComponent) // 这个函数执行的结果还是返回的是Connect值 // +++
  }


  // 返回这个函数 // +++
  return wrapWithConnect
}

/// 用法 // +++
// connect()()

// 总结connect // +++
/* 
Provider函数式组件中的useLayoutEffect 还有其中所创建的subscription对象（父级A）
connect
  wrapWithConnect
    // ConnectFunction这是一个函数式组件 - 其实它就可以说是connect()()执行后的最终组件（不包括下面被memo函数包裹以及下面的forwardRef函数包裹产生的组件了，去掉这两层啦 ~） // +++
    在ConnectFunction函数式组件内部
      useSyncExternalStore中内部使用的useEffect会去执行subscribeForReact: subscribe函数（同时传入的reactListener参数就是handleStoreChange -> forceStoreRerender函数（内部会去SyncLane然后scheduleUpdateOnFiber执行的）） -> subscribeUpdates -> 下面
      
      // 以下subscription为在ConnectFunction函数式组件内创建的一个【新的订阅对象】 - 子 // +++
      subscription.onStateChange = checkForUpdates // 添加onStateChange属性为上面的checkForUpdates函数 // +++
      // 执行【尝试订阅】函数 // +++
      subscription.trySubscribe()
      当前会造成以下影响：
      在Provider函数式组件中创建的subscription对象将作为这个subscription对象的【父级】
      所以在执行这里subscription对象的trySubscribe函数时就会走
        parentSub.addNestedSub(handleChangeWrapper) // 注意是父级A
        listeners = createListenerCollection()
      
      注意在checkForUpdates中
        additionalSubscribeListener() // +++ - handleStoreChange <- additionalSubscribeListener <- reactListener
        https://github.com/benxiaohaiw/react-source-analysis-v18.2.0/commit/0f91a672c2e598823800cff71e357f1b62dff866#diff-cfa128bca4d5b386950dc89bf856c5b071a8a081cf7edce12802a415eef1e72d
          handleStoreChange
            checkIfSnapshotChanged // 检查是否变化了 // +++ 重点 // +++
              forceStoreRerender

useLayoutEffect的cb是先执行的 // 要注意！！！
  // 父级A
  subscription.onStateChange = subscription.notifyNestedSubs
  subscription.trySubscribe()
    store.subscribe(handleChangeWrapper)

useEffect的cb相对后执行的
  parentSub.addNestedSub(handleChangeWrapper) // 注意是父级A // +++


最终产生的效果是store中的nextListeners数组[父handleChangeWrapper]
父级subscription中的listeners对象形成first -> 子handleChangeWrapper <- last

// ===

mapDispatchToProps: (dispatch) => ({
  decrement: () => dispatch({ type: 'counter/decrement' })
})
这里的dispatch函数的执行
  // 其实就是benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/applyMiddleware.ts下的dispatch变量指向的函数 // +++

整体引发的更新流程大致为：
  benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/applyMiddleware.ts下的dispatch指向的函数 -> 
  benxiaohaiw/redux-source-analysis-v5.0.0-alpha.0/src/createStore.ts下的dispatch函数 -> 
  root reducer执行产生值交给current state - 然后一一执行listener - 这里也就是【父级A subscription对象】的handleChangeWrapper函数 -> 
  onStateChange函数的执行 -> notifyNestedSubs函数的执行 -> 执行listeners对象的notify函数 -> 一一执行listener - 这里也就是【子订阅对象】的handleChangeWrapper函数 -> 【子订阅对象】的onStateChange函数的执行 -> 
  checkForUpdates -> additionalSubscribeListener: handleStoreChange -> forceStoreRerender函数 -> SyncLane - scheduleUpdateOnFiber -> ensureRootIsScheduled

注意以下问题：
benxiaohaiw/react-source-analysis-v18.2.0/blob/main/packages/react-reconciler/src/ReactFiberWorkLoop.new.js下的ensureRootIsScheduled函数
  existingCallbackPriority === newCallbackPriority - return // 重点要注意！！！

https://github.com/benxiaohaiw/react-source-analysis-v18.2.0/commit/0f91a672c2e598823800cff71e357f1b62dff866#diff-cfa128bca4d5b386950dc89bf856c5b071a8a081cf7edce12802a415eef1e72d
  handleStoreChange
    checkIfSnapshotChanged // 检查是否变化了 // +++ 重点 // +++
      forceStoreRerender

*/

// 在ConnectFunction函数式组件内使用的useSyncExternalStore hook中传入的actualChildPropsSelector参数函数（实际的子属性选择器函数）导致该hook返回的结果值是最终的属性对象（由mapStateToProps + mapDispatchToProps => mergeProps -> 最终处理后的属性对象 - 直接将它作为属性全部传递给【被包裹组件】） // ===】

export default connect as Connect
// 默认导出connect函数

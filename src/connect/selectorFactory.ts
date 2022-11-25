import type { Dispatch, Action } from 'redux'
import type { ComponentType } from 'react'
import verifySubselectors from './verifySubselectors'
import type { EqualityFn, ExtendedEqualityFn } from '../types'

export type SelectorFactory<S, TProps, TOwnProps, TFactoryOptions> = (
  dispatch: Dispatch<Action<unknown>>,
  factoryOptions: TFactoryOptions
) => Selector<S, TProps, TOwnProps>

export type Selector<S, TProps, TOwnProps = null> = TOwnProps extends
  | null
  | undefined
  ? (state: S) => TProps
  : (state: S, ownProps: TOwnProps) => TProps

export type MapStateToProps<TStateProps, TOwnProps, State> = (
  state: State,
  ownProps: TOwnProps
) => TStateProps

export type MapStateToPropsFactory<TStateProps, TOwnProps, State> = (
  initialState: State,
  ownProps: TOwnProps
) => MapStateToProps<TStateProps, TOwnProps, State>

export type MapStateToPropsParam<TStateProps, TOwnProps, State> =
  | MapStateToPropsFactory<TStateProps, TOwnProps, State>
  | MapStateToProps<TStateProps, TOwnProps, State>
  | null
  | undefined

export type MapDispatchToPropsFunction<TDispatchProps, TOwnProps> = (
  dispatch: Dispatch<Action<unknown>>,
  ownProps: TOwnProps
) => TDispatchProps

export type MapDispatchToProps<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFunction<TDispatchProps, TOwnProps>
  | TDispatchProps

export type MapDispatchToPropsFactory<TDispatchProps, TOwnProps> = (
  dispatch: Dispatch<Action<unknown>>,
  ownProps: TOwnProps
) => MapDispatchToPropsFunction<TDispatchProps, TOwnProps>

export type MapDispatchToPropsParam<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFactory<TDispatchProps, TOwnProps>
  | MapDispatchToProps<TDispatchProps, TOwnProps>

export type MapDispatchToPropsNonObject<TDispatchProps, TOwnProps> =
  | MapDispatchToPropsFactory<TDispatchProps, TOwnProps>
  | MapDispatchToPropsFunction<TDispatchProps, TOwnProps>

export type MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> = (
  stateProps: TStateProps,
  dispatchProps: TDispatchProps,
  ownProps: TOwnProps
) => TMergedProps

interface PureSelectorFactoryComparisonOptions<TStateProps, TOwnProps, State> {
  readonly areStatesEqual: ExtendedEqualityFn<State, TOwnProps>
  readonly areStatePropsEqual: EqualityFn<TStateProps>
  readonly areOwnPropsEqual: EqualityFn<TOwnProps>
}

// 纯最终属性选择器 // +++
export function pureFinalPropsSelectorFactory<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State
>(
  mapStateToProps: WrappedMapStateToProps<TStateProps, TOwnProps, State>,
  mapDispatchToProps: WrappedMapDispatchToProps<TDispatchProps, TOwnProps>,
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>,
  dispatch: Dispatch<Action<unknown>>,
  {
    areStatesEqual,
    areOwnPropsEqual,
    areStatePropsEqual,
  }: PureSelectorFactoryComparisonOptions<TStateProps, TOwnProps, State>
) {
  // 还没有至少运行一次
  let hasRunAtLeastOnce = false // +++
  let state: State
  let ownProps: TOwnProps
  let stateProps: TStateProps
  let dispatchProps: TDispatchProps
  let mergedProps: TMergedProps

  // 处理第一次执行
  function handleFirstCall(firstState: State, firstOwnProps: TOwnProps) { // store.getState(), /** 也就是可以说是connect()()最终返回的函数式组件ConnectFunction所接收的props对象中除了context, reactReduxForwardedRef之外的其余属性组成的对象 */
    state = firstState
    ownProps = firstOwnProps

    // 一一执行函数
    stateProps = mapStateToProps(state, ownProps)
    dispatchProps = mapDispatchToProps(dispatch, ownProps)
    
    // 执行函数
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    /* 
    到这里其实就相当于执行的是用户写的这三个函数 - 那么得到状态属性、派发属性 - 产生【合并属性对象】 - 最终返回这个【合并属性对象】 // +++
    */

    // 标记
    hasRunAtLeastOnce = true

    // 返回【合并属性对象】 // +++
    return mergedProps
  }

  function handleNewPropsAndNewState() {
    stateProps = mapStateToProps(state, ownProps)

    if (mapDispatchToProps.dependsOnOwnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }

  function handleNewProps() {
    if (mapStateToProps.dependsOnOwnProps)
      stateProps = mapStateToProps(state, ownProps)

    if (mapDispatchToProps.dependsOnOwnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    return mergedProps
  }

  function handleNewState() {
    const nextStateProps = mapStateToProps(state, ownProps)
    const statePropsChanged = !areStatePropsEqual(nextStateProps, stateProps)
    stateProps = nextStateProps

    if (statePropsChanged)
      mergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    return mergedProps
  }

  // 连续调用
  function handleSubsequentCalls(nextState: State, nextOwnProps: TOwnProps) {
    // 属性是否有变化
    const propsChanged = !areOwnPropsEqual(nextOwnProps, ownProps) // areOwnPropsEqual

    // 状态是否有变化
    const stateChanged = !areStatesEqual( // +++ areStatesEqual
      nextState,
      state,
      nextOwnProps,
      ownProps
    )

    // 赋值替换最新的 // +++
    state = nextState
    ownProps = nextOwnProps

    // 属性和状态都变化了
    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    // 只有属性变化了
    if (propsChanged) return handleNewProps()
    // 状态变化了
    if (stateChanged) return handleNewState()

    // 没有变化则依然返回合并属性 // +++
    return mergedProps
  }

  // 返回pureFinalPropsSelector函数
  return function pureFinalPropsSelector(
    nextState: State, // store.getState() // +++
    nextOwnProps: TOwnProps /** 也就是可以说是connect()()最终返回的函数式组件ConnectFunction所接收的props对象中除了context, reactReduxForwardedRef之外的其余属性组成的对象 */
  ) {
    return hasRunAtLeastOnce // +++
      ? handleSubsequentCalls(nextState, nextOwnProps) // +++
      : handleFirstCall(nextState, nextOwnProps) // +++
  }
}

interface WrappedMapStateToProps<TStateProps, TOwnProps, State> {
  (state: State, ownProps: TOwnProps): TStateProps
  readonly dependsOnOwnProps: boolean
}

interface WrappedMapDispatchToProps<TDispatchProps, TOwnProps> {
  (dispatch: Dispatch<Action<unknown>>, ownProps: TOwnProps): TDispatchProps
  readonly dependsOnOwnProps: boolean
}

export interface InitOptions<TStateProps, TOwnProps, TMergedProps, State>
  extends PureSelectorFactoryComparisonOptions<TStateProps, TOwnProps, State> {
  readonly shouldHandleStateChanges: boolean
  readonly displayName: string
  readonly wrappedComponentName: string
  readonly WrappedComponent: ComponentType<TOwnProps>
  readonly areMergedPropsEqual: EqualityFn<TMergedProps>
}

export interface SelectorFactoryOptions<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State
> extends InitOptions<TStateProps, TOwnProps, TMergedProps, State> {
  readonly initMapStateToProps: (
    dispatch: Dispatch<Action<unknown>>,
    options: InitOptions<TStateProps, TOwnProps, TMergedProps, State>
  ) => WrappedMapStateToProps<TStateProps, TOwnProps, State>
  readonly initMapDispatchToProps: (
    dispatch: Dispatch<Action<unknown>>,
    options: InitOptions<TStateProps, TOwnProps, TMergedProps, State>
  ) => WrappedMapDispatchToProps<TDispatchProps, TOwnProps>
  readonly initMergeProps: (
    dispatch: Dispatch<Action<unknown>>,
    options: InitOptions<TStateProps, TOwnProps, TMergedProps, State>
  ) => MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
}

// TODO: Add more comments

// The selector returned by selectorFactory will memoize its results,
// allowing connect's shouldComponentUpdate to return false if final
// props have not changed.

// 最终属性选择器 // ++++++
export default function finalPropsSelectorFactory<
  TStateProps,
  TOwnProps,
  TDispatchProps,
  TMergedProps,
  State
>(
  dispatch: Dispatch<Action<unknown>>, // ++++++ store.dispatch函数
  // 准备好的selectorFactoryOptions对象 // +++
  {
    initMapStateToProps,
    initMapDispatchToProps,
    initMergeProps,
    ...options // 其余的参数 // +++
  }: SelectorFactoryOptions<
    TStateProps,
    TOwnProps,
    TDispatchProps,
    TMergedProps,
    State
  >
) {

  // 一一执行 // +++ 那么它们得到的返回值依然是一个函数 // +++
  const mapStateToProps = initMapStateToProps(dispatch, options)
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  const mergeProps = initMergeProps(dispatch, options)

  if (process.env.NODE_ENV !== 'production') {
    verifySubselectors(mapStateToProps, mapDispatchToProps, mergeProps)
  }

  // 纯最终属性选择器 // +++
  return pureFinalPropsSelectorFactory<
    TStateProps,
    TOwnProps,
    TDispatchProps,
    TMergedProps,
    State
  >(mapStateToProps, mapDispatchToProps, mergeProps, dispatch /** +++ store.dispatch函数 +++ */, options /** 剩余的参数组成的对象 */)
}

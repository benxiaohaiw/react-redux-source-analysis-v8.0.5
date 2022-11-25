import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'
import { createInvalidArgFactory } from './invalidArgFactory'
import type { MapStateToPropsParam } from './selectorFactory'

// +++
export function mapStateToPropsFactory<TStateProps, TOwnProps, State>(
  mapStateToProps: MapStateToPropsParam<TStateProps, TOwnProps, State>
) {
  return !mapStateToProps // 没有参数
    ? wrapMapToPropsConstant(() => ({})) // 参数是一个返回的空对象的箭头函数 - 返回initConstantSelector函数
    : typeof mapStateToProps === 'function' // 是一个函数
    ? // @ts-ignore
      wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps') // +++ 返回initProxySelector函数
    : createInvalidArgFactory(mapStateToProps, 'mapStateToProps') // 创建无效参数 // 返回一个箭头函数
}

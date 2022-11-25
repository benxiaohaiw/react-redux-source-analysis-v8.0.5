import type { Action, Dispatch } from 'redux'

// 创建无效参数
export function createInvalidArgFactory(arg: unknown, name: string) {
  // 返回一个函数
  return (
    dispatch: Dispatch<Action<unknown>>,
    options: { readonly wrappedComponentName: string }
  ) => {
    // 直接抛出一个Error对象实例 // +++
    throw new Error(
      `Invalid value of type ${typeof arg} for ${name} argument when connecting component ${
        options.wrappedComponentName
      }.`
    )
  }
}

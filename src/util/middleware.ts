import RequestContext from '../RequestContext'
import { BeforeHandler, ResourceConfig } from '../ResourceConfig'

export function use<Cfg extends ResourceConfig<any, any> = any>(handler: MiddlewareHandler): Middleware<Cfg> {
  return config => {
    const before: BeforeHandler = context => {
      handler(context, () => {
        config.before?.(context)
      })
    }

    return {...config, before}
  }
}

export type Middleware<Cfg extends ResourceConfig<any, any>> = (config: Cfg) => Cfg
export type MiddlewareHandler = (context: RequestContext, next: () => void) => void | Promise<void>
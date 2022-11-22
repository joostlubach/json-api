import Pack from './Pack'
import RequestContext from './RequestContext'
import { AfterHandler, BeforeHandler, ResourceConfig } from './ResourceConfig'

export function before<Cfg extends ResourceConfig<any, any> = any>(handler: BeforeMiddlewareHandler): Middleware<Cfg> {
  return config => {
    const before: BeforeHandler = context => {
      handler(context, () => {
        config.before?.(context)
      })
    }

    return {...config, before}
  }
}

export function after<Cfg extends ResourceConfig<any, any> = any>(handler: AfterMiddlewareHandler): Middleware<Cfg> {
  return config => {
    const after: AfterHandler = (pack, context) => {
      handler(pack, context, () => {
        config.after?.(pack, context)
      })
    }

    return {...config, after}
  }
}

export type Middleware<Cfg extends ResourceConfig<any, any>> = (config: Cfg) => Cfg

export type BeforeMiddlewareHandler = (context: RequestContext, next: () => void) => void | Promise<void>
export type AfterMiddlewareHandler  = (responsePack: Pack, context: RequestContext, next: () => void) => void | Promise<void>
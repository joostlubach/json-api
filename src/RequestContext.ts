import { Request } from 'express'
import { Deps } from 'ydeps'
import { Constructor } from 'ytil'
import { z } from 'zod'

import APIError from './APIError'

export default class RequestContext<P extends Record<string, any> = Record<string, any>> {

  constructor(
    public readonly action: string,
    private readonly params: P,
    public readonly request: Request | null,
    deps?: Deps,
  ) {
    this.deps = new Deps({upstream: deps})
  }

  public readonly deps: Deps

  // #region Parameters

  /**
   * Retrieves a param, and optionally validates / coerces it to the given type.
   *
   * @param name The name of the parameter to retrieve.
   * @param type Optionally a type to validate against.
   */
  public param<T extends z.ZodType<any>>(name: string & keyof P, schema: T): z.infer<T>
  public param(name: string & keyof P): unknown
  public param(name: string & keyof P, schema?: z.Schema) {
    let value = this.params[name]
    if (schema == null) { return value }

    const result = schema.safeParse(value)
    if (result.error != null) {
      throw new APIError(400, `Parameter \`${name}\`: ${result.error.message}`)
    }

    return result.data
  }

  public hasParam(name: string) {
    return this.param(name) != null    
  }

  public setParams(params: Partial<P>) {
    Object.assign(this.params, params)
  }

  // #endregion

  // #region Dependencies

  // Expose these to the context as direct methods, as they are used a lot, and the context is in
  // essence a dependency provider.

  public provide<Ctor extends Constructor<any>>(key: Ctor, getter: () => InstanceType<Ctor> | Promise<InstanceType<Ctor>>): void
  public provide<T>(key: any, getter: () => any | Promise<any>): void
  public provide(key: any, getter: () => any | Promise<any>) {
    return this.deps.provide(key, getter)
  }

  public get<Ctor extends Constructor<any>>(key: Ctor): InstanceType<Ctor>
  public get<T>(key: any): T
  public get(key: any) {
    return this.deps.get(key)
  }

  public getAsync<Ctor extends Constructor<any>>(key: Ctor): Promise<InstanceType<Ctor>>
  public getAsync<T>(key: any): Promise<T>
  public getAsync(key: any) {
    return this.deps.getAsync(key)
  }

  // #endregion

}

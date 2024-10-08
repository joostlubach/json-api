import { Request } from 'express'
import { isFunction } from 'lodash'
import {
  INVALID,
  ObjectSchema,
  RequiredType,
  SchemaInstance,
  Type,
  TypeOptions,
  Validator,
} from 'validator'
import { object } from 'validator/types'
import { DependencyContainer } from 'ydeps'
import { Constructor } from 'ytil'

import APIError from './APIError'

export default class RequestContext<P extends Record<string, any> = Record<string, any>> {

  constructor(
    public readonly action: string,
    private readonly params: P,
    public readonly request: Request | null,
    deps?: DependencyContainer,
  ) {
    this.deps = new DependencyContainer({upstream: deps})
  }

  public readonly deps: DependencyContainer

  // #region Parameters

  private readonly validator = new Validator()

  /**
   * Retrieves a param, and optionally validates / coerces it to the given type.
   *
   * @param name The name of the parameter to retrieve.
   * @param type Optionally a type to validate against.
   */
  public param<K extends string & keyof P>(name: K): P[K]
  public param<T, O extends TypeOptions<T>>(name: string & keyof P, type?: RequiredType<T, O>): T
  public param<T>(name: string & keyof P, type?: Type<T, any>): T | null
  public param(name: string & keyof P, type?: Type<any, any>) {
    let value = this.params[name]
    if (type == null) { return value }

    if (value == null && type.options.required === false) {
      return null
    }
    if (value == null && type.options.default != null) {
      value = isFunction(type.options.default)
        ? type.options.default.call(null)
        : type.options.default
    }

    const coerced = this.validator.coerce(value, type, false)
    if (type.options.required !== false && coerced == null) {
      throw new APIError(400, `Parameter \`${name}\`: required`)
    }
    if (coerced === INVALID) {
      throw new APIError(400, `Parameter \`${name}\`: invalid`)
    }

    return coerced
  }

  public setParams(params: Partial<P>) {
    Object.assign(this.params, params)
  }

  /**
   * Validates all parameters at once. It will assert a specific type, so you don't have to use the
   * `type` parameter in the {@link param} method.
   *
   * @param schema The param schema to use.
   * @returns Whether the parameters match the schema.
   */
  public validate<S extends ObjectSchema>(schema: S): this is RequestContext<SchemaInstance<S>> {
    const result = this.validator.validateType(this.params as SchemaInstance<S>, object({schema}))
    return result.isValid
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

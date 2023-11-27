import { isFunction } from 'lodash'
import Validator, {
  INVALID,
  ObjectSchema,
  RequiredType,
  SchemaInstance,
  Type,
  TypeOptions,
} from 'validator'
import { object } from 'validator/types'
import { Constructor, AnyConstructor } from 'ytil'
import APIError from './APIError'

export default class RequestContext<P = Record<string, any>> {

  constructor(
    public readonly action: string,
    private readonly params: P,
    public readonly requestURI?: URL,
  ) {}

  // #region Parameters

  private readonly validator = new Validator()

  /**
   * Retrieves a param, and optionally validates / coerces it to the given type.
   *
   * @param name The name of the parameter to retrieve.
   * @param type Optionally a type to validate against.
   */
  public param<K extends string & keyof P>(name: K): P[K]
  public param<T>(name: string & keyof P, type?: RequiredType<T, TypeOptions<T>>): T
  public param<T>(name: string & keyof P, type?: Type<T, any>): T | null
  public param(name: string & keyof P, type?: Type<any, any>) {
    const value = this.params[name]
    if (type == null) { return value }

    const coerced = this.validator.coerce(value, type, false)
    if (type.options.required !== false && coerced == null) {
      throw new APIError(400, `Parameter \`${name}\`: required`)
    }
    if (coerced === INVALID) {
      throw new APIError(400, `Parameter \`${name}\`: invalid`)
    }

    return coerced
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

  // #region Dependency injection

  private readonly dependencies = new WeakMap<AnyConstructor, () => any>()

  public provide<T>(Ctor: Constructor<T>, value: T | (() => T)): void
  public provide(Ctor: AnyConstructor, value: any | (() => any)): void
  public provide(key: any, value: any) {
    this.dependencies.set(key, value)
  }

  public get<C extends Constructor<any>>(Ctor: C): InstanceType<C>
  public get<T>(Ctor: AnyConstructor): T
  public get(Ctor: AnyConstructor) {
    const value = this.dependencies.get(Ctor)
    if (value == null) {
      throw new Error(`No dependency found for ${Ctor.name}`)
    }

    return isFunction(value) ? value() : value
  }

  // #endregion

}

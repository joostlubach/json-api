import Validator, { INVALID, RequiredType, Type, TypeOptions } from 'validator'
import APIError from './APIError'

export default class RequestContext {

  constructor(
    public readonly action: string,
    private readonly params: Record<string, any>,
    public readonly requestURI?: URL,
  ) {}

  private readonly validator = new Validator()

  public param<T>(name: string, type: RequiredType<T, TypeOptions<T>>): T
  public param<T>(name: string, type: Type<T, any>): T | null
  public param<T>(name: string, type: Type<T, any>) {
    const value = this.params[name]
    const coerced = this.validator.coerce(value, type, false)
    if (coerced == null) {
      throw new APIError(400, `Parameter \`${name}\`: required`)
    }
    if (coerced === INVALID) {
      throw new APIError(400, `Parameter \`${name}\`: invalid`)
    }

    return coerced
  }

}
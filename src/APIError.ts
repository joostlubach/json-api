import ErrorPack from './ErrorPack'
import { JSONAPIError } from './types'

const DEV = process.env.NODE_ENV !== 'production'

export default class APIError extends Error {

  constructor(
    public readonly status:  number = 500,
    message = "An error occurred",
    public readonly errors?: JSONAPIError[],
    public readonly extra:   Record<string, any> = {},
  ) {
    super(message)
  }

  public toErrorPack() {
    const meta = {
      ...DEV ? {stack: this.stack} : {},
      ...this.extra,
    }

    return new ErrorPack(this.status, this.message, this.errors, meta)
  }

  public toJSON() {
    return this.toErrorPack().serialize()
  }

}

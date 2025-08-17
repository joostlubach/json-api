import ErrorPack from './ErrorPack'
import { Meta } from './types'

const DEV = process.env.NODE_ENV !== 'production'

export default class APIError extends Error {

  constructor(
    public readonly status:  number = 500,
    message = "An error occurred",
    public readonly meta: Meta = {},
  ) {
    super(message)
  }

  public toErrorPack() {
    return new ErrorPack(this.status, this.message, {
      ...this.meta,
      ...DEV ? {stack: this.stack} : {},
    })
  }

  public toJSON() {
    return this.toErrorPack().serialize()
  }

}

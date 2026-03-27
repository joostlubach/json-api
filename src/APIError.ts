import SingleErrorPack from './SingleErrorPack'
import { Meta } from './types'

const DEV = process.env.NODE_ENV !== 'production'

export default class APIError extends Error {

  constructor(
    public readonly status:  number = 500,
    public readonly title = "An error occurred",
    public readonly detail?: string,
    public readonly meta: Meta = {},
  ) {
    super(title)
  }

  public toErrorPack() {
    return new SingleErrorPack(this.status, this.title, this.detail ?? null, {
      ...this.meta,
      ...DEV ? {stack: this.stack} : {},
    })
  }

  public toJSON() {
    return this.toErrorPack().serialize()
  }

}

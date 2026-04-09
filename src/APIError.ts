import { Meta } from './types'

export default class APIError extends Error {

  constructor(
    public readonly status:  number = 500,
    public readonly title = "An error occurred",
    public readonly detail?: string,
    public readonly meta: Meta = {},
  ) {
    super(title)
  }

  public toJSON() {
    return {
      status:  this.status,
      title: this.title,
      detail: this.detail,
    }
  }

}

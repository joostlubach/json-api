import { Response } from 'express'
import { Meta } from './types'

export default class SingleErrorPack {

  constructor(
    public readonly status: number,
    public readonly title: string,
    public readonly detail: string | null,
    public readonly extra: Record<string, unknown> = {},
    public readonly meta: Meta = {},
  ) {}

  public serialize(): any {
    return {
      errors: [{
        status:  this.status,
        title: this.title,
        detail: this.detail,
        ...this.extra,
      }],
      meta: this.meta,
    }
  }

  public serializeToResponse(response: Response): void {
    response.statusCode = this.status
    response.json(this.serialize())
  }

}

import { Response } from 'express'

import { Meta } from './types'

export default class ErrorPack {

  constructor(
    public readonly status: number,
    public readonly message: string,
    public readonly meta: Meta = {},
  ) {}

  public serialize(): any {
    return {
      errors: [{
        status:  this.status,
        message: this.message,
      }],
      meta: this.meta,
    }
  }

  public serializeToResponse(response: Response): void {
    response.statusCode = this.status
    response.json(this.serialize())
  }

}

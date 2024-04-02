import { Response } from 'express'

import { Meta } from './types.js'

export default class ErrorPack {

  constructor(
    public readonly status: number,
    public readonly message: string,
    public readonly errors?: any[],
    public readonly meta: Meta = {},
  ) {}

  public serialize(): any {
    return {
      error: {
        status:  this.status,
        message: this.message,
        errors:  this.errors,
      },
      meta: this.meta,
    }
  }

  public serializeToResponse(response: Response): void {
    response.statusCode = this.status
    response.json(this.serialize())
  }

}

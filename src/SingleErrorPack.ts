import { Response } from 'express'
import APIError from './APIError'

export default class ErrorPack {

  constructor(
    public readonly errors: APIError[],
  ) {}

  public serialize(): any {
    return {
      errors: this.errors.map(error => error.toJSON()),
      meta: {}
    }
  }

  public serializeToResponse(response: Response): void {
    response.statusCode = this.errors[0]?.status ?? 500
    response.json(this.serialize())
  }

}

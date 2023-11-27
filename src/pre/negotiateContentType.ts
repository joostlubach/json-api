import { Request, Response } from 'express'
import APIError from '../APIError'

const availableTypes = ['application/json', 'application/vnd.api+json']

export default function negotiateContentType(request: Request, response: Response) {
  const contentType = contentTypeForRequest(request)
  if (contentType == null) { throw new APIError(406) }

  response.set('Content-Type', contentType)
}

export function contentTypeForRequest(request: Request): string | null {
  const accept = request.get('Accept')
  if (accept == null || accept === '*/*') { return 'application/vnd.api+json' }
  if (!availableTypes.includes(accept)) { return null }

  return accept
}

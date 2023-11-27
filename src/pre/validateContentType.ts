import { Request } from 'express'
import { parse as parseContentType } from 'content-type'
import APIError from '../APIError'
import { bodyPresent } from './validateRequest'

export default function validateContentType(request: Request) {
  if (!bodyPresent(request)) { return }

  const contentType = request.get('Content-Type')
  const parsed = contentType == null ? null : parseContentType(contentType)
  if (parsed == null || parsed.type !== 'application/vnd.api+json') {
    throw new APIError(415, 'content type "application/vnd.api+json" is required')
  }
}

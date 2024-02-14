import { Request } from 'express'
import { isPlainObject } from 'lodash'

import APIError from '../APIError'

export default function validateRequest(request: Request) {
  validateRequestMethod(request)
  validateRequestBody(request)
}

export function validateRequestMethod(request: Request) {
  if (!['get', 'post', 'put', 'patch', 'delete'].includes(request.method.toLowerCase())) {
    throw new APIError(405, "Invalid request method")
  }
}

export function validateRequestBody(request: Request) {
  if (bodyPresent(request) && !needsBody(request)) {
    throw new APIError(400, 'Request body not allowed')
  }
}

export function bodyPresent(request: Request): boolean {
  if (!request.body) { return false }

  if (isPlainObject(request.body) && Object.keys(request.body).length === 0) { return false }
  if (request.body instanceof Buffer && request.body.byteLength === 0) { return false }
  return true
}

export function needsBody(request: Request) {
  const {params} = request
  const method = request.method.toLowerCase()

  if (method === 'post' || method === 'patch') { return true }
  if (method === 'delete') {
    return params.relationship != null || params.id == null
  }

  return false
}
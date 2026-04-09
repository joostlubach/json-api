import { z } from 'zod'

export function operationForAction(action: string): '$read' | '$write' | '$custom' {
  switch (action) {
  case 'list': case 'show':
    return '$read'
  case 'create': case 'update': case 'delete':
    return '$write'
  default:
    return '$custom'
  }
}

export function booleanQueryParam() {
  return z.preprocess(val => {
    if (val == null) { return undefined }
    if (val === true || val === false) { return val }
    if (val === '0' || val === 'false' || val === 'no' || val === '') { return false }
    return true
  }, z.boolean().optional())
}
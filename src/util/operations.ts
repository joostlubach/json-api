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

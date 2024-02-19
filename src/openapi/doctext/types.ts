import * as Acorn from 'acorn'

export interface DoctextOptions {
  marker?: string
}

export interface Documentable {
  key:  string
  line: number
  node: Acorn.Property
}

export interface Doctext {
  lineno:      number
  summary:     string
  description: string
  entities:    DoctextEntities
  nodes:       Acorn.Comment[]
}

export interface DoctextEntities {
  links?:      DoctextLink[]
  copy?:       string
  properties?: Record<string, Pick<Doctext, 'summary' | 'description'>>
}

export interface DoctextLink {
  href:    string
  caption: string
}
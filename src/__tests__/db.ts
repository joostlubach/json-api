import { isArray, isFunction } from 'lodash'
import { slugify } from 'ytil'

import { Filters, Sort } from '../types.js'

export interface Parent {
  family:   string
  id:       string
  name:     string
  age:      number
  spouse:   string | null
  children: string[]
}

export interface Child {
  family:  string
  id:      string
  name:    string
  age:     number
  parents: string[]
}

export type Model = Parent | Child

export interface Query {
  filters: Filters
  sorts:   Sort[]
  offset:  number | null
  limit:   number | null
}

export class Db {

  private models: Model[] = []

  public list(query: Query) {
    let models = this.models.filter(it => this.match(query, it))
    if (query.offset != null) {
      models = models.slice(query.offset)
    }
    if (query.limit != null) {
      models = models.slice(0, query.limit)
    }
    for (const {field, direction} of [...query.sorts].reverse()) {
      models.sort((a, b) => {
        const vala = (a as any)[field]
        const valb = (b as any)[field]
        const order = typeof vala === 'string'
          ? vala.localeCompare(valb)
          : vala - valb

        return order * direction
      })
    }
    
    return models
  }

  public count(query: Query) {
    return this.models.filter(it => this.match(query, it)).length
  }

  public get(id: string, query?: Query) {
    return this.load(query, id)
  }

  public insert(...items: Record<string, any>[]) {
    return items.map(attrs => {
      const id = attrs.id ?? (attrs.name == null ? undefined : slugify(attrs.name))
      const model = {...attrs, id} as Model
      this.models = this.models.filter(it => it.id !== model.id)
      this.models.push(model)
      return model
    })
  }

  public delete(query: Query) {
    const deleted: Model[] = []
    this.models = this.models.filter(model => {
      if (this.match(query, model)) {
        deleted.push(model)
        return false
      } else {
        return true
      }
    })
    return deleted
  }

  public ids() {
    return this.models.map(it => it.id)
  }

  public clear() {
    this.models = []
  }

  private match(query: Query, model: Model) {
    for (const [name, value] of Object.entries(query.filters)) {
      if (isFunction(value)) {
        if (!value((model as any)[name])) {
          return false
        }
      } else if (isArray(value)) {
        if (!value.includes((model as any)[name])) {
          return false
        }
      } else {
        if ((model as any)[name] !== value) {
          return false
        }
      }
    }
    return true
  }

  private load(query: Query | undefined, id: string) {
    const models = query == null ? this.models : this.list(query)
    return models.find(it => it.id === id) ?? null
  }

}

const dbs: Record<string, Db> = {
  parents:  new Db(),
  children: new Db(),
}

function db(which: string) {
  return dbs[which]!
}

namespace db {
  export function seed() {
    createFamily([
      {family: 'a', name: "Alice", age: 30},
      {family: 'a', name: "Bob", age: 40},
    ], [
      {family: 'a', name: "Charlie", age: 10},
      {family: 'a', name: "Dolores", age: 20},
    ])
    
    createFamily([
      {family: 'b', name: "Eve", age: 50},
      {family: 'b', name: "Frank", age: 60},
    ], [
      {family: 'b', name: "Isaac", age: 15},
      {family: 'b', name: "Henry", age: 25},
    ])
  }

  export function clear() {
    db('parents').clear()
    db('children').clear()
  }
}

afterEach(() => db.clear())

export default db

function createFamily(
  parents: [Omit<Parent, 'id' | 'spouse' | 'children'>, Omit<Parent, 'id' | 'spouse' | 'children'>],
  children: Omit<Child, 'id' | 'parents'>[]
) {
  const parentModels = db('parents').insert(...parents)
  const childModels = db('children').insert(...children)

  ;(parentModels[0] as Parent).spouse = parentModels[1].id
  ;(parentModels[1] as Parent).spouse = parentModels[0].id

  for (const childModel of childModels) {
    (childModel as Child).parents = [parentModels[0].id, parentModels[1].id]
    ;((parentModels[0] as Parent).children ??= []).push(childModel.id)
    ;((parentModels[1] as Parent).children ??= []).push(childModel.id)
  }
}

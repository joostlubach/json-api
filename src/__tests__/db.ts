import { isFunction } from 'lodash'
import { slugify } from 'ytil'

import { Filters, Sort } from '../types'

export interface Parent {
  id:       number
  name:     string
  age:      number
  spouse:   number | null
  children: number[]
}

export interface Child {
  id:      number
  name:    string
  age:     number
  parents: number[]
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
    return this.models.filter(it => this.match(query, it))
  }

  public get(query: Query, id: number) {
    return this.load(query, id)
  }

  public insert(...items: Record<string, any>[]) {
    return items.map(attrs => {
      const id = attrs.id ?? slugify(attrs.name)
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

  private match(query: Query, model: Model) {
    for (const [name, value] of Object.entries(query.filters)) {
      if (isFunction(value)) {
        if (!value((model as any)[name])) {
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

  private load(query: Query, id: number) {
    const model = this.models.find(it => it.id === id)
    if (model == null) { throw new NotFoundError() }
    return model
  }

}

const dbs: Record<string, Db> = {
  parents:  new Db(),
  children: new Db(),
}

export default function db(which: string) {
  return dbs[which]!
}

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

createFamily([
  {name: "Alice", age: 30},
  {name: "Bob", age: 40},
], [
  {name: "Charlie", age: 10},
  {name: "Dolores", age: 20},
])

createFamily([
  {name: "Eve", age: 50},
  {name: "Frank", age: 60},
], [
  {name: "Isaac", age: 15},
  {name: "Henry", age: 25},
])


export class NotFoundError extends Error {}
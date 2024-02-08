import { Filters, Sort } from '../types'

export interface Parent {
  id:       number
  name:     string
  age:      number
  spouses:  number[]
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
  private nextID: number = 0

  public list(query: Query) {
    return this.models.filter(it => this.match(query, it))
  }

  public get(query: Query, id: number) {
    return this.load(query, id)
  }

  public insert(...items: Record<string, any>[]) {
    return items.map(attrs => {
      const id = attrs.id ?? this.nextID++
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
      if ((model as any)[name] !== value) {
        return false
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

function createFamily({parents, children}: {parents: Omit<Parent, 'id' | 'spouses' | 'children'>[], children: Omit<Child, 'id' | 'parents'>[]}) {
  const parentModels = db('parents').insert(parents)
  const childModels = db('children').insert(children)

  for (const parent of parentModels) {
    ;(parent as Parent).spouses = parentModels.filter(it => it.id !== parent.id).map(it => it.id)
    ;(parent as Parent).children = childModels.map(it => it.id)
  }
  for (const child of childModels) {
    ;(child as Child).parents = parentModels.map(it => it.id)
  }
}

createFamily({
  parents: [
    {name: "Alice", age: 30},
    {name: "Bob", age: 40},
  ],
  children: [
    {name: "Charlie", age: 10},
    {name: "Dolores", age: 20},
  ],
})

createFamily({
  parents: [
    {name: "Eve", age: 50},
    {name: "Frank", age: 60},
    {name: "Grace", age: 40},
  ],
  children: [
    {name: "Isaac", age: 15},
    {name: "Hank", age: 25},
  ],
})


export class NotFoundError extends Error {}
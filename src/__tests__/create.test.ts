import { MockJSONAPI } from './mock'

import { expectAsyncError } from 'yest'

import APIError from '../APIError'
import Pack from '../Pack'
import RequestContext from '../RequestContext'
import db, { Model, Query } from './db'

describe("create", () => {

  let jsonAPI: MockJSONAPI

  beforeEach(() => {
    // Rather than creating mock functions, we, we've created a mock DB with a mock adapter that actually
    // sort of works. This exemplifies JSON API better.
    jsonAPI = new MockJSONAPI()
  })

  function context(action: string) {
    return new RequestContext(action, {})
  }

  function documentPack(type: string, attributes: Record<string, any>) {
    return Pack.deserialize<Model, Query, string>(jsonAPI.registry, {
      data: {
        type,
        attributes,
      },
    }) 
  }

  it("should allow creating a document", async () => {
    const pack = await jsonAPI.create('parents', documentPack('parents', {
      name: "Alice",
      age:  30,
    }), context('create'))
    expect(pack.serialize()).toEqual({
      data: {
        type: 'parents',
        id:   'alice',

        attributes: {
          name: "Alice",
          age:  30,
        },
        relationships: {
          spouse:   {data: null},
          children: {data: []},
        },
      },
      included: [],
      meta:     {},
    })

    expect(db('parents').get('alice')).toEqual({
      id:   'alice',
      name: "Alice",
      age:  30,
    })
  })

  it("should not accept a mismatch between pack type and document", async () => {
    await expectAsyncError(() => (
      jsonAPI.create('parents', documentPack('children', {
        name: "Eve",
        age:  10,
      }), context('create'))
    ), APIError, error => {
      expect(error.status).toEqual(409)
    })

    expect(db('parents').get('alice')).toBeNull()
    expect(db('children').get('alice')).toBeNull()
  })

  it("should not accept an array for data", async () => {
    await expectAsyncError(() => (
      jsonAPI.create('parents', Pack.deserialize(jsonAPI.registry, {
        data: [],
      }), context('create'))
    ), APIError, error => {
      expect(error.status).toEqual(400)
    })
  })

  it.todo("should apply scope filters")
  it.todo("should apply defaults")

})
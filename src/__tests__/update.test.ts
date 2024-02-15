import { context, mockJSONAPI } from './mock'

import { expectAsyncError } from 'yest'

import APIError from '../APIError'
import Pack from '../Pack'
import db from './db'

describe("update", () => {

  const jsonAPI = mockJSONAPI()

  beforeEach(() => {
    db.seed()
  })

  it("should allow updating a document", async () => {
    const requestPack = jsonAPI.documentPack('parents', 'alice', {age: 40})
    const pack = await jsonAPI.update('parents', 'alice', requestPack, context('update'))
    expect(pack.serialize()).toEqual({
      data: {
        type: 'parents',
        id:   'alice',

        attributes: {
          name: "Alice",
          age:  40,
        },
        relationships: {
          spouse:   expect.any(Object),
          children: expect.any(Object),
        },
      },
      included: [],
      meta:     {},
    })

    expect(db('parents').get('alice')).toEqual({
      id:       'alice',
      name:     "Alice",
      age:      40,
      spouse:   'bob',
      children: ['charlie', 'dolores'],
    })
  })

  it("should require an ID", async () => {
    const requestPack = jsonAPI.documentPack('parents', null, {})
    await expectAsyncError(() => (
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(400)
    })
  })

  it("should not accept a mismatch between pack type and document", async () => {
    const requestPack = jsonAPI.documentPack('children', 'alice', {})
    await expectAsyncError(() => (
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(409)
    })
  })

  it("should not accept a mismatch between locator and document", async () => {
    const requestPack = jsonAPI.documentPack('parents', 'alice', {})
    await expectAsyncError(() => (
      jsonAPI.update('parents', 'bob', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(409)
    })
  })

  it("should not allow replacing a document that does not exist", async () => {
    const requestPack = jsonAPI.documentPack('parents', 'zachary', {})
    await expectAsyncError(() => (
      jsonAPI.update('parents', 'zachary', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(404)
    })
  })

  it("should not accept an array for data", async () => {
    await expectAsyncError(() => (
      jsonAPI.update('parents', 'alice', Pack.deserialize(jsonAPI.registry, {
        data: [],
      }), context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(400)
    })
  })

  it("should not allow specifying an unconfigured attribute", async () => {
    const requestPack = jsonAPI.documentPack('parents', 'alice', {
      name:    "Alice",
      hobbies: ["soccer", "piano"],
    })

    await expectAsyncError(() => (
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(403)
    })

    expect((db('parents').get('alice') as any).hobbies).toBeUndefined()
  })

  it("should not allow specifying an unavailable attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {if: () => false}
    })

    const requestPack = jsonAPI.documentPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    await expectAsyncError(() => (
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(403)
    })

    expect((db('parents').get('alice') as any).age).toEqual(30)
  })

  it("should not allow specifying a read-only attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: false}
    })

    const requestPack = jsonAPI.documentPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    await expectAsyncError(() => (
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(403)
    })

    expect((db('parents').get('alice') as any).age).toEqual(30)
  })

  it("should not allow specifying a writable-on-create attribute", async () => {
    jsonAPI.registry.modify('parents', cfg => {
      cfg.attributes.age = {writable: 'create'}
    })

    const requestPack = jsonAPI.documentPack('parents', 'alice', {
      name: "Alice",
      age:  40,
    })

    await expectAsyncError(() => (
      jsonAPI.update('parents', 'alice', requestPack, context('update'))
    ), APIError, error => {
      expect(error.status).toEqual(403)
    })

    expect((db('parents').get('alice') as any).age).toEqual(30)
  })

})
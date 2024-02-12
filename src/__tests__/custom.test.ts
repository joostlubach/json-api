import { context, MockAdapter, mockJSONAPI } from './mock'

import { expectAsyncError } from 'yest'

import APIError from '../APIError'
import Pack from '../Pack'
import db from './db'

describe("custom actions", () => {

  const jsonAPI = mockJSONAPI()
  let handler: jest.Mock

  beforeEach(() => {
    db.seed()

    handler = jest.fn()

    jsonAPI.registry.modify('parents', cfg => {
      cfg.collectionActions = [{
        name:   'test',
        action: handler,
      }]

      cfg.documentActions = [{
        name:   'test',
        action: handler,
      }]
    })
  })

  describe("collection actions", () => {

    it("should call the collection action with the pack and return the response pack", async () => {
      const requestPack = new Pack('request')
      const responsePack = new Pack('response')
      handler.mockReturnValue(responsePack)

      const testContext = context('custom:test')
      const response = await jsonAPI.collectionAction('parents', 'test', requestPack, testContext)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(requestPack, expect.any(MockAdapter), testContext, {})
      expect(response).toBe(responsePack)
    })

    it("should not allow calling an undefined action", async () => {
      await expectAsyncError(() => (
        jsonAPI.collectionAction('parents', 'doesnotexist', jsonAPI.nullPack(), context('custom:doesnotexist'))
      ), APIError, error => {
        expect(error.status).toEqual(405)
      })
    })

  })

  describe("document actions", () => {

    it("should load the model and call the document action with the pack and return the response pack", async () => {
      const requestPack = new Pack('request')
      const responsePack = new Pack('response')
      handler.mockReturnValue(responsePack)

      const testContext = context('custom:test')
      const alice = db('parents').get('alice')
      const response = await jsonAPI.documentAction('parents', {id: 'alice'}, 'test', requestPack, testContext)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(alice, requestPack, expect.any(MockAdapter), testContext, {})
      expect(response).toBe(responsePack)
    })

    it("should complain if the model could not be found", async () => {
      const requestPack = new Pack('request')
      const testContext = context('custom:test')

      await expectAsyncError(() => (
        jsonAPI.documentAction('parents', {id: 'zachary'}, 'test', requestPack, testContext)
      ), APIError, error => {
        expect(error.status).toEqual(404)
      })      
    })

    it("should not allow calling an undefined action", async () => {
      await expectAsyncError(() => (
        jsonAPI.documentAction('parents', {id: 'alice'}, 'doesnotexist', jsonAPI.nullPack(), context('custom:doesnotexist'))
      ), APIError, error => {
        expect(error.status).toEqual(405)
      })
    })
  })

})
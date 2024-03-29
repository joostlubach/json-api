import { isPlainObject } from 'lodash'
import { expectAsyncError } from 'yest'

import APIError from '../APIError.js'
import Pack from '../Pack.js'
import RequestContext from '../RequestContext.js'
import Resource from '../Resource.js'
import { ListParams } from '../types.js'
import db, { Model, Query } from './db.js'
import { context, MockAdapter, mockJSONAPI } from './mock.js'

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

  describe("overriding common actions", () => {

    let handler: jest.Mock
    let requestPack: Pack<string>
    let responsePack: Pack<string>
    
    beforeEach(() => {
      handler = jest.fn()
      jsonAPI.registry.modify('parents', cfg => {
        cfg.list = handler
        cfg.show = handler
        cfg.create = handler
        cfg.replace = handler
        cfg.update = handler
        cfg.delete = handler
      })

      requestPack = new Pack<string>('request')
      responsePack = new Pack<string>('response')
      
      handler.mockImplementation(function (this: Resource<Model, Query, string>, ...args) {
        if (isPlainObject(args[args.length - 1])) {
          args.pop()
        }
        const context = args.pop()
        const adapter = args.pop()

        expect(this).toBe(jsonAPI.registry.get('parents'))
        expect(context).toBeInstanceOf(RequestContext)
        expect(adapter()).toBeInstanceOf(MockAdapter)
        
        return responsePack
      })
    })

    it("should override list", async () => {
      const params: ListParams = {}
      const pack = await jsonAPI.list('parents', params, context('custom:list'))
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(params, expect.any(Function), context('custom:list'), {})
      expect(pack).toBe(responsePack)
    })

    it("should override show", async () => {
      const locator = {id: 'alice'}
      const pack = await jsonAPI.show('parents', locator, context('custom:show'))
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(locator, expect.any(Function), context('custom:show'), {})
      expect(pack).toBe(responsePack)
    })

    it("should override replace", async () => {
      const locator = {id: 'alice'}
      const pack = await jsonAPI.replace('parents', locator, requestPack, context('custom:replace'))
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(locator, requestPack, expect.any(Function), context('custom:replace'), {})
      expect(pack).toBe(responsePack)
    })

    it("should override update", async () => {
      const locator = {id: 'alice'}
      const pack = await jsonAPI.update('parents', locator, requestPack, context('custom:update'))
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(locator, requestPack, expect.any(Function), context('custom:update'), {})
      expect(pack).toBe(responsePack)
    })

    it("should override delete", async () => {
      const requestPack = jsonAPI.bulkSelectorPack('parents', ['alice'])
      const pack = await jsonAPI.delete('parents', requestPack, context('custom:delete'))
      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(requestPack, expect.any(Function), context('custom:delete'))
      expect(pack).toBe(responsePack)
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
      expect(handler).toHaveBeenCalledWith(requestPack, expect.any(Function), testContext, {})
      expect(response).toBe(responsePack)
    })

    it("should provide a function that can be used to get an adapter for the resource", async () => {
      const requestPack = new Pack('request')
      handler.mockImplementation(function (this: Resource<Model, Query, string>, pack, adapter) {
        expect(this).toBe(jsonAPI.registry.get('parents'))
        expect(adapter()).toBeInstanceOf(MockAdapter)
      })

      const testContext = context('custom:test')
      await jsonAPI.collectionAction('parents', 'test', requestPack, testContext)
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

    it("should call the document action with the pack and return the response pack", async () => {
      const requestPack = new Pack('request')
      const responsePack = new Pack('response')
      handler.mockReturnValue(responsePack)

      const testContext = context('custom:test')
      const response = await jsonAPI.documentAction('parents', {id: 'alice'}, 'test', requestPack, testContext)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith({id: 'alice'}, requestPack, expect.any(Function), testContext, {})
      expect(response).toBe(responsePack)
    })

    it("should provide a function that can be used to get an adapter for the resource", async () => {
      const requestPack = new Pack('request')
      handler.mockImplementation(function (this: Resource<Model, Query, string>, locator, pack, adapter) {
        expect(this).toBe(jsonAPI.registry.get('parents'))
        expect(adapter()).toBeInstanceOf(MockAdapter)
      })

      const testContext = context('custom:test')
      await jsonAPI.documentAction('parents', {id: 'alice'}, 'test', requestPack, testContext)
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

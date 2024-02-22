import DoctextReader from 'doctext'

import { ResourceConfig } from '../ResourceConfig'
import config from '../config'

const reader = DoctextReader.create({
  ...config.openapi.doctext,
  whitelist: [
    /^labels\.[^.]+$/,
    /^filters\.[^.]+$/,
    /^attributes\.[^.]+$/,
    /^relationships\.[^.]+$/,
    /^list$/,
    /^show$/,
    /^create$/,
    /^replace$/,
    /^update$/,
    /^delete$/,
    /^collectionActions\.[^.]+$/,
    /^documentActions\.[^.]+$/,
  ],
})


export default function doctext<M, Q, I>(config: ResourceConfig<M, Q, I>) {
  Object.assign(config.openapi ??= {}, reader.read())
  return config
}

export interface DoctextOptions {

}
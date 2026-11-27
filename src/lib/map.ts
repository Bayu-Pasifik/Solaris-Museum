import { useJson } from './characters'

export type Report = {
  id: number
  title: string
  /** The percentage of the area that the game asks to explore before it shows the report. */
  unlock: number
  /** One paragraph per line. */
  text: string
}

/** Every picture is a path inside public/. It is absent when the API has no file for it. */
export type Area = { id: number; name: string; picture?: string; reports: Report[] }

export type Region = {
  id: number
  name: string
  /** Empty for the regions that the API does not describe. */
  description: string
  icon?: string
  /** White emblem of the region. */
  logo?: string
  areas: Area[]
}

export type WorldMap = { regions: Region[] }

const isWorldMap = (data: WorldMap) =>
  Array.isArray(data.regions) &&
  data.regions.length > 0 &&
  data.regions.every((region) => region.areas.every((area) => Array.isArray(area.reports)))

export const useWorldMap = () => useJson<WorldMap>('data/map.json', isWorldMap)

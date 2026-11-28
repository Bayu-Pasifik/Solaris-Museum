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

/** The colors of a region: its beacons on the map and the frames of the page. */
const COLORS: Record<number, { deep: string; accent: string; pale: string }> = {
  1: { deep: '#9a5b00', accent: '#ffb02e', pale: '#fff0cf' },
  900: { deep: '#14688c', accent: '#4fd8ff', pale: '#d9f6ff' },
  3: { deep: '#5136b8', accent: '#8f6bff', pale: '#e8e0ff' },
  4: { deep: '#a83c10', accent: '#ff7a45', pale: '#ffe4d8' },
}

/** The whole map, and a region that has no colors of its own. */
export const regionColors = (id?: number) =>
  (id !== undefined && COLORS[id]) || { deep: '#1d1a4a', accent: '#8f8df7', pale: '#e6e3fa' }

const isWorldMap = (data: WorldMap) =>
  Array.isArray(data.regions) &&
  data.regions.length > 0 &&
  data.regions.every((region) => region.areas.every((area) => Array.isArray(area.reports)))

export const useWorldMap = () => useJson<WorldMap>('data/map.json', isWorldMap)

import type { Room } from './rooms'

/** The distance between two doors, which is the length of one bay of the model. */
export const BAY = 4
/** How far a door stands from the middle of the corridor, and how much it turns to it. */
const ACROSS = 2.9
const TURN = 0.6

/**
 * Where the door of a room is. The doors take turns at the left and the right side, and each
 * one stands a bay further along the corridor.
 */
export function door(index: number) {
  const side = index % 2 ? 1 : -1
  const position: [number, number, number] = [side * ACROSS, 0, -index * BAY]
  return { side, position, turn: -side * TURN }
}

/**
 * Where the visitor is, counted in doors: 0 is at the first one. The page moves "target" and
 * the scene walks after it.
 */
export type Walk = { target: number }

export const clampStop = (stop: number, rooms: Room[]) =>
  Math.min(Math.max(stop, 0), rooms.length - 1)

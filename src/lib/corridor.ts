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

/** How far a guard stands from the middle of the gate, and how far in front of it. */
const BESIDE = 1.5
const BEFORE = 0.3

/**
 * Where the guard of a door stands: beside the gate on the side of the carpet, so the way in
 * stays free. The guard looks a little toward the carpet.
 */
export function guardSpot(index: number) {
  const { side, position, turn } = door(index)
  const across = -side * BESIDE
  const at: [number, number, number] = [
    position[0] + Math.cos(turn) * across + Math.sin(turn) * BEFORE,
    0,
    position[2] - Math.sin(turn) * across + Math.cos(turn) * BEFORE,
  ]
  return { position: at, turn: -side * 0.25 }
}

/**
 * Where the visitor is, counted in doors: 0 is at the first one. The page moves "target" and
 * the scene walks after it.
 */
export type Walk = { target: number }

export const clampStop = (stop: number, rooms: Room[]) =>
  Math.min(Math.max(stop, 0), rooms.length - 1)

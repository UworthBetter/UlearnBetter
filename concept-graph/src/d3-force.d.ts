declare module 'd3-force' {
  export function forceCollide<Node>(radius?: (node: Node) => number): {
    strength(value: number): unknown
  }
}

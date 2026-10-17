const keys = new WeakMap<object, number>();
let next = 0;

// A stable v-for key for objects that have no id of their own, such as rows in a form.
export function keyOf(item: object): number {
  let key = keys.get(item);
  if (key === undefined) keys.set(item, (key = next++));
  return key;
}

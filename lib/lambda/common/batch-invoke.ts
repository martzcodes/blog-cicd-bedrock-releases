/*
 * Use to batch calls to a service that limits item sizes, as many AWS services do.
 * If there are additional arguments, curry them
 * Example of use:
 * ```
 * const myRealFunc = (myArg1: string, myArg2: string) => async (items: string[]): Promise<void> =>
 *   someService.invoke(items);
 * export const myCurriedFunc = (myArg1: string, myArg2: string, items: string[]): Promise<Promise<void>[]> =>
 *   batchInvocations(myRealFunc(ddbClient, table), 25, keys);
 * ```
 * This function doesn't help with rate limits!
 */
export const batchInvoke = async <T extends (items: I[]) => ReturnType<T>, I>(
  fn: T,
  size: number,
  items: I[]
): Promise<ReturnType<T>[]> => {
  return Promise.all([...chunks(items, size)].map((i) => fn(i)));
};

// Generator function called with spread syntax will loop over all yields and produce array slices.
function* chunks<I>(arr: I[], n: number) {
  for (let i = 0; i < arr.length; i += n) {
    yield arr.slice(i, i + n);
  }
}

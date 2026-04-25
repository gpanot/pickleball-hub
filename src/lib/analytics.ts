/** Mouseflow command queue — initialized by the snippet in root layout. */
type MouseflowQueue = unknown[][];

/** Custom session tag in Mouseflow (filter sessions in the dashboard). */
export function mouseflowTag(name: string): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { _mfq?: MouseflowQueue };
  w._mfq = w._mfq || [];
  w._mfq.push(["tag", name]);
}

type ClarityFn = (command: "set", key: string, value: string) => void;

function getClarity(): ClarityFn | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { clarity?: ClarityFn }).clarity;
}

export const clarityTag = (key: string, value: string) => {
  const clarity = getClarity();
  if (!clarity) return;
  clarity("set", key, value);
};

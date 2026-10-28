export const openUiStringLiteral = (value: string) => JSON.stringify(value);

export const openUiStringList = (values: string[]) =>
  `[${values.map(openUiStringLiteral).join(", ")}]`;

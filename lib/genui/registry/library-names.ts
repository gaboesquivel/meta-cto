/** Component names registered on an OpenUI `createLibrary` result. */
export const namesFromOpenUiLibrary = (library: { components: Record<string, unknown> }) =>
  Object.keys(library.components).toSorted();

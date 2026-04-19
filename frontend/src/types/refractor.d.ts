declare module 'refractor' {
  const refractor: {
    registered(language: string): boolean;
    register(grammar: any): void;
    highlight(code: string, language: string): any;
  };
  export default refractor;
}
